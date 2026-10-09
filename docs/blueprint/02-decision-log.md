# Decision log

Recorded on 2026-10-09 from owner direction and existing repository guidance. These IDs consolidate established choices; they do not invent new approvals. Preserve IDs and add a superseding record if a choice changes.

## D001: Foldkit event loop and our Schema + Match reducer

Status: accepted and implemented.

Chosen: keep state transitions pure with Effect Schema and exhaustive Match; use Foldkit for UI runtime and command execution.

Alternatives: Foldkit's experimental Machine, external Effect statechart libraries, or a separate actor loop.

Reason: the owner selected our reducer approach and wants to build the editor without another runtime dependency. Consequence: we own explicit lifecycle transitions and stale-result handling rather than obtaining statechart semantics from a library.

Revisit when: concrete hierarchical or parallel lifecycle requirements outweigh the added runtime and dependency cost, with owner approval.

References: [machine research](../research/effect-state-machines.md), [core reducer](../../packages/core/src/editor.ts).

## D002: Markdown source is the editing authority

Status: accepted and implemented.

Chosen: both editable surfaces use source-offset transactions and shared history. Parsing, the DOM, and JSON are derived views. Visual mode has one continuous editing host.

Alternatives: independent raw/visual documents, line-by-line editing hosts, or JSON as a second writable store.

Reason: mode switches must preserve source and edits. The owner rejected line-by-line Visual navigation. Consequence: DOM selection/readback is an adapter responsibility, and unsupported Markdown must remain protected.

Revisit when: a demonstrated editing requirement cannot fit the source-preserving model; any replacement must retain compatibility and conversion guarantees.

References: [architecture](architecture.html#state), [DOM adapter](../../packages/editor/src/document.ts).

## D003: Separate plugin responsibilities, not a universal context

Status: accepted direction; pure formatting and representation contracts implemented, general registration and custom components not implemented.

Chosen: formatting returns transactions; representations project source; future DOM contributions need explicit lifetimes. Core owns contracts and the host selects implementations.

Alternatives: a general registry/context exposing document mutation, DOM, storage, and provider services to every plugin.

Reason: the owner wants unit-testable formatting and extensible output. Consequence: JSON is output-only; HTML requires a safe rendering contract; directly wired bold does not establish a registered plugin engine.

Revisit when: a real second contributor needs dynamic registration or scoped resources that static composition cannot supply.

References: [core contracts](../../packages/core/src/plugins.ts), [plugin reference guide](../guides/plugin-system-references.md).

## D004: Editor-owned primary local saving and recovery

Status: owner-confirmed ownership; native IndexedDB first slice implemented.

Chosen: an Effect DocumentStore service, atomic latest/previous Markdown checkpoints, compare-and-save, and an editor-owned pure autosave lifecycle. Host composition supplies identity, policy, and a storage Layer. Backend publishing remains outside the editor.

Alternatives: host-written draft-only saving, Foldkit message journaling, browser SQLite, or a generic key/value store without atomic document semantics.

Reason: Foldkit's debugging history is in memory, not durable recovery. The owner confirmed both primary local saving and draft recovery. Consequence: there is an uncommitted loss window, fresh history on restart, explicit conflict/retry, and no guarantee against browser eviction. The playground's 500 ms quiet period, 2 s maximum wait, and 1 MiB cap are host choices, not owner-approved global durability promises.

Revisit when: audit/sync or accepted-change durability requires a journal, measured data access requires SQLite, or valuable sole-copy retention requires a separate backup contract.

References: [research](../research/persistence-design.md), [historical handoff](../handoffs/persistence-tech-spec.md), [implemented saving](architecture.html#persistence).

## D005: Bun workspaces and narrow runtime dependencies

Status: accepted and implemented for the current runtime.

Chosen: Bun workspace packages; Foldkit and Effect as direct external application dependencies. Keep tooling in workspaces and reference snapshots separate from runtime code. Alchemy is reserved for future infrastructure when needed.

Alternatives: a different monorepo manager, another WYSIWYG engine, or copying upstream application dependencies with their reference code.

Reason: the owner requested this stack and corrected the scaffold toward proper Bun workspaces. Consequence: use compatible exact pins, build required editor behavior locally, and keep infrastructure out of core.

Revisit when: a concrete requirement justifies a new dependency or infrastructure capability, with owner approval.

References: [workspace catalog](../../package.json), [engineering adaptation](../guides/rat-stack-reference.md).
