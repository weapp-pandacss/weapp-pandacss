import type { Plugin } from 'postcss'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import postcss from 'postcss'
import { composeUnitRules, unitPresets } from '@/index'
import plugin from '@/postcss'
import { useOptions } from '@/postcss/plugins'

const units = { rules: [{ from: 'rem', to: 'rpx', factor: 32 }] }
const pure = { imports: false, panda: false, adapter: false } as const

it('preserves every unit by default and makes conversion independent from the adapter and target', async () => {
  const input = '.a{margin:1rem -2rem 3px 4vw 5em}'
  for (const target of ['weapp', 'web'] as const) {
    expect((await postcss([plugin({ target })]).process(input, { from: undefined })).css).toContain(input)
    const converted = postcss([plugin({ ...pure, target, units })]).process(input, { from: undefined }).sync()
    expect(converted.root.toString()).toBe('.a{margin:32rpx -64rpx 3px 4vw 5em}')
  }
  expect((await postcss([plugin({ disabled: true, units })]).process(input, { from: undefined })).css).toBe(input)
  expect(postcss([plugin({ ...pure, units: false })]).process(input, { from: undefined }).sync().root.toString()).toBe(input)
})

it('composes presets with string, regex and callback rules without same-pass chaining', () => {
  const rules = composeUnitRules(
    [{ from: 'rem', to: 'rpx', factor: 32 }],
    { from: /^rpx$/g, to: 'px', factor: 0.5 },
    { from: unit => unit === 'em', transform: (value, context) => ({ value: value * -16, unit: context.fromUnit === 'em' ? 'px' : 'em' }) },
    unitPresets.vwToPx({ viewportWidth: 400 }),
  )
  const processor = postcss([plugin({ ...pure, units: { rules } })])
  const first = processor.process('.a{margin:-2em 1rem 10rpx 2vw}', { from: undefined }).sync().root.toString()
  expect(first).toBe('.a{margin:32px 32rpx 5px 8px}')
  expect(processor.process(first, { from: undefined }).sync().root.toString()).toBe('.a{margin:32px 16px 5px 8px}')
})

it.each(['ordered', 'legacy'] as const)('finishes the %s adapter before conversion and restores outer visitors', (mode) => {
  const visited: string[] = []
  const selectors: string[] = []
  const framework: Plugin = {
    postcssPlugin: 'framework-pxtransform',
    Rule(rule) { selectors.push(rule.selector) },
    Declaration(decl) {
      visited.push(decl.value)
      if (decl.value === '32rpx') {
        decl.value = '16px'
      }
    },
    OnceExit(root) { expect(root.toString()).not.toContain('@layer') },
  }
  const result = postcss([
    plugin({ imports: false, panda: false, cascadeLayers: { mode }, units }),
    framework,
  ]).process('@layer utilities{.a\\/b{width:1rem}}', { from: undefined }).sync()
  expect(visited).toContain('32rpx')
  expect(selectors.some(selector => selector.includes('.a_wp_2f_b'))).toBe(true)
  expect(result.root.toString()).toContain('width:16px')
})

it('leaves units in strings, URLs, identifiers and arbitrarily nested var() fallbacks unchanged', () => {
  const css = '.a{margin:1e3rem -1e-3rem 2REM 2remfoo foo2rem;content:"a\\\" 2rem";background:URL("2rem");width:calc(1rem + var(--size, min(2rem, max(3rem, 4rem))));height:var(--a,calc(1rem + min(2rem,3rem)))}'
  const result = postcss([plugin({ ...pure, units })]).process(css, { from: undefined }).sync().root.toString()
  expect(result).toContain('margin:32000rpx -0.032rpx 64rpx 2remfoo foo2rem')
  expect(result).toContain('content:"a\\\" 2rem"')
  expect(result).toContain('background:URL("2rem")')
  expect(result).toContain('calc(32rpx + var(--size, min(2rem, max(3rem, 4rem))))')
  expect(result).toContain('height:var(--a,calc(1rem + min(2rem,3rem)))')
})

