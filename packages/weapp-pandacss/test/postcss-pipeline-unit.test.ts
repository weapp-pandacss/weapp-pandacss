import type { Plugin } from 'postcss'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import postcss from 'postcss'
import plugin from '@/postcss'
import { resolveInputFile, resolvePandaOptions } from '@/postcss/pipeline'
import { useOptions } from '@/postcss/plugins'

const mocks = vi.hoisted(() => ({ findConfig: vi.fn(), panda: vi.fn() }))
vi.mock('@pandacss/dev/node', () => ({ findConfig: mocks.findConfig }))
vi.mock('@pandacss/dev/postcss', () => ({ default: mocks.panda }))

let fixture: string
const notFound = Object.assign(new Error('no config'), { code: 'ERR_PANDA_CONFIG_NOT_FOUND' })

beforeEach(async () => {
  fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'panda-stage-unit-')))
  mocks.findConfig.mockReset().mockImplementation(() => {
    throw notFound
  })
  mocks.panda.mockReset().mockImplementation(() => ({ postcssPlugin: 'pandacss' }))
})

afterEach(async () => {
  await fs.rm(fixture, { recursive: true, force: true })
})

it('normalizes physical source paths and rejects virtual, remote and malformed URL inputs', () => {
  const file = path.join(fixture, 'entry.css')
  expect(resolveInputFile(`${file}?vue&type=style#fragment`)).toBe(file)
  expect(resolveInputFile(`${pathToFileURL(file).href}?direct#fragment`)).toBe(file)
  expect(resolveInputFile('relative.css')).toBe(path.resolve('relative.css'))
  for (const value of [undefined, '', '\0virtual:app.css', 'virtual:app.css', '/@id/panda.css', '/src/__x00__panda.css', '<input css x>', 'https://example.com/a.css', 'data:text/css,', 'file://%']) {
    expect(resolveInputFile(value)).toBeUndefined()
  }
})

it('discovers the nearest config, falls back to cwd, and retains explicit option semantics', async () => {
  const near = path.join(fixture, 'packages/app/panda.config.ts')
  mocks.findConfig.mockReturnValueOnce(near)
  expect(await resolvePandaOptions({ outdir: 'generated', allow: [/vendor/] }, path.join(fixture, 'packages/app/src/app.css')))
    .toEqual({ configPath: near, cwd: path.dirname(near), outdir: 'generated', allow: [/vendor/] })
  const fallback = path.join(fixture, 'panda.config.ts')
  mocks.findConfig.mockImplementationOnce(() => {
    throw notFound
  }).mockReturnValueOnce(fallback)
  expect(await resolvePandaOptions({}, '/elsewhere/app.css')).toEqual({ configPath: fallback, cwd: fixture })
  expect(mocks.findConfig).toHaveBeenLastCalledWith({ cwd: process.cwd() })
  const count = mocks.findConfig.mock.calls.length
  expect(await resolvePandaOptions({ configPath: 'custom.ts' }, '/elsewhere/app.css')).toEqual({ configPath: 'custom.ts', cwd: process.cwd() })
  expect(await resolvePandaOptions({ cwd: './project' }, '/elsewhere/app.css')).toEqual({ cwd: path.resolve('project') })
  expect(mocks.findConfig).toHaveBeenCalledTimes(count)
})

it('propagates discovery failures and retries every absent inferred config', async () => {
  const failure = Object.assign(new Error('discovery failed'), { code: 'EACCES' })
  mocks.findConfig.mockImplementationOnce(() => {
    throw failure
  })
  await expect(resolvePandaOptions({}, '/other/app.css')).rejects.toBe(failure)
  expect(await resolvePandaOptions({}, '/other/app.css')).toBeUndefined()
  expect(await resolvePandaOptions({}, '/other/app.css')).toBeUndefined()
  expect(mocks.findConfig).toHaveBeenCalledTimes(5)
})

it('forwards all stage messages even when official Panda fails during its lifecycle', async () => {
  const configPath = path.join(fixture, 'panda.config.ts')
  mocks.findConfig.mockReturnValue(configPath)
  mocks.panda.mockImplementation((): Plugin => ({
    postcssPlugin: 'pandacss',
    Once(root, { result }) {
      result.warn('Panda warning', { plugin: 'pandacss' })
      result.messages.push({ type: 'pandacss-diagnostic', plugin: 'pandacss', diagnostic: { severity: 'info', message: 'retained' } })
      throw root.error('Panda generation failed', { plugin: 'pandacss' })
    },
  }))
  let outerResult: postcss.Result | undefined
  const capture: Plugin = {
    postcssPlugin: 'capture',
    prepare(result) {
      outerResult = result
      return {}
    },
  }
  await expect(postcss([capture, plugin()]).process('@layer base;', { from: path.join(fixture, 'app.css') }))
    .rejects
    .toThrow('Panda generation failed')
  expect(outerResult!.messages).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'warning', text: 'Panda warning', plugin: 'pandacss' }),
    expect.objectContaining({ type: 'pandacss-diagnostic', diagnostic: { severity: 'info', message: 'retained' } }),
  ]))
})

