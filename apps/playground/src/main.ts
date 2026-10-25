import * as Editor from '@foldkit-mde/editor/persistence'
import * as IndexedDb from '@foldkit-mde/persistence/indexed-db'
import { bold } from '@foldkit-mde/plugins/bold'
import { heading } from '@foldkit-mde/plugins/heading'
import { italic } from '@foldkit-mde/plugins/italic'
import { json } from '@foldkit-mde/plugins/json'
import { link, linkInput } from '@foldkit-mde/plugins/link'
import { underline } from '@foldkit-mde/plugins/underline'
import { Option } from 'effect'
import { Runtime } from 'foldkit'
import type { Document, HtmlBuilder } from 'foldkit/html'

const source = `## Tracks that stay with you

A place for the **tracks that stay with you**.

Start with a slow build. Leave space between the records. Select a few words and try the formatting tools.

Switch to Markdown to see the source. Your edits and undo history travel with you.

::music{type="album" id="late-night-frequencies"}
`

const editor = Editor.make({
  key: { namespace: 'playground', documentId: 'welcome' },
  seed: source,
  policy: { quietMs: 500, maximumMs: 2000 },
  formatting: [
    ...([0, 1, 2, 3, 4, 5, 6] as const).map((level) => ({
      kind: 'Button' as const,
      group: 'Text style',
      label: level === 0 ? 'Paragraph' : `Heading ${level}`,
      plugin: heading(level),
    })),
    {
      kind: 'Button',
      label: 'Bold',
      shortLabel: 'B',
      plugin: bold,
      shortcut: 'b',
      inputType: 'formatBold',
    },
    {
      kind: 'Button',
      label: 'Italic',
      shortLabel: 'I',
      plugin: italic,
      shortcut: 'i',
      inputType: 'formatItalic',
    },
    {
      kind: 'Button',
      label: 'Underline',
      shortLabel: 'U',
      plugin: underline,
      shortcut: 'u',
      inputType: 'formatUnderline',
    },
    {
      kind: 'Input',
      label: 'Apply link',
      triggerLabel: 'Link',
      plugin: link,
      inputLabel: 'Link destination',
      readInput: linkInput,
      hint: 'Select plain words or a whole link label. Use https, http, mailto or a relative URL. Empty removes the link.',
    },
  ],
})

const view = (model: Editor.Model, h: HtmlBuilder<Editor.Message>): Document => ({
  title: 'Foldkit MDE | Playground',
  body: h.main(
    [h.Class('playground')],
    [
      h.header(
        [h.Class('playground-header')],
        [
          h.div([], [h.p([h.Class('eyebrow')], ['FOLDKIT MDE']), h.h1([], ['The writing room'])]),
          h.p([h.Class('intro')], ['A Markdown editor. Your words, one source.']),
        ],
      ),
      editor.view(model, h),
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
