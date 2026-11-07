/*
 * [INPUT]: Real AppService/ProductStore with an isolated profile and a controlled model engine.
 * [OUTPUT]: Owner diagnosis target admission/provenance; definite pre-admission rejection, unknown commits and stable receipt reconciliation.
 * [POS]: WT1 message seam acceptance; no external model, GUI or target-task execution.
 * [PROTOCOL]: Update Header and tests/.folder.md on change.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import type { AgentEngine } from '../packages/runtime/src/contracts'
import type { AgentInput, Connection, Conversation, ConversationDetail, DigitalAgent, Message, Snapshot } from '../packages/shared/src/domain'
import type { TrackedTask } from '../packages/shared/src/domain/tracked-tasks'
import type { EmployeeTaskDetail } from '../packages/shared/src/domain/employee-tasks'
import { taskDiagnosisExplanationResultSchema, type TaskDiagnosisTarget } from '../packages/shared/src/domain/task-diagnosis'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close() })
async function fixture(configured = true) {
  const root = await mkdtemp(join(tmpdir(), 'boai-diagnosis-message-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const calls: string[] = [], instructions: string[] = []
  const engine: AgentEngine = {
    test: async () => 'isolated',
    decide: async ctx => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: Math.max(0, ...ctx.messages.map(message => message.sequence)) }),
    run: async ctx => { calls.push(ctx.agent.id); instructions.push(ctx.bootstrap?.dynamicInstructions ?? ''); await ctx.onDelta('只读解释') },
    report: async (_ctx, draft) => ({ action: 'publish', text: draft.text }),
  }
  const open = async () => {
    const service = new AppService({ dataPath: root, engine, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
    cleanup.push(() => service.close()); await service.init(); return service
  }
  const service = await open()
  const configure = async () => {
    const connection = await service.handle('saveConnection', { name: 'isolated', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture' }) as Connection
    const agents = (await service.handle('snapshot', undefined) as Snapshot).agents
    for (const agent of agents.filter(value => ['bobo', 'researcher'].includes(value.id))) {
      const input: AgentInput = { id: agent.id, expectedConfigVersion: agent.configVersion, name: agent.name, role: agent.role, instructions: agent.instructions, color: agent.color, skillIds: agent.skillIds, knowledgeIds: agent.knowledgeIds, allowCommands: agent.allowCommands, active: true, connectionId: connection.id, modelId: 'fixture' }
      await service.handle('saveAgent', input) as DigitalAgent
    }
  }
  if (configured) await configure()
  const task = await service.handle('createEmployeeTask', { employeeId: 'researcher', description: '原任务保持待办', requestId: 'target-task' }) as TrackedTask
  const target: TaskDiagnosisTarget = { kind: 'task', employeeId: 'researcher', taskId: task.id }
  const core = () => service.handle('startCoreConversation', { content: '解释任务为什么停了', requestId: 'core-diagnosis', diagnosisTarget: target }) as Promise<Conversation>
  const detail = (id: string, current = service) => current.handle('getConversation', { id }) as Promise<ConversationDetail>
  const idle = (id: string, current = service) => vi.waitFor(async () => { const runs = (await detail(id, current)).runs; expect(runs.length).toBeGreaterThan(0); expect(runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))).toBe(true) }, { timeout: 10000 })
  return { root, service, calls, instructions, task, target, core, detail, idle, open, configure }
}

it('persists an explicit target on the real owner message and keeps retry identity across restart without executing the target', async () => {
  const f = await fixture(), room = await f.core(); await f.idle(room.id)
  const source = (await f.detail(room.id)).messages.find(message => message.senderType === 'user')!
  expect(source).toMatchObject({ senderId: 'user', diagnosisTarget: f.target })
  expect(source.replyToMessageId).toBeUndefined(); expect(source.employeeTaskId).toBeUndefined()
  expect((await f.service.handle('getEmployeeTask', { employeeId: 'researcher', id: f.task.id }) as EmployeeTaskDetail).task).toEqual(f.task)
  expect(f.calls).toEqual(['bobo'])
  expect(f.instructions[0]).toContain(JSON.stringify(f.target)); expect(f.instructions[0]).toContain('仅授权只读解释')
  expect((await f.core()).id).toBe(room.id)
  await expect(f.service.handle('startCoreConversation', { content: '解释任务为什么停了', requestId: 'core-diagnosis', diagnosisTarget: { ...f.target, taskId: 'different' } })).rejects.toThrow('不同核心会话请求')
  const input = { conversationId: room.id, content: '只解释耗时', mentionIds: [], requestId: 'follow-up-diagnosis', diagnosisTarget: f.target }
  const message = await f.service.handle('sendMessage', input) as Message
  expect(message.diagnosisTarget).toEqual(f.target); expect(message.replyToMessageId).toBeUndefined()
  expect((await f.service.handle('sendMessage', input) as Message).id).toBe(message.id)
  await expect(f.service.handle('sendMessage', { ...input, diagnosisTarget: { ...f.target, taskId: 'different' } })).rejects.toThrow('不同请求')
  await vi.waitFor(() => expect(f.calls).toHaveLength(2)); await f.idle(room.id)
  await f.service.close(); const restored = await f.open(), count = f.calls.length
  expect((await restored.handle('sendMessage', input) as Message).id).toBe(message.id)
  expect((await f.detail(room.id, restored)).messages.find(value => value.id === message.id)?.diagnosisTarget).toEqual(f.target)
  expect(f.calls).toHaveLength(count)
})

it('rejects missing or mismatched targets and non-core recipients without storing a diagnosis message', async () => {
  const f = await fixture(), room = await f.core(); await f.idle(room.id)
  const employeeRoom = await f.service.handle('createConversation', { kind: 'direct', title: '原员工聊天', agentIds: ['researcher'] }) as Conversation
  const send = { content: '诊断', mentionIds: [], requestId: 'invalid-target', conversationId: room.id, diagnosisTarget: f.target }
  for (const diagnosisTarget of [
    { ...f.target, employeeId: 'missing' }, { ...f.target, employeeId: 'writer' }, { ...f.target, taskId: 'missing' }, { ...f.target, occurrenceId: 'missing' },
  ]) await expect(f.service.handle('sendMessage', { ...send, diagnosisTarget })).rejects.toThrow('诊断目标')
  await expect(f.service.handle('sendMessage', { ...send, conversationId: employeeRoom.id })).rejects.toThrow('仅接受本人发给bobo')
  await expect(f.service.handle('sendMessage', { ...send, stopPrevious: true })).rejects.toThrow('仅接受本人发给bobo')
  await expect(f.service.handle('startCoreConversation', { content: '诊断', requestId: 'missing-core-target', diagnosisTarget: { ...f.target, taskId: 'missing' } })).rejects.toThrow('诊断目标')
  expect(await f.service.handle('getCoreConversationStart', { requestId: 'missing-core-target' })).toBeNull()
  expect((await f.detail(room.id)).messages.filter(message => message.senderType === 'user')).toHaveLength(1)
  expect((await f.detail(employeeRoom.id)).messages).toHaveLength(0); expect(f.calls).toEqual(['bobo'])
})

it('checks run employee and conversation provenance again after the original history is cleared', async () => {
  const f = await fixture(), employeeRoom = await f.service.handle('createConversation', { kind: 'direct', title: '原执行', agentIds: ['researcher'] }) as Conversation
  await f.service.handle('sendMessage', { conversationId: employeeRoom.id, content: '原请求', mentionIds: [], requestId: 'original-run' }); await f.idle(employeeRoom.id)
  const run = (await f.detail(employeeRoom.id)).runs.find(value => value.phase === 'execution')!
  const room = await f.core(); await f.idle(room.id)
  const target: TaskDiagnosisTarget = { kind: 'run', employeeId: 'researcher', conversationId: employeeRoom.id, runId: run.id }
  const send = { conversationId: room.id, content: '只读解释原执行', mentionIds: [], requestId: 'run-diagnosis', diagnosisTarget: target }
  const accepted = await f.service.handle('sendMessage', send) as Message
  expect(accepted.diagnosisTarget).toEqual(target)
  await expect(f.service.handle('sendMessage', { ...send, requestId: 'wrong-run-owner', diagnosisTarget: { ...target, employeeId: 'writer' } })).rejects.toThrow('诊断目标')
  await f.service.handle('clearConversationHistory', { id: employeeRoom.id, hide: false })
  await expect(f.service.handle('sendMessage', { ...send, requestId: 'cleared-run' })).rejects.toThrow('诊断目标')
  expect(f.calls.filter(id => id === 'researcher')).toHaveLength(1)
})

it('returns definite rejection with zero messages before admission and accepts a new explicit request after configuration', async () => {
  const f = await fixture(false), request = { requestId: 'no-model', diagnosisTarget: f.target }
  const rejected = taskDiagnosisExplanationResultSchema.parse(await f.service.handle('startTaskDiagnosisExplanation', request))
  expect(rejected).toEqual({ status: 'rejected', requestId: request.requestId, code: 'NOT_ACCEPTED', message: '本次解释请求未受理，请检查当前配置后重新发送。' })
  expect(await f.service.handle('getCoreConversationStart', { requestId: request.requestId })).toBeNull()
  expect(await f.service.handle('getMessageReceipt', { requestId: request.requestId })).toBeNull()
  const inspection = new ProductStore(join(f.root, 'boai.sqlite')); await inspection.init(); cleanup.push(() => inspection.close())
  expect(await inspection.load('messages')).toEqual([]); expect(f.calls).toEqual([])
  await f.configure()
  const next = { ...request, requestId: 'configured-explicit-send' }
  const accepted = taskDiagnosisExplanationResultSchema.parse(await f.service.handle('startTaskDiagnosisExplanation', next))
  expect(accepted.status).toBe('accepted'); if (accepted.status !== 'accepted') throw new Error('Expected accepted')
  await f.idle(accepted.conversationId)
  expect((await f.detail(accepted.conversationId)).messages.filter(value => value.senderType === 'user')).toHaveLength(1)
  expect(await f.service.handle('startTaskDiagnosisExplanation', next)).toEqual(accepted)
  expect(f.calls).toEqual(['bobo'])
})

it('retains unknown after a committed transaction loses its reply and reconciles the original identity after restart', async () => {
  const f = await fixture(), request = { requestId: 'diagnosis-lost-commit', diagnosisTarget: f.target }
  const transaction = ProductStore.prototype.transaction
  let armed = true
  const interception = vi.spyOn(ProductStore.prototype, 'transaction').mockImplementation(async function (this: ProductStore, action) {
    let accepted = false
    const result = await transaction.call(this, tx => action({ ...tx, put: async record => {
      await tx.put(record)
      if (armed && record.collection === 'coreConversationStarts') accepted = true
    } }))
    if (accepted) { armed = false; throw new Error('private error after committed diagnosis') }
    return result
  })
  expect(await f.service.handle('startTaskDiagnosisExplanation', request)).toEqual({ status: 'unknown', requestId: request.requestId })
  interception.mockRestore()
  expect(await f.service.handle('startTaskDiagnosisExplanation', request)).toEqual({ status: 'unknown', requestId: request.requestId })
  await f.service.close(); const restored = await f.open()
  const room = await restored.handle('getCoreConversationStart', { requestId: request.requestId }) as Conversation
  const source = await restored.handle('getMessageReceipt', { requestId: request.requestId }) as Message
  expect(source).toMatchObject({ conversationId: room.id, diagnosisTarget: f.target })
  expect(await restored.handle('startTaskDiagnosisExplanation', request)).toEqual({ status: 'accepted', requestId: request.requestId, conversationId: room.id })
  expect((await f.detail(room.id, restored)).messages.filter(value => value.senderType === 'user')).toHaveLength(1)
})

it('never calls prior, colliding, cleared or unreadable receipts a definite rejection', async () => {
  const f = await fixture(), room = await f.core(); await f.idle(room.id)
  const request = { requestId: 'core-diagnosis', diagnosisTarget: f.target }
  expect(await f.service.handle('startTaskDiagnosisExplanation', request)).toEqual({ status: 'unknown', requestId: request.requestId })
  await f.service.handle('sendMessage', { conversationId: room.id, content: '原消息', mentionIds: [], requestId: 'other-message' }); await f.idle(room.id)
  expect(await f.service.handle('startTaskDiagnosisExplanation', { ...request, requestId: 'other-message' })).toEqual({ status: 'unknown', requestId: 'other-message' })
  await f.service.handle('clearConversationHistory', { id: room.id, hide: false })
  expect(await f.service.handle('startTaskDiagnosisExplanation', request)).toEqual({ status: 'unknown', requestId: request.requestId })
  const transaction = ProductStore.prototype.transaction
  vi.spyOn(ProductStore.prototype, 'transaction').mockImplementation(function (this: ProductStore, action) {
    return transaction.call(this, tx => action({ ...tx, get: async (collection, id) => {
      if (collection === 'coreConversationStarts' && id === 'read-failed') throw new Error('private receipt read error')
      return tx.get(collection, id)
    } }))
  })
  expect(await f.service.handle('startTaskDiagnosisExplanation', { ...request, requestId: 'read-failed' })).toEqual({ status: 'unknown', requestId: 'read-failed' })
})
