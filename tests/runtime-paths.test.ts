/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { join } from "node:path";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";
import { describe, expect, it } from "vitest";
import { runtimeRoot } from "../src/sol-omp/runtime-paths.ts";

function context(
	sessionDir: string,
	sessionId: string,
	sessionFile: string | null = join(sessionDir, `${sessionId}.jsonl`),
): ExtensionContext {
	return {
		sessionManager: {
			getSessionFile: () => sessionFile ?? undefined,
			getSessionId: () => sessionId,
		},
	} as unknown as ExtensionContext;
}

describe("SoL-OMP runtime root", () => {
	it("gives each OMP session its own directory derived from its public session file", () => {
		const sessionDir = join("sessions", "project-a");
		expect(runtimeRoot(context(sessionDir, "session-a"))).toBe(join(sessionDir, "sol-omp", "session-a"));
		expect(runtimeRoot(context(sessionDir, "session-b"))).toBe(join(sessionDir, "sol-omp", "session-b"));
	});

	it("requires a persistent session file", () => {
		expect(() => runtimeRoot(context("sessions", "session-a", null))).toThrow("persistent OMP session file");
	});

	it.each(["", ".", "..", "../escape", "nested/session", "nested\\session"])(
		"rejects unsafe session id %j",
		(sessionId) => {
			expect(() => runtimeRoot(context("sessions", sessionId))).toThrow("safe OMP session id");
		},
	);
});
