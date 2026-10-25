/*
 * [OUTPUT]: 文件预览正文采用统一名称，不展示版本标记。
 * [INPUT]: Q1/Q2 中文场景、生产 Electron 搜索 Dialog/IPC、原生材料选择与真实成果修订。
 * [OUTPUT]: 成果修订沿原员工文件卡和同一composer； 正文独有关键词的有界命中/覆盖、材料与旧版固定导航，外改失败无旧摘录、重启与清理零业务重放和关闭迟到隔离。
 * [POS]: 搜索升级业务步骤；支撑层只控制协议/文件/回执传输，检索和事务均走真实实现。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import type { ArtifactVersion } from '../../../packages/shared/src/domain/artifacts'
import type { ConversationMaterial } from '../../../packages/shared/src/domain/materials'
import type { ConversationSearchTarget } from '../../../packages/shared/src/domain/reading'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { artifactDetail, artifactRecords, prepareArtifactsDesktop } from '../support/artifacts'
import { nextMaterialDialog } from '../support/materials'
import { delayNextSearchReply, searchArtifactBytes, SEARCH_ARTIFACT_BODY, SEARCH_MATERIAL_BODY, writeSearchArtifactBytes } from '../support/search-upgrade'

interface State {
  fixture?: Awaited<ReturnType<typeof prepareArtifactsDesktop>>
  material?: ConversationMaterial
  artifact?: ArtifactVersion
  original?: string
  calls?: number
  target?: ConversationSearchTarget
  delay?: Awaited<ReturnType<typeof delayNextSearchReply>>
  previousTitle?: string
}
export const test = base.extend<{ searchUpgradeState: State }>({ searchUpgradeState: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const dialog = (runtime: Desktop) => runtime.page.getByRole('dialog', { name: '搜索会话内容', exact: true })
const panel = (runtime: Desktop, id: string) => runtime.page.locator(`[data-artifact-id="${id}"]:visible`)
async function selectGroup(runtime: Desktop, title: string) {
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${title}`) }).click()
}
async function search(runtime: Desktop, keyword: string) {
  if (!(await dialog(runtime).isVisible())) await runtime.page.getByRole('button', { name: '搜索会话内容', exact: true }).click()
  await dialog(runtime).getByRole('textbox', { name: '搜索关键词', exact: true }).fill(keyword)
  await expect(dialog(runtime).getByRole('region', { name: '文件正文索引覆盖', exact: true })).toBeVisible()
  await expect(dialog(runtime).getByLabel('搜索结果', { exact: true })).toHaveAttribute('aria-busy', 'false')
  return dialog(runtime)
}
async function settled(runtime: Desktop, conversationId: string, count: number) {
  await expect.poll(async () => {
    const detail = await artifactDetail(runtime, conversationId)
    return detail.artifacts.length === count && detail.runs.length > 0 && detail.runs.every(run => run.status === 'completed') && detail.turns!.every(turn => turn.status === 'completed')
  }, { timeout: 30_000 }).toBe(true)
  return artifactDetail(runtime, conversationId)
}

Given('原生发送材料和真实工具已发布两版同名成果且关键词只在文件正文', async ({ runtime, searchUpgradeState: state }) => {
  const fixture = state.fixture = await prepareArtifactsDesktop(runtime)
  await selectGroup(runtime, fixture.group.title)
  await nextMaterialDialog(runtime, { path: fixture.source })
  await runtime.page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
  await expect(runtime.page.locator('[data-material-draft-id]')).toHaveAttribute('data-material-status', 'ready')
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('请发布可检查的报告。')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  const detail = await settled(runtime, fixture.group.id, 1)
  state.material = detail.materials![0]; state.artifact = detail.artifacts[0] as ArtifactVersion
  expect(state.material.messageId).toBeTruthy()
  await runtime.page.locator(`#message-${state.artifact.sourceMessageId}:visible`).getByRole('button', { name: `打开 ${state.artifact.name}`, exact: true }).click()
  await runtime.page.locator(`.messages [data-chat-artifact-id="${state.artifact.id}"]`).getByRole('button', { name: '要求修改', exact: true }).click()
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('保留原报告并补充说明，发布修订版。')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  const updated = await settled(runtime, fixture.group.id, 2)
  expect(updated.artifacts.find(item => item.contentVersion === 2)?.previousArtifactId).toBe(state.artifact.id)
  expect(updated.messages.some(item => item.content.includes(SEARCH_ARTIFACT_BODY) || item.content.includes(SEARCH_MATERIAL_BODY))).toBe(false)
  expect(state.artifact.name).not.toContain(SEARCH_ARTIFACT_BODY); expect(state.material.name).not.toContain(SEARCH_MATERIAL_BODY)
  state.original = await searchArtifactBytes(state.artifact); state.calls = fixture.endpoint.requests.length
  state.target = { kind: 'artifact', conversationId: fixture.group.id, artifactId: state.artifact.id, logicalArtifactId: state.artifact.logicalArtifactId, contentVersion: 1, contentHash: state.artifact.contentHash }
})
When('用户检索材料正文独有关键词', async ({ runtime }) => { await search(runtime, SEARCH_MATERIAL_BODY) })
Then('搜索显示有界正文命中和覆盖且打开确切材料', async ({ runtime, searchUpgradeState: state }) => {
  const row = dialog(runtime).locator(`[data-search-kind="material"][data-search-result-id="${state.material!.id}"]`)
  await expect(row).toContainText('正文命中'); await expect(row.locator('mark')).toHaveText(SEARCH_MATERIAL_BODY)
  await expect(dialog(runtime).getByRole('region', { name: '文件正文索引覆盖', exact: true })).toContainText('已索引 3 / 3 项')
  const response = await runtime.page.evaluate(keyword => window.boai.request('searchConversations', { keyword, scope: 'all' }), SEARCH_MATERIAL_BODY)
  expect(response.results).toHaveLength(1); expect(response.results[0]).toMatchObject({ id: state.material!.id, matchedIn: 'body', target: { kind: 'material', revision: state.material!.revision, contentHash: state.material!.contentHash } })
  expect(response.results[0].excerpt!.length).toBeLessThanOrEqual(240)
  await row.click(); await expect(dialog(runtime)).toHaveCount(0)
  await expect(runtime.page.locator(`[data-material-preview-id="${state.material!.id}"]:visible`)).toContainText(SEARCH_MATERIAL_BODY)
})
When('用户检索成果正文独有关键词', async ({ runtime }) => { await search(runtime, SEARCH_ARTIFACT_BODY) })
Then('搜索只打开所选第一版成果并保留原件身份', async ({ runtime, searchUpgradeState: state }) => {
  const row = dialog(runtime).locator(`[data-search-kind="artifact"][data-search-result-id="${state.artifact!.id}"]`)
  await expect(dialog(runtime).locator('[data-search-result-id]')).toHaveCount(1)
  await expect(row).toContainText('正文命中'); await expect(row).toContainText('第 1 版'); await row.click()
  await expect(dialog(runtime)).toHaveCount(0)
  await expect(panel(runtime, state.artifact!.id).getByRole('region', { name: '文件正文', exact: true })).toContainText(SEARCH_ARTIFACT_BODY)
  expect((await artifactRecords(state.fixture!.dataPath)).adoptionCurrent).toEqual([])
})
When('用户重启后重新搜索原成果正文', async ({ runtime, searchUpgradeState: state }) => {
  await runtime.restart(); await selectGroup(runtime, state.fixture!.group.title); await search(runtime, SEARCH_ARTIFACT_BODY)
})
Then('重启后的正文结果仍指向原版且没有新增模型调用或业务工作', async ({ runtime, searchUpgradeState: state }) => {
  await expect(dialog(runtime).locator(`[data-search-result-id="${state.artifact!.id}"]`)).toContainText('第 1 版')
  const records = await artifactRecords(state.fixture!.dataPath)
  expect(records.workItems).toHaveLength(2); expect(records.adoptionCurrent).toEqual([]); expect(state.fixture!.endpoint.requests).toHaveLength(state.calls!)
})
When('用户外改第一版原件后重新检索正文', async ({ runtime, searchUpgradeState: state }) => {
  await writeSearchArtifactBytes(state.artifact!, '# 外部修改\nEXTERNAL_SEARCH_CHANGED_CONTENT\n')
  await search(runtime, '重新核对不存在的关键词'); await search(runtime, SEARCH_ARTIFACT_BODY)
})
Then('搜索不展示旧正文且索引失败覆盖和原因可见', async ({ runtime, searchUpgradeState: state }) => {
  await expect(dialog(runtime).getByLabel('搜索结果', { exact: true })).not.toContainText(SEARCH_ARTIFACT_BODY)
  const coverage = dialog(runtime).getByRole('region', { name: '文件正文索引覆盖', exact: true })
  await expect(coverage).toContainText('失败 1 项'); await coverage.getByText('查看索引未覆盖原因', { exact: true }).click()
  await expect(coverage).toContainText(state.artifact!.name)
  const resolved = await runtime.page.evaluate(target => window.boai.request('resolveConversationSearchTarget', target), state.target!)
  expect(resolved).toMatchObject({ status: 'unavailable', target: state.target }); expect(resolved.excerpt).toBeUndefined()
  expect(state.fixture!.endpoint.requests).toHaveLength(state.calls!)
})
When('用户恢复原件并清空原会话后重启', async ({ runtime, searchUpgradeState: state }) => {
  await writeSearchArtifactBytes(state.artifact!, state.original!)
  await runtime.page.keyboard.press('Escape')
  await runtime.page.evaluate(id => window.boai.request('clearConversationHistory', { id, hide: false }), state.fixture!.group.id)
  await runtime.restart(); await selectGroup(runtime, state.fixture!.group.title)
})
Then('材料成果正文均不回流且旧目标不可用没有业务重放', async ({ runtime, searchUpgradeState: state }) => {
  for (const keyword of [SEARCH_ARTIFACT_BODY, SEARCH_MATERIAL_BODY]) {
    await search(runtime, keyword)
    await expect(dialog(runtime).locator('[data-search-result-id]')).toHaveCount(0)
    await expect(dialog(runtime).getByText('没有找到相关内容', { exact: true })).toBeVisible()
  }
  const targets: ConversationSearchTarget[] = [state.target!, { kind: 'material', conversationId: state.fixture!.group.id, materialId: state.material!.id, revision: state.material!.revision, contentHash: state.material!.contentHash }]
  const rejected = await runtime.page.evaluate(async targets => Promise.all(targets.map(async target => {
    try { return { accepted: true, response: await window.boai.request('resolveConversationSearchTarget', target) } }
    catch (error) { return { accepted: false, response: String(error) } }
  })), targets)
  expect(rejected.every(item => !item.accepted)).toBe(true)
  expect(JSON.stringify(rejected)).not.toContain(SEARCH_ARTIFACT_BODY); expect(JSON.stringify(rejected)).not.toContain(SEARCH_MATERIAL_BODY)
  const records = await artifactRecords(state.fixture!.dataPath)
  expect(records.workItems).toEqual([]); expect(records.messages).toEqual([]); expect(records.artifacts).toEqual([]); expect(records.materials).toEqual([])
  expect(state.fixture!.endpoint.requests).toHaveLength(state.calls!); expect(state.fixture!.errors).toEqual([]); expect(runtime.errors).toEqual([])
})
When('正文搜索实际回执等待期间用户关闭弹窗', async ({ runtime, searchUpgradeState: state }) => {
  state.previousTitle = await runtime.page.locator('.chat-panel:visible .chat-title').innerText()
  state.delay = await delayNextSearchReply(runtime, SEARCH_ARTIFACT_BODY)
  await runtime.page.getByRole('button', { name: '搜索会话内容', exact: true }).click()
  await dialog(runtime).getByRole('textbox', { name: '搜索关键词', exact: true }).fill(SEARCH_ARTIFACT_BODY)
  await expect.poll(() => state.delay!.captured()).toBe(true)
  await dialog(runtime).getByRole('button', { name: '关闭搜索', exact: true }).click()
  await state.delay.release()
})
Then('迟到正文回执不能重新打开搜索或导航其他会话', async ({ runtime, searchUpgradeState: state }) => {
  await expect.poll(() => state.delay!.settled()).toBe(true)
  await runtime.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  await expect(dialog(runtime)).toHaveCount(0)
  await expect(runtime.page.locator('.chat-panel:visible .chat-title')).toHaveText(state.previousTitle!)
  expect(state.fixture!.endpoint.requests).toHaveLength(state.calls!)
  await state.delay!.dispose(); expect(runtime.errors).toEqual([])
})
