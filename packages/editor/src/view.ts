import { bold, Message, type Model } from '@foldkit-mde/core'
import type { Html, HtmlBuilder } from 'foldkit/html'

import { Observe } from './surface'

export { Synchronize } from './surface'

export const view = (model: Model, h: HtmlBuilder<Message>): Html =>
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
                    Message.cases.ChangedMode.make({
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
              h.button(
                [
                  h.Type('button'),
                  h.AriaLabel('Toggle bold'),
                  h.Disabled(bold(model.source, model.selection) === undefined),
                  h.OnClick(Message.cases.ToggledBold.make({})),
                ],
                [h.strong([], ['B'])],
              ),
              h.button(
                [
                  h.Type('button'),
                  h.Disabled(model.past.length === 0),
                  h.OnClick(Message.cases.Undo.make({})),
                ],
                ['Undo'],
              ),
              h.button(
                [
                  h.Type('button'),
                  h.Disabled(model.future.length === 0),
                  h.OnClick(Message.cases.Redo.make({})),
                ],
                ['Redo'],
              ),
            ],
          ),
        ],
      ),
      h.div(
        [h.Class('mde-canvas')],
        [
          h.span(
            [h.Class('mde-label')],
            [
              model.mode === 'Visual'
                ? 'Write here. Select words to make them bold.'
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
                ? 'Paragraphs + bold. Other blocks: edit their source.'
                : 'Markdown edits share the same undo history.',
            ],
          ),
          h.span([], [`${model.source.length.toLocaleString()} characters`]),
        ],
      ),
    ],
  )
