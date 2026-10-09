import { readdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('every translated page has HTML, reciprocal language links and text exports', async ({ request }) => {
  const files = await readdir(new URL('../../apps/docs/src/content/docs/', import.meta.url), { recursive: true })
  const pages = files.filter(file => file.endsWith('.mdx'))
  for (const file of pages) {
    const slug = file.replace(/\\/g, '/').replace(/\.mdx$/, '').replace(/(^|\/)index$/, '')
    const route = `/${slug.replace(/\/$/, '')}${slug ? '/' : ''}`
    const response = await request.get(route)
    expect(response.ok(), route).toBeTruthy()
    const html = await response.text()
    const chinese = route.startsWith('/zh/')
    const english = chinese ? route.slice(3) : route
    expect(html, route).toContain('<h1>')
    expect(html).toContain(`lang="${chinese ? 'zh-CN' : 'en'}"`)
    expect(html).toContain(`hreflang="en" href="https://panda.weapp.dev${english}"`)
    expect(html).toContain(`hreflang="zh-CN" href="https://panda.weapp.dev/zh${english}"`)
    for (const extension of ['md', 'mdx']) {
      const exported = await request.get(`${route}index.${extension}`)
      expect(exported.ok(), route + extension).toBeTruthy()
      expect((await exported.text()).length).toBeGreaterThan(150)
    }
  }
  const index = await request.get('/llms.txt')
  expect(index.ok()).toBeTruthy()
  const directory = await index.text()
  for (const section of ['api', 'frameworks', 'guides', 'zh']) {
    expect(directory).toContain(`/${section}/llms.txt`)
  }
  for (const [route, expected] of [
    ['/api/llms.txt', 'api/runtime'],
    ['/frameworks/llms.txt', 'frameworks/weapp-vite'],
    ['/guides/llms.txt', 'guides/dynamic-styles'],
    ['/zh/llms.txt', 'api/runtime'],
    ['/llms-full.txt', 'api/runtime'],
  ]) {
    const response = await request.get(route)
    expect(response.ok()).toBeTruthy()
    const body = await response.text()
    expect(body).toContain(expected)
  }
})

test('grouped navigation and page links follow the active language', async ({ page }) => {
  await page.goto('/zh/api/runtime/')
  const navigation = page.locator('#site-navigation')
  await expect(navigation.locator('summary')).toHaveText(['快速开始', '框架接入', '使用场景', 'API 参考', '迁移与排错'])
  await expect(navigation.locator('[aria-current="page"]')).toHaveAttribute('href', '/zh/api/runtime/')
  await expect(page.locator('.breadcrumbs')).toContainText('API 参考')
  await expect(page.locator('.previous-next a')).toHaveCount(2)
  for (const link of await navigation.locator('a').all()) {
    expect(await link.getAttribute('href')).toMatch(/^\/zh\//)
  }
  await page.locator('.language-link').click()
  await expect(page).toHaveURL(/\/api\/runtime\/\?lang=en$/)
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
  await expect(page.locator('#site-navigation [aria-current="page"]')).toHaveAttribute('href', '/api/runtime/')
})

test('search opens from keyboard, finds a reference and handles empty results', async ({ page }) => {
  await page.goto('/api/')
  await page.keyboard.press('Control+k')
  const dialog = page.locator('#search-dialog')
  await expect(dialog).toBeVisible()
  const input = dialog.getByRole('searchbox')
  await expect(input).toBeFocused()
  await input.fill('encodeClassList')
  const result = dialog.locator('a[href$="/api/runtime/"]')
  await expect(result.first()).toBeVisible()
  await result.first().click()
  await expect(page).toHaveURL(/\/api\/runtime\/$/)
  await page.locator('[data-open-search]').click()
  await page.getByRole('searchbox').fill('zzzxqv9471qqq')
  await expect(page.locator('#search-dialog [role="status"]')).toHaveText('No matching pages.')
  await page.getByRole('searchbox').fill('')
  await expect(page.locator('.search-results a')).toHaveCount(0)
  await expect(page.locator('#search-dialog [role="status"]')).toBeEmpty()
  await page.keyboard.press('Escape')
  await expect(dialog).not.toBeVisible()
  await expect(page.locator('[data-open-search]')).toBeFocused()
})

test('overview routes share the category state of their navigation group', async ({ page }) => {
  for (const [route, href] of [
    ['/panda/', '/get-started/'],
    ['/postcss/', '/get-started/'],
    ['/runtime/', '/get-started/'],
    ['/migration/', '/troubleshooting/'],
    ['/zh/migration/', '/zh/troubleshooting/'],
  ]) {
    await page.goto(route)
    await expect(page.locator('.section-tabs [aria-current="true"]')).toHaveAttribute('href', href)
  }
})

test('Chinese search uses its production index and links to Chinese documentation', async ({ page }) => {
  await page.goto('/zh/api/')
  await page.getByRole('button', { name: '搜索文档', exact: true }).click()
  await page.getByRole('searchbox').fill('重复编码')
  const results = page.locator('.search-results a')
  await expect(results.first()).toBeVisible()
  for (const link of await results.all()) {
    expect(await link.getAttribute('href')).toContain('/zh/')
  }
  await page.keyboard.press('Escape')
  await expect(page.locator('#search-dialog')).not.toBeVisible()
  await expect(page.getByRole('button', { name: '搜索文档', exact: true })).toBeFocused()
})

test('the page contents track a long section when scrolling down and back up', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/api/postcss-plugin/')
  const boundary = await page.locator('.site-header').evaluate(header => header.getBoundingClientRect().bottom + 24)
  const sections = await page.locator('.page-rail a').evaluateAll((links) => {
    const headings = links.map((link) => {
      const hash = (link as HTMLAnchorElement).hash
      const heading = document.getElementById(decodeURIComponent(hash.slice(1)))!
      return { hash, top: heading.getBoundingClientRect().top + window.scrollY }
    })
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight
    return headings.slice(0, -1).map((heading, index) => ({
      before: heading,
      after: headings[index + 1],
    })).filter(pair => pair.after.top < maxScroll && pair.after.top - pair.before.top > 300).sort((a, b) => (b.after.top - b.before.top) - (a.after.top - a.before.top))[0]
  })
  expect(sections).toBeTruthy()
  await page.evaluate(top => window.scrollTo(0, top), sections.after.top - boundary + 1)
  const active = page.locator('.page-rail [aria-current="location"]')
  await expect(active).toHaveAttribute('href', sections.after.hash)
  await page.evaluate(top => window.scrollTo(0, top), (sections.before.top + sections.after.top) / 2 - boundary)
  await expect(active).toHaveAttribute('href', sections.before.hash)
})

test('a failed search leaves a readable recovery message', async ({ page }) => {
  await page.route('**/pagefind/pagefind.js', route => route.abort())
  await page.goto('/api/')
  await page.locator('[data-open-search]').click()
  await page.getByRole('searchbox').fill('encodeClassName')
  await expect(page.locator('#search-dialog [role="status"]')).toContainText('use the navigation')
  await page.keyboard.press('Escape')
  await expect(page.locator('#site-navigation')).toBeVisible()
})

test('themes persist and system choice follows the operating system', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto('/api/postcss-plugin/')
  await page.getByLabel('Color theme').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  const darkBackground = await page.locator('pre').first().evaluate(element => getComputedStyle(element).backgroundColor)
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await expect(page.getByLabel('Color theme')).toHaveValue('dark')
  await page.getByLabel('Color theme').selectOption('light')
  const lightBackground = await page.locator('pre').first().evaluate(element => getComputedStyle(element).backgroundColor)
  expect(lightBackground).not.toBe(darkBackground)
  await page.getByLabel('Color theme').selectOption('system')
  await page.emulateMedia({ colorScheme: 'dark' })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('copy buttons copy code and retain a keyboard fallback when clipboard is blocked', async ({ page }) => {
  await page.goto('/api/runtime/')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text: string) => { document.documentElement.dataset.clipboard = text },
    } })
  })
  const frame = page.locator('.code-frame').first()
  const expected = await frame.locator('code').textContent()
  await frame.getByRole('button', { name: 'Copy code' }).click()
  await expect(frame.getByRole('button')).toHaveText('Copied')
  expect(await page.locator('html').getAttribute('data-clipboard')).toBe(expected)
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async () => { throw new Error('Clipboard blocked') },
    } })
  })
  await frame.getByRole('button').click()
  await expect(frame.getByRole('status')).toContainText('Code selected')
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(expected)
})

