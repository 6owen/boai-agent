/*
 * [INPUT]: Primary SDK cumulative usage and individually identified supplemental model requests.
 * [OUTPUT]: Serialized combined known usage without adding the same receipt twice or overwriting primary totals.
 * [POS]: Run usage composition; original repositories retain budget reservations and unknown-call authority.
 * [PROTOCOL]: Update Header and profile/.folder.md when changed.
 */
import { z } from 'zod'
import type { ModelUsage } from '@boai/shared/domain'

const schema = z.object({ inputTokens: z.number().nonnegative().optional(), outputTokens: z.number().nonnegative().optional(), totalTokens: z.number().nonnegative().optional() }).strict()
export class RunModelUsage {
  private primary: ModelUsage = {}
  private additional = new Map<string, ModelUsage>()
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private publish: (usage: ModelUsage) => Promise<void>) {}
  main(value: ModelUsage) { const clean = schema.parse(value); return this.update(() => { this.primary = { ...this.primary, ...clean } }) }
  supplement(id: string, value: ModelUsage) {
    if (!id) throw new Error('Additional model usage needs its original request ID')
    const clean = schema.parse(value)
    return this.update(() => { this.additional.set(id, { ...this.additional.get(id), ...clean }) })
  }
  private update(change: () => void) {
    const next = this.queue.catch(() => {}).then(async () => {
      change()
      const total: ModelUsage = {}, rows = [this.primary, ...this.additional.values()]
      for (const key of ['inputTokens', 'outputTokens', 'totalTokens'] as const) {
        const known = rows.map(row => row[key]).filter((value): value is number => value !== undefined)
        if (known.length) total[key] = known.reduce((sum, value) => sum + value, 0)
      }
      await this.publish(total)
    })
    this.queue = next
    return next
  }
}
