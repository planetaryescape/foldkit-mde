import { expect, test } from 'bun:test'

import { init, Message, update } from '@foldkit-mde/core'

import { bold } from './bold'

test('bold transactions preserve surrounding source, selection whitespace and shared undo', () => {
  const source = 'Before\r\n\r\nslow build\r\n\r\n::music{id="keep"}\r\n'

  const selected = update(
    init(source),
    Message.cases.Selected.make({ selection: { start: 10, end: 14 } }),
  )

  const transaction = bold.apply(source, selected.selection)

  if (!transaction) throw new Error('Expected bold transaction')
  const formatted = update(selected, Message.cases.Applied.make({ transaction }))
  expect(formatted.source).toBe('Before\r\n\r\n**slow** build\r\n\r\n::music{id="keep"}\r\n')
  expect(formatted.selection).toEqual({ start: 12, end: 16 })
  const removal = bold.apply(formatted.source, formatted.selection)

  if (!removal) throw new Error('Expected bold removal')
  expect(update(formatted, Message.cases.Applied.make({ transaction: removal })).source).toBe(
    source,
  )
  expect(update(formatted, Message.cases.Undo.make({})).source).toBe(source)
  expect(bold.apply('A  longer track.', { start: 2, end: 10 })).toEqual({
    start: 3,
    end: 9,
    text: '**longer**',
    selection: { start: 5, end: 11 },
  })
  expect(bold.apply('A **longer** track.', { start: 6, end: 9 })).toBeUndefined()
  expect(bold.apply('   ', { start: 0, end: 3 })).toBeUndefined()
  expect(bold.apply(source, { start: 14, end: 14 })).toBeUndefined()
  expect(bold.apply(source, { start: 0, end: 14 })).toBeUndefined()
  expect(bold.apply('A [longer](/mix) track.', { start: 3, end: 9 })).toBeUndefined()
})
