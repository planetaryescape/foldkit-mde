import { Message, Mode, Selection, type Model } from '@foldkit-mde/core'
import { Effect, Match, Queue, Schema, Stream } from 'effect'
import * as Command from 'foldkit/command'
import * as Mount from 'foldkit/mount'

import { read, renderVisual, split } from './document'

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
  messages: [Message.cases.Synchronized],
  execute: (state) =>
    Effect.sync(() => {
      const element = document.getElementById('mde-surface')

      if (element) render(element, state, true)

      return Message.cases.Synchronized.make({})
    }),
})

export const Observe = Mount.defineStream('ObserveEditor', {
  args: fields,
  messages: [Message],
  execute: ({ element, source, mode, selection }) =>
    Stream.callback<Message>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          render(element, { source, mode, selection }, false)
          let composing = false

          const emit = (message: Message) => {
            Queue.offerUnsafe(queue, message)
          }

          const field = () => element.querySelector('.mde-visual')

          const input = (event: Event) => {
            if (composing) return
            const target = event.target

            if (target instanceof HTMLTextAreaElement) {
              emit(
                Message.cases.UpdatedSource.make({
                  source: target.value,
                  selection: { start: target.selectionStart, end: target.selectionEnd },
                }),
              )
            } else {
              const visual = field()

              if (!visual) return
              const state = read(visual)
              emit(
                Message.cases.UpdatedSource.make({
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

            if (target instanceof HTMLTextAreaElement) {
              emit(
                Message.cases.Selected.make({
                  selection: { start: target.selectionStart, end: target.selectionEnd },
                }),
              )
            } else {
              const visual = field()
              const value = visual ? read(visual).selection : undefined

              if (value) emit(Message.cases.Selected.make({ selection: value }))
            }
          }

          const keydown = (event: Event) => {
            if (!(event instanceof KeyboardEvent) || composing || !(event.metaKey || event.ctrlKey))
              return
            const key = event.key.toLowerCase()

            if (key === 'b' || key === 'z' || key === 'y') {
              event.preventDefault()
              select()
              emit(
                key === 'b'
                  ? Message.cases.ToggledBold.make({})
                  : key === 'y' || event.shiftKey
                    ? Message.cases.Redo.make({})
                    : Message.cases.Undo.make({}),
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

              if (transaction) emit(Message.cases.Applied.make({ transaction }))

              return
            }

            if (
              event.inputType === 'historyUndo' ||
              event.inputType === 'historyRedo' ||
              event.inputType === 'formatBold'
            ) {
              event.preventDefault()
              select()
              emit(
                Match.value(event.inputType).pipe(
                  Match.when('historyUndo', () => Message.cases.Undo.make({})),
                  Match.when('historyRedo', () => Message.cases.Redo.make({})),
                  Match.orElse(() => Message.cases.ToggledBold.make({})),
                ),
              )
            }
          }

          const click = (event: Event) => {
            if (!(event.target instanceof HTMLButtonElement)) return
            const start = Number(event.target.dataset['sourceStart'])

            if (!Number.isInteger(start)) return
            emit(Message.cases.Selected.make({ selection: { start, end: start } }))
            emit(Message.cases.ChangedMode.make({ mode: 'Markdown' }))
          }

          const compositionStart = () => {
            composing = true
          }

          const compositionEnd = (event: Event) => {
            composing = false
            input(event)
          }

          const paste = (event: Event) => {
            if (!(event instanceof ClipboardEvent) || !field()) return
            event.preventDefault()
            const selection = window.getSelection()

            const range =
              selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined

            const visual = field()

            if (!range || !visual?.contains(range.commonAncestorContainer)) return
            const text = document.createTextNode(event.clipboardData?.getData('text/plain') ?? '')
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
            ['keydown', keydown],
            ['beforeinput', beforeinput],
            ['click', click],
            ['compositionstart', compositionStart],
            ['compositionend', compositionEnd],
            ['paste', paste],
          ])

          for (const [name, listener] of listeners) element.addEventListener(name, listener)
          document.addEventListener('selectionchange', select)

          return () => {
            for (const [name, listener] of listeners) element.removeEventListener(name, listener)
            document.removeEventListener('selectionchange', select)
          }
        }),
        (cleanup) => Effect.sync(cleanup),
      ),
    ),
})
