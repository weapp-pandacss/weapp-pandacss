import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import postcss from 'postcss'

const run = promisify(execFile)
const repository = path.resolve(import.meta.dirname, '../../..')
const example = path.join(repository, 'examples/react-app')
const adapter = path.join(repository, 'packages/weapp-pandacss')
const { default: adapt } = await import(pathToFileURL(path.join(adapter, 'dist/postcss.js')).href)
const fixture = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-doc-examples-'))

try {
  for (const name of ['@pandacss/dev', '@pandacss/preset-base', '@pandacss/preset-panda', 'weapp-pandacss']) {
    const destination = path.join(fixture, 'node_modules', name)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.symlink(await fs.realpath(path.join(example, 'node_modules', name)), destination, process.platform === 'win32' ? 'junction' : 'dir')
  }
  await fs.writeFile(path.join(fixture, 'package.json'), '{"type":"module"}')
  await fs.writeFile(path.join(fixture, 'panda.config.mjs'), [
    'import { weappPanda } from \'weapp-pandacss/panda\'',
    'export default {',
    '  plugins: [weappPanda()], polyfill: false, preflight: false,',
    '  presets: [\'@pandacss/preset-base\', \'@pandacss/preset-panda\'],',
    '  include: [\'./src/**/*.ts\'], outdir: \'styled-system\',',
    '  outExtension: \'mjs\', forceImportExtension: true,',
    '}',
  ].join('\n'))
  const sourceRoot = new URL('../src/content/docs/', import.meta.url)
  const english = await fs.readFile(new URL('index.mdx', sourceRoot), 'utf8')
  const chinese = await fs.readFile(new URL('zh/index.mdx', sourceRoot), 'utf8')
  const fence = (source, language) => source.match(new RegExp(`~~~${language}\\n([\\s\\S]*?)~~~`))?.[1]?.trim()
  const source = fence(english, 'ts')
  const documentedCss = fence(english, 'css')
  assert.ok(source && documentedCss, 'Homepage needs executable TypeScript and a CSS result.')
  assert.equal(fence(chinese, 'ts'), source, 'Both homepage translations must demonstrate the same code.')
  assert.equal(fence(chinese, 'css'), documentedCss)
  await fs.mkdir(path.join(fixture, 'src'))
  await fs.writeFile(path.join(fixture, 'src/badge.ts'), source)
  const cli = path.join(adapter, 'node_modules/@pandacss/dev/bin.js')
  await run(process.execPath, [cli, 'codegen'], { cwd: fixture })
  await run(process.execPath, [cli, 'cssgen', '--outfile', 'panda.css'], { cwd: fixture })
  const runtimeSource = source.replace('../styled-system/css', './styled-system/css/index.mjs')
  await fs.writeFile(path.join(fixture, 'badge.mjs'), runtimeSource)
  const { badgeClass } = await import(pathToFileURL(path.join(fixture, 'badge.mjs')).href)
  assert.equal(badgeClass, 'c__wp_23_0f766e')
  const input = await fs.readFile(path.join(fixture, 'panda.css'), 'utf8')
  const actual = await postcss([adapt({ target: 'weapp' })]).process(input, { from: undefined })
  const expected = postcss.parse(documentedCss)
  expected.walkRules((rule) => {
    assert.equal(rule.selector, `.${badgeClass}`)
    const match = []
    actual.root.walkRules(rule.selector, found => match.push(found))
    assert.ok(match.length, 'The documented class must occur in the extracted stylesheet.')
    rule.walkDecls((declaration) => {
      assert.ok(match.some(found => found.nodes.some(node => node.type === 'decl' && node.prop === declaration.prop && node.value === declaration.value)), 'The documented declaration must match Panda output.')
    })
  })
  console.log('Homepage examples verified: Panda 2.1.2 codegen, runtime and WXSS agree in both locales.')
}
finally {
  await fs.rm(fixture, { recursive: true, force: true })
}
