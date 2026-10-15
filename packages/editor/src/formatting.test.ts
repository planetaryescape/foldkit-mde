import { expect, test } from 'bun:test'

import * as Core from '@foldkit-mde/core'

import { Formatted, make, type FormattingTool } from './view'

test('only host-selected formatting is invoked, stale requests do not edit and accepted edits share core history', () => {
  const tool: FormattingTool = {
    kind: 'Input',
    label: 'Wrap',
    inputLabel: 'Wrapper',
    hint: 'Enter a wrapper',
    readInput: () => '',
    plugin: {
      id: 'wrap',
      apply: (_source, selection, input) => ({
        start: selection.start,
        end: selection.end,
        text: input,
        selection: { start: selection.start, end: selection.start + input.length },
      }),
    },
  }

  const editor = make([tool])

  const model = Core.update(
    Core.init('One longer track'),
    Core.Message.cases.Selected.make({ selection: { start: 4, end: 10 } }),
  )

  const request = Formatted.make({
    id: 'wrap',
    input: 'shorter!',
    source: model.source,
    selection: model.selection,
  })

  expect(make().update(model, request)).toEqual(model)
  const edited = editor.update(model, request)
  expect(edited.source).toBe('One shorter! track')
  expect(editor.update(edited, Core.Message.cases.Undo.make({})).source).toBe(model.source)
  expect(editor.update(edited, request)).toEqual(edited)

  const moved = editor.update(
    model,
    Core.Message.cases.Selected.make({ selection: { start: 0, end: 3 } }),
  )

  expect(editor.update(moved, request)).toEqual(moved)
})