test('Chromium copies code through the real browser clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Other engines use the browser-independent copy and fallback checks.')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/api/runtime/')
  const frame = page.locator('.code-frame').first()
  const expected = await frame.locator('code').textContent()
  await frame.getByRole('button', { name: 'Copy code' }).click()
  await expect(frame.getByRole('button')).toHaveText('Copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected)
})

test('mobile navigation is modal, supports Escape and reaches the requested guide', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/zh/api/')
  await expect(page.getByRole('button', { name: '搜索文档', exact: true })).toBeVisible()
  const button = page.getByRole('button', { name: '打开导航' })
  await button.click()
  const menu = page.locator('#navigation-dialog')
  await expect(menu).toBeVisible()
  await expect(button).toHaveAttribute('aria-expanded', 'true')
  await expect(menu.locator('#site-navigation')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).not.toBeVisible()
  await expect(button).toBeFocused()
  await button.click()
  await menu.locator('a[href="/zh/guides/dynamic-styles/"]').click()
  await expect(page).toHaveURL(/\/zh\/guides\/dynamic-styles\/$/)
  await expect(page.locator('#navigation-dialog')).not.toBeVisible()
  await page.getByRole('button', { name: '打开导航' }).click()
  await page.setViewportSize({ width: 769, height: 900 })
  await expect(page.locator('#navigation-dialog')).not.toBeVisible()
  await expect(page.locator('.docs-grid > #site-navigation')).toBeVisible()
  await expect(page.locator('#site-navigation [aria-current="page"]')).toBeFocused()
})

test('navigation and search remain usable when storage is blocked', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Storage blocked')
      },
    })
  })
  await page.goto('/api/runtime/')
  await page.getByLabel('Color theme').selectOption('dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.locator('[data-open-search]').click()
  await expect(page.getByRole('searchbox')).toBeFocused()
  await page.keyboard.press('Escape')
})

test('desktop, tablet and phone keep long API content inside the viewport', async ({ page }) => {
  for (const width of [1440, 1024, 390]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of ['/', '/zh/api/postcss-plugin/']) {
      await page.goto(route)
      await expect(page.locator('.page-heading h1')).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      expect(overflow, `${route} at ${width}`).toBeFalsy()
      if (width === 390 && route.includes('/api/')) {
        const table = page.locator('article table').first()
        await expect(table).toHaveAttribute('tabindex', '0')
        const tableScroll = await table.evaluate((element) => {
          element.scrollLeft = 120
          return element.scrollLeft
        })
        expect(tableScroll).toBeGreaterThan(0)
        const pre = page.locator('article pre').first()
        await expect(pre).toHaveAttribute('tabindex', '0')
        const codeScroll = await pre.evaluate((element) => {
          element.scrollLeft = 120
          return element.scrollLeft
        })
        expect(codeScroll).toBeGreaterThan(0)
      }
    }
  }
})
