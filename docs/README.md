# Foldkit MDE documentation

Code establishes what exists. The blueprint records product contracts and intended boundaries. Plans describe future work; logs record observed outcomes. Research and handoffs retain their original baseline and are not current API documentation.

## Reading order

1. [Product overview](blueprint/00-overview.md): scope, current capabilities, and gaps.
2. [Architecture, file map, and consumer usage](blueprint/architecture.html): editing flow and the implemented local-saving extension.
3. [Decision log](blueprint/02-decision-log.md): settled choices and reasons to revisit them.
4. [Implementation plan](implementation-plan.md) and [implementation log](implementation-log.md): next decisions and delivery evidence.
5. [Current package usage](../README.md#local-saving-package-usage): compiled composition entry points.

## Document sets

| Location                                                                 | Purpose                                                              |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| [blueprint](blueprint/README.md)                                         | Product contracts, implemented architecture, and decisions           |
| [research/effect-state-machines.md](research/effect-state-machines.md)   | Version-specific machine investigation and chosen reducer direction  |
| [research/persistence-design.md](research/persistence-design.md)         | Foldkit history guarantees, storage alternatives, and initial design |
| [handoffs/persistence-tech-spec.md](handoffs/persistence-tech-spec.md)   | Retained typed proposal, not compiled public APIs                    |
| [guides/rat-stack-reference.md](guides/rat-stack-reference.md)           | Engineering patterns, deliberate differences, and enforcement gaps   |
| [guides/plugin-system-references.md](guides/plugin-system-references.md) | How pinned upstream plugin sources inform our boundaries             |
| `references/`                                                            | Unchanged vendored source snapshots, licenses, and checksums         |

The repository-local [maintaining-blueprints skill](../.agents/skills/maintaining-blueprints/SKILL.md) defines how to maintain these records. When design and code differ, classify the gap before changing either. Keep unimplemented capabilities labelled and append corrections to the implementation log rather than rewriting its history.
