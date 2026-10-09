# Implementation plan

Status: documentation organization is complete locally; the next editor behavior slice is not selected. This plan does not authorize application changes. Existing implementation is summarized in [the log](implementation-log.md) and [the overview](blueprint/00-overview.md).

## S01: Make documentation navigable and maintainable

Status: complete locally. Delivery is not yet pushed.

Scope: repository-local skill, indexed blueprint, research/handoff/guide separation, stable decisions, and an implementation log. No runtime changes or vendored-source edits.

Acceptance: every existing first-party document has an appropriate location; navigation reaches the current usage and retained rationale; old proposals cannot be mistaken for shipped contracts; moved links resolve.

Checks: skill validation and hypothetical behavior cases, local documentation links, vendored checksums, repository precommit and build gates, and visual inspection of the relocated architecture file map.

Docs: [index](README.md), [blueprint](blueprint/README.md), [skill](../.agents/skills/maintaining-blueprints/SKILL.md), root README and AGENTS.

Completion evidence: [documentation organization entry](implementation-log.md#documentation-organization).

## S02: Select the next editing experience to prove

Status: awaiting owner feedback from the playground. Depends on D002 and D003.

Candidate outcomes already named in the usage guide: stronger selection behavior, headings/lists/links, or a gbfm custom-component plugin. They are alternatives, not three approved workstreams.

Before implementation, choose one observable user outcome, inspect its owning core/editor/plugin boundary, and define source preservation, history, failure, and browser acceptance checks. Update the blueprint only for that capability. Do not introduce a general registry simply to prepare for all candidates.

Local saving policy also remains consumer-specific: review timing, loss tolerance, identity, and byte limits before adopting the editor in gbfm. Actual gbfm integration needs a separate request and acceptance criteria.
