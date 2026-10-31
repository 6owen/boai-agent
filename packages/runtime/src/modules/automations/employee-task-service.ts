/*
 * [OUTPUT]: 每任务持久会话/回执；按归属和版本重命名/改状态/删除，删除保留执行历史且拒绝仍在执行的任务。
 * [INPUT]: Owner task commands, original tracked-task store and AutomationService.
 * [OUTPUT]: Explicit message conversion, durable lifecycle and repeat executions in the task-owned conversation.
 * [POS]: Product coordination only; no new Agent loop or native session policy.
 * [PROTOCOL]: Update Header and owning .folder.md on change.
 */
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { Methods } from '@boai/shared/ipc'
import type { Conversation, DigitalAgent, Message } from '@boai/shared/domain'
import type { TrackedTask, TrackedTaskPage } from '@boai/shared/domain/tracked-tasks'
import type { AutomationOccurrence } from '@boai/shared/domain/automations'
import type { EmployeeTaskMethods } from '@boai/shared/domain/employee-tasks'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import { taskPageOperation } from '../application/task-page'
import { taskIdentity, ongoingTaskExecution } from './employee-task-records'
import type { AutomationService } from './automation-service'
const id = z.string().min(1).max(200)
const status = z.enum(['pending', 'in_progress', 'in_review', 'done', 'closed'])
const owner = z.object({ employeeId: id })
const create = owner.extend({ requestId: id, title: z.string().trim().min(1).max(300).optional(), description: z.string().trim().min(1).max(40000).optional(), source: z.object({ conversationId: id, messageId: id }).strict().optional() }).strict()
const get = owner.extend({ id: id.optional(), occurrenceId: id.optional(), before: z.object({ startedAt: z.string().datetime(), id: z.string().min(1).max(500) }).strict().optional() }).strict().refine(v => !!v.id !== !!v.occurrenceId, '请选择一个任务')
const mutation = owner.extend({ id, expectedRevision: z.number().int().positive() }).strict()
const update = mutation.extend({ status: status.optional(), title: z.string().trim().min(1).max(300).optional() }).refine(v => v.status !== undefined || v.title !== undefined, '请选择要修改的任务内容')
const run = owner.extend({ id, expectedRevision: z.number().int().positive(), requestId: id, supplement: z.string().trim().max(20000).optional(), message: z.custom<Methods['sendMessage']['input']>().optional() }).strict()

