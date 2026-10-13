import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import officialPanda from '@pandacss/dev/postcss'
import postcss from 'postcss'
import postcssImport from 'postcss-import'
import plugin from '@/postcss'
import { encodeClassName } from '@/runtime'

const layers = '@layer reset,base,tokens,recipes,utilities;'
const pandaPlugin = pathToFileURL(path.resolve(import.meta.dirname, '../dist/panda.js')).href
const run = promisify(execFile)
let fixture: string

beforeEach(async () => {
  fixture = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'panda-pipeline-')))
})

afterEach(async () => {
  await fs.rm(fixture, { recursive: true, force: true })
})

async function write(file: string, content: string) {
  const destination = path.join(fixture, file)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.writeFile(destination, content)
  return destination
}

async function project(directory = 'app', color = '#0f766e') {
  const devDependencies: Record<string, string> = {}
  // Panda 2.2 bundles local config imports into node_modules/.panda. Give
  // that real consumer the required dev peer as well as its explicit presets.
  for (const name of ['@pandacss/dev', '@pandacss/preset-base', '@pandacss/preset-panda']) {
    const destination = path.join(fixture, directory, 'node_modules', name)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.symlink(await fs.realpath(path.resolve(import.meta.dirname, '../node_modules', name)), destination, process.platform === 'win32' ? 'junction' : 'dir')
    devDependencies[name] = JSON.parse(await fs.readFile(path.join(destination, 'package.json'), 'utf8')).version
  }
  await write(`${directory}/package.json`, JSON.stringify({ private: true, type: 'module', devDependencies }))
  const config = await write(`${directory}/panda.config.mjs`, `
    import { weappPanda } from ${JSON.stringify(pandaPlugin)};
    export default {
      preflight: false, polyfill: false, outExtension: 'mjs',
      presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
      include: ['./src/**/*.ts'], outdir: 'styled-system',
      plugins: [weappPanda()], theme: { tokens: { colors: { accent: { value: '${color}' } } } }
    };
  `)
  const source = await write(`${directory}/src/component.ts`, `import { css } from '../styled-system/css'; css({ color: '${color}', marginLeft: '13px' });`)
  await write(`${directory}/src/authored.css`, '@layer base { .authored\\/中文 { color: tomato; } }')
  const entry = await write(`${directory}/src/app.css`, `${layers}\n@import './authored.css';`)
  return { config, source, entry, cwd: path.dirname(config) }
}

async function processFile(from: string, options: Parameters<typeof plugin>[0] = {}) {
  return postcss([plugin(options)]).process(await fs.readFile(from, 'utf8'), {
    from,
    to: path.join(fixture, 'output.wxss'),
    map: { inline: false },
  })
}

it('runs the zero-option import → real Panda → adapter pipeline with complete dependencies and maps', async () => {
  const app = await project()
  const result = await processFile(app.entry)
  expect(result.css).toContain('.c__wp_23_0f766e')
  expect(result.css).toContain(`.${encodeClassName('authored/中文')}`)
  expect(result.css).toContain('margin-left: 13px')
  expect(result.css).not.toMatch(/@layer|@import|:not\(n\)/)
  const messages = result.messages
  expect(messages).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: 'dependency', file: app.config, plugin: 'pandacss' }),
    expect.objectContaining({ type: 'dependency', file: path.join(app.cwd, 'src/authored.css'), plugin: 'postcss-import' }),
    expect.objectContaining({ type: 'dir-dependency', plugin: 'pandacss' }),
  ]))
  expect(result.map!.toJSON().sourcesContent).toContain('@layer base { .authored\\/中文 { color: tomato; } }')
  const generated = await import(pathToFileURL(path.join(app.cwd, 'styled-system/css/index.mjs')).href)
  expect(generated.css({ color: '#0f766e' })).toBe('c__wp_23_0f766e')
})

it('keeps native Web layers while encoding imported and generated classes', async () => {
  const app = await project()
  const result = await processFile(app.entry, { target: 'web' })
  expect(result.css).toContain('@layer utilities')
  expect(result.css).toContain('.c__wp_23_0f766e')
  expect(result.css).toContain(`.${encodeClassName('authored/中文')}`)
  expect(result.css).not.toContain('@import')
})

