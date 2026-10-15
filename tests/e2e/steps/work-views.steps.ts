/*
 * [OUTPUT]: 文件清单仅当前文件与来源操作，不展示版号/采用状态/历史入口。
 * [INPUT]: 工作视图中文场景、隔离Electron和真实Mastra工具/材料/成果链。
 * [OUTPUT]: 宿主来源核对完成后的真实会话清理与迟到回复不导航、不恢复原消息/文件/Work。
 * [OUTPUT]: 同源任务、草稿/隐藏阅读、版本/采用分离、Shiki、迟到导航与未知回执重启的实际界面及原件证据。
 * [POS]: WV桌面业务步骤；模型输出离线控制，业务事务与工具走生产实现。
 * [PROTOCOL]: 修改时同步Header及所属.folder.md。
 */
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { join } from 'node:path'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { prepareArtifactsDesktop, artifactDetail, artifactRecords, artifactReplyFault, artifactPendingRequests } from '../support/artifacts'
import { nextMaterialDialog } from '../support/materials'
import { messageDraft } from '../support/editor-controls'
import { observeWorkViews } from '../support/work-views'
import type { ArtifactVersion } from '../../../src/shared/domain/artifacts'

interface State {
  fixture?: Awaited<ReturnType<typeof prepareArtifactsDesktop>>
  before?: Awaited<ReturnType<typeof artifactRecords>>
  calls?: number
  original?: ArtifactVersion
  revised?: ArtifactVersion
  observation?: Awaited<ReturnType<typeof observeWorkViews>>
  fault?: Awaited<ReturnType<typeof artifactReplyFault>>
  pending?: Awaited<ReturnType<typeof artifactPendingRequests>>
}
export const test = base.extend<{ workViews: State }>({ workViews: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const draftText = '这份草稿保持原会话，不提交任何工作。'
const code = 'export const delivery: string = "EMPLOYEE_CODE_PREVIEW"\nconst html = "<script>not executable</script>"\n'
const main = (page: Page) => page.getByRole('navigation', { name: '主导航', exact: true })
const files = (page: Page) => page.getByRole('region', { name: '会话文件', exact: true })
const task = (page: Page, id: string) => page.locator(`[data-work-id="${id}"]:visible`)
const file = (page: Page, id: string) => files(page).locator(`[data-file-id="${id}"]`).first()
const preview = (page: Page, artifact: ArtifactVersion) => page.locator(`[data-artifact-id="${artifact.id}"]:visible`)
const card = (page: Page, artifact: ArtifactVersion) => page.locator(`.messages [data-chat-artifact-id="${artifact.id}"]`)
async function select(runtime: Desktop, title: string) {
  await main(runtime.page).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${title}`) }).click()
}
async function pane(runtime: Desktop, label: '聊天' | '任务' | '文件') {
  await runtime.page.getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: label, exact: true }).click()
  await expect(runtime.page.locator('.chat-panel')).toHaveAttribute('data-conversation-view', { 聊天: 'chat', 任务: 'tasks', 文件: 'files' }[label])
}
async function settled(runtime: Desktop, id: string, count: number) {
  await expect.poll(async () => { const detail = await artifactDetail(runtime, id); return detail.artifacts.length === count && detail.runs.length > 0 && detail.runs.every(run => run.status === 'completed') && detail.turns!.every(turn => turn.status === 'completed') }, { timeout: 30_000 }).toBe(true)
  return artifactDetail(runtime, id)
}
async function prepare(runtime: Desktop, state: State, withMaterial: boolean, withCode = false) {
  state.fixture = await prepareArtifactsDesktop(runtime, withCode ? { file: { name: '交付模块.ts', fileName: 'delivery.ts', content: code } } : undefined)
  const fixture = state.fixture; await select(runtime, fixture.group.title)
  if (withMaterial) {
    await nextMaterialDialog(runtime, { path: fixture.source })
    await runtime.page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
    await runtime.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
    await expect(runtime.page.locator('[data-material-draft-id]')).toHaveAttribute('data-material-status', 'ready')
  }
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('请执行文件任务，发布可检查的交付报告。')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  const detail = await settled(runtime, fixture.group.id, 1); state.original = detail.artifacts[0] as ArtifactVersion
  expect(fixture.errors).toEqual([])
  await runtime.reviewFile(`交付原件 · ${state.original.name} · v1`, state.original.path)
  if (withMaterial) await runtime.reviewFile('输入原件 · 依据.txt', join(fixture.dataPath, 'materials', fixture.group.id, detail.materials![0].id, 'original'))
  await runtime.reviewData('交付的明确工作与原消息', { artifact: state.original, work: detail.workItems?.find(work => work.id === state.original!.sourceWorkId), messages: detail.messages })
  await runtime.reviewCheckpoint('原员工在聊天完成交付')
}
Given('工作视图已有隔离的员工群聊与私聊', async ({ runtime, workViews }) => { workViews.fixture = await prepareArtifactsDesktop(runtime); await select(runtime, workViews.fixture.group.title) })
When('用户带着草稿切换任务文件和全局任务', async ({ runtime, workViews }) => {
  const fixture = workViews.fixture!
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(draftText)
  workViews.before = await artifactRecords(fixture.dataPath); workViews.calls = fixture.endpoint.requests.length
  workViews.observation = await observeWorkViews(runtime)
  await pane(runtime, '任务'); await expect(runtime.page.getByText('暂无符合条件的工作。', { exact: true })).toBeVisible()
  await runtime.reviewCheckpoint('当前会话任务空态，聊天草稿保留')
  await pane(runtime, '文件'); await expect(files(runtime.page)).toContainText('暂无符合条件的文件。')
  const reading = (await workViews.observation.inspect()).calls.filter(name => name === 'getConversationView' || name === 'observeConversationReading').length
  await main(runtime.page).getByRole('button', { name: '任务', exact: true }).click()
  await expect(runtime.page.getByRole('main', { name: '全局任务', exact: true })).toBeVisible()
  await expect(runtime.page.getByRole('main', { name: '全局任务' }).locator('[aria-label="任务看板"]')).toBeVisible()
  await runtime.reviewCheckpoint('全局任务五列看板')
  await main(runtime.page).getByRole('button', { name: '会话', exact: true }).click()
  await expect(files(runtime.page)).toBeVisible()
  await runtime.page.waitForTimeout(250)
  expect((await workViews.observation.inspect()).calls.filter(name => name === 'getConversationView' || name === 'observeConversationReading')).toHaveLength(reading)
  await select(runtime, fixture.other.title); await select(runtime, fixture.group.title)
  await expect(files(runtime.page)).toBeVisible(); await pane(runtime, '聊天')
})
Then('原草稿和会话视图保持且读取没有创造业务工作', async ({ runtime, workViews }) => {
  expect(await messageDraft(runtime.page.getByRole('textbox', { name: '消息内容', exact: true }))).toBe(draftText)
  const after = await artifactRecords(workViews.fixture!.dataPath)
  expect(after.workItems).toEqual(workViews.before!.workItems); expect(after.messages).toEqual(workViews.before!.messages)
  expect(workViews.fixture!.endpoint.requests).toHaveLength(workViews.calls!)
  await runtime.reviewData('切视图的零业务提交', { workCount: after.workItems.length, providerRequests: workViews.calls, ipcCalls: (await workViews.observation!.inspect()).calls })
  await runtime.reviewCheckpoint('回到聊天，原草稿原会话保持')
})
Given('工作视图已有真实材料和第一版交付', async ({ runtime, workViews }) => prepare(runtime, workViews, true))
Given('工作视图已有真实代码交付', async ({ runtime, workViews }) => prepare(runtime, workViews, false, true))
When('用户从会话与全局任务核对同一工作', async ({ runtime, workViews }) => {
  const artifact = workViews.original!, fixture = workViews.fixture!
  workViews.before = await artifactRecords(fixture.dataPath); workViews.calls = fixture.endpoint.requests.length
  await pane(runtime, '任务'); await expect(task(runtime.page, artifact.sourceWorkId!)).toContainText('已交付')
  await task(runtime.page, artifact.sourceWorkId!).locator('summary').filter({ hasText: /^工作详情$/ }).click()
  await expect(task(runtime.page, artifact.sourceWorkId!).locator('details')).toHaveJSProperty('open', true)
  await pane(runtime, '文件'); await pane(runtime, '任务')
  await expect(task(runtime.page, artifact.sourceWorkId!).locator('details')).toHaveJSProperty('open', true)
  await expect(task(runtime.page, artifact.sourceWorkId!)).toHaveAttribute('data-selected', 'true')
  await runtime.reviewCheckpoint('会话任务引用原工作与交付文件')
  await main(runtime.page).getByRole('button', { name: '任务', exact: true }).click()
  await expect(task(runtime.page, artifact.sourceWorkId!)).toBeVisible()
  await runtime.page.getByRole('tab', { name: '列表', exact: true }).click()
  await expect(task(runtime.page, artifact.sourceWorkId!)).toContainText('成果作者')
  await runtime.reviewCheckpoint('全局列表显示同一工作和员工')
  await task(runtime.page, artifact.sourceWorkId!).getByRole('button', { name: '查看原聊天', exact: true }).click()
  await expect(runtime.page.locator(`#message-${workViews.before!.workItems.find(work => work.id === artifact.sourceWorkId)!.sourceMessageId}`)).toBeVisible()
  await expect(runtime.page.locator('.chat-panel')).toHaveAttribute('data-conversation-view', 'chat')
  await pane(runtime, '文件'); await expect(file(runtime.page, artifact.id)).toContainText('员工交付')
  const detail = await artifactDetail(runtime, fixture.group.id)
  await expect(file(runtime.page, detail.materials![0].id)).toContainText('输入材料')
  await expect(files(runtime.page).getByRole('button', { name: /^(采用此版本|要求修改|允许这次执行)$/ })).toHaveCount(0)
  await file(runtime.page, artifact.id).getByRole('button', { name: '预览', exact: true }).click()
  await expect(preview(runtime.page, artifact)).toContainText('ARTIFACT_V1')
  const after = await artifactRecords(fixture.dataPath); expect(after.workItems).toEqual(workViews.before!.workItems); expect(after.adoptionEvents).toEqual([])
  expect(fixture.endpoint.requests).toHaveLength(workViews.calls!)
  await runtime.reviewCheckpoint('文件清单与只读Markdown预览')
})
When('用户在原聊天采用旧版并要求员工修订', async ({ runtime, workViews }) => {
  const artifact = workViews.original!, fixture = workViews.fixture!
  await pane(runtime, '聊天')
  await card(runtime.page, artifact).getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect(card(runtime.page, artifact).getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
  await card(runtime.page, artifact).getByRole('button', { name: '要求修改', exact: true }).click()
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('补充明确验收条件，并发布修订后的报告。')
  await pane(runtime, '任务'); await pane(runtime, '文件'); await pane(runtime, '聊天')
  await expect(runtime.page.locator('[aria-label="修改交付文件"]')).toContainText(artifact.name)
  await runtime.reviewCheckpoint('原聊天同一输入框固定旧版修订')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  const detail = await settled(runtime, fixture.group.id, 2); workViews.revised = detail.artifacts.find(value => value.previousArtifactId === artifact.id) as ArtifactVersion
  expect(workViews.revised).toMatchObject({ previousArtifactId: artifact.id, contentVersion: 2, logicalArtifactId: artifact.logicalArtifactId })
  await runtime.reviewFile('交付原件 · 修订 v2', workViews.revised.path)
})
Then('文件清单展示当前文件且不提供版本管理', async ({ runtime, workViews }) => {
  const old = workViews.original!, latest = workViews.revised!, fixture = workViews.fixture!
  await expect(preview(runtime.page, old)).toContainText('ARTIFACT_V1'); await pane(runtime, '文件')
  await expect(file(runtime.page, latest.id)).toContainText(latest.name)
  await expect(files(runtime.page).getByRole('button', { name: /^历史版本/ })).toHaveCount(0)
  await expect(file(runtime.page, latest.id)).not.toContainText(/最新内容 v|本人采用 v|最新版未采用/)
  await expect(file(runtime.page, old.id)).toHaveCount(0)
  await file(runtime.page, latest.id).getByRole('button', { name: '预览', exact: true }).click()
  await expect(preview(runtime.page, latest)).toContainText('ARTIFACT_V2')
  await runtime.reviewCheckpoint('文件清单只显示文件，不提供版本管理')
  const before = await artifactRecords(fixture.dataPath), calls = fixture.endpoint.requests.length
  await runtime.restart(); await select(runtime, fixture.group.title)
  await expect(files(runtime.page)).toBeVisible(); await expect(file(runtime.page, latest.id)).toContainText(latest.name)
  await file(runtime.page, latest.id).getByRole('button', { name: '预览', exact: true }).click()
  await expect(preview(runtime.page, latest)).toContainText('ARTIFACT_V2')
  const after = await artifactRecords(fixture.dataPath)
  expect(after.artifacts).toEqual(before.artifacts); expect(after.adoptionEvents).toEqual(before.adoptionEvents); expect(fixture.endpoint.requests).toHaveLength(calls)
  await runtime.reviewData('重启的真实版本与采用记录', { artifacts: after.artifacts, adopted: after.adoptionCurrent, events: after.adoptionEvents, providerRequests: calls })
  await runtime.reviewCheckpoint('重启后文件视图和已提交版本保持')
})
When('用户从文件视图打开代码并切换深色窄窗', async ({ runtime, workViews }) => {
  const artifact = workViews.original!
  workViews.before = await artifactRecords(workViews.fixture!.dataPath); workViews.calls = workViews.fixture!.endpoint.requests.length
  await pane(runtime, '文件'); await file(runtime.page, artifact.id).getByRole('button', { name: '预览', exact: true }).click()
  await expect(preview(runtime.page, artifact).locator('pre.shiki-code-block')).toHaveAttribute('data-language', /^(ts|typescript)$/)
  await runtime.reviewCheckpoint('文件视图Shiki浅色代码预览')
  await runtime.page.evaluate(async () => { const state = await window.boai.request('getAppearance', undefined); await window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: state.revision }) })
  await expect(runtime.page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await runtime.app.evaluate(({ BrowserWindow }) => { const win = BrowserWindow.getAllWindows().find(win => win.getTitle().includes('boai') || win.isVisible())!; win.setSize(1000, 760) })
  await expect(preview(runtime.page, artifact).locator('.shiki-token').first()).toBeVisible()
  await runtime.reviewCheckpoint('深色窄窗真实代码高亮')
})
Then('代码原件高亮与键盘标签可用且没有隐式采用', async ({ runtime, workViews }) => {
  const artifact = workViews.original!, view = preview(runtime.page, artifact)
  for (const [index, line] of code.trimEnd().split('\n').entries()) await expect(view.locator(`[data-file-line="${index + 1}"] .shiki-line-content`)).toHaveText(line)
  await expect(view.locator('script, iframe')).toHaveCount(0)
  const tabs = runtime.page.getByRole('tablist', { name: '会话视图', exact: true })
  await tabs.getByRole('tab', { name: '文件', exact: true }).focus(); await runtime.page.keyboard.press('ArrowLeft'); await runtime.page.keyboard.press('Enter')
  await expect(runtime.page.locator('.chat-panel')).toHaveAttribute('data-conversation-view', 'tasks')
  const after = await artifactRecords(workViews.fixture!.dataPath)
  expect(after.adoptionEvents).toEqual([]); expect(after.workItems).toEqual(workViews.before!.workItems); expect(workViews.fixture!.endpoint.requests).toHaveLength(workViews.calls!)
  await runtime.reviewCheckpoint('键盘返回任务，未隐式采用或执行')
})
When('用户发起工作来源定位后立即切换文件视图', async ({ runtime, workViews }) => {
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(draftText)
  await pane(runtime, '任务'); workViews.observation = await observeWorkViews(runtime, 'resolveWorkViewTarget')
  await task(runtime.page, workViews.original!.sourceWorkId!).getByRole('button', { name: '查看原聊天', exact: true }).click()
  await expect.poll(async () => (await workViews.observation!.inspect()).delayed).toBe(true)
  await pane(runtime, '文件'); await expect(files(runtime.page)).toBeVisible(); await workViews.observation.release()
})
Then('迟到的来源回复不改变当前视图和草稿', async ({ runtime }) => {
  await runtime.page.waitForTimeout(250)
  await expect(runtime.page.locator('.chat-panel')).toHaveAttribute('data-conversation-view', 'files')
  await runtime.reviewCheckpoint('迟到工作来源被隔离，当前文件视图保留')
  await pane(runtime, '聊天'); expect(await messageDraft(runtime.page.getByRole('textbox', { name: '消息内容', exact: true }))).toBe(draftText)
})
When('原聊天采用已经提交但回执暂时失联', async ({ runtime, workViews }) => {
  workViews.fault = await artifactReplyFault(runtime, 'adoption')
  await card(runtime.page, workViews.original!).getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: '核对采用结果', exact: true })).toBeVisible()
  workViews.pending = await artifactPendingRequests(runtime); workViews.before = await artifactRecords(workViews.fixture!.dataPath); workViews.calls = workViews.fixture!.endpoint.requests.length
  expect((await workViews.fault.inspect()).submissions).toHaveLength(1)
  await runtime.reviewCheckpoint('采用已提交但回执未知，原聊天保留核对入口')
})
When('用户经过任务文件全局任务后重启应用', async ({ runtime, workViews }) => {
  await pane(runtime, '任务'); await pane(runtime, '文件')
  await main(runtime.page).getByRole('button', { name: '任务', exact: true }).click()
  expect(await artifactPendingRequests(runtime)).toEqual(workViews.pending)
  await runtime.restart(); await select(runtime, workViews.fixture!.group.title); await pane(runtime, '聊天')
})
Then('采用身份保持且没有重复采用或执行工具', async ({ runtime, workViews }) => {
  const artifact = workViews.original!
  await expect(card(runtime.page, artifact).getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
  expect(await artifactPendingRequests(runtime)).toEqual(workViews.pending)
  await runtime.page.getByRole('button', { name: '核对采用结果', exact: true }).click()
  await expect.poll(async () => Object.keys(await artifactPendingRequests(runtime)).length).toBe(0)
  const after = await artifactRecords(workViews.fixture!.dataPath)
  expect(after.adoptionEvents).toEqual(workViews.before!.adoptionEvents); expect(after.artifacts).toEqual(workViews.before!.artifacts); expect(after.workItems).toEqual(workViews.before!.workItems)
  expect(workViews.fixture!.endpoint.requests).toHaveLength(workViews.calls!)
  await runtime.reviewData('重启只读核对未知采用', { pendingBefore: workViews.pending, adoptionEvents: after.adoptionEvents, providerRequests: workViews.calls })
  await runtime.reviewCheckpoint('重启核对原采用，未重复执行')
})

When('全局来源核对完成但回复未返回时原会话被清空', async ({ runtime, workViews }) => {
  await main(runtime.page).getByRole('button', { name: '任务', exact: true }).click()
  workViews.observation = await observeWorkViews(runtime, 'resolveConversationSearchTarget')
  await task(runtime.page, workViews.original!.sourceWorkId!).getByRole('button', { name: '查看原聊天', exact: true }).click()
  await expect.poll(async () => (await workViews.observation!.inspect()).delayed).toBe(true)
  await runtime.page.evaluate(id => window.boai.request('clearConversationHistory', { id, hide: false }), workViews.fixture!.group.id)
  await workViews.observation.release()
})
Then('迟到回复不导航或恢复原消息文件和工作', async ({ runtime, workViews }) => {
  await runtime.page.waitForTimeout(250)
  await expect(runtime.page.getByRole('main', { name: '全局任务', exact: true })).toBeVisible()
  await expect(task(runtime.page, workViews.original!.sourceWorkId!)).toHaveCount(0)
  const records = await artifactRecords(workViews.fixture!.dataPath)
  expect(records.workItems.filter(work => work.conversationId === workViews.fixture!.group.id)).toEqual([])
  expect(records.messages.filter(message => message.conversationId === workViews.fixture!.group.id)).toEqual([])
  expect(records.artifacts.filter(artifact => artifact.conversationId === workViews.fixture!.group.id)).toEqual([])
  await runtime.reviewData('来源清理后的已提交事实', { remainingWork: records.workItems.length, remainingMessages: records.messages.length, remainingArtifacts: records.artifacts.length })
  await runtime.reviewCheckpoint('已清理来源的迟到回复未离开全局任务')
})
