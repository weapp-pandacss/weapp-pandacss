import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { linkDependency, packPackages, pnpm, run, unpackPackage, workspaceRoot } from './packed-consumer'

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
  const packages = await packPackages(root)
  runtimeTarball = packages.runtime
  adapterTarball = packages.adapter
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
  await run(process.execPath, [path.join(workspaceRoot, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'node16', '--target', 'es2018', 'consumer.mts', 'consumer.cts'], { cwd: consumer })
}, 60_000)

it('packs the adapter with an exact runtime dependency and usable compatibility types', async () => {
  const consumer = path.join(root, 'adapter')
  await install(consumer, { '@weapp-pandacss/runtime': `file:${runtimeTarball}` })
  const installedAdapter = await unpackPackage(consumer, 'weapp-pandacss', adapterTarball)
  const adapter = JSON.parse(await fs.readFile(path.join(consumer, 'node_modules/weapp-pandacss/package.json'), 'utf8'))
  const runtime = JSON.parse(await fs.readFile(path.join(consumer, 'node_modules/@weapp-pandacss/runtime/package.json'), 'utf8'))
  expect(adapter.dependencies['@weapp-pandacss/runtime']).toBe(runtime.version)
  expect(adapter.dependencies['postcss-rule-unit-converter']).toMatch(/^\d+\.\d+\.\d+$/)
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
    await linkDependency(installedAdapter, name)
  }
  await linkDependency(consumer, 'postcss')
  for (const format of ['esm', 'cjs']) {
    const script = `${format === 'esm' ? 'import * as api from \'weapp-pandacss\'; import * as old from \'weapp-pandacss/runtime\'; import * as runtime from \'@weapp-pandacss/runtime\'; import postcssPlugin from \'weapp-pandacss/postcss\'; import postcss from \'postcss\';' : 'const api = require(\'weapp-pandacss\'); const old = require(\'weapp-pandacss/runtime\'); const runtime = require(\'@weapp-pandacss/runtime\'); const postcssPlugin = require(\'weapp-pandacss/postcss\'); const postcss = require(\'postcss\');'}
      if (api.encodeClassName !== runtime.encodeClassName) throw new Error('Duplicated root codec');
      for (const key of Object.keys(runtime)) if (old[key] !== runtime[key]) throw new Error('Duplicated compatibility codec: ' + key);
      if (api.weappPanda().name !== 'weapp-pandacss') throw new Error('Missing Panda plugin');
      const units = {rules:api.composeUnitRules(api.unitPresets.remToRpx({rootValue:32}))};
      const converted = postcss([postcssPlugin({imports:false,panda:false,adapter:false,units})]).process('.a{margin:-1e2rem}',{from:undefined}).sync();
      if (!converted.root.toString().includes('margin:-3200rpx')) throw new Error('Broken packed converter');
      postcss([postcssPlugin()]).process('.a\\\\.b {} @layer a,b; @layer b{.probe{color:blue}} @layer a{.probe{color:red}}', {from:undefined}).then(result => console.log(result.css.includes('.' + runtime.encodeClassName('a.b')) && !result.css.includes('@layer') && !result.css.includes(':not(') && result.css.indexOf('color:red') < result.css.indexOf('color:blue')));`
    const args = format === 'esm' ? ['--input-type=module', '-e', script] : ['-e', script]
    expect((await run(process.execPath, args, { cwd: consumer })).stdout.trim()).toBe('true')
  }
  const unitTypes = 'import {unitPresets,composeUnitRules} from \'weapp-pandacss\'; import type {UnitConversionOptions,PresetFactory,RemBasedPresetOptions} from \'weapp-pandacss\'; const preset: PresetFactory<RemBasedPresetOptions> = unitPresets.remToRpx; const units: UnitConversionOptions = {rules:composeUnitRules(preset({rootValue:32}))}; plugin({imports:false,panda:false,adapter:false,units});\n'
  await fs.writeFile(path.join(consumer, 'consumer.mts'), `import {encodeClassName} from 'weapp-pandacss/runtime'; import {encodeClassList} from '@weapp-pandacss/runtime'; const result: string = encodeClassList(encodeClassName('a.b')); import plugin from 'weapp-pandacss/postcss'; plugin({ imports: { root: '/app', path: ['styles'], filter: (id: string) => id.endsWith('.css') }, panda: { cwd: '/app', configPath: 'panda.config.ts', allow: [/css/] }, adapter: true });\n${unitTypes}`)
  await fs.writeFile(path.join(consumer, 'consumer.cts'), `import api = require('weapp-pandacss/runtime'); const result: string = api.createPortableRuntime().encodeClassName('a.b'); import plugin = require('weapp-pandacss/postcss'); plugin({ imports: false, panda: { outdir: 'styled-system' }, adapter: false });\n${unitTypes}`)
  await run(process.execPath, [path.join(workspaceRoot, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', '--module', 'node16', '--target', 'es2018', 'consumer.mts', 'consumer.cts'], { cwd: consumer })
}, 60_000)
