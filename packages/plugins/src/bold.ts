import type { Selection, Transaction } from '@foldkit-mde/core'
import type { FormattingPlugin } from '@foldkit-mde/core/plugins'

const apply = (source: string, selection: Selection): Transaction | undefined => {
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

  if (/[*[\]`<>\\]/.test(text)) return undefined

  for (const match of source.matchAll(/\*\*([^*\r\n]+)\*\*|\[[^\]\r\n]+\]\([^\r\n]*\)/g)) {
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

export const bold: FormattingPlugin = { id: 'bold', apply }
