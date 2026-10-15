import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createConnectionLifecycle, withCleanup } from '../../../e2e/devtools/lifecycle'

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

it('awaits SDK disconnection before continuing cleanup and preserves the result', async () => {
  const started = deferred<void>()
  const released = deferred<void>()
  const events: string[] = []
  const sdk = {
    disconnect: vi.fn(async () => {
      events.push('disconnect started')
      started.resolve()
      await released.promise
      events.push('disconnected')
    }),
  }
  const lifecycle = createConnectionLifecycle<typeof sdk>(new AbortController().signal)
  const result = withCleanup(async () => {
    expect(await lifecycle.connect(async () => sdk)).toBe(sdk)
    return lifecycle.request(async () => 'complete')
  }, [
    () => lifecycle.dispose(),
    () => events.push('scoped close'),
  ])
  await started.promise
  expect(events).toEqual(['disconnect started'])
  released.resolve()
  await expect(result).resolves.toBe('complete')
  expect(events).toEqual(['disconnect started', 'disconnected', 'scoped close'])
  expect(sdk.disconnect).toHaveBeenCalledTimes(1)
})

it('shares one disconnection promise across repeated cancellation and disposal', async () => {
  const controller = new AbortController()
  const released = deferred<void>()
  const sdk = { disconnect: vi.fn(() => released.promise) }
  const lifecycle = createConnectionLifecycle<typeof sdk>(controller.signal)
  await lifecycle.connect(async () => sdk)
  controller.abort(new Error('cancelled'))
  controller.abort(new Error('cancelled again'))
  const first = lifecycle.disconnect()
  expect(lifecycle.disconnect()).toBe(first)
  const disposed = lifecycle.dispose()
  released.resolve()
  await Promise.all([first, disposed, lifecycle.dispose()])
  expect(sdk.disconnect).toHaveBeenCalledTimes(1)
})

it('keeps cancellation callbacks handled and reports asynchronous disconnection failure', async () => {
  const controller = new AbortController()
  const cancelled = new Error('cancelled')
  const failed = new Error('disconnect rejected')
  const sdk = { disconnect: vi.fn().mockRejectedValue(failed) }
  const lifecycle = createConnectionLifecycle<typeof sdk>(controller.signal)
  await lifecycle.connect(async () => sdk)
  controller.abort(cancelled)
  // Let the event callback observe its rejection before final cleanup awaits it.
  await new Promise<void>(resolve => setImmediate(resolve))
  await expect(withCleanup(async () => {
    controller.signal.throwIfAborted()
  }, [() => lifecycle.dispose()])).rejects.toMatchObject({
    errors: [cancelled, failed],
    cause: cancelled,
    message: expect.stringContaining('disconnect rejected'),
  })
  expect(sdk.disconnect).toHaveBeenCalledTimes(1)
})

it('releases a connection that arrives after cancellation without exposing it to callers', async () => {
  const controller = new AbortController()
  const cancelled = new Error('cancelled during connection')
  const sdk = { disconnect: vi.fn().mockResolvedValue(undefined) }
  const pending = deferred<typeof sdk>()
  const lifecycle = createConnectionLifecycle<typeof sdk>(controller.signal)
  const result = withCleanup(() => lifecycle.connect(() => pending.promise), [() => lifecycle.dispose()])
  const assertion = expect(result).rejects.toBe(cancelled)
  controller.abort(cancelled)
  pending.resolve(sdk)
  await assertion
  expect(sdk.disconnect).toHaveBeenCalledTimes(1)
})

it('reports a late connection release failure alongside the original cancellation', async () => {
  const controller = new AbortController()
  const cancelled = new Error('cancelled during connection')
  const failed = new Error('late disconnect rejected')
  const sdk = { disconnect: vi.fn().mockRejectedValue(failed) }
  const pending = deferred<typeof sdk>()
  const lifecycle = createConnectionLifecycle<typeof sdk>(controller.signal)
  const result = withCleanup(() => lifecycle.connect(() => pending.promise), [() => lifecycle.dispose()])
  const assertion = expect(result).rejects.toMatchObject({ errors: [cancelled, failed], cause: cancelled })
  controller.abort(cancelled)
  pending.resolve(sdk)
  await assertion
  expect(sdk.disconnect).toHaveBeenCalledTimes(1)
})

