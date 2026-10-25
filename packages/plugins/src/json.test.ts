import { expect, test } from 'bun:test'

import { Schema } from 'effect'

import { json, JsonDocument } from './json'

test('JSON describes text, marks and raw blocks without losing original Markdown', () => {
  const source = 'A **longer** track.\r\n\r\n::music{id="keep"}\r\n'
  const document = json.project(source)
  expect(document.nodes.map((node) => node._tag)).toEqual(['Paragraph', 'Raw'])
  expect(document).toMatchObject({
    version: 5,
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

test('JSON projects link destinations without treating unsafe raw syntax as active links', () => {
  const document = json.project('A [longer](/mix) track.\n\n[bad](javascript:evil)')
  expect(document.nodes[0]).toMatchObject({
    children: [
      { text: 'A ', bold: false },
      { text: 'longer', bold: false, href: '/mix' },
      { text: ' track.', bold: false },
    ],
  })
  expect(document.nodes[1]?._tag).toBe('Raw')
  expect(document.nodes[1]).toMatchObject({ source: '[bad](javascript:evil)' })
  expect(Schema.decodeSync(JsonDocument)(document)).toEqual(document)
})

test('JSON distinguishes semantic heading levels from paragraphs and protected Markdown', () => {
  const source = '### A **longer** [track](/mix) ###\nParagraph\n\n# `unsupported`'
  const document = json.project(source)
  expect(document.version).toBe(5)
  expect(document.nodes.map((node) => node._tag)).toEqual(['Heading', 'Paragraph', 'Raw'])
  expect(document.nodes[0]).toMatchObject({
    level: 3,
    span: { start: 0, end: 34 },
    children: [
      { text: 'A ', bold: false },
      { text: 'longer', bold: true },
      { text: ' ', bold: false },
      { text: 'track', bold: false, href: '/mix' },
    ],
  })
  expect(document.source).toBe(source)
  expect(Schema.decodeSync(JsonDocument)(document)).toEqual(document)
})

test('JSON version 5 retains each inline mark independently', () => {
  const document = json.project('A *longer* <u>track</u> and <u>~~***mix***~~</u>.')
  expect(document.nodes[0]).toMatchObject({
    children: [
      { text: 'A ', bold: false, italic: false, underline: false },
      { text: 'longer', bold: false, italic: true, underline: false },
      { text: ' ', bold: false, italic: false, underline: false },
      { text: 'track', bold: false, italic: false, underline: true },
      { text: ' and ', bold: false, italic: false, underline: false },
      { text: 'mix', bold: true, italic: true, underline: true, strikethrough: true },
      { text: '.', bold: false, italic: false, underline: false },
    ],
  })
  expect(Schema.decodeSync(JsonDocument)(document)).toEqual(document)
  expect(() => Schema.decodeUnknownSync(JsonDocument)({ ...document, version: 4 })).toThrow()
})

test('JSON describes flat list markers and source-backed alignment', () => {
  const document = json.project('- **First** {align=center}\n7) Second\n\n## Heading {align=right}')
  expect(document.nodes.map((node) => node._tag)).toEqual(['ListItem', 'ListItem', 'Heading'])
  expect(document.nodes).toMatchObject([
    { kind: 'bullet', alignment: 'center', children: [{ text: 'First', bold: true }] },
    { kind: 'ordered', ordinal: 7, children: [{ text: 'Second' }] },
    { level: 2, alignment: 'right' },
  ])
  expect(Schema.decodeSync(JsonDocument)(document)).toEqual(document)
})
