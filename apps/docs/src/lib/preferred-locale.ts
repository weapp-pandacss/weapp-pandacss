export type DocsLocale = 'en' | 'zh'

export const localePreferenceKey = 'weapp-pandacss.docs.locale'

export function parseLocale(value: unknown): DocsLocale | undefined {
  return value === 'en' || value === 'zh' ? value : undefined
}

/** Infer locale locally without IP lookup or server-side execution. */
export function detectLocale(timeZone: string, languages: readonly string[]): DocsLocale {
  if (['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Chungking', 'Asia/Harbin', 'Asia/Urumqi', 'Asia/Hong_Kong', 'Asia/Macau', 'Asia/Macao', 'Asia/Taipei'].includes(timeZone)) {
    return 'zh'
  }
  return languages[0]?.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
