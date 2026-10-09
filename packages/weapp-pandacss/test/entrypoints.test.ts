import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const cwd = path.resolve(import.meta.dirname, '..')

describe('built public entrypoints', () => {
  it.each(['esm', 'cjs'])('loads the %s API and PostCSS plugin in Node', async (format) => {
    const imports = format === 'esm'
      ? `import * as api from 'weapp-pandacss'; import plugin from 'weapp-pandacss/postcss'; import {weappPanda} from 'weapp-pandacss/panda'; import * as runtime from 'weapp-pandacss/runtime'; import * as standalone from '@weapp-pandacss/runtime'; import postcss from 'postcss';`
      : `const api = require('weapp-pandacss'); const plugin = require('weapp-pandacss/postcss'); const {weappPanda} = require('weapp-pandacss/panda'); const runtime = require('weapp-pandacss/runtime'); const standalone = require('@weapp-pandacss/runtime'); const postcss = require('postcss');`
    const script = `${imports}
      const {encodeClassName} = runtime;
      const publicNames = ['encodeClassList', 'encodeClassName', 'postcssPlugin', 'weappPanda'];
      if (JSON.stringify(Object.keys(api).sort()) !== JSON.stringify(publicNames)) throw new Error('Unexpected public API');
      if (api.weappPanda !== weappPanda || api.encodeClassName !== encodeClassName || api.postcssPlugin !== plugin) throw new Error('Mismatched public entries');
      for (const name of ['encodeClassName', 'encodeClassList', 'createPortableRuntime']) {
        if (runtime[name] !== standalone[name]) throw new Error('Mismatched runtime facade: ' + name);
      }
      if (typeof plugin !== 'function') throw new Error('Missing PostCSS factory');
      if (weappPanda().name !== 'weapp-pandacss' || encodeClassName('a.b') !== 'a_wp_2e_b') throw new Error('Missing plugin or runtime');
      postcss([plugin({ disabled: true })]).process('.a { color: red }', { from: undefined }).then(result => console.log(JSON.stringify({ css: result.css })));
    `
    const args = format === 'esm' ? ['--input-type=module', '-e', script] : ['-e', script]
    const result = await run(process.execPath, args, { cwd })
    expect(JSON.parse(result.stdout.trim().split('\n').at(-1)!)).toEqual({ css: '.a { color: red }' })
  })

  it('publishes only supported API entries and no patching CLI artifacts', async () => {
    const { default: manifest } = await import('../package.json')
    expect(manifest).not.toHaveProperty('bin')
    expect(Object.keys(manifest.exports).sort()).toEqual(['.', './package.json', './panda', './postcss', './runtime'])
    expect(manifest.files).toEqual(['README.md', 'README.zh.md', 'dist'])
    expect((await fs.readdir(path.join(cwd, 'dist'))).some(name => name.startsWith('cli.'))).toBe(false)
    for (const entry of ['weapp-pandacss/core', 'weapp-pandacss/dist/cli', 'weapp-pandacss/bin/weapp-pandacss.js']) {
      await expect(run(process.execPath, ['--input-type=module', '-e', 'await import(process.argv[1])', entry], { cwd })).rejects.toThrow('ERR_PACKAGE_PATH_NOT_EXPORTED')
      await expect(run(process.execPath, ['-e', 'require(process.argv[1])', entry], { cwd })).rejects.toThrow('ERR_PACKAGE_PATH_NOT_EXPORTED')
    }
  })
})
