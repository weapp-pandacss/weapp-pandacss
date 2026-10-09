import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'
import { detectLocale, localePreferenceKey, parseLocale } from '../../apps/docs/src/lib/preferred-locale.ts'
import worker from '../../apps/docs/worker/index.ts'

async function region(page: Page, country: string | null) {
  await page.route('**/api/locale', route => route.fulfill({ json: { country } }))
}

test('China redirects an English browser to Chinese and preserves query/hash', async ({ page }) => {
  await region(page, 'CN')
  await page.goto('/?source=home#main-content')
  await expect(page).toHaveURL(/\/zh\/\?source=home#main-content$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
})

test('other regions keep the English homepage', async ({ page }) => {
  await region(page, 'US')
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page).toHaveURL(/\/$/)
})

for (const country of ['HK', 'MO', 'TW']) {
  test(`${country} also defaults to Chinese`, async ({ page }) => {
    await region(page, country)
    await page.goto('/')
    await expect(page).toHaveURL(/\/zh\/$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  })
}

test('a manual language switch is remembered without a redirect loop', async ({ page }) => {
  await region(page, 'CN')
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

test('explicit language wins over stored preference and region', async ({ page }) => {
  await region(page, 'CN')
  await page.addInitScript((key) => {
    localStorage.setItem(key, 'zh')
  }, localePreferenceKey)
  await page.goto('/?lang=en')
  await expect(page).toHaveURL(/\/\?lang=en$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})

test('the homepage content language link also remembers an explicit choice', async ({ page }) => {
  await region(page, 'CN')
  await page.goto('/')
  await expect(page).toHaveURL(/\/zh\/$/)
  await page.locator('article').getByRole('link', { name: 'English', exact: true }).click()
  await expect(page).toHaveURL(/\/\?lang=en$/)
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page).toHaveURL(/\/$/)
})

test('deep English and Chinese links do not request a region or change locale', async ({ page }) => {
  const requests: string[] = []
  page.on('request', request => requests.push(request.url()))
  await region(page, 'CN')
  await page.goto('/get-started/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await page.goto('/zh/get-started/')
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN')
  expect(requests.filter(url => url.includes('/api/locale'))).toEqual([])
})

test('blocked storage still permits an explicit English switch', async ({ page }) => {
  await region(page, 'CN')
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

test.describe('Chinese client fallback', () => {
  test.use({ timezoneId: 'Asia/Shanghai', locale: 'en-US' })

  test('China time zone covers an unavailable region API', async ({ page }) => {
    await page.route('**/api/locale', route => route.abort())
    await page.goto('/')
    await expect(page).toHaveURL(/\/zh\/$/)
  })

  test('a known non-China region overrides browser fallback signals', async ({ page }) => {
    await region(page, 'GB')
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\/$/)
    await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  })
})

test.describe('Chinese browser language fallback', () => {
  test.use({ locale: 'zh-CN' })

  test('Chinese browser language covers unknown country', async ({ page }) => {
    await region(page, null)
    await page.goto('/')
    await expect(page).toHaveURL(/\/zh\/$/)
  })
})

test('a stalled region request times out and leaves English usable', async ({ page }) => {
  await page.route('**/api/locale', () => {})
  await page.goto('/')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: 'weapp-pandacss', exact: true })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

test('locale rules accept supported preferences and country/browser signals', () => {
  expect(parseLocale('zh')).toBe('zh')
  expect(parseLocale('en')).toBe('en')
  expect(parseLocale('fr')).toBeUndefined()
  expect(detectLocale('cn', 'UTC', ['en-US'])).toBe('zh')
  expect(detectLocale('HK', 'UTC', ['en-US'])).toBe('zh')
  expect(detectLocale('MO', 'UTC', ['en-US'])).toBe('zh')
  expect(detectLocale('TW', 'UTC', ['en-US'])).toBe('zh')
  expect(detectLocale('US', 'Asia/Shanghai', ['zh-CN'])).toBe('en')
  expect(detectLocale(undefined, 'Asia/Urumqi', ['en-US'])).toBe('zh')
  expect(detectLocale(undefined, 'UTC', ['zh-TW'])).toBe('zh')
  expect(detectLocale(undefined, 'UTC', ['en-US', 'zh-CN'])).toBe('en')
  expect(detectLocale(undefined, 'UTC', [])).toBe('en')
})

test('region endpoint trusts connection metadata, never caches, and delegates assets', async () => {
  const assets: Request[] = []
  const env = {
    ASSETS: {
      fetch: async (request: Request) => {
        assets.push(request)
        return new Response('asset')
      },
    },
  }
  const request = Object.assign(new Request('https://panda.weapp.dev/api/locale'), { cf: { country: 'CN' } })
  const response = await worker.fetch(request, env)
  expect(await response.json()).toEqual({ country: 'CN' })
  expect(response.headers.get('Cache-Control')).toBe('private, no-store')
  const spoofed = new Request(request.url, { headers: { 'CF-IPCountry': 'CN' } })
  expect(await (await worker.fetch(spoofed, env)).json()).toEqual({ country: null })
  expect((await worker.fetch(new Request(request.url, { method: 'POST' }), env)).status).toBe(405)
  const asset = new Request('https://panda.weapp.dev/zh/')
  expect(await (await worker.fetch(asset, env)).text()).toBe('asset')
  expect(assets).toEqual([asset])
})
