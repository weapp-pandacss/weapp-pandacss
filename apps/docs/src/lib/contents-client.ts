export function initializeContents() {
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
