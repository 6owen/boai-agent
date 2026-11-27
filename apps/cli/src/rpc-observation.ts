/*
 * [INPUT]: Owner RPC client, command signal and optional local wait deadline.
 * [OUTPUT]: Interruptible observation of one already-submitted request at a time.
 * [POS]: CLI send, receipt and cancel share the local wait lifetime.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { CliError } from '@boai/shared/cli/protocol'
import type { CliRpcClient } from '@boai/transport/client'

export function observeRpc(client: CliRpcClient, options: { signal?: AbortSignal; waitTimeout?: number }, timeoutMessage: string) {
  const timeout = new AbortController()
  const signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal
  const timer = options.waitTimeout ? setTimeout(() => timeout.abort(new CliError('REQUEST_TIMEOUT', timeoutMessage)), options.waitTimeout) : undefined

  async function invoke<T>(channel: string, input: unknown): Promise<T> {
    signal.throwIfAborted()
    let abort!: () => void
    const interrupted = new Promise<never>((_, reject) => {
      abort = () => reject(signal.reason)
      signal.addEventListener('abort', abort, { once: true })
    })
    try {
      return await Promise.race([client.invoke(channel, input) as Promise<T>, interrupted])
    } finally {
      signal.removeEventListener('abort', abort)
    }
  }
  return { signal, invoke, dispose: () => clearTimeout(timer) }
}
