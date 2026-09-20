/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import {
	completeSimple,
	type Api,
	type AssistantMessage,
	type Context,
	type Model,
	type SimpleStreamOptions,
} from "@oh-my-pi/pi-ai";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import type { ArchiveObject } from "./archive.ts";
import type { ReducerConfig } from "./config.ts";
import { reducerInput, reducerInstructions } from "./receipt.ts";

export type ReducerComplete = (
	model: Model<Api>,
	context: Context,
	options?: SimpleStreamOptions,
) => Promise<AssistantMessage>;

export interface NormalizedUsage {
	readonly input: number;
	readonly output: number;
	readonly cacheRead: number;
	readonly cacheWrite: number;
	readonly totalTokens: number;
}

export interface ProviderResult {
	readonly errorMessage: string | undefined;
	readonly model: string;
	readonly ok: boolean;
	readonly outputText: string;
	readonly provider: string;
	readonly stopReason: AssistantMessage["stopReason"];
	readonly usage: NormalizedUsage;
}

export class ReducerModelUnavailableError extends Error {
	override readonly name = "ReducerModelUnavailableError";
}

function responseOutputText(response: AssistantMessage): string {
	return response.content.flatMap((item) => (item.type === "text" ? [item.text] : [])).join("");
}

function normalizedUsage(response: AssistantMessage): NormalizedUsage {
	return {
		input: response.usage.input,
		output: response.usage.output,
		cacheRead: response.usage.cacheRead,
		cacheWrite: response.usage.cacheWrite,
		totalTokens: response.usage.totalTokens,
	};
}

function resolveReducerModel(config: ReducerConfig, context: ExtensionContext): Model<Api> {
	const spec = `${config.reducerProvider}/${config.reducerModel}`;
	const model = context.models.resolve(spec);
	if (!model) throw new ReducerModelUnavailableError(`Reducer model is unavailable: ${spec}`);
	return model;
}

function operationSignal(parent: AbortSignal | undefined, timeoutMs: number): {
	readonly cleanup: () => void;
	readonly signal: AbortSignal;
} {
	const timeout = AbortSignal.timeout(timeoutMs);
	if (!parent) return { signal: timeout, cleanup: () => undefined };
	return { signal: AbortSignal.any([parent, timeout]), cleanup: () => undefined };
}

/** Use OMP's public model facade to resolve the configured reducer model. */

export async function callReducer(
	config: ReducerConfig,
	command: string,
	isError: boolean,
	archive: ArchiveObject,
	body: string,
	context: ExtensionContext,
	complete: ReducerComplete = completeSimple,
): Promise<ProviderResult> {
	const model = resolveReducerModel(config, context);
	const operation = operationSignal(undefined, config.timeoutMs);
	try {
		const requestContext = {
			systemPrompt: [reducerInstructions()],
			messages: [
				{
					role: "user" as const,
					content: [{ type: "text" as const, text: reducerInput(command, isError, archive, body) }],
					timestamp: Date.now(),
				},
			],
		};
		const response = await complete(model, requestContext, {
			apiKey: context.modelRegistry.resolver(model, context.sessionManager.getSessionId()),
			cacheRetention: "none",
			maxTokens: Math.min(config.maxOutputTokens, model.maxTokens ?? config.maxOutputTokens),
			sessionId: config.runId,
			signal: operation.signal,
		});
		return {
			errorMessage: response.errorMessage,
			model: response.model,
			ok: response.stopReason === "stop" || response.stopReason === "length",
			outputText: responseOutputText(response),
			provider: response.provider,
			stopReason: response.stopReason,
			usage: normalizedUsage(response),
		};
	} finally {
		operation.cleanup();
	}
}
