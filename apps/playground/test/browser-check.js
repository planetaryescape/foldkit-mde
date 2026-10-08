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

  return 'Passed: one editing host, cross-paragraph replacement and undo, JSON projection, formatting, splits, composition, safe paste, protected source, empty document.'
}

// oxlint-disable-next-line typescript/no-floating-promises -- agent-browser awaits the final expression and fails on rejection.
checkEditor()
