import { expect, test } from 'bun:test'

import { Effect, ManagedRuntime, Option } from 'effect'

import * as Memory from './memory'
import { DocumentStore } from './store'

const key = { namespace: 'test', documentId: 'first' }

test('local storage creates and reloads exact source without conflating missing and empty', async () => {
  const runtime = ManagedRuntime.make(Memory.layer({ sourceLimit: 1024 }))

  try {
    await runtime.runPromise(
      Effect.gen(function* () {
        const store = yield* DocumentStore
        expect(Option.isNone(yield* store.load(key))).toBe(true)

        const receipt = yield* store.save({
          key,
          source: 'é\r\n::music{id="keep"}\n',
          expectedRevision: Option.none(),
          writeId: 'one',
        })

        expect(receipt.revision).toBe(1)
        const loaded = Option.getOrThrow(yield* store.load(key))
        expect(loaded.source).toBe('é\r\n::music{id="keep"}\n')
        const emptyKey = { ...key, documentId: 'empty' }
        yield* store.save({
          key: emptyKey,
          source: '',
          expectedRevision: Option.none(),
          writeId: 'empty',
        })
        expect(Option.getOrThrow(yield* store.load(emptyKey)).source).toBe('')
        expect(Option.isNone(yield* store.load({ ...key, namespace: 'other' }))).toBe(true)
      }),
    )
  } finally {
    await runtime.dispose()
  }
})

test('compare-and-save refuses stale writers and retries without rotating the previous checkpoint', async () => {
  const runtime = ManagedRuntime.make(Memory.layer({ sourceLimit: 1024 }))

  try {
    await runtime.runPromise(
      Effect.gen(function* () {
        const store = yield* DocumentStore
        const first = { key, source: 'A', expectedRevision: Option.none<number>(), writeId: 'a' }
        yield* store.save(first)
        const second = { key, source: 'B', expectedRevision: Option.some(1), writeId: 'b' }
        expect((yield* store.save(second)).revision).toBe(2)
        expect((yield* store.save(second)).revision).toBe(2)
        expect(Option.getOrThrow(yield* store.loadRecovery(key)).source).toBe('A')
        const stale = yield* Effect.result(store.save({ ...second, source: 'C', writeId: 'c' }))
        expect(stale._tag).toBe('Failure')
        expect(Option.getOrThrow(yield* store.load(key)).source).toBe('B')
        const reused = yield* Effect.result(store.save({ ...second, source: 'changed' }))
        expect(reused._tag).toBe('Failure')
        yield* store.save({ key, source: 'C', expectedRevision: Option.some(2), writeId: 'c' })
        expect(Option.getOrThrow(yield* store.loadRecovery(key)).source).toBe('B')
      }),
    )
  } finally {
    await runtime.dispose()
  }
})
