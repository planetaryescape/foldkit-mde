import { Effect, Queue, Stream } from 'effect'

const icon = (path: string) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('fill', 'none')
  svg.setAttribute('stroke', 'currentColor')
  svg.setAttribute('stroke-width', '1.75')
  svg.setAttribute('stroke-linecap', 'round')
  svg.setAttribute('stroke-linejoin', 'round')
  svg.setAttribute('aria-hidden', 'true')
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  line.setAttribute('d', path)
  svg.append(line)

  return svg
}

/** Own a modifier-revealed link card and clipboard work for one mounted editor surface. */
export const observe = (element: Element) =>
  Effect.gen(function* () {
    const copies = yield* Queue.unbounded<string>()
    const preview = document.createElement('div')
    preview.className = 'mde-link-preview'
    preview.setAttribute('role', 'group')
    preview.setAttribute('aria-label', 'Link destination and actions')
    const url = document.createElement('div')
    url.className = 'mde-link-url'
    const actions = document.createElement('div')
    actions.className = 'mde-link-actions'
    const open = document.createElement('a')
    open.append(
      icon('M14 3h7v7 M21 3 10 14 M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5'),
    )
    open.target = '_blank'
    open.rel = 'noopener noreferrer'
    open.setAttribute('aria-label', 'Open link in new tab')
    open.title = 'Open link in new tab'
    const copy = document.createElement('button')
    copy.type = 'button'
    copy.setAttribute('aria-label', 'Copy link')
    copy.title = 'Copy link'
    const copyPath = 'M9 9h12v12H9z M15 9V3H3v12h6'
    const copyIcon = icon(copyPath)
    copy.append(copyIcon)
    const feedback = document.createElement('span')
    feedback.className = 'mde-link-feedback'
    feedback.setAttribute('role', 'status')
    actions.append(open, copy)
    preview.append(url, actions, feedback)
    let hovered: HTMLAnchorElement | undefined
    let modifier = false
    let dismissal = 0

    const cancelDismissal = () => window.clearTimeout(dismissal)

    const hide = () => {
      cancelDismissal()
      hovered = undefined
      preview.remove()
    }

    const leave = (event: Event) => {
      if (
        event instanceof PointerEvent &&
        event.relatedTarget instanceof Node &&
        (hovered?.contains(event.relatedTarget) || preview.contains(event.relatedTarget))
      )
        return

      if (preview.contains(document.activeElement)) return
      cancelDismissal()
      dismissal = window.setTimeout(hide, 500)
    }

    const show = (active: boolean) => {
      if (!hovered?.isConnected || (!active && !preview.isConnected)) return
      cancelDismissal()
      const destination = hovered.getAttribute('href') ?? ''

      if (url.textContent !== destination) {
        url.textContent = destination
        open.href = destination
        feedback.textContent = ''
        copy.title = 'Copy link'
        copyIcon.firstElementChild?.setAttribute('d', copyPath)
      }

      preview.style.left = '0px'
      document.body.append(preview)
      const bounds = hovered.getBoundingClientRect()
      preview.style.left = `${Math.max(8, Math.min(bounds.left, window.innerWidth - preview.offsetWidth - 8))}px`
      preview.style.top = `${bounds.bottom + 8 + preview.offsetHeight <= window.innerHeight ? bounds.bottom + 8 : Math.max(8, bounds.top - preview.offsetHeight - 8)}px`
    }

    const hover = (event: Event) => {
      if (!(event instanceof PointerEvent) || !(event.target instanceof Element)) return
      const link = event.target.closest('.mde-visual a')

      if (!(link instanceof HTMLAnchorElement)) return
      hovered = link
      show(modifier || event.metaKey || event.ctrlKey)
    }

    const keys = (event: Event) => {
      if (!(event instanceof KeyboardEvent)) return

      if (event.key === 'Escape') {
        const focused = preview.contains(document.activeElement)
        hide()

        if (focused) element.querySelector<HTMLElement>('.mde-visual')?.focus()

        return
      }

      modifier =
        (event.type === 'keydown' && (event.key === 'Meta' || event.key === 'Control')) ||
        event.metaKey ||
        event.ctrlKey

      if (modifier) show(true)
    }

    const blur = () => {
      modifier = false
      hide()
    }

    const outside = (event: Event) => {
      if (
        event.target instanceof Node &&
        !preview.contains(event.target) &&
        !hovered?.contains(event.target)
      )
        hide()
    }

    const copyLink = () => {
      if (feedback.textContent === 'Copying…') return
      feedback.textContent = 'Copying…'
      Queue.offerUnsafe(copies, open.href)
    }

    yield* Stream.fromQueue(copies).pipe(
      Stream.runForEach((destination) =>
        Effect.tryPromise(() => navigator.clipboard.writeText(destination)).pipe(
          Effect.match({ onFailure: () => 'Copy failed', onSuccess: () => 'Copied' }),
          Effect.tap((label) =>
            Effect.sync(() => {
              if (open.href !== destination) return
              feedback.textContent = label
              copy.title = label
              copyIcon.firstElementChild?.setAttribute(
                'd',
                label === 'Copied' ? 'm5 12 4 4L19 6' : copyPath,
              )
            }),
          ),
        ),
      ),
      Effect.forkScoped,
    )

    yield* Effect.acquireRelease(
      Effect.sync(() => {
        element.addEventListener('pointerover', hover)
        element.addEventListener('pointerout', leave)
        preview.addEventListener('pointerenter', cancelDismissal)
        preview.addEventListener('pointerleave', leave)
        preview.addEventListener('focusin', cancelDismissal)
        preview.addEventListener('focusout', leave)
        copy.addEventListener('click', copyLink)
        document.addEventListener('keydown', keys)
        document.addEventListener('keyup', keys)
        document.addEventListener('pointerdown', outside)
        window.addEventListener('blur', blur)
        window.addEventListener('scroll', hide, true)
      }),
      () =>
        Effect.sync(() => {
          element.removeEventListener('pointerover', hover)
          element.removeEventListener('pointerout', leave)
          preview.removeEventListener('pointerenter', cancelDismissal)
          preview.removeEventListener('pointerleave', leave)
          preview.removeEventListener('focusin', cancelDismissal)
          preview.removeEventListener('focusout', leave)
          copy.removeEventListener('click', copyLink)
          document.removeEventListener('keydown', keys)
          document.removeEventListener('keyup', keys)
          document.removeEventListener('pointerdown', outside)
          window.removeEventListener('blur', blur)
          window.removeEventListener('scroll', hide, true)
          hide()
        }),
    )
  })
