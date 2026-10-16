import type { SdkRequest } from '../../../e2e/devtools/lifecycle.ts'
import { EventEmitter } from 'node:events'
import { createConnectionLifecycle, withCleanup } from '../../../e2e/devtools/lifecycle.ts'
import { createAppLogs } from '../../../e2e/devtools/logs.ts'

const request: SdkRequest = operation => operation()

function runtime() {
  return Object.assign(new EventEmitter(), {
    send: vi.fn(async (_method: string) => {}),
    evaluate: vi.fn(async () => {}),
    disconnect: vi.fn(async () => {}),
  })
}

it('captures application errors emitted while log forwarding is being enabled', async () => {
  const sdk = runtime()
  const logs = createAppLogs('startup')
  sdk.send.mockImplementation(async () => {
    sdk.emit('console', { type: 'error', args: ['startup failed'] })
  })
  await logs.start(sdk, request)
  expect(logs.messages).toEqual([{ type: 'error', args: ['startup failed'] }])
  expect(() => logs.assertClean()).toThrow('application console errors')
  await logs.start(sdk, request)
  expect(sdk.listenerCount('console')).toBe(1)
})

it('flushes deferred application diagnostics before the SDK roundtrip finishes', async () => {
  const sdk = runtime()
  const logs = createAppLogs('drain')
  await logs.start(sdk, request)
  sdk.evaluate.mockImplementation(async () => {
    await Promise.resolve()
    sdk.emit('console', { level: 'error', args: ['deferred failure'] })
  })
  await logs.drain(sdk, request)
  expect(sdk.send).toHaveBeenLastCalledWith('Tool.getInfo')
  expect(() => logs.assertClean()).toThrow('application console errors')
})

it('rejects errors emitted during project close while completing every cleanup', async () => {
  const sdk = runtime()
  const logs = createAppLogs('close')
  const lifecycle = createConnectionLifecycle<typeof sdk>(new AbortController().signal)
  await lifecycle.connect(async () => sdk)
  await logs.start(sdk, lifecycle.request)
  const closedError = new Error('onUnload failed')
  const receipt = vi.fn()
  await expect(withCleanup(async () => 'complete', [
    () => logs.drain(sdk, lifecycle.request),
    () => sdk.emit('exception', closedError),
    () => lifecycle.dispose(),
    () => logs.assertClean(),
    receipt,
    () => lifecycle.dispose(),
  ])).rejects.toThrow('AppService exceptions')
  expect(logs.exceptions).toEqual([closedError])
  expect(receipt).toHaveBeenCalledOnce()
  expect(sdk.disconnect).toHaveBeenCalledOnce()
})

it('bounds a stalled AppService drain so project cleanup can still run', async () => {
  vi.useFakeTimers()
  try {
    const sdk = runtime()
    const logs = createAppLogs('stalled')
    sdk.evaluate.mockImplementation(() => new Promise<void>(() => {}))
    const rejected = expect(logs.drain(sdk, request)).rejects.toThrow('log drain timed out')
    await vi.advanceTimersByTimeAsync(5000)
    await rejected
    expect(sdk.send).not.toHaveBeenCalled()
  }
  finally {
    vi.useRealTimers()
  }
})
