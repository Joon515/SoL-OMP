/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 */
import type { AgentToolResult } from "@oh-my-pi/pi-agent-core";
import type { ExtensionAPI, ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { Text } from "@oh-my-pi/pi-tui";
import { renderSolOmpTool } from "../../tui.ts";
import { PLAN_STATUSES, type PlanStep } from "./plan.ts";

export type PlanProgress = {
	readonly files_changed: readonly string[];
	readonly verification: readonly string[];
	readonly decisions: readonly string[];
};

export type PlanUpdateInput = {
	readonly toolCallId: string;
	readonly steps: readonly PlanStep[];
	readonly progress: PlanProgress | undefined;
	readonly signal: AbortSignal | undefined;
	readonly context: ExtensionContext;
};

export type OnlineToolHandlers = {
	readonly updatePlan: (input: PlanUpdateInput) => Promise<AgentToolResult<Readonly<Record<string, unknown>>>>;
};

function schemas(pi: ExtensionAPI) {
	const z = pi.zod;
	const progress = z
		.object({
			files_changed: z.array(z.string().max(1000)).max(128),
			verification: z.array(z.string().max(1000)).max(64),
			decisions: z.array(z.string().max(1000)).max(64),
		})
		.strict();
	const planStep = z
		.object({
			id: z.string().min(1).max(16_384),
			goal: z.string().min(1).max(16_384),
			status: z.enum(PLAN_STATUSES),
		})
		.strict();
	return z
		.object({
			steps: z.array(planStep).min(1).max(128),
			progress: progress.optional(),
		})
		.strict();
}
export function registerOnlineTools(pi: ExtensionAPI, handlers: OnlineToolHandlers): void {
	pi.registerTool({
		name: "update_plan",
		label: "Update plan",
		description:
			"Replace the complete working plan. A newly completed step becomes a safe point where SoL-OMP may compact context if doing so is economical.",
		parameters: schemas(pi),
		execute: async (toolCallId, params, signal, _onUpdate, context) =>
			await handlers.updatePlan({
				toolCallId,
				steps: params.steps,
				progress: params.progress,
				signal,
				context,
			}),
		renderCall(params, _options, theme) {
			const completed = params.steps.filter((step) => step.status === "completed").length;
			return renderSolOmpTool(
				theme,
				"Online Context Compact",
				"compacts only when projected savings are positive",
				new Text(theme.fg("dim", `Plan: ${params.steps.length} steps, ${completed} completed`), 0, 0),
			);
		},
		renderResult(result, { isPartial }, theme) {
			const boundary = (result.details as { boundary?: boolean } | undefined)?.boundary === true;
			return renderSolOmpTool(
				theme,
				"Online Context Compact",
				"compacts only when projected savings are positive",
				new Text(
					theme.fg(isPartial ? "warning" : "dim", isPartial ? "Updating plan..." : boundary ? "Progress boundary recorded" : "Plan recorded"),
					0,
					0,
				),
			);
		},
	});
}
