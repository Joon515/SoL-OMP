/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 */
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { resolveToolPath } from "../src/sol-omp/extensions/action-fusion/file-queue.ts";

const tempDirs: string[] = [];
afterEach(async () => {
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), "action-fusion-paths-"));
	tempDirs.push(dir);
	return dir;
}

describe("Action Fusion file paths", () => {
	it.each(["target.txt", "space and #hash %.txt"])("resolves a file URL and @file URL for %s", (name) => {
		const cwd = join(tmpdir(), "action-fusion-cwd");
		const target = resolve(tmpdir(), name);
		const url = pathToFileURL(target).href;
		expect(resolveToolPath(cwd, url)).toBe(target);
		expect(resolveToolPath(cwd, `@${url}`)).toBe(target);
	});

	it("preserves ordinary relative and absolute path semantics", async () => {
		const cwd = await tempDir();
		const target = join(cwd, "target.txt");
		expect(resolveToolPath(cwd, "target.txt")).toBe(target);
		expect(resolveToolPath(cwd, "@target.txt")).toBe(target);
		expect(resolveToolPath(cwd, target)).toBe(target);
	});

	it("rejects an invalid encoded file URL before mutation", async () => {
		const cwd = await tempDir();
		const invalidUrl = `${pathToFileURL(cwd).href}/bad%2Fname.txt`;
		expect(() => resolveToolPath(cwd, invalidUrl)).toThrow();
	});
});
