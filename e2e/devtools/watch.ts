import type { ProjectContext } from './project.ts'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
// eslint-disable-next-line e18e/ban-dependencies -- Own and stop only the isolated compiler processes started here.
import { execa } from 'execa'
import postcss from 'postcss'
import { find } from './frameworks.ts'
import { withCleanup } from './lifecycle.ts'
import { readCompilerSettings, withTemporaryProject } from './project.ts'
import { expectedRpx } from './rpx.ts'

const root = path.resolve(import.meta.dirname, '../..')
const apps = [
  { name: 'wevu', folder: 'weapp-vite-app', framework: 'wevu', target: 'weapp', dist: 'dist', route: '/pages/acceptance/index', page: 'src/pages/acceptance/index.vue' },
  { name: 'taro-react', folder: 'taro-app', framework: 'taro', target: 'weapp', dist: 'dist/weapp', route: '/pages/index/index', page: 'src/pages/index/index.tsx' },
  { name: 'taro-vue', folder: 'taro-app-vue3', framework: 'taro', target: 'weapp', dist: 'dist/weapp', route: '/pages/index/index', page: 'src/pages/index/index.vue' },
  { name: 'uni-app', folder: 'uni-app-vue3', framework: 'uni', target: 'mp-weixin', dist: 'dist/dev/mp-weixin', route: '/pages/index/index', page: 'src/pages/index/index.vue' },
] as const

interface Snapshot {
  css: string
  scripts: string
  fingerprint: string
  files: number
}

async function outputSnapshot(directory: string): Promise<Snapshot> {
  const files = (await fs.readdir(directory, { recursive: true })).filter(file => /\.(?:js|json|wxml|wxss)$/.test(file)).sort()
  const hash = createHash('sha256')
  const css: string[] = []
  const scripts: string[] = []
  for (const file of files) {
    const content = await fs.readFile(path.join(directory, file), 'utf8')
    hash.update(file).update(content)
    if (file.endsWith('.wxss')) {
      css.push(content)
    }
    else { scripts.push(content) }
  }
  return { css: css.join('\n'), scripts: scripts.join('\n'), fingerprint: hash.digest('hex'), files: files.length }
}

/** Give every copy a private Panda cache while reusing installed dependency files. */
async function linkDependencies(source: string, destination: string) {
  await fs.mkdir(destination, { recursive: true })
  const manifest = JSON.parse(await fs.readFile(path.join(source, '../package.json'), 'utf8'))
  const dependencies = new Set(Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }))
  for (const name of dependencies) {
    const from = path.join(source, name)
    const to = path.join(destination, name)
    await fs.mkdir(path.dirname(to), { recursive: true })
    await fs.symlink(await fs.realpath(from), to, process.platform === 'win32' ? 'junction' : 'dir')
  }
}

function packageBin(project: string, packageName: string, binName: string) {
  const require = createRequire(path.join(project, 'package.json'))
  const manifestPath = require.resolve(`${packageName}/package.json`)
  const manifest = require(manifestPath) as { bin: Record<string, string> | string }
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin[binName]
  assert(bin, `${packageName} must expose ${binName}`)
  return path.resolve(path.dirname(manifestPath), bin)
}

function hasDeclaration(css: string, className: string, property: string, value: string) {
  let matched = false
  postcss.parse(css).walkRules((rule) => {
    if (!new RegExp(`\\.${className}(?:[^\\w-]|$)`).test(rule.selector)) {
      return
    }
    rule.walkDecls(property, (declaration) => {
      if (declaration.value.toLowerCase() === value) {
        matched = true
      }
    })
  })
  return matched
}

interface Expected {
  background: string
  color: string
  nested: string
  negative: string
  label: string
  added: boolean
  token: string
}

