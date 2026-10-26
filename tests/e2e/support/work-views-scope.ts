/*
 * [OUTPUT]: 第14组API群请求解释与持久顺序接续；保留独立并行、原Work和本机旧路径，实际验收归第14组05。
 * [OUTPUT]: 八状态目标预置保留完成式原文，不伪造文件/消息结果；只读核对原Work、模型调用/预算/成果及触发账本。
 * [INPUT]: 隔离Electron/真实宿主API、显式SQLite预置关系/规模与离线真实工具协议。
 * [OUTPUT]: 根子/独立依赖和五列75项的明确预置；实际全来源Work/失败触发/ACP对照；有界查询、耗时及进程内存原样记录。
 * [POS]: WV-T03/T07/T08支撑；预置状态不冒充运行成功，不替换查询或调度。
 * [PROTOCOL]: 修改时同步Header及所属.folder.md。
 */
import { join, resolve } from 'node:path'
import type { AgentRun, Conversation, Message, WorkItem } from '../../../packages/shared/src/domain'
import type { WorkViewPage, WorkViewQuery } from '../../../packages/shared/src/domain/work-views'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { Desktop } from './desktop'
import { prepareArtifactsDesktop } from './artifacts'
import { teamEndpoint, sendTeamOutput } from '../../fixtures/team-planner'

const fixedTime = '2026-10-05T00:00:00.000Z'
const record = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
function source(id: string, conversationId: string): Message { return { id, conversationId, senderType: 'user', senderId: 'user', senderName: '我', content: '明确预置：此历史请求用于只读工作视图，未执行模型。', status: 'completed', sequence: 1, createdAt: fixedTime } }
function historicalWork(id: string, conversation: Conversation, ownerAgentId: string, changes: Partial<WorkItem> = {}): WorkItem {
  return { id, schemaVersion: 2, conversationId: conversation.id, sourceMessageId: `scope-source-${conversation.id}`, key: id, scope: '明确预置的历史工作状态，仅验收读取', deliverable: `预置工作 ${id}`, ownerAgentId, version: 1, status: 'ready', budgetId: 'scope-historical-budget', rootWorkId: id, dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: [], artifactIds: [], resultVersion: 0, requiresReview: false, createdAt: fixedTime, updatedAt: fixedTime, ...changes }
}
export async function prepareScopeHistory(runtime: Desktop, kind: 'relationships' | 'scale' | 'goals') {
  await runtime.start()
  const setup = await runtime.page.evaluate(async () => {
    const snapshot = await window.boai.request('snapshot', undefined)
    const group = await window.boai.request('createConversation', { kind: 'group', title: '工作视图预置历史', agentIds: ['researcher', 'writer'] })
    const direct = await window.boai.request('createConversation', { kind: 'direct', title: '工作视图预置私聊', agentIds: ['researcher'] })
    return { group, direct, dataPath: snapshot.dataPath, agents: snapshot.agents.filter(agent => ['researcher', 'writer'].includes(agent.id)).map(agent => ({ id: agent.id, name: agent.name })) }
  })
  const works = kind === 'relationships' ? [
    historicalWork('scope-root', setup.group, 'researcher', { status: 'waiting', deliverable: '预置甲根：等待独立结果', dependsOnWorkIds: ['scope-independent'], requiredResults: [{ workId: 'scope-independent', resultVersion: 1 }], nextStep: '等待另一独立根，不取得其父子归属' }),
    historicalWork('scope-child', setup.group, 'writer', { status: 'running', deliverable: '预置乙子：执行自身子工作', parentWorkId: 'scope-root', rootWorkId: 'scope-root' }),
    historicalWork('scope-independent', setup.group, 'researcher', { status: 'delivered', deliverable: '预置独立根：历史交付事实', resultVersion: 1, outcome: { disposition: 'delivered', summary: '此为预置历史状态，未在本场景执行工具' } }),
  ] : kind === 'goals' ? (['ready', 'running', 'waiting', 'blocked', 'delivered', 'failed', 'cancelled', 'interrupted'] as const).map(status => historicalWork(`scope-goal-${status}`, setup.group, 'researcher', { status, deliverable: '全部文件已写完并正式发布', ...(status === 'delivered' ? { resultVersion: 1, outcome: { disposition: 'delivered', summary: '明确预置的旧交付记录，无可检查文件，不宣称本场执行成功。' } } : {}) })) : Array.from({ length: 375 }, (_, index) => {
    const group = Math.floor(index / 75), status: WorkItem['status'] = ['ready', 'running', 'waiting', 'delivered', 'failed'][group] as WorkItem['status']
    const conversation = index % 2 ? setup.direct : setup.group
    return historicalWork(`scope-scale-${String(index).padStart(4, '0')}`, conversation, index % 3 ? 'researcher' : 'writer', { status, deliverable: `预置规模 ${group} 组 ${String(index % 75).padStart(3, '0')}`, ...(status === 'delivered' ? { outcome: { disposition: 'delivered', summary: '预置历史交付，不宣称本场景真实执行成功' }, resultVersion: 1 } : {}) })
  })
  // Seed after startup: reopening would correctly interrupt pending historical work, changing the intended read-only fixture.
  const store = new ProductStore(join(setup.dataPath, 'boai.sqlite')); await store.init()
  try { await store.write([record('messages', source(`scope-source-${setup.group.id}`, setup.group.id)), record('messages', source(`scope-source-${setup.direct.id}`, setup.direct.id)), ...works.map(work => record('workItems', work))]) }
  finally { await store.close() }
  await runtime.app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send('boai:event', { type: 'changed' }) })
  await runtime.reviewData('明确SQLite预置：仅证明历史读取，不证明运行成功', { kind, fixedTime, count: works.length, perGroup: kind === 'scale' ? 75 : undefined, works })
  return { ...setup, works }
}

