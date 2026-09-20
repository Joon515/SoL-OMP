/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import {
 createAgentSession,
 getAgentDir,
 SessionManager,
} from "@oh-my-pi/pi-coding-agent";
import { completeSimple } from "@oh-my-pi/pi-ai";
import { CONFIG_DIR_NAME } from "@oh-my-pi/pi-utils/dirs";

for (const [name, value] of Object.entries({
 completeSimple,
 createAgentSession,
 getAgentDir,
 sessionManagerGetSessionFile: SessionManager.prototype.getSessionFile,
 sessionManagerGetSessionId: SessionManager.prototype.getSessionId,
})) {
 if (typeof value !== "function") throw new Error(`Missing public OMP API: ${name}`);
}

if (CONFIG_DIR_NAME !== ".omp") {
 throw new Error(`Unexpected OMP config directory: ${JSON.stringify(CONFIG_DIR_NAME)}`);
}

console.log("SoL-OMP compatibility check passed for OMP public APIs.");
