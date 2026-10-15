import type { CascadeLayerDiagnostic } from '@weapp-tailwindcss/css-compat/diagnostics'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { CascadeLayerError } from '@weapp-tailwindcss/css-compat/diagnostics'
import postcss, { CssSyntaxError } from 'postcss'
import postcssImport from 'postcss-import'
import adapter from '@/postcss'
import { encodeClassName } from '@/runtime'

const run = promisify(execFile)
let fixtureRoot: string

beforeEach(async () => {
  fixtureRoot = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'panda-imports-')))
})

afterEach(async () => {
  await fs.rm(fixtureRoot, { recursive: true, force: true })
})

async function files(graph: Record<string, string>) {
  for (const [file, css] of Object.entries(graph)) {
    const destination = path.join(fixtureRoot, file)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.writeFile(destination, css)
  }
}

async function compile(entry = 'entry.css', target: 'weapp' | 'web' = 'weapp', onConflict: 'warning' | 'error' = 'warning') {
  const from = path.join(fixtureRoot, entry)
  return postcss([adapter({ target, cascadeLayers: { onConflict } })])
    .process(await fs.readFile(from, 'utf8'), { from, to: path.join(fixtureRoot, 'output.css'), map: { inline: false } })
}

function declarations(result: postcss.Result, selector: string, prop = 'color') {
  const output: string[] = []
  result.root.walkRules((rule) => {
    if (rule.selector === selector) {
      rule.walkDecls(prop, (decl) => {
        output.push(`${decl.value}${decl.important ? '!' : ''}`)
      })
    }
  })
  return output
}

it('compiles one merged multi-file scope with normal, important, nested and unlayered priorities', async () => {
  await files({
    'entry.css': '@layer base,utilities,outer.a,outer.b; @import "./utilities.css"; @import "./base.css"; @import "./nested/parent.css"; @import "./unlayered.css";',
    'utilities.css': '@layer utilities{.order{color:blue}.normal{color:blue}.important{color:blue!important}.repeated{color:blue}}',
    'base.css': '@layer base{.order{color:red}.normal{color:red}.important{color:red!important;color:orange!important}}',
    'nested/parent.css': '@import "./children.css"; @layer outer{.nested{color:parent;color:parent!important}} @layer utilities{.repeated{color:purple}}',
    'nested/children.css': '@layer outer.b{.nested{color:b;color:b!important}} @layer outer.a{.nested{color:a;color:a!important}}',
    'unlayered.css': '.normal{color:green}.important{color:green!important}',
  })
  const result = await compile('entry.css', 'weapp', 'error')
  expect(declarations(result, '.order')).toEqual(['red', 'blue'])
  expect(declarations(result, '.normal')).toEqual(['red', 'blue', 'green'])
  expect(declarations(result, '.important')).toEqual(['green!', 'blue!', 'red!', 'orange!'])
  expect(declarations(result, '.nested')).toEqual(['a', 'b', 'parent', 'parent!', 'b!', 'a!'])
  expect(declarations(result, '.repeated')).toEqual(['blue', 'purple'])
  expect(result.css).not.toMatch(/@import|@layer|:not\(n\)/)
  expect(result.warnings()).toEqual([])
  expect(result.messages.filter(message => message.type === 'dependency').map(message => message['file'])).toEqual(expect.arrayContaining([
    path.join(fixtureRoot, 'utilities.css'),
    path.join(fixtureRoot, 'nested/children.css'),
  ]))
})

it('keeps trailing empty layer declarations after imported layer blocks', async () => {
  await files({
    'entry.css': '@import "./base.css"; @import "./overrides.css";',
    'base.css': '@layer base{.normal{color:red}.important{color:red!important}} @layer overrides;',
    'overrides.css': '@layer overrides{.normal{color:blue}.important{color:blue!important}}',
  })
  const result = await compile('entry.css', 'weapp', 'error')
  expect(declarations(result, '.normal')).toEqual(['red', 'blue'])
  expect(declarations(result, '.important')).toEqual(['blue!', 'red!'])
  expect(result.css).not.toMatch(/@import|@layer/)
  expect(result.warnings()).toEqual([])
})

