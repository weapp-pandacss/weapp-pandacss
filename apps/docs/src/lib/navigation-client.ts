import { closeThemePopover } from './theme-client'

export function initializeNavigation() {
  const menu = document.querySelector<HTMLButtonElement>('[data-open-menu]')
  const dialog = document.querySelector<HTMLDialogElement>('#navigation-dialog')
  const rail = document.querySelector<HTMLElement>('#site-navigation')
  if (!menu || !dialog || !rail) {
    return
  }
  const mobile = matchMedia('(max-width: 48rem)')
  const marker = document.createComment('navigation position')
  rail.before(marker)
  menu.addEventListener('click', () => {
    closeThemePopover()
    document.querySelector<HTMLDialogElement>('#search-dialog')?.close()
    dialog.append(rail)
    menu.setAttribute('aria-expanded', 'true')
    dialog.showModal()
  })
  dialog.querySelector('[data-close-menu]')?.addEventListener('click', () => dialog.close())
  dialog.addEventListener('close', () => {
    marker.after(rail)
    menu.setAttribute('aria-expanded', 'false')
    if (mobile.matches) {
      menu.focus()
    }
    else {
      const current = rail.querySelector<HTMLElement>('[aria-current="page"]')
      const collapsed = current?.closest('details:not([open])')
      const preferred = collapsed ? collapsed.querySelector<HTMLElement>(':scope > summary') : current
      const target = [preferred, ...rail.querySelectorAll<HTMLElement>('summary, a')].find(element => element?.checkVisibility())
      target?.focus()
    }
  })
  mobile.addEventListener('change', (event) => {
    if (!event.matches && dialog.open) {
      dialog.close()
    }
  })
}
