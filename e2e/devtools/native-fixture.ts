import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseAllDocuments } from 'yaml'

export interface NativeFixtureIdentity {
  schemaVersion: 1
  sha256: string
  files: Record<string, string>
}

interface Packages { runtime: string, adapter: string }
interface Tarball { name: keyof Packages, file: string, sha256: string }
const sourceFiles = ['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml', 'panda.config.mjs', 'build-scenario.mjs', 'scenario.json', 'resolution.json', 'output.wxss', 'output.wxss.map', 'output.css', 'cli.css', 'cli-build.css']
const sourceDirectories = ['src', 'typed', 'styled-system', 'built']
const miniFiles = ['app.js', 'app.json', 'app.wxss', 'generated/classes.js', 'pages/index/index.js', 'pages/index/index.wxml']
const installationFiles = new Set(['package.json', 'pnpm-workspace.yaml', 'pnpm-lock.yaml'])
const hash = (contents: Uint8Array | string) => createHash('sha256').update(contents).digest('hex')

async function regularFile(file: string) {
  assert((await fs.lstat(file)).isFile(), `Native fixture must contain a regular file: ${file}`)
  return fs.readFile(file)
}

function mapStrings(value: unknown, transform: (value: string) => string): unknown {
  if (typeof value === 'string') {
    return transform(value)
  }
  if (Array.isArray(value)) {
    return value.map(item => mapStrings(item, transform))
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [transform(key), mapStrings(item, transform)] as const)
    assert.equal(new Set(entries.map(([key]) => key)).size, entries.length, 'Native metadata normalization must preserve every dependency entry')
    return Object.fromEntries(entries)
  }
  return value
}

function readMetadata(text: string) {
  const documents = parseAllDocuments(text)
  assert.equal(documents.length, 1, 'Native fixture metadata must contain exactly one document')
  assert.equal(documents[0]!.errors.length, 0, 'Native fixture metadata must be valid JSON or YAML')
  const value: unknown = documents[0]!.toJS()
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Native fixture metadata must be an object')
  return value
}

/** Keep fresh installations comparable without erasing dependency or package differences. */
export async function retainNativeFixture(options: { root: string, evidence: string, packages: Packages }): Promise<NativeFixtureIdentity> {
  const { root, evidence, packages } = options
  const physicalRoot = await fs.realpath(root)
  const roots = [...new Set([path.resolve(root), physicalRoot])].sort((a, b) => b.length - a.length)
  const tarballs: Tarball[] = []
  const packagePaths = new Map<string, string>()
  for (const name of ['adapter', 'runtime'] as const) {
    const source = packages[name]
    const file = path.basename(source)
    assert(file.endsWith('.tgz') && !tarballs.some(tarball => tarball.file === file), 'Native fixture needs two distinct tarball files')
    const contents = await regularFile(source)
    await fs.writeFile(path.join(evidence, file), contents, { flag: 'wx' })
    tarballs.push({ name, file, sha256: hash(contents) })
    for (const sourcePath of [path.resolve(source), await fs.realpath(source)]) {
      packagePaths.set(sourcePath, `file:../${file}`)
    }
  }
  function normalizePackages(value: string) {
    // Only the two verified package paths are portable. Keep every version,
    // integrity, peer suffix and unrelated file reference in the lockfile.
    return value.replace(/file:([^()]+?\.tgz)/g, (reference, file: string) => packagePaths.get(path.resolve(root, file)) ?? reference)
  }
  function normalizeConsumer(value: string) {
    for (const alias of roots) {
      value = value === alias ? '<consumer>' : value.replaceAll(`${alias}${path.sep}`, `<consumer>${path.sep}`)
    }
    return value
  }
  const source = path.join(evidence, 'source')
  await fs.mkdir(source)
  for (const file of sourceFiles) {
    const contents = await regularFile(path.join(root, file))
    let output: Uint8Array | string = contents
    if (installationFiles.has(file) || file === 'scenario.json') {
      output = `${JSON.stringify(mapStrings(readMetadata(contents.toString()), installationFiles.has(file) ? normalizePackages : normalizeConsumer), null, 2)}\n`
    }
    else if (file === 'resolution.json') {
      const resolution = JSON.parse(contents.toString()) as Record<string, unknown>
      assert.equal(resolution['runtime'], resolution['adapterRuntime'], 'Native consumer must use the same installed runtime')
      for (const [key, name] of [['adapter', 'weapp-pandacss'], ['runtime', '@weapp-pandacss/runtime'], ['adapterRuntime', '@weapp-pandacss/runtime']] as const) {
        const resolved = resolution[key]
        assert(typeof resolved === 'string', `Native consumer is missing its ${key} resolution`)
        const relative = path.relative(physicalRoot, resolved)
        assert(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), 'Native consumer must resolve its own installed packages')
        const marker = `${path.sep}node_modules${path.sep}${name.split('/').join(path.sep)}${path.sep}`
        const index = resolved.lastIndexOf(marker)
        assert(index >= 0, `Native consumer resolution must identify ${name}`)
        // pnpm's virtual-store directory includes a temporary-root hash. The
        // package identity and complete package-relative entry remain bound.
        resolution[key] = `${name}/${resolved.slice(index + marker.length).split(path.sep).join('/')}`
      }
      for (const key of ['node', 'panda', 'plugin']) {
        assert(typeof resolution[key] === 'string' && resolution[key], `Native consumer is missing its ${key} identity`)
      }
      output = `${JSON.stringify(mapStrings(resolution, normalizeConsumer), null, 2)}\n`
    }
    await fs.writeFile(path.join(source, file), output, { flag: 'wx' })
  }
  for (const directory of [...sourceDirectories, 'miniprogram']) {
    assert((await fs.lstat(path.join(root, directory))).isDirectory(), `Native fixture must contain a directory: ${directory}`)
    await fs.cp(path.join(root, directory), path.join(directory === 'miniprogram' ? evidence : source, directory), { recursive: true, errorOnExist: true, force: false })
  }
  // AppID-bearing project.config.json is deliberately outside the retained
  // source and app trees. No blanket JSON or source exclusions are applied.
  await fs.writeFile(path.join(evidence, 'tarballs.json'), `${JSON.stringify(tarballs, null, 2)}\n`, { flag: 'wx' })
  // eslint-disable-next-line ts/no-use-before-define -- Shared digest runs after module initialization.
  const identity = await digestNativeFixture(evidence)
  await fs.writeFile(path.join(evidence, 'fixture-identity.json'), `${JSON.stringify(identity, null, 2)}\n`, { flag: 'wx' })
  return identity
}

