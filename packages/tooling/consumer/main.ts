import * as Editor from '@foldkit-mde/editor/persistence'
import * as IndexedDb from '@foldkit-mde/persistence/indexed-db'
import { bold } from '@foldkit-mde/plugins/bold'
import { italic } from '@foldkit-mde/plugins/italic'
import { markdown } from '@foldkit-mde/plugins/markdown'
import { Option } from 'effect'
import { Runtime } from 'foldkit'
import type { Document, HtmlBuilder } from 'foldkit/html'

const editor = Editor.make({
  key: { namespace: 'consumer-check', documentId: 'draft-one' },
  seed: 'A standalone Foldkit editor.\n\n::music{id="keep"}',
  policy: { quietMs: 100, maximumMs: 500 },
  formatting: [
    { kind: 'Button', label: 'Bold', plugin: bold, shortcut: 'b', inputType: 'formatBold' },
    { kind: 'Button', label: 'Italic', plugin: italic, shortcut: 'i', inputType: 'formatItalic' },
  ],
})

const view = (model: Editor.Model, h: HtmlBuilder<Editor.Message>): Document => ({
  title: 'Standalone package consumer',
  body: h.main(
    [],
    [
      h.h1([], ['Installed from tarballs']),
      editor.view(model, h),
      h.pre(
        [h.Id('source')],
        [
          Option.match(Editor.project(model, markdown), {
            onNone: () => '',
            onSome: (output) => output.content,
          }),
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
      databaseName: 'foldkit-mde-consumer-check',
      sourceLimit: 65536,
    }),
    init: editor.init,
    update: editor.update,
    view,
    container: document.getElementById('root'),
  }),
  { flags: editor.load },
)
