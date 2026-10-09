import * as IndexedDb from '@foldkit-mde/persistence/indexed-db'
import { DocumentStore, Failure, type DocumentKey } from '@foldkit-mde/persistence/store'
import { Effect, ManagedRuntime, Option, Result, type Schema } from 'effect'

const assert = (condition: boolean, message: string) => {
  if (!condition) throw new Error(message)
}

const writeFixture = (databaseName: string, key: DocumentKey, value: Schema.Unknown['Type']) =>
  new Promise<void>((resolve, reject) => {
    const open = indexedDB.open(databaseName, 1)
    open.addEventListener('error', () => reject(open.error))
    open.addEventListener('success', () => {
      const db = open.result
      const transaction = db.transaction('documents', 'readwrite')
      transaction.objectStore('documents').put(value, [key.namespace, key.documentId])
      transaction.addEventListener('complete', () => {
        db.close()
        resolve()
      })
      transaction.addEventListener('abort', () => {
        db.close()
        reject(transaction.error)
      })
    })
  })

const check = async () => {
  const databaseName = `foldkit-mde-contract-${crypto.randomUUID()}`
  const options = { databaseName, sourceLimit: 1024, openFactory: () => indexedDB }
  const left = ManagedRuntime.make(IndexedDb.layer(options))
  const right = ManagedRuntime.make(IndexedDb.layer(options))

  const denied = ManagedRuntime.make(
    IndexedDb.layer({
      ...options,
      openFactory: () => {
        throw new DOMException('Denied', 'SecurityError')
      },
    }),
  )

  const key = { namespace: 'browser-check', documentId: 'one' }

  try {
    const a = await left.runPromise(Effect.service(DocumentStore))
    const b = await right.runPromise(Effect.service(DocumentStore))

    assert(Option.isNone(await left.runPromise(a.load(key))), 'Missing must not be empty')

    const first = {
      key,
      source: 'é\r\n::music{id="keep"}\n',
      expectedRevision: Option.none<number>(),
      writeId: 'a',
    }

    assert((await left.runPromise(a.save(first))).revision === 1, 'First revision')
    assert(
      Option.getOrThrow(await right.runPromise(b.load(key))).source === first.source,
      'Cross-connection exact source',
    )
    const second = { key, source: '', expectedRevision: Option.some(1), writeId: 'b' }
    assert((await right.runPromise(b.save(second))).revision === 2, 'Empty commits')
    assert((await right.runPromise(b.save(second))).revision === 2, 'Idempotent retry')
    assert(
      Option.getOrThrow(await left.runPromise(a.loadRecovery(key))).source === first.source,
      'Retry does not rotate recovery',
    )

    const contenders = await Promise.all([
      left.runPromise(
        Effect.result(
          a.save({ key, source: 'winner-left', expectedRevision: Option.some(2), writeId: 'left' }),
        ),
      ),
      right.runPromise(
        Effect.result(
          b.save({
            key,
            source: 'winner-right',
            expectedRevision: Option.some(2),
            writeId: 'right',
          }),
        ),
      ),
    ])

    assert(contenders.filter(Result.isSuccess).length === 1, 'Only one concurrent writer commits')
    assert(
      contenders.some(
        (result) => Result.isFailure(result) && Failure.guards.Conflict(result.failure.failure),
      ),
      'Losing writer gets conflict',
    )
    assert(
      Option.getOrThrow(await left.runPromise(a.loadRecovery(key))).source === '',
      'Winner rotates exactly once',
    )

    const tooLarge = await left.runPromise(
      Effect.result(
        a.save({
          key: { ...key, documentId: 'large' },
          source: 'é'.repeat(513),
          expectedRevision: Option.none(),
          writeId: 'large',
        }),
      ),
    )

    assert(
      Result.isFailure(tooLarge) && Failure.guards.InvalidSave(tooLarge.failure.failure),
      'UTF-8 byte limit',
    )
    assert(
      Option.isNone(await left.runPromise(a.load({ ...key, documentId: 'large' }))),
      'Rejected save leaves no row',
    )

    const previous = {
      key,
      source: 'Recover this exact source\r\n',
      revision: 5,
      lastWriteId: 'old',
    }

    await writeFixture(databaseName, key, { formatVersion: 1, latest: { broken: true }, previous })
    const damaged = await left.runPromise(Effect.result(a.load(key)))
    assert(
      Result.isFailure(damaged) && Failure.guards.InvalidStoredDocument(damaged.failure.failure),
      'Damaged latest is not Missing',
    )
    assert(
      Option.getOrThrow(await left.runPromise(a.loadRecovery(key))).source === previous.source,
      'Independent previous checkpoint recovery',
    )

    const refusal = await right.runPromise(
      Effect.result(
        b.save({ key, source: 'overwrite', expectedRevision: Option.none(), writeId: 'overwrite' }),
      ),
    )

    assert(Result.isFailure(refusal), 'Corrupt latest cannot be overwritten by seed')
    await writeFixture(databaseName, key, {
      formatVersion: 1,
      latest: previous,
      previous: { broken: true },
    })
    assert(
      Option.getOrThrow(await left.runPromise(a.load(key))).source === previous.source,
      'Damaged previous does not block valid latest',
    )
    await writeFixture(databaseName, key, { formatVersion: 2, latest: previous, previous: null })
    const future = await left.runPromise(Effect.result(a.load(key)))
    assert(
      Result.isFailure(future) && Failure.guards.UnsupportedVersion(future.failure.failure),
      'Future format refused',
    )

    const unavailable = await denied.runPromise(
      Effect.gen(function* () {
        const store = yield* DocumentStore

        return yield* Effect.result(store.load(key))
      }),
    )

    assert(
      Result.isFailure(unavailable) &&
        Failure.guards.StorageUnavailable(unavailable.failure.failure),
      'Denied getter is an operation failure, not Layer failure',
    )

    const abortKey = { ...key, documentId: 'abort' }
    // oxlint-disable-next-line typescript/unbound-method -- Fault injection calls this with the real object store and restores it in finally.
    const original = IDBObjectStore.prototype.put
    IDBObjectStore.prototype.put = function (
      this: IDBObjectStore,
      value: Schema.Unknown['Type'],
      rowKey?: IDBValidKey,
    ) {
      const request = original.call(this, value, rowKey)
      request.addEventListener('success', () => this.transaction.abort())

      return request
    }

    try {
      const aborted = await left.runPromise(
        Effect.result(
          a.save({
            key: abortKey,
            source: 'must not commit',
            expectedRevision: Option.none(),
            writeId: 'abort',
          }),
        ),
      )

      assert(
        Result.isFailure(aborted) &&
          Failure.guards.StorageFailure(aborted.failure.failure) &&
          aborted.failure.failure.commitOutcome === 'Aborted',
        'Request success followed by abort is not Saved',
      )
    } finally {
      IDBObjectStore.prototype.put = original
    }

    assert(
      Option.isNone(await left.runPromise(a.load(abortKey))),
      'Aborted transaction leaves no document',
    )

    return 'Passed: native IndexedDB exact source, empty/missing, atomic competing writers, idempotent retry, checkpoint rotation, UTF-8 limits, corruption, future versions, denied storage, request-success-before-abort.'
  } finally {
    await left.dispose()
    await right.dispose()
    await denied.dispose()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName)
      request.addEventListener('success', () => resolve())
      request.addEventListener('error', () => reject(request.error))
    })
  }
}

const output = document.getElementById('result')

try {
  const result = await check()

  if (output) {
    output.textContent = result
    output.dataset.result = 'passed'
  }
} catch (error) {
  if (output) {
    output.textContent = String(error)
    output.dataset.result = 'failed'
  }
}
