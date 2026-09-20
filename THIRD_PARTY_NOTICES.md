# Third-Party Notices

SoL-OMP is an independent OMP-native fork derived from NVIDIA Research's MIT-licensed [NVlabs/SoL-Pi](https://github.com/NVlabs/SoL-Pi). The upstream project, copyright notices, and paper [SoL-Pi: Recursively Scaling Auto-Research Loops for Efficient Agent Harness](https://arxiv.org/abs/2609.20519) remain attributed to their authors. This fork is not maintained, endorsed, or supported by NVIDIA.

SoL-OMP does not vendor third-party source code. Its package contains only SoL-OMP source, documentation, tests-excluded assets, and project metadata.

## Runtime peer dependencies

The following packages are supplied by the user's OMP installation and retain their own licenses:

| Package | Development-tested version | License | Source |
|---|---:|---|---|
| `@oh-my-pi/pi-agent-core` | 18.2.6 | MIT | <https://github.com/can1357/oh-my-pi> |
| `@oh-my-pi/pi-ai` | 18.2.6 | MIT | <https://github.com/can1357/oh-my-pi> |
| `@oh-my-pi/pi-coding-agent` | 18.2.6 | MIT | <https://github.com/can1357/oh-my-pi> |
| `@oh-my-pi/pi-tui` | 18.2.6 | MIT | <https://github.com/can1357/oh-my-pi> |
| `typebox` | 1.3.7 | MIT | <https://github.com/sinclairzx81/typebox> |

## Development-only dependencies

`@types/node` (MIT), TypeScript (Apache-2.0), and Vitest (MIT) are used to type-check and test the repository. They are not included in the SoL-OMP package. Exact versions and transitive dependency metadata are recorded in `bun.lock`.

## Star history chart generation

The documentation workflow checks out the MIT-licensed [Star History renderer](https://github.com/star-history/star-history/tree/c326eac651bc5afb4cd40d354223dd419e1e2ae6) to preserve its chart design. Its source and dependencies are installed only for chart generation and are not included in the SoL-OMP package. The generated chart branch includes the upstream MIT license as `LICENSE-star-history.txt`.
