import { parse, parseBlock, sourceOffset, visualOffset, type Block } from '@foldkit-mde/core'
import type { FormattingPlugin } from '@foldkit-mde/core/plugins'

const mark = (id: 'bold' | 'italic' | 'underline' | 'strikethrough'): FormattingPlugin => ({
  id,
  apply: (source, selection) => {
    const { start, end } = selection

    if (start < 0 || end > source.length || start >= end) return undefined
    const block = parse(source).find((block) => block.start <= start && block.end >= end)

    if (!block?.editable || /[\r\n]/.test(source.slice(start, end))) return undefined

    const visible = block.inlines.map((inline) => inline.text).join('')
    const left = visualOffset(block, start)
    const right = visualOffset(block, end)
    const selected = visible.slice(left, right)
    const content = selected.trim()

    if (!content) return undefined
    const from = left + selected.length - selected.trimStart().length
    const to = right - (selected.length - selected.trimEnd().length)
    let offset = 0

    const selectedInlines = block.inlines.filter((inline) => {
      const overlaps = offset < to && offset + inline.text.length > from
      offset += inline.text.length

      return overlaps
    })

    if (selectedInlines.some((inline) => inline.href !== undefined)) return undefined
    const enabled = !selectedInlines.every((inline) => inline[id])

    const runs: Array<
      Pick<
        Block['inlines'][number],
        'text' | 'bold' | 'italic' | 'underline' | 'strikethrough' | 'link'
      >
    > = []

    const append = (inline: Block['inlines'][number], text: string, selected: boolean) => {
      if (!text) return
      const run = { ...inline, text, [id]: selected ? enabled : inline[id] }
      const previous = runs.at(-1)

      if (
        previous &&
        !previous.link &&
        !run.link &&
        (['bold', 'italic', 'underline', 'strikethrough'] as const).every(
          (key) => previous[key] === run[key],
        )
      ) {
        runs[runs.length - 1] = { ...previous, text: previous.text + text }
      } else runs.push(run)
    }

    offset = 0

    for (const inline of block.inlines) {
      const before = Math.max(0, Math.min(inline.text.length, from - offset))
      const after = Math.max(before, Math.min(inline.text.length, to - offset))
      append(inline, inline.text.slice(0, before), false)
      append(inline, inline.text.slice(before, after), true)
      append(inline, inline.text.slice(after), false)
      offset += inline.text.length
    }

    let previousLink: number | undefined

    const body = runs
      .map((run) => {
        if (run.link) {
          if (previousLink === run.link.start) return ''
          previousLink = run.link.start

          return source.slice(run.link.start, run.link.end)
        }

        previousLink = undefined
        const stars = '*'.repeat(Number(run.bold) * 2 + Number(run.italic))
        const strike = run.strikethrough ? '~~' : ''

        return (
          (run.underline ? '<u>' : '') +
          strike +
          stars +
          run.text +
          stars +
          strike +
          (run.underline ? '</u>' : '')
        )
      })
      .join('')

    const prefix = block.heading?.prefix ?? block.quote?.prefix ?? block.list?.prefix ?? ''
    const text = prefix + body + (block.heading?.suffix ?? '') + (block.alignment?.suffix ?? '')
    const proposed = parseBlock(text, block.start)

    if (!proposed.editable || proposed.inlines.map((inline) => inline.text).join('') !== visible)
      return undefined

    return {
      start: block.start,
      end: block.end,
      text,
      selection: {
        start: sourceOffset(proposed, from),
        end: sourceOffset(proposed, to, 'backward'),
      },
    }
  },
})

/** Toggle bold on a visible selection, splitting or combining marked spans as needed. */
export const bold = mark('bold')

/** Toggle asterisk italic without rewriting surrounding Markdown. */
export const italic = mark('italic')

/** Toggle the editor's explicit, attribute-free <u> Markdown extension. */
export const underline = mark('underline')

/** Toggle double-tilde strikethrough through the shared transaction path. */
export const strikethrough = mark('strikethrough')
