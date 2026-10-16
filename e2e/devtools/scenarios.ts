import type automator from 'miniprogram-automator'
import type { SdkRequest } from './lifecycle.ts'
import type { RpxSystemInfo } from './rpx.ts'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import postcss from 'postcss'
import { importColors, preprocessorCases, remLengths, scenarioState } from '../scenarios.ts'
import { withCleanup } from './lifecycle.ts'
import { expectedRpx } from './rpx.ts'
import { settleViewport } from './viewport.ts'

type MiniProgram = Awaited<ReturnType<typeof automator.connect>>
type Page = NonNullable<Awaited<ReturnType<MiniProgram['reLaunch']>>>
type Element = NonNullable<Awaited<ReturnType<Page['$']>>>

interface Context {
  name: string
  page: Page
  runtime: MiniProgram
  request: SdkRequest
  find: (selector: string) => Promise<Element | null>
  css: string
  systemInfo: RpxSystemInfo & { windowHeight: number }
  evidence: string
  cycle: number
  compare: (baseline: string, current: string, evidence: string) => Promise<void>
}

/** Assertions are shared across frameworks; only component lookup is adapted. */
export async function runSharedScenarios(context: Context) {
  const { name, page, runtime, request, find, css, systemInfo, evidence, cycle } = context
  const records: unknown[] = []
  let currentToggle = 0
  let currentActive = false
  const rpx = (value: number) => expectedRpx(value, systemInfo)
  const selectors = new Set([...css.matchAll(/\.([\w-]+)/g)].map(match => match[1]!))
  const stylesheet = postcss.parse(css)
  async function node(id: string) {
    const found = await find(`#${id}`)
    assert(found, `${name}: missing rendered #${id}`)
    return found
  }
  async function probe(id: string, expected: Record<string, string | number>) {
    const element = await node(id)
    const classes = (await request(() => element.attribute('class'))).trim().split(/\s+/).filter(Boolean)
    const matched = classes.flatMap((name) => {
      const original = name.replace(/^[\w-]+--/, '')
      return [name, original].filter(candidate => selectors.has(candidate))
    })
    assert(matched.length > 0, `${name}: #${id} classes must match emitted WXSS: ${classes.join(' ')}`)
    const actual: Record<string, string> = {}
    for (const [property, value] of Object.entries(expected)) {
      actual[property] = await request(() => element.style(property))
      if (typeof value === 'number') {
        assert(Math.abs(Number.parseFloat(actual[property]!) - value) < 0.15, `${name}: #${id}.${property} expected ${value}px, got ${actual[property]}`)
      }
      else { assert.equal(actual[property], value, `${name}: #${id}.${property}`) }
    }
    const wxss: { selector: string, declarations: { property: string, value: string, important: boolean }[] }[] = []
    stylesheet.walkRules((rule) => {
      if (![...rule.selector.matchAll(/\.([\w-]+)/g)].some(match => matched.includes(match[1]!))) {
        return
      }
      const declarations: { property: string, value: string, important: boolean }[] = []
      rule.walkDecls((declaration) => {
        declarations.push({ property: declaration.prop, value: declaration.value, important: Boolean(declaration.important) })
      })
      wxss.push({ selector: rule.selector, declarations })
    })
    records.push({ toggle: currentToggle, active: currentActive, id, classes, matchedSelectors: [...new Set(matched)], wxss, inlineStyle: await request(() => element.attribute('style')), expected, actual })
    return { classes: classes.join(' '), actual, element }
  }
  async function status(active: boolean) {
    const expected = active ? 'accent' : 'neutral'
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      const actual = (await request(async () => (await node('scenario-status')).text())).trim()
      if (actual === expected) {
        records.push({ toggle: currentToggle, active, status: actual })
        return
      }
      await delay(50)
    }
    assert.fail(`${name}: scenario status did not become ${expected}`)
  }
  async function state(active: boolean) {
    await status(active)
    for (const [id, expected] of Object.entries(scenarioState(active))) {
      await probe(id, expected)
    }
    if (name === 'taro-vue') {
      await probe('scenario-props', scenarioState(active)['scenario-recipe']!)
    }
    if (name === 'taro-react' || name === 'uni-app') {
      await probe('scenario-props', {
        'font-size': name === 'taro-react' ? rpx(active ? 24 : 20) : rpx(active ? 32 : 28),
        'padding-top': rpx(active ? 16 : 8),
        ...(name === 'uni-app' ? { 'text-transform': active ? 'uppercase' : 'none' } : {}),
      })
    }
    if (name === 'uni-app') {
      await probe('scenario-props-tailwind', {
        'font-size': rpx(active ? 32 : 28),
        'padding-top': rpx(active ? 16 : 8),
        'text-transform': active ? 'uppercase' : 'none',
      })
    }
  }
  async function capture(file: string) {
    await settleViewport(runtime, request)
    const screenshot = await request(() => runtime.screenshot())
    assert(typeof screenshot === 'string', 'SDK screenshot must return PNG data')
    await fs.writeFile(file, screenshot, 'base64')
  }
  // All rem probes are authored against 32 rpx; framework pxtransform also
  // converts authored px in Taro. Expected values use the actual IDE viewport.
  await withCleanup(async () => {
    await state(false)
    for (const [id, color] of Object.entries(importColors)) {
      await probe(id, { color })
    }
    for (const fixture of preprocessorCases) {
      await probe(`preprocess-${fixture.language}`, {
        'color': fixture.color,
        'opacity': '0.75',
        'white-space': 'nowrap',
        'padding-left': rpx(32 * fixture.space),
        'margin-bottom': rpx(-32 * fixture.space),
        'letter-spacing': rpx(4),
      })
    }
    for (const [id, property, factor] of remLengths) {
      await probe(id, { [property]: rpx(32 * factor) })
    }
    for (const [id, px] of [['scenario-collision-a', 7], ['scenario-collision-b', 11]] as const) {
      await probe(id, { 'margin-right': name.startsWith('taro') ? rpx(px) : px })
    }
    const unicode = await probe('scenario-unicode', {})
    const marker = await probe('scenario-marker', {})
    assert.notEqual(unicode.classes, marker.classes, 'Unicode literal marker must not collide')
    const collisionA = await probe('scenario-collision-a', {})
    const collisionB = await probe('scenario-collision-b', {})
    assert.notEqual(collisionA.classes, collisionB.classes, 'Encoded dots must not collide with literal markers')
    const original = await probe('scenario-props', {})
    const originalStyle = {
      background: await request(() => original.element.style('background-color')),
      fontSize: await request(() => original.element.style('font-size')),
    }
    const variable = await probe('scenario-variable', {})
    const tailwind = name === 'uni-app' ? await probe('scenario-props-tailwind', {}) : undefined
    const tailwindBackground = tailwind ? await request(() => tailwind.element.style('background-color')) : undefined
    const panel = await node('scenario-panel')
    const dimensions = await request(() => panel.size())
    const expectedWidth = name === 'wevu' ? systemInfo.windowWidth - 2 * rpx(16) : systemInfo.windowWidth
    assert(Math.abs(Number.parseFloat(dimensions.width) - expectedWidth) < 0.15, `${name}: panel must fit the actual viewport and authored parent padding`)
    assert(Number.parseFloat(dimensions.height) > systemInfo.windowHeight, `${name}: scroll fixture must extend beyond the actual viewport`)
    const unitNode = await node('scenario-units')
    const unitDimensions = await request(() => unitNode.size())
    assert(Math.abs(Number.parseFloat(unitDimensions.width) - rpx(320)) < 0.15, `${name}: actual node width must match authored rem/rpx conversion`)
    records.push({ geometry: { panel: dimensions, units: unitDimensions, windowWidth: systemInfo.windowWidth, expectedWidth } })
    const beforeScroll = Number.parseFloat(String(await request(() => page.scrollTop())))
    await request(() => runtime.pageScrollTo(100))
    const afterScroll = Number.parseFloat(String(await request(() => page.scrollTop())))
    assert(afterScroll > beforeScroll, `${name}: actual page must scroll`)
    await request(() => runtime.pageScrollTo(0))
    records.push({ scroll: { beforeScroll, afterScroll } })
    const baseline = path.join(evidence, `${name}-${cycle}-neutral-before.png`)
    await capture(baseline)
    for (let toggle = 1; toggle <= 4; toggle++) {
      const active = toggle % 2 === 1
      await request(async () => (await node('scenario-toggle')).tap())
      currentToggle = toggle
      currentActive = active
      await state(active)
      const child = await probe('scenario-props', {})
      const text = (await request(() => child.element.text())).trim()
      const expectedText = name === 'uni-app' && active ? 'ACCENT' : active ? 'accent' : 'neutral'
      assert.equal(text, expectedText, `${name}: child props rendered text`)
      const background = await request(() => child.element.style('background-color'))
      if (active) {
        assert.notEqual(child.classes, original.classes, `${name}: changed props must change actual child classes`)
        assert.notEqual(background, originalStyle.background, `${name}: changed props must change actual child rendering`)
      }
      else {
        assert.equal(child.classes, original.classes, `${name}: child classes must return to neutral`)
        assert.equal(background, originalStyle.background, `${name}: child rendering must return to neutral`)
        assert.equal(await request(() => child.element.style('font-size')), originalStyle.fontSize)
      }
      assert.equal((await probe('scenario-variable', {})).classes, variable.classes, `${name}: CSS variable updates must preserve classes`)
      if (tailwind) {
        const current = await probe('scenario-props-tailwind', {})
        const background = await request(() => current.element.style('background-color'))
        assert.equal((await request(() => current.element.text())).trim(), expectedText)
        if (active) {
          assert.notEqual(current.classes, tailwind.classes, 'Tailwind dynamic props must update classes')
          assert.notEqual(background, tailwindBackground, 'Tailwind dynamic props must update actual styles')
        }
        else {
          assert.equal(current.classes, tailwind.classes, 'Tailwind classes must restore')
          assert.equal(background, tailwindBackground, 'Tailwind styles must restore')
        }
      }
    }
    const current = path.join(evidence, `${name}-${cycle}-neutral-after.png`)
    await capture(current)
    const compareDirectory = path.join(evidence, `${name}-${cycle}-pixels`)
    await fs.mkdir(compareDirectory, { recursive: true })
    await context.compare(baseline, current, compareDirectory)
  }, [() => fs.writeFile(path.join(evidence, `${name}-${cycle}-scenarios.json`), JSON.stringify(records, null, 2))])
}
