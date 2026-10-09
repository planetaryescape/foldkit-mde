import * as Core from '@foldkit-mde/core'
import type { Representation } from '@foldkit-mde/core/plugins'
import {
  Event,
  Policy,
  startSession,
  transition,
  type Transition,
} from '@foldkit-mde/persistence/autosave'
import type { DocumentStore, DocumentKey } from '@foldkit-mde/persistence/store'
import { Match, Option } from 'effect'
import * as Command from 'foldkit/command'

import * as Commands from './persistence-commands'
import { Message, Model, Recovery, Startup } from './persistence-model'
import { Synchronize } from './surface'

export { Message, Model, Startup } from './persistence-model'

export { view } from './persistence-view'

export interface Options {
  readonly key: DocumentKey
  readonly seed: string
  readonly policy: Policy
}

export interface ContentOutput<Output> {
  readonly key: DocumentKey
  readonly localRevision: number
  readonly representationId: string
  readonly content: Output
}

export const project = <Output>(
  model: Model,
  representation: Representation<Output>,
): Option.Option<ContentOutput<Output>> =>
  Model.guards.Editing(model)
    ? Option.some({
        key: model.saving.key,
        localRevision: model.saving.localRevision,
        representationId: representation.id,
        content: representation.project(model.editor.source),
      })
    : Option.none()

type Return = {
  readonly model: Model
  readonly commands: ReadonlyArray<Command.Command<Message, never, DocumentStore>>
}

export const make = (options: Options) => {
  const commands = Commands.makeCommands(Policy.make(options.policy))

  const saving = (model: Extract<Model, { _tag: 'Editing' }>, result: Transition): Return => ({
    model: { ...model, saving: result.state },
    commands: [...commands(result.intents), ...result.outputs.map(Commands.completed)],
  })

  const init = (startup: Startup): Return =>
    Startup.match(startup, {
      Loaded: ({ key, document, sessionId }) => {
        const state = startSession(key, sessionId, document)

        return saving(
          Model.cases.Editing.make({
            editor: Core.init(
              Option.match(document, {
                onNone: () => options.seed,
                onSome: (document) => document.source,
              }),
            ),
            saving: state.state,
            retention: 'Unknown',
          }),
          state,
        )
      },
      LoadFailed: ({ key, failure }): Return => ({
        model: Model.cases.LoadFailed.make({
          key,
          attempt: 0,
          loading: false,
          failure,
          recovery: Recovery.cases.NotRequested.make({}),
        }),
        commands: [],
      }),
    })

  const update = (model: Model, message: Message): Return => {
    const unchanged: Return = { model, commands: [] }

    return Match.value(message).pipe(
      Match.withReturnType<Return>(),
      Match.tagsExhaustive({
        Editor: ({ message }) => {
          if (!Model.guards.Editing(model)) return unchanged
          const editor = Core.update(model.editor, message)
          const next = { ...model, editor }

          const result =
            editor.source === model.editor.source
              ? { model: next, commands: [] }
              : saving(
                  next,
                  transition(model.saving, Event.cases.SourceChanged.make({}), editor.source),
                )

          return {
            ...result,
            commands: [
              ...result.commands,
              ...(editor.source !== model.editor.source || editor.mode !== model.editor.mode
                ? [
                    Command.mapMessage(
                      Synchronize({
                        source: editor.source,
                        mode: editor.mode,
                        selection: editor.selection,
                      }),
                      (message) => Message.cases.Editor.make({ message }),
                    ),
                  ]
                : []),
            ],
          }
        },
        Persistence: ({ message }) =>
          Model.guards.Editing(model)
            ? saving(model, transition(model.saving, message, model.editor.source))
            : unchanged,
        FlushCompleted: () => unchanged,
        RetryLoad: () => {
          if (
            !Model.guards.LoadFailed(model) ||
            model.loading ||
            model.attempt === Number.MAX_SAFE_INTEGER
          )
            return unchanged
          const attempt = model.attempt + 1

          return {
            model: {
              ...model,
              loading: true,
              attempt,
              recovery: Recovery.cases.NotRequested.make({}),
            },
            commands: [Commands.reload(model.key, attempt)],
          }
        },
        Loaded: ({ attempt, startup }) => {
          if (!Model.guards.LoadFailed(model) || !model.loading || model.attempt !== attempt)
            return unchanged
          const next = init(startup)

          return {
            ...next,
            model: Model.guards.LoadFailed(next.model) ? { ...next.model, attempt } : next.model,
          }
        },
        RequestRecovery: () =>
          Model.guards.LoadFailed(model) &&
          !model.loading &&
          !Recovery.guards.Loading(model.recovery)
            ? {
                model: { ...model, recovery: Recovery.cases.Loading.make({}) },
                commands: [Commands.recover(model.key, model.attempt)],
              }
            : unchanged,
        Recovered: ({ attempt, result }) =>
          Model.guards.LoadFailed(model) &&
          !model.loading &&
          model.attempt === attempt &&
          Recovery.guards.Loading(model.recovery)
            ? { model: { ...model, recovery: result }, commands: [] }
            : unchanged,
        RequestRetention: () =>
          Model.guards.Editing(model)
            ? { model, commands: [Commands.retention(model.saving.sessionId)] }
            : unchanged,
        RetentionChecked: ({ sessionId, status }) =>
          Model.guards.Editing(model) && model.saving.sessionId === sessionId
            ? { model: { ...model, retention: status }, commands: [] }
            : unchanged,
        ExportMarkdown: () => {
          if (Model.guards.Editing(model))
            return { model, commands: [Commands.download(model.editor.source)] }

          return Recovery.guards.Available(model.recovery)
            ? { model, commands: [Commands.download(model.recovery.document.source)] }
            : unchanged
        },
      }),
    )
  }

  return { load: Commands.loadStartup(options.key), init, update }
}
