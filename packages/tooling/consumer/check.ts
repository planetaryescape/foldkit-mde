import * as Core from '@foldkit-mde/core'
import type { FormattingPlugin } from '@foldkit-mde/core/plugins'
import * as Editor from '@foldkit-mde/editor'
import * as PersistentEditor from '@foldkit-mde/editor/persistence'
import * as Autosave from '@foldkit-mde/persistence/autosave'
import * as IndexedDb from '@foldkit-mde/persistence/indexed-db'
import * as Memory from '@foldkit-mde/persistence/memory'
import { DocumentStore } from '@foldkit-mde/persistence/store'
import { alignment, list, quote } from '@foldkit-mde/plugins/blocks'
import { bold } from '@foldkit-mde/plugins/bold'
import { heading } from '@foldkit-mde/plugins/heading'
import { italic } from '@foldkit-mde/plugins/italic'
import { json } from '@foldkit-mde/plugins/json'
import { link, linkInput } from '@foldkit-mde/plugins/link'
import { markdown } from '@foldkit-mde/plugins/markdown'
import { strikethrough } from '@foldkit-mde/plugins/strikethrough'
import { underline } from '@foldkit-mde/plugins/underline'
import { Effect, Option } from 'effect'

const tools: ReadonlyArray<FormattingPlugin> = [
  bold,
  italic,
  underline,
  strikethrough,
  heading(2),
  list('bullet'),
  alignment('center'),
  quote,
]

const source = 'A longer track.\n\n::music{id="keep"}'

const selection = { start: 2, end: 8 }

const editor = Editor.make([{ kind: 'Button', label: 'Bold', plugin: bold }])

const initial = Core.update(Core.init(source), Core.Message.cases.Selected.make({ selection }))

const changed = editor.update(
  initial,
  Editor.Formatted.make({ id: 'bold', input: '', source, selection }),
)

if (changed.source !== 'A **longer** track.\n\n::music{id="keep"}')
  throw new Error('Formatting failed')

if (editor.update(changed, Core.Message.cases.Undo.make({})).source !== source)
  throw new Error('Undo failed')

if (
  markdown.project(changed.source) !== changed.source ||
  json.project(changed.source).version !== 6
)
  throw new Error('Representation failed')

if (
  !tools.every((tool) => tool.apply(source, selection)) ||
  !link.apply(source, selection, 'https://example.test')
)
  throw new Error('Plugin exports failed')

if (linkInput(source, selection) !== '') throw new Error('Link input failed')

const persistent = PersistentEditor.make({
  key: { namespace: 'consumer', documentId: 'one' },
  seed: source,
  policy: { quietMs: 10, maximumMs: 50 },
})

await Effect.runPromise(
  Effect.gen(function* () {
    const startup = yield* persistent.load
    const { model } = persistent.init(startup)

    if (Option.getOrUndefined(PersistentEditor.project(model, markdown))?.content !== source)
      throw new Error('Persistent editor startup failed')
    const store = yield* DocumentStore
    const loaded = yield* store.load({ namespace: 'consumer', documentId: 'one' })

    if (Option.isSome(loaded)) throw new Error('Fresh memory store was not empty')
  }).pipe(Effect.provide(Memory.layer({ sourceLimit: 65536 }))),
)

if (!IndexedDb.layer || !Autosave.transition) throw new Error('Persistence exports failed')
