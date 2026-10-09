# Foldkit MDE blueprint

Baseline inspected on 2026-10-09: application code at the committed local-saving implementation. This blueprint combines current behavior and accepted direction; individual records state their scope and gaps.

| Record                                 | Responsibility                                                           |
| -------------------------------------- | ------------------------------------------------------------------------ |
| [00: Overview](00-overview.md)         | Goal, audience, current capability, and non-goals                        |
| [01: Architecture](architecture.html)  | Runtime flows, file ownership, plugin contracts, and package consumption |
| [02: Decision log](02-decision-log.md) | Stable choices, alternatives, consequences, and revisit conditions       |

The architecture page keeps its original editing baseline and adds local saving in section 09. Treat earlier editing-only consumer recipes accordingly. The [root usage guide](../../README.md#local-saving-package-usage) and package exports establish the current persistence entry points.

Numbers order reading, not delivery. Research and the persistence handoff live outside this blueprint because their proposed contracts are historical. Future work belongs in the [plan](../implementation-plan.md); results belong in the [log](../implementation-log.md). No document authorizes changes to gbfm, dependency additions, releases, or deployments.
