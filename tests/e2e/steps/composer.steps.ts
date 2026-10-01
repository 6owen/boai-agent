/*
 * [INPUT]: 输入框配置持久化与员工隔离的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 仅支持真实禁止命令/逐次批准的权限往返保存、无虚假完全访问选项；失败保持已提交权限和真实重启持久化；单聊/群聊草稿、明确会话定位、点名、配置锁定/员工隔离与思考强度键盘/窄窗/重启断言。
 * [POS]: tests/e2e/steps/composer.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { messageDraft } from '../support/editor-controls'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { rejectNextPermissionSave } from '../support/composer'
import { createServer } from 'node:http'

import { resolve } from 'node:path'

type Scenario = {
  prepareComposer?: Awaited<ReturnType<typeof prepareComposer>>
  saveComposerSettings?: Awaited<ReturnType<typeof saveComposerSettings>>
  verifyMemberIsolation?: Awaited<ReturnType<typeof verifyMemberIsolation>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

async function prepareComposer(runtime: Desktop) {
  const root = runtime.root
  const server = createServer((_request, response) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    response.write(': waiting\n\n')
  })
  runtime.trackServer(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  const app = await runtime.start({ dataDir: root })
  const page = await app.firstWindow(),
    errors: string[] = runtime.errors

  await expect(page.locator('.app-shell')).toBeVisible()
  const data = await page.evaluate(async (baseUrl) => {
    const a = await window.boai.request('saveConnection', { name: '研究连接', provider: 'openai-compatible', baseUrl, defaultModel: 'research-v1' })
    const b = await window.boai.request('saveConnection', { name: '写作连接', provider: 'openai-compatible', baseUrl, defaultModel: 'writing-v1' })
    const direct = await window.boai.request('createConversation', { kind: 'direct', title: '研究员', agentIds: ['researcher'] })
    const group = await window.boai.request('createConversation', { kind: 'group', title: '工具栏协作', agentIds: ['researcher', 'writer'] })
    const writer = await window.boai.request('createConversation', { kind: 'direct', title: '写手', agentIds: ['writer'] })
    return { a, b, direct, group, writer }
  }, `http://127.0.0.1:${address.port}/v1`)
  const employee = (id: string) =>
    page.evaluate(async (id) => (await window.boai.request('snapshot', undefined)).agents.find((a) => a.id === id)!, id)
  await page.locator('.conversation-item').filter({ hasText: '研究员' }).click()
  const input = page.getByRole('textbox', { name: '消息内容' })
  await input.fill('这是一份未发送的草稿')
  return { app, page, errors, data, employee, input }
}

async function saveComposerSettings(previous: Awaited<ReturnType<typeof prepareComposer>>) {
  let { app, page, errors, data, employee, input } = previous
  const more = page.getByRole('button', { name: '添加或更多操作' })
  await more.click()
  await expect(page.getByRole('menuitem', { name: '打开会话工作目录' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(more).toBeFocused()
  const permission = page.getByRole('button', { name: '权限批准', exact: true })
  await permission.click()
  await expect(page.getByRole('menuitemradio', { name: /^完全访问/ })).toHaveCount(0)
  await expect(page.getByRole('menu', { name: '权限批准', exact: true }).getByRole('menuitemradio')).toHaveCount(2)
  await expect(page.getByRole('menuitemradio', { name: /^禁止命令/ })).toBeChecked()
  await page.getByRole('menuitemradio', { name: /^请求批准/ }).click()
  await expect.poll(async () => (await employee('researcher')).allowCommands).toBe(true)
  await permission.click()
  await expect(page.getByRole('menuitemradio', { name: /^请求批准/ })).toBeChecked()
  await page.getByRole('menuitemradio', { name: /^禁止命令/ }).click()
  await expect.poll(async () => (await employee('researcher')).allowCommands).toBe(false)
  await expect(permission).toHaveText('禁止命令')
  await permission.click()
  await page.getByRole('menuitemradio', { name: /^请求批准/ }).click()
  await expect.poll(async () => (await employee('researcher')).allowCommands).toBe(true)
  await expect(permission).toHaveText('请求批准')
  await expect(page.getByRole('menu', { name: '权限批准', exact: true })).toBeHidden()

  const model = page.getByRole('button', { name: '选择模型', exact: true })
  await model.click()
  await page.getByRole('menuitemradio', { name: /research-v1/ }).click()
  await expect.poll(async () => (await employee('researcher')).connectionId).toBe(data.a.id)
  await expect(model).toHaveText('research-v1')
  await expect(page.getByRole('menu', { name: '选择模型', exact: true })).toBeHidden()
  await model.click()
  await page.getByRole('menuitemradio', { name: /writing-v1/ }).click()
  await expect.poll(async () => (await employee('researcher')).connectionId).toBe(data.b.id)
  await expect.poll(() => messageDraft(input)).toBe('这是一份未发送的草稿')
  await page.reload()
  await page.locator('.conversation-item').filter({ hasText: '研究员' }).click()
  await expect(model).toHaveText('writing-v1')
  await expect(permission).toHaveText('请求批准')
  return { app, page, errors, data, employee, input, more, permission, model }
}

async function verifyMemberIsolation(previous: Awaited<ReturnType<typeof saveComposerSettings>>) {
  let { app, page, errors, data, employee, input, more, permission, model } = previous
  // A task using this employee in another conversation must not be cancelled by a menu edit.
  await input.fill('保持运行，验证设置锁定')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.find((c) => c.id === data.direct.id)?.activity,
    )
    .toBe('running')
  await model.click()
  await expect(page.getByRole('menuitemradio', { name: /research-v1/ })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.locator('.conversation-item').filter({ hasText: '工具栏协作' }).click()
  await expect(model).toHaveCount(0)
  await expect(permission).toHaveCount(0)
  await page.locator('.conversation-item[aria-label="写手"]').click()
  await model.click()
  await expect(page.getByRole('menuitemradio', { name: /research-v1/ })).toBeEnabled()
  await page.getByRole('menuitemradio', { name: /research-v1/ }).click()
  await expect.poll(async () => (await employee('writer')).connectionId).toBe(data.a.id)
  expect((await employee('researcher')).connectionId).toBe(data.b.id)
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.find(c => c.id === data.direct.id)?.activity).toBe('running')
  await page.locator('.conversation-item').filter({ hasText: '工具栏协作' }).click()
  await page.evaluate((id) => window.boai.request('cancelRun', { conversationId: id }), data.direct.id)
  await more.click()
  await page.getByRole('menuitem', { name: '提及成员' }).click()
  await expect(page.getByRole('listbox', { name: '群聊成员' })).toBeVisible()
  await page.getByRole('option', { name: '@写手', exact: true }).click()
  await expect(page.locator('.chat-composer .composer-mention-tag')).toBeVisible()
  await expect(page.locator('.chat-composer .composer-mention-tag')).toHaveText('@写手')
  await page.locator('.conversation-item[aria-label="写手"]').click()
  return { app, page, errors, permission }
}

async function verifyNarrowMenus(previous: Awaited<ReturnType<typeof verifyMemberIsolation>>) {
  let { app, page, errors, permission } = previous
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 640))
  await page.getByRole('button', { name: '显示或隐藏会话列表' }).click()
  await permission.click()
  await expect(page.getByRole('menu', { name: '权限批准' })).toBeVisible()
  const fits = await page.getByRole('menu', { name: '权限批准' }).evaluate((element) => {
    const rect = element.getBoundingClientRect()
    return (
      rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight && document.documentElement.scrollWidth === innerWidth
    )
  })
  expect(fits).toBe(true)
  await page.keyboard.press('Escape')
  await expect(permission).toBeFocused()
  expect(errors).toEqual([])
}

Given('输入框场景具备两条模型连接与私聊群聊', async ({ runtime, scenario }) => {
  scenario.prepareComposer = await prepareComposer(runtime)
})

When('通过输入框菜单修改权限和模型', async ({ scenario }) => {
  scenario.saveComposerSettings = await saveComposerSettings(scenario.prepareComposer!)
})

When('权限保存失败后仍显示已提交的禁止命令', async ({ runtime, scenario }) => {
  const { page, employee } = scenario.prepareComposer!
  const before = await employee('researcher')
  await rejectNextPermissionSave(runtime, 'researcher')
  const permission = page.getByRole('button', { name: '权限批准', exact: true })
  await permission.click()
  await expect(page.getByRole('menuitemradio', { name: /^完全访问/ })).toHaveCount(0)
  await page.getByRole('menuitemradio', { name: /^请求批准/ }).click()
  await expect(page.getByText(/验收：权限保存失败，未提交/)).toBeVisible()
  await expect(permission).toHaveText('禁止命令')
  expect((await employee('researcher')).allowCommands).toBe(false)
  expect((await employee('researcher')).configVersion).toBe(before.configVersion)
  await permission.click()
  await expect(page.getByRole('menuitemradio', { name: /^禁止命令/ })).toBeChecked()
  await page.keyboard.press('Escape')
})

Then('明确重试保存批准权限后真实重启仍保持员工隔离', async ({ runtime, scenario }) => {
  const { page, employee } = scenario.prepareComposer!
  await page.getByRole('button', { name: '权限批准', exact: true }).click()
  await page.getByRole('menuitemradio', { name: /^请求批准/ }).click()
  await expect.poll(async () => (await employee('researcher')).allowCommands).toBe(true)
  expect((await employee('writer')).allowCommands).toBe(false)
  await runtime.restart()
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  await runtime.page.locator('.conversation-item[aria-label="研究员"]').click()
  const permission = runtime.page.getByRole('button', { name: '权限批准', exact: true })
  await expect(permission).toHaveText('请求批准')
  await permission.click()
  await expect(runtime.page.getByRole('menuitemradio', { name: /^请求批准/ })).toBeChecked()
  await expect(runtime.page.getByRole('menuitemradio', { name: /^完全访问/ })).toHaveCount(0)
  const saved = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(saved.agents.find(agent => agent.id === 'researcher')!.allowCommands).toBe(true)
  expect(saved.agents.find(agent => agent.id === 'writer')!.allowCommands).toBe(false)
  expect(runtime.errors).toEqual([])
})

Then('运行中的员工配置锁定且群成员修改相互隔离', async ({ scenario }) => {
  scenario.verifyMemberIsolation = await verifyMemberIsolation(scenario.saveComposerSettings!)
})

Then('窄窗口菜单完整可见并恢复键盘焦点', async ({ scenario }) => {
  await verifyNarrowMenus(scenario.verifyMemberIsolation!)
})

When('通过模型二级菜单调整当前员工思考强度', async ({ runtime, scenario }) => {
  const { page, employee, input } = scenario.prepareComposer!
  // Only edit this fixture connection; never send a request to a live provider.
  await page.evaluate(() => window.boai.request('saveConnection', { name: '思考选项测试', provider: 'openai-compatible', baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-v4-pro', apiKey: 'fixture-not-a-real-key' }))
  const model = page.getByRole('button', { name: '选择模型', exact: true })
  await model.click()
  await page.getByRole('menuitemradio', { name: /deepseek-v4-pro/ }).click()
  await expect(model).toHaveText('deepseek-v4-pro')
  await model.click()
  const submenu = page.getByRole('menuitem', { name: /思考强度/ })
  await submenu.focus()
  await page.keyboard.press('ArrowRight')
  const thinking = page.getByRole('menu', { name: /^思考强度/ })
  await expect(thinking).toBeVisible()
  await expect(thinking.getByRole('menuitemradio', { name: /^自动/ })).toBeChecked()
  await thinking.getByRole('menuitemradio', { name: /^关闭/ }).click()
  await expect.poll(async () => (await employee('researcher')).thinkingLevel).toBe('off')
  expect((await employee('writer')).thinkingLevel).toBeUndefined()
  await expect.poll(() => messageDraft(input)).toBe('这是一份未发送的草稿')
  await expect(model).toBeFocused()

  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 640))
  await model.click()
  await submenu.hover()
  await expect(thinking).toBeVisible()
  expect(await thinking.evaluate(element => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight })).toBe(true)
  await page.screenshot({ animations: 'disabled', path: 'test-results/composer-thinking.png' })
  await thinking.getByRole('menuitemradio', { name: /^最高/ }).click()
  await expect.poll(async () => (await employee('researcher')).thinkingLevel).toBe('max')
})

Then('重启保留思考强度且未适配模型不显示选项', async ({ runtime }) => {
  await runtime.restart()
  const page = runtime.page
  await page.locator('.conversation-item').filter({ hasText: '研究员' }).click()
  const model = page.getByRole('button', { name: '选择模型', exact: true })
  await model.click()
  const submenu = page.getByRole('menuitem', { name: /思考强度/ })
  await expect(submenu).toContainText('最高')
  await submenu.hover()
  const thinking = page.getByRole('menu', { name: /^思考强度/ })
  await expect(thinking.getByRole('menuitemradio', { name: /^最高/ })).toBeChecked()
  await thinking.getByRole('menuitemradio', { name: /^自动/ }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')?.thinkingLevel).toBe('auto')
  await model.click()
  await page.getByRole('menuitemradio', { name: /research-v1/ }).click()
  await model.click()
  await expect(submenu).toHaveCount(0)
  await page.keyboard.press('Escape')
  expect(runtime.errors).toEqual([])
})