export interface ScopeQueryObservation { query: WorkViewQuery; elapsedMs: number; ids: string[]; total: number; roots: number; children: number; hasNext: boolean; mainHeapBytes: number }
type QueryGlobals = typeof globalThis & { __scopeQueries: ScopeQueryObservation[] }
export async function observeScopeQueries(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers, original = handlers.get('boai:request')!
    const observations: ScopeQueryObservation[] = []; Object.assign(globalThis, { __scopeQueries: observations })
    ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', async (event, payload) => {
      const started = performance.now(), result = await original(event, payload)
      if (payload.method === 'queryWorkViews') {
        const page = result as WorkViewPage
        observations.push({ query: structuredClone(payload.input), elapsedMs: performance.now() - started, ids: page.items.map(item => item.work.id), total: page.total, roots: page.rootTotal, children: page.childTotal, hasNext: Boolean(page.nextCursor), mainHeapBytes: process.memoryUsage().heapUsed })
      }
      return result
    })
  })
  return () => runtime.app.evaluate(() => structuredClone((globalThis as QueryGlobals).__scopeQueries))
}
export async function scopeMemory(runtime: Desktop) {
  const processes = await runtime.app.evaluate(({ app }) => app.getAppMetrics().map(metric => ({ pid: metric.pid, type: metric.type, name: metric.name, memory: metric.memory })))
  const renderer = await runtime.page.evaluate(() => {
    const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number; jsHeapSizeLimit: number } }).memory
    return { workCardsInDOM: document.querySelectorAll('[data-work-id]').length, jsHeap: memory ? { usedBytes: memory.usedJSHeapSize, allocatedBytes: memory.totalJSHeapSize, limitBytes: memory.jsHeapSizeLimit } : null }
  })
  return { observedAt: new Date().toISOString(), electronMemoryUnits: 'KiB, as returned by Electron getAppMetrics', processes, renderer }
}

