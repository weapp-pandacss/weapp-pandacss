import type { Config, PandaHooks } from '@pandacss/types'
import { weappPanda } from '@/panda'
import { getPandaVersion } from '@/panda/version'

vi.mock('@/panda/version', () => ({ getPandaVersion: vi.fn(() => '2.1.2') }))

function resolve(config: Config) {
  const hook = weappPanda().hooks!['config:resolved'] as PandaHooks['config:resolved']
  return hook({ config, path: '', dependencies: [], utils: {} as never })
}

afterEach(() => vi.mocked(getPandaVersion).mockReturnValue('2.1.2'))

it.each(['2.1.3', undefined])('rejects unverified Panda version %s', (version) => {
  vi.mocked(getPandaVersion).mockReturnValue(version)
  expect(() => weappPanda()).toThrow('requires Panda CSS 2.1.2')
})

it.each([false, true, { className: true, cssVar: false }])('preserves class hash %j and enables native CSS variable hashing', async (hash) => {
  const original = { hash, prefix: { className: 'demo', cssVar: '中文/变量' } }
  const config = await resolve(original)
  expect(config).toMatchObject({ hash: { className: typeof hash === 'boolean' ? hash : true, cssVar: true }, prefix: { className: 'demo', cssVar: '_wp_4e2d__wp_6587__wp_2f__wp_53d8__wp_91cf_' } })
  expect(original.prefix.cssVar).toBe('中文/变量')
})

it('keeps numeric and literal marker recipe labels distinct before native CSS escaping', async () => {
  const config = await resolve({ theme: { recipes: { digit: { className: '2demo' }, marker: { className: '_wp_32_demo' } } } })
  expect(config).toMatchObject({ theme: { recipes: { digit: { className: '_wp_32_demo' }, marker: { className: '_wp_5f_wp_32_demo' } } } })
})
