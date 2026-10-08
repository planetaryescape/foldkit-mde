import {
  Message,
  Mode,
  Selection,
  parse,
  sourceOffset,
  visualOffset,
  type Block,
  type Model,
} from '@foldkit-mde/core'
import { Effect, Match, Queue, Schema, Stream } from 'effect'
import * as Command from 'foldkit/command'
import * as Mount from 'foldkit/mount'

const fields = { source: Schema.String, mode: Mode, selection: Selection }

type Surface = Pick<Model, 'source' | 'mode' | 'selection'>

const serialize = (node: Node): string => {
  if (node instanceof Text) return node.data.replace(/\u00a0/g, ' ')

  if (node instanceof HTMLBRElement) return '\n'
  const text = Array.from(node.childNodes, serialize).join('')

  if (node instanceof HTMLElement && (node.tagName === 'STRONG' || node.tagName === 'B'))
    return text ? `**${text}**` : ''

  if (node instanceof HTMLDivElement) return `\n${text}`

  return text
}

const offset = (element: Element, node: Node, position: number): number => {
  const range = document.createRange()
  range.selectNodeContents(element)
  range.setEnd(node, position)

  return range.toString().length
}

const selected = (element: Element, block: Block): Selection | undefined => {
  const selection = window.getSelection()

  if (!selection || selection.rangeCount === 0) return undefined
  const range = selection.getRangeAt(0)

  if (!element.contains(range.startContainer) || !element.contains(range.endContainer))
    return undefined

  return {
    start: sourceOffset(block, offset(element, range.startContainer, range.startOffset)),
    end: sourceOffset(
      block,
      offset(element, range.endContainer, range.endOffset),
      range.collapsed ? 'forward' : 'backward',
    ),
  }
}

const locate = (element: Element, position: number): readonly [Node, number] => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let remaining = position
  let node = walker.nextNode()

  while (node) {
    const length = node.textContent?.length ?? 0

    if (remaining <= length) return [node, remaining]
    remaining -= length
    node = walker.nextNode()
  }

  return [element, element.childNodes.length]
}

const render = (element: Element, state: Surface, focus: boolean) => {
  element.setAttribute('data-source', state.source)
  element.setAttribute('data-mode', state.mode)
  element.replaceChildren()

  if (state.mode === 'Markdown') {
    const input = document.createElement('textarea')
    input.className = 'mde-source'
    input.setAttribute('aria-label', 'Markdown source')
    input.placeholder = 'Start writing...'
    input.value = state.source
    element.append(input)

    if (focus) input.focus()
    input.setSelectionRange(state.selection.start, state.selection.end)

    return
  }

  for (const block of parse(state.source)) {
    if (!block.editable) {
      const card = document.createElement('div')
      card.className = 'mde-protected'
      const code = document.createElement('pre')
      code.textContent = block.source
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = 'Edit source'
      button.dataset['sourceStart'] = String(block.start)
      card.append(code, button)
      element.append(card)
      continue
    }

    const paragraph = document.createElement('div')
    paragraph.className = 'mde-paragraph'
    paragraph.contentEditable = 'true'
    paragraph.setAttribute('role', 'textbox')
    paragraph.setAttribute('aria-label', `Paragraph ${block.start + 1}`)
    paragraph.setAttribute('aria-multiline', 'true')
    paragraph.dataset['start'] = String(block.start)

    for (const inline of block.inlines) {
      if (inline.bold) {
        const strong = document.createElement('strong')
        strong.textContent = inline.text
        paragraph.append(strong)
      } else paragraph.append(document.createTextNode(inline.text))
    }

    element.append(paragraph)

    if (focus && state.selection.start >= block.start && state.selection.end <= block.end) {
      paragraph.focus()
      const range = document.createRange()
      const [startNode, startOffset] = locate(paragraph, visualOffset(block, state.selection.start))
      const [endNode, endOffset] = locate(paragraph, visualOffset(block, state.selection.end))
      range.setStart(startNode, startOffset)
      range.setEnd(endNode, endOffset)
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
    }
  }
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

          const paragraphBlock = (target: Element) =>
            parse(element.getAttribute('data-source') ?? '').find(
              (block) => block.start === Number(target.getAttribute('data-start')),
            )

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
            } else if (target instanceof HTMLElement && target.isContentEditable) {
              const block = paragraphBlock(target)

              if (!block) return
              const text = Array.from(target.childNodes, serialize).join('')
              const nextBlock = parse(text)[0]
              const local = nextBlock ? selected(target, nextBlock) : undefined
              emit(
                Message.cases.Applied.make({
                  transaction: {
                    start: block.start,
                    end: block.end,
                    text,
                    selection: {
                      start: block.start + (local?.start ?? text.length),
                      end: block.start + (local?.end ?? text.length),
                    },
                  },
                }),
              )
            }
          }

          const select = () => {
            const target = document.activeElement

            if (!target || !element.contains(target) || composing) return

            if (target instanceof HTMLTextAreaElement) {
              emit(
                Message.cases.Selected.make({
                  selection: { start: target.selectionStart, end: target.selectionEnd },
                }),
              )
            } else {
              const block = paragraphBlock(target)
              const value = block ? selected(target, block) : undefined

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

            if (
              event.inputType === 'insertParagraph' &&
              event.target instanceof HTMLElement &&
              event.target.isContentEditable
            ) {
              const block = paragraphBlock(event.target)
              const value = block ? selected(event.target, block) : undefined
              const selection = window.getSelection()

              if (!value || !block || !selection || selection.rangeCount === 0) return
              event.preventDefault()
              const range = selection.getRangeAt(0)
              const before = document.createRange()
              before.selectNodeContents(event.target)
              before.setEnd(range.startContainer, range.startOffset)
              const after = document.createRange()
              after.selectNodeContents(event.target)
              after.setStart(range.endContainer, range.endOffset)
              const prefix = serialize(before.cloneContents())
              const suffix = serialize(after.cloneContents())
              const caret = block.start + prefix.length + 2
              emit(
                Message.cases.Applied.make({
                  transaction: {
                    start: block.start,
                    end: block.end,
                    text: `${prefix}\n\n${suffix}`,
                    selection: { start: caret, end: caret },
                  },
                }),
              )

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
            if (
              !(event instanceof ClipboardEvent) ||
              !(event.target instanceof HTMLElement) ||
              !event.target.isContentEditable
            )
              return
            event.preventDefault()
            const selection = window.getSelection()

            const range =
              selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined

            if (!range || !event.target.contains(range.commonAncestorContainer)) return
            const text = document.createTextNode(event.clipboardData?.getData('text/plain') ?? '')
            range.deleteContents()
            range.insertNode(text)
            range.setStartAfter(text)
            range.collapse(true)
            window.getSelection()?.removeAllRanges()
            window.getSelection()?.addRange(range)
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
