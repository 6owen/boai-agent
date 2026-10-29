/*
 * [OUTPUT]: SDK归一化截图按媒体估算；模型提示词不重复计算Mastra内部modelOutput副本，实际文本/供应商选项仍计入。
 * [INPUT]: Effective model catalog, complete provider prompt, tool schemas and explicit output reserve.
 * [OUTPUT]: Conservative capacity estimates and an explicitly unknown-window input policy; never silently trims a request.
 * [POS]: Mastra capacity policy shared by public-history and per-step maintenance.
 * [PROTOCOL]: Update Header and contexts/.folder.md when changed.
 */
import type { EngineContext } from '../../contracts'

/** Conservative estimate, not a tokenizer measurement. Binary media never expands into base64 text tokens. */
export function estimateTokens(value: unknown): number {
  if (value === undefined || value === null) return 0
  if (typeof value === 'string') {
    let ascii = 0, other = 0
    for (const character of value) { if (character.codePointAt(0)! < 128) ascii++; else other++ }
    return Math.ceil(ascii / 3 + other * 1.5)
  }
  if (Array.isArray(value)) return value.reduce((sum, part) => sum + estimateTokens(part) + 8, 0)
  if (value instanceof Uint8Array) return 4096
  if (typeof value === 'object') {
    const entry = value as Record<string, unknown>
    if (entry.type === 'image' || entry.type === 'image_url') return 4096
    if (entry.type === 'file' && (String(entry.mediaType ?? entry.mimeType).startsWith('image/'))) return 4096
    if (['image-data', 'media'].includes(String(entry.type)) && String(entry.mediaType ?? entry.mimeType).startsWith('image/')) return 4096
    return Object.entries(entry).reduce((sum, [key, part]) => sum + estimateTokens(key) + estimateTokens(part) + 4, 0)
  }
  return 4
}

/** Mastra's internal message/part metadata is not model text. Leave tool JSON and provider options intact. */
export function estimatePromptTokens(prompt: readonly unknown[]): number {
  const withoutInternalOptions = (value: unknown) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value
    const entry = value as Record<string, unknown>
    if (!entry.providerOptions || typeof entry.providerOptions !== 'object' || Array.isArray(entry.providerOptions)) return entry
    const { mastra: _internal, ...options } = entry.providerOptions as Record<string, unknown>
    const { providerOptions: _original, ...rest } = entry
    return { ...rest, ...(Object.keys(options).length ? { providerOptions: options } : {}) }
  }
  return estimateTokens(prompt.map(message => {
    const entry = withoutInternalOptions(message) as Record<string, unknown>
    return entry && Array.isArray(entry.content) ? { ...entry, content: entry.content.map(withoutInternalOptions) } : entry
  }))
}
export type ContextModelSelection = Pick<EngineContext, 'connection' | 'modelCatalog'> & { agent: Pick<EngineContext['agent'], 'modelId'> }
export function contextCapacity(context: ContextModelSelection, outputTokens: number, fixedInputTokens = 0) {
  const model = (context.agent.modelId || context.connection?.defaultModel || '').trim()
  const declared = context.modelCatalog?.models.find(row => row.id === model)?.contextWindow
  const known = typeof declared === 'number' && Number.isSafeInteger(declared) && declared > 0
  // Unknown is a local input ceiling, never a claimed provider context window.
  // With no window metadata, bound variable working input separately from the existing
  // fixed assembly. Neither this budget nor their sum is a claimed provider window.
  const limit = known ? Math.max(0, declared - outputTokens - Math.max(1024, Math.ceil(declared * .08))) : fixedInputTokens + 48000
  return { model, window: known ? declared : undefined, source: known ? 'service-declared' as const : 'unknown-policy' as const, limit, soft: known ? Math.floor(limit * .8) : fixedInputTokens + 38400, outputTokens }
}
export class ContextCapacityError extends Error {
  constructor(readonly details?: { inputTokens: number; toolTokens: number; limit: number }) { super('当前必要输入超过上下文容量；请拆分材料或请求，原消息与工作已保留'); this.name = 'ContextCapacityError' }
}