it('finishes every cleanup step when cancellation interrupts a connection handshake that never settles', async () => {
  const controller = new AbortController()
  const cancelled = new Error('cancelled during handshake')
  const sdk = { disconnect: vi.fn().mockResolvedValue(undefined) }
  const pending = deferred<typeof sdk>()
  const acquire = vi.fn(() => pending.promise)
  const continued = vi.fn()
  const scopedClose = vi.fn()
  const removeProject = vi.fn()
  const releaseLock = vi.fn()
  const removeLock = vi.fn()
  const lifecycle = createConnectionLifecycle<typeof sdk>(controller.signal)
  const result = withCleanup(async () => {
    await lifecycle.connect(acquire)
    continued()
  }, [() => lifecycle.dispose(), scopedClose, removeProject, releaseLock, removeLock])
  const assertion = expect(result).rejects.toBe(cancelled)
  expect(acquire).toHaveBeenCalledTimes(1)
  controller.abort(cancelled)
  await assertion
  expect(continued).not.toHaveBeenCalled()
  expect(sdk.disconnect).not.toHaveBeenCalled()
  for (const cleanup of [scopedClose, removeProject, releaseLock, removeLock]) {
    expect(cleanup).toHaveBeenCalledTimes(1)
  }
})

it.each(['resolve', 'reject', 'disconnect failure'] as const)('handles late connection %s after scope cleanup has already completed', async (outcome) => {
  const controller = new AbortController()
  const cancelled = new Error('cancelled during handshake')
  const lateError = new Error('late connection failure')
  const sdk = {
    disconnect: outcome === 'disconnect failure'
      ? vi.fn().mockRejectedValue(lateError)
      : vi.fn().mockResolvedValue(undefined),
  }
  const pending = deferred<typeof sdk>()
  const reportLateError = vi.fn()
  const continued = vi.fn()
  const closed = vi.fn()
  const lifecycle = createConnectionLifecycle<typeof sdk>(controller.signal, reportLateError)
  const result = withCleanup(async () => {
    await lifecycle.connect(() => pending.promise)
    continued()
  }, [() => lifecycle.dispose(), closed])
  const assertion = expect(result).rejects.toBe(cancelled)
  controller.abort(cancelled)
  await assertion
  expect(closed).toHaveBeenCalledTimes(1)
  expect(sdk.disconnect).not.toHaveBeenCalled()
  if (outcome === 'reject') {
    pending.reject(lateError)
  }
  else {
    pending.resolve(sdk)
  }
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(continued).not.toHaveBeenCalled()
  expect(sdk.disconnect).toHaveBeenCalledTimes(outcome === 'reject' ? 0 : 1)
  if (outcome === 'disconnect failure') {
    expect(reportLateError).toHaveBeenCalledExactlyOnceWith(lateError)
  }
  else {
    expect(reportLateError).not.toHaveBeenCalled()
  }
})

it('preserves a synchronous connection acquisition failure', async () => {
  const failed = new Error('SDK acquisition failed synchronously')
  const lifecycle = createConnectionLifecycle(new AbortController().signal)
  await expect(withCleanup(() => lifecycle.connect(() => {
    throw failed
  }), [() => lifecycle.dispose()])).rejects.toBe(failed)
})

it('does not acquire a connection after cancellation', async () => {
  const controller = new AbortController()
  const cancelled = new Error('already cancelled')
  const sdk = { disconnect: vi.fn().mockResolvedValue(undefined) }
  const acquire = vi.fn(async () => sdk)
  const lifecycle = createConnectionLifecycle<typeof sdk>(controller.signal)
  controller.abort(cancelled)
  await expect(withCleanup(() => lifecycle.connect(acquire), [() => lifecycle.dispose()])).rejects.toBe(cancelled)
  expect(acquire).not.toHaveBeenCalled()
  expect(sdk.disconnect).not.toHaveBeenCalled()
})

