/*
 * [OUTPUT]: 原生问题和能力回执保留协议 JSON；聊天消息只采用已遮蔽的公开问题。
 * [INPUT]: Execution evidence, media or SDK span fields and the configured connection credential.
 * [OUTPUT]: JSON suitable for persistent observation, with media summaries and credentials removed from text.
 * [POS]: Shared by the execution ledger, the host trace sink and the SDK storage exporter.
 * [PROTOCOL]: Update this header and the conversations directory map when changing persistence.
 */
import type { ExecutionEvent, NativeActionInput, NativeAgentInfo } from '@boai/shared/domain/execution'
import type { TraceSpan } from '@boai/shared/domain/traces'
import { summarizeMedia } from '../browser/media'

type SpanFields = { input: unknown; output: unknown; attributes: unknown; metadata: unknown; errorInfo: unknown; requestContext: unknown }

/** Media-bearing events strip image bytes and private command arguments before persistence. */
export function persistentObservation<T extends ExecutionEvent | TraceSpan | SpanFields>(payload: T, credential: string, replacement = '[redacted]'): T {
  return redactJson(summarizeMedia(payload), credential, replacement)
}

/** Native interaction detail carries protocol data used to answer a pending request. */
export function publicNativeRecord<T extends NativeActionInput | NativeAgentInfo>(payload: T, credential: string): T {
  return redactJson(payload, credential, '[已隐藏凭据]')
}

function redactJson(payload: unknown, credential: string, replacement: string) {
  if (!credential) return JSON.parse(JSON.stringify(payload))
  const escaped = JSON.stringify(credential).slice(1, -1)

  function redactText(text: string): string {
    if (escaped !== credential) text = text.replaceAll(escaped, () => replacement)
    return text.replaceAll(credential, () => replacement)
  }

  function redact(_key: string, value: unknown): unknown {
    if (typeof value === 'string') {
      if (escaped === credential && !value.includes(credential)) return value
      if (/^\s*[\[{]/u.test(value)) {
        try { return JSON.stringify(JSON.parse(value), redact) } catch { /* Free-form text. */ }
      }
      return redactText(value)
    }
    if (value !== payload && value && typeof value === 'object' && !Array.isArray(value)) {
      const entries = Object.entries(value)
      if (entries.some(([key]) => key.includes(credential) || key.includes(escaped))) {
        return Object.fromEntries(entries.map(([key, field]) => [redactText(key), field]))
      }
    }
    return value
  }

  return JSON.parse(JSON.stringify(payload, redact))
}