it('preserves important fallback declarations and forwards filters, media rules and precision', () => {
  const result = postcss([plugin({ ...pure, units: {
    ...units,
    replace: false,
    mediaQuery: true,
    minValue: 0.01,
    unitPrecision: 2,
    propList: ['*', '!border*'],
    selectorBlackList: ['.skip'],
  } })]).process('@media(min-width:1rem){.a{width:32rpx;width:1rem!important;margin:-.3333rem;border-width:1rem}.skip{width:1rem}}', { from: undefined }).sync().root.toString()
  expect(result).toContain('@media(min-width:32rpx)')
  expect(result).toContain('width:1rem!important;width:32rpx!important')
  expect(result).toContain('margin:-.3333rem;margin:-10.67rpx')
  expect(result).toContain('border-width:1rem')
  expect(result).toContain('.skip{width:1rem}')
})

it('converts already portable CSS on each pass without treating its class marker as a units marker', async () => {
  const processor = postcss([plugin({ imports: false, panda: false, target: 'web', units: { rules: [{ from: 'rem', to: 'rem', factor: 2 }] } })])
  const first = await processor.process('.a\\/b{margin:1rem}', { from: undefined })
  const second = await processor.process(first.root, { from: undefined })
  expect(first.css).toContain('.a_wp_2f_b{margin:2rem}')
  expect(second.css).toContain('.a_wp_2f_b{margin:4rem}')
  expect(second.css).not.toContain('a_wp_5f_wp')
})

it('keeps opaque unit rules, regexes and callbacks intact across option merges', () => {
  const matcher = /rem/g
  const transform = vi.fn((value: number) => value * 32)
  const options = { rules: [{ from: matcher, to: 'rpx', transform }] }
  const { optionsRef, mergeOptions } = useOptions({ units: options })
  expect(optionsRef.value.units).toBe(options)
  mergeOptions({ target: 'web' })
  expect(optionsRef.value.units).toBe(options)
  expect(options.rules[0]!.from).toBe(matcher)
  expect(options.rules[0]!.transform).toBe(transform)
  mergeOptions({ units: false })
  expect(optionsRef.value.units).toBe(false)
})

it('rejects external stages after converter-only mode before their hooks change the AST', () => {
  const convert = plugin({ ...pure, units })
  for (const postcssPlugin of ['pandacss', 'postcss-import']) {
    const Once = vi.fn()
    expect(() => postcss([convert, { postcssPlugin, Once }]).process('.a{width:1rem}', { from: undefined })).toThrow(/before/)
    expect(Once).not.toHaveBeenCalled()
  }
})

it('reuses a processor across imports and watch updates, preserving source maps and entry exclusion', async () => {
  const fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'panda-units-')))
  try {
    const entry = path.join(fixture, 'entry.css')
    const dependency = path.join(fixture, 'dependency.css')
    const input = '@import "./dependency.css";'
    await fs.writeFile(dependency, '.a\\/中文{margin:1rem}')
    const contexts: string[] = []
    const processor = postcss([plugin({ panda: false, units: {
      rules: [{ from: 'rem', to: 'rpx', transform(value, context) {
        contexts.push(context.decl!.source!.input.file!)
        expect(context.filePath).toBe(entry)
        return value * 32
      } }],
    } })])
    const compile = () => processor.process(input, { from: entry, to: path.join(fixture, 'out.wxss'), map: { inline: false } })
    const first = await compile()
    expect(first.css).toContain('margin:32rpx')
    expect(first.map!.toJSON().sourcesContent).toContain('.a\\/中文{margin:1rem}')
    expect(first.messages).toContainEqual(expect.objectContaining({ type: 'dependency', file: dependency }))
    await fs.writeFile(dependency, '.a\\/中文{margin:2rem}')
    expect((await compile()).css).toContain('margin:64rpx')
    expect(contexts).toEqual([dependency, dependency])
    const excluded = await postcss([plugin({ panda: false, units: { ...units, exclude: file => file === entry } })]).process(input, { from: entry })
    expect(excluded.css).toContain('margin:2rem')
  }
  finally { await fs.rm(fixture, { recursive: true, force: true }) }
})
