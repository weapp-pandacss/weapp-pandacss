import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { verifyIdeRound } from '../../../e2e/acceptance.ts'
import { retainNativeFixture, verifyNativeFixture } from '../../../e2e/devtools/native-fixture.ts'

const temporaryRoots: string[] = []
const gitSha = '0123456789abcdef0123456789abcdef01234567'

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(root => fs.rm(root, { recursive: true, force: true })))
})

async function write(root: string, file: string, content: string) {
  const destination = path.join(root, file)
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.writeFile(destination, content)
}

async function createFixture() {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'panda-native-identity-'))
  temporaryRoots.push(temporary)
  const root = path.join(temporary, 'consumer')
  const round = path.join(temporary, 'round')
  const evidence = path.join(round, 'native/installed-consumer')
  const packages = {
    runtime: path.join(temporary, 'weapp-pandacss-runtime-1.0.1.tgz'),
    adapter: path.join(temporary, 'weapp-pandacss-2.3.0.tgz'),
  }
  await fs.mkdir(root)
  await fs.mkdir(evidence, { recursive: true })
  await fs.writeFile(packages.runtime, 'runtime tarball bytes\0')
  await fs.writeFile(packages.adapter, 'adapter tarball bytes\0')
  const physicalRoot = await fs.realpath(root)
  const temporaryHash = createHash('sha256').update(temporary).digest('hex').slice(0, 32)
  const adapter = path.join(physicalRoot, `node_modules/.pnpm/weapp-pandacss@file+temporary_${temporaryHash}/node_modules/weapp-pandacss/dist/panda.cjs`)
  const runtime = path.join(physicalRoot, `node_modules/.pnpm/@weapp-pandacss+runtime@file+temporary_${temporaryHash}/node_modules/@weapp-pandacss/runtime/dist/index.cjs`)
  const sources: Record<string, string> = {
    'package.json': JSON.stringify({ private: true, type: 'module', dependencies: {
      'weapp-pandacss': `file:${packages.adapter}`,
      '@weapp-pandacss/runtime': `file:${packages.runtime}`,
      '@pandacss/dev': '2.2.0',
    } }),
    'pnpm-workspace.yaml': `packages: []\noverrides:\n  '@weapp-pandacss/runtime': file:${packages.runtime}\n`,
    'pnpm-lock.yaml': `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      weapp-pandacss:\n        specifier: file:${packages.adapter}\n        version: file:../weapp-pandacss-2.3.0.tgz(postcss@8.5.30)\n      '@weapp-pandacss/runtime':\n        specifier: file:${packages.runtime}\n        version: file:../weapp-pandacss-runtime-1.0.1.tgz\npackages:\n  '@pandacss/dev@2.2.0':\n    resolution: {integrity: sha512-original-integrity}\n    peerDependencies: {postcss: 8.5.30}\nsnapshots:\n  '@pandacss/dev@2.2.0(postcss@8.5.30)':\n    dependencies: {postcss: 8.5.30}\n`,
    'panda.config.mjs': 'export default { include: [\'./src/styles.mjs\'] }\n',
    'build-scenario.mjs': 'import \'./src/styles.mjs\'\n',
    'scenario.json': JSON.stringify({ node: process.version, panda: '2.2.0', classes: { atomic: 'c_blue' }, diagnostics: [{ file: path.join(physicalRoot, 'src/app.css') }] }),
    'resolution.json': JSON.stringify({ node: process.version, panda: '2.2.0', plugin: 'weapp-pandacss', adapter, runtime, adapterRuntime: runtime }),
    'output.wxss': '.c_blue{color:#00f}\n',
    'output.wxss.map': JSON.stringify({ version: 3, sources: ['src/app.css'], sourcesContent: ['.c_blue{color:blue}'], names: [], mappings: '', file: 'output.wxss' }),
    'output.css': '.c_blue{color:blue}\n',
    'cli.css': '@layer utilities{.c_blue{color:blue}}\n',
    'cli-build.css': '@layer utilities{.c_blue{color:blue}}\n',
    'src/styles.mjs': 'export const atomic = \'c_blue\'\n',
    'src/app.css': '.c_blue{color:blue}\n',
    'typed/consumer.mts': 'export const atomic: string = \'c_blue\'\n',
    'styled-system/helpers.mjs': 'export const identity = value => value\n',
    'built/consumer.mjs': 'export const atomic = \'c_blue\'\n',
    'miniprogram/app.js': 'App({})\n',
    'miniprogram/app.json': '{"pages":["pages/index/index"]}\n',
    'miniprogram/app.wxss': '.c_blue{color:#00f}\n',
    'miniprogram/generated/classes.js': 'module.exports={atomic:"c_blue"}\n',
    'miniprogram/pages/index/index.js': 'Page({})\n',
    'miniprogram/pages/index/index.wxml': '<view class="c_blue">probe</view>\n',
    'project.config.json': '{"appid":"wx0123456789abcdef"}\n',
  }
  for (const [file, content] of Object.entries(sources)) {
    await write(root, file, content)
  }
  await write(path.dirname(adapter), path.basename(adapter), 'adapter entry\n')
  await write(path.dirname(runtime), path.basename(runtime), 'runtime entry\n')
  return { root, round, evidence, packages }
}

