import * as Editor from '@foldkit-mde/editor/persistence'
import * as IndexedDb from '@foldkit-mde/persistence/indexed-db'
import { json } from '@foldkit-mde/plugins/json'
import { Option } from 'effect'
import { Runtime } from 'foldkit'
import type { Document, HtmlBuilder } from 'foldkit/html'

const source = `A place for the **tracks that stay with you**.

Start with a slow build. Leave space between the records. Select a few words and try the bold button.

Switch to Markdown to see the source. Your edits and undo history travel with you.

::music{type="album" id="late-night-frequencies"}
`

const editor = Editor.make({
  key: { namespace: 'playground', documentId: 'welcome' },
  seed: source,
  policy: { quietMs: 500, maximumMs: 2000 },
})

const view = (model: Editor.Model, h: HtmlBuilder<Editor.Message>): Document => ({
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
      Editor.view(model, h),
      h.details(
        [h.Class('document-inspector')],
        [
          h.summary([], ['JSON representation']),
          h.p([], ['A read-only plugin output from the same Markdown document.']),
          h.pre(
            [h.AriaLabel('JSON document')],
            [
              Option.match(Editor.project(model, json), {
                onNone: () => 'Document unavailable until it has loaded.',
                onSome: (output) => JSON.stringify(output.content, null, 2),
              }),
            ],
          ),
        ],
      ),
      h.footer(
        [h.Class('playground-footer')],
        [
          h.span([], ['foldkit-mde / 0.0.0']),
          h.span([], ['Autosaves in this browser. Export a copy for safekeeping.']),
        ],
      ),
    ],
  ),
})

Runtime.run(
  Runtime.makeApplication({
    Model: Editor.Model,
    Flags: Editor.Startup,
    resources: IndexedDb.layer({
      openFactory: () => globalThis.indexedDB,
      databaseName: 'foldkit-mde-playground',
      sourceLimit: 1_048_576,
    }),
    init: editor.init,
    update: editor.update,
    view,
    container: document.getElementById('root'),
  }),
  { flags: editor.load },
)
