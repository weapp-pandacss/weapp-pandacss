import { runTaroPrebundleIntegration } from './fixtures/taro-prebundle-integration'
import { createTaroPrebundleRuntime } from './fixtures/taro-prebundle-runtime'

it('applies the actual Taro prebundle remote to the installed Webpack compiler', async () => {
  const runtime = createTaroPrebundleRuntime()
  const compiler = runtime.createCompiler({
    plugins: [new runtime.FederationPlugin({ name: 'taro_remote', exposes: { './react': 'react' } }, runtime.params)],
  })
  try {
    expect(compiler.options.output.enabledLibraryTypes).toContain('var')
    expect(compiler.hooks.make.taps.map(tap => tap.name)).toContain('ContainerPlugin')
  }
  finally {
    await new Promise<void>((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
  }
})

it('applies the actual Taro prebundle host to the installed Webpack compiler', async () => {
  const runtime = createTaroPrebundleRuntime()
  const compiler = runtime.createCompiler({
    plugins: [new runtime.FederationPlugin({ name: 'taro_host', remotes: { taro_remote: 'taro_remote@/remoteEntry.js' } }, runtime.params)],
  })
  try {
    expect(compiler.hooks.compilation.taps.map(tap => tap.name)).toContain('TaroContainerReferencePlugin')
  }
  finally {
    await new Promise<void>((resolve, reject) => compiler.close(error => error ? reject(error) : resolve()))
  }
})

it.each([
  { remote: 'taro_remote@/remoteEntry.js', external: ['taro_remote@/remoteEntry.js'], scope: 'shared' },
  { remote: ['taro_remote@/first.js', 'taro_remote@/second.js'], external: ['taro_remote@/first.js', 'taro_remote@/second.js'], scope: 'shared' },
  { remote: { external: 'taro_remote@/remoteEntry.js', shareScope: 'custom' }, external: ['taro_remote@/remoteEntry.js'], scope: 'custom' },
  { remote: { external: ['internal taro_remote', 'taro_remote@/fallback.js'] }, external: ['internal taro_remote', 'taro_remote@/fallback.js'], scope: 'shared' },
])('preserves remote fallback and share scope options: $remote', ({ remote, external, scope }) => {
  const runtime = createTaroPrebundleRuntime()
  const plugin = new runtime.ContainerReferencePlugin({ remoteType: 'script', remotes: { taro_remote: remote }, shareScope: 'shared' }, runtime.params)
  expect(plugin.remoteName).toBe('taro_remote')
  expect(plugin.remoteConfig).toEqual({ external, shareScope: scope })
})

it('executes the prebundle remote when host module and chunk IDs collide', async () => {
  const result = await runTaroPrebundleIntegration()
  expect(result.value).toBe('remote runtime survived')
  expect(result.moduleIds.every(id => id.startsWith('taro-prebundle-'))).toBe(true)
  expect(result.chunkIds.every(id => String(id).startsWith('taro-prebundle-'))).toBe(true)
})

it.each([
  { mode: 'production', nodeEnv: undefined, explicit: undefined, expected: 'production' },
  { mode: 'development', nodeEnv: undefined, explicit: undefined, expected: 'development' },
  { mode: 'production', nodeEnv: 'test', explicit: undefined, expected: 'test' },
  { mode: 'production', nodeEnv: 'test', explicit: 'custom', expected: 'custom' },
  { mode: 'production', nodeEnv: false as const, explicit: undefined, expected: undefined },
])('prebundles with the effective Webpack environment: $expected', ({ mode, nodeEnv, explicit, expected }) => {
  const runtime = createTaroPrebundleRuntime()
  const chain = runtime.createChain(mode, nodeEnv, explicit)
  expect(runtime.getDefines(chain)?.['process.env.NODE_ENV']).toBe(expected === undefined ? undefined : JSON.stringify(expected))
})