it('preserves the original disconnect failure when final cleanup awaits it again', async () => {
  const failed = new Error('disconnect rejected')
  const sdk = { disconnect: vi.fn().mockRejectedValue(failed) }
  const lifecycle = createConnectionLifecycle<typeof sdk>(new AbortController().signal)
  await lifecycle.connect(async () => sdk)
  await expect(withCleanup(() => lifecycle.disconnect(), [() => lifecycle.dispose()])).rejects.toBe(failed)
  expect(sdk.disconnect).toHaveBeenCalledTimes(1)
})

it.each(['pending', 'resolve', 'reject'] as const)('finishes cleanup when an SDK request hangs and handles a late %s outcome', async (outcome) => {
  const controller = new AbortController()
  const cancelled = new Error('cancelled during SDK request')
  const pending = deferred<string>()
  const started = deferred<void>()
  const continued = vi.fn()
  const closed = vi.fn()
  const sdk = {
    disconnect: vi.fn().mockResolvedValue(undefined),
    read: vi.fn(() => {
      started.resolve()
      return pending.promise
    }),
  }
  const lifecycle = createConnectionLifecycle<typeof sdk>(controller.signal)
  const result = withCleanup(async () => {
    const runtime = await lifecycle.connect(async () => sdk)
    const value = await lifecycle.request(() => runtime.read())
    // This represents business actions such as writing the temporary project.
    continued(value)
  }, [() => lifecycle.dispose(), closed])
  const assertion = expect(result).rejects.toBe(cancelled)
  await started.promise
  controller.abort(cancelled)
  await assertion
  expect(sdk.disconnect).toHaveBeenCalledTimes(1)
  expect(closed).toHaveBeenCalledTimes(1)
  if (outcome === 'resolve') {
    pending.resolve('late SDK result')
  }
  else if (outcome === 'reject') {
    pending.reject(new Error('late SDK error'))
  }
  await new Promise<void>(resolve => setImmediate(resolve))
  expect(continued).not.toHaveBeenCalled()
})

it('prevents new SDK requests after cancellation, including requests queued in the same turn', async () => {
  const controller = new AbortController()
  const cancelled = new Error('cancelled before SDK request')
  const sdk = { disconnect: vi.fn().mockResolvedValue(undefined) }
  const lifecycle = createConnectionLifecycle<typeof sdk>(controller.signal)
  const operation = vi.fn(async () => 'unexpected result')
  const result = lifecycle.request(operation)
  controller.abort(cancelled)
  await expect(result).rejects.toBe(cancelled)
  await expect(lifecycle.request(operation)).rejects.toBe(cancelled)
  await lifecycle.dispose()
  expect(operation).not.toHaveBeenCalled()
  expect(sdk.disconnect).not.toHaveBeenCalled()
})

it('preserves business and cleanup failures while closing the scoped project, removing files and releasing the lock', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'weapp-panda-lifecycle-'))
  const project = path.join(root, 'project')
  const lockPath = path.join(root, 'devtools.lock')
  const lock = await fs.open(lockPath, 'wx')
  try {
    await fs.mkdir(project)
    await fs.writeFile(path.join(project, 'app.json'), '{}')
    const business = new Error('style probe failed')
    const disconnect = new Error('disconnect rejected')
    const close = new Error('scoped close failed')
    const sdk = { disconnect: vi.fn().mockRejectedValue(disconnect) }
    const lifecycle = createConnectionLifecycle<typeof sdk>(new AbortController().signal)
    const scopedClose = vi.fn(async (_project: string) => {
      throw close
    })
    await expect(withCleanup(async () => {
      await lifecycle.connect(async () => sdk)
      throw business
    }, [
      () => lifecycle.dispose(),
      () => scopedClose(project),
      () => fs.rm(project, { recursive: true, force: true }),
      () => lock.close(),
      () => fs.rm(lockPath),
    ])).rejects.toMatchObject({
      errors: [business, disconnect, close],
      cause: business,
      message: expect.stringContaining('style probe failed'),
    })
    expect(scopedClose).toHaveBeenCalledExactlyOnceWith(project)
    expect(sdk.disconnect).toHaveBeenCalledTimes(1)
    await expect(fs.stat(project)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.stat(lockPath)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(lock.fd).toBe(-1)
  }
  finally {
    await lock.close()
    await fs.rm(root, { recursive: true, force: true })
  }
})
