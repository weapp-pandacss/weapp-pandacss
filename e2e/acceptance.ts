import type { NativeFixtureIdentity } from './devtools/native-fixture.ts'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { finished } from 'node:stream/promises'
import { chromium, firefox, webkit } from '@playwright/test'
// eslint-disable-next-line e18e/ban-dependencies -- Keeps native pnpm/IDE launch and cancellation portable.
import { execa } from 'execa'
import { verifyNativeFixture } from './devtools/native-fixture.ts'

interface Stage { name: string, args: string[], executable?: string, timeout?: number }
interface StageResult { name: string, passed: boolean, startedAt: string, finishedAt?: string, log: string, exitCode?: number }
interface Snapshot { gitSha: string, tree: string, localFiles: Record<string, string> }

export const gates: Stage[] = [
  { name: 'frozen-install', args: ['install', '--frozen-lockfile'] },
  { name: 'validate', args: ['run', 'validate'], timeout: 30 * 60_000 },
  { name: 'pack', args: ['pack:check'] },
  { name: 'repo-doctor', args: ['exec', 'repo', 'doctor'] },
  { name: 'repo-check', args: ['exec', 'repo', 'check', '--full'], timeout: 30 * 60_000 },
  { name: 'dependencies', args: ['exec', 'repo', 'deps', 'check'] },
  { name: 'catalog', args: ['exec', 'repo', 'deps', 'catalog', 'check'] },
  { name: 'audit', args: ['audit:acceptance'] },
  { name: 'consumers', args: ['test:consumer:matrix'] },
  { name: 'weapp', args: ['test:e2e:weapp'] },
  { name: 'web', args: ['test:e2e:web'] },
  { name: 'h5', args: ['test:e2e:h5'] },
  { name: 'docs-examples', args: ['--filter', '@weapp-pandacss/docs', 'check:examples'] },
  { name: 'docs-browser', args: ['docs:test:e2e'] },
  { name: 'docs-deploy-dry-run', args: ['--filter', '@weapp-pandacss/docs', 'deploy:check'] },
  { name: 'dev-watch', args: ['test:e2e:dev'], timeout: 35 * 60_000 },
  { name: 'ide-build', args: ['exec', 'turbo', 'run', 'build', '--force', '--filter=@weapp-pandacss/weapp-vite-app...', '--filter=@weapp-pandacss/taro-app', '--filter=@weapp-pandacss/taro-app-vue3', '--filter=@weapp-pandacss/uni-app-vue3'] },
]

export function idePrerequisites(env: NodeJS.ProcessEnv, now = Date.now()) {
  const cliPath = env['WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH']
  const stableVersion = env['WEAPP_VITE_E2E_DEVTOOLS_STABLE_VERSION']
  assert(cliPath && path.isAbsolute(cliPath), 'Set WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH to the absolute, verified stable IDE CLI')
  assert(/^wx[\da-f]{16}$/i.test(env['WEAPP_VITE_E2E_APPID'] ?? ''), 'Set WEAPP_VITE_E2E_APPID to an authorized real AppID')
  assert(stableVersion && stableVersion === env['WEAPP_VITE_E2E_DEVTOOLS_INSTALLED_VERSION'], 'Official stable and installed IDE versions must match')
  const age = now - Date.parse(env['WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT'] ?? '')
  assert(age >= 0 && age < 24 * 60 * 60_000, 'The official stable-version check must be within 24 hours')
  return { cliPath, stableVersion }
}

async function git(root: string, args: string[]) {
  return (await execa('git', args, { cwd: root })).stdout
}

