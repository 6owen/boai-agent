/*
 * [OUTPUT]: 状态是协作提示，员工按实际工作和用户明确验收更新，完成/关闭不锁住后续对话；任务范围保持。
 * [OUTPUT]: tasks.update可沿当前人工任务补全要求正文，事务后同步会话标题缓存，保留revision和当前任务权限。
 * [OUTPUT]: tasks.create只登记内部progress，不创建看板委派；tasks.get/update按原身份维护当前委派或内部进度。
 * [OUTPUT]: Provides employee task records and SQL-bounded tasks.page; original mutations/list and receipt semantics remain compatible.
 * [INPUT]: Original ProductStore, authenticated application actor and explicit task tracking intent.
 * [OUTPUT]: Durable per-employee multi-step tracking with revision checks; no scheduler or Work execution.
 * [POS]: Application tasks domain, separate from model Work/budget and employee automation plans.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { randomUUID } from 'node:crypto'
import type { TrackedTask } from '@boai/shared/domain/tracked-tasks'
import { isEmployeeTaskAssignment } from '@boai/shared/domain/tracked-tasks'
import { taskPageOperation } from './task-page'
import { z } from 'zod'
import type { DigitalAgent, Conversation } from '@boai/shared/domain'
import type { ApplicationActor } from '@boai/shared/domain/application-protocol'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { ApplicationValidationError, type ApplicationOperation } from './application-service'
export type { TrackedTask } from '@boai/shared/domain/tracked-tasks'

const id = z.string().min(1).max(200), status = z.enum(['pending', 'in_progress', 'in_review', 'done', 'closed'])
const step = z.object({ title: z.string().trim().min(1).max(300), done: z.boolean().default(false) }).strict()
const fields = { title: z.string().trim().min(1).max(300), steps: z.array(step).max(50), status, note: z.string().max(4000) }
const owner = z.object({ agentId: id }).strict()
const create = owner.extend({ conversationId: id.optional(), title: fields.title, steps: fields.steps.default([]), note: fields.note.default('') }).strict()
const update = z.object({ id, expectedRevision: z.number().int().positive(), title: fields.title.optional(), description: z.string().trim().min(1).max(40000).optional(), steps: fields.steps.optional(), status: status.optional(), note: fields.note.optional() }).strict()
const collection = 'agentTasks'

export function taskOperations(store: ProductStore, conversationUpdated?: (conversation: Conversation) => void): ApplicationOperation[] {
  async function allowed(tx: RecordTransaction, task: Pick<TrackedTask, 'id' | 'agentId' | 'conversationId'>, actor: ApplicationActor) {
    if (!await tx.get<DigitalAgent>('agents', task.agentId)) return false
    const source = task.conversationId ? await tx.get<Conversation>('conversations', task.conversationId) : undefined
    if (task.conversationId && (!source || !source.agentIds.includes(task.agentId))) return false
    if (actor.kind === 'owner') return true
    if (actor.employeeId !== task.agentId) return false
    const current = await tx.get<Conversation>('conversations', actor.conversationId)
    const assigned = current?.employeeTaskId ? await tx.get<TrackedTask>(collection, current.employeeTaskId) : undefined
    if (assigned && isEmployeeTaskAssignment(assigned)) return assigned.id === task.id && assigned.agentId === actor.employeeId && assigned.sessionConversationId === current?.id
    if (task.conversationId === actor.conversationId) return true
    return !!current && current.kind === 'direct' && !current.channel && !source?.channel && source?.memoryScope !== 'conversation' && source?.kind !== 'group'
  }
  const read = async (tx: RecordTransaction, taskId: string, actor: ApplicationActor) => {
    const task = await tx.get<TrackedTask>(collection, taskId)
    if (!task || !await allowed(tx, task, actor)) throw new ApplicationValidationError('NOT_FOUND', '任务不存在或不属于当前员工可用范围')
    return task
  }
  return [
    taskPageOperation(store),
    { name: 'tasks.list', description: '列出员工持久多步任务；默认未完成，跨会话仍核对来源。不会运行任务。', effect: 'read', input: owner.extend({ status: status.optional(), includeDone: z.boolean().default(false) }).strict(), resultType: 'TrackedTask[]', execute: (input, _, actor) => store.transaction(async tx => {
      const result: TrackedTask[] = []
      for (const task of await tx.list<TrackedTask>(collection)) if (task.agentId === input.agentId && (input.status ? task.status === input.status : input.includeDone || !['done', 'closed'].includes(task.status)) && await allowed(tx, task, actor)) result.push(task)
      return result.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    }) },
    { name: 'tasks.get', description: '读取实际任务、步骤、状态和 revision。', effect: 'read', input: z.object({ id }).strict(), resultType: 'TrackedTask', execute: (input, _, actor) => store.transaction(tx => read(tx, input.id, actor)) },
    { name: 'tasks.create', description: '登记Agent内部多步进度（progress），不会创建或出现在人工委派看板，不启动执行。当前任务会话请沿已有ID更新，内部拆解使用实际可用的计划/待办工具。', effect: 'write', input: create, resultType: 'TrackedTask', execute: (input, _, actor) => store.transaction(async tx => {
      const value = create.parse(input), time = new Date().toISOString()
      if (actor.kind !== 'owner') {
        const room = await tx.get<Conversation>('conversations', actor.conversationId)
        const assigned = room?.employeeTaskId ? await tx.get<TrackedTask>(collection, room.employeeTaskId) : undefined
        if (assigned && isEmployeeTaskAssignment(assigned)) throw new ApplicationValidationError('INVALID_INPUT', `当前会话已有任务 ${assigned.id}，请用 tasks.get/update 更新原任务，不要重复创建`)
      }
      const task: TrackedTask = { ...value, kind: 'progress', ...(actor.kind !== 'owner' ? { conversationId: actor.conversationId } : {}), id: randomUUID(), status: 'pending', revision: 1, createdAt: time, updatedAt: time }
      if (!await allowed(tx, task, actor)) throw new Error('任务员工或来源未授权')
      await tx.put({ collection, id: task.id, value: task }); return task
    }) },
    { name: 'tasks.update', description: '按当前 revision 更新标题、人工任务目标/验收正文（description）、步骤、协作状态和原因；会话创建沿原ID补全内容，不另建任务。交付用 in_review，用户明确验收通过后才用 done。状态是平级标签，不控制执行。', effect: 'write', input: update, resultType: 'TrackedTask', execute: (input, _, actor) => store.transaction(async tx => {
      const value = update.parse(input), previous = await read(tx, value.id, actor)
      if (previous.revision !== value.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', '任务已经改变，请先读取当前版本')
      const { expectedRevision: _, ...changes } = value
      if (value.description && !isEmployeeTaskAssignment(previous)) throw new ApplicationValidationError('INVALID_INPUT', '只有人工任务支持目标与验收正文')
      const task: TrackedTask = { ...previous, ...changes, ...(value.description ? { briefPending: false } : {}), ...(value.status ? { statusSource: actor.kind !== 'owner' && isEmployeeTaskAssignment(previous) ? 'employee' : 'manual' } : {}), revision: previous.revision + 1, updatedAt: new Date().toISOString() }
      if (value.title && previous.sessionConversationId) {
        const room = await tx.get<Conversation>('conversations', previous.sessionConversationId)
        if (room?.employeeTaskId === task.id) await tx.put({ collection: 'conversations', id: room.id, value: { ...room, title: value.title, updatedAt: task.updatedAt } })
      }
      await tx.put({ collection, id: task.id, value: task }); return task
    }).then(async task => {
      if (input.title && task.sessionConversationId) {
        const room = await store.get<Conversation>('conversations', task.sessionConversationId)
        if (room?.employeeTaskId === task.id) conversationUpdated?.(room)
      }
      return task
    }) },
    { name: 'tasks.delete', description: '删除指定进度记录；不取消执行 Work、不删除成果或自动化。', effect: 'write', input: z.object({ id, expectedRevision: z.number().int().positive() }).strict(), resultType: '{ deleted: true }', execute: (input, _, actor) => store.transaction(async tx => {
      const task = await read(tx, input.id, actor)
      if (task.revision !== input.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', '任务已经改变')
      if (task.latestOccurrenceId) throw new Error('该员工任务已有执行记录，请标记完成以保留关联')
      await tx.remove(collection, task.id); return { deleted: true }
    }) },
  ]
}
