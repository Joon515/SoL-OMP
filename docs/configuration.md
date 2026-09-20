# Configuration

SoL-OMP reads one effective JSON configuration file when its OMP extension starts. Configuration belongs to the `sol-omp` package; provider credentials and the main agent model remain OMP settings.

## Search order

1. `<working-directory>/.omp/sol-omp.json`, only when OMP marks the project trusted
2. `<OMP agent directory>/sol-omp.json`
3. Built-in defaults when neither file exists

The OMP agent directory is the directory returned by OMP's `getAgentDir()` API. Use the directory reported by your OMP installation rather than assuming a platform-specific absolute path.

A project file replaces the user-wide file. SoL-OMP does not merge the two. Put project-specific policy in `.omp/sol-omp.json`; use the OMP agent directory for a personal default across trusted projects.

## Minimal setup

Create a project-local configuration from the repository root:

```bash
mkdir -p .omp
cp sol-omp.example.json .omp/sol-omp.json
```

The example leaves all four mechanisms disabled. Edit only the mechanisms you intend to enable, then restart OMP so the extension reloads the file.

## Schema

```json
{
  "version": 1,
  "actionFusion": false,
  "observationPack": false,
  "evidencePreservingReducer": false,
  "evidencePreservingReducerProvider": "provider-id",
  "evidencePreservingReducerModel": "model-id",
  "onlineContextCompact": false,
  "cacheWriteReadRatio": 12.5
}
```

Feature keys may be omitted and then default to `false`. `cacheWriteReadRatio` may be omitted and defaults to `12.5`; when present it must be a finite non-negative number. A value of `0` explicitly means that a cache write adds no cost relative to a cache read.

`evidencePreservingReducerProvider` and `evidencePreservingReducerModel` may be omitted to use the built-in reducer route. When present, each must be a non-empty string naming a model available through OMP's model registry.

Unknown keys, unsupported versions, malformed JSON, non-boolean feature values, invalid ratios, and invalid reducer model fields stop extension loading with a direct error.

## Feature behavior

- `actionFusion`: replaces OMP's `edit` and `write` tools with compatible definitions that can run a follow-up command in the same call.
- `observationPack`: registers `obs_recall` and replaces repeated large provider-context observations with locally recallable handles.
- `evidencePreservingReducer`: processes eligible long diagnostic logs and accepts reduced receipts only when their evidence matches the archived source.
- `evidencePreservingReducerProvider`: provider namespace used to resolve the reducer model through OMP's model registry.
- `evidencePreservingReducerModel`: model identifier used by Evidence-Preserving Reducer.
- `onlineContextCompact`: registers `update_plan` and considers OMP native compaction at completed plan boundaries.
- `cacheWriteReadRatio`: supplies the economic decision ratio used by Online Context Compact. It is policy input, not a cost report.

## Example profiles

Enable only mechanisms that stay local and make no nested model request:

```json
{
  "version": 1,
  "actionFusion": true,
  "observationPack": true,
  "evidencePreservingReducer": false,
  "onlineContextCompact": false,
  "cacheWriteReadRatio": 12.5
}
```

Enable all mechanisms after reviewing the security implications and selecting a reducer route available in OMP:

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

Validate an all-enabled effective file from a SoL-OMP checkout:

```bash
node scripts/check-sol-omp-config.mjs \
  --config /absolute/path/to/effective/sol-omp.json \
  --require-all-enabled
```

Without `--require-all-enabled`, omitted feature keys retain their normal `false` defaults.

## Runtime inputs and storage

Evidence-Preserving Reducer resolves its configured provider/model through `ExtensionContext.modelRegistry` and uses OMP-managed authentication. Do not put API keys, tokens, provider URLs, or other credentials in `sol-omp.json`. If the model is unavailable or the nested model call fails, the original tool result continues unchanged.

Online Context Compact reads the context window and provider-counted size from `ExtensionContext.getContextUsage()`. The configured cache ratio remains fixed for the loaded extension and is not recomputed when the main model changes. Its plan and compaction state are versioned entries in the OMP session log; it creates no separate compaction files.

SoL-OMP reads no dedicated environment variables. It does not configure shell paths, command prefixes, storage paths, run IDs, provider URLs, reasoning levels, timeouts, or the main model. Action Fusion uses OMP's shell behavior. Persistent artifacts are derived from OMP's session directory and session ID:

```text
<OMP session directory>/sol-omp/<session-id>/
```

## Trust

A project-local configuration can enable file mutation, shell execution, local archival, and remote diagnostic-log reduction. SoL-OMP ignores `.omp/sol-omp.json` until OMP reports the project as trusted. Trust a project only after reviewing its configuration. Prefer the OMP agent-directory file when you want one personal configuration across trusted projects.
