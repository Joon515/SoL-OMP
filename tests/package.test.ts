/*
 * SPDX-FileCopyrightText: Copyright (c) 2026 NVIDIA CORPORATION & AFFILIATES. All rights reserved.
 * SPDX-License-Identifier: MIT
 */

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";

function packedFiles(output: string): string[] {
 return output
  .split(/\r?\n/u)
  .filter((line) => line.startsWith("packed "))
  .map((line) => line.replace(/^packed \S+ /u, ""));
}

describe("published package", () => {
 let files: string[];
 beforeAll(() => {
  const result = spawnSync("bun", ["pm", "pack", "--dry-run"], {
   cwd: process.cwd(),
   encoding: "utf8",
   timeout: 25_000,
  });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  files = packedFiles(result.stdout);
 }, 30_000);

 it("ships the default cache write/read ratio in the example config", () => {
  const config = JSON.parse(readFileSync("sol-omp.example.json", "utf8")) as Record<string, unknown>;
  expect(config.cacheWriteReadRatio).toBe(12.5);
  expect(config.evidencePreservingReducerProvider).toBe("provider-id");
  expect(config.evidencePreservingReducerModel).toBe("model-id");
 });

 it("contains the standalone entrypoint and no Pi monorepo source", () => {
  expect(files).toContain("src/sol-omp/index.ts");
  expect(files).toContain("sol-omp.example.json");
  expect(files.some((file) => file.startsWith("packages/"))).toBe(false);
  expect(files.some((file) => file.startsWith("docs/superpowers/"))).toBe(false);
 });

 it("ships Online Context Compact from the standalone source tree", () => {
  expect(files).toContain("src/sol-omp/extensions/online-context-compact/index.ts");
  expect(files).toContain("scripts/check-sol-omp-config.mjs");
  expect(files).toContain("agents-install.md");
  expect(files).not.toContain("AGENTS.md");
  expect(files).not.toContain("CLAUDE.md");
 });
});
