import { parse, parseBlock } from '@foldkit-mde/core'
import type { FormattingPlugin } from '@foldkit-mde/core/plugins'

/** Convert one editable line to an ATX heading, or to a paragraph at level zero. */
export const heading = (level: 0 | 1 | 2 | 3 | 4 | 5 | 6): FormattingPlugin => ({
  id: `heading-${level}`,
  apply: (source, selection) => {
    if (selection.start < 0 || selection.end < selection.start || selection.end > source.length)
      return undefined

    const block = parse(source).find(
      (block) => block.start <= selection.start && block.end >= selection.end,
    )

    if (!block?.editable || /[\r\n]/.test(block.source) || (block.heading?.level ?? 0) === level)
      return undefined
    const prefix = block.heading?.prefix ?? ''
    const suffix = block.heading?.suffix ?? ''
    const content = block.source.slice(prefix.length, block.source.length - suffix.length)
    const marker = level === 0 ? '' : `${'#'.repeat(level)} `
    const text = marker + content
    const converted = parseBlock(text)

    if (
      !converted.editable ||
      (converted.heading?.level ?? 0) !== level ||
      converted.inlines.map((inline) => inline.text).join('') !==
        block.inlines.map((inline) => inline.text).join('')
    )
      return undefined
    const start = block.start + prefix.length

    const point = (offset: number) =>
      block.start + marker.length + Math.max(0, Math.min(content.length, offset - start))

    return {
      start: block.start,
      end: block.end,
      text,
      selection: { start: point(selection.start), end: point(selection.end) },
    }
  },
})
