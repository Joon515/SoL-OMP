/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { AgentToolResult } from "@oh-my-pi/pi-agent-core";
import { type ExecResult, type ExtensionAPI, type ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { Type } from "@oh-my-pi/omptype/typebox";
import { withFusedFileQueue } from "./file-queue.ts";

export const THEN_RUN_SUCCEEDED = "[then_run:succeeded]";
export const THEN_RUN_FAILED = "[then_run:failed]";
export const THEN_RUN_SKIPPED = "[then_run:skipped]";

export interface ThenRunInput {
	command: string;
	timeout?: number;
}

export function createThenRunSchema(description: string) {
	return Type.Optional(
		Type.Object(
			{
				command: Type.String({ description: "Shell command to run" }),
				timeout: Type.Optional(Type.Number({ description: "Timeout in seconds (optional, no default timeout)" })),
			},
			{ description, additionalProperties: false },
		),
	);
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function resultText(result: AgentToolResult<unknown>): string {
	return result.content
		.filter((block) => block.type === "text")
		.map((block) => block.text)
		.join("\n");
}

function thenRunSkippedError(error: unknown): Error {
	return new Error(
		`${errorText(error)}\n\n${THEN_RUN_SKIPPED} The file mutation did not complete successfully; the command was not run.`,
	);
}

async function fileSha256(path: string): Promise<string> {
	return createHash("sha256").update(await readFile(path)).digest("hex");
}

export async function assertUnchangedBeforeCommand(
	path: string,
	yieldForInterference: () => Promise<void> = () => new Promise<void>((resolve) => setImmediate(resolve)),
): Promise<void> {
	try {
		const mutationHash = await fileSha256(path);
		await yieldForInterference();
		const commandHash = await fileSha256(path);
		if (mutationHash !== commandHash) {
			throw new Error("target content changed after the fused mutation");
		}
	} catch (error) {
		throw new Error(`${THEN_RUN_SKIPPED} ${errorText(error)}; the command was not run.`);
	}
}

/**
 * Apply a file mutation and, when the model asked for one, run its follow-up
 * command before returning a single observation.
 *
 * Both steps run inside one SoL-OMP queue slot for `absolutePath`, so another
 * fused mutation of the same file cannot interleave.
 */
export async function executeMutationThenRun<TDetails>({
	absolutePath,
	thenRun,
	mutate,
	exec,
	signal,
	ctx,
}: {
	absolutePath: string;
	thenRun: ThenRunInput | undefined;
	mutate: () => Promise<AgentToolResult<TDetails>>;
	exec: ExtensionAPI["exec"];
	signal: AbortSignal | undefined;
	ctx: ExtensionContext;
}): Promise<AgentToolResult<TDetails>> {
	return withFusedFileQueue(absolutePath, async () => {
		let mutationResult: AgentToolResult<TDetails>;
		try {
			mutationResult = await mutate();
		} catch (error) {
			if (thenRun !== undefined) {
				throw thenRunSkippedError(error);
			}
			throw error;
		}

		if (thenRun === undefined) {
			return mutationResult;
		}

		await assertUnchangedBeforeCommand(absolutePath);
		let commandResult: ExecResult;
		try {
			commandResult = await exec(thenRun.command, [], {
				cwd: ctx.cwd,
				signal,
				timeout: thenRun.timeout === undefined ? undefined : thenRun.timeout * 1_000,
			});
		} catch (error) {
			const mutationOutput = resultText(mutationResult);
			throw new Error([mutationOutput, THEN_RUN_FAILED, errorText(error)].filter(Boolean).join("\n\n"));
		}
		const output = [commandResult.stdout, commandResult.stderr].filter(Boolean).join("\n");
		if (commandResult.code !== 0 || commandResult.killed) {
			const mutationOutput = resultText(mutationResult);
			const failure = output || `Command exited with code ${commandResult.code}`;
			throw new Error([mutationOutput, THEN_RUN_FAILED, failure].filter(Boolean).join("\n\n"));
		}
		return {
			...mutationResult,
			content: [
				...mutationResult.content,
				{ type: "text", text: output ? `${THEN_RUN_SUCCEEDED}\n${output}` : THEN_RUN_SUCCEEDED },
			],
		};
	});
}