it('allows each stage to be disabled and preserves the whole input when disabled', async () => {
  const app = await project()
  const generatedOnly = await processFile(app.entry, { adapter: false })
  expect(generatedOnly.css).toContain('@layer utilities')
  expect(generatedOnly.css).toContain('.c_\\#0f766e')
  expect(generatedOnly.css).toContain('.authored\\/中文')
  expect(generatedOnly.css).not.toContain('weapp-pandacss:portable')
  const cssOnly = await processFile(app.entry, { panda: false })
  expect(cssOnly.css).toContain(encodeClassName('authored/中文'))
  expect(cssOnly.css).not.toContain('c__wp_23_0f766e')
  const pureAdapter = await postcss([plugin({ imports: false, panda: false })]).process('.a\\/b { color:red }', { from: app.entry })
  expect(pureAdapter.css).toContain('.a_wp_2f_b')
  const untouched = await processFile(app.entry, { disabled: true, panda: { configPath: '/missing/panda.config.ts' } })
  expect(untouched.css).toContain(await fs.readFile(app.entry, 'utf8'))
  expect(untouched.messages).toEqual([])
  const allOff = await processFile(app.entry, { imports: false, panda: false, adapter: false })
  expect(allOff.css).toContain(await fs.readFile(app.entry, 'utf8'))
})

it('reuses one processor across projects without leaking config, extraction or output directories', async () => {
  const one = await project('packages/one', '#0f766e')
  const two = await project('packages/two', '#ff00ff')
  const processor = postcss([plugin()])
  const compile = async (from: string) => processor.process(await fs.readFile(from, 'utf8'), { from })
  const first = await compile(one.entry)
  const second = await compile(two.entry)
  expect(first.css).toContain('.c__wp_23_0f766e')
  expect(second.css).toContain('.c__wp_23_ff00ff')
  expect(second.css).not.toContain('.c__wp_23_0f766e')
  await fs.access(path.join(one.cwd, 'styled-system/css/index.mjs'))
  await fs.access(path.join(two.cwd, 'styled-system/css/index.mjs'))
  await expect(fs.access(path.join(fixture, 'styled-system'))).rejects.toThrow()
})

it('honors explicit cwd/configPath and outdir over the nearest source config', async () => {
  const one = await project('one')
  const two = await project('two', '#ff00ff')
  const result = await processFile(one.entry, { panda: { cwd: two.cwd, configPath: 'panda.config.mjs', outdir: 'custom-system' } })
  expect(result.css).toContain('.c__wp_23_ff00ff')
  expect(result.css).not.toContain('.c__wp_23_0f766e')
  await fs.access(path.join(two.cwd, 'custom-system/css/index.mjs'))
  await expect(processFile(one.entry, { panda: { cwd: two.cwd, configPath: 'missing.config.mjs' } })).rejects.toThrow()
})

it('does not cache a missing config and sees new configs and changed extraction sources on watch', async () => {
  const entry = await write('late/src/app.css', layers)
  const processor = postcss([plugin()])
  const compile = async () => processor.process(layers, { from: entry })
  expect((await compile()).css).not.toContain('.c__wp_23_0f766e')
  const app = await project('late')
  expect((await compile()).css).toContain('.c__wp_23_0f766e')
  const previous = await fs.stat(app.source)
  await fs.writeFile(app.source, 'import { css } from \'../styled-system/css\'; css({ color: \'#ff00ff\' });')
  await fs.utimes(app.source, previous.atime, new Date(previous.mtimeMs + 2000))
  const updated = await compile()
  expect(updated.css).toContain('.c__wp_23_ff00ff')
  // Panda's incremental utility registry may retain previously extracted rules.
  // The changed source must contribute its new utility on the next process.
  expect(updated.messages).toEqual(expect.arrayContaining([expect.objectContaining({ type: 'dir-dependency', plugin: 'pandacss' })]))
})

it('uses physical AST input context without a from option and normalizes query/file URL entries', async () => {
  const app = await project()
  const source = await fs.readFile(app.entry, 'utf8')
  for (const from of [app.entry, `${app.entry}?direct`, pathToFileURL(app.entry).href]) {
    const root = postcss.parse(source, { from })
    const result = await postcss([plugin()]).process(root, { from: undefined })
    expect(result.css).toContain('.c__wp_23_0f766e')
    expect(result.css).toContain(encodeClassName('authored/中文'))
  }
})

it.each([undefined, '\0virtual:panda.css', 'virtual:panda.css', 'https://example.invalid/app.css', '<input css abc>'])('adapts pure CSS without inventing a physical Panda entry: %s', async (from) => {
  const result = await postcss([plugin()]).process(`${layers} @layer base { .a\\/b { color:red } }`, { from })
  expect(result.css).toContain('.a_wp_2f_b')
  expect(result.css).not.toContain('@layer')
  expect(result.messages.filter(message => message.plugin === 'pandacss')).toEqual([])
})

it('resolves string imports only with explicit importer root when no physical entry exists', async () => {
  await write('styles/leaf.css', '.a\\/b { color:red }')
  const css = '@import "./leaf.css";'
  const result = await postcss([plugin({ imports: { root: path.join(fixture, 'styles') } })]).process(css, { from: undefined })
  expect(result.css).toContain('.a_wp_2f_b')
  await expect(postcss([plugin()]).process(css, { from: undefined })).rejects.toThrow()
})

