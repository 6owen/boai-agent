/*
 * [INPUT]: Original task records, fixed SQL read model and trusted application actor.
 * [OUTPUT]: Read-only task pages with query-bound cursors and honest progress/list fields.
 * [POS]: Employee task record queries; does not turn plans, Work or ordinary chat into tasks.
 * [PROTOCOL]: Update Header and application/.folder.md on change.
 */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { TASK_PAGE_LIMITS, type TrackedTaskPage } from '@boai/shared/domain/tracked-tasks'
import type { ApplicationActor } from '@boai/shared/domain/application-protocol'
import type { ProductStore } from '../../adapters/storage/product-store'
import { ApplicationValidationError, type ApplicationOperation } from './application-service'

const id = z.string().min(1).max(200)
const query = z.object({ agentId: id.optional(), conversationId: id.optional(), status: z.enum(['pending', 'in_progress', 'blocked', 'done']).optional(), includeDone: z.boolean().default(false), limit: z.number().int().min(1).max(TASK_PAGE_LIMITS.maxPage).default(TASK_PAGE_LIMITS.page), cursor: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_-]+$/).optional() }).strict()
const cursor = z.object({ version: z.literal(1), key: z.string().length(64), updatedAt: z.string().datetime(), id }).strict()
const invalid = () => { throw new ApplicationValidationError('INVALID_INPUT', '任务分页游标已失效或不属于当前筛选，请从第一页重新读取') }

export function taskPageOperation(store: ProductStore): ApplicationOperation {
  return { name: 'tasks.page', description: '分页读取明确登记的任务进度与来源；仅列表摘录，done不证明执行或成果验收。不会运行任务。', effect: 'read', input: query, resultType: 'TrackedTaskPage', execute: async (raw, _, actor: ApplicationActor): Promise<TrackedTaskPage> => {
    const input = query.parse(raw)
    if (actor.kind !== 'owner' && input.agentId && input.agentId !== actor.employeeId) throw new ApplicationValidationError('FORBIDDEN', '任务不属于当前员工可用范围')
    const viewer = actor.kind === 'owner' ? undefined : { employeeId: actor.employeeId, conversationId: actor.conversationId }
    const filters = { agentId: input.agentId ?? viewer?.employeeId, conversationId: input.conversationId, status: input.status, includeDone: input.status ? false : input.includeDone }
    const key = createHash('sha256').update(JSON.stringify({ filters, viewer: viewer ?? 'owner' })).digest('hex')
    let before: { updatedAt: string; id: string } | undefined
    if (input.cursor) {
      try { const value = cursor.parse(JSON.parse(Buffer.from(input.cursor, 'base64url').toString('utf8'))); if (value.key !== key) return invalid(); before = { updatedAt: value.updatedAt, id: value.id } }
      catch { return invalid() }
    }
    const rows = await store.queryTrackedTaskPage({ ...filters, viewer, before, limit: input.limit })
    const items = rows.slice(0, input.limit), last = items.at(-1)
    return { items, ...(rows.length > input.limit && last ? { nextCursor: Buffer.from(JSON.stringify({ version: 1, key, updatedAt: last.updatedAt, id: last.id })).toString('base64url') } : {}) }
  } }
}
