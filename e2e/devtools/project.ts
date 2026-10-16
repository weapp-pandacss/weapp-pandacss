import type { SdkRequest } from './lifecycle.ts'
import type { RpxSystemInfo } from './rpx.ts'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
// eslint-disable-next-line e18e/ban-dependencies -- Scoped cross-platform IDE CLI process.
import { execa } from 'execa'
import automator from 'miniprogram-automator'
import { createConnectionLifecycle, withCleanup } from './lifecycle.ts'
import { createAppLogs } from './logs.ts'

type MiniProgram = Awaited<ReturnType<typeof automator.connect>>

export class ProjectCleanupError extends Error {}

export interface ProjectContext {
  name: string
  sourceDist: string
  appid: string
  libVersion: string
  cliPath: string
  wvCli: string
  evidence: string
  signal: AbortSignal
  settings?: Record<string, unknown>
}

/** Preserve the example's compiler flags without copying its project paths. */
export async function readCompilerSettings(configPath: string): Promise<Record<string, unknown>> {
  const config: unknown = JSON.parse(await fs.readFile(configPath, 'utf8'))
  assert(config && typeof config === 'object' && !Array.isArray(config), `${configPath}: project config must be an object`)
  const setting = 'setting' in config ? config.setting : undefined
  assert(setting && typeof setting === 'object' && !Array.isArray(setting), `${configPath}: setting must be an object`)
  const source = setting as Record<string, unknown>
  const settings: Record<string, unknown> = {}
  for (const key of ['es6', 'enhance', 'postcss', 'minified', 'compileHotReLoad']) {
    if (key in source) {
      assert.equal(typeof source[key], 'boolean', `${configPath}: setting.${key} must be a boolean`)
      settings[key] = source[key]
    }
  }
  if ('babelSetting' in source) {
    const babelSetting = source.babelSetting
    assert(babelSetting && typeof babelSetting === 'object' && !Array.isArray(babelSetting), `${configPath}: setting.babelSetting must be an object`)
    settings.babelSetting = babelSetting
  }
  return settings
}

async function availablePort() {
  const server = net.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const port = (server.address() as net.AddressInfo).port
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  return port
}

async function endpointOpen(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = net.connect(port, '127.0.0.1')
    socket.setTimeout(1000)
    const finish = (open: boolean) => {
      socket.destroy()
      resolve(open)
    }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(true))
  })
}

export async function waitForEndpointClosed(port: number, name: string) {
  const deadline = Date.now() + 10_000
  while (await endpointOpen(port)) {
    assert(Date.now() < deadline, `${name}: owned automation endpoint remained open after project close`)
    await delay(100)
  }
}

