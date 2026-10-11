import type { Page } from '@playwright/test'
import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, test } from '@playwright/test'
import postcss from 'postcss'
import { encodeClassName } from '../../packages/runtime/src/index.js'
// eslint-disable-next-line antfu/no-import-dist -- Compare the production adapter with browser-native imported styles.
import adapter from '../../packages/weapp-pandacss/dist/postcss.js'

const importRoot = path.resolve(import.meta.dirname, '../../examples/react-app/src/imports')
const names = ['import-normal', 'import-important', 'import-unlayered', 'import-same-layer', 'import-nested', 'import/中文', 'import_wp_2f_中文', 'import.a', 'import_wp_2e_a', 'import-units']
const properties = ['color', 'background-color', 'padding-left', 'margin-left', 'margin-right', 'margin-top', 'padding-top', 'margin-bottom', 'width', '--import-unit-space']

async function values(page: Page) {
  return page.locator('[data-import-probe]').evaluateAll((elements, properties) => elements.map((element) => {
    const style = getComputedStyle(element)
    return Object.fromEntries(properties.map(property => [property, style.getPropertyValue(property)]))
  }), properties)
}

function probes(encoded: boolean, classes = names) {
  return classes.map(name => `<div data-import-probe class="${encoded ? encodeClassName(name) : name}">Import probe</div>`).join('')
}

test('cross-file imports preserve native cascade and portable names in the production H5 build', async ({ page }) => {
  await page.goto('/')
  await page.evaluate((names) => {
    for (const name of names) {
      const probe = document.createElement('div')
      probe.dataset.importProbe = ''
      probe.className = name
      probe.textContent = 'Import probe'
      document.body.append(probe)
    }
  }, names.map(encodeClassName))
  const actual = await values(page)
  expect(actual.map(value => value.color).slice(0, 4)).toEqual(['rgb(2, 132, 199)', 'rgb(220, 38, 38)', 'rgb(17, 24, 39)', 'rgb(22, 163, 74)'])
  expect(actual[4]!['margin-left']).toBe('4px')
  expect(actual[5]!['padding-left']).toBe('8px')
  expect(actual[6]!['padding-left']).toBe('12px')
  expect(actual[7]!['margin-right']).toBe('7px')
  expect(actual[8]!['margin-right']).toBe('11px')
  expect(actual[9]!['margin-top']).toBe('-8px')
  expect(actual[9]!['padding-top']).toBe('0.016px')
  expect(actual[9]!['margin-bottom']).toBe('-32px')
  expect(actual[9]!.width).toBe('160px')
  expect(actual[9]!['--import-unit-space'].trim()).toBe('1.25rem')
  const { token } = await import(pathToFileURL(path.resolve(importRoot, '../../styled-system/tokens/index.mjs')).href)
  const tokenValue = await page.evaluate(name => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), token.var('spacing.unit-fixture').slice(4, -1))
  expect(tokenValue).toBe('1.25rem')
})

test('ordered imported WXSS matches browser-native multi-file layers', async ({ page, baseURL }) => {
  const source = '@layer import-demo.base, import-demo.utilities;\n@import "./entry.css";'
  const output = await postcss([adapter({ panda: false, cascadeLayers: { onConflict: 'error' } })])
    .process(source, { from: path.join(importRoot, 'browser-main.css') })
  expect(output.warnings()).toEqual([])
  expect(output.css).not.toMatch(/@(?:import|layer)\b/)
  await page.route('**/__import-native/**', async (route) => {
    const name = path.basename(new URL(route.request().url()).pathname)
    const body = name === 'main.css' ? source : await fs.readFile(path.join(importRoot, name), 'utf8')
    await route.fulfill({ contentType: 'text/css', body })
  })
  const href = new URL('/__import-native/main.css', baseURL).href
  for (const width of [390, 1000]) {
    await page.setViewportSize({ width, height: 844 })
    await page.setContent(`<link rel="stylesheet" href="${href}">${probes(false)}`, { waitUntil: 'load' })
    const native = await values(page)
    await page.setContent(`<style>${output.css}</style>${probes(true)}`)
    expect(await values(page)).toEqual(native)
  }
})

