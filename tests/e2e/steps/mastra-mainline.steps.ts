/*
 * [OUTPUT]: 同一run的write_file和publish_artifact分别批准，固定路径/不同审批身份并保留原件；不隐式扩大权限。
 * [OUTPUT]: 真实文件写入逐次允许；固定V1选文修改提交V2，精确标注/原身份/hash/新根与重启零重放保持；旧要求修改入口退役。
 * [OUTPUT]: 创建员工使用当前工作方式字段；原API上下文/文件/重启断言保持。
 * [OUTPUT]: 文件预览正文采用统一名称，不展示版本标记。
 * [OUTPUT]: 按当前统一模型控件显式选择已准备的API连接，原连续IM/文件版本/重启断言保持。
 * [INPUT]: 单场中文 Mastra 主线场景、生产 Electron UI/IPC 和实际宿主文件链。
 * [OUTPUT]: UI 新员工绑定 API、同聊两轮上下文、真实 V1/V2；修订沿固定成果/hash/请求与新根Work核对原发布消息，重启零模型重放及明确新消息单次续聊。
 * [POS]: Mastra 主线业务步骤；复用原成果协议支撑，不调用本机 Agent。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { artifactDetail, artifactOriginal, artifactRecords } from '../support/artifacts'
import { selectPreviewLine } from '../support/file-preview'
import { CHAT_AFTER_RESTART, CHAT_ONE, CHAT_TWO, FILE_REQUEST, MAINLINE_EMPLOYEE, MAINLINE_ROLE, MAINLINE_RULES, prepareMastraMainline, publicChatRequests, REPLY_AFTER_RESTART, REPLY_ONE, REPLY_TWO, REVISION_REQUEST, settledMainline } from '../support/mastra-mainline'
import type { ArtifactVersion } from '../../../src/shared/domain/artifacts'
import type { DigitalAgent, Conversation } from '../../../src/shared/domain'

interface State {
  fixture?: Awaited<ReturnType<typeof prepareMastraMainline>>
  agent?: DigitalAgent
  conversation?: Conversation
  v1?: ArtifactVersion
  v2?: ArtifactVersion
  v1Text?: string
  v2Text?: string
  revisionContent?: string
  beforeRestart?: Awaited<ReturnType<typeof artifactRecords>>
  callsBeforeRestart?: number
}
export const test = base.extend<{ mainline: State }>({ mainline: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const card = (page: Page, artifact: ArtifactVersion) => page.locator(`.messages [data-chat-artifact-id="${artifact.id}"]`)
const panel = (page: Page, artifact: ArtifactVersion) => page.locator(`[data-artifact-id="${artifact.id}"]:visible`)

async function send(runtime: Desktop, content: string) {
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(content)
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
}
async function openArtifact(runtime: Desktop, artifact: ArtifactVersion) {
  await runtime.page.locator(`#message-${artifact.sourceMessageId}`).getByRole('button', { name: `打开 ${artifact.name}`, exact: true }).click()
  await expect(panel(runtime.page, artifact).getByRole('region', { name: '文件正文', exact: true })).toBeVisible()
}
async function approveReportWrite(runtime: Desktop) {
  let runId: string | undefined
  for (const operation of ['写入', '发布']) {
    const approval = runtime.page.getByRole('region', { name: `${MAINLINE_EMPLOYEE} 的修改或发布文件审批`, exact: true })
    await expect(approval).toBeVisible()
    const pending = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).approvals
    expect(pending).toHaveLength(1)
    runId ??= pending[0].runId
    expect(pending[0].runId).toBe(runId)
    await expect(approval).toContainText(`${operation}文件 self:/runs/${runId}/report.md`)
    const original = runtime.page.locator(`[data-approval-id="${pending[0].id}"]`)
    await expect(original).toBeVisible()
    await original.getByRole('button', { name: '允许这次执行', exact: true }).click()
    await expect(original).toHaveCount(0)
  }
}
async function reviewArtifact(runtime: Desktop, artifact: ArtifactVersion) {
  await runtime.reviewFile(`${artifact.name} · 第 ${artifact.contentVersion} 版`, artifact.path, { required: true, expectedSha256: artifact.contentHash })
  await runtime.reviewData(`主线成果第${artifact.contentVersion}版`, { id: artifact.id, contentHash: artifact.contentHash, logicalArtifactId: artifact.logicalArtifactId, contentVersion: artifact.contentVersion, previousArtifactId: artifact.previousArtifactId, sourceMessageId: artifact.sourceMessageId, sourceWorkId: artifact.sourceWorkId, revisionRequestId: artifact.revisionRequestId })
}

Given('Mastra主线已连接本地协议模型且尚未创建目标员工', async ({ runtime, mainline }) => {
  test.info().annotations.push({ type: 'model-mode', description: 'offline-protocol-or-fixture' })
  mainline.fixture = await prepareMastraMainline(runtime)
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.some(agent => agent.name === MAINLINE_EMPLOYEE)).toBe(false)
  expect(mainline.fixture.endpoint.requests).toHaveLength(0)
})
When('用户从界面创建API员工并在同一私聊连续交流两轮', async ({ runtime, mainline }) => {
  await runtime.page.getByRole('button', { name: '新建', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '新建员工', exact: true }).click()
  const dialog = runtime.page.getByRole('dialog', { name: '新建数字员工', exact: true })
  await dialog.getByRole('textbox', { name: '名称', exact: true }).fill(MAINLINE_EMPLOYEE)
  await dialog.getByRole('textbox', { name: '角色', exact: true }).fill(MAINLINE_ROLE)
  await dialog.getByRole('textbox', { name: '工作方式', exact: true }).fill(MAINLINE_RULES)
  await dialog.getByRole('combobox', { name: '模型连接', exact: true }).click()
  await runtime.page.getByRole('option', { name: `${mainline.fixture!.connection.name} · ${mainline.fixture!.connection.defaultModel}`, exact: true }).click()
  await dialog.getByRole('button', { name: '创建员工', exact: true }).click()
  await expect(dialog).toBeHidden()
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  mainline.agent = snapshot.agents.find(agent => agent.name === MAINLINE_EMPLOYEE)!
  expect(mainline.agent).toMatchObject({ role: MAINLINE_ROLE, instructions: MAINLINE_RULES, executionBackend: { kind: 'mastra-model' }, connectionId: mainline.fixture!.connection.id })
  mainline.conversation = snapshot.conversations.find(conversation => conversation.kind === 'direct' && conversation.agentIds.includes(mainline.agent!.id))!
  expect(mainline.conversation).toBeDefined()
  await runtime.reviewCheckpoint('界面创建API员工及其私聊')
  await send(runtime, CHAT_ONE)
  await settledMainline(runtime, mainline.conversation.id, 1, 0)
  await expect(runtime.page.locator('.messages')).toContainText(REPLY_ONE)
  await send(runtime, CHAT_TWO)
  await settledMainline(runtime, mainline.conversation.id, 2, 0)
  await expect(runtime.page.locator('.messages')).toContainText(REPLY_TWO)
})
Then('第二轮模型请求包含首轮交流且没有产生文件工作', async ({ runtime, mainline }) => {
  const fixture = mainline.fixture!, detail = await artifactDetail(runtime, mainline.conversation!.id)
  expect(detail.workItems).toEqual([])
  expect(detail.messages.filter(message => message.senderType === 'agent')).toHaveLength(2)
  expect(detail.messages.filter(message => message.senderType === 'agent').map(message => message.senderId)).toEqual([mainline.agent!.id, mainline.agent!.id])
  const secondRequests = publicChatRequests(fixture.endpoint.requests, CHAT_TWO)
  expect(secondRequests).toHaveLength(1)
  const actualInput = JSON.stringify(secondRequests[0].messages)
  expect(actualInput).toContain(CHAT_ONE)
  expect(actualInput).toContain(REPLY_ONE)
  expect(fixture.errors).toEqual([])
  await runtime.reviewData('连续私聊真实SDK请求核对', { sameConversationId: mainline.conversation!.id, secondPublicRequestCount: secondRequests.length, containsFirstRequest: actualInput.includes(CHAT_ONE), containsFirstReply: actualInput.includes(REPLY_ONE), workCount: detail.workItems!.length, providerRequests: fixture.endpoint.requests.length, modelSource: 'local-http-sse-protocol-fixture' })
  await runtime.reviewCheckpoint('同一新员工连续两轮普通私聊')
})
When('用户在该私聊要求交付第一版文件', async ({ runtime, mainline }) => {
  await send(runtime, FILE_REQUEST)
  await approveReportWrite(runtime)
  const detail = await settledMainline(runtime, mainline.conversation!.id, 3, 1)
  mainline.v1 = detail.artifacts[0] as ArtifactVersion
  mainline.v1Text = await artifactOriginal(mainline.v1)
  expect(mainline.v1Text).toContain('ARTIFACT_V1')
  await reviewArtifact(runtime, mainline.v1)
})
Then('第一版由该员工真实文件工作发布并可从原消息打开', async ({ runtime, mainline }) => {
  const v1 = mainline.v1!, detail = await artifactDetail(runtime, mainline.conversation!.id)
  expect(v1).toMatchObject({ conversationId: mainline.conversation!.id, ownerAgentId: mainline.agent!.id, contentVersion: 1, logicalArtifactId: v1.id })
  expect(detail.workItems).toHaveLength(1)
  expect(detail.workItems![0]).toMatchObject({ id: v1.sourceWorkId, ownerAgentId: mainline.agent!.id, status: 'delivered', artifactIds: [v1.id] })
  expect(detail.messages.find(message => message.id === v1.sourceMessageId)).toMatchObject({ senderType: 'agent', senderId: mainline.agent!.id, status: 'completed' })
  await openArtifact(runtime, v1)
  await expect(panel(runtime.page, v1)).toContainText('ARTIFACT_V1')
  await selectPreviewLine(panel(runtime.page, v1))
  await expect(runtime.page.getByRole('textbox', { name: '文件修改要求', exact: true })).toBeEnabled()
  await runtime.page.keyboard.press('Escape')
  expect(mainline.fixture!.errors).toEqual([])
  await runtime.reviewCheckpoint('新员工原消息交付真实V1原件')
})
When('用户在文件预览明确修订第一版为第二版', async ({ runtime, mainline }) => {
  await selectPreviewLine(panel(runtime.page, mainline.v1!))
  const selected = await panel(runtime.page, mainline.v1!).locator('[data-file-line="1"] .shiki-line-content').textContent()
  expect(selected!.trim()).toBe(mainline.v1Text!.split('\n')[0].trim())
  mainline.revisionContent = `修改位置：第 1 行\n选中的原文（定位参考）：\n${selected!.trim()}\n\n修改要求：\n${REVISION_REQUEST}`
  await runtime.page.getByRole('textbox', { name: '文件修改要求', exact: true }).fill(REVISION_REQUEST)
  await runtime.reviewCheckpoint('文件预览明确修订所见第一版')
  await runtime.page.getByRole('button', { name: '发送文件修改', exact: true }).click()
  await runtime.page.keyboard.press('Escape')
  await approveReportWrite(runtime)
  const detail = await settledMainline(runtime, mainline.conversation!.id, 4, 2)
  mainline.v2 = detail.artifacts.find(artifact => artifact.previousArtifactId === mainline.v1!.id) as ArtifactVersion
  expect(mainline.v2).toBeDefined()
  mainline.v2Text = await artifactOriginal(mainline.v2)
  await reviewArtifact(runtime, mainline.v2)
})
Then('第二版关联原版本且保留第一版原文与交付消息', async ({ runtime, mainline }) => {
  const fixture = mainline.fixture!, v1 = mainline.v1!, v2 = mainline.v2!, records = await artifactRecords(fixture.dataPath)
  expect(v2).toMatchObject({ ownerAgentId: mainline.agent!.id, conversationId: mainline.conversation!.id, logicalArtifactId: v1.id, contentVersion: 2, previousArtifactId: v1.id })
  expect(v2.contentHash).not.toBe(v1.contentHash)
  expect(mainline.v2Text).toContain('ARTIFACT_V2')
  expect(await artifactOriginal(v1)).toBe(mainline.v1Text)
  expect(records.revisions).toHaveLength(1)
  const revision = records.revisions[0], original = records.artifacts.find(artifact => artifact.id === revision.artifactId)!
  expect(revision).toMatchObject({ id: v2.revisionRequestId, conversationId: mainline.conversation!.id, artifactId: v1.id, logicalArtifactId: v1.logicalArtifactId, contentHash: v1.contentHash, targetAgentId: mainline.agent!.id, content: mainline.revisionContent, rootWorkId: v2.sourceWorkId })
  expect(original).toEqual(v1)
  expect(records.messages.find(message => message.id === original.sourceMessageId)).toMatchObject({ conversationId: mainline.conversation!.id, senderType: 'agent', senderId: mainline.agent!.id, status: 'completed' })
  const originalWork = records.workItems.find(work => work.id === original.sourceWorkId)!
  expect(originalWork.resultMessageIds).toContain(original.sourceMessageId)
  expect(originalWork.artifactIds).toContain(original.id)
  const revisionMessage = records.messages.find(message => message.id === revision.messageId)!
  expect(revisionMessage).toMatchObject({ conversationId: mainline.conversation!.id, senderType: 'user', senderId: 'user', status: 'completed', content: mainline.revisionContent, artifactRevisionRequestId: revision.id, mentionIds: [mainline.agent!.id] })
  expect(revisionMessage.replyToMessageId).toBeUndefined()
  expect(records.workItems.filter(work => work.conversationId === mainline.conversation!.id)).toHaveLength(2)
  const revisionWork = records.workItems.find(work => work.id === v2.sourceWorkId)!
  expect(revisionWork).toMatchObject({ id: revision.rootWorkId, rootWorkId: revision.rootWorkId, sourceMessageId: revisionMessage.id, status: 'delivered', revisionRequestId: revision.id, ownerAgentId: mainline.agent!.id })
  expect(revisionWork.id).not.toBe(originalWork.id)
  expect(revisionWork.parentWorkId).toBeUndefined()
  expect(revisionWork.resultMessageIds).toContain(v2.sourceMessageId)
  expect(records.messages.find(message => message.id === v2.sourceMessageId)).toMatchObject({ conversationId: mainline.conversation!.id, senderType: 'agent', senderId: mainline.agent!.id, runId: v2.runId, status: 'completed' })
  await expect(panel(runtime.page, v2)).toContainText('ARTIFACT_V2')
  await openArtifact(runtime, v1)
  await expect(panel(runtime.page, v1)).toContainText('ARTIFACT_V1')
  await expect(card(runtime.page, v1)).toBeVisible()
  await expect(card(runtime.page, v2)).toBeVisible()
  expect(fixture.replacements).toEqual([{ runId: v2.runId, revisionRequestId: revision.id }])
  expect(fixture.errors).toEqual([])
  await runtime.reviewData('固定成果修订来源与独立新根工作', { revisionRequestId: revision.id, originalArtifactId: original.id, originalContentHash: original.contentHash, originalMessageId: original.sourceMessageId, originalWorkId: originalWork.id, revisionMessageId: revisionMessage.id, revisionWorkId: revisionWork.id, newArtifactId: v2.id, newPublishedMessageId: v2.sourceMessageId, targetAgentId: revision.targetAgentId })
  await runtime.reviewCheckpoint('V2已发布且原V1预览和交付消息保持')
})
When('用户完整重启桌面并返回该员工私聊', async ({ runtime, mainline }) => {
  mainline.beforeRestart = await artifactRecords(mainline.fixture!.dataPath)
  mainline.callsBeforeRestart = mainline.fixture!.endpoint.requests.length
  await runtime.restart()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${MAINLINE_EMPLOYEE}`) }).click()
})
Then('员工历史与两版原件保持且模型和工具没有重放', async ({ runtime, mainline }) => {
  const fixture = mainline.fixture!, before = mainline.beforeRestart!, after = await artifactRecords(fixture.dataPath)
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.find(agent => agent.id === mainline.agent!.id)).toEqual(mainline.agent)
  expect(after.messages).toEqual(before.messages)
  expect(after.turns).toEqual(before.turns)
  expect(after.workItems).toEqual(before.workItems)
  expect(after.artifacts).toEqual(before.artifacts)
  expect(after.revisions).toEqual(before.revisions)
  expect(after.messages.filter(message => message.senderType === 'user').map(message => message.content)).toEqual([CHAT_ONE, CHAT_TWO, FILE_REQUEST, mainline.revisionContent])
  await expect(runtime.page.locator('.messages')).toContainText(REPLY_ONE)
  await expect(runtime.page.locator('.messages')).toContainText(REPLY_TWO)
  for (const artifact of [mainline.v1!, mainline.v2!]) {
    await expect(card(runtime.page, artifact)).toBeVisible()
    await openArtifact(runtime, artifact)
    await expect(panel(runtime.page, artifact)).toContainText(artifact.contentVersion === 1 ? 'ARTIFACT_V1' : 'ARTIFACT_V2')
  }
  expect(await artifactOriginal(mainline.v1!)).toBe(mainline.v1Text)
  expect(await artifactOriginal(mainline.v2!)).toBe(mainline.v2Text)
  expect(fixture.endpoint.requests).toHaveLength(mainline.callsBeforeRestart!)
  expect(fixture.errors).toEqual([])
  expect(runtime.errors).toEqual([])
  await runtime.reviewData('Mastra闭环重启核对', { employeeId: mainline.agent!.id, conversationId: mainline.conversation!.id, messages: after.messages.length, workIds: after.workItems.map(work => work.id), artifactIds: after.artifacts.map(artifact => artifact.id), requestsBefore: mainline.callsBeforeRestart, requestsAfter: fixture.endpoint.requests.length, source: 'Electron源码构建与本地HTTP协议模型，非真实供应商效果' })
  await runtime.reviewCheckpoint('完整重启后原聊天及V1/V2真实原件保持')
})
When('用户在重启后向同一员工发送明确新聊天消息', async ({ runtime, mainline }) => {
  await send(runtime, CHAT_AFTER_RESTART)
  await settledMainline(runtime, mainline.conversation!.id, 5, 2)
  await expect(runtime.page.locator('.messages')).toContainText(REPLY_AFTER_RESTART)
})
Then('仅新增本次聊天且旧交付和修订工作没有重复办理', async ({ runtime, mainline }) => {
  const fixture = mainline.fixture!, before = mainline.beforeRestart!, after = await artifactRecords(fixture.dataPath)
  const added = after.messages.filter(message => !before.messages.some(original => original.id === message.id))
  expect(after.messages.filter(message => before.messages.some(original => original.id === message.id))).toEqual(before.messages)
  expect(added.map(message => ({ content: message.content, senderType: message.senderType, senderId: message.senderId }))).toEqual([{ content: CHAT_AFTER_RESTART, senderType: 'user', senderId: 'user' }, { content: REPLY_AFTER_RESTART, senderType: 'agent', senderId: mainline.agent!.id }])
  expect(after.turns.filter(turn => before.turns.some(original => original.id === turn.id))).toEqual(before.turns)
  expect(after.turns.filter(turn => !before.turns.some(original => original.id === turn.id))).toHaveLength(1)
  expect(after.workItems).toEqual(before.workItems)
  expect(after.artifacts).toEqual(before.artifacts)
  expect(after.revisions).toEqual(before.revisions)
  const newRequests = fixture.endpoint.requests.slice(mainline.callsBeforeRestart!)
  expect(newRequests.length).toBeGreaterThan(0)
  expect(publicChatRequests(newRequests, CHAT_AFTER_RESTART)).toHaveLength(1)
  expect(publicChatRequests(newRequests, FILE_REQUEST)).toHaveLength(0)
  expect(publicChatRequests(newRequests, REVISION_REQUEST)).toHaveLength(0)
  expect(await artifactOriginal(mainline.v1!)).toBe(mainline.v1Text)
  expect(await artifactOriginal(mainline.v2!)).toBe(mainline.v2Text)
  expect(fixture.errors).toEqual([])
  expect(runtime.errors).toEqual([])
  await runtime.reviewData('重启后明确新聊天单次续用', { addedMessageIds: added.map(message => message.id), addedTurns: after.turns.length - before.turns.length, providerRequestsAdded: newRequests.length, newPublicReplies: publicChatRequests(newRequests, CHAT_AFTER_RESTART).length, oldWorkIds: after.workItems.map(work => work.id), oldArtifactIds: after.artifacts.map(artifact => artifact.id) })
  await runtime.reviewCheckpoint('重启后明确新消息续聊且旧文件工作零重放')
})
