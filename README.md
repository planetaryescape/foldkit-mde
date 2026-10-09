# Foldkit MDE

A Markdown editor library and playground, built with Foldkit and Effect. The intended first consumer is gbfm. This repository does not modify gbfm.

## Run and check

Requires Bun 1.4.0. Development tooling also requires Node 22.18+ because Oxlint's JavaScript plugins and RuleTester do not support Bun's runtime.

```sh
bun install --frozen-lockfile
bun run dev
bun run precommit
bun run build
```

The playground listens at <http://127.0.0.1:3017>. Its static build goes to `apps/playground/dist/`. It now saves exact Markdown locally in IndexedDB. Reload restores the last committed source with fresh history, caret, and Visual mode. This is browser-local saving, not publishing or backup.

Browser hot reload is disabled because Foldkit uses Vite-specific `import.meta.hot` methods that Bun does not implement. Restart the server and refresh the browser after source changes.

With the server running and `agent-browser` installed separately, run `bun run --filter @foldkit-mde/playground test:browser`. This checks the real browser adapter without adding a browser library to the project. Composition and paste events in this check are synthetic; a real operating-system IME still needs manual testing.

Also run `bun run --filter @foldkit-mde/playground test:storage` for the native IndexedDB contract and `bun run --filter @foldkit-mde/playground test:persistence` for packaged autosave, reload, two-tab conflict, and recovery UI. These use dedicated automation profiles. The storage harness creates and deletes its own disposable database. The editor check changes its automation profile's playground document and restores its deliberately corrupted checkpoint afterward. Do not run it against a profile containing valuable work. `/persistence-check` is a local test route, not part of the static production build.

## Bun workspaces

```text
apps/
  playground/       Browser runtime, sample document, Bun server
packages/
  core/             Effect Schema Model/Messages and pure Match reducer
  editor/           Foldkit view and editor stylesheet
  plugins/          Built-in representation plugins, starting with JSON
  persistence/      Effect DocumentStore, native IndexedDB, memory Layer, autosave reducer
  anti-slop/        Vendored development-only Oxlint plugins and tests
docs/
  README.md         Documentation index and reading order
  blueprint/        Product contracts, architecture visual, decisions
  research/         Source investigations and historical baselines
  handoffs/         Retained typed design proposals
  guides/           Engineering and plugin reference guides
  implementation-plan.md
  implementation-log.md
  references/       Pinned, read-only plugin source snapshots, not workspaces
```

The editor depends on core. The playground composes both and owns `Runtime.makeApplication` and `Runtime.run`. Core imports neither Foldkit nor browser APIs. Packages communicate through explicit exports and `workspace:*` dependencies, not relative paths into other workspaces.

There is one root `bun.lock`. The root catalog pins runtime versions for all workspaces. All packages are private; these TypeScript source exports are not yet a publication pipeline:

- `@foldkit-mde/core`: Model, Message, selection, transactions, `init`, `update`, `bold`, and source-span parsing/mapping.
- `@foldkit-mde/editor`: Foldkit `view` and `Synchronize` command.
- `@foldkit-mde/editor/style.css`: editor styles.
- `@foldkit-mde/core/plugins`: formatting and representation contracts.
- `@foldkit-mde/plugins/json`: versioned JSON Schema and a pure document projection.
- `@foldkit-mde/plugins/markdown`: exact Markdown representation.
- `@foldkit-mde/editor/persistence`: opt-in `make`, Model/Message/Startup, local-save/recovery `view`, and typed `project`.
- `@foldkit-mde/persistence/store`: DocumentStore and Schema-backed keys, receipts, failures.
- `@foldkit-mde/persistence/indexed-db` and `/memory`: scoped native browser adapter and deterministic test Layer.
- `@foldkit-mde/persistence/autosave`: pure lifecycle, events, intents, and flush outcomes.

Only Foldkit and Effect are external application dependencies. Foldkit requires `@effect/platform-browser` and `parse5`, which also brings `entities`; Bun resolves those peer/transitive dependencies. The additional packages are development tooling, not editor runtime dependencies.

### Effect version

