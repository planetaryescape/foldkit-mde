import { Effect, Layer, type Option, Result, type Schema } from 'effect'

import { prepare, read } from './checkpoints'
import {
  DocumentStore,
  Failure,
  StoreError,
  type DocumentKey,
  type SaveReceipt,
  type SaveRequest,
  type SavedDocument,
} from './store'

export interface Options {
  readonly openFactory: () => IDBFactory | undefined
  readonly databaseName: string
  readonly sourceLimit: number
}

const classify = (cause: Schema.Unknown['Type'], aborted: boolean) => {
  if (cause instanceof StoreError) return cause

  if (cause instanceof DOMException && cause.name === 'QuotaExceededError')
    return new StoreError({ failure: Failure.cases.QuotaExceeded.make({}) })

  if (cause instanceof DOMException && cause.name === 'SecurityError')
    return new StoreError({ failure: Failure.cases.StorageUnavailable.make({ reason: 'Denied' }) })

  return new StoreError({
    failure: Failure.cases.StorageFailure.make({ commitOutcome: aborted ? 'Aborted' : 'Unknown' }),
  })
}

export const make = (options: Options) =>
  Effect.gen(function* () {
    let connection: IDBDatabase | undefined
    let opening: Promise<IDBDatabase> | undefined
    let closed = false

    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        closed = true
        connection?.close()
        connection = undefined
      }),
    )

    const connect = Effect.fn('DocumentStore.open')(function* () {
      if (connection) return connection

      const factory = yield* Effect.try({
        try: options.openFactory,
        catch: (cause) => classify(cause, false),
      })

      if (!factory || closed)
        return yield* new StoreError({
          failure: Failure.cases.StorageUnavailable.make({ reason: 'Unsupported' }),
        })

      return yield* Effect.tryPromise({
        try: () => {
          if (opening) return opening

          const attempt = new Promise<IDBDatabase>((resolve, reject) => {
            const request = factory.open(options.databaseName, 1)
            let abandoned = false
            request.addEventListener('upgradeneeded', () => {
              if (abandoned || closed) {
                request.transaction?.abort()

                return
              }

              if (!request.result.objectStoreNames.contains('documents'))
                request.result.createObjectStore('documents')
            })

            request.addEventListener('blocked', () => {
              abandoned = true
              reject(
                new StoreError({
                  failure: Failure.cases.StorageUnavailable.make({ reason: 'Blocked' }),
                }),
              )
            })

            request.addEventListener('error', () => reject(classify(request.error, false)))
            request.addEventListener('success', () => {
              if (abandoned || closed) {
                request.result.close()
                reject(classify(undefined, false))

                return
              }

              const db = request.result
              connection = db
              db.addEventListener('versionchange', () => {
                db.close()

                if (connection === db) connection = undefined
              })

              resolve(request.result)
            })
          })

          opening = attempt.then(
            (db) => {
              opening = undefined

              return db
            },
            (cause) => {
              opening = undefined
              throw cause
            },
          )

          return opening
        },
        catch: (cause) => classify(cause, false),
      })
    })

    const load = Effect.fn('DocumentStore.load')(function* (key: DocumentKey, recovery: boolean) {
      const db = yield* connect()

      return yield* Effect.callback<Option.Option<SavedDocument>, StoreError>((resume) => {
        let transaction: IDBTransaction

        try {
          transaction = db.transaction('documents', 'readonly')
        } catch (cause) {
          resume(Effect.fail(classify(cause, true)))

          return Effect.void
        }

        let result: Result.Result<Option.Option<SavedDocument>, StoreError> | undefined

        const request: IDBRequest<Schema.Unknown['Type']> = transaction
          .objectStore('documents')
          .get([key.namespace, key.documentId])

        request.addEventListener('success', () => {
          result = read(request.result, key, options.sourceLimit, recovery)
        })

        transaction.addEventListener('complete', () =>
          resume(result ? Effect.fromResult(result) : Effect.fail(classify(undefined, false))),
        )
        transaction.addEventListener('abort', () =>
          resume(Effect.fail(classify(transaction.error, true))),
        )

        return Effect.try({ try: () => transaction.abort(), catch: () => undefined }).pipe(
          Effect.ignore,
        )
      })
    })

    const save = Effect.fn('DocumentStore.save')(function* (request: SaveRequest) {
      const db = yield* connect()

      return yield* Effect.callback<SaveReceipt, StoreError>((resume) => {
        let transaction: IDBTransaction

        try {
          transaction = db.transaction('documents', 'readwrite', { durability: 'strict' })
        } catch (cause) {
          resume(Effect.fail(classify(cause, true)))

          return Effect.void
        }

        let receipt: SaveReceipt | undefined
        let failure: StoreError | undefined
        const table = transaction.objectStore('documents')

        const lookup: IDBRequest<Schema.Unknown['Type']> = table.get([
          request.key.namespace,
          request.key.documentId,
        ])

        lookup.addEventListener('success', () => {
          const plan = prepare(lookup.result, request, options.sourceLimit)

          if (Result.isFailure(plan)) {
            failure = plan.failure
            transaction.abort()

            return
          }

          receipt = plan.success.receipt

          if (plan.success.changed) {
            try {
              table.put(plan.success.entry, [request.key.namespace, request.key.documentId])
            } catch (cause) {
              failure = classify(cause, true)
              transaction.abort()
            }
          }
        })

        transaction.addEventListener('complete', () =>
          resume(receipt ? Effect.succeed(receipt) : Effect.fail(classify(undefined, false))),
        )
        transaction.addEventListener('abort', () =>
          resume(Effect.fail(failure ?? classify(transaction.error, true))),
        )

        return Effect.try({ try: () => transaction.abort(), catch: () => undefined }).pipe(
          Effect.ignore,
        )
      })
    })

    return DocumentStore.of({
      load: (key) => load(key, false),
      loadRecovery: (key) => load(key, true),
      save,
    })
  })

export const layer = (options: Options) => Layer.effect(DocumentStore, make(options))