async function read(tx: RecordTransaction, employeeId: string, taskId: string) {
  const employee = await tx.get<DigitalAgent>('agents', employeeId), task = await tx.get<TrackedTask>('agentTasks', taskId)
  if (!employee || !task || task.agentId !== employeeId) throw new Error('任务不存在或不属于当前员工')
  return task
}
export class EmployeeTaskService {
  private tail: Promise<unknown> = Promise.resolve()
  constructor(private store: ProductStore, private automations: AutomationService, private changed: (message?: Message) => void, private dataPath: string, private sessionReady: (conversation: Conversation) => void) {}
  private serialize<T>(fn: () => Promise<T>) { const next = this.tail.then(fn); this.tail = next.catch(() => {}); return next }
  private async session(employeeId: string, taskId: string) {
    const room = await this.store.transaction(async tx => {
      const task = await read(tx, employeeId, taskId)
      if (task.sessionConversationId) {
        const existing = await tx.get<Conversation>('conversations', task.sessionConversationId)
        if (!existing || existing.employeeTaskId !== task.id || existing.agentIds.length !== 1 || existing.agentIds[0] !== employeeId || existing.mergedInto) throw new Error('任务会话已不可用，请核对原任务记录')
        return existing
      }
      const previous = task.latestOccurrenceId ? await tx.get<AutomationOccurrence>('automationOccurrences', task.latestOccurrenceId) : undefined
      const old = previous ? await tx.get<Conversation>('conversations', previous.conversationId) : undefined
      const reusable = old?.purpose === 'automation' && !old.mergedInto && old.agentIds.length === 1 && old.agentIds[0] === employeeId && (!old.employeeTaskId || old.employeeTaskId === task.id)
      const conversationId = reusable ? old.id : randomUUID(), now = new Date().toISOString()
      const conversation: Conversation = reusable ? { ...old, employeeTaskId: task.id } : { id: conversationId, kind: 'direct', purpose: 'automation', employeeTaskId: task.id, title: task.title, agentIds: [employeeId], mode: 'natural', sharedKnowledgeIds: [], memoryScope: 'employee', configVersion: 1, workspacePath: join(this.dataPath, 'workspaces', conversationId), createdAt: now, updatedAt: now }
      await mkdir(conversation.workspacePath, { recursive: true })
      await tx.put({ collection: 'conversations', id: conversation.id, value: conversation })
      await tx.put({ collection: 'agentTasks', id: task.id, value: { ...task, sessionConversationId: conversation.id } })
      return conversation
    })
    this.sessionReady(room); return room
  }
  async messageReceipt(requestId: string) {
    const receipt = await this.store.get<{ input: Methods['runEmployeeTask']['input'] }>('employeeTaskMessages', taskIdentity(`message:${requestId}`))
    if (!receipt) return null
    const definition = await this.automations.creation(taskIdentity(`run:${requestId}`))
    if (!definition) return null
    return (await this.store.automationHistory({ automationId: definition.id, limit: 1 })).occurrences[0] ?? null
  }
  async sendMessage(message: Methods['sendMessage']['input']) {
    const key = taskIdentity(`message:${message.requestId}`), fingerprint = JSON.stringify(message)
    const input = await this.store.transaction(async tx => {
      const previous = await tx.get<{ fingerprint: string; input: Methods['runEmployeeTask']['input'] }>('employeeTaskMessages', key)
      if (previous) { if (previous.fingerprint !== fingerprint) throw new Error('同一消息请求不能更换内容'); return previous.input }
      const room = await tx.get<Conversation>('conversations', message.conversationId)
      if (!room?.employeeTaskId || room.agentIds.length !== 1) throw new Error('请选择该员工的任务会话')
      const task = await read(tx, room.agentIds[0], room.employeeTaskId)
      if (task.sessionConversationId !== room.id) throw new Error('任务会话身份不一致')
      if ((await tx.list<AutomationOccurrence>('automationOccurrences')).some(o => o.taskId === task.id && !o.deletedAt && o.status === 'waiting_user')) throw new Error('请从当前任务会话中的原问题卡回复，以保留问题身份和版本')
      const input = { employeeId: task.agentId, id: task.id, expectedRevision: task.revision, requestId: message.requestId, message }
      await tx.put({ collection: 'employeeTaskMessages', id: key, value: { fingerprint, input } }); return input
    })
    return this.handle('runEmployeeTask', input)
  }
  async handle<K extends keyof EmployeeTaskMethods>(method: K, raw: unknown): Promise<EmployeeTaskMethods[K]['output']> {
    if (method === 'openEmployeeTaskSession') { const v = owner.extend({ id }).strict().parse(raw); return this.session(v.employeeId, v.id) }
    if (method === 'listEmployeeTasks') {
      const v = owner.extend({ status: status.optional(), includeDone: z.boolean().optional(), cursor: z.string().optional(), limit: z.number().int().min(1).max(100).optional() }).strict().parse(raw)
      if (!await this.store.get('agents', v.employeeId)) throw new Error('员工不存在')
      const operation = taskPageOperation(this.store)
      return await operation.execute({ agentId: v.employeeId, status: v.status, includeDone: v.includeDone, cursor: v.cursor, limit: v.limit }, undefined, { kind: 'owner' }) as TrackedTaskPage
    }
    if (method === 'getEmployeeTask') {
      const v = get.parse(raw)
      const task = await this.store.transaction(async tx => {
        const taskId = v.id ?? (await tx.get<AutomationOccurrence>('automationOccurrences', v.occurrenceId!))?.taskId
        if (!taskId) throw new Error('此执行没有可用的员工任务记录')
        return read(tx, v.employeeId, taskId)
      })
      return { task, executions: await this.store.automationHistory({ employeeId: v.employeeId, taskId: task.id, limit: 30, before: v.before }), ...(task.source ? { sourceExecution: await this.store.employeeTaskSource(task.agentId, task.source) } : {}) }
    }
    return this.serialize(async () => {
      if (method === 'createEmployeeTask') {
        const v = create.parse(raw), fingerprint = JSON.stringify(v)
        let sourceMessage: Message | undefined
        const task = await this.store.transaction(async tx => {
          const employee = await tx.get<DigitalAgent>('agents', v.employeeId)
          if (!employee || employee.systemRole === 'core') throw new Error('请选择数字员工')
          const receiptId = taskIdentity(`create:${v.requestId}`), receipt = await tx.get<{ fingerprint: string; taskId: string }>('employeeTaskReceipts', receiptId)
          if (receipt) { if (receipt.fingerprint !== fingerprint) throw new Error('同一请求不能提交不同任务'); return read(tx, v.employeeId, receipt.taskId) }
          const remember = async (task: TrackedTask) => {
            await tx.put({ collection: 'employeeTaskReceipts', id: receiptId, value: { fingerprint, taskId: task.id } }); return task
          }
          let source: Message | undefined
          if (v.source) {
            const room = await tx.get<Conversation>('conversations', v.source.conversationId)
            source = await tx.get<Message>('messages', v.source.messageId)
            if (!room || room.kind !== 'direct' || room.channel || room.purpose === 'automation' || room.mergedInto || room.agentIds.length !== 1 || room.agentIds[0] !== v.employeeId || !source || source.conversationId !== room.id || source.senderType !== 'user' || await tx.get('conversationCleanup', room.id)) throw new Error('只能将该员工主聊天中的用户消息设为任务')
            const occurrenceId = source.automationPublication?.occurrenceId ?? source.origin?.occurrenceId
            const taskId = source.employeeTaskId ?? (occurrenceId ? (await tx.get<AutomationOccurrence>('automationOccurrences', occurrenceId))?.taskId : undefined)
            if (taskId) return remember(await read(tx, v.employeeId, taskId))
          }
          const taskId = taskIdentity(source ? `message:${v.employeeId}:${source.id}` : `create:${v.requestId}`)
          const previous = await tx.get<TrackedTask>('agentTasks', taskId)
          if (previous) return remember(await read(tx, v.employeeId, taskId))
          const description = z.string().trim().min(1).max(40000).parse(v.description ?? source?.content)
          const now = new Date().toISOString()
          const task: TrackedTask = { id: taskId, agentId: v.employeeId, title: v.title ?? description.split('\n')[0].slice(0, 100), description, status: 'pending', steps: [], note: '', revision: 1, createdAt: now, updatedAt: now, sourceKind: source ? 'message' : 'manual', ...(source ? { source: { conversationId: source.conversationId, messageId: source.id } } : {}) }
          await tx.put({ collection: 'agentTasks', id: task.id, value: task })
          await tx.put({ collection: 'employeeTaskReceipts', id: receiptId, value: { fingerprint, taskId } })
          if (source) { sourceMessage = { ...source, employeeTaskId: task.id }; await tx.put({ collection: 'messages', id: source.id, value: sourceMessage }) }
          return task
        })
        this.changed(sourceMessage); return task
      }
      if (method === 'updateEmployeeTask') {
        const v = update.parse(raw)
        const task = await this.store.transaction(async tx => {
          const task = await read(tx, v.employeeId, v.id)
          if (task.revision !== v.expectedRevision) throw new Error('任务已经改变，请刷新后操作')
          const next = { ...task, ...(v.status ? { status: v.status, statusSource: 'manual' as const } : {}), ...(v.title ? { title: v.title } : {}), revision: task.revision + 1, updatedAt: new Date().toISOString() }
          if (v.title && task.sessionConversationId) {
            const room = await tx.get<Conversation>('conversations', task.sessionConversationId)
            if (room?.employeeTaskId === task.id) await tx.put({ collection: 'conversations', id: room.id, value: { ...room, title: v.title, updatedAt: next.updatedAt } })
          }
          await tx.put({ collection: 'agentTasks', id: task.id, value: next }); return next
        })
        if (v.title && task.sessionConversationId) {
          const room = await this.store.get<Conversation>('conversations', task.sessionConversationId)
          if (room?.employeeTaskId === task.id) this.sessionReady(room)
        }
        this.changed(); return task
      }
      if (method === 'deleteEmployeeTask') {
        const v = mutation.parse(raw)
        await this.store.transaction(async tx => {
          const deleted = await tx.get<{ agentId: string; revision: number }>('deletedEmployeeTasks', v.id)
          if (deleted?.agentId === v.employeeId && deleted.revision === v.expectedRevision) return
          const task = await read(tx, v.employeeId, v.id)
          if (task.revision !== v.expectedRevision) throw new Error('任务已经改变，请刷新后操作')
          if ((await tx.list<AutomationOccurrence>('automationOccurrences')).some(o => o.taskId === task.id && !o.deletedAt && ongoingTaskExecution(o))) throw new Error('请先停止当前任务的执行，再删除任务')
          // Keep the historical occurrence/session intact. A tombstone prevents adoption on restart.
          await tx.put({ collection: 'deletedEmployeeTasks', id: task.id, value: { agentId: task.agentId, revision: task.revision, deletedAt: new Date().toISOString() } })
          await tx.remove('agentTasks', task.id)
        })
        this.changed(); return { deleted: true }
      }
      const v = run.parse(raw), fingerprint = JSON.stringify(v), receiptId = taskIdentity(`run:${v.requestId}`)
      const task = await this.store.transaction(async tx => {
        const task = await read(tx, v.employeeId, v.id)
        const receipt = await tx.get<{ fingerprint: string }>('employeeTaskReceipts', receiptId)
        if (receipt) { if (receipt.fingerprint !== fingerprint) throw new Error('同一提交不能更换任务或补充内容'); return task }
        if (task.revision !== v.expectedRevision) throw new Error('任务已经改变，请刷新后操作')
        if (task.status === 'done' || task.status === 'closed') throw new Error('请先重新打开已完成任务')
        if (!v.message && task.latestOccurrenceId && ongoingTaskExecution(await tx.get<AutomationOccurrence>('automationOccurrences', task.latestOccurrenceId))) throw new Error('该任务仍在执行或等待处理，请回到聊天处理本次运行')
        await tx.put({ collection: 'employeeTaskReceipts', id: receiptId, value: { fingerprint } }); return task
      })
      let definition = await this.automations.creation(receiptId)
      if (!definition) {
        if (!task.description && !task.note && !v.supplement && !v.message) throw new Error('原任务要求不可用，请补充本次要求')
        const context = await this.session(task.agentId, task.id)
        const prompt = v.message ? (!task.latestOccurrenceId ? [task.description ?? task.note, v.message.content].filter(Boolean).join('\n\n') : v.message.content) : [task.description ?? task.note, v.supplement ? `\n本次补充要求：\n${v.supplement}` : ''].join('')
        definition = await this.automations.save({ conversationPolicy: 'existing-conversation', conversationId: context.id, requestId: receiptId, purpose: 'employee-task', employeeTask: { id: task.id, expectedRevision: v.expectedRevision, ...(v.message ? { message: { ...v.message, content: prompt } } : {}) }, owner: { kind: 'employee', employeeId: v.employeeId }, name: task.title.slice(0, 100), prompt: prompt || '处理本次任务材料', frequency: 'manual', time: '09:00', weekday: 1, timezone: 'UTC', enabled: true, notify: false })
      }
      return this.automations.run(definition.id, receiptId)
    })
  }
}
