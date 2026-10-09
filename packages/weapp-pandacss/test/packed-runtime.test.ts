import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const adapterRoot = path.resolve(import.meta.dirname, '..')
const runtimeRoot = path.resolve(adapterRoot, '../runtime')
const workspaceRoot = path.resolve(adapterRoot, '../..')

// pnpm 12 can expose a native binary; older pnpm installations expose JS.
async function pnpm(args: string[], cwd: string) {
  const cli = process.env['npm_execpath']
  if (!cli) {
    throw new Error('Run packaged-consumer tests through pnpm.')
  }
  return /\.[cm]?js$/.test(cli)
    ? run(process.execPath, [cli, ...args], { cwd, timeout: 60_000 })
    : run(cli, args, { cwd, timeout: 60_000 })
}

async function install(root: string, dependencies: Record<string, string>) {
  await fs.mkdir(root)
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ private: true, type: 'module', dependencies }))
  await fs.writeFile(path.join(root, 'pnpm-workspace.yaml'), 'packages: []\nautoInstallPeers: false\nstrictPeerDependencies: false\n')
  await pnpm(['install', '--offline', '--ignore-scripts', '--reporter=silent'], root)
}

let root: string
let runtimeTarball: string
let adapterTarball: string

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'panda-packed-runtime-'))
  const pack = async (cwd: string) => {
    const packed = JSON.parse((await pnpm(['pack', '--json', '--pack-destination', root], cwd)).stdout) as { filename: string, files: { path: string }[] }
    expect(packed.files.every(file => /^(?:dist\/|package\.json$|LICENSE$|README(?:\.zh)?\.md$)/.test(file.path))).toBe(true)
    return packed.filename
  }
  runtimeTarball = await pack(runtimeRoot)
  adapterTarball = await pack(adapterRoot)
}, 60_000)

afterAll(async () => {
  if (root) {
    await fs.rm(root, { recursive: true, force: true })
  }
})

