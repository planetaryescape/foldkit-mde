import { expect, test } from 'bun:test'

import { init, Message, parse, sourceOffset, update } from '@foldkit-mde/core'
import { Arbitrary, Effect, Schema } from 'effect'

import { heading } from './heading'
import { bold, italic, strikethrough, underline } from './marks'

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
  const spaced = bold.apply('A  longer track.', { start: 2, end: 10 })

  if (!spaced) throw new Error('Expected whitespace-preserving formatting')

  const spacedModel = update(
    init('A  longer track.'),
    Message.cases.Applied.make({ transaction: spaced }),
  )

  expect(spacedModel.source).toBe('A  **longer** track.')
  expect(spacedModel.selection).toEqual({ start: 5, end: 11 })
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
  expect(heading(1).apply('- words', { start: 2, end: 2 })?.text).toBe('# words')

  for (const protectedSource of [
    '```\nwords\n```',
    '- [ ] task',
    '# `words`',
    'one\ntwo',
    '::music{id="x"}',
  ])
    expect(heading(1).apply(protectedSource, { start: 1, end: 1 })).toBeUndefined()

  expect(heading(1).apply('One\n\nTwo', { start: 1, end: 7 })).toBeUndefined()
  expect(heading(1).apply('Words ###', { start: 1, end: 1 })).toBeUndefined()
  expect(heading(0).apply('## # Inner', { start: 5, end: 5 })).toBeUndefined()
})

test('inline marks compose, toggle independently and restore source and selection through shared undo', () => {
  const original = 'Before\r\n\r\nA longer track.\r\n\r\n::music{id="keep"}\r\n'

  let model = update(
    init(original),
    Message.cases.Selected.make({ selection: { start: 12, end: 18 } }),
  )

  const history = [model]

  for (const [plugin, expected] of [
    [italic, '*longer*'],
    [bold, '***longer***'],
    [underline, '<u>***longer***</u>'],
    [strikethrough, '<u>~~***longer***~~</u>'],
    [italic, '<u>~~**longer**~~</u>'],
    [bold, '<u>~~longer~~</u>'],
    [underline, '~~longer~~'],
    [strikethrough, 'longer'],
  ] as const) {
    const transaction = plugin.apply(model.source, model.selection)

    if (!transaction) throw new Error(`Expected ${plugin.id} transaction`)
    model = update(model, Message.cases.Applied.make({ transaction }))
    expect(model.source).toBe(`Before\r\n\r\nA ${expected} track.\r\n\r\n::music{id="keep"}\r\n`)
    expect(model.source.slice(model.selection.start, model.selection.end)).toBe('longer')
    history.push(model)
  }

  history.pop()
  model = update(model, Message.cases.ChangedMode.make({ mode: 'Markdown' }))

  for (const previous of history.reverse()) {
    model = update(model, Message.cases.Undo.make({}))
    expect(model.source).toBe(previous.source)
    expect(model.selection).toEqual(previous.selection)
  }

  for (const plugin of [italic, underline, strikethrough]) {
    expect(plugin.apply('[longer](/mix)', { start: 1, end: 7 })).toBeUndefined()
    expect(plugin.apply('::music{id="keep"}', { start: 2, end: 7 })).toBeUndefined()
    expect(plugin.apply('one\ntwo', { start: 0, end: 7 })).toBeUndefined()
    expect(plugin.apply('   ', { start: 0, end: 3 })).toBeUndefined()
  }
})

