import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import vm from 'node:vm'

interface Compiler {
  options: { output: { enabledLibraryTypes: string[] } }
  hooks: Record<'make' | 'compilation' | 'afterPlugins', { taps: { name: string }[] }>
  close: (callback: (error?: Error | null) => void) => void
  run: (callback: (error?: Error | null, stats?: { hasErrors: () => boolean, toJson: () => { errors?: unknown[] } }) => void) => void
}

interface WebpackChain {
  mode: (mode: string) => WebpackChain
  optimization: { nodeEnv: (mode: string | false) => void }
  plugin: (name: string) => { use: (plugin: unknown, args: unknown[]) => void }
}

interface Params {
  deps: Map<string, unknown>
  env: string
  platformType: 'web'
  runtimeRequirements: Set<string>
}

interface Plugin {
  apply: (compiler: Compiler) => void
}

interface ReferencePlugin extends Plugin {
  remoteName: string
  remoteConfig: { external: string[], shareScope: string }
}

type PluginConstructor<T> = new (options: Record<string, unknown>, params: Params) => T

const requireExample = createRequire(new URL('../../../../examples/taro-app/package.json', import.meta.url))
const requireRunner = createRequire(requireExample.resolve('@tarojs/webpack5-runner'))
export const prebundleRoot = path.dirname(requireRunner.resolve('@tarojs/webpack5-prebundle/package.json'))
const webpack = requireExample('webpack') as (options: Record<string, unknown>) => Compiler
const WebpackChainConstructor = requireRunner('webpack-chain') as new () => WebpackChain
const DefinePlugin = requireExample('webpack').DefinePlugin
const selectedFiles = [
  'dist/webpack/TaroModuleFederationPlugin.js',
  'dist/webpack/TaroContainerReferencePlugin.js',
  'dist/webpack/TaroContainerPlugin.js',
  'dist/utils/index.js',
]

/** Execute the installed Taro subclasses against their actual Webpack parent classes. */
export function createTaroPrebundleRuntime(sourceRoot = prebundleRoot) {
  const cache = new Map<string, { exports: unknown }>()
  function load(filename: string): unknown {
    const cached = cache.get(filename)
    if (cached) {
      return cached.exports
    }
    const original = path.join(prebundleRoot, filename)
    const selected = path.join(sourceRoot, filename)
    const requireOriginal = createRequire(original)
    const module = { exports: {} as unknown }
    cache.set(filename, module)
    function requirePlugin(id: string): unknown {
      const resolved = requireOriginal.resolve(id)
      const relative = path.relative(prebundleRoot, resolved)
      if (selectedFiles.includes(relative)) {
        return load(relative)
      }
      return requireOriginal(id)
    }
    const execute = vm.runInThisContext(`(function(exports, require, module, __filename, __dirname) {\n${readFileSync(selected, 'utf8')}\n})`, { filename: selected }) as (
      exports: unknown,
      require: (id: string) => unknown,
      module: { exports: unknown },
      filename: string,
      dirname: string,
    ) => void
    execute(module.exports, requirePlugin, module, selected, path.dirname(selected))
    return module.exports
  }
  const { default: FederationPlugin } = load('dist/webpack/TaroModuleFederationPlugin.js') as { default: PluginConstructor<Plugin> }
  const { default: ContainerReferencePlugin } = load('dist/webpack/TaroContainerReferencePlugin.js') as { default: PluginConstructor<ReferencePlugin> }
  const { getDefines, getMfHash } = load('dist/utils/index.js') as { getDefines: (chain: WebpackChain) => Record<string, unknown>, getMfHash: (options: Record<string, unknown>) => string }
  const params: Params = { deps: new Map(), env: 'production', platformType: 'web', runtimeRequirements: new Set() }
  return {
    FederationPlugin,
    ContainerReferencePlugin,
    params,
    getDefines,
    getMfHash,
    createChain(mode: string, nodeEnv?: string | false, explicit?: string) {
      const chain = new WebpackChainConstructor().mode(mode)
      if (nodeEnv !== undefined) {
        chain.optimization.nodeEnv(nodeEnv)
      }
      if (explicit !== undefined) {
        chain.plugin('definePlugin').use(DefinePlugin, [{ 'process.env.NODE_ENV': JSON.stringify(explicit) }])
      }
      return chain
    },
    createCompiler(options: Record<string, unknown>) {
      // Construct the real compiler and apply its plugins without running a build.
      return webpack({ mode: 'none', entry: {}, ...options })
    },
  }
}
