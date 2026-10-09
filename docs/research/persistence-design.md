# Data-layer design for Foldkit MDE

Status: research retained; first native IndexedDB slice implemented on 2026-10-09. Research date: 2026-10-08. Ownership revised 2026-10-09. See [current usage and limits](../../README.md#local-saving-package-usage) and [the architecture extension](../blueprint/architecture.html#persistence). Proposed contracts below are historical, not the public API.

Based on the supplied tracked-file snapshot of local `main` at `fe42ef0`, including architecture work in progress. That research snapshot had no Git repository or remote. Baseline statements and proposed files below describe that snapshot, not today's repository.

## Recommendation

Start with **editor-owned primary local saving and draft recovery, versioned Markdown snapshots, native IndexedDB, and an Effect `DocumentStore` service**. The opt-in editor integration packages loading, autosave, save/recovery controls and typed content output. Keep the lifecycle pure. Foldkit runs the resulting commands through its existing host runtime bridge. Consumers configure and route the integration rather than implement its save behavior.

Do not persist Foldkit messages or adopt event sourcing in the first slice. Foldkit offers useful in-memory debugging history, but not a durable action log or automatic crash recovery. SQLite and an accepted-change journal remain separate later choices.

The first slice stores the primary local document and recovers its last committed Markdown source after reopening. Retain latest and preceding checkpoints atomically for bounded corruption recovery. It does not promise every keystroke survives a crash, restore undo history, synchronize tabs, or save to a server. Browser-local saving is not publishing or backup.

## Confirmed ownership and revised handoff

The owner confirmed that storage serves **both primary local saving and draft recovery**. The revised [tech spec](../handoffs/persistence-tech-spec.md) records the implementation handoff and supersedes the initial proposal in sections 4–11 below wherever ownership, APIs, retention or scope differs. Those sections are retained as the original alternatives/research rationale, not the current contract.

- The packaged editor integration owns its Model/Message composition, autosave, load/retry/flush behavior and local-save/recovery UI. No consumer-written autosave module is required.
- The host supplies stable identity/configuration, chooses a Layer and runs/maps the integration through Foldkit. Backend saving/publishing remains host-owned. Selecting a Layer does not make the host responsible for storage behavior.
- The editor supplies typed content output through the existing Representation seam. Exact Markdown and existing JSON ship first. HTML fits that seam but requires a safe renderer and syntax policy before being advertised. Projection can include unsaved accepted source and does not mark anything saved.
- Store an envelope containing latest and preceding checkpoints. Rotate atomically on a new commit, not on retries. Add read-only `loadRecovery`; independently validate previous and offer preview/export or create under a new key. Never adopt it as the current CAS head or overwrite an unreadable original.
- Offer an explicit persistent-storage request and report its result separately from Saved locally. Browser clearing/eviction still requires a warning and export option. Two local checkpoints are not an independent backup.
- Keep create/open/switch/flush in the small first slice. Catalog/search and guarded deletion remain deferred editor capabilities, not obligations pushed onto the host. Deletion needs stale-session/tombstone semantics first.
- Unknown commit outcomes retry the original immutable request. Confirmed no-write failures may explicitly retry newer corrected source.

The implementation map in architecture.html preserves the original editing baseline and adds the implemented local-saving extension. AGENTS.md now separates packaged local saving from host-owned backend saving and publishing. The native adapter and pure lifecycle implement the first slice without a direct platform-browser dependency, action journal, SQLite, or document switching.

## 1. Existing authority and integration points

| File                                                                       | Verified behavior                                                                                                                                                | Design consequence                                                                                                              |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| [`packages/core/src/editor.ts`](../../packages/core/src/editor.ts)         | `Model.source` is authoritative. `update` owns source replacement and past/future snapshots. `Applied`, `UpdatedSource`, bold, undo, and redo share this writer. | Observe **accepted before/after source changes**, not particular input messages. Leave persistence and save status out of core. |
| [`packages/core/src/bold.ts`](../../packages/core/src/bold.ts)             | A transaction replaces a source-offset range and supplies the resulting selection. Some formatting requests produce no transaction.                              | A requested action is not proof of a document change.                                                                           |
| [`packages/editor/src/surface.ts`](../../packages/editor/src/surface.ts)   | `Observe` emits messages. It suppresses input during composition and emits at composition end. `Synchronize` renders from source through a Command.              | Save the reducer result, never independently serialize the DOM. Autosave does not synchronize or focus the surface.             |
| [`packages/editor/src/document.ts`](../../packages/editor/src/document.ts) | Visual reads preserve unchanged source and separators, while structural edits reconstruct changed regions. Paragraph split returns a transaction.                | A log of only explicit `Applied` transactions would miss ordinary visual and raw input.                                         |
| [`apps/playground/src/main.ts`](../../apps/playground/src/main.ts)         | The host wraps core `update`, returns synchronization commands, and starts one Foldkit application. No resources or persistence are provided.                    | This wrapper is the initial source-change observation point and composition root.                                               |
| [`packages/editor/src/view.ts`](../../packages/editor/src/view.ts)         | The surface has a fixed `mde-surface` ID. The exported view takes editor Messages directly.                                                                      | Durable document identity cannot be this DOM ID. Multiple instances need a separate surface identity change.                    |
| [`packages/plugins/src/json.ts`](../../packages/plugins/src/json.ts)       | JSON projects Markdown through a versioned representation contract.                                                                                              | JSON remains derived, export-only. Do not make it a second durable authority.                                                   |

During editing, the reducer owns current source. IndexedDB owns the **last committed checkpoint**, which may lag behind. Startup reads that checkpoint to initialize the editor. There are no independently writable Markdown and JSON stores.

## 2. What Foldkit 0.167.0 actually provides

Inspected the exact published package and upstream release tag `foldkit@0.167.0`, commit [`7407117`](https://github.com/foldkit/foldkit/commit/74071173b1253e9efeec050a31ca86df1931ce5a). The downloaded tarball matches registry SHA-1 `5b0cd3b9971d72242f4c61c3b1980c5d419396c0`. These facts describe this release, not upstream `main`.

| Facility                 | Exact behavior                                                                                                                                                                                                                                                                                                       | Is it durable recovery?                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| DevTools history         | Stores Message payloads, change metadata, command records, and mount lifecycle records in an in-memory `SubscriptionRef`. Keeps initial/latest Models and sparse keyframes. Default maximum is 100 entries, supported configuration 20–500; default keyframe interval is 31. Eviction drops whole keyframe segments. | No. It is bounded and lost when its runtime disappears.                   |
| Time travel              | Reconstructs a historical Model through `update`; discards Commands returned during reconstruction. Historical rendering does not replace live state. Live messages and Commands continue; resume displays the latest live Model.                                                                                    | No. It neither branches the live editor nor replays durable side effects. |
| Inspect mode             | Inspects historical state without replacing the live view.                                                                                                                                                                                                                                                           | No.                                                                       |
| Tracing                  | Runtime wraps each Command Effect in a span named for the command, with command args as attributes. The synchronous update path is not a per-message Effect span.                                                                                                                                                    | No durable sink or automatic per-message console log.                     |
| Development preservation | Vite HMR schema-encodes the latest Model, debounced by 200 ms, with a reload flush. The Vite plugin retains models in process memory. Successful restoration skips `init` and its Commands.                                                                                                                          | Useful during code reloads, not disk-backed production recovery.          |
| DevTools localStorage    | The overlay stores `isOpen` and `isFlattened` under `foldkit-devtools`.                                                                                                                                                                                                                                              | Does not store Message history or Models.                                 |
| Crash handling           | Logs the crash, optionally calls `crash.report`, stops accepting further dispatches, and offers reload in the default UI.                                                                                                                                                                                            | Does not restore a journal.                                               |
| Runtime resources        | `resources` supplies an Effect Layer shared by Flags, Commands, and Subscriptions. Runtime builds it once lazily, caches the result, and releases scoped resources at teardown.                                                                                                                                      | A service integration mechanism, not a store.                             |

Primary implementation references:

- [History store, entry structure, replay and eviction](https://github.com/foldkit/foldkit/blob/74071173b1253e9efeec050a31ca86df1931ce5a/packages/foldkit/src/devTools/store.ts#L134-L343).
- [Replay bridge returns only the Model](https://github.com/foldkit/foldkit/blob/74071173b1253e9efeec050a31ca86df1931ce5a/packages/foldkit/src/runtime/devToolsIntegration.ts#L196-L264).
- [Configuration defaults and clamps](https://github.com/foldkit/foldkit/blob/74071173b1253e9efeec050a31ca86df1931ce5a/packages/foldkit/src/runtime/devToolsConfig.ts#L92-L188).
- [Command execution, spans, and live update](https://github.com/foldkit/foldkit/blob/74071173b1253e9efeec050a31ca86df1931ce5a/packages/foldkit/src/runtime/runtime.ts#L671-L781).
- [HMR preservation and restored startup](https://github.com/foldkit/foldkit/blob/74071173b1253e9efeec050a31ca86df1931ce5a/packages/foldkit/src/runtime/runtime.ts#L450-L541), [plugin memory store](https://github.com/foldkit/foldkit/blob/74071173b1253e9efeec050a31ca86df1931ce5a/packages/vite-plugin-foldkit/src/index.ts#L241-L353).
- [Overlay preference persistence](https://github.com/foldkit/foldkit/blob/74071173b1253e9efeec050a31ca86df1931ce5a/packages/devtools/src/overlay.ts#L485-L530), [crash logging](https://github.com/foldkit/foldkit/blob/74071173b1253e9efeec050a31ca86df1931ce5a/packages/foldkit/src/runtime/crashUI.ts#L266-L281).
- [Resource provider](https://github.com/foldkit/foldkit/blob/74071173b1253e9efeec050a31ca86df1931ce5a/packages/foldkit/src/runtime/resourceProvider.ts#L79-L236), [release resources guide](https://github.com/foldkit/foldkit/blob/74071173b1253e9efeec050a31ca86df1931ce5a/packages/website/src/page/core/resources.md).

The `maxEntries` JSDoc describes full snapshots per entry, but the implementation uses sparse keyframes by default. Excluding Message tags forces keyframes for every recorded entry. Prefer the implementation for this detail.

**This playground uses Bun's server with `development: false`, not Vite.** It supplies no DevTools override or Vite plugin. Foldkit's default recording requires `import.meta.hot` in a top-level window. The presence of DevTools code in the dependency therefore does not mean this host already records an editor action history.

## 3. Choose the durable record

| Record                      | Benefits                                                                                                               | Costs and traps                                                                                                                                                                                                                   | Recommendation                                                                                      |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Markdown snapshot           | Direct recovery, independent of reducer and formatting versions; easy export; unchanged unsupported Markdown survives. | Full-source writes; changes after the last commit can be lost.                                                                                                                                                                    | First version. Store source, not the complete editor Model.                                         |
| Editor action/Message       | Useful intent and debugging detail.                                                                                    | Contains selection, mode, synchronization acknowledgments and declined requests. `ToggledBold` depends on prior selection and reducer behavior. Undo depends on history. Requires compatible initial state and reducer semantics. | Keep debugging separate. Do not treat requests as accepted document facts.                          |
| Accepted transaction/change | Records what changed rather than what was requested; can support revision history and audit.                           | Current `update` returns only a Model. Raw/visual replacement and undo/redo do not expose accepted transactions. Requires a versioned change protocol, base revision, stable ordering, checkpoints and atomic journal commits.    | Best candidate if durable history becomes a product requirement. Not justified for simple recovery. |

An accepted-change log would normalize every source-changing outcome, including undo/redo, into a replacement against the preceding source. A full replacement can be the initial normalized change; do not introduce a diff algorithm without evidence. Validate ranges and base revision and record the **result actually accepted**. Replaying should apply changes, not invoke formatting plugins or external Effects again.

An append-only collection of snapshots is revision history, not necessarily event sourcing. A journal becomes authoritative only when snapshot/checkpoint advancement and append commit atomically. Never independently write a snapshot and a log, then claim complete recovery.

## 4. Minimum service contract, proposed

`DocumentStore` owns storage authority and atomicity. It is not a generic database wrapper. No SQL, DOM, Foldkit Model, timers, editor Messages, or provider handles appear in its operations.

```ts
import { Context, Effect, Option } from 'effect'

export class DocumentStore extends Context.Service<
  DocumentStore,
  {
    readonly load: (key: DocumentKey) => Effect.Effect<Option.Option<SavedDocument>, LoadError>
    readonly save: (request: SaveRequest) => Effect.Effect<SaveReceipt, SaveError>
  }
>()('@foldkit-mde/persistence/DocumentStore') {}
```

This is a **proposed signature**, not compiled code. The named domain types below would use Effect Schema as their source of truth. The `Context.Service` spelling was checked against Effect 4.0.0. Its schema-backed error constructor is `Schema.TaggedError`, not the older `TaggedErrorClass` spelling found in some skill examples.

| Proposed type   | Fields and invariants                                                                                                                                                             |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DocumentKey`   | `{ namespace, documentId }`, nonempty host-supplied strings. IndexedDB compound key, not concatenation with ambiguous separators.                                                 |
| `SavedDocument` | `{ formatVersion: 1, key, source, revision, lastWriteId }`. Revision is a positive safe integer assigned by storage. Source is exact Markdown, including an empty string.         |
| `SaveRequest`   | `{ key, source, expectedRevision, writeId }`. `expectedRevision` is `Option<Revision>`: None means create only if absent. Stable `writeId` identifies this one immutable request. |
| `SaveReceipt`   | `{ key, revision, writeId }`, returned only once the storage transaction commits.                                                                                                 |

`load` returns None only for genuine absence, not for corrupt data, a denied database, or a future version. `save` compares the current revision and writes the next revision in **one storage transaction**. A mismatch returns typed `Conflict`; it never silently overwrites. New records start at revision 1.

For a repeated write, if the current row carries the same `writeId` and exact request source/key with the expected successor revision, return its original receipt without another write. A reused ID with different content is invalid input. If another writer has since replaced that row, return Conflict rather than pretending the old retry saved the current document. This latest-row deduplication is deliberately not an unbounded idempotency ledger.

Typed failures distinguish `InvalidSave`, `InvalidStoredDocument`, `UnsupportedVersion`, `Conflict`, `QuotaExceeded`, `StorageUnavailable`, and `StorageFailure`. Keep each operation's union narrow. Errors carry safe operation/provider information; content and raw stored rows do not enter logs. Preserve causes internally without dumping them into UI or telemetry.

No list, generic query, delete, watch, append, transaction callback, or backend selector is needed for the first two operations. Add host-facing document management when a real consumer needs it.

## 5. Layers and proposed file ownership

Saving remains opt-in host policy. A separate persistence workspace avoids making pure representations or every editor consumer depend on storage. There is no dynamic plugin registration mechanism to extend.

```text
packages/core                     pure source, selection, transactions, history
packages/plugins                  pure representations, unchanged
packages/persistence/src/store.ts  proposed port, schemas, errors
packages/persistence/src/indexed-db.ts
                                  proposed native adapter, make and layer
packages/persistence/src/memory.ts proposed complete contract substitute
packages/persistence/src/autosave.ts
                                  proposed pure save lifecycle, no editor state owner
packages/editor/src/persistence.ts proposed thin Foldkit command/message bridge
apps/playground/src/main.ts        host identity, Layer selection, parent composition
```

`@foldkit-mde/persistence` needs Effect, not Foldkit, core or browser types in its port. The IndexedDB subpath alone references browser APIs. `@foldkit-mde/editor/persistence` is an optional integration subpath; the existing editor entry stays usable without saving. Adapters expose construction and Layers in their own modules. Only the host imports the chosen concrete adapter.

The IndexedDB Layer captures an `IDBFactory` and validated database name from composition. Acquire connections lazily inside operations, share the successful connection within the Layer lifetime, and close it on release and `versionchange`. Handle blocked opening/upgrades as visible storage unavailability with a retry/close-other-tab instruction. Do not leave an unowned open promise or hidden infinite wait.

**Keep expected storage failures out of Layer construction.** Foldkit caches a resource Layer build failure and can crash every subsequent Command, including synchronization. Construct the service successfully; classify denied opening or quota failure in `load`/`save`, where the bridge can turn it into a normal Message. A cached successful connection is fine; do not permanently cache a transient opening failure.

The memory Layer must implement create-only, compare-and-save, revision allocation, and stable retry behavior, not just last-write-wins assignment. It proves service behavior but not browser transactions, quota, eviction, or power-loss durability.

## 6. Consumer composition, proposed

One parent Foldkit Model contains `{ editor, documentKey, sessionEpoch, persistence }`. `editor` remains the current core Model. `persistence` is a schema-backed lifecycle value, not a second document Model. It holds session ID, local revision, last acknowledged local revision, committed storage revision, timer generation, and at most one immutable in-flight request.

The host supplies a stable namespace/document ID, seed source for a genuinely new document, and the chosen Layer. It nests editor Messages under a parent `Editor` Message and save Messages under `Persistence`. Route both through exhaustive Match. Use Foldkit `h.submodel`/`defineView` for typed view composition and `Command.mapMessage` for child Command results. The current unbranded view needs that small public composition boundary; it is not already packaged.

```ts
import * as IndexedDb from '@foldkit-mde/persistence/indexed-db'
// Proposed integration outline. AppModel, Startup and the host functions
// below are proposed schemas/functions, not existing exports.
import { Runtime } from 'foldkit'

const app = Runtime.makeApplication({
  Model: AppModel,
  Flags: Startup,
  resources: IndexedDb.layer({ factory: window.indexedDB, databaseName: 'my-app-drafts' }),
  init: initializeHost,
  update: updateHost,
  view: hostView,
  container: document.getElementById('root'),
})

Runtime.run(app, { flags: loadStartup(documentKey, seedSource) })
```

`Runtime.makeApplication`, `resources`, `Flags`, and `Runtime.run(app, { flags })` exist in 0.167.0. `loadStartup` yields `DocumentStore`, decodes the saved record, and converts expected failures to a `Startup` variant. Foldkit requires the Flags Effect's error channel to be `never`; do not use `orDie` to hide a normal load failure. Leave defects distinct.

The parent's `updateHost` delegates editor Messages to core `update`. If source differs, advance the local revision and ask the pure autosave lifecycle for save/timer intents. The editor integration converts those values into Foldkit Commands. Mode or selection changes alone do not save. Undo/redo source changes do. Return both mapped synchronization commands and persistence commands through Foldkit. Persistence completion never calls `Synchronize` or changes core history.

Allocate a session ID with browser crypto at startup inside an Effect, not inside `update`. Derive each write ID from that session ID and a monotonic local revision. Timer generations and session epochs also advance through pure transitions. This keeps update/replay deterministic while preserving request identity across retries. IDs and revision counters must reject overflow rather than wrap.

A host with its own storage can provide `Layer.succeed(DocumentStore, DocumentStore.of(...))` with the same semantics. No private runtime starts in the persistence package or reducer. For an embedded application, the host uses Foldkit's existing `makeElement`/`embed` lifecycle; the current editor is not yet a ready-made standalone embed API.

## 7. Startup, autosave, and stale work

### Startup and document switching

Prefer load-before-edit through Flags. Render loading outside the editor until startup resolves. On Saved, initialize core from stored source with empty past/future, selection at 0, and the default mode. On Missing, initialize from seed source and schedule its first create-only save, even if no user edit occurs. Do not reinterpret Missing as an empty source record.

On failed loading, show Retry or explicit “continue unsaved”, not an automatically writable empty editor. Continuing unsaved disables saves to the unresolved key. Export or Save As to a new key remains possible. Never overwrite an unreadable or unsupported checkpoint.

If later allowing edits before load resolves, apply hydration only when the same document/session is still active and its local revision has not changed. Otherwise retain the edits and offer reconciliation. Do not merge startup source into current history with `UpdatedSource` as if it were typing.

For switching, flush and await commit before discarding the current session, or require an explicit discard/export choice. Increment `sessionEpoch` and ignore all completions from prior sessions, even if the document ID happens to match. An old request can still commit to its old key; its receipt must not update the new session. Do not let two local sessions save the same document concurrently in version one.

If a consumer later uses Vite preservation, restored parent Models can contain `Saving` state even though the old save fiber no longer exists. Foldkit skips Flags/init on that path. Add an explicit runtime-mount reconciliation step before trusting restored save status: load storage, reconcile the captured write ID, reset timers, then resume saving. Do not infer that a restored `Saved` label proves the current storage revision. This is not part of the current Bun host's startup behavior.

### Save lifecycle

The proposed phases are `Unsaved`, `Dirty`, `Saving`, `Saved`, `Failed`, and `Conflict`; startup has separate Loaded/Missing/Failed outcomes. Editing stays available after save failures. Each phase carries only data needed for its legal transitions, rather than independent boolean flags.

```text
accepted source change -> Dirty(localRevision, timerGeneration)
current debounce due  -> Saving(capturedSource, writeId, expectedRevision)
edit while saving     -> retain in-flight request, mark latest revision dirty
commit receipt        -> acknowledge captured revision, advance storage revision
                         save latest source next if newer work is due
failure               -> retain unsaved source and retry identity
conflict              -> stop automatic writes, preserve both copies
```

Use one in-flight save per document and coalesce pending work to the latest source. Foldkit serializes Messages but forks Commands; that does **not** serialize storage writes. A stale debounce Message must compare timer generation, document key and session epoch. Completion must match the exact in-flight write ID and captured local revision. “Saved” means the acknowledged local revision equals the current one, not merely that some write succeeded.

The debounce delay and a maximum wait during continuous typing are host policy. Choose them after measuring document size, write latency and loss tolerance. Proposed starting experiments are a 500 ms quiet period and a 2 s maximum dirty wait, not measured defaults. Keep only one active debounce timer and one maximum-wait timer per session; cancel superseded waiting work with Foldkit's keyed interruptible Commands. Still reject stale timer Messages because cancellation can race delivery. Do not accumulate a sleeping Command per keystroke.

Cancel waiting timers, not committed or possibly committing writes. Serialize subsequent saves behind a resolved outcome. If commit status is unknown, retry the **same captured request and write ID** or reload to reconcile. Do not generate another write ID and blindly treat it as a failed write. CAS ensures even an old save cannot overwrite a later committed version.

Flush bypasses debounce and waits for pending/in-flight work. Expose it for explicit Save and host-controlled navigation/unmount. A hidden-page notification can request best-effort flush, but page termination cannot await IndexedDB. No `beforeunload` handler guarantees saving. Report the loss window honestly: edits not yet committed can disappear, including an IME composition that has not entered the reducer.

Avoid automatic retries on corruption, version mismatch, conflict, or quota exhaustion. For transient failure, offer retry without discarding content. A first implementation can use explicit retry rather than inventing a backoff policy. If edits arrived after a failed in-flight request, reconcile/retry that request first, then save the latest source.

## 8. IndexedDB atomicity, status, and multiple tabs

Use one `documents` object store with a compound document key and one current checkpoint per key. `load` performs one keyed lookup. `save` reads the row, checks revision/idempotency, and writes inside one short `readwrite` transaction. Validate request content before opening the write transaction and decode the existing row before using it. Keep unrelated async work outside the transaction so it cannot auto-close between requests.

Listen for transaction `complete`, not request `success`, before issuing a receipt. The [IndexedDB specification](https://w3c.github.io/IndexedDB/#transaction-lifecycle) requires atomic commit and serializes transactions with overlapping object-store scopes. This permits compare-and-save across connections/tabs, though the object-store lock is broader than a single document.

Request the `strict` durability hint for source checkpoints where supported. It reduces power-loss risk but remains a browser hint, not a backup guarantee. Do not silently claim strict durability on a fallback. [Transaction durability](https://w3c.github.io/IndexedDB/#transaction-durability-hint) differs from protection against eviction through [persistent storage permission](https://storage.spec.whatwg.org/#persistence).

Show “Saved locally” only after commit for the latest revision. Show Unsaved/dirty, Saving, Failed with retry/export, and Conflict distinctly. Editing is not blocked by a storage outage. No content enters persistence Command args, because Foldkit includes those args in spans. Keep snapshot payloads in the Command's Effect closure and metadata limited to safe identifiers/revisions. Existing `Synchronize` already puts source in args; that is an inherited privacy concern to address separately before enabling tracing, not a reason to copy it into new save Commands.

Two tabs may load revision 8. The first successful write produces 9; the second gets Conflict and keeps its local source. It must not reload then automatically retry its old source against 9. Offer explicit reload/discard, export/Save As, or deliberate overwrite against a freshly reviewed revision. Defer merge and live collaboration.

BroadcastChannel notifications can later warn sooner, but do not enforce correctness. CAS is the first-version safety boundary. No global sequence based on wall-clock timestamps, cross-tab “latest wins”, leader election, or Web Locks requirement is needed.

## 9. Recovery, versions, history, and limits

- **Recovery:** read one schema-decoded committed source checkpoint. An aborted write leaves the preceding committed row. A corrupt row has no automatic fallback in the one-checkpoint design. Preserve it and require explicit recovery/export or a new key. A retained previous checkpoint is a possible later safety feature, not an implied current guarantee.
- **Versions:** separate record `formatVersion` from IndexedDB database version. Database version controls object-store changes; record version controls decoding. Reject unknown future versions without rewriting them. No historical migrations are needed before the first format exists. Add explicit codecs/migrations only when a real persisted format changes.
- **Undo:** past/future stay in session memory. Restart resets them. Autosave coalescing never changes undo grouping. If persistent undo becomes required, specify grouping and accepted-change semantics before designing its log.
- **Composition:** autosave observes core-accepted changes. It does not force-read the DOM during composition or rerender on receipt. Existing composition suppression does not prevent toolbar mode/format actions from interrupting IME; persistence does not solve that separate interaction gap. Synthetic events do not prove real OS IME behavior.
- **Identity:** host namespace should separate app/workspace/account drafts. It is partitioning, not authorization. Same-origin scripts can access browser storage. Account switching must select another key and invalidate the active session. Document IDs must survive reloads; allocate a new ID once and retain it, not on each mount. `editorInstanceId`/surface ID is ephemeral and distinct. Keep the first slice to one mounted editor while planning a later instance-scoped DOM target.
- **Retention:** one current record per document, no action accumulation and no journal scan on startup. Reads are bounded to one record, but document count and bytes are not automatically bounded. A one-document playground has a bounded key set; a multi-document host needs explicit deletion/export and quota policy before claiming bounded total storage. Never auto-delete unsynced drafts to make space.
- **Limits:** measure representative UTF-8 source bytes and write latency before setting a host size cap. Character count is not bytes. Parse envelope constraints on load and save. Handle quota failure without losing the in-memory source or replacing the preceding checkpoint. Native storage estimates are approximate. The [Storage Standard](https://storage.spec.whatwg.org/#storage-pressure) allows best-effort eviction; requesting persistent storage can help, but user clearing, private browsing, and origin changes still matter.

## 10. When SQLite or a stronger log earns its cost

Keep IndexedDB while the workload is keyed source recovery with short atomic writes. It meets this job without another external runtime dependency.

Consider SQLite when a concrete host needs relational queries, full-text search, many related records committed together, native desktop database files, or measured workloads that favor SQL. A Bun/native adapter can use `bun:sqlite`; that does not make SQLite browser-native. Browser SQLite requires shipping/loading WASM and usually worker/VFS integration. Official [SQLite WASM persistence guidance](https://sqlite.org/wasm/doc/trunk/persistence.md) describes OPFS VFS choices: some need COOP/COEP and SharedArrayBuffer; the SAH-pool alternative avoids those headers but changes concurrency constraints. It remains subject to browser storage policy. Adding SQLite requires an explicit dependency/assets and runtime decision, not an automatic second Layer in this slice.

Add a stronger log only for a stated need: durable revision history, audit, persistent grouped undo, offline synchronization, or a tighter recovery point than snapshots can provide. A browser-local append-only log is not tamper-proof audit. Define immutable write IDs, base/result revisions, format versions, atomic append/checkpoint, bounded replay, retention and checkpoint compaction. Collaboration additionally needs conflict/merge semantics; logging alone provides none.

## 11. First slice and decisions for the owner

Recommended slice: one stable document key, source-only versioned checkpoint, IndexedDB plus complete memory Layer, load-before-edit, pure autosave lifecycle, typed failures/status, serialized coalesced saves, CAS conflicts, explicit retry and flush. Package the typed parent-message/view boundary needed by a real consumer. Do not implement a generic plugin registry, multiple surfaces, journal, durable undo, SQLite, or provider infrastructure alongside it.

Meaningful choices before implementation:

1. **Loss tolerance:** is last-committed local recovery sufficient, or must every accepted edit be durable before the editor acknowledges it? Recommend asynchronous checkpoints; stronger guarantees change availability and interaction cost.
2. **Reload behavior:** should undo/caret/mode survive? Recommend source only with fresh history and default selection/mode. Add separate session preferences if cursor restoration becomes important.
3. **First consumer identity:** who supplies and retains namespace/document ID, and owns failed-load/conflict/export UI? Recommend explicit host inputs, never DOM-derived IDs.
4. **Browser storage scope:** a draft checkpoint or the only copy of valuable work? Recommend drafts with export/backup instructions. Only-copy storage needs a stronger retention/backup product decision.

No question blocks this design recommendation. These choices need user review before persistence implementation, rather than an expanded framework built on guesses.

## 12. Proposed verification and research boundaries

Tests during implementation should cross `DocumentStore`, not spy on its methods:

- Same keyed load/create/CAS/retry contract against memory and real browser IndexedDB. Distinct namespaces and empty source must work.
- Two connections both expecting revision 8: exactly one reaches 9, the other conflicts. No stale overwrite.
- A→B→C while A is in flight: A's receipt cannot mark C Saved. Commit A then C; never persist B after C. Undo to an earlier source must still advance local/save revision correctly.
- Superseded timer, old-session receipt, same document reopened, blocked upgrade, storage denial, quota failure, aborted transaction and lost receipt retry.
- Startup edits if that mode is later allowed, corrupt/future records, multibyte source, raw/visual unsupported Markdown preservation, composition end and mode changes.
- Browser reload recovers the last acknowledged source with fresh history. Request success followed by transaction abort must never produce Saved.

Use Bun tests and Effect test services/Deferred to control ordering and time, plus actual browser checks for native storage. Plant a stale-receipt or last-write-wins defect and confirm the risky test fails. Memory cannot prove browser guarantees. Power-loss and real OS IME remain distinct validation tasks.

This work changed only this Markdown design document, confirmed by comparing the extracted tree with the original archive. No persistence, gbfm changes, production writes, publishing, deployment, dependency upgrades, or new threads. No Git commits were created. `bun install --frozen-lockfile` could not run because the orb has Bun 1.3.10 and the snapshot uses lockfile version 2 with Bun 1.4.0. No lockfile was regenerated. Exact Foldkit/Effect registry tarballs supplied version-specific inspection instead; their hashes matched registry metadata. The document passed checks for balanced code fences, existing local source links, and absence of em dashes. `bun run precommit` stopped at missing `oxfmt`; `bun run build` could not resolve the uninstalled workspace CSS export. No passing application tests, build, browser persistence test, or API compile check was claimed for this design-only work.

### Rules that shaped the recommendation

Read [rat-stack's guide](https://ratstack.sh/llms.txt), [rules](https://ratstack.sh/AGENTS.md), [rat-stack-mode](https://ratstack.sh/skills/rat-stack-mode), [add-a-store](https://ratstack.sh/skills/add-a-store), [lifecycle](https://ratstack.sh/skills/add-a-lifecycle-machine), [keep-or-cut](https://ratstack.sh/skills/keep-or-cut), and [uncomplect](https://ratstack.sh/skills/uncomplect), plus the relevant source principles: name the system of record, no dual writes, validate before durable write, one writer per partition, idempotent operations, real provider guarantees, distinct unknown outcomes, bounded reads and measured limits. Local adaptation takes precedence over XState, server capability projections, infrastructure and pnpm examples.

These rules led to one source checkpoint, Schema-decoded boundaries, atomic revision checks, explicit unknown-commit handling, a separate save lifecycle, and no speculative log or SQLite dependency. Relevant Effect service-design, Bun package-boundary and coding-standard skills reinforce the same ownership. No provider or runtime code was added. Existing gaps are the fixed surface ID, absent packaged parent boundary, possible source-bearing trace attributes, and lack of import-boundary lint enforcement. They are constraints and follow-up concerns, not implemented fixes or a claim that the current editor is unsafe to use.
