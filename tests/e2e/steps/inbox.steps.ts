/*
 * [INPUT]: D5 中文场景、原任务/问题/审批/成果资格与真实 Desktop/工具协议。
 * [OUTPUT]: 原Work预算接续/未知只核对、旧审批拒绝与固定版本资格/采用的业务断言。
 * [POS]: inbox Electron步骤；支撑层控制传输故障，不替代原业务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { test as base } from '../support/test'
import { artifactDetail, prepareArtifactsDesktop } from '../support/artifacts'
import { prepareGroupChat } from '../support/group-chat'
import { inboxRecords, loseInboxReply, openInbox, openInboxItem } from '../support/inbox'
import type { ArtifactVersion } from '../../../src/shared/domain/artifacts'
import type { InboxItem, InboxQuestionReply } from '../../../src/shared/domain/inbox'
import type { Message, WorkBudget, WorkItem } from '../../../src/shared/domain'
import type { Desktop } from '../support/desktop'

interface State {
  fixture?: Awaited<ReturnType<typeof prepareArtifactsDesktop>>
  approvalFixture?: Awaited<ReturnType<typeof prepareGroupChat>>
  item?: InboxItem
  work?: WorkItem
  budget?: WorkBudget
  artifact?: ArtifactVersion
  v2?: ArtifactVersion
  fault?: Awaited<ReturnType<typeof loseInboxReply>>
  frozen?: InboxQuestionReply
  accepted?: Message
  calls?: number
  marker?: string
}
export const test = base.extend<{ inboxState: State }>({ inboxState: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const artifactPanel = (runtime: Desktop, id: string) => runtime.page.locator(`[data-artifact-id="${id}"]:visible`)
async function items(runtime: Desktop, kind?: InboxItem['kind']) { return (await runtime.page.evaluate(kind => window.boai.request('listInbox', { kind }), kind)).items }
async function settled(runtime: Desktop, id: string) {
  await expect.poll(async () => {
    const detail = await artifactDetail(runtime, id)
    return detail.turns!.every(turn => ['completed', 'waiting_user', 'failed', 'interrupted', 'cancelled', 'budget_exhausted'].includes(turn.status)) && detail.runs.every(run => ['completed', 'failed', 'interrupted', 'cancelled'].includes(run.status))
  }, { timeout: 30_000 }).toBe(true)
  return artifactDetail(runtime, id)
}
async function openArtifact(runtime: Desktop, artifact: ArtifactVersion, title: string) {
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${title}`) }).click()
  await runtime.page.locator(`#message-${artifact.sourceMessageId}`).getByRole('button', { name: `打开 ${artifact.name}`, exact: true }).click()
  await expect(artifactPanel(runtime, artifact.id).getByRole('region', { name: `成果第 ${artifact.contentVersion} 版正文`, exact: true })).toBeVisible()
}

Given('一个真实文件任务已经公开需要补充的问题', async ({ runtime, inboxState }) => {
  const fixture = inboxState.fixture = await prepareArtifactsDesktop(runtime, { askForSupplement: true })
  await runtime.page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, content: '请执行文件任务并交付报告；缺少对象先提问。', requestId: 'inbox-original-task', mentionIds: [] }), fixture.group.id)
  await settled(runtime, fixture.group.id)
  const [item] = await items(runtime, 'question'); expect(item.question?.canReply).toBe(true); inboxState.item = item
  const records = await inboxRecords(fixture.dataPath); expect(records.works).toHaveLength(1); expect(records.budgets).toHaveLength(1)
  inboxState.work = records.works[0]; inboxState.budget = records.budgets[0]
  expect(inboxState.work.status).toBe('waiting'); expect(inboxState.work.resultMessageIds).toContain(item.messageId)
  const detail = await artifactDetail(runtime, fixture.group.id)
  expect(detail.artifacts).toEqual([]); expect(detail.runs.every(run => run.toolEvents.length === 0)).toBe(true)
  expect(fixture.errors).toEqual([]); inboxState.calls = fixture.endpoint.requests.length
})
Then('读取和定位待处理不启动工具或新工作', async ({ runtime, inboxState }) => {
  const view = await openInboxItem(runtime, inboxState.item!)
  await expect(view.getByRole('region', { name: '原问题', exact: true })).toContainText('请明确报告交付给谁？')
  await view.getByRole('button', { name: '定位原消息', exact: true }).click()
  await expect(runtime.page.locator(`#message-${inboxState.item!.messageId}`)).toContainText('请明确报告交付给谁？')
  const records = await inboxRecords(inboxState.fixture!.dataPath)
  expect(records.works).toEqual([inboxState.work]); expect(records.budgets).toEqual([inboxState.budget])
  expect(inboxState.fixture!.endpoint.requests).toHaveLength(inboxState.calls!)
})
When('用户从待处理补充原问题但提交回复丢失', async ({ runtime, inboxState }) => {
  const view = await openInboxItem(runtime, inboxState.item!)
  inboxState.fault = await loseInboxReply(runtime)
  await view.getByRole('textbox', { name: '向原问题补充', exact: true }).fill('交付给本人，请沿原任务发布真实报告。')
  await view.getByRole('button', { name: '提交补充', exact: true }).click()
  await expect(view.getByRole('button', { name: '核对补充结果', exact: true })).toBeVisible()
  const fault = await inboxState.fault.inspect(); expect(fault.submissions).toHaveLength(1); inboxState.frozen = fault.submissions[0]
  await view.getByRole('button', { name: '核对补充结果', exact: true }).click()
  await expect(view.getByRole('alert')).toContainText('回执暂不可读')
})
Then('原工作沿原预算交付且未知请求没有变成普通聊天', async ({ runtime, inboxState }) => {
  const fixture = inboxState.fixture!, detail = await settled(runtime, fixture.group.id)
  expect(detail.artifacts).toHaveLength(1); expect(detail.workItems).toHaveLength(1)
  expect(detail.workItems![0]).toMatchObject({ id: inboxState.work!.id, budgetId: inboxState.budget!.id, status: 'delivered', sourceMessageId: inboxState.work!.sourceMessageId })
  expect(detail.workBudgets![0]).toMatchObject({ id: inboxState.budget!.id, deadlineAt: inboxState.budget!.deadlineAt, runs: inboxState.budget!.runs + 1 })
  expect(detail.workBudgets![0].modelCalls).toBeGreaterThan(inboxState.budget!.modelCalls)
  if (inboxState.budget!.usageIncomplete) expect(detail.workBudgets![0].usageIncomplete).toBe(true)
  const accepted = detail.messages.filter(message => message.inboxReply?.questionId === inboxState.frozen!.questionId)
  expect(accepted).toHaveLength(1); inboxState.accepted = accepted[0]
  expect(accepted[0]).toMatchObject({ senderType: 'user', senderId: 'user', content: inboxState.frozen!.content, inboxReply: { workId: inboxState.work!.id, questionMessageId: inboxState.item!.messageId } })
  expect(await runtime.page.evaluate(id => window.boai.request('getInboxItem', { id }), inboxState.item!.id)).toBeNull()
  expect((await inboxState.fault!.inspect()).submissions).toEqual([inboxState.frozen]); inboxState.calls = fixture.endpoint.requests.length
  expect(fixture.errors).toEqual([])
})
When('用户切到通讯录并在原目录重启', async ({ runtime }) => {
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  await expect(runtime.page.getByRole('main', { name: '待处理事项', exact: true })).toBeHidden()
  await runtime.restart()
})
Then('核对原补充只返回原消息且没有再次执行', async ({ runtime, inboxState }) => {
  const view = await openInbox(runtime), key = inboxState.frozen!.requestId
  await view.getByRole('region', { name: '待核对补充', exact: true }).getByRole('button', { name: `核对原补充请求：${inboxState.frozen!.content.slice(0, 32)}`, exact: true }).click()
  await runtime.page.getByRole('button', { name: '核对补充结果', exact: true }).click()
  await expect(runtime.page.getByText('已向原问题提交补充。', { exact: true })).toBeVisible()
  expect(await runtime.page.evaluate(requestId => window.boai.request('getMessageReceipt', { requestId }), key)).toEqual(inboxState.accepted)
  const records = await inboxRecords(inboxState.fixture!.dataPath)
  expect(records.messages.filter(message => message.inboxReply?.questionId === inboxState.frozen!.questionId)).toEqual([inboxState.accepted])
  expect(records.works).toHaveLength(1); expect(records.works[0]).toMatchObject({ id: inboxState.work!.id, status: 'delivered', budgetId: inboxState.budget!.id })
  expect(inboxState.fixture!.endpoint.requests).toHaveLength(inboxState.calls!); expect(runtime.errors).toEqual([])
})

Given('设计师正等待一项真实命令批准', async ({ runtime, inboxState }) => {
  const fixture = inboxState.approvalFixture = await prepareGroupChat(runtime)
  await runtime.page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, content: '请检查排版目录', mentionIds: ['reviewer'], requestId: 'inbox-command' }), fixture.group.id)
  await expect.poll(async () => (await items(runtime, 'approval')).length).toBe(1)
  inboxState.item = (await items(runtime, 'approval'))[0]; inboxState.marker = join(inboxState.item.approval!.cwd, 'approval-marker.txt')
  await expect(lstat(inboxState.marker)).rejects.toMatchObject({ code: 'ENOENT' }); inboxState.calls = fixture.state.calls
})
When('用户在待处理查看并拒绝原命令', async ({ runtime, inboxState }) => {
  const view = await openInboxItem(runtime, inboxState.item!)
  await expect(view.getByRole('region', { name: '原命令审批', exact: true })).toContainText('printf group-chat-approved > approval-marker.txt')
  expect(inboxState.approvalFixture!.state.calls).toBe(inboxState.calls)
  await view.getByRole('button', { name: '拒绝', exact: true }).click()
  await expect.poll(async () => (await items(runtime, 'approval')).length).toBe(0)
  await settled(runtime, inboxState.approvalFixture!.group.id)
})
Then('旧审批不能重新批准且没有执行文件', async ({ runtime, inboxState }) => {
  const approvalId = inboxState.item!.approvalId!
  const result = await runtime.page.evaluate(async id => { try { await window.boai.request('approve', { id, approved: true }); return 'accepted' } catch (error) { return String(error) } }, approvalId)
  expect(result).not.toBe('accepted'); await expect(lstat(inboxState.marker!)).rejects.toMatchObject({ code: 'ENOENT' })
  const calls = inboxState.approvalFixture!.state.calls; await runtime.restart()
  expect(await items(runtime, 'approval')).toEqual([]); expect(inboxState.approvalFixture!.state.calls).toBe(calls)
  await expect(lstat(inboxState.marker!)).rejects.toMatchObject({ code: 'ENOENT' }); expect(runtime.errors).toEqual([])
})

Given('一个真实成果已经发布但用户未要求稍后验收', async ({ runtime, inboxState }) => {
  const fixture = inboxState.fixture = await prepareArtifactsDesktop(runtime)
  await runtime.page.evaluate(id => window.boai.request('sendMessage', { conversationId: id, content: '请发布实际可检查的报告。', mentionIds: [], requestId: 'inbox-report-v1' }), fixture.group.id)
  inboxState.artifact = (await settled(runtime, fixture.group.id)).artifacts[0] as ArtifactVersion
  expect(inboxState.artifact).toBeDefined(); inboxState.calls = fixture.endpoint.requests.length
  await openArtifact(runtime, inboxState.artifact, fixture.group.title)
})
Then('已发布未采用的成果不会自动出现在待验收', async ({ runtime, inboxState }) => {
  expect(await items(runtime, 'acceptance')).toEqual([])
  expect((await inboxRecords(inboxState.fixture!.dataPath)).acceptances).toEqual([])
})
When('用户明确要求稍后验收原版并从待处理打开', async ({ runtime, inboxState }) => {
  await artifactPanel(runtime, inboxState.artifact!.id).getByRole('button', { name: '稍后验收此版本', exact: true }).click()
  await expect.poll(async () => (await items(runtime, 'acceptance')).length).toBe(1)
  inboxState.item = (await items(runtime, 'acceptance'))[0]
  const view = await openInboxItem(runtime, inboxState.item!)
  await view.getByRole('button', { name: '查看此版本并验收', exact: true }).click()
  await expect(artifactPanel(runtime, inboxState.artifact!.id)).toBeVisible()
})
Then('两个主页面各自保留原版详情且没有自动采用', async ({ runtime, inboxState }) => {
  expect(inboxState.item!.artifact).toMatchObject({ id: inboxState.artifact!.id, contentHash: inboxState.artifact!.contentHash, contentVersion: 1 })
  expect((await inboxRecords(inboxState.fixture!.dataPath)).events).toEqual([])
  expect(inboxState.fixture!.endpoint.requests).toHaveLength(inboxState.calls!)
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await expect(artifactPanel(runtime, inboxState.artifact!.id)).toHaveCount(1)
  await openInbox(runtime); await expect(artifactPanel(runtime, inboxState.artifact!.id)).toHaveCount(1)
})
When('用户从该原版要求修改并得到新版', async ({ runtime, inboxState }) => {
  const panel = artifactPanel(runtime, inboxState.artifact!.id)
  await panel.getByRole('button', { name: '要求修改', exact: true }).click()
  await panel.getByRole('textbox', { name: '修改要求', exact: true }).fill('保留原报告并补充验收说明，发布修订版。')
  await panel.getByRole('button', { name: '提交修改要求', exact: true }).click()
  const detail = await settled(runtime, inboxState.fixture!.group.id)
  expect(detail.artifacts).toHaveLength(2); inboxState.v2 = detail.artifacts.find(value => value.contentVersion === 2) as ArtifactVersion
  expect(inboxState.v2.previousArtifactId).toBe(inboxState.artifact!.id)
})
Then('原资格结束且新版没有继承待验收', async ({ runtime, inboxState }) => {
  expect(await items(runtime, 'acceptance')).toEqual([])
  const records = await inboxRecords(inboxState.fixture!.dataPath)
  expect(records.acceptances).toEqual([expect.objectContaining({ artifactId: inboxState.artifact!.id, status: 'revision_requested' })])
  expect(records.events).toEqual([])
  const preview = await runtime.page.evaluate(id => window.boai.request('getArtifactPreview', { id }), inboxState.v2!.id)
  expect(preview.acceptance).toBeNull()
})
When('用户明确将新版加入待验收并采用此版', async ({ runtime, inboxState }) => {
  await openArtifact(runtime, inboxState.v2!, inboxState.fixture!.group.title)
  await artifactPanel(runtime, inboxState.v2!.id).getByRole('button', { name: '稍后验收此版本', exact: true }).click()
  await expect.poll(async () => (await items(runtime, 'acceptance')).length).toBe(1)
  const item = (await items(runtime, 'acceptance'))[0], view = await openInboxItem(runtime, item)
  await view.getByRole('button', { name: '查看此版本并验收', exact: true }).click()
  inboxState.calls = inboxState.fixture!.endpoint.requests.length
  await artifactPanel(runtime, inboxState.v2!.id).getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect.poll(async () => (await items(runtime, 'acceptance')).length).toBe(0)
})
Then('原资格和采用指向一致且无额外工作或模型执行', async ({ runtime, inboxState }) => {
  const records = await inboxRecords(inboxState.fixture!.dataPath)
  expect(records.acceptances).toEqual(expect.arrayContaining([expect.objectContaining({ artifactId: inboxState.artifact!.id, status: 'revision_requested' }), expect.objectContaining({ artifactId: inboxState.v2!.id, contentHash: inboxState.v2!.contentHash, status: 'adopted' })]))
  expect(records.works).toHaveLength(2); expect(records.events).toEqual([expect.objectContaining({ artifactId: inboxState.v2!.id, contentHash: inboxState.v2!.contentHash })])
  expect(inboxState.fixture!.endpoint.requests).toHaveLength(inboxState.calls!)
  await runtime.restart(); expect(await items(runtime, 'acceptance')).toEqual([])
  expect((await inboxRecords(inboxState.fixture!.dataPath)).acceptances).toEqual(records.acceptances)
  expect(inboxState.fixture!.endpoint.requests).toHaveLength(inboxState.calls!); expect(runtime.errors).toEqual([])
})
