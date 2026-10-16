import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
// eslint-disable-next-line e18e/ban-dependencies -- Handles Windows CLI batch files and scoped process timeouts.
import { execa } from 'execa'
import automator from 'miniprogram-automator'
import { encodeClassName } from '../../packages/runtime/src/index.ts'
import { scenarioState } from '../scenarios.ts'
import { find, runFrameworks } from './frameworks.ts'
import { createConnectionLifecycle, withCleanup } from './lifecycle.ts'
import { createAppLogs } from './logs.ts'
import { runNative } from './native.ts'
import { ProjectCleanupError, waitForEndpointClosed } from './project.ts'
import { expectedRpx } from './rpx.ts'
import { runSharedScenarios } from './scenarios.ts'
import { compareAppViewport, settleViewport } from './viewport.ts'

// This is an opt-in real IDE test, separate from mpcore's logical runtime.
// Operator evidence is checked against Tool.getInfo on every actual IDE host.
type MiniProgram = Awaited<ReturnType<typeof automator.connect>>
type Page = NonNullable<Awaited<ReturnType<MiniProgram['reLaunch']>>>
type Element = NonNullable<Awaited<ReturnType<Page['$']>>>

async function main() {
  const cliPath = process.env['WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH']
  const appid = process.env['WEAPP_VITE_E2E_APPID'] ?? ''
  const stableVersion = process.env['WEAPP_VITE_E2E_DEVTOOLS_STABLE_VERSION']
  const installedVersion = process.env['WEAPP_VITE_E2E_DEVTOOLS_INSTALLED_VERSION']
  const checkedAt = process.env['WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT']
  assert(cliPath && path.isAbsolute(cliPath), 'Set WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH to the explicit absolute stable IDE CLI path.')
  assert(appid && /^wx[\da-f]{16}$/i.test(appid), 'Set WEAPP_VITE_E2E_APPID to an authorized real AppID; touristappid is not accepted.')
  assert(stableVersion && installedVersion === stableVersion, 'Verify the latest official stable IDE and set matching STABLE_VERSION / INSTALLED_VERSION evidence; RC/nightly fallback is not allowed.')
  const age = Date.now() - Date.parse(checkedAt ?? '')
  assert(age >= 0 && age < 24 * 60 * 60 * 1000, 'Set WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT to the ISO time of the official stable-version check, within 24 hours.')
  await fs.access(cliPath)
  // weapp-vite delegates CLI selection to weapp-ide-cli. Its environment
  // variable differs from this suite's public prerequisite, so forward it to
  // every child rather than silently selecting the system installation.
  process.env['WEAPP_IDE_CLI_PATH'] = cliPath

  const root = path.resolve(import.meta.dirname, '../..')
  const example = path.join(root, 'examples/weapp-vite-app')
  const wvCli = path.join(example, 'node_modules/weapp-vite/bin/weapp-vite.js')
  const configuredEvidence = process.env['WEAPP_VITE_E2E_ARTIFACT_DIR']
  assert(!configuredEvidence || path.isAbsolute(configuredEvidence), 'WEAPP_VITE_E2E_ARTIFACT_DIR must be absolute')
  const evidence = configuredEvidence ?? path.join(root, 'e2e-artifacts/devtools', new Date().toISOString().replaceAll(':', '-'))
  await fs.mkdir(path.dirname(evidence), { recursive: true })
  await fs.mkdir(evidence)
  const gitSha = (await execa('git', ['rev-parse', 'HEAD'], { cwd: root })).stdout.trim()
  if (process.env['WEAPP_ACCEPTANCE_GIT_SHA']) {
    assert.equal(gitSha, process.env['WEAPP_ACCEPTANCE_GIT_SHA'], 'The IDE run must use the acceptance candidate SHA')
  }
  const startedAt = new Date().toISOString()
  await fs.writeFile(path.join(evidence, 'result.json'), JSON.stringify({ passed: false, gitSha, startedAt, status: 'running' }, null, 2))
  async function fail(error: unknown, cleanup: string[]): Promise<never> {
    return withCleanup(async () => {
      throw error
    }, [
      () => fs.writeFile(path.join(evidence, 'result.json'), JSON.stringify({
        passed: false,
        status: 'failed',
        gitSha,
        startedAt,
        completedAt: new Date().toISOString(),
        error: (error instanceof Error ? error.stack ?? error.message : String(error)).replaceAll(appid, '<authorized-appid>'),
        cleanup,
      }, null, 2)),
    ])
  }
  const lockPath = path.join(root, 'e2e-artifacts/devtools.lock')
  const lock = await fs.open(lockPath, 'wx').catch(error => fail(error, []))
  let projectPath: string | undefined
  let miniProgram: MiniProgram | undefined
  let launchAttempted = false
  let projectClosed = false
  let projectRemoved = false
  let automationPort: number | undefined
  let endpointClosed = false
  const logs = createAppLogs('wevu SDK and CLI')
  const errors = logs.exceptions
  const consoleMessages = logs.messages
  const probes: unknown[] = []
  const cancellation = new AbortController()
  const connection = createConnectionLifecycle<MiniProgram>(cancellation.signal)
  const cancel = () => {
    cancellation.abort(new Error('DevTools E2E cancelled or timed out'))
  }
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  const timeout = setTimeout(cancel, 1_800_000)
  async function closeOwnedProject() {
    // Never use the wv close helper's global recovery behavior.
    if (launchAttempted && projectPath) {
      if (!projectClosed) {
        await execa(cliPath!, ['close', '--project', projectPath], { timeout: 30_000 })
        projectClosed = true
      }
    }
  }
  async function verifyOwnedEndpointClosed() {
    if (launchAttempted) {
      assert(automationPort)
      if (!endpointClosed) {
        await waitForEndpointClosed(automationPort, 'wevu')
        endpointClosed = true
      }
    }
  }
  await withCleanup(async () => {
    await lock.writeFile(JSON.stringify({ pid: process.pid, gitSha, evidence, cliPath, startedAt }, null, 2))
    async function wv(name: string, args: string[], visualComparison = false) {
      const output = await execa(process.execPath, [wvCli, ...args], { cwd: example, timeout: 60_000, cancelSignal: cancellation.signal, reject: false })
      const stdout = output.stdout.replaceAll(appid, '<authorized-appid>')
      const stderr = output.stderr.replaceAll(appid, '<authorized-appid>')
      await fs.writeFile(path.join(evidence, `${name}.log`), `${stdout}\n${stderr}\n`)
      assert(output.exitCode === 0 || (visualComparison && output.exitCode === 1), `${name} failed: ${stderr}`)
      return stdout
    }
    const doctorOutput = await wv('cli-doctor', ['ide', 'doctor', '--json'])
    const doctor = JSON.parse(doctorOutput.slice(doctorOutput.indexOf('{')))
    assert.equal(doctor.checks.cli.value.path, cliPath, 'weapp-vite must resolve the explicitly verified stable IDE CLI')
    assert.equal(doctor.checks.login.value, true, 'The selected stable IDE must be logged in')
    assert.equal(doctor.checks.servicePort.value.enabled, true, 'Enable the IDE service port before testing')
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-panda-ide-'))
    await fs.cp(path.join(example, 'dist'), path.join(projectPath, 'dist'), { recursive: true })
    const config = JSON.parse(await fs.readFile(path.join(example, 'project.config.json'), 'utf8'))
    assert.match(String(config.libVersion), /^\d+\.\d+\.\d+$/, 'Pin a formal base-library version in the fixture; trial/develop aliases are not accepted.')
    await fs.writeFile(path.join(projectPath, 'project.config.json'), JSON.stringify({ ...config, appid }, null, 2))
    await fs.writeFile(path.join(projectPath, 'project.private.config.json'), JSON.stringify({
      condition: { miniprogram: { list: [
        { name: 'Panda E2E', pathName: 'pages/index/index', query: '' },
        { name: 'Runtime acceptance', pathName: 'pages/acceptance/index', query: '' },
      ] } },
    }, null, 2))

    const server = net.createServer()
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', resolve)
    })
    const address = server.address() as net.AddressInfo
    automationPort = address.port
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    launchAttempted = true
    // execa handles Windows .bat/.cmd launch. Do not use the SDK's raw spawn
    // launcher or its Tool.close, which can affect a borrowed IDE host.
    await wv('cli-auto', ['auto', '--project', projectPath, '--auto-port', String(address.port), '--trust-project'])
    const deadline = Date.now() + 30_000
    while (!miniProgram) {
      cancellation.signal.throwIfAborted()
      try {
        miniProgram = await connection.connect(() => automator.connect({ wsEndpoint: `ws://127.0.0.1:${address.port}` }))
      }
      catch (error) {
        if (cancellation.signal.aborted || Date.now() >= deadline) {
          throw error
        }
        await delay(500, undefined, { signal: cancellation.signal })
      }
    }
    const runtime = miniProgram
    await logs.start(runtime, connection.request)
    const toolInfo = await connection.request(() => runtime.send('Tool.getInfo'))
    assert.equal(toolInfo.version, stableVersion, 'The actual connected IDE host must match the verified official stable version')
    assert.equal(toolInfo.SDKVersion, config.libVersion, 'Tool.getInfo must confirm the pinned formal SDK')
    const systemInfo = await connection.request(() => runtime.systemInfo())
    async function screenshot(file: string) {
      const image = await connection.request(() => runtime.screenshot())
      assert(typeof image === 'string', 'The SDK must return a screenshot')
      await fs.writeFile(file, image, 'base64')
    }
    assert.equal(systemInfo.SDKVersion, config.libVersion, 'The connected runtime must use the fixture\'s pinned formal base-library release.')
    await fs.writeFile(path.join(evidence, 'environment.json'), JSON.stringify({
      provider: 'devtools',
      officialSource: 'https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html',
      officialConfigSource: 'https://devtools.wxqcloud.qq.com.cn/WechatWebDev/nightly/versions/config.json',
      checkedAt,
      stableVersion,
      installedVersion,
      gitSha,
      versionEvidence: 'operator-verified',
      cliPath,
      launcher: 'weapp-vite auto',
      weappViteVersion: JSON.parse(await fs.readFile(path.join(example, 'node_modules/weapp-vite/package.json'), 'utf8')).version,
      systemInfo,
      toolInfo,
    }, null, 2))
    const stylesheet = await fs.readFile(path.join(projectPath, 'dist/app.wxss'), 'utf8')
    const acceptanceStylesheet = `${stylesheet}\n${await fs.readFile(path.join(projectPath, 'dist/pages/acceptance/index.wxss'), 'utf8')}`
    const selectors = new Set([...stylesheet.matchAll(/\.([\w-]+)/g)].map(match => match[1]!))
    assert(!/@layer|:not\(n\)|:not\(#/.test(acceptanceStylesheet), 'Ordered WXSS must not contain layers or generated specificity placeholders')
    assert(!/:where\(/.test(acceptanceStylesheet), 'WXSS must contain expanded platform selectors')
    for (const variable of acceptanceStylesheet.matchAll(/var\(\s*(--[^,\s)]+)/g)) {
      assert.match(variable[1]!, /^--[\w-]+$/, 'Panda variables must be valid WXSS identifiers')
    }
    async function probe(page: Page, id: string, expected: Record<string, string | number>, markers: string[] = []) {
      const node = await connection.request(() => page.$(`#${id}`))
      assert(node, `Missing rendered probe ${id}`)
      const classes = (await connection.request(() => node.attribute('class'))).trim().split(/\s+/)
      assert(classes.length && classes[0], `${id} must have classes`)
      for (const name of classes) {
        assert.match(name, /^[A-Z_][\w-]*$/i, `${id} has an unsafe class`)
        assert(selectors.has(name) || markers.includes(name), `Missing WXSS selector for ${id}: ${name}`)
      }
      const styles: Record<string, string> = {}
      for (const [property, value] of Object.entries(expected)) {
        styles[property] = await connection.request(() => node.style(property))
        if (typeof value === 'number') {
          assert(Math.abs(Number.parseFloat(styles[property]!) - value) < 0.15, `${id}.${property}: expected ${value}px, got ${styles[property]}`)
        }
        else {
          assert.equal(styles[property], value, `${id}.${property}`)
        }
      }
      probes.push({ route: page.path, id, classes, styles })
      return classes.join(' ')
    }
    const observed: unknown[] = []
    async function layerStyles(page: Page, active: boolean) {
      const normal = await connection.request(() => page.$('#layer-normal'))
      const important = await connection.request(() => page.$('#layer-important'))
      assert(normal && important, 'Layer probes must render')
      const expected = active ? ['layer-normal-accent', 'layer-important-accent'] : ['layer-normal-neutral', 'layer-important-neutral']
      assert.equal(await connection.request(() => normal.attribute('class')), expected[0])
      assert.equal(await connection.request(() => important.attribute('class')), expected[1])
      expected.forEach(name => assert(selectors.has(name), `Missing WXSS selector ${name}`))
      const color = await connection.request(() => normal.style('color'))
      const importantColor = await connection.request(() => important.style('color'))
      assert.equal(color, active ? 'rgb(22, 163, 74)' : 'rgb(2, 132, 199)')
      assert.equal(importantColor, active ? 'rgb(234, 88, 12)' : 'rgb(124, 58, 237)')
      observed.push({ active, color, importantColor, classes: expected })
    }
    async function buttonOn(page: Page) {
      const component = await connection.request(() => page.$('panda-button'))
      assert(component, 'PandaButton component must be registered')
      const button = await connection.request(() => component.$('#variant-button'))
      assert(button, 'PandaButton must render its button')
      const classes = await connection.request(() => button.attribute('class'))
      assert(classes.trim(), 'The button must have generated classes')
      assert('data' in component && typeof component.data === 'function', 'The registered component must expose runtime data')
      const readData = component.data.bind(component)
      const runtimeClasses = String(await connection.request(() => readData('buttonClass'))).trim().split(/\s+/)
      const renderedClasses = classes.trim().split(/\s+/).map(name => name.replace(/^PandaButton--/, ''))
      // The WeChat renderer scopes component class attributes. Match its exact
      // known scope to actual AppService data, then check the original WXSS.
      // apply-shared can expose both scoped and original class attributes.
      assert.deepEqual([...new Set(renderedClasses)].sort(), [...new Set(runtimeClasses)].sort(), 'Rendered class scoping must preserve the Panda runtime output')
      for (const name of runtimeClasses) {
        assert.match(name, /^[\w-]+$/)
        assert(selectors.has(name), `Missing WXSS selector: ${name}`)
      }
      return button
    }
    async function buttonRequest<T>(page: Page, request: (button: Element) => Promise<T>) {
      const button = await buttonOn(page)
      return connection.request(() => request(button))
    }
    async function expectStatus(page: Page, expected: string, id = 'status') {
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const status = await connection.request(() => page.$(`#${id}`))
        if (status && (await connection.request(() => status.text())).trim() === expected) {
          return
        }
        await delay(50)
      }
      assert.fail(`Page state did not become ${expected}`)
    }
    // Launch once; reLaunch resets the page between scenarios.
    for (let scenario = 0; scenario < 2; scenario++) {
      cancellation.signal.throwIfAborted()
      const page: Page | undefined = await connection.request(() => runtime.reLaunch('/pages/index/index'))
      assert(page, 'The example route must launch')
      await expectStatus(page, 'neutral')
      await probe(page, 'title', { 'color': 'oklch(0.588 0.158 241.966)', 'font-weight': '700' })
      await probe(page, 'card', { 'background-color': 'rgb(255, 255, 255)' })
      assert.equal(await probe(page, 'manual', { color: 'rgb(255, 0, 0)' }), encodeClassName('manual/中文_wp_2e_'))
      await probe(page, 'token', { 'padding-top': expectedRpx(4, systemInfo) })
      await layerStyles(page, false)
      const initial = await buttonRequest(page, button => button.attribute('class'))
      const background = await buttonRequest(page, button => button.style('background-color'))
      for (let toggle = 1; toggle <= 4; toggle++) {
        const active = toggle % 2 === 1
        await buttonRequest(page, button => button.tap())
        await expectStatus(page, active ? 'accent' : 'neutral')
        await layerStyles(page, active)
        if (active) {
          assert.notEqual(await buttonRequest(page, button => button.attribute('class')), initial)
          assert.notEqual(await buttonRequest(page, button => button.style('background-color')), background)
        }
        else {
          assert.equal(await buttonRequest(page, button => button.attribute('class')), initial)
          assert.equal(await buttonRequest(page, button => button.style('background-color')), background)
        }
      }
      // A pushed page must not destroy the previous page's reactive state.
      await buttonRequest(page, button => button.tap())
      await expectStatus(page, 'accent')
      const pushed = await connection.request(() => runtime.navigateTo('/pages/acceptance/index'))
      assert(pushed)
      assert.equal((await connection.request(() => runtime.pageStack())).length, 2)
      const returned = await connection.request(() => runtime.navigateBack())
      assert(returned)
      await expectStatus(returned, 'accent')
      await layerStyles(returned, true)
      assert.equal((await connection.request(() => runtime.pageStack())).length, 1)
    }
    for (let scenario = 0; scenario < 2; scenario++) {
      const page: Page | undefined = await connection.request(() => runtime.reLaunch('/pages/acceptance/index'))
      assert(page, 'Runtime acceptance route must launch')
      await expectStatus(page, 'neutral', 'acceptance-status')
      const pageSize = await connection.request(() => page.size())
      const viewportWidth = systemInfo.windowWidth
      // page.size() includes overflowing content; rpx uses the window viewport.
      const rpx = (value: number) => expectedRpx(value, systemInfo)
      const atomicNode = await connection.request(() => page.$('#atomic'))
      assert(atomicNode)
      await fs.writeFile(path.join(evidence, 'viewport.json'), JSON.stringify({ systemWidth: systemInfo.windowWidth, pageSize, atomic: { fontSize: await connection.request(() => atomicNode.style('font-size')), padding: await connection.request(() => atomicNode.style('padding-top')), width: await connection.request(() => atomicNode.style('width')) } }, null, 2))
      await probe(page, 'atomic', { 'color': 'rgb(220, 38, 38)', 'font-size': rpx(48), 'padding-top': rpx(16), 'width': (viewportWidth - 2 * rpx(16)) / 2 })
      await probe(page, 'variable-token', { 'padding-top': rpx(4) })
      await probe(page, 'value-token', { 'padding-top': rpx(4) })
      await probe(page, 'semantic-token', { 'color': 'rgb(15, 118, 110)', 'margin-left': -rpx(4) })
      await probe(page, 'important', { color: 'rgb(124, 58, 237)' })
      await probe(page, 'merged', { 'color': 'rgb(22, 163, 74)', 'font-weight': '700' })
      await probe(page, 'pattern', { 'display': 'flex', 'align-items': 'center', 'padding-top': rpx(16) })
      const a = await probe(page, 'collision-a', { color: 'rgb(220, 38, 38)' })
      const b = await probe(page, 'collision-b', { color: 'rgb(22, 163, 74)' })
      assert.equal(a, encodeClassName('a.b'))
      assert.equal(b, encodeClassName('a_wp_2e_b'))
      assert.notEqual(a, b, 'Encoding collision probes must stay distinct')
      assert.equal(await probe(page, 'leading', { color: 'rgb(3, 105, 161)' }), encodeClassName('2leading/中文'))
      assert.equal(await probe(page, 'marked', { color: 'rgb(147, 51, 234)' }), encodeClassName('-leading_wp_'))
      let initial: string | undefined
      for (let cycle = 0; cycle <= 4; cycle++) {
        const active = cycle % 2 === 1
        await expectStatus(page, active ? 'accent' : 'neutral', 'acceptance-status')
        const color = active ? 'rgb(255, 255, 255)' : 'rgb(51, 65, 85)'
        const background = active ? 'rgb(2, 132, 199)' : 'rgb(226, 232, 240)'
        const variant = await probe(page, 'variant', { color, 'background-color': background })
        if (!initial) {
          initial = variant
        }
        else if (active) {
          assert.notEqual(variant, initial)
        }
        else { assert.equal(variant, initial, 'cva output must return to its initial classes') }
        await probe(page, 'named', { color, 'background-color': background })
        for (const prefix of ['slot', 'named']) {
          await probe(page, `${prefix}-root`, { 'background-color': active ? 'rgb(224, 242, 254)' : 'rgb(241, 245, 249)' }, [encodeClassName('inline/card__root')])
          await probe(page, `${prefix}-label`, {
            color: active ? 'rgb(2, 132, 199)' : 'rgb(71, 85, 105)',
            ...(prefix === 'named' ? { 'font-weight': active ? '700' : '400' } : {}),
          }, [encodeClassName('inline/card__label')])
        }
        if (cycle < 4) {
          const toggle: Element | null = await connection.request((): Promise<Element | null> => page.$('#toggle'))
          assert(toggle)
          await connection.request(() => toggle.tap())
        }
      }
      await screenshot(path.join(evidence, `runtime-${scenario}.png`))
      await runSharedScenarios({
        name: 'wevu',
        page,
        runtime,
        request: connection.request,
        find: selector => find(page, selector, ['panda-button'], connection.request),
        css: acceptanceStylesheet,
        systemInfo,
        evidence,
        cycle: scenario,
        compare: (baseline, current, target) => compareAppViewport(baseline, current, systemInfo.screenTop, systemInfo.screenWidth, target),
      })
    }
    logs.assertClean()
    await fs.writeFile(path.join(evidence, 'layer-styles.json'), JSON.stringify(observed, null, 2))
    await fs.writeFile(path.join(evidence, 'runtime-probes.json'), JSON.stringify(probes, null, 2))
    // Attach the CLI observer before releasing the suite connection, then keep
    // it alive until this project's endpoint has closed.
    const ownedProject = projectPath
    assert(ownedProject)
    const inspection = createConnectionLifecycle<MiniProgram>(cancellation.signal)
    let cliRuntime: MiniProgram | undefined
    await withCleanup(async () => {
      cliRuntime = await inspection.connect(() => automator.connect({ wsEndpoint: `ws://127.0.0.1:${address.port}` }))
      await logs.start(cliRuntime, inspection.request)
      await logs.drain(runtime, connection.request)
      await connection.disconnect()
      miniProgram = undefined
      const observer = cliRuntime
      const endpoint = ['--project', ownedProject, '--port', String(address.port), '--no-runtime-service', '--json']
      await wv('cli-relaunch', ['relaunch', '/pages/acceptance/index', ...endpoint])
      const current = await wv('cli-current-page', ['current-page', ...endpoint])
      assert.equal(JSON.parse(current.slice(current.indexOf('{'))).path, 'pages/acceptance/index')
      const baseline = path.join(evidence, 'cli-neutral.png')
      await settleViewport(observer, inspection.request)
      await wv('cli-screenshot', ['screenshot', ...endpoint, '--output', baseline])
      const currentCapture = path.join(evidence, 'cli-repeat.png')
      const comparison = await wv('cli-compare', ['compare', ...endpoint, '--baseline', baseline, '--current-output', currentCapture, '--diff-output', path.join(evidence, 'cli-diff.png'), '--max-diff-pixels', '0'], true)
      const comparisonResult = JSON.parse(comparison.slice(comparison.indexOf('{')))
      assert.equal(typeof comparisonResult.passed, 'boolean', 'CLI compare must return a structured image comparison')
      assert.equal(typeof comparisonResult.diffPixels, 'number')
      await compareAppViewport(baseline, currentCapture, systemInfo.screenTop, systemInfo.screenWidth, evidence)
      const cliRendering: unknown[] = []
      for (let toggle = 1; toggle <= 4; toggle++) {
        const active = toggle % 2 === 1
        await wv(`cli-tap-${toggle}`, ['tap', '#toggle', ...endpoint])
        const data = await wv(`cli-data-${toggle}`, ['page-data', ...endpoint])
        assert.equal(JSON.parse(data.slice(data.indexOf('{'))).active, active, 'CLI tap must update actual page data')
        const page: Page | undefined = await inspection.request(() => observer.currentPage())
        assert(page)
        for (const [id, expected] of Object.entries(scenarioState(active))) {
          const element: Element | null = await inspection.request((): Promise<Element | null> => page.$(`#${id}`))
          assert(element, `CLI rendered state is missing #${id}`)
          const classes = await inspection.request(() => element.attribute('class'))
          const actual: Record<string, string> = {}
          for (const [property, value] of Object.entries(expected)) {
            actual[property] = await inspection.request(() => element.style(property))
            assert.equal(actual[property], value, `CLI tap #${id}.${property}`)
          }
          cliRendering.push({ toggle, active, id, classes, expected, actual })
        }
      }
      await fs.writeFile(path.join(evidence, 'cli-rendering.json'), JSON.stringify(cliRendering, null, 2))
      const restored = path.join(evidence, 'cli-restored.png')
      await settleViewport(observer, inspection.request)
      await wv('cli-restored-screenshot', ['screenshot', ...endpoint, '--output', restored])
      const restoredEvidence = path.join(evidence, 'cli-restored-pixels')
      await fs.mkdir(restoredEvidence, { recursive: true })
      await compareAppViewport(baseline, restored, systemInfo.screenTop, systemInfo.screenWidth, restoredEvidence)
    }, [
      async () => {
        if (cliRuntime && !cancellation.signal.aborted) {
          await logs.drain(cliRuntime, inspection.request)
        }
      },
      closeOwnedProject,
      verifyOwnedEndpointClosed,
      () => inspection.dispose(),
      () => logs.assertClean(),
    ])
    const matrixFailures: { name: string, error: string }[] = []
    const suites = [
      { name: 'frameworks', run: () => runFrameworks({ root, evidence, appid, cliPath, wvCli, libVersion: config.libVersion, signal: cancellation.signal }) },
      { name: 'native', run: () => runNative({ evidence, appid, cliPath, wvCli, libVersion: config.libVersion, signal: cancellation.signal }) },
    ]
    for (const suite of suites) {
      cancellation.signal.throwIfAborted()
      try {
        await suite.run()
      }
      catch (error) {
        matrixFailures.push({ name: suite.name, error: (error instanceof Error ? error.stack ?? error.message : String(error)).replaceAll(appid, '<authorized-appid>') })
        await fs.writeFile(path.join(evidence, 'matrix-failures.json'), JSON.stringify(matrixFailures, null, 2))
        if (error instanceof ProjectCleanupError) {
          throw error
        }
      }
    }
    if (matrixFailures.length) {
      throw new AggregateError(matrixFailures, `IDE matrix failed:\n${matrixFailures.map(failure => `${failure.name}: ${failure.error}`).join('\n')}`)
    }
  }, [
    () => cancellation.signal.throwIfAborted(),
    async () => {
      if (miniProgram && !cancellation.signal.aborted) {
        await logs.drain(miniProgram, connection.request)
      }
    },
    closeOwnedProject,
    verifyOwnedEndpointClosed,
    () => connection.dispose(),
    () => logs.assertClean(),
    () => fs.writeFile(path.join(evidence, 'console.json'), JSON.stringify({ exceptions: errors, messages: consoleMessages }, null, 2).replaceAll(appid, '<authorized-appid>')),
    () => fs.writeFile(path.join(evidence, 'runtime-probes.json'), JSON.stringify(probes, null, 2)),
    async () => {
      if (projectPath) {
        await fs.rm(projectPath, { recursive: true, force: true })
        projectRemoved = true
      }
    },
    async () => {
      if (projectPath) {
        await fs.writeFile(path.join(evidence, 'cleanup.json'), JSON.stringify({ projectPath, port: automationPort, closed: projectClosed, endpointClosed, removed: projectRemoved }, null, 2))
      }
    },
    () => {
      clearTimeout(timeout)
      process.removeListener('SIGINT', cancel)
      process.removeListener('SIGTERM', cancel)
    },
    () => lock.close(),
    () => fs.rm(lockPath),
    () => cancellation.signal.throwIfAborted(),
  ]).catch((error: unknown) => fail(error, ['cleanup.json', 'framework-cleanup.json', 'native/cleanup.json']))
  await fs.writeFile(path.join(evidence, 'result.json'), JSON.stringify({
    passed: true,
    gitSha,
    startedAt,
    completedAt: new Date().toISOString(),
    environment: 'environment.json',
    cleanup: ['cleanup.json', 'framework-cleanup.json', 'native/cleanup.json'],
  }, null, 2))
  process.stdout.write(`DevTools E2E passed: ${probes.length} rendered style probes, runtime APIs, repeated toggles, WXSS matching, reLaunch reset, weapp-vite CLI capture/compare and owned resource cleanup.\n`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  const appid = process.env.WEAPP_VITE_E2E_APPID
  process.stderr.write(`${appid ? message.replaceAll(appid, '<authorized-appid>') : message}\n`)
  process.exitCode = 1
})
