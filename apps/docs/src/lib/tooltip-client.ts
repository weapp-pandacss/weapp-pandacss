/** Delegation also covers copy controls inserted after the initial HTML render. */
export function initializeTooltips() {
  let hovered: HTMLElement | undefined
  let focused: HTMLElement | undefined
  let active: HTMLElement | undefined
  const dismissed = new Set<HTMLElement>()
  const triggerFor = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('[data-tooltip-trigger]') ?? undefined : undefined
  const hide = () => {
    const tooltip = active?.querySelector<HTMLElement>('[data-tooltip]')
    if (tooltip) {
      tooltip.hidden = true
    }
    active = undefined
  }
  const show = (trigger?: HTMLElement) => {
    hide()
    if (!trigger || dismissed.has(trigger)) {
      return
    }
    const tooltip = trigger.querySelector<HTMLElement>('[data-tooltip]')
    if (!tooltip) {
      return
    }
    const rect = trigger.getBoundingClientRect()
    if (rect.bottom <= 0 || rect.top >= innerHeight) {
      return
    }
    active = trigger
    tooltip.hidden = false
    const tip = tooltip.getBoundingClientRect()
    const below = rect.bottom + tip.height + 12 < innerHeight
    tooltip.dataset.side = below ? 'below' : 'above'
    tooltip.style.left = `${Math.max(8, Math.min(rect.left + (rect.width - tip.width) / 2, innerWidth - tip.width - 8))}px`
    tooltip.style.top = `${below ? rect.bottom + 8 : Math.max(8, rect.top - tip.height - 8)}px`
  }
  const release = (trigger?: HTMLElement) => {
    if (trigger && trigger !== hovered && trigger !== focused) {
      dismissed.delete(trigger)
    }
  }
  document.addEventListener('pointerover', (event) => {
    const next = triggerFor(event.target)
    if (next !== hovered) {
      const previous = hovered
      hovered = next
      release(previous)
      show(hovered ?? focused)
    }
  })
  document.addEventListener('pointerout', (event) => {
    if (hovered && !hovered.contains(event.relatedTarget as Node | null)) {
      const previous = hovered
      hovered = undefined
      release(previous)
      show(focused)
    }
  })
  document.addEventListener('focusin', (event) => {
    focused = triggerFor(event.target)
    show(focused ?? hovered)
  })
  document.addEventListener('focusout', (event) => {
    const previous = focused
    focused = triggerFor(event.relatedTarget)
    release(previous)
    show(focused ?? hovered)
  })
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && active) {
      dismissed.add(active)
      hide()
    }
  })
  document.addEventListener('click', (event) => {
    const trigger = triggerFor(event.target)
    if (trigger) {
      dismissed.add(trigger)
      hide()
    }
  })
  const reposition = () => focused ? show(focused) : hide()
  window.addEventListener('scroll', reposition, { passive: true, capture: true })
  window.addEventListener('resize', reposition)
}
