/*
 * [OUTPUT]: 真实核心与新员工的私有decision按各自当前来源/模型核对off，原完整交付、账本及重启断言保持。
 * [OUTPUT]: 核心留证保存原turn/event/delivery/decision，判断sourceDecisionRunId沿真实投递定位触发事件；原公告triggerMessageId不冒充后续触发消息，重启核对已提交派发记录。
 * [OUTPUT]: 保留原场景错误及退出前状态/画面；正常关闭并核对本场实际进程退出后，再读取最终SQLite与严格导出固定hash原件。
 * [OUTPUT]: 成功或失败均在清理前核对并导出已发布文件原件/hash；错误单独留证，不用状态记录冒充原件。
 * [OUTPUT]: 私有汇报实际配置保存为profileModelCalls；当前执行已完成依赖工具的汇报核对off，其他汇报默认，并跨重启核对原观测不新增调用。
 * [OUTPUT]: 真实重启区分源码系统钥匙串入口与应用包原入口，沿初次加密配置，不重读凭据或增加模型请求。
 * [OUTPUT]: 核心首发提交前经底部准确配置往返，保留正文且不提前创建核心会话；零业务调用核对后继续原完整组织交付和重启断言。
 * [INPUT]: 原Claude创建步骤、助手设置/团队弹窗、生产组织工具与SQLite账本。
 * [OUTPUT]: 原UI配置Claude核心，组织独立新员工并委派交付或按用户名称创建团队；继承明确程序/API、原预算/回执与重启零重放；真实与离线分别留证。
 * [POS]: Claude核心产品BDD，不替代自动化或完整故障矩阵。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from './claude-employee.steps'
import { systemKeychainLaunch } from '../support/saved-model'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import { verifyLocalAgentNavigation } from '../support/local-agent-navigation'
import { archiveNativeFinalReview } from '../support/native-final-review'
import type { AgentDelivery, AgentRun, BudgetModelCall, Conversation, ConversationEvent, DecisionRecord, DiscussionTurn, WorkBudget, WorkItem } from '../../../src/shared/domain'
import type { BoboCollaborationOperation } from '../../../src/shared/domain/bobo-collaboration'
import type { TeamCreationOperation } from '../../../src/shared/domain/team-creation'
import type { ProfileModelCall } from '../../../src/runtime/modules/profile/profile-activity'

const { Then } = createBdd(test)
Then('用户通过Claude核心助手完成{string}并在重启后核对原结果', async ({ runtime, claudeEmployee: state }, scenario: string) => {
  test.setTimeout(720000)
  const namedTeam = scenario === '具名团队', page = runtime.page
  expect(['组织并执行', '具名团队']).toContain(scenario)
  const before = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const existing = before.agents.find(a => a.id === state.employeeId)!
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
  await page.getByRole('button', { name: 'bobo 的更多操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '助手设置', exact: true }).click()
  await page.getByRole('combobox', { name: '执行后端', exact: true }).click()
  await expect(page.getByRole('option', { name: '外部 ACP · 仅显式任务', exact: true })).toHaveCount(0)
  await page.getByRole('option', { name: '本机 Claude · 聊天与协作', exact: true }).click()
  await expect(page.getByRole('combobox', { name: '本机连接', exact: true })).toContainText('本机 Claude')
  await page.getByRole('combobox', { name: '模型连接', exact: true }).click()
  await page.getByRole('option', { name: state.connectionName!, exact: true }).click()
  await expect(page.getByRole('checkbox', { name: '允许申请运行命令', exact: true })).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('原助手设置选择Claude程序和明确API来源')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(a => a.id === 'bobo')?.executionBackend?.kind).toBe('claude-local')
  const configured = await page.evaluate(() => window.boai.request('snapshot', undefined)), core = configured.agents.find(a => a.id === 'bobo')!
  expect(core.connectionId).toBe(state.connectionId)
  expect(core.executionBackend).toEqual(existing.executionBackend)
  const request = namedTeam
    ? state.real ? '请只创建一名员工“Claude团队同事”，负责核对文件，保持独立身份，使用你当前的本机Claude运行方式与明确API模型来源。不做文件任务、不联网，不需要其他员工或长期记忆。' : 'CLAUDE_NAMED_TEAM empty-memory 创建一名核对员工。'
    : state.real ? `请新建一名独立员工“Claude新同事”，职责为文件核对，使用你当前的本机Claude和明确API模型来源。只把你和这名新员工加入“Claude组织群”，现在组织并执行：你用宿主委派工具让新员工创建并发布 child.md，正文“${state.token}”，随后用依赖工具等待；实际交付后，你核对该文件，再创建并发布 summary.md，包含同一核对码和子文件名。只需两个短文件；不联网、不执行命令、不提问。不要复用或更改已有员工，不把本场内容记为长期偏好。` : 'CLAUDE_BOBO_EXECUTE empty-memory 创建一名同事，组织群并实际分工交付。'
  await runtime.reviewData('Claude核心本场原始请求', { scenario, request, modelMode: state.real ? 'real-provider' : 'offline-protocol', humanReview: 'pending' })
  if (namedTeam) {
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
    await page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '新建', exact: true }).click()
    await page.getByRole('menuitem', { name: '创建团队', exact: true }).click()
    await page.getByRole('textbox', { name: '团队名称', exact: true }).fill('用户指定Claude团队')
    await page.getByRole('textbox', { name: '团队需求', exact: true }).fill(request)
    await runtime.reviewNativeCheckpoint('原两项团队表单保持用户指定名称')
    await page.getByRole('button', { name: '生成', exact: true }).click()
  } else {
    await page.getByRole('button', { name: 'bobo 的会话分组', exact: true }).hover()
    await page.getByRole('button', { name: '与 bobo 新建会话', exact: true }).click()
    await page.getByRole('textbox', { name: '消息内容', exact: true }).fill(request)
    await verifyLocalAgentNavigation(runtime, { employeeId: core.id, label: 'Claude核心空白页' })
    await page.getByRole('button', { name: '发送消息', exact: true }).click()
  }
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const records = async () => ({ agents: await store.load('agents'), conversations: await store.load('conversations'), messages: await store.load('messages'), runs: await store.load<AgentRun>('runs'), turns: await store.load<DiscussionTurn>('turns'), events: await store.load<ConversationEvent>('events'), deliveries: await store.load<AgentDelivery>('deliveries'), decisions: await store.load<DecisionRecord>('decisions'), works: await store.load<WorkItem>('workItems'), budgets: await store.load<WorkBudget>('workBudgets'), calls: await store.load<BudgetModelCall>('budgetModelCalls'), profileCalls: await store.load<ProfileModelCall>('profileModelCalls'), organizations: await store.load<BoboCollaborationOperation>('boboCollaborations'), teams: await store.load<TeamCreationOperation>('teamCreations'), sessions: await store.load('claudeSessions'), traces: await store.load('traceSpans'), artifacts: await store.load<{ id: string; name: string; path: string; contentHash: string }>('artifacts') })
  let scenarioFailure: unknown
  try {
    await expect.poll(async () => {
      const runs = await store.load<AgentRun>('runs'), works = await store.load<WorkItem>('workItems')
      if (runs.some(r => ['failed', 'cancelled', 'interrupted'].includes(r.status))) return true
      return works.length === (namedTeam ? 1 : 3) && works.every(w => w.status === 'delivered') && runs.length > 0 && runs.every(r => r.status === 'completed')
    }, { timeout: 420000, intervals: [500, 1000, 2500] }).toBe(true)
    const actual = await records()
    await runtime.reviewData('Claude核心原持久回执与账本', actual)
    expect(actual.runs.filter(r => r.status !== 'completed')).toEqual([])
    expect(actual.works).toHaveLength(namedTeam ? 1 : 3)
    expect(actual.works.every(w => w.status === 'delivered')).toBe(true)
    expect(actual.budgets).toHaveLength(1)
    const budget = actual.budgets[0]
    // Organization shares the original mixed-capable ledger; each native request keeps its own unit.
    expect(budget).toMatchObject({ callUnit: namedTeam ? 'external-turn' : 'mixed', accounting: 'model-calls-v1', unknownCalls: 0, usageIncomplete: false })
    expect(actual.works.every(w => w.budgetId === budget.id)).toBe(true)
    expect(actual.calls).toHaveLength(budget.modelCalls)
    expect(new Set(actual.calls.map(c => c.id)).size).toBe(actual.calls.length)
    expect(actual.calls.every(c => c.callUnit === 'external-turn' && !!c.settledAt && c.usageComplete)).toBe(true)
    if (state.real) for (const call of actual.profileCalls.filter(c => c.phase === 'report')) {
      const run = actual.runs.find(r => r.id === call.runId)!
      expect(run).toBeDefined()
      const source = configured.connections.find(c => c.id === core.connectionId)!
      const verified = ['https://api.deepseek.com', 'https://api.deepseek.com/v1', 'https://api.deepseek.com/anthropic'].includes(source.baseUrl.trim().replace(/\/+$/, '')) && (core.modelId || source.defaultModel).trim() === 'deepseek-v4-pro'
      expect(call.thinking).toBe(verified && run.toolEvents.some(t => t.name === 'wait_for_work' && t.status === 'completed') ? 'off' : undefined)
    }
    const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
    if (state.real) for (const call of actual.profileCalls.filter(c => c.phase === 'decision')) {
      const run = actual.runs.find(r => r.id === call.runId)!
      expect(run).toBeDefined()
      const employee = snapshot.agents.find(a => a.id === run.agentId)!
      const source = snapshot.connections.find(c => c.id === employee.connectionId)!
      expect(employee).toBeDefined(); expect(source).toBeDefined()
      const verified = ['https://api.deepseek.com', 'https://api.deepseek.com/v1', 'https://api.deepseek.com/anthropic'].includes(source.baseUrl.trim().replace(/\/+$/, '')) && (employee.modelId || source.defaultModel).trim() === 'deepseek-v4-pro'
      expect(call.thinking).toBe(verified ? 'off' : undefined)
    }
    expect(snapshot.agents.find(a => a.id === existing.id)).toEqual(existing)
    const created = snapshot.agents.filter(a => !before.agents.some(old => old.id === a.id))
    expect(created).toHaveLength(1)
    expect(created[0]).toMatchObject({ executionBackend: core.executionBackend, connectionId: state.connectionId, allowCommands: false, allowBrowser: false })
    expect(created[0].systemRole).toBeUndefined()
    const coreChats = snapshot.conversations.filter(c => c.purpose === 'core')
    expect(coreChats).toHaveLength(1)
    let group: Conversation
    if (namedTeam) {
      expect(actual.teams).toHaveLength(1)
      const operation = actual.teams[0]
      expect(operation).toMatchObject({ status: 'committed', executionBackend: core.executionBackend, connectionId: state.connectionId })
      group = snapshot.conversations.find(c => c.id === operation.conversation!.id)!
      expect(group.title).toBe('用户指定Claude团队')
      expect(group.agentIds).toEqual([created[0].id])
      expect(actual.organizations).toEqual([])
    } else {
      expect(actual.organizations).toHaveLength(1)
      const operation = actual.organizations[0]
      expect(operation).toMatchObject({ status: 'committed', mode: 'organize_and_execute', sourceConversationId: coreChats[0].id, budgetId: budget.id, executionBackend: core.executionBackend, connectionId: state.connectionId })
      group = snapshot.conversations.find(c => c.id === operation.groupConversationId)!
      expect(group.agentIds).toContain('bobo'); expect(group.agentIds).toContain(created[0].id)
      const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), group.id)
      const root = detail.workItems!.find(w => w.id === operation.groupRootWorkId)!, child = detail.workItems!.find(w => w.parentWorkId === root.id)!
      expect(root.ownerAgentId).toBe('bobo')
      expect(child.ownerAgentId).toBe(created[0].id)
      expect(root.requiredResults).toContainEqual({ workId: child.id, resultVersion: child.resultVersion })
      expect(root.observedResults).toContainEqual({ workId: child.id, resultVersion: child.resultVersion })
      expect(detail.messages[0]).toMatchObject({ senderId: 'bobo', content: operation.announcement!.content })
      expect(detail.artifacts).toHaveLength(2)
      for (const file of detail.artifacts) {
        const bytes = await readFile(file.path)
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(file.contentHash)
        if (state.real) expect(bytes.toString()).toContain(state.token)
        await runtime.reviewFile('Claude组织群交付原件-' + file.name, file.path)
      }
      await runtime.reviewData('Claude组织群原消息与父子工作', detail)
    }
    const result = page.getByRole('region', { name: namedTeam ? '团队创建结果' : '群协作组织结果', exact: true })
    await expect(result.getByRole('button', { name: '进入群聊', exact: true })).toBeVisible()
    await runtime.reviewNativeCheckpoint('Claude核心原讨论与真实创建回执')
    await result.getByRole('button', { name: '进入群聊', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
    await runtime.reviewNativeCheckpoint('Claude独立群与原交付结果')
    const committed = await records()
    await runtime.close()
    await runtime.start(state.real && !process.env.BOAI_TEST_PACKAGED_PATH ? await systemKeychainLaunch(runtime) : undefined)
    const restored = await records()
    for (const key of ['agents', 'messages', 'runs', 'turns', 'events', 'deliveries', 'decisions', 'works', 'budgets', 'calls', 'profileCalls', 'organizations', 'teams', 'sessions'] as const) expect(restored[key]).toEqual(committed[key])
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: group.title, exact: true }).and(runtime.page.locator('.conversation-item')).click()
    await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
    await runtime.reviewNativeCheckpoint('重启后Claude群和原记录保持')
    expect(runtime.errors).toEqual([])
  } catch (error) {
    scenarioFailure = error
    await runtime.reviewData('Claude核心原场景失败', { failure: error instanceof Error ? error.message : '原场景失败' })
    throw error
  } finally {
    try {
      await runtime.reviewData('Claude核心最终状态含失败', await records())
      await archiveNativeFinalReview(runtime, { label: 'Claude核心', records })
    } catch (error) {
      throw new AggregateError(scenarioFailure ? [scenarioFailure, error] : [error], 'Claude核心原场景或结束留证失败')
    } finally { await store.close() }
  }
})
