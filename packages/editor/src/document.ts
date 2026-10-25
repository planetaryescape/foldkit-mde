import {
  parse,
  parseBlock,
  sourceOffset,
  visualOffset,
  type Block,
  type Selection,
  type Transaction,
} from '@foldkit-mde/core'

const serialize = (node: Node): string => {
  if (node instanceof Text) return node.data.replace(/\u00a0/g, ' ')

  if (node instanceof HTMLBRElement) return '\n'
  const text = Array.from(node.childNodes, serialize).join('')

  if (node instanceof HTMLElement && (node.tagName === 'STRONG' || node.tagName === 'B'))
    return text ? `**${text}**` : ''

  if (node instanceof HTMLElement && (node.tagName === 'EM' || node.tagName === 'I'))
    return text ? `*${text}*` : ''

  if (node instanceof HTMLElement && node.tagName === 'U') return text ? `<u>${text}</u>` : ''

  if (node instanceof HTMLElement && (node.tagName === 'S' || node.tagName === 'STRIKE'))
    return text ? `~~${text}~~` : ''

  if (node instanceof HTMLAnchorElement)
    return text ? `[${text}](${node.getAttribute('href') ?? ''})` : ''

  if (node instanceof HTMLDivElement && !node.classList.contains('mde-paragraph'))
    return `\n${text}`

  return text
}

const length = (node: Node): number => {
  if (node instanceof Text) return node.length

  if (node instanceof HTMLBRElement) return 1

  return (
    Array.from(node.childNodes).reduce((total, child) => total + length(child), 0) +
    (node instanceof HTMLDivElement && !node.classList.contains('mde-paragraph') ? 1 : 0)
  )
}

const locate = (element: Node, position: number): readonly [Node, number] => {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
  let remaining = position
  let node = walker.nextNode()

  while (node) {
    const size = node.textContent?.length ?? 0

    if (remaining <= size) return [node, remaining]
    remaining -= size
    node = walker.nextNode()
  }

  return [element, element.childNodes.length]
}

interface Entry {
  readonly node: Node
  readonly block: Block
}

const position = (
  root: Element,
  entries: ReadonlyArray<Entry>,
  node: Node,
  offset: number,
  affinity: 'forward' | 'backward',
): number => {
  if (node === root) {
    const next = entries[offset]
    const previous = entries[offset - 1]

    return affinity === 'forward'
      ? (next?.block.start ?? previous?.block.end ?? 0)
      : (previous?.block.end ?? next?.block.start ?? 0)
  }

  const entry = entries.find((value) => value.node === node || value.node.contains(node))

  if (!entry) return 0

  if (!entry.block.editable) return affinity === 'forward' ? entry.block.start : entry.block.end
  const prefix = document.createRange()
  prefix.selectNodeContents(entry.node)
  prefix.setEnd(node, offset)

  return sourceOffset(entry.block, length(prefix.cloneContents()), affinity)
}

export const read = (root: Element) => {
  const original = root.getAttribute('data-source') ?? ''
  const originalBlocks = parse(original)
  const entries: Array<Entry> = []
  let source = ''
  let previousIndex = -1

  for (const node of root.childNodes) {
    const element = node instanceof HTMLElement ? node : undefined

    const index =
      element?.dataset['start'] === undefined
        ? -1
        : originalBlocks.findIndex((block) => block.start === Number(element.dataset['start']))

    const originalBlock = originalBlocks[index]

    const children = Array.from(node.childNodes).filter(
      (child) => !(child instanceof Text && !child.data),
    )

    const serialized = element?.classList.contains('mde-protected')
      ? (element.dataset['source'] ?? '')
      : node instanceof HTMLBRElement ||
          (children.length === 1 && children[0] instanceof HTMLBRElement)
        ? ''
        : element
          ? Array.from(element.childNodes, serialize).join('')
          : serialize(node)

    const heading = originalBlock?.heading
    const prefix = heading ? heading.prefix.replace(/([^ \t])$/, '$1 ') : ''
    const suffix = heading?.suffix ?? ''

    const spelling =
      prefix + serialized + (serialized && suffix.startsWith('#') ? ' ' : '') + suffix

    const text =
      originalBlock && serialized === element?.dataset['baseline'] ? originalBlock.source : spelling

    if (entries.length === 0 && index === 0 && originalBlock)
      source += original.slice(0, originalBlock.start)
    else if (entries.length > 0) {
      const previous = originalBlocks[previousIndex]
      source +=
        previous && originalBlock && index === previousIndex + 1
          ? original.slice(previous.end, originalBlock.start)
          : '\n\n'
    }

    const start = source.length
    source += text
    entries.push({
      node,
      block: parseBlock(text, start),
    })
    previousIndex = index
  }

  const last = originalBlocks[previousIndex]

  if (last && previousIndex === originalBlocks.length - 1) source += original.slice(last.end)
  const selection = window.getSelection()
  const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : undefined

  const selected: Selection | undefined =
    range && root.contains(range.startContainer) && root.contains(range.endContainer)
      ? {
          start: position(root, entries, range.startContainer, range.startOffset, 'forward'),
          end: position(
            root,
            entries,
            range.endContainer,
            range.endOffset,
            range.collapsed ? 'forward' : 'backward',
          ),
        }
      : undefined

  return { source, selection: selected, entries }
}

