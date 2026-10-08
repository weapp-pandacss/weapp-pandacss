import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { escape } from '@weapp-core/escape'

const run = promisify(execFile)
const packageRoot = path.resolve(import.meta.dirname, '..')
const adapterBin = path.join(packageRoot, 'bin/weapp-pandacss.js')
const pandaBin = path.join(packageRoot, 'node_modules/@pandacss/dev/bin.js')

async function evaluateCss(root: string, extension: string) {
  const entry = pathToFileURL(path.join(root, `styled-system/css/index.${extension}`)).href
  const { stdout } = await run(process.execPath, [
    '--input-type=module',
    '-e',
    `const { css } = await import(process.argv[1]); console.log(css({ color: 'red.500' }));`,
    entry,
  ], { cwd: root })
  return stdout.trim()
}

describe('Panda CSS 2.1.2 generation', () => {
  it.each(['js', 'mjs'])('adapts freshly generated .%s runtime and honors escapePredicate', async (extension) => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'panda2-runtime-'))
    try {
      await fs.symlink(path.join(packageRoot, 'node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
      await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}\n')
      await fs.writeFile(path.join(root, 'panda.config.mjs'), `export default {
        presets: ['@pandacss/preset-base', '@pandacss/preset-panda'],
        include: ['./src/**/*.ts'],
        outdir: 'styled-system',
        ${extension === 'mjs' ? 'outExtension: \'mjs\',' : ''}
        forceImportExtension: true,
      }\n`)
      await fs.mkdir(path.join(root, 'src'))
      await fs.writeFile(path.join(root, 'src/index.ts'), `import { css } from '../styled-system/css/index.${extension}'; css({ color: 'red.500' });\n`)
      await run(process.execPath, [pandaBin, 'codegen'], { cwd: root })
      const helper = path.join(root, `styled-system/helpers.${extension}`)
      const original = await fs.readFile(helper, 'utf8')
      const originalClass = await evaluateCss(root, extension)
      expect(originalClass).toContain('.')

      await run(process.execPath, [adapterBin, 'codegen'], { cwd: root })
      expect(await evaluateCss(root, extension)).toBe(escape(originalClass))
      const patched = await fs.readFile(helper, 'utf8')
      expect(patched).toContain('__weappPandaOriginal_createSerializeCss')
      await run(process.execPath, [adapterBin, 'codegen'], { cwd: root })
      expect(await fs.readFile(helper, 'utf8')).toBe(patched)
      await run(process.execPath, [adapterBin, 'rollback'], { cwd: root })
      expect(await fs.readFile(helper, 'utf8')).toBe(original)

      await fs.writeFile(path.join(root, 'weapp-pandacss.config.mjs'), `export default { context: { escapePredicate: 'false' } }\n`)
      await run(process.execPath, [adapterBin, 'codegen'], { cwd: root })
      expect(await evaluateCss(root, extension)).toBe(originalClass)
    }
    finally {
      await fs.rm(root, { recursive: true, force: true })
    }
  })
})
