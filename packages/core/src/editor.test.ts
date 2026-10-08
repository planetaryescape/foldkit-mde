import { expect, test } from 'bun:test'

import { init, Message, update } from './editor'

test('initialization preserves source without normalizing Markdown', () => {
  const source = '## Mix\r\n\r\n::music{type="album" id="abc"}\r\n'
  expect(init(source)).toEqual({ source })
  expect(init().source).toBe('')
})

test('editing replaces source, leaves the previous Model untouched, and can clear it', () => {
  const previous = init('Original')
  const source = '  **New**\n\n<script>alert("text")</script>\n'
  const edited = update(previous, Message.cases.UpdatedSource.make({ source }))

  expect(edited).toEqual({ source })
  expect(previous.source).toBe('Original')
  expect(update(edited, Message.cases.UpdatedSource.make({ source: '' })).source).toBe('')
})
