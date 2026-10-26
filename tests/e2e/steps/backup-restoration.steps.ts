/*
 * [INPUT]: 原Desktop/成果协议/材料选择和实际公开IPC，真实备份原件及RESTORE说明。
 * [OUTPUT]: UI取消/导出、原路径不可用的异路径冷恢复和二次启动，核对实际字节/来源/记忆/规则/外观/计划暂停/凭据排除/零重放。
 * [POS]: DS14桌面闭环；仅原生选择器返回本场授权路径，未替换备份、工具、数据读取或恢复实现。
 * [PROTOCOL]: 变化同步Header和所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { cp, mkdir, readFile, readdir, realpath, rename } from 'node:fs/promises'
import { join, relative } from 'node:path'
import type { ConversationDetail, DigitalAgent, MemoryView } from '../../../packages/shared/src/domain'
import type { ArtifactVersion } from '../../../packages/shared/src/domain/artifacts'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { artifactDetail, prepareArtifactsDesktop } from '../support/artifacts'
import { FILE_REQUEST, settledMainline } from '../support/mastra-mainline'
import { nextMaterialDialog } from '../support/materials'

const RULE = 'BACKUP_EMPLOYEE_RULE：工作结论须能打开原文件核对。'
const MEMORY = 'BACKUP_MANUAL_MEMORY：这条手动记忆须随备份恢复。'
const FAKE_KEY = 'backup-isolated-fixture-key-not-a-real-secret'
type State = { fixture?: Awaited<ReturnType<typeof prepareArtifactsDesktop>>; before?: ConversationDetail; artifact?: ArtifactVersion; agent?: DigitalAgent; memory?: MemoryView; planId?: string; connectionId?: string; exports?: string; backup?: string; restoredRoot?: string; calls?: number }
export const test = base.extend<{ backupState: State }>({ backupState: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)

async function selectChat(runtime: Desktop, title: string) {
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${title}`) }).click()
}

Given('隔离聊天已有真实材料成果记忆规则和未来计划', async ({ runtime, backupState: state }) => {
  // This new case includes three real cold starts and file copying; old case budgets stay unchanged.
  test.setTimeout(240_000)
  const f = state.fixture = await prepareArtifactsDesktop(runtime)
  const setup = await runtime.page.evaluate(async ({ rule, key }) => {
    const snapshot = await window.boai.request('snapshot', undefined)
    const current = snapshot.agents.find(agent => agent.id === 'researcher')!
    const connection = snapshot.connections.find(item => item.id === current.connectionId)!
    const { hasApiKey, revision, ...connectionInput } = connection
    await window.boai.request('saveConnection', { ...connectionInput, apiKey: key, expectedRevision: revision })
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, directoryRevision, ...input } = current
    const agent = await window.boai.request('saveAgent', { ...input, instructions: rule, expectedConfigVersion: configVersion })
    const appearance = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'dark', zoomFactor: 0.9 }, expectedRevision: appearance.revision })
    return { agent, connectionId: connection.id }
  }, { rule: RULE, key: FAKE_KEY })
  state.agent = setup.agent; state.connectionId = setup.connectionId
  await selectChat(runtime, f.group.title)
  await nextMaterialDialog(runtime, { path: f.source })
  await runtime.page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
  await expect(runtime.page.locator('[data-material-draft-id]')).toHaveAttribute('data-material-status', 'ready')
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(FILE_REQUEST)
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  state.before = await settledMainline(runtime, f.group.id, 1, 1)
  state.artifact = state.before.artifacts[0] as ArtifactVersion
  expect(state.before.materials).toHaveLength(1)
  expect(state.artifact.materialSources?.map(source => source.id)).toEqual([state.before.materials![0].id])
  const saved = await runtime.page.evaluate(async ({ memory, conversationId }) => {
    const query = { agentId: 'researcher', scope: 'employee' as const }
    const current = await window.boai.request('getMemory', query)
    const view = await window.boai.request('saveMemory', { ...query, content: memory, expectedEpoch: current.epoch })
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10)
    const plan = await window.boai.request('saveAutomation', { name: '备份中的未来计划', conversationId, prompt: '这是未来计划，恢复后须先暂停核对。', frequency: 'daily', startsOn: tomorrow, weekday: 1, time: '00:00', timezone: 'UTC', enabled: true, notify: false })
    return { view, plan }
  }, { memory: MEMORY, conversationId: f.group.id })
  state.memory = saved.view; state.planId = saved.plan.id
  expect(saved.view.entries.some(entry => entry.content === MEMORY)).toBe(true)
  expect(saved.plan.enabled).toBe(true)
  state.calls = f.endpoint.requests.length
  state.exports = join(await realpath(runtime.root), 'backup-exports'); await mkdir(state.exports)
  await runtime.reviewData('备份前原事实', { detail: state.before, memory: state.memory, agent: state.agent, plan: saved.plan, protocolCalls: state.calls })
})

When('我取消一次备份再从数据与备份界面实际导出', async ({ runtime, backupState: state }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '数据与备份', exact: true }).click()
  await runtime.app.evaluate(({ dialog }) => {
    const original = dialog.showOpenDialog
    Object.assign(globalThis, { __boaiBackupCancelled: false })
    dialog.showOpenDialog = (async () => { dialog.showOpenDialog = original; Object.assign(globalThis, { __boaiBackupCancelled: true }); return { canceled: true, filePaths: [] } }) as typeof dialog.showOpenDialog
  })
  await page.getByRole('button', { name: '导出备份', exact: true }).click()
  await expect.poll(() => runtime.app.evaluate(() => (globalThis as unknown as { __boaiBackupCancelled: boolean }).__boaiBackupCancelled)).toBe(true)
  await expect(page.getByRole('button', { name: '导出备份', exact: true })).toBeEnabled()
  expect(await readdir(state.exports!)).toEqual([])
  await expect(page.locator('[data-sonner-toast]').filter({ hasText: '备份已导出' })).toHaveCount(0)
  await nextMaterialDialog(runtime, { path: state.exports! })
  await page.getByRole('button', { name: '导出备份', exact: true }).click()
  await expect(page.getByText(/^备份已导出：/)).toBeVisible({ timeout: 30_000 })
  const names = await readdir(state.exports!); expect(names).toHaveLength(1)
  state.backup = join(state.exports!, names[0])
  const manifest = JSON.parse(await readFile(join(state.backup, 'backup.json'), 'utf8'))
  expect(manifest).toMatchObject({ version: 2, credentialsIncluded: false, appearanceIncluded: true, automationRestorePolicy: 'paused', agentBehaviorRestorePolicy: 'paused', nativeAgentRestorePolicy: 'fresh-session' })
  expect((await readFile(join(state.backup, 'boai.sqlite'))).includes(Buffer.from(FAKE_KEY))).toBe(false)
  const restore = await readFile(join(state.backup, 'RESTORE.txt'), 'utf8')
  expect(restore).toContain('userData/v2'); expect(restore).toContain('appearance'); expect(restore).toContain('默认暂停')
  const original = await runtime.page.evaluate(async planId => ({ connections: (await window.boai.request('snapshot', undefined)).connections, plan: (await window.boai.request('listAutomations', undefined)).definitions.find(plan => plan.id === planId) }), state.planId!)
  expect(original.connections.find(connection => connection.id === state.connectionId)?.hasApiKey).toBe(true)
  expect(original.plan?.enabled).toBe(true)
  await runtime.reviewFile('实际GUI导出恢复说明', join(state.backup, 'RESTORE.txt'))
  await runtime.reviewData('实际GUI导出清单', manifest)
  await runtime.reviewCheckpoint('实际数据与备份导出成功')
})

When('按恢复说明移到新目录并移走原数据和外部材料', async ({ runtime, backupState: state }) => {
  const f = state.fixture!, root = await realpath(runtime.root)
  await runtime.close()
  state.restoredRoot = join(root, 'restored-profile')
  await mkdir(state.restoredRoot)
  await cp(state.backup!, join(state.restoredRoot, 'v2'), { recursive: true })
  await rename(f.dataPath, join(root, 'source-v2-offline'))
  await rename(f.source, `${f.source}.offline`)
  await expect(readFile(state.artifact!.path)).rejects.toMatchObject({ code: 'ENOENT' })
  await runtime.start({ dataDir: state.restoredRoot })
})

async function verifyRestored(runtime: Desktop, state: State, label: string) {
  const f = state.fixture!, before = state.before!, original = state.artifact!, dataPath = join(state.restoredRoot!, 'v2')
  const detail = await artifactDetail(runtime, f.group.id)
  expect(detail.messages).toEqual(before.messages); expect(detail.runs).toEqual(before.runs); expect(detail.turns).toEqual(before.turns)
  expect(detail.workItems).toEqual(before.workItems)
  const artifact = detail.artifacts.find(artifact => artifact.id === original.id) as ArtifactVersion
  expect(artifact.path).toBe(join(dataPath, relative(f.dataPath, original.path)))
  const originalBytes = await readFile(join(state.backup!, relative(f.dataPath, original.path)))
  expect(await readFile(artifact.path)).toEqual(originalBytes)
  expect(await readFile(join(dataPath, 'materials', f.group.id, before.materials![0].id, 'original'), 'utf8')).toBe(f.materialText)
  const saved = await runtime.page.evaluate(async ({ conversationId, artifactId }) => ({ snapshot: await window.boai.request('snapshot', undefined), memory: await window.boai.request('getMemory', { agentId: 'researcher', scope: 'employee' }), appearance: await window.boai.request('getAppearance', undefined), automations: await window.boai.request('listAutomations', undefined), preview: await window.boai.request('getArtifactPreview', { id: artifactId }), detail: await window.boai.request('getConversation', { id: conversationId }) }), { conversationId: f.group.id, artifactId: artifact.id })
  expect(saved.snapshot.dataPath).toBe(dataPath)
  expect(saved.snapshot.agents.find(agent => agent.id === state.agent!.id)).toMatchObject({ name: state.agent!.name, instructions: RULE, modelId: state.agent!.modelId, connectionId: state.connectionId })
  expect(saved.snapshot.connections.find(connection => connection.id === state.connectionId)?.hasApiKey).toBe(false)
  expect(saved.memory.entries).toEqual(state.memory!.entries)
  expect(saved.appearance.preferences).toMatchObject({ mode: 'dark', zoomFactor: 0.9 })
  expect(saved.automations.definitions.find(plan => plan.id === state.planId)).toMatchObject({ enabled: false })
  expect(saved.automations.occurrences).toEqual([])
  expect(saved.preview.text).toBe(originalBytes.toString('utf8'))
  expect(f.endpoint.requests).toHaveLength(state.calls!); expect(f.errors).toEqual([]); expect(runtime.errors).toEqual([])
  await selectChat(runtime, f.group.title)
  await expect(runtime.page.locator(`#message-${before.messages.find(message => message.senderType === 'user')!.id}`)).toContainText(FILE_REQUEST)
  await runtime.page.locator(`#message-${artifact.sourceMessageId}`).getByRole('button', { name: `打开 ${artifact.name}`, exact: true }).click()
  await expect(runtime.page.locator(`[data-artifact-id="${artifact.id}"]:visible`).getByRole('region', { name: '文件正文', exact: true })).toContainText('ARTIFACT_V1')
  const material = before.materials![0]
  await runtime.page.locator(`#message-${before.messages.find(message => message.senderType === 'user')!.id} [data-material-id="${material.id}"]`).getByRole('button', { name: `预览材料 ${material.name}`, exact: true }).click()
  await expect(runtime.page.locator(`[data-material-preview-id="${material.id}"]:visible`)).toContainText('ARTIFACT_MATERIAL_EVIDENCE')
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: state.agent!.name, exact: true }).click()
  await runtime.page.getByRole('button', { name: '高级配置', exact: true }).click()
  await runtime.page.getByRole('dialog', { name: '高级配置', exact: true }).getByRole('tab', { name: '记忆', exact: true }).click()
  await expect(runtime.page.getByRole('tabpanel', { name: '记忆', exact: true }).getByText(MEMORY, { exact: true })).toBeVisible()
  await runtime.reviewData(label, { detail: saved.detail, memory: saved.memory, appearance: saved.appearance, automations: saved.automations, dataPath, protocolCalls: f.endpoint.requests.length, originalPathUnavailable: true, externalMaterialUnavailable: true })
  await runtime.reviewCheckpoint(label)
}

Then('恢复界面保留原内容且暂停计划和排除凭据', async ({ runtime, backupState: state }) => { await verifyRestored(runtime, state, '异路径恢复后原内容与暂停状态') })
Then('再次启动仍保留同一内容且没有重做旧任务', async ({ runtime, backupState: state }) => { await runtime.restart(); await verifyRestored(runtime, state, '恢复后二次冷启动零重放') })
