# Implementation plan

Status: S01 is committed and pushed; S02 and S03 merged in PRs #1 and #3. S04 and S05 merged with the follow-up editor work in PRs #4 and #5. S06 makes the editor installable for an external consumer trial. Existing implementation is summarized in [the log](implementation-log.md) and [the overview](blueprint/00-overview.md).

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

Status: merged in [PR #3](https://github.com/planetaryescape/foldkit-mde/pull/3) after the owner's subsequent request to ship to origin/HEAD. See [verification evidence](implementation-log.md#2026-10-15-editable-atx-headings).

Outcome: render and edit ATX headings at levels 1–6 within the single Visual host. Host-selected pure Button plugins convert a single editable line between paragraph and heading through existing transactions, history and autosave. Heading JSON output is version 2.

Acceptance: hide ATX markers while preserving untouched source spelling; retain selection through conversions and mode switches; support heading typing, Enter splits, empty-heading exit and native joins; reload an autosaved heading as a semantic heading. Preserve unsupported Markdown and surrounding bytes. Verify generated conversion histories against an independent model and mutation-check the property. Run precommit, build and browser/storage/persistence checks; inspect desktop and narrow layouts and a real keyboard/pointer interaction recording.

Non-goals: lists, Setext headings, full CommonMark/GFM, dynamic registration, custom components, real OS IME proof and gbfm integration.

## S04: A quieter editor UI

Status: merged in [PR #4](https://github.com/planetaryescape/foldkit-mde/pull/4). See the implementation log for delivery evidence.

Outcome: a compact page header and persistent toolbar give the document more space. Host-selected paragraph/heading tools share a Text style dropdown; Link opens its input only when needed. Native popovers own keyboard/light-dismiss behavior. Owner feedback expanded the slice to include asterisk italic, attribute-free underline, double-tilde strikethrough, a drawn chevron, a visible mode-switch shortcut and protected-card keyboard controls. These use existing source transactions/history and saving policy; JSON version 4 records all four marks.

Acceptance: heading, link and inline formatting retain selection and shared history; Escape and outside clicks close popovers without editing. Cards support keyboard focus, source editing, adjacent navigation and undoable whole-block deletion. Controls, popovers and source view fit desktop, tablet and narrow layouts. Preserve local-save/recovery behavior, including reload of the new marks. Check the rendered states, real pointer/keyboard flow, mutation-checked generated mark histories, precommit, build and all browser suites.

Non-goals: floating selection toolbar, simultaneous split view, full CommonMark nesting, extra UI dependencies and broader browser-support claims. CSS anchor positioning is verified in Chromium only.

## S05: Flat lists and block alignment

Status: merged in [PR #4](https://github.com/planetaryescape/foldkit-mde/pull/4); see the implementation log for delivery evidence.

Outcome: host-selected Lists and Align menus use pure transactions, existing history and local saving. Flat unindented bulleted/numbered items share semantic list containers in the single editing host. Enter continues a list, empty-item Enter exits it, and Backspace at the item start removes its marker. Left/Center/Right/Justify use an explicit source suffix rather than hidden state. JSON version 5 adds ListItem nodes and optional alignment.

Acceptance: convert selected single-line blocks in both modes, retain inline marks and unrelated source, undo conversions, continue/exit lists without joining neighboring paragraphs, and reload semantic lists/alignment from autosave. Inspect open menus and desktop/intermediate/narrow layouts, real pointer/keyboard input, mutation-checked generated source histories, precommit, build and all browser suites.

Non-goals: nested/task lists, automatic marker detection while typing, full CommonMark list semantics, portable Markdown alignment, dynamic plugin registration and gbfm integration.

## S06: Installable packages and a standalone consumer

Status: implemented and verified locally on `feat/installable-packages`; commit and PR submission pending. See the implementation log for evidence.

Outcome: build ESM, declarations and CSS for the four runtime packages, pack local tarballs with resolved sibling versions and exact host peers, and prove installation outside the monorepo. Keep workspace development on source exports. Development tooling belongs in `packages/tooling`, not runtime packages.

Acceptance: an isolated Foldkit app installs all four tarballs without workspace links, typechecks their public exports, runs pure formatting/undo and opt-in memory-backed startup under Node ESM, and builds the browser entry with the exported CSS. Verify actual browser editing, shortcuts, mode switching and IndexedDB reload against installed artifacts. Run precommit, full build and existing browser/storage/persistence suites. Document the embedding recipe and what remains before registry publication and a GBFM trial.

Non-goals: registry publishing, release automation, new editor capabilities, GBFM edits or assumed version compatibility, custom music components and backend saving. Distribution license and registry ownership remain owner decisions; trial manifests are `UNLICENSED` rather than inventing a license grant.
