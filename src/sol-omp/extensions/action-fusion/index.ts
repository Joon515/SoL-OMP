/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 */
/** Action Fusion - fuse a native file mutation and its follow-up command into one turn. */

import type { AgentToolResult, AgentToolUpdateCallback } from "@oh-my-pi/pi-agent-core";
import type {
	EditToolDetails,
	ExtensionAPI,
	ExtensionContext,
	ExtensionFactory,
} from "@oh-my-pi/pi-coding-agent";
import { Type } from "@oh-my-pi/omptype/typebox";
import { Text } from "@oh-my-pi/pi-tui";
import { resolveToolPath } from "./file-queue.ts";
import { renderSolOmpTool, showSolOmpSavings } from "../../tui.ts";
import {
	createThenRunSchema,
	executeMutationThenRun,
	THEN_RUN_SUCCEEDED,
	type ThenRunInput,
} from "./then-run.ts";

const EDIT_THEN_RUN_DESCRIPTION =
	"Command to run next on this file after the edit succeeds — e.g. run, build, start/restart, install, or check it; optional timeout in seconds. Skipped if the edit fails; a non-zero exit is reported but keeps the edit.";
const WRITE_THEN_RUN_DESCRIPTION =
	"Command to run next on this file after the write succeeds — e.g. run, build, start/restart, install, or check it; optional timeout in seconds. Skipped if the write fails; a non-zero exit is reported but keeps the write.";

const editParameters = Type.Object(
	{
		path: Type.String({ description: "File to edit" }),
		edits: Type.Array(
			Type.Object(
				{
					oldText: Type.String({ description: "Exact text to replace" }),
					newText: Type.String({ description: "Replacement text" }),
				},
				{ additionalProperties: false },
			),
		),
		then_run: createThenRunSchema(EDIT_THEN_RUN_DESCRIPTION),
	},
	{ additionalProperties: false },
);
const writeParameters = Type.Object(
	{
		path: Type.String({ description: "File to create or overwrite" }),
		content: Type.String({ description: "Complete file content" }),
		then_run: createThenRunSchema(WRITE_THEN_RUN_DESCRIPTION),
	},
	{ additionalProperties: false },
);

async function nativeMutation<TDetails>(
	ctx: ExtensionContext,
	input: Record<string, unknown>,
	signal: AbortSignal | undefined,
	onUpdate: AgentToolUpdateCallback<TDetails> | undefined,
): Promise<AgentToolResult<TDetails>> {
	if (!ctx.invokeTool) throw new Error("Action Fusion requires OMP native same-tool delegation");
	return ctx.invokeTool<TDetails>(input, { signal, onUpdate });
}

function succeeded(result: AgentToolResult<unknown>): boolean {
	return result.content.some((block) => block.type === "text" && block.text.includes(THEN_RUN_SUCCEEDED));
}

export function createActionFusionExtension(): ExtensionFactory {
	return (pi: ExtensionAPI) => {
		pi.registerTool<typeof editParameters, EditToolDetails | undefined>({
			name: "edit",
			label: "Edit",
			description: "Replace exact text in a file and optionally run a follow-up command after the mutation succeeds.",
			parameters: editParameters,
			strict: true,
			approval: "write",
			loadMode: "essential",
			async execute(_toolCallId, input, signal, onUpdate, ctx) {
				const { then_run, ...editInput } = input;
				const result = await executeMutationThenRun({
					absolutePath: resolveToolPath(ctx.cwd, input.path),
					thenRun: then_run,
					exec: pi.exec.bind(pi),
					signal,
					ctx,
					mutate: () => nativeMutation<EditToolDetails | undefined>(ctx, editInput, signal, onUpdate),
				});
				if (then_run && succeeded(result)) showSolOmpSavings(ctx, "Action Fusion", "1 model round-trip avoided");
				return result;
			},
			renderCall(args, _options, theme) {
				const base = new Text(theme.fg("dim", `Edit ${args.path}`), 0, 0);
				return args.then_run ? renderSolOmpTool(theme, "Action Fusion", "1 model round-trip avoided", base) : base;
			},
			renderResult(result, _options, theme, args) {
				const output = result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
				const base = new Text(theme.fg(result.isError ? "error" : "dim", output), 0, 0);
				return args?.then_run ? renderSolOmpTool(theme, "Action Fusion", "1 model round-trip avoided", base) : base;
			},
		});

		pi.registerTool<typeof writeParameters, undefined>({
			name: "write",
			label: "Write",
			description: "Create or overwrite a file and optionally run a follow-up command after the mutation succeeds.",
			parameters: writeParameters,
			strict: true,
			approval: "write",
			loadMode: "essential",
			async execute(_toolCallId, input, signal, onUpdate, ctx) {
				const { then_run, ...writeInput } = input;
				const result = await executeMutationThenRun({
					absolutePath: resolveToolPath(ctx.cwd, input.path),
					thenRun: then_run,
					exec: pi.exec.bind(pi),
					signal,
					ctx,
					mutate: () => nativeMutation(ctx, writeInput, signal, onUpdate),
				});
				if (then_run && succeeded(result)) showSolOmpSavings(ctx, "Action Fusion", "1 model round-trip avoided");
				return result;
			},
			renderCall(args, _options, theme) {
				const base = new Text(theme.fg("dim", `Write ${args.path}`), 0, 0);
				return args.then_run ? renderSolOmpTool(theme, "Action Fusion", "1 model round-trip avoided", base) : base;
			},
			renderResult(result, _options, theme, args) {
				const output = result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
				const base = new Text(theme.fg(result.isError ? "error" : "dim", output), 0, 0);
				return args?.then_run ? renderSolOmpTool(theme, "Action Fusion", "1 model round-trip avoided", base) : base;
			},
		});
	};
}

export type { ThenRunInput } from "./then-run.ts";
export {
	assertUnchangedBeforeCommand,
	executeMutationThenRun,
	THEN_RUN_FAILED,
	THEN_RUN_SKIPPED,
	THEN_RUN_SUCCEEDED,
} from "./then-run.ts";

export function registerActionFusion(pi: ExtensionAPI): void {
	createActionFusionExtension()(pi);
}

export default registerActionFusion;
