async function checkPersistence() {
  const assert = (condition, message) => {
    if (!condition) throw new Error(message)
  }

  const until = async (condition) => {
    const deadline = performance.now() + 5000

    while (!condition()) {
      assert(performance.now() < deadline, 'Timed out waiting for persistence')
      await new Promise((resolve) => setTimeout(resolve, 16))
    }
  }

  const button = (doc, name) =>
    Array.from(doc?.querySelectorAll('button') ?? []).find(
      (element) => element.textContent === name,
    )

  const source = (doc) => doc?.querySelector('#mde-surface')?.dataset.source
  const saved = (doc) => doc?.querySelector('[role="status"]')?.textContent === 'Saved locally'

  const setSource = async (doc, text) => {
    button(doc, 'Markdown').click()
    await until(() => doc.querySelector('textarea'))
    const input = doc.querySelector('textarea')
    input.value = text
    input.setSelectionRange(0, 0)
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }))
    await until(() => source(doc) === text)
  }

  const fixture = 'Exact **Markdown**\n\n::music{id="preserve"}\n'
  await setSource(document, fixture)
  button(document, 'Save now').click()
  await until(() => saved(document))
  const frame = document.createElement('iframe')
  frame.src = '/'
  frame.hidden = true
  document.body.append(frame)
  let repair

  try {
    await until(() => source(frame.contentDocument) === fixture && saved(frame.contentDocument))
    assert(button(frame.contentDocument, 'Undo').disabled, 'Restart resets history')
    assert(
      frame.contentDocument.querySelector('#mde-surface').dataset.mode === 'Visual',
      'Restart resets mode',
    )
    assert(
      JSON.parse(frame.contentDocument.querySelector('[aria-label="JSON document"]').textContent)
        .source === fixture,
      'JSON output matches reloaded source',
    )
    await setSource(document, 'Winning tab\n')
    await until(() => saved(document))
    await setSource(frame.contentDocument, 'Keep these conflicting edits\n')
    await until(
      () => frame.contentDocument.querySelector('[role="status"]')?.textContent === 'Save conflict',
    )
    assert(
      source(frame.contentDocument) === 'Keep these conflicting edits\n',
      'Conflict preserves local edits',
    )
    assert(button(frame.contentDocument, 'Save now').disabled, 'Conflict cannot silently overwrite')
    frame.contentWindow.location.reload()
    await until(
      () => source(frame.contentDocument) === 'Winning tab\n' && saved(frame.contentDocument),
    )
    await setSource(document, '')
    await until(() => saved(document))
    frame.contentWindow.location.reload()
    await until(() => source(frame.contentDocument) === '' && saved(frame.contentDocument))
    assert(source(frame.contentDocument) !== fixture, 'Empty document does not restore seed')
    await setSource(document, 'Previous checkpoint\n')
    await until(() => saved(document))
    await setSource(document, 'Latest checkpoint\n')
    await until(() => saved(document))
    await new Promise((resolve, reject) => {
      const request = indexedDB.open('foldkit-mde-playground', 1)
      request.addEventListener('error', () => reject(request.error))
      request.addEventListener('success', () => {
        const db = request.result
        const transaction = db.transaction('documents', 'readwrite')
        const store = transaction.objectStore('documents')
        const lookup = store.get(['playground', 'welcome'])
        lookup.addEventListener('success', () => {
          repair = lookup.result
          store.put({ ...lookup.result, latest: { corrupt: true } }, ['playground', 'welcome'])
        })
        transaction.addEventListener('complete', () => {
          db.close()
          resolve()
        })
        transaction.addEventListener('abort', () => {
          db.close()
          reject(transaction.error)
        })
      })
    })
    frame.contentWindow.location.reload()
    await until(() => button(frame.contentDocument, 'Check previous checkpoint'))
    assert(!frame.contentDocument.querySelector('[contenteditable]'), 'Load failure pauses editing')
    button(frame.contentDocument, 'Check previous checkpoint').click()
    await until(() => frame.contentDocument.querySelector('.mde-recovery-source'))
    assert(
      frame.contentDocument.querySelector('.mde-recovery-source').textContent ===
        'Previous checkpoint\n',
      'Previous source offered without overwriting latest',
    )

    return 'Passed: packaged autosave, explicit flush, exact reload, reset history/mode, live JSON, two-tab conflict preservation, empty recovery, corrupt latest and previous-checkpoint UI.'
  } finally {
    frame.remove()

    if (repair)
      await new Promise((resolve, reject) => {
        const request = indexedDB.open('foldkit-mde-playground', 1)
        request.addEventListener('error', () => reject(request.error))
        request.addEventListener('success', () => {
          const db = request.result
          const transaction = db.transaction('documents', 'readwrite')
          transaction.objectStore('documents').put(repair, ['playground', 'welcome'])
          transaction.addEventListener('complete', () => {
            db.close()
            resolve()
          })
          transaction.addEventListener('abort', () => {
            db.close()
            reject(transaction.error)
          })
        })
      })
  }
}

// oxlint-disable-next-line typescript/no-floating-promises -- agent-browser awaits the final expression and fails on rejection.
checkPersistence()
