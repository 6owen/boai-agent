/*
 * [OUTPUT]: 文件标题/菜单无版号、历史、对比或记录；通过原消息打开交付文件，迟到预览清理仍核验。
 * [OUTPUT]: 主进程启停文本插件时当前正文节点保持，关闭重开回退/恢复不改业务原件。
 * [OUTPUT]: 真实文本/附件/PDF/Office入口核对内置插件身份，沿原稳定阅读/修改/清理断言。
 * [OUTPUT]: 后台事件保留正文/选区/滚动/二进制与diff节点；文件修改完成自动切版一次，回看旧版不被抢回。
 * [OUTPUT]: 直接迁入原版SelectionActions：横向展开五动作、同排员工Select、24px/无聚焦线及收起后真实提交；无下方表单。
 * [OUTPUT]: Selection Actions同一Popover直接提交/结果，验证零底部会话、草稿隔离与未知重启只核对。
 * [OUTPUT]: 文件预览内修改/独立草稿/选文Popover、实际新版本和主区不跳转回归。
 * [OUTPUT]: 2026-10-15文件预览标注进入原聊天明确修改；成果固定版本修订、附件固定来源/权限和未知回执保持；实际结果归8组14。
 * [OUTPUT]: 标题修改按钮退役，修改流程由正文选区触发；原采用零记录、固定来源与未知不重放断言保持。
 * [OUTPUT]: 源码隐藏行号栏，来源定位核对实际选中正文行。
 * [OUTPUT]: 成果版本/对比/记录改从header菜单访问；固定版本、来源和无额外业务写入断言保持。
 * [OUTPUT]: Lody四格式经原批准命令/真实工具发布后核hash阅读；同名家族隔离、缺失与迟到diff清理，零额外业务写入。
 * [OUTPUT]: 可选功能审阅留存真实交付原件、版号/来源、原消息修改输入、采用与重启关键画面。
 * [INPUT]: D2 中文成果场景、生产 Electron UI/IPC、真实模型工具与隔离 SQLite/原件。
 * [OUTPUT]: 原员工消息内采用/同一composer修订及取消关联后的普通发送隔离，右侧仅固定版本预览；所见版本/来源、真实工具证据、未知回执跨关闭重启冻结原请求、原件失效及清理隔离。
 * [POS]: 成果 Electron 业务步骤；HTTP、文件准备和传输故障由 support 承担。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page, type Locator } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { join } from 'node:path'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { nextMaterialDialog } from '../support/materials'
import { observeWorkViews } from '../support/work-views'
import { selectPreviewLine, selectPreviewText } from '../support/file-preview'
import { sampleDocx, sampleXlsx, samplePptx, createSamplePdf } from '../../lody/office-viewer-files'
import { messageDraft } from '../support/editor-controls'
import { artifactDetail, artifactOriginal, artifactPendingRequests, artifactRecords, artifactReplyFault, changeArtifactOriginal, prepareArtifactsDesktop, removeArtifactOriginal } from '../support/artifacts'
import type { ArtifactAdoptionInput, ArtifactRevisionInput, ArtifactVersion } from '../../../src/shared/domain/artifacts'
import type { ConversationDetail } from '../../../src/shared/domain'
import type { ConversationMaterial } from '../../../src/shared/domain/materials'

type Fault = Awaited<ReturnType<typeof artifactReplyFault>>
interface State {
  fixture?: Awaited<ReturnType<typeof prepareArtifactsDesktop>>
  originals: ArtifactVersion[]
  other?: ArtifactVersion
  v2?: ArtifactVersion
  material?: ConversationMaterial
  originalDetail?: ConversationDetail
  fault?: Fault
  frozen?: ArtifactAdoptionInput | ArtifactRevisionInput
  beforeRecovery?: Awaited<ReturnType<typeof artifactRecords>>
  calls?: number
  binaryKind?: string
}
export const test = base.extend<{ artifactsState: State }>({ artifactsState: async ({}, use) => use({ originals: [] }) })
const { Given, When, Then } = createBdd(test)
const panel = (page: Page, artifact: ArtifactVersion) => page.locator(`[data-artifact-id="${artifact.id}"]:visible`)
const card = (page: Page, artifact: ArtifactVersion) => page.locator(`.messages [data-chat-artifact-id="${artifact.id}"]`)
const chat = (page: Page) => page.locator('.messages')
const CODE_ARTIFACT_TEXT = 'export const delivery: string = "EMPLOYEE_CODE_PREVIEW"\nconst html = "<script>not executable</script>"\n'
const INDEPENDENT_REQUEST = '请独立发布另一份报告，保留此前交付的原版。'
async function selectChat(runtime: Desktop, title: string) { await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${title}`) }).click() }
async function settled(runtime: Desktop, conversationId: string, artifactCount: number) {
  await expect.poll(async () => {
    const detail = await artifactDetail(runtime, conversationId)
    return detail.artifacts.length === artifactCount && !!detail.runs.length && detail.runs.every(run => ['completed', 'cancelled', 'failed', 'interrupted'].includes(run.status)) && detail.turns!.every(turn => ['completed', 'cancelled', 'failed', 'interrupted'].includes(turn.status))
  }, { timeout: 30_000 }).toBe(true)
  const detail = await artifactDetail(runtime, conversationId)
  expect(detail.runs.every(run => run.status === 'completed')).toBe(true)
  return detail
}
async function publish(runtime: Desktop, state: State, conversationId: string, title: string, count: number, content = '请执行文件任务，发布可检查的交付报告。') {
  await selectChat(runtime, title)
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content)
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  const detail = await settled(runtime, conversationId, count)
  expect(state.fixture!.errors).toEqual([])
  const artifact = detail.artifacts.at(-1) as ArtifactVersion
  await reviewArtifact(runtime, artifact)
  return artifact
}
async function reviewArtifact(runtime: Desktop, artifact: ArtifactVersion) {
  await runtime.reviewFile(`${artifact.name} · 第 ${artifact.contentVersion} 版`, artifact.path)
  await runtime.reviewData(`成果身份 · ${artifact.id}`, { id: artifact.id, name: artifact.name, logicalArtifactId: artifact.logicalArtifactId, contentVersion: artifact.contentVersion, contentHash: artifact.contentHash, previousArtifactId: artifact.previousArtifactId, sourceMessageId: artifact.sourceMessageId, sourceWorkId: artifact.sourceWorkId, runId: artifact.runId })
}
async function openArtifact(runtime: Desktop, artifact: ArtifactVersion) {
  const detail = await artifactDetail(runtime, artifact.conversationId), message = detail.messages.find(value => value.id === artifact.sourceMessageId)
  expect(message).toBeDefined()
  await runtime.page.locator(`#message-${message!.id}`).getByRole('button', { name: `打开 ${artifact.name}`, exact: true }).click()
  await expect(panel(runtime.page, artifact)).toBeVisible()
  await expect(panel(runtime.page, artifact).getByRole('region', { name: '文件正文', exact: true })).toBeVisible()
  await expect(panel(runtime.page, artifact).getByRole('button', { name: /^(采用此版本|要求修改|稍后处理)$/ })).toHaveCount(0)
  await expectFileActions(runtime, artifact)
}
async function expectFileActions(runtime: Desktop, artifact: ArtifactVersion) {
  const view = panel(runtime.page, artifact)
  await expect(view.locator('[data-slot="file-preview-header"] [role="heading"]')).toHaveAttribute('title', artifact.name)
  await view.getByRole('button', { name: '文件操作', exact: true }).click()
  await expect(runtime.page.getByRole('menuitem', { name: /文件记录|历史版本|版本对比|查看最新版本/ })).toHaveCount(0)
  await expect(runtime.page.getByRole('menuitem', { name: '外部打开', exact: true })).toBeVisible()
  await runtime.page.keyboard.press('Escape')
}
async function expectAdoptionRecord(runtime: Desktop, artifact: ArtifactVersion, contentVersion?: number) {
  const preview = await runtime.page.evaluate(value => window.boai.request('getArtifactPreview', { id: value.id, expectedHash: value.contentHash }), artifact)
  if (contentVersion === undefined) expect(preview.adoption.current).toBeNull()
  else expect(preview.adoption.current?.contentVersion).toBe(contentVersion)
}
async function openDeliveredFile(runtime: Desktop, artifact: ArtifactVersion, number: number) {
  const selected = (await artifactDetail(runtime, artifact.conversationId)).artifacts.find(value => value.logicalArtifactId === artifact.logicalArtifactId && value.contentVersion === number) as ArtifactVersion
  await openArtifact(runtime, selected)
}
// Exercise the real event subscription and host reads without introducing a new business request.
async function backgroundPreviewCheck(runtime: Desktop, conversationId: string, node: Locator, method = 'getArtifactPreview') {
  const observation = await observeWorkViews(runtime, method)
  const retained = await node.elementHandle()
  expect(retained).not.toBeNull()
  await runtime.app.evaluate(({ BrowserWindow }, id) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('boai:event', { type: 'changed', conversationId: id })
  }, conversationId)
  await expect.poll(async () => (await observation.inspect()).delayed).toBe(true)
  expect(await retained!.evaluate(element => element.isConnected)).toBe(true)
  await observation.release()
  await expect.poll(async () => (await observation.inspect()).completed.filter(call => call === method).length).toBeGreaterThan(0)
  await runtime.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await retained!.evaluate(element => element.isConnected)).toBe(true)
  // A second verified read provides a barrier after the first background render.
  await runtime.app.evaluate(({ BrowserWindow }, id) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('boai:event', { type: 'changed', conversationId: id })
  }, conversationId)
  await expect.poll(async () => (await observation.inspect()).completed.filter(call => call === method).length).toBeGreaterThan(1)
  await runtime.page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  expect(await retained!.evaluate(element => element.isConnected)).toBe(true)
  await retained!.dispose()
}
async function requestRevision(runtime: Desktop, artifact: ArtifactVersion, content = '补充明确验收条件，并发布修订后的报告。') {
  await card(runtime.page, artifact).getByRole('button', { name: '要求修改', exact: true }).click()
  await expect(runtime.page.locator('.reply-preview')).toContainText(artifact.name)
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content)
  await runtime.reviewCheckpoint('在同一聊天输入框修改所见版本')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
}
async function initial(runtime: Desktop, state: State) {
  const fixture = state.fixture!, artifact = await publish(runtime, state, fixture.group.id, fixture.group.title, 1)
  state.originals = [artifact]; state.originalDetail = await artifactDetail(runtime, fixture.group.id)
  await openArtifact(runtime, artifact)
}
async function createV2(runtime: Desktop, state: State) {
  const fixture = state.fixture!, original = state.originals[0]
  await requestRevision(runtime, original)
  const detail = await settled(runtime, fixture.group.id, 2)
  state.v2 = detail.artifacts.find(value => value.previousArtifactId === original.id) as ArtifactVersion
  expect(state.v2).toBeDefined(); expect(fixture.errors).toEqual([])
  await reviewArtifact(runtime, state.v2)
}
async function expectFrozen(runtime: Desktop, state: State, kind: 'adoption' | 'revision') {
  const values = Object.values(await artifactPendingRequests(runtime)), pending = values.find(value => value.conversationId === state.fixture!.group.id && value.logicalArtifactId === state.originals[0].logicalArtifactId)
  expect(pending?.[kind]?.status).toBe('unknown'); expect(pending?.[kind]?.input).toEqual(state.frozen)
}

Given('成果协作组和独立私聊已连接真实工具协议模型', async ({ runtime, artifactsState }) => {
  artifactsState.fixture = await prepareArtifactsDesktop(runtime)
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  expect(artifactsState.fixture.endpoint.requests).toHaveLength(0)
})
Given('员工已在原聊天交付真实代码文件', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture = await prepareArtifactsDesktop(runtime, { file: { name: '交付模块.ts', fileName: 'delivery.ts', content: CODE_ARTIFACT_TEXT, revisionContent: CODE_ARTIFACT_TEXT.replace('EMPLOYEE_CODE_PREVIEW', 'EMPLOYEE_CODE_EDITED') } })
  artifactsState.originals = [await publish(runtime, artifactsState, fixture.group.id, fixture.group.title, 1, '请交付一份可检查的 TypeScript 代码文件。')]
  await expect(card(runtime.page, artifactsState.originals[0])).toBeVisible()
  await expect(runtime.page.locator('[data-artifact-id]:visible')).toHaveCount(0)
  await runtime.reviewCheckpoint('员工在原消息交付代码')
})
When('用户从员工文件消息直接打开代码预览', async ({ runtime, artifactsState }) => {
  const artifact = artifactsState.originals[0]
  artifactsState.beforeRecovery = await artifactRecords(artifactsState.fixture!.dataPath)
  artifactsState.calls = artifactsState.fixture!.endpoint.requests.length
  expect(artifactsState.beforeRecovery.adoptionEvents).toHaveLength(0)
  await openArtifact(runtime, artifact)
})
Then('右侧显示Shiki高亮原代码且预览不代表采用', async ({ runtime, artifactsState }) => {
  const artifact = artifactsState.originals[0], view = panel(runtime.page, artifact), before = artifactsState.beforeRecovery!
  await expect(view.locator('[data-file-preview-kind="code"]')).toBeVisible()
  await expect(view.locator('pre.shiki-code-block')).toHaveAttribute('data-language', /^(ts|typescript)$/)
  await expect(view.locator('.shiki-token').first()).toBeVisible()
  for (const [index, line] of CODE_ARTIFACT_TEXT.trimEnd().split('\n').entries()) await expect(view.locator(`[data-file-line="${index + 1}"] .shiki-line-content`)).toHaveText(line)
  await expect(view.locator('script, iframe')).toHaveCount(0)
  await expect(view.getByRole('button', { name: /^(让员工修改|修改选中内容)$/ })).toHaveCount(0)
  const after = await artifactRecords(artifactsState.fixture!.dataPath)
  expect(after.adoptionEvents).toEqual([])
  expect(after.messages).toEqual(before.messages)
  expect(after.workItems).toEqual(before.workItems)
  expect(await artifactOriginal(artifact)).toBe(CODE_ARTIFACT_TEXT)
  expect(artifactsState.fixture!.endpoint.requests).toHaveLength(artifactsState.calls!)
  await runtime.reviewCheckpoint('员工交付代码的 Shiki 预览')
})
When('用户用真实文本材料要求发布第一版报告', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!
  await selectChat(runtime, fixture.group.title); await nextMaterialDialog(runtime, { path: fixture.source })
  await runtime.page.getByRole('button', { name: '添加或更多操作', exact: true }).click(); await runtime.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
  await expect(runtime.page.locator('[data-material-draft-id]')).toHaveAttribute('data-material-status', 'ready')
  artifactsState.material = (await artifactDetail(runtime, fixture.group.id)).materials![0]
  await initial(runtime, artifactsState)
})
Then('第一版原文和材料引用都能检查来源', async ({ runtime, artifactsState }) => {
  const artifact = artifactsState.originals[0], material = artifactsState.material!, view = panel(runtime.page, artifact)
  expect(artifact.materialSources?.map(value => value.id)).toEqual([material.id])
  expect(await artifactOriginal(artifact)).toContain('ARTIFACT_V1')
  const raw = await runtime.page.evaluate(id => window.boai.request('getArtifactPreview', { id }), artifact.id)
  expect(raw.text).toBe(await artifactOriginal(artifact)); expect(raw.text).toContain(`material:${material.id}:text-v1:L2`)
  await expect(view).not.toContainText('审核通过')
  await view.getByRole('button', { name: '查看材料 依据.txt 第 2 至 2 行', exact: true }).click()
  const source = runtime.page.locator(`[data-material-preview-id="${material.id}"]:visible`)
  await expect(source).toContainText('ARTIFACT_MATERIAL_EVIDENCE')
  await expect(source.locator('[data-file-line="2"]')).toHaveAttribute('data-selected', 'true')
  await openArtifact(runtime, artifact)
  await runtime.reviewFile('原始输入材料 · 依据.txt', join(artifactsState.fixture!.dataPath, 'materials', material.conversationId, material.id, 'original'))
  await runtime.reviewCheckpoint('第一版报告与原消息')
})
When('用户明确要求修改第一版报告', async ({ runtime, artifactsState }) => createV2(runtime, artifactsState))
When('用户从文件预览提交修改并自动看到第二版', async ({ runtime, artifactsState: state }) => {
  await initial(runtime, state)
  const original = state.originals[0]
  await selectPreviewLine(panel(runtime.page, original))
  await runtime.page.getByRole('textbox', { name: '文件修改要求', exact: true }).fill('补充明确验收条件，并发布修订后的报告。')
  await runtime.page.getByRole('button', { name: '发送文件修改', exact: true }).click()
  await runtime.page.keyboard.press('Escape')
  await expect(runtime.page.getByRole('dialog', { name: '选文修改操作', exact: true })).toBeHidden()
  const detail = await settled(runtime, original.conversationId, 2)
  state.v2 = detail.artifacts.find(value => value.previousArtifactId === original.id) as ArtifactVersion
  expect(state.v2).toBeDefined()
  await expect(panel(runtime.page, state.v2)).toContainText('ARTIFACT_V2')
  await reviewArtifact(runtime, state.v2)
})
When('其他入口通过原宿主请求修订当前文件', async ({ runtime, artifactsState: state }) => {
  const original = state.originals[0]
  // Fixture uses the production revision command: it deliberately does not originate in the file popover.
  await runtime.page.evaluate(artifact => window.boai.request('reviseArtifact', { conversationId: artifact.conversationId, artifactId: artifact.id, contentHash: artifact.contentHash, targetAgentId: artifact.ownerAgentId!, content: '补充明确验收条件，并发布修订后的报告。', requestId: crypto.randomUUID() }), original)
  const detail = await settled(runtime, original.conversationId, 2)
  state.v2 = detail.artifacts.find(value => value.previousArtifactId === original.id) as ArtifactVersion
  expect(state.v2).toBeDefined()
  await reviewArtifact(runtime, state.v2)
})
Then('新版发布后当前审阅仍是第一版且原交付保持', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!, original = artifactsState.originals[0], v2 = artifactsState.v2!, view = panel(runtime.page, original), detail = await artifactDetail(runtime, fixture.group.id)
  await expect(view.getByRole('region', { name: '文件正文', exact: true })).toContainText('ARTIFACT_V1')
  await view.getByRole('button', { name: '文件操作', exact: true }).click()
  await expect(runtime.page.getByRole('menuitem', { name: '查看最新版本', exact: true })).toHaveCount(0)
  await runtime.page.keyboard.press('Escape')
  expect(await artifactOriginal(original)).toContain('ARTIFACT_V1'); expect(await artifactOriginal(v2)).toContain('ARTIFACT_V2')
  expect(v2).toMatchObject({ logicalArtifactId: original.logicalArtifactId, previousArtifactId: original.id, contentVersion: 2 })
  expect(v2.sourceWorkId).not.toBe(original.sourceWorkId)
  expect(detail.workItems?.find(value => value.id === original.sourceWorkId)).toEqual(artifactsState.originalDetail!.workItems!.find(value => value.id === original.sourceWorkId))
  expect(detail.workBudgets?.find(value => value.id === artifactsState.originalDetail!.workItems!.find(value => value.id === original.sourceWorkId)!.budgetId)).toEqual(artifactsState.originalDetail!.workBudgets!.find(value => value.id === artifactsState.originalDetail!.workItems!.find(value => value.id === original.sourceWorkId)!.budgetId))
  expect(fixture.replacements).toEqual([{ runId: v2.runId, revisionRequestId: v2.revisionRequestId }])
  const records = await artifactRecords(fixture.dataPath)
  expect(records.adoptionEvents).toHaveLength(0)
  const executionRuns = detail.runs.filter(run => run.phase === 'execution')
  expect(executionRuns).toHaveLength(2)
  expect(executionRuns.map(run => run.id).sort()).toEqual([original.runId, v2.runId].sort())
  const publicationRuns = [original, v2].map(artifact => detail.runs.find(run => run.id === artifact.runId))
  expect(new Set(publicationRuns.map(run => run?.id)).size).toBe(2)
  for (const run of publicationRuns) {
    expect(run).toBeDefined()
    expect(run!.phase).toBe('execution')
    expect(run!.status).toBe('completed')
    expect(run!.toolEvents.filter(value => value.status === 'completed').map(value => value.name)).toEqual(['write_file', 'publish_artifact', 'report_work'])
    expect(run!.toolEvents.some(value => value.status === 'failed')).toBe(false)
  }
  for (const run of detail.runs.filter(run => run.phase === 'decision')) expect(run.toolEvents).toEqual([])
  await runtime.reviewCheckpoint('新版已交付，正在阅读的旧版保持不变')
  await runtime.reviewData('实际聊天与修订关系', { messages: detail.messages.map(({ id, senderId, senderType, content, createdAt }) => ({ id, senderId, senderType, content, createdAt })), v1: original.id, v2: v2.id, previousArtifactId: v2.previousArtifactId, originalWorkId: original.sourceWorkId, revisionWorkId: v2.sourceWorkId })
})
When('用户打开并采用第二版报告', async ({ runtime, artifactsState }) => {
  await openArtifact(runtime, artifactsState.v2!)
  const view = panel(runtime.page, artifactsState.v2!)
  await expectFileActions(runtime, artifactsState.v2!)
  await expect(view.getByRole('region', { name: '文件正文', exact: true })).toContainText('ARTIFACT_V2')
  await expect(view).not.toContainText('审核通过')
  await card(runtime.page, artifactsState.v2!).getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect(card(runtime.page, artifactsState.v2!).getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
  await runtime.reviewCheckpoint('在员工原消息采用第二版')
})
Then('版本和采用随切页切聊天与重启保留且不重放工具', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!, v2 = artifactsState.v2!, original = artifactsState.originals[0], material = artifactsState.material!, calls = fixture.endpoint.requests.length
  await runtime.page.getByRole('button', { name: '通讯录', exact: true }).click(); await expect(runtime.page.locator('[data-artifact-id]:visible')).toHaveCount(0)
  await runtime.page.getByRole('button', { name: '会话', exact: true }).click(); await expect(panel(runtime.page, v2)).toBeVisible()
  await selectChat(runtime, fixture.other.title); await selectChat(runtime, fixture.group.title)
  await expectAdoptionRecord(runtime, v2, 2)
  const before = await artifactRecords(fixture.dataPath)
  await runtime.restart(); await selectChat(runtime, fixture.group.title); await openArtifact(runtime, original)
  await expectAdoptionRecord(runtime, original, 2); await openDeliveredFile(runtime, original, 2)
  await expect(card(runtime.page, v2).getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
  await panel(runtime.page, v2).getByRole('button', { name: '查看材料 依据.txt 第 2 至 2 行', exact: true }).click()
  await expect(runtime.page.locator(`[data-material-preview-id="${material.id}"]:visible`)).toContainText('ARTIFACT_MATERIAL_EVIDENCE')
  const after = await artifactRecords(fixture.dataPath)
  expect(after.artifacts).toEqual(before.artifacts); expect(after.materials).toEqual(before.materials); expect(after.adoptionEvents).toEqual(before.adoptionEvents)
  expect(fixture.endpoint.requests).toHaveLength(calls)
  await runtime.reviewData('重启后采用与版本核对', { adopted: after.adoptionCurrent, events: after.adoptionEvents, artifactIds: after.artifacts.map(value => value.id), providerRequestsBefore: calls, providerRequestsAfter: fixture.endpoint.requests.length })
  await runtime.reviewCheckpoint('重启后版本、采用和原材料保持')
})

When('用户用两个独立请求发布同名报告', async ({ runtime, artifactsState }) => {
  await initial(runtime, artifactsState)
  const fixture = artifactsState.fixture!, second = await publish(runtime, artifactsState, fixture.group.id, fixture.group.title, 2, '请执行另一个独立文件任务，发布同名报告。')
  artifactsState.originals.push(second)
})
Then('同名报告各有独立内容身份与版本家族', async ({ runtime, artifactsState }) => {
  const [first, second] = artifactsState.originals
  expect(first.name).toBe(second.name); expect(first.contentHash).not.toBe(second.contentHash); expect(first.id).not.toBe(second.id)
  for (const artifact of artifactsState.originals) {
    expect(artifact.logicalArtifactId).toBe(artifact.id); expect(artifact.contentVersion).toBe(1); expect(artifact.previousArtifactId).toBeUndefined()
    await openArtifact(runtime, artifact); await expect(panel(runtime.page, artifact).locator('[data-slot="file-preview-header"] [role="heading"]')).toHaveAttribute('title', artifact.name)
  }
})
When('用户采用第一份同名报告并重复明确选择同版', async ({ runtime, artifactsState }) => {
  const first = artifactsState.originals[0]; await openArtifact(runtime, first)
  await card(runtime.page, first).getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect(card(runtime.page, first).getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
  // A second actual user API intent must also be idempotent, even though the UI disables duplicate clicks.
  await runtime.page.evaluate(artifact => window.boai.request('adoptArtifact', { artifactId: artifact.id, contentHash: artifact.contentHash, expectedAdoptionRevision: 1, requestId: crypto.randomUUID() }), first)
})
Then('采用只记录一次且另一份报告没有被采用', async ({ runtime, artifactsState }) => {
  const records = await artifactRecords(artifactsState.fixture!.dataPath), [first, second] = artifactsState.originals
  expect(records.adoptionEvents).toHaveLength(1); expect(records.adoptionCurrent).toHaveLength(1); expect(records.adoptionCurrent[0].artifactId).toBe(first.id)
  expect(new Set(records.adoptionReceipts.map(value => value.eventId)).size).toBe(1)
  await openArtifact(runtime, second); await expectAdoptionRecord(runtime, second)
  await expect(card(runtime.page, second).getByRole('button', { name: '采用此版本', exact: true })).toBeEnabled()
})

When('用户取得报告的第一版', async ({ runtime, artifactsState }) => initial(runtime, artifactsState))
When('用户填写修改要求后取消关联并正常发送', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!, original = artifactsState.originals[0]
  artifactsState.beforeRecovery = await artifactRecords(fixture.dataPath)
  const calls = fixture.endpoint.requests.length, input = runtime.page.getByRole('textbox', { name: '消息内容', exact: true })
  await card(runtime.page, original).getByRole('button', { name: '要求修改', exact: true }).click()
  await expect(runtime.page.locator('.reply-preview')).toContainText(original.name)
  await input.fill(INDEPENDENT_REQUEST)
  await runtime.page.getByRole('button', { name: '取消成果修改', exact: true }).click()
  await expect(runtime.page.locator('.reply-preview')).toHaveCount(0)
  expect(await messageDraft(input)).toBe(INDEPENDENT_REQUEST)
  const cancelled = await artifactRecords(fixture.dataPath)
  expect(cancelled.revisions).toEqual([])
  expect(cancelled.messages).toEqual(artifactsState.beforeRecovery.messages)
  expect(cancelled.workItems).toEqual(artifactsState.beforeRecovery.workItems)
  expect(fixture.endpoint.requests).toHaveLength(calls)
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await settled(runtime, fixture.group.id, 2)
})
Then('普通发送保留草稿且不修订或改绑原成果', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!, original = artifactsState.originals[0], before = artifactsState.beforeRecovery!, after = await artifactRecords(fixture.dataPath)
  const sent = after.messages.filter(message => message.senderType === 'user' && message.content === INDEPENDENT_REQUEST)
  expect(sent).toHaveLength(1)
  expect(sent[0].artifactRevisionRequestId).toBeUndefined()
  expect(sent[0].replyToMessageId).toBeUndefined()
  expect(after.revisions).toEqual([])
  expect(after.artifacts.find(artifact => artifact.id === original.id)).toEqual(before.artifacts.find(artifact => artifact.id === original.id))
  expect(after.workItems.find(work => work.id === original.sourceWorkId)).toEqual(before.workItems.find(work => work.id === original.sourceWorkId))
  const independent = after.artifacts.find(artifact => artifact.id !== original.id)!
  expect(independent).toMatchObject({ contentVersion: 1, logicalArtifactId: independent.id })
  expect(independent.previousArtifactId).toBeUndefined()
  expect(independent.revisionRequestId).toBeUndefined()
  expect(independent.sourceWorkId).not.toBe(original.sourceWorkId)
  expect(after.adoptionEvents).toEqual([])
  expect(fixture.replacements).toEqual([])
  expect(fixture.errors).toEqual([])
})
When('用户取得报告的第一版和第二版', async ({ runtime, artifactsState }) => { await initial(runtime, artifactsState); await createV2(runtime, artifactsState); await openDeliveredFile(runtime, artifactsState.originals[0], 2) })
When('用户采用第二版后回复与采用回执暂时失联', async ({ runtime, artifactsState }) => {
  artifactsState.fault = await artifactReplyFault(runtime, 'adoption')
  await card(runtime.page, artifactsState.v2!).getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect(chat(runtime.page).getByRole('button', { name: '核对采用结果', exact: true })).toBeVisible()
  const state = await artifactsState.fault.inspect(); expect(state.submissions).toHaveLength(1); expect(state.lostReplies).toBe(1)
  artifactsState.frozen = state.submissions[0]; artifactsState.beforeRecovery = await artifactRecords(artifactsState.fixture!.dataPath); artifactsState.calls = artifactsState.fixture!.endpoint.requests.length
})
Then('切到旧版与关闭详情仍冻结第二版采用身份', async ({ runtime, artifactsState }) => {
  await openDeliveredFile(runtime, artifactsState.v2!, 1); await expectFrozen(runtime, artifactsState, 'adoption')
  await expect(chat(runtime.page).getByRole('region', { name: '未决采用请求', exact: true })).toContainText(`采用 · ${artifactsState.v2!.name}`)
  await runtime.page.getByRole('button', { name: '关闭详情', exact: true }).click(); await expectFrozen(runtime, artifactsState, 'adoption')
  expect((await artifactsState.fault!.inspect()).submissions).toHaveLength(1)
})
When('用户重启后明确核对原采用结果', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!
  await runtime.restart(); artifactsState.fault = await artifactReplyFault(runtime, 'adoption', { loseReply: false, lookupUnavailable: false })
  await selectChat(runtime, fixture.group.title); await openArtifact(runtime, artifactsState.originals[0]); await expectFrozen(runtime, artifactsState, 'adoption')
  await chat(runtime.page).getByRole('button', { name: '核对采用结果', exact: true }).click()
  await expect(chat(runtime.page).getByRole('region', { name: '未决采用请求', exact: true })).toHaveCount(0)
})
Then('只恢复原采用回执且后续采用旧版保留真实历史', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!, original = artifactsState.originals[0], fault = await artifactsState.fault!.inspect(), records = await artifactRecords(fixture.dataPath)
  expect(fault.submissions).toHaveLength(0); expect(fault.lookups).toEqual([(artifactsState.frozen as ArtifactAdoptionInput).requestId])
  expect(records.adoptionEvents).toEqual(artifactsState.beforeRecovery!.adoptionEvents)
  await expectAdoptionRecord(runtime, original, 2)
  await card(runtime.page, original).getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect(card(runtime.page, original).getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
  await expectAdoptionRecord(runtime, original, 1)
  expect((await artifactRecords(fixture.dataPath)).adoptionEvents.map(value => value.contentVersion)).toEqual([2, 1])
  expect(fixture.endpoint.requests).toHaveLength(artifactsState.calls!)
})

When('用户要求修改第一版后回复与消息回执暂时失联', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!, original = artifactsState.originals[0]
  artifactsState.fault = await artifactReplyFault(runtime, 'revision')
  await requestRevision(runtime, original, '原修改要求：增加可检查来源并保留第一版原文。')
  await expect(chat(runtime.page).getByRole('button', { name: '核对修改结果', exact: true })).toBeVisible()
  const state = await artifactsState.fault.inspect(); expect(state.submissions).toHaveLength(1); expect(state.lostReplies).toBe(1); artifactsState.frozen = state.submissions[0]
  const detail = await settled(runtime, fixture.group.id, 2); artifactsState.v2 = detail.artifacts.find(value => value.previousArtifactId === original.id) as ArtifactVersion
  artifactsState.beforeRecovery = await artifactRecords(fixture.dataPath); artifactsState.calls = fixture.endpoint.requests.length
})
Then('新版和详情关闭都不能覆盖原修改要求与身份', async ({ runtime, artifactsState }) => {
  await openDeliveredFile(runtime, artifactsState.originals[0], 2); const view = panel(runtime.page, artifactsState.v2!)
  await expect(chat(runtime.page)).toContainText((artifactsState.frozen as ArtifactRevisionInput).content)
  await expect(view.getByRole('textbox', { name: '修改要求', exact: true })).toHaveCount(0)
  await expect(card(runtime.page, artifactsState.v2!).getByRole('button', { name: '要求修改', exact: true })).toBeDisabled(); await expectFrozen(runtime, artifactsState, 'revision')
  await runtime.page.getByRole('button', { name: '关闭详情', exact: true }).click(); await expectFrozen(runtime, artifactsState, 'revision')
  expect((await artifactsState.fault!.inspect()).submissions).toHaveLength(1)
})
When('用户重启后明确核对原修改结果', async ({ runtime, artifactsState }) => {
  await runtime.restart(); artifactsState.fault = await artifactReplyFault(runtime, 'revision', { loseReply: false, lookupUnavailable: false })
  await selectChat(runtime, artifactsState.fixture!.group.title); await openArtifact(runtime, artifactsState.v2!)
  await expectFrozen(runtime, artifactsState, 'revision')
  await chat(runtime.page).getByRole('button', { name: '核对修改结果', exact: true }).click()
  await expect(chat(runtime.page).getByRole('button', { name: '核对修改结果', exact: true })).toHaveCount(0)
})
Then('只恢复原用户消息且没有重复轮次工作或模型调用', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!, input = artifactsState.frozen as ArtifactRevisionInput, fault = await artifactsState.fault!.inspect(), after = await artifactRecords(fixture.dataPath), before = artifactsState.beforeRecovery!
  expect(fault.submissions).toHaveLength(0); expect(fault.lookups).toEqual([input.requestId])
  expect(after.messages.map(value => value.id)).toEqual(before.messages.map(value => value.id)); expect(after.turns.map(value => value.id)).toEqual(before.turns.map(value => value.id)); expect(after.workItems).toEqual(before.workItems); expect(after.revisions).toEqual(before.revisions)
  expect(after.revisions).toHaveLength(1); const request = after.revisions[0]
  expect(request).toMatchObject({ id: input.requestId, artifactId: input.artifactId, contentHash: input.contentHash, targetAgentId: input.targetAgentId, content: input.content })
  expect(after.messages.filter(value => value.id === request.messageId)).toHaveLength(1); expect(after.turns.filter(value => value.triggerMessageId === request.messageId)).toHaveLength(1)
  expect(after.artifacts.filter(value => value.revisionRequestId === input.requestId)).toHaveLength(1)
  expect(fixture.endpoint.requests).toHaveLength(artifactsState.calls!)
})

When('用户取得同聊两份报告和其他聊天独立报告', async ({ runtime, artifactsState }) => {
  await initial(runtime, artifactsState); const fixture = artifactsState.fixture!
  artifactsState.originals.push(await publish(runtime, artifactsState, fixture.group.id, fixture.group.title, 2, '发布另一份独立报告。'))
  artifactsState.other = await publish(runtime, artifactsState, fixture.other.id, fixture.other.title, 1, '发布其他聊天的独立报告。')
  await selectChat(runtime, fixture.group.title); await openArtifact(runtime, artifactsState.originals[0])
})
When('第一份报告被外部修改而第二份原件被移走', async ({ artifactsState }) => {
  await changeArtifactOriginal(artifactsState.originals[0], '# 外部修改必须保留\nEXTERNAL_ARTIFACT_PRESERVED\n'); await removeArtifactOriginal(artifactsState.originals[1])
})
Then('原版本不可预览且陈旧内容身份不能采用', async ({ runtime, artifactsState }) => {
  const first = artifactsState.originals[0], view = panel(runtime.page, first)
  // The still-visible stale button is the user's real attempt; host byte identity must refuse it.
  await card(runtime.page, first).getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect(chat(runtime.page)).toContainText('外部修改')
  await expect(view.getByRole('region', { name: '文件正文', exact: true })).toHaveCount(0)
  const rejected = await runtime.page.evaluate(async artifacts => {
    const failures: string[] = []
    for (const artifact of artifacts) { try { await window.boai.request('getArtifactPreview', { id: artifact.id, expectedHash: artifact.contentHash }); failures.push('unexpected success') } catch (error) { failures.push(String(error)) } }
    return failures
  }, artifactsState.originals)
  expect(rejected[0]).toContain('外部修改'); expect(rejected[1]).toContain('不存在')
  expect((await artifactRecords(artifactsState.fixture!.dataPath)).adoptionEvents).toHaveLength(0)
})
When('用户清空发生原件冲突的成果聊天', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!
  const row = runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${fixture.group.title}`) })
  await row.click({ button: 'right' }); await runtime.page.getByRole('menuitem', { name: '清空聊天记录', exact: true }).click()
  await runtime.page.getByRole('button', { name: '确认清空', exact: true }).click()
  await expect.poll(async () => (await artifactRecords(fixture.dataPath)).cleanupGates.some(value => value.id === fixture.group.id)).toBe(true)
  const dialog = runtime.page.getByRole('alertdialog', { name: '清空聊天记录？', exact: true })
  await expect(dialog.getByRole('alert')).toContainText('成果已被外部修改，原文件已保留')
  await expect(dialog.getByRole('button', { name: '取消', exact: true })).toBeEnabled()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(dialog).toHaveCount(0)
})
Then('清理门禁保留外改文件且其他聊天成果仍可使用', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!, original = artifactsState.originals[0], other = artifactsState.other!, records = await artifactRecords(fixture.dataPath)
  expect(await artifactOriginal(original)).toContain('EXTERNAL_ARTIFACT_PRESERVED')
  expect(records.artifacts.filter(value => value.conversationId === fixture.group.id)).toHaveLength(0)
  expect(records.cleanups.find(value => value.id === original.id)?.status).toBe('conflict')
  const refused = await runtime.page.evaluate(async id => { try { await window.boai.request('getArtifactPreview', { id }); return 'unexpected success' } catch (error) { return String(error) } }, original.id)
  expect(refused).not.toBe('unexpected success')
  await selectChat(runtime, fixture.other.title); await openArtifact(runtime, other)
  await expect(panel(runtime.page, other).getByRole('region', { name: '文件正文', exact: true })).toContainText('ARTIFACT_V1')
  await card(runtime.page, other).getByRole('button', { name: '采用此版本', exact: true }).click()
  await expect(card(runtime.page, other).getByRole('button', { name: '已采用此版本', exact: true })).toBeDisabled()
  const calls = fixture.endpoint.requests.length
  await runtime.restart(); await selectChat(runtime, fixture.other.title); await openArtifact(runtime, other)
  expect(await artifactOriginal(original)).toContain('EXTERNAL_ARTIFACT_PRESERVED')
  expect((await artifactRecords(fixture.dataPath)).cleanupGates.some(value => value.id === fixture.group.id)).toBe(true)
  expect(fixture.endpoint.requests).toHaveLength(calls)
})


Given('成果协作组已连接大文本真实工具协议模型', async ({ runtime, artifactsState }) => {
  const common = Array.from({ length: 5_000 }, (_, index) => `COMMON_${String(index).padStart(4, '0')}：固定原件内容保持。\n`).join('')
  expect(common.length * 2).toBeGreaterThan(200_000)
  artifactsState.fixture = await prepareArtifactsDesktop(runtime, { file: { name: '交付报告.md', fileName: 'report.md', content: `ARTIFACT_V1\n${common}`, revisionContent: `ARTIFACT_V2\n${common}` } })
})
Then('执行事件后台核源保留长文滚动选区和源码模式', async ({ runtime, artifactsState: state }) => {
  const original = state.originals[0], view = panel(runtime.page, original)
  await expect(view.locator('[data-preview-plugin="boai.preview.text"]')).toBeVisible()
  await view.getByRole('button', { name: '显示源码', exact: true }).click()
  const line = view.locator('[data-file-line="120"]')
  await expect(line).toBeAttached()
  const before = await line.evaluate(element => {
    element.scrollIntoView({ block: 'center' })
    const range = document.createRange(); range.selectNodeContents(element)
    window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range)
    return { top: element.closest('.file-preview-scroll')!.scrollTop, selection: window.getSelection()!.toString() }
  })
  expect(before.top).toBeGreaterThan(100)
  await backgroundPreviewCheck(runtime, original.conversationId, line)
  await expect(view.getByRole('button', { name: '显示预览', exact: true })).toBeVisible()
  expect(await line.evaluate(element => ({ top: element.closest('.file-preview-scroll')!.scrollTop, selection: window.getSelection()!.toString() }))).toEqual(before)
  await runtime.reviewData('正文后台复核仍保留阅读位置与选区', before)
  await runtime.reviewNativeCheckpoint('后台复核保留长文源码选区与滚动')
})

Given('员工经原命令批准和成果工具发布Lody样本 {string}', async ({ runtime, artifactsState }, kind: string) => {
  const factories: Record<string, () => Uint8Array> = { pdf: createSamplePdf, docx: sampleDocx, xlsx: sampleXlsx, pptx: samplePptx }
  const bytes = Buffer.from(factories[kind]()), fileName = `lody-report.${kind}`
  const command = `/usr/bin/python3 -c 'from pathlib import Path; import base64; Path("${fileName}").write_bytes(base64.b64decode("${bytes.toString('base64')}"))'`
  const fixture = artifactsState.fixture = await prepareArtifactsDesktop(runtime, { file: { name: `Lody成果.${kind}`, fileName, content: '', command } })
  artifactsState.binaryKind = kind
  await selectChat(runtime, fixture.group.title)
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(`请在本次工作目录生成并发布 Lody成果.${kind}，命令先在聊天中申请批准。`)
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  const approval = runtime.page.locator('.messages').getByRole('button', { name: '允许这次执行', exact: true })
  await expect(approval).toBeVisible()
  await approval.click()
  const detail = await settled(runtime, fixture.group.id, 1), artifact = detail.artifacts[0] as ArtifactVersion
  expect(fixture.errors).toEqual([])
  expect(detail.runs.flatMap(run => run.toolEvents).filter(tool => ['execute_command', 'publish_artifact', 'report_work'].includes(tool.name)).map(tool => [tool.name, tool.status])).toEqual([['execute_command', 'completed'], ['publish_artifact', 'completed'], ['report_work', 'completed']])
  artifactsState.originals = [artifact]; artifactsState.calls = fixture.endpoint.requests.length
  await runtime.reviewFile(artifact.name, artifact.path, { required: true, expectedSha256: artifact.contentHash })
  await reviewArtifact(runtime, artifact)
  await openArtifact(runtime, artifact)
})
Then('Lody成果查看器读取已发布原件且关闭重开不执行业务', async ({ runtime, artifactsState }) => {
  const artifact = artifactsState.originals[0], kind = artifactsState.binaryKind!, fixture = artifactsState.fixture!
  const before = await artifactRecords(fixture.dataPath)
  const check = async () => {
    await expect(panel(runtime.page, artifact).locator(`[data-preview-plugin="boai.preview.${kind === 'pdf' ? 'pdf' : 'office'}"]`)).toBeVisible()
    const viewer = panel(runtime.page, artifact).locator(`[data-binary-viewer="${kind}"]`)
    if (kind === 'pdf') await expect(viewer.locator('.textLayer').getByText('Overview', { exact: true })).toBeVisible()
    else if (kind === 'xlsx') await expect(viewer.getByRole('grid', { name: 'Revenue worksheet grid' })).toBeVisible()
    else if (kind === 'pptx') await expect(viewer.getByTestId('pptx-viewport').getByText('Quarterly report', { exact: true })).toBeVisible()
    else await expect(viewer.getByText('Quarterly report', { exact: true })).toBeVisible()
    await expect(viewer.getByTestId('session-file-error-state')).toHaveCount(0)
  }
  await check(); await runtime.reviewNativeCheckpoint(`已发布 ${kind} 成果实际阅读`)
  const content = panel(runtime.page, artifact).locator(kind === 'pdf' ? '.textLayer' : kind === 'xlsx' ? '[role="grid"]' : kind === 'pptx' ? '[data-testid="pptx-viewport"]' : '[data-binary-viewer] p').first()
  await backgroundPreviewCheck(runtime, fixture.group.id, content)
  await check()
  await runtime.page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await expect(runtime.page.locator('[data-binary-viewer]')).toHaveCount(0)
  await openArtifact(runtime, artifact); await check()
  expect(await artifactRecords(fixture.dataPath)).toEqual(before)
  expect(fixture.endpoint.requests).toHaveLength(artifactsState.calls!)
  await runtime.reviewCheckpoint(`已发布 ${kind} 关闭重开零业务变更`)
})


Then('迟到预览在清空来源后不能恢复旧正文', async ({ runtime, artifactsState }) => {
  const fixture = artifactsState.fixture!, v2 = artifactsState.v2!, calls = fixture.endpoint.requests.length
  const observation = await observeWorkViews(runtime, 'getArtifactPreview')
  await runtime.app.evaluate(({ BrowserWindow }, id) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.send('boai:event', { type: 'changed', conversationId: id })
  }, fixture.group.id)
  await expect.poll(async () => (await observation.inspect()).delayed).toBe(true)
  await runtime.page.evaluate(id => window.boai.request('clearConversationHistory', { id, hide: false }), fixture.group.id)
  await observation.release()
  const view = panel(runtime.page, v2)
  await expect(view).toContainText('来源聊天已清理或移除，文件不可用。')
  await expect(view.getByRole('region', { name: '文件正文', exact: true })).toHaveCount(0)
  await expect(view.getByText('正在读取文件…', { exact: true })).toHaveCount(0)
  const after = await artifactRecords(fixture.dataPath)
  expect(after.artifacts.filter(value => value.conversationId === fixture.group.id)).toEqual([])
  expect(after.messages.filter(value => value.conversationId === fixture.group.id)).toEqual([])
  expect(fixture.endpoint.requests).toHaveLength(calls)
  await runtime.reviewCheckpoint('真实清理后迟到预览没有恢复文件')
})


When('用户在代码预览选中一行并向员工发送标注修改', async ({ runtime, artifactsState: state }) => {
  const original = state.originals[0]
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('主聊天草稿保持独立')
  await openArtifact(runtime, original)
  const view = panel(runtime.page, original)
  await view.locator('[data-file-line="1"]').evaluate(element => { const range = document.createRange(); range.selectNodeContents(element.querySelector('.shiki-line-content')!); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })) })
  const before = await artifactRecords(state.fixture!.dataPath)
  const actions = runtime.page.getByRole('dialog', { name: '选文修改操作', exact: true })
  await expect(actions).toBeVisible()
  await expect(runtime.page.locator('.file-edit-session')).toHaveCount(0)
  await expect(actions.getByRole('textbox', { name: '文件修改要求', exact: true })).toBeVisible()
  const previewBounds = await view.boundingBox()
  await actions.evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))) })
  const geometry = await actions.locator('[data-selection-actions-bar]').evaluate(element => ({ width: element.clientWidth, scrollWidth: element.scrollWidth, height: element.clientHeight, scrollHeight: element.scrollHeight, inputWidth: element.querySelector('input')!.getBoundingClientRect().width, background: getComputedStyle(element).backgroundColor, overflow: getComputedStyle(element).overflowY }))
  await runtime.reviewData('选文浮层尺寸与溢出', geometry)
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width + 1)
  expect(geometry.scrollHeight).toBeLessThanOrEqual(geometry.height + 1)
  expect(geometry.overflow).toBe('hidden')
  expect(geometry.inputWidth).toBeGreaterThan(100)
  await actions.getByRole('textbox', { name: '文件修改要求', exact: true }).focus()
  const focusedStyle = await actions.evaluate(element => ({
    inputShadow: getComputedStyle(element.querySelector('input')!).boxShadow,
    inputBorder: getComputedStyle(element.querySelector('input')!).borderTopWidth,
    buttonHeights: Array.from(element.querySelectorAll('button')).map(button => parseFloat(getComputedStyle(button).height)),
  }))
  expect(focusedStyle.inputShadow).toBe('none')
  expect(focusedStyle.inputBorder).toBe('0px')
  expect(focusedStyle.buttonHeights.every(height => height <= 24)).toBe(true)
  await runtime.reviewData('聚焦无额外边线与24px操作按钮', focusedStyle)
  await runtime.reviewNativeCheckpoint('选文紧凑Popover直接修改')
  await actions.getByRole('textbox', { name: '文件修改要求', exact: true }).fill('未提交的局部修改')
  await actions.getByRole('textbox', { name: '文件修改要求', exact: true }).press('Escape')
  await expect(actions).toBeHidden()
  expect((await artifactRecords(state.fixture!.dataPath)).messages).toHaveLength(before.messages.length)
  await selectPreviewText(view.locator('[data-file-line="1"] .shiki-line-content'))
  await expect(actions).toBeVisible()
  expect(await view.boundingBox()).toEqual(previewBounds)
  await actions.getByRole('textbox', { name: '文件修改要求', exact: true }).fill('')
  await actions.getByRole('button', { name: '更多修改选项', exact: true }).click()
  await expect(actions).toBeVisible()
  for (const name of ['解释', '润色', '精简', '语气', '语法']) await expect(actions.getByRole('button', { name, exact: true })).toBeVisible()
  await expect(actions.getByRole('textbox', { name: '文件修改位置', exact: true })).toHaveCount(0)
  await expect(actions.locator('[data-file-edit-result]')).toHaveCount(0)
  await expect.poll(() => actions.locator('[data-selection-actions-bar]').evaluate(bar => {
    const rect = bar.getBoundingClientRect()
    return Array.from(bar.querySelectorAll('button')).filter(button => !button.closest('[inert]')).every(button => {
      const bounds = button.getBoundingClientRect()
      return bounds.left >= rect.left && bounds.right <= rect.right + 1 && bounds.top >= rect.top && bounds.bottom <= rect.bottom
    })
  })).toBe(true)
  const expanded = await actions.locator('[data-selection-actions-bar]').evaluate(bar => ({ width: bar.clientWidth, height: bar.clientHeight, buttons: Array.from(bar.querySelectorAll('button')).filter(button => !button.closest('[inert]')).map(button => ({ label: button.textContent, top: button.getBoundingClientRect().top, height: button.getBoundingClientRect().height })) }))
  expect(expanded.height).toBe(32)
  expect(new Set(expanded.buttons.map(button => button.top)).size).toBe(1)
  await runtime.reviewData('原版横向展开五动作尺寸', expanded)
  await runtime.reviewNativeCheckpoint('原版SelectionActions横向展开全部按钮')
  await actions.getByRole('button', { name: '收起修改选项', exact: true }).click()
  expect((await artifactRecords(state.fixture!.dataPath)).messages).toHaveLength(before.messages.length)
  await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveText('主聊天草稿保持独立')
  await runtime.reviewNativeCheckpoint('代码预览内独立编辑与主聊天草稿')
  await runtime.page.getByRole('textbox', { name: '文件修改要求', exact: true }).fill('仅把选中行的 EMPLOYEE_CODE_PREVIEW 改为 EMPLOYEE_CODE_EDITED，其余保持。')
  await runtime.page.getByRole('button', { name: '发送文件修改', exact: true }).click()
  const detail = await settled(runtime, original.conversationId, 2)
  state.v2 = detail.artifacts.find(value => value.previousArtifactId === original.id) as ArtifactVersion
  expect(state.v2).toBeDefined()
  expect((await artifactRecords(state.fixture!.dataPath)).revisions.at(-1)?.content).toContain('修改位置：第 1 行')
})
Then('标注修改产生真实新版本且原代码和其他行保持', async ({ runtime, artifactsState: state }) => {
  expect(await artifactOriginal(state.originals[0])).toBe(CODE_ARTIFACT_TEXT)
  expect(await artifactOriginal(state.v2!)).toBe(CODE_ARTIFACT_TEXT.replace('EMPLOYEE_CODE_PREVIEW', 'EMPLOYEE_CODE_EDITED'))
  await expect(runtime.page.getByLabel('修改交付文件', { exact: true })).toHaveCount(0)
  await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveText('主聊天草稿保持独立')
  await expect(panel(runtime.page, state.v2!)).toBeVisible()
  await expect(panel(runtime.page, state.v2!).locator('[data-file-line="1"]')).toContainText('EMPLOYEE_CODE_EDITED')
  await reviewArtifact(runtime, state.originals[0]); await reviewArtifact(runtime, state.v2!)
  await expect(runtime.page.getByRole('dialog', { name: '选文修改操作', exact: true })).toBeHidden()
  await runtime.reviewNativeCheckpoint('本次修改交付后自动预览新版')
  await openDeliveredFile(runtime, state.v2!, 1)
  await backgroundPreviewCheck(runtime, state.originals[0].conversationId, panel(runtime.page, state.originals[0]).locator('[data-file-line="1"]'))
  await expect(panel(runtime.page, state.originals[0])).toBeVisible()
  await openDeliveredFile(runtime, state.originals[0], 2)
  await selectPreviewLine(panel(runtime.page, state.v2!))
  await runtime.page.getByRole('textbox', { name: '文件修改要求', exact: true }).fill('继续基于当前查看版本修改')
  await expect(runtime.page.getByRole('button', { name: '发送文件修改', exact: true })).toBeEnabled()
  await runtime.page.getByRole('textbox', { name: '文件修改要求', exact: true }).fill('')
  await runtime.reviewNativeCheckpoint('文件面板内查看真实修改版本')
})
When('用户从附件预览选择内容并发送独立修改请求', async ({ runtime, artifactsState: state }) => {
  const material = state.material!, original = state.originals[0]
  await runtime.page.evaluate(async id => {
    const snapshot = await window.boai.request('snapshot', undefined), room = snapshot.conversations.find(value => value.id === id)!
    await window.boai.request('createConversation', { id, kind: 'group', title: room.title, agentIds: ['researcher', 'writer'], expectedConfigVersion: room.configVersion })
  }, material.conversationId)
  await panel(runtime.page, original).getByRole('button', { name: '查看材料 依据.txt 第 2 至 2 行', exact: true }).click()
  const view = runtime.page.locator(`[data-material-preview-id="${material.id}"]:visible`)
  await expect(view.locator('[data-preview-plugin="boai.preview.text"]')).toBeVisible()
  await backgroundPreviewCheck(runtime, material.conversationId, view.locator('[data-file-line="2"]'), 'getMaterialPreview')
  await view.locator('[data-file-line="2"]').evaluate(element => { const range = document.createRange(); range.selectNodeContents(element); window.getSelection()!.removeAllRanges(); window.getSelection()!.addRange(range); element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })) })
  const actions = runtime.page.getByRole('dialog', { name: '选文修改操作', exact: true })
  const more = actions.getByRole('button', { name: '更多修改选项', exact: true })
  if (await more.count()) await more.click()
  const selector = actions.getByRole('combobox', { name: '修改执行员工', exact: true })
  await expect(selector).toBeVisible()
  await selector.click()
  await expect(runtime.page.getByRole('option', { name: '成果作者', exact: true })).toBeVisible()
  await runtime.page.locator('[data-slot=select-content]').evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))) })
  await runtime.reviewNativeCheckpoint('员工Select直接位于横向操作条')
  await runtime.page.getByRole('option', { name: '成果作者', exact: true }).click()
  await expect.poll(() => selector.evaluate(element => {
    const trigger = element.getBoundingClientRect(), bar = element.closest('[data-selection-actions-bar]')!.getBoundingClientRect()
    return trigger.top >= bar.top && trigger.bottom <= bar.bottom && trigger.left >= bar.left && trigger.right <= bar.right + 1
  })).toBe(true)
  await expect(actions.getByRole('textbox', { name: '文件修改位置', exact: true })).toHaveCount(0)
  await actions.getByRole('button', { name: '收起修改选项', exact: true }).click()
  await runtime.page.getByRole('textbox', { name: '文件修改要求', exact: true }).fill('根据选中内容交付新的检查报告，保留原附件。')
  await runtime.reviewCheckpoint('附件固定引用与位置草稿')
  await runtime.page.getByRole('button', { name: '发送文件修改', exact: true }).click()
  await settled(runtime, material.conversationId, 2)
})
Then('附件来源保留在原消息且新请求携带固定版本', async ({ runtime, artifactsState: state }) => {
  const records = await artifactRecords(state.fixture!.dataPath), material = records.materials.find(value => value.id === state.material!.id)!
  const message = records.messages.find(value => value.materialReference?.id === material.id)!
  expect(message.materialReference).toMatchObject({ id: material.id, contentHash: material.contentHash, revision: state.material!.revision })
  expect(message.content).toContain('修改位置：第 2 行')
  expect(message.materialIds).toBeUndefined(); expect(material.messageId).not.toBe(message.id)
  expect(records.artifacts).toHaveLength(2)
  const delivered = records.artifacts.find(artifact => artifact.id !== state.originals[0].id)!
  await expect(panel(runtime.page, delivered)).toBeVisible()
  await runtime.reviewNativeCheckpoint('附件修改完成自动预览新交付原件')
  await runtime.reviewData('附件修改来源与新交付', { material, message, artifacts: records.artifacts })
})

Then('二进制预览标题没有修改按钮且不执行业务', async ({ runtime, artifactsState: state }) => {
  const original = state.originals[0], before = await artifactRecords(state.fixture!.dataPath), calls = state.fixture!.endpoint.requests.length
  await openArtifact(runtime, original)
  await expect(panel(runtime.page, original).getByRole('button', { name: /^(让员工修改|修改选中内容)$/ })).toHaveCount(0)
  await expect(runtime.page.getByRole('dialog', { name: '选文修改操作', exact: true })).toBeHidden()
  await runtime.reviewCheckpoint('二进制预览无标题修改入口-' + state.binaryKind)
  const after = await artifactRecords(state.fixture!.dataPath)
  expect(after.messages).toEqual(before.messages); expect(after.revisions).toEqual(before.revisions); expect(after.artifacts).toEqual(before.artifacts)
  expect(state.fixture!.endpoint.requests).toHaveLength(calls)
})


When('文件面板提交修改后响应与回执暂时失联', async ({ runtime, artifactsState: state }) => {
  const original = state.originals[0]
  state.fault = await artifactReplyFault(runtime, 'revision')
  await openArtifact(runtime, original)
  await selectPreviewLine(panel(runtime.page, original))
  await runtime.page.getByRole('textbox', { name: '文件修改要求', exact: true }).fill('仅把 EMPLOYEE_CODE_PREVIEW 改为 EMPLOYEE_CODE_EDITED，其余保持。')
  await runtime.page.getByRole('button', { name: '发送文件修改', exact: true }).click()
  await expect(runtime.page.getByRole('dialog', { name: '选文修改操作', exact: true })).toContainText('提交结果待核对')
  await settled(runtime, original.conversationId, 2)
  await runtime.reviewNativeCheckpoint('文件侧边修改-原提交已受理但回执失联')
})
Then('文件编辑关闭重开和重启保留原请求且不重复执行', async ({ runtime, artifactsState: state }) => {
  const original = state.originals[0], fixture = state.fixture!
  const requests = () => runtime.page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('boai:file-edit-requests:v1:')).flatMap(key => (JSON.parse(localStorage.getItem(key)!) as { requests: { id: string; status: string; source: { id: string; contentHash: string }; content: string }[] }).requests))
  const frozen = await requests(), before = await artifactRecords(fixture.dataPath), calls = fixture.endpoint.requests.length
  expect(frozen).toHaveLength(1); expect(frozen[0].status).toBe('unknown')
  expect(frozen[0].source).toMatchObject({ id: original.id, contentHash: original.contentHash })
  await runtime.page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await openArtifact(runtime, original)
  await selectPreviewLine(panel(runtime.page, original))
  await expect(runtime.page.getByRole('dialog', { name: '选文修改操作', exact: true })).toContainText('提交结果待核对')
  expect(await requests()).toEqual(frozen)
  const origin = new URL(runtime.page.url()).origin
  await runtime.restart(); expect(new URL(runtime.page.url()).origin).toBe(origin)
  await selectChat(runtime, fixture.group.title); await openArtifact(runtime, original)
  await selectPreviewLine(panel(runtime.page, original))
  await expect(runtime.page.getByRole('dialog', { name: '选文修改操作', exact: true })).toContainText('提交结果待核对')
  expect(await requests()).toEqual(frozen)
  expect(fixture.endpoint.requests).toHaveLength(calls)
  await runtime.page.getByRole('button', { name: '核对修改结果', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: '查看修改结果：交付模块.ts', exact: true })).toBeVisible()
  await runtime.page.getByRole('textbox', { name: '文件修改要求', exact: true }).fill('继续编辑当前文件')
  await expect(runtime.page.getByRole('button', { name: '发送文件修改', exact: true })).toBeEnabled()
  await runtime.page.getByRole('textbox', { name: '文件修改要求', exact: true }).fill('')
  const after = await artifactRecords(fixture.dataPath)
  expect(after.messages.map(message => message.id)).toEqual(before.messages.map(message => message.id))
  expect(after.revisions).toEqual(before.revisions)
  expect(fixture.endpoint.requests).toHaveLength(calls)
  expect((await requests())[0]).toMatchObject({ id: frozen[0].id, status: 'accepted' })
  await runtime.reviewData('文件侧边请求重启只读核对', { frozen, after: await requests(), messageIds: after.messages.map(message => message.id), revisions: after.revisions })
  await runtime.reviewNativeCheckpoint('文件侧边修改-重启后核对同一结果')
})

Then('停用文本插件保留当前正文而重开回退并可恢复', async ({ runtime, artifactsState: state }) => {
  const artifact = state.originals[0], view = panel(runtime.page, artifact)
  await expect(view.locator('pre.shiki-code-block')).toBeVisible()
  const original = await view.locator('pre.shiki-code-block').elementHandle()
  const setEnabled = (enabled: boolean) => runtime.page.evaluate(async enabled => {
    const before = await window.boai.request('getPluginSettings', undefined)
    return window.boai.request('setPluginEnabled', { id: 'boai.preview.text', enabled, expectedRevision: before.revision })
  }, enabled)
  // Exercise the production IPC while the reader remains in the foreground; settings UI is tested separately.
  await setEnabled(false)
  await expect(view.locator('[data-preview-plugin="boai.preview.text"]')).toBeVisible()
  expect(await view.locator('pre.shiki-code-block').evaluate((node, original) => node === original, original)).toBe(true)
  await runtime.reviewNativeCheckpoint('停用文本插件当前代码阅读不刷新')
  await runtime.page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await openArtifact(runtime, artifact)
  await expect(view).toContainText('此格式的预览暂不可用')
  await expect(view.locator('pre.shiki-code-block')).toHaveCount(0)
  await expect(view.getByRole('button', { name: '文件操作', exact: true })).toBeEnabled()
  await runtime.reviewNativeCheckpoint('重新打开使用宿主回退且文件操作保留')
  await setEnabled(true)
  await runtime.page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await openArtifact(runtime, artifact)
  await expect(view.locator('pre.shiki-code-block')).toBeVisible()
  await expect(view.locator('[data-preview-plugin="boai.preview.text"]')).toBeVisible()
  expect(await artifactOriginal(artifact)).toBe(CODE_ARTIFACT_TEXT)
  expect(await artifactRecords(state.fixture!.dataPath)).toEqual(state.beforeRecovery)
  expect(state.fixture!.endpoint.requests).toHaveLength(state.calls!)
  expect(runtime.errors).toEqual([])
  await runtime.reviewNativeCheckpoint('重新启用恢复预览且原件保持')
})