async function digestNativeFixture(evidence: string): Promise<NativeFixtureIdentity> {
  const files: Record<string, string> = {}
  const add = async (relative: string) => {
    files[relative] = hash(await regularFile(path.join(evidence, relative)))
  }
  const tarballText = await regularFile(path.join(evidence, 'tarballs.json'))
  const tarballs: unknown = JSON.parse(tarballText.toString())
  assert(Array.isArray(tarballs) && tarballs.length === 2, 'Native fixture must retain exactly two tarballs')
  const roles = new Set<string>()
  const names = new Set<string>()
  for (const tarball of tarballs as Tarball[]) {
    assert(tarball && (tarball.name === 'adapter' || tarball.name === 'runtime') && !roles.has(tarball.name), 'Native fixture tarball roles must be unique')
    assert(typeof tarball.file === 'string' && path.basename(tarball.file) === tarball.file && tarball.file.endsWith('.tgz') && !names.has(tarball.file), 'Native fixture tarball names must be distinct safe basenames')
    assert(typeof tarball.sha256 === 'string' && /^[a-f\d]{64}$/.test(tarball.sha256), 'Native fixture tarball digest is invalid')
    await add(tarball.file)
    assert.equal(files[tarball.file], tarball.sha256, `Native fixture tarball changed: ${tarball.name}`)
    roles.add(tarball.name)
    names.add(tarball.file)
  }
  files['tarballs.json'] = hash(tarballText)
  async function collect(directory: string) {
    assert((await fs.lstat(path.join(evidence, directory))).isDirectory(), `Native fixture must retain a directory: ${directory}`)
    const entries = await fs.readdir(path.join(evidence, directory), { withFileTypes: true })
    assert(entries.length, `Native fixture directory must not be empty: ${directory}`)
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = `${directory}/${entry.name}`
      if (entry.isDirectory()) {
        await collect(relative)
      }
      else {
        assert(entry.isFile(), `Native fixture contains an unexpected non-file: ${relative}`)
        await add(relative)
      }
    }
  }
  for (const file of sourceFiles) {
    await regularFile(path.join(evidence, 'source', file))
  }
  for (const directory of sourceDirectories) {
    assert((await fs.readdir(path.join(evidence, 'source', directory))).length, `Native fixture source directory must not be empty: ${directory}`)
  }
  for (const file of miniFiles) {
    await regularFile(path.join(evidence, 'miniprogram', file))
  }
  await collect('source')
  await collect('miniprogram')
  const ordered = Object.fromEntries(Object.entries(files).sort(([a], [b]) => a.localeCompare(b)))
  return { schemaVersion: 1, sha256: hash(JSON.stringify(ordered)), files: ordered }
}

/** Re-read retained bytes, then compare rounds; never trust self-reported hashes. */
export async function verifyNativeFixture(evidence: string, expected?: NativeFixtureIdentity): Promise<NativeFixtureIdentity> {
  const identity = await digestNativeFixture(evidence)
  const recorded: unknown = JSON.parse((await regularFile(path.join(evidence, 'fixture-identity.json'))).toString())
  assert.deepEqual(recorded, identity, 'Native fixture payload differs from its recorded identity')
  if (expected) {
    assert.deepEqual(identity, expected, 'Native installed packages, dependency lock, sources or generated app changed between IDE rounds')
  }
  return identity
}
