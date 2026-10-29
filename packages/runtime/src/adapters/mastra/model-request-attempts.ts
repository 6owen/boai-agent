/*
 * [INPUT]: Installed Mastra per-step model boundary and original host retry reservation.
 * [OUTPUT]: SDK retries retain the current prompt/tools and reserve each new HTTP attempt; no tool replay.
 * [POS]: Request accounting only; retry classification/backoff remain in Mastra.
 * [PROTOCOL]: Update Header and mastra/.folder.md when changed.
 */
import type { Processor } from '@mastra/core/processors'
import type { ProcessInputStepArgs } from '@mastra/core/processors'

export const TASK_MODEL_REQUEST_RETRIES = 2

/** processInputStep runs once per model step; doStream runs again for an SDK retry. */
export function modelRequestAttempts(signal: AbortSignal, onRetry: () => Promise<void>): Processor & Required<Pick<Processor, 'processInputStep'>> {
  const originals = new WeakMap<object, ProcessInputStepArgs['model']>()
  return { id: 'boai-model-request-attempts', processInputStep: ({ model }) => {
    const original = originals.get(model) ?? model
    let attempts = 0, blocked = false, blockedError: unknown
    const wrapped = new Proxy(original, { get(target, key) {
      const value = Reflect.get(target, key, target)
      if (key !== 'doStream' && key !== 'doGenerate') return typeof value === 'function' ? value.bind(target) : value
      return async (...args: unknown[]) => {
        signal.throwIfAborted()
        if (blocked) throw blockedError
        if (attempts++ > 0) {
          try { await onRetry(); signal.throwIfAborted() }
          catch (error) { blocked = true; blockedError = error; throw error }
        }
        return Reflect.apply(value, target, args)
      }
    } })
    originals.set(wrapped, original)
    return { model: wrapped }
  } }
}