it('binds independent consumers despite temporary roots and pnpm store directory hashes', async () => {
  const first = await createFixture()
  const second = await createFixture()
  await fs.writeFile(path.join(second.root, 'project.config.json'), '{"appid":"wx1111111111111111"}')
  const identity = await retainNativeFixture(first)
  expect(await retainNativeFixture(second)).toEqual(identity)
  expect(await verifyNativeFixture(first.evidence)).toEqual(identity)
  expect(await verifyNativeFixture(second.evidence, identity)).toEqual(identity)
  const retained = await fs.readdir(first.evidence, { recursive: true })
  expect(retained.some(file => path.basename(file) === 'project.config.json')).toBe(false)
})

it('verifies retained bytes after the original consumer and tarballs are removed', async () => {
  const fixture = await createFixture()
  const identity = await retainNativeFixture(fixture)
  await fs.rm(fixture.root, { recursive: true })
  await fs.rm(fixture.packages.runtime)
  await fs.rm(fixture.packages.adapter)
  expect(await verifyNativeFixture(fixture.evidence, identity)).toEqual(identity)
})

it.each([
  ['dependency', 'dependencies: {postcss: 8.5.30}', 'dependencies: {postcss: 8.5.31}'],
  ['peer', 'peerDependencies: {postcss: 8.5.30}', 'peerDependencies: {postcss: 9.0.0}'],
  ['peer context', 'weapp-pandacss-2.3.0.tgz(postcss@8.5.30)', 'weapp-pandacss-2.3.0.tgz(postcss@9.0.0)'],
  ['integrity', 'sha512-original-integrity', 'sha512-changed-integrity'],
] as const)('rejects a changed lockfile %s between independently retained rounds', async (_name, before, after) => {
  const first = await createFixture()
  const second = await createFixture()
  const identity = await retainNativeFixture(first)
  const file = path.join(second.root, 'pnpm-lock.yaml')
  await fs.writeFile(file, (await fs.readFile(file, 'utf8')).replace(before, after))
  const changed = await retainNativeFixture(second)
  expect(changed).not.toEqual(identity)
  await expect(verifyNativeFixture(second.evidence, identity)).rejects.toThrow()
})

it('keeps ordinary source bytes significant even when they contain the temporary root', async () => {
  const first = await createFixture()
  const second = await createFixture()
  await write(first.root, 'src/styles.mjs', `export const location = ${JSON.stringify(first.root)}\n`)
  await write(second.root, 'src/styles.mjs', `export const location = ${JSON.stringify(second.root)}\n`)
  const identity = await retainNativeFixture(first)
  await retainNativeFixture(second)
  await expect(verifyNativeFixture(second.evidence, identity)).rejects.toThrow()
})

