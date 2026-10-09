export type DocsLocale = 'en' | 'zh'

export const localePreferenceKey = 'weapp-pandacss.docs.locale'

export function parseLocale(value: unknown): DocsLocale | undefined {
  return value === 'en' || value === 'zh' ? value : undefined
}

/** Country is authoritative; browser signals cover offline/static previews. */
export function detectLocale(country: unknown, timeZone: string, languages: readonly string[]): DocsLocale {
  if (typeof country === 'string' && /^[a-z]{2}$/i.test(country)) {
    return country.toUpperCase() === 'CN' ? 'zh' : 'en'
  }
  if (['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Chungking', 'Asia/Harbin', 'Asia/Urumqi'].includes(timeZone)) {
    return 'zh'
  }
  return languages[0]?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
