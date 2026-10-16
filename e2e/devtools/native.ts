import type automator from 'miniprogram-automator'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { chromium } from '@playwright/test'
import { createNativeConsumerProject } from '../../packages/weapp-pandacss/test/native-consumer.ts'
import { packPackages } from '../../packages/weapp-pandacss/test/packed-consumer.ts'
import { find } from './frameworks.ts'
import { withCleanup } from './lifecycle.ts'
import { retainNativeFixture } from './native-fixture.ts'
import { withTemporaryProject } from './project.ts'
import { expectedRpx } from './rpx.ts'
import { compareAppViewport, settleViewport } from './viewport.ts'

type MiniProgram = Awaited<ReturnType<typeof automator.connect>>
type Page = NonNullable<Awaited<ReturnType<MiniProgram['reLaunch']>>>
type Element = NonNullable<Awaited<ReturnType<Page['$']>>>

export async function runNative(context: {
  appid: string
  libVersion: string
  cliPath: string
  wvCli: string
  evidence: string
  signal: AbortSignal
}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-panda-native-consumer-'))
  const evidence = path.join(context.evidence, 'native')
  await fs.mkdir(evidence, { recursive: true })
  const observed: unknown[] = []
  await withCleanup(async () => {
    const packages = await packPackages(root)
    const fixture = await createNativeConsumerProject({ root: path.join(root, 'consumer'), packages, panda: '2.2.0', node: process.execPath, appid: context.appid, libVersion: context.libVersion })
    const consumerEvidence = path.join(evidence, 'installed-consumer')
    await fs.mkdir(consumerEvidence)
    for (const file of ['install.log', 'resolution.json', 'commands.json', 'scenario.json', 'pnpm-lock.yaml', 'output.wxss', 'output.wxss.map']) {
      await fs.copyFile(path.join(fixture.root, file), path.join(consumerEvidence, file))
    }
    await retainNativeFixture({ root: fixture.root, packages, evidence: consumerEvidence })
    const browser = await chromium.launch({ headless: true })
    const colors = new Map<string, string>()
    await withCleanup(async () => {
      const page = await browser.newPage()
      for (const states of Object.values(fixture.expectations)) {
        for (const values of Object.values(states)) {
          for (const value of ['color' in values ? values.color : undefined, 'backgroundColor' in values ? values.backgroundColor : undefined].filter((value): value is string => typeof value === 'string')) {
            if (colors.has(value)) {
              continue
            }
            const color = await page.evaluate((value) => {
              const element = document.createElement('div')
              element.style.color = value
              document.body.append(element)
              const actual = getComputedStyle(element).color
              element.remove()
              return actual
            }, value)
            colors.set(value, color)
          }
        }
      }
    }, [() => browser.close()])
    await withTemporaryProject({ ...context, name: 'native', sourceDist: path.join(consumerEvidence, 'miniprogram'), evidence }, async ({ runtime, request, project, systemInfo }) => {
      const css = await fs.readFile(path.join(project, 'dist/app.wxss'), 'utf8')
      const selectors = new Set([...css.matchAll(/\.([\w-]+)/g)].map(match => match[1]!))
      const rpx = (value: number) => expectedRpx(value, systemInfo)
      for (let cycle = 0; cycle < 2; cycle++) {
        const page: Page | undefined = await request(() => runtime.reLaunch(fixture.pagePath))
        assert(page)
        let activeState = false
        const expectedClasses = (selector: string): string => {
          const classes = fixture.scenario.classes
          const map: Record<string, string> = {
            '#atomic': classes.atomic,
            '#token': classes.fromToken,
            '#layer-normal': classes.layerNormal,
            '#layer-important': classes.layerImportant,
            '#collision-dot': classes.collisionDot,
            '#collision-literal': classes.collisionLiteral,
            '#runtime-color': classes.dynamic,
            '#recipe': activeState ? classes.accent : classes.neutral,
            '#inline-recipe': activeState ? classes.inlineAccent : classes.inlineDefault,
            '#slot-root': (activeState ? classes.slotsAccent : classes.slotsNeutral).root,
            '#slot-label': (activeState ? classes.slotsAccent : classes.slotsNeutral).label,
            '#inline-slot-root': (activeState ? classes.inlineSlotsAccent : classes.inlineSlotsNeutral).root,
            '#inline-slot-label': (activeState ? classes.inlineSlotsAccent : classes.inlineSlotsNeutral).label,
            '#unit-layout': classes.layoutParent,
            '#negative-unit': classes.negativeUnit,
            '#calc-unit': classes.calcUnit,
          }
          assert(map[selector], `Native fixture is missing its expected class contract: ${selector}`)
          return map[selector]!
        }
        async function probe(selector: string, expected: Record<string, string | number>) {
          const element: Element | null = await request(() => page!.$(selector))
          assert(element, `Native fixture: missing ${selector}`)
          const classes = (await request(() => element.attribute('class'))).split(/\s+/)
          for (const name of expectedClasses(selector).split(/\s+/)) {
            assert(classes.includes(name), `Native fixture: ${selector} must render installed helper class ${name}`)
            if (!fixture.scenario.slotMarkers.includes(name)) {
              assert(selectors.has(name), `Native fixture: ${selector} must match installed package WXSS ${name}`)
            }
          }
          const actual: Record<string, string> = {}
          for (const [property, value] of Object.entries(expected)) {
            actual[property] = await request(() => element.style(property))
            if (typeof value === 'number') {
              assert(Math.abs(Number.parseFloat(actual[property]!) - value) < 0.15, `Native ${selector}.${property}: expected ${value}px; got ${actual[property]}`)
            }
            else { assert.equal(actual[property], value, `Native ${selector}.${property}`) }
          }
          observed.push({ cycle, selector, classes, expected, actual })
          return classes.join(' ')
        }
        for (const [selector, values] of Object.entries(fixture.expectations.fixed)) {
          const expected: Record<string, string | number> = {}
          if ('color' in values) {
            expected.color = colors.get(values.color)!
          }
          if ('paddingRpx' in values) {
            expected['padding-top'] = rpx(values.paddingRpx)
          }
          if ('fontSizeRpx' in values) {
            expected['font-size'] = rpx(values.fontSizeRpx)
          }
          if ('widthRpx' in values) {
            expected.width = rpx(values.widthRpx)
          }
          await probe(selector, expected)
        }
        for (const component of fixture.components) {
          const host: Element | null = await request((): Promise<Element | null> => page.$(component.tag))
          assert(host, `Native fixture: ${component.isolation} component must register`)
          const element = await find(host, component.selector, [], request)
          assert(element, `Native fixture: ${component.isolation} component must render`)
          const classes = await request(() => element.attribute('class'))
          const renderedClasses = classes.split(/\s+/).map(name => name.replace(/^[\w-]+--/, ''))
          for (const name of component.className.split(/\s+/)) {
            assert(renderedClasses.includes(name), `Native ${component.isolation}: component must render installed helper class ${name}`)
            assert(selectors.has(name), `Native ${component.isolation}: helper class must exist in installed package WXSS`)
          }
          const color = await request(() => element.style('color'))
          const rgb = component.color === '#000000' ? 'rgb(0, 0, 0)' : 'rgb(36, 99, 235)'
          assert.equal(color, rgb, `Native ${component.isolation} must enforce the documented component styling boundary`)
          observed.push({ cycle, component, classes, color })
        }
        const parent: Element | null = await request((): Promise<Element | null> => page.$(fixture.layout.parent))
        assert(parent)
        await probe(fixture.layout.parent, {})
        const parentSize = await request(() => parent.size())
        const parentOffset = await request(() => parent.offset())
        assert(Math.abs(Number.parseFloat(parentSize.width) - rpx(fixture.layout.parentWidthRpx)) < 0.15, 'Native parent must measure its installed rpx width')
        assert(Math.abs(Number.parseFloat(parentSize.height) - rpx(fixture.layout.parentHeightRpx)) < 0.15, 'Native parent must measure its installed rpx height')
        for (const [selector, expected] of Object.entries(fixture.layout.children)) {
          await probe(selector, {})
          const element: Element | null = await request((): Promise<Element | null> => page.$(selector))
          assert(element)
          const size = await request(() => element.size())
          const offset = await request(() => element.offset())
          const actual = {
            left: Number(offset.left) - Number(parentOffset.left),
            top: Number(offset.top) - Number(parentOffset.top),
            width: Number.parseFloat(size.width),
            height: Number.parseFloat(size.height),
          }
          const dimensions = {
            left: rpx(expected.leftRpx),
            top: rpx(expected.topRpx),
            width: 'widthInsetRpx' in expected ? Number.parseFloat(parentSize.width) - rpx(Number(expected.widthInsetRpx)) : rpx(expected.widthRpx),
            height: rpx(expected.heightRpx),
          }
          for (const key of ['left', 'top', 'width', 'height'] as const) {
            assert(Math.abs(actual[key] - dimensions[key]) < 0.15, `Native ${selector}: actual ${key} must match negative/calc/rpx layout; expected ${dimensions[key]}, got ${actual[key]}`)
          }
          observed.push({ cycle, selector, geometry: { parentSize, parentOffset, offset, size, expected: dimensions, actual } })
        }
        const baseline = path.join(evidence, `neutral-before-${cycle}.png`)
        let original: string | undefined
        for (let toggle = 0; toggle <= 4; toggle++) {
          const active = toggle % 2 === 1
          activeState = active
          const mode: string = await request((): Promise<string> => page!.data('mode'))
          assert.equal(mode, active ? 'accent' : 'neutral')
          assert.equal(await request((): Promise<string> => page.data('runtimeStyle')), fixture.scenario.runtimeStyle[active ? 'accent' : 'neutral'])
          const variable: Element | null = await request((): Promise<Element | null> => page.$('#runtime-color'))
          assert(variable)
          assert.match(await request(() => variable.attribute('style')), /--runtime-color\s*:/, 'Native dynamic color must use its CSS variable')
          for (const [selector, values] of Object.entries(fixture.expectations[active ? 'accent' : 'neutral'])) {
            const expected: Record<string, string | number> = {}
            if ('color' in values) {
              expected.color = colors.get(values.color)!
            }
            if ('backgroundColor' in values) {
              expected['background-color'] = colors.get(values.backgroundColor)!
            }
            if ('fontWeight' in values) {
              expected['font-weight'] = values.fontWeight
            }
            if ('paddingRpx' in values) {
              expected['padding-top'] = rpx(values.paddingRpx)
            }
            await probe(selector, expected)
          }
          const classes = await probe('#inline-recipe', {})
          await probe('#slot-root', {})
          if (toggle === 0) {
            original = classes
          }
          else if (active) {
            assert.notEqual(classes, original)
          }
          else { assert.equal(classes, original) }
          if (toggle === 0 || toggle === 4) {
            await settleViewport(runtime, request)
            const screenshot = await request(() => runtime.screenshot())
            assert(typeof screenshot === 'string')
            const file = toggle === 0 ? baseline : path.join(evidence, `neutral-after-${cycle}.png`)
            await fs.writeFile(file, screenshot, 'base64')
            if (toggle === 4) {
              const comparison = path.join(evidence, `pixels-${cycle}`)
              await fs.mkdir(comparison, { recursive: true })
              await compareAppViewport(baseline, file, systemInfo.screenTop, systemInfo.screenWidth, comparison)
            }
          }
          if (toggle < 4) {
            const button: Element | null = await request((): Promise<Element | null> => page!.$('#toggle'))
            assert(button)
            await request(() => button.tap())
          }
        }
        const beforeScroll = Number(await request(() => page.scrollTop()))
        await request(() => runtime.pageScrollTo(100))
        const afterScroll = Number(await request(() => page.scrollTop()))
        assert(afterScroll > beforeScroll, 'Native installed consumer must actually scroll')
        await request(() => runtime.pageScrollTo(0))
        observed.push({ cycle, scroll: { beforeScroll, afterScroll } })
      }
    })
  }, [
    () => fs.writeFile(path.join(evidence, 'probes.json'), JSON.stringify(observed, null, 2)),
    () => fs.rm(root, { recursive: true, force: true }),
  ])
}
