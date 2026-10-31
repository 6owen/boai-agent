/*
 * [OUTPUT]: 2026-10-30 回归更新为Mastra官方记忆/原生归属合同；保留来源、调用预算和业务发布断言。
 * [INPUT]: 真实AppService/Mastra SDK/本地HTTP及固定组织阶段三工具、SQLite和受管员工文件准备故障。
 * [OUTPUT]: 原组织失败后的真实文件核对/新 holder 共原预算、零模型/零伪回复续完、原公告来源/效果确认和强幂等；忘记/过期旧快照与外改原件拒绝发布。
 * [POS]: bobo 组织恢复宿主合同；本地协议不计为真实供应商或人工质量通过。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ServerResponse } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { AppService } from '../packages/runtime/src/service'
import { MastraEngine } from '../packages/runtime/src/adapters/mastra/engine'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { teamEndpoint, sendTeamOutput } from './fixtures/team-planner'
import type { BoboCollaborationOperation, BoboCollaborationReceipt, EmployeeCandidatePage } from '../packages/shared/src/domain/bobo-collaboration'
import type { AgentRun, Connection, Conversation, ConversationDetail, MemoryView, Message, Snapshot, WorkBudget, WorkExecution, WorkItem } from '../packages/shared/src/domain'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close() })
const prompt = '请按我的编辑偏好复用研究员，新增一位编辑，再建立独立协作群并说明分工。现在只组织，不开始执行。'
const memoryContent = '编辑偏好：报告先说明事实来源，再给出编辑建议。'
const failureText = '员工文件准备尚未提交，原组织需要明确核对后继续。'
interface ModelMessage { role: string; content: string; tool_calls?: { id: string; function: { name: string; arguments: string } }[] }
function sendTool(response: ServerResponse, name: string, args: unknown, index: number) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `recovery-${index}`, object: 'chat.completion.chunk', model: 'bobo-recovery-fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
  emit({ role: 'assistant' }); emit({ tool_calls: [{ index: 0, id: `actual-recovery-tool-${index}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }); emit({}, 'tool_calls')
  response.write(`data: ${JSON.stringify({ id: `recovery-${index}`, object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 40, completion_tokens: 20, total_tokens: 60 } })}\n\n`)
  response.end('data: [DONE]\n\n')
}
async function fixture(options: { memory?: boolean; expiresAt?: string; checkpoint?: 'after-write' | 'before-commit' } = {}) {
  const path = await mkdtemp(join(tmpdir(), 'boai-bobo-service-')); cleanup.push(() => rm(path, { recursive: true, force: true }))
  const protocolErrors: string[] = []
  const endpoint = await teamEndpoint((body, response, index) => {
    try {
      const messages = body.messages as ModelMessage[], system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
      if (system.includes('Private memory maintenance')) { sendTeamOutput(response, { candidates: [] }); return }
      if (system.includes('Read the actual new conversation facts. Publish a relevant, updated report')) { const input = JSON.parse(messages.at(-1)!.content); sendTeamOutput(response, { action: 'publish', text: input.data.draft.text, outcome: input.data.draft.outcome }); return }
      if (system.includes('Private participation decision')) {
        const data = JSON.parse(messages.at(-1)!.content).data
        sendTeamOutput(response, data.participation?.hasRespondedInTurn ? { action: 'pass' } : { action: 'reply', responseKind: 'task', work: { key: 'main', scope: '查找并组织员工', deliverable: '实际员工与独立群回执', organization: { mode: 'organize_only', goal: prompt } } }); return
      }
      const tools = body.tools as { function: { name: string } }[] | undefined
      if (!tools?.some(tool => tool.function.name === 'organize_collaboration')) throw new Error('真实组织任务没有组织工具')
      expect(tools.map(tool => tool.function.name).sort()).toEqual(['find_employees', 'organize_collaboration', 'report_work'])
      const called = messages.flatMap(message => message.tool_calls ?? []).map(call => call.function.name)
      const results = messages.filter(message => message.role === 'tool').flatMap(message => { try { return [JSON.parse(message.content)] } catch { return [] } })
      if (!called.includes('find_employees')) { sendTool(response, 'find_employees', { search: '研究', limit: 20 }, index); return }
      if (!called.includes('organize_collaboration')) {
        const candidate = (results.find(result => Array.isArray(result.employees)) as EmployeeCandidatePage)?.employees.find(employee => employee.agentId === 'researcher')
        if (!candidate) throw new Error('真实候选缺少已有研究员')
        sendTool(response, 'organize_collaboration', { existingMembers: [{ agentId: candidate.agentId, configVersion: candidate.configVersion }], newEmployees: [{ name: '独立编辑', role: '核对资料并编辑', instructions: '按用户的明确授权处理编辑任务，不自动执行。' }], groupTitle: '原编辑组织群', announcement: '目标是编辑有来源的报告。研究员负责资料核对，独立编辑负责文字编辑。当前仅组织，不启动工作。' }, index); return
      }
      const receipt = results.find(result => result.operation?.id)?.operation ?? results.find(result => result.id && result.status === 'needs_attention')
      if (!receipt || receipt.status !== 'needs_attention') throw new Error('准备故障必须返回真实 needs_attention 回执')
      if (!called.includes('report_work')) { sendTool(response, 'report_work', { disposition: 'blocked', summary: failureText }, index); return }
      sendTeamOutput(response, failureText)
    } catch (error) { protocolErrors.push(error instanceof Error ? error.message : String(error)); if (!response.headersSent) response.writeHead(500); response.end(String(error)) }
  }); cleanup.push(() => endpoint.close())
  let faulted = false, faultPath: string | undefined
  const service = new AppService({ dataPath: path, engine: new MastraEngine(), secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {}, boboFileCheckpoint: async (phase, _operation, file) => {
    if (!faulted && phase === (options.checkpoint ?? 'after-write')) { faulted = true; faultPath = file; throw new Error('RECOVERY_TEST_CHECKPOINT: 原受管文件准备故障') }
  } }); await service.init(); cleanup.push(() => service.close())
  const connection = await service.handle('saveConnection', { name: '恢复协议', provider: 'openai-compatible', baseUrl: endpoint.url, defaultModel: 'bobo-recovery-fixture' }) as Connection
  const initial = await service.handle('snapshot', undefined) as Snapshot
  for (const employee of initial.agents) {
    const { configVersion, workspaceRef: _workspace, memoryNamespace: _namespace, policyVersion: _policy, ...input } = employee
    await service.handle('saveAgent', { ...input, connectionId: connection.id, modelId: 'bobo-recovery-fixture', expectedConfigVersion: configVersion })
  }
  let seeded: MemoryView | undefined
  if (options.memory) seeded = await service['memory'].save( { agentId: 'bobo', scope: 'employee', content: memoryContent, expectedEpoch: 0, requestId: 'original-editor-preference', kind: 'long_term', evidence: 'preference', pinned: true, ...(options.expiresAt ? { expiresAt: options.expiresAt } : {}) }) as MemoryView
  const before = await service.handle('snapshot', undefined) as Snapshot
  const core = await service.handle('startCoreConversation', { requestId: 'original-organization-user', content: prompt }) as Conversation
  const store = new ProductStore(join(path, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close())
  await vi.waitFor(async () => {
    const view = await service.handle('getConversation', { id: core.id }) as ConversationDetail
    expect(view.runs.some(run => run.phase === 'execution')).toBe(true)
    expect(view.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))).toBe(true)
    expect(view.turns?.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status))).toBe(true)
    expect((await store.load<BoboCollaborationOperation>('boboCollaborations'))[0]?.status, JSON.stringify(protocolErrors)).toBe('needs_attention')
  }, { timeout: 10_000, interval: 20 })
  expect(protocolErrors).toEqual([]); expect(faulted).toBe(true)
  const operation = (await store.load<BoboCollaborationOperation>('boboCollaborations'))[0]!, work = (await store.load<WorkItem>('workItems'))[0]!, budget = (await store.load<WorkBudget>('workBudgets'))[0]!
  expect(work).toMatchObject({ status: 'blocked', requiresReview: true, budgetId: operation.budgetId }); expect(operation.agents).toHaveLength(1)
  const unpublished = await service.handle('snapshot', undefined) as Snapshot
  expect(unpublished.agents.map(agent => agent.id)).toEqual(before.agents.map(agent => agent.id)); expect(unpublished.conversations.filter(conversation => conversation.kind === 'group')).toEqual([])
  return { path, endpoint, protocolErrors, service, store, core, before, operation, work, budget, seeded, faultPath }
}

describe('AppService original organization file recovery', () => {
  it.each(['after-write', 'before-commit'] as const)('continues the audited %s failure using the same Work and budget with no provider request or invented reply', async checkpoint => {
    const f = await fixture({ checkpoint }), calls = f.endpoint.requests.length, messages = await f.store.load<Message>('messages'), originalSource = structuredClone(f.operation.announcementSource)
    const receipt = await f.service.handle('resumeBoboCollaboration', { operationId: f.operation.id, expectedVersion: f.operation.version }) as BoboCollaborationReceipt
    expect(receipt.status).toBe('committed'); expect(f.endpoint.requests).toHaveLength(calls); expect(f.protocolErrors).toEqual([])
    const operation = (await f.store.load<BoboCollaborationOperation>('boboCollaborations'))[0]!, work = (await f.store.load<WorkItem>('workItems'))[0]!, budget = (await f.store.load<WorkBudget>('workBudgets'))[0]!
    expect(operation.announcementSource).toEqual(originalSource); expect(operation.authority.runId).not.toBe(originalSource.runId)
    expect(work).toMatchObject({ id: f.work.id, budgetId: f.budget.id, status: 'delivered', requiresReview: false, resultMessageIds: f.work.resultMessageIds, outcome: { disposition: 'delivered', evidence: [{ kind: 'collaboration', reference: operation.id }] } })
    expect(budget).toEqual({ ...f.budget, runs: f.budget.runs + 1 })
    const afterMessages = await f.store.load<Message>('messages')
    expect(afterMessages.filter(message => message.conversationId === f.core.id)).toEqual(messages)
    const announcement = afterMessages.find(message => message.id === receipt.announcementMessageId)!
    expect(announcement).toMatchObject({ conversationId: receipt.groupConversationId, senderType: 'agent', senderId: 'bobo', collaborationSource: { operationId: operation.id, sourceRunId: originalSource.runId, toolCallId: originalSource.toolCallId } }); expect(announcement.runId).toBeUndefined()
    const snapshot = await f.service.handle('snapshot', undefined) as Snapshot
    expect(snapshot.conversations.find(conversation => conversation.id === f.core.id)).toMatchObject({ purpose: 'core', agentIds: ['bobo'] })
    expect(snapshot.conversations.find(conversation => conversation.id === receipt.groupConversationId)?.agentIds).toEqual(['bobo', 'researcher', operation.agents[0]!.id])
    expect(snapshot.agents).toHaveLength(f.before.agents.length + 1)
    expect((await f.store.load<WorkExecution>('workExecutions')).every(execution => !execution.pendingEffects && execution.status === 'released')).toBe(true)
    const recovery = (await f.store.load<AgentRun>('runs')).find(run => run.id === operation.authority.runId)!
    expect(recovery).toMatchObject({ status: 'completed', messageId: '', workId: work.id, collaborationRequestId: operation.requestId }); expect(recovery.toolEvents).toEqual([])
    for (const file of operation.files) expect(createHash('sha256').update(await readFile(join(f.path, file.path))).digest('hex')).toBe(file.hash)
    expect(await f.service.handle('resumeBoboCollaboration', { operationId: operation.id, expectedVersion: receipt.version })).toEqual(receipt)
    expect(await f.store.load<Message>('messages')).toEqual(afterMessages); expect(await f.store.load<WorkBudget>('workBudgets')).toEqual([budget]); expect(f.endpoint.requests).toHaveLength(calls)
  })
  it('refuses forgotten memory used by the original frozen organization and never publishes its old plan', async () => {
    const f = await fixture({ memory: true }), calls = f.endpoint.requests.length, entry = f.seeded!.entries.find(entry => entry.content === memoryContent)!
    const snapshot = (await f.store.load<{ id: string; memoryRecall: { recall?: MemoryView['recall'] } }>('snapshots')).find(snapshot => snapshot.id === f.operation.announcementSource.runId)!
    expect(snapshot.memoryRecall.recall?.versions).toContainEqual({ id: entry.id, version: entry.version })
    const memory = await f.service.handle('getMemory', { agentId: 'bobo', scope: 'employee' }) as MemoryView
    await f.service.handle('clearMemory', { agentId: 'bobo', scope: 'employee', expectedEpoch: memory.epoch, requestId: 'forget-original-preference' })
    await expect(f.service.handle('resumeBoboCollaboration', { operationId: f.operation.id, expectedVersion: f.operation.version })).rejects.toThrow(/来源|记忆|失效/)
    expect(f.endpoint.requests).toHaveLength(calls); expect((await f.service.handle('snapshot', undefined) as Snapshot).agents.map(agent => agent.id)).toEqual(f.before.agents.map(agent => agent.id)); expect((await f.store.load<BoboCollaborationOperation>('boboCollaborations'))[0]?.status).not.toBe('committed')
    expect((await f.store.load<WorkExecution>('workExecutions')).find(execution => execution.id === f.operation.announcementSource.runId)?.pendingEffects).toBe(1)
  })
  it('refuses an expired recalled entry without changing its version or granting a new model allowance', async () => {
    const expiresAt = new Date(Date.now() + 90_000).toISOString(), f = await fixture({ memory: true, expiresAt }), calls = f.endpoint.requests.length
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 120_000)
    await expect(f.service.handle('resumeBoboCollaboration', { operationId: f.operation.id, expectedVersion: f.operation.version })).rejects.toThrow(/记忆|过期|失效/)
    expect(f.endpoint.requests).toHaveLength(calls); expect((await f.store.load<WorkBudget>('workBudgets'))[0]).toMatchObject({ id: f.budget.id, modelCalls: f.budget.modelCalls, deadlineAt: f.budget.deadlineAt })
    expect((await f.store.load<{ id: string; version: number }>('memory')).find(entry => entry.id === f.seeded!.entries[0]!.id)?.version).toBe(f.seeded!.entries[0]!.version)
    expect((await f.service.handle('snapshot', undefined) as Snapshot).conversations.filter(conversation => conversation.kind === 'group')).toEqual([])
  })
  it('audits an externally changed original file before admitting any new holder', async () => {
    const f = await fixture(), calls = f.endpoint.requests.length, runs = await f.store.load<AgentRun>('runs')
    expect(f.faultPath).toBeTypeOf('string'); await writeFile(f.faultPath!, '外部更改原件，应保留并明确拒绝恢复')
    await expect(f.service.handle('resumeBoboCollaboration', { operationId: f.operation.id, expectedVersion: f.operation.version })).rejects.toThrow(/FILES_CONFLICT|变化|修改|冲突/)
    expect(await readFile(f.faultPath!, 'utf8')).toBe('外部更改原件，应保留并明确拒绝恢复')
    expect(await f.store.load<AgentRun>('runs')).toEqual(runs); expect(await f.store.load<WorkBudget>('workBudgets')).toEqual([f.budget]); expect(f.endpoint.requests).toHaveLength(calls)
    expect((await f.service.handle('snapshot', undefined) as Snapshot).agents.map(agent => agent.id)).toEqual(f.before.agents.map(agent => agent.id))
  })
})
