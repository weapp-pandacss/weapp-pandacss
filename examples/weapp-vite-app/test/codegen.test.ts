import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

const run = promisify(execFile)
const exampleRoot = path.resolve(import.meta.dirname, '..')
const require = createRequire(import.meta.url)
const pandaBin = path.join(path.dirname(require.resolve('@pandacss/dev/package.json')), 'bin.js')

it('adapts every Panda generation before writing artifacts, without backups', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wevu-panda-codegen-'))
  try {
    await fs.symlink(path.join(exampleRoot, 'node_modules'), path.join(root, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
    await fs.writeFile(path.join(root, 'package.json'), '{"type":"module"}\n')
    await fs.copyFile(path.join(exampleRoot, 'panda.config.ts'), path.join(root, 'panda.config.ts'))
    await fs.mkdir(path.join(root, 'src'))
    await fs.writeFile(path.join(root, 'src/styles.ts'), 'import { css } from \'../styled-system/css/index.mjs\'; css({ color: \'red.500\' });\n')

    await run(process.execPath, [pandaBin, 'codegen'], { cwd: root })
    const helper = path.join(root, 'styled-system/helpers.mjs')
    const patched = await fs.readFile(helper, 'utf8')
    expect(patched).toContain('// weapp-pandacss:portable-v1')
    expect(await fs.readdir(path.join(root, 'styled-system'))).not.toContain('_helpers.backup.mjs')

    // Each generation starts with fresh artifacts and produces the same names.
    await run(process.execPath, [pandaBin, 'codegen'], { cwd: root })
    expect(await fs.readFile(helper, 'utf8')).toBe(patched)
    const entry = pathToFileURL(path.join(root, 'styled-system/css/index.mjs')).href
    const { stdout } = await run(process.execPath, [
      '--input-type=module',
      '-e',
      'const { css } = await import(process.argv[1]); console.log(css({ color: \'red.500\' }));',
      entry,
    ], { cwd: root })
    expect(stdout.trim()).toMatch(/^[\w-]+$/)
    expect(stdout.trim()).toContain('red')
    expect(stdout.trim()).toContain('_wp_2e_')
  }
  finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
