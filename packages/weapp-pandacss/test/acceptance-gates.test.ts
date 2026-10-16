import { idePrerequisites } from '../../../e2e/acceptance.ts'
import { compareAudit, dependencyChains, readWorkspaceLock } from '../../../e2e/audit.ts'

const lock = {
  importers: { '.': { dependencies: { vulnerable: { version: '1.0.0' } } }, 'packages/weapp-pandacss': {} },
  snapshots: { 'vulnerable@1.0.0': {} },
}
const audit = {
  advisories: { existing: { github_advisory_id: 'GHSA-aaaa-bbbb-cccc', module_name: 'vulnerable', severity: 'high', findings: [{ version: '1.0.0' }] } },
  metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 1, critical: 0 } },
}
const baseline = {
  schemaVersion: 1,
  advisories: [{ id: 'GHSA-aaaa-bbbb-cccc', module: 'vulnerable', severity: 'high', versions: ['1.0.0'] }],
  vulnerabilities: audit.metadata.vulnerabilities,
  chains: dependencyChains(lock, ['vulnerable@1.0.0']),
}

it('compares the reviewed advisories and complete reachable chains without audit path enumeration', () => {
  expect(compareAudit(audit, baseline, lock)).toMatchObject({ passed: true, problems: [] })
  expect(compareAudit({ ...audit, advisories: {}, metadata: { vulnerabilities: { info: 0, low: 0, moderate: 0, high: 0, critical: 0 } } }, baseline, lock))
    .toMatchObject({ passed: true, removedAdvisories: ['GHSA-aaaa-bbbb-cccc'] })
})

it('rejects a new GHSA even when the advisory count and affected package are unchanged', () => {
  const changed = structuredClone(audit)
  changed.advisories.existing.github_advisory_id = 'GHSA-dddd-eeee-ffff'
  expect(compareAudit(changed, baseline, lock)).toMatchObject({ passed: false, problems: [expect.stringContaining('New advisory')] })
})

it('rejects escalation and malformed vulnerability metadata', () => {
  const changed = structuredClone(audit)
  changed.advisories.existing.severity = 'critical'
  changed.metadata.vulnerabilities.high = 0
  changed.metadata.vulnerabilities.critical = 1
  expect(compareAudit(changed, baseline, lock).problems).toContain('Changed module or increased severity: GHSA-aaaa-bbbb-cccc')
  expect(() => compareAudit({ ...audit, metadata: { vulnerabilities: {} } }, baseline, lock)).toThrow('Missing vulnerability count')
  expect(() => compareAudit({ ...audit, advisories: {} }, baseline, lock)).toThrow('Incomplete advisory data')
})

it('rejects incomplete affected-module data instead of silently omitting dependency checks', () => {
  const changed = structuredClone(audit)
  changed.advisories.existing.findings = []
  expect(() => compareAudit(changed, baseline, lock)).toThrow('affected findings')
  changed.advisories.existing.findings = [{ version: '' }]
  expect(() => compareAudit(changed, baseline, lock)).toThrow('affected version')
  changed.advisories.existing.findings = [{ version: '1.0.0' }]
  changed.advisories.existing.module_name = ''
  expect(() => compareAudit(changed, baseline, lock)).toThrow('affected module')
  expect(() => compareAudit({ ...audit, advisories: { ...audit.advisories, duplicate: audit.advisories.existing } }, baseline, lock)).toThrow('identities must be unique')
})

it('rejects a new affected version of an existing advisory', () => {
  const changed = structuredClone(audit)
  changed.advisories.existing.findings[0]!.version = '2.0.0'
  const graph = { importers: { '.': { dependencies: { vulnerable: { version: '2.0.0' } } }, 'packages/weapp-pandacss': {} }, snapshots: { 'vulnerable@2.0.0': {} } }
  const result = compareAudit(changed, baseline, graph)
  expect(result.passed).toBe(false)
  expect(result.problems).toContain('New affected version: GHSA-aaaa-bbbb-cccc vulnerable@2.0.0')
})

it('rejects a new chain within an already affected workspace', () => {
  const graph = {
    importers: { '.': { dependencies: { vulnerable: { version: '1.0.0' }, another: { version: '1.0.0' } } }, 'packages/weapp-pandacss': {} },
    snapshots: { ...lock.snapshots, 'another@1.0.0': { dependencies: { vulnerable: '1.0.0' } } },
  }
  const result = compareAudit(audit, baseline, graph)
  expect(result.passed).toBe(false)
  expect(result.problems).toContainEqual(expect.stringContaining('another@1.0.0 > vulnerable@1.0.0'))
})

it('follows workspace links, aliases and cycles while preserving the real affected source', () => {
  const graph = {
    importers: { '.': { devDependencies: { adapter: { version: 'link:packages/weapp-pandacss' } } }, 'packages/weapp-pandacss': { dependencies: { alias: { version: 'vulnerable@1.0.0' } } } },
    snapshots: { 'vulnerable@1.0.0': { optionalDependencies: { cycle: '1.0.0' } }, 'cycle@1.0.0': { dependencies: { vulnerable: '1.0.0' } } },
  }
  const chains = dependencyChains(graph, ['vulnerable@1.0.0'])['vulnerable@1.0.0']!
  expect(Object.keys(chains)).toEqual(['.', 'packages/weapp-pandacss'])
  expect(chains['.']).toContain('workspace:. > workspace:packages/weapp-pandacss')
  expect(chains['packages/weapp-pandacss']).toContain('workspace:packages/weapp-pandacss > vulnerable@1.0.0')
  expect(() => dependencyChains(graph, ['missing@1.0.0'])).toThrow('missing from the lockfile')
})

it('selects the workspace document of a native-pnpm multi-document lockfile and rejects unresolved edges', () => {
  const text = `${JSON.stringify({ importers: { '.': {} }, snapshots: {} })}\n---\n${JSON.stringify(lock)}\n`
  expect(readWorkspaceLock(text)).toEqual(lock)
  expect(() => readWorkspaceLock(JSON.stringify({ importers: {}, snapshots: {} }))).toThrow('exactly one workspace')
  expect(() => dependencyChains({ ...lock, snapshots: {} }, ['vulnerable@1.0.0'])).toThrow('Unresolved dependency snapshot')
})

it('requires a verified real IDE and rejects stale or future official-version evidence', () => {
  const now = Date.parse('2026-10-16T00:00:00Z')
  const env = {
    WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH: process.execPath,
    WEAPP_VITE_E2E_APPID: 'wx0123456789abcdef',
    WEAPP_VITE_E2E_DEVTOOLS_STABLE_VERSION: '2.02.2608080',
    WEAPP_VITE_E2E_DEVTOOLS_INSTALLED_VERSION: '2.02.2608080',
    WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT: new Date(now - 1000).toISOString(),
  }
  expect(idePrerequisites(env, now).stableVersion).toBe('2.02.2608080')
  expect(() => idePrerequisites({ ...env, WEAPP_VITE_E2E_APPID: 'touristappid' }, now)).toThrow('authorized real AppID')
  expect(() => idePrerequisites({ ...env, WEAPP_VITE_E2E_DEVTOOLS_INSTALLED_VERSION: 'nightly' }, now)).toThrow('must match')
  expect(() => idePrerequisites({ ...env, WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT: new Date(now + 1).toISOString() }, now)).toThrow('within 24 hours')
  expect(() => idePrerequisites({ ...env, WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT: new Date(now - 86_400_000).toISOString() }, now)).toThrow('within 24 hours')
})
