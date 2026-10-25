import { expect, test } from 'bun:test'

import { init, Message, parse, update } from '@foldkit-mde/core'
import { Arbitrary, Effect, Schema } from 'effect'

import { alignment, list, quote } from './blocks'
import { heading } from './heading'
import { link } from './link'

test('quote conversion removes heading/list prefixes, preserves marks and maps selection through shared history', () => {
  for (const original of [
    'A **longer** track',
    '## A **longer** track ##',
    '7) A **longer** track',
  ]) {
    const source = `Before\r\n\r\n${original} {align=right}\r\n\r\n::music{id="keep"}\r\n`
    const start = source.indexOf('longer')
    const selected = { start, end: start + 6 }
    const transaction = quote.apply(source, selected)

    if (!transaction) throw new Error('Expected quote conversion')
    const initial = update(init(source), Message.cases.Selected.make({ selection: selected }))
    const quoted = update(initial, Message.cases.Applied.make({ transaction }))
    expect(quoted.source).toBe(
      'Before\r\n\r\n> A **longer** track {align=right}\r\n\r\n::music{id="keep"}\r\n',
    )
    expect(quoted.source.slice(quoted.selection.start, quoted.selection.end)).toBe('longer')
    expect(quote.apply(quoted.source, quoted.selection)?.text).toBe(
      'A **longer** track {align=right}',
    )
    expect(heading(0).apply(quoted.source, quoted.selection)?.text).toBe(
      'A **longer** track {align=right}',
    )
    expect(heading(2).apply(quoted.source, quoted.selection)?.text).toBe(
      '## A **longer** track {align=right}',
    )
    expect(list('bullet').apply(quoted.source, quoted.selection)?.text).toBe(
      '- A **longer** track {align=right}',
    )
    expect(link.apply(quoted.source, quoted.selection, '/mix')?.text).toBe(
      '> A [**longer**](/mix) track {align=right}',
    )
    const markdown = update(quoted, Message.cases.ChangedMode.make({ mode: 'Markdown' }))
    const undone = update(markdown, Message.cases.Undo.make({}))
    expect(undone.source).toBe(source)
    expect(undone.selection).toEqual(selected)
    expect(update(undone, Message.cases.Redo.make({})).source).toBe(quoted.source)
  }

  for (const source of [
    '> > nested',
    '> # heading',
    '> - list',
    '> words\nlazy',
    '::music{id="keep"}',
  ])
    expect(quote.apply(source, { start: 0, end: 0 })).toBeUndefined()
  expect(quote.apply('One\n\nTwo', { start: 0, end: 8 })).toBeUndefined()
})

test('quote and paragraph conversion separate neighboring source rather than creating lazy continuations', () => {
  const source = '> First\r\n> Second\r\n> Third'
  const transaction = heading(0).apply(source, { start: 11, end: 17 })

  if (!transaction) throw new Error('Expected paragraph conversion')
  const converted = update(init(source), Message.cases.Applied.make({ transaction }))
  expect(converted.source).toBe('> First\r\n\r\nSecond\r\n\r\n> Third')
  expect(parse(converted.source).every((block) => block.editable)).toBe(true)
  expect(converted.source.slice(converted.selection.start, converted.selection.end)).toBe('Second')
  const quoted = quote.apply('## Heading\nAfter', { start: 3, end: 3 })
  expect(quoted?.text).toBe('> Heading\n')

  for (const following of ['## Second', '- Second']) {
    const adjacent = `> First\n${following}`
    const selection = { start: adjacent.indexOf('Second'), end: adjacent.length }
    expect(heading(0).apply(adjacent, selection)?.text).toBe('\nSecond')

    if (following.startsWith('-'))
      expect(list('bullet').apply(adjacent, selection)?.text).toBe('\nSecond')
  }
})

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

test('generated quote, list and alignment histories retain Unicode content and match an independent source model', async () => {
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

        const quotation = quote.apply(source, {
          start: 0,
          end: label.length,
        })

        if (!quotation) return false
        const quoted = update(init(source), Message.cases.Applied.make({ transaction: quotation }))

        if (quoted.source !== '> ' + source) return false

        const conversion = list(ordered ? 'ordered' : 'bullet').apply(
          quoted.source,
          quoted.selection,
        )

        if (!conversion) return false
        const model = update(quoted, Message.cases.Applied.make({ transaction: conversion }))
        const expected = (ordered ? '1. ' : '- ') + label

        if (model.source !== expected + '\n\n::music{id="keep"}\n') return false
        const centered = alignment('center').apply(model.source, model.selection)

        if (!centered) return false
        const aligned = update(model, Message.cases.Applied.make({ transaction: centered }))

        const undone = update(
          update(aligned, Message.cases.Undo.make({})),
          Message.cases.Undo.make({}),
        )

        return (
          aligned.source === expected + ' {align=center}\n\n::music{id="keep"}\n' &&
          undone.source === '> ' + source &&
          update(undone, Message.cases.Undo.make({})).source === source
        )
      },
      { seed: 714, runs: 150, size: 30 },
    ),
  )

  expect(result._tag, JSON.stringify(result)).toBe('Passed')
})
