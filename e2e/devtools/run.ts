import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from '@playwright/test'
// eslint-disable-next-line e18e/ban-dependencies -- Handles Windows CLI batch files and scoped process timeouts.
import { execa } from 'execa'
import automator from 'miniprogram-automator'
import { encodeClassName } from '../../packages/runtime/src/index.ts'
import { runFrameworks } from './frameworks.ts'

// This is an opt-in real IDE test, separate from mpcore's logical runtime.
// Version values are operator evidence; they are not auto-detected by the SDK.
type MiniProgram = Awaited<ReturnType<typeof automator.connect>>
type Page = NonNullable<Awaited<ReturnType<MiniProgram['reLaunch']>>>

async function compareAppViewport(baseline: string, current: string, top: number, screenWidth: number, evidence: string) {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    const images = await Promise.all([baseline, current].map(async file => `data:image/png;base64,${(await fs.readFile(file)).toString('base64')}`))
    const result = await page.evaluate(async ({ images, top, screenWidth }) => {
      const captures = await Promise.all(images.map(async (url) => {
        const image = new Image()
        image.src = url
        await image.decode()
        return image
      }))
      const [first, second] = captures
      if (!first || !second || first.width !== second.width || first.height !== second.height) {
        throw new Error('CLI screenshots must have matching dimensions')
      }
      // Crop by measured viewport origin, never by observed diff locations.
      // The IDE's clock belongs to its device chrome, outside the app viewport.
      const cropTop = Math.ceil(top * first.width / screenWidth)
      if (!(cropTop > 0 && cropTop < first.height)) {
        throw new Error('Missing measured app viewport origin')
      }
      const crops = captures.map((image) => {
        const canvas = document.createElement('canvas')
        canvas.width = image.width
        canvas.height = image.height - cropTop
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, -cropTop)
        return { data: context.getImageData(0, 0, canvas.width, canvas.height).data, png: canvas.toDataURL('image/png') }
      })
      let diffPixels = 0
      for (let i = 0; i < crops[0]!.data.length; i += 4) {
        if ([0, 1, 2, 3].some(channel => crops[0]!.data[i + channel] !== crops[1]!.data[i + channel])) {
          diffPixels++
        }
      }
      return { diffPixels, cropTop, width: first.width, height: first.height - cropTop, baseline: crops[0]!.png, current: crops[1]!.png }
    }, { images, top, screenWidth })
    const { baseline: baselinePng, current: currentPng, ...metrics } = result
    await fs.writeFile(path.join(evidence, 'cli-viewport-baseline.png'), Buffer.from(baselinePng.split(',')[1]!, 'base64'))
    await fs.writeFile(path.join(evidence, 'cli-viewport-current.png'), Buffer.from(currentPng.split(',')[1]!, 'base64'))
    await fs.writeFile(path.join(evidence, 'cli-viewport-compare.json'), JSON.stringify({ ...metrics, viewportTop: top, screenWidth }, null, 2))
    assert.equal(result.diffPixels, 0, 'Repeated CLI captures must have identical app viewport pixels')
  }
  finally {
    await browser.close()
  }
}

