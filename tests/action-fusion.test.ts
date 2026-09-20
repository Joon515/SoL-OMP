/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 */
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentToolResult } from "@oh-my-pi/pi-agent-core";
import type { ExecOptions, ExecResult, ExtensionAPI, ExtensionContext, ToolDefinition } from "@oh-my-pi/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@oh-my-pi/pi-natives", () => ({}));
import {
	assertUnchangedBeforeCommand,
	createActionFusionExtension,
} from "../src/sol-omp/extensions/action-fusion/index.ts";
import { withFusedFileQueue } from "../src/sol-omp/extensions/action-fusion/file-queue.ts";

function text(result: AgentToolResult<unknown>): string {
	return result.content.filter((block) => block.type === "text").map((block) => block.text).join("\n");
}

function mutationResult(message: string): AgentToolResult<undefined> {
	return { content: [{ type: "text", text: message }], details: undefined };
}

const tempDirs: string[] = [];
afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "omp-action-fusion-"));
	tempDirs.push(dir);
	return dir;
}

function loadTools(exec: ExtensionAPI["exec"]): Map<string, ToolDefinition> {
	const tools = new Map<string, ToolDefinition>();
	createActionFusionExtension()({ registerTool: (tool: ToolDefinition) => tools.set(tool.name, tool), exec } as unknown as ExtensionAPI);
	return tools;
}

function context(cwd: string, invokeTool: NonNullable<ExtensionContext["invokeTool"]>): ExtensionContext {
	return {
		cwd,
		mode: "json",
		hasUI: false,
		model: undefined,
		sessionManager: { getSessionId: () => "fusion", getSessionFile: () => undefined },
		ui: {},
		invokeTool,
	} as unknown as ExtensionContext;
}

function ok(stdout = ""): ExecResult {
	return { stdout, stderr: "", code: 0, killed: false };
}

describe("OMP-native action fusion", () => {
	it("registers edit and write schemas with optional then_run", () => {
		const tools = loadTools(async () => ok());
		for (const name of ["edit", "write"]) {
			const parameters = tools.get(name)!.parameters as unknown as {
				toJsonSchema(options?: Record<string, unknown>): Record<string, unknown>;
			};
			const schema = parameters.toJsonSchema() as { properties: Record<string, unknown>; required: string[] };
			const thenRun = schema.properties["then_run"];
			expect(thenRun).toMatchObject({ type: "object", required: ["command"] });
			expect(schema.required).not.toContain("then_run");
		}
	});

	it("delegates the mutation through ctx.invokeTool before executing then_run", async () => {
		const dir = await tempDir();
		const target = join(dir, "target.txt");
		const events: string[] = [];
		const invokeTool = (async <TDetails>(params: Record<string, unknown>): Promise<AgentToolResult<TDetails>> => {
			events.push("mutation");
			await writeFile(String(params.path), String(params.content));
			return mutationResult("wrote target") as AgentToolResult<TDetails>;
		}) satisfies NonNullable<ExtensionContext["invokeTool"]>;
		const exec = vi.fn(async (command: string, args: string[], options?: ExecOptions) => {
			events.push("command");
			expect(command).toBe("check target");
			expect(args).toEqual([]);
			expect(options).toMatchObject({ cwd: dir, timeout: 12_000 });
			expect(await readFile(target, "utf8")).toBe("content\n");
			return ok("passed\n");
		});
		const write = loadTools(exec).get("write")!;
		const result = await write.execute(
			"write-1",
			{ path: target, content: "content\n", then_run: { command: "check target", timeout: 12 } },
			undefined,
			undefined,
			context(dir, invokeTool),
		);
		expect(events).toEqual(["mutation", "command"]);
		expect(text(result)).toContain("[then_run:succeeded]\npassed");
	});

	it("passes abort signal to both native mutation and command runtime", async () => {
		const dir = await tempDir();
		const target = join(dir, "abort.txt");
		const controller = new AbortController();
		const invokeTool = (async <TDetails>(
			params: Record<string, unknown>,
			options?: { signal?: AbortSignal },
		): Promise<AgentToolResult<TDetails>> => {
			expect(options?.signal).toBe(controller.signal);
			await writeFile(String(params.path), String(params.content));
			return mutationResult("written") as AgentToolResult<TDetails>;
		}) satisfies NonNullable<ExtensionContext["invokeTool"]>;
		const exec = vi.fn(async (_command: string, _args: string[], options?: ExecOptions) => {
			expect(options?.signal).toBe(controller.signal);
			return ok();
		});
		await loadTools(exec).get("write")!.execute(
			"abort",
			{ path: target, content: "data", then_run: { command: "check" } },
			controller.signal,
			undefined,
			context(dir, invokeTool),
		);
	});

	it("does not run then_run when native mutation fails", async () => {
		const exec = vi.fn(async () => ok());
		const invokeTool: NonNullable<ExtensionContext["invokeTool"]> = async () => {
			throw new Error("native mutation failed");
		};
		await expect(
			loadTools(exec).get("edit")!.execute(
				"edit-1",
				{ path: "missing.txt", edits: [{ oldText: "a", newText: "b" }], then_run: { command: "must not run" } },
				undefined,
				undefined,
				context(await tempDir(), invokeTool),
			),
		).rejects.toThrow("[then_run:skipped]");
		expect(exec).not.toHaveBeenCalled();
	});

	it("reports command failure while preserving the successful mutation", async () => {
		const dir = await tempDir();
		const target = join(dir, "preserved.txt");
		const invokeTool = (async <TDetails>(params: Record<string, unknown>): Promise<AgentToolResult<TDetails>> => {
			await writeFile(String(params.path), String(params.content));
			return mutationResult("written") as AgentToolResult<TDetails>;
		}) satisfies NonNullable<ExtensionContext["invokeTool"]>;
		const exec: ExtensionAPI["exec"] = async () => ({ stdout: "", stderr: "validation failed", code: 7, killed: false });
		await expect(
			loadTools(exec).get("write")!.execute(
				"write-fail",
				{ path: target, content: "keep me", then_run: { command: "exit 7" } },
				undefined,
				undefined,
				context(dir, invokeTool),
			),
		).rejects.toThrow("[then_run:failed]");
		expect(await readFile(target, "utf8")).toBe("keep me");
	});

	it("keeps the queue locked through then_run", async () => {
		const events: string[] = [];
		let openGate!: () => void;
		let signalStarted!: () => void;
		const gate = new Promise<void>((resolve) => { openGate = resolve; });
		const firstStarted = new Promise<void>((resolve) => { signalStarted = resolve; });
		const first = withFusedFileQueue("/tmp/fusion-queue", async () => {
			events.push("first:start");
			signalStarted();
			await gate;
			events.push("first:end");
		});
		await firstStarted;
		const second = withFusedFileQueue("/tmp/fusion-queue", async () => { events.push("second"); });
		await Promise.resolve();
		expect(events).toEqual(["first:start"]);
		openGate();
		await Promise.all([first, second]);
		expect(events).toEqual(["first:start", "first:end", "second"]);
	});

	it("skips the command when the target changes after mutation", async () => {
		const dir = await tempDir();
		const target = join(dir, "changed.txt");
		await writeFile(target, "mutation result\n");
		await expect(assertUnchangedBeforeCommand(target, async () => writeFile(target, "external change\n"))).rejects.toThrow(
			"[then_run:skipped] target content changed after the fused mutation",
		);
	});
});
