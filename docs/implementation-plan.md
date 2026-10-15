# Implementation plan

Status: S01 is committed and pushed. The owner authorized host-selected formatting and links through an open PR. Existing implementation is summarized in [the log](implementation-log.md) and [the overview](blueprint/00-overview.md).

## S01: Make documentation navigable and maintainable

Status: committed and pushed.

Scope: repository-local skill, indexed blueprint, research/handoff/guide separation, stable decisions, and an implementation log. No runtime changes or vendored-source edits.

Acceptance: every existing first-party document has an appropriate location; navigation reaches the current usage and retained rationale; old proposals cannot be mistaken for shipped contracts; moved links resolve.

Checks: skill validation and hypothetical behavior cases, local documentation links, vendored checksums, repository precommit and build gates, and visual inspection of the relocated architecture file map.

Docs: [index](README.md), [blueprint](blueprint/README.md), [skill](../.agents/skills/maintaining-blueprints/SKILL.md), root README and AGENTS.

Completion evidence: [documentation organization entry](implementation-log.md#documentation-organization).

## S02: Host-selected formatting and links

Status: implemented and verified in [PR #1](https://github.com/planetaryescape/foldkit-mde/pull/1). Independent review found one image-adjacency defect; its fix and regression checks passed. Merge authorized by the owner. Depends on D002 and D003.

Outcome: the host selects pure bold/link plugins and their editor-owned controls. Users insert, replace and remove plain-label links in both modes through shared history and autosave. Core must not import concrete formatting implementations.

Acceptance: typed plugin inputs, exact surrounding source preservation, safe destinations, stale-request rejection, selection restoration, JSON destinations and no extra runtime dependency. Check public pure operations and real browser input/readback, then the existing persistence regressions. Inspect desktop, tablet and mobile layouts. No dynamic loading, full CommonMark, custom components or gbfm edits.

Local saving policy also remains consumer-specific: review timing, loss tolerance, identity, and byte limits before adopting the editor in gbfm. Actual gbfm integration needs a separate request and acceptance criteria.
