/*
 * [INPUT]: BC 业务中文场景、原生产 core/组织/群调度、真实 SQLite 与独立员工成果。
 * [OUTPUT]: 讨论零副作用、已有人/缺员/仅员工、原页入口、恢复核对、同预算/实际依赖交付和清理生命周期；重启不重放。
 * [POS]: 第12组 Electron 验收步骤；只控制本地模型协议与回执传输，不替代组织/任务/文件事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type { ConversationDetail } from '../../../packages/shared/src/domain'
import type { BoboCollaborationReceipt } from '../../../packages/shared/src/domain/bobo-collaboration'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { boboCollaborationRecords, COLLABORATION_RESEARCH_MARKER, COLLABORATION_REPORT_MARKER, collaborationPrompts, prepareBoboCollaborationDesktop } from '../support/bobo-collaboration'

interface State { fixture?: Awaited<ReturnType<typeof prepareBoboCollaborationDesktop>>; receipt?: BoboCollaborationReceipt; detail?: ConversationDetail; calls?: number; unavailable?: { release(): Promise<void> } }
export const test = base.extend<{ boboCollaboration: State }>({ boboCollaboration: async ({ runtime: _runtime }, use, info) => {
  const state: State = {}
  try { await use(state) } finally {
    if (state.fixture) {
      const path = info.outputPath('bobo-evidence.json')
      await writeFile(path, JSON.stringify({ fixtureErrors: state.fixture.errors, records: boboCollaborationRecords(state.fixture.state.dataPath), modelRequests: state.fixture.endpoint.requests.map(request => ({ tools: request.tools, messages: request.messages })) }, null, 2))
      await info.attach('bobo组织与独立员工真实回执', { contentType: 'application/json', path })
    }
  }
} })
const { Given, When, Then } = createBdd(test)
const fixtureOf = (state: State) => state.fixture!
async function start(runtime: Desktop, state: State, content: string) {
  await runtime.page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
  await runtime.page.getByRole('button', { name: '与 bobo 新建会话', exact: true }).click()
  const composer = runtime.page.getByRole('textbox', { name: '消息内容', exact: true })
  await composer.fill(content); await composer.press('Enter')
  await expect.poll(async () => (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.filter(conversation => conversation.purpose === 'core').length).toBe(1)
  fixtureOf(state).state.coreId = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.find(conversation => conversation.purpose === 'core')!.id
}
async function originalSettled(runtime: Desktop, state: State) {
  const id = fixtureOf(state).state.coreId
  await expect.poll(async () => { const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id); return detail.runs.length > 0 && detail.runs.every(run => ['completed','failed','cancelled','interrupted'].includes(run.status)) && detail.turns!.every(turn => ['completed','failed','cancelled','interrupted'].includes(turn.status)) }, { timeout: 30000 }).toBe(true)
  state.detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
  return state.detail
}
async function published(runtime: Desktop, state: State) {
  const id = fixtureOf(state).state.coreId
  await expect.poll(async () => (await runtime.page.evaluate(conversationId => window.boai.request('listBoboCollaborationOperations', { conversationId }), id)).filter(receipt => receipt.status === 'committed').length, { timeout: 30000 }).toBe(1)
  state.receipt = (await runtime.page.evaluate(conversationId => window.boai.request('listBoboCollaborationOperations', { conversationId }), id))[0]
  return state.receipt!
}
async function openOriginal(runtime: Desktop, state: State) {
  const id = fixtureOf(state).state.coreId
  const conversation = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.find(conversation => conversation.id === id)!
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('group', { name: 'bobo 的会话', exact: true }).getByRole('button', { name: conversation.title, exact: true }).click()
}
const resultsRegion = (runtime: Desktop) => runtime.page.getByRole('region', { name: '群协作组织结果', exact: true })

Given('bobo 和已有员工已配置组织协作验证模型', async ({ runtime, boboCollaboration: state }) => { state.fixture = await prepareBoboCollaborationDesktop(runtime) })
Given('bobo 和研究员已配置缺员混合验证模型', async ({ runtime, boboCollaboration: state }) => { state.fixture = await prepareBoboCollaborationDesktop(runtime, { missingWriter: true }) })
Given('bobo 的组织模型结果尚未返回', async ({ runtime, boboCollaboration: state }) => {
  state.fixture = await prepareBoboCollaborationDesktop(runtime, { holdOrganization: true })
  await start(runtime, state, collaborationPrompts.organize_only)
  await expect.poll(() => fixtureOf(state).state.organizationHeld).toBe(true)
})
Given('bobo 已用已有员工发布独立协作群', async ({ runtime, boboCollaboration: state }) => {
  state.fixture = await prepareBoboCollaborationDesktop(runtime)
  await start(runtime, state, collaborationPrompts.organize_only); await published(runtime, state); await originalSettled(runtime, state)
})
Given('bobo 已用已有员工发布独立群并受理真实群工作', async ({ runtime, boboCollaboration: state }) => {
  state.fixture = await prepareBoboCollaborationDesktop(runtime)
  await start(runtime, state, collaborationPrompts.organize_and_execute); await published(runtime, state); await originalSettled(runtime, state)
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.receipt!.groupConversationId!)).workItems!.find(work => work.id === state.receipt!.groupRootWorkId)?.status, { timeout: 40000 }).toBe('delivered')
})
When('用户只与 bobo 讨论写作需求', async ({ runtime, boboCollaboration: state }) => { await start(runtime, state, collaborationPrompts.discussion); await originalSettled(runtime, state) })
Then('原讨论会话保留且没有组织对象或实际工作', async ({ runtime, boboCollaboration: state }) => {
  const fixture = fixtureOf(state), records = boboCollaborationRecords(fixture.state.dataPath), snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents).toHaveLength(fixture.state.before!.agents.length)
  expect(snapshot.conversations.filter(conversation => conversation.kind === 'group')).toEqual([])
  expect(records.operations).toEqual([]); expect(records.works).toEqual([]); expect(records.budgets).toEqual([])
  expect(state.detail!.conversation).toMatchObject({ id: fixture.state.coreId, purpose: 'core', kind: 'direct', agentIds: ['bobo'] })
  expect(state.detail!.messages.some(message => message.senderId === 'bobo' && message.status === 'completed')).toBe(true)
  expect(fixture.errors).toEqual([]); await expect(resultsRegion(runtime)).toHaveCount(0)
})
When('用户要求只用已有研究员和写作员组织群', async ({ runtime, boboCollaboration: state }) => { await start(runtime, state, collaborationPrompts.organize_only); await published(runtime, state); await originalSettled(runtime, state) })
Then('新群复用两名员工并以 bobo 身份公开目标而不开工', async ({ runtime, boboCollaboration: state }) => {
  const fixture = fixtureOf(state), receipt = state.receipt!, snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined)), group = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), receipt.groupConversationId!)
  expect(snapshot.agents).toHaveLength(fixture.state.before!.agents.length)
  expect(receipt).toMatchObject({ mode: 'organize_only', status: 'committed', sourceConversationId: fixture.state.coreId, agents: [] })
  expect(receipt.existingMembers.map(member => member.agentId).sort()).toEqual(['researcher','writer'])
  expect(group.conversation.agentIds.sort()).toEqual(['bobo','researcher','writer'])
  expect(group.messages).toHaveLength(1); expect(group.messages[0]).toMatchObject({ senderType: 'agent', senderId: 'bobo', status: 'completed', id: receipt.announcementMessageId })
  expect(group.messages[0].content).toContain('BC_BOBO_ANNOUNCEMENT'); expect(group.workItems).toEqual([]); expect(group.turns).toEqual([])
  expect(receipt.groupRootWorkId ?? undefined).toBeUndefined(); expect(boboCollaborationRecords(fixture.state.dataPath).starts).toEqual([])
  for (const id of ['researcher','writer']) { const original = fixture.state.originalEmployees.get(id)!; expect(snapshot.agents.find(agent => agent.id === id)).toEqual(original.config); expect(await readFile(`${fixture.state.dataPath}/agents/${id}/workspace/AGENTS.md`, 'utf8')).toBe(original.text) }
  expect(fixture.errors).toEqual([])
})
Then('原 bobo 会话保留且结果不会自动抢导航', async ({ runtime, boboCollaboration: state }) => {
  const fixture = fixtureOf(state), conversation = state.detail!.conversation
  await expect(runtime.page.locator('.chat-header')).toContainText(conversation.title)
  await expect(resultsRegion(runtime).getByRole('button', { name: '进入群聊', exact: true })).toBeVisible()
  await expect(resultsRegion(runtime).getByText('已有员工', { exact: true })).toHaveCount(2)
  await runtime.page.screenshot({ path: 'test-results/bobo-core-collaboration-results.png', animations: 'disabled' })
  await resultsRegion(runtime).getByRole('button', { name: '进入群聊', exact: true }).click()
  await expect(runtime.page.locator('.chat-header')).toContainText('bobo 独立报告协作群')
  await runtime.page.screenshot({ path: 'test-results/bobo-independent-group.png', animations: 'disabled' })
  const original = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), fixture.state.coreId)
  expect(original.conversation).toEqual(conversation); expect(original.messages).toEqual(state.detail!.messages)
  await openOriginal(runtime, state)
  await expect(resultsRegion(runtime).getByRole('button', { name: '查看 已有研究员 的员工资料', exact: true })).toBeVisible()
})
When('用户要求组织成员并完成有依赖的报告任务', async ({ runtime, boboCollaboration: state }) => { await start(runtime, state, collaborationPrompts.organize_and_execute); await published(runtime, state); await originalSettled(runtime, state) })
Then('仅补齐写作员并在独立群实际交付两个员工的成果', async ({ runtime, boboCollaboration: state }) => {
  const fixture = fixtureOf(state), receipt = state.receipt!
  await expect.poll(async () => { const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), receipt.groupConversationId!); return detail.workItems?.find(work => work.id === receipt.groupRootWorkId)?.status }, { timeout: 40000 }).toBe('delivered')
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined)), detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), receipt.groupConversationId!)
  expect(snapshot.agents).toHaveLength(fixture.state.before!.agents.length + 1)
  expect(receipt.agents).toHaveLength(1); expect(receipt.agents[0].name).toBe('新建写作员')
  expect(detail.conversation.agentIds.sort()).toEqual(['bobo','researcher',receipt.agents[0].id].sort())
  expect(detail.artifacts).toHaveLength(2); expect(new Set(detail.artifacts.map(artifact => artifact.ownerAgentId))).toEqual(new Set(['researcher', receipt.agents[0].id]))
  for (const artifact of detail.artifacts) { const text = await readFile(artifact.path, 'utf8'); expect(text).toContain(artifact.ownerAgentId === 'researcher' ? COLLABORATION_RESEARCH_MARKER : COLLABORATION_REPORT_MARKER); expect(createHash('sha256').update(text).digest('hex')).toBe(artifact.contentHash) }
  const research = detail.workItems!.find(work => work.key === 'research-facts')!, writing = detail.workItems!.find(work => work.key === 'draft-report')!
  expect(research.status).toBe('delivered'); expect(writing.status).toBe('delivered'); expect(writing.dependsOnWorkIds).toEqual([research.id]); expect(writing.observedResults).toContainEqual({ workId: research.id, resultVersion: research.resultVersion })
  expect(research.artifactIds).toEqual(detail.artifacts.filter(artifact => artifact.ownerAgentId === 'researcher').map(artifact => artifact.id))
  expect(writing.artifactIds).toEqual(detail.artifacts.filter(artifact => artifact.ownerAgentId === receipt.agents[0].id).map(artifact => artifact.id))
  const root = detail.workItems!.find(work => work.id === receipt.groupRootWorkId)!
  for (const artifact of detail.artifacts) { if (!artifact.id) throw new Error('员工成果必须是已登记的明确 Artifact 身份'); expect(root.outcome!.summary).toContain(artifact.id); expect(detail.messages.some(message => root.resultMessageIds.includes(message.id) && message.content.includes(artifact.id!))).toBe(true) }
  expect(detail.messages.filter(message => message.senderId === 'researcher' && message.status === 'completed')).not.toHaveLength(0)
  expect(detail.messages.filter(message => message.senderId === receipt.agents[0].id && message.status === 'completed')).not.toHaveLength(0)
  expect(snapshot.agents.find(agent => agent.id === 'researcher')).toEqual(fixture.state.originalEmployees.get('researcher')!.config)
  expect(await readFile(`${fixture.state.dataPath}/agents/researcher/workspace/AGENTS.md`, 'utf8')).toBe(fixture.state.originalEmployees.get('researcher')!.text)
  const runs = detail.runs.filter(run => run.phase === 'execution'), writerRun = runs.find(run => run.agentId === receipt.agents[0].id)!
  expect(writerRun.toolEvents.some(tool => tool.name === 'read_file' && tool.status === 'completed')).toBe(true)
  expect(fixture.errors).toEqual([])
})
Then('组织与群工作使用同一累计预算和明确来源', async ({ runtime, boboCollaboration: state }) => {
  const fixture = fixtureOf(state), records = boboCollaborationRecords(fixture.state.dataPath), receipt = state.receipt!, group = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), receipt.groupConversationId!)
  const organization = records.works.find(work => work.organization)!, root = records.works.find(work => work.id === receipt.groupRootWorkId)!, budget = records.budgets.find(budget => budget.id === root.budgetId)!
  expect(root.budgetId).toBe(organization.budgetId); expect(root.parentWorkId).toBeUndefined(); expect(root.rootWorkId).toBe(root.id); expect(root.conversationId).toBe(receipt.groupConversationId)
  expect(records.works.every(work => work.budgetId === budget.id)).toBe(true); expect(records.budgets).toHaveLength(1)
  expect(budget.modelCalls).toBeLessThanOrEqual(budget.maxModelCalls); expect(budget.modelCalls).toBeGreaterThan(8); expect(budget.usageIncomplete).toBe(false)
  expect(records.starts).toHaveLength(1); expect(records.starts[0]).toMatchObject({ groupRootWorkId: root.id, budgetId: budget.id, status: 'consumed', announcementMessageId: receipt.announcementMessageId })
  expect(group.turns!.filter(turn => turn.startIntentId === receipt.startIntentId)).toHaveLength(1)
  expect(group.messages.every(message => message.senderType !== 'user')).toBe(true)
  expect(records.modelCalls.every(call => call.budgetId === budget.id)).toBe(true)
})
When('用户要求只创建一位编辑员工而不拉群', async ({ runtime, boboCollaboration: state }) => { await start(runtime, state, collaborationPrompts.employee_creation); await published(runtime, state); await originalSettled(runtime, state) })
Then('原讨论页提供实际员工入口且没有新增群或群工作', async ({ runtime, boboCollaboration: state }) => {
  const fixture = fixtureOf(state), receipt = state.receipt!, snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined)), records = boboCollaborationRecords(fixture.state.dataPath)
  expect(receipt).toMatchObject({ mode: 'employee_creation', existingMembers: [] }); expect(receipt.agents).toHaveLength(1); expect(receipt.groupConversationId ?? undefined).toBeUndefined(); expect(receipt.announcementMessageId ?? undefined).toBeUndefined()
  expect(snapshot.agents).toHaveLength(fixture.state.before!.agents.length + 1); expect(snapshot.conversations.filter(conversation => conversation.kind === 'group')).toEqual([])
  expect(records.starts).toEqual([]); expect(records.works).toHaveLength(1); expect(records.works[0].conversationId).toBe(fixture.state.coreId)
  await expect(resultsRegion(runtime).getByText('员工已创建', { exact: true })).toBeVisible(); await expect(resultsRegion(runtime).getByRole('button', { name: '进入群聊', exact: true })).toHaveCount(0)
  await resultsRegion(runtime).getByRole('button', { name: '查看 新建编辑 的员工资料', exact: true }).click()
  await expect(runtime.page.getByRole('textbox', { name: '员工名称', exact: true })).toHaveValue('新建编辑')
  expect(fixture.errors).toEqual([])
})
When('用户重启桌面并回到原 bobo 讨论', async ({ runtime, boboCollaboration: state }) => { state.calls = fixtureOf(state).endpoint.requests.length; await runtime.restart(); await openOriginal(runtime, state) })
Then('原群和员工入口仍绑定原身份且没有模型或工具重放', async ({ runtime, boboCollaboration: state }) => {
  const fixture = fixtureOf(state), receipt = await runtime.page.evaluate(operationId => window.boai.request('getBoboCollaborationOperation', { operationId }), state.receipt!.id)
  // IPC live replies represent absent optionals as null; SQLite projections omit
  // them on restart. Identity, versions and every committed fact must still match.
  const committedFacts = (value: BoboCollaborationReceipt) => JSON.parse(JSON.stringify(value, (_key, entry) => entry === null ? undefined : entry))
  expect(committedFacts(receipt)).toEqual(committedFacts(state.receipt!)); expect(fixture.endpoint.requests).toHaveLength(state.calls!)
  expect(boboCollaborationRecords(fixture.state.dataPath).operations).toHaveLength(1)
  await expect(resultsRegion(runtime).getByRole('button', { name: '进入群聊', exact: true })).toBeVisible()
  expect(fixture.errors).toEqual([])
})
When('原组织结果查询暂时失联', async ({ runtime, boboCollaboration: state }) => {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as any)._invokeHandlers as Map<string, (...args:any[])=>Promise<unknown>>, original = handlers.get('boai:request')!
    Object.assign(globalThis, { __boboReceiptUnavailable: true }); ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => { const value = await original(event, payload); if ((globalThis as any).__boboReceiptUnavailable && payload.method === 'listBoboCollaborationOperations') throw new Error('验收：原组织回执暂不可读'); return value })
  })
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click(); await openOriginal(runtime, state)
})
Then('原讨论页显示核对失败并保留已提交对象', async ({ runtime, boboCollaboration: state }) => {
  await expect(resultsRegion(runtime).getByRole('alert')).toContainText('组织结果暂不可核对')
  expect(boboCollaborationRecords(fixtureOf(state).state.dataPath).operations.filter(operation => operation.status === 'committed')).toHaveLength(1)
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.some(conversation => conversation.id === state.receipt!.groupConversationId)).toBe(true)
})
When('原组织结果恢复可读', async ({ runtime }) => { await runtime.app.evaluate(() => { (globalThis as any).__boboReceiptUnavailable = false }); await resultsRegion(runtime).getByRole('button', { name: '核对组织结果', exact: true }).click() })
Then('结果核对原操作且群和员工数量保持不变', async ({ runtime, boboCollaboration: state }) => {
  const fixture = fixtureOf(state); await expect(resultsRegion(runtime).getByRole('alert')).toHaveCount(0)
  await expect(resultsRegion(runtime).locator(`[data-collaboration-operation="${state.receipt!.id}"]`)).toHaveCount(1)
  expect(boboCollaborationRecords(fixture.state.dataPath).operations).toHaveLength(1)
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined)); expect(snapshot.agents).toHaveLength(fixture.state.before!.agents.length); expect(snapshot.conversations.filter(conversation => conversation.kind === 'group')).toHaveLength(1)
})
When('用户清理原 bobo 讨论会话', async ({ runtime, boboCollaboration: state }) => { await runtime.page.evaluate(id => window.boai.request('clearConversationHistory', { id, hide: true }), fixtureOf(state).state.coreId) })
Then('已发布群与成员仍存在且原协作预算仍可核对', async ({ runtime, boboCollaboration: state }) => {
  const fixture = fixtureOf(state), snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined)), records = boboCollaborationRecords(fixture.state.dataPath)
  expect(snapshot.conversations.some(conversation => conversation.id === state.receipt!.groupConversationId)).toBe(true)
  expect(snapshot.agents).toHaveLength(fixture.state.before!.agents.length)
  expect(records.budgets).toHaveLength(1); expect(records.operations[0].sourceCleared).toBe(true)
  const group = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.receipt!.groupConversationId!)
  expect(group.messages.some(message => message.id === state.receipt!.announcementMessageId && message.senderId === 'bobo')).toBe(true)
  expect(group.workItems!.find(work => work.id === state.receipt!.groupRootWorkId)?.status).toBe('delivered')
})
When('用户解散这个协作群', async ({ runtime, boboCollaboration: state }) => { await runtime.page.evaluate(id => window.boai.request('deleteConversation', { id }), state.receipt!.groupConversationId!) })
Then('独立员工和其私聊工作区仍然存在', async ({ runtime, boboCollaboration: state }) => {
  const fixture = fixtureOf(state), snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.conversations.some(conversation => conversation.id === state.receipt!.groupConversationId)).toBe(false)
  expect(snapshot.agents).toHaveLength(fixture.state.before!.agents.length)
  expect(snapshot.conversations.some(conversation => conversation.id === fixture.state.privateId)).toBe(true)
  expect(await readFile(fixture.privateSentinel, 'utf8')).toContain('BC_PRIVATE_SESSION_')
  expect(fixture.errors).toEqual([])
})
When('用户停止组织并释放迟到模型结果', async ({ runtime, boboCollaboration: state }) => {
  const fixture = fixtureOf(state)
  await runtime.page.evaluate(id => window.boai.request('cancelRun', { conversationId: id }), fixture.state.coreId)
  fixture.releaseOrganization(); await originalSettled(runtime, state)
})
Then('本次组织没有发布员工群或目标消息并且重启不重放', async ({ runtime, boboCollaboration: state }) => {
  const fixture = fixtureOf(state), snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined)), records = boboCollaborationRecords(fixture.state.dataPath)
  expect(snapshot.agents).toHaveLength(fixture.state.before!.agents.length); expect(snapshot.conversations.filter(conversation => conversation.kind === 'group')).toEqual([])
  expect(records.operations.filter(operation => operation.status === 'committed')).toEqual([]); expect(records.starts).toEqual([])
  const calls = fixture.endpoint.requests.length; await runtime.restart(); expect(fixture.endpoint.requests).toHaveLength(calls)
  expect(fixture.errors).toEqual([])
})
