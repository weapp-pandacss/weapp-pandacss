import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
// eslint-disable-next-line e18e/ban-dependencies -- Match the suite's cross-platform CLI launcher.
import { execa } from 'execa'
import automator from 'miniprogram-automator'
import postcss from 'postcss'
import { encodeClassName } from '../../packages/runtime/src/index.ts'

type MiniProgram = Awaited<ReturnType<typeof automator.connect>>
type Page = NonNullable<Awaited<ReturnType<MiniProgram['reLaunch']>>>
type Element = NonNullable<Awaited<ReturnType<Page['$']>>>

interface Context {
  root: string
  evidence: string
  appid: string
  cliPath: string
  wvCli: string
  libVersion: string
  signal: AbortSignal
}

async function stylesheets(root: string): Promise<string> {
  const entries = await fs.readdir(root, { withFileTypes: true })
  const contents: string[] = []
  for (const entry of entries) {
    const file = path.join(root, entry.name)
    if (entry.isDirectory()) {
      contents.push(await stylesheets(file))
    }
    else if (entry.name.endsWith('.wxss')) {
      contents.push(await fs.readFile(file, 'utf8'))
    }
  }
  return contents.join('\n')
}

async function find(root: Page | Element, selector: string, components: string[], depth = 0): Promise<Element | null> {
  const direct = await root.$(selector)
  if (direct) {
    return direct
  }
  if (depth >= 8) {
    return null
  }
  for (const tag of components) {
    for (const child of await root.$$(tag) as Element[]) {
      const node = await find(child, selector, components, depth + 1)
      if (node) {
        return node
      }
    }
  }
  return null
}

