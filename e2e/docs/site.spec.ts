import type { Locator, Page } from '@playwright/test'
import { readdir } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

const themeLabels = {
  en: { title: 'Color theme', system: 'System', light: 'Light', dark: 'Dark' },
  zh: { title: '颜色主题', system: '跟随系统', light: '浅色', dark: '深色' },
} as const

async function chooseTheme(page: Page, value: 'system' | 'light' | 'dark', locale: 'en' | 'zh' = 'en') {
  const labels = themeLabels[locale]
  const trigger = page.getByRole('button', { name: labels.title, exact: true })
  await trigger.click()
  const popover = page.locator('#theme-popover')
  await expect(popover).toBeVisible()
  const choices = popover.getByRole('group', { name: labels.title, exact: true })
  await choices.getByRole('radio', { name: labels[value], exact: true }).check()
  await expect(popover).not.toBeVisible()
  await expect(trigger).toHaveAttribute('data-theme-preference', value)
  await expect(trigger).toBeFocused()
}

async function waitForHorizontalScroll(locator: Locator) {
  await locator.evaluate(element => new Promise<void>((resolve, reject) => {
    let previous = element.scrollLeft
    let stableFrames = 0
    let frames = 0
    const check = () => {
      const current = element.scrollLeft
      stableFrames = current === previous ? stableFrames + 1 : 0
      previous = current
      if (stableFrames >= 8) {
        resolve()
      }
      else if (++frames >= 180) {
        reject(new Error('Horizontal scroll did not settle'))
      }
      else {
        requestAnimationFrame(check)
      }
    }
    requestAnimationFrame(check)
  }))
}

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
  const complete = await (await request.get('/llms-full.txt')).text()
  for (const content of ['Author a style', 'Generate a portable class', 'Match the WXSS selector', '编写样式', '生成兼容的 class', '对齐 WXSS 选择器', 'c__wp_23_0f766e']) {
    expect(complete).toContain(content)
  }
  expect(complete).not.toMatch(/<(?:LinkGrid|LinkCard|BuildFlow|FlowStep|svg)\b/i)
})

for (const locale of ['en', 'zh'] as const) {
  const prefix = locale === 'zh' ? '/zh' : ''
  const entries = ['get-started', 'frameworks', 'guides', 'api', 'troubleshooting']
  const flowTitles = locale === 'zh'
    ? ['编写样式', '生成兼容的 class', '对齐 WXSS 选择器']
    : ['Author a style', 'Generate a portable class', 'Match the WXSS selector']

  test(`${locale} homepage entries and build flow retain their content in text exports`, async ({ page, request }) => {
    await page.goto(`${prefix}/`)
    const article = page.locator('article')
    for (const entry of entries) {
      const link = article.locator(`a[href="${prefix}/${entry}/"]`).first()
      await expect(link).toBeVisible()
      const response = await request.get((await link.getAttribute('href'))!)
      expect(response.ok(), entry).toBeTruthy()
    }
    const flow = article.locator('ol').filter({ hasText: flowTitles[0] })
    await expect(flow).toHaveCount(1)
    await expect(flow.locator('li')).toHaveCount(3)
    for (const [index, title] of flowTitles.entries()) {
      await expect(flow.locator('li').nth(index)).toContainText(title)
    }
    await expect(article).toContainText('c_#0f766e')
    await expect(article).toContainText('.c__wp_23_0f766e')
    for (const extension of ['md', 'mdx']) {
      const exported = await request.get(`${prefix}/index.${extension}`)
      expect(exported.ok()).toBeTruthy()
      const body = await exported.text()
      for (const entry of entries) {
        expect(body).toContain(`${prefix}/${entry}/`)
      }
      for (const title of flowTitles) {
        expect(body).toContain(title)
      }
      for (const content of ['css()', 'c_#0f766e', 'c__wp_23_0f766e', '.c__wp_23_0f766e']) {
        expect(body).toContain(content)
      }
      if (extension === 'md') {
        expect(body).not.toMatch(/<(?:LinkGrid|LinkCard|BuildFlow|FlowStep|svg)\b/i)
        expect(body).not.toContain('icon="')
      }
    }
    const started = article.locator(`a[href="${prefix}/get-started/"]`).first()
    await started.click()
    await expect(page).toHaveURL(new RegExp(`${prefix}/get-started/$`))
    await expect(page.locator('html')).toHaveAttribute('lang', locale === 'zh' ? 'zh-CN' : 'en')
    await expect(page.locator('#site-navigation [aria-current="page"]')).toHaveAttribute('href', `${prefix}/get-started/`)
  })
}

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

