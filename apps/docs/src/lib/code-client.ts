function makeScrollable(element: HTMLElement) {
  element.tabIndex = 0
  element.addEventListener('keydown', (event) => {
    if (event.target !== element || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || element.scrollWidth <= element.clientWidth) {
      return
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      element.scrollLeft += event.key === 'ArrowRight' ? 48 : -48
    }
  })
}

export function initializeCode() {
  for (const table of document.querySelectorAll<HTMLTableElement>('article table')) {
    makeScrollable(table)
  }
  const template = document.querySelector<HTMLTemplateElement>('#code-copy-template')
  const check = document.querySelector<HTMLTemplateElement>('#copy-check-icon')
  if (!template || !check) {
    return
  }
  const copyText = document.body.dataset.copy ?? 'Copy code'
  const copiedText = document.body.dataset.copied ?? 'Copied'
  const selectionText = document.body.dataset.selection ?? 'Code selected. Copy with your keyboard.'
  for (const [index, pre] of [...document.querySelectorAll<HTMLPreElement>('article pre')].entries()) {
    makeScrollable(pre)
    const frame = document.createElement('div')
    frame.className = 'code-frame'
    pre.before(frame)
    const toolbar = document.createElement('div')
    toolbar.className = 'code-toolbar'
    const language = document.createElement('span')
    language.textContent = pre.dataset.language ?? 'Code'
    const button = template.content.firstElementChild!.cloneNode(true) as HTMLButtonElement
    button.id = `copy-code-${index}`
    const tooltip = button.querySelector<HTMLElement>('[data-tooltip]')!
    tooltip.id = `${button.id}-tip`
    button.setAttribute('aria-describedby', tooltip.id)
    const copyIcon = button.querySelector('svg')!.cloneNode(true)
    const feedback = document.createElement('span')
    feedback.className = 'copy-feedback visually-hidden'
    feedback.setAttribute('role', 'status')
    let reset: ReturnType<typeof setTimeout> | undefined
    const setState = (state: 'idle' | 'copied' | 'failed') => {
      button.dataset.copyState = state
      button.querySelector('svg')!.replaceWith(state === 'copied' ? check.content.cloneNode(true) : copyIcon.cloneNode(true))
      tooltip.textContent = state === 'copied' ? copiedText : copyText
      button.dataset.tooltipLabel = tooltip.textContent
    }
    setState('idle')
    button.addEventListener('click', async () => {
      clearTimeout(reset)
      const code = pre.querySelector('code') ?? pre
      feedback.textContent = ''
      feedback.classList.add('visually-hidden')
      try {
        await navigator.clipboard.writeText(code.textContent ?? '')
        setState('copied')
        feedback.textContent = copiedText
        reset = setTimeout(setState, 2000, 'idle')
      }
      catch {
        setState('failed')
        const range = document.createRange()
        range.selectNodeContents(code)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        feedback.textContent = selectionText
        feedback.classList.remove('visually-hidden')
      }
    })
    toolbar.append(language, button)
    frame.append(toolbar, feedback, pre)
  }
}