/** Real framework probes share the parent suite lock and run sequentially. */
export async function runFrameworks(context: Context) {
  const apps = [
    { name: 'taro-react', folder: 'taro-app', dist: 'dist/weapp', tokens: 'styled-system/weapp/tokens/index.mjs', probes: [
      { raw: 'bg_blue.500', styles: { 'background-color': 'colors.blue.500' } },
      { raw: 'c_red.400', styles: { color: 'colors.red.400' } },
    ] },
    { name: 'taro-vue', folder: 'taro-app-vue3', dist: 'dist/weapp', tokens: 'styled-system/weapp/tokens/index.mjs', probes: [
      { raw: 'bg_yellow.200', styles: { 'background-color': 'colors.yellow.200', 'color': 'colors.pink.500' } },
    ] },
    { name: 'uni-app', folder: 'uni-app-vue3', dist: 'dist/build/mp-weixin', tokens: 'styled-system/mp-weixin/tokens/index.mjs', probes: [
      { raw: 'c_red.300', styles: { 'color': 'colors.red.300', 'background-color': 'colors.blue.800' } },
      { raw: 'bg_blue.500', styles: { 'background-color': 'colors.blue.500', 'color': 'colors.white' } },
    ] },
  ]
  const observed: unknown[] = []
  const cleaned: unknown[] = []
  for (const app of apps) {
    context.signal.throwIfAborted()
    const example = path.join(context.root, 'examples', app.folder)
    const project = await fs.mkdtemp(path.join(os.tmpdir(), `weapp-panda-${app.name}-`))
    let miniProgram: MiniProgram | undefined
    const disconnect = () => miniProgram?.disconnect()
    context.signal.addEventListener('abort', disconnect)
    let opened = false
    const exceptions: unknown[] = []
    try {
      await fs.cp(path.join(example, app.dist), path.join(project, 'dist'), { recursive: true })
      await fs.writeFile(path.join(project, 'project.config.json'), JSON.stringify({
        appid: context.appid,
        projectname: `Panda ${app.name} acceptance`,
        miniprogramRoot: 'dist/',
        compileType: 'miniprogram',
        libVersion: context.libVersion,
        setting: { es6: true, enhance: false, postcss: false, minified: false, compileHotReLoad: false },
      }, null, 2))
      await fs.writeFile(path.join(project, 'project.private.config.json'), JSON.stringify({ condition: { miniprogram: { list: [{ name: app.name, pathName: 'pages/index/index', query: '' }] } } }, null, 2))
      const server = net.createServer()
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(0, '127.0.0.1', resolve)
      })
      const port = (server.address() as net.AddressInfo).port
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
      opened = true
      const launch = await execa(process.execPath, [context.wvCli, 'auto', '--project', project, '--auto-port', String(port), '--trust-project'], { timeout: 60_000, cancelSignal: context.signal })
      await fs.writeFile(path.join(context.evidence, `${app.name}-cli.log`), `${launch.stdout}\n${launch.stderr}\n`)
      const deadline = Date.now() + 30_000
      while (!miniProgram) {
        context.signal.throwIfAborted()
        try {
          miniProgram = await automator.connect({ wsEndpoint: `ws://127.0.0.1:${port}` })
        }
        catch (error) {
          if (Date.now() >= deadline) {
            throw error
          }
          await delay(500)
        }
      }
      miniProgram.on('exception', error => exceptions.push(error))
      const systemInfo = await miniProgram.systemInfo()
      assert.equal(systemInfo.SDKVersion, context.libVersion)
      const css = await stylesheets(path.join(project, 'dist'))
      const selectors = new Set([...css.matchAll(/\.([\w-]+)/g)].map(match => match[1]!))
      const compiled = postcss.parse(css)
      const { token } = await import(pathToFileURL(path.join(example, app.tokens)).href)
      // Resolve the actual emitted token, including downstream framework color
      // transforms. Do not compare Uni's RGB output to Panda's pre-build OKLCH.
      const references = new Map<string, { authored: string, variable: string, compiled: string, computed: string }>()
      const browser = await chromium.launch({ headless: true })
      try {
        const reference = await browser.newPage()
        for (const fixture of app.probes) {
          for (const name of Object.values(fixture.styles)) {
            if (references.has(name)) {
              continue
            }
            const variable = token.var(name)
            const identifier = /^var\((--[\w-]+)\)$/.exec(variable)?.[1]
            assert(identifier, `${app.name}: missing token variable ${name}`)
            const definitions = new Set<string>()
            compiled.walkDecls(identifier, (declaration) => {
              definitions.add(declaration.value)
            })
            assert.equal(definitions.size, 1, `${app.name}: missing or ambiguous final WXSS token ${name}`)
            const value = [...definitions][0]!
            const computed = await reference.evaluate(({ identifier, value, variable }) => {
              const node = document.createElement('div')
              node.style.setProperty(identifier, value)
              node.style.color = variable
              document.body.append(node)
              const color = getComputedStyle(node).color
              node.remove()
              return color
            }, { identifier, value, variable })
            references.set(name, { authored: token(name), variable, compiled: value, computed })
          }
        }
      }
      finally {
        await browser.close()
      }
      const pageConfig = JSON.parse(await fs.readFile(path.join(project, 'dist/pages/index/index.json'), 'utf8'))
      const components = Object.keys(pageConfig.usingComponents)
      for (let cycle = 0; cycle < 2; cycle++) {
        const page: Page | undefined = await miniProgram.reLaunch('/pages/index/index')
        assert(page)
        for (const fixture of app.probes) {
          const className = encodeClassName(fixture.raw)
          let node: Element | null = null
          const deadline = Date.now() + 10_000
          while (!node && Date.now() < deadline) {
            node = await find(page, `.${className}`, components)
            if (!node) {
              await delay(100)
            }
          }
          assert(node, `${app.name}: missing real rendered ${className}`)
          const actual: Record<string, string> = {}
          assert(selectors.has(className), `${app.name}: missing WXSS selector ${className}`)
          const classes = (await node.attribute('class')).split(/\s+/).map(name => name.replace(/^(?:comp|ice-button-panda)--/, ''))
          assert(classes.includes(className))
          const expected: Record<string, unknown> = {}
          for (const [property, name] of Object.entries(fixture.styles)) {
            actual[property] = await node.style(property)
            const reference = references.get(name)!
            let matchingDeclaration = false
            compiled.walkRules((rule) => {
              if (![...rule.selector.matchAll(/\.([\w-]+)/g)].some(match => classes.includes(match[1]!))) {
                return
              }
              rule.walkDecls((declaration) => {
                if ((declaration.prop === property || (property === 'background-color' && declaration.prop === 'background')) && declaration.value === reference.variable) {
                  matchingDeclaration = true
                }
              })
            })
            assert(matchingDeclaration, `${app.name}: rendered classes must reference ${name} in final WXSS`)
            assert.equal(actual[property], reference.computed, `${app.name}: ${className}.${property}`)
            expected[property] = reference
          }
          observed.push({ app: app.name, cycle, className, styles: actual, references: expected, sdkVersion: systemInfo.SDKVersion })
        }
        await miniProgram.screenshot({ path: path.join(context.evidence, `${app.name}-${cycle}.png`) })
      }
      assert.deepEqual(exceptions, [], `${app.name}: AppService exceptions`)
      process.stdout.write(`${app.name}: real rendered Panda styles, WXSS matching and repeated reLaunch passed.\n`)
    }
    finally {
      context.signal.removeEventListener('abort', disconnect)
      miniProgram?.disconnect()
      try {
        if (opened) {
          await execa(context.cliPath, ['close', '--project', project], { timeout: 30_000 })
        }
        await fs.rm(project, { recursive: true, force: true })
        cleaned.push({ app: app.name, project, closed: true, removed: true })
      }
      finally {
        await fs.writeFile(path.join(context.evidence, 'framework-probes.json'), JSON.stringify(observed, null, 2))
        await fs.writeFile(path.join(context.evidence, 'framework-cleanup.json'), JSON.stringify(cleaned, null, 2))
        await fs.writeFile(path.join(context.evidence, `${app.name}-exceptions.json`), JSON.stringify(exceptions, null, 2))
      }
    }
  }
}
