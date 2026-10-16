import { mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import vm from 'node:vm'
import { createTaroPrebundleRuntime } from './taro-prebundle-runtime'

type Runtime = ReturnType<typeof createTaroPrebundleRuntime>
type Compiler = ReturnType<Runtime['createCompiler']>

/** Compile both sides with deliberately colliding IDs and execute their shared runtime. */
export async function runTaroPrebundleIntegration(runtime = createTaroPrebundleRuntime()) {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'taro-prebundle-runtime-')))
  const output = path.join(directory, 'dist')
  const remote = path.join(directory, 'remote.cjs')
  const host = path.join(directory, 'host.js')
  function forceCollision(resource: string) {
    return {
      apply(compiler: Compiler) {
        // These are actual Webpack hooks; the collision is independent of its hash algorithm.
        const raw = compiler as unknown as {
          hooks: { compilation: { tap: (name: string, callback: (compilation: {
            hooks: Record<'optimizeModuleIds' | 'optimizeChunkIds', { tap: (name: string, callback: (items: Iterable<{ resource?: string, id?: number, ids?: number[] }>) => void) => void }>
            chunkGraph: { setModuleId: (module: unknown, id: number) => void, getChunkModulesIterable: (chunk: unknown) => Iterable<{ resource?: string }> }
          }) => void) => void } }
        }
        raw.hooks.compilation.tap('ForceCollision', (compilation) => {
          compilation.hooks.optimizeModuleIds.tap('ForceCollision', (modules) => {
            for (const module of modules) {
              if (module.resource === resource) {
                compilation.chunkGraph.setModuleId(module, 802)
              }
            }
          })
          compilation.hooks.optimizeChunkIds.tap('ForceCollision', (chunks) => {
            for (const chunk of chunks) {
              if ([...compilation.chunkGraph.getChunkModulesIterable(chunk)].some(module => module.resource === resource)) {
                chunk.id = 802
                chunk.ids = [802]
              }
            }
          })
        })
      },
    }
  }
  async function compile(options: Record<string, unknown>) {
    const compiler = runtime.createCompiler({
      context: directory,
      mode: 'production',
      target: 'web',
      output: { path: output, filename: '[name].js', chunkFilename: '[id].js', publicPath: '', chunkLoadingGlobal: 'taroPrebundleTest' },
      optimization: { minimize: false, moduleIds: 'deterministic', chunkIds: 'deterministic' },
      ...options,
    })
    try {
      await new Promise<void>((resolve, reject) => compiler.run((error, stats) => {
        if (error) {
          reject(error)
        }
        else if (!stats || stats.hasErrors()) {
          reject(new Error(JSON.stringify(stats?.toJson().errors)))
        }
        else { resolve() }
      }))
    }
    finally {
      await new Promise<void>((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
    }
  }
  try {
    await writeFile(remote, 'module.exports = { marker: "remote runtime survived" }')
    await writeFile(host, 'globalThis.prebundleDone = import("taro_app_library/value").then(value => value.default.marker)')
    await compile({
      plugins: [
        forceCollision(remote),
        new runtime.FederationPlugin({ name: 'taro_app_library', filename: 'remoteEntry.js', runtime: 'runtime', exposes: { './value': remote } }, runtime.params),
      ],
    })
    await compile({
      entry: { host },
      plugins: [
        forceCollision(host),
        new runtime.FederationPlugin({ name: 'host', remotes: { taro_app_library: 'taro_app_library@/remoteEntry.js' } }, runtime.params),
      ],
    })
    const chunks: [Array<string | number>, Record<string, unknown>][] = []
    const sandbox: { taroPrebundleTest: typeof chunks, self?: unknown, prebundleDone?: Promise<unknown> } = { taroPrebundleTest: chunks }
    sandbox.self = sandbox
    const context = vm.createContext(sandbox)
    for (const file of (await readdir(output)).filter(file => file.endsWith('.js') && file !== 'host.js')) {
      vm.runInContext(await readFile(path.join(output, file), 'utf8'), context, { filename: file })
    }
    const moduleIds = chunks.flatMap(chunk => Object.keys(chunk[1]))
    const chunkIds = chunks.flatMap(chunk => chunk[0])
    vm.runInContext(await readFile(path.join(output, 'host.js'), 'utf8'), context, { filename: 'host.js' })
    return { value: await sandbox.prebundleDone, moduleIds, chunkIds }
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
}