for (const locale of ['en', 'zh'] as const) {
  test(`${locale} theme choices persist, fixed choices ignore the OS and system follows it`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
    await page.goto(`${locale === 'zh' ? '/zh' : ''}/api/postcss-plugin/`)
    const labels = themeLabels[locale]
    const trigger = page.getByRole('button', { name: labels.title, exact: true })
    const popover = page.locator('#theme-popover')
    await expect(popover).toHaveAttribute('popover', /^(?:auto)?$/)
    await expect(trigger).toHaveAttribute('data-theme-preference', 'system')
    await trigger.click()
    await expect(popover).toBeVisible()
    expect(await popover.evaluate(element => element.matches(':popover-open'))).toBeTruthy()
    const choices = popover.getByRole('group', { name: labels.title, exact: true })
    await expect(choices.getByRole('radio')).toHaveCount(3)
    await expect(choices.locator('input[type="radio"]:checked')).toHaveCount(1)
    for (const value of ['system', 'light', 'dark'] as const) {
      const radio = choices.getByRole('radio', { name: labels[value], exact: true })
      await expect(radio).toHaveAttribute('value', value)
      const label = choices.locator('label').filter({ hasText: labels[value] })
      await expect(label.locator('input')).toHaveAttribute('value', value)
      await expect(label).toContainText(labels[value])
      await expect(label.locator('svg')).toHaveAttribute('aria-hidden', 'true')
    }
    await page.keyboard.press('Escape')
    await expect(popover).not.toBeVisible()
    await expect(trigger).toBeFocused()

    await chooseTheme(page, 'dark', locale)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    const darkBackground = await page.locator('pre').first().evaluate(element => getComputedStyle(element).backgroundColor)
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(trigger).toHaveAttribute('data-theme-preference', 'dark')
    await trigger.click()
    await expect(choices.getByRole('radio', { name: labels.dark, exact: true })).toBeChecked()
    await expect(choices.locator('input[type="radio"]:checked')).toHaveCount(1)
    await page.keyboard.press('Escape')

    await chooseTheme(page, 'light', locale)
    const lightBackground = await page.locator('pre').first().evaluate(element => getComputedStyle(element).backgroundColor)
    expect(lightBackground).not.toBe(darkBackground)
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await chooseTheme(page, 'system', locale)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await page.reload()
    await expect(trigger).toHaveAttribute('data-theme-preference', 'system')
    await page.emulateMedia({ colorScheme: 'dark' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  })
}

test('theme selection supports keyboard input, Escape and outside dismissal', async ({ page }) => {
  await page.goto('/api/')
  const trigger = page.getByRole('button', { name: 'Color theme', exact: true })
  const popover = page.locator('#theme-popover')
  await trigger.focus()
  await page.keyboard.press('Space')
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('radio', { name: 'System', exact: true })).toBeFocused()
  await popover.getByRole('radio', { name: 'Light', exact: true }).focus()
  await page.keyboard.press('Space')
  await expect(popover).not.toBeVisible()
  await expect(trigger).toHaveAttribute('data-theme-preference', 'light')
  await expect(trigger).toBeFocused()
  await page.keyboard.press('Space')
  await expect(popover).toBeVisible()
  await expect(popover.getByRole('radio', { name: 'Light', exact: true })).toBeFocused()
  for (let attempts = 0; attempts < 4 && await popover.evaluate(element => element.contains(document.activeElement)); attempts++) {
    await page.keyboard.press('Tab')
  }
  expect(await popover.evaluate(element => element.contains(document.activeElement))).toBeFalsy()
  await page.keyboard.press('Escape')
  await expect(popover).not.toBeVisible()
  await expect(trigger).toBeFocused()
  await trigger.click()
  await expect(popover).toBeVisible()
  await page.locator('.page-heading h1').click()
  await expect(popover).not.toBeVisible()
  await trigger.click()
  await page.keyboard.press('Control+k')
  await expect(page.locator('#search-dialog')).toBeVisible()
  await expect(popover).not.toBeVisible()
  await expect(page.getByRole('searchbox')).toBeFocused()
  await page.keyboard.press('Escape')
})

