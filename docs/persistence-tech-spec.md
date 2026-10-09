# Editor-owned local saving and recovery: typed architecture handoff

Status: design handoff retained for rationale. The first native IndexedDB slice is now implemented following separate owner authorization. The contracts and code blocks below remain the original proposal, not compiled API documentation. See [current package usage](../README.md#local-saving-package-usage) and [the implemented file map](architecture.html#persistence).

## Summary

Add an opt-in editor integration that owns primary local document saving, draft recovery, autosave, and typed content output through an Effect `DocumentStore`, native IndexedDB, and a pure autosave lifecycle. Persist versioned Markdown checkpoints, not editor actions or the entire Model. Foldkit remains the only editor event loop and executes Effects through the host runtime. The host configures and mounts the integration; it does not implement the save lifecycle or format conversion.

This spec turns [the source-grounded design](persistence-design.md) into contracts and execution paths. APIs, schemas, exports, files, and code below were **proposed** during design. Code blocks are TypeScript architecture pseudocode, not compiled implementations. The implementation uses a unique session ID for correlation, version-1 latest/previous envelopes, explicit host timing/size policy, and the existing representation contract for typed output. Recovery is read-only preview/export; document switching and recovery-as-new are not implemented.

Confirmed ownership: local storage is both the primary local saved copy and draft recovery, owned by the editor integration. Backend saving and publishing remain host concerns. Working assumptions for this first slice: one mounted editor, asynchronous autosave, source-only recovery, reset undo/caret/mode on restart, and conflict refusal rather than automatic overwrite. Loss tolerance and identity configuration remain owner decisions. Browser-local primary storage is not guaranteed retention or backup.

This supersedes the earlier host-assembled, draft-only proposal. AGENTS.md and the architecture page now distinguish host-owned external destination policy/runtime composition from editor-owned local saving mechanisms and UX.

## Context / Current State

- [`core/editor.ts`](../packages/core/src/editor.ts): authoritative source and pure exhaustive `update`; past/future are session snapshots.
- [`editor/surface.ts`](../packages/editor/src/surface.ts): DOM input Messages, composition suppression, mount cleanup, and `Synchronize` Command.
- [`editor/document.ts`](../packages/editor/src/document.ts): visual DOM projection/readback and split transactions. Not a persistence writer.
- [`editor/view.ts`](../packages/editor/src/view.ts): unbranded child view, fixed surface ID, no public parent-message boundary.
- [`playground/main.ts`](../apps/playground/src/main.ts): runtime composition and update wrapper; no storage.

Foldkit 0.167.0 DevTools has bounded in-memory Messages and sparse Model keyframes. Replay returns `update.model` without executing Commands. HMR preservation is Vite process-memory support. Neither provides a durable journal. The current Bun host does not enable default Vite recording. Exact source citations and inspection limits are in the design document.

## Goals

1. Recover the last committed exact Markdown source, including empty source and unsupported syntax.
2. Let consumers select storage through Layers without changing pure editor behavior.
3. Never let stale writes, receipts, timers, startup results, or another tab silently replace newer work.
4. Expose honest local-save status, retry, and flush without breaking editing or history.
5. Prove adapter semantics through the service interface and a real browser runtime.
6. Package lifecycle, status/recovery controls, and content projection so consumers do not reimplement them.
7. Retain the preceding committed checkpoint and offer explicit recovery if the latest checkpoint is corrupt.

## Non-Goals

Server saving, automatic backup, publishing, collaboration, automatic merging, durable undo, action journaling, SQLite, dynamic plugin registration, multiple editor surfaces, and infrastructure. Arbitrary format conversion is not promised: Markdown and existing JSON ship first; HTML requires a separately specified safe renderer. Document catalog/search and destructive deletion are deferred, not hidden host responsibilities. No gbfm changes, production writes, publishing, deployments, dependency upgrades, or commits form part of this design task.

## Invariants

| Invariant                                                                                                      | Owner                                |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Core `update` is the only editor document writer. Persistence observes accepted source differences.            | Core and packaged editor integration |
| Latest and preceding checkpoints per key; compare, revision allocation, rotation and write commit atomically.  | DocumentStore adapter                |
| At most one save in flight per session. Pending source changes coalesce; no per-edit write queue.              | Autosave lifecycle                   |
| Saved means the current local revision has a confirmed storage commit.                                         | Autosave lifecycle                   |
| Unknown commit is not an aborted write. Retry retains the original request/write ID.                           | Adapter and lifecycle                |
| Every completion matches key, session epoch, write ID and captured local revision before changing status.      | Integration/lifecycle                |
| Loading failure never becomes Missing or an automatically writable seed.                                       | Startup boundary                     |
| Source and causes never enter new Command args, error DTOs, logs, or span attributes.                          | Integration/adapter                  |
| Mode/selection changes and save status do not create editor history entries.                                   | Packaged editor integration          |
| Content output captures one accepted local revision; projection never silently implies local or remote saving. | Editor output boundary               |

## Design Constraints

Retain Effect 4.0.0, Foldkit 0.167.0, Bun workspaces and Bun tests. Use Schema for external decoding and exhaustive Match for pure transitions. No unsafe casts, new actor runtime, hidden globals, or private Effect runtime in packages.

Expected database opening failures must occur in service operations, not resource Layer construction. Foldkit builds `resources` once and caches failure, which could otherwise crash unrelated Commands.

Browser storage is origin-scoped and can fail or disappear. Strict transaction durability is a browser hint, distinct from persistent-storage permission and backup. Size/timing limits must be supplied and measured, not advertised as proven defaults.

## Alternatives Considered

### Option 1: Host-only storage commands

```ts
loadDraft(key): Effect.Effect<Option.Option<string>, LoadError>
saveDraft(key, source): Effect.Effect<void, SaveError>
```

Call stack: parent update → host Command → IndexedDB → completion Message. Lowest package burden, but the shown interface lacks revision guards and receipts. Adding them plus autosave policy in each consumer duplicates the difficult invariants. A real IndexedDB test is still required. Suitable for a one-off host, not the requested reusable data layer.

### Option 2: DocumentStore and pure autosave policy

```ts
load(key): Effect.Effect<Option.Option<SavedDocument>, LoadError>
save(request): Effect.Effect<SaveReceipt, SaveError>
transition(state, event, currentSource): Transition
```

Call stack: parent update → pure intent → Foldkit Command → DocumentStore → native adapter → typed receipt → parent Message. Schema parses at storage/startup boundaries. Memory and IndexedDB implement the same CAS/retry contract. Shared lifecycle owns sequencing without taking ownership of editor source. Adds a small package and integration subpath, but concentrates the risky behavior.

### Option 3: Accepted-change journal plus checkpoints

```ts
append(change: AcceptedChange): Effect.Effect<AppendReceipt, JournalError>
recover(key): Effect.Effect<RecoveredSource, RecoveryError>

type AcceptedChange = Readonly<{
  key: DocumentKey
  writeId: WriteId
  baseRevision: Revision
  replacement: SourceReplacement
}>
```

Call stack: core accepted outcome → normalized versioned change → atomic append/checkpoint → bounded replay on recovery. Requires a new accepted-change boundary for raw input, visual input, formatting, undo and redo. Recovery must not execute plugins or external effects. Shared adapter tests must prove append ordering, retries, replay and compaction. Worth its cost for durable history/audit/sync, not just local draft recovery. Persisting raw Foldkit Messages is weaker: requests include declined actions and depend on reducer/history versions.

## Recommendation

Choose Option 2 with editor-owned composition, not a host-written wrapper. It hides database mechanics and shared save policy while preserving one editor state owner. Retain two bounded checkpoints, not a journal. Ship no SQLite adapter. Reconsider a journal or SQLite only against a concrete consumer requirement or measured workload.

## Proposed Design

```diagram
┌───────────────────────────────────────┐
│ Packaged editor Model + save session  │
│ Editor update: core update → diff     │
└───────────────────┬───────────────────┘
                    ▼
┌───────────────────────────────────────┐
│ Pure autosave transition              │
│ Next save state + timer/save intents  │
└───────────────────┬───────────────────┘
                    ▼
┌───────────────────────────────────────┐
│ Foldkit integration Commands          │
│ Expected errors → completion Messages │
└───────────────────┬───────────────────┘
                    ▼
┌───────────────────────────────────────┐
│ DocumentStore: load / compare-and-save │
│ Configured Layer: IndexedDB/memory    │
└───────────────────┬───────────────────┘
                    │ receipt/error → editor Message
                    └─────────────────────────────▶
```

## Domain Model and Types

Each constrained primitive below has an owning Schema and schema-inferred type. No caller constructs a brand with a cast. Validate relationships, not just individual fields.

| Proposed schema/type                          | Constraint                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| `DocumentKey`                                 | Nonempty `namespace` and `documentId`; compound storage key; no source content |
| `SessionId`, `WriteId`, `FlushId`             | Nonempty distinct branded identifiers; no clock-based ordering                 |
| `Revision`                                    | Positive safe integer, storage-assigned                                        |
| `LocalRevision`, `SessionEpoch`, `Generation` | Nonnegative safe integers; reject overflow                                     |
| `AutosavePolicy`                              | Positive quiet/max-wait milliseconds, max-wait ≥ quiet; no implicit default    |
| `SourceLimit`                                 | Positive maximum UTF-8 source bytes, supplied by host                          |

```ts
type SavedDocument = Readonly<{
  key: DocumentKey
  source: string
  revision: Revision
  lastWriteId: WriteId
}>

type SaveRequest = Readonly<{
  key: DocumentKey
  source: string
  expectedRevision: Option.Option<Revision>
  writeId: WriteId
}>

type SaveReceipt = Readonly<{
  key: DocumentKey
  revision: Revision
  writeId: WriteId
}>

type PersistedDocumentV1 = Readonly<{
  formatVersion: 1
  namespace: string
  documentId: string
  source: string
  revision: number
  lastWriteId: string
}>

type PersistedEntryV1 = Readonly<{
  formatVersion: 1
  latest: PersistedDocumentV1
  previous: PersistedDocumentV1 | null
}>
```

`SavedDocument` is the service value. `PersistedEntryV1` is the stored envelope; its checkpoints are structured-clone DTOs, not the full core Model or JSON representation output. On first create previous is null. A new successful save rotates validated latest into previous; an idempotent retry does not rotate. Bound reads to this envelope and cap each source separately. Projection belongs to storage. `Option` is a service concept, not stored as a class-shaped value.

Decode the envelope version and latest independently from previous. A malformed previous checkpoint must not block loading valid latest; a new save replaces it with validated latest. Recovery rejects invalid previous or a mismatched key. If latest is valid, previous must have a strictly smaller revision. This is structural corruption recovery, not a guarantee to detect valid-shaped but altered text.

### Save lifecycle

```ts
type Pending =
  | { readonly _tag: 'None' }
  | { readonly _tag: 'Waiting'; readonly generation: Generation }
  | { readonly _tag: 'Due' }

type Flight = Readonly<{
  request: SaveRequest
  localRevision: LocalRevision
}>

type SavePhase =
  | { readonly _tag: 'Saved' }
  | { readonly _tag: 'Dirty'; readonly pending: Exclude<Pending, { _tag: 'None' }> }
  | { readonly _tag: 'Saving'; readonly flight: Flight; readonly pending: Pending }
  | { readonly _tag: 'Failed'; readonly flight: Flight; readonly failure: SaveFailure }
  | { readonly _tag: 'Conflict'; readonly flight: Flight; readonly actual: Option.Option<Revision> }

type SaveSession = Readonly<{
  key: DocumentKey
  sessionId: SessionId
  epoch: SessionEpoch
  localRevision: LocalRevision
  acknowledgedLocalRevision: Option.Option<LocalRevision>
  lastReceipt: Option.Option<SaveReceipt>
  headRevision: Option.Option<Revision>
  generation: Generation
  dirtyWindow: Option.Option<Generation>
  flush: Option.Option<FlushTarget>
  phase: SavePhase
}>

type FlushTarget = Readonly<{ id: FlushId; revision: LocalRevision }>
```

Loaded source starts at local revision 0, acknowledged 0, with the stored head and Saved. Its last receipt derives from the loaded key/revision/lastWriteId. Missing starts at local revision 0, no acknowledgment/receipt/head, Dirty; schedule a create-only save of the seed. Thus a seed is not falsely labeled saved. Constructors enforce that Saved has a matching acknowledgment/receipt and no dirty batch, and that an active Flight uses this session's key.

`Saving.pending` describes newer work, not a second source snapshot. The parent editor holds latest source. `Flight` captures one immutable older source solely to identify/retry a write. Failed retains that capture for uncertain-outcome reconciliation. Edits while Failed/Conflict remain in the core Model and advance local revision without automatic storage work.

`dirtyWindow` identifies the maximum-wait timer for a pending dirty batch. Quiet timers reset on edits; the batch maximum does not. A Due event during Saving marks pending Due rather than starting another save. Keep one timer per kind and cancel timers when no pending batch remains.

## Types, Interfaces, and APIs

### Storage service

```ts
export class DocumentStore extends Context.Service<
  DocumentStore,
  {
    readonly load: (key: DocumentKey) => Effect.Effect<Option.Option<SavedDocument>, LoadError>
    readonly save: (request: SaveRequest) => Effect.Effect<SaveReceipt, SaveError>
    readonly loadRecovery: (
      key: DocumentKey,
    ) => Effect.Effect<Option.Option<SavedDocument>, LoadError>
  }
>()('@foldkit-mde/persistence/DocumentStore') {}

type LoadError = InvalidStoredDocument | UnsupportedVersion | StorageUnavailable | StorageFailure
type SaveError =
  | InvalidSave
  | InvalidStoredDocument
  | UnsupportedVersion
  | Conflict
  | QuotaExceeded
  | StorageUnavailable
  | StorageFailure
```

Use Effect 4.0.0 `Schema.TaggedError` classes. `Conflict` includes expected/actual revision but not source. `InvalidSave` exposes a reason code, not rejected content. `StorageUnavailable` distinguishes unsupported, denied and blocked opening. `StorageFailure` distinguishes `Aborted` from `Unknown` commit outcome. `QuotaExceeded` is a confirmed failed write. Load errors have no save-outcome field.

Do not send arbitrary causes in Messages. The bridge projects errors into the following schema-backed DTOs. Store error classes may retain causes internally; these projections do not.

```ts
type ReadFailure =
  | {
      readonly _tag: 'InvalidStoredDocument'
      readonly reason: 'Shape' | 'KeyMismatch' | 'TooLarge'
    }
  | { readonly _tag: 'UnsupportedVersion'; readonly version: number }
  | { readonly _tag: 'StorageUnavailable'; readonly reason: 'Unsupported' | 'Denied' | 'Blocked' }
  | { readonly _tag: 'StorageFailure'; readonly operation: 'load' }

type LoadFailure = ReadFailure
type SaveFailure =
  | Exclude<ReadFailure, { _tag: 'StorageFailure' }>
  | {
      readonly _tag: 'InvalidSave'
      readonly reason: 'Shape' | 'TooLarge' | 'WriteIdReused' | 'RevisionOverflow'
    }
  | {
      readonly _tag: 'Conflict'
      readonly expected: Option.Option<Revision>
      readonly actual: Option.Option<Revision>
    }
  | { readonly _tag: 'QuotaExceeded' }
  | {
      readonly _tag: 'StorageFailure'
      readonly operation: 'save'
      readonly commitOutcome: 'Aborted' | 'Unknown'
    }
```

Invalid input, unreadable existing rows, unsupported versions, unavailable opening, and Conflict occur before any write. Only write failures need an uncertain commit outcome. No raw row, exception message, database handle or source appears in these projections.

`loadRecovery` independently validates the previous checkpoint, envelope version and matching key. It is read-only, never substitutes a previous source for a successful latest load, and never makes a corrupt key writable. Unknown envelope versions remain errors. Recovery UI offers preview/export or create under a new key; repairing the damaged original key is deferred. A recovered previous revision is not the current CAS head and must not be used as one.

### Adapter construction

```ts
// @foldkit-mde/persistence/indexed-db
type IndexedDbOptions = Readonly<{
  openFactory: () => IDBFactory | undefined
  databaseName: string
  sourceLimit: SourceLimit
}>
make(options): Effect.Effect<DocumentStore['Service'], never, Scope.Scope>
layer(options): Layer.Layer<DocumentStore>

// @foldkit-mde/persistence/memory
layer(options: { readonly sourceLimit: SourceLimit }): Layer.Layer<DocumentStore>
```

`make` acquires service lifetime, not a fallible database connection. Call `openFactory` only inside load/save and classify missing APIs or thrown access errors there. This keeps a restricted browser's `window.indexedDB` getter from failing before the host can show a typed error. The accessor is a native-adapter construction option, not an application service dependency bag. Both Layers implement the complete observable contract. Mutable connection/cache state stays inside the Layer scope. Concurrent lazy opens share one attempt; failure clears it for explicit retry. If interrupted opening later succeeds, close the late connection instead of leaking it. Handle `versionchange` by closing/invalidation. Opening blocked by another connection terminates as a visible expected outcome, not a permanently pending Flags Effect.

### Effect library fit, verified against 4.0.0

The owner supplied five candidate APIs. Read their current documentation and inspected the published 4.0.0 sources of effect, @effect/platform-browser and @effect/opentelemetry; each tarball SHA-1 matched registry metadata. Documentation pages can track later releases, so the following implementation details refer to the pinned package sources, not an assumed latest version.

| Candidate                                                                              | Fit and decision                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [KeyValueStore](https://effect.website/docs/v4/api/effect/persistence/KeyValueStore)   | Useful for preferences/simple keyed values, not the document contract. Its default modify is get then set; toSchemaStore.modify also performs separate read/decode/write. Neither provides our cross-tab atomic CAS, revision receipts or checkpoint rotation. A custom atomic implementation is possible, but putting DocumentStore over generic get/set would lose the guarantee rather than remove complexity. Do not use it for primary documents.    |
| [PersistedCache](https://effect.website/docs/v4/api/effect/persistence/PersistedCache) | Caches lookup Exit values with memory/persistent TTL. Appropriate for recomputable expensive results, not irreplaceable source documents or autosave. It is not our system of record.                                                                                                                                                                                                                                                                     |
| [Activity](https://effect.website/docs/v4/api/effect/workflow/Activity)                | Named schema-backed workflow effects require WorkflowEngine and WorkflowInstance. Completed results can be replayed; side effects still need idempotency. No workflow engine is needed for a local editor checkpoint. Defer until a real durable publish/upload workflow exists.                                                                                                                                                                          |
| [IndexedDb](https://effect.website/docs/v4/api/platform-browser/IndexedDb)             | Closest platform fit, but this module alone only supplies IDBFactory/IDBKeyRange. Its sibling IndexedDbDatabase/Table/QueryBuilder modules supply schema-backed tables and shared transactions. QueryBuilder.withTransaction accepts strict durability, shares the transaction, waits for complete/abort on success, and suppresses scheduler yields between queries. It is a plausible adapter foundation, not a substitute for DocumentStore semantics. |
| [WebSdk](https://effect.website/docs/v4/api/opentelemetry/WebSdk)                      | Browser telemetry setup, not storage or recovery. Requires OpenTelemetry peer packages and explicit processors/readers. Do not add it for saving; existing Effect spans are enough until an observability requirement exists. Never export source payloads through telemetry.                                                                                                                                                                             |

**Recommendation under the current dependency constraint:** retain DocumentStore with the small native IndexedDB adapter. If one additional direct runtime package is approved, evaluate @effect/platform-browser **4.0.0** as the adapter implementation before writing equivalent generic database plumbing. It has no declared dependencies and peers on effect ^4.0.0, but it is still another direct dependency, not already included in effect. No package is added or upgraded by this design revision.

Do not blindly install its Layers as Foldkit resources: the pinned IndexedDb.layerWindow dies when APIs are unavailable, and database Layer construction opens the connection. Adapt setup into lazy service operations with typed unavailable/open errors, retaining our retry, scoped cleanup and unknown-outcome rules. Verify read/check/rotate/write in one withTransaction, request-success-then-abort, cancellation and two-tab conflicts through real browser tests before choosing that implementation. Its presence is a reason to evaluate reuse, not proof that it satisfies the complete document contract unchanged.

### Pure policy and Foldkit bridge

```ts
// @foldkit-mde/persistence/autosave
type Correlation = Readonly<{ key: DocumentKey; epoch: SessionEpoch }>
type SaveEvent =
  | { readonly _tag: 'SourceChanged' }
  | { readonly _tag: 'QuietDue'; readonly correlation: Correlation; readonly generation: Generation }
  | { readonly _tag: 'MaximumDue'; readonly correlation: Correlation; readonly window: Generation }
  | { readonly _tag: 'Committed'; readonly correlation: Correlation; readonly localRevision: LocalRevision; readonly receipt: SaveReceipt }
  | { readonly _tag: 'Failed'; readonly correlation: Correlation; readonly localRevision: LocalRevision; readonly writeId: WriteId; readonly failure: SaveFailure }
  | { readonly _tag: 'TimersCancelled'; readonly correlation: Correlation }
  | { readonly _tag: 'Retry' }
  | { readonly _tag: 'Flush'; readonly id: FlushId }

type Intent =
  | { readonly _tag: 'ScheduleQuiet'; readonly correlation: Correlation; readonly generation: Generation }
  | { readonly _tag: 'ScheduleMaximum'; readonly correlation: Correlation; readonly window: Generation }
  | { readonly _tag: 'CancelTimers'; readonly correlation: Correlation }
  | { readonly _tag: 'Save'; readonly correlation: Correlation; readonly flight: Flight }

type FlushResult =
  | { readonly _tag: 'Flushed'; readonly id: FlushId; readonly receipt: SaveReceipt }
  | { readonly _tag: 'FlushFailed'; readonly id: FlushId; readonly failure: SaveFailure }
  | { readonly _tag: 'FlushBusy'; readonly id: FlushId }

type Transition = Readonly<{
  state: SaveSession
  intents: ReadonlyArray<Intent>
  outputs: ReadonlyArray<FlushResult>
}>

startSession(start: LoadedOrMissing, identity: SessionIdentity): Transition
transition(state: SaveSession, event: SaveEvent, currentSource: string): Transition

// @foldkit-mde/editor/persistence
loadStartup(input: StartupInput): Effect.Effect<Startup, never, DocumentStore>
commands(intents: ReadonlyArray<Intent>, policy: AutosavePolicy):
  ReadonlyArray<Command.Command<SaveEvent, never, DocumentStore>>
```

`SessionIdentity` is `{ sessionId, epoch }`; `LoadedOrMissing` is `{ _tag: 'Loaded', document } | { _tag: 'Missing', key }`. `StartupInput` carries parsed key, seed source and host policy. `Startup` is a schema union `Loaded { document, sessionId } | Missing { key, seedSource, sessionId } | LoadFailed { key, failure }`. The startup Effect generates session identity through browser crypto; update derives write IDs deterministically from session ID/local revision. The core reducer never reads time/randomness.

Flush targets the local revision when requested. Complete it when a matching commit advances acknowledgedLocalRevision to at least that target, even if later edits leave the session dirty. Never compare a storage revision to a local revision. Retain the last receipt required to report an already-saved flush. One flush target may be active; reject a second as FlushBusy rather than silently losing a waiter. Controlled unmount disables new edits, requests flush, waits for Flushed, then disposes. On failure, keep the editor mounted or require explicit discard/export.

## Seams, Boundaries, Adapters, and Implementations

### Atomic compare-and-save

```text
request -> Schema parse + UTF-8 source limit check
        -> short IndexedDB readwrite transaction on documents
        -> get compound key -> decode unknown row/version
        -> same write ID + same source/key + expected successor revision?
             yes: replay existing receipt after transaction completes
        -> otherwise current revision equals expectedRevision?
             no: Conflict, no mutation
        -> rotate latest to previous, encode successor as latest -> put envelope
        -> transaction complete -> SaveReceipt
```

None expected revision means create only when absent, successor 1. Matching an existing write ID with changed content is InvalidSave. If another writer has replaced the row, a retry conflicts; do not claim an unbounded deduplication ledger. Check revision overflow before mutation.

Storage reads one keyed row, never scans history. Decode the envelope version before its body; reject future formats without overwriting. Schema decoding inside an active IDB request callback must be synchronous for format 1. Do not await unrelated Effects/network work inside the transaction. A request success is not transaction completion.

Request strict durability for checkpoints where supported; report only confirmed local commits and make fallback semantics explicit. An IDB abort confirms no mutation. An interrupted/closed operation that cannot establish commit status is Unknown. Reconcile by retrying the captured request, never by issuing an unconditional write.

Database version 1 creates `documents` with compound key `[namespace, documentId]`. Record format version 1 remains separate. No legacy migration is required. Previous-checkpoint retention is part of version 1, not a migration or an append-only history.

### Consumer boundary and usage

```ts
// @foldkit-mde/editor/persistence: packaged Schema-inferred state/messages.
type RecoveryState =
  | { readonly _tag: 'NotRequested' }
  | { readonly _tag: 'Loading'; readonly attempt: Generation }
  | { readonly _tag: 'Available'; readonly document: SavedDocument }
  | { readonly _tag: 'Missing' }
  | { readonly _tag: 'Failed'; readonly failure: LoadFailure }
type RetentionStatus = 'Unknown' | 'Persistent' | 'BestEffort' | 'Unavailable'

type PersistentModel =
  | { readonly _tag: 'LoadFailed'; readonly key: DocumentKey; readonly attempt: Generation; readonly failure: LoadFailure; readonly recovery: RecoveryState }
  | { readonly _tag: 'Editing'; readonly editor: Editor.Model; readonly saving: SaveSession; readonly retention: RetentionStatus }

type PersistentMessage =
  | { readonly _tag: 'Editor'; readonly message: Editor.Message }
  | { readonly _tag: 'Persistence'; readonly message: SaveEvent }
  | { readonly _tag: 'FlushCompleted'; readonly result: FlushResult }
  | { readonly _tag: 'RetryLoad' }
  | { readonly _tag: 'Loaded'; readonly key: DocumentKey; readonly attempt: Generation; readonly startup: Startup }
  | { readonly _tag: 'RequestRecovery' }
  | { readonly _tag: 'RecoveryLoaded'; readonly key: DocumentKey; readonly attempt: Generation; readonly result: RecoveryResult }
  | { readonly _tag: 'RequestRetention' }
  | { readonly _tag: 'RetentionChecked'; readonly correlation: Correlation; readonly status: RetentionStatus }

type RecoveryResult =
  | { readonly _tag: 'Available'; readonly document: SavedDocument }
  | { readonly _tag: 'Missing' }
  | { readonly _tag: 'Failed'; readonly failure: LoadFailure }

// Proposed exports. Consumers supply values, not update implementations.
makeIntegration(options: {
  readonly key: DocumentKey
  readonly seedSource: string
  readonly policy: AutosavePolicy
}): {
  readonly Model: typeof PersistentModelSchema
  readonly Startup: typeof StartupSchema
  readonly flags: Effect.Effect<Startup, never, DocumentStore>
  readonly init: (startup: Startup) => PersistentTransition
  readonly update: (model: PersistentModel, message: PersistentMessage) => PersistentTransition
  readonly view: PersistentView
}

type PersistentTransition = Readonly<{
  model: PersistentModel
  commands: ReadonlyArray<Command.Command<PersistentMessage, never, DocumentStore>>
}>
// PersistentView is a defineView-branded Foldkit child view.

// Standalone consumer. All Persistence exports below are proposed.
import * as Persistence from '@foldkit-mde/editor/persistence'
import * as IndexedDb from '@foldkit-mde/persistence/indexed-db'
import { Runtime } from 'foldkit'

const editor = Persistence.makeIntegration({ key, seedSource, policy })
const app = Runtime.makeApplication({
  Model: editor.Model,
  Flags: editor.Startup,
  resources: IndexedDb.layer({
    openFactory: () => window.indexedDB,
    databaseName: 'consumer-documents',
    sourceLimit: hostSourceLimit,
  }),
  init: editor.init,
  update: editor.update,
  view: (model, h) => ({ title: 'My editor', body: editor.view(model, h) }),
  container: document.getElementById('root'),
})
Runtime.run(app, { flags: editor.flags })
```

The consumer provides namespace/document ID and retains them across reloads. Namespace partitioning is not authentication; same-origin scripts can access storage. Keep a single mounted editor in this slice, with its existing fixed DOM ID. Do not add document identity to core just to work around that DOM constraint.

Change the exported core editor view to a `defineView<Editor.Model, Editor.Message>`-branded child view. The packaged persistent view wraps it, owns save status and Retry/Save/recovery controls, and routes child Messages internally. Internally map Synchronize and storage results with `Command.mapMessage`. For embedding, a host nests the persistent Model and uses `h.submodel` with `editor.view`, delegates its child branch to `editor.update`, and maps returned Commands. That is routing, not reimplementing autosave. Flush completion is an explicit output Message the host may use to navigate/dispose; no reducer publishes or disposes. Storage stays unaware of Foldkit wrapping.

The packaged integration supplies local-save UI and safe error summaries, with optional consumer styling. The nonpersistent entry remains usable. Consumers may override the storage Layer with identical guarantees and configure identity/timing/limits. No package imports apps or sibling source paths. New persistence code enters through explicit package subpaths. Selecting a Layer at the composition root does not transfer lifecycle ownership to the host.

### Typed content output, proposed

```ts
import type { Representation } from '@foldkit-mde/core/plugins'

type ContentOutput<Output> = Readonly<{
  key: DocumentKey
  localRevision: LocalRevision
  representationId: string
  content: Output
}>

// @foldkit-mde/editor/persistence, synchronous pure projection
project<Output>(model: PersistentModel, representation: Representation<Output>):
  Option.Option<ContentOutput<Output>>

// @foldkit-mde/plugins/markdown, proposed identity representation
markdown: Representation<string>

// Existing @foldkit-mde/plugins/json: Representation<JsonDocument>
const output = Persistence.project(model, json)
// Markdown: Persistence.project(model, markdown)
```

Return None before an editor source is available. Otherwise capture current accepted source and local revision once, then project that source through the typed representation. The host receives string Markdown or JsonDocument directly, not an untyped format switch. Projection can include unsaved edits and never marks them saved. A plain flush followed by a later projection is not a frozen snapshot; this API promises current accepted content, not a committed-only export. Backend success/failure is separate from local-save status. A host external-save action calls this packaged projection rather than recreating conversion. Recovery preview/export projects the independently validated SavedDocument source directly, without treating it as an Editing session or Saved status.

Ship exact Markdown and the existing JSON representation first. The same generic boundary accepts an eventual HTML representation without changing storage or core. HTML is not currently implemented and must define escaping, unsupported syntax and trusted-HTML policy before being advertised. No automatic per-keystroke projection or network export is required. Representation code is pure; I/O still runs through the host runtime.

### Browser retention status, proposed

The integration offers an explicit keep-on-device action through a browser Command. It calls native `navigator.storage.persisted()` / `persist()` when available and exposes `Unknown | Persistent | BestEffort | Unavailable` separately from save status. Do not request permission inside the DocumentStore Layer or reducer. A denied/unsupported request does not prevent saving and must not imply guaranteed retention. Show a browser-storage warning and content export option even when permission is granted. A retained previous checkpoint shares the same origin and is not an independent backup.

RequestRetention → browser Command → safe RetentionChecked Message; catch denied/missing API as BestEffort/Unavailable, correlate by session and ignore stale completions. RequestRecovery in LoadFailed → DocumentStore.loadRecovery → RecoveryLoaded; correlate key/attempt, ignore completions after retry/switch, and never dispatch a core edit to hydrate a failed key. These Messages carry no raw exceptions. Controls export validated source or ask the consumer for a new stable key to create; application routing still belongs to the host.

## Call Stacks and Data Flow

### Current / Old Flow

```text
DOM input -> Observe -> core Message -> host update -> core update
         -> core Model + optional Synchronize -> DOM projection
```

### Proposed / New Flow

```text
startup: host key -> loadStartup Effect -> DocumentStore.load
        -> IDB unknown row -> schema/version decode -> Startup
        -> Flags -> packaged init -> fresh core init + save session

edit: DOM/core Message -> packaged Editor branch -> core update
     -> source differs? -> transition(SourceChanged)
     -> next persistent Model + mapped Synchronize + timer intents

due: timer Message -> correlation/generation check -> capture current source
    -> Saving + Save intent -> Command Effect -> DocumentStore.save
    -> atomic IDB commit -> receipt -> Persistence.Committed
    -> exact-flight match -> acknowledged revision/head advance
    -> Saved OR latest-source save/timer depending on pending work
```

A receipt never changes editor source, selection, mode or history. Timer Commands use policy supplied by the host, so no clocks enter the pure transition. Timers are interruptible, keyed by session and timer kind, not by ever-changing generation; starting a replacement explicitly interrupts the preceding waiter. Map interrupt completion to TimersCancelled, a no-op acknowledgment handled exhaustively. Validate stale results even after cancellation.

### Failure Flow

```text
load denied/corrupt/future -> Startup.LoadFailed -> packaged error UI
                         -> RetryLoad command -> Loaded Message
                         -> never auto-save seed to unresolved key

save quota/aborted/unavailable -> typed failure -> Failed, source stays editable
save conflict -> Conflict -> stop automatic writes, keep local source
defect -> normal Foldkit crash path, never translate it to Saved or Missing
```

RetryLoad captures the requested key and a load-attempt generation in the integration's LoadFailed state; ignore results for older attempts or a moved key. Accept Loaded only in the matching startup/retry state, never over an Editing Model. Successful loading uses core `init`, not an editing Message that would add history. UI offers explicit export/new key rather than normalizing corrupt records or overwriting them.

### Retry / Cancellation / Idempotency Flow

```text
Retry with Unknown outcome -> same Flight.request and write ID
      -> existing matching record: same receipt, no revision increment
      -> another writer advanced: Conflict, no overwrite
      -> success: acknowledge captured revision, then save latest edits

Retry with confirmed no-write outcome -> latest source if edits arrived
      -> new local-revision write ID, unchanged expected head, normal CAS
      -> otherwise retry the original immutable request

Flush -> capture target revision -> bypass pending timer -> serialize with Flight
      -> acknowledged local revision >= target -> Flushed output
      -> host completion Message
```

Cancel waiting timers on clean state/session exit. Do not replace a save fiber as a debounce technique. During teardown, abort an active IDB transaction if possible and preserve Unknown when the outcome cannot be established. An orphaned old receipt cannot alter a new session. Page termination has no reliable async flush guarantee; hidden-page flush is best effort.

This refines the initial design's always-retry-old-request rule: a confirmed aborted or not-started write may be replaced on explicit Retry. Otherwise an oversized old snapshot could prevent saving a now-small valid document forever. Unknown outcomes still require exact-request reconciliation. Conflict is not a retryable no-write outcome against a newly adopted head; it requires an explicit user resolution outside this slice.

### Observability Flow

```text
operation -> named span + safe operation/revision/write token
expected error -> tagged safe summary -> SaveFailure Message -> editor status
```

Save Command metadata excludes source/key values that might contain private labels. Source stays inside its Effect closure. No new exporter or telemetry dependency. Current Synchronize/mount args and DevTools Models can expose source; do not claim this work redacts existing editor debugging. Production hosts should leave inspection disabled unless they explicitly accept its data exposure.

### History, recovery, and retention

Undo/redo source changes autosave like other accepted edits; selections/mode/no-op actions do not. Persistence does not change grouping or force DOM reads during composition. Composition not yet accepted by core cannot be recovered.

Restart reads latest and resets history/caret/mode. If latest is corrupt, the integration calls loadRecovery and offers the validated previous source for preview/export or create under a new key. Do not automatically label it Saved or overwrite the damaged key. Both corrupt and unknown-version envelopes remain protected. Storage retains at most two source checkpoints per key; key count is not automatically bounded. Handle quota with visible failure/export, never automatic document deletion. Persistent-storage permission is an explicit integration action, not a service side effect.

Opening an existing key loads it before editing. Creating a key uses create-only CAS and saves the seed, including empty source. Switching/unmounting requires confirmed flush or explicit discard; save-as uses a new key and never overwrites an unresolved one. For recovery/save-as, project exact Markdown from the retained source, create a new integration session under the requested key, and await its create receipt before abandoning the old session. A general catalog or delete API is deferred. Deletion needs stale-session/tombstone semantics before it can safely coexist with autosave; primary storage does not justify an unguarded remove operation.

Vite HMR restoration skips init/Flags. Any future Vite consumer must reconcile restored `Saving`/`Saved` state through an explicit mount/subscription before writing; old fibers are not restored. This slice targets the existing Bun host and does not introduce Vite support.

## Files to Add / Change / Delete

| Proposed file                                       | Responsibility                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `packages/persistence/package.json`                 | Private Bun workspace; Effect dependency only; `./store`, `./autosave`, `./indexed-db`, `./memory` exports                          |
| `packages/persistence/src/store.ts`                 | Schemas, domain/service values, typed failures, version-1 projection/parser, DocumentStore                                          |
| `packages/persistence/src/indexed-db.ts`            | Native IDB translation, lifetime, atomic CAS, errors and Layer                                                                      |
| `packages/persistence/src/memory.ts`                | Complete scoped contract substitute                                                                                                 |
| `packages/persistence/src/autosave.ts`              | Pure lifecycle, correlation, intents and flush outputs                                                                              |
| `packages/persistence/src/store.test.ts`            | Shared adapter behavior suite and parsing laws                                                                                      |
| `packages/persistence/src/autosave.test.ts`         | Independent model/property tests for policy                                                                                         |
| `packages/editor/src/persistence.ts`                | Public integration Model/Message, init/update, startup, timer/save/recovery Commands, typed content projection and retention status |
| `packages/editor/src/persistence-view.ts`           | Persistent child view, local-save status, Retry/Save/recovery/retention controls                                                    |
| `packages/editor/src/persistence.test.ts`           | Public integration behavior with controlled service/time and typed projection                                                       |
| `packages/editor/src/view.ts`                       | Brand child view for parent composition; preserve rendered content                                                                  |
| `packages/editor/package.json`                      | Optional persistence export/dependency and Bun test script                                                                          |
| `packages/plugins/src/markdown.ts`                  | Exact-source identity representation                                                                                                |
| `packages/plugins/package.json`                     | Add explicit Markdown representation export; retain existing JSON export                                                            |
| `apps/playground/src/main.ts`                       | Configure packaged integration/Layer and stable key; runtime composition and example typed content output                           |
| `apps/playground/package.json`                      | Direct workspace dependencies for composition; browser persistence check                                                            |
| `apps/playground/test/persistence-browser-check.js` | Real native storage, two connections, reopen and editor flow                                                                        |
| `bun.lock`                                          | Refresh with repo-pinned Bun only when implementation is authorized; no upgrades                                                    |

No core transaction/history files, existing JSON implementation, anti-slop code or provider infrastructure need changes. No host-owned autosave module is added. No files deleted. Update architecture documentation and its saving-ownership guidance as proposed during implementation. DB schema creation belongs to the native adapter, not a cloud migration script.

## RGR TDD Test Plan

Use the existing `bun:test` + Effect + Schema-derived Arbitrary pattern. Do not add Vitest or a fake IndexedDB library. Repeat Red → minimum Green → refactor per row; do not write all tests before the behavior exists.

| Slice                   | Red behavior through public seam                                                                                                                                         | Minimum Green and check                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| 1. Storage tracer       | Missing lookup; create exact `\r\n`, multibyte and empty-source records, then load them                                                                                  | Schema + memory service through load/save; key isolation                                                  |
| 2. Guarded update       | Two writers read 1, submit different sources expecting 1; only one reaches 2                                                                                             | Atomic CAS contract; same-ID retry returns original receipt; changed-payload reuse fails                  |
| 3. Native path          | Run slices 1–2 against actual IndexedDB with two connections; reopen and reload                                                                                          | Native Layer, one store, scoped cleanup; abort after request success never emits receipt                  |
| 4. Accepted edit        | Raw/visual/format/undo/redo source changes schedule saving; selection/mode/no-op does not                                                                                | Packaged integration + pure lifecycle, preserve core history                                              |
| 5. Concurrency          | A saves; edit B then C; late A receipt cannot mark C Saved; next write contains C                                                                                        | One Flight + coalescing; generated model histories; plant stale-receipt defect                            |
| 6. Timers               | Quiet boundary and maximum wait; stale generation cannot save; edits during save keep maximum wait bounded                                                               | Foldkit timer bridge under controlled time; one waiter per timer kind                                     |
| 7. Failed/unknown       | Unknown A, edit C, reconcile A with same ID, then save C; confirmed oversized A failure allows explicit retry of smaller C; conflict does not retry against a newer head | Typed outcomes; outcome-sensitive request retention; no automatic quota/conflict retry                    |
| 8. Startup/recovery     | Loaded uses fresh history; Missing saves seed; denied/corrupt/future never writes seed                                                                                   | Startup Flags outcomes, RetryLoad, version/error decoding                                                 |
| 9. Flush/session        | Flush waits for target; concurrent request gets Busy; old epoch/key receipts do nothing                                                                                  | Explicit outputs and host mapping; unmount only after confirmed flush or explicit discard                 |
| 10. Browser consumer    | Edit protected syntax across raw/visual, save, reopen, compare exact source; two tabs conflict                                                                           | Real agent-browser check through host UI and service; IME end accepted, receipts do not refocus           |
| 11. Previous checkpoint | Save A then B then C: latest C, previous B; retry C does not rotate; aborted D changes neither                                                                           | Shared memory/native contract; corrupt latest permits explicit previous export, never automatic overwrite |
| 12. Content boundary    | JSON and Markdown reflect an unsaved edit at the same local revision; unavailable startup yields None                                                                    | Public project API, independently expected output, unchanged save status/history                          |
| 13. Primary-copy UX     | Missing seed is unsaved until commit; denied retention permission leaves saving usable; quota never deletes another document                                             | Packaged controls + real browser Saved/Failed/Recovery states; persistent permission is not backup        |

Use Deferred-controlled store implementations for command ordering, not spies. Generate valid schemas and action histories against an independent reference model. Seed corruption/unsupported versions through a test-only fixture at the storage boundary, not a production corruption API. Fail the test deliberately with last-write-wins or stale status once, then restore correctness.

After implementation, run `bun run precommit`, `bun run build`, existing editor browser checks, and the new persistence browser checks. Inspect affected Saved/Failed/Conflict UI states if visuals change. Real OS IME, power loss, eviction and deployed browser combinations remain separate evidence, not claims proven by synthetic events or memory tests.

## Risks and Open Questions

1. **Confirmed scope and remaining choices:** editor owns primary local saving plus draft recovery and content output. Acceptable uncommitted loss window and source-only restart versus persistent history/caret/mode still need review; primary-copy ownership is no longer an open question.
2. **Host configuration:** choose namespace/document ID retention, source byte cap, quiet period and maximum wait from the first consumer's workload. The earlier design's 500 ms/2 s numbers are experiments, not spec defaults.
3. **Runtime identity:** retain stable document identity separately from ephemeral session/DOM identity. The first slice stays single-surface.
4. **Privacy:** browser storage and debugging are not encrypted or access-controlled by namespace. Existing source-bearing debug paths remain visible to an explicitly enabled inspector.
5. **Durability:** previous checkpoints provide bounded corruption recovery, not protection from browser clearing/eviction or origin changes. Permission and explicit export reduce risk but are not automatic backup. Guaranteed sole-copy retention would require a separate backup/destination contract.
6. **Implementation validation:** contracts are proposed, not compiled. The current orb's Bun 1.3.10 cannot install the supplied Bun 1.4.0 lockfile. This is a design handoff, not a passing build or storage guarantee.

Design sources and rules: [persistence research](persistence-design.md), [local rat-stack adaptation](rat-stack-reference.md), Effect service-design and coding standards, and the TDD vertical-slice workflow. No new implementation or dependency change accompanies this spec.
