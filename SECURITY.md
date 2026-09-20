# Security Policy

SoL-OMP is an OMP plugin. It runs with the filesystem, process, network, and credential permissions of the OMP process that loads it. SoL-OMP is not a sandbox or permission boundary.

## Sensitive behavior

- Action Fusion can modify files and run shell commands requested by the model.
- ObservationPack stores large tool results under OMP's session directory.
- Evidence-Preserving Reducer archives diagnostic logs locally and, when explicitly enabled, sends eligible logs through the configured reducer model using OMP-managed authentication.
- The reducer skips text matching its likely-secret detector, but that detector is a precaution rather than a complete secret scanner. Do not enable remote reduction for workloads whose logs must remain local.
- Online Context Compact stores plan and compaction state in OMP's session log; see below.
- Project-local `.omp/sol-omp.json` files should be used only in trusted repositories.

Never put credentials, provider secrets, or tokens in `.omp/sol-omp.json`, command arguments, issue reports, logs, or repository files. Configure credentials through OMP's supported authentication facilities and disclose only whether a credential is present.

## Online Context Compact data

Online Context Compact is off by default. When enabled, every `update_plan` call appends a versioned custom state entry to OMP's session log. The latest valid entry holds the model-authored plan, concise progress fields, request counts, token-growth estimates, and compaction debt. These values can include paths, command names, and design notes and should be treated as sensitive as the rest of the conversation. After a successful compaction, the extension also writes one hidden, generic custom message that tells the assistant to rebuild its plan; the reminder contains no task-specific data.

The extension creates no sidecar, attestation, payload-capture, or research-instrumentation files. State entries do not enter the model context; only the generic post-compaction reminder does. Deleting the OMP session removes both kinds of persisted Online Context Compact data.

Evidence-Preserving Reducer may temporarily read an overlong bash result from outside its session archive. It accepts only a regular, non-symlink `pi-bash-*.log` file directly inside the operating system's temporary directory and copies eligible content into the session-specific archive before any nested model call. The legacy filename is an internal OMP compatibility detail, not a Pi CLI requirement.

## Reporting a vulnerability

Use this repository's GitHub Security Advisories page to submit a private report. Do not open a public issue for a suspected vulnerability.

Include the affected commit or version, OMP version, configuration, impact, reproduction steps, and any available mitigation. Vulnerabilities in OMP itself should be reported to the OMP maintainers.

SoL-OMP is an independent OMP-native fork derived from NVIDIA Research's MIT-licensed NVlabs/SoL-Pi. NVIDIA does not maintain this fork; upstream vulnerabilities should be reported to their respective maintainers.
