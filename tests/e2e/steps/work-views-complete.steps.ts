/*
 * [OUTPUT]: 恢复后的文件清单不提供历史版本入口，核对当前文件及原始存储记录。
 * [INPUT]: 隔离Electron、真实材料/成果/原问题/备份API与可控模型协议及回执传输故障。
 * [OUTPUT]: 判断/实际执行期定时固定问题补充和原草稿单次副作用、未知修订跨三视图/重启与独立备份恢复的同次事实、原件和关键帧。
 * [POS]: WV-T06/T10/T12完整业务步骤，不替代宿主事务或文件工具。
 * [PROTOCOL]: 修改时同步Header及所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { cp, mkdir, readFile, realpath } from 'node:fs/promises'
import { join } from 'node:path'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { artifactDetail, artifactPendingRequests, artifactRecords, artifactReplyFault, prepareArtifactsDesktop } from '../support/artifacts'
import { inboxRecords, openSourceChat } from '../support/inbox'
import { nextMaterialDialog } from '../support/materials'
import type { ArtifactRevisionInput, ArtifactVersion } from '../../../packages/shared/src/domain/artifacts'
import type { AutomationOccurrence, WorkItem } from '../../../packages/shared/src/domain'
import type { InboxItem } from '../../../packages/shared/src/domain/inbox'

type AutomationReplyInput = import('../../../packages/shared/src/ipc').Methods['replyAutomation']['input']
interface ReplyFault { submissions: AutomationReplyInput[]; lookups: string[]; unavailable: boolean }
interface State {
  fixture?: Awaited<ReturnType<typeof prepareArtifactsDesktop>>
  original?: ArtifactVersion; revised?: ArtifactVersion
  before?: Awaited<ReturnType<typeof artifactRecords>>
  fault?: Awaited<ReturnType<typeof artifactReplyFault>>
  replyFault?: Awaited<ReturnType<typeof loseAutomationReply>>
  frozen?: ArtifactRevisionInput; reply?: AutomationReplyInput
  question?: InboxItem; occurrence?: AutomationOccurrence; work?: WorkItem
  calls?: number; backup?: string; restored?: string
  questionDraft?: { path: string; content: string }
}
export const test = base.extend<{ completeViews: State }>({ completeViews: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const navigation = (runtime: Desktop) => runtime.page.getByRole('navigation', { name: '主导航', exact: true })
const workCard = (runtime: Desktop, id: string) => runtime.page.locator(`[data-work-id="${id}"]:visible`)
const artifactCard = (runtime: Desktop, id: string) => runtime.page.locator(`.messages [data-chat-artifact-id="${id}"]`)
async function pane(runtime: Desktop, label: '聊天' | '任务' | '文件') {
  await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: label, exact: true }).click()
  await expect(runtime.page.locator('.chat-panel')).toHaveAttribute('data-conversation-view', { 聊天: 'chat', 任务: 'tasks', 文件: 'files' }[label])
}
async function settled(runtime: Desktop, conversationId: string, artifacts?: number) {
  await expect.poll(async () => {
    const detail = await artifactDetail(runtime, conversationId)
    return (artifacts === undefined || detail.artifacts.length === artifacts) && detail.runs.every(run => ['completed', 'failed', 'interrupted', 'cancelled'].includes(run.status)) && detail.turns!.every(turn => ['completed', 'waiting_user', 'failed', 'interrupted', 'cancelled', 'budget_exhausted'].includes(turn.status))
  }, { timeout: 30_000 }).toBe(true)
  return artifactDetail(runtime, conversationId)
}
async function cycle(runtime: Desktop, conversationId: string) {
  await pane(runtime, '任务'); await pane(runtime, '文件')
  await navigation(runtime).getByRole('button', { name: '任务', exact: true }).click()
  await expect(runtime.page.getByRole('main', { name: '全局任务', exact: true })).toBeVisible()
  await runtime.reviewCheckpoint('固定原请求经过任务文件和全局任务')
  await openSourceChat(runtime, conversationId); await pane(runtime, '聊天')
}

/** The actual occurrence/message/work transaction commits before this transport fault. */
async function loseAutomationReply(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers, original = handlers.get('boai:request')!
    const state: ReplyFault = { submissions: [], lookups: [], unavailable: true }; Object.assign(globalThis, { __boaiAutomationReplyFault: state })
    let dropped = false
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === 'replyAutomation') state.submissions.push(structuredClone(payload.input))
      if (payload.method === 'getMessageReceipt') state.lookups.push(payload.input.requestId)
      const result = await original(event, payload)
      if (payload.method === 'replyAutomation' && !dropped) { dropped = true; throw new Error('验收：原定时补充已提交但回复丢失') }
      if (payload.method === 'getMessageReceipt' && state.unavailable) throw new Error('验收：原定时补充回执暂不可读')
      return result
    })
  })
  return { inspect: () => runtime.app.evaluate(() => structuredClone((globalThis as typeof globalThis & { __boaiAutomationReplyFault: ReplyFault }).__boaiAutomationReplyFault)) }
}