test('choosing the current theme closes its popover and returns focus to the trigger', async ({ page }) => {
  await page.goto('/api/')
  const trigger = page.getByRole('button', { name: 'Color theme', exact: true })
  const popover = page.locator('#theme-popover')
  await expect(trigger).toHaveAttribute('data-theme-preference', 'system')
  await trigger.click()
  const current = popover.getByRole('radio', { name: 'System', exact: true })
  await expect(current).toBeChecked()
  await current.click()
  await expect(popover).not.toBeVisible()
  await expect(trigger).toHaveAttribute('data-theme-preference', 'system')
  await expect(trigger).toBeFocused()
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
  const button = frame.getByRole('button', { name: 'Copy code', exact: true })
  await button.click()
  await expect(button).toHaveAttribute('data-copy-state', 'copied')
  await expect(button).toHaveAccessibleName('Copy code')
  await expect(frame.getByRole('status')).toHaveText('Copied')
  expect(await page.locator('html').getAttribute('data-clipboard')).toBe(expected)
  await expect(button).not.toHaveAttribute('data-copy-state', 'copied', { timeout: 4000 })
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async () => { throw new Error('Clipboard blocked') },
    } })
  })
  await button.click()
  const feedback = frame.getByRole('status')
  await expect(feedback).toContainText('Code selected')
  expect(await feedback.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(10)
  await expect(button).toHaveAccessibleName('Copy code')
  await expect(button).not.toHaveAttribute('data-copy-state', 'copied')
  expect(await page.evaluate(() => window.getSelection()?.toString())).toBe(expected)
})

test('Chromium copies code through the real browser clipboard', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'Other engines use the browser-independent copy and fallback checks.')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/api/runtime/')
  const frame = page.locator('.code-frame').first()
  const expected = await frame.locator('code').textContent()
  const button = frame.getByRole('button', { name: 'Copy code', exact: true })
  await button.click()
  await expect(button).toHaveAttribute('data-copy-state', 'copied')
  await expect(button).toHaveAccessibleName('Copy code')
  await expect(frame.getByRole('status')).toHaveText('Copied')
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expected)
})

test('mobile navigation is modal, supports Escape and reaches the requested guide', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/zh/api/')
  await expect(page.getByRole('button', { name: '搜索文档', exact: true })).toBeVisible()
  const button = page.getByRole('button', { name: '打开导航' })
  const theme = page.getByRole('button', { name: '颜色主题', exact: true })
  await theme.click()
  await expect(page.locator('#theme-popover')).toBeVisible()
  await button.click()
  const menu = page.locator('#navigation-dialog')
  await expect(menu).toBeVisible()
  await expect(page.locator('#theme-popover')).not.toBeVisible()
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
  await page.setViewportSize({ width: 768, height: 900 })
  await expect(page.locator('#navigation-dialog')).toBeVisible()
  await expect(page.locator('#navigation-dialog #site-navigation')).toBeVisible()
  await page.setViewportSize({ width: 769, height: 900 })
  await expect(page.locator('#navigation-dialog')).not.toBeVisible()
  await expect(page.locator('.docs-grid > #site-navigation')).toBeVisible()
  await expect(page.locator('#site-navigation [aria-current="page"]')).toBeFocused()
})

