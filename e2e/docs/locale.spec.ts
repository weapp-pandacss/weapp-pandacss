import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { detectLocale, localePreferenceKey, parseLocale } from '../../apps/docs/src/lib/preferred-locale.ts'

for (const timezoneId of ['Asia/Shanghai', 'Asia/Hong_Kong', 'Asia/Macau', 'Asia/Taipei']) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId, locale: 'en-US' })

    test('Chinese region time zone redirects an English browser and preserves query/hash', async ({ page }) => {
      await page.goto('/?source=home#main-content')
      await expect(page).toHaveURL(/\/zh\/\?source=home#main-content$/)
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
    })
  })
}

test('other clients keep the English homepage', async ({ page }) => {
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page).toHaveURL(/\/$/)
})

test('a secondary Chinese browser language does not override the preferred language', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'zh-CN'] })
  })
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page).toHaveURL(/\/$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test.describe('Chinese browser language', () => {
  test.use({ locale: 'zh-CN' })

  test('Chinese preferred language redirects outside Chinese region time zones', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/zh\/$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  })
})

test.describe('Chinese client preferences', () => {
  test.use({ timezoneId: 'Asia/Shanghai', locale: 'en-US' })

  test('a manual language switch is remembered without a redirect loop', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/zh\/$/)
    await page.locator('.language-link').click()
    await expect(page).toHaveURL(/\/\?lang=en$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await page.locator('.language-link').click()
    await expect(page).toHaveURL(/\/zh\/\?lang=zh$/)
    await page.goto('/')
    await expect(page).toHaveURL(/\/zh\/$/)
  })

  test('explicit language wins over stored preference and client detection', async ({ page }) => {
    await page.addInitScript((key) => {
      localStorage.setItem(key, 'zh')
    }, localePreferenceKey)
    await page.goto('/?lang=en')
    await expect(page).toHaveURL(/\/\?lang=en$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('the homepage content language link also remembers an explicit choice', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/zh\/$/)
    await page.locator('article').getByRole('link', { name: 'English', exact: true }).click()
    await expect(page).toHaveURL(/\/\?lang=en$/)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await expect(page).toHaveURL(/\/$/)
  })

  test('deep English and Chinese links keep their locale', async ({ page }) => {
    await page.goto('/get-started/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
    await page.goto('/zh/get-started/')
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  })

  test('blocked storage still permits an explicit English switch', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', {
        get: () => {
          throw new Error('Storage blocked')
        },
      })
    })
    await page.goto('/')
    await expect(page).toHaveURL(/\/zh\/$/)
    await page.locator('.language-link').click()
    await expect(page).toHaveURL(/\/\?lang=en$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })

  test('locale detection makes no API or geolocation requests', async ({ page }) => {
    const requests: string[] = []
    page.on('request', (request) => {
      if (['fetch', 'xhr'].includes(request.resourceType())) {
        requests.push(request.url())
      }
    })
    await page.goto('/')
    await expect(page).toHaveURL(/\/zh\/$/)
    await page.waitForLoadState('networkidle')
    expect(requests).toEqual([])
  })
})

test('explicit Chinese wins over a remembered English preference', async ({ page }) => {
  await page.addInitScript((key) => {
    localStorage.setItem(key, 'en')
  }, localePreferenceKey)
  await page.goto('/?lang=zh')
  await expect(page).toHaveURL(/\/zh\/\?lang=zh$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
})

test('locale rules use client signals and supported preferences', () => {
  expect(parseLocale('zh')).toBe('zh')
  expect(parseLocale('en')).toBe('en')
  expect(parseLocale('fr')).toBeUndefined()
  for (const timeZone of ['Asia/Shanghai', 'Asia/Chongqing', 'Asia/Chungking', 'Asia/Harbin', 'Asia/Urumqi', 'Asia/Hong_Kong', 'Asia/Macau', 'Asia/Macao', 'Asia/Taipei']) {
    expect(detectLocale(timeZone, ['en-US'])).toBe('zh')
  }
  expect(detectLocale('UTC', ['zh-TW'])).toBe('zh')
  expect(detectLocale('UTC', ['en-US', 'zh-CN'])).toBe('en')
  expect(detectLocale('Asia/Singapore', ['en-US'])).toBe('en')
  expect(detectLocale('UTC', [])).toBe('en')
})

test('deployment is assets-only, without a Worker entry or execution routing', () => {
  const config = JSON.parse(readFileSync(new URL('../../apps/docs/wrangler.jsonc', import.meta.url), 'utf8'))
  expect(config).not.toHaveProperty('main')
  expect(config.assets).not.toHaveProperty('binding')
  expect(config.assets).not.toHaveProperty('run_worker_first')
  expect(config.assets.directory).toBe('./dist')
})
