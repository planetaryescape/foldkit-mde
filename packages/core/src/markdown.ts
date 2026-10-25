export interface Inline {
  readonly text: string
  readonly start: number
  readonly end: number
  readonly bold: boolean
  readonly italic: boolean
  readonly underline: boolean
  readonly strikethrough: boolean
  readonly href?: string
}

export interface Block {
  readonly start: number
  readonly end: number
  readonly source: string
  readonly editable: boolean
  readonly inlines: ReadonlyArray<Inline>
  readonly heading?: {
    readonly level: 1 | 2 | 3 | 4 | 5 | 6
    readonly prefix: string
    readonly suffix: string
  }
}

export const parseInlines = (source: string, offset = 0): ReadonlyArray<Inline> => {
  const result: Array<Inline> = []
  let cursor = 0

  for (const match of source.matchAll(
    /<u>([^<>\r\n]+)<\/u>|(\*{1,3})([^*\r\n]+)\2|\[([^\][\r\n*_`<>\\~]+)\]\(([^\s()<>\\]+)\)|~~([^~\r\n]+)~~/g,
  )) {
    const href = match[5]

    if (
      href !== undefined &&
      (source[match.index - 1] === '!' ||
        href.startsWith('//') ||
        (/^[^/?#]*:/.test(href) && !/^(?:https?:\/\/[^/]+|mailto:.+)/i.test(href)) ||
        Array.from(href).some(
          (character) => character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
        ))
    )
      continue

    if (match.index > cursor) {
      result.push({
        text: source.slice(cursor, match.index),
        start: offset + cursor,
        end: offset + match.index,
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
      })
    }

    const text = match[1] ?? match[3] ?? match[4] ?? match[6] ?? ''
    const stars = match[2]?.length ?? 0
    const prefix = match[1] !== undefined ? 3 : match[6] !== undefined ? 2 : stars || 1
    const start = offset + match.index + prefix

    if (href !== undefined) {
      result.push({
        text,
        start,
        end: start + text.length,
        bold: false,
        italic: false,
        underline: false,
        strikethrough: false,
        href,
      })
    } else {
      // Only the declared marks recurse; other HTML and unsupported syntax remain raw text.
      result.push(
        ...parseInlines(text, start).map((inline) => ({
          ...inline,
          bold: inline.bold || stars >= 2,
          italic: inline.italic || stars === 1 || stars === 3,
          underline: inline.underline || match[1] !== undefined,
          strikethrough: inline.strikethrough || match[6] !== undefined,
        })),
      )
    }

    cursor = match.index + match[0].length
  }

  if (cursor < source.length || result.length === 0) {
    result.push({
      text: source.slice(cursor),
      start: offset + cursor,
      end: offset + source.length,
      bold: false,
      italic: false,
      underline: false,
      strikethrough: false,
    })
  }

  return result
}

/** Parse one block's visible spans while retaining its exact Markdown spelling. */
export const parseBlock = (source: string, start = 0): Block => {
  const opening = /^( {0,3})(#{1,6})([ \t]|$)/.exec(source)
  const level = ([undefined, 1, 2, 3, 4, 5, 6] as const)[opening?.[2]?.length ?? 0]
  const prefix = opening?.[0] ?? ''
  const remainder = source.slice(prefix.length)
  const suffix = /(?:^[#]+[ \t]*$|[ \t]#+[ \t]*$)/.exec(remainder)?.[0] ?? ''

  const heading =
    level !== undefined && !/[\r\n]/.test(source) ? { level, prefix, suffix } : undefined

  const content = heading ? remainder.slice(0, remainder.length - suffix.length) : source
  const inlines = parseInlines(content, start + (heading ? prefix.length : 0))

  const plain = inlines
    .filter((inline) => inline.href === undefined)
    .map((inline) => inline.text)
    .join('')

  const editable =
    (heading !== undefined ||
      !/^(?: {4}|\t|\s{0,3}(?:#|>|[-+*] |\d+[.)] |`{3}|~{3}|::|<(?!u>)|---|===))/m.test(source)) &&
    !inlines.some(
      (inline) =>
        inline.href !== undefined &&
        (inline.bold || inline.italic || inline.underline || inline.strikethrough),
    ) &&
    !/[*_`[\]<>\\|]/.test(plain)

  const block = { start, end: start + source.length, source, editable, inlines }

  return heading ? { ...block, heading } : block
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
    blocks.push(parseBlock(text, start))
  }

  for (const line of lines) {
    if (!line[0]) continue
    const text = line[0].replace(/[\r\n]+$/, '')

    if (!fence && /^ {0,3}#{1,6}(?:[ \t]|$)/.test(text)) {
      append()
      blocks.push(parseBlock(text, line.index))
      start = line.index + line[0].length
      end = start
      blankLines = 0

      continue
    }

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

  if (blocks.length === 0 || (start === end && start === source.length && /[\r\n]$/.test(source)))
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
