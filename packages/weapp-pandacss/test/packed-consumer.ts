import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { promisify } from 'node:util'

export const run = promisify(execFile)
export const adapterRoot = path.resolve(import.meta.dirname, '..')
export const runtimeRoot = path.resolve(adapterRoot, '../runtime')
export const workspaceRoot = path.resolve(adapterRoot, '../..')
export const pandaVersions = ['2.1.2', '2.2.0'] as const
export type PandaVersion = typeof pandaVersions[number]
export interface PackedPackages {
  runtime: string
  adapter: string
}

// pnpm 12 can expose a native binary; older pnpm installations expose JS.
export async function pnpm(args: string[], cwd: string) {
  const cli = process.env['npm_execpath']
  if (!cli) {
    throw new Error('Run packaged-consumer tests through pnpm.')
  }
  return /\.[cm]?js$/.test(cli)
    ? run(process.execPath, [cli, ...args], { cwd, timeout: 60_000 })
    : run(cli, args, { cwd, timeout: 60_000 })
}

export async function packPackages(destination: string): Promise<PackedPackages> {
  const pack = async (cwd: string) => {
    const packed = JSON.parse((await pnpm(['pack', '--json', '--pack-destination', destination], cwd)).stdout) as { filename: string, files: { path: string }[] }
    expect(packed.files.every(file => /^(?:dist\/|package\.json$|LICENSE$|README(?:\.zh)?\.md$)/.test(file.path))).toBe(true)
    return packed.filename
  }
  return { runtime: await pack(runtimeRoot), adapter: await pack(adapterRoot) }
}

export async function linkDependency(root: string, name: string, sourceName = name, sourceRoot = adapterRoot) {
  const destination = path.join(root, 'node_modules', name)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.symlink(await fs.realpath(path.join(sourceRoot, 'node_modules', sourceName)), destination, process.platform === 'win32' ? 'junction' : 'dir')
}

export async function unpackPackage(root: string, name: string, tarball: string) {
  const destination = path.join(root, 'node_modules', name)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  const staging = await fs.mkdtemp(path.join(root, 'unpack-'))
  try {
    await run('tar', ['-xzf', tarball, '-C', staging])
    await fs.rename(path.join(staging, 'package'), destination)
  }
  finally {
    await fs.rm(staging, { recursive: true, force: true })
  }
  return destination
}

/** Real published contents with dependencies from the lockfile, without network resolution. */
export async function packedConsumer(root: string, packages: PackedPackages, version: PandaVersion) {
  await fs.mkdir(root, { recursive: true })
  await fs.writeFile(path.join(root, 'package.json'), '{"private":true,"type":"module"}')
  await unpackPackage(root, '@weapp-pandacss/runtime', packages.runtime)
  const adapter = await unpackPackage(root, 'weapp-pandacss', packages.adapter)
  const manifest = JSON.parse(await fs.readFile(path.join(adapter, 'package.json'), 'utf8'))
  const pandaDependency = (name: string) => version === '2.1.2' ? `${name}-2-1-2` : name
  // Each extracted adapter resolves its own cohort, even when another version
  // is installed in the workspace. Resolving real paths also avoids broken
  // relative pnpm links in native ESM and Windows junctions.
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.peerDependencies })) {
    if (name !== '@weapp-pandacss/runtime') {
      await linkDependency(adapter, name, name === '@pandacss/dev' ? pandaDependency(name) : name)
    }
  }
  for (const name of ['@pandacss/dev', '@pandacss/preset-base', '@pandacss/preset-panda']) {
    await linkDependency(root, name, pandaDependency(name))
    const installed = JSON.parse(await fs.readFile(path.join(root, 'node_modules', name, 'package.json'), 'utf8'))
    expect(installed.version).toBe(version)
  }
  await linkDependency(root, 'postcss')
  const resolved = JSON.parse((await run(process.execPath, ['--input-type=module', '-e', `
    import { createRequire } from 'node:module';
    import { weappPanda } from 'weapp-pandacss/panda';
    const require = createRequire(import.meta.resolve('weapp-pandacss/package.json'));
    console.log(JSON.stringify({version:require('@pandacss/dev/package.json').version,adapter:require.resolve('weapp-pandacss/panda'),plugin:weappPanda().name}));
  `], { cwd: root })).stdout)
  expect(resolved.version).toBe(version)
  expect(resolved.adapter).toBe(await fs.realpath(path.join(adapter, 'dist/panda.cjs')))
  expect(resolved.plugin).toBe('weapp-pandacss')
  return { adapter, pandaBin: path.join(root, 'node_modules/@pandacss/dev/bin.js') }
}
