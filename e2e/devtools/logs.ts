import type automator from 'miniprogram-automator'
import type { SdkRequest } from './lifecycle.ts'
import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'

type AppRuntime = Pick<Awaited<ReturnType<typeof automator.connect>>, 'send' | 'evaluate'> & {
  addListener: (event: string, listener: (message: unknown) => void) => unknown
}

/** Keep application diagnostics observable until the owned project has closed. */
export function createAppLogs(name: string) {
  const exceptions: unknown[] = []
  const messages: unknown[] = []
  const attached = new WeakSet<AppRuntime>()
  return {
    exceptions,
    messages,
    async start(runtime: AppRuntime, request: SdkRequest) {
      if (!attached.has(runtime)) {
        runtime.addListener('exception', error => exceptions.push(error))
        runtime.addListener('console', message => messages.push(message))
        attached.add(runtime)
      }
      // MiniProgram.on('console') starts an unawaited enable request. Subscribe
      // through EventEmitter first, then explicitly await the protocol command.
      await request(() => runtime.send('App.enableLog'))
    },
    async drain(runtime: AppRuntime, request: SdkRequest) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          (async () => {
            await request(() => runtime.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 0))))
            await request(() => runtime.send('Tool.getInfo'))
            await setImmediate()
          })(),
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => reject(new Error(`${name}: AppService log drain timed out`)), 5000)
          }),
        ])
      }
      finally {
        clearTimeout(timer)
      }
    },
    assertClean() {
      assert.deepEqual(exceptions, [], `${name}: AppService exceptions`)
      assert.deepEqual(messages.filter(message => typeof message === 'object' && message !== null
        && (('level' in message && message.level === 'error') || ('type' in message && message.type === 'error'))), [], `${name}: application console errors`)
    },
  }
}