it('expands imported authored classes before encoding, including collision names and platform selectors', async () => {
  await files({
    'entry.css': '@layer base; @import "./authored.css";',
    'authored.css': '@layer base{.a\\/中文{color:red}.a_wp_2f_中文{color:blue}:where(:root,:host){--safe:red}*{box-sizing:border-box}}',
  })
  const result = await compile()
  expect(result.css).toContain(`.${encodeClassName('a/中文')}`)
  expect(result.css).toContain(`.${encodeClassName('a_wp_2f_中文')}`)
  expect(result.css).toContain('page')
  expect(result.css).toContain('view,text')
  expect((await postcss([adapter()]).process(result.css, { from: undefined })).css).toBe(result.css)
})

it('retains named, anonymous, media and supports import semantics and complete source maps', async () => {
  await files({
    'entry.css': '@layer first,last; @import "./named.css" layer(last); @import "./first.css" layer(first); @import "./anonymous.css" layer; @import "./conditional.css" layer(last) supports(display:grid) screen and (min-width:1px);',
    'named.css': '.named{color:blue}',
    'first.css': '.named{color:red}',
    'anonymous.css': '.anonymous{margin:1px}',
    'conditional.css': '.conditional{padding:2px}',
  })
  const result = await compile('entry.css', 'weapp', 'error')
  expect(declarations(result, '.named')).toEqual(['red', 'blue'])
  const conditional: postcss.Rule[] = []
  result.root.walkRules('.conditional', (rule) => {
    conditional.push(rule)
  })
  expect(conditional).toHaveLength(1)
  const ancestors: string[] = []
  let parent = conditional[0]!.parent
  while (parent && parent.type !== 'root') {
    ancestors.push((parent as postcss.AtRule).name)
    parent = parent.parent
  }
  expect(ancestors.sort()).toEqual(['media', 'supports'])
  const sourceMap = result.map!.toJSON()
  expect(sourceMap.sourcesContent).toEqual(expect.arrayContaining(['.named{color:red}', '.conditional{padding:2px}', '.anonymous{margin:1px}']))
  expect(sourceMap.sources.some(source => source.endsWith('conditional.css'))).toBe(true)
  expect(result.css).not.toMatch(/@import|@layer/)
})

it('preserves native layers on Web after resolving the same import graph', async () => {
  await files({ 'entry.css': '@layer a,b; @import "./source.css" layer(b);', 'source.css': '.a\\/b{color:red!important}' })
  const result = await compile('entry.css', 'web')
  expect(result.css).toContain('@layer a,b')
  expect(result.css).toContain('@layer b')
  expect(result.css).toContain(`.${encodeClassName('a/b')}`)
  expect(result.css).not.toContain('@import')
})

it('resolves nested imports relative to their real source files from an unrelated working directory', async () => {
  await files({ 'entry.css': '@import "./nested/parent.css";', 'nested/parent.css': '@import "../leaf.css";', 'leaf.css': '.a\\/b{color:red}' })
  const unrelated = path.join(fixtureRoot, 'different-cwd')
  await fs.mkdir(unrelated)
  const packageRoot = path.resolve(import.meta.dirname, '..')
  const script = `
    import {createRequire} from 'node:module';
    import fs from 'node:fs/promises';
    const require = createRequire(process.argv[1]);
    const postcss = require('postcss');
    const adapter = require('weapp-pandacss/postcss');
    const from = process.argv[2];
    console.log((await postcss([adapter()]).process(await fs.readFile(from, 'utf8'), {from})).css);
  `
  const result = await run(process.execPath, ['--input-type=module', '-e', script, path.join(packageRoot, 'package.json'), path.join(fixtureRoot, 'entry.css')], { cwd: unrelated })
  expect(result.stdout).toContain(`.${encodeClassName('a/b')}`)
})

it('deduplicates repeated and cyclic imports without losing layer declaration order', async () => {
  await files({
    'entry.css': '@layer a,b; @import "./a.css"; @import "./a.css"; @import "./b.css";',
    'a.css': '@import "./b.css"; @layer a{.a{color:red}}',
    'b.css': '@import "./a.css"; @layer b{.b{color:blue}}',
  })
  const result = await compile()
  expect(declarations(result, '.a')).toEqual(['red'])
  expect(declarations(result, '.b')).toEqual(['blue'])
  expect(result.css.indexOf('color:red')).toBeLessThan(result.css.indexOf('color:blue'))
  expect(result.warnings()).toEqual([])
})