it('keeps unrelated file dependencies significant instead of normalizing every tarball reference', async () => {
  const first = await createFixture()
  const second = await createFixture()
  for (const fixture of [first, second]) {
    await fs.appendFile(path.join(fixture.root, 'pnpm-workspace.yaml'), `  unrelated: file:${path.join(path.dirname(fixture.root), 'unrelated.tgz')}\n`)
  }
  const identity = await retainNativeFixture(first)
  await retainNativeFixture(second)
  await expect(verifyNativeFixture(second.evidence, identity)).rejects.toThrow()
})

it('keeps unverified file dependencies inside the consumer root significant', async () => {
  const first = await createFixture()
  const second = await createFixture()
  for (const fixture of [first, second]) {
    await fs.appendFile(path.join(fixture.root, 'pnpm-workspace.yaml'), `  unrelated: file:${path.join(fixture.root, 'unrelated.tgz')}\n`)
  }
  const identity = await retainNativeFixture(first)
  await retainNativeFixture(second)
  await expect(verifyNativeFixture(second.evidence, identity)).rejects.toThrow()
})

it.each(['tarball', 'source', 'miniprogram'] as const)('rejects changed %s bytes before the second snapshot is retained', async (kind) => {
  const first = await createFixture()
  const second = await createFixture()
  const identity = await retainNativeFixture(first)
  const file = kind === 'tarball' ? second.packages.runtime : path.join(second.root, kind === 'source' ? 'src/styles.mjs' : 'miniprogram/app.wxss')
  await fs.appendFile(file, '\nchanged bytes\n')
  await retainNativeFixture(second)
  await expect(verifyNativeFixture(second.evidence, identity)).rejects.toThrow()
})

it.each([
  ['tarball', 'modify'],
  ['tarball', 'delete'],
  ['source', 'modify'],
  ['source', 'delete'],
  ['source', 'add'],
  ['miniprogram', 'modify'],
  ['miniprogram', 'delete'],
  ['miniprogram', 'add'],
] as const)('rejects retained %s %s without trusting its recorded manifest', async (kind, mutation) => {
  const fixture = await createFixture()
  const identity = await retainNativeFixture(fixture)
  const file = kind === 'tarball'
    ? path.basename(fixture.packages.runtime)
    : kind === 'source' ? 'source/src/styles.mjs' : 'miniprogram/app.wxss'
  const destination = path.join(fixture.evidence, file)
  if (mutation === 'delete') {
    await fs.rm(destination)
  }
  else if (mutation === 'add') {
    await write(fixture.evidence, `${path.dirname(file)}/unexpected.txt`, 'unexpected retained file\n')
  }
  else { await fs.appendFile(destination, '\nchanged retained bytes\n') }
  await expect(verifyNativeFixture(fixture.evidence, identity)).rejects.toThrow()
})

it.each(['empty', 'hash', 'missing-file', 'schema'] as const)('rejects a forged %s identity record', async (kind) => {
  const fixture = await createFixture()
  await retainNativeFixture(fixture)
  const file = path.join(fixture.evidence, 'fixture-identity.json')
  const record = JSON.parse(await fs.readFile(file, 'utf8')) as { schemaVersion: number, sha256: string, files: Record<string, string> }
  if (kind === 'empty') {
    record.files = {}
  }
  else if (kind === 'hash') {
    record.sha256 = '0'.repeat(64)
  }
  else if (kind === 'missing-file') {
    record.files['source/nonexistent.mjs'] = '0'.repeat(64)
  }
  else { record.schemaVersion = 2 }
  await fs.writeFile(file, JSON.stringify(record))
  await expect(verifyNativeFixture(fixture.evidence)).rejects.toThrow()
})

