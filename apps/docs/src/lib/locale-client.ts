import { alternatePath, isChinese } from './locale'
import { detectLocale, localePreferenceKey, parseLocale } from './preferred-locale'

function readPreference() {
  try {
    return parseLocale(localStorage.getItem(localePreferenceKey))
  }
  catch {
    return undefined
  }
}

function savePreference(locale: string) {
  try {
    localStorage.setItem(localePreferenceKey, locale)
  }
  catch {
    // The explicit ?lang= link still works when browser storage is blocked.
  }
}

export function initializeLocale() {
  const url = new URL(location.href)
  const explicit = parseLocale(url.searchParams.get('lang'))
  if (explicit) {
    savePreference(explicit)
  }
  // Content can also link to its translation (e.g. the homepage's English link).
  // Give every such link the same explicit choice as the header switch.
  for (const link of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const target = new URL(link.href)
    if (target.origin === url.origin && target.pathname === alternatePath(url.pathname)) {
      const locale = isChinese(target.pathname) ? 'zh' : 'en'
      target.searchParams.set('lang', locale)
      link.href = target.href
      link.dataset.docsLocale = locale
    }
  }
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-docs-locale]') : null
    const locale = parseLocale(link?.dataset.docsLocale)
    if (locale) {
      savePreference(locale)
    }
  })

  // Deep links, including explicitly chosen /zh/ pages, keep their locale.
  if (url.pathname !== '/') {
    return
  }
  const preferred = explicit ?? readPreference() ?? detectLocale(new Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.languages)
  if (preferred === 'zh' && location.pathname === '/') {
    url.pathname = '/zh/'
    location.replace(url.href)
  }
}
