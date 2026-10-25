import { expect, test } from 'bun:test'

import { Arbitrary, Effect, Schema } from 'effect'

import { init, Message, parse, sourceOffset, update, visualOffset } from './editor'

test('initialization preserves source without normalizing Markdown', () => {
  const source = '## Mix\r\n\r\n::music{type="album" id="abc"}\r\n'
  expect(init(source).source).toBe(source)
  expect(init().source).toBe('')
})

test('editing replaces source, leaves the previous Model untouched, and can clear it', () => {
  const previous = init('Original')
  const source = '  **New**\n\n<script>alert("text")</script>\n'

  const edited = update(
    previous,
    Message.cases.UpdatedSource.make({ source, selection: { start: 3, end: 3 } }),
  )

  expect(edited.source).toBe(source)
  expect(previous.source).toBe('Original')
  expect(
    update(
      edited,
      Message.cases.UpdatedSource.make({ source: '', selection: { start: 0, end: 0 } }),
    ).source,
  ).toBe('')
})

test('parsing preserves exact spans, protects fenced blocks containing blank lines, and maps bold selections', () => {
  const source =
    '\r\nA **longer** track.\r\n\r\n```md\r\n\r\n# keep\r\n```\r\n\r\n::music{id="x"}\r\n'

  const blocks = parse(source)
  expect(blocks.map((block) => block.source)).toEqual([
    'A **longer** track.',
    '```md\r\n\r\n# keep\r\n```',
    '::music{id="x"}',
  ])
  expect(blocks.map((block) => block.editable)).toEqual([true, false, false])

  for (const block of blocks) expect(source.slice(block.start, block.end)).toBe(block.source)
  const paragraph = blocks[0]

  if (!paragraph) throw new Error('Expected paragraph')
  expect(sourceOffset(paragraph, 3)).toBe(7)
  expect(visualOffset(paragraph, 7)).toBe(3)
  expect(sourceOffset(paragraph, 2)).toBe(6)
  expect(sourceOffset(paragraph, 8, 'backward')).toBe(12)
  expect(sourceOffset(paragraph, 8)).toBe(14)
})

test('empty paragraphs remain editable after inserting a break between existing blocks', () => {
  const source = 'One\n\n\n\nTwo'
  const blocks = parse(source)
  expect(blocks.map((block) => [block.start, block.end, block.source])).toEqual([
    [0, 3, 'One'],
    [5, 5, ''],
    [7, 10, 'Two'],
  ])
  expect(parse('One\n\n').at(-1)?.start).toBe(5)
  expect(parse('')).toHaveLength(1)
  expect(parse('')[0]?.editable).toBe(true)
})

test('ATX headings interrupt paragraphs, preserve source spans and map only visible content', () => {
  const source = 'Before\r\n  ###\tA **longer** title ###  \r\nAfter\r\n#\r\n###### Last'
  const blocks = parse(source)
  expect(blocks.map((block) => block.source)).toEqual([
    'Before',
    '  ###\tA **longer** title ###  ',
    'After',
    '#',
    '###### Last',
  ])
  expect(blocks.every((block) => block.editable)).toBe(true)

  const heading = blocks[1]

  if (!heading) throw new Error('Expected heading')
  expect(heading.inlines.map((inline) => inline.text).join('')).toBe('A longer title')
  expect(sourceOffset(heading, 2)).toBe(source.indexOf('longer'))
  expect(visualOffset(heading, source.indexOf('longer'))).toBe(2)

  for (const block of blocks) expect(source.slice(block.start, block.end)).toBe(block.source)
  expect(parse('```md\n# Protected\n```')[0]?.editable).toBe(false)
  expect(parse('# `unsupported`')[0]?.editable).toBe(false)
  expect(parse('    # Indented')[0]?.editable).toBe(false)
  expect(parse('####### Too many')[0]?.editable).toBe(false)
})

