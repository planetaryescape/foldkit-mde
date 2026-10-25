import {
  parse,
  parseBlock,
  sourceOffset,
  visualOffset,
  type Block,
  type Selection,
  type Transaction,
} from '@foldkit-mde/core'
import type { FormattingPlugin } from '@foldkit-mde/core/plugins'

const spelling = (inline: Block['inlines'][number], text: string): string => {
  if (!text) return ''
  const stars = '*'.repeat(Number(inline.bold) * 2 + Number(inline.italic))
  const strike = inline.strikethrough ? '~~' : ''

  const marked =
    (inline.underline ? '<u>' : '') +
    strike +
    stars +
    text +
    stars +
    strike +
    (inline.underline ? '</u>' : '')

  return inline.href === undefined ? marked : `[${marked}](${inline.href})`
}

const apply = (
  source: string,
  selection: Selection,
  destination: string,
): Transaction | undefined => {
  const { start, end } = selection

  if (start < 0 || end > source.length || start > end) return undefined

  const block = parse(source).find(
    (block) => block.editable && block.start <= start && block.end >= end,
  )

  if (!block) return undefined

  const linked = block.inlines.filter((inline) =>
    start === end
      ? inline.start <= start && inline.end >= end
      : inline.start < end && inline.end > start,
  )

  const first = linked[0]
  const last = linked.at(-1)

  const existing =
    first?.link &&
    (start === end || (first.start === start && last?.end === end)) &&
    linked.every((inline) => inline.link?.start === first.link?.start)
      ? first
      : undefined

  const label = source.slice(start, end)

  if (
    existing === undefined &&
    block.inlines.some(
      (inline) => inline.href !== undefined && start < inline.end && end > inline.start,
    )
  )
    return undefined
  const url = destination.trim()

  if (existing?.link) {
    const span = existing.link
    const content = source.slice(span.labelStart, span.labelEnd)
    const text = url ? `[${content}](${url})` : content
    const proposed = parseBlock(text)

    if (!proposed.editable || (url && proposed.inlines[0]?.href !== url)) return undefined
    const shift = span.start + (url ? 1 : 0) - span.labelStart

    return {
      start: span.start,
      end: span.end,
      text,
      selection: { start: start + shift, end: end + shift },
    }
  }

  if (/[\r\n]/.test(label) || !label.trim()) return undefined

  if (!url) return undefined
  const from = start + label.length - label.trimStart().length
  const to = end - (label.length - label.trimEnd().length)

  if (source[from - 1] === '!') return undefined

  if (
    linked.some(
      (inline) => inline.bold || inline.italic || inline.underline || inline.strikethrough,
    )
  ) {
    let before = ''
    let selected = ''
    let after = ''

    for (const inline of block.inlines) {
      const left = Math.max(0, Math.min(inline.text.length, from - inline.start))
      const right = Math.max(left, Math.min(inline.text.length, to - inline.start))
      before += spelling(inline, inline.text.slice(0, left))
      selected += spelling(inline, inline.text.slice(left, right))
      after += spelling(inline, inline.text.slice(right))
    }

    const prefix = block.heading?.prefix ?? block.quote?.prefix ?? block.list?.prefix ?? ''

    const text =
      prefix +
      before +
      `[${selected}](${url})` +
      after +
      (block.heading?.suffix ?? '') +
      (block.alignment?.suffix ?? '')

    const proposed = parseBlock(text, block.start)

    if (!proposed.editable || !proposed.inlines.some((inline) => inline.href === url))
      return undefined

    return {
      start: block.start,
      end: block.end,
      text,
      selection: {
        start: sourceOffset(proposed, visualOffset(block, from)),
        end: sourceOffset(proposed, visualOffset(block, to), 'backward'),
      },
    }
  }

  const text = `[${source.slice(from, to)}](${url})`
  const proposed = parse(text)[0]

  if (!proposed?.editable || proposed.inlines[0]?.href !== url) return undefined

  return {
    start: from,
    end: to,
    text,
    selection: {
      start: from + 1,
      end: to + 1,
    },
  }
}

export const link: FormattingPlugin<string> = { id: 'link', apply }

export const linkInput = (source: string, selection: Selection): string =>
  parse(source)
    .flatMap((block) => block.inlines)
    .find(
      (inline) =>
        inline.start <= selection.start &&
        inline.end >= selection.start &&
        inline.link !== undefined &&
        selection.end <= inline.link.labelEnd,
    )?.href ?? ''
