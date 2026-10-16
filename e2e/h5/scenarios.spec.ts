import type { Page } from '@playwright/test'
import { test as base, expect } from '@playwright/test'
import { importColors, preprocessorCases, remLengths, scenarioState } from '../scenarios.ts'

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
    expect(errors, 'Production H5 runtime and asset loading must be error free').toEqual([])
  }, { auto: true }],
})

const apps = [
  { name: 'taro-react', url: 'http://127.0.0.1:4181', taro: true },
  { name: 'taro-vue', url: 'http://127.0.0.1:4182', taro: true },
  { name: 'uni-app', url: 'http://127.0.0.1:4183', taro: false },
]

test('taro-vue: NutUI opens, dismisses and reopens through real clicks', async ({ page }) => {
  await page.goto('http://127.0.0.1:4182')
  const toast = page.locator('.scenario-nut-toast')
  await expect(page.locator('#scenario-nut-status')).toHaveText('closed')
  for (let cycle = 0; cycle < 2; cycle++) {
    await page.locator('#scenario-nut-trigger').click()
    await expect(page.locator('#scenario-nut-status')).toHaveText('open')
    await expect(toast).toBeVisible()
    await expect(toast).toHaveText('你成功了～')
    await toast.click({ position: { x: 8, y: 8 } })
    await expect(page.locator('#scenario-nut-status')).toHaveText('closed')
    await expect(toast).toBeHidden()
  }
})

async function assertState(page: Page, active: boolean) {
  await expect(page.locator('#scenario-status')).toHaveText(active ? 'accent' : 'neutral')
  for (const [id, styles] of Object.entries(scenarioState(active))) {
    for (const [property, expected] of Object.entries(styles)) {
      await expect(page.locator(`#${id}`)).toHaveCSS(property, expected)
    }
  }
}

async function assertProps(page: Page, app: typeof apps[number], active: boolean, tailwind = false) {
  const component = page.locator(tailwind ? '#scenario-props-tailwind' : '#scenario-props')
  const unit = app.taro
    ? await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 32 / 40)
    : 32
  if (app.name === 'taro-vue') {
    for (const [property, expected] of Object.entries(scenarioState(active)['scenario-recipe']!)) {
      await expect(component).toHaveCSS(property, expected)
    }
  }
  else {
    // Assert authored token values independently of generated custom-property names.
    // The browser canonicalizes OKLCH serialization without sampling the component.
    const background = app.taro
      ? active ? 'oklch(0 0 0 / 0)' : 'oklch(88.5% 0.062 18.334)'
      : active ? tailwind ? 'rgb(50, 128, 255)' : 'oklch(62.3% 0.214 259.815)' : 'rgb(255, 255, 255)'
    const expectedBackground = await page.evaluate((color) => {
      const probe = document.createElement('span')
      probe.style.color = color
      document.body.append(probe)
      const result = getComputedStyle(probe).color
      probe.remove()
      return result
    }, background)
    await expect(component).toHaveCSS('background-color', expectedBackground)
    const size = app.taro ? (active ? 24 : 20) / 32 * unit : active ? 32 : 28
    await expect.poll(async () => Number.parseFloat(await component.evaluate(element => getComputedStyle(element).fontSize)))
      .toBeCloseTo(size, 1)
  }
  const vertical = app.name === 'taro-vue' ? unit / 2 : unit * (active ? 0.5 : 0.25)
  const horizontal = app.taro ? vertical : vertical * 2
  for (const [property, expected] of [
    ['padding-top', vertical],
    ['padding-bottom', vertical],
    ['padding-left', horizontal],
    ['padding-right', horizontal],
  ] as const) {
    await expect.poll(async () => Number.parseFloat(await component.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), property)))
      .toBeCloseTo(expected, 1)
  }
  if (!app.taro) {
    await expect(component).toHaveCSS('text-transform', active ? 'uppercase' : 'none')
  }
}

