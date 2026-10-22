/*
 * [OUTPUT]: Adds SQL-bounded tasks.page for the future task entry; original mutations/list and receipt semantics remain compatible.
 * [INPUT]: Original ProductStore, authenticated application actor and explicit task tracking intent.
 * [OUTPUT]: Durable per-employee multi-step tracking with revision checks; no scheduler or Work execution.
 * [POS]: Application tasks domain, separate from model Work/budget and employee automation plans.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { randomUUID } from 'node:crypto'
import type { TrackedTask } from '../../../shared/domain/tracked-tasks'
import { taskPageOperation } from './task-page'
import { z } from 'zod'
import type { DigitalAgent, Conversation } from '../../../shared/domain'
import type { ApplicationActor } from '../../../shared/domain/application-protocol'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { ApplicationValidationError, type ApplicationOperation } from './application-service'
export type { TrackedTask } from '../../../shared/domain/tracked-tasks'

const id = z.string().min(1).max(200), status = z.enum(['pending', 'in_progress', 'blocked', 'done'])
const step = z.object({ title: z.string().trim().min(1).max(300), done: z.boolean().default(false) }).strict()
const fields = { title: z.string().trim().min(1).max(300), steps: z.array(step).max(50), status, note: z.string().max(4000) }
const owner = z.object({ agentId: id }).strict()
const create = owner.extend({ conversationId: id.optional(), title: fields.title, steps: fields.steps.default([]), note: fields.note.default('') }).strict()
const update = z.object({ id, expectedRevision: z.number().int().positive(), title: fields.title.optional(), steps: fields.steps.optional(), status: status.optional(), note: fields.note.optional() }).strict()
const collection = 'agentTasks'

export function taskOperations(store: ProductStore): ApplicationOperation[] {
  async function allowed(tx: RecordTransaction, task: Pick<TrackedTask, 'agentId' | 'conversationId'>, actor: ApplicationActor) {
    if (!await tx.get<DigitalAgent>('agents', task.agentId)) return false
    const source = task.conversationId ? await tx.get<Conversation>('conversations', task.conversationId) : undefined
    if (task.conversationId && (!source || !source.agentIds.includes(task.agentId))) return false
    if (actor.kind === 'owner') return true
    if (actor.employeeId !== task.agentId) return false
    if (task.conversationId === actor.conversationId) return true
    const current = await tx.get<Conversation>('conversations', actor.conversationId)
    return !!current && current.kind === 'direct' && !current.channel && !source?.channel && source?.memoryScope !== 'conversation' && source?.kind !== 'group'
  }
  const read = async (tx: RecordTransaction, taskId: string, actor: ApplicationActor) => {
    const task = await tx.get<TrackedTask>(collection, taskId)
    if (!task || !await allowed(tx, task, actor)) throw new Error('任务不存在或不属于当前员工可用范围')
    return task
  }
  return [
    taskPageOperation(store),
    { name: 'tasks.list', description: '列出员工持久多步任务；默认未完成，跨会话仍核对来源。不会运行任务。', effect: 'read', input: owner.extend({ status: status.optional(), includeDone: z.boolean().default(false) }).strict(), resultType: 'TrackedTask[]', execute: (input, _, actor) => store.transaction(async tx => {
      const result: TrackedTask[] = []
      for (const task of await tx.list<TrackedTask>(collection)) if (task.agentId === input.agentId && (input.status ? task.status === input.status : input.includeDone || task.status !== 'done') && await allowed(tx, task, actor)) result.push(task)
      return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }) },
    { name: 'tasks.get', description: '读取实际任务、步骤、状态和 revision。', effect: 'read', input: z.object({ id }).strict(), resultType: 'TrackedTask', execute: (input, _, actor) => store.transaction(tx => read(tx, input.id, actor)) },
    { name: 'tasks.create', description: '为用户要求的多步工作登记进度。与执行 Work、自动化和人格后台活动分开，不启动模型。', effect: 'write', input: create, resultType: 'TrackedTask', execute: (input, _, actor) => store.transaction(async tx => {
      const value = create.parse(input), time = new Date().toISOString()
      const task: TrackedTask = { ...value, ...(actor.kind !== 'owner' ? { conversationId: actor.conversationId } : {}), id: randomUUID(), status: 'pending', revision: 1, createdAt: time, updatedAt: time }
      if (!await allowed(tx, task, actor)) throw new Error('任务员工或来源未授权')
      await tx.put({ collection, id: task.id, value: task }); return task
    }) },
    { name: 'tasks.update', description: '按当前 revision 更新实际步骤/阻塞/完成；登记 done 只是进度声明，不证明工具副作用成功。', effect: 'write', input: update, resultType: 'TrackedTask', execute: (input, _, actor) => store.transaction(async tx => {
      const value = update.parse(input), previous = await read(tx, value.id, actor)
      if (previous.revision !== value.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', '任务已经改变，请先读取当前版本')
      const { expectedRevision: _, ...changes } = value
      const task = { ...previous, ...changes, revision: previous.revision + 1, updatedAt: new Date().toISOString() }
      await tx.put({ collection, id: task.id, value: task }); return task
    }) },
    { name: 'tasks.delete', description: '删除指定进度记录；不取消执行 Work、不删除成果或自动化。', effect: 'write', input: z.object({ id, expectedRevision: z.number().int().positive() }).strict(), resultType: '{ deleted: true }', execute: (input, _, actor) => store.transaction(async tx => {
      const task = await read(tx, input.id, actor)
      if (task.revision !== input.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', '任务已经改变')
      await tx.remove(collection, task.id); return { deleted: true }
    }) },
  ]
}
