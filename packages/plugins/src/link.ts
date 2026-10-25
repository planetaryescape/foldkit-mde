import { parse, type Selection, type Transaction } from '@foldkit-mde/core'
import type { FormattingPlugin } from '@foldkit-mde/core/plugins'

const apply = (
  source: string,
  selection: Selection,
  destination: string,
): Transaction | undefined => {
  const { start, end } = selection

  if (start < 0 || end > source.length || start >= end) return undefined

  const block = parse(source).find(
    (block) => block.editable && block.start <= start && block.end >= end,
  )

  if (!block) return undefined

  const existing = block.inlines.find(
    (inline) => inline.href !== undefined && inline.start === start && inline.end === end,
  )?.href

  const label = source.slice(start, end)

  if (/[\r\n*_`[\]<>\\]/.test(label) || !label.trim()) return undefined

  if (
    existing === undefined &&
    block.inlines.some(
      (inline) =>
        (inline.bold ||
          inline.italic ||
          inline.underline ||
          inline.strikethrough ||
          inline.href !== undefined) &&
        start < inline.end &&
        end > inline.start,
    )
  )
    return undefined
  const url = destination.trim()

  if (!url && existing !== undefined)
    return {
      start: start - 1,
      end: end + existing.length + 3,
      text: label,
      selection: { start: start - 1, end: end - 1 },
    }

  if (!url) return undefined
  const from = existing !== undefined ? start : start + label.length - label.trimStart().length
  const to = existing !== undefined ? end : end - (label.length - label.trimEnd().length)

  if (source[from - 1] === '!') return undefined
  const text = `[${source.slice(from, to)}](${url})`
  const proposed = parse(text)[0]

  if (!proposed?.editable || proposed.inlines[0]?.href !== url) return undefined

  return {
    start: existing !== undefined ? from - 1 : from,
    end: existing !== undefined ? to + existing.length + 3 : to,
    text,
    selection: {
      start: existing !== undefined ? from : from + 1,
      end: existing !== undefined ? to : to + 1,
    },
  }
}

export const link: FormattingPlugin<string> = { id: 'link', apply }

export const linkInput = (source: string, selection: Selection): string =>
  parse(source)
    .flatMap((block) => block.inlines)
    .find((inline) => inline.start === selection.start && inline.end === selection.end)?.href ?? ''