it('runs generation for layers introduced by imports and ignores stale opts.css', async () => {
  await fs.writeFile(path.join(fixture, 'layers.css'), '@layer base;')
  mocks.findConfig.mockReturnValue(path.join(fixture, 'panda.config.ts'))
  mocks.panda.mockImplementation((): Plugin => ({
    postcssPlugin: 'pandacss',
    Once(root) {
      root.append('.generated{color:red}')
    },
  }))
  const options = { from: path.join(fixture, 'app.css'), css: '.stale{color:blue}' }
  const result = await postcss([plugin()]).process('@import "./layers.css";', options)
  expect(result.css).toContain('.generated')
  expect(mocks.panda).toHaveBeenCalledOnce()
})

it('keeps framework preprocessor entries and layer-free CSS out of Panda generation', async () => {
  await postcss([plugin()]).process('@layer base { .x {color:red} }', { from: path.join(fixture, 'app.scss') })
  await postcss([plugin({ imports: false })]).process('.x {color:red}', { from: path.join(fixture, 'app.css') })
  expect(mocks.findConfig).not.toHaveBeenCalled()
  expect(mocks.panda).not.toHaveBeenCalled()
})

it('rejects external Panda/import ordering but permits external stages when no later transformation runs', async () => {
  const panda: Plugin = { postcssPlugin: 'pandacss' }
  const importer: Plugin = { postcssPlugin: 'postcss-import' }
  expect(() => postcss([plugin({ panda: false }), panda]).process('.x{}', { from: undefined }))
    .toThrow(/must run before/)
  const inert = plugin({ imports: false, panda: false, adapter: false })
  const legacyFunction = () => undefined
  expect((await postcss([legacyFunction, inert, panda, importer]).process('.x{}', { from: undefined })).css).toBe('.x{}')
  expect((await postcss([importer, plugin({ panda: false })]).process('.x{}', { from: undefined })).css).toContain('.x')
})

it('reads CSS data URL imports in plain and base64 encodings without physical context', async () => {
  for (const uri of ['data:text/css,.a%7Bcolor%3Ared%7D', 'data:text/css;plain,.a%7Bcolor%3Ared%7D', 'data:text/css;base64,LmF7Y29sb3I6cmVkfQ==']) {
    const result = await postcss([plugin()]).process(`@import "${uri}";`, { from: undefined })
    expect(result.css).toContain('.a{color:red}')
  }
})

it('handles import URL syntax, filtered imports, absolute files and incomplete import syntax', async () => {
  await fs.writeFile(path.join(fixture, 'leaf.css'), '.a{color:red}')
  const importer = plugin({ imports: { root: fixture } })
  for (const params of ['url("./leaf.css")', 'url(./leaf.css)', '"./leaf.css"']) {
    expect((await postcss([importer]).process(`@import ${params};`, { from: undefined })).css).toContain('.a')
  }
  for (const params of ['url("./leaf.css")', 'url(./leaf.css)']) {
    await expect(postcss([plugin()]).process(`@import ${params};`, { from: undefined })).rejects.toThrow(/physical process/)
  }
  const filtered = await postcss([plugin({ target: 'web', imports: { filter: () => false } })])
    .process('@import "./ignored.css"; @import url("https://example.invalid/a.css"); @import url("//example.invalid/b.css"); @import;', { from: undefined })
  expect(filtered.css).toContain('./ignored.css')
  expect(filtered.warnings().length).toBeGreaterThan(0)
  const absolute = await postcss([plugin()]).process(`@import "${path.join(fixture, 'leaf.css')}";`, { from: undefined })
  expect(absolute.css).toContain('.a')
})

it('calls importer filters once and leaves remote URL decisions to the native importer', async () => {
  const filter = vi.fn(() => false)
  await postcss([plugin({ target: 'web', imports: { filter } })])
    .process('@import "./ignored.css"; @import "https://example.invalid/remote.css";', { from: undefined })
  expect(filter).toHaveBeenCalledExactlyOnceWith('./ignored.css')
  await expect(postcss([plugin()]).process('@import "data:text/css,%40import%20%22.%2Fmissing.css%22%3B";', { from: undefined }))
    .rejects
    .toThrow(/physical process/)
})

it('encodes raw entry/import rules while preserving already portable imported rules', async () => {
  await fs.writeFile(path.join(fixture, 'portable.css'), '/*! weapp-pandacss:portable-v1 */\n.pre_wp_2f_encoded{color:red}')
  await fs.writeFile(path.join(fixture, 'raw.css'), '.raw\\/import{color:blue}')
  const css = '@import "./portable.css"; @import "./raw.css"; .entry\\/raw{color:black}'
  const options = { from: path.join(fixture, 'app.css') }
  const processor = postcss([plugin({ target: 'web' })])
  const first = await processor.process(css, options)
  expect(first.css).toContain('.pre_wp_2f_encoded')
  expect(first.css).not.toContain('pre_wp_5f_wp')
  expect(first.css).toContain('.raw_wp_2f_import')
  expect(first.css).toContain('.entry_wp_2f_raw')
  const second = await processor.process(first.root, options)
  expect(second.css).toBe(first.css)
})

