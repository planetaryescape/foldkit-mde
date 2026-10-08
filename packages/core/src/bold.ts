import { Schema } from 'effect'

export const Selection = Schema.Struct({ start: Schema.Int, end: Schema.Int })

export type Selection = typeof Selection.Type

export const Transaction = Schema.Struct({
  start: Schema.Int,
  end: Schema.Int,
  text: Schema.String,
  selection: Selection,
})

export type Transaction = typeof Transaction.Type

export const bold = (source: string, selection: Selection): Transaction | undefined => {
  const { start, end } = selection

  if (start < 0 || end > source.length || start >= end) return undefined
  const text = source.slice(start, end)

  if (/[\r\n]/.test(text)) return undefined

  if (text.startsWith('**') && text.endsWith('**') && text.length > 4) {
    return { start, end, text: text.slice(2, -2), selection: { start, end: end - 4 } }
  }

  if (source.slice(start - 2, start) === '**' && source.slice(end, end + 2) === '**') {
    return { start: start - 2, end: end + 2, text, selection: { start: start - 2, end: end - 2 } }
  }

  if (text.includes('*')) return undefined

  for (const match of source.matchAll(/\*\*([^*\r\n]+)\*\*/g)) {
    if (start < match.index + match[0].length && end > match.index) return undefined
  }

  const content = text.trim()

  if (!content) return undefined
  const from = start + text.length - text.trimStart().length
  const to = end - (text.length - text.trimEnd().length)

  return {
    start: from,
    end: to,
    text: `**${content}**`,
    selection: { start: from + 2, end: to + 2 },
  }
}
