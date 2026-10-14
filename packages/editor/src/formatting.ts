import * as Core from '@foldkit-mde/core'
import type { FormattingPlugin } from '@foldkit-mde/core/plugins'
import { Predicate, Schema } from 'effect'

export type FormattingTool =
  | {
      readonly kind: 'Button'
      readonly label: string
      readonly plugin: FormattingPlugin
      readonly shortcut?: string
      readonly inputType?: string
    }
  | {
      readonly kind: 'Input'
      readonly label: string
      readonly plugin: FormattingPlugin<string>
      readonly inputLabel: string
      readonly hint: string
      readonly readInput: (source: string, selection: Core.Selection) => string
    }

export const Formatted = Schema.TaggedStruct('Formatted', {
  id: Schema.String,
  input: Schema.String,
  source: Schema.String,
  selection: Core.Selection,
})

export const Message = Schema.Union([Core.Message, Formatted])

export type Message = typeof Message.Type

export const update = (
  tools: ReadonlyArray<FormattingTool>,
  model: Core.Model,
  message: Message,
): Core.Model => {
  if (!Predicate.isTagged(message, 'Formatted')) return Core.update(model, message)

  if (
    message.source !== model.source ||
    message.selection.start !== model.selection.start ||
    message.selection.end !== model.selection.end
  )
    return model
  const tool = tools.find((tool) => tool.plugin.id === message.id)

  if (!tool) return model

  const transaction =
    tool.kind === 'Button'
      ? tool.plugin.apply(model.source, model.selection)
      : tool.plugin.apply(model.source, model.selection, message.input)

  return transaction ? Core.update(model, Core.Message.cases.Applied.make({ transaction })) : model
}