async function runApp(app: typeof apps[number], context: Omit<ProjectContext, 'name' | 'sourceDist'>, compileOnly: boolean) {
  const evidence = path.join(context.evidence, app.name)
  await fs.mkdir(evidence, { recursive: true })
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), `panda-watch-${app.name}-`))
  const project = path.join(workspace, 'examples', app.folder)
  const source = path.join(root, 'examples', app.folder)
  const reports: unknown[] = []
  let compiler: ReturnType<typeof execa> | undefined
  let compilerExit: unknown
  let stopped = false
  let removed = false
  let passed = false
  let log = ''
  const cleanup = (callback: () => unknown | Promise<unknown>) => async () => {
    try {
      await callback()
    }
    catch (error) {
      passed = false
      throw error
    }
  }
  await withCleanup(async () => {
    await fs.cp(source, project, {
      recursive: true,
      filter: file => !path.relative(source, file).split(path.sep).some(part => ['node_modules', 'dist', 'styled-system', '.weapp-vite', '.turbo', '.git'].includes(part) || part.startsWith('.env') || part === 'project.private.config.json'),
    })
    await fs.copyFile(path.join(root, 'package.json'), path.join(workspace, 'package.json'))
    for (const file of ['build-env.cjs', 'run-platform.mjs']) {
      await fs.copyFile(path.join(root, 'examples', file), path.join(workspace, 'examples', file))
    }
    await linkDependencies(path.join(root, 'node_modules'), path.join(workspace, 'node_modules'))
    await linkDependencies(path.join(source, 'node_modules'), path.join(project, 'node_modules'))
    const env = { ...process.env, NODE_ENV: 'development', TARO_ENV: app.framework === 'taro' ? app.target : undefined, UNI_PLATFORM: app.framework === 'uni' ? app.target : undefined }
    async function prepare(name: string, args: string[]) {
      const result = await execa(process.execPath, args, { cwd: project, env, cancelSignal: context.signal, timeout: 120_000 })
      await fs.writeFile(path.join(evidence, `${name}.log`), `${result.stdout}\n${result.stderr}`)
    }
    const wv = app.framework === 'wevu' ? packageBin(project, 'weapp-vite', 'weapp-vite') : undefined
    if (wv) {
      await prepare('prepare', [wv, 'prepare'])
    }
    await prepare('codegen', [packageBin(project, '@pandacss/dev', 'panda'), 'codegen'])
    const args = app.framework === 'wevu'
      ? [wv!, 'dev', '-p', 'weapp', '--no-mcp']
      : app.framework === 'taro'
        ? [packageBin(project, '@tarojs/cli', 'taro'), 'build', '--type', 'weapp', '--watch']
        : [packageBin(project, '@dcloudio/vite-plugin-uni', 'uni'), '-p', 'mp-weixin']
    compiler = execa(process.execPath, args, { cwd: project, env, detached: process.platform !== 'win32', reject: false, cleanup: true, buffer: false })
    compiler.stdout?.on('data', chunk => log += String(chunk))
    compiler.stderr?.on('data', chunk => log += String(chunk))
    void compiler.then(result => compilerExit = { exitCode: result.exitCode, signal: result.signal }, error => compilerExit = String(error))
    const sourceDist = path.join(project, app.dist)
    const scenariosFile = path.join(project, 'src/scenarios.ts')
    const utilitiesFile = path.join(project, 'src/imports/utilities.css')
    const nestedFile = path.join(project, 'src/imports/nested.css')
    const pageFile = path.join(project, app.page)
    const pandaFile = path.join(project, 'panda.config.ts')
    const originals = new Map<string, string>()
    for (const file of [scenariosFile, utilitiesFile, nestedFile, pageFile, pandaFile]) {
      originals.set(file, await fs.readFile(file, 'utf8'))
    }
    let previousFingerprint: string | undefined
    async function waitForOutput(name: string, expected: Expected) {
      const started = Date.now()
      const deadline = Date.now() + 120_000
      let stable: string | undefined
      while (Date.now() < deadline) {
        context.signal.throwIfAborted()
        assert.equal(compilerExit, undefined, `${app.name}: watch compiler exited: ${JSON.stringify(compilerExit)}`)
        try {
          const snapshot = await outputSnapshot(sourceDist)
          const parsed = postcss.parse(snapshot.css)
          let tokenMatches = false
          parsed.walkDecls((declaration) => {
            if (declaration.prop.startsWith('--') && declaration.value === expected.token) {
              tokenMatches = true
            }
          })
          const border = app.framework === 'taro' ? '3rpx' : '3px'
          const generatedBorder = hasDeclaration(snapshot.css, 'bd-t-w_3px', 'border-top-width', border)
          // Panda may retain unused atomic rules during watch. The unique recipe
          // marker must leave the executable bundle; the IDE probe also requires
          // the rendered border to return to zero after deletion and restoration.
          const recipeHasAddedStyle = snapshot.scripts.toLowerCase().includes('bbf7d0')
          const ready = snapshot.css.toLowerCase().includes(expected.background)
            && hasDeclaration(snapshot.css, 'import-normal', 'color', expected.color)
            && hasDeclaration(snapshot.css, 'import-nested', 'margin-left', expected.nested)
            && hasDeclaration(snapshot.css, 'import-units', 'margin-bottom', expected.negative)
            && snapshot.scripts.includes(expected.label)
            && tokenMatches
            && recipeHasAddedStyle === expected.added
            && (!expected.added || generatedBorder)
          if (ready && snapshot.fingerprint !== previousFingerprint && stable === snapshot.fingerprint) {
            previousFingerprint = snapshot.fingerprint
            reports.push({ phase: name, compilerPid: compiler!.pid, expected, recipeHasAddedStyle, retainedUnusedAtom: !expected.added && generatedBorder, fingerprint: snapshot.fingerprint, files: snapshot.files, elapsedMs: Date.now() - started })
            await fs.writeFile(path.join(evidence, `${name}.wxss`), snapshot.css)
            await fs.writeFile(path.join(evidence, 'compiler.log'), log)
            return snapshot
          }
          stable = ready ? snapshot.fingerprint : undefined
        }
        catch (error) {
          const partialWrite = error instanceof Error && error.name === 'CssSyntaxError'
          if (!partialWrite && !(error && typeof error === 'object' && 'code' in error && ['ENOENT', 'ENOTDIR'].includes(String(error.code)))) {
            throw error
          }
        }
        await delay(250, undefined, { signal: context.signal })
      }
      assert.fail(`${app.name}: ${name} did not produce matching stable watch artifacts; see ${evidence}/compiler.log`)
    }
    const baseline: Expected = { background: '#e2e8f0', color: '#0284c7', nested: '8rpx', negative: '-64rpx', label: 'Switch styles', added: false, token: '40rpx' }
    await waitForOutput('initial', baseline)
    const settings = await readCompilerSettings(path.join(app.framework === 'uni' ? sourceDist : project, 'project.config.json'))
    async function updates(probe: (name: string, expected: Expected) => Promise<void>) {
      await probe('initial', baseline)
      await fs.writeFile(scenariosFile, originals.get(scenariosFile)!.replace('backgroundColor: \'#e2e8f0\'', 'borderTopWidth: \'3px\', borderTopStyle: \'solid\', backgroundColor: \'#bbf7d0\''))
      await fs.writeFile(pageFile, originals.get(pageFile)!.replace('Switch styles', 'Watch updated'))
      const sourceExpected = { ...baseline, background: '#bbf7d0', label: 'Watch updated', added: true }
      await waitForOutput('add-style', sourceExpected)
      await probe('add-style', sourceExpected)
      await fs.writeFile(pandaFile, originals.get(pandaFile)!.replace('1.25rem', '1.75rem'))
      await fs.writeFile(utilitiesFile, originals.get(utilitiesFile)!.replaceAll('#0284c7', '#16a34a'))
      await fs.writeFile(nestedFile, originals.get(nestedFile)!.replace('margin-left: 0.25rem', 'margin-left: 0.375rem').replace('margin-bottom: -2e+0rem', 'margin-bottom: -1e+0rem'))
      const importedExpected = { ...sourceExpected, color: '#16a34a', nested: '12rpx', negative: '-32rpx', token: '56rpx' }
      await waitForOutput('modify-token-and-imports', importedExpected)
      await probe('modify-token-and-imports', importedExpected)
      await fs.writeFile(scenariosFile, originals.get(scenariosFile)!)
      const deletedExpected = { ...importedExpected, background: baseline.background, added: false }
      await waitForOutput('delete-style', deletedExpected)
      await probe('delete-style', deletedExpected)
      for (const [file, content] of originals) {
        await fs.writeFile(file, content)
      }
      await waitForOutput('restored', baseline)
      await probe('restored', baseline)
    }
    if (compileOnly) {
      await updates(async () => {})
    }
    else {
      // Each settled output gets a fresh IDE compile while this watch compiler
      // stays alive. Finish the owned project's cleanup before the next update.
      await updates(async (phase, expected) => {
        const phaseEvidence = path.join(evidence, phase)
        const observed = await withTemporaryProject({ ...context, settings, name: `watch-${app.name}-${phase}`, sourceDist, evidence: phaseEvidence }, async ({ runtime, request, systemInfo }) => {
          const page = await request(() => runtime.reLaunch(app.route))
          assert(page, `${app.name}: watch ${phase} route must launch`)
          const config = JSON.parse(await fs.readFile(path.join(sourceDist, 'pages', app.route.includes('acceptance') ? 'acceptance' : 'index', 'index.json'), 'utf8'))
          const components = Object.keys(config.usingComponents ?? {})
          async function rendered(id: string, property: string) {
            const node = await find(page!, `#${id}`, components, request)
            assert(node, `${app.name}: watch ${phase} missing ${id}`)
            return request(() => node.style(property))
          }
          const observed = {
            background: await rendered('scenario-recipe', 'background-color'),
            color: await rendered('scenario-import-normal', 'color'),
            nested: await rendered('scenario-import-nested', 'margin-left'),
            negative: await rendered('scenario-units', 'margin-bottom'),
            token: await rendered('scenario-token', 'padding-left'),
            border: await rendered('scenario-recipe', 'border-top-width'),
          }
          assert.equal(observed.background, expected.background === '#e2e8f0' ? 'rgb(226, 232, 240)' : 'rgb(187, 247, 208)')
          assert.equal(observed.color, expected.color === '#0284c7' ? 'rgb(2, 132, 199)' : 'rgb(22, 163, 74)')
          for (const key of ['nested', 'negative', 'token'] as const) {
            const pixels = expectedRpx(Number.parseFloat(expected[key]), systemInfo)
            assert(Math.abs(Number.parseFloat(observed[key]) - pixels) < 0.15, `${app.name}: watch ${phase} ${key}`)
          }
          const border = expected.added ? app.framework === 'taro' ? expectedRpx(3, systemInfo) : 3 : 0
          assert.equal(Number.parseFloat(observed.border), border, `${app.name}: watch ${phase} added or removed style must render`)
          const toggle = await find(page!, '#scenario-toggle', components, request)
          assert(toggle)
          assert.equal((await request(() => toggle.text())).trim(), expected.label)
          const screenshot = await request(() => runtime.screenshot())
          assert(typeof screenshot === 'string')
          await fs.writeFile(path.join(phaseEvidence, 'rendered.png'), screenshot, 'base64')
          return observed
        })
        reports.push({ phase, compilerPid: compiler!.pid, evidence: phase, rendered: observed })
      })
    }
    context.signal.throwIfAborted()
    passed = true
  }, [
    cleanup(async () => {
      if (compiler?.pid) {
        if (process.platform === 'win32') {
          await execa('taskkill', ['/PID', String(compiler.pid), '/T', '/F'], { reject: false })
        }
        else {
          try {
            process.kill(-compiler.pid, 'SIGTERM')
          }
          catch (error) {
            if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ESRCH')) {
              throw error
            }
          }
        }
        for (let attempt = 0; attempt < 50; attempt++) {
          if (compilerExit !== undefined) {
            break
          }
          await delay(100)
        }
        if (compilerExit === undefined && process.platform !== 'win32') {
          process.kill(-compiler.pid, 'SIGKILL')
          for (let attempt = 0; attempt < 50; attempt++) {
            if (compilerExit !== undefined) {
              break
            }
            await delay(100)
          }
        }
        assert.notEqual(compilerExit, undefined, `${app.name}: owned compiler did not stop`)
        await compiler
        stopped = true
      }
    }),
    cleanup(() => fs.writeFile(path.join(evidence, 'compiler.log'), log)),
    cleanup(async () => {
      await fs.rm(workspace, { recursive: true, force: true })
      removed = true
    }),
    cleanup(() => fs.writeFile(path.join(evidence, 'watch-cleanup.json'), JSON.stringify({ workspace, compilerPid: compiler?.pid, stopped, removed }, null, 2))),
    () => fs.writeFile(path.join(evidence, 'probes.json'), JSON.stringify({ passed: passed && !context.signal.aborted, compileOnly, runtimeVerified: passed && !context.signal.aborted && !compileOnly, reports }, null, 2)),
  ])
  context.signal.throwIfAborted()
  process.stdout.write(`${app.name}: isolated watch add-style/token/delete-style/restore ${compileOnly ? 'compilation' : 'and real IDE rendering'} and cleanup passed.\n`)
}