/** Own only this temporary project; never close or quit a borrowed IDE host. */
export async function withTemporaryProject<T>(context: ProjectContext, operation: (session: {
  runtime: MiniProgram
  request: SdkRequest
  project: string
  systemInfo: RpxSystemInfo & Record<string, any>
}) => Promise<T>) {
  await fs.mkdir(context.evidence, { recursive: true })
  const port = await availablePort()
  const project = await fs.mkdtemp(path.join(os.tmpdir(), `weapp-panda-${context.name}-`))
  const connection = createConnectionLifecycle<MiniProgram>(context.signal)
  const logs = createAppLogs(context.name)
  const settings = { es6: true, enhance: false, postcss: false, minified: false, compileHotReLoad: false, ...context.settings }
  let runtime: MiniProgram | undefined
  let attempted = false
  let closed = false
  let removed = false
  let endpointClosed = false
  let appStarted = false
  let toolInfo: Record<string, unknown> | undefined
  const redact = (value: string) => context.appid ? value.replaceAll(context.appid, '[REDACTED_APPID]') : value
  const writeLaunchLog = (output: unknown) => {
    const result = output as { stdout?: unknown, stderr?: unknown }
    return fs.writeFile(path.join(context.evidence, 'launch.log'), redact(`${result.stdout ?? ''}\n${result.stderr ?? ''}`))
  }
  return withCleanup(async () => {
    try {
      await fs.cp(context.sourceDist, path.join(project, 'dist'), { recursive: true })
      await fs.writeFile(path.join(project, 'project.config.json'), JSON.stringify({
        appid: context.appid,
        projectname: `Panda ${context.name} acceptance`,
        miniprogramRoot: 'dist/',
        compileType: 'miniprogram',
        libVersion: context.libVersion,
        setting: settings,
      }, null, 2))
      attempted = true
      const launched = await execa(process.execPath, [context.wvCli, 'auto', '--project', project, '--auto-port', String(port), '--trust-project'], {
        env: { WEAPP_IDE_CLI_PATH: context.cliPath },
        timeout: 60_000,
        cancelSignal: context.signal,
      }).catch(error => withCleanup(async (): Promise<never> => {
        throw error
      }, [() => writeLaunchLog(error)]))
      await writeLaunchLog(launched)
      const deadline = Date.now() + 30_000
      while (!runtime) {
        context.signal.throwIfAborted()
        try {
          runtime = await connection.connect(() => automator.connect({ wsEndpoint: `ws://127.0.0.1:${port}` }))
        }
        catch (error) {
          if (context.signal.aborted || Date.now() >= deadline) {
            throw error
          }
          await delay(250, undefined, { signal: context.signal })
        }
      }
      const current = runtime
      // Tool metadata is available before App.initialized; retain it if app startup stalls.
      toolInfo = await connection.request<Record<string, unknown>>(() => current.send('Tool.getInfo'))
      await logs.start(current, connection.request)
      appStarted = true
      const stableVersion = process.env['WEAPP_VITE_E2E_DEVTOOLS_STABLE_VERSION']
      assert(stableVersion, `${context.name}: official stable IDE evidence is required`)
      assert.equal(toolInfo.version, stableVersion, `${context.name}: actual stable IDE host`)
      assert.equal(toolInfo.SDKVersion, context.libVersion)
      const systemInfo = await connection.request(() => current.systemInfo())
      assert.equal(systemInfo.SDKVersion, context.libVersion, `${context.name}: pinned SDK`)
      await fs.writeFile(path.join(context.evidence, 'environment.json'), redact(JSON.stringify({ systemInfo, toolInfo, cliPath: context.cliPath, project, port, settings }, null, 2)))
      return await operation({ runtime: current, request: connection.request, project, systemInfo })
    }
    catch (error) {
      let screenshotAttempted = false
      let screenshotCaptured = false
      let screenshotError: unknown
      return withCleanup(async (): Promise<never> => {
        throw error
      }, [
        async () => {
          const failedDist = path.join(context.evidence, 'failed-dist')
          await fs.mkdir(failedDist)
          await fs.cp(context.sourceDist, failedDist, {
            recursive: true,
            filter: source => !['project.config.json', 'project.private.config.json'].includes(path.basename(source)),
          })
        },
        async () => {
          const current = runtime
          if (!current || appStarted || context.signal.aborted) {
            return
          }
          screenshotAttempted = true
          const timeout = new AbortController()
          try {
            const capture = await Promise.race([
              connection.request<{ data: unknown }>(() => current.send('Tool.captureSimulatorScreenshot')),
              delay(5000, undefined, { signal: timeout.signal }).then(() => {
                throw new Error(`${context.name}: failure simulator capture timed out after 5000ms`)
              }),
            ])
            assert(capture && typeof capture.data === 'string', `${context.name}: failure screenshot data URI is missing`)
            const match = /^data:image\/png;base64,([A-Za-z0-9+/]+={0,2})$/.exec(capture.data)
            assert(match, `${context.name}: failure screenshot must be a PNG data URI`)
            const png = Buffer.from(match[1], 'base64')
            assert.equal(png.toString('base64'), match[1], `${context.name}: failure screenshot base64 must be canonical`)
            assert(png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), `${context.name}: failure screenshot PNG signature`)
            await fs.writeFile(path.join(context.evidence, 'failure-simulator.png'), png)
            screenshotCaptured = true
          }
          catch (captureError) {
            screenshotError = captureError
            throw captureError
          }
          finally {
            timeout.abort()
          }
        },
        () => fs.writeFile(path.join(context.evidence, 'failure.json'), redact(JSON.stringify({
          error: error instanceof Error ? error.stack ?? error.message : String(error),
          toolInfo: toolInfo ?? null,
          settings,
          sourceDist: context.sourceDist,
          project,
          port,
          attempted,
          appStarted,
          screenshotAttempted,
          screenshot: screenshotCaptured ? 'failure-simulator.png' : null,
          screenshotError: screenshotError instanceof Error ? screenshotError.stack ?? screenshotError.message : screenshotError === undefined ? null : String(screenshotError),
        }, null, 2))),
      ])
    }
  }, [
    async () => {
      if (runtime && appStarted && !context.signal.aborted) {
        await logs.drain(runtime, connection.request)
      }
    },
    async () => {
      if (attempted) {
        await execa(context.cliPath, ['close', '--project', project], { timeout: 30_000 })
        closed = true
      }
    },
    async () => {
      if (attempted) {
        await waitForEndpointClosed(port, context.name)
        endpointClosed = true
      }
    },
    () => connection.dispose(),
    () => logs.assertClean(),
    async () => {
      await fs.rm(project, { recursive: true, force: true })
      removed = true
    },
    () => fs.writeFile(path.join(context.evidence, 'console.json'), redact(JSON.stringify({ exceptions: logs.exceptions, messages: logs.messages }, null, 2))),
    () => fs.writeFile(path.join(context.evidence, 'cleanup.json'), JSON.stringify({ project, port, attempted, closed, endpointClosed, removed }, null, 2)),
    () => context.signal.throwIfAborted(),
  ])
}
