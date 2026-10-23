import assert from 'node:assert/strict'
import { parseAllDocuments } from 'yaml'

interface Dependency { specifier: string, version: string }
interface Importer {
  dependencies?: Record<string, Dependency>
  devDependencies?: Record<string, Dependency>
  optionalDependencies?: Record<string, Dependency>
}
interface Snapshot extends Record<string, unknown> {
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}
interface Lockfile {
  lockfileVersion: string
  settings: Record<string, unknown>
  importers: Record<string, Importer>
  packages: Record<string, Record<string, unknown>>
  snapshots: Record<string, Snapshot>
}
export interface PackedManifest {
  name: string
  version: string
  dependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  peerDependenciesMeta?: Record<string, { optional?: boolean }>
  engines?: Record<string, string>
}
interface PackedDependency { manifest: PackedManifest, integrity: string, reference: string }

/** Export the installed workspace's resolution graph, without registry metadata. */
export function createInstalledConsumerLock(text: string, packed: Record<'runtime' | 'adapter', PackedDependency>, pandaVersion: string) {
  const documents = parseAllDocuments(text)
  for (const document of documents) {
    assert.equal(document.errors.length, 0, 'The workspace lockfile must be valid YAML')
  }
  // Native pnpm puts its package-manager lock in a separate YAML document.
  const locks = documents.map(document => document.toJS() as Lockfile)
    .filter(lock => lock?.importers?.['packages/weapp-pandacss'])
  assert.equal(locks.length, 1, 'Expected one workspace dependency lockfile')
  const source = locks[0]!
  assert.equal(source.lockfileVersion, '9.0', 'Review consumer lock export when pnpm changes its lockfile format')
  const packages: Lockfile['packages'] = {}
  const snapshots: Lockfile['snapshots'] = {}
  const dependencies: Record<string, Dependency> = {}

  function retain(name: string, reference: string) {
    const key = Object.hasOwn(source.snapshots, reference) ? reference : `${name}@${reference}`
    assert(source.snapshots[key], `Missing locked consumer snapshot: ${key}`)
    if (snapshots[key]) {
      return
    }
    // Preserve peer contexts, optional edges, platform constraints and integrity.
    const packageKey = key.split('(')[0]!
    assert(source.packages[packageKey], `Missing locked consumer package: ${packageKey}`)
    packages[packageKey] = source.packages[packageKey]
    snapshots[key] = source.snapshots[key]
    for (const [dependency, version] of Object.entries({ ...snapshots[key].dependencies, ...snapshots[key].optionalDependencies })) {
      retain(dependency, version)
    }
  }

  function locked(name: string, importerName: string, sourceName = name) {
    const importer = source.importers[importerName]
    assert(importer, `Missing locked importer: ${importerName}`)
    const entry = { ...importer.devDependencies, ...importer.optionalDependencies, ...importer.dependencies }[sourceName]
    assert(entry, `Missing locked dependency: ${importerName} / ${sourceName}`)
    const version = entry.version.startsWith(`${name}@`) ? entry.version.slice(name.length + 1) : entry.version
    retain(name, version)
    return version
  }

  for (const name of ['@pandacss/dev', '@pandacss/preset-base', '@pandacss/preset-panda']) {
    const sourceName = pandaVersion === '2.1.2' ? `${name}-2-1-2` : name
    const version = locked(name, 'packages/weapp-pandacss', sourceName)
    assert.equal(version.split('(')[0], pandaVersion, `Wrong locked Panda cohort: ${name}`)
    dependencies[name] = { specifier: pandaVersion, version }
  }
  for (const name of ['postcss', 'typescript', '@types/node']) {
    const version = locked(name, '.')
    dependencies[name] = { specifier: version.split('(')[0]!, version }
  }

  for (const [kind, importerName] of [['runtime', 'packages/runtime'], ['adapter', 'packages/weapp-pandacss']] as const) {
    const { manifest, integrity, reference } = packed[kind]
    const peers = Object.keys(manifest.peerDependencies ?? {}).sort().map((name) => {
      assert(dependencies[name], `The consumer must supply the packed peer: ${name}`)
      return `(${name}@${dependencies[name].version})`
    }).join('')
    packages[`${manifest.name}@${reference}`] = {
      resolution: { integrity, tarball: reference },
      version: manifest.version,
      ...(manifest.engines && { engines: manifest.engines }),
      ...(manifest.peerDependencies && { peerDependencies: manifest.peerDependencies }),
      ...(manifest.peerDependenciesMeta && { peerDependenciesMeta: manifest.peerDependenciesMeta }),
    }
    const snapshot: Snapshot = {}
    for (const section of ['dependencies', 'optionalDependencies'] as const) {
      const entries = section === 'dependencies' ? { ...manifest.dependencies, ...manifest.peerDependencies } : manifest[section]
      for (const name of Object.keys(entries ?? {})) {
        const version = name === packed.runtime.manifest.name
          ? packed.runtime.reference
          : manifest.peerDependencies?.[name] ? dependencies[name]!.version : locked(name, importerName)
        const target = snapshot[section] ??= {}
        target[name] = version
      }
    }
    snapshots[`${manifest.name}@${reference}${peers}`] = snapshot
    dependencies[manifest.name] = { specifier: reference, version: `${reference}${peers}` }
  }

  return {
    lockfileVersion: source.lockfileVersion,
    settings: source.settings,
    overrides: { [packed.runtime.manifest.name]: packed.runtime.reference },
    importers: { '.': { dependencies } },
    packages,
    snapshots,
  }
}
