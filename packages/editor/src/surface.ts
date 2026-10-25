import { Message as CoreMessage, Mode, parse, Selection, type Model } from '@foldkit-mde/core'
import { Effect, Queue, Schema, Stream } from 'effect'
import * as Command from 'foldkit/command'
import * as Mount from 'foldkit/mount'

import { read, renderVisual, split } from './document'
import { Formatted, Message, type FormattingTool } from './formatting'

const fields = { source: Schema.String, mode: Mode, selection: Selection }

type Surface = Pick<Model, 'source' | 'mode' | 'selection'>

const render = (element: Element, state: Surface, focus: boolean) => {
  element.setAttribute('data-source', state.source)
  element.setAttribute('data-mode', state.mode)
  element.replaceChildren()

  if (state.mode === 'Visual') {
    renderVisual(element, state.source, state.selection, focus)

    return
  }

  const input = document.createElement('textarea')
  input.className = 'mde-source'
  input.setAttribute('aria-label', 'Markdown source')
  input.placeholder = 'Start writing...'
  input.value = state.source
  element.append(input)

  if (focus) input.focus()
  input.setSelectionRange(state.selection.start, state.selection.end)
}

export const Synchronize = Command.define('SynchronizeEditor', {
  args: fields,
  messages: [CoreMessage.cases.Synchronized],
  execute: (state) =>
    Effect.sync(() => {
      const element = document.getElementById('mde-surface')

      if (element) render(element, state, true)

      return CoreMessage.cases.Synchronized.make({})
    }),
})

