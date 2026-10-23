/*
 * [INPUT]: Existing saved API vault bridge/native login and actual production automation/Work scheduler.
 * [OUTPUT]: One creation message and one manual occurrence per backend; API and mixed groups collect two actual employee results before summary; two restarts never replay.
 * [POS]: EA real Electron acceptance; fixed small data comes from the user request, not an external scraping benchmark.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { AutomationDefinition, AutomationOccurrence, Conversation, ConversationDetail, DigitalAgent } from '../../../src/shared/domain'
import { test as base } from '../support/test'
import { prepareSavedModel, systemKeychainLaunch } from '../support/saved-model'
import type { Desktop } from '../support/desktop'
import { prepareV2DataRoot } from '../../../src/main/migration'

interface State { backend?: string; dataPath?: string; chat?: Conversation; plan?: AutomationDefinition; occurrence?: AutomationOccurrence; members: DigitalAgent[]; execution?: ConversationDetail }
const records = (dataPath: string) => {
  const db = new DatabaseSync(join(dataPath, 'boai.sqlite'), { readOnly: true })
  try { return Object.fromEntries(['automations','automationOccurrences','automationDispatches','messages','runs','workItems','workExecutions','workBudgets','budgetModelCalls'].map(collection => [collection, db.prepare('SELECT value FROM records WHERE collection=?').all(collection).map(row => JSON.parse(String(row.value)))])) }
  finally { db.close() }
}
export const test = base.extend<{ realAutomation: State }>({ realAutomation: async ({ runtime }, use) => {
  const s: State = { members: [] }
  try { await use(s) } finally {
    if (s.dataPath) { await runtime.reviewData('自动化真实结束前状态', records(s.dataPath)); await runtime.close(); await runtime.reviewData('自动化真实退出后状态', records(s.dataPath)) }
  }
} })
const { Given, When, Then } = createBdd(test)
async function approveProducts(d: Desktop, chat: Conversation, members: DigitalAgent[]) {
  const detail = await d.page.evaluate(id => window.boai.request('getConversation', { id }), chat.id)
  for (const run of detail.runs) for (const action of await d.page.evaluate(input => window.boai.request('listNativeActions', input), { conversationId: chat.id, runId: run.id })) {
    if (action.kind !== 'approval' || action.status !== 'pending') continue
    const approved = /^mcp__boai__(manage_automation|report_work|delegate_work|wait_for_work|read_messages|send_message)$/.test(action.method)
    await d.reviewData('自动化原生产品批准-' + action.id, { id: action.id, method: action.method, approved })
    await d.page.evaluate(input => window.boai.request('respondNativeAction', input), { conversationId: chat.id, runId: run.id, actionId: action.id, response: { option: members.find(a => a.id === run.agentId)?.executionBackend?.kind === 'codex-local' ? approved ? 'accept' : 'decline' : approved ? 'allow' : 'deny' } })
  }
  return detail
}
Given('真实自动化场景使用 {string} 员工', async ({ runtime: d, realAutomation: s }, backend: string) => {
  test.skip(process.env.BOAI_REAL_EMPLOYEE_AUTOMATIONS !== '1', '真实模型必须显式启动')
  test.setTimeout(420000); test.info().annotations.push({ type: 'model-mode', description: 'real-provider' }); s.backend = backend
  await d.reviewData('自动化启动前登记', { backend, messages: 1, manualOccurrences: 1, retries: 0, restarts: 2, observationDeadlinePerPhaseMs: 180000 })
  const preparedRoot = await prepareV2DataRoot(d.root)
  await d.reviewData('隔离目录初始化', { preparedRoot, schemaVersion: 2 })
  const connection = ['api', 'mixed'].includes(backend) ? await prepareSavedModel(d) : undefined
  await d.start(connection ? await systemKeychainLaunch(d) : undefined)
  s.dataPath = (await d.page.evaluate(() => window.boai.request('snapshot', undefined))).dataPath
  const roles = ['api', 'mixed'].includes(backend) ? ['销售采集员', '成本采集员', '汇总员'] : ['执行员']
  for (const [index, role] of roles.entries()) {
    const employeeBackend = backend === 'mixed' ? ['api', 'claude', 'codex'][index] : backend
    let profileId: string | undefined
    if (employeeBackend !== 'api') {
      const executable = process.env[employeeBackend === 'codex' ? 'BOAI_NATIVE_CODEX' : 'BOAI_NATIVE_CLAUDE']!
      const input = { name: '自动化真实-' + employeeBackend, executable, args: [], protocol: employeeBackend === 'codex' ? 'codex-app-server' as const : 'claude-cli' as const, useExistingLogin: true, hostAccessAcknowledged: true as const }
      await d.page.evaluate(input => window.boai.request('testLaunchProfileDraft', input), input)
      profileId = (await d.page.evaluate(input => window.boai.request('saveLaunchProfile', input), input)).id
    }
    const agent = await d.page.evaluate(({ role, backend, profileId, connection }) => window.boai.request('saveAgent', { name: role, role, instructions: '遵守本人明确要求，用manage_automation真实保存BOAI自动化，不使用其他定时工具。执行自动化必须用实际工作工具完成分工并report_work交付；已有固定分工不得用聊天宣称替代真实delegate_work/wait_for_work和子工作结果。', connectionId: connection?.id ?? '', modelId: connection?.defaultModel ?? (backend === 'claude' ? 'sonnet' : ''), ...(backend === 'api' ? {} : { executionBackend: { kind: backend === 'codex' ? 'codex-local' as const : 'claude-local' as const, profileId: profileId! } }), nativeOptions: backend === 'codex' ? { codexSandbox: 'workspace-write', codexApprovalPolicy: 'on-request' } : { claudePermissionMode: 'default' }, color: '#3478ce', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }), { role, backend: employeeBackend, profileId, connection: employeeBackend === 'api' ? connection : undefined })
    s.members.push(agent)
  }
  s.chat = await d.page.evaluate(({ kind, ids }) => window.boai.request('createConversation', { kind, title: '真实自动化归属', agentIds: ids }), { kind: roles.length > 1 ? 'group' as const : 'direct' as const, ids: s.members.map(a => a.id) })
  await d.reviewData('自动化真实预登记', { backend, members: s.members, chat: s.chat, messages: 1, manualOccurrences: 1, retries: 0, restarts: 2, observationDeadlinePerPhaseMs: 180000, apiBudgets: 'existing limits', nativeBudgets: 'none', externalData: 'none; user supplies the numbers for this coordination test', connection: connection && { provider: connection.provider, model: connection.defaultModel } })
})
When('我明确要求建立暂停的自动化并手动运行一次', async ({ runtime: d, realAutomation: s }) => {
  const lead = s.members.at(-1)!, group = s.members.length > 1
  const task = group ? `销售采集员(${s.members[0].id})计算本次销售17+23并交付数字；成本采集员(${s.members[1].id})计算本次成本5+7并交付数字；你(${lead.id})为汇总负责人，必须依赖这两名员工本次真实交付后计算销售减成本。两名采集员无依赖，你依赖他们两人。` : '执行员计算本次17+23-5-7，在聊天公开实际结果，并用report_work以answer证据交付本次工作。'
  const content = `只请${lead.name}处理：请现在用manage_automation创建一个归属于${group ? '当前BOAI群' : '你本人'}的自动化计划，名称“本次经营核算”。每天09:00，Asia/Singapore，使用每次独立任务上下文，关闭通知，enabled=false（创建后保持暂停，本消息不要执行）。任务要求：${task}。你拥有这些完整配置，可直接保存，保存后告诉我真实计划ID与暂停状态。`
  await d.reviewData('自动化原始创建请求', { content })
  await d.page.evaluate(input => window.boai.request('sendMessage', input), { conversationId: s.chat!.id, content, mentionIds: [lead.id], requestId: 'create-real-owner-' + s.backend })
  await expect.poll(async () => { const detail = await approveProducts(d, s.chat!, s.members); return detail.runs.length > 0 && detail.runs.every(r => ['completed','failed','cancelled','interrupted'].includes(r.status)) && detail.turns!.every(t => ['completed','failed','cancelled','interrupted'].includes(t.status)) }, { timeout: 180000, intervals: [500] }).toBe(true)
  const plans = await d.page.evaluate(() => window.boai.request('listAutomations', undefined))
  await d.reviewData('模型保存后的实际计划', plans)
  expect(plans.definitions).toHaveLength(1); expect(plans.occurrences).toHaveLength(0)
  s.plan = plans.definitions[0]; expect(s.plan).toMatchObject({ enabled: false, time: '09:00', timezone: 'Asia/Singapore', conversationPolicy: 'new-conversation', owner: group ? { kind: 'group', conversationId: s.chat!.id } : { kind: 'employee', employeeId: lead.id } })
  s.occurrence = await d.page.evaluate(id => window.boai.request('runAutomation', { id, requestId: 'real-manual-once' }), s.plan.id)
  await expect.poll(async () => {
    s.execution = await approveProducts(d, { ...s.chat!, id: s.occurrence!.conversationId }, s.members)
    const view = await d.page.evaluate(() => window.boai.request('listAutomations', undefined)); s.occurrence = view.occurrences.find(o => o.id === s.occurrence!.id)!
    return !!s.occurrence.finishedAt
  }, { timeout: 180000, intervals: [500] }).toBe(true)
  // Occurrence completion and the prior read are separate IPC snapshots.
  // Read the committed Work result after the terminal occurrence, not the poll's earlier detail.
  s.execution = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.occurrence.conversationId)
  await d.reviewData('自动化真实执行结果', { occurrence: s.occurrence, detail: s.execution })
})
Then('本次真实交付符合分工且两次重启没有重复执行', async ({ runtime: d, realAutomation: s }) => {
  expect(s.occurrence).toMatchObject({ status: 'completed', deliveryStatus: 'delivered' })
  expect(s.occurrence!.conversationId).not.toBe(s.chat!.id)
  const works = s.execution!.workItems!
  expect(works).toHaveLength(s.members.length); expect(works.every(w => w.status === 'delivered')).toBe(true)
  const lead = works.find(w => w.ownerAgentId === s.members.at(-1)!.id)!
  expect(s.execution!.messages.filter(m => lead.resultMessageIds.includes(m.id)).map(m => m.content).join('\n')).toContain('28')
  if (s.members.length > 1) { expect(lead.requiredResults).toHaveLength(2); expect(works.filter(w => w.parentWorkId === lead.id)).toHaveLength(2) }
  const before = records(s.dataPath!)
  for (let i = 0; i < 2; i++) {
    await d.restart(); const after = records(s.dataPath!)
    for (const collection of ['automations','automationOccurrences','messages','runs','workItems']) expect(after[collection]).toEqual(before[collection])
    await d.reviewData('自动化重启零重放-' + (i + 1), after)
  }
  await d.page.locator('.conversation-item').filter({ hasText: '真实自动化归属' }).click()
  await d.page.getByRole('button', { name: '会话操作', exact: true }).click()
  await d.page.getByRole('menuitem', { name: '配置', exact: true }).click()
  const panel = d.page.locator('.detail-panel:visible')
  await panel.getByRole('tab', { name: '自动化', exact: true }).click()
  await panel.getByRole('button').filter({ hasText: '本次经营核算' }).click()
  await expect(panel.getByRole('heading', { name: '本次经营核算', exact: true })).toBeVisible()
  await expect(panel.getByText('28', { exact: false }).first()).toBeVisible()
  await d.reviewNativeCheckpoint('自动化真实完成后原生窗口')
})
