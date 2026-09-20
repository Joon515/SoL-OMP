# Contributing

We welcome external pull requests that improve token efficiency and reduce token cost through OMP-native extensions.

## Pull Request Requirements

Your PR should:

- Implement an OMP 18.2.6-compatible extension using OMP's public extension APIs, without modifying OMP's core.
- Preserve the `sol-omp` package name and `omp.extensions` manifest contract.
- Use Bun for dependency installation, scripts, tests, and package inspection.
- Be tested before submission, with relevant automated tests and reproducible validation steps.
- Clearly explain how the extension reduces token cost or improves token efficiency, including local measurements where available.
- Document its configuration, expected behavior, security implications, and any trade-offs. Efficiency improvements will be evaluated alongside correctness and task performance.

Do not commit credentials or place them in `.omp/sol-omp.json`. Project-local configuration can enable file mutation, shell execution, local archival, and remote model processing and must be tested only in trusted repositories.

## Upstream Attribution

SoL-OMP is an independent OMP-native fork derived from NVIDIA Research's MIT-licensed [NVlabs/SoL-Pi](https://github.com/NVlabs/SoL-Pi). Preserve the upstream license, copyright notices, and paper attribution in contributed work. Do not represent this fork as maintained, endorsed, or supported by NVIDIA.

## Benchmarking and Reports

Maintainers may benchmark submitted extensions to evaluate token usage, model cost, and task performance. Any published benchmark should state its environment, OMP version, configuration, and observed trade-offs.

## Contributor Recognition

Authors of accepted PRs will be credited as contributors in project documentation and relevant benchmark reports.
