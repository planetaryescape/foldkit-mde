import { Selection } from '@foldkit-mde/core'
import { Effect, Queue, Schema, Stream } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Mount from 'foldkit/mount'

import { Formatted, type Message, type FormattingTool } from './formatting'

export const inputView = (tool: Extract<FormattingTool, { kind: 'Input' }>) => {
  const Observe = Mount.defineStream(`ObserveFormattingInput:${tool.plugin.id}`, {
    args: { source: Schema.String, selection: Selection },
    messages: [Formatted],
    execute: ({ element, source, selection }) =>
      Stream.callback<typeof Formatted.Type>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const input = element.querySelector('input')

            if (!input) return () => {}

            input.value = tool.readInput(source, selection)
            const clear = () => input.setCustomValidity('')

            const submit = (event: Event) => {
              event.preventDefault()

              if (!tool.plugin.apply(source, selection, input.value)) {
                input.setCustomValidity(tool.hint)
                input.reportValidity()

                return
              }

              Queue.offerUnsafe(
                queue,
                Formatted.make({ id: tool.plugin.id, input: input.value, source, selection }),
              )
            }

            element.addEventListener('submit', submit)
            input.addEventListener('input', clear)

            return () => {
              element.removeEventListener('submit', submit)
              input.removeEventListener('input', clear)
            }
          }),
          (cleanup) => Effect.sync(cleanup),
        ),
      ),
  })

  return (source: string, selection: Selection, h: HtmlBuilder<Message>): Html =>
    h.form(
      [
        h.Key(JSON.stringify({ id: tool.plugin.id, source, selection })),
        h.Id(`mde-input-${tool.plugin.id}`),
        h.Popover('auto'),
        h.AriaLabel(`${tool.inputLabel} editor`),
        h.Class('mde-format-input'),
        h.OnMount(Observe({ source, selection })),
      ],
      [
        h.label(
          [],
          [
            tool.inputLabel,
            h.input([h.Type('text'), h.AriaLabel(tool.inputLabel), h.Autofocus(true)]),
          ],
        ),
        h.button(
          [
            h.Type('submit'),
            h.Disabled(
              selection.start === selection.end &&
                tool.plugin.apply(source, selection, tool.readInput(source, selection)) ===
                  undefined,
            ),
          ],
          [tool.label],
        ),
        h.span([h.Class('mde-format-hint')], [tool.hint]),
      ],
    )
}
