import { Effect, Layer } from 'effect'

import { prepare, read, type Entry } from './checkpoints'
import { DocumentStore } from './store'

export const layer = (options: { readonly sourceLimit: number }) =>
  Layer.effect(
    DocumentStore,
    Effect.sync(() => {
      const rows = new Map<string, Entry>()

      return DocumentStore.of({
        load: (key) =>
          Effect.suspend(() =>
            Effect.fromResult(
              read(
                rows.get(JSON.stringify([key.namespace, key.documentId])),
                key,
                options.sourceLimit,
                false,
              ),
            ),
          ),
        loadRecovery: (key) =>
          Effect.suspend(() =>
            Effect.fromResult(
              read(
                rows.get(JSON.stringify([key.namespace, key.documentId])),
                key,
                options.sourceLimit,
                true,
              ),
            ),
          ),
        save: (request) =>
          Effect.suspend(() => {
            const id = JSON.stringify([request.key.namespace, request.key.documentId])

            return Effect.fromResult(prepare(rows.get(id), request, options.sourceLimit)).pipe(
              Effect.map((plan) => {
                if (plan.changed) rows.set(id, plan.entry)

                return plan.receipt
              }),
            )
          }),
      })
    }),
  )
