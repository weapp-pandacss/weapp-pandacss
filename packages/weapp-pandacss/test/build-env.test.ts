import { execFile } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { resolveBuildEnv } from '../../../examples/build-env.cjs'

const run = promisify(execFile)
const entry = path.resolve(import.meta.dirname, '../../../examples/build-env.cjs')

afterEach(() => vi.unstubAllEnvs())

describe('example build environment', () => {
  it.each([
    ['taro', 'weapp'],
    ['uni', 'mp-weixin'],
  ] as const)('keeps the %s default for missing and empty platform values', (framework, platform) => {
    expect(resolveBuildEnv(framework, {})).toEqual({ platform, cssTarget: 'weapp' })
    expect(resolveBuildEnv(framework, { TARO_ENV: '', UNI_PLATFORM: '' })).toEqual({ platform, cssTarget: 'weapp' })
  })

  it.each([
    ['taro', 'weapp', 'weapp'],
    ['taro', 'alipay', 'weapp'],
    ['taro', 'swan', 'weapp'],
    ['taro', 'tt', 'weapp'],
    ['taro', 'h5', 'web'],
    ['uni', 'mp-weixin', 'weapp'],
    ['uni', 'mp-alipay', 'weapp'],
    ['uni', 'mp-baidu', 'weapp'],
    ['uni', 'mp-toutiao', 'weapp'],
    ['uni', 'h5', 'web'],
  ] as const)('preserves the %s %s output directory and CSS target', (framework, platform, cssTarget) => {
    const env = framework === 'taro' ? { TARO_ENV: platform } : { UNI_PLATFORM: platform }
    expect(resolveBuildEnv(framework, env)).toEqual({ platform, cssTarget })
  })

  it.each(['web', 'web-desktop', 'webview', 'H5', ' h5 ', 'rn', 'app', 'app-ios', 'quickapp-webview', 'unknown'])('keeps %s unchanged without extending platform support', (platform) => {
    expect(resolveBuildEnv('taro', { TARO_ENV: platform })).toEqual({ platform, cssTarget: 'weapp' })
    expect(resolveBuildEnv('uni', { UNI_PLATFORM: platform })).toEqual({ platform, cssTarget: 'weapp' })
  })

  it('selects the requested framework when both platform variables are present', () => {
    const env = Object.freeze({ TARO_ENV: 'h5', UNI_PLATFORM: 'mp-alipay' })
    expect(resolveBuildEnv('taro', env)).toEqual({ platform: 'h5', cssTarget: 'web' })
    expect(resolveBuildEnv('uni', env)).toEqual({ platform: 'mp-alipay', cssTarget: 'weapp' })
    const reversed = Object.freeze({ TARO_ENV: 'weapp', UNI_PLATFORM: 'h5' })
    expect(resolveBuildEnv('taro', reversed)).toEqual({ platform: 'weapp', cssTarget: 'weapp' })
    expect(resolveBuildEnv('uni', reversed)).toEqual({ platform: 'h5', cssTarget: 'web' })
  })

  it('uses frozen partial and empty snapshots without reading or mutating process.env', () => {
    vi.stubEnv('TARO_ENV', 'h5')
    vi.stubEnv('UNI_PLATFORM', 'h5')
    const empty = Object.freeze({})
    const taro = Object.freeze({ TARO_ENV: 'alipay' })
    const uni = Object.freeze({ UNI_PLATFORM: 'mp-baidu' })
    expect(resolveBuildEnv('taro', empty)).toEqual({ platform: 'weapp', cssTarget: 'weapp' })
    expect(resolveBuildEnv('uni', empty)).toEqual({ platform: 'mp-weixin', cssTarget: 'weapp' })
    expect(resolveBuildEnv('taro', taro)).toEqual({ platform: 'alipay', cssTarget: 'weapp' })
    expect(resolveBuildEnv('uni', taro)).toEqual({ platform: 'mp-weixin', cssTarget: 'weapp' })
    expect(resolveBuildEnv('uni', uni)).toEqual({ platform: 'mp-baidu', cssTarget: 'weapp' })
    expect(resolveBuildEnv('taro', uni)).toEqual({ platform: 'weapp', cssTarget: 'weapp' })
    expect(empty).toEqual({})
    expect(taro).toEqual({ TARO_ENV: 'alipay' })
    expect(uni).toEqual({ UNI_PLATFORM: 'mp-baidu' })
    expect(process.env['TARO_ENV']).toBe('h5')
    expect(process.env['UNI_PLATFORM']).toBe('h5')
  })

  it.each(['cjs', 'esm'] as const)('supports a real Node %s named export without ambient environment fallback', async (format) => {
    const imports = format === 'esm'
      ? `import { resolveBuildEnv } from ${JSON.stringify(pathToFileURL(entry).href)};`
      : 'const { resolveBuildEnv } = require(process.argv[1]);'
    const script = `${imports}
      const empty = Object.freeze({});
      console.log(JSON.stringify([
        resolveBuildEnv('taro', Object.freeze({ TARO_ENV: 'h5' })),
        resolveBuildEnv('uni', Object.freeze({ UNI_PLATFORM: 'mp-weixin' })),
        resolveBuildEnv('taro', empty),
        resolveBuildEnv('uni', empty),
      ]));
    `
    const args = format === 'esm' ? ['--input-type=module', '-e', script] : ['-e', script, entry]
    const result = await run(process.execPath, args, {
      env: { ...process.env, TARO_ENV: 'h5', UNI_PLATFORM: 'h5' },
    })
    expect(JSON.parse(result.stdout)).toEqual([
      { platform: 'h5', cssTarget: 'web' },
      { platform: 'mp-weixin', cssTarget: 'weapp' },
      { platform: 'weapp', cssTarget: 'weapp' },
      { platform: 'mp-weixin', cssTarget: 'weapp' },
    ])
  })
})
