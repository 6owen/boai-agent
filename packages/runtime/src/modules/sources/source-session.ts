/*
 * [INPUT]: Provider tools, structured results and host-owned source credentials.
 * [OUTPUT]: Session contract, default request deadline and bounded, redacted output.
 * [POS]: Shared by source services and individual providers before results leave the host.
 * [PROTOCOL]: Update this header and the parent .folder.md when changing this contract.
 */
import type { SourceTool } from '@boai/shared/domain/sources'

export const SOURCE_TIMEOUT = 30_000
const MAX_RESULT_CHARACTERS = 128_000
export interface SourceSession {
  tools: SourceTool[]
  call(name: string, args: Record<string, unknown>, signal: AbortSignal): Promise<unknown>
  close(): Promise<void>
}

export function redactSourceValue(value: unknown, credential: string): unknown {
  let text = JSON.stringify(value) ?? 'null'
  const secrets = [credential]
  try { const parsed = JSON.parse(credential); if (parsed && typeof parsed === 'object') { secrets.push(...Object.values(parsed).filter((v): v is string => typeof v === 'string')); if (typeof parsed.username === 'string' && typeof parsed.password === 'string') secrets.push(`${parsed.username}:${parsed.password}`) } } catch { /* Plain token. */ }
  for (const secret of secrets.filter(value => value.length > 2).sort((a, b) => b.length - a.length)) {
    for (const encoded of [secret, encodeURIComponent(secret), Buffer.from(secret).toString('base64')]) text = text.split(JSON.stringify(encoded).slice(1, -1)).join('[redacted]')
  }
  if (text.length > MAX_RESULT_CHARACTERS) return { truncated: true, characters: text.length, excerpt: text.slice(0, MAX_RESULT_CHARACTERS) }
  return JSON.parse(text)
}