test('partial and mixed selections toggle only the chosen mark and retain selection and undo', () => {
  for (const [id, plugin, marked] of [
    ['bold', bold, '**tracks that stay with you**'],
    ['italic', italic, '*tracks that stay with you*'],
    ['underline', underline, '<u>tracks that stay with you</u>'],
    ['strikethrough', strikethrough, '~~tracks that stay with you~~'],
  ] as const) {
    const source = `Before\r\n\r\n> A place for the ${marked}.\r\n\r\n::music{id="keep"}\r\n`
    const start = source.indexOf('tracks')
    const selection = { start, end: start + 'tracks that stay'.length }
    const initial = update(init(source), Message.cases.Selected.make({ selection }))
    const transaction = plugin.apply(source, selection)
    expect(transaction, plugin.id).toBeDefined()

    if (!transaction) throw new Error('Expected partial mark removal')
    const changed = update(initial, Message.cases.Applied.make({ transaction }))
    const block = parse(changed.source)[1]
    expect(block?.inlines.map((inline) => inline.text).join('')).toBe(
      'A place for the tracks that stay with you.',
    )
    expect(changed.source.slice(changed.selection.start, changed.selection.end)).toBe(
      'tracks that stay',
    )
    expect(block?.inlines.find((inline) => inline.text.includes('tracks'))?.[id]).toBe(false)
    expect(block?.inlines.find((inline) => inline.text.includes('with you'))?.[id]).toBe(true)
    expect(changed.source.startsWith('Before\r\n\r\n> ')).toBe(true)
    expect(changed.source.endsWith('\r\n\r\n::music{id="keep"}\r\n')).toBe(true)
    const undone = update(changed, Message.cases.Undo.make({}))
    expect(undone.source).toBe(source)
    expect(undone.selection).toEqual(selection)
    const restored = plugin.apply(changed.source, changed.selection)

    if (!restored) throw new Error('Expected selected mark reapplication')
    expect(update(changed, Message.cases.Applied.make({ transaction: restored })).source).toBe(
      source,
    )
  }

  const source = 'A **longer** plain *ending*.'
  const selection = { start: source.indexOf('longer'), end: source.indexOf('ending') + 6 }
  const transaction = bold.apply(source, selection)

  if (!transaction) throw new Error('Expected mixed selection formatting')
  const changed = update(init(source), Message.cases.Applied.make({ transaction }))
  expect(
    parse(changed.source)[0]
      ?.inlines.filter((inline) => /longer|plain|ending/.test(inline.text))
      .every((inline) => inline.bold),
  ).toBe(true)
  expect(
    parse(changed.source)[0]?.inlines.find((inline) => inline.text.includes('ending'))?.italic,
  ).toBe(true)
})

test('generated mark histories match independent spellings, source boundaries and undo selections', async () => {
  // oxlint-disable-next-line effecttsgo/unstable-api-usage -- Schema-derived histories use the pinned Effect runner.
  const cases = Arbitrary.schema(
    Schema.Struct({
      parts: Schema.Array(Schema.Literals(['a', '界', '🎵', ' '])),
      operations: Schema.Array(Schema.Literals(['bold', 'italic', 'underline', 'strikethrough'])),
    }),
  )

  const result = await Effect.runPromise(
    // oxlint-disable-next-line effecttsgo/unstable-api-usage -- Generate and shrink real public formatting histories.
    Arbitrary.checkEffect(
      cases,
      ({ parts, operations }) => {
        const label = `Start ${parts.join('')} end`
        const before = 'Before\r\n\r\nA '
        const after = ' track.\r\n\r\n::music{id="keep"}\r\n'

        const spellings = [
          'word',
          '**word**',
          '*word*',
          '***word***',
          '<u>word</u>',
          '<u>**word**</u>',
          '<u>*word*</u>',
          '<u>***word***</u>',
          '~~word~~',
          '~~**word**~~',
          '~~*word*~~',
          '~~***word***~~',
          '<u>~~word~~</u>',
          '<u>~~**word**~~</u>',
          '<u>~~*word*~~</u>',
          '<u>~~***word***~~</u>',
        ]

        const plugins = { bold, italic, underline, strikethrough }
        const bits = { bold: 1, italic: 2, underline: 4, strikethrough: 8 }
        let state = 0

        let model = update(
          init(before + label + after),
          Message.cases.Selected.make({
            selection: { start: before.length, end: before.length + label.length },
          }),
        )

        const history = []

        for (const operation of operations) {
          const transaction = plugins[operation].apply(model.source, model.selection)

          if (!transaction) return false
          history.push(model)
          state ^= bits[operation]
          model = update(model, Message.cases.Applied.make({ transaction }))

          if (
            model.source !== before + spellings[state]?.replace('word', label) + after ||
            model.source.slice(model.selection.start, model.selection.end) !== label
          )
            return false
        }

        for (const previous of history.reverse()) {
          model = update(model, Message.cases.Undo.make({}))

          if (
            model.source !== previous.source ||
            model.selection.start !== previous.selection.start ||
            model.selection.end !== previous.selection.end
          )
            return false
        }

        return true
      },
      { seed: 2391, runs: 150, size: 30 },
    ),
  )

  expect(result._tag, JSON.stringify(result)).toBe('Passed')
})