it('reloads imported files without leaking state when reusing a processor', async () => {
  await files({ 'entry.css': '@layer a; @import "./source.css";', 'source.css': '@layer a{.x{color:red}}' })
  const processor = postcss([adapter()])
  const from = path.join(fixtureRoot, 'entry.css')
  const css = await fs.readFile(from, 'utf8')
  expect((await processor.process(css, { from })).css).toContain('color:red')
  const source = path.join(fixtureRoot, 'source.css')
  const previous = await fs.stat(source)
  await fs.writeFile(source, '@layer a{.x{color:blue}}')
  await fs.utimes(source, previous.atime, new Date(previous.mtimeMs + 2_000))
  const second = await processor.process(css, { from })
  expect(second.css).toContain('color:blue')
  expect(second.css).not.toContain('color:red')
})

it('retains diagnostic locations and strict error causes inside imported files', async () => {
  await files({
    'entry.css': '@layer a,b; @import "./base.css"; @import "./nested/utility.css";',
    'base.css': '@layer a{#id .x{color:red}}',
    'nested/utility.css': '/* source line */\n@layer b{\n.x{color:blue}\n}',
  })
  const result = await compile()
  const warning = result.warnings()[0]! as postcss.Warning & { code: string, diagnostic: CascadeLayerDiagnostic }
  expect(warning.text).toContain('WP_LAYER_SPECIFICITY')
  expect(warning.code).toBe('LAYER_SPECIFICITY')
  expect(warning.node!.source!.input.file).toBe(path.join(fixtureRoot, 'nested/utility.css'))
  expect(warning.diagnostic.source).toMatchObject({ file: path.join(fixtureRoot, 'nested/utility.css'), line: 3 })
  expect(warning.diagnostic.related!.file).toBe(path.join(fixtureRoot, 'base.css'))
  expect(result.map!.toJSON().sourcesContent).toContain('/* source line */\n@layer b{\n.x{color:blue}\n}')
  await expect(compile('entry.css', 'weapp', 'error')).rejects.toMatchObject({
    name: 'CssSyntaxError',
    code: 'LAYER_SPECIFICITY',
    file: path.join(fixtureRoot, 'nested/utility.css'),
    line: 3,
    cause: expect.any(CascadeLayerError),
  })
})

it('locates a fatal imported diagnostic instead of an earlier warning from another file', async () => {
  await files({
    'entry.css': '@import "./conditional.css"; @import "./nested/invalid.css";',
    'conditional.css': '@media (width:1px){@layer a{.x{color:red}}}',
    'nested/invalid.css': '/* source line */\n@layer b{\ncolor:blue\n}',
  })
  await expect(compile()).rejects.toMatchObject({
    name: 'CssSyntaxError',
    code: 'LAYER_NESTING',
    file: path.join(fixtureRoot, 'nested/invalid.css'),
    line: 3,
    column: 1,
    diagnostic: { code: 'LAYER_NESTING', severity: 'error', source: { file: path.join(fixtureRoot, 'nested/invalid.css'), line: 3, column: 1 } },
    diagnostics: [
      { code: 'LAYER_CONDITIONAL_ORDER', severity: 'warning', source: { file: path.join(fixtureRoot, 'conditional.css') } },
      { code: 'LAYER_NESTING', severity: 'error', source: { file: path.join(fixtureRoot, 'nested/invalid.css'), line: 3, column: 1 } },
    ],
    cause: expect.any(CascadeLayerError),
  })
})

it.each([
  ['.x{color:revert-layer}', 'LAYER_REVERT'],
  ['.x{.y{color:red}}', 'LAYER_NESTING'],
  ['.x:not(#\\#){color:red}', 'Disable Panda polyfill'],
  ['/* #ifdef MP-WEIXIN */ .x{color:red} /* #endif */', 'LAYER_PREPROCESSOR'],
])('rejects unsupported imported syntax with its source location: %s', async (source, message) => {
  await files({ 'entry.css': '@import "./invalid.css";', 'invalid.css': source })
  try {
    await compile()
    expect.fail('Invalid imported input must fail')
  }
  catch (error) {
    expect(error).toBeInstanceOf(CssSyntaxError)
    expect(error).toMatchObject({ file: path.join(fixtureRoot, 'invalid.css') })
    expect((error as Error).message).toContain(message)
  }
})

