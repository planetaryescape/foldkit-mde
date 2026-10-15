import { Message as CoreMessage, type Model } from '@foldkit-mde/core'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Formatted, type Message, update, type FormattingTool } from './formatting'
import { inputView } from './formatting-input'
import { observe } from './surface'

export { Synchronize } from './surface'

export { Message, Formatted, type FormattingTool } from './formatting'

export { Model } from '@foldkit-mde/core'

export const make = (tools: ReadonlyArray<FormattingTool> = []) => {
  const Observe = observe(tools)
  const inputs = tools.flatMap((tool) => (tool.kind === 'Input' ? [inputView(tool)] : []))

  const view = (model: Model, h: HtmlBuilder<Message>): Html =>
    h.section(
      [h.Class('mde'), h.AriaLabel('Markdown editor')],
      [
        h.div(
          [h.Class('mde-toolbar')],
          [
            h.div(
              [h.Class('mde-modes'), h.AriaLabel('Editing mode')],
              ['Visual', 'Markdown'].map((mode) =>
                h.button(
                  [
                    h.Type('button'),
                    h.Class(model.mode === mode ? 'is-active' : ''),
                    h.OnClick(
                      CoreMessage.cases.ChangedMode.make({
                        mode: mode === 'Visual' ? 'Visual' : 'Markdown',
                      }),
                    ),
                  ],
                  [mode],
                ),
              ),
            ),
            h.div(
              [h.Class('mde-actions')],
              [
                ...tools.flatMap((tool) =>
                  tool.kind === 'Button'
                    ? [
                        h.button(
                          [
                            h.Type('button'),
                            h.AriaLabel(tool.label),
                            h.Disabled(
                              tool.plugin.apply(model.source, model.selection) === undefined,
                            ),
                            h.OnClick(
                              Formatted.make({
                                id: tool.plugin.id,
                                input: '',
                                source: model.source,
                                selection: model.selection,
                              }),
                            ),
                          ],
                          [tool.label],
                        ),
                      ]
                    : [],
                ),
                h.button(
                  [
                    h.Type('button'),
                    h.Disabled(model.past.length === 0),
                    h.OnClick(CoreMessage.cases.Undo.make({})),
                  ],
                  ['Undo'],
                ),
                h.button(
                  [
                    h.Type('button'),
                    h.Disabled(model.future.length === 0),
                    h.OnClick(CoreMessage.cases.Redo.make({})),
                  ],
                  ['Redo'],
                ),
              ],
            ),
          ],
        ),
        ...inputs.map((input) => input(model.source, model.selection, h)),
        h.div(
          [h.Class('mde-canvas')],
          [
            h.span(
              [h.Class('mde-label')],
              [
                model.mode === 'Visual'
                  ? 'Write here. Select words to use the formatting tools.'
                  : 'The source. Nothing hidden.',
              ],
            ),
            h.div(
              [
                h.Id('mde-surface'),
                h.OnMount(
                  Observe({ source: model.source, mode: model.mode, selection: model.selection }),
                ),
              ],
              [],
            ),
          ],
        ),
        h.div(
          [h.Class('mde-status')],
          [
            h.span(
              [],
              [
                model.mode === 'Visual'
                  ? 'Paragraphs, headings, bold + links. Other blocks: edit their source.'
                  : 'Markdown edits share the same undo history.',
              ],
            ),
            h.span([], [`${model.source.length.toLocaleString()} characters`]),
          ],
        ),
      ],
    )

  return { view, update: (model: Model, message: Message) => update(tools, model, message) }
}
