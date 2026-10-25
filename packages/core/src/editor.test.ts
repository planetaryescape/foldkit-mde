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
