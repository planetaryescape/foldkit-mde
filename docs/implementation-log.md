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

## 2026-10-15: Independent PR review and link-adjacency correction

[PR #1](https://github.com/planetaryescape/foldkit-mde/pull/1) was pushed and opened after the previous entry. The owner requested an independent code-review thread, fixes and merge. The review found [one reproducible defect](https://github.com/planetaryescape/foldkit-mde/pull/1#discussion_r4280247534): linking `word` in `Hello !word.` created image syntax, replaced the editable paragraph with a protected card and reached autosave.

The plugin now refuses insertion immediately after `!`, using the actual trimmed insertion boundary. This preserves the parser's unsupported-image policy without adding image support. Regression checks cover refusal, permitted whitespace between bang and link, and a bang inside the selected label. The public plugin test failed on the original implementation, then passed with the guard. The browser regression also checks that refusal keeps the exact source and editable paragraph.

Verification: precommit, build, browser editing, native IndexedDB contracts and packaged persistence scenarios passed against a fresh playground server. The changes remain pure plugin logic; Markdown is authoritative and the existing editor update remains the only writer. No extra runtime, dependency or gbfm changes. Merge is authorized, not yet performed in this entry; no release or deployment.

## 2026-10-15: Editable ATX headings

Related: S03. Correction to the previous delivery entry: PR #1 subsequently merged on 2026-10-15. The separate orb-setup PR #2 also merged; heading work does not include that setup change.

Result: Visual mode renders editable headings at levels 1–6 in its existing continuous host. Host-selected heading/paragraph buttons return pure transactions through core history and autosave. Selection survives conversion and mode switches; Enter splits a heading into a heading and paragraph, or exits an empty heading. Untouched headings preserve exact marker spelling and surrounding source. Conversion canonicalizes only the selected block's markers. Multiline/cross-block conversions and conversions that change visible content are refused. JSON output is version 2 with semantic Heading nodes; version-1 consumers must update.

References: Pi's pure transformations and EmDash's explicit patches remain the adapted patterns. No registry, shared plugin context, lifecycle framework or extra runtime dependency was added. Markdown is authoritative, parsing and DOM are derived, and core update remains the only document/history writer. Rat-stack's explicit boundaries and existing verification fence apply; no new enforcement gap was closed.

Verification: `bun run precommit` and `bun run build` passed. Browser editing, native IndexedDB contracts and packaged persistence scenarios passed, including heading conversion, actual autosave and semantic heading reload. Generated Unicode conversion histories ran 150 cases with seed 1473 against independent source/selection/undo expectations. An intentional off-by-one selection defect failed and shrank to empty generated parts and heading level 3; the defect was removed.

Browser validation caught two defects before delivery: greedily hiding whitespace removed spaces between typed words, and serializing an empty heading's placeholder break changed source offsets. Retained regressions cover character-by-character typing both with and without closing hashes, empty headings, cross-block Enter, native joins, selection and shared undo. Exact CRLF preservation is covered in core/plugin tests; browser textarea fixtures use LF because the browser normalizes line endings.

Desktop (1280 × 900), tablet (768 × 1024) and narrow Chromium (390 × 844) layouts were exercised and screenshots inspected. Heading controls wrap without overlap or horizontal overflow; all six heading sizes and raw markers were also inspected. A real pointer/keyboard recording shows conversion, typing and Enter into a paragraph. Screenshot binaries remain review evidence outside Git. Public screenshot upload was unavailable because this orb has no AWS CLI; captures and recording are attached to the Amp thread rather than committed. Viewport emulation is not physical-device testing. Real OS IME remains unverified.

Remaining: lists, Setext headings, full CommonMark/GFM, dynamic registration and gbfm integration are outside this slice. The architecture visual predates headings and is labelled accordingly; current contracts are in the package README.

Delivery: implemented and verified locally on `feat/editable-headings`, ready for the authorized commit, push and open PR. No merge, release or deployment is authorized for this slice.

## 2026-10-25: A quieter editor UI

Related: S04. Delivery correction for S03: after PR #3 opened, the owner authorized shipping all existing work to origin/HEAD. Fetch/rebase required no conflicts, precommit/build and all three browser suites passed, and the heading commit was pushed to main. GitHub reports PR #3 merged. No check was ignored.

The owner then requested a UI improvement drive. Three image concepts compared a quiet persistent toolbar, selection-based floating tools and simultaneous source view. The implemented first pass chooses the persistent toolbar: it removes the large marketing hero and repeated instructions, groups paragraph/heading buttons under Text style, and opens the link input on demand. Shorter controls and a two-row narrow toolbar leave more space for the document. JSON stays collapsed by default; saving, retention, export and recovery remain available.

Ownership is unchanged: Markdown is authoritative and core update owns edits/history. Optional Button group labels and Input trigger labels are presentation settings in the editor, not new core/plugin behavior. Native popovers provide dismissal and focus behavior; source/selection-keyed input lifetimes continue to reject stale drafts. No dependency or new runtime was added. Rat-stack's design-serves-function and judge-through-the-person principles led to real interaction and responsive checks rather than treating generated concepts as evidence.

Verification: precommit, build, browser editing, native IndexedDB and packaged persistence checks passed. Retained browser cases open actual heading/link popovers, check autofocus, refuse unsafe URLs without closing/editing, dismiss accepted formats and retain selected words. Real keyboard and pointer validation checked Escape focus return, outside-click dismissal, heading conversion, link submission and one editing host. Desktop (1280 × 1000), tablet (768 × 1024) and narrow Chromium (390 × 844) captures were inspected, including open menus/forms and Markdown. A narrow form initially touched the viewport edge; the final form fits between x=16 and x=374, and the heading menu between x=16 and x=208. Document scroll width equals viewport width. A frame-by-frame contact sheet of the final interaction recording was inspected.

Remaining: CSS anchor positioning and popover behavior have only been checked in Chromium; no Safari/Firefox, physical-device or OS IME claim is made. Floating selection tools and split view remain separate decisions. Review media stays outside Git in the Amp thread.

Delivery: local edits on `feat/editor-ui-polish`; not committed or pushed. The prior ship request covered the heading work already present, not this later UI pass. No release or deployment.

### Owner feedback: inline marks, chevron and keyboard blocks

The owner requested italic/underline, a better dropdown icon and keyboard interaction with protected source cards. Initial browser inspection confirmed both formatting tools were absent and cards had tabindex -1; Enter on the existing Edit source button already worked. The toolbar now exposes compact B/I/U buttons with full accessible names and shortcut hints. Pure mark transactions support asterisk italic, attribute-free `<u>` underline and combinations on complete spans in both modes. Partial or mixed-span formatting and arbitrary HTML remain outside the supported subset. JSON version 3 records explicit bold/italic/underline fields; previous output versions are not silently reused.

Cards now support Tab focus, Enter/F2 source selection, arrows between cards and text, and Delete/Backspace through shared history. Undo restores source and block focus. Focusing a card clears stale text highlighting. A focused-card paste regression failed before its guard and passed afterward. No second editing host, plugin registry, runtime dependency or persistence policy was added; Pi-style pure transformations and the existing scoped DOM adapter remain the boundaries.

Verification: precommit and build passed; browser editing, native IndexedDB and packaged persistence suites passed, including reload of italic and underline. Generated mark histories ran 150 Unicode cases with seed 2391 against independent spellings and undo selections. An intentional off-by-one selection defect failed and shrank to an italic operation with empty generated parts; removing the defect restored green. Browser cases cover both modes, native-format input types, shortcuts, typing in marks, composition with bold, first/middle/last/only/adjacent card deletion, source selection, caret navigation and undo.

Rendered inspection caught an upright italic fallback: the playground disabled font synthesis while the orb's selected serif font lacked an italic face. Allowing style synthesis, but not synthetic weight, made the text visibly italic. A narrow toolbar initially orphaned Redo; final 360/390px checks show one action row below mode tabs and no horizontal overflow. Final desktop, narrow, open-menu, link-form and focused-card captures were inspected. The final real pointer/keyboard recording shows combined marks, heading conversion, Tab/arrows/Enter, deletion and undo; its 5fps contact sheet was inspected. Chromium-only verification still does not prove Safari, Firefox, physical-device or real OS IME behavior.

Delivery: these refinements remain local and uncommitted on `feat/editor-ui-polish`, along with the first UI pass. No new push, PR, release or deployment.

### Keyboard follow-up

The owner reported that component editing still needed a click and authorized pushing this feature branch as work progresses. A real-key reproduction placed the caret midway through the paragraph before a music directive: Down did not reach the card, and Enter split the paragraph. The initial adapter only handled exact text boundaries. Vertical navigation now uses the adjacent rendered line, while horizontal navigation retains exact boundary checks. Root-level caret positions between blocks also reach their neighboring card. Retained browser regressions cover both directions and preserve native vertical navigation inside multiline paragraphs.

The regression failed before the fix and passed afterward. A real keyboard-only sequence reached the card from column two, opened its selected source with Enter and changed its id from `keep` to `new` without clicking. DOM assertions confirmed focus, source selection and resulting Markdown; the recording's contact sheet was inspected. This edits the protected source, not a new custom-component runtime. Delivery is authorized on `feat/editor-ui-polish`; no merge, release or deployment is included.

### Discoverable mode switching and strikethrough

Delivery correction: the initial UI pass and keyboard-card fix were committed and pushed as [the editor UI improvement](https://github.com/planetaryescape/foldkit-mde/commit/0cd6ba5c37464142db01e7264ebb6d040109191d). The owner then requested an obvious keyboard mode toggle and supplied Substack toolbar references, including a request for strikethrough.

Ctrl/Command+Shift+M now switches modes while focus is within the editor, including its mode controls. Its hint stays visible beside Visual/Markdown. Selection is captured before switching; composition and repeated keydown events cannot toggle modes. The scoped listener has the same Effect-managed lifetime as the existing DOM adapter. Markdown remains authoritative and core update remains its only writer.

The toolbar borrows clear separators and recognizable formatting/history controls rather than adding unsupported media actions. Strikethrough is a host-selected pure plugin using double tildes, composes with the existing marks on complete spans, and shares typing, undo and autosave. Formatted link labels remain protected. JSON version 4 adds an explicit strikethrough boolean. The adapted pattern remains Pi-style pure transformations; no registry, new runtime or dependency was added.

Verification: precommit, build and all three browser suites passed. Generated mark histories cover four marks against 16 independent spellings with Unicode selections (150 runs, seed 2391). An intentional strikethrough selection offset defect failed on the sixth run and shrank to a single strikethrough operation; removing it restored green. Browser editing caught missing DOM serialization for strikethrough while typing; the serializer now preserves it. Browser checks cover both modes, composition/repeat guards, combined marks, source selection, undo and semantic autosave/reload.

A real-pointer recording crosses neighboring formatting tools, toggles strikethrough, then uses actual Ctrl+Shift+M presses in both directions. DOM assertions confirm the selected words and formatting survive; the final recording contact sheet shows the return to Visual. Desktop Visual/Markdown and narrow captures were inspected. At 360px all actions fit one row below the mode controls, with scroll width equal to viewport width. This remains Chromium-only evidence, not OS IME or physical-device verification. Review media stays outside Git.

Delivery: follow-up verified locally and ready for the authorized feature-branch commit and push. No new PR, merge, release or deployment is included.
