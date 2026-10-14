import { expect, test } from 'bun:test'

import { init, Message, parse, sourceOffset, update, visualOffset } from '@foldkit-mde/core'
import { Arbitrary, Effect, Schema } from 'effect'

import { link } from './link'

test('a link transaction changes selected words only, supports URL replacement and removal, and shares history', () => {
  const source = 'Before\r\n\r\nslow build\r\n\r\n::music{id="keep"}\r\n'

  const selected = update(
    init(source),
    Message.cases.Selected.make({ selection: { start: 10, end: 14 } }),
  )

  const transaction = link.apply(source, selected.selection, 'https://gbfm.co.za/mixes')

  if (!transaction) throw new Error('Expected link transaction')
  const formatted = update(selected, Message.cases.Applied.make({ transaction }))
  expect(formatted.source).toBe(
    'Before\r\n\r\n[slow](https://gbfm.co.za/mixes) build\r\n\r\n::music{id="keep"}\r\n',
  )
  expect(formatted.selection).toEqual({ start: 11, end: 15 })
  const replacement = link.apply(formatted.source, formatted.selection, '/mixes/night')

  if (!replacement) throw new Error('Expected URL replacement')
  const replaced = update(formatted, Message.cases.Applied.make({ transaction: replacement }))
  expect(replaced.source).toBe(
    'Before\r\n\r\n[slow](/mixes/night) build\r\n\r\n::music{id="keep"}\r\n',
  )
  const removal = link.apply(replaced.source, replaced.selection, '')

  if (!removal) throw new Error('Expected link removal')
  expect(update(replaced, Message.cases.Applied.make({ transaction: removal })).source).toBe(source)
  expect(update(formatted, Message.cases.Undo.make({})).source).toBe(source)
})

test('links reject unsafe destinations and ambiguous selections without changing raw source', () => {
  for (const destination of [
    'javascript:alert%281%29',
    'JaVaScRiPt:evil',
    'data:text/html,evil',
    '//evil.example',
    'https://example.test/a b',
    'https://example.test/a(b)',
    'java\tscript:evil',
  ]) {
    expect(link.apply('A longer track.', { start: 2, end: 8 }, destination)).toBeUndefined()
    expect(parse(`[longer](${destination})`)[0]?.editable).toBe(false)
  }

  for (const destination of [
    'https://example.test/night',
    'http://example.test/',
    'mailto:hello@example.test',
    '/mixes/night',
    '../night',
    'mixes/night',
    '#night',
  ]) {
    expect(link.apply('A longer track.', { start: 2, end: 8 }, destination)?.text).toBe(
      `[longer](${destination})`,
    )
  }

  expect(link.apply('A [longer](/mix) track.', { start: 4, end: 7 }, '/new')).toBeUndefined()
  expect(link.apply('A **longer** track.', { start: 4, end: 10 }, '/new')).toBeUndefined()
  expect(link.apply('```\nlonger\n```', { start: 4, end: 10 }, '/new')).toBeUndefined()
  expect(link.apply('A longer\n\ntrack.', { start: 2, end: 15 }, '/new')).toBeUndefined()
  expect(link.apply('A longer track.', { start: 2, end: 2 }, '/new')).toBeUndefined()
  expect(link.apply('A  longer track.', { start: 2, end: 10 }, '/mix')).toEqual({
    start: 3,
    end: 9,
    text: '[longer](/mix)',
    selection: { start: 4, end: 10 },
  })
  const block = parse('A [longer](/mix) track.')[0]

  if (!block) throw new Error('Expected paragraph')
  expect(sourceOffset(block, 2)).toBe(3)
  expect(sourceOffset(block, 8, 'backward')).toBe(9)
  expect(sourceOffset(block, 8)).toBe(16)
  expect(visualOffset(block, 5)).toBe(4)
  expect(parse('![cover](/art.jpg)')[0]?.editable).toBe(false)
  expect(link.apply('![cover](/art.jpg)', { start: 2, end: 7 }, '/new')).toBeUndefined()
})

test('generated link labels preserve surrounding bytes and round-trip removal across Unicode and whitespace', async () => {
  // oxlint-disable-next-line effecttsgo/unstable-api-usage -- Schema generation is pinned to Effect 4.0.0.
  const labels = Arbitrary.schema(Schema.Array(Schema.Literals(['a', 'long', '界', '🎵', ' '])))

  const result = await Effect.runPromise(
    // oxlint-disable-next-line effecttsgo/unstable-api-usage -- The pinned runner generates and shrinks source-offset cases without another dependency.
    Arbitrary.checkEffect(
      labels,
      (parts) => {
        const label = parts.join('')
        const source = `Before: ${label} after\r\n\r\n::music{id="keep"}\r\n`
        const transaction = link.apply(source, { start: 8, end: 8 + label.length }, '/mix')

        if (!label.trim()) return transaction === undefined

        if (!transaction) return false
        const leading = label.length - label.trimStart().length
        const trailing = label.length - label.trimEnd().length
        const expected = `Before: ${' '.repeat(leading)}[${label.trim()}](/mix)${' '.repeat(trailing)} after\r\n\r\n::music{id="keep"}\r\n`
        const formatted = update(init(source), Message.cases.Applied.make({ transaction }))

        if (
          formatted.source !== expected ||
          formatted.selection.start !== 9 + leading ||
          formatted.selection.end !== 9 + leading + label.trim().length
        )
          return false
        const removal = link.apply(formatted.source, formatted.selection, '')

        return (
          removal !== undefined &&
          update(formatted, Message.cases.Applied.make({ transaction: removal })).source === source
        )
      },
      { seed: 923, runs: 150, size: 30 },
    ),
  )

  expect(result._tag, JSON.stringify(result)).toBe('Passed')
})
