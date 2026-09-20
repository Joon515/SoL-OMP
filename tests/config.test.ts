/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CONFIG_DIR_NAME } from "@oh-my-pi/pi-utils/dirs";
import { DEFAULT_CONFIG, findConfigPath, loadSolOmpConfig } from "../src/sol-omp/config.ts";
import {
	DEFAULT_REDUCER_MODEL,
	DEFAULT_REDUCER_PROVIDER,
} from "../src/sol-omp/extensions/evidence-preserving-reducer/config.ts";

const roots: string[] = [];

function fixture(): { agentDir: string; cwd: string } {
	const root = mkdtempSync(join(tmpdir(), "sol-omp-config-"));
	roots.push(root);
	const cwd = join(root, "project");
	const agentDir = join(root, "agent");
	mkdirSync(cwd, { recursive: true });
	mkdirSync(agentDir, { recursive: true });
	return { agentDir, cwd };
}

afterEach(() => {
	for (const root of roots.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe("SoL-OMP config", () => {
	it("returns disabled defaults when neither config exists", () => {
		const { agentDir, cwd } = fixture();
		expect(findConfigPath(cwd, agentDir, true)).toBeUndefined();
		expect(loadSolOmpConfig(cwd, agentDir, true)).toEqual(DEFAULT_CONFIG);
		expect(DEFAULT_CONFIG.cacheWriteReadRatio).toBe(12.5);
		expect(DEFAULT_CONFIG.evidencePreservingReducerProvider).toBe(DEFAULT_REDUCER_PROVIDER);
		expect(DEFAULT_CONFIG.evidencePreservingReducerModel).toBe(DEFAULT_REDUCER_MODEL);
	});

	it("loads the global config as a fallback", () => {
		const { agentDir, cwd } = fixture();
		const path = join(agentDir, "sol-omp.json");
		writeFileSync(path, JSON.stringify({ version: 1, observationPack: true, onlineContextCompact: true }));
		expect(findConfigPath(cwd, agentDir, true)).toBe(path);
		expect(loadSolOmpConfig(cwd, agentDir, true)).toEqual({
			...DEFAULT_CONFIG,
			observationPack: true,
			onlineContextCompact: true,
		});
	});

	it("uses the project config instead of merging the global config", () => {
		const { agentDir, cwd } = fixture();
		writeFileSync(
			join(agentDir, "sol-omp.json"),
			JSON.stringify({ version: 1, observationPack: true }),
		);
		mkdirSync(join(cwd, CONFIG_DIR_NAME));
		const projectPath = join(cwd, CONFIG_DIR_NAME, "sol-omp.json");
		writeFileSync(projectPath, JSON.stringify({ version: 1, actionFusion: true }));

		expect(findConfigPath(cwd, agentDir, true)).toBe(projectPath);
		expect(loadSolOmpConfig(cwd, agentDir, true)).toEqual({ ...DEFAULT_CONFIG, actionFusion: true });
	});

	it("rejects unknown keys", () => {
		const { agentDir, cwd } = fixture();
		mkdirSync(join(cwd, CONFIG_DIR_NAME));
		writeFileSync(join(cwd, CONFIG_DIR_NAME, "sol-omp.json"), JSON.stringify({ version: 1, actionFussion: true }));
		expect(() => loadSolOmpConfig(cwd, agentDir, true)).toThrow("Unknown SoL-OMP config key: actionFussion");
	});

	it("rejects non-boolean feature values", () => {
		const { agentDir, cwd } = fixture();
		mkdirSync(join(cwd, CONFIG_DIR_NAME));
		writeFileSync(join(cwd, CONFIG_DIR_NAME, "sol-omp.json"), JSON.stringify({ version: 1, actionFusion: "yes" }));
		expect(() => loadSolOmpConfig(cwd, agentDir, true)).toThrow("SoL-OMP config actionFusion must be boolean");
	});

	it("rejects a non-boolean Online Context Compact value", () => {
		const { agentDir, cwd } = fixture();
		mkdirSync(join(cwd, CONFIG_DIR_NAME));
		writeFileSync(
			join(cwd, CONFIG_DIR_NAME, "sol-omp.json"),
			JSON.stringify({ version: 1, onlineContextCompact: "yes" }),
		);
		expect(() => loadSolOmpConfig(cwd, agentDir, true)).toThrow(
			"SoL-OMP config onlineContextCompact must be boolean",
		);
	});

	it("loads an explicit cache write/read ratio, including zero", () => {
		for (const cacheWriteReadRatio of [0, 3.25]) {
			const { agentDir, cwd } = fixture();
			const path = join(agentDir, "sol-omp.json");
			writeFileSync(path, JSON.stringify({ version: 1, cacheWriteReadRatio }));
			expect(loadSolOmpConfig(cwd, agentDir, true).cacheWriteReadRatio).toBe(cacheWriteReadRatio);
		}
	});

	it("loads an explicit Evidence-Preserving Reducer provider/model route", () => {
		const { agentDir, cwd } = fixture();
		const path = join(agentDir, "sol-omp.json");
		writeFileSync(
			path,
			JSON.stringify({
				version: 1,
				evidencePreservingReducerProvider: "test-provider",
				evidencePreservingReducerModel: "test-reducer-model",
			}),
		);
		expect(loadSolOmpConfig(cwd, agentDir, true)).toEqual({
			...DEFAULT_CONFIG,
			evidencePreservingReducerProvider: "test-provider",
			evidencePreservingReducerModel: "test-reducer-model",
		});
	});

	it.each([
		["evidencePreservingReducerProvider", ""],
		["evidencePreservingReducerProvider", 12],
		["evidencePreservingReducerModel", ""],
		["evidencePreservingReducerModel", 12],
	] as const)("rejects an invalid EPR reducer string: %s=%j", (key, value) => {
		const { agentDir, cwd } = fixture();
		const path = join(agentDir, "sol-omp.json");
		writeFileSync(path, JSON.stringify({ version: 1, [key]: value }));
		expect(() => loadSolOmpConfig(cwd, agentDir, true)).toThrow(
			`SoL-OMP config ${key} must be a non-empty string`,
		);
	});

	it.each([null, "12.5", -1])("rejects an invalid cache write/read ratio: %j", (cacheWriteReadRatio) => {
		const { agentDir, cwd } = fixture();
		const path = join(agentDir, "sol-omp.json");
		writeFileSync(path, JSON.stringify({ version: 1, cacheWriteReadRatio }));
		expect(() => loadSolOmpConfig(cwd, agentDir, true)).toThrow(
			"SoL-OMP config cacheWriteReadRatio must be a finite non-negative number",
		);
	});

	it("wraps malformed JSON errors with the config path", () => {
		const { agentDir, cwd } = fixture();
		mkdirSync(join(cwd, CONFIG_DIR_NAME));
		const path = join(cwd, CONFIG_DIR_NAME, "sol-omp.json");
		writeFileSync(path, "{");
		expect(() => loadSolOmpConfig(cwd, agentDir, true)).toThrow(`Unable to read SoL-OMP config ${path}`);
	});
});
