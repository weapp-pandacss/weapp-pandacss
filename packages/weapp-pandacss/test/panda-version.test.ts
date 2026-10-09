import { getPackageInfoSync } from 'local-pkg'
import { getPandaVersion } from '@/panda/version'

vi.mock('local-pkg', () => ({ getPackageInfoSync: vi.fn() }))

it.each(['2.1.2', '2.1.3', undefined])('resolves installed Panda metadata, including a missing installation: %s', (version) => {
  vi.mocked(getPackageInfoSync).mockReturnValue(version ? { version } as ReturnType<typeof getPackageInfoSync> : undefined)
  expect(getPandaVersion()).toBe(version)
  expect(getPackageInfoSync).toHaveBeenCalledWith('@pandacss/dev', { paths: [expect.stringContaining('weapp-pandacss')] })
})