test('a collapsed current navigation group receives visible focus when returning to desktop', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/zh/api/runtime/')
  await page.getByRole('button', { name: '打开导航', exact: true }).click()
  const menu = page.locator('#navigation-dialog')
  const current = menu.locator('#site-navigation [aria-current="page"]')
  const group = menu.locator('details').filter({ has: page.locator('[aria-current="page"]') })
  await expect(group).toHaveCount(1)
  const summary = group.locator(':scope > summary')
  await expect(current).toBeVisible()
  await summary.click()
  await expect(current).not.toBeVisible()
  await expect(summary).toBeVisible()
  await page.setViewportSize({ width: 769, height: 900 })
  await expect(menu).not.toBeVisible()
  await expect(page.locator('.docs-grid > #site-navigation')).toBeVisible()
  const desktopGroup = page.locator('#site-navigation details').filter({ has: page.locator('[aria-current="page"]') })
  await expect(desktopGroup.locator(':scope > summary')).toBeVisible()
  await expect(desktopGroup.locator(':scope > summary')).toBeFocused()
  await expect(page.locator('#site-navigation [aria-current="page"]')).not.toBeVisible()
})

test('theme, navigation, search and copy initialize when storage is blocked', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get: () => {
        throw new Error('Storage blocked')
      },
    })
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/api/runtime/')
  await chooseTheme(page, 'dark')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
  await expect(page.locator('#navigation-dialog #site-navigation')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.locator('[data-open-search]').click()
  await expect(page.getByRole('searchbox')).toBeFocused()
  await page.keyboard.press('Escape')
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
      writeText: async (text: string) => { document.documentElement.dataset.clipboard = text },
    } })
  })
  const frame = page.locator('.code-frame').first()
  await frame.getByRole('button', { name: 'Copy code', exact: true }).click()
  await expect(frame.getByRole('status')).toHaveText('Copied')
  expect(await page.locator('html').getAttribute('data-clipboard')).toBe(await frame.locator('code').textContent())
  expect(errors).toEqual([])
})

test('theme choices stay inside both narrow phone viewports', async ({ page }) => {
  for (const width of [390, 375]) {
    await page.setViewportSize({ width, height: 844 })
    for (const locale of ['en', 'zh'] as const) {
      await page.goto(`${locale === 'zh' ? '/zh' : ''}/api/`)
      await page.getByRole('button', { name: themeLabels[locale].title, exact: true }).click()
      const popover = page.locator('#theme-popover')
      await expect(popover).toBeVisible()
      const bounds = await popover.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
      await expect(popover.getByRole('radio')).toHaveCount(3)
      for (const choice of await popover.locator('label').all()) {
        const bounds = await choice.boundingBox()
        expect(bounds).not.toBeNull()
        expect(bounds!.height).toBeGreaterThanOrEqual(44)
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBeFalsy()
      await page.keyboard.press('Escape')
      await expect(popover).not.toBeVisible()
    }
  }
})

test('desktop, tablet and phone keep long API content inside the viewport', async ({ page }) => {
  for (const width of [1440, 1024, 390, 375]) {
    await page.setViewportSize({ width, height: 900 })
    for (const route of ['/', '/zh/api/postcss-plugin/']) {
      await page.goto(route)
      await expect(page.locator('.page-heading h1')).toBeVisible()
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
      expect(overflow, `${route} at ${width}`).toBeFalsy()
      if (width <= 390 && route.includes('/api/')) {
        const table = page.locator('article table').first()
        const pre = page.locator('article pre').first()
        await expect(table).toHaveAttribute('tabindex', '0')
        await expect(pre).toHaveAttribute('tabindex', '0')
        await table.focus()
        await page.keyboard.press('ArrowRight')
        await expect.poll(() => table.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
        await waitForHorizontalScroll(table)
        expect(await pre.evaluate(element => element.scrollLeft)).toBe(0)
        expect(await page.evaluate(() => window.scrollX)).toBe(0)
        await table.evaluate(element => element.scrollLeft = 0)
        await waitForHorizontalScroll(table)
        await pre.focus()
        await page.keyboard.press('ArrowRight')
        await expect.poll(() => pre.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
        await waitForHorizontalScroll(pre)
        expect(await table.evaluate(element => element.scrollLeft)).toBe(0)
        expect(await page.evaluate(() => window.scrollX)).toBe(0)
      }
    }
  }
})