Given('完整闭环已有真实输入材料和第一版交付', async ({ runtime, completeViews: state }) => {
  const fixture = state.fixture = await prepareArtifactsDesktop(runtime)
  await openSourceChat(runtime, fixture.group.id)
  await nextMaterialDialog(runtime, { path: fixture.source })
  await runtime.page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
  await expect(runtime.page.locator('[data-material-draft-id]')).toHaveAttribute('data-material-status', 'ready')
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('执行材料任务并发布完整可检查的报告。')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  const detail = await settled(runtime, fixture.group.id, 1)
  state.original = detail.artifacts[0] as ArtifactVersion
  await runtime.reviewFile('完整闭环输入原件', join(fixture.dataPath, 'materials', fixture.group.id, detail.materials![0].id, 'original'))
  await runtime.reviewFile('完整闭环第一版原件', state.original.path)
  await runtime.reviewCheckpoint('原员工真实第一版交付')
})

When('原消息修订已提交但回复失联后切换三视图和任务总览', async ({ runtime, completeViews: state }) => {
  state.fault = await artifactReplyFault(runtime, 'revision')
  await artifactCard(runtime, state.original!.id).getByRole('button', { name: '要求修改', exact: true }).click()
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('保留原材料来源，补充固定版本验收条件。')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: '核对修改结果', exact: true })).toBeVisible()
  const fault = await state.fault.inspect(); expect(fault.submissions).toHaveLength(1)
  state.frozen = fault.submissions[0] as ArtifactRevisionInput
  expect(state.frozen).toMatchObject({ artifactId: state.original!.id, contentHash: state.original!.contentHash, targetAgentId: state.original!.ownerAgentId })
  await cycle(runtime, state.fixture!.group.id)
  expect(Object.values(await artifactPendingRequests(runtime))[0].revision).toMatchObject({ status: 'unknown', input: state.frozen })
  const detail = await settled(runtime, state.fixture!.group.id, 2)
  state.revised = detail.artifacts.find(artifact => artifact.previousArtifactId === state.original!.id) as ArtifactVersion
  state.before = await artifactRecords(state.fixture!.dataPath); state.calls = state.fixture!.endpoint.requests.length
  await runtime.reviewFile('未知修订已真实发布的第二版', state.revised.path)
  await runtime.reviewData('固定原版的未知修订请求', { request: state.frozen, revised: state.revised, submissions: fault.submissions.length })
  await runtime.reviewCheckpoint('未知修订仍保留原载荷和原员工')
})
Then('修订原载荷保持且重启核对不重复消息工作或工具', async ({ runtime, completeViews: state }) => {
  await runtime.restart()
  state.fault = await artifactReplyFault(runtime, 'revision', { loseReply: false, lookupUnavailable: false })
  await openSourceChat(runtime, state.fixture!.group.id); await pane(runtime, '聊天')
  expect(Object.values(await artifactPendingRequests(runtime))[0].revision).toMatchObject({ status: 'unknown', input: state.frozen })
  await runtime.page.getByRole('button', { name: '核对修改结果', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: '核对修改结果', exact: true })).toHaveCount(0)
  const after = await artifactRecords(state.fixture!.dataPath)
  expect(after).toEqual(state.before); expect(state.fixture!.endpoint.requests).toHaveLength(state.calls!)
  expect((await state.fault.inspect()).submissions).toEqual([])
  expect((await state.fault.inspect()).lookups).toEqual([state.frozen!.requestId])
  await runtime.reviewData('修订重启核对零业务重放', { before: state.before!.revisions, after: after.revisions, calls: state.calls, receiptLookups: (await state.fault.inspect()).lookups })
  await runtime.reviewCheckpoint('只读核对原修订后回到原聊天')
})

