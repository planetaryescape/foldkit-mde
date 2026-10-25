# Product overview

Status: accepted product direction with host-selected formatting, ATX headings and local saving. Inspected on 2026-10-25. See [the architecture](architecture.html) for package boundaries and [decisions](02-decision-log.md) for constraints. The architecture visual predates headings and the UI improvement drive; current editing behavior and JSON version 4 are described in [package usage](../../README.md#settled-design-direction).

## Goal and audience

Build a small Markdown editor application/library with Foldkit and Effect. The playground is the place to judge the editing experience before expanding contracts. gbfm is the intended first consumer, but this repository has not integrated with or changed it.

Users should move between editable Visual mode and raw Markdown without maintaining two documents. Formatting and representation capabilities should have small testable contracts. Local saving and recovery should be packaged editor behavior, not a reducer every consumer must rebuild.

## Implemented behavior

- Markdown source is authoritative. Visual paragraphs, ATX headings, bold, asterisk italic, attribute-free underline, double-tilde strikethrough and plain-label links are a derived editable view, with unsupported syntax preserved rather than silently rewritten.
- One continuous Visual editing host shares transactions and undo/redo with raw mode.
- Formatting and representation contracts belong to core. Inline mark/link/heading implementations belong to plugins; the host selects Button/Input tools and the editor routes accepted transactions to core. Markdown and versioned JSON are representations, not separate stores. JSON version 4 records all four inline marks and distinguishes Heading nodes by level.
- Protected source cards are focusable groups. Enter/F2 opens their source; arrows move between cards and text; Delete/Backspace uses shared history and undo restores the block's keyboard focus.
- Opt-in local persistence provides loading, autosave, retry, flush, conflicts, and previous-checkpoint preview/export through an Effect service. The playground selects native IndexedDB.
- Reload restores committed source with fresh session history, caret, and Visual mode. Saved locally means transaction completion, not backup or a guarantee against browser clearing.

Inspect [package exports](../../README.md#bun-workspaces) and [consumer composition](../../README.md#local-saving-package-usage) before using the library. Packages are private workspace source exports, not published packages.

## Accepted boundaries and non-goals

Keep the pure core independent of Foldkit and browser APIs. Foldkit owns the event loop; Effect owns typed asynchronous work and resource lifetimes. Use Bun workspaces and the existing exact compatible dependency pins.

Do not add a general plugin registry, another editor runtime, SQLite, an action journal, durable undo, automatic conflict merging, or infrastructure without a concrete requirement and design decision. Backend saving and publishing are host concerns. Browser-local checkpoints are not an independent backup.

## Gaps and next decisions

Visual mode is not full CommonMark/GFM. Dynamic formatting registration, HTML rendering, and custom-component plugins are not implemented. Multiple editor surfaces, document switching, and JSON import/editing need separate contracts. Real operating-system IME behavior remains a manual verification gap.

The [implementation plan](../implementation-plan.md) records selection of the next useful slice, not approval for every possible capability.