test('generated partial mark histories match an independent per-character style model', async () => {
  // oxlint-disable-next-line effecttsgo/unstable-api-usage -- Pinned Schema-derived generation exercises public transactions.
  const cases = Arbitrary.schema(
    Schema.Struct({
      parts: Schema.Array(Schema.Literals(['a', '界', '🎵', ' '])),
      operations: Schema.Array(
        Schema.Struct({
          mark: Schema.Literals(['bold', 'italic', 'underline', 'strikethrough']),
          from: Schema.Literals([0, 1, 2, 3, 5, 8, 13]),
          size: Schema.Literals([1, 2, 4, 7, 11]),
        }),
      ),
    }),
  )

  const plugins = { bold, italic, underline, strikethrough }
  const bits = { bold: 1, italic: 2, underline: 4, strikethrough: 8 }
  const keys = ['bold', 'italic', 'underline', 'strikethrough'] as const

  const result = await Effect.runPromise(
    // oxlint-disable-next-line effecttsgo/unstable-api-usage -- Independent character flags, not formatter spelling, decide expected styles.
    Arbitrary.checkEffect(
      cases,
      ({ parts, operations }) => {
        const label = `Left ${parts.join('')} middle tail`
        const units = Array.from(label)
        const expected = Array.from({ length: label.length }, () => 15)
        const before = 'Before\r\n\r\n## '
        const after = ' {align=right}\r\n\r\n::music{id="keep"}\r\n'
        let model = init(before + '<u>~~***' + label + '***~~</u>' + after)
        const history = []

        for (const operation of operations) {
          const first = operation.from % units.length
          const last = Math.min(units.length, first + operation.size)
          const chosen = units.slice(first, last).join('')
          const selected = chosen.trim()

          if (!selected) continue

          const from =
            units.slice(0, first).join('').length + chosen.length - chosen.trimStart().length

          const to = from + selected.length
          const block = parse(model.source)[1]

          if (!block) return false

          const selection = {
            start: sourceOffset(block, from),
            end: sourceOffset(block, to, 'backward'),
          }

          const transaction = plugins[operation.mark].apply(model.source, selection)

          if (!transaction) return false
          history.push(update(model, Message.cases.Selected.make({ selection })))
          const bit = bits[operation.mark]
          const remove = expected.slice(from, to).every((mask) => (mask & bit) !== 0)

          for (let i = from; i < to; i++)
            expected[i] = remove ? (expected[i] ?? 0) & ~bit : (expected[i] ?? 0) | bit
          model = update(history.at(-1) ?? model, Message.cases.Applied.make({ transaction }))
          const changed = parse(model.source)[1]

          const actual = changed?.inlines.flatMap((inline) =>
            inline.text
              .split('')
              .map(() => keys.reduce((mask, key) => mask | (inline[key] ? bits[key] : 0), 0)),
          )

          if (
            JSON.stringify(actual) !== JSON.stringify(expected) ||
            changed?.inlines.map((inline) => inline.text).join('') !== label ||
            !model.source.startsWith(before) ||
            !model.source.endsWith(after)
          )
            return false
        }

        for (const previous of history.reverse()) {
          model = update(model, Message.cases.Undo.make({}))

          if (
            model.source !== previous.source ||
            JSON.stringify(model.selection) !== JSON.stringify(previous.selection)
          )
            return false
        }

        return true
      },
      { seed: 9381, runs: 200, size: 40 },
    ),
  )

  expect(result._tag, JSON.stringify(result)).toBe('Passed')
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