it('keeps pure adaptation synchronous and encodes programmatically created rules without source metadata', () => {
  const root = postcss.root().append(postcss.rule({ selector: '.raw\\/ast' }).append({ prop: 'color', value: 'red' }))
  const processor = postcss([plugin({ imports: false, panda: false })])
  const result = processor.process(root, { from: undefined }).sync()
  expect(result.root.toString()).toContain('.raw_wp_2f_ast')
  const repeated = processor.process(result.root, { from: undefined }).sync()
  expect(repeated.root.toString()).toBe(result.root.toString())
})

it('does not trust marker text in CSS strings, nested comments or unrelated comments', async () => {
  for (const suffix of [
    'content: "! weapp-pandacss:portable-v1";',
    '/* ! weapp-pandacss:portable-v1 */ color:red;',
    'color:red; } /* ! weapp-pandacss:portable-v1 documentation */ .second { color:blue;',
  ]) {
    const result = await postcss([plugin({ panda: false })]).process(`.a\\/b { ${suffix} }`, { from: undefined })
    expect(result.css).toContain('.a_wp_2f_b')
  }
})

it('preserves upstream option bags, regexes and callbacks across adapter option merges', () => {
  const pluginState: { self?: unknown } = {}
  pluginState.self = pluginState
  const imports = { filter: vi.fn(() => true), plugins: [{ postcssPlugin: 'custom', state: pluginState }] }
  const panda = { allow: [/vendor/], cwd: fixture }
  const { optionsRef, mergeOptions } = useOptions({ imports, panda })
  expect(optionsRef.value.imports).toBe(imports)
  expect(optionsRef.value.panda).toBe(panda)
  expect(imports.plugins[0]!.state.self).toBe(pluginState)
  mergeOptions({ selectorReplacement: { root: 'body' } })
  mergeOptions()
  expect(optionsRef.value.imports).toBe(imports)
  expect(optionsRef.value.panda).toBe(panda)
  expect(panda.allow[0]!.test('vendor')).toBe(true)
  mergeOptions({ imports: false, panda: false })
  expect(optionsRef.value.imports).toBe(false)
  expect(optionsRef.value.panda).toBe(false)
})

it('rejects built-in import expansion after external Panda while allowing an earlier external importer', async () => {
  const panda: Plugin = { postcssPlugin: 'pandacss', Once: vi.fn() }
  const importer: Plugin = { postcssPlugin: 'postcss-import' }
  const css = '@import "./panda.css";'
  expect(() => postcss([panda, plugin({ panda: false })]).process(css, { from: path.join(fixture, 'app.css') }))
    .toThrow(/imports must be expanded before the external Panda/)
  expect(panda.Once).not.toHaveBeenCalled()
  const inert = plugin({ imports: false, panda: false, adapter: false })
  expect((await postcss([panda, inert]).process(css, { from: undefined })).css).toBe(css)
  const externalOnly = plugin({ imports: false, panda: false, adapter: false })
  expect((await postcss([() => undefined, importer, panda, externalOnly]).process(css, { from: undefined })).css).toBe(css)
})

it('allows an importer-only combined stage before external Panda and rejects the reversed order', async () => {
  await fs.writeFile(path.join(fixture, 'panda.css'), '@layer utilities { .imported\\/raw { color:red } }')
  const generate = vi.fn()
  const panda: Plugin = {
    postcssPlugin: 'pandacss',
    Once(root) {
      generate(root.toString())
    },
  }
  const css = '@import "./panda.css";'
  const options = { from: path.join(fixture, 'app.css') }
  const importsOnly = plugin({ panda: false, adapter: false })
  const result = await postcss([importsOnly, panda]).process(css, options)
  expect(result.css).toContain('@layer utilities')
  expect(result.css).toContain('.imported\\/raw')
  expect(generate).toHaveBeenCalledExactlyOnceWith(result.css)
  expect(() => postcss([panda, importsOnly]).process(css, options))
    .toThrow(/imports must be expanded before the external Panda/)
  expect(generate).toHaveBeenCalledTimes(1)
})

it('preserves source-map annotations across the child traversal before final map generation', async () => {
  const root = postcss.parse('.a{color:red}\n/*# sourceMappingURL=prior.css.map */', { from: path.join(fixture, 'app.css') })
  const result = await postcss([plugin()]).process(root, { from: root.source!.input.file, map: { annotation: false } })
  expect(result.root.toString()).toContain('sourceMappingURL=prior.css.map')
})
