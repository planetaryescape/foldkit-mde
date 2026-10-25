import { parse, parseInlines } from '@foldkit-mde/core'
import type { FormattingPlugin } from '@foldkit-mde/core/plugins'

const mark = (id: 'bold' | 'italic' | 'underline' | 'strikethrough'): FormattingPlugin => ({
  id,
  apply: (source, selection) => {
    const { start, end } = selection

    if (start < 0 || end > source.length || start >= end) return undefined
    const block = parse(source).find((block) => block.start <= start && block.end >= end)

    if (!block?.editable || /[\r\n]/.test(source.slice(start, end))) return undefined

    const inline = block.inlines.find((inline) => {
      const opening =
        Number(inline.bold) * 2 +
        Number(inline.italic) +
        Number(inline.underline) * 3 +
        Number(inline.strikethrough) * 2

      const closing = opening + Number(inline.underline)

      return (
        (start >= inline.start && end <= inline.end) ||
        (start === inline.start - opening && end === inline.end + closing)
      )
    })

    if (!inline || inline.href !== undefined) return undefined
    const marked = inline.bold || inline.italic || inline.underline || inline.strikethrough

    if (marked && !(start <= inline.start && end >= inline.end)) return undefined
    const selected = marked ? inline.text : source.slice(start, end)
    const content = selected.trim()

    if (!content) return undefined

    const opening =
      Number(inline.bold) * 2 +
      Number(inline.italic) +
      Number(inline.underline) * 3 +
      Number(inline.strikethrough) * 2

    const closing = opening + Number(inline.underline)

    const from = marked
      ? inline.start - opening
      : start + selected.length - selected.trimStart().length

    const to = marked ? inline.end + closing : end - (selected.length - selected.trimEnd().length)
    const whole = parseInlines(source.slice(from, to))

    if (
      marked &&
      (from < block.start || to > block.end || whole.length !== 1 || whole[0]?.text !== inline.text)
    )
      return undefined

    const marks = {
      bold: inline.bold,
      italic: inline.italic,
      underline: inline.underline,
      strikethrough: inline.strikethrough,
      [id]: !inline[id],
    }

    const stars = '*'.repeat(Number(marks.bold) * 2 + Number(marks.italic))
    const strike = marks.strikethrough ? '~~' : ''
    const prefix = (marks.underline ? '<u>' : '') + strike + stars
    const suffix = stars + strike + (marks.underline ? '</u>' : '')
    const text = marked ? inline.text : content

    return {
      start: from,
      end: to,
      text: prefix + text + suffix,
      selection: { start: from + prefix.length, end: from + prefix.length + text.length },
    }
  },
})

/** Toggle bold on plain text or a complete marked span through a core transaction. */
export const bold = mark('bold')

/** Toggle asterisk italic without rewriting surrounding Markdown. */
export const italic = mark('italic')

/** Toggle the editor's explicit, attribute-free <u> Markdown extension. */
export const underline = mark('underline')

/** Toggle double-tilde strikethrough through the shared transaction path. */
export const strikethrough = mark('strikethrough')
