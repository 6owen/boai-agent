/*
 * [INPUT]: 真实 Electron、核心工具协议和稳定会话/员工身份。
 * [OUTPUT]: 两字段弹窗、首发持久化、用户指定群名和真实工具创建；改名/分层记忆/重启与失败、标题图标悬停/聚焦/菜单保留与同色、整行12px折叠及等待实际主题的窄窗键盘截图验收。
 * [POS]: bobo 团队创建 BDD；文件原子性/清理冲突保留 teams 模块与恢复测试。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import { coreEndpoint } from '../../fixtures/core-model'
import { interruptTeamRuntime } from '../support/teams'
import type { Snapshot } from '../../../src/shared/domain'
interface State { before?: Snapshot; endpoint?: Awaited<ReturnType<typeof coreEndpoint>>; calls?: number; created?: Snapshot; coreId?: string }
export const test = base.extend<{ team: State }>({ team: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
async function open(page: Page) {
  await page.getByRole('button', { name: '通讯录', exact: true }).click()
  await expect(page.getByRole('button', { name: '创建团队', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '新建', exact: true }).click()
  await page.getByRole('menuitem', { name: '创建团队', exact: true }).click()
  await expect(page.getByRole('dialog', { name: '创建团队', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '团队需求', exact: true })).toBeVisible()
}
async function openCoreDraft(page: Page, name = 'bobo') {
  await page.getByRole('navigation', { name: '会话列表' }).getByRole('button', { name, exact: true }).hover()
  await page.getByRole('button', { name: `与 ${name} 新建会话`, exact: true }).click()
}
for (const [name, options] of [['bobo 已连接离线工具协议模型', {}], ['bobo 的模型认证失败', { unauthorized: true }], ['bobo 的模型响应被挂起', { hold: true }]] as const) Given(name, async ({ runtime, team }) => {
  team.endpoint = await coreEndpoint(options); runtime.trackServer(team.endpoint.server)
  await runtime.start(); await expect(runtime.page.locator('.app-shell')).toBeVisible()
  await runtime.page.evaluate(url => window.boai.request('saveConnection', { name: 'bobo 默认模型', provider: 'openai-compatible', baseUrl: url, defaultModel: 'core-fixture' }), team.endpoint.url)
  team.before = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined)); await open(runtime.page)
})
Given('bobo 团队入口尚未配置模型', async ({ runtime, team }) => {
  await runtime.start(); await expect(runtime.page.locator('.app-shell')).toBeVisible()
  team.before = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined)); await open(runtime.page)
})
Then('团队入口在加号菜单且弹窗只有名称需求', async ({ runtime }) => {
  const section = runtime.page.getByRole('dialog', { name: '创建团队', exact: true })
  await expect(section.getByRole('textbox')).toHaveCount(2); await expect(section.getByRole('button', { name: '生成', exact: true })).toBeVisible()
  await expect(section.getByRole('button', { name: '生成', exact: true })).toBeDisabled()
  await expect(runtime.page.locator('.contacts-list .list-heading button')).toHaveCount(1)
  await expect(section.getByRole('combobox')).toHaveCount(0); await expect(section.getByRole('checkbox')).toHaveCount(0)
  await expect(section).not.toContainText('草稿'); await expect(section).not.toContainText('产品讨论组')
})
When('填写团队需求并进入 bobo 会话', async ({ runtime, team }) => {
  await runtime.page.getByRole('textbox', { name: '团队名称', exact: true }).fill('秋季写作团队')
  await runtime.page.getByRole('textbox', { name: '团队需求', exact: true }).fill('创建四人写作团队，负责策划、资料整理、撰写和审核')
  await runtime.page.getByRole('button', { name: '生成', exact: true }).click()
  await expect(runtime.page.getByRole('group', { name: 'bobo 的会话', exact: true })).toBeVisible()
  await expect(runtime.page.getByRole('textbox', { name: '团队需求', exact: true })).toBeHidden()
  team.coreId = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.find(value => value.purpose === 'core')!.id
})
Then('bobo 一次创建四位成员和指定名称群聊', async ({ runtime, team }) => {
  await expect.poll(async () => (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.length).toBe(team.before!.agents.length + 4)
  team.created = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const group = team.created.conversations.find(value => value.kind === 'group')!
  expect(group.title).toBe('秋季写作团队'); expect(group.agentIds).toHaveLength(4)
  const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), group.id)
  expect(detail.messages).toEqual([]); expect(detail.workItems).toEqual([])
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), team.coreId!)).workItems?.[0]?.status).toBe('delivered')
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), team.coreId!)).turns?.every(turn => turn.status === 'completed')).toBe(true)
  await expect(runtime.page.getByRole('region', { name: '团队创建结果', exact: true }).getByRole('button', { name: '进入群聊', exact: true })).toBeVisible()
  const recovery = await runtime.page.evaluate(() => window.boai.request('listTeamCreationRecovery', undefined))
  expect(recovery.operations.filter(value => value.status === 'committed')).toHaveLength(1); expect(runtime.errors).toEqual([])
})
When('从通讯录把核心助手改名为波波', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '通讯录', exact: true }).click()
  const core = runtime.page.getByRole('complementary', { name: '通讯录列表', exact: true })
  await expect(core.getByText('系统助手', { exact: true })).toHaveCount(0)
  await core.getByRole('button', { name: 'bobo', exact: true }).click({ button: 'right' })
  await runtime.page.getByRole('menuitem', { name: '编辑配置', exact: true }).click()
  await runtime.page.getByRole('textbox', { name: '助手名称', exact: true }).fill('波波')
  await runtime.page.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(core.getByRole('button', { name: '波波', exact: true })).toBeVisible()
})
Then('波波的新会话独立且已有团队身份保留', async ({ runtime, team }) => {
  await runtime.page.getByRole('button', { name: '会话', exact: true }).click()
  await openCoreDraft(runtime.page, '波波')
  await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toBeVisible()
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.filter(value => value.purpose === 'core')).toHaveLength(1)
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('你好，波波')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.filter(value => value.purpose === 'core').length).toBe(2)
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.find(agent => agent.id === 'bobo')).toMatchObject({ name: '波波', systemRole: 'core', memoryNamespace: 'employee:bobo' })
  expect(snapshot.conversations.filter(value => value.purpose === 'core')).toHaveLength(2)
  expect(snapshot.conversations.find(value => value.kind === 'group')!.agentIds).toEqual(team.created!.conversations.find(value => value.kind === 'group')!.agentIds)
  await expect(runtime.page.getByRole('group', { name: '波波 的会话', exact: true }).locator('.conversation-item')).toHaveCount(2)
})
When('在没有模型时提交团队需求', async ({ runtime }) => {
  await runtime.page.getByRole('textbox', { name: '团队名称', exact: true }).fill('研究团队')
  await runtime.page.getByRole('textbox', { name: '团队需求', exact: true }).fill('需要一个研究团队'); await runtime.page.getByRole('button', { name: '生成', exact: true }).click()
})
Then('需求保留且没有创建聊天或员工', async ({ runtime, team }) => {
  await expect(runtime.page.getByRole('textbox', { name: '团队名称', exact: true })).toHaveValue('研究团队')
  await expect(runtime.page.getByRole('textbox', { name: '团队需求', exact: true })).toHaveValue('需要一个研究团队')
  await expect(runtime.page.getByRole('button', { name: '设置模型连接', exact: true })).toBeVisible()
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents).toEqual(team.before!.agents); expect(snapshot.conversations).toEqual([])
})
Then('核心会话明确失败且没有新增团队对象', async ({ runtime, team }) => {
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), team.coreId!)).runs.some(run => run.status === 'failed')).toBe(true)
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents).toHaveLength(team.before!.agents.length); expect(snapshot.conversations.filter(value => value.kind === 'group')).toEqual([])
  expect(team.endpoint!.requests).toHaveLength(1); await expect(runtime.page.getByText(/失败|认证|Unauthorized/).first()).toBeVisible()
})
When('重启已有 bobo 团队会话', async ({ runtime, team }) => { team.calls = team.endpoint!.requests.length; await runtime.restart(); await expect(runtime.page.locator('.app-shell')).toBeVisible() })
Then('原成员和群聊身份保留且模型没有重发', async ({ runtime, team }) => {
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.map(value => value.id).sort()).toEqual(team.created!.agents.map(value => value.id).sort())
  expect(snapshot.conversations.map(value => value.id).sort()).toEqual(team.created!.conversations.map(value => value.id).sort())
  expect(team.endpoint!.requests).toHaveLength(team.calls!); await expect(runtime.page.getByRole('group', { name: 'bobo 的会话', exact: true })).toBeVisible()
})
When('中断并重启尚未完成的核心会话', async ({ runtime, team }) => {
  await expect.poll(() => team.endpoint!.requests.length).toBeGreaterThan(1)
  await interruptTeamRuntime(runtime); team.calls = team.endpoint!.requests.length
  await runtime.restart(); await expect(runtime.page.locator('.app-shell')).toBeVisible()
})
Then('中断记录保留且没有重发或半套团队', async ({ runtime, team }) => {
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents).toHaveLength(team.before!.agents.length); expect(snapshot.conversations.filter(value => value.kind === 'group')).toEqual([])
  const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), team.coreId!)
  expect(detail.runs.some(run => run.status === 'interrupted')).toBe(true); expect(team.endpoint!.requests).toHaveLength(team.calls!)
})
When('与 bobo 新建会话并保存三层记忆', async ({ runtime, team }) => {
  await runtime.page.getByRole('button', { name: '取消', exact: true }).click()
  await runtime.page.getByRole('button', { name: '会话', exact: true }).click()
  await openCoreDraft(runtime.page)
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations).toEqual([])
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('你好，先记住简洁中文 CORE_CANARY')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.filter(value => value.purpose === 'core').length).toBe(1)
  team.coreId = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.find(value => value.purpose === 'core')!.id
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), team.coreId!)).turns?.every(turn => turn.status === 'completed')).toBe(true)
  await runtime.page.evaluate(async () => {
    const query = { agentId: 'bobo', scope: 'employee' as const }
    for (const kind of ['long_term', 'experience', 'temporary'] as const) {
      const memory = await window.boai.request('getMemory', query)
      await window.boai.request('saveMemory', { ...query, kind, content: `${kind} 偏好简洁中文 CORE_CANARY`, ...(kind === 'temporary' ? { expiresAt: new Date(Date.now() + 60_000).toISOString() } : {}), expectedEpoch: memory.epoch })
    }
  })
  await openCoreDraft(runtime.page)
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.filter(value => value.purpose === 'core')).toHaveLength(1)
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('继续偏好简洁中文 CORE_CANARY')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.filter(value => value.purpose === 'core').length).toBe(2)
  team.coreId = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.filter(value => value.purpose === 'core').find(value => value.id !== team.coreId)!.id
})
Then('新核心会话召回获准记忆且没有创建工作或团队', async ({ runtime, team }) => {
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), team.coreId!)).messages.some(message => message.senderId === 'bobo' && message.status === 'completed')).toBe(true)
  expect(team.endpoint!.requests.some(request => (request.messages as { role: string; content: string }[]).some(message => message.role === 'system' && message.content.includes('CORE_CANARY')))).toBe(true)
  const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), team.coreId!); expect(detail.workItems).toEqual([])
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents).toHaveLength(team.before!.agents.length); expect(snapshot.conversations.filter(value => value.kind === 'group')).toEqual([])
})
Then('两字段弹窗在深浅主题窄窗下可键盘生成', async ({ runtime, team }) => {
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(900, 760))
  for (const theme of ['dark', 'light'] as const) {
    await runtime.page.evaluate(async value => { const appearance = await window.boai.request('getAppearance', undefined); await window.boai.request('updateAppearance', { patch: { mode: value }, expectedRevision: appearance.revision }) }, theme)
    await expect(runtime.page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(runtime.page.getByRole('textbox', { name: '团队需求', exact: true })).toBeVisible()
    expect(await runtime.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await runtime.page.screenshot({ path: `test-results/team-create-dialog-${theme}.png`, animations: 'disabled' })
  }
  await runtime.page.getByRole('textbox', { name: '团队名称', exact: true }).fill('秋季写作团队')
  await runtime.page.getByRole('textbox', { name: '团队需求', exact: true }).fill('创建四人写作团队')
  await runtime.page.getByRole('button', { name: '生成', exact: true }).focus(); await runtime.page.keyboard.press('Enter')
  await expect(runtime.page.getByRole('group', { name: 'bobo 的会话', exact: true })).toBeVisible()
  team.coreId = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.find(value => value.purpose === 'core')!.id
})

When('反复打开核心空白聊天并输入未发送内容', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '会话', exact: true }).click()
  const heading = page.getByRole('navigation', { name: '会话列表' }).getByRole('button', { name: 'bobo', exact: true })
  const compose = page.getByRole('button', { name: '与 bobo 新建会话', exact: true })
  const more = page.getByRole('button', { name: 'bobo 的更多操作', exact: true })
  await expect(compose).toHaveText(''); await expect(more).toHaveText('')
  await expect(compose).toHaveCSS('opacity', '0'); await expect(more).toHaveCSS('opacity', '0')
  await heading.hover()
  await expect(compose).toHaveCSS('opacity', '1'); await expect(more).toHaveCSS('opacity', '1')
  const labelColor = await heading.evaluate(element => getComputedStyle(element).color)
  await expect(compose).toHaveCSS('color', labelColor); await expect(more).toHaveCSS('color', labelColor)
  await more.click(); await expect(page.getByRole('menuitem', { name: '助手设置', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '会话', exact: true }).hover()
  await expect(more).toHaveCSS('opacity', '1'); await expect(compose).toHaveCSS('opacity', '1')
  await page.keyboard.press('Escape'); await expect(heading).toHaveAttribute('aria-expanded', 'true')
  await heading.focus(); await page.keyboard.press('Tab'); await expect(more).toBeFocused()
  await expect(more).toHaveCSS('opacity', '1')
  await page.keyboard.press('Tab'); await expect(compose).toBeFocused(); await expect(compose).toHaveCSS('opacity', '1')
  await page.getByRole('button', { name: '会话', exact: true }).focus()
  await expect(compose).toHaveCSS('opacity', '0'); await expect(more).toHaveCSS('opacity', '0')
  await heading.hover()
  await expect(heading.locator('.app-icon')).toHaveCSS('width', '12px')
  const bounds = (await heading.boundingBox())!, row = (await heading.locator('..').boundingBox())!
  expect(bounds.width).toBeGreaterThan(row.width - 66)
  await heading.click({ position: { x: bounds.width - 4, y: bounds.height / 2 } })
  await expect(heading).toHaveAttribute('aria-expanded', 'false'); await expect(compose).toBeVisible()
  await heading.press('Enter'); await expect(heading).toHaveAttribute('aria-expanded', 'true')
  for (let i = 0; i < 5; i++) await openCoreDraft(page)
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('   ')
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeDisabled()
  await page.getByRole('textbox', { name: '消息内容', exact: true }).press('Enter')
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations).toEqual([])
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('你好，保留这条未发送消息')
  await page.getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('button', { name: '会话', exact: true }).click()
  for (let i = 0; i < 3; i++) await openCoreDraft(page)
})
Then('空白页保持内容且尚未创建任何会话', async ({ runtime, team }) => {
  await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('你好，保留这条未发送消息')
  await expect(runtime.page.locator('.conversation-list-panel .conversation-item')).toHaveCount(0)
  await expect(runtime.page.getByRole('button', { name: '添加或更多操作', exact: true })).toHaveCount(0)
  await expect(runtime.page.getByRole('button', { name: '会话操作', exact: true })).toHaveCount(0)
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations).toEqual([])
  expect(team.endpoint!.requests).toHaveLength(0)
  await runtime.page.getByRole('button', { name: '会话', exact: true }).hover()
  await expect(runtime.page.getByRole('button', { name: '与 bobo 新建会话', exact: true })).toHaveCSS('opacity', '0')
  await runtime.page.screenshot({ path: 'test-results/core-chat-blank.png' })
})
When('发送空白页的首条消息', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
})
Then('只保存一个核心会话和一条初始用户消息', async ({ runtime }) => {
  await expect.poll(async () => (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.length).toBe(1)
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const conversation = snapshot.conversations[0]
  expect(conversation.purpose).toBe('core')
  const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
  expect(detail.messages.filter(message => message.senderType === 'user')).toHaveLength(1)
  expect(detail.messages[0].content).toBe('你好，保留这条未发送消息')
  expect(detail.workItems).toEqual([])
  await expect(runtime.page.locator('.conversation-list-panel .conversation-item')).toHaveCount(1)
  await expect(runtime.page.getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('')
})
When('重新加载未发送的核心空白页', async ({ runtime }) => { await runtime.page.reload(); await expect(runtime.page.locator('.app-shell')).toBeVisible() })
Then('空白会话没有残留在列表或数据库', async ({ runtime, team }) => {
  await expect(runtime.page.locator('.conversation-list-panel .conversation-item')).toHaveCount(0)
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).conversations).toEqual([])
  expect(team.endpoint!.requests).toHaveLength(0)
  expect(runtime.errors).toEqual([])
})