test('inline italic and attribute-free underline map visible text without enabling arbitrary HTML', () => {
  const source = '## A <u>***longer***</u> track'
  const block = parse(source)[0]

  if (!block) throw new Error('Expected heading')
  expect(block.editable).toBe(true)
  expect(block.inlines[1]).toEqual({
    text: 'longer',
    start: 11,
    end: 17,
    bold: true,
    italic: true,
    underline: true,
    strikethrough: false,
  })
  expect(sourceOffset(block, 2)).toBe(11)
  expect(sourceOffset(block, 8, 'backward')).toBe(17)
  expect(visualOffset(block, 14)).toBe(5)
  expect(parse('<u>words</u>')[0]?.editable).toBe(true)
  const struck = parse('## A <u>~~***longer***~~</u> track')[0]

  if (!struck) throw new Error('Expected struck heading')
  expect(struck.editable).toBe(true)
  expect(struck.inlines[1]).toEqual({
    text: 'longer',
    start: 13,
    end: 19,
    bold: true,
    italic: true,
    underline: true,
    strikethrough: true,
  })
  expect(sourceOffset(struck, 2)).toBe(13)
  expect(visualOffset(struck, 16)).toBe(5)

  for (const source of [
    '<u onclick="bad()">words</u>',
    '<script>bad()</script>',
    '*unfinished',
    '<u>unfinished',
    '**<img src=x>**',
    '[<img src=x>](/mix)',
    '[<u onclick="bad()">label</u>](/mix)',
    '[**label**](javascript:evil)',
  ])
    expect(parse(source)[0]?.editable).toBe(false)
})

test('flat lists retain exact markers and map visible selection without exposing alignment attributes', () => {
  const source =
    '- First\r\n13) **Second** {align=right}\r\n\r\n- [ ] task\r\n\r\n```md\r\n- literal\r\n```'

  const blocks = parse(source)
  expect(blocks.map((block) => block.list?.kind)).toEqual([
    'bullet',
    'ordered',
    'bullet',
    undefined,
  ])
  expect(blocks.map((block) => block.editable)).toEqual([true, true, false, false])
  const item = blocks[1]

  if (!item) throw new Error('Expected ordered item')
  expect(item.list).toEqual({ kind: 'ordered', ordinal: 13, prefix: '13) ' })
  expect(item.alignment?.value).toBe('right')
  expect(sourceOffset(item, 0)).toBe(15)
  expect(sourceOffset(item, 6, 'backward')).toBe(21)
  expect(item.inlines.map((inline) => inline.text).join('')).toBe('Second')

  for (const block of blocks) expect(source.slice(block.start, block.end)).toBe(block.source)
})

test('single-level quotes retain inline spans and protect nested, structural and lazy multiline source', () => {
  const source =
    'Before\r\n> A **longer** [track](/mix)\r\n> <u>~~*mix*~~</u> {align=right}\r\n\r\nAfter'

  const blocks = parse(source)
  expect(blocks.map((block) => block.editable)).toEqual([true, true, true, true])
  expect(blocks.map((block) => !!block.quote)).toEqual([false, true, true, false])
  const quoted = blocks[1]

  if (!quoted) throw new Error('Expected quote')
  expect(quoted.quote?.prefix).toBe('> ')
  expect(quoted.inlines.map((inline) => inline.text).join('')).toBe('A longer track')
  expect(quoted.inlines.at(-1)?.href).toBe('/mix')
  expect(sourceOffset(quoted, 2)).toBe(source.indexOf('longer'))
  expect(visualOffset(quoted, source.indexOf('longer') + 3)).toBe(5)
  expect(sourceOffset(quoted, 8, 'backward')).toBe(source.indexOf('longer') + 6)
  expect(blocks[2]?.inlines[0]).toMatchObject({
    italic: true,
    underline: true,
    strikethrough: true,
  })
  expect(blocks[2]?.alignment?.value).toBe('right')

  for (const block of blocks) expect(source.slice(block.start, block.end)).toBe(block.source)

  for (const text of ['>', '> ']) {
    expect(parse(text)[0]?.editable).toBe(true)
    expect(parse(text)[0]?.inlines[0]?.text).toBe('')
  }

  for (const text of [
    '>> nested',
    '> > nested',
    '> # Heading',
    '> - item',
    '> 1. item',
    '>     code',
    '> ```code',
    '> ::music{id="keep"}',
    '> <div>html</div>',
    '> words\nlazy continuation',
    '> words\n> - nested list',
    '> words\n> # nested heading',
    ' > indented',
    '>no space',
    '```md\n> literal\n```',
    '> [bad](javascript:evil)',
  ]) {
    const protectedBlocks = parse(text)
    expect(protectedBlocks, text).toHaveLength(1)
    expect(protectedBlocks[0]?.editable, text).toBe(false)
    expect(protectedBlocks[0]?.source).toBe(text)
  }
})