We use stable **Effect 4.0.0** and **Foldkit 0.167.0**. Effect 4.0.2 is the registry's latest stable version checked on 2026-10-08, but Foldkit requires exactly Effect 4.0.0 and `@effect/platform-browser` 4.0.0. We use the newest declared compatible combination without peer overrides. This project no longer uses an RC.

## Tooling

The lint, format, and compiler defaults start from [your strict JS/TS gist](https://gist.github.com/guidefari/67636c73587ab25597794f5b48eed089), revision `9954c9624524a9d0f65fc513df1318b2ff4610dc`.

- **Effect language service and native TypeScript-Go:** `@effect/tsgo` 0.51.1 patches TypeScript 7.0.2 and Oxlint during `bun install`. `tsc` is the patched native compiler, not the old JavaScript compiler. No separate native-preview installation is needed.
- **Oxlint:** type-aware checks, the strict Effect preset, and all 23 vendored anti-slop rules. Oxlint and `@oxlint/plugins` are both pinned to 1.87.0. Warnings fail lint.
- **Oxfmt:** no semicolons, single quotes, sorted imports, 100-column width. The gist's old `experimentalSortImports` key is updated to the current `sortImports` key.
- **Strict compiler configuration:** the gist's safety checks live in `tsconfig.base.json`. Browser/Bun workspaces override NodeNext resolution with Bundler resolution and add DOM/Bun declarations.
- **Tests:** editor tests use Bun. We did not import the gist's Vitest configuration or install a second test framework. All 24 upstream anti-slop test files run through a Bun script using Node's native TypeScript support, as required by RuleTester.

`bun run precommit` checks formatting, lint, types, and tests without changing files. Run `bun run format` or `bun run lint:fix` explicitly to apply fixes. `bun install` installs the tracked `.githooks/pre-commit` through repository-local `core.hooksPath`; `bun run hooks:install` reinstalls it when needed. This repository owns that hook path. Build verification remains a separate `bun run build` step.

`.vscode/settings.json` selects the workspace native TypeScript compiler and recommends the Oxc extension for lint/format integration. Open this repository as the editor workspace. Effect diagnostics come from type-aware Oxlint, while the Effect LSP supplies refactors and completions; duplicate LSP diagnostics are disabled following Effect's integration guidance. The CLI checks are verified independently of editor activation.

Anti-slop lives in `packages/anti-slop`, not a top-level tools directory. Its implementation, tests, and licenses are retained. [Vendoring provenance](packages/anti-slop/UPSTREAM.md) records the exact upstream commit and local adaptations. Application lint and formatting exclude vendor source; its own tests and independent type check still run.

## Settled design direction

1. Build our own editor, not a wrapper around an existing rich-text editor.
2. Support switching between **editable WYSIWYG** and **raw Markdown**, not just a read-only preview.
3. Use our own **Effect Schema + exhaustive Match reducer**. Foldkit owns the UI event loop; do not add another actor runtime.
4. Keep a core with testable plugin behavior. Bold/italic, custom components, and Markdown-to-HTML are plugin capabilities rather than hardcoded host features.
5. Package primary local saving and recovery with the editor. The host configures identity, policy, storage Layer, and runtime. Backend saving, publishing, and application-specific integrations remain in the host.

The playground implements the first editing slice: editable paragraphs and `**bold**`, raw Markdown, selection-aware bold toggling, paragraph breaks, and shared undo/redo. Select plain text to apply bold, or the full contents of a bold span to remove it. Partial selections inside bold and mixed formatting selections are not supported yet. Bold is a pure transaction-producing operation, not a registered plugin engine.

Unsupported blocks, including gbfm music directives, appear as protected source cards. **Edit source** opens raw Markdown at that block. Mode switches do not rewrite the document. The visual adapter renders text nodes and `strong` elements, never source HTML, and pastes plain text only.

Visual mode is now one continuous editing host. Paragraphs are structural children, not separate textboxes. Native cursor movement, cross-paragraph selection/replacement, and Backspace/Delete joins work through that host and share core history. Unsupported source cards are non-editable nodes; structural selection can remove a whole card, while editing its contents requires raw mode.

Open **JSON representation** below the editor to inspect the built-in plugin output. It includes exact source, paragraph nodes, bold marks, source spans, and opaque raw nodes. JSON is a read-only projection, not another authoritative document. JSON import/editing is not implemented; it must validate its format and produce core transactions when added.

This is not a full CommonMark/GFM editor. Full formatting semantics, history coalescing, multiple editor instances, durable undo, and dynamic plugin registration remain future work. Undo currently records each input event or transaction, rather than grouping a typing session.

## Local saving: package usage

The playground's [compiled composition](apps/playground/src/main.ts) is the consumer recipe. Import `@foldkit-mde/editor/persistence`, call `make({ key, seed, policy })`, and give Foldkit the integration's `init` and `update`. Provide an IndexedDB Layer through `resources`, use `Startup` as the Flags schema, and pass `editor.load` as the boot Flags Effect. Render `Editor.view(model, h)`. The host does not write an autosave reducer.

The core remains usable without storage. The persistent integration wraps it and observes accepted source differences, including undo, redo, and raw or visual edits. Selection and mode changes do not save or create history entries.

- Playground policy: 500 ms quiet delay, 2 s maximum dirty window, 1 MiB UTF-8 source limit. These are explicit host choices, not measured crash-loss guarantees. Background-tab throttling and I/O can delay completion.
- One immutable write is in flight. Newer edits coalesce. Unknown outcomes retry the original write ID; confirmed aborted writes can retry the latest source. Stale receipts cannot mark newer edits saved.
- Latest and previous checkpoints rotate in one compare-and-save transaction. Another writer or cleared storage causes a conflict, not silent replacement. A conflict stops automatic writes but keeps local edits and export available.
- Opening failures pause editing. The previous checkpoint can be checked, previewed, and exported without overwriting the unreadable original. There is no destructive reset or automatic merge.
- **Saved locally** means a transaction committed the current source. **Keep on this device** requests retention separately. Neither prevents the user clearing browser data. Export valuable work.
- `Editor.project(model, markdown)` and `Editor.project(model, json)` return `Option<ContentOutput<T>>` with key, local revision, representation ID, and typed content. They can include unsaved accepted source; projection is not a save receipt. HTML is not implemented.
- For a host-controlled close, dispatch `Message.Persistence({ message: Event.Flush({ id }) })` using the Schema constructors and observe `FlushCompleted`. Outcomes are `Flushed`, `FlushFailed`, or `FlushBusy`. Wait before unmounting; unload is not a reliable asynchronous flush boundary. Restart resets session history and caret.

The reducer, adapter, and integration contracts are mapped to files in [architecture section 09](docs/blueprint/architecture.html#persistence). No action journal, SQLite, remote saving, or gbfm integration was added.

### Architecture to work toward

Core owns document state, selection, transactions, history, and interaction transitions. Formatting plugins should accept document/selection input and return pure transactions so their behavior can be unit-tested without the DOM. Async work can use Effect with explicit completion Messages and revision checks.

The Foldkit package owns raw and visual surfaces, input translation, DOM selection, focus, composition, and command execution. Both surfaces must dispatch edits through the same transaction path and history, rather than maintain independent documents. The host registers plugins and observes changes.

Markdown source is authoritative. The small parser derives paragraph and inline spans. The continuous DOM adapter maps ranges across blocks, preserves unchanged block source and adjacent original separators, and translates structural edits into changed source. It pauses input dispatch during composition. Foldkit mounts own listener cleanup through Effect's scoped acquisition. The playground executes synchronization commands through its existing runtime boundary.

[Architecture and package usage](docs/blueprint/architecture.html) maps package imports to the actual file tree, traces browser input through the reducer and synchronization command, and distinguishes implemented contracts from planned capabilities. It includes [headless and Foldkit consumer recipes](docs/blueprint/architecture.html#usage), the state/message rules, and the gaps that remain before gbfm embedding. Representation plugins implement `project(source) → output`; formatting plugins implement `apply(source, selection) → transaction`. The host selects implementations. JSON is implemented in `packages/plugins`; bold remains directly wired until dynamic registration is added.

Plugin responsibilities differ:

- Formatting transforms document/selection into a transaction.
- JSON projects source into versioned, Schema-defined nodes and marks without mutating the document.
- Markdown-to-HTML rendering consumes a document and returns output or diagnostics. HTML safety is part of that contract.
- Custom components register syntax and visual editing behavior. gbfm can supply music/media integrations without putting Spotify, uploads, or publishing in core.

The core tests cover source preservation, bold transaction boundaries, blank paragraphs, selection restoration, and generated edit/undo/redo/mode histories against an independent model. The history property was mutation-checked: deliberately retaining redo after an edit failed and shrank to `edit → undo → edit`. The defect was then removed.

Try the playground before expanding the plugin contract. The next design decision is which editing behavior matters most: complete text-selection semantics, headings/lists/links, or a gbfm custom-component plugin.

## Research and local references

Start with [the documentation index](docs/README.md) for the blueprint, decision log, implementation plan, and delivery history. The repository-local [maintaining-blueprints skill](.agents/skills/maintaining-blueprints/SKILL.md) defines how to keep them current.

[Plugin-system design references](docs/guides/plugin-system-references.md) vendors curated snapshots of [executor](https://github.com/UsefulSoftwareCo/executor) and the four plugin references named in its README: OpenCode, OpenClaw, EmDash, and Pi. Contracts, registration/lifecycle implementations, and examples/tests live under `docs/references/`, with pinned commits, original MIT licenses, and a checksum manifest. The guide maps useful patterns to our packages and identifies complexity we should not copy. Read it before designing plugin contracts, custom-component lifetimes, or Effect adapters. These are reference sources, not dependencies or runnable workspaces.

[Effect state machine research](docs/research/effect-state-machines.md) preserves the original version-specific investigation and records the chosen Schema + Match direction separately.

[Persistence research](docs/research/persistence-design.md) verifies Foldkit's in-memory debugging history and compares checkpoints with durable action logs. The revised [typed handoff](docs/handoffs/persistence-tech-spec.md) records editor-owned primary local saving and recovery. Their proposed examples are historical design material; the implemented contracts and usage are documented above and in the architecture map. Native IndexedDB was selected without adding a direct external dependency.

[Rat-stack reference](docs/guides/rat-stack-reference.md) records the patterns we adopt, deliberate differences, and enforcement gaps. [AGENTS.md](AGENTS.md) requires reading its relevant rules and skills before coding. We retain Bun, Foldkit, and Schema + Match. Future infrastructure uses Alchemy outside the editor core, when needed.

Useful read-only references, relative to this repository:

- `../invoicing-mprocs/repos/foldkit/examples/counter/src/main.ts`: small Model/Message/update/view loop.
- `../invoicing-mprocs/repos/foldkit/examples/embedding/src/main.ts`: host-owned embedding and Ports.
- `../invoicing-mprocs/repos/foldkit/packages/typing-game/client/src/`: Submodels and child outputs.
- `../invoicing-mprocs/repos/foldkit/packages/foldkit/src/mount/`: element-scoped observation and cleanup.
- `../invoicing-mprocs/repos/foldkit/packages/markdown/src/`: typed AST and Foldkit rendering. Its remark/unified parser is not imported here.
- `../invoicing-mprocs/repos/foldkit/repos/effect/` and `../effect-smol/packages/effect/`: Effect source references.
- `../gbfm/apps/www/src/page/creator/`: existing editor and save workflow.
- `../gbfm/packages/rich-content/src/`: canonical Markdown/directive format, diagnostics, and limits.

The Foldkit checkout is an older 0.132.0 snapshot with an older Effect beta. Prefer this project's installed package APIs over that snapshot.

### Findings from gbfm

The creator editor is a Foldkit textarea. Formatting appends sample text instead of editing the selection. Source and preview are exclusive modes. The fallback preview differs from the canonical parser, including headings and music/media directives. Local draft recovery is used for new items but bypassed when loading an existing item for editing.

These are improvement targets, not authorization to change gbfm or its production data.
