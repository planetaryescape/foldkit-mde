# Implementation plan

Status: S01 is committed and pushed; S02 merged in PR #1 on 2026-10-15. The owner authorized S03 through an open PR. Existing implementation is summarized in [the log](implementation-log.md) and [the overview](blueprint/00-overview.md).

## S01: Make documentation navigable and maintainable

Status: committed and pushed.

Scope: repository-local skill, indexed blueprint, research/handoff/guide separation, stable decisions, and an implementation log. No runtime changes or vendored-source edits.

Acceptance: every existing first-party document has an appropriate location; navigation reaches the current usage and retained rationale; old proposals cannot be mistaken for shipped contracts; moved links resolve.

Checks: skill validation and hypothetical behavior cases, local documentation links, vendored checksums, repository precommit and build gates, and visual inspection of the relocated architecture file map.

Docs: [index](README.md), [blueprint](blueprint/README.md), [skill](../.agents/skills/maintaining-blueprints/SKILL.md), root README and AGENTS.

Completion evidence: [documentation organization entry](implementation-log.md#documentation-organization).

## S02: Host-selected formatting and links

Status: merged and verified in [PR #1](https://github.com/planetaryescape/foldkit-mde/pull/1) on 2026-10-15. Independent review found one image-adjacency defect; its fix and regression checks passed. Depends on D002 and D003.

Outcome: the host selects pure bold/link plugins and their editor-owned controls. Users insert, replace and remove plain-label links in both modes through shared history and autosave. Core must not import concrete formatting implementations.

Acceptance: typed plugin inputs, exact surrounding source preservation, safe destinations, stale-request rejection, selection restoration, JSON destinations and no extra runtime dependency. Check public pure operations and real browser input/readback, then the existing persistence regressions. Inspect desktop, tablet and mobile layouts. No dynamic loading, full CommonMark, custom components or gbfm edits.

Local saving policy also remains consumer-specific: review timing, loss tolerance, identity, and byte limits before adopting the editor in gbfm. Actual gbfm integration needs a separate request and acceptance criteria.

## S03: Editable ATX headings

Status: implemented and verified locally on `feat/editable-headings`; ready for the owner-authorized commit, push and open PR. Delivery stops at an open PR, not merge. See [verification evidence](implementation-log.md#2026-10-15-editable-atx-headings).

Outcome: render and edit ATX headings at levels 1–6 within the single Visual host. Host-selected pure Button plugins convert a single editable line between paragraph and heading through existing transactions, history and autosave. Heading JSON output is version 2.

Acceptance: hide ATX markers while preserving untouched source spelling; retain selection through conversions and mode switches; support heading typing, Enter splits, empty-heading exit and native joins; reload an autosaved heading as a semantic heading. Preserve unsupported Markdown and surrounding bytes. Verify generated conversion histories against an independent model and mutation-check the property. Run precommit, build and browser/storage/persistence checks; inspect desktop and narrow layouts and a real keyboard/pointer interaction recording.

Non-goals: lists, Setext headings, full CommonMark/GFM, dynamic registration, custom components, real OS IME proof and gbfm integration.