it('reports missing files and imported parse errors rather than emitting incomplete CSS', async () => {
  await files({ 'entry.css': '@import "./missing.css";' })
  await expect(compile()).rejects.toThrow(/Failed to find|ENOENT/)
  await files({ 'entry.css': '@import "./broken.css";', 'broken.css': '.x{color:red' })
  await expect(compile()).rejects.toMatchObject({ name: 'CssSyntaxError', file: path.join(fixtureRoot, 'broken.css') })
})

it.each(['@import "https://example.invalid/styles.css";', '@import "./filtered.css";', '@import "data:text/css;base64,Lnh7Y29sb3I6cmVkfQ==";'])('rejects any import deliberately left unresolved: %s', async (css) => {
  await files({ 'entry.css': css })
  const result = postcss([postcssImport({ filter: () => false }), adapter({ imports: false, panda: false })]).process(css, { from: path.join(fixtureRoot, 'entry.css') })
  await expect(result).rejects.toMatchObject({ code: 'LAYER_IMPORT' })
})

it.each(['@import;', '.before{color:red} @import "./leaf.css";'])('exposes importer diagnostics for malformed or late imports: %s', async (css) => {
  await files({ 'entry.css': css, 'leaf.css': '.after{color:blue}' })
  const result = await compile()
  const warning = result.warnings().find(warning => warning.plugin === 'postcss-import')!
  expect(warning).toBeDefined()
  expect(warning.node!.source!.input.file).toBe(path.join(fixtureRoot, 'entry.css'))
  expect(warning.line).toBe(1)
  expect(warning.column).toBeGreaterThan(0)
  expect(result.css).not.toContain('.after')
})

it('keeps independent import graphs isolated when layer names have opposing orders', async () => {
  await files({
    'first/entry.css': '@layer a,b; @import "./a.css"; @import "./b.css";',
    'first/a.css': '@layer a{.x{color:red;background:red!important}}',
    'first/b.css': '@layer b{.x{color:blue;background:blue!important}}',
    'second/entry.css': '@layer b,a; @import "./a.css"; @import "./b.css";',
    'second/a.css': '@layer a{.x{color:green;background:green!important}}',
    'second/b.css': '@layer b{.x{color:purple;background:purple!important}}',
  })
  const processor = postcss([adapter()])
  const firstPath = path.join(fixtureRoot, 'first/entry.css')
  const secondPath = path.join(fixtureRoot, 'second/entry.css')
  const first = await processor.process(await fs.readFile(firstPath, 'utf8'), { from: firstPath })
  const second = await processor.process(await fs.readFile(secondPath, 'utf8'), { from: secondPath })
  expect(declarations(first, '.x')).toEqual(['red', 'blue'])
  expect(declarations(second, '.x')).toEqual(['purple', 'green'])
  expect(declarations(first, '.x', 'background')).toEqual(['blue!', 'red!'])
  expect(declarations(second, '.x', 'background')).toEqual(['green!', 'purple!'])
  expect(second.css).not.toMatch(/red|blue/)
})

it('expands supported URL and data imports before invoking the adapter', async () => {
  await files({ 'entry.css': '@layer a; @import url("./source.css") layer(a); @import "data:text/css;base64,LmlubGluZXtjb2xvcjpibHVlfQ==";', 'source.css': '.external{color:red}' })
  const result = await compile()
  expect(declarations(result, '.external')).toEqual(['red'])
  expect(declarations(result, '.inline')).toEqual(['blue'])
  expect(result.css).not.toMatch(/@import|@layer/)
  expect(result.warnings()).toEqual([])
})

it('keeps unresolved import compatibility for Web, disabled and explicit legacy callers', async () => {
  const source = '@import "./not-resolved.css"; .x{color:red}'
  for (const options of [{ target: 'web' as const }, { disabled: true }, { cascadeLayers: { mode: 'legacy' as const } }]) {
    const result = await postcss([adapter({ ...options, imports: false, panda: false })]).process(source, { from: undefined })
    expect(result.css).toContain('@import "./not-resolved.css"')
  }
})