async function main() {
  const cliPath = process.env.WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH
  const appid = process.env.WEAPP_VITE_E2E_APPID
  const stableVersion = process.env.WEAPP_VITE_E2E_DEVTOOLS_STABLE_VERSION
  const installedVersion = process.env.WEAPP_VITE_E2E_DEVTOOLS_INSTALLED_VERSION
  const checkedAt = process.env.WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT
  assert(cliPath && path.isAbsolute(cliPath), 'Set WEAPP_VITE_E2E_DEVTOOLS_CLI_PATH to the explicit absolute stable IDE CLI path.')
  assert(appid && /^wx[\da-f]{16}$/i.test(appid), 'Set WEAPP_VITE_E2E_APPID to an authorized real AppID; touristappid is not accepted.')
  assert(stableVersion && installedVersion === stableVersion, 'Verify the latest official stable IDE and set matching STABLE_VERSION / INSTALLED_VERSION evidence; RC/nightly fallback is not allowed.')
  const age = Date.now() - Date.parse(checkedAt ?? '')
  assert(age >= 0 && age < 24 * 60 * 60 * 1000, 'Set WEAPP_VITE_E2E_DEVTOOLS_CHECKED_AT to the ISO time of the official stable-version check, within 24 hours.')
  await fs.access(cliPath)

  const root = path.resolve(import.meta.dirname, '../..')
  const example = path.join(root, 'examples/weapp-vite-app')
  const wvCli = path.join(example, 'node_modules/weapp-vite/bin/weapp-vite.js')
  const evidence = path.join(root, 'e2e-artifacts/devtools')
  await fs.mkdir(evidence, { recursive: true })
  const lockPath = path.join(root, 'e2e-artifacts/devtools.lock')
  const lock = await fs.open(lockPath, 'wx')
  let projectPath: string | undefined
  let miniProgram: MiniProgram | undefined
  let launchAttempted = false
  const errors: unknown[] = []
  const consoleMessages: unknown[] = []
  const probes: unknown[] = []
  const cancellation = new AbortController()
  const cancel = () => {
    cancellation.abort(new Error('DevTools E2E cancelled or timed out'))
    miniProgram?.disconnect()
  }
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  const timeout = setTimeout(cancel, 480_000)
  try {
    async function wv(name: string, args: string[], visualComparison = false) {
      const output = await execa(process.execPath, [wvCli, ...args], { cwd: example, timeout: 60_000, cancelSignal: cancellation.signal, reject: false })
      await fs.writeFile(path.join(evidence, `${name}.log`), `${output.stdout}\n${output.stderr}\n`)
      assert(output.exitCode === 0 || (visualComparison && output.exitCode === 1), `${name} failed: ${output.stderr}`)
      return output.stdout
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
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
    launchAttempted = true
    // execa handles Windows .bat/.cmd launch. Do not use the SDK's raw spawn
    // launcher or its Tool.close, which can affect a borrowed IDE host.
    await wv('cli-auto', ['auto', '--project', projectPath, '--auto-port', String(address.port), '--trust-project'])
    const deadline = Date.now() + 30_000
    while (!miniProgram) {
      cancellation.signal.throwIfAborted()
      try {
        miniProgram = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${address.port}` })
      }
      catch (error) {
        if (Date.now() >= deadline) {
          throw error
        }
        await delay(500)
      }
    }
    miniProgram.on('exception', error => errors.push(error))
    miniProgram.on('console', message => consoleMessages.push(message))
    const systemInfo = await miniProgram.systemInfo()
    assert.equal(systemInfo.SDKVersion, config.libVersion, 'The connected runtime must use the fixture\'s pinned formal base-library release.')
    await fs.writeFile(path.join(evidence, 'environment.json'), JSON.stringify({
      provider: 'devtools',
      officialSource: 'https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html',
      officialConfigSource: 'https://devtools.wxqcloud.qq.com.cn/WechatWebDev/nightly/versions/config.json',
      checkedAt,
      stableVersion,
      installedVersion,
      versionEvidence: 'operator-verified',
      cliPath,
      launcher: 'weapp-vite auto',
      weappViteVersion: JSON.parse(await fs.readFile(path.join(example, 'node_modules/weapp-vite/package.json'), 'utf8')).version,
      systemInfo,
    }, null, 2))
    const stylesheet = await fs.readFile(path.join(projectPath, 'dist/app.wxss'), 'utf8')
    const selectors = new Set([...stylesheet.matchAll(/\.([\w-]+)/g)].map(match => match[1]!))
    assert(!/@layer|:not\(n\)|:not\(#/.test(stylesheet), 'Ordered WXSS must not contain layers or generated specificity placeholders')
    assert(!/:where\(/.test(stylesheet), 'WXSS must contain expanded platform selectors')
    for (const variable of stylesheet.matchAll(/var\(\s*(--[^,\s)]+)/g)) {
      assert.match(variable[1]!, /^--[\w-]+$/, 'Panda variables must be valid WXSS identifiers')
    }
    async function probe(page: Page, id: string, expected: Record<string, string | number>, markers: string[] = []) {
      const node = await page.$(`#${id}`)
      assert(node, `Missing rendered probe ${id}`)
      const classes = (await node.attribute('class')).trim().split(/\s+/)
      assert(classes.length && classes[0], `${id} must have classes`)
      for (const name of classes) {
        assert.match(name, /^[A-Z_][\w-]*$/i, `${id} has an unsafe class`)
        assert(selectors.has(name) || markers.includes(name), `Missing WXSS selector for ${id}: ${name}`)
      }
      const styles: Record<string, string> = {}
      for (const [property, value] of Object.entries(expected)) {
        styles[property] = await node.style(property)
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
      const normal = await page.$('#layer-normal')
      const important = await page.$('#layer-important')
      assert(normal && important, 'Layer probes must render')
      const expected = active ? ['layer-normal-accent', 'layer-important-accent'] : ['layer-normal-neutral', 'layer-important-neutral']
      assert.equal(await normal.attribute('class'), expected[0])
      assert.equal(await important.attribute('class'), expected[1])
      expected.forEach(name => assert(selectors.has(name), `Missing WXSS selector ${name}`))
      const color = await normal.style('color')
      const importantColor = await important.style('color')
      assert.equal(color, active ? 'rgb(22, 163, 74)' : 'rgb(2, 132, 199)')
      assert.equal(importantColor, active ? 'rgb(234, 88, 12)' : 'rgb(124, 58, 237)')
      observed.push({ active, color, importantColor, classes: expected })
    }
    async function buttonOn(page: Page) {
      const component = await page.$('panda-button')
      assert(component, 'PandaButton component must be registered')
      const button = await component.$('#variant-button')
      assert(button, 'PandaButton must render its button')
      const classes = await button.attribute('class')
      assert(classes.trim(), 'The button must have generated classes')
      assert('data' in component && typeof component.data === 'function', 'The registered component must expose runtime data')
      const runtimeClasses = String(await component.data('buttonClass')).trim().split(/\s+/)
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
    async function expectStatus(page: Page, expected: string, id = 'status') {
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const status = await page.$(`#${id}`)
        if (status && (await status.text()).trim() === expected) {
          return
        }
        await delay(50)
      }
      assert.fail(`Page state did not become ${expected}`)
    }
    // Launch once; reLaunch resets the page between scenarios.
    for (let scenario = 0; scenario < 2; scenario++) {
      cancellation.signal.throwIfAborted()
      const page: Page | undefined = await miniProgram.reLaunch('/pages/index/index')
      assert(page, 'The example route must launch')
      await expectStatus(page, 'neutral')
      await probe(page, 'title', { 'color': 'oklch(0.588 0.158 241.966)', 'font-weight': '700' })
      await probe(page, 'card', { 'background-color': 'rgb(255, 255, 255)' })
      assert.equal(await probe(page, 'manual', { color: 'rgb(255, 0, 0)' }), encodeClassName('manual/中文_wp_2e_'))
      await probe(page, 'token', { 'padding-top': Math.floor(4 * systemInfo.windowWidth / 750) })
      await layerStyles(page, false)
      const initial = await (await buttonOn(page)).attribute('class')
      const background = await (await buttonOn(page)).style('background-color')
      await (await buttonOn(page)).tap()
      await expectStatus(page, 'accent')
      await layerStyles(page, true)
      assert.notEqual(await (await buttonOn(page)).attribute('class'), initial)
      assert.notEqual(await (await buttonOn(page)).style('background-color'), background)
      await miniProgram.screenshot({ path: path.join(evidence, `accent-${scenario}.png`) })
      await (await buttonOn(page)).tap()
      await expectStatus(page, 'neutral')
      await layerStyles(page, false)
      assert.equal(await (await buttonOn(page)).attribute('class'), initial)
    }
    for (let scenario = 0; scenario < 2; scenario++) {
      const page: Page | undefined = await miniProgram.reLaunch('/pages/acceptance/index')
      assert(page, 'Runtime acceptance route must launch')
      await expectStatus(page, 'neutral', 'acceptance-status')
      const pageSize = await page.size()
      // The pinned WebView renderer truncates positive rpx dimensions to CSS
      // pixels. Negative token calc() negates the already resolved dimension.
      const rpx = (value: number) => Math.floor(value * Number(pageSize.width) / 750)
      const atomicNode = await page.$('#atomic')
      assert(atomicNode)
      await fs.writeFile(path.join(evidence, 'viewport.json'), JSON.stringify({ systemWidth: systemInfo.windowWidth, pageSize, atomic: { fontSize: await atomicNode.style('font-size'), padding: await atomicNode.style('padding-top'), width: await atomicNode.style('width') } }, null, 2))
      await probe(page, 'atomic', { 'color': 'rgb(220, 38, 38)', 'font-size': rpx(48), 'padding-top': rpx(16), 'width': (Number(pageSize.width) - 2 * rpx(16)) / 2 })
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
          const toggle: Awaited<ReturnType<Page['$']>> = await page.$('#toggle')
          assert(toggle)
          await toggle.tap()
        }
      }
      await miniProgram.screenshot({ path: path.join(evidence, `runtime-${scenario}.png`) })
    }
    assert.deepEqual(errors, [], 'Real AppService exceptions must not be swallowed')
    await fs.writeFile(path.join(evidence, 'layer-styles.json'), JSON.stringify(observed, null, 2))
    await fs.writeFile(path.join(evidence, 'runtime-probes.json'), JSON.stringify(probes, null, 2))
    // CLI acceptance reuses the same project's explicit endpoint. Release the
    // suite connection before CLI commands; none may launch another project.
    miniProgram.disconnect()
    miniProgram = undefined
    const endpoint = ['--project', projectPath, '--port', String(address.port), '--no-runtime-service', '--json']
    await wv('cli-relaunch', ['relaunch', '/pages/acceptance/index', ...endpoint])
    const current = await wv('cli-current-page', ['current-page', ...endpoint])
    assert.equal(JSON.parse(current.slice(current.indexOf('{'))).path, 'pages/acceptance/index')
    const baseline = path.join(evidence, 'cli-neutral.png')
    await wv('cli-screenshot', ['screenshot', ...endpoint, '--output', baseline])
    const currentCapture = path.join(evidence, 'cli-repeat.png')
    const comparison = await wv('cli-compare', ['compare', ...endpoint, '--baseline', baseline, '--current-output', currentCapture, '--diff-output', path.join(evidence, 'cli-diff.png'), '--max-diff-pixels', '0'], true)
    const comparisonResult = JSON.parse(comparison.slice(comparison.indexOf('{')))
    assert.equal(typeof comparisonResult.passed, 'boolean', 'CLI compare must return a structured image comparison')
    assert.equal(typeof comparisonResult.diffPixels, 'number')
    await compareAppViewport(baseline, currentCapture, systemInfo.screenTop, systemInfo.screenWidth, evidence)
    await wv('cli-tap', ['tap', '#toggle', ...endpoint])
    const data = await wv('cli-accent-data', ['page-data', ...endpoint])
    assert.equal(JSON.parse(data.slice(data.indexOf('{'))).active, true, 'CLI tap must update actual page data')
    await wv('cli-accent-screenshot', ['screenshot', ...endpoint, '--output', path.join(evidence, 'cli-accent.png')])
    await runFrameworks({ root, evidence, appid, cliPath, wvCli, libVersion: config.libVersion, signal: cancellation.signal })
    process.stdout.write(`DevTools E2E passed: ${probes.length} rendered style probes, runtime APIs, repeated toggles, WXSS matching, reLaunch reset and weapp-vite CLI capture/compare.\n`)
  }
  finally {
    try {
      await fs.writeFile(path.join(evidence, 'console.json'), JSON.stringify({ exceptions: errors, messages: consoleMessages }, null, 2))
      await fs.writeFile(path.join(evidence, 'runtime-probes.json'), JSON.stringify(probes, null, 2))
    }
    finally {
      miniProgram?.disconnect()
      try {
        // The wv close helper has global recovery behavior. Use the verified
        // official CLI with an explicit project to preserve borrowed windows.
        if (launchAttempted && projectPath) {
          await execa(cliPath, ['close', '--project', projectPath], { timeout: 30_000 })
        }
        if (projectPath) {
          await fs.rm(projectPath, { recursive: true, force: true })
          await fs.writeFile(path.join(evidence, 'cleanup.json'), JSON.stringify({ projectPath, closed: true, removed: true }, null, 2))
        }
      }
      finally {
        clearTimeout(timeout)
        process.removeListener('SIGINT', cancel)
        process.removeListener('SIGTERM', cancel)
        await lock.close()
        await fs.rm(lockPath)
      }
    }
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
