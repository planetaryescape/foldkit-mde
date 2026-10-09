import { Event, Intent, type Policy, type FlushResult } from '@foldkit-mde/persistence/autosave'
import { DocumentStore, type DocumentKey } from '@foldkit-mde/persistence/store'
import { Effect, Match, Option } from 'effect'
import * as Command from 'foldkit/command'

import { Message, Recovery, Startup } from './persistence-model'

export const loadStartup = Effect.fn('Editor.loadStartup')(function* (key: DocumentKey) {
  const store = yield* DocumentStore

  return yield* store.load(key).pipe(
    Effect.match({
      onSuccess: (document) =>
        Startup.cases.Loaded.make({ key, document, sessionId: crypto.randomUUID() }),
      onFailure: (error) => Startup.cases.LoadFailed.make({ key, failure: error.failure }),
    }),
  )
})

const quiet = (policy: Policy) =>
  Command.define('EditorSaveQuiet', {
    args: {
      sessionId: Intent.cases.Quiet.fields.sessionId,
      generation: Intent.cases.Quiet.fields.generation,
    },
    messages: [Message],
    interrupt: { keyFields: ['sessionId'], toKey: ({ sessionId }) => sessionId },
    execute: ({ sessionId, generation }) =>
      Effect.sleep(policy.quietMs).pipe(
        Effect.as(
          Message.cases.Persistence.make({
            message: Event.cases.QuietDue.make({ sessionId, generation }),
          }),
        ),
      ),
  })

const maximum = (policy: Policy) =>
  Command.define('EditorSaveMaximum', {
    args: {
      sessionId: Intent.cases.Maximum.fields.sessionId,
      window: Intent.cases.Maximum.fields.window,
    },
    messages: [Message],
    interrupt: { keyFields: ['sessionId'], toKey: ({ sessionId }) => sessionId },
    execute: ({ sessionId, window }) =>
      Effect.sleep(policy.maximumMs).pipe(
        Effect.as(
          Message.cases.Persistence.make({
            message: Event.cases.MaximumDue.make({ sessionId, window }),
          }),
        ),
      ),
  })

export const makeCommands = (policy: Policy) => {
  const Quiet = quiet(policy)
  const Maximum = maximum(policy)

  const cancelled = () =>
    Message.cases.Persistence.make({ message: Event.cases.TimersCancelled.make({}) })

  return (
    intents: ReadonlyArray<Intent>,
  ): ReadonlyArray<Command.Command<Message, never, DocumentStore>> =>
    intents.map((intent) =>
      Match.value(intent).pipe(
        Match.withReturnType<Command.Command<Message, never, DocumentStore>>(),
        Match.tagsExhaustive({
          Quiet: ({ sessionId, generation }) => {
            const interrupt = Quiet.Interrupt({ sessionId }, cancelled)

            return Command.mapEffect(Quiet({ sessionId, generation }), (effect) =>
              Effect.andThen(interrupt.effect, effect),
            )
          },
          Maximum: ({ sessionId, window }) => Maximum({ sessionId, window }),
          CancelTimers: ({ sessionId }) =>
            Command.define('CancelEditorSaveTimers', {
              messages: [Message],
              execute: Effect.gen(function* () {
                yield* Quiet.Interrupt({ sessionId }, cancelled).effect
                yield* Maximum.Interrupt({ sessionId }, cancelled).effect

                return cancelled()
              }),
            })(),
          Save: ({ sessionId, flight }) =>
            Command.define('SaveEditorDocument', {
              messages: [Message],
              execute: Effect.gen(function* () {
                const store = yield* DocumentStore

                return yield* store.save(flight.request).pipe(
                  Effect.match({
                    onSuccess: (receipt) =>
                      Message.cases.Persistence.make({
                        message: Event.cases.Committed.make({
                          sessionId,
                          localRevision: flight.localRevision,
                          receipt,
                        }),
                      }),
                    onFailure: (error) =>
                      Message.cases.Persistence.make({
                        message: Event.cases.Failed.make({
                          sessionId,
                          localRevision: flight.localRevision,
                          writeId: flight.request.writeId,
                          failure: error.failure,
                        }),
                      }),
                  }),
                )
              }),
            })(),
        }),
      ),
    )
}

export const completed = (result: FlushResult) =>
  Command.define('EditorFlushCompleted', {
    messages: [Message],
    execute: Effect.succeed(Message.cases.FlushCompleted.make({ result })),
  })()

export const reload = (key: DocumentKey, attempt: number) =>
  Command.define('LoadEditorDocument', {
    messages: [Message],
    execute: loadStartup(key).pipe(
      Effect.map((startup) => Message.cases.Loaded.make({ attempt, startup })),
    ),
  })()

export const recover = (key: DocumentKey, attempt: number) =>
  Command.define('RecoverEditorDocument', {
    messages: [Message],
    execute: Effect.gen(function* () {
      const store = yield* DocumentStore

      return yield* store.loadRecovery(key).pipe(
        Effect.match({
          onSuccess: (document) =>
            Message.cases.Recovered.make({
              attempt,
              result: Option.isSome(document)
                ? Recovery.cases.Available.make({ document: document.value })
                : Recovery.cases.Missing.make({}),
            }),
          onFailure: (error) =>
            Message.cases.Recovered.make({
              attempt,
              result: Recovery.cases.Failed.make({ failure: error.failure }),
            }),
        }),
      )
    }),
  })()

export const retention = (sessionId: string) =>
  Command.define('KeepEditorOnDevice', {
    messages: [Message],
    execute: Effect.tryPromise({
      try: async () => {
        if (!navigator.storage?.persist)
          return Message.cases.RetentionChecked.make({ sessionId, status: 'Unavailable' })
        const kept = (await navigator.storage.persisted()) || (await navigator.storage.persist())

        return Message.cases.RetentionChecked.make({
          sessionId,
          status: kept ? 'Persistent' : 'BestEffort',
        })
      },
      catch: () => Message.cases.RetentionChecked.make({ sessionId, status: 'Unavailable' }),
    }).pipe(Effect.catch((message) => Effect.succeed(message))),
  })()

export const download = (source: string) =>
  Command.define('ExportEditorMarkdown', {
    messages: [Message],
    execute: Effect.sync(() => {
      const url = URL.createObjectURL(new Blob([source], { type: 'text/markdown;charset=utf-8' }))
      const link = document.createElement('a')
      link.href = url
      link.download = 'document.md'
      link.click()
      URL.revokeObjectURL(url)

      return Message.cases.Persistence.make({ message: Event.cases.TimersCancelled.make({}) })
    }),
  })()
