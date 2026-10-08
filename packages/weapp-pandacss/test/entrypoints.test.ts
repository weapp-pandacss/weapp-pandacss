import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const cwd = path.resolve(import.meta.dirname, '..')

describe('built public entrypoints', () => {
  it.each(['esm', 'cjs'])('loads the %s API and PostCSS plugin in Node', async (format) => {
    const imports = format === 'esm'
      ? `import * as api from 'weapp-pandacss'; import plugin from 'weapp-pandacss/postcss'; import {weappPanda} from 'weapp-pandacss/panda'; import {encodeClassName} from 'weapp-pandacss/runtime'; import postcss from 'postcss';`
      : `const api = require('weapp-pandacss'); const plugin = require('weapp-pandacss/postcss'); const {weappPanda} = require('weapp-pandacss/panda'); const {encodeClassName} = require('weapp-pandacss/runtime'); const postcss = require('postcss');`
    const script = `${imports}
      if (typeof api.createContext !== 'function' || typeof api.defineConfig !== 'function') throw new Error('Missing public API');
      if (typeof plugin !== 'function') throw new Error('Missing PostCSS factory');
      if (weappPanda().name !== 'weapp-pandacss' || encodeClassName('a.b') !== 'a_wp_2e_b') throw new Error('Missing plugin or runtime');
      postcss([plugin({ disabled: true })]).process('.a { color: red }', { from: undefined }).then(result => console.log(JSON.stringify({ css: result.css })));
    `
    const args = format === 'esm' ? ['--input-type=module', '-e', script] : ['-e', script]
    const result = await run(process.execPath, args, { cwd })
    expect(JSON.parse(result.stdout.trim().split('\n').at(-1)!)).toEqual({ css: '.a { color: red }' })
  })

  it('publishes both CLI names', async () => {
    const { default: manifest } = await import('../package.json')
    expect(manifest.bin['weapp-panda']).toBe(manifest.bin['weapp-pandacss'])
    const result = await run(process.execPath, [path.join(cwd, manifest.bin['weapp-panda']), '--help'], { cwd })
    expect(result.stdout).toContain('codegen')
  })
})
