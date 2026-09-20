/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { dirname, join } from "node:path";
import type { ExtensionContext } from "@oh-my-pi/pi-coding-agent";

export function runtimeRoot(ctx: ExtensionContext): string {
	const sessionFile = ctx.sessionManager.getSessionFile();
	if (!sessionFile) throw new Error("SoL-OMP requires a persistent OMP session file");
	const sessionId = ctx.sessionManager.getSessionId();
	if (!/^[a-z0-9][a-z0-9._-]*$/iu.test(sessionId)) {
		throw new Error("SoL-OMP requires a safe OMP session id");
	}
	return join(dirname(sessionFile), "sol-omp", sessionId);
}