test('explicit built-in units preserve imported computed lengths with a supplied root scale', async ({ page, baseURL }) => {
  const source = '@import "./entry.css";'
  const output = await postcss([adapter({
    panda: false,
    target: 'web',
    units: { rules: [{ from: 'rem', to: 'px', factor: 20 }] },
  })]).process(source, { from: path.join(importRoot, 'browser-units.css') })
  expect(output.css).not.toMatch(/@import\b/)
  expect(output.css).toContain('--import-unit-space: 25px')
  await page.route('**/__import-units/**', async (route) => {
    const name = path.basename(new URL(route.request().url()).pathname)
    const body = name === 'main.css' ? source : await fs.readFile(path.join(importRoot, name), 'utf8')
    await route.fulfill({ contentType: 'text/css', body })
  })
  const href = new URL('/__import-units/main.css', baseURL).href
  const lengths = async () => (await values(page)).map(({ '--import-unit-space': _unit, ...computed }) => computed)
  for (const width of [390, 1000]) {
    await page.setViewportSize({ width, height: 844 })
    await page.setContent(`<style>:root{font-size:20px}</style><link rel="stylesheet" href="${href}">${probes(false)}`, { waitUntil: 'load' })
    const native = await lengths()
    await page.setContent(`<style>:root{font-size:20px}${output.css}</style>${probes(true)}`)
    expect(await lengths()).toEqual(native)
  }
})

test('named, anonymous and conditional imports retain native results at both viewport widths', async ({ page, baseURL }) => {
  const files: Record<string, string> = {
    'main.css': '@layer first,second;@import "first.css" layer(first);@import "second.css" layer(second) supports(display:grid) (min-width:700px);@import "anonymous.css" layer;',
    'first.css': '.probe{color:red;background:red!important;margin-left:1px}',
    'second.css': '.probe{color:blue;background:blue!important}',
    'anonymous.css': '.probe{margin-left:3px}',
  }
  const source = files['main.css']!
  const output = await postcss([
    adapter({
      panda: false,
      imports: {
        resolve: id => path.join(importRoot, id),
        load: filename => files[path.basename(filename)]!,
      },
      cascadeLayers: { onConflict: 'error' },
    }),
  ]).process(source, { from: path.join(importRoot, 'main.css') })
  expect(output.warnings()).toEqual([])
  expect(output.css).not.toMatch(/@(?:import|layer)\b/)
  await page.route('**/__import-conditions/**', route => route.fulfill({
    contentType: 'text/css',
    body: files[path.basename(new URL(route.request().url()).pathname)]!,
  }))
  const href = new URL('/__import-conditions/main.css', baseURL).href
  for (const width of [390, 1000]) {
    await page.setViewportSize({ width, height: 844 })
    await page.setContent(`<link rel="stylesheet" href="${href}">${probes(false, ['probe'])}`, { waitUntil: 'load' })
    const native = await values(page)
    expect(native[0]!.color).toBe(width < 700 ? 'rgb(255, 0, 0)' : 'rgb(0, 0, 255)')
    await page.setContent(`<style>${output.css}</style>${probes(true, ['probe'])}`)
    expect(await values(page)).toEqual(native)
  }
})

test('framework Sass, Less and Stylus preserve variables, mixins, nesting and imported CSS', async ({ page }) => {
  await page.goto('/')
  const fixtures = [
    { language: 'sass', color: 'rgb(18, 52, 86)', padding: '4px' },
    { language: 'less', color: 'rgb(35, 69, 103)', padding: '8px' },
    { language: 'stylus', color: 'rgb(52, 86, 120)', padding: '12px' },
  ]
  for (const { language, color, padding } of fixtures) {
    const probe = page.getByTestId(`preprocess-${language}`)
    await expect(probe).toHaveCSS('color', color)
    await expect(probe).toHaveCSS('padding-left', padding)
    await expect(probe).toHaveCSS('margin-bottom', `-${padding}`)
    await expect(probe).toHaveCSS('opacity', '0.75')
    await expect(probe).toHaveCSS('white-space', 'nowrap')
    await expect(probe).toHaveCSS('letter-spacing', '2px')
    await expect(probe).toHaveClass(`${encodeClassName(`preprocess/${language}-中文`)} active ${encodeClassName(`preprocess/import-${language}`)}`)
  }
})
