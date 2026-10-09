const themeKey = 'weapp-pandacss:theme'
type Theme = 'system' | 'light' | 'dark'

function preference(): Theme {
  try {
    const saved = localStorage.getItem(themeKey)
    return saved === 'light' || saved === 'dark' ? saved : 'system'
  }
  catch {
    return 'system'
  }
}

export function initializeSite() {
  const media = matchMedia('(prefers-color-scheme: dark)')
  const select = document.querySelector<HTMLSelectElement>('[data-theme-select]')!
  let theme = preference()
  const applyTheme = () => {
    document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
  }
  select.value = theme
  applyTheme()
  select.addEventListener('change', () => {
    theme = select.value === 'dark' || select.value === 'light' ? select.value : 'system'
    applyTheme()
    try {
      localStorage.setItem(themeKey, theme)
    }
    catch {
      // A selection still applies for this page when storage is unavailable.
    }
  })
  media.addEventListener('change', applyTheme)

  const menu = document.querySelector<HTMLButtonElement>('[data-open-menu]')!
  const mobile = matchMedia('(max-width: 48rem)')
  const dialog = document.querySelector<HTMLDialogElement>('#navigation-dialog')!
  const rail = document.querySelector<HTMLElement>('#site-navigation')!
  const marker = document.createComment('navigation position')
  rail.before(marker)
  menu.addEventListener('click', () => {
    dialog.append(rail)
    menu.setAttribute('aria-expanded', 'true')
    dialog.showModal()
  })
  dialog.querySelector('[data-close-menu]')!.addEventListener('click', () => dialog.close())
  dialog.addEventListener('close', () => {
    marker.after(rail)
    menu.setAttribute('aria-expanded', 'false')
    if (mobile.matches) {
      menu.focus()
    }
    else {
      rail.querySelector<HTMLElement>('[aria-current="page"]')?.focus()
    }
  })
  mobile.addEventListener('change', (event) => {
    if (!event.matches && dialog.open) {
      dialog.close()
    }
  })

  const copyText = document.body.dataset.copy ?? 'Copy code'
  const copiedText = document.body.dataset.copied ?? 'Copied'
  const selectionText = document.body.dataset.selection ?? 'Code selected. Copy with your keyboard.'
  for (const table of document.querySelectorAll<HTMLTableElement>('article table')) {
    table.tabIndex = 0
  }
  for (const pre of document.querySelectorAll<HTMLPreElement>('article pre')) {
    pre.tabIndex = 0
    const frame = document.createElement('div')
    frame.className = 'code-frame'
    pre.before(frame)
    const toolbar = document.createElement('div')
    toolbar.className = 'code-toolbar'
    const language = document.createElement('span')
    language.textContent = pre.dataset.language ?? 'Code'
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'copy-code'
    button.textContent = copyText
    button.setAttribute('aria-label', copyText)
    const feedback = document.createElement('span')
    feedback.className = 'visually-hidden'
    feedback.setAttribute('role', 'status')
    button.addEventListener('click', async () => {
      const code = pre.querySelector('code') ?? pre
      feedback.textContent = ''
      try {
        await navigator.clipboard.writeText(code.textContent ?? '')
        button.textContent = copiedText
        feedback.textContent = copiedText
      }
      catch {
        button.textContent = copyText
        const range = document.createRange()
        range.selectNodeContents(code)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
        feedback.textContent = selectionText
      }
      setTimeout(() => {
        button.textContent = copyText
      }, 2000)
    })
    toolbar.append(language, button, feedback)
    frame.append(toolbar, pre)
  }

  const tocLinks = [...document.querySelectorAll<HTMLAnchorElement>('.page-rail a[href^="#"]')]
  const headings = tocLinks.map(link => document.getElementById(decodeURIComponent(link.hash.slice(1)))).filter((heading): heading is HTMLElement => Boolean(heading))
  if (headings.length) {
    const updateCurrentSection = () => {
      const headerBottom = document.querySelector('.site-header')!.getBoundingClientRect().bottom + 24
      let current = headings[0]
      for (const heading of headings) {
        if (heading.getBoundingClientRect().top > headerBottom) {
          break
        }
        current = heading
      }
      for (const link of tocLinks) {
        if (decodeURIComponent(link.hash.slice(1)) === current.id) {
          link.setAttribute('aria-current', 'location')
        }
        else {
          link.removeAttribute('aria-current')
        }
      }
    }
    let scheduled = false
    const scheduleUpdate = () => {
      if (scheduled) {
        return
      }
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        updateCurrentSection()
      })
    }
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    updateCurrentSection()
  }
}