export async function prepareActualWorkSources(runtime: Desktop) {
  const initial = await prepareArtifactsDesktop(runtime), errors: string[] = []
  const text = (value: unknown): string => typeof value === 'string' ? value : JSON.stringify(value)
  const endpoint = await teamEndpoint((body, response, index) => {
    try {
      const messages = body.messages as { role: string; content: unknown; tool_calls?: { function: { name: string } }[] }[], system = messages.filter(message => message.role === 'system').map(message => text(message.content)).join('\n')
      if (system.includes('Private group request interpretation')) { sendTeamOutput(response, { mode: 'independent' }); return }
      if (system.includes('Private participation decision')) {
        const data = JSON.parse(text(messages.at(-1)!.content)).data
        sendTeamOutput(response, data.participation?.hasRespondedInTurn || data.currentTurn?.ownCompletedMessageIds?.length ? { action: 'pass' } : { action: 'reply', responseKind: 'task', work: { key: `scope-explicit-${data.originalUserRequestId}-${data.currentEmployeeId}`, scope: '用户明确要求各员工分别交付本人独立报告', deliverable: `员工${data.currentEmployeeId}的独立报告` } }); return
      }
      if (system.includes('Private memory maintenance')) { sendTeamOutput(response, { candidates: [] }); return }
      if (system.includes('Read the actual new conversation facts. Publish a relevant, updated report')) { sendTeamOutput(response, { action: 'publish', text: JSON.parse(text(messages.at(-1)!.content)).data.draft.text }); return }
      const tools = body.tools as { function: { name: string; description?: string } }[] | undefined
      const runId = tools?.find(tool => tool.function.name === 'write_file')?.function.description?.match(/self:\/runs\/([a-zA-Z0-9_-]+)\//)?.[1]
      if (!runId) throw new Error('全来源任务没有获得当前Run的真实文件工具')
      const called = messages.flatMap(message => message.tool_calls ?? []).map(call => call.function.name), path = `self:/runs/${runId}/scope-report.md`
      let name: string, input: unknown
      if (!called.includes('write_file')) { name = 'write_file'; input = { path, content: '# 实际全来源报告\n本文件由当前Run真实write_file工具写入并发布。\n' } }
      else if (!called.includes('publish_artifact')) { name = 'publish_artifact'; input = { path, name: '实际全来源报告.md' } }
      else {
        const artifactId = messages.filter(message => message.role === 'tool').map(message => { try { return JSON.parse(text(message.content))?.artifact?.id as string | undefined } catch { return undefined } }).find(Boolean)
        if (!artifactId) throw new Error('全来源真实发布未返回固定成果ID')
        if (called.includes('report_work')) { sendTeamOutput(response, '本人独立报告已经实际写入、发布并关联工作，可检查原件。'); return }
        name = 'report_work'; input = { disposition: 'delivered', summary: '本人独立报告实际发布', evidence: [{ kind: 'artifact', reference: artifactId }] }
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `scope-${index}`, object: 'chat.completion.chunk', model: 'work-scope-fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      emit({ role: 'assistant' }); emit({ tool_calls: [{ index: 0, id: `scope-tool-${index}`, type: 'function', function: { name, arguments: JSON.stringify(input) } }] }); emit({}, 'tool_calls')
      response.write(`data: ${JSON.stringify({ id: `scope-${index}`, object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } })}\n\n`); response.end('data: [DONE]\n\n')
    } catch (error) { errors.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end(String(error)) }
  })
  runtime.trackServer(endpoint.server)
  const fixture = { ...initial, endpoint, errors }
  await runtime.page.evaluate(async url => {
    const connection = await window.boai.request('saveConnection', { name: '全来源独立报告离线协议', provider: 'openai-compatible', baseUrl: url, defaultModel: 'work-scope-fixture' }), snapshot = await window.boai.request('snapshot', undefined)
    for (const id of ['researcher', 'writer', 'bobo']) {
      const agent = snapshot.agents.find(agent => agent.id === id)!, { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
      await window.boai.request('saveAgent', { ...input, connectionId: connection.id, modelId: 'work-scope-fixture', allowCommands: false, expectedConfigVersion: configVersion })
    }
  }, endpoint.url)
  const setup = await runtime.page.evaluate(async ({ directId, groupId }) => {
    await window.boai.request('sendMessage', { conversationId: directId, requestId: 'scope-actual-private', content: '请实际执行文件任务，发布本私聊的可检查报告。', mentionIds: ['researcher'] })
    await window.boai.request('sendMessage', { conversationId: groupId, requestId: 'scope-actual-group', content: '请实际执行文件任务，发布本群的可检查报告。', mentionIds: ['researcher'] })
    const core = await window.boai.request('startCoreConversation', { requestId: 'scope-actual-core', content: '请你实际执行文件任务，发布可检查报告；此次无需创建或组织团队。' })
    const automated = await window.boai.request('createConversation', { kind: 'group', title: '多员工定时来源', agentIds: ['researcher', 'writer'] })
    const plan = await window.boai.request('saveAutomation', { name: '工作视图全来源计划', prompt: '两位员工分别执行文件任务，发布本人可检查报告。', conversationId: automated.id, frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false })
    const occurrence = await window.boai.request('runAutomation', { id: plan.id, requestId: 'scope-actual-occurrence' })
    return { core, automated, plan, occurrence }
  }, { directId: fixture.other.id, groupId: fixture.group.id })
  return { fixture, ...setup }
}
export async function createActualNoWorkSources(runtime: Desktop) {
  // A real provider failure before task classification leaves a failed Run/Turn, without minting Work.
  const failedEndpoint = await teamEndpoint((_body, response) => { response.writeHead(400, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: '明确离线供应商失败：未完成任务判断', type: 'invalid_request_error' } })) })
  runtime.trackServer(failedEndpoint.server)
  const failed = await runtime.page.evaluate(async url => {
    const connection = await window.boai.request('saveConnection', { name: '全来源失败供应商离线协议', provider: 'openai-compatible', baseUrl: url, defaultModel: 'scope-failure' })
    const agent = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'reviewer')!, { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
    await window.boai.request('saveAgent', { ...input, connectionId: connection.id, modelId: 'scope-failure', allowCommands: false, expectedConfigVersion: configVersion })
    const conversation = await window.boai.request('createConversation', { kind: 'group', title: '实际失败无工作历史', agentIds: ['reviewer'] })
    const plan = await window.boai.request('saveAutomation', { name: '没有工作项的失败触发', prompt: '本次供应商任务判断失败须保留触发历史，不制造Work。', conversationId: conversation.id, frequency: 'daily', time: '10:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false })
    const occurrence = await window.boai.request('runAutomation', { id: plan.id, requestId: 'scope-failed-no-work' })
    return { plan, occurrence }
  }, failedEndpoint.url)
  const external = await runtime.page.evaluate(async ({ executable, fixture }) => {
    const profile = await window.boai.request('saveLaunchProfile', { name: '仅ACP过程无Work', executable, args: [fixture], useExistingLogin: false, hostAccessAcknowledged: true })
    await window.boai.request('testLaunchProfile', { id: profile.id })
    const employee = await window.boai.request('saveAgent', { name: '独立ACP来源员工', role: '仅核对真实外部过程', instructions: '仅执行明确外部任务。', color: '#79719a', executionBackend: { kind: 'acp-local', profileId: profile.id }, connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true })
    const conversation = await window.boai.request('createConversation', { kind: 'direct', title: '仅ACP过程没有业务工作', agentIds: [employee.id] })
    const message = await window.boai.request('sendExternalTask', { conversationId: conversation.id, requestId: 'scope-actual-acp', content: '实际外部过程用于工作视图来源边界，不创建业务Work。' })
    return { conversation, message }
  }, { executable: process.execPath, fixture: resolve('tests/fixtures/acp-agent.mjs') })
  return { failed, external }
}
export async function scopeRecords(dataPath: string) {
  const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite'))
  try { return { works: await store.load<WorkItem>('workItems'), runs: await store.load<AgentRun>('runs'), occurrences: await store.load('automationOccurrences'), calls: await store.load('budgetModelCalls'), profileCalls: await store.load('profileModelCalls'), budgets: await store.load('workBudgets'), artifacts: await store.load('artifacts') } }
  finally { await store.close() }
}
export async function seedUnknownWorkHistory(runtime: Desktop, dataPath: string, conversation: Conversation) {
  const work = historicalWork('scope-legacy-unknown', conversation, 'researcher', { status: 'failed', sourceMessageId: 'legacy-source-not-retained', deliverable: '明确预置旧工作：原来源未知', requiresReview: true })
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init()
  try { await store.write([record('workItems', work)]) } finally { await store.close() }
  await runtime.app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.webContents.send('boai:event', { type: 'changed' }) })
  await runtime.reviewData('明确预置旧Work缺原来源：只证明未知分类，不证明执行', work)
  return work
}
