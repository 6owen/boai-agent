/*
 * [INPUT]: 同一受管Claude阶段的实际流式消息ID、累计计数字段与最终用量。
 * [OUTPUT]: 按消息去重的已知部分及终态一致性核对；不保存正文，不用部分计量推断外部请求已完成。
 * [POS]: Claude协议计量；原预算结算和取消仍归宿主。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { ModelUsage } from '../../../shared/domain'

const fields = ['input_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens', 'output_tokens'] as const
type Counts = Partial<Record<typeof fields[number], number>>
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
function counts(value: unknown): Counts {
  const raw = object(value), result: Counts = {}
  for (const field of fields) if (count(raw[field])) result[field] = raw[field]
  return result
}
function known(value: Counts): ModelUsage {
  const result: ModelUsage = {}
  if (count(value.input_tokens) && count(value.cache_creation_input_tokens) && count(value.cache_read_input_tokens)) {
    const input = value.input_tokens + value.cache_creation_input_tokens + value.cache_read_input_tokens
    if (Number.isSafeInteger(input)) result.inputTokens = input
  }
  if (count(value.output_tokens)) result.outputTokens = value.output_tokens
  if (result.inputTokens !== undefined && result.outputTokens !== undefined && Number.isSafeInteger(result.inputTokens + result.outputTokens)) result.totalTokens = result.inputTokens + result.outputTokens
  return result
}

export class ClaudeUsage {
  private readonly messages = new Map<string, Counts>()
  private currentId?: string
  private observed: ModelUsage = {}

  /** Stream receipts are cumulative within one model message, not new calls or a final phase receipt. */
  update(event: Record<string, unknown>): ModelUsage | undefined {
    let incoming: unknown
    if (event.type === 'message_start') {
      const message = object(event.message)
      this.currentId = typeof message.id === 'string' && message.id ? message.id : undefined
      incoming = message.usage
    } else if (event.type === 'message_delta') incoming = event.usage
    else if (event.type === 'message_stop') { this.currentId = undefined; return }
    else return
    if (!this.currentId) return
    const previous = this.messages.get(this.currentId) ?? {}
    for (const [key, value] of Object.entries(counts(incoming))) {
      const field = key as typeof fields[number]
      previous[field] = Math.max(previous[field] ?? 0, value)
    }
    this.messages.set(this.currentId, previous)
    const total: ModelUsage = {}
    for (const raw of this.messages.values()) {
      const value = known(raw)
      for (const field of ['inputTokens', 'outputTokens'] as const) if (value[field] !== undefined) total[field] = (total[field] ?? 0) + value[field]
    }
    if (total.inputTokens !== undefined && total.outputTokens !== undefined) total.totalTokens = total.inputTokens + total.outputTokens
    if (Object.values(total).some(value => !Number.isSafeInteger(value))) throw new Error('Claude累计用量超过安全整数范围')
    if (['inputTokens', 'outputTokens', 'totalTokens'].every(field => total[field as keyof ModelUsage] === this.observed[field as keyof ModelUsage])) return
    this.observed = total
    return { ...total }
  }

  finish(value: unknown): ModelUsage | undefined {
    const result = known(counts(value))
    if (result.inputTokens === undefined || result.outputTokens === undefined || result.totalTokens === undefined) return
    for (const field of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
      if (result[field]! < (this.observed[field] ?? 0)) throw new Error('Claude最终用量小于已收到的计量，原请求需要核对')
    }
    return result
  }
}
