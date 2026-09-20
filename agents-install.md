# SoL-OMP Agent Installation and Configuration Protocol

This is the canonical procedure for coding agents that install, configure, or validate SoL-OMP from a full source checkout against OMP 18.2.6. Follow the phases in order. Explicit user instructions take precedence. An extracted package is not a substitute for the checkout because it does not contain the test suite.

Installation and configuration are complete only when OMP remains unmodified, the repository checks pass, OMP lists the plugin, all four mechanisms are enabled in one effective `sol-omp.json`, and OMP starts without an extension error.

## Rules

- Do not modify, patch, fork, or vendor OMP. SoL-OMP must load as a standalone plugin through OMP's public extension interface.
- Use Bun and the tested OMP release `@oh-my-pi/pi-coding-agent@18.2.6`. Treat another OMP version as a compatibility change and rerun the full suite before using it.
- Do not clean, reset, switch, or overwrite unrelated repository changes.
- Do not print, log, commit, upload, or include any secret in a command line. Check only whether a credential is present.
- Keep SoL-OMP settings in `sol-omp.json`. The Evidence-Preserving Reducer provider/model route is a SoL-OMP setting; provider URLs, credentials, the main agent model, and shell behavior remain OMP settings.
- Keep persistent artifacts under OMP's session-derived `sol-omp/<session-id>/` root; do not configure a separate storage path.
- SoL-OMP is an independent OMP-native fork derived from NVIDIA Research's MIT-licensed NVlabs/SoL-Pi work. Preserve its license and attribution, but do not imply NVIDIA maintains this fork.

## Inputs

Resolve these values before making changes:

- `sol_omp_root`: absolute path to the intended SoL-OMP checkout;
- `target_project`: project in which OMP will run;
- install scope: project or user;
- exact SoL-OMP branch and commit;
- GitHub owner that hosts the fork.

Do not guess an ambiguous path, owner, or install scope. In documentation examples where the owner is intentionally unspecified, retain `<your-github-username>`.

## Phase 1: validate the checkout

From `sol_omp_root`, record the repository state without changing it:

```bash
git status --short --branch
git rev-parse HEAD
bun --version
```

Install from the lockfile and run the source checks:

```bash
bun install --frozen-lockfile --ignore-scripts
bun run check
bun audit --audit-level=high
bun run compat
bun test tests/all-mechanisms.test.ts
```

`bun run check` covers type checking, the complete test suite, and package inspection. `tests/all-mechanisms.test.ts` confirms that one all-enabled configuration registers all four mechanisms through OMP's public extension API. The tests run without a live model provider.

Stop if any command fails. Do not hide a failure with `|| true` or replace the frozen install with an unlocked install.

## Phase 2: install SoL-OMP

First require the installed OMP CLI to report version 18.2.6:

```bash
omp --version
```

Install the hosted fork, replacing the placeholder only with the resolved owner:

```bash
omp plugin install git:github.com/<your-github-username>/SoL-OMP
omp plugin list
```

For project scope, run the install from `target_project` with OMP's project scope:

```bash
omp plugin install --scope project git:github.com/<your-github-username>/SoL-OMP
omp plugin list
```

The list output must identify `sol-omp` and the expected Git source in the selected scope. Do not install the same source in both scopes. A project-scoped plugin and configuration must be used only in a trusted project.

## Phase 3: configure all four mechanisms

SoL-OMP defaults every mechanism to disabled. For this managed installation, create exactly one effective configuration with every mechanism enabled:

```json
{
  "version": 1,
  "actionFusion": true,
  "observationPack": true,
  "evidencePreservingReducer": true,
  "evidencePreservingReducerProvider": "provider-id",
  "evidencePreservingReducerModel": "model-id",
  "onlineContextCompact": true,
  "cacheWriteReadRatio": 12.5
}
```

`evidencePreservingReducerProvider` and `evidencePreservingReducerModel` select the nested reducer route that Evidence-Preserving Reducer resolves through OMP's model registry. They default to the built-in reducer route and must be non-empty strings when supplied. Change them only when a different reducer model is intended.

`cacheWriteReadRatio` is the only pricing-related input SoL-OMP reads. It defaults to `12.5`, accepts any finite non-negative number, and treats `0` as an explicit statement that a cache write adds no cost relative to a cache read. SoL-OMP does not inspect OMP model prices. The value controls one compaction decision and is not a bill estimate.

Use one location matching the selected scope:

- project: `<target_project>/.omp/sol-omp.json`;
- user or named profile: `<OMP active agent directory>/sol-omp.json` (normally `~/.omp/agent/sol-omp.json`, or `~/.omp/profiles/<profile>/agent/sol-omp.json`).

Resolve the active OMP agent directory rather than assuming the default. The project file replaces the user/profile file; the two are not merged. If both exist, inspect them and obtain direction before changing either one. Unknown keys, unsupported versions, malformed JSON, non-boolean feature values, invalid reducer model fields, and invalid ratios must remain fatal.

Do not create or modify `.pi`, and do not migrate an old `.pi/sol-pi.json` automatically. Do not put provider URLs, credentials, shell paths, command prefixes, storage paths, or run IDs in `sol-omp.json`. SoL-OMP either reads those values from OMP or derives them from the OMP session.

SoL-OMP reads no dedicated environment variables. Evidence-Preserving Reducer uses the configured reducer provider/model route and OMP-managed authentication. Configure credentials in OMP and never copy them into `sol-omp.json`.

From `sol_omp_root`, validate the exact effective file:

```bash
bun scripts/check-sol-omp-config.mjs \
  --config /absolute/path/to/effective/sol-omp.json \
  --require-all-enabled
```

Require exit status 0 and retain its JSON output. The check applies SoL-OMP's default values, rejects unknown keys and wrong types, and confirms all four mechanisms are enabled. A partially enabled file can be valid SoL-OMP configuration, but it does not satisfy this all-enabled profile.

## Phase 4: verify the installation

1. Run `omp plugin list` from `target_project` and confirm the expected `sol-omp` source and scope.
2. Run `check-sol-omp-config.mjs --require-all-enabled` against the effective `sol-omp.json`.
3. Re-run `bun test tests/all-mechanisms.test.ts` from `sol_omp_root`.
4. Start OMP from `target_project`, submit no work, confirm there is no extension load error, and exit. When validating the checkout directly, use `omp -e /absolute/path/to/SoL-OMP`.
5. Confirm that OMP was not patched and that the SoL-OMP checkout contains no vendored OMP source.

## Completion report

Report:

- SoL-OMP absolute path, branch, and commit;
- repository state before and after installation;
- Bun and OMP versions;
- install scope and the exact `sol-omp` entry shown by `omp plugin list`;
- effective config path, four enabled flags, EPR reducer provider/model, and `cacheWriteReadRatio`, without secrets;
- every validation command and result;
- any blocker or deviation.

Do not describe the installation as successful if a required check is missing.

## Agent entry files

`agents-install.md` is the single source of truth, but agents do not universally auto-discover arbitrary filenames. Root `AGENTS.md` tells compatible coding agents to read this file, while root `CLAUDE.md` imports it for Claude Code. Keep those entry files short and keep executable installation details here.

- [Codex `AGENTS.md` discovery](https://developers.openai.com/codex/guides/agents-md)
- [Claude Code project memory and imports](https://docs.anthropic.com/zh-CN/docs/claude-code/memory)
