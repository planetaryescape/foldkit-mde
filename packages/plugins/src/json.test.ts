import { expect, test } from 'bun:test'

import { Schema } from 'effect'

import { json, JsonDocument } from './json'

test('JSON describes text, marks and raw blocks without losing original Markdown', () => {
  const source = 'A **longer** track.\r\n\r\n::music{id="keep"}\r\n'
  const document = json.project(source)
  expect(document.nodes.map((node) => node._tag)).toEqual(['Paragraph', 'Raw'])
  expect(document).toMatchObject({
    version: 1,
    source,
    nodes: [
      {
        span: { start: 0, end: 19 },
        children: [
          { text: 'A ', bold: false },
          { text: 'longer', bold: true },
          { text: ' track.', bold: false },
        ],
      },
      { span: { start: 23, end: 41 }, source: '::music{id="keep"}' },
    ],
  })
  expect(Schema.decodeSync(JsonDocument)(document)).toEqual(document)
  expect(Schema.decodeSync(Schema.fromJsonString(JsonDocument))(JSON.stringify(document))).toEqual(
    document,
  )
})

test('JSON projection is derived after edits rather than holding independent state', () => {
  const before = json.project('words')
  const after = json.project('**words**')
  expect(before.nodes[0]).toMatchObject({
    span: { start: 0, end: 5 },
    children: [{ text: 'words', bold: false }],
  })
  expect(after.nodes[0]).toMatchObject({
    span: { start: 0, end: 9 },
    children: [{ text: 'words', bold: true }],
  })
})