test('undo and redo restore selection across modes without recording a source no-op', () => {
  const selected = update(
    init('longer track'),
    Message.cases.Selected.make({ selection: { start: 0, end: 6 } }),
  )

  const formatted = update(
    selected,
    Message.cases.Applied.make({
      transaction: { start: 0, end: 6, text: '**longer**', selection: { start: 2, end: 8 } },
    }),
  )

  const raw = update(formatted, Message.cases.ChangedMode.make({ mode: 'Markdown' }))
  const undone = update(raw, Message.cases.Undo.make({}))
  expect(undone.source).toBe('longer track')
  expect(undone.selection).toEqual({ start: 0, end: 6 })
  expect(undone.mode).toBe('Markdown')

  const unchanged = update(
    undone,
    Message.cases.UpdatedSource.make({ source: undone.source, selection: undone.selection }),
  )

  expect(unchanged.past).toHaveLength(0)
  expect(unchanged.future).toHaveLength(1)
  const redone = update(unchanged, Message.cases.Redo.make({}))
  expect(redone.source).toBe('**longer** track')
  expect(redone.selection).toEqual({ start: 2, end: 8 })
})

test('generated editing histories match an independent source history across mode changes', async () => {
  // oxlint-disable-next-line effecttsgo/unstable-api-usage -- Schema-derived generation is pinned to Effect 4.0.0.
  const histories = Arbitrary.schema(
    Schema.Array(Schema.Literals(['edit', 'undo', 'redo', 'mode'])),
  )

  const result = await Effect.runPromise(
    // oxlint-disable-next-line effecttsgo/unstable-api-usage -- The pinned runner generates and shrinks command histories without another dependency.
    Arbitrary.checkEffect(
      histories,
      (commands) => {
        let model = init('seed')
        let text = 'seed'
        const past: Array<string> = []
        const future: Array<string> = []

        for (const command of commands) {
          if (command === 'edit') {
            past.push(text)
            future.length = 0
            text += 'x'
            model = update(
              model,
              Message.cases.UpdatedSource.make({
                source: text,
                selection: { start: text.length, end: text.length },
              }),
            )
          } else if (command === 'undo') {
            const previous = past.pop()

            if (previous !== undefined) {
              future.push(text)
              text = previous
            }

            model = update(model, Message.cases.Undo.make({}))
          } else if (command === 'redo') {
            const next = future.pop()

            if (next !== undefined) {
              past.push(text)
              text = next
            }

            model = update(model, Message.cases.Redo.make({}))
          } else {
            model = update(
              model,
              Message.cases.ChangedMode.make({
                mode: model.mode === 'Visual' ? 'Markdown' : 'Visual',
              }),
            )
          }

          if (
            model.source !== text ||
            model.past.length !== past.length ||
            model.future.length !== future.length
          )
            return false

          if (!model.past.every((snapshot, index) => snapshot.source === past[index])) return false

          if (!model.future.every((snapshot, index) => snapshot.source === future[index]))
            return false
        }

        return true
      },
      { seed: 731, runs: 150, size: 40 },
    ),
  )

  expect(result._tag, JSON.stringify(result)).toBe('Passed')
})