for (const app of apps) {
  test(`${app.name}: production startup, preprocessors, imports, Unicode and units`, async ({ page }) => {
    await page.goto(app.url)
    await assertState(page, false)
    for (const [id, color] of Object.entries(importColors)) {
      await expect(page.locator(`#${id}`)).toHaveCSS('color', color)
    }
    const unit = app.taro
      ? await page.evaluate(() => Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 32 / 40)
      : 32
    for (const fixture of preprocessorCases) {
      const node = page.locator(`#preprocess-${fixture.language}`)
      await expect(node).toHaveCSS('color', fixture.color)
      await expect(node).toHaveCSS('opacity', '0.75')
      await expect(node).toHaveCSS('white-space', 'nowrap')
      for (const [property, factor] of [['padding-left', fixture.space], ['margin-bottom', -fixture.space], ['letter-spacing', 0.125]] as const) {
        await expect.poll(async () => Number.parseFloat(await node.evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), property)))
          .toBeCloseTo(unit * factor, 1)
      }
    }
    for (const [selector, property, value] of [
      ...remLengths.map(([id, property, factor]) => [`#${id}`, property, factor * unit] as const),
      ['#scenario-collision-a', 'margin-right', app.taro ? 7 / 32 * unit : 7],
      ['#scenario-collision-b', 'margin-right', app.taro ? 11 / 32 * unit : 11],
    ] as const) {
      await expect.poll(async () => Number.parseFloat(await page.locator(selector).evaluate((element, property) => getComputedStyle(element).getPropertyValue(property), property)))
        .toBeCloseTo(value, 1)
    }
    expect(await page.locator('#scenario-unicode').getAttribute('class')).not.toBe(await page.locator('#scenario-marker').getAttribute('class'))
    expect(await page.locator('#scenario-collision-a').getAttribute('class')).not.toBe(await page.locator('#scenario-collision-b').getAttribute('class'))
  })

  test(`${app.name}: dynamic props follow four user toggles and reload`, async ({ page }) => {
    await page.goto(app.url)
    await assertState(page, false)
    const component = page.locator('#scenario-props')
    await expect(component).toHaveText('neutral')
    await assertProps(page, app, false)
    const originalClass = await component.getAttribute('class')
    const originalBackground = await component.evaluate(element => getComputedStyle(element).backgroundColor)
    const originalSize = await component.evaluate(element => getComputedStyle(element).fontSize)
    for (let cycle = 1; cycle <= 4; cycle++) {
      const active = cycle % 2 === 1
      await page.locator('#scenario-toggle').click()
      await page.mouse.move(0, 0)
      await assertState(page, active)
      await expect(component).toHaveText(active ? 'accent' : 'neutral')
      await assertProps(page, app, active)
      if (active) {
        await expect(component).not.toHaveAttribute('class', originalClass!)
        await expect(component).not.toHaveCSS('background-color', originalBackground)
        if (app.name !== 'taro-vue') {
          await expect(component).not.toHaveCSS('font-size', originalSize)
        }
      }
      else {
        await expect(component).toHaveAttribute('class', originalClass!)
        await expect(component).toHaveCSS('background-color', originalBackground)
        await expect(component).toHaveCSS('font-size', originalSize)
      }
    }
    await page.reload()
    await assertState(page, false)
    await assertProps(page, app, false)
    await expect(component).toHaveAttribute('class', originalClass!)
    await expect(component).toHaveText('neutral')
  })
}

// The Tailwind sibling shares the same reactive props contract as Panda.
test('uni-app: Tailwind recipe props follow the parent state', async ({ page }) => {
  const app = apps.find(app => app.name === 'uni-app')!
  await page.goto('http://127.0.0.1:4183')
  const component = page.locator('#scenario-props-tailwind')
  await expect(component).toHaveText('neutral')
  await assertProps(page, app, false, true)
  const originalClass = await component.getAttribute('class')
  const originalBackground = await component.evaluate(element => getComputedStyle(element).backgroundColor)
  for (let cycle = 1; cycle <= 4; cycle++) {
    const active = cycle % 2 === 1
    await page.locator('#scenario-toggle').click()
    await page.mouse.move(0, 0)
    await expect(component).toHaveText(active ? 'accent' : 'neutral')
    await assertProps(page, app, active, true)
    if (active) {
      await expect(component).not.toHaveAttribute('class', originalClass!)
      await expect(component).not.toHaveCSS('background-color', originalBackground)
      await expect(component).toHaveCSS('text-transform', 'uppercase')
    }
    else {
      await expect(component).toHaveAttribute('class', originalClass!)
      await expect(component).toHaveCSS('background-color', originalBackground)
      await expect(component).toHaveCSS('text-transform', 'none')
    }
  }
  await page.reload()
  await assertProps(page, app, false, true)
  await expect(component).toHaveText('neutral')
  await expect(component).toHaveAttribute('class', originalClass!)
})
