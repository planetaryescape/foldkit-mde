import { parse, parseBlock } from '@foldkit-mde/core'
import type { FormattingPlugin } from '@foldkit-mde/core/plugins'

/** Convert one editable line to an ATX heading, or to a paragraph at level zero. */
export const heading = (level: 0 | 1 | 2 | 3 | 4 | 5 | 6): FormattingPlugin => ({
  id: `heading-${level}`,
  apply: (source, selection) => {
    if (selection.start < 0 || selection.end < selection.start || selection.end > source.length)
      return undefined

    const blocks = parse(source)

    const index = blocks.findIndex(
      (block) => block.start <= selection.start && block.end >= selection.end,
    )

    const block = blocks[index]

    if (
      !block?.editable ||
      /[\r\n]/.test(block.source) ||
      (!block.list && !block.quote && (block.heading?.level ?? 0) === level)
    )
      return undefined
    const prefix = block.heading?.prefix ?? block.quote?.prefix ?? block.list?.prefix ?? ''
    const suffix = (block.heading?.suffix ?? '') + (block.alignment?.suffix ?? '')
    const content = block.source.slice(prefix.length, block.source.length - suffix.length)
    const marker = level === 0 ? '' : `${'#'.repeat(level)} `
    const text = marker + content + (block.alignment?.suffix ?? '')
    const converted = parseBlock(text)

    if (
      !converted.editable ||
      (converted.heading?.level ?? 0) !== level ||
      converted.inlines.map((inline) => inline.text).join('') !==
        block.inlines.map((inline) => inline.text).join('')
    )
      return undefined
    const start = block.start + prefix.length
    const newline = source.includes('\r\n') ? '\r\n' : '\n'

    const before =
      (block.quote || blocks[index - 1]?.quote) &&
      level === 0 &&
      block.start > 0 &&
      !source.slice(0, block.start).endsWith(newline + newline)
        ? newline
        : ''

    const after =
      block.quote &&
      level === 0 &&
      block.end < source.length &&
      !source.slice(block.end).startsWith(newline + newline)
        ? newline
        : ''

    const point = (offset: number) =>
      block.start +
      before.length +
      marker.length +
      Math.max(0, Math.min(content.length, offset - start))

    return {
      start: block.start,
      end: block.end,
      text: before + text + after,
      selection: { start: point(selection.start), end: point(selection.end) },
    }
  },
})
