import { parse, type Block } from '@foldkit-mde/core'
import type { FormattingPlugin } from '@foldkit-mde/core/plugins'

/** Toggle a selection of single-line blocks between flat lists and paragraphs. */
export const list = (kind: 'bullet' | 'ordered'): FormattingPlugin => ({
  id: `list-${kind}`,
  apply: (source, selection) => {
    const blocks = parse(source)

    const first = blocks.findIndex(
      (block) => block.start <= selection.start && block.end >= selection.start,
    )

    const lastPoint = Math.max(selection.start, selection.end - 1)
    const last = blocks.findIndex((block) => block.start <= lastPoint && block.end >= lastPoint)

    if (selection.start < 0 || selection.end < selection.start || first < 0 || last < first)
      return undefined
    const selected = blocks.slice(first, last + 1)
    const opening = selected[0]
    const closing = selected.at(-1)

    if (
      !opening ||
      !closing ||
      selected.some((block) => !block.editable || /[\r\n]/.test(block.source))
    )
      return undefined
    const remove = selected.every((block) => block.list?.kind === kind)
    const newline = source.includes('\r\n') ? '\r\n' : '\n'
    const separator = remove ? newline + newline : newline
    let text = ''
    let start = 0
    let end = 0

    for (const [index, block] of selected.entries()) {
      const prefix = block.list?.prefix ?? block.heading?.prefix ?? ''
      const suffix = (block.heading?.suffix ?? '') + (block.alignment?.suffix ?? '')
      const content = block.source.slice(prefix.length, block.source.length - suffix.length)
      const marker = remove ? '' : kind === 'bullet' ? '- ' : `${index + 1}. `
      const offset = opening.start + text.length + marker.length

      if (index === 0)
        start =
          offset +
          Math.max(0, Math.min(content.length, selection.start - block.start - prefix.length))

      if (index === selected.length - 1)
        end =
          offset +
          Math.max(0, Math.min(content.length, selection.end - block.start - prefix.length))
      text += marker + content + (block.alignment?.suffix ?? '')

      if (index < selected.length - 1) text += separator
    }

    return { start: opening.start, end: closing.end, text, selection: { start, end } }
  },
})

/** Source-backed alignment extension: a trailing {align=center}, {align=right} or {align=justify}. */
export const alignment = (value: NonNullable<Block['alignment']>['value']): FormattingPlugin => ({
  id: `align-${value}`,
  apply: (source, selection) => {
    const blocks = parse(source).filter((block) =>
      selection.start === selection.end
        ? block.start <= selection.start && block.end >= selection.start
        : block.start < selection.end && block.end > selection.start,
    )

    if (
      selection.start < 0 ||
      selection.end < selection.start ||
      selection.end > source.length ||
      !blocks.length ||
      blocks.some((block) => !block.editable || /[\r\n]/.test(block.source))
    )
      return undefined

    if (blocks.every((block) => (block.alignment?.value ?? 'left') === value)) return undefined
    let text = ''
    let start = selection.start
    let end = selection.end
    const first = blocks[0]
    const last = blocks.at(-1)

    if (!first || !last) return undefined

    for (const [index, block] of blocks.entries()) {
      const content = block.source.slice(
        0,
        block.source.length - (block.alignment?.suffix.length ?? 0),
      )

      const offset = first.start + text.length

      if (index === 0) start = offset + Math.min(content.length, selection.start - block.start)

      if (index === blocks.length - 1)
        end = offset + Math.min(content.length, selection.end - block.start)
      text += content + (value === 'left' ? '' : ` {align=${value}}`)
      const next = blocks[index + 1]

      if (next) text += source.slice(block.end, next.start)
    }

    return { start: first.start, end: last.end, text, selection: { start, end } }
  },
})
