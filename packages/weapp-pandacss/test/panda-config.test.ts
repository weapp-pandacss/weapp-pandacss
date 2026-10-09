import type { Config, PandaHooks } from '@pandacss/types'
import { weappPanda } from '@/panda'
import { getPandaVersion } from '@/panda/version'

vi.mock('@/panda/version', () => ({ getPandaVersion: vi.fn(() => '2.1.2') }))

function resolve(config: Config) {
  const hook = weappPanda().hooks!['config:resolved'] as PandaHooks['config:resolved']
  return hook({ config, path: '', dependencies: [], utils: {} as never })
}

afterEach(() => vi.mocked(getPandaVersion).mockReturnValue('2.1.2'))

it.each([{}, { hash: {} }, { prefix: {} }])('enables variable hashing with omitted config fields: %j', async (input) => {
  // JavaScript configs can omit fields required by Panda's TypeScript schema.
  expect(await resolve(input as unknown as Config)).toMatchObject({ hash: { className: false, cssVar: true } })
})

it('normalizes string prefixes, direct recipes and extended slot recipes without mutating input', async () => {
  const original = {
    prefix: '-demo/中文',
    theme: {
      recipes: { readable: { className: 'button' }, anonymous: {}, empty: { className: '' } },
      slotRecipes: { slots: { className: '2slot', slots: ['root'] } },
      extend: {
        recipes: { slash: { className: 'a/b' } },
        slotRecipes: { marker: { className: '_wp_card', slots: ['root'] } },
      },
    },
  } as unknown as Config // Also exercises an unnamed recipe from a JS config.
  const before = structuredClone(original)
  const resolved = await resolve(original)
  expect(original).toEqual(before)
  expect(resolved).toMatchObject({
    prefix: { className: '_wp_2d_demo_wp_2f__wp_4e2d__wp_6587_', cssVar: '_wp_2d_demo_wp_2f__wp_4e2d__wp_6587_' },
    theme: {
      recipes: { readable: { className: 'button' }, anonymous: {}, empty: { className: '' } },
      slotRecipes: { slots: { className: '_wp_32_slot', slots: ['root'] } },
      extend: { recipes: { slash: { className: 'a/b' } }, slotRecipes: { marker: { className: '_wp_5f_wp_card' } } },
    },
  })
})

it('leaves empty prefix properties and themes without recipes unchanged', async () => {
  expect(await resolve({ prefix: { className: '', cssVar: '' }, theme: { extend: {} } })).toMatchObject({ prefix: { className: '', cssVar: '' }, theme: { extend: {} } })
})

it('registers a synchronous generation hook that rejects invalid artifacts', () => {
  const hook = weappPanda().hooks!['codegen:prepare'] as PandaHooks['codegen:prepare']
  expect(() => hook({ artifacts: [] } as never)).toThrow('Cannot find Panda helpers')
})

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