Given('完整闭环已有在{word}真实等待补充的定时工作', async ({ runtime, completeViews: state }, phase: string) => {
  expect(['初始判断', '实际执行']).toContain(phase)
  state.fixture = await prepareArtifactsDesktop(runtime, { askForSupplement: phase === '初始判断', askDuringExecution: phase === '实际执行' })
  const occurrence = await runtime.page.evaluate(async conversationId => {
    const plan = await window.boai.request('saveAutomation', { name: '工作视图原问题验收', prompt: '执行文件任务，交付对象不清楚时先明确提问。', conversationId, frequency: 'daily', time: '09:00', weekday: 1, timezone: 'UTC', enabled: false, notify: false })
    return window.boai.request('runAutomation', { id: plan.id, requestId: 'complete-view-original-occurrence' })
  }, state.fixture.group.id)
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), occurrence.id)).status).toBe('waiting_user')
  state.occurrence = await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), occurrence.id)
  state.question = (await runtime.page.evaluate(() => window.boai.request('listInbox', { kind: 'question' }))).items.find(item => item.occurrenceId === occurrence.id || item.id === `occurrence:${occurrence.id}`)
  expect(state.question).toMatchObject({ occurrenceId: occurrence.id, question: { id: `occurrence:${occurrence.id}`, revision: state.occurrence.stateVersion } })
  expect(state.question?.messageId).toBeTruthy()
  const records = await inboxRecords(state.fixture.dataPath)
  expect(records.works).toHaveLength(1); state.work = records.works[0]
  expect(state.work).toMatchObject({ status: 'waiting', origin: { occurrenceId: occurrence.id } })
  if (phase === '实际执行') {
    const [draft] = state.fixture.executionQuestions
    expect(state.fixture.executionQuestions).toHaveLength(1); expect(draft.writeRequests).toBe(1)
    const detail = await artifactDetail(runtime, occurrence.conversationId)
    const run = detail.runs.find(value => value.id === draft.runId)!
    expect(run).toMatchObject({ status: 'completed', responseKind: 'task', workId: state.work.id, messageId: state.question!.messageId })
    expect(detail.decisions!.filter(value => value.turnId === run.turnId && value.agentId === run.agentId).map(value => value.action)).toEqual(['reply'])
    expect(state.work.userQuestion).toMatchObject({ messageId: state.question!.messageId, content: '请明确报告交付给谁？' })
    state.questionDraft = { path: join(state.fixture.dataPath, 'agents', run.agentId, 'workspace', 'sessions', occurrence.conversationId, 'runs', run.id, 'waiting-draft.md'), content: draft.content }
    expect(await readFile(state.questionDraft.path, 'utf8')).toBe(draft.content)
    await runtime.reviewFile('实际执行后提问的原草稿', state.questionDraft.path)
    await runtime.reviewData('执行后提问的已提交原运行和单次副作用', { phase, run, work: state.work, draft })
  }
  await runtime.reviewData('真实定时等待与固定原问题', { occurrence: state.occurrence, question: state.question, work: state.work })
})
When('用户从任务查看本次触发与原问题并发送普通问候', async ({ runtime, completeViews: state }) => {
  await openSourceChat(runtime, state.occurrence!.conversationId); await pane(runtime, '任务')
  await expect(workCard(runtime, state.work!.id)).toContainText('工作视图原问题验收')
  await workCard(runtime, state.work!.id).getByRole('button', { name: '查看本次触发', exact: true }).click()
  await expect(runtime.page.locator(`[data-occurrence-id="${state.occurrence!.id}"]`)).toBeVisible()
  await runtime.reviewCheckpoint('工作卡回查固定本次定时触发')
  await openSourceChat(runtime, state.occurrence!.conversationId); await pane(runtime, '任务')
  await workCard(runtime, state.work!.id).getByRole('button', { name: '查看问题', exact: true }).click()
  await expect(runtime.page.locator(`#message-${state.question!.messageId}`)).toBeVisible()
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('这条是日常问候，请不要作为文件任务补充。')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
})
Then('普通问候不接续原定时工作', async ({ runtime, completeViews: state }) => {
  const detail = await settled(runtime, state.occurrence!.conversationId)
  const ordinary = detail.messages.find(message => message.content === '这条是日常问候，请不要作为文件任务补充。')!
  expect(ordinary.origin).toBeUndefined(); expect(ordinary.inboxReply).toBeUndefined()
  expect(detail.workItems).toEqual([state.work])
  expect((await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), state.occurrence!.id)).status).toBe('waiting_user')
  await runtime.reviewCheckpoint('普通问候后原定时问题仍等待明确补充')
})
When('原问题明确补充已提交但回复失联后切换三视图', async ({ runtime, completeViews: state }) => {
  await runtime.page.locator(`#message-${state.question!.messageId}`).getByRole('button', { name: '回复此问题', exact: true }).click()
  await pane(runtime, '任务'); await pane(runtime, '文件'); await pane(runtime, '聊天')
  await expect(runtime.page.locator('.reply-preview')).toContainText('正在补充这一次定时任务')
  state.replyFault = await loseAutomationReply(runtime)
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('交付给本人，请沿原任务发布真实报告。')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(runtime.page.getByRole('region', { name: '待核对补充', exact: true })).toBeVisible()
  const fault = await state.replyFault.inspect(); expect(fault.submissions).toHaveLength(1); state.reply = fault.submissions[0]
  expect(state.reply).toMatchObject({ occurrenceId: state.occurrence!.id, question: { expectedVersion: state.question!.question!.revision, questionMessageId: state.question!.messageId } })
  await cycle(runtime, state.occurrence!.conversationId)
  await expect(runtime.page.getByRole('region', { name: '待核对补充', exact: true })).toBeVisible()
})
Then('原定时工作沿原预算交付且未知补充只读核对', async ({ runtime, completeViews: state }) => {
  const detail = await settled(runtime, state.occurrence!.conversationId, 1)
  expect(detail.workItems).toHaveLength(1)
  expect(detail.workItems![0]).toMatchObject({ id: state.work!.id, status: 'delivered', budgetId: state.work!.budgetId, sourceMessageId: state.work!.sourceMessageId, origin: state.work!.origin })
  const occurrence = await runtime.page.evaluate(id => window.boai.request('getAutomationOccurrence', { id }), state.occurrence!.id)
  expect(occurrence).toMatchObject({ id: state.occurrence!.id, budgetId: state.occurrence!.budgetId, budget: { deadlineAt: state.occurrence!.budget!.deadlineAt } })
  const replies = detail.messages.filter(message => message.inboxReply?.questionId === `occurrence:${state.reply!.occurrenceId}`)
  expect(replies).toHaveLength(1); expect(replies[0]).toMatchObject({ origin: { occurrenceId: occurrence.id }, inboxReply: { questionMessageId: state.question!.messageId, questionRevision: state.question!.question!.revision } })
  if (state.questionDraft) {
    expect(state.fixture!.executionQuestions[0].writeRequests).toBe(1)
    expect(await readFile(state.questionDraft.path, 'utf8')).toBe(state.questionDraft.content)
    await runtime.reviewFile('补充后未被重放的原草稿', state.questionDraft.path)
  }
  state.before = await artifactRecords(state.fixture!.dataPath); state.calls = state.fixture!.endpoint.requests.length
  await runtime.reviewFile('定时明确补充后真实交付', (detail.artifacts[0] as ArtifactVersion).path)
  await runtime.restart(); await openSourceChat(runtime, occurrence.conversationId); await pane(runtime, '聊天')
  await runtime.page.getByRole('region', { name: '待核对补充', exact: true }).getByRole('button', { name: '核对补充结果', exact: true }).click()
  await expect(runtime.page.getByText('已向原问题提交补充。', { exact: true })).toBeVisible()
  expect(await artifactRecords(state.fixture!.dataPath)).toEqual(state.before)
  expect(state.fixture!.endpoint.requests).toHaveLength(state.calls!)
  await runtime.reviewData('固定触发版本与零重放', { before: state.occurrence, after: occurrence, reply: state.reply, accepted: replies[0], providerRequests: state.calls })
  await runtime.reviewCheckpoint('重启仅核对原定时问题补充')
})