it('installs the runtime tarball alone without Panda, PostCSS or Babel', async () => {
  const consumer = path.join(root, 'standalone')
  await install(consumer, { '@weapp-pandacss/runtime': `file:${runtimeTarball}` })
  const manifest = JSON.parse(await fs.readFile(path.join(consumer, 'node_modules/@weapp-pandacss/runtime/package.json'), 'utf8'))
  expect(manifest.dependencies ?? {}).toEqual({})
  expect(manifest.peerDependencies ?? {}).toEqual({})
  for (const name of ['@pandacss', 'postcss', '@babel']) {
    await expect(fs.access(path.join(consumer, 'node_modules', name))).rejects.toThrow()
  }
  const lock = await fs.readFile(path.join(consumer, 'pnpm-lock.yaml'), 'utf8')
  expect(lock).not.toMatch(/@pandacss|@babel|postcss/)
  for (const format of ['esm', 'cjs']) {
    const script = `${format === 'esm' ? 'import * as api from \'@weapp-pandacss/runtime\'; import {runInNewContext} from \'node:vm\';' : 'const api = require(\'@weapp-pandacss/runtime\'); const {runInNewContext} = require(\'node:vm\');'}
      if (JSON.stringify(Object.keys(api).sort()) !== JSON.stringify(['createPortableRuntime','encodeClassList','encodeClassName'])) throw new Error('Unexpected runtime API');
      const embedded = runInNewContext('(' + api.createPortableRuntime.toString() + ')()', Object.create(null));
      const value = '1/中文_wp_💡';
      if (embedded.encodeClassName(value) !== api.encodeClassName(value)) throw new Error('Factory cannot run independently');
      console.log(api.encodeClassName('a.b'));`
    const args = format === 'esm' ? ['--input-type=module', '-e', script] : ['-e', script]
    expect((await run(process.execPath, args, { cwd: consumer })).stdout.trim()).toBe('a_wp_2e_b')
  }
  await fs.writeFile(path.join(consumer, 'consumer.mts'), 'import {encodeClassName,createPortableRuntime} from \'@weapp-pandacss/runtime\'; const result: string = encodeClassName(\'a.b\'); createPortableRuntime().encodeClassList(result);\n')
  await fs.writeFile(path.join(consumer, 'consumer.cts'), 'import api = require(\'@weapp-pandacss/runtime\'); const result: string = api.encodeClassName(\'a.b\'); api.encodeClassList(result);\n')
  await run(process.execPath, [path.join(workspaceRoot, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'node16', '--target', 'es2018', 'consumer.mts', 'consumer.cts'], { cwd: consumer })
}, 60_000)

it('packs the adapter with an exact runtime dependency and usable compatibility types', async () => {
  const consumer = path.join(root, 'adapter')
  await install(consumer, { '@weapp-pandacss/runtime': `file:${runtimeTarball}` })
  await run('tar', ['-xzf', adapterTarball, '-C', consumer])
  const installedAdapter = path.join(consumer, 'node_modules/weapp-pandacss')
  await fs.rename(path.join(consumer, 'package'), installedAdapter)
  const adapter = JSON.parse(await fs.readFile(path.join(consumer, 'node_modules/weapp-pandacss/package.json'), 'utf8'))
  const runtime = JSON.parse(await fs.readFile(path.join(consumer, 'node_modules/@weapp-pandacss/runtime/package.json'), 'utf8'))
  expect(adapter.dependencies['@weapp-pandacss/runtime']).toBe(runtime.version)
  // Reuse the locked build-time dependencies; the extracted adapter and its
  // runtime are real tarball contents, not source links. No registry resolution
  // is needed for an unpublished package or a fresh CI metadata cache.
  for (const name of Object.keys({
    ...adapter.dependencies,
    ...adapter.peerDependencies,
  })) {
    if (name === '@weapp-pandacss/runtime') {
      continue
    }
    const destination = path.join(installedAdapter, 'node_modules', name)
    await fs.mkdir(path.dirname(destination), { recursive: true })
    await fs.symlink(await fs.realpath(path.join(adapterRoot, 'node_modules', name)), destination, process.platform === 'win32' ? 'junction' : 'dir')
  }
  const postcssLink = path.join(consumer, 'node_modules/postcss')
  await fs.symlink(await fs.realpath(path.join(adapterRoot, 'node_modules/postcss')), postcssLink, process.platform === 'win32' ? 'junction' : 'dir')
  for (const format of ['esm', 'cjs']) {
    const script = `${format === 'esm' ? 'import * as api from \'weapp-pandacss\'; import * as old from \'weapp-pandacss/runtime\'; import * as runtime from \'@weapp-pandacss/runtime\'; import postcssPlugin from \'weapp-pandacss/postcss\'; import postcss from \'postcss\';' : 'const api = require(\'weapp-pandacss\'); const old = require(\'weapp-pandacss/runtime\'); const runtime = require(\'@weapp-pandacss/runtime\'); const postcssPlugin = require(\'weapp-pandacss/postcss\'); const postcss = require(\'postcss\');'}
      if (api.encodeClassName !== runtime.encodeClassName) throw new Error('Duplicated root codec');
      for (const key of Object.keys(runtime)) if (old[key] !== runtime[key]) throw new Error('Duplicated compatibility codec: ' + key);
      if (api.weappPanda().name !== 'weapp-pandacss') throw new Error('Missing Panda plugin');
      postcss([postcssPlugin()]).process('.a\\\\.b {} @layer a,b; @layer b{.probe{color:blue}} @layer a{.probe{color:red}}', {from:undefined}).then(result => console.log(result.css.includes('.' + runtime.encodeClassName('a.b')) && !result.css.includes('@layer') && !result.css.includes(':not(') && result.css.indexOf('color:red') < result.css.indexOf('color:blue')));`
    const args = format === 'esm' ? ['--input-type=module', '-e', script] : ['-e', script]
    expect((await run(process.execPath, args, { cwd: consumer })).stdout.trim()).toBe('true')
  }
  await fs.writeFile(path.join(consumer, 'consumer.mts'), 'import {encodeClassName} from \'weapp-pandacss/runtime\'; import {encodeClassList} from \'@weapp-pandacss/runtime\'; const result: string = encodeClassList(encodeClassName(\'a.b\'));\n')
  await fs.writeFile(path.join(consumer, 'consumer.cts'), 'import api = require(\'weapp-pandacss/runtime\'); const result: string = api.createPortableRuntime().encodeClassName(\'a.b\');\n')
  await run(process.execPath, [path.join(workspaceRoot, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--module', 'node16', '--target', 'es2018', 'consumer.mts', 'consumer.cts'], { cwd: consumer })
}, 60_000)
