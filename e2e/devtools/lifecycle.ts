import process from 'node:process'

interface Connection {
  disconnect: () => Promise<void>
}

export type SdkRequest = <T>(operation: () => Promise<T>) => Promise<T>

function reportLateConnectionError(error: unknown) {
  process.stderr.write(`Late DevTools connection cleanup failed:\n${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
}

/** Own one SDK connection, including a connection acquired after cancellation. */
export function createConnectionLifecycle<T extends Connection>(signal: AbortSignal, reportLateError = reportLateConnectionError) {
  let connection: T | undefined
  let disconnectPromise: Promise<void> | undefined
  let observedDisconnect: Promise<void> | undefined
  let disposed = false

  function ensureActive() {
    signal.throwIfAborted()
    if (disposed) {
      throw new Error('DevTools connection scope has been disposed')
    }
  }

  function disconnect(): Promise<void> {
    if (!connection) {
      return Promise.resolve()
    }
    const current = connection
    if (!disconnectPromise) {
      const pending = Promise.resolve().then(() => current.disconnect())
      disconnectPromise = pending
      void pending.catch((error) => {
        // A connection can arrive after disposal has already finished. It still
        // needs releasing, and its failure cannot be added to a returned error.
        if (disposed && observedDisconnect !== pending) {
          reportLateError(error)
        }
      })
    }
    return disconnectPromise
  }

  function cancel() {
    // EventTarget cannot await this callback. Keep the rejection handled here;
    // dispose awaits the same promise and reports it with other cleanup errors.
    void disconnect().catch(() => {})
  }

  signal.addEventListener('abort', cancel)

  async function request<V>(operation: () => Promise<V>): Promise<V> {
    ensureActive()
    let cancelRequest!: () => void
    const cancelled = new Promise<never>((_resolve, reject) => {
      cancelRequest = () => reject(signal.reason)
      signal.addEventListener('abort', cancelRequest)
    })
    try {
      // SDK 0.13 clears pending callbacks on disconnect. Race each request so
      // cancellation can finish even if its underlying promise never settles.
      const pending = Promise.resolve().then(() => {
        ensureActive()
        return operation()
      })
      const result = await Promise.race([pending, cancelled])
      ensureActive()
      return result
    }
    finally {
      signal.removeEventListener('abort', cancelRequest)
    }
  }

  return {
    request,
    async connect(acquire: () => Promise<T>): Promise<T> {
      ensureActive()
      // Own the result before racing cancellation. The SDK handshake cannot be
      // aborted, so this continuation must survive a completed scope cleanup.
      const pending = acquire().then((current) => {
        connection = current
        if (signal.aborted || disposed) {
          cancel()
          ensureActive()
        }
        return current
      })
      // request can reject before it subscribes to an already aborted acquire.
      // Keep late acquisition failures handled even after the caller returns.
      void pending.catch(() => {})
      return request(() => pending)
    },
    disconnect,
    async dispose(): Promise<void> {
      disposed = true
      signal.removeEventListener('abort', cancel)
      observedDisconnect = disconnect()
      await observedDisconnect
    },
  }
}

/** Finish every cleanup step, preserving the operation and cleanup failures. */
export async function withCleanup<T>(operation: () => Promise<T>, cleanups: readonly (() => unknown)[]): Promise<T> {
  const errors: unknown[] = []
  let result: T | undefined
  try {
    result = await operation()
  }
  catch (error) {
    errors.push(error)
  }
  for (const cleanup of cleanups) {
    try {
      await cleanup()
    }
    catch (error) {
      errors.push(error)
    }
  }
  const unique = [...new Set(errors)]
  if (unique.length === 1) {
    throw unique[0]
  }
  if (unique.length > 1) {
    const details = unique.map(error => error instanceof Error ? error.stack ?? error.message : String(error))
    throw new AggregateError(unique, `DevTools operation and cleanup failed:\n${details.join('\n')}`, { cause: unique[0] })
  }
  return result as T
}
