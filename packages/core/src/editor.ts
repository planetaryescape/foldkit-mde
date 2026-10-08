import { Match, Schema } from 'effect'

import { bold, Selection, Transaction } from './bold'

export { bold, Selection, Transaction } from './bold'

export { parse, sourceOffset, visualOffset, type Block } from './markdown'

export const Mode = Schema.Literals(['Visual', 'Markdown'])

const Snapshot = Schema.Struct({ source: Schema.String, selection: Selection })

export const Model = Schema.Struct({
  source: Schema.String,
  selection: Selection,
  mode: Mode,
  past: Schema.Array(Snapshot),
  future: Schema.Array(Snapshot),
})

export type Model = typeof Model.Type

export const Message = Schema.TaggedUnion({
  UpdatedSource: { source: Schema.String, selection: Selection },
  Selected: { selection: Selection },
  Applied: { transaction: Transaction },
  ToggledBold: {},
  ChangedMode: { mode: Mode },
  Undo: {},
  Redo: {},
  Synchronized: {},
})

export type Message = typeof Message.Type

export const init = (source = ''): Model => ({
  source,
  selection: { start: 0, end: 0 },
  mode: 'Visual',
  past: [],
  future: [],
})

const replace = (model: Model, source: string, selection: Selection): Model =>
  source === model.source
    ? { ...model, selection }
    : {
        ...model,
        source,
        selection,
        past: [...model.past, { source: model.source, selection: model.selection }],
        future: [],
      }

const apply = (model: Model, transaction: Transaction): Model => {
  if (
    transaction.start < 0 ||
    transaction.end < transaction.start ||
    transaction.end > model.source.length
  )
    return model

  return replace(
    model,
    model.source.slice(0, transaction.start) +
      transaction.text +
      model.source.slice(transaction.end),
    transaction.selection,
  )
}

export const update = (model: Model, message: Message): Model =>
  Match.value(message).pipe(
    Match.withReturnType<Model>(),
    Match.tagsExhaustive({
      UpdatedSource: ({ source, selection }) => replace(model, source, selection),
      Selected: ({ selection }) => ({ ...model, selection }),
      Applied: ({ transaction }) => apply(model, transaction),
      ToggledBold: () => {
        const transaction = bold(model.source, model.selection)

        return transaction ? apply(model, transaction) : model
      },
      ChangedMode: ({ mode }) => ({ ...model, mode }),
      Undo: () => {
        const previous = model.past.at(-1)

        return previous
          ? {
              ...model,
              ...previous,
              past: model.past.slice(0, -1),
              future: [...model.future, { source: model.source, selection: model.selection }],
            }
          : model
      },
      Redo: () => {
        const next = model.future.at(-1)

        return next
          ? {
              ...model,
              ...next,
              future: model.future.slice(0, -1),
              past: [...model.past, { source: model.source, selection: model.selection }],
            }
          : model
      },
      Synchronized: () => model,
    }),
  )