async function main() {
  const compileOnly = process.argv.includes('--compile-only')
  const cliPath = process.env.WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH ?? ''
  const appid = process.env.WEAPP_VITE_E2E_APPID ?? ''
  const stableVersion = process.env.WEAPP_VITE_E2E_DEVTOOLS_STABLE_VERSION
  const installedVersion = process.env.WEAPP_VITE_E2E_DEVTOOLS_INSTALLED_VERSION
  const checkedAt = process.env.WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT
  if (!compileOnly) {
    assert(path.isAbsolute(cliPath), 'Set the explicitly verified stable IDE CLI path.')
    assert(/^wx[\da-f]{16}$/i.test(appid), 'Set an authorized real AppID.')
    assert(stableVersion && installedVersion === stableVersion, 'Use the verified latest official stable IDE.')
    const age = Date.now() - Date.parse(checkedAt ?? '')
    assert(age >= 0 && age < 86_400_000, 'Stable IDE verification must be less than 24 hours old.')
  }
  const config = JSON.parse(await fs.readFile(path.join(root, 'examples/weapp-vite-app/project.config.json'), 'utf8'))
  assert.match(String(config.libVersion), /^\d+\.\d+\.\d+$/)
  const evidence = path.resolve(process.env.WEAPP_VITE_E2E_ARTIFACT_DIR ?? path.join(root, 'e2e-artifacts/watch', new Date().toISOString().replaceAll(':', '-')))
  await fs.mkdir(path.dirname(evidence), { recursive: true })
  await fs.mkdir(evidence)
  const gitSha = (await execa('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim()
  if (process.env.WEAPP_ACCEPTANCE_GIT_SHA) {
    assert.equal(gitSha, process.env.WEAPP_ACCEPTANCE_GIT_SHA)
  }
  const lockPath = path.join(root, 'e2e-artifacts', compileOnly ? 'watch-compile.lock' : 'devtools.lock')
  await fs.mkdir(path.dirname(lockPath), { recursive: true })
  const lock = await fs.open(lockPath, 'wx')
  const controller = new AbortController()
  const cancel = () => controller.abort(new Error('Watch acceptance cancelled or timed out'))
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  const timeout = setTimeout(cancel, 1_800_000)
  let passed = false
  const cleanup = (callback: () => unknown | Promise<unknown>) => async () => {
    try {
      await callback()
    }
    catch (error) {
      passed = false
      throw error
    }
  }
  await withCleanup(async () => {
    const selection = process.env.WEAPP_VITE_E2E_WATCH_FRAMEWORK
    const selected = apps.filter(app => !selection || app.name === selection)
    assert(selected.length > 0, 'Select an existing watch framework.')
    for (const app of selected) {
      await runApp(app, { cliPath, appid, libVersion: config.libVersion, wvCli: path.join(root, 'examples/weapp-vite-app/node_modules/weapp-vite/bin/weapp-vite.js'), evidence, signal: controller.signal }, compileOnly)
    }
    controller.signal.throwIfAborted()
    passed = true
  }, [
    () => {
      clearTimeout(timeout)
      process.removeListener('SIGINT', cancel)
      process.removeListener('SIGTERM', cancel)
    },
    cleanup(() => lock.close()),
    cleanup(() => fs.rm(lockPath)),
    () => fs.writeFile(path.join(evidence, 'result.json'), JSON.stringify({ passed: passed && !controller.signal.aborted, gitSha, compileOnly, runtimeVerified: passed && !controller.signal.aborted && !compileOnly, stableVersion, installedVersion, checkedAt }, null, 2)),
  ])
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  const appid = process.env.WEAPP_VITE_E2E_APPID
  process.stderr.write(`${appid ? message.replaceAll(appid, '<authorized-appid>') : message}\n`)
  process.exitCode = 1
})