async function snapshot(root: string): Promise<Snapshot> {
  const dirty = await git(root, ['status', '--porcelain=v1', '--untracked-files=no'])
  assert.equal(dirty, '', 'Acceptance requires a committed candidate with a clean tracked working tree')
  const localFiles: Record<string, string> = {}
  const untracked = (await git(root, ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean).sort()
  for (const file of untracked) {
    assert(file === 'examples/taro-app/.env.test' || file === 'examples/taro-app-linaria/.env.test' || file.startsWith('stats/'), `Commit untracked source before acceptance: ${file}`)
    localFiles[file] = createHash('sha256').update(await fs.readFile(path.join(root, file))).digest('hex')
  }
  return { gitSha: await git(root, ['rev-parse', 'HEAD']), tree: await git(root, ['rev-parse', 'HEAD^{tree}']), localFiles }
}

async function fixtureDigest(root: string) {
  const files: Record<string, string> = {}
  async function collect(folder: string) {
    const entries = await fs.readdir(path.join(root, folder), { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const relative = `${folder}/${entry.name}`
      if (entry.isDirectory()) {
        await collect(relative)
      }
      else {
        assert(entry.isFile(), `IDE fixture contains an unexpected non-file: ${relative}`)
        files[relative] = createHash('sha256').update(await fs.readFile(path.join(root, relative))).digest('hex')
      }
    }
  }
  for (const folder of [
    'examples/weapp-vite-app/dist',
    'examples/taro-app/dist/weapp',
    'examples/taro-app-vue3/dist/weapp',
    'examples/uni-app-vue3/dist/build/mp-weixin',
    'packages/runtime/dist',
    'packages/weapp-pandacss/dist',
  ]) {
    const before = Object.keys(files).length
    await collect(folder)
    assert(Object.keys(files).length > before, `IDE fixture must not be empty: ${folder}`)
  }
  return { sha256: createHash('sha256').update(JSON.stringify(files)).digest('hex'), files }
}

export async function verifyIdeRound(evidence: string, gitSha: string, expectedNative?: NativeFixtureIdentity) {
  const roundResult = JSON.parse(await fs.readFile(path.join(evidence, 'result.json'), 'utf8'))
  assert.equal(roundResult.passed, true, 'IDE round must record successful assertions and cleanup')
  assert.equal(roundResult.gitSha, gitSha, 'Both IDE rounds must use the accepted candidate commit')
  return verifyNativeFixture(path.join(evidence, 'native/installed-consumer'), expectedNative)
}

async function main() {
  if (process.argv.includes('--help')) {
    process.stdout.write(`Run all acceptance gates serially, then two real stable-IDE rounds on the same clean commit and built artifacts.\n${gates.map(gate => gate.name).join(' → ')} → ide-round-1 → ide-round-2\nRequired IDE environment: WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH, WEAPP_VITE_E2E_APPID, WEAPP_VITE_E2E_DEVTOOLS_STABLE_VERSION, WEAPP_VITE_E2E_DEVTOOLS_INSTALLED_VERSION, WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT.\nSet WEAPP_ACCEPTANCE_NODE22 and WEAPP_ACCEPTANCE_NODE24 to absolute Node 22.18.0 and 24.11.0 executable paths for published-consumer validation.\nInstall the exact Playwright Chromium/Firefox/WebKit revisions first. The consumer and dev/watch gates must satisfy their own prerequisites. No layer can be skipped.\nOptional WEAPP_ACCEPTANCE_ARTIFACT_DIR must be an absolute, unused output directory.\n`)
    return
  }
  assert.equal(process.argv.length, 2, 'Acceptance accepts no stage-selection or skip arguments')
  const root = path.resolve(import.meta.dirname, '..')
  const candidate = await snapshot(root)
  const destination = process.env['WEAPP_ACCEPTANCE_ARTIFACT_DIR']
  assert(!destination || path.isAbsolute(destination), 'WEAPP_ACCEPTANCE_ARTIFACT_DIR must be absolute')
  const evidence = destination ?? path.join(root, 'e2e-artifacts/acceptance', `${new Date().toISOString().replaceAll(':', '-')}-${candidate.gitSha.slice(0, 12)}`)
  await fs.mkdir(path.dirname(evidence), { recursive: true })
  await fs.mkdir(evidence)
  const stages: StageResult[] = []
  const result = { passed: false, gitSha: candidate.gitSha, tree: candidate.tree, startedAt: new Date().toISOString(), finishedAt: '', error: '', stages }
  const writeResult = () => fs.writeFile(path.join(evidence, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
  await writeResult()
  await fs.writeFile(path.join(evidence, 'source.json'), `${JSON.stringify(candidate, null, 2)}\n`)
  const cancellation = new AbortController()
  const cancel = () => cancellation.abort(new Error('Acceptance cancelled'))
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  let lock: fs.FileHandle | undefined
  const lockPath = path.join(root, 'e2e-artifacts/acceptance.lock')
  async function unchanged() {
    assert.deepEqual(await snapshot(root), candidate, 'Candidate SHA, tracked source, or pre-existing local files changed during acceptance')
  }
  async function run(stage: Stage, extraEnv: NodeJS.ProcessEnv = {}) {
    cancellation.signal.throwIfAborted()
    await unchanged()
    const logPath = path.join(evidence, `${stage.name}.log`)
    const status: StageResult = { name: stage.name, passed: false, startedAt: new Date().toISOString(), log: logPath }
    stages.push(status)
    await writeResult()
    process.stdout.write(`\nAcceptance: ${stage.name}\n`)
    const log = createWriteStream(logPath, { flags: 'wx' })
    const child = execa(stage.executable ?? 'pnpm', stage.args, {
      cwd: root,
      env: { CI: 'true', ...extraEnv, WEAPP_ACCEPTANCE_GIT_SHA: candidate.gitSha, WEAPP_ACCEPTANCE_ARTIFACT_DIR: path.join(evidence, stage.name) },
      all: true,
      reject: false,
      timeout: stage.timeout ?? 15 * 60_000,
      cancelSignal: cancellation.signal,
      forceKillAfterDelay: 45_000,
    })
    assert(child.all, 'Acceptance child must expose combined logs')
    log.once('error', error => cancellation.abort(error))
    child.all.on('data', data => process.stdout.write(data))
    child.all.pipe(log)
    const [output] = await Promise.all([child, finished(log)])
    if (output.exitCode !== undefined) {
      status.exitCode = output.exitCode
    }
    status.finishedAt = new Date().toISOString()
    status.passed = output.exitCode === 0 && !output.failed
    await writeResult()
    assert(status.passed, `Acceptance gate failed: ${stage.name}. See ${logPath}`)
    await unchanged()
    cancellation.signal.throwIfAborted()
  }
  try {
    await fs.mkdir(path.dirname(lockPath), { recursive: true })
    lock = await fs.open(lockPath, 'wx')
    await lock.writeFile(JSON.stringify({ pid: process.pid, gitSha: candidate.gitSha, evidence, startedAt: result.startedAt }))
    await fs.access(path.join(root, 'e2e-artifacts/devtools.lock')).then(() => {
      assert.fail('A real IDE suite already owns devtools.lock; do not remove another run\'s lock')
    }, (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') {
        throw error
      }
    })
    const { cliPath } = idePrerequisites(process.env)
    await fs.access(cliPath)
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> }
    for (const name of ['validate', 'pack:check', 'audit:acceptance', 'test:consumer:matrix', 'test:e2e:weapp', 'test:e2e:web', 'test:e2e:h5', 'test:e2e:dev']) {
      assert(manifest.scripts[name], `Missing acceptance script: ${name}`)
    }
    const consumerNodes = [
      { variable: 'WEAPP_ACCEPTANCE_NODE22', version: 'v22.18.0' },
      { variable: 'WEAPP_ACCEPTANCE_NODE24', version: 'v24.11.0' },
    ]
    for (const { variable, version } of consumerNodes) {
      const executable = process.env[variable]
      assert(executable && path.isAbsolute(executable), `Set ${variable} to the absolute ${version} Node executable`)
      assert.equal((await execa(executable, ['--version'], { timeout: 10_000 })).stdout, version, `${variable} must validate the published package's exact minimum Node release`)
    }
    process.env['WEAPP_IDE_CLI_PATH'] = cliPath
    const browserVersions = []
    for (const [name, type] of [['chromium', chromium], ['firefox', firefox], ['webkit', webkit]] as const) {
      const browser = await type.launch({ headless: true, timeout: 30_000 })
      try {
        const page = await browser.newPage()
        await page.setContent('<!doctype html><title>Acceptance preflight</title>')
        assert.equal(await page.title(), 'Acceptance preflight')
        browserVersions.push({ name, version: browser.version(), executablePath: type.executablePath() })
      }
      finally {
        await browser.close()
      }
    }
    await fs.writeFile(path.join(evidence, 'browsers.json'), `${JSON.stringify(browserVersions, null, 2)}\n`)
    const weappExample = path.join(root, 'examples/weapp-vite-app')
    const wvCli = path.join(weappExample, 'node_modules/weapp-vite/bin/weapp-vite.js')
    // Doctor prepares managed support files in its cwd; keep them in the example.
    const doctor = await execa(process.execPath, [wvCli, 'ide', 'doctor', '--json'], { cwd: weappExample, timeout: 60_000, cancelSignal: cancellation.signal, reject: false })
    await fs.writeFile(path.join(evidence, 'ide-preflight.json'), `${doctor.stdout}\n`)
    await fs.writeFile(path.join(evidence, 'ide-preflight-stderr.log'), `${doctor.stderr}\n`)
    assert.equal(doctor.exitCode, 0, 'The selected IDE must pass its live doctor check before acceptance')
    const checks = JSON.parse(doctor.stdout.slice(doctor.stdout.indexOf('{'))).checks
    assert.equal(checks.cli.value.path, cliPath, 'IDE preflight must resolve the explicitly verified stable CLI')
    assert.equal(checks.login.value, true, 'The selected stable IDE must be logged in')
    assert.equal(checks.servicePort.value.enabled, true, 'Enable the selected IDE service port before acceptance')
    for (const gate of gates) {
      await run(gate.name === 'consumers'
        ? { ...gate, args: [...gate.args, '--node22', process.env['WEAPP_ACCEPTANCE_NODE22']!, '--node24', process.env['WEAPP_ACCEPTANCE_NODE24']!, '--evidence', path.join(evidence, gate.name)] }
        : gate, gate.name === 'dev-watch'
        ? { WEAPP_VITE_E2E_ARTIFACT_DIR: path.join(evidence, gate.name), WEAPP_VITE_E2E_WATCH_FRAMEWORK: '' }
        : {})
    }
    const fixtures = await fixtureDigest(root)
    await fs.writeFile(path.join(evidence, 'ide-fixtures.json'), `${JSON.stringify(fixtures, null, 2)}\n`)
    let nativeFixture: NativeFixtureIdentity | undefined
    const roundDirectories: string[] = []
    for (const round of [1, 2]) {
      await unchanged()
      assert.deepEqual(await fixtureDigest(root), fixtures, 'IDE fixtures changed between acceptance rounds')
      const roundDir = path.join(evidence, `ide-round-${round}`)
      await run({ name: `ide-round-${round}`, executable: process.execPath, args: ['--experimental-strip-types', 'e2e/devtools/run.ts'], timeout: 35 * 60_000 }, { WEAPP_VITE_E2E_ARTIFACT_DIR: roundDir })
      nativeFixture = await verifyIdeRound(roundDir, candidate.gitSha, nativeFixture)
      roundDirectories.push(roundDir)
      await fs.writeFile(path.join(evidence, 'native-fixture.json'), `${JSON.stringify({ gitSha: candidate.gitSha, ...nativeFixture }, null, 2)}\n`)
      assert.deepEqual(await fixtureDigest(root), fixtures, 'IDE acceptance modified its source build artifacts')
    }
    for (const roundDir of roundDirectories) {
      await verifyIdeRound(roundDir, candidate.gitSha, nativeFixture)
    }
    await unchanged()
    cancellation.signal.throwIfAborted()
    result.passed = true
  }
  catch (error) {
    result.error = error instanceof Error ? error.stack ?? error.message : String(error)
    throw error
  }
  finally {
    process.removeListener('SIGINT', cancel)
    process.removeListener('SIGTERM', cancel)
    if (lock) {
      try {
        await lock.close()
        await fs.rm(lockPath)
      }
      catch (error) {
        result.passed = false
        result.error += `\nAcceptance lock cleanup failed: ${String(error)}`
        process.exitCode = 1
      }
    }
    result.finishedAt = new Date().toISOString()
    await writeResult()
  }
  assert(result.passed, result.error || 'Acceptance did not finish successfully')
  process.stdout.write(`\nAcceptance passed at ${candidate.gitSha}: all gates and two real IDE rounds. Evidence: ${evidence}\n`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
    process.exitCode = 1
  })
}
