async function checkEditor() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message)
  }

  const until = async (condition) => {
    const deadline = performance.now() + 3000

    while (!condition()) {
      assert(performance.now() < deadline, 'Timed out waiting for editor update')
      await new Promise((resolve) => setTimeout(resolve, 16))
    }
  }

  const source = () => document.getElementById('mde-surface').dataset.source

  const button = (name) =>
    Array.from(document.querySelectorAll('button')).find(
      (element) => (element.getAttribute('aria-label') ?? element.textContent) === name,
    )

  const mode = async (name) => {
    button(name).click()
    await until(() => document.getElementById('mde-surface').dataset.mode === name)
  }

  const action = async (name) => {
    // Surface commands can finish before Foldkit refreshes the toolbar's request snapshot.
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    await until(() => !button(name).disabled)
    const popover = button(name).closest('[popover]')

    if (popover && !popover.matches(':popover-open')) {
      document
        .querySelector(`button[popovertarget="${popover.id}"]:not([popovertargetaction])`)
        .click()
      await until(() => popover.matches(':popover-open'))
    }

    button(name).click()
  }

  const openLink = async () => {
    button('Link').click()
    await until(() => document.querySelector('.mde-format-input').matches(':popover-open'))
    assert(
      document.activeElement.getAttribute('aria-label') === 'Link destination',
      'Opening the link editor focuses its destination input',
    )
  }

  const setSource = async (text) => {
    await until(() => button('Markdown'))
    await mode('Markdown')
    const input = document.querySelector('textarea')
    input.value = text
    input.setSelectionRange(0, 0)
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    await until(() => source() === text)
    await mode('Visual')
  }

  const select = (element, node, start, end = start) => {
    element.closest('.mde-visual').focus()
    const range = document.createRange()
    range.setStart(node, start)
    range.setEnd(node, end)
    window.getSelection().removeAllRanges()
    window.getSelection().addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  }

  const key = async (target, value, modifiers = {}) => {
    target.dispatchEvent(
      new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...modifiers }),
    )
    await new Promise((resolve) => requestAnimationFrame(resolve))
  }

  await until(() => document.querySelector('.mde'))
  const editor = document.querySelector('.mde')

  for (const width of [320, 360, 480, 600, 740, 960]) {
    editor.style.width = `${width}px`
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const bounds = editor.getBoundingClientRect()

    const actions = [...editor.querySelectorAll('.mde-actions > button')].map((button) =>
      button.getBoundingClientRect(),
    )

    assert(
      Math.max(...actions.map((rect) => rect.top)) <
        Math.min(...actions.map((rect) => rect.bottom)) &&
        actions.every((rect) => rect.left >= bounds.left && rect.right <= bounds.right) &&
        editor.querySelector('.mde-toolbar').getBoundingClientRect().height < 190 &&
        [...editor.querySelectorAll('.mde-block-actions > .mde-tool-group')].every((group) => {
          const rect = group.getBoundingClientRect()

          return rect.left >= bounds.left && rect.right <= bounds.right
        }),
      `Toolbar actions stay together and fit at editor width ${width}`,
    )
  }

  editor.style.removeProperty('width')

  for (const editingMode of ['Visual', 'Markdown']) {
    const fixture = 'A longer track\n\n::music{id="keep"}'
    await setSource(fixture)

    const highlight = async () => {
      if (editingMode === 'Markdown') {
        await mode('Markdown')
        const input = document.querySelector('textarea')
        input.focus()
        input.setSelectionRange(2, 8)
        document.dispatchEvent(new Event('selectionchange'))

        return input
      }

      const paragraph = document.querySelector('.mde-paragraph')
      select(paragraph, paragraph.firstChild, 2, 8)

      return paragraph
    }

    await key(
      await highlight(),
      'k',
      editingMode === 'Visual' ? { metaKey: true } : { ctrlKey: true },
    )
    await until(
      () =>
        document.querySelector('.mde-format-input').matches(':popover-open') &&
        document.activeElement.getAttribute('aria-label') === 'Link destination',
    )
    const destination = document.activeElement
    destination.value = 'https://example.test/night'
    destination.dispatchEvent(new Event('input', { bubbles: true }))
    destination.form.requestSubmit()
    await until(
      () => source() === 'A [longer](https://example.test/night) track\n\n::music{id="keep"}',
    )
    await action('Undo')
    await until(() => source() === fixture)

    for (const url of ['https://example.test/mix?side=b', '/mixes/night']) {
      const target = await highlight()
      const clipboard = new DataTransfer()
      clipboard.setData('text/plain', url)
      target.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }),
      )
      await until(() => source() === `A [longer](${url}) track\n\n::music{id="keep"}`)
      await action('Undo')
      await until(() => source() === fixture)
    }

    for (const text of ['ordinary words', 'javascript:evil']) {
      await setSource(fixture)
      const target = await highlight()
      const clipboard = new DataTransfer()
      clipboard.setData('text/plain', text)

      const paste = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      })

      target.dispatchEvent(paste)

      if (editingMode === 'Visual') {
        await until(() => source() === fixture.replace('longer', text))
        assert(
          !document.querySelector('.mde-visual a'),
          'Plain or unsafe clipboard text is not linked',
        )
      } else
        assert(
          !paste.defaultPrevented && source() === fixture,
          'Ordinary Markdown paste is left to the native textarea',
        )
    }
  }

  for (const editingMode of ['Visual', 'Markdown']) {
    for (const [marked, tag, start, end] of [
      ['**longer**', 'strong', 4, 10],
      ['*longer*', 'em', 3, 9],
      ['<u>longer</u>', 'u', 5, 11],
      ['~~longer~~', 's', 4, 10],
    ]) {
      const fixture = `A ${marked} track.\n\n::music{id="keep"}`
      await setSource(fixture)
      let target

      if (editingMode === 'Markdown') {
        await mode('Markdown')
        target = document.querySelector('textarea')
        target.focus()
        target.setSelectionRange(start, end)
      } else {
        target = document.querySelector(`.mde-paragraph ${tag}`)
        select(target, target.firstChild, 0, 6)
      }

      const clipboard = new DataTransfer()
      clipboard.setData('text/plain', 'https://example.test/formatted')
      target.dispatchEvent(
        new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }),
      )
      await until(
        () =>
          source() === `A [${marked}](https://example.test/formatted) track.\n\n::music{id="keep"}`,
      )
      await mode('Visual')
      assert(
        document.querySelector(`a ${tag}`)?.textContent === 'longer',
        'URL paste preserves the selected formatting',
      )
      assert(window.getSelection().toString() === 'longer', 'Formatted link retains selection')
      document.execCommand('insertText', false, 'short')
      await until(
        () =>
          source() ===
          `A [${marked.replace('longer', 'short')}](https://example.test/formatted) track.\n\n::music{id="keep"}`,
      )
      await action('Undo')
      await until(() => source().includes('longer'))
      await action('Undo')
      await until(() => source() === fixture)
    }

    const fixture = 'A **longer** track.\n\n::music{id="keep"}'
    await setSource(fixture)
    let target

    if (editingMode === 'Markdown') {
      await mode('Markdown')
      target = document.querySelector('textarea')
      target.focus()
      target.setSelectionRange(7, 18)
    } else {
      target = document.querySelector('.mde-paragraph')
      target.closest('.mde-visual').focus()
      const range = document.createRange()
      range.setStart(target.querySelector('strong').firstChild, 3)
      range.setEnd(target.lastChild, 6)
      window.getSelection().removeAllRanges()
      window.getSelection().addRange(range)
    }

    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', 'https://example.test/mixed')
    target.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }),
    )
    const formatted = 'A **lon**[**ger** track](https://example.test/mixed).\n\n::music{id="keep"}'
    await until(() => source() === formatted)
    await mode('Visual')
    assert(
      document.querySelector('a')?.textContent === 'ger track' &&
        document.querySelector('a strong')?.textContent === 'ger',
      'Mixed selections preserve both formatting and words',
    )
    await key(document.querySelector('.mde-visual'), 'k', { ctrlKey: true })
    await until(() => document.activeElement.getAttribute('aria-label') === 'Link destination')
    assert(
      document.activeElement.value === 'https://example.test/mixed',
      'The complete mixed link can be edited',
    )
    document.activeElement.value = '/replacement'
    document.activeElement.form.requestSubmit()
    await until(() => source() === formatted.replace('https://example.test/mixed', '/replacement'))
    await action('Undo')
    await until(() => source() === formatted)
    await mode(editingMode)
    let activeLink

    if (editingMode === 'Markdown') {
      activeLink = document.querySelector('textarea')
      activeLink.focus()
      const caret = formatted.indexOf('ger') + 1
      activeLink.setSelectionRange(caret, caret)
    } else {
      activeLink = document.querySelector('a strong')
      select(activeLink, activeLink.firstChild, 1)
    }

    await key(activeLink, 'k', { metaKey: true })
    await until(() => document.activeElement.getAttribute('aria-label') === 'Link destination')
    assert(
      document.activeElement.value === 'https://example.test/mixed',
      'Command+K at a caret inside a link exposes its existing destination',
    )
    assert(
      !document.activeElement.form.querySelector('button').disabled,
      'Active links can be edited',
    )
    document.activeElement.value = '/caret-edit'
    document.activeElement.form.requestSubmit()
    await until(() => source() === formatted.replace('https://example.test/mixed', '/caret-edit'))
    await action('Undo')
    await until(() => source() === formatted)
    await action('Undo')
    await until(() => source() === fixture)
  }

  for (const editingMode of ['Visual', 'Markdown']) {
    for (const [name, tag, listed] of [
      ['Bulleted list', 'ul', '- First **mix**\n- Second track'],
      ['Numbered list', 'ol', '1. First **mix**\n2. Second track'],
    ]) {
      const fixture = 'First **mix**\n\nSecond track\n\n::music{id="keep"}'
      await setSource(fixture)

      if (editingMode === 'Markdown') {
        await mode('Markdown')
        const input = document.querySelector('textarea')
        input.focus()
        input.setSelectionRange(0, fixture.indexOf('\n\n::music'))
        document.dispatchEvent(new Event('selectionchange'))
      } else {
        const paragraphs = document.querySelectorAll('.mde-paragraph')
        const range = document.createRange()
        range.selectNodeContents(paragraphs[0])
        range.setEnd(paragraphs[1].firstChild, 12)
        document.querySelector('.mde-visual').focus()
        window.getSelection().removeAllRanges()
        window.getSelection().addRange(range)
        document.dispatchEvent(new Event('selectionchange'))
      }

      await action(name)
      await until(() => source() === listed + '\n\n::music{id="keep"}')
      await mode('Visual')
      assert(
        document.querySelectorAll(`${tag} > li`).length === 2,
        'List items share a semantic list',
      )

      for (const alignment of ['Center', 'Right', 'Justify', 'Left']) {
        await action(alignment)
        const suffix = alignment === 'Left' ? '' : ` {align=${alignment.toLowerCase()}}`
        await until(
          () =>
            source() ===
            listed
              .split('\n')
              .map((line) => line + suffix)
              .join('\n') +
              '\n\n::music{id="keep"}',
        )
        assert(
          [...document.querySelectorAll('li')].every(
            (item) =>
              getComputedStyle(item).textAlign === alignment.toLowerCase() ||
              (alignment === 'Left' && getComputedStyle(item).textAlign === 'start'),
          ),
          'Alignment applies to every selected list item',
        )
      }

      await action(name)
      await until(() => source() === fixture)
      await action('Undo')
      await until(() => source() === listed + '\n\n::music{id="keep"}')
      await mode('Markdown')
      await mode('Visual')
      assert(source() === listed + '\n\n::music{id="keep"}', 'Mode switches preserve list source')
    }
  }

  for (const [fixture, offset, inputType, expected] of [
    ['7) First\n8) Second', 3, 'insertParagraph', '7) First\n8) Sec\n9. ond'],
    ['- First\n- ', 0, 'insertParagraph', '- First\n'],
    ['- \n- Second', 0, 'insertParagraph', '\n\n\n- Second'],
    ['- First\n- \n\nAfter', 0, 'insertParagraph', '- First\n\n\n\nAfter'],
    ['- First\n- Second', 0, 'deleteContentBackward', '- First\nSecond'],
  ]) {
    await setSource(fixture)
    const items = document.querySelectorAll('li')
    const item = fixture.startsWith('- \n') ? items[0] : items[items.length - 1]
    select(item, item.firstChild, offset)
    item.dispatchEvent(
      new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType }),
    )
    await until(() => source() === expected)

    if (fixture === '- \n- Second')
      assert(
        document.querySelector('.mde-visual').firstElementChild.tagName === 'DIV',
        'Exiting the first empty list item leaves an editable paragraph',
      )

    if (fixture.endsWith('\n\nAfter')) {
      document.execCommand('insertText', false, 'New note')
      await until(() => source() === '- First\n\nNew note\n\nAfter')
      assert(
        [...document.querySelectorAll('.mde-visual > .mde-paragraph')]
          .map((element) => element.textContent)
          .join('|') === 'New note|After',
        'Typing after list exit cannot join the following paragraph',
      )
      await action('Undo')
      await until(() => source() === expected)
    }

    await action('Undo')
    await until(() => source() === fixture)
  }

  const modeFixture = 'A longer track\n\n::music{id="keep"}'
  await setSource(modeFixture)
  const modeParagraph = document.querySelector('.mde-paragraph')
  select(modeParagraph, modeParagraph.firstChild, 2, 8)
  await key(modeParagraph, 'M', { ctrlKey: true, shiftKey: true, altKey: true })
  await key(modeParagraph, 'M', { ctrlKey: true, shiftKey: true, isComposing: true })
  assert(document.querySelector('.mde-visual'), 'Alt and IME keys do not toggle modes')
  await key(modeParagraph, 'M', { ctrlKey: true, shiftKey: true })
  await until(
    () =>
      document.querySelector('textarea') &&
      document.activeElement === document.querySelector('textarea') &&
      button('Markdown').getAttribute('aria-pressed') === 'true',
  )
  const modeInput = document.querySelector('textarea')
  assert(
    document.activeElement === modeInput &&
      modeInput.selectionStart === 2 &&
      modeInput.selectionEnd === 8 &&
      button('Markdown').getAttribute('aria-pressed') === 'true',
    'The mode shortcut preserves selection and focuses Markdown',
  )
  await key(modeInput, 'M', { ctrlKey: true, shiftKey: true, repeat: true })
  assert(document.querySelector('textarea'), 'Holding the shortcut does not toggle repeatedly')
  button('Visual').focus()
  await key(button('Visual'), 'M', { metaKey: true, shiftKey: true })
  await until(
    () =>
      document.querySelector('.mde-visual') &&
      document.activeElement === document.querySelector('.mde-visual') &&
      button('Visual').getAttribute('aria-pressed') === 'true',
  )
  assert(
    window.getSelection().toString() === 'longer' &&
      source() === modeFixture &&
      button('Visual').getAttribute('aria-pressed') === 'true' &&
      document.querySelector('.mde-mode-shortcut').textContent === 'Ctrl/⌘+Shift+M',
    'Command shortcut also works from mode controls, preserving source and visible discovery',
  )

  for (const [name, marker, tag, shortcut, inputType] of [
    ['Italic', '*longer*', 'em', 'i', 'formatItalic'],
    ['Underline', '<u>longer</u>', 'u', 'u', 'formatUnderline'],
    ['Strikethrough', '~~longer~~', 's', undefined, 'formatStrikeThrough'],
  ]) {
    for (const editingMode of ['Visual', 'Markdown']) {
      const fixture = '## A longer track\n\n::music{id="keep"}\n'
      const formatted = `## A ${marker} track\n\n::music{id="keep"}\n`
      await setSource(fixture)

      if (editingMode === 'Markdown') {
        await mode('Markdown')
        const input = document.querySelector('textarea')
        input.focus()
        input.setSelectionRange(5, 11)
        document.dispatchEvent(new Event('selectionchange'))
      } else {
        const heading = document.querySelector('h2.mde-paragraph')
        select(heading, heading.firstChild, 2, 8)
      }

      await action(name)
      await until(() => source() === formatted)
      await mode('Visual')
      assert(
        document.querySelector(`h2 ${tag}`)?.textContent === 'longer',
        `${name} renders its selected words`,
      )
      const span = document.querySelector(`h2 ${tag}`)
      select(span, span.firstChild, 0, 6)
      span.dispatchEvent(
        new InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType }),
      )
      await until(() => source() === fixture)
      const heading = document.querySelector('h2.mde-paragraph')
      select(heading, heading.firstChild, 2, 8)

      if (shortcut) await key(heading, shortcut, { ctrlKey: true })
      else await action(name)
      await until(() => source() === formatted)
      document.execCommand('insertText', false, 'short')
      await until(() => source() === formatted.replace('longer', 'short'))
      await mode('Markdown')
      await action('Undo')
      await until(() => source() === formatted)
      await action('Undo')
      await until(() => source() === fixture)
    }
  }

  for (const [name, marked, expected, shortcut, tag] of [
    ['Bold', '**tracks that stay with you**', 'tracks that stay** with you**', 'b', 'strong'],
    ['Italic', '*tracks that stay with you*', 'tracks that stay* with you*', 'i', 'em'],
    ['Underline', '<u>tracks that stay with you</u>', 'tracks that stay<u> with you</u>', 'u', 'u'],
    [
      'Strikethrough',
      '~~tracks that stay with you~~',
      'tracks that stay~~ with you~~',
      undefined,
      's',
    ],
  ]) {
    for (const editingMode of ['Visual', 'Markdown']) {
      const fixture = `A place for the ${marked}.\n\n::music{id="keep"}`
      await setSource(fixture)

      if (editingMode === 'Markdown') {
        await mode('Markdown')
        const input = document.querySelector('textarea')
        const start = fixture.indexOf('tracks')
        input.focus()
        input.setSelectionRange(start, start + 16)
        document.dispatchEvent(new Event('selectionchange'))
      } else {
        const span = document.querySelector(`.mde-paragraph ${tag}`)
        select(span, span.firstChild, 0, 16)
      }

      await until(() => !button(name).disabled)

      if (shortcut) await key(document.activeElement, shortcut, { metaKey: true })
      else await action(name)
      await until(() => source() === `A place for the ${expected}.\n\n::music{id="keep"}`)
      await mode('Visual')
      assert(
        window.getSelection().toString() === 'tracks that stay',
        `${name} retains partial selection`,
      )
      assert(
        document.querySelector(`.mde-paragraph ${tag}`)?.textContent === ' with you',
        `${name} preserves the unselected marked words`,
      )
      await mode('Markdown')
      await action('Undo')
      await until(() => source() === fixture)
      await mode('Visual')
      assert(
        window.getSelection().toString() === 'tracks that stay',
        `${name} undo restores partial selection across modes`,
      )
    }
  }

  await setSource('A longer track\n\n::music{id="keep"}')
  const plain = document.querySelector('.mde-paragraph')
  select(plain, plain.firstChild, 2, 8)

  for (const [name, spelling] of [
    ['Italic', '*longer*'],
    ['Bold', '***longer***'],
    ['Underline', '<u>***longer***</u>'],
    ['Strikethrough', '<u>~~***longer***~~</u>'],
  ]) {
    await action(name)
    await until(() => source() === `A ${spelling} track\n\n::music{id="keep"}`)
  }

  assert(
    document.querySelector('s u strong em')?.textContent === 'longer',
    'Marks compose without losing their text',
  )
  assert(
    window.getSelection().toString() === 'longer',
    'Composed marks retain the visible selection',
  )
  await until(
    () =>
      JSON.parse(document.querySelector('[aria-label="JSON document"]').textContent).nodes[0]
        .children[1].strikethrough,
  )

  for (const [fixture, after] of [
    ['Before\n\n::music{id="keep"}\n\nAfter', 'Before\n\nAfter'],
    ['::music{id="keep"}\n\nAfter', 'After'],
    ['Before\n\n::music{id="keep"}', 'Before'],
    ['::music{id="keep"}', ''],
    ['::music{id="first"}\n\n::music{id="keep"}\n\nAfter', '::music{id="keep"}\n\nAfter'],
  ]) {
    await setSource(fixture)
    let card = document.querySelector('.mde-protected')
    assert(
      card.tabIndex === 0 && card.getAttribute('role') === 'group',
      'Protected card is keyboard-focusable and named',
    )
    card.focus()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    const clipboard = new DataTransfer()
    clipboard.setData('text/plain', 'Do not insert into a focused card')
    card.dispatchEvent(
      new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }),
    )
    await new Promise((resolve) => requestAnimationFrame(resolve))
    assert(source() === fixture, 'Pasting on a focused card must not edit the stale text selection')
    await key(card, fixture.startsWith('Before') ? 'Enter' : 'F2')
    await until(() => document.querySelector('textarea'))
    const input = document.querySelector('textarea')
    assert(
      input.value.slice(input.selectionStart, input.selectionEnd).startsWith('::music'),
      'F2 opens Markdown with the whole block selected',
    )
    await mode('Visual')
    card = document.querySelector('.mde-protected')
    card.focus()
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await key(card, 'Delete')
    await until(() => source() === after)
    await action('Undo')
    await until(() => source() === fixture)
    assert(
      document.activeElement.classList.contains('mde-protected'),
      'Undo restores block keyboard focus',
    )
    await key(document.activeElement, 'Backspace')
    await until(() => source() === after)
    await action('Undo')
    await until(() => source() === fixture)
  }

  await setSource('Before\n\n::music{id="keep"}\n\nAfter')
  const firstText = document.querySelector('.mde-paragraph')
  select(firstText, firstText.firstChild, 6)
  await key(document.querySelector('.mde-visual'), 'ArrowDown')
  await until(() => document.activeElement.classList.contains('mde-protected'))
  await key(document.activeElement, 'ArrowDown')
  assert(
    document.activeElement.classList.contains('mde-visual'),
    'ArrowDown returns to adjacent editable text',
  )
  await mode('Markdown')
  assert(
    document.querySelector('textarea').selectionStart === 28,
    'Card navigation places caret at the following paragraph start',
  )
  await mode('Visual')
  await key(document.querySelector('.mde-visual'), 'ArrowUp')
  await until(() => document.activeElement.classList.contains('mde-protected'))
  await key(document.activeElement, 'ArrowUp')
  await mode('Markdown')
  assert(
    document.querySelector('textarea').selectionStart === 6,
    'ArrowUp places caret at the previous paragraph end',
  )

  for (const [fixture, paragraphIndex, offset, direction] of [
    ['Before\n\n::music{id="keep"}\n\nAfter', 0, 2, 'ArrowDown'],
    ['Before\n\n::music{id="keep"}\n\nAfter', 1, 2, 'ArrowUp'],
    ['First line\nLast line\n\n::music{id="keep"}', 0, 13, 'ArrowDown'],
  ]) {
    await setSource(fixture)
    const paragraph = document.querySelectorAll('.mde-paragraph')[paragraphIndex]
    select(paragraph, paragraph.firstChild, offset)
    await key(document.querySelector('.mde-visual'), direction)
    assert(
      document.activeElement.classList.contains('mde-protected'),
      'Vertical navigation reaches the component from any column on the adjacent line',
    )
    await key(document.activeElement, 'Enter')
    await until(() => document.querySelector('textarea'))
    const input = document.querySelector('textarea')
    assert(
      input.value.slice(input.selectionStart, input.selectionEnd) === '::music{id="keep"}',
      'Keyboard-only navigation opens the component source',
    )
  }

  await setSource('First line\nLast line\n\n::music{id="keep"}')
  const multiline = document.querySelector('.mde-paragraph')
  select(multiline, multiline.firstChild, 2)
  const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
  document.querySelector('.mde-visual').dispatchEvent(down)
  assert(
    !down.defaultPrevented,
    'Vertical navigation within a paragraph keeps native line movement',
  )

  for (const [offset, direction] of [
    [1, 'ArrowDown'],
    [2, 'ArrowUp'],
    [1, 'ArrowRight'],
    [2, 'ArrowLeft'],
  ]) {
    await setSource('Before\n\n::music{id="keep"}\n\nAfter')
    const visual = document.querySelector('.mde-visual')
    select(visual, visual, offset)
    await key(visual, direction)
    assert(
      document.activeElement.classList.contains('mde-protected'),
      'Caret positions between blocks can enter the component with arrows',
    )
  }

  for (let level = 1; level <= 6; level += 1) {
    const fixture = `Before\n ${'#'.repeat(level)}\tA **longer** title ###  \nAfter\n\n::music{id="keep"}\n`
    await setSource(fixture)
    assert(!document.querySelector(':popover-open'), 'Formatting popovers are closed by default')
    const heading = document.querySelector(`.mde-visual > h${level}`)
    assert(heading?.textContent === 'A longer title', `Heading ${level} must hide ATX syntax`)
    assert(
      document.querySelectorAll('[contenteditable="true"]').length === 1,
      'Headings share one editing host',
    )
    await mode('Markdown')
    assert(
      document.querySelector('textarea').value === fixture,
      'Mode switches preserve exact heading syntax',
    )
    await mode('Visual')
    const strong = document.querySelector(`h${level} strong`)
    select(strong, strong.firstChild, 0, 6)
    await until(() => !button('Bold').disabled)
    const target = level === 2 ? 3 : 2
    const converted = `Before\n${'#'.repeat(target)} A **longer** title\nAfter\n\n::music{id="keep"}\n`
    await action(`Heading ${target}`)
    await until(() => source() === converted)
    assert(!document.querySelector(':popover-open'), 'Choosing a heading dismisses its menu')
    assert(window.getSelection().toString() === 'longer', 'Conversion restores text selection')
    await action('Paragraph')
    await until(() => source() === 'Before\nA **longer** title\nAfter\n\n::music{id="keep"}\n')
    await mode('Markdown')
    await action('Undo')
    await until(() => source() === converted)
    await action('Undo')
    await until(() => source() === fixture)
    await action('Redo')
    await until(() => source() === converted)
  }

  await setSource('## Longer title\n\n::music{id="keep"}')
  const headingText = document.querySelector('h2.mde-paragraph').firstChild
  select(headingText.parentElement, headingText, 0, 6)
  document.execCommand('insertText', false, 'Short')
  await until(() => source() === '## Short title\n\n::music{id="keep"}')
  await until(
    () =>
      JSON.parse(document.querySelector('[aria-label="JSON document"]').textContent).nodes[0]
        .level === 2,
  )
  const editedHeading = document.querySelector('h2.mde-paragraph')
  select(editedHeading, editedHeading.firstChild, 5)
  editedHeading.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertParagraph',
    }),
  )
  await until(() => source() === '## Short\n\n title\n\n::music{id="keep"}')
  assert(window.getSelection().anchorOffset === 0, 'Enter places caret at the new paragraph start')
  await action('Undo')
  await until(() => source() === '## Short title\n\n::music{id="keep"}')

  await setSource('#')
  const emptyHeading = document.querySelector('h1.mde-paragraph')
  select(emptyHeading, emptyHeading, 0)
  document.execCommand('insertText', false, 'New')
  await until(() => source() === '# New')
  await setSource('## ###')
  const closedEmpty = document.querySelector('h2.mde-paragraph')
  select(closedEmpty, closedEmpty, 0)
  document.execCommand('insertText', false, 'New')
  await until(() => source() === '## New ###')

  for (const closing of ['', ' ###']) {
    await setSource(`## Start${closing}`)
    const typingHeading = document.querySelector('h2.mde-paragraph')
    select(typingHeading, typingHeading.firstChild, 5)
    let typed = ''

    for (const character of ' a new title') {
      document.execCommand('insertText', false, character)
      typed += character
      await until(() => source() === `## Start${typed}${closing}`)
      assert(
        document.querySelector('h2.mde-paragraph').textContent === `Start${typed}`,
        'Heading typing retains spaces between keystrokes',
      )
    }
  }

  await setSource('### ')
  const blankHeading = document.querySelector('h3.mde-paragraph')
  select(blankHeading, blankHeading, 0)
  blankHeading.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertParagraph',
    }),
  )
  await until(() => source() === '')
  assert(!document.querySelector('.mde-visual h3'), 'Enter exits an empty heading')

  await setSource('## First\n\nSecond')
  const afterHeading = document.querySelectorAll('.mde-paragraph')[1]
  select(afterHeading, afterHeading.firstChild, 0)
  document.execCommand('delete')
  await until(() => source() === '## FirstSecond')
  await action('Undo')
  await until(() => source() === '## First\n\nSecond')
  await setSource('First\n\n## Second')
  const followingHeading = document.querySelector('h2.mde-paragraph')
  select(followingHeading, followingHeading.firstChild, 0)
  document.execCommand('delete')
  await until(() => source() === 'FirstSecond')

  await setSource('##\n\nSecond')
  const headingRange = document.createRange()
  const headingRoot = document.querySelector('.mde-visual')
  headingRoot.focus()
  headingRange.setStart(headingRoot.querySelector('h2'), 0)
  headingRange.setEnd(headingRoot.querySelector('div.mde-paragraph').firstChild, 3)
  window.getSelection().removeAllRanges()
  window.getSelection().addRange(headingRange)
  headingRoot.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertParagraph',
    }),
  )
  await until(() => source() === '## \n\nond')

  const fixture = 'Before **longer** after.\n\nEditable paragraph.\n\n::music{id="keep"}\n'
  await setSource(fixture)
  const paragraph = document.querySelector('.mde-paragraph')
  const strong = paragraph.querySelector('strong')
  select(paragraph, strong.firstChild, 0, 6)
  await until(() => !document.querySelector('[aria-label="Bold"]').disabled)
  document.querySelector('[aria-label="Bold"]').click()
  await until(() => source() === fixture.replace('**longer**', 'longer'))
  await mode('Markdown')
  assert(
    document.querySelector('textarea').value === source(),
    'Raw view must reflect visual edits',
  )
  await action('Undo')
  await until(() => source() === fixture)
  await action('Redo')
  await until(() => source() === fixture.replace('**longer**', 'longer'))

  await setSource('Hello !word.')
  const bangParagraph = document.querySelector('.mde-paragraph')
  select(bangParagraph, bangParagraph.firstChild, 7, 11)
  await until(() => !button('Apply link').disabled)
  await openLink()
  const bangDestination = document.querySelector('[aria-label="Link destination"]')
  bangDestination.focus()
  bangDestination.value = '/mix'
  bangDestination.dispatchEvent(new Event('input', { bubbles: true }))
  bangDestination.closest('form').requestSubmit()
  assert(
    !bangDestination.validity.valid &&
      source() === 'Hello !word.' &&
      !document.querySelector('.mde-protected'),
    'Link insertion must refuse image adjacency without replacing the editable paragraph',
  )

  const linkFixture = 'A longer track.\n\n::music{id="keep"}\n'
  await setSource(linkFixture)
  const linkParagraph = document.querySelector('.mde-paragraph')
  select(linkParagraph, linkParagraph.firstChild, 2, 8)
  await until(() => !button('Apply link').disabled)
  await openLink()
  let destination = document.querySelector('[aria-label="Link destination"]')
  destination.focus()
  destination.value = 'javascript:evil'
  destination.dispatchEvent(new Event('input', { bubbles: true }))
  destination.closest('form').requestSubmit()
  assert(
    !destination.validity.valid &&
      source() === linkFixture &&
      destination.closest('form').matches(':popover-open'),
    'Unsafe URL must refuse without an edit',
  )
  destination.value = '/mixes/night'
  destination.dispatchEvent(new Event('input', { bubbles: true }))
  destination.closest('form').requestSubmit()
  const linked = 'A [longer](/mixes/night) track.\n\n::music{id="keep"}\n'
  await until(() => source() === linked)
  assert(!document.querySelector(':popover-open'), 'Accepted link formatting closes the popover')
  assert(window.getSelection().toString() === 'longer', 'Link popover retains the selected words')
  const anchor = document.querySelector('.mde-paragraph a')
  assert(
    anchor?.textContent === 'longer' && anchor.getAttribute('href') === '/mixes/night',
    'Link must render its label and destination',
  )
  const preview = () => document.querySelector('.mde-link-preview')
  const previewUrl = () => preview()?.querySelector('.mde-link-url').textContent
  anchor.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
  assert(!preview(), 'Ordinary hover does not show the modifier-only destination')
  await key(anchor, 'Meta')
  assert(previewUrl() === '/mixes/night', 'Command reveals the hovered destination')
  const open = preview().querySelector('a')
  assert(
    open.getAttribute('href') === '/mixes/night' &&
      open.target === '_blank' &&
      open.rel === 'noopener noreferrer' &&
      preview().querySelector('button').getAttribute('aria-label') === 'Copy link',
    'The card exposes safe new-tab opening and a copy action',
  )
  anchor.dispatchEvent(
    new PointerEvent('pointerout', { bubbles: true, relatedTarget: linkParagraph }),
  )
  await until(() => !preview())
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Meta', bubbles: true }))
  await key(anchor, 'Control')
  anchor.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }))
  assert(previewUrl() === '/mixes/night', 'Ctrl held before hover also reveals the URL')
  anchor.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, relatedTarget: preview() }))
  preview().dispatchEvent(new PointerEvent('pointerenter'))
  document.dispatchEvent(new KeyboardEvent('keyup', { key: 'Control', bubbles: true }))
  assert(preview(), 'Release keeps the card available for its actions')
  preview().querySelector('a').focus()
  await key(document.activeElement, 'Escape')
  assert(!preview(), 'Escape dismisses the card')
  assert(document.activeElement.matches('.mde-visual'), 'Escape returns focus to the editor')
  anchor.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, metaKey: true }))
  window.dispatchEvent(new Event('blur'))
  assert(!preview(), 'Window blur clears a held-modifier preview')
  assert(source() === linked, 'Destination preview does not edit the document')
  const beforeClick = location.href
  anchor.click()
  assert(location.href === beforeClick, 'Editing a link must not navigate away')
  await until(
    () =>
      JSON.parse(document.querySelector('[aria-label="JSON document"]').textContent).nodes[0]
        .children[1].href === '/mixes/night',
  )
  select(anchor, anchor.firstChild, 0, 6)
  await until(
    () => document.querySelector('[aria-label="Link destination"]').value === '/mixes/night',
  )
  await openLink()
  destination = document.querySelector('[aria-label="Link destination"]')
  destination.focus()
  destination.value = 'https://gbfm.co.za/mixes'
  destination.dispatchEvent(new Event('input', { bubbles: true }))
  destination.closest('form').requestSubmit()
  await until(() => source() === linked.replace('/mixes/night', 'https://gbfm.co.za/mixes'))
  await mode('Markdown')
  assert(
    document.querySelector('textarea').selectionStart === 3 &&
      document.querySelector('textarea').selectionEnd === 9,
    'Link formatting must retain source label selection',
  )
  await action('Undo')
  await until(() => source() === linked)
  const rawLink = document.querySelector('textarea')
  rawLink.focus()
  rawLink.setSelectionRange(3, 9)
  document.dispatchEvent(new Event('selectionchange'))
  await until(
    () => document.querySelector('[aria-label="Link destination"]').value === '/mixes/night',
  )
  await openLink()
  destination = document.querySelector('[aria-label="Link destination"]')
  destination.focus()
  destination.value = ''
  destination.dispatchEvent(new Event('input', { bubbles: true }))
  destination.closest('form').requestSubmit()
  await until(() => source() === linkFixture)
  await mode('Visual')
  await action('Undo')
  await until(() => source() === linked)
  const editableLink = document.querySelector('.mde-paragraph a')
  select(editableLink, editableLink.firstChild, 3)
  document.execCommand('insertText', false, '!')
  await until(() => source() === linked.replace('[longer]', '[lon!ger]'))
  await action('Undo')
  await until(() => source() === linked)

  await setSource('One\n\nTwo')
  const first = document.querySelector('.mde-paragraph')
  select(first, first.firstChild, 3)
  first.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertParagraph',
    }),
  )
  await until(() => source() === 'One\n\n\n\nTwo')
  assert(
    window.getSelection().anchorNode.parentElement.closest('.mde-paragraph')?.dataset.start ===
      '5' || window.getSelection().anchorNode.dataset?.start === '5',
    'Enter must focus the inserted empty paragraph',
  )

  await setSource('A **longer** track.')
  const boldParagraph = document.querySelector('.mde-paragraph')
  select(boldParagraph, boldParagraph.querySelector('strong').firstChild, 3)
  boldParagraph.dispatchEvent(
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertParagraph',
    }),
  )
  await until(() => source() === 'A **lon**\n\n**ger** track.')
  assert(
    window.getSelection().anchorNode.parentElement.closest('.mde-paragraph').textContent ===
      'ger track.',
    'Splitting bold must keep an editable destination',
  )
  assert(
    document.querySelectorAll('.mde-paragraph strong').length === 2,
    'Both split pieces must retain bold',
  )

  await setSource('Before\n\n::music{id="keep"}')
  const composing = document.querySelector('.mde-paragraph')
  composing.focus()
  composing.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  composing.textContent = '日本語'
  select(composing, composing.firstChild, 3)
  composing.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      isComposing: true,
      inputType: 'insertCompositionText',
    }),
  )
  await new Promise((resolve) => requestAnimationFrame(resolve))
  assert(
    source() === 'Before\n\n::music{id="keep"}',
    'Composition must not commit intermediate text',
  )
  assert(composing.isConnected, 'Composition must not replace its active DOM node')
  composing.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '日本語' }))
  await until(() => source() === '日本語\n\n::music{id="keep"}')

  const pasted = document.querySelector('.mde-paragraph')
  select(pasted, pasted.firstChild, 3)
  const clipboard = new DataTransfer()
  clipboard.setData('text/plain', '<img src=x onerror=alert(1)>')
  clipboard.setData('text/html', '<img src=x onerror=alert(1)>')
  pasted.dispatchEvent(
    new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: clipboard }),
  )
  await until(() => source() === '日本語<img src=x onerror=alert(1)>\n\n::music{id="keep"}')
  assert(
    document.querySelectorAll('img').length === 0,
    'Pasted HTML must never create DOM elements',
  )
  await action('Undo')
  await until(() => source() === '日本語\n\n::music{id="keep"}')

  document.querySelector('.mde-protected button').click()
  await until(() => document.querySelector('textarea'))
  assert(
    document.querySelector('textarea').selectionStart === 5,
    'Edit source must select the protected block',
  )
  await setSource('')
  assert(
    document.querySelectorAll('.mde-paragraph').length === 1,
    'Empty source must remain editable',
  )
  assert(
    document.querySelector('.mde-paragraph').isContentEditable,
    'Empty paragraph must accept input',
  )

  await setSource('One longer\n\nTwo shorter\n\n::music{id="keep"}\n')
  assert(
    document.querySelectorAll('[contenteditable="true"]').length === 1,
    'Visual mode must have one editing host',
  )
  const paragraphs = document.querySelectorAll('.mde-paragraph')
  const across = document.createRange()
  document.querySelector('.mde-visual').focus()
  across.setStart(paragraphs[0].firstChild, 4)
  across.setEnd(paragraphs[1].firstChild, 4)
  window.getSelection().removeAllRanges()
  window.getSelection().addRange(across)
  document.dispatchEvent(new Event('selectionchange'))
  await new Promise((resolve) => requestAnimationFrame(resolve))
  document.execCommand('insertText', false, 'new ')
  await until(() => source() === 'One new shorter\n\n::music{id="keep"}\n')
  await until(
    () =>
      JSON.parse(document.querySelector('[aria-label="JSON document"]').textContent).source ===
      source(),
  )
  await action('Undo')
  await until(() => source() === 'One longer\n\nTwo shorter\n\n::music{id="keep"}\n')
  await mode('Markdown')
  assert(
    document.querySelector('textarea').selectionStart === 4 &&
      document.querySelector('textarea').selectionEnd === 16,
    'Undo must restore cross-paragraph selection',
  )

  await setSource('First\n\nSecond')
  const second = document.querySelectorAll('.mde-paragraph')[1]
  select(second, second.firstChild, 0)
  document.execCommand('delete')
  await until(() => source() === 'FirstSecond')
  await action('Undo')
  await until(() => source() === 'First\n\nSecond')
  const preceding = document.querySelector('.mde-paragraph')
  select(preceding, preceding.firstChild, 5)
  document.execCommand('forwardDelete')
  await until(() => source() === 'FirstSecond')
  const whole = document.createRange()
  whole.selectNodeContents(document.querySelector('.mde-visual'))
  window.getSelection().removeAllRanges()
  window.getSelection().addRange(whole)
  document.execCommand('delete')
  await until(() => source() === '')
  await setSource('')

  // Quotes: source-backed single-line editing, separate from link-preview checks above.
  {
    const quoteNode = () => document.querySelector('blockquote.mde-paragraph')

    const beforeInput = (target, inputType) =>
      target.dispatchEvent(
        new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType,
        }),
      )

    const fixture =
      'Before\n\n> A **longer** *mix* <u>track</u> ~~cut~~ [link](/mix) {align=right}\n\n::music{id="keep"}\n'

    await setSource(fixture)
    assert(
      quoteNode()?.textContent === 'A longer mix track cut link',
      'A semantic blockquote hides its source marker',
    )
    assert(
      quoteNode().querySelector('strong')?.textContent === 'longer' &&
        quoteNode().querySelector('em')?.textContent === 'mix' &&
        quoteNode().querySelector('u')?.textContent === 'track' &&
        quoteNode().querySelector('s')?.textContent === 'cut' &&
        quoteNode().querySelector('a')?.getAttribute('href') === '/mix',
      'Quotes retain all supported marks and links',
    )
    assert(quoteNode().style.textAlign === 'right', 'Quote alignment is source-backed')
    assert(
      document.querySelectorAll('[contenteditable="true"]').length === 1,
      'Quotes share the one editing host',
    )
    await mode('Markdown')
    assert(
      document.querySelector('textarea').value === fixture,
      'Quote mode switches preserve exact source',
    )
    await mode('Visual')
    const strong = quoteNode().querySelector('strong')
    select(strong, strong.firstChild, 0, 6)
    await until(() => button('Quote').getAttribute('aria-pressed') === 'true')
    assert(
      button('Paragraph').getAttribute('aria-pressed') !== 'true',
      'A quote is not an active paragraph',
    )
    await action('Heading 2')
    const headingSource = fixture.replace('> A ', '## A ')
    await until(() => source() === headingSource)
    assert(window.getSelection().toString() === 'longer', 'Quote conversion retains selection')
    await mode('Markdown')
    await action('Undo')
    await until(() => source() === fixture)
    assert(
      document.querySelector('textarea').selectionStart === fixture.indexOf('longer') &&
        document.querySelector('textarea').selectionEnd === fixture.indexOf('longer') + 6,
      'Undo across modes restores quote source selection',
    )
    await mode('Visual')
    await action('Paragraph')
    await until(() => source() === fixture.replace('> A ', 'A '))
    await action('Quote')
    await until(() => source() === fixture)
    await action('Bulleted list')
    await until(() => source() === fixture.replace('> A ', '- A '))
    await action('Quote')
    await until(() => source() === fixture)
    await until(
      () =>
        JSON.parse(document.querySelector('[aria-label="JSON document"]').textContent).source ===
        fixture,
    )
    assert(
      JSON.stringify(
        JSON.parse(document.querySelector('[aria-label="JSON document"]').textContent).nodes.map(
          (node) => node._tag,
        ),
      ) === JSON.stringify(['Paragraph', 'Blockquote', 'Raw']),
      'JSON derives a quote node from the same source',
    )

    // Insert the marker character by character, then type at the restored caret.
    await setSource('')
    const empty = document.querySelector('.mde-paragraph')
    select(empty, empty, 0)
    let typed = ''

    for (const character of '> Quoted') {
      document.execCommand('insertText', false, character)
      typed += character
      await until(() => source() === typed)
    }

    assert(
      quoteNode()?.textContent === 'Quoted',
      'Typing > space creates a quote through the normal source read path',
    )
    const text = quoteNode().firstChild
    select(quoteNode(), text, 1, 4)
    document.execCommand('insertText', false, 'NEW')
    await until(() => source() === '> QNEWed')
    assert(window.getSelection().anchorOffset === 4, 'Quote replacement restores the visible caret')
    await mode('Markdown')
    await action('Undo')
    await until(() => source() === '> Quoted')
    await mode('Visual')
    assert(window.getSelection().toString() === 'uot', 'Undo restores quote visual selection')

    await setSource('> **longer**\n\n::music{id="keep"}')
    const marked = quoteNode().querySelector('strong')
    select(marked, marked.firstChild, 3)
    beforeInput(quoteNode(), 'insertParagraph')
    await until(() => source() === '> **lon**\n> **ger**\n\n::music{id="keep"}')
    assert(
      document.querySelectorAll('blockquote strong').length === 2,
      'Enter continues quotes and splits marks',
    )
    assert(
      window.getSelection().anchorNode.parentElement.closest('blockquote')?.textContent === 'ger',
      'Enter restores the continued quote caret',
    )

    await setSource('> First\n> \n> Last')
    const blankQuote = document.querySelectorAll('blockquote')[1]
    select(blankQuote, blankQuote, 0)
    beforeInput(blankQuote, 'insertParagraph')
    await until(() => source() === '> First\n\n\n\n> Last')
    document.execCommand('insertText', false, 'Outside')
    await until(() => source() === '> First\n\nOutside\n\n> Last')
    assert(
      document.querySelectorAll('blockquote').length === 2 &&
        !document.querySelector('.mde-protected'),
      'Empty quote Enter exits without creating a lazy continuation',
    )

    await setSource('> First\n> Second\n> Third')
    const secondQuote = document.querySelectorAll('blockquote')[1]
    select(secondQuote, secondQuote.firstChild, 0)
    beforeInput(secondQuote, 'deleteContentBackward')
    await until(() => source() === '> First\n\nSecond\n\n> Third')
    assert(
      !document.querySelector('.mde-protected'),
      'Backspace removes the quote marker and separates neighboring quotes',
    )
    await action('Undo')
    await until(() => source() === '> First\n> Second\n> Third')

    await setSource('> First\n- Second')
    const followingList = document.querySelector('li.mde-paragraph')
    select(followingList, followingList.firstChild, 0)
    beforeInput(followingList, 'deleteContentBackward')
    await until(() => source() === '> First\n\nSecond')
    assert(
      !document.querySelector('.mde-protected'),
      'Removing a neighboring list marker does not create a lazy quote continuation',
    )

    await setSource('> First\n- ')
    const emptyList = document.querySelector('li.mde-paragraph')
    select(emptyList, emptyList, 0)
    beforeInput(emptyList, 'insertParagraph')
    await until(() => source() === '> First\n\n')
    document.execCommand('insertText', false, 'Outside')
    await until(() => source() === '> First\n\nOutside')

    await setSource('> Final')
    select(quoteNode(), quoteNode().firstChild, 5)
    beforeInput(quoteNode(), 'insertParagraph')
    await until(() => source() === '> Final\n> ')
    const lastQuote = document.querySelectorAll('blockquote')[1]
    select(lastQuote, lastQuote, 0)
    beforeInput(lastQuote, 'insertParagraph')
    await until(() => source() === '> Final\n\n')
    document.execCommand('insertText', false, 'Outside')
    await until(() => source() === '> Final\n\nOutside')

    for (const unsupported of [
      '> > nested',
      '> # heading',
      '> - item',
      '> 1. item',
      '> words\nlazy continuation',
      '> words\n> # nested heading',
    ]) {
      const protectedSource = `Before\n\n${unsupported}\n\nAfter`
      await setSource(protectedSource)
      assert(
        document.querySelector('.mde-protected pre')?.textContent === unsupported &&
          !document.querySelector('blockquote'),
        'Complex quotes remain protected source',
      )
      const preceding = document.querySelector('.mde-paragraph')
      select(preceding, preceding.firstChild, 6)
      document.execCommand('insertText', false, '!')
      await until(() => source() === protectedSource.replace('Before', 'Before!'))
      await mode('Markdown')
      assert(
        document.querySelector('textarea').value === protectedSource.replace('Before', 'Before!'),
        'Unrelated edits and mode switches preserve unsupported quote bytes',
      )
      await action('Undo')
      await until(() => source() === protectedSource)
    }

    await setSource('')
  }

  return 'Passed: visible mode shortcut with preserved selection, one editing host, ATX headings, bold/italic/underline/strikethrough in both modes, composed marks/typing/JSON/undo, protected-block focus/navigation/source editing/deletion/undo, cross-paragraph editing, safe links, splits, composition, safe paste, empty document.'
}

// oxlint-disable-next-line typescript/no-floating-promises -- agent-browser awaits the final expression and fails on rejection.
checkEditor()
