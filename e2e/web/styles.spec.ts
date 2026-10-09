import { test as base, expect } from '@playwright/test'

const test = base.extend<{ runtimeErrors: void }>({
  runtimeErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('console', (message) => {
      if (message.type() === 'error') {
        errors.push(message.text())
      }
    })
    await use()
    expect(errors, 'Browser runtime and asset loading must be error free').toEqual([])
  }, { auto: true }],
})

test('loads portable CSS, hashed tokens and distinct manual names in a production page', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading')).toHaveCSS('font-size', '24px')
  await expect(page.getByRole('heading')).toHaveCSS('color', 'rgb(2, 132, 199)')
  await expect(page.getByTestId('token')).toHaveCSS('padding-top', '2px')
  await expect(page.getByTestId('manual')).toHaveCSS('font-size', '20px')
  await expect(page.getByTestId('manual')).toHaveCSS('border-left-width', '3px')
  await expect(page.getByTestId('collision-a')).toHaveCSS('margin-left', '7px')
  await expect(page.getByTestId('collision-b')).toHaveCSS('margin-left', '11px')
  expect(await page.getByTestId('collision-a').getAttribute('class'))
    .not
    .toBe(await page.getByTestId('collision-b').getAttribute('class'))

  const unmatched = await page.evaluate(() => {
    const classes = new Set<string>()
    function collect(rules: CSSRuleList) {
      for (const rule of rules) {
        if (rule instanceof CSSStyleRule) {
          for (const match of rule.selectorText.matchAll(/\.([\w-]+)/g)) {
            classes.add(match[1]!)
          }
        }
        else if ('cssRules' in rule) {
          collect((rule as CSSGroupingRule).cssRules)
        }
      }
    }
    for (const sheet of document.styleSheets) {
      collect(sheet.cssRules)
    }
    return [...document.querySelectorAll('h1, button, p')].flatMap(element =>
      [...element.classList].filter(name => !/^[A-Z_][\w-]*$/i.test(name) || !classes.has(name)),
    )
  })
  expect(unmatched, 'Every runtime class must have a safe matching production selector').toEqual([])
})

test('updates recipe compounds and slot styles through repeated user interactions and reload', async ({ page }) => {
  await page.goto('/')
  const button = page.getByRole('button')
  const original = await button.getAttribute('class')
  for (let cycle = 0; cycle < 3; cycle++) {
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(button).toHaveText('Accent')
    await expect(button).toHaveCSS('background-color', 'rgb(2, 132, 199)')
    await expect(button).toHaveCSS('outline-width', '3px')
    await expect(page.getByTestId('slot-label')).toHaveCSS('color', 'rgb(2, 132, 199)')
    await expect(page.getByTestId('card')).toHaveCSS('border-top-color', 'rgb(2, 132, 199)')
    expect(await button.getAttribute('class')).not.toBe(original)
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'false')
    await expect(button).toHaveCSS('background-color', 'rgb(51, 65, 85)')
    await expect(button).toHaveAttribute('class', original!)
  }
  await page.reload()
  await expect(button).toHaveAttribute('class', original!)
  await expect(button).toHaveAttribute('aria-pressed', 'false')
})

test('preserves Web hover semantics at desktop and mobile widths', async ({ page }) => {
  await page.goto('/')
  const target = page.getByTestId('hover')
  await expect(target).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await target.hover()
  await expect(target).toHaveCSS('background-color', 'rgb(253, 224, 71)')
  await page.mouse.move(0, 0)
  await expect(target).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByRole('button')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})