it.each(['missing', 'duplicate-role', 'extra', 'unsafe-name'] as const)('rejects an invalid tarball list: %s', async (kind) => {
  const fixture = await createFixture()
  await retainNativeFixture(fixture)
  const file = path.join(fixture.evidence, 'tarballs.json')
  const tarballs = JSON.parse(await fs.readFile(file, 'utf8')) as { name: string, file: string, sha256: string }[]
  if (kind === 'missing') {
    tarballs.pop()
  }
  else if (kind === 'duplicate-role') {
    tarballs[1]!.name = tarballs[0]!.name
  }
  else if (kind === 'extra') {
    tarballs.push({ ...tarballs[0]! })
  }
  else { tarballs[0]!.file = `../${tarballs[0]!.file}` }
  await fs.writeFile(file, JSON.stringify(tarballs))
  await expect(verifyNativeFixture(fixture.evidence)).rejects.toThrow()
})

it.each(['src', 'typed', 'styled-system', 'built'] as const)('rejects an empty required source directory: %s', async (directory) => {
  const fixture = await createFixture()
  await fs.rm(path.join(fixture.root, directory), { recursive: true })
  await fs.mkdir(path.join(fixture.root, directory))
  await expect(retainNativeFixture(fixture)).rejects.toThrow()
})

it.each(['pnpm-lock.yaml', 'miniprogram/generated/classes.js', 'miniprogram/pages/index/index.wxml'] as const)('rejects an incomplete native fixture missing %s', async (file) => {
  const fixture = await createFixture()
  await fs.rm(path.join(fixture.root, file))
  await expect(retainNativeFixture(fixture)).rejects.toThrow()
})

it.each(['external-adapter', 'different-runtime'] as const)('rejects invalid installed resolution: %s', async (kind) => {
  const fixture = await createFixture()
  const file = path.join(fixture.root, 'resolution.json')
  const resolution = JSON.parse(await fs.readFile(file, 'utf8')) as { adapter: string, adapterRuntime: string }
  if (kind === 'external-adapter') {
    resolution.adapter = path.join(path.dirname(fixture.root), 'borrowed/node_modules/weapp-pandacss/dist/panda.cjs')
  }
  else { resolution.adapterRuntime = path.join(fixture.root, 'node_modules/other-runtime/dist/index.cjs') }
  await fs.writeFile(file, JSON.stringify(resolution))
  await expect(retainNativeFixture(fixture)).rejects.toThrow()
})

it('accepts a completed IDE round only with its verified native fixture', async () => {
  const fixture = await createFixture()
  const identity = await retainNativeFixture(fixture)
  await write(fixture.round, 'result.json', JSON.stringify({ passed: true, gitSha }))
  expect(await verifyIdeRound(fixture.round, gitSha, identity)).toEqual(identity)
  await fs.appendFile(path.join(fixture.evidence, 'miniprogram/app.wxss'), '\ncorrupted after success\n')
  await expect(verifyIdeRound(fixture.round, gitSha, identity)).rejects.toThrow()
})

it.each(['failed', 'wrong-sha', 'missing-result', 'malformed-result'] as const)('rejects an incomplete IDE round: %s', async (kind) => {
  const fixture = await createFixture()
  const identity = await retainNativeFixture(fixture)
  if (kind !== 'missing-result') {
    await write(fixture.round, 'result.json', kind === 'malformed-result'
      ? '{ incomplete'
      : JSON.stringify({ passed: kind !== 'failed', gitSha: kind === 'wrong-sha' ? 'another-commit' : gitSha }))
  }
  await expect(verifyIdeRound(fixture.round, gitSha, identity)).rejects.toThrow()
})

it('rejects a successful IDE round with a missing native identity record', async () => {
  const fixture = await createFixture()
  await write(fixture.round, 'result.json', JSON.stringify({ passed: true, gitSha }))
  await expect(verifyIdeRound(fixture.round, gitSha)).rejects.toThrow()
})
