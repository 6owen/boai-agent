/*
 * [INPUT]: 明确开启的真实 Codex、只读已保存 API 连接和隔离桌面。
 * [OUTPUT]: 真实公开回复不作无回执记忆保存/无能力声明；原界面创建独立 API 员工与普通混合群，双向委派与指定群自动化、真实原件/逐员工有源非空记忆/唯一账本/系统加密重启零重放分场留证；恢复画面等待实际消息可见。
 * [POS]: LR5 双真实供应商桌面验收；不使用 API 模型替身，也不改产品调度或凭据来源。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from './codex-employee.steps'
import { prepareSavedModel, systemKeychainLaunch } from '../support/saved-model'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { BudgetModelCall, MemoryEntry } from '../../../src/shared/domain'
import type { Desktop } from '../support/desktop'
import { scheduleAction, scheduleTarget, selectScheduleOption } from '../support/schedule-controls'

const { Then } = createBdd(test)
async function createMixedGroup(runtime: Desktop, nativeId: string) {
  await runtime.close()
  const connection = await prepareSavedModel(runtime)
  await runtime.start(process.env.BOAI_TEST_PACKAGED_PATH ? undefined : await systemKeychainLaunch(runtime))
  await runtime.reviewData('双真实供应商来源', { codex: 'actual-local-app-server', api: { provider: connection.provider, model: connection.defaultModel, endpointHost: new URL(connection.baseUrl).hostname }, credentialHandling: 'read-only-source-and-encrypted-isolated-vault', modelMode: 'real-provider', humanReview: 'pending' })
  const page = runtime.page, apiName = 'API 核查同事', nativeName = '本机 Codex 同事'
  const newContact = async () => {
    await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
    await page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '新建', exact: true }).click()
  }
  await newContact(); await page.getByRole('menuitem', { name: '新建员工', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '新建数字员工', exact: true })
  await editor.getByRole('textbox', { name: '名称', exact: true }).fill(apiName)
  await editor.getByRole('textbox', { name: '角色', exact: true }).fill('独立文件核查与协作员工')
  await editor.getByRole('textbox', { name: 'Prompt', exact: true }).fill('按用户请求和正式委派完成自己的工作，用中文简短汇报。被指定为负责人时使用宿主委派和依赖工具组织；未被分配工作时不擅自建立根工作，等待真实委派。文件任务使用获准的文件工具并发布真实文件，禁用命令，不联网。')
  await expect(editor.getByRole('combobox', { name: '运行方式', exact: true })).toContainText('模型 API')
  await runtime.reviewCheckpoint('创建真实API独立员工')
  await editor.getByRole('button', { name: '创建员工', exact: true }).click(); await expect(editor).toBeHidden()
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  const api = snapshot.agents.find(agent => agent.name === apiName)!, native = snapshot.agents.find(agent => agent.id === nativeId)!
  expect(api.connectionId).toBe(connection.id); expect(api.executionBackend?.kind).toBe('mastra-model')
  expect(native.connectionId).toBe(''); expect(native.executionBackend?.kind).toBe('codex-local')
  await newContact(); await page.getByRole('menuitem', { name: '新建群聊', exact: true }).click()
  const group = page.getByRole('dialog', { name: '发起群聊', exact: true })
  for (const name of [apiName, nativeName]) await group.locator('label').filter({ hasText: name }).getByRole('checkbox').check()
  await runtime.reviewCheckpoint('普通群选择API与本机独立员工')
  await group.getByRole('button', { name: '完成', exact: true }).click(); await expect(group).toBeHidden()
  const chat = (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.find(chat => chat.kind === 'group' && chat.agentIds.includes(api.id) && chat.agentIds.includes(native.id))!
  return { api, native, chat }
}

Then('用户以真实 API 和 Codex 由{string}负责双向协作并保持原工作', async ({ runtime, codexEmployee }, ownerKind: string) => {
  test.skip(process.env.BOAI_TEST_REAL_API !== '1', '双真实供应商必须明确开启 API 验证并指定连接')
  expect(codexEmployee.real).toBe(true)
  test.setTimeout(720000)
  const { api, native, chat } = await createMixedGroup(runtime, codexEmployee.employeeId!)
  const page = runtime.page
  const owner = ownerKind === 'API 员工' ? api : native, other = owner.id === api.id ? native : api
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), chat.id)
  const request = `这是明确的文件协作任务。仅由被点名的${owner.name}负责主工作；${other.name}不要另建根工作，等待负责人正式委派。负责人请用 delegate_work 委派${other.name}创建并发布 mixed-child.md，正文包含“${codexEmployee.token}”。然后使用 wait_for_work 等待该子工作的实际结果。接续后核对真实子成果，再创建并发布 mixed-summary.md，正文包含同一暗号和子成果文件名，完成主工作。只需这两个短文件，不联网、不执行命令、不要求用户补充，不重复已经完成的委派或写入。`
  await page.getByRole('button', { name: '提及群聊成员', exact: true }).click()
  await page.getByRole('option', { name: `@${owner.name}`, exact: true }).click()
  const memoryRequest = request + ' 另外，请两位记住本群今后的固定汇报偏好：先给结论，再列依据，使用简短中文。只保存这条偏好，不把文件核对码保存为长期记忆。'
  await page.getByRole('textbox', { name: '消息内容', exact: true }).pressSequentially(memoryRequest)
  await runtime.reviewData('双真实供应商原始请求', { request: memoryRequest, ownerKind, ownerId: owner.id, childOwnerId: other.id })
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  try {
    await expect.poll(async () => {
      const detail = await read()
      return detail.workItems?.length === 2 && detail.workItems.every(work => work.status === 'delivered')
    }, { timeout: 420000, intervals: [1000, 2500, 5000] }).toBe(true)
    await expect.poll(async () => {
      const detail = await read()
      return detail.runs.filter(run => run.phase === 'memory').length === 2 && detail.turns!.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status)) && detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))
    }, { timeout: 120000 }).toBe(true)
    const detail = await read(), works = detail.workItems!, budget = detail.workBudgets![0]
    expect(detail.runs.filter(run => run.status === 'failed')).toEqual([])
    expect(works).toHaveLength(2); expect(detail.workBudgets).toHaveLength(1)
    const parent = works.find(work => !work.parentWorkId)!, child = works.find(work => !!work.parentWorkId)!
    expect(parent.ownerAgentId).toBe(owner.id)
    expect(child).toMatchObject({ parentWorkId: parent.id, rootWorkId: parent.id, ownerAgentId: other.id, budgetId: parent.budgetId, sourceMessageId: parent.sourceMessageId })
    expect(parent.requiredResults).toContainEqual({ workId: child.id, resultVersion: child.resultVersion })
    expect(parent.waitRevision).toBeGreaterThan(0)
    expect(detail.messages.find(message => message.id === parent.sourceMessageId)?.mentionIds).toEqual([owner.id])
    expect(budget).toMatchObject({ id: parent.budgetId, callUnit: 'mixed', accounting: 'model-calls-v1', unknownCalls: 0, usageIncomplete: false })
    const calls = (await store.load<BudgetModelCall>('budgetModelCalls')).filter(call => call.budgetId === budget.id)
    expect(calls).toHaveLength(budget.modelCalls)
    expect(new Set(calls.map(call => call.id)).size).toBe(calls.length)
    const memories = await store.load<MemoryEntry>('memory')
    const publicReplies = detail.messages.filter(m => m.senderType === 'agent').map(m => ({ employeeId: m.senderId, content: m.content }))
    await runtime.reviewData('记忆请求的实际公开回复', publicReplies)
    // Public task replies precede private maintenance and have no persistence receipt.
    // Neither a future successful write nor an absent task tool proves a reply-time status.
    for (const reply of publicReplies) {
      expect(reply.content).not.toMatch(/(?:无法|不能|无权|未获准|未授权|无获准)[^。！？\n]{0,32}(?:记忆|保存偏好)|(?:记忆|偏好)[^。！？\n]{0,32}(?:无法|不能|未保存|已保存|已存储|已记下|已记住)|(?:未保存|已保存|已存储|已记下|已记住)[^。！？\n]{0,32}(?:记忆|偏好)/)
    }

    for (const member of [api, native]) {
      const ownCalls = calls.filter(call => detail.runs.find(run => run.id === call.runId)?.agentId === member.id)
      expect(ownCalls.length).toBeGreaterThan(0)
      expect(ownCalls.every(call => call.usageComplete && call.callUnit === (member.id === native.id ? 'external-turn' : undefined))).toBe(true)
      const work = works.find(w => w.ownerAgentId === member.id)!
      const maintenance = detail.runs.filter(r => r.agentId === member.id && r.phase === 'memory')
      expect(maintenance).toHaveLength(1)
      const published = detail.runs.find(r => r.workId === work.id && r.disposition === 'delivered')!
      expect(maintenance[0]).toMatchObject({ workId: work.id, turnId: published.turnId, status: 'completed' })
      expect(ownCalls.filter(c => c.phase === 'memory' && c.runId === maintenance[0].id)).toHaveLength(1)
      const saved = memories.filter(m => m.ownerAgentId === member.id && m.sourceMessageIds.includes(parent.sourceMessageId) && !m.deletedAt)
      expect(saved.length).toBeGreaterThan(0)
      expect(saved.every(m => m.conversationId === chat.id && !m.content.includes(codexEmployee.token!))).toBe(true)
      expect(saved.map(m => m.content).join('\n')).toContain('结论'); expect(saved.map(m => m.content).join('\n')).toContain('依据')
    }
    expect(detail.artifacts).toHaveLength(2)
    for (const work of [parent, child]) {
      const files = detail.artifacts.filter(file => work.artifactIds.includes(file.id!))
      expect(files).toHaveLength(1)
      expect(files[0].ownerAgentId).toBe(work.ownerAgentId)
      expect(await readFile(files[0].path, 'utf8')).toContain(codexEmployee.token!)
      await runtime.reviewFile('双真实供应商原件-' + files[0].name, files[0].path)
    }
    await runtime.reviewData('双真实供应商父子工作与原预算', { detail, calls, memories })
    await runtime.reviewNativeCheckpoint('双真实供应商实际分工文件交付')
    const counts = { runs: detail.runs.length, calls: calls.length, works: works.length }
    await runtime.restart()
    const reopened = await read()
    expect(reopened.runs).toHaveLength(counts.runs)
    expect(reopened.workItems).toEqual(works)
    expect(reopened.workBudgets).toEqual(detail.workBudgets)
    expect((await store.load<BudgetModelCall>('budgetModelCalls')).filter(call => call.budgetId === budget.id)).toEqual(calls)
    expect(await store.load('memory')).toEqual(memories)
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: chat.title, exact: true }).click()
    await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
    await expect(runtime.page.getByText('mixed-summary.md', { exact: true }).last()).toBeVisible()
    await runtime.reviewNativeCheckpoint('双真实供应商重启保持交付')
  } finally {
    await runtime.reviewData('双真实供应商最终实际状态', { detail: await read(), calls: await store.load('budgetModelCalls') })
    await store.close()
  }
})

Then('用户在原界面让真实 API 与 Codex 共用一次自动化预算并分别交付', async ({ runtime, codexEmployee }) => {
  test.skip(process.env.BOAI_TEST_REAL_API !== '1', '双真实供应商必须明确开启 API 验证并指定连接')
  expect(codexEmployee.real).toBe(true)
  test.setTimeout(720000)
  const { api, native, chat } = await createMixedGroup(runtime, codexEmployee.employeeId!)
  const page = runtime.page, title = '双真实供应商定时交付'
  const request = `这次自动化给两位员工分别明确分配独立文件工作，每位都是自己工作的负责人：${api.name}负责创建并发布 api-auto.md，正文包含“${codexEmployee.token}”；${native.name}负责创建并发布 codex-auto.md，正文包含同一暗号。每位只完成并汇报自己的一个文件，不代替对方，不委派、不等待对方、不联网、不执行命令，不要求用户补充。`
  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  await page.locator('.schedule-list').getByRole('button', { name: '新建任务', exact: true }).click()
  const editor = page.locator('.detail-content:visible')
  await editor.getByLabel('标题', { exact: true }).fill(title)
  await editor.getByLabel('任务描述', { exact: true }).fill(request)
  await scheduleTarget(page, 'conversation', chat.title + ' · 群聊')
  await selectScheduleOption(page, '通知', '静音')
  await runtime.reviewData('混合自动化原始请求', { request, source: 'manual', target: 'explicit-existing-group', humanReview: 'pending' })
  await runtime.reviewCheckpoint('七项表单选择真实API与Codex混合群')
  await editor.getByRole('button', { name: '创建', exact: true }).click()
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible()
  await scheduleAction(page, '暂停计划')
  const plan = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).definitions.find(plan => plan.name === title)!
  expect(plan).toMatchObject({ enabled: false, conversationPolicy: 'existing-conversation', conversationId: chat.id, notificationPolicy: 'muted' })
  const store = await ProductStore.openReadOnly(join(runtime.root, 'v2', 'boai.sqlite'))
  const read = () => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), chat.id)
  try {
    expect(await store.load('runs')).toEqual([])
    await scheduleAction(page, '立即运行一次')
    await expect.poll(async () => (await page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences.filter(value => value.automationId === plan.id).length).toBe(1)
    const occurrenceId = (await page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences.find(value => value.automationId === plan.id)!.id
    await expect.poll(async () => {
      const occurrence = await page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), occurrenceId)
      return ['completed', 'failed', 'cancelled', 'interrupted'].includes(occurrence.status)
    }, { timeout: 420000, intervals: [1000, 2500, 5000] }).toBe(true)
    await expect.poll(async () => (await read()).runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)), { timeout: 120000 }).toBe(true)
    const occurrence = await page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), occurrenceId)
    expect(occurrence).toMatchObject({ status: 'completed', source: 'manual', deliveryStatus: 'delivered', conversationId: chat.id, usageIncomplete: false })
    const detail = await read(), works = detail.workItems!, budget = detail.workBudgets![0]
    expect(works).toHaveLength(2); expect(detail.workBudgets).toHaveLength(1)
    expect(new Set(works.map(work => work.ownerAgentId))).toEqual(new Set([api.id, native.id]))
    for (const work of works) {
      expect(work.parentWorkId).toBeUndefined()
      expect(work).toMatchObject({ status: 'delivered', sourceMessageId: occurrence.messageId, budgetId: occurrence.budgetId, origin: { occurrenceId } })
    }
    expect(budget).toMatchObject({ id: occurrence.budgetId, callUnit: 'mixed', accounting: 'model-calls-v1', maxModelCalls: 24, deadlineAt: occurrence.budget!.deadlineAt, unknownCalls: 0, usageIncomplete: false })
    const calls = (await store.load<BudgetModelCall>('budgetModelCalls')).filter(call => call.budgetId === budget.id)
    expect(calls).toHaveLength(budget.modelCalls)
    expect(new Set(calls.map(call => call.id)).size).toBe(calls.length)
    expect(calls.every(call => call.origin?.occurrenceId === occurrenceId && call.usageComplete)).toBe(true)
    expect(calls.some(call => call.callUnit === 'external-turn')).toBe(true)
    expect(calls.some(call => !call.callUnit)).toBe(true)
    expect(detail.runs.filter(run => run.status === 'failed')).toEqual([])
    expect(detail.artifacts).toHaveLength(2)
    for (const work of works) {
      const files = detail.artifacts.filter(file => work.artifactIds.includes(file.id!))
      expect(files).toHaveLength(1)
      expect(files[0].ownerAgentId).toBe(work.ownerAgentId)
      expect(await readFile(files[0].path, 'utf8')).toContain(codexEmployee.token!)
      await runtime.reviewFile('混合自动化实际原件-' + files[0].name, files[0].path)
    }
    await runtime.reviewData('混合自动化一次触发与共享账本', { plan, occurrence, detail, calls })
    await page.locator(`[data-occurrence-id="${occurrenceId}"]`).getByText('运行明细', { exact: true }).click()
    await expect(page.getByRole('button', { name: '打开会话与结果', exact: true })).toBeVisible()
    await runtime.reviewCheckpoint('混合自动化本次实际结果与计量')
    await page.getByRole('button', { name: '打开会话与结果', exact: true }).click()
    await expect(page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
    await expect(page.getByText('api-auto.md', { exact: true }).last()).toBeVisible()
    await expect(page.getByText('codex-auto.md', { exact: true }).last()).toBeVisible()
    await runtime.reviewNativeCheckpoint('混合自动化在原群分别交付')
    await runtime.restart()
    const restored = await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), occurrenceId)
    expect(restored).toMatchObject({ id: occurrenceId, status: 'completed', deliveryStatus: 'delivered', conversationId: chat.id })
    const after = await read()
    expect(after.runs).toEqual(detail.runs)
    expect(after.workItems).toEqual(works)
    expect(after.workBudgets).toEqual(detail.workBudgets)
    expect((await store.load<BudgetModelCall>('budgetModelCalls')).filter(call => call.budgetId === budget.id)).toEqual(calls)
    expect((await runtime.page.evaluate(() => window.boai.request('listAutomations', undefined))).occurrences.filter(value => value.automationId === plan.id)).toHaveLength(1)
    await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: chat.title, exact: true }).click()
    await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
    await expect(runtime.page.getByText('api-auto.md', { exact: true }).last()).toBeVisible()
    await expect(runtime.page.getByText('codex-auto.md', { exact: true }).last()).toBeVisible()
    await runtime.reviewNativeCheckpoint('混合自动化重启保留同次交付')
  } finally {
    await runtime.reviewData('混合自动化最终实际状态', { detail: await read(), calls: await store.load('budgetModelCalls'), automation: await runtime.page.evaluate(() => window.boai.request('listAutomations', undefined)) })
    await store.close()
  }
})
