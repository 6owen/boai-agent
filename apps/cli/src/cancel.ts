/*
 * [INPUT]: Owner-selected original run and read-only service stop projection.
 * [OUTPUT]: One cancellation submission; unique-target selection, actual-exit waiting and unknown reconciliation.
 * [POS]: CLI cancel command, retaining original message cancellation separately.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { setTimeout as delay } from 'node:timers/promises'
import type { CliRpcClient } from '@boai/transport/client'
import { CliError, PROTOCOL_VERSION } from '@boai/shared/cli/protocol'
import type { CancellationTarget, RunCancellation } from '@boai/shared/domain/run-cancellation'

export async function executeRunCancellation(client: CliRpcClient, conversationId: string, runId: string | undefined, options: { signal?: AbortSignal; waitTimeout?: number; emit(value: Record<string, unknown>): void }): Promise<number> {
  const timeout = new AbortController(), signal = options.signal ? AbortSignal.any([options.signal, timeout.signal]) : timeout.signal
  const timer = options.waitTimeout ? setTimeout(() => timeout.abort(new CliError('REQUEST_TIMEOUT', '等待停止超时')), options.waitTimeout) : undefined
  const emit = (type: string, value: Record<string, unknown>) => options.emit({ protocolVersion: PROTOCOL_VERSION, type, conversationId, runId, ...value })
  const invoke = async <T>(channel: string, input: unknown): Promise<T> => {
    signal.throwIfAborted()
    let abort!: () => void
    const interrupted = new Promise<never>((_, reject) => { abort = () => reject(signal.reason); signal.addEventListener('abort', abort, { once: true }) })
    try { return await Promise.race([client.invoke(channel, input) as Promise<T>, interrupted]) }
    finally { signal.removeEventListener('abort', abort) }
  }
  try {
    if (!runId) {
      const targets = await invoke<CancellationTarget[]>('getCancellationTargets', { conversationId })
      if (!targets.length) { emit('result', { state: 'stopped', exitCode: 0 }); return 0 }
      if (targets.length !== 1 || !targets[0].runId) {
        emit('selection-required', { targets, message: '请用 --run 指定运行；无运行ID的原消息可用 --request-id 明确停止。', exitCode: 2 }); return 2
      }
      runId = targets[0].runId
    }
    const input = { conversationId, runId }
    let status: RunCancellation
    try { status = await invoke<RunCancellation>('cancelRunExecution', input) }
    catch (error) {
      // Never resubmit or pick another target after a lost response.
      if (signal.aborted || !client.isConnected) throw error
      status = await invoke<RunCancellation>('getRunCancellation', input)
      if (!status.requested && status.state !== 'stopped') throw error
    }
    let previous = ''
    for (;;) {
      signal.throwIfAborted()
      if (status.state === 'stopped' || status.state === 'unknown') {
        const exitCode = status.state === 'stopped' ? 0 : 4
        emit('result', { ...status, exitCode }); return exitCode
      }
      const serialized = JSON.stringify(status)
      if (serialized !== previous) { emit('cancellation', { ...status }); previous = serialized }
      await delay(100, undefined, { signal })
      status = await invoke<RunCancellation>('getRunCancellation', input)
    }
  } catch (error) {
    if (!signal.aborted && error instanceof CliError && ['INVALID_REQUEST', 'AUTH_FAILED', 'METHOD_NOT_FOUND', 'HANDLER_ERROR'].includes(error.code)) throw error
    const exitCode = options.signal?.aborted ? 130 : 4
    emit('result', { state: 'unknown', exitCode, query: runId ? { channel: 'getRunCancellation', input: { conversationId, runId } } : undefined })
    return exitCode
  } finally { if (timer) clearTimeout(timer) }
}
