# OMP Compatibility

SoL-OMP is a native extension for Oh My Pi (OMP). The development and compatibility baseline is OMP 18.2.6: `@oh-my-pi/pi-agent-core`, `@oh-my-pi/pi-ai`, `@oh-my-pi/pi-coding-agent`, and `@oh-my-pi/pi-tui` are tested together at that version. The package declares them as peer dependencies so the running OMP installation owns the runtime packages and upgrades.

Versions other than 18.2.6 are not covered by the current compatibility claim. Keep the OMP package family on one matching version; mixed `@oh-my-pi/*` versions can expose incompatible extension types or runtime behavior.

## Native package integration

The npm package is named `sol-omp`. Its manifest uses OMP's native extension entry:

```json
{
  "omp": {
    "extensions": ["./src/sol-omp/index.ts"]
  }
}
```

Install the Git repository through OMP rather than copying source into the OMP installation:

```bash
omp plugin install git:github.com/<your-github-username>/SoL-OMP
```

SoL-OMP does not patch, vendor, or replace OMP. Restart OMP after installation or configuration changes.

## Public API surface

SoL-OMP imports public exports from the OMP 18.2.6 package family, including:

- built-in edit, write, and bash tool definitions;
- `ExtensionAPI`, `ExtensionContext`, and extension event types;
- context, provider-request, tool-result, turn, settlement, and session-tree extension events;
- native context usage and compaction APIs;
- the public model registry and OMP-managed authentication path;
- the public session manager;
- TUI rendering primitives from `@oh-my-pi/pi-tui`.

The extension does not depend on an OMP monorepo checkout or private source paths.

## Action Fusion

OMP's built-in edit/write definitions capture their working directory, so SoL-OMP caches one definition per `ctx.cwd`. Its per-file queue surrounds the built-in mutation and follow-up command; it does not replace OMP's own mutation queue.

`file://` targets are decoded with Node's `fileURLToPath()` before queue and hash resolution. The queue covers only fused operations registered by the current SoL-OMP instance. External processes, direct built-in-tool calls, and unrelated extensions are not globally locked. SoL-OMP hashes the target immediately before launching `then_run` and skips the command after an intervening content change.

## ObservationPack

ObservationPack changes only messages projected through OMP's public `context` event. Stored session history remains intact. Original bytes and the JSONL ledger live under the current OMP session's SoL-OMP directory, so recall continues after native compaction or session resume.

## Evidence-Preserving Reducer

The reducer handles public `tool_result` events and resolves the configured provider/model through OMP's model registry. Authentication remains OMP-managed. The original result passes through unchanged whenever eligibility, model availability, model invocation, schema, source-hash, exact-quote, size, or likely-secret validation fails.

Persistent paths come from `SessionManager.getSessionDir()` and `getSessionId()`:

```text
<OMP session directory>/sol-omp/<session-id>/
```

SoL-OMP exposes no configurable storage path and does not migrate an unpublished shared-artifact layout.

## Online Context Compact

Online Context Compact uses OMP's public `context`, `before_provider_request`, compaction, settlement, and message APIs. It registers after the other SoL-OMP context transformers. A third-party transformer loaded later is outside the context-growth estimate.

At an eligible completed-plan boundary, the extension records progress, checks economics and window pressure, and invokes OMP native compaction. After a successful compaction it sends a hidden continuation message so the task resumes in a fresh turn. A settlement barrier keeps print and JSON modes in the same OMP invocation until that continuation settles. Cancellation, exit, or failed compaction does not schedule a continuation.

The `cacheWriteReadRatio` value is read from `sol-omp.json` and remains fixed for the loaded extension. Model changes during a session do not recalculate it.

## Interactive TUI

The savings treatment uses public OMP 18.2.6 rendering, notification, and status APIs. It activates only in TUI mode. It does not alter stored messages, provider requests, tool results, JSON events, print output, or RPC UI requests.

## Upstream relationship

SoL-OMP is derived from the MIT-licensed [NVlabs/SoL-Pi](https://github.com/NVlabs/SoL-Pi) research project and retains its NVIDIA copyright and attribution. This OMP port is community-maintained; NVIDIA does not maintain or endorse this fork. The associated paper remains available at [arXiv:2609.20519](https://arxiv.org/abs/2609.20519).
