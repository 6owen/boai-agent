/*
 * [INPUT]: 实际Electron与受控Codex/Claude协议、真实知识副本和原消息。
 * [OUTPUT]: 读原件→点击引用→重启→旧引用更新失效→新引用定位→移除停显；不调用外部模型。
 * [POS]: 知识引用桌面验收；原生协议代表不替代真实供应商。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { chmod, copyFile, readFile, realpath, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { Conversation, ConversationDetail, DigitalAgent, Resource } from '../../../src/shared/domain'
import { nextMaterialDialog } from '../support/materials'
import { archiveNativeFinalReview } from '../support/native-final-review'
import type { Desktop } from '../support/desktop'
import { test as base } from '../support/test'

interface State { agent: DigitalAgent; conversation: Conversation; source: string; resource: Resource; dataPath: string; before?: ConversationDetail }
export const test = base.extend<{ knowledgeCitation: State }>({ knowledgeCitation: async ({ runtime }, use) => {
  const state = {} as State
  try { await use(state) } finally {
    if (state.dataPath) await archiveNativeFinalReview(runtime, { label: '知识引用', records: async () => {
      const db = new DatabaseSync(join(state.dataPath, 'boai.sqlite'), { readOnly: true })
      const load = (collection: string) => db.prepare('SELECT value FROM records WHERE collection=? ORDER BY rowid').all(collection).map(row => JSON.parse(String(row.value)))
      try { return { artifacts: load('artifacts'), messages: load('messages'), runs: load('runs'), workItems: load('workItems'), resources: load('resources'), codexSessions: load('codexSessions'), claudeSessions: load('claudeSessions') } } finally { db.close() }
    } })
  }
} })
const { Given, When, Then } = createBdd(test)
async function retain(d: Desktop, s: State, content: string) {
  await writeFile(s.source, content); await nextMaterialDialog(d, { path: s.source })
  s.resource = await d.page.evaluate(async ({ agentId, previous }) => {
    const selected = await window.boai.request('chooseKnowledgeSource', undefined)
    const agent = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === agentId)!
    const saved = await window.boai.request('saveEmployeeKnowledge', { requestId: crypto.randomUUID(), agentId, expectedConfigVersion: agent.configVersion, source: { kind: 'file', selectionId: selected!.id }, ...(previous ? { replace: { resourceId: previous.id, revision: previous.knowledge!.revision, contentHash: previous.knowledge!.contentHash } } : {}) })
    if (saved.status !== 'completed') throw new Error('资料未保存')
    return (await window.boai.request('listEmployeeKnowledge', { agentId }))[0]
  }, { agentId: s.agent.id, previous: s.resource })
  await d.reviewFile('知识引用原件-' + s.resource.knowledge!.revision, s.resource.path, { required: true, expectedSha256: s.resource.knowledge!.contentHash })
}
async function select(d: Desktop, s: State) {
  await d.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await d.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(s.conversation.title) }).click()
}
async function ask(d: Desktop, s: State) {
  await select(d, s)
  await d.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('NATIVE_KNOWLEDGE 请引用资料')
  await d.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => {
    const detail = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.conversation.id)
    return detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').length
  }).toBe(s.resource.knowledge!.revision)
  const detail = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.conversation.id)
  expect(detail.runs.every(run => run.status === 'completed')).toBe(true); expect(detail.workItems).toEqual([])
  const message = detail.messages.filter(message => message.senderType === 'agent').at(-1)!
  expect(message.knowledgeSources).toEqual([expect.objectContaining({ resourceId: s.resource.id, contentHash: s.resource.knowledge!.contentHash, firstLine: 1, lastLine: 2 })])
  await d.page.locator('#message-' + message.id).getByRole('button', { name: '查看知识资料 品牌规范.md 第 1 行', exact: true }).click()
  const preview = d.page.getByLabel('知识引用原文', { exact: true })
  await expect(preview.locator('[data-file-line="1"]')).toBeVisible()
  await expect(preview).toContainText(s.resource.knowledge!.revision === 1 ? '蓝色标题' : '绿色标题')
  await d.reviewData('知识引用公开回执-' + s.resource.knowledge!.revision, detail)
  await d.reviewNativeCheckpoint('知识引用实际定位-' + s.resource.knowledge!.revision)
  return detail
}
Given('知识引用已准备{string}协议员工和真实资料', async ({ runtime: d, knowledgeCitation: s }, kind: string) => {
  test.setTimeout(120000); test.info().annotations.push({ type: 'model-mode', description: 'offline-protocol-or-fixture' })
  const folder = await realpath(d.root), executable = join(folder, kind + '.mjs')
  await copyFile(resolve(kind === 'codex' ? 'tests/fixtures/native-conversation.mjs' : 'tests/fixtures/native-claude-conversation.mjs'), executable); await chmod(executable, 0o700)
  await copyFile(resolve('tests/fixtures/native-business.mjs'), join(folder, 'native-business.mjs'))
  await d.start()
  const setup = await d.page.evaluate(async ({ kind, executable }) => {
    const draft = { name: '引用协议-' + kind, executable, args: [], protocol: kind === 'codex' ? 'codex-app-server' as const : 'claude-cli' as const, useExistingLogin: true, hostAccessAcknowledged: true as const }
    await window.boai.request('testLaunchProfileDraft', draft)
    const profile = await window.boai.request('saveLaunchProfile', draft)
    const agent = await window.boai.request('saveAgent', { name: '引用员工-' + kind, role: '查阅规范', instructions: '读取自己的知识资料并引用。', color: '#00AABB', connectionId: '', modelId: '', executionBackend: { kind: kind === 'codex' ? 'codex-local' : 'claude-local', profileId: profile.id }, skillIds: [], knowledgeIds: [], allowCommands: false, active: true })
    const session = await window.boai.request('createEmployeeSession', { employeeId: agent.id, requestId: crypto.randomUUID() })
    return { agent, conversation: (await window.boai.request('getConversation', { id: session.conversationId! })).conversation, dataPath: (await window.boai.request('snapshot', undefined)).dataPath }
  }, { kind, executable })
  Object.assign(s, setup); s.source = join(folder, '品牌规范.md')
  await retain(d, s, '# 品牌规范\n使用蓝色标题。')
  await d.reviewData('知识引用预登记', { kind, userTurns: 2, externalRequests: 0, protocolControlled: true, source: s.source })
})
When('从回答点击知识引用并重启后更新原资料', async ({ runtime: d, knowledgeCitation: s }) => {
  s.before = await ask(d, s)
  await d.restart(); await select(d, s)
  const after = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.conversation.id)
  expect(after.messages).toEqual(s.before.messages); expect(after.runs).toEqual(s.before.runs)
  await d.page.getByRole('button', { name: '查看知识资料 品牌规范.md 第 1 行', exact: true }).click()
  await expect(d.page.getByLabel('知识引用原文', { exact: true })).toContainText('蓝色标题')
  await retain(d, s, '# 品牌规范\n使用绿色标题。')
  const preview = d.page.getByLabel('知识引用原文', { exact: true })
  await expect(preview.getByRole('button', { name: '重新核对知识引用', exact: true })).toBeVisible()
  await expect(preview).not.toContainText('蓝色标题'); await expect(preview).not.toContainText('绿色标题')
  await d.reviewNativeCheckpoint('旧引用更新后不打开新版本')
})
Then('新知识引用定位新原文且移除后立即停止显示', async ({ runtime: d, knowledgeCitation: s }) => {
  const detail = await ask(d, s)
  await d.page.evaluate(async ({ agentId, resourceId }) => {
    const agent = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === agentId)!
    await window.boai.request('removeEmployeeKnowledge', { requestId: crypto.randomUUID(), agentId, resourceId, expectedConfigVersion: agent.configVersion })
  }, { agentId: s.agent.id, resourceId: s.resource.id })
  const preview = d.page.getByLabel('知识引用原文', { exact: true })
  await expect(preview.getByRole('button', { name: '重新核对知识引用', exact: true })).toBeVisible(); await expect(preview).not.toContainText('绿色标题')
  expect(await readFile(s.source, 'utf8')).toBe('# 品牌规范\n使用绿色标题。')
  const after = await d.page.evaluate(id => window.boai.request('getConversation', { id }), s.conversation.id)
  expect(after.messages).toEqual(detail.messages); expect(after.runs).toEqual(detail.runs)
  await d.reviewData('知识引用撤权后事实', after)
  await d.reviewNativeCheckpoint('知识引用移除后停显')
})
