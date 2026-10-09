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

export function closeThemePopover(restoreFocus = false) {
  const popover = document.querySelector<HTMLElement>('#theme-popover')
  if (popover?.matches(':popover-open')) {
    popover.hidePopover()
    if (restoreFocus) {
      document.querySelector<HTMLButtonElement>('[data-theme-trigger]')?.focus()
    }
  }
}

export function initializeTheme() {
  const trigger = document.querySelector<HTMLButtonElement>('[data-theme-trigger]')
  const popover = document.querySelector<HTMLElement>('#theme-popover')
  if (!trigger || !popover) {
    return
  }
  const options = [...popover.querySelectorAll<HTMLInputElement>('input[name="theme"]')]
  const media = matchMedia('(prefers-color-scheme: dark)')
  let theme = preference()
  const applyTheme = () => {
    document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme
    trigger.dataset.themePreference = theme
    for (const input of options) {
      input.checked = input.value === theme
    }
    const template = document.querySelector<HTMLTemplateElement>(`#theme-${theme}-icon`)
    const current = trigger.querySelector('svg')
    if (template && current) {
      current.replaceWith(template.content.cloneNode(true))
    }
  }
  applyTheme()
  for (const input of options) {
    input.addEventListener('click', () => {
      if (input.value === theme) {
        closeThemePopover(true)
      }
    })
    input.addEventListener('change', () => {
      if (!input.checked) {
        return
      }
      theme = input.value === 'dark' || input.value === 'light' ? input.value : 'system'
      applyTheme()
      try {
        localStorage.setItem(themeKey, theme)
      }
      catch {
        // Keep the current choice usable when storage is unavailable.
      }
      closeThemePopover(true)
    })
  }
  popover.addEventListener('toggle', () => {
    const open = popover.matches(':popover-open')
    trigger.setAttribute('aria-expanded', String(open))
    if (open) {
      options.find(input => input.checked)?.focus({ preventScroll: true })
    }
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && popover.matches(':popover-open')) {
      event.preventDefault()
      closeThemePopover(true)
    }
  })
  media.addEventListener('change', applyTheme)
}