export const observe = (tools: ReadonlyArray<FormattingTool>) =>
  Mount.defineStream('ObserveEditor', {
    args: fields,
    messages: [Message],
    execute: ({ element, source, mode, selection }) =>
      Stream.callback<Message>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            render(element, { source, mode, selection }, false)
            let composing = false
            let inputFrame = 0

            const emit = (message: Message) => {
              Queue.offerUnsafe(queue, message)
            }

            const field = () => element.querySelector('.mde-visual')

            const input = (event: Event) => {
              if (composing) return
              const target = event.target

              if (target instanceof HTMLTextAreaElement) {
                emit(
                  CoreMessage.cases.UpdatedSource.make({
                    source: target.value,
                    selection: { start: target.selectionStart, end: target.selectionEnd },
                  }),
                )
              } else {
                const visual = field()

                if (!visual) return
                const state = read(visual)
                emit(
                  CoreMessage.cases.UpdatedSource.make({
                    source: state.source,
                    selection: state.selection ?? {
                      start: state.source.length,
                      end: state.source.length,
                    },
                  }),
                )
              }
            }

            const select = () => {
              if (composing || !document.activeElement || !element.contains(document.activeElement))
                return
              const target = document.activeElement

              if (target.closest('.mde-protected')) return

              if (target instanceof HTMLTextAreaElement) {
                emit(
                  CoreMessage.cases.Selected.make({
                    selection: { start: target.selectionStart, end: target.selectionEnd },
                  }),
                )
              } else {
                const visual = field()
                const value = visual ? read(visual).selection : undefined

                if (value) emit(CoreMessage.cases.Selected.make({ selection: value }))
              }
            }

            const format = (id: string) => {
              const target = document.activeElement

              if (target?.closest('.mde-protected')) return
              const visual = field()

              const state =
                target instanceof HTMLTextAreaElement
                  ? {
                      source: target.value,
                      selection: { start: target.selectionStart, end: target.selectionEnd },
                    }
                  : visual
                    ? read(visual)
                    : undefined

              if (state?.selection)
                emit(
                  Formatted.make({
                    id,
                    input: '',
                    source: state.source,
                    selection: state.selection,
                  }),
                )
            }

            const focusBlock = (target: Element, forward: boolean) => {
              if (!(target instanceof HTMLElement)) return

              if (target.classList.contains('mde-protected')) {
                target.focus()

                return
              }

              const visual = field()

              if (!(visual instanceof HTMLElement)) return
              visual.focus()
              const range = document.createRange()
              range.selectNodeContents(target)
              range.collapse(forward)
              window.getSelection()?.removeAllRanges()
              window.getSelection()?.addRange(range)
              select()
            }

            const focusin = (event: Event) => {
              const card =
                event.target instanceof Element ? event.target.closest('.mde-protected') : null

              const visual = field()

              if (!(card instanceof HTMLElement) || !visual) return
              const start = Number(card.dataset['start'])

              const block = parse(visual.getAttribute('data-source') ?? '').find(
                (block) => block.start === start,
              )

              if (block) {
                window.getSelection()?.removeAllRanges()
                emit(
                  CoreMessage.cases.Selected.make({
                    selection: { start: block.start, end: block.end },
                  }),
                )
              }
            }

            const keydown = (event: Event) => {
              if (!(event instanceof KeyboardEvent) || composing || event.isComposing) return

              if (
                (event.ctrlKey || event.metaKey) &&
                event.shiftKey &&
                !event.altKey &&
                event.key.toLowerCase() === 'm'
              ) {
                event.preventDefault()

                if (event.repeat) return
                select()
                emit(
                  CoreMessage.cases.ChangedMode.make({
                    mode: element.getAttribute('data-mode') === 'Visual' ? 'Markdown' : 'Visual',
                  }),
                )

                return
              }

              if (!(event.target instanceof Node) || !element.contains(event.target)) return

              if (!(event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)) {
                const target = event.target
                const visual = field()

                if (!(target instanceof HTMLElement) || !visual) return
                const card = target.classList.contains('mde-protected') ? target : undefined
                const backward = event.key === 'ArrowUp' || event.key === 'ArrowLeft'
                const forward = event.key === 'ArrowDown' || event.key === 'ArrowRight'

                if (card) {
                  const source = visual.getAttribute('data-source') ?? ''
                  const blocks = parse(source)

                  const index = blocks.findIndex(
                    (block) => block.start === Number(card.dataset['start']),
                  )

                  const block = blocks[index]

                  if (!block) return

                  if (event.key === 'Enter' || event.key === 'F2') {
                    event.preventDefault()
                    emit(
                      CoreMessage.cases.Selected.make({
                        selection: { start: block.start, end: block.end },
                      }),
                    )
                    emit(CoreMessage.cases.ChangedMode.make({ mode: 'Markdown' }))
                  } else if (event.key === 'Delete' || event.key === 'Backspace') {
                    event.preventDefault()
                    const previous = blocks[index - 1]
                    const next = blocks[index + 1]
                    const start = next ? block.start : (previous?.end ?? block.start)
                    const end = next?.start ?? (previous ? block.end : source.length)
                    emit(
                      CoreMessage.cases.Applied.make({
                        transaction: { start, end, text: '', selection: { start, end: start } },
                      }),
                    )
                  } else if (backward || forward || event.key === 'Escape') {
                    event.preventDefault()
                    const adjacent = forward ? card.nextElementSibling : card.previousElementSibling

                    if (adjacent) focusBlock(adjacent, forward)
                    else if (event.key === 'Escape')
                      focusBlock(
                        card.nextElementSibling ?? card.previousElementSibling ?? visual,
                        true,
                      )
                  }

                  return
                }

                if ((backward || forward) && target === visual) {
                  const selection = window.getSelection()

                  const range =
                    selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined

                  if (range?.collapsed && range.startContainer === visual) {
                    const adjacent = visual.children[range.startOffset - Number(backward)]

                    if (adjacent?.classList.contains('mde-protected')) {
                      event.preventDefault()
                      focusBlock(adjacent, forward)

                      return
                    }
                  }

                  const state = read(visual)
                  const value = state.selection

                  const entry = state.entries.find(
                    (entry) =>
                      entry.block.editable &&
                      value &&
                      entry.block.start <= value.start &&
                      entry.block.end >= value.end,
                  )

                  const block = entry?.block

                  const adjacent =
                    entry?.node instanceof Element
                      ? forward
                        ? entry.node.nextElementSibling
                        : entry.node.previousElementSibling
                      : null

                  if (
                    !entry ||
                    !value ||
                    value.start !== value.end ||
                    !adjacent?.classList.contains('mde-protected')
                  )
                    return

                  const boundary = forward ? block?.inlines.at(-1)?.end : block?.inlines[0]?.start
                  const lines = document.createRange()
                  lines.selectNodeContents(entry.node)
                  const rectangles = Array.from(lines.getClientRects())
                  const edge = forward ? rectangles.at(-1) : rectangles[0]
                  const caret = range?.getClientRects()[0]
                  const vertical = event.key === 'ArrowUp' || event.key === 'ArrowDown'

                  const onEdgeLine =
                    caret && edge && caret.top < edge.bottom && caret.bottom > edge.top

                  if (value.start === boundary || (vertical && onEdgeLine)) {
                    event.preventDefault()
                    focusBlock(adjacent, forward)
                  }
                }

                return
              }

              if (!(event.metaKey || event.ctrlKey) || event.altKey) return
              const key = event.key.toLowerCase()
              const tool = tools.find((tool) => tool.shortcut === key)

              if (tool || key === 'z' || key === 'y') {
                event.preventDefault()
                select()

                if (tool?.kind === 'Button') format(tool.plugin.id)
                else if (tool?.kind === 'Input') {
                  cancelAnimationFrame(inputFrame)
                  // Selection updates replace keyed forms. Open after Foldkit has painted that update.
                  inputFrame = requestAnimationFrame(() => {
                    inputFrame = requestAnimationFrame(() => {
                      inputFrame = 0
                      editor
                        .querySelector<HTMLButtonElement>(
                          `button[popovertarget="mde-input-${tool.plugin.id}"]`,
                        )
                        ?.click()
                    })
                  })
                } else
                  emit(
                    key === 'y' || event.shiftKey
                      ? CoreMessage.cases.Redo.make({})
                      : CoreMessage.cases.Undo.make({}),
                  )
              }
            }

            const beforeinput = (event: Event) => {
              if (!(event instanceof InputEvent) || composing) return
              select()

              if (event.inputType === 'insertParagraph') {
                const visual = field()

                if (!visual) return
                const transaction = split(visual)
                event.preventDefault()

                if (transaction) emit(CoreMessage.cases.Applied.make({ transaction }))

                return
              }

              const tool = tools.find(
                (tool) => tool.kind === 'Button' && tool.inputType === event.inputType,
              )

              if (event.inputType.startsWith('format')) event.preventDefault()

              if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo' || tool) {
                event.preventDefault()
                select()

                if (tool) format(tool.plugin.id)
                else
                  emit(
                    event.inputType === 'historyUndo'
                      ? CoreMessage.cases.Undo.make({})
                      : CoreMessage.cases.Redo.make({}),
                  )
              }
            }

            const click = (event: Event) => {
              if (event.target instanceof Element && event.target.closest('a'))
                event.preventDefault()

              if (!(event.target instanceof HTMLButtonElement)) return
              const start = Number(event.target.dataset['sourceStart'])

              if (!Number.isInteger(start)) return
              emit(CoreMessage.cases.Selected.make({ selection: { start, end: start } }))
              emit(CoreMessage.cases.ChangedMode.make({ mode: 'Markdown' }))
            }

            const compositionStart = () => {
              composing = true
            }

            const compositionEnd = (event: Event) => {
              composing = false
              input(event)
            }

            const paste = (event: Event) => {
              if (!(event instanceof ClipboardEvent) || composing) return

              if (document.activeElement?.closest('.mde-protected')) {
                event.preventDefault()

                return
              }

              const target = document.activeElement
              const visual = field()
              const clipboard = event.clipboardData?.getData('text/plain') ?? ''
              const url = clipboard.trim()

              const state =
                target instanceof HTMLTextAreaElement
                  ? {
                      source: target.value,
                      selection: { start: target.selectionStart, end: target.selectionEnd },
                    }
                  : visual
                    ? read(visual)
                    : undefined

              if (
                state?.selection &&
                state.selection.start !== state.selection.end &&
                /^(?:https?:\/\/|mailto:|\/(?!\/)|\.\.?\/|#)/i.test(url)
              ) {
                const selected = state.selection

                const tool = tools.find(
                  (tool) =>
                    tool.kind === 'Input' &&
                    tool.paste === 'url' &&
                    tool.plugin.apply(state.source, selected, url) !== undefined,
                )

                if (tool) {
                  event.preventDefault()
                  select()
                  emit(
                    Formatted.make({
                      id: tool.plugin.id,
                      source: state.source,
                      selection: selected,
                      input: url,
                    }),
                  )

                  return
                }
              }

              if (!visual) return
              event.preventDefault()
              const selection = window.getSelection()

              const range =
                selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined

              if (!range || !visual?.contains(range.commonAncestorContainer)) return
              const text = document.createTextNode(clipboard)
              range.deleteContents()
              range.insertNode(text)
              range.setStartAfter(text)
              range.collapse(true)
              selection?.removeAllRanges()
              selection?.addRange(range)
              input(event)
            }

            const listeners = new Map<string, EventListener>([
              ['input', input],
              ['focusin', focusin],
              ['beforeinput', beforeinput],
              ['click', click],
              ['compositionstart', compositionStart],
              ['compositionend', compositionEnd],
              ['paste', paste],
            ])

            const editor = element.closest('.mde') ?? element
            editor.addEventListener('keydown', keydown)

            for (const [name, listener] of listeners) element.addEventListener(name, listener)
            document.addEventListener('selectionchange', select)

            return () => {
              cancelAnimationFrame(inputFrame)
              editor.removeEventListener('keydown', keydown)

              for (const [name, listener] of listeners) element.removeEventListener(name, listener)
              document.removeEventListener('selectionchange', select)
            }
          }),
          (cleanup) => Effect.sync(cleanup),
        ),
      ),
  })
