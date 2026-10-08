export interface Inline {
  readonly text: string
  readonly start: number
  readonly end: number
  readonly bold: boolean
}

export interface Block {
  readonly start: number
  readonly end: number
  readonly source: string
  readonly editable: boolean
  readonly inlines: ReadonlyArray<Inline>
}

export const parseInlines = (source: string, offset = 0): ReadonlyArray<Inline> => {
  const result: Array<Inline> = []
  let cursor = 0

  for (const match of source.matchAll(/\*\*([^*\r\n]+)\*\*/g)) {
    if (match.index > cursor) {
      result.push({
        text: source.slice(cursor, match.index),
        start: offset + cursor,
        end: offset + match.index,
        bold: false,
      })
    }

    const text = match[1] ?? ''
    result.push({
      text,
      start: offset + match.index + 2,
      end: offset + match.index + 2 + text.length,
      bold: true,
    })
    cursor = match.index + match[0].length
  }

  if (cursor < source.length || result.length === 0) {
    result.push({
      text: source.slice(cursor),
      start: offset + cursor,
      end: offset + source.length,
      bold: false,
    })
  }

  return result
}

export const parse = (source: string): ReadonlyArray<Block> => {
  const blocks: Array<Block> = []
  const lines = Array.from(source.matchAll(/[^\r\n]*(?:\r\n|\n|\r|$)/g))
  let start = 0
  let end = 0
  let fence = ''
  let blankLines = 0

  const append = () => {
    if (end <= start) return
    const text = source.slice(start, end).replace(/[\r\n]+$/, '')
    const inlines = parseInlines(text, start)
    const plain = text.replace(/\*\*[^*\r\n]+\*\*/g, '')

    const editable =
      !/^(?: {4}|\t|\s{0,3}(?:#|>|[-+*] |\d+[.)] |`{3}|~{3}|::|<|---|===))/m.test(text) &&
      !/[*_`[\]<>\\|]/.test(plain)

    blocks.push({ start, end: start + text.length, source: text, editable, inlines })
  }

  for (const line of lines) {
    if (!line[0]) continue
    const text = line[0].replace(/[\r\n]+$/, '')
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(text)?.[1]

    if (marker && !fence) fence = marker
    else if (marker && marker[0] === fence[0] && marker.length >= fence.length) fence = ''

    if (!text.trim() && !fence) {
      append()
      blankLines += 1

      if (blocks.length > 0 && blankLines > 1 && blankLines % 2 === 0) {
        blocks.push({
          start: line.index,
          end: line.index,
          source: '',
          editable: true,
          inlines: parseInlines('', line.index),
        })
      }

      start = line.index + line[0].length
      end = start
    } else {
      blankLines = 0
      end = line.index + line[0].length
    }
  }

  append()

  if (blocks.length === 0 || (start === end && start === source.length))
    blocks.push({
      start: source.length,
      end: source.length,
      source: '',
      editable: true,
      inlines: parseInlines('', source.length),
    })

  return blocks
}

export const sourceOffset = (
  block: Block,
  visualOffset: number,
  affinity: 'forward' | 'backward' = 'forward',
): number => {
  let remaining = Math.max(0, visualOffset)

  for (const [index, inline] of block.inlines.entries()) {
    if (
      remaining < inline.text.length ||
      (remaining === inline.text.length &&
        (affinity === 'backward' || index === block.inlines.length - 1))
    )
      return inline.start + remaining
    remaining -= inline.text.length
  }

  return block.end
}

export const visualOffset = (block: Block, offset: number): number => {
  let result = 0

  for (const inline of block.inlines) {
    if (offset <= inline.end) return result + Math.max(0, offset - inline.start)
    result += inline.text.length
  }

  return result
}
