import { expect, test } from 'bun:test'

import { init, Message, update } from '@foldkit-mde/core'
import { Arbitrary, Effect, Schema } from 'effect'

import { bold } from './bold'
import { heading } from './heading'

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

test('heading conversion preserves inline source, surrounding bytes and selection through shared history', () => {
  const source =
    'Before\r\n\r\n  ###\tA **longer** [track](/mix) ###  \r\n\r\n::music{id="keep"}\r\n'

  const start = source.indexOf('longer')

  const selected = update(
    init(source),
    Message.cases.Selected.make({ selection: { start, end: start + 6 } }),
  )

  const transaction = heading(2).apply(source, selected.selection)

  if (!transaction) throw new Error('Expected heading conversion')
  const converted = update(selected, Message.cases.Applied.make({ transaction }))
  expect(converted.source).toBe(
    'Before\r\n\r\n## A **longer** [track](/mix)\r\n\r\n::music{id="keep"}\r\n',
  )
  expect(converted.source.slice(converted.selection.start, converted.selection.end)).toBe('longer')
  expect(update(converted, Message.cases.Undo.make({})).source).toBe(source)
  const removal = heading(0).apply(converted.source, converted.selection)

  if (!removal) throw new Error('Expected paragraph conversion')
  expect(update(converted, Message.cases.Applied.make({ transaction: removal })).source).toBe(
    'Before\r\n\r\nA **longer** [track](/mix)\r\n\r\n::music{id="keep"}\r\n',
  )
  expect(heading(1).apply('words', { start: 2, end: 2 })?.selection).toEqual({ start: 4, end: 4 })
  expect(heading(6).apply('', { start: 0, end: 0 })?.text).toBe('###### ')
  expect(heading(2).apply('## Same', { start: 3, end: 3 })).toBeUndefined()

  for (const protectedSource of [
    '```\nwords\n```',
    '- words',
    '# *words*',
    'one\ntwo',
    '::music{id="x"}',
  ])
    expect(heading(1).apply(protectedSource, { start: 1, end: 1 })).toBeUndefined()

  expect(heading(1).apply('One\n\nTwo', { start: 1, end: 7 })).toBeUndefined()
  expect(heading(1).apply('Words ###', { start: 1, end: 1 })).toBeUndefined()
  expect(heading(0).apply('## # Inner', { start: 5, end: 5 })).toBeUndefined()
})

test('generated heading conversions preserve Unicode selections and match independent undo histories', async () => {
  // oxlint-disable-next-line effecttsgo/unstable-api-usage -- Schema-derived generation is pinned to Effect 4.0.0.
  const cases = Arbitrary.schema(
    Schema.Struct({
      parts: Schema.Array(Schema.Literals(['a', 'long', '界', '🎵', ' '])),
      levels: Schema.Array(Schema.Literals([0, 1, 2, 3, 4, 5, 6])),
    }),
  )

  const result = await Effect.runPromise(
    // oxlint-disable-next-line effecttsgo/unstable-api-usage -- The pinned runner generates and shrinks real conversion histories.
    Arbitrary.checkEffect(
      cases,
      ({ parts, levels }) => {
        const label = `Start ${parts.join('')} end`
        const before = 'Before\r\n\r\n'
        const after = '\r\n\r\n::music{id="keep"}\r\n'

        let model = update(
          init(before + label + after),
          Message.cases.Selected.make({
            selection: { start: before.length + 1, end: before.length + label.length - 2 },
          }),
        )

        let current = 0
        const history: Array<string> = []

        for (const level of levels) {
          const transaction = heading(level).apply(model.source, model.selection)

          if (level === current) {
            if (transaction !== undefined) return false
            continue
          }

          if (!transaction) return false
          history.push(model.source)
          model = update(model, Message.cases.Applied.make({ transaction }))
          const marker = level === 0 ? '' : `${'#'.repeat(level)} `

          if (
            model.source !== before + marker + label + after ||
            model.selection.start !== before.length + marker.length + 1 ||
            model.selection.end !== before.length + marker.length + label.length - 2
          )
            return false
          current = level
        }

        model = update(model, Message.cases.ChangedMode.make({ mode: 'Markdown' }))

        for (const previous of history.reverse()) {
          model = update(model, Message.cases.Undo.make({}))

          if (model.source !== previous) return false
        }

        return true
      },
      { seed: 1473, runs: 150, size: 30 },
    ),
  )

  expect(result._tag, JSON.stringify(result)).toBe('Passed')
})
