import type { Locator } from '@playwright/test'
import { expect, test } from '@playwright/test'

const labels = {
  en: {
    search: 'Search documentation',
    github: 'GitHub repository',
    language: 'Switch to 简体中文',
    theme: 'Color theme',
    menu: 'Open navigation',
    close: 'Close',
    submit: 'Search',
    copy: 'Copy code',
  },
  zh: {
    search: '搜索文档',
    github: 'GitHub 仓库',
    language: '切换到 English',
    theme: '颜色主题',
    menu: '打开导航',
    close: '关闭',
    submit: '搜索',
    copy: '复制代码',
  },
} as const

async function expectIconControl(control: Locator, name: string) {
  await expect(control).toBeVisible()
  await expect(control).toHaveAccessibleName(name)
  await expect(control.locator('svg')).toHaveCount(1)
  await expect(control.locator('svg')).toHaveAttribute('aria-hidden', 'true')
  const tooltip = control.locator('[role="tooltip"]')
  await expect(tooltip).toHaveCount(1)
  await expect(tooltip).toHaveText(name)
  await expect(control).toHaveAttribute('aria-describedby', (await tooltip.getAttribute('id'))!)
  const bounds = await control.boundingBox()
  expect(bounds).not.toBeNull()
  expect(bounds!.width).toBeGreaterThanOrEqual(44)
  expect(bounds!.height).toBeGreaterThanOrEqual(44)
}

for (const locale of ['en', 'zh'] as const) {
  const prefix = locale === 'zh' ? '/zh' : ''
  const text = labels[locale]

  test(`${locale} icon tools have localized names, decorative SVGs and touch-sized targets`, async ({ page }) => {
    for (const width of [1440, 390, 375]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto(`${prefix}/api/runtime/`)
      await page.mouse.move(1, 1)
      const header = page.locator('.site-header')
      await expectIconControl(header.getByRole('button', { name: text.search, exact: true }), text.search)
      await expectIconControl(header.getByRole('link', { name: text.github, exact: true }), text.github)
      await expectIconControl(header.getByRole('link', { name: text.language, exact: true }), text.language)
      await expectIconControl(header.getByRole('button', { name: text.theme, exact: true }), text.theme)
      await expect(header.getByRole('link', { name: text.github, exact: true })).toHaveAttribute('href', 'https://github.com/weapp-pandacss/weapp-pandacss')
      const languageDestination = await header.getByRole('link', { name: text.language, exact: true }).evaluate((link) => {
        const target = new URL((link as HTMLAnchorElement).href)
        return target.pathname + target.search
      })
      expect(languageDestination).toBe(`${locale === 'zh' ? '' : '/zh'}/api/runtime/?lang=${locale === 'zh' ? 'en' : 'zh'}`)
      for (const control of await page.locator('[data-tooltip-trigger]:visible').all()) {
        const label = await control.getAttribute('aria-label')
        expect(label).toBeTruthy()
        await expectIconControl(control, label!)
        await expect(control.locator('[role="tooltip"]')).not.toBeVisible()
      }
      for (const svg of await page.locator('svg').all()) {
        await expect(svg).toHaveAttribute('aria-hidden', 'true')
      }
      for (const link of await page.locator('#site-navigation nav a, .section-tabs a, .previous-next a').all()) {
        expect((await link.textContent())?.trim()).toBeTruthy()
      }
      await expect(page.locator('#site-navigation [aria-current="page"]')).toHaveAttribute('href', `${prefix}/api/runtime/`)
      if (width <= 390) {
        const menu = header.getByRole('button', { name: text.menu, exact: true })
        await expectIconControl(menu, text.menu)
        await menu.click()
        await expectIconControl(page.locator('#navigation-dialog').getByRole('button', { name: text.close, exact: true }), text.close)
        await page.keyboard.press('Escape')
      }
      await header.getByRole('button', { name: text.search, exact: true }).click()
      const search = page.locator('#search-dialog')
      await expectIconControl(search.getByRole('button', { name: text.close, exact: true }), text.close)
      await expectIconControl(search.getByRole('button', { name: text.submit, exact: true }), text.submit)
      await page.keyboard.press('Escape')
    }
  })

  test(`${locale} tooltips support hover, keyboard focus and persistent Escape dismissal`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.setViewportSize({ width: 375, height: 844 })
    await page.goto(`${prefix}/api/runtime/`)
    const controls = [
      page.getByRole('button', { name: text.search, exact: true }),
      page.getByRole('button', { name: text.theme, exact: true }),
      page.locator('.code-frame').first().getByRole('button', { name: text.copy, exact: true }),
    ]
    for (const control of controls) {
      const tooltip = control.locator('[role="tooltip"]')
      await page.locator('#main-content').focus()
      await page.mouse.move(1, 1)
      await control.scrollIntoViewIfNeeded()
      await expect(tooltip).not.toBeVisible()
      await control.hover()
      await expect(tooltip).toBeVisible()
      const bounds = await tooltip.boundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds!.x).toBeGreaterThanOrEqual(0)
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(375)
      await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2, { steps: 10 })
      await expect(tooltip).toBeVisible()
      await control.hover()
      await expect(tooltip).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(tooltip).not.toBeVisible()
      await control.hover()
      await expect(tooltip).not.toBeVisible()
      await page.mouse.move(1, 1)
      await control.hover()
      await expect(tooltip).toBeVisible()
      await page.mouse.move(1, 1)
      await page.keyboard.press('Tab')
      await control.focus()
      await expect(control).toBeFocused()
      await expect(tooltip).toBeVisible()
      const focus = await control.evaluate((element) => {
        const style = getComputedStyle(element)
        return {
          visible: element.matches(':focus-visible'),
          outlineStyle: style.outlineStyle,
          outlineWidth: Number.parseFloat(style.outlineWidth),
          outlineColor: style.outlineColor,
        }
      })
      expect(focus.visible).toBeTruthy()
      expect(focus.outlineStyle).not.toBe('none')
      expect(focus.outlineWidth).toBeGreaterThan(0)
      expect(focus.outlineColor).not.toBe('rgba(0, 0, 0, 0)')
      await page.keyboard.press('Escape')
      await expect(tooltip).not.toBeVisible()
      await expect(control).toBeFocused()
      await control.focus()
      await expect(tooltip).not.toBeVisible()
      await page.locator('#main-content').focus()
      await control.focus()
      await expect(tooltip).toBeVisible()
    }
  })
}
