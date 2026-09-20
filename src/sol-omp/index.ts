/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { getAgentDir, type ExtensionAPI, type ExtensionContext, type ExtensionFactory } from "@oh-my-pi/pi-coding-agent";
import { loadSolOmpConfig, type SolOmpConfig } from "./config.ts";
import { registerActionFusion } from "./extensions/action-fusion/index.ts";
import { registerEvidencePreservingReducer } from "./extensions/evidence-preserving-reducer/index.ts";
import { registerObservationPack } from "./extensions/observation-pack/index.ts";
import { registerOnlineContextCompact } from "./extensions/online-context-compact/index.ts";

export function registerConfiguredFeatures(pi: ExtensionAPI, config: SolOmpConfig): void {
	if (config.actionFusion) registerActionFusion(pi);
	if (config.observationPack) registerObservationPack(pi);
	if (config.evidencePreservingReducer) {
		registerEvidencePreservingReducer(pi, {
			reducerModel: config.evidencePreservingReducerModel,
			reducerProvider: config.evidencePreservingReducerProvider,
		});
	}
	if (config.onlineContextCompact) registerOnlineContextCompact(pi, config.cacheWriteReadRatio);
}

export type SolOmpConfigLoader = (ctx: ExtensionContext) => SolOmpConfig;

export function createSolOmpExtension(
	loadConfig: SolOmpConfigLoader = (ctx) => loadSolOmpConfig(ctx.cwd, getAgentDir(), ctx.isProjectTrusted()),
): ExtensionFactory {
	return (pi) => {
		let initialized = false;
		pi.on("session_start", (_event, ctx) => {
			if (initialized) return;
			initialized = true;
			registerConfiguredFeatures(pi, loadConfig(ctx));
		});
	};
}

export default function solOmpExtension(pi: ExtensionAPI): void {
	createSolOmpExtension()(pi);
}
