/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createMockModel, streamMock } from "@oh-my-pi/pi-ai/providers/mock";
import {
	createAgentSession,
	SessionManager,
	Settings,
	type AgentSession,
	type ExtensionFactory,
} from "@oh-my-pi/pi-coding-agent";
import { initializeExtensions } from "@oh-my-pi/pi-coding-agent/modes/runtime-init";
import { CONFIG_DIR_NAME } from "@oh-my-pi/pi-utils/dirs";
import { expect, it } from "vitest";
import { DEFAULT_CONFIG } from "../src/sol-omp/config.ts";

it("loads the package entrypoint and executes fused tools in an all-enabled OMP session", async () => {
	const cwd = await mkdtemp(join(tmpdir(), "sol-omp-package-"));
	const agentDir = join(cwd, "agent");
	let session: AgentSession | undefined;
	try {
		await mkdir(agentDir);
		await mkdir(join(cwd, CONFIG_DIR_NAME));
		await writeFile(join(cwd, CONFIG_DIR_NAME, "sol-omp.json"), JSON.stringify({
			...DEFAULT_CONFIG,
			actionFusion: true,
			observationPack: true,
			evidencePreservingReducer: true,
			onlineContextCompact: true,
		}));
		const mock = createMockModel({
			id: "sol-omp-package-test",
			provider: "sol-omp-package-test",
			responses: [
				{
					content: [{
						type: "toolCall",
						name: "write",
						arguments: {
							path: "result.txt",
							content: "package integration passed\n",
							then_run: { command: "cat", args: ["result.txt"] },
						},
					}],
				},
				{
					content: [{
						type: "toolCall",
						name: "update_plan",
						arguments: {
							steps: [{ id: "verify", goal: "verify the package", status: "in_progress" }],
						},
					}],
				},
				{ content: ["package smoke complete"] },
			],
		});
		const mockProvider: ExtensionFactory = (omp) => {
			omp.registerProvider(mock.provider, {
				api: mock.api,
				apiKey: "test-only",
				streamSimple: streamMock,
			});
		};
		const settings = Settings.isolated({
			"compaction.enabled": false,
			"retry.enabled": false,
		});
		const sessionManager = SessionManager.create(cwd, join(agentDir, "sessions"));
		const created = await createAgentSession({
			cwd,
			agentDir,
			model: mock,
			thinkingLevel: "off",
			additionalExtensionPaths: [join(process.cwd(), "src/sol-omp/index.ts")],
			disableExtensionDiscovery: true,
			extensions: [mockProvider],
			skills: [],
			rules: [],
			contextFiles: [],
			promptTemplates: [],
			slashCommands: [],
			enableMCP: false,
			enableLsp: false,
			skipPythonPreflight: true,
			systemPrompt: "You are a deterministic package integration test assistant.",
			sessionManager,
			settings,
		});
		session = created.session;
		const errors = created.extensionsResult.errors;
		await initializeExtensions(session, {
			reportSendError: (_action, error) => errors.push({ path: "runtime", error: String(error) }),
			reportRuntimeError: (error) => errors.push({ path: error.extensionPath, error: String(error.error) }),
		});
		expect(session.getActiveToolNames()).toEqual(expect.arrayContaining(["edit", "write", "obs_recall", "update_plan"]));
		const solOmp = created.extensionsResult.extensions.find((extension) =>
			extension.resolvedPath.endsWith("src/sol-omp/index.ts")
		);
		expect(solOmp?.handlers.has("tool_result")).toBe(true);
		expect(solOmp?.handlers.has("context")).toBe(true);

		await session.prompt("run the package smoke test", { expandPromptTemplates: false });
		await session.waitForIdle();
		const toolResults = sessionManager.getBranch().flatMap((entry) =>
			entry.type === "message" && entry.message.role === "toolResult" ? [entry.message] : [],
		);
		expect(toolResults).toHaveLength(2);
		expect(toolResults.map((result) => ({
			toolName: result.toolName,
			isError: result.isError,
			text: result.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n"),
		}))).toEqual([
			expect.objectContaining({ toolName: "write", isError: false }),
			expect.objectContaining({ toolName: "update_plan", isError: false }),
		]);
		const writeResult = toolResults.find((result) => result.toolName === "write");
		const observation = writeResult?.content.flatMap((block) => block.type === "text" ? [block.text] : []).join("\n");
		expect(observation).toContain("[then_run:succeeded]");
		expect(await readFile(join(cwd, "result.txt"), "utf8")).toBe("package integration passed\n");
		expect(session.getLastAssistantText()).toBe("package smoke complete");
		expect(session.isStreaming).toBe(false);
		expect(mock.calls).toHaveLength(3);
		expect(errors).toEqual([]);
	} finally {
		session?.dispose();
		await rm(cwd, { recursive: true, force: true });
	}
}, 30_000);
