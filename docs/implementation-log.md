# Implementation log

This log begins on 2026-10-09. Earlier work below is a concise backfill from inspected commits and the existing usage guide, not reconstructed command transcripts. Append new results and explicit corrections. Keep future work in [the plan](implementation-plan.md).

## 2026-10-08: Editing baseline, JSON, and reference material

Result: the workspace gained editable Visual/raw surfaces, shared history, a continuous Visual host, JSON representation, and source-preserving DOM adaptation. The architecture visual maps these contracts to files and consumers. Plugin snapshots and engineering references were retained separately from runtime dependencies.

Evidence: commits [visual editing/history](https://github.com/planetaryescape/foldkit-mde/commit/3da1568), [JSON](https://github.com/planetaryescape/foldkit-mde/commit/8e87fba), [continuous editing](https://github.com/planetaryescape/foldkit-mde/commit/fe42ef0), and [plugin references](https://github.com/planetaryescape/foldkit-mde/commit/34ce835). These commits establish the changes, not independent proof of every browser claim.

Remaining: full Markdown visual coverage, registered formatting/custom-component plugins, and real OS IME verification.

Delivery: committed and subsequently pushed to the public GitHub repository. No package release, gbfm integration, or deployment is recorded.

## 2026-10-09: Packaged local saving and recovery

Related: D004. Result: DocumentStore, native IndexedDB and memory Layers, pure autosave, and the opt-in editor integration provide loading, retry, flush, conflict status, and read-only previous-checkpoint recovery. Markdown and JSON output use the representation boundary.

Evidence: [implementation commit](https://github.com/planetaryescape/foldkit-mde/commit/8871a9d) and [usage/design documentation commit](https://github.com/planetaryescape/foldkit-mde/commit/d408f74). The prior session reported passing precommit, build, and browser/editor/storage checks. That report is historical evidence; this documentation migration does not rerun or independently establish those browser results.

Deviation from the broader handoff: no document switching or recovery-as-new. Source-only restart resets session history and caret. The native adapter avoids another direct dependency. Browser checkpoints are not backup, and timing/cap policy belongs to the host.

Delivery: committed and pushed; repository visibility is public. No release or deployment is recorded.

<a id="documentation-organization"></a>

## 2026-10-09: Documentation organization

Related: S01. Result: a repository-local maintaining-blueprints skill and templates separate contracts, decisions, plans, and evidence. Existing first-party documents are classified into blueprint, research, historical handoffs, and contributor guides. Vendored snapshots remain at their original paths.

Skill checks: frontmatter validation passed. Two hypothetical cases were run both with and without the skill. The skill output met all seven reviewed criteria; baseline output met six. Both handled failed saving verification correctly. The observed improvement was explicit separation of plan/log from a new blueprint, not proof of general skill reliability. Evaluation output is disposable local review material, not product documentation.

Repository checks: precommit and build passed for the skill commit. Migration-specific links, checksums, gates, and the rendered architecture map are checked separately before committing the reorganization; their final results will be appended below.

Delivery: skill committed locally; documentation reorganization in progress. Neither is pushed in this entry. No runtime behavior was changed.

### Verification closure

The migration passed checks for 152 local links and anchors across 14 first-party documents, unchanged vendored SHA-256 checksums, `bun run precommit`, `bun run build`, and `git diff --check`. An illustrative package stylesheet href inside an HTML code example was excluded from filesystem-link checking. The relocated architecture page rendered in agent-browser; the updated documentation tree was captured and inspected with no clipping or overlap in the changed entries. Browser editor/storage behavior was not rerun for this documentation-only change.

S01's documentation acceptance criteria are met locally. The reorganization is ready for its separate local commit; pushing remains a separate action. The repository-local skill is linked from AGENTS.md. This session starts in the parent `oss` workspace, so its skill reload did not auto-discover the nested repository skill; sessions opened in foldkit-mde can discover it directly.

## 2026-10-14: Host-selected formatting and links

Related: S02 and D003. Bold now belongs to plugins, not core. The editor composes statically selected Button/Input tools; stale source or selection snapshots cannot apply a formatting request. Plain-label links support insertion, destination replacement and removal in Visual and Markdown modes through the same transactions, undo and autosave. JSON includes optional destinations. Unsupported syntax and images remain protected source.

References: Pi's pure transformations and EmDash's explicit patch results informed the boundary. No dynamic registry, marketplace, extra runtime dependency or general plugin context was added. Markdown remains authoritative; Effect owns scoped DOM listener lifetimes and existing persistence work.

Verification: precommit (format, lint, types, workspace tests), build, browser editing, native IndexedDB contracts and packaged persistence scenarios passed. Generated link cases cover 150 labels with seed 923, including Unicode and whitespace, with independent expectations. An intentional off-by-one selection defect failed and reduced to label `a`; it was removed. Image protection failed before its fix and passed afterward. Browser checks exercised insertion/replacement/removal, unsafe destinations, edited labels without navigation, JSON and undo across modes.

A browser check caught stale form mount arguments: Foldkit captures them at insertion rather than refreshing them on render. Forms now have source/selection-keyed lifetimes. Desktop (1280 × 800), tablet (768 × 1024) and mobile (390 × 844) controls were exercised and captures inspected; no clipping or overlap was visible, and mobile had no horizontal overflow. Raw-mode syntax was also captured and inspected.

Remaining: full CommonMark, nested link formatting, custom components and real operating-system IME checks. No gbfm code changed. Browser screenshots are PR review evidence, not committed binaries. S01 delivery correction: its skill and documentation migration were subsequently committed and pushed.

Delivery: feature verified locally on `feat/formatting-plugins-links`, ready for commit and authorized PR submission. No merge, release or deployment.
