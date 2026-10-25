import { expect, test } from 'bun:test'

import { init, Message, parse, update } from '@foldkit-mde/core'
import { Arbitrary, Effect, Schema } from 'effect'

import { alignment, list } from './blocks'

test('list conversion preserves content, maps a multi-block selection and shares history', () => {
  const source = 'Before\r\n\r\nFirst **mix**\r\n\r\nSecond track\r\n\r\n::music{id="keep"}\r\n'
  const selected = { start: 10, end: 35 }
  const transaction = list('ordered').apply(source, selected)
  expect(transaction?.text).toBe('1. First **mix**\r\n2. Second track')

  if (!transaction) throw new Error('Expected list conversion')
  const formatted = update(init(source), Message.cases.Applied.make({ transaction }))
  expect(formatted.source).toBe(
    'Before\r\n\r\n1. First **mix**\r\n2. Second track\r\n\r\n::music{id="keep"}\r\n',
  )
  expect(
    parse(formatted.source)
      .filter((block) => block.list)
      .map((block) => block.inlines.map((inline) => inline.text).join('')),
  ).toEqual(['First mix', 'Second track'])
  expect(update(formatted, Message.cases.Undo.make({})).source).toBe(source)
  const removed = list('ordered').apply(formatted.source, formatted.selection)
  expect(removed?.text).toBe('First **mix**\r\n\r\nSecond track')
  expect(list('bullet').apply('::music{id="keep"}', { start: 0, end: 0 })).toBeUndefined()
  expect(list('bullet').apply('- [ ] task', { start: 0, end: 0 })).toBeUndefined()
})

test('alignment is source-backed, preserves heading/list spelling and refuses protected blocks', () => {
  for (const source of ['## Mix ##', '7) **Mix**', 'Mix']) {
    const transaction = alignment('right').apply(source, { start: 0, end: 0 })
    expect(transaction?.text).toBe(`${source} {align=right}`)

    if (!transaction) throw new Error('Expected alignment')
    const formatted = update(init(source), Message.cases.Applied.make({ transaction }))
    expect(parse(formatted.source)[0]?.alignment?.value).toBe('right')
    expect(alignment('left').apply(formatted.source, formatted.selection)?.text).toBe(source)
    expect(update(formatted, Message.cases.Undo.make({})).source).toBe(source)
  }

  expect(alignment('center').apply('::music{id="keep"}', { start: 0, end: 0 })).toBeUndefined()
  expect(parse('Mix {align=unsafe}')[0]?.alignment).toBeUndefined()
})

test('generated list and alignment histories retain Unicode content and match an independent source model', async () => {
  // oxlint-disable-next-line effecttsgo/unstable-api-usage -- Schema generation is pinned to Effect 4.0.0.
  const inputs = Arbitrary.schema(
    Schema.Struct({
      words: Schema.Array(Schema.Literals(['a', 'long', '界', '🎵'])),
      ordered: Schema.Boolean,
    }),
  )

  const result = await Effect.runPromise(
    // oxlint-disable-next-line effecttsgo/unstable-api-usage -- The pinned property runner generates and shrinks source histories.
    Arbitrary.checkEffect(
      inputs,
      ({ words, ordered }) => {
        const label = 'Mix ' + words.join(' ')
        const source = label + '\n\n::music{id="keep"}\n'

        const conversion = list(ordered ? 'ordered' : 'bullet').apply(source, {
          start: 0,
          end: label.length,
        })

        if (!conversion) return false
        const model = update(init(source), Message.cases.Applied.make({ transaction: conversion }))
        const expected = (ordered ? '1. ' : '- ') + label

        if (model.source !== expected + '\n\n::music{id="keep"}\n') return false
        const centered = alignment('center').apply(model.source, model.selection)

        if (!centered) return false
        const aligned = update(model, Message.cases.Applied.make({ transaction: centered }))

        return (
          aligned.source === expected + ' {align=center}\n\n::music{id="keep"}\n' &&
          update(update(aligned, Message.cases.Undo.make({})), Message.cases.Undo.make({}))
            .source === source
        )
      },
      { seed: 714, runs: 150, size: 30 },
    ),
  )

  expect(result._tag, JSON.stringify(result)).toBe('Passed')
})