export const split = (root: Element): Transaction | undefined => {
  const state = read(root)
  const selection = window.getSelection()
  const value = state.selection

  if (!value || !selection || selection.rangeCount === 0) return undefined
  const range = selection.getRangeAt(0)

  const first = state.entries.find(
    (entry) => entry.block.start <= value.start && entry.block.end >= value.start,
  )

  const last = state.entries.find(
    (entry) => entry.block.start <= value.end && entry.block.end >= value.end,
  )

  if (!first || !last || !first.block.editable || !last.block.editable) return undefined

  if (
    (range.startContainer !== root && !first.node.contains(range.startContainer)) ||
    (range.endContainer !== root && !last.node.contains(range.endContainer))
  )
    return undefined
  const before = document.createRange()
  before.selectNodeContents(first.node)

  if (range.startContainer === root) {
    if (value.start <= first.block.start) before.collapse(true)
  } else before.setEnd(range.startContainer, range.startOffset)
  const after = document.createRange()
  after.selectNodeContents(last.node)

  if (range.endContainer === root) {
    if (value.end >= last.block.end) after.collapse(false)
  } else after.setStart(range.endContainer, range.endOffset)
  const prefix = serialize(before.cloneContents())
  const suffix = serialize(after.cloneContents())
  const heading = first.block.heading

  const emptyHeading =
    heading && first === last && first.block.inlines.every((inline) => !inline.text)

  const opening = heading && !emptyHeading ? heading.prefix.replace(/([^ \t])$/, '$1 ') : ''
  const text = emptyHeading ? '' : `${opening}${prefix}\n\n${suffix}`
  const caret = first.block.start + (emptyHeading ? 0 : opening.length + prefix.length + 2)

  return {
    start: first.block.start,
    end: last.block.end,
    text,
    selection: { start: caret, end: caret },
  }
}

export const renderVisual = (
  root: Element,
  source: string,
  selection: Selection,
  focus: boolean,
) => {
  const field = document.createElement('div')
  field.className = 'mde-visual'
  field.contentEditable = 'true'
  field.setAttribute('role', 'textbox')
  field.setAttribute('aria-label', 'Visual document')
  field.setAttribute('aria-multiline', 'true')
  field.dataset['source'] = source
  const entries: Array<Entry> = []

  for (const block of parse(source)) {
    const node = document.createElement(
      block.editable && block.heading ? `h${block.heading.level}` : 'div',
    )

    node.dataset['start'] = String(block.start)
    node.dataset['source'] = block.source

    if (block.editable) {
      node.className = 'mde-paragraph'
      let anchor: HTMLAnchorElement | undefined
      let linkStart: number | undefined

      for (const inline of block.inlines) {
        let content: Node = document.createTextNode(inline.text)

        for (const [enabled, tag] of [
          [inline.italic, 'em'],
          [inline.bold, 'strong'],
          [inline.underline, 'u'],
          [inline.strikethrough, 's'],
        ] as const) {
          if (!enabled) continue
          const wrapper = document.createElement(tag)
          wrapper.append(content)
          content = wrapper
        }

        if (inline.href !== undefined) {
          if (!anchor || linkStart !== inline.link?.start) {
            anchor = document.createElement('a')
            anchor.setAttribute('href', inline.href)
            node.append(anchor)
          }

          anchor.append(content)
          linkStart = inline.link?.start
        } else {
          anchor = undefined
          linkStart = undefined
          node.append(content)
        }
      }

      if (block.inlines.every((inline) => !inline.text)) node.append(document.createElement('br'))
    } else {
      node.className = 'mde-protected'
      node.contentEditable = 'false'
      node.tabIndex = 0
      node.setAttribute('role', 'group')
      node.setAttribute('aria-label', 'Protected source block')
      node.setAttribute('aria-describedby', `mde-block-help-${block.start}`)
      const code = document.createElement('pre')
      code.textContent = block.source
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = 'Edit source'
      button.dataset['sourceStart'] = String(block.start)
      const help = document.createElement('span')
      help.id = `mde-block-help-${block.start}`
      help.className = 'mde-block-help'
      help.textContent = 'Enter to edit · ↑ ↓ to move · Delete to remove'
      node.append(code, button, help)
    }

    node.dataset['baseline'] = block.editable
      ? block.inlines.every((inline) => !inline.text)
        ? ''
        : serialize(node)
      : block.source
    field.append(node)
    entries.push({ node, block })
  }

  root.append(field)

  if (!focus) return

  const selectedBlock = entries.find(
    (entry) =>
      !entry.block.editable &&
      entry.block.start === selection.start &&
      entry.block.end === selection.end,
  )

  if (selectedBlock?.node instanceof HTMLElement) {
    selectedBlock.node.focus()

    return
  }

  field.focus()

  const point = (offset: number): readonly [Node, number] => {
    const entry = entries.find((value) => value.block.end >= offset) ?? entries.at(-1)

    if (!entry) return [field, 0]

    if (!entry.block.editable) return [field, entries.indexOf(entry)]

    return locate(entry.node, visualOffset(entry.block, offset))
  }

  const [startNode, start] = point(selection.start)
  const [endNode, end] = point(selection.end)
  const range = document.createRange()
  range.setStart(startNode, start)
  range.setEnd(endNode, end)
  window.getSelection()?.removeAllRanges()
  window.getSelection()?.addRange(range)
}
