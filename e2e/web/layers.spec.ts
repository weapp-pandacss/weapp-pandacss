import { expect, test } from '@playwright/test'
import postcss from 'postcss'
// eslint-disable-next-line antfu/no-import-dist -- Browser parity exercises the production adapter consumed by applications.
import adapter from '../../packages/weapp-pandacss/dist/postcss.js'

const safeCases = [
  {
    name: 'declared order and unlayered normal priority',
    css: '.probe{color:green}@layer base,utilities;@layer utilities{.probe{color:blue;background:blue}}@layer base{.probe{color:red;background:red}}',
  },
  {
    name: 'important inversion, mixed declarations and fallback order',
    css: '@layer a,b;@layer a{.probe{color:red!important;background:red;color:orange!important}}@layer b{.probe{color:blue!important;background:blue}}.probe{color:green!important;background:green}',
  },
  {
    name: 'nested implicit layers and repeated named layers',
    css: '@layer outer.a,outer.b,last;@layer outer{.probe{color:green!important;padding-top:3px}@layer b{.probe{color:blue!important;padding-top:2px}}@layer a{.probe{color:red!important;padding-top:1px}}}@layer last{.probe{color:purple!important;padding-top:4px}}@layer outer.a{.probe{color:orange!important}}',
  },
  {
    name: 'anonymous identity and shorthand declarations',
    css: '@layer first;@layer first{.probe{margin:1px;color:red!important}}@layer{.probe{margin-top:2px;color:blue!important}}@layer{.probe{margin-top:3px;color:green!important}}',
  },
  {
    name: 'conditions at wide and narrow viewports',
    css: '@layer a,b;@layer a{.probe{color:red;background:red}}@media(min-width:700px){@supports(display:grid){@layer b{.probe{color:blue;background:blue!important}}}}',
  },
]

async function computed(page: import('@playwright/test').Page, css: string) {
  await page.setContent(`<style>${css}</style><div id="card"><div class="probe">Layer probe</div></div>`)
  return page.locator('.probe').evaluate((node) => {
    const style = getComputedStyle(node)
    return Object.fromEntries(['color', 'background-color', 'margin-top', 'padding-top'].map(prop => [prop, style.getPropertyValue(prop)]))
  })
}

for (const fixture of safeCases) {
  test(`ordered WXSS agrees with native layers: ${fixture.name}`, async ({ page }) => {
    const output = await postcss([adapter({ cascadeLayers: { mode: 'ordered', onConflict: 'error' } })])
      .process(fixture.css, { from: undefined })
    expect(output.warnings()).toEqual([])
    expect(output.css).not.toContain('@layer')
    expect(output.css).not.toContain(':not(')
    for (const width of [390, 1000]) {
      await page.setViewportSize({ width, height: 844 })
      const native = await computed(page, fixture.css)
      expect(await computed(page, output.css)).toEqual(native)
    }
  })
}

test('documents the specificity boundary instead of silently claiming full layer equivalence', async ({ page }) => {
  const css = '@layer base,utilities;@layer base{#card .probe{color:red}}@layer utilities{.probe{color:blue}}'
  const output = await postcss([adapter()]).process(css, { from: 'specificity.css' })
  expect(output.warnings().some(warning => warning.text.includes('WP_LAYER_SPECIFICITY'))).toBe(true)
  expect((await computed(page, css)).color).toBe('rgb(0, 0, 255)')
  expect((await computed(page, output.css)).color).toBe('rgb(255, 0, 0)')
  await expect(postcss([adapter({ cascadeLayers: { onConflict: 'error' } })]).process(css, { from: undefined }))
    .rejects
    .toThrow('WP_LAYER_SPECIFICITY')
})