When('用户在原消息采用并修订后导出完整备份', async ({ runtime, completeViews: state }) => {
  await artifactCard(runtime, state.original!.id).getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect(artifactCard(runtime, state.original!.id).getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
  await artifactCard(runtime, state.original!.id).getByRole('button', { name: '要求修改', exact: true }).click()
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('补充恢复后能够核对的原材料来源与验收。')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  const detail = await settled(runtime, state.fixture!.group.id, 2)
  state.revised = detail.artifacts.find(item => item.previousArtifactId === state.original!.id) as ArtifactVersion
  await runtime.reviewFile('备份前第二版原件', state.revised.path)
  await pane(runtime, '任务'); await pane(runtime, '文件')
  state.before = await artifactRecords(state.fixture!.dataPath); state.calls = state.fixture!.endpoint.requests.length
  const destination = join(runtime.root, 'backup-exports'); await mkdir(destination)
  await runtime.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, destination)
  state.backup = (await runtime.page.evaluate(() => window.boai.request('exportBackup', undefined)))!
  const manifest = JSON.parse(await readFile(join(state.backup, 'backup.json'), 'utf8'))
  expect(manifest).toMatchObject({ credentialsIncluded: false, appearanceIncluded: true, automationRestorePolicy: 'paused' })
  await runtime.reviewData('真实备份与恢复边界', manifest)
  await runtime.reviewCheckpoint('备份前最新v2与本人采用v1')
})
When('自动化按恢复说明在独立新目录启动该备份', async ({ runtime, completeViews: state }) => {
  await runtime.close()
  state.restored = join(await realpath(runtime.root), 'restored-data')
  await mkdir(state.restored); await cp(state.backup!, join(state.restored, 'v2'), { recursive: true })
  await runtime.start({ dataDir: state.restored })
})
Then('工作与文件可从新视图准确读取且没有重放模型工具或采用', async ({ runtime, completeViews: state }) => {
  await openSourceChat(runtime, state.fixture!.group.id)
  const detail = await artifactDetail(runtime, state.fixture!.group.id)
  expect(detail.messages).toEqual(state.before!.messages.filter(message => message.conversationId === state.fixture!.group.id))
  expect(detail.workItems).toEqual(state.before!.workItems)
  await pane(runtime, '任务'); await expect(workCard(runtime, state.original!.sourceWorkId!)).toContainText('已交付')
  await pane(runtime, '文件')
  const row = runtime.page.locator(`[data-file-id="${state.revised!.id}"]:visible`).first()
  await expect(row).toContainText(state.revised!.name)
  await expect(row.getByRole('button', { name: /^历史版本/ })).toHaveCount(0)
  await row.getByRole('button', { name: '预览', exact: true }).click()
  await expect(runtime.page.locator(`[data-artifact-id="${state.revised!.id}"]:visible`)).toContainText('ARTIFACT_V2')
  const restored = await artifactRecords(join(state.restored!, 'v2'))
  expect(restored.adoptionEvents).toEqual(state.before!.adoptionEvents); expect(restored.adoptionCurrent).toEqual(state.before!.adoptionCurrent)
  expect(restored.artifacts.map(a => [a.id, a.contentHash, a.logicalArtifactId, a.contentVersion])).toEqual(state.before!.artifacts.map(a => [a.id, a.contentHash, a.logicalArtifactId, a.contentVersion]))
  for (const artifact of restored.artifacts) { expect(artifact.path.startsWith(state.restored!)).toBe(true); await runtime.reviewFile(`新目录恢复成果v${artifact.contentVersion}`, artifact.path) }
  expect(state.fixture!.endpoint.requests).toHaveLength(state.calls!)
  await runtime.reviewData('新目录恢复的真实版本采用与工作', { work: restored.workItems, artifacts: restored.artifacts, adopted: restored.adoptionCurrent, providerRequests: state.calls })
  await runtime.reviewCheckpoint('新目录恢复后三视图与固定原采用版本')
})
