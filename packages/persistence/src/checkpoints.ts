import { Option, Result, Schema } from 'effect'

import {
  DocumentKey,
  Failure,
  Revision,
  type SavedDocument,
  SaveRequest,
  StoreError,
  type SaveReceipt,
} from './store'

const Envelope = Schema.Struct({
  formatVersion: Schema.Finite,
  latest: Schema.Unknown,
  previous: Schema.Unknown,
})

const Checkpoint = Schema.Struct({
  key: DocumentKey,
  source: Schema.String,
  revision: Revision,
  lastWriteId: Schema.String.check(Schema.isNonEmpty()),
})

export interface Entry {
  readonly formatVersion: 1
  readonly latest: SavedDocument
  readonly previous: SavedDocument | null
}

export interface SavePlan {
  readonly entry: Entry
  readonly receipt: SaveReceipt
  readonly changed: boolean
}

const invalid = (reason: 'Shape' | 'KeyMismatch' | 'TooLarge') =>
  new StoreError({ failure: Failure.cases.InvalidStoredDocument.make({ reason }) })

export const sameKey = (left: DocumentKey, right: DocumentKey) =>
  left.namespace === right.namespace && left.documentId === right.documentId

const readCheckpoint = (value: Schema.Unknown['Type'], key: DocumentKey, limit: number) => {
  const decoded = Schema.decodeUnknownResult(Checkpoint)(value)

  if (Result.isFailure(decoded)) return Result.fail(invalid('Shape'))

  if (!sameKey(decoded.success.key, key)) return Result.fail(invalid('KeyMismatch'))

  if (new TextEncoder().encode(decoded.success.source).byteLength > limit)
    return Result.fail(invalid('TooLarge'))

  return Result.succeed(decoded.success)
}

export const read = (
  value: Schema.Unknown['Type'],
  key: DocumentKey,
  limit: number,
  recovery: boolean,
): Result.Result<Option.Option<SavedDocument>, StoreError> => {
  if (value === undefined) return Result.succeed(Option.none())
  const envelope = Schema.decodeUnknownResult(Envelope)(value)

  if (Result.isFailure(envelope)) return Result.fail(invalid('Shape'))

  if (envelope.success.formatVersion !== 1)
    return Result.fail(
      new StoreError({
        failure: Failure.cases.UnsupportedVersion.make({ version: envelope.success.formatVersion }),
      }),
    )

  if (recovery && envelope.success.previous === null) return Result.succeed(Option.none())

  const checkpoint = readCheckpoint(
    recovery ? envelope.success.previous : envelope.success.latest,
    key,
    limit,
  )

  if (Result.isFailure(checkpoint)) return Result.fail(checkpoint.failure)

  if (recovery) {
    const latest = readCheckpoint(envelope.success.latest, key, limit)

    if (Result.isSuccess(latest) && latest.success.revision <= checkpoint.success.revision)
      return Result.fail(invalid('Shape'))
  }

  return Result.succeed(Option.some(checkpoint.success))
}

export const prepare = (
  value: Schema.Unknown['Type'],
  input: SaveRequest,
  limit: number,
): Result.Result<SavePlan, StoreError> => {
  const parsed = Schema.decodeResult(SaveRequest)(input)

  if (Result.isFailure(parsed))
    return Result.fail(
      new StoreError({ failure: Failure.cases.InvalidSave.make({ reason: 'Shape' }) }),
    )
  const request = parsed.success

  if (new TextEncoder().encode(request.source).byteLength > limit)
    return Result.fail(
      new StoreError({ failure: Failure.cases.InvalidSave.make({ reason: 'TooLarge' }) }),
    )
  const loaded = read(value, request.key, limit, false)

  if (Result.isFailure(loaded)) return Result.fail(loaded.failure)
  const current = Option.getOrUndefined(loaded.success)
  const successor = Option.getOrElse(request.expectedRevision, () => 0) + 1

  if (current?.lastWriteId === request.writeId) {
    if (current.source !== request.source || current.revision !== successor)
      return Result.fail(
        new StoreError({ failure: Failure.cases.InvalidSave.make({ reason: 'WriteIdReused' }) }),
      )
    const previous = read(value, request.key, limit, true)

    return Result.succeed({
      entry: {
        formatVersion: 1,
        latest: current,
        previous: Result.isSuccess(previous) ? Option.getOrNull(previous.success) : null,
      },
      receipt: { key: current.key, revision: current.revision, writeId: request.writeId },
      changed: false,
    })
  }

  const actual = current ? Option.some(current.revision) : Option.none<number>()

  if (Option.getOrUndefined(actual) !== Option.getOrUndefined(request.expectedRevision))
    return Result.fail(
      new StoreError({
        failure: Failure.cases.Conflict.make({ expected: request.expectedRevision, actual }),
      }),
    )

  if (!Number.isSafeInteger(successor))
    return Result.fail(
      new StoreError({ failure: Failure.cases.InvalidSave.make({ reason: 'RevisionOverflow' }) }),
    )

  const latest = {
    key: request.key,
    source: request.source,
    revision: successor,
    lastWriteId: request.writeId,
  }

  return Result.succeed({
    entry: { formatVersion: 1, latest, previous: current ?? null },
    receipt: { key: request.key, revision: successor, writeId: request.writeId },
    changed: true,
  })
}