it.each(['scss', 'sass', 'less', 'styl', 'stylus'])('rejects raw .%s imports and allows an explicit compiler loader', async (extension) => {
  const entry = await write('app.css', `@import './raw.${extension}';`)
  await write(`raw.${extension}`, '$tone:red; .a {color:$tone}')
  await expect(processFile(entry, { panda: false })).rejects.toThrow(/preprocess|Sass|Less|Stylus/i)
  const result = await processFile(entry, { panda: false, imports: { load: async () => '.a\\/b{color:red}' } })
  expect(result.css).toContain('.a_wp_2f_b')
})

it.each([true, false])('rejects duplicate official Panda before either plugin changes the AST (external first: %s)', async (externalFirst) => {
  const root = postcss.parse(layers)
  const external = officialPanda()
  const combined = plugin()
  const plugins = externalFirst ? [external, combined] : [combined, external]
  await expect(async () => postcss(plugins).process(root, { from: path.join(fixture, 'app.css') })).rejects.toThrow(/panda.*false|duplicate|remove/i)
  expect(root.toString()).toBe(layers)
})

it('allows intentionally external import/Panda stages when the built-in stages are disabled', async () => {
  const app = await project()
  const result = await postcss([postcssImport(), officialPanda({ cwd: app.cwd }), plugin({ imports: false, panda: false })])
    .process(await fs.readFile(app.entry, 'utf8'), { from: app.entry })
  expect(result.css).toContain('.c__wp_23_0f766e')
  expect(result.css).not.toMatch(/@import|@layer/)
})

it('expands an imported Panda entry before a downstream external Panda stage with the adapter disabled', async () => {
  const app = await project()
  await write('app/src/generated-entry.css', `${layers}\n@import './authored.css';`)
  const source = '@import "./generated-entry.css";'
  const importsOnly = plugin({ panda: false, adapter: false })
  const panda = officialPanda({ cwd: app.cwd })
  const result = await postcss([importsOnly, panda]).process(source, { from: app.entry })
  expect(result.css).not.toContain('@import')
  expect(result.css).toContain('@layer utilities')
  expect(result.css).toContain('.c_\\#0f766e')
  expect(result.css).toContain('.authored\\/中文')
  expect(result.css).not.toContain('weapp-pandacss:portable')
  await expect(async () => postcss([panda, importsOnly]).process(source, { from: app.entry }))
    .rejects
    .toThrow(/imports must be expanded before the external Panda/)
})

it('rejects an external importer after the combined stage before compilation', async () => {
  await expect(async () => postcss([plugin({ imports: false }), postcssImport()]).process(layers, { from: path.join(fixture, 'app.css') })).rejects.toThrow(/import.*false|order|before/i)
})

it('accepts a framework-owned trailing importer after the built-in stage has resolved the graph', async () => {
  const app = await project()
  const result = await postcss([plugin(), postcssImport()]).process(await fs.readFile(app.entry, 'utf8'), { from: app.entry })
  expect(result.css).toContain('.c__wp_23_0f766e')
  expect(result.css).toContain(encodeClassName('authored/中文'))
  expect(result.css).not.toMatch(/@import|@layer/)
})

it('falls back to the process project when an external CSS entry has no nearby config', async () => {
  const app = await project()
  const external = await write('external/entry.css', layers)
  const script = `
    import { createRequire } from 'node:module';
    const require = createRequire(process.argv[1]);
    const postcss = require('postcss');
    const plugin = require('weapp-pandacss/postcss');
    console.log((await postcss([plugin()]).process(process.argv[3], { from: process.argv[2] })).css);
  `
  const result = await run(process.execPath, ['--input-type=module', '-e', script, path.resolve(import.meta.dirname, '../package.json'), external, layers], { cwd: app.cwd })
  expect(result.stdout).toContain('.c__wp_23_0f766e')
  await fs.access(path.join(app.cwd, 'styled-system/css/index.mjs'))
})

it('does not append unencoded Panda rules when processing adapted Web CSS again', async () => {
  const app = await project()
  const processor = postcss([plugin({ target: 'web' })])
  const first = await processor.process(await fs.readFile(app.entry, 'utf8'), { from: app.entry })
  const second = await processor.process(first.css, { from: app.entry })
  const rules = (result: postcss.Result) => {
    const output: string[] = []
    result.root.walkRules((rule) => {
      output.push(rule.toString())
    })
    return output
  }
  // The importer can move comments around layer-order statements; rules must
  // remain identical, with no duplicate generated utilities or raw classes.
  expect(rules(second)).toEqual(rules(first))
  expect(second.css).not.toContain('.c_\\#0f766e')
})
