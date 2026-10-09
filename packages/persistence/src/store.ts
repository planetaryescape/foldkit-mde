import { Context, type Effect, type Option, Schema } from 'effect'

const Identifier = Schema.String.check(Schema.isNonEmpty())

export const Counter = Schema.Number.check(
  Schema.isInt(),
  Schema.isGreaterThanOrEqualTo(0),
  Schema.isLessThanOrEqualTo(Number.MAX_SAFE_INTEGER),
)

export const Revision = Counter.check(Schema.isGreaterThanOrEqualTo(1))

export const DocumentKey = Schema.Struct({ namespace: Identifier, documentId: Identifier })

export type DocumentKey = typeof DocumentKey.Type

export const SavedDocument = Schema.Struct({
  key: DocumentKey,
  source: Schema.String,
  revision: Revision,
  lastWriteId: Identifier,
})

export type SavedDocument = typeof SavedDocument.Type

export const SaveRequest = Schema.Struct({
  key: DocumentKey,
  source: Schema.String,
  expectedRevision: Schema.Option(Revision),
  writeId: Identifier,
})

export type SaveRequest = typeof SaveRequest.Type

export const SaveReceipt = Schema.Struct({
  key: DocumentKey,
  revision: Revision,
  writeId: Identifier,
})

export type SaveReceipt = typeof SaveReceipt.Type

export const Failure = Schema.TaggedUnion({
  InvalidSave: {
    reason: Schema.Literals(['Shape', 'TooLarge', 'WriteIdReused', 'RevisionOverflow']),
  },
  InvalidStoredDocument: { reason: Schema.Literals(['Shape', 'KeyMismatch', 'TooLarge']) },
  UnsupportedVersion: { version: Schema.Finite },
  Conflict: { expected: Schema.Option(Revision), actual: Schema.Option(Revision) },
  QuotaExceeded: {},
  StorageUnavailable: { reason: Schema.Literals(['Unsupported', 'Denied', 'Blocked']) },
  StorageFailure: { commitOutcome: Schema.Literals(['Aborted', 'Unknown']) },
})

export type Failure = typeof Failure.Type

export class StoreError extends Schema.TaggedError<StoreError>()('StoreError', {
  failure: Failure,
}) {}

export class DocumentStore extends Context.Service<
  DocumentStore,
  {
    readonly load: (key: DocumentKey) => Effect.Effect<Option.Option<SavedDocument>, StoreError>
    readonly loadRecovery: (
      key: DocumentKey,
    ) => Effect.Effect<Option.Option<SavedDocument>, StoreError>
    readonly save: (request: SaveRequest) => Effect.Effect<SaveReceipt, StoreError>
  }
>()('@foldkit-mde/persistence/DocumentStore') {}
