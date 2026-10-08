import { init, Model, type Message, update } from '@foldkit-mde/core'
import { Synchronize, view as editorView } from '@foldkit-mde/editor'
import { json } from '@foldkit-mde/plugins/json'
import { Runtime } from 'foldkit'
import type { Document, HtmlBuilder } from 'foldkit/html'

const source = `A place for the **tracks that stay with you**.

Start with a slow build. Leave space between the records. Select a few words and try the bold button.

Switch to Markdown to see the source. Your edits and undo history travel with you.

::music{type="album" id="late-night-frequencies"}
`

const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: 'Foldkit MDE | Playground',
  body: h.main(
    [h.Class('playground')],
    [
      h.header(
        [h.Class('playground-header')],
        [
          h.p([h.Class('eyebrow')], ['FOLDKIT / EFFECT / MARKDOWN']),
          h.h1([], ['Make room for the words.']),
          h.p([h.Class('intro')], ['A small editor, built from the source outward.']),
        ],
      ),
      editorView(model, h),
      h.details(
        [h.Class('document-inspector')],
        [
          h.summary([], ['JSON representation']),
          h.p([], ['A read-only plugin output from the same Markdown document.']),
          h.pre(
            [h.AriaLabel('JSON document')],
            [JSON.stringify(json.project(model.source), null, 2)],
          ),
        ],
      ),
      h.footer(
        [h.Class('playground-footer')],
        [
          h.span([], ['foldkit-mde / 0.0.0']),
          h.span([], ['First editing slice. Changes are not saved.']),
        ],
      ),
    ],
  ),
})

Runtime.run(
  Runtime.makeApplication({
    Model,
    init: () => ({ model: init(source), commands: [] }),
    update: (model, message) => {
      const next = update(model, message)

      return {
        model: next,
        commands:
          next.source !== model.source || next.mode !== model.mode
            ? [Synchronize({ source: next.source, mode: next.mode, selection: next.selection })]
            : [],
      }
    },
    view,
    container: document.getElementById('root'),
  }),
)
