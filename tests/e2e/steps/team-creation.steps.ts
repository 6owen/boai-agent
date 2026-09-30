/*
 * [INPUT]: 隔离 Electron、真实 IPC 和团队创建界面。
 * [OUTPUT]: 旧连接缺失模型时配置导航/草稿保持、当前群改名/移除不复活；自动聚焦方案/结果、首个无效字段和重名错误关联，边界/恢复/零副作用与群私聊的实际验收。
 * [POS]: 团队创建 BDD 步骤，不使用模拟页面。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { join } from 'node:path'
import { interruptTeamCreation } from '../../fixtures/team-crash'
import { teamEndpoint, sendTeamOutput, writingPlan } from '../../fixtures/team-planner'
import { saveCompetingTeamDraft, interruptTeamRuntime, modifyPreparedFile, removePublishedMember, removePublishedGroup, clearTeamDefaultModel, recordTeamDemo } from '../support/teams'
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Snapshot } from '../../../src/shared/domain'
import type { Page } from '@playwright/test'
export const test = base.extend<{ team: { before?: Snapshot; calls?: Record<string, unknown>[]; interrupted?: Awaited<ReturnType<typeof interruptTeamCreation>> } }>({ team: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
async function open(page: Page) {
  await page.getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('menuitem', { name: '创建团队', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '团队需求', exact: true })).toBeVisible()
}
Given('通讯录团队草稿入口已打开', async ({ runtime, team }) => {
  await runtime.start(); await expect(runtime.page.locator('.app-shell')).toBeVisible()
  team.before = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  await open(runtime.page)
})
When('填写团队需求并保存后切换页面和重开标签', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('textbox', { name: '团队需求', exact: true }).fill('四人写作团队，分工清楚')
  await expect(page.getByText('草稿已保存', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '会话', exact: true }).click()
  await expect(page.getByRole('tab', { name: '创建团队', exact: true })).toBeHidden()
  await page.getByRole('button', { name: '新建', exact: true }).click()
  await expect(page.getByRole('menuitem', { name: '创建团队', exact: true })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await open(page)
  await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await open(page)
})
When('重启桌面后重新打开团队入口', async ({ runtime }) => { await runtime.restart(); await expect(runtime.page.locator('.app-shell')).toBeVisible(); await open(runtime.page) })
Then('草稿保持原文且没有创建员工或聊天', async ({ runtime, team }) => {
  await expect(runtime.page.getByRole('textbox', { name: '团队需求', exact: true })).toHaveValue('四人写作团队，分工清楚')
  const after = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(after.agents).toEqual(team.before!.agents); expect(after.conversations).toEqual(team.before!.conversations)
  expect(runtime.errors).toEqual([])
})

Given('团队助手已连接离线协议模型', async ({ runtime, team }) => {
  const endpoint = await teamEndpoint(); runtime.trackServer(endpoint.server)
  await runtime.start(); await expect(runtime.page.locator('.app-shell')).toBeVisible()
  await runtime.page.evaluate(url => window.boai.request('saveConnection', { name: '团队协议模型', provider: 'openai-compatible', baseUrl: url, defaultModel: 'team-fixture' }), endpoint.url)
  team.before = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  team.calls = endpoint.requests
  await open(runtime.page)
})
When('生成四人方案并修改成员职责', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('textbox', { name: '团队需求', exact: true }).fill('创建四人写作团队')
  await page.getByRole('button', { name: '生成方案', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '成员 1 姓名', exact: true })).toHaveValue('策划')
  await expect(page.getByText('团队方案 · 4 位成员', { exact: true })).toBeFocused()
  await page.getByRole('textbox', { name: '成员 1 职责', exact: true }).fill('确定读者与文章提纲')
  await page.getByRole('textbox', { name: '群名称', exact: true }).fill('我的写作讨论组')
  await expect(page.getByText('草稿已保存', { exact: true })).toBeVisible()
})
Then('方案修改已持久化且仍没有新增员工或聊天', async ({ runtime, team }) => {
  const value = await runtime.page.evaluate(async () => { const draft = await window.boai.request('openTeamDraft', undefined); return { draft, snapshot: await window.boai.request('snapshot', undefined) } })
  expect(value.draft.plan?.members[0].role).toBe('确定读者与文章提纲')
  expect(value.draft.groupTitle).toBe('我的写作讨论组'); expect(value.draft.planHash).toBeTruthy()
  expect(value.snapshot.agents).toEqual(team.before!.agents); expect(value.snapshot.conversations).toEqual(team.before!.conversations)
  expect(team.calls).toHaveLength(1)
  await runtime.restart(); await expect(runtime.page.locator('.app-shell')).toBeVisible(); await open(runtime.page)
  await expect(runtime.page.getByRole('textbox', { name: '成员 1 职责', exact: true })).toHaveValue('确定读者与文章提纲')
  expect(team.calls).toHaveLength(1)
})

Given('团队创建在部分目录移动后被强制退出', async ({ runtime, team }) => {
  team.interrupted = await interruptTeamCreation(join(runtime.root, 'v2'), 'after-move')
  await runtime.start(); await expect(runtime.page.locator('.app-shell')).toBeVisible(); await open(runtime.page)
})
Then('创建恢复入口可见且没有发布任何新员工', async ({ runtime, team }) => {
  await expect(runtime.page.getByRole('button', { name: '继续创建', exact: true })).toBeVisible()
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.filter(a => a.creationSource?.operationId === team.interrupted!.operationId)).toEqual([])
  expect(snapshot.conversations).toEqual([])
})
When('明确继续原来的团队创建', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '继续创建', exact: true }).click()
  await expect(runtime.page.getByRole('heading', { name: '4 位员工已创建' })).toBeVisible()
})
Then('所有原定成员一次发布且重开只显示原结果', async ({ runtime, team }) => {
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.filter(a => a.creationSource?.operationId === team.interrupted!.operationId).map(a => a.id)).toEqual(team.interrupted!.memberIds.map(m => m.agentId))
  expect(snapshot.conversations).toHaveLength(1)
  await runtime.restart(); await expect(runtime.page.locator('.app-shell')).toBeVisible(); await openTeamResult(runtime.page)
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents).toEqual(snapshot.agents)
  await expect(runtime.page.getByRole('button', { name: '进入群聊', exact: true })).toBeVisible()
})
async function openTeamResult(page: Page) {
  await page.getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('menuitem', { name: '创建团队', exact: true }).click()
  await expect(page.getByRole('heading', { name: '4 位员工已创建' })).toBeVisible()
}
When('取消建群并确认创建成员', async ({ runtime }) => {
  await runtime.page.getByRole('checkbox', { name: '同时创建群聊', exact: true }).uncheck()
  await runtime.page.getByRole('button', { name: '创建 4 位员工', exact: true }).click()
  await expect(runtime.page.getByRole('heading', { name: '4 位员工已创建' })).toBeVisible()
})
Then('只发布四名成员且私聊沿用同一身份', async ({ runtime, team }) => {
  await recordTeamDemo(runtime, test.info())
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents).toHaveLength(team.before!.agents.length + 4); expect(snapshot.conversations).toEqual([])
  const agent = snapshot.agents.find(a => a.creationSource && a.name === '策划')!
  await runtime.page.getByRole('button', { name: '联系 策划', exact: true }).click()
  const after = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(after.conversations).toHaveLength(1); expect(after.conversations[0].agentIds).toEqual([agent.id])
  expect(team.calls).toHaveLength(1)
  const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), after.conversations[0].id)
  expect(detail.messages).toEqual([]); expect(detail.workItems ?? []).toEqual([])
})

When('确认创建员工和群聊并进入群聊', async ({ runtime, team }) => {
  await runtime.page.getByRole('button', { name: '创建 4 位员工和群聊', exact: true }).click()
  await expect(runtime.page.getByRole('heading', { name: '4 位员工已创建' })).toBeVisible()
  expect(team.calls).toHaveLength(1)
  await runtime.page.getByRole('button', { name: '进入群聊', exact: true }).click()
})
Then('创建本身没有消息且成员自我介绍不产生工作项', async ({ runtime, team }) => {
  await recordTeamDemo(runtime, test.info())
  const page = runtime.page, snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined)), group = snapshot.conversations.find(c => c.kind === 'group')!
  const before = await page.evaluate(id => window.boai.request('getConversation', { id }), group.id)
  expect(before.messages).toEqual([]); expect(before.workItems ?? []).toEqual([])
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('先各自介绍一下')
  await page.getByRole('textbox', { name: '消息内容', exact: true }).press('Enter')
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getConversation', { id }), group.id)).messages.filter(m => m.senderType === 'agent' && m.status === 'completed').length).toBe(4)
  const after = await page.evaluate(id => window.boai.request('getConversation', { id }), group.id)
  expect(after.workItems ?? []).toEqual([])
  expect(group.agentIds).toEqual(snapshot.agents.filter(a => a.creationSource).map(a => a.id))
  expect(JSON.stringify(team.calls)).toContain('群资料背景')
  expect(JSON.stringify(team.calls)).toContain('不是本轮请求')
})

Then('无连接和多个连接均不擅自生成方案', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('textbox', { name: '团队需求', exact: true }).fill('请保留我的需求')
  await expect(page.getByRole('button', { name: '配置模型', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '生成方案', exact: true })).toBeDisabled()
  await page.evaluate(async () => { for (const name of ['连接一', '连接二']) await window.boai.request('saveConnection', { name, provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'fixture' }) })
  await expect(page.getByRole('combobox', { name: '模型连接', exact: true })).toContainText('请选择')
  await expect(page.getByRole('button', { name: '生成方案', exact: true })).toBeDisabled()
  await expect(page.getByRole('textbox', { name: '团队需求', exact: true })).toHaveValue('请保留我的需求')
  await page.getByRole('combobox', { name: '模型连接', exact: true }).click()
  await page.getByRole('option', { name: '连接一', exact: true }).click()
  await page.getByRole('textbox', { name: '模型', exact: true }).fill('   ')
  await expect(page.getByRole('button', { name: '生成方案', exact: true })).toBeEnabled()
  await expect(page.getByText('草稿已保存', { exact: true })).toBeVisible()
  const draft = await page.evaluate(() => window.boai.request('openTeamDraft', undefined))
  await clearTeamDefaultModel(runtime, draft.selectedConnectionId)
  await open(runtime.page)
  await expect(runtime.page.getByRole('button', { name: '生成方案', exact: true })).toBeDisabled()
  await expect(runtime.page.getByRole('button', { name: '配置模型', exact: true })).toBeVisible()
  await runtime.page.getByRole('button', { name: '配置模型', exact: true }).click()
  await expect(runtime.page.getByRole('tab', { name: '创建团队', exact: true })).toBeHidden()
  await open(runtime.page)
  await expect(runtime.page.getByRole('textbox', { name: '团队需求', exact: true })).toHaveValue('请保留我的需求')
  expect((await runtime.page.evaluate(draftId => window.boai.request('getTeamDraft', { draftId }), draft.id)).generation).toBeUndefined()
})
Then('并发保存冲突不覆盖本地内容', async ({ runtime }) => {
  const draft = await runtime.page.evaluate(() => window.boai.request('openTeamDraft', undefined))
  await runtime.page.getByRole('textbox', { name: '团队需求', exact: true }).fill('窗口一的本地需求')
  await saveCompetingTeamDraft(runtime, draft)
  await expect(runtime.page.getByRole('alert')).toContainText('DRAFT_CONFLICT')
  await expect(runtime.page.getByRole('textbox', { name: '团队需求', exact: true })).toHaveValue('窗口一的本地需求')
  await runtime.page.getByRole('button', { name: '读取最新版本', exact: true }).click()
  await expect(runtime.page.getByText('另一编辑者的已保存需求', { exact: true })).toBeVisible()
  await runtime.page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(runtime.page.getByText('草稿已保存', { exact: true })).toBeVisible()
  expect((await runtime.page.evaluate(() => window.boai.request('openTeamDraft', undefined))).prompt).toBe('窗口一的本地需求')
})
Then('调整到 {int} 人后全部创建且不能越过边界', async ({ runtime, team }, count: number) => {
  const page = runtime.page
  if (count === 1) { for (let index = 4; index > 1; index--) await page.getByRole('button', { name: `移除成员 ${index}`, exact: true }).click(); await expect(page.getByRole('button', { name: '移除成员 1', exact: true })).toBeDisabled() }
  else { for (let index = 4; index < count; index++) await page.getByRole('button', { name: '增加成员', exact: true }).click(); await expect(page.getByRole('button', { name: '增加成员', exact: true })).toBeDisabled() }
  await page.getByRole('button', { name: `创建 ${count} 位员工和群聊`, exact: true }).click()
  await expect(page.getByRole('heading', { name: `${count} 位员工已创建`, exact: true })).toBeVisible()
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents).toHaveLength(team.before!.agents.length + count); expect(snapshot.conversations[0].agentIds).toHaveLength(count)
})
Then('方案内重名阻止保存而旧员工同名只提示', async ({ runtime, team }) => {
  const page = runtime.page, field = page.getByRole('textbox', { name: '成员 1 姓名', exact: true })
  await field.fill('')
  await field.locator('xpath=ancestor::details').locator('summary').click()
  await page.getByRole('button', { name: '创建 4 位员工和群聊', exact: true }).click()
  await expect(field).toBeFocused()
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents).toEqual(team.before!.agents)
  await field.fill('研究'); await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(field).toBeFocused()
  await expect(field).toHaveAttribute('aria-invalid', 'true')
  await expect(field).toHaveAccessibleDescription('本方案内成员姓名不能重复')
  await expect(page.getByRole('alert')).toContainText('姓名不能重复')
  await expect(field).toBeFocused()
  await page.screenshot({ path: test.info().outputPath('team-invalid-name.png') })
  const old = team.before!.agents[0]; await field.fill(old.name); await page.getByRole('button', { name: '保存草稿', exact: true }).click()
  await expect(page.getByText('已有同名员工；本次会创建独立身份。').first()).toBeVisible()
  await page.getByRole('button', { name: '创建 4 位员工和群聊', exact: true }).click()
  await expect(page.getByRole('heading', { name: '4 位员工已创建' })).toBeVisible()
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.find(a => a.id === old.id)).toEqual(old); expect(snapshot.agents.filter(a => a.name === old.name)).toHaveLength(2)
})
Then('改变连接配置后确认创建明确失败', async ({ runtime, team }) => {
  const page = runtime.page
  await page.evaluate(async () => { const c = (await window.boai.request('snapshot', undefined)).connections[0]; await window.boai.request('saveConnection', { id: c.id, name: c.name, provider: c.provider, baseUrl: c.baseUrl, defaultModel: 'changed' }) })
  await page.getByRole('button', { name: '创建 4 位员工和群聊', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('CONFIG_CHANGED')
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents).toEqual(team.before!.agents)
})
Then('外部文件修改使放弃失败且可以明确继续清理', async ({ runtime, team }) => {
  const restore = await modifyPreparedFile(runtime, team.interrupted!.memberIds[0].agentId)
  await runtime.page.getByRole('button', { name: '放弃并清理', exact: true }).click()
  await expect(runtime.page.getByRole('alert')).toContainText('FILES_CONFLICT')
  await expect(runtime.page.getByRole('button', { name: '继续清理', exact: true })).toBeVisible()
  await restore(); await runtime.page.getByRole('button', { name: '继续清理', exact: true }).click()
  await expect(runtime.page.getByRole('textbox', { name: '团队需求', exact: true })).toHaveValue('')
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.some(a => a.creationSource?.operationId === team.interrupted!.operationId)).toBe(false)
})
Given('团队创建已提交但回复前被强制退出', async ({ runtime, team }) => {
  team.interrupted = await interruptTeamCreation(join(runtime.root, 'v2'), 'after-commit')
  await runtime.start(); await expect(runtime.page.locator('.app-shell')).toBeVisible(); await openTeamResult(runtime.page)
})
Given('团队生成正在等待模型响应', async ({ runtime, team }) => {
  const endpoint = await teamEndpoint((_body, response) => { response.writeHead(200, { 'Content-Type': 'text/event-stream' }); response.write(': hold\n\n') }); runtime.trackServer(endpoint.server); team.calls = endpoint.requests
  await runtime.start(); await runtime.page.evaluate(url => window.boai.request('saveConnection', { name: '延迟模型', provider: 'openai-compatible', baseUrl: url, defaultModel: 'fixture' }), endpoint.url)
  await open(runtime.page); await runtime.page.getByRole('textbox', { name: '团队需求', exact: true }).fill('写作')
  await runtime.page.getByRole('button', { name: '生成方案', exact: true }).click()
  await expect.poll(() => team.calls!.length).toBe(1)
})
Then('强制退出并重启只恢复中断记录', async ({ runtime, team }) => {
  await interruptTeamRuntime(runtime); await runtime.restart(); await open(runtime.page)
  await expect(runtime.page.getByRole('button', { name: '生成方案', exact: true })).toBeEnabled()
  await expect(runtime.page.getByText('包含未知用量', { exact: false })).toBeVisible()
  const value = await runtime.page.evaluate(async () => { const draft = await window.boai.request('openTeamDraft', undefined); return window.boai.request('getTeamDraft', { draftId: draft.id }) })
  expect(value.generation?.status).toBe('interrupted'); expect(value.draft.plan).toBeUndefined(); expect(team.calls).toHaveLength(1)
})
Given('团队助手生成狼人杀玩家方案', async ({ runtime, team }) => {
  const endpoint = await teamEndpoint((_body, response) => sendTeamOutput(response, { ...writingPlan, name: '狼人杀玩家互动群', purpose: '围绕假设情境交流，展示不同发言性格', members: [{ name: '老周', role: '沉稳分析', instructions: '按公开发言分析，不编造身份。' }, { name: '阿豪', role: '直接质疑', instructions: '直率表达疑点，允许修正判断。' }, { name: '小雨', role: '感性表达', instructions: '表达感受，不声称已知秘密身份。' }, { name: '老猫', role: '幽默互动', instructions: '轻松表达，尊重其他成员。' }], scenarioKind: 'roleplay', capabilityNotes: ['未支持正式游戏规则、隐藏身份、投票和胜负裁定；成员无永久秘密身份。'] })); runtime.trackServer(endpoint.server); team.calls = endpoint.requests
  await runtime.start(); await runtime.page.evaluate(url => window.boai.request('saveConnection', { name: '角色协议模型', provider: 'openai-compatible', baseUrl: url, defaultModel: 'fixture' }), endpoint.url)
  await open(runtime.page); await runtime.page.getByRole('button', { name: '角色玩家', exact: true }).click()
  expect(team.calls).toHaveLength(0)
  await runtime.page.getByRole('button', { name: '生成方案', exact: true }).click()
  await expect(runtime.page.getByRole('textbox', { name: '成员 1 姓名', exact: true })).toBeVisible()
})
Then('玩家群限制清晰且通过主题窄窗缩放键盘验收', async ({ runtime }) => {
  const page = runtime.page
  await expect(page.getByText('能力说明：', { exact: false })).toContainText('未支持正式游戏规则')
  for (const mode of ['light', 'dark'] as const) for (const width of [760, 1440]) for (const zoom of [1, 1.25]) {
    await page.evaluate(async mode => { const value = await window.boai.request('getAppearance', undefined); await window.boai.request('updateAppearance', { patch: { mode }, expectedRevision: value.revision }) }, mode)
    await runtime.app.evaluate(({ BrowserWindow }, factor) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(factor), zoom)
    await page.setViewportSize({ width, height: 950 })
    const create = page.getByRole('button', { name: '创建 4 位员工和群聊', exact: true }); await create.scrollIntoViewIfNeeded(); await expect(create).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    await page.getByRole('textbox', { name: '团队需求', exact: true }).scrollIntoViewIfNeeded()
    await page.screenshot({ path: test.info().outputPath(`team-${mode}-${width}-${zoom}.png`) })
  }
  await page.getByRole('button', { name: '创建 4 位员工和群聊', exact: true }).focus(); await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: '4 位员工已创建' })).toBeVisible()
  await expect(page.getByRole('heading', { name: '4 位员工已创建' })).toBeFocused()
  await page.getByRole('button', { name: '进入群聊', exact: true }).focus(); await expect(page.getByRole('button', { name: '进入群聊', exact: true })).toBeFocused()
  await page.screenshot({ path: test.info().outputPath('team-result.png') })
  expect(runtime.errors).toEqual([])
})
Then('改名和移除后原回执不会复活旧对象', async ({ runtime }) => {
  const first = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(a => a.creationSource)!
  await runtime.page.evaluate(async a => { const { configVersion, creationSource, workspaceRef, memoryNamespace, policyVersion, ...fields } = a; await window.boai.request('saveAgent', { ...fields, name: '已改名的成员', expectedConfigVersion: configVersion }) }, first)
  await expect(runtime.page.getByRole('button', { name: '联系 已改名的成员', exact: true })).toBeVisible()
  await removePublishedMember(runtime, first.id); await openTeamResult(runtime.page)
  await expect(runtime.page.getByText('成员已移除', { exact: true })).toBeVisible()
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.some(a => a.id === first.id)).toBe(false)
})

Given('团队模型认证失败', async ({ runtime, team }) => {
  const endpoint = await teamEndpoint((_body, response) => { response.writeHead(401, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: 'invalid test credential' } })) }); runtime.trackServer(endpoint.server); team.calls = endpoint.requests
  await runtime.start(); await runtime.page.evaluate(url => window.boai.request('saveConnection', { name: '认证失败模型', provider: 'openai-compatible', baseUrl: url, defaultModel: 'fixture' }), endpoint.url)
  team.before = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  await open(runtime.page); await runtime.page.getByRole('textbox', { name: '团队需求', exact: true }).fill('写作')
  await runtime.page.getByRole('button', { name: '生成方案', exact: true }).click()
})
Then('失败只调用一次且不创建任何对象', async ({ runtime, team }) => {
  await expect(runtime.page.getByRole('alert')).toContainText('生成失败，请检查模型连接')
  await expect(runtime.page.getByText('包含未知用量', { exact: false })).toBeVisible()
  expect(team.calls).toHaveLength(1)
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents).toEqual(team.before!.agents); expect(snapshot.conversations).toEqual([])
})

Then('群目的和协作建议可以编辑和移除', async ({ runtime }) => {
  const page = runtime.page, original = (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations[0]
  await page.getByRole('button', { name: '会话操作', exact: true }).click(); await page.getByRole('menuitem', { name: '配置', exact: true }).click()
  await page.getByRole('textbox', { name: '团队目的', exact: true }).fill('仅讨论我提供的材料')
  await page.getByRole('textbox', { name: '协作建议', exact: true }).fill('保持普通交流，按需分工')
  await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations[0].teamSetup?.purpose).toBe('仅讨论我提供的材料')
  await page.getByRole('button', { name: '会话操作', exact: true }).click(); await page.getByRole('menuitem', { name: '配置', exact: true }).click()
  await page.getByRole('button', { name: '移除团队背景', exact: true }).click(); await page.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations[0].teamSetup).toBeUndefined()
  const after = (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations[0]
  expect(after.agentIds).toEqual(original.agentIds); expect(after.creationSource).toEqual(original.creationSource)
  await page.evaluate(c => window.boai.request('createConversation', { id: c.id, expectedConfigVersion: c.configVersion, kind: 'group', title: '已改名的团队群', agentIds: c.agentIds }), after)
  await openTeamResult(page)
  await expect(page.getByText('群聊：已改名的团队群', { exact: true })).toBeVisible()
  await removePublishedGroup(runtime, original.id)
  await openTeamResult(runtime.page)
  await expect(runtime.page.getByText('群聊已移除', { exact: true })).toBeVisible()
  await expect(runtime.page.getByRole('button', { name: '进入群聊', exact: true })).toHaveCount(0)
  const recovered = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(recovered.conversations.some(c => c.id === original.id)).toBe(false)
  expect(recovered.agents.filter(a => original.agentIds.includes(a.id))).toHaveLength(original.agentIds.length)
})
