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
    Array.from(document.querySelectorAll('button')).find((element) => element.textContent === name)

  const mode = async (name) => {
    button(name).click()
    await until(() => document.getElementById('mde-surface').dataset.mode === name)
  }

  const action = async (name) => {
    await until(() => !button(name).disabled)
    button(name).click()
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

  for (let level = 1; level <= 6; level += 1) {
    const fixture = `Before\n ${'#'.repeat(level)}\tA **longer** title ###  \nAfter\n\n::music{id="keep"}\n`
    await setSource(fixture)
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
    await until(() => !button('Toggle bold').disabled)
    const target = level === 2 ? 3 : 2
    const converted = `Before\n${'#'.repeat(target)} A **longer** title\nAfter\n\n::music{id="keep"}\n`
    await action(`Heading ${target}`)
    await until(() => source() === converted)
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
  await until(() => !document.querySelector('[aria-label="Toggle bold"]').disabled)
  document.querySelector('[aria-label="Toggle bold"]').click()
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
  let destination = document.querySelector('[aria-label="Link destination"]')
  destination.focus()
  destination.value = 'javascript:evil'
  destination.dispatchEvent(new Event('input', { bubbles: true }))
  destination.closest('form').requestSubmit()
  assert(
    !destination.validity.valid && source() === linkFixture,
    'Unsafe URL must refuse without an edit',
  )
  destination.value = '/mixes/night'
  destination.dispatchEvent(new Event('input', { bubbles: true }))
  destination.closest('form').requestSubmit()
  const linked = 'A [longer](/mixes/night) track.\n\n::music{id="keep"}\n'
  await until(() => source() === linked)
  const anchor = document.querySelector('.mde-paragraph a')
  assert(
    anchor?.textContent === 'longer' && anchor.getAttribute('href') === '/mixes/night',
    'Link must render its label and destination',
  )
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

  return 'Passed: one editing host, ATX heading levels/conversion/typing/splits/joins/selection/undo, cross-paragraph replacement and undo, JSON projection, host-selected bold, safe link insertion/replacement/removal in both modes, link label editing, splits, composition, safe paste, protected source, empty document.'
}

// oxlint-disable-next-line typescript/no-floating-promises -- agent-browser awaits the final expression and fails on rejection.
checkEditor()
