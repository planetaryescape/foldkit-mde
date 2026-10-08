import { Match, Schema } from 'effect'

export const Model = Schema.Struct({ source: Schema.String })

export type Model = typeof Model.Type

export const Message = Schema.TaggedUnion({
  UpdatedSource: { source: Schema.String },
})

export type Message = typeof Message.Type

export const init = (source = ''): Model => ({ source })

export const update = (model: Model, message: Message): Model =>
  Match.value(message).pipe(
    Match.withReturnType<Model>(),
    Match.tagsExhaustive({
      UpdatedSource: ({ source }) => ({ ...model, source }),
    }),
  )
