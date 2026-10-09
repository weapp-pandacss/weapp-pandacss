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

// This is an opt-in real IDE test, separate from mpcore's logical runtime.
// Version values are operator evidence; they are not auto-detected by the SDK.
type MiniProgram = Awaited<ReturnType<typeof automator.connect>>
type Page = NonNullable<Awaited<ReturnType<MiniProgram['reLaunch']>>>

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
  const evidence = path.join(root, 'e2e-artifacts/devtools')
  await fs.mkdir(evidence, { recursive: true })
  const lockPath = path.join(root, 'e2e-artifacts/devtools.lock')
  const lock = await fs.open(lockPath, 'wx')
  let projectPath: string | undefined
  let miniProgram: MiniProgram | undefined
  let launchAttempted = false
  const errors: unknown[] = []
  const cancellation = new AbortController()
  const cancel = () => {
    cancellation.abort(new Error('DevTools E2E cancelled or timed out'))
    miniProgram?.disconnect()
  }
  process.once('SIGINT', cancel)
  process.once('SIGTERM', cancel)
  const timeout = setTimeout(cancel, 180_000)
  try {
    projectPath = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-panda-ide-'))
    await fs.cp(path.join(example, 'dist'), path.join(projectPath, 'dist'), { recursive: true })
    const config = JSON.parse(await fs.readFile(path.join(example, 'project.config.json'), 'utf8'))
    assert.match(String(config.libVersion), /^\d+\.\d+\.\d+$/, 'Pin a formal base-library version in the fixture; trial/develop aliases are not accepted.')
    await fs.writeFile(path.join(projectPath, 'project.config.json'), JSON.stringify({ ...config, appid }, null, 2))
    await fs.writeFile(path.join(projectPath, 'project.private.config.json'), JSON.stringify({
      condition: { miniprogram: { list: [{ name: 'Panda E2E', pathName: 'pages/index/index', query: '' }] } },
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
    await execa(cliPath, ['auto', '--project', projectPath, '--auto-port', String(address.port)], { timeout: 60_000, cancelSignal: cancellation.signal })
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
      systemInfo,
    }, null, 2))
    const stylesheet = await fs.readFile(path.join(projectPath, 'dist/app.wxss'), 'utf8')
    const selectors = new Set([...stylesheet.matchAll(/\.([\w-]+)/g)].map(match => match[1]!))
    assert(!/@layer|:not\(n\)|:not\(#/.test(stylesheet), 'Ordered WXSS must not contain layers or generated specificity placeholders')
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
    async function expectStatus(page: Page, expected: string) {
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        const status = await page.$('#status')
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
    assert.deepEqual(errors, [], 'Real AppService exceptions must not be swallowed')
    await fs.writeFile(path.join(evidence, 'layer-styles.json'), JSON.stringify(observed, null, 2))
    process.stdout.write('DevTools E2E passed: rendered styles, toggles, WXSS matching and reLaunch reset.\n')
  }
  finally {
    miniProgram?.disconnect()
    try {
      // Close only the uniquely created project, preserving other IDE windows.
      if (launchAttempted && projectPath) {
        await execa(cliPath, ['close', '--project', projectPath], { timeout: 30_000 })
      }
      if (projectPath) {
        await fs.rm(projectPath, { recursive: true, force: true })
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

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`)
  process.exitCode = 1
})
