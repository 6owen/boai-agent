/*
 * [INPUT]: 页面表单校验、模型连接真实修改/返回边界与焦点恢复的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 默认连接配置/显隐/改回原值不提示，真实修改在返回时确认，保存/放弃后进入其他服务或导入不残留草稿；会话菜单员工配置入口/关闭标签时保护未保存修改、页面表单、通讯录搜索与菜单焦点断言；首次连接先获取目录/测试再保存，编辑时回填/查看密钥不产生修改，模型连接草稿/密钥保护、根地址目录、按钮左侧同行反馈、请求前中后按钮等宽/测试仅图标、无副标题与步骤 SVG/箭头、编辑图标切换及深浅色/窄窗与草稿测试不保存；放弃弹窗保留设置分类和搜索。
 * [POS]: tests/e2e/steps/pages.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Locator } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createServer } from 'node:http'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'

type Scenario = {
  connections?: Awaited<ReturnType<typeof prepareConnections>>
  launchPageControls?: Awaited<ReturnType<typeof launchPageControls>>
  createWithValidation?: Awaited<ReturnType<typeof createWithValidation>>
  saveDisabledEmployee?: Awaited<ReturnType<typeof saveDisabledEmployee>>
  searchEmployee?: Awaited<ReturnType<typeof searchEmployee>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

async function expectInlineBefore(message: Locator, button: Locator) {
  const feedbackBox = await message.boundingBox(), buttonBox = await button.boundingBox()
  expect(feedbackBox).not.toBeNull()
  expect(buttonBox).not.toBeNull()
  expect(feedbackBox!.x + feedbackBox!.width).toBeLessThanOrEqual(buttonBox!.x + 1)
  expect(Math.abs(feedbackBox!.y + feedbackBox!.height / 2 - buttonBox!.y - buttonBox!.height / 2)).toBeLessThan(2)
}

async function launchPageControls(runtime: Desktop) {
  const root = runtime.root
  const app = await runtime.start({ dataDir: root })
  const page = await app.firstWindow(),
    errors: string[] = runtime.errors

  await page.waitForFunction(() => Boolean(window.boai))
  return { page, errors }
}

async function createWithValidation(previous: Awaited<ReturnType<typeof launchPageControls>>) {
  let { page, errors } = previous
  const create = page.getByRole('button', { name: '新建', exact: true })
  await create.focus()
  await create.press('Enter')
  await expect(page.getByRole('menuitem', { name: '新建员工' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(create).toBeFocused()
  await create.click()
  await page.getByRole('menuitem', { name: '新建员工' }).click()
  const dialog = page.getByRole('dialog', { name: '新建数字员工' })
  const employeeName = dialog.getByRole('textbox', { name: '名称', exact: true })
  await dialog.getByRole('textbox', { name: '角色', exact: true }).fill('检查表单提交与页面切换')
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  const leave = page.getByRole('alertdialog', { name: '有未保存的修改' })
  await expect(leave).toBeVisible()
  await leave.getByRole('button', { name: '保存并退出' }).click()
  await expect(leave).toBeHidden()
  await expect(employeeName).toBeVisible()
  await expect(employeeName).toHaveValue('')
  await expect(employeeName).toBeFocused()
  await employeeName.fill('组件联调员工')
  await page.keyboard.press('Escape')
  await leave.getByRole('button', { name: '继续编辑' }).click()
  await expect(employeeName).toHaveValue('组件联调员工')
  await dialog.getByRole('button', { name: '创建员工', exact: true }).click()
  await expect(dialog).toBeHidden()
  return { page, errors, dialog, leave }
}

async function saveDisabledEmployee(previous: Awaited<ReturnType<typeof createWithValidation>>) {
  let { page, errors, dialog, leave } = previous
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '配置', exact: true }).click()
  const enabled = page.getByRole('checkbox', { name: /启用员工/ })
  await expect(enabled).toBeChecked()
  await enabled.uncheck()
  await expect(enabled).not.toBeChecked()
  await page.getByRole('tablist', { name: '详情标签' }).getByRole('button', { name: '关闭详情', exact: true }).click()
  await leave.getByRole('button', { name: '继续编辑' }).click()
  await expect(enabled).not.toBeChecked()
  await page.getByRole('tablist', { name: '详情标签' }).getByRole('button', { name: '关闭详情', exact: true }).click()
  await leave.getByRole('button', { name: '保存并退出' }).click()
  await page.getByRole('button', { name: '资料库', exact: true }).click()
  await expect(page.getByRole('heading', { name: '资料库', exact: true })).toBeVisible()
  await expect
    .poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find((a) => a.name === '组件联调员工')?.active)
    .toBe(false)
  return { page, errors, dialog }
}

async function searchEmployee(previous: Awaited<ReturnType<typeof saveDisabledEmployee>>) {
  let { page, errors, dialog } = previous
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  const search = page.getByRole('textbox', { name: '搜索通讯录' })
  await search.focus()
  await expect(search).toBeFocused()
  await search.fill('组件联调员工')
  const list = page.getByRole('complementary', { name: '通讯录列表' })
  await expect(list.getByRole('group', { name: '联系人', exact: true })).toContainText('组件联调员工')
  await expect(list.getByRole('group', { name: '联系人', exact: true })).toContainText('已停用')
  const create = list.getByRole('button', { name: '新建', exact: true })
  await create.click()
  await expect(page.getByRole('menuitem', { name: '新建员工' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(create).toBeFocused()
  await expect(search).toHaveValue('组件联调员工')
  return { page, errors }
}

async function submitConnectionAndFilter(previous: Awaited<ReturnType<typeof searchEmployee>>) {
  let { page, errors } = previous
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('menuitem', { name: '外观', exact: true }).click()
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('menuitem', { name: '模型连接与数据备份' }).click()
  await page.getByRole('button', { name: '添加连接', exact: true }).click()
  await page.getByRole('button', { name: /^OpenAI 兼容接口/ }).click()
  await page.getByLabel('连接名称', { exact: true }).fill('页面组件验证')
  await page.getByLabel('接口地址 Base URL', { exact: true }).fill('http://127.0.0.1:1/v1')
  await page.getByRole('button', { name: '手动编辑模型' }).click()
  await page.getByLabel('默认模型 ID', { exact: true }).fill('local-ui-test')
  await page.getByLabel('默认模型 ID', { exact: true }).press('Enter')
  await expect(page.getByRole('heading', { name: '模型连接', exact: true })).toBeVisible()
  await expect(page.getByText('页面组件验证', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: '定时任务', exact: true }).click()
  const filter = page.getByRole('button', { name: '筛选任务' })
  await filter.click()
  await page.getByRole('menuitemradio', { name: '已暂停' }).click()
  await expect(page.getByRole('menu')).toBeHidden()
  await filter.click()
  await expect(page.getByRole('menuitemradio', { name: '已暂停' })).toBeChecked()
  await page.keyboard.press('Escape')
  await expect(filter).toBeFocused()
  expect(errors).toEqual([])
}

Given('页面控件测试使用独立桌面数据', async ({ runtime, scenario }) => {
  scenario.launchPageControls = await launchPageControls(runtime)
})

When('键盘打开创建菜单并校验未保存员工表单', async ({ scenario }) => {
  scenario.createWithValidation = await createWithValidation(scenario.launchPageControls!)
})

Then('切换页面前保存员工启用状态', async ({ scenario }) => {
  scenario.saveDisabledEmployee = await saveDisabledEmployee(scenario.createWithValidation!)
})

When('通讯录搜索保留结果且添加菜单关闭后恢复焦点', async ({ scenario }) => {
  scenario.searchEmployee = await searchEmployee(scenario.saveDisabledEmployee!)
})

Then('模型连接支持回车提交并且任务筛选保留选中项', async ({ scenario }) => {
  await submitConnectionAndFilter(scenario.searchEmployee!)
})

async function prepareConnections(runtime: Desktop) {
  const requests: { model: string; authorization?: string }[] = []
  const modelRequests: { url?: string; authorization?: string }[] = []
  let releaseSlow: (() => void) | undefined, releaseProbe: (() => void) | undefined
  const server = createServer(async (request, response) => {
    if (request.method === 'GET') {
      modelRequests.push({ url: request.url, authorization: request.headers.authorization })
      response.setHeader('Content-Type', 'application/json')
      if (request.url?.includes('/missing/')) { response.writeHead(404); response.end('{}'); return }
      if (request.url?.includes('/empty/')) { response.end(JSON.stringify({ data: [] })); return }
      if (request.url?.includes('/slow/')) await new Promise<void>(done => { releaseSlow = done })
      response.end(JSON.stringify({ data: (request.url?.includes('/slow/') ? ['stale-model'] : ['local-model', 'invalid-model']).map(id => ({ id })) }))
      return
    }
    let body = ''
    for await (const chunk of request) body += chunk
    const input = JSON.parse(body || '{}')
    requests.push({ model: input.model, authorization: request.headers.authorization })
    if (input.model === 'slow-test-model') await new Promise<void>(done => { releaseProbe = done })
    response.setHeader('Content-Type', 'application/json')
    if (input.model === 'invalid-model') {
      response.writeHead(400)
      response.end(JSON.stringify({ error: { message: '该模型不可用，请检查模型 ID', type: 'invalid_request_error' } }))
      return
    }
    response.setHeader('Content-Type', 'text/event-stream')
    for (const [delta, finish_reason] of [[{ role: 'assistant', content: '连接正常' }, null], [{}, 'stop']]) {
      response.write(`data: ${JSON.stringify({ id: 'connection-test', object: 'chat.completion.chunk', created: 1, model: input.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    }
    response.end('data: [DONE]\n\n')
  })
  runtime.trackServer(server)
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const baseUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
  await runtime.start()
  const page = runtime.page
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.evaluate(async () => {
    const appearance = await window.boai.request('getAppearance', undefined)
    await window.boai.request('updateAppearance', { patch: { mode: 'light' }, expectedRevision: appearance.revision })
  })
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('menuitem', { name: '模型连接与数据备份' }).click()
  await expect(page.getByRole('heading', { name: '连接你的第一个模型' })).toBeVisible()
  await page.screenshot({ animations: 'disabled', path: 'test-results/connections-empty.png' })
  return { baseUrl, requests, modelRequests, releaseSlow: () => releaseSlow?.(), releaseProbe: () => releaseProbe?.() }
}

Given('模型连接场景使用独立桌面和本地模型服务', async ({ runtime, scenario }) => {
  scenario.connections = await prepareConnections(runtime)
})

When('仅填写接口地址和密钥获取模型并测试连接', async ({ runtime, scenario }) => {
  const page = runtime.page, connection = scenario.connections!
  await page.getByRole('button', { name: '添加连接', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^OpenAI 兼容接口/ }).click()
  await dialog.getByLabel('接口地址 Base URL', { exact: true }).fill(new URL(connection.baseUrl).origin)
  await dialog.getByLabel('API Key', { exact: true }).fill('fixture-first-connection-key')
  await expect(dialog.getByLabel('默认模型', { exact: true })).toHaveValue('')
  await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText('已获取 2 个模型')
  expect(connection.modelRequests).toEqual([{ url: '/models', authorization: 'Bearer fixture-first-connection-key' }])
  expect(await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).connections)).toHaveLength(0)
  await dialog.getByLabel('默认模型', { exact: true }).selectOption('local-model')
  await dialog.getByRole('button', { name: '测试', exact: true }).click()
  await expect(dialog.locator('.connection-draft-feedback')).toHaveText('连接测试成功')
  expect(connection.requests).toEqual([{ model: 'local-model', authorization: 'Bearer fixture-first-connection-key' }])
})

Then('配置保持未保存直到主动保存连接', async ({ runtime }) => {
  const page = runtime.page, dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  expect(await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).connections)).toHaveLength(0)
  await dialog.getByRole('button', { name: '保存连接', exact: true }).click()
  await expect(dialog).toBeHidden()
  const connections = await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).connections)
  expect(connections).toHaveLength(1)
  expect(connections[0]).toMatchObject({ provider: 'openai-compatible', defaultModel: 'local-model', hasApiKey: true })
  expect(runtime.errors).toEqual([])
})

When('从外观切换到模型连接并放弃配置草稿', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '设置', exact: true }).click()
  await page.getByRole('menuitem', { name: '外观', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索设置' }).fill('模型')
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '模型连接', exact: true }).click()
  await page.getByRole('button', { name: '添加连接', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^OpenAI 兼容接口/ }).click()
  await dialog.getByLabel('连接名称', { exact: true }).fill('准备放弃的连接')
  await dialog.getByRole('button', { name: '关闭模型连接配置' }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '放弃并退出' }).click()
})

Then('仅关闭连接弹窗并保留当前设置页面', async ({ runtime }) => {
  const page = runtime.page
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByRole('alertdialog')).toBeHidden()
  await expect(page.getByRole('heading', { name: '模型连接', exact: true })).toBeVisible()
  await expect(page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '模型连接', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('textbox', { name: '搜索设置' })).toHaveValue('模型')
  const add = page.getByRole('button', { name: '添加连接', exact: true })
  await expect(add).toBeFocused()
  expect(await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).connections)).toHaveLength(0)
  await add.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: '选择模型服务' })).toBeVisible()
  await dialog.getByRole('button', { name: '关闭模型连接配置' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('alertdialog')).toBeHidden()
  expect(runtime.errors).toEqual([])
})

When('浏览默认连接配置并在返回时处理真实修改', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '添加连接', exact: true }).click()
  const dialog = page.getByRole('dialog'), leave = page.getByRole('alertdialog', { name: '有未保存的修改' })
  for (const name of [/^OpenAI 使用/, /^Anthropic/, /^OpenAI 兼容接口/]) {
    await dialog.getByRole('button', { name }).click()
    await dialog.getByRole('button', { name: '显示 API Key', exact: true }).click()
    await dialog.getByRole('button', { name: '更换服务' }).click()
    await expect(dialog.getByRole('heading', { name: '选择模型服务' })).toBeVisible()
    await expect(leave).toBeHidden()
  }
  await dialog.getByRole('button', { name: /^OpenAI 兼容接口/ }).click()
  const name = dialog.getByLabel('连接名称', { exact: true })
  await name.fill('临时连接')
  await dialog.getByRole('button', { name: '更换服务' }).click()
  await expect(leave).toBeVisible()
  await leave.getByRole('button', { name: '继续编辑' }).click()
  await expect(dialog.getByRole('heading', { name: '连接 OpenAI 兼容接口', exact: true })).toBeVisible()
  await expect(name).toHaveValue('临时连接')
  await name.fill('OpenAI 兼容接口')
  await dialog.getByRole('button', { name: '更换服务' }).click()
  await expect(dialog.getByRole('heading', { name: '选择模型服务' })).toBeVisible()
  await expect(leave).toBeHidden()

  await dialog.getByRole('button', { name: /^OpenAI 兼容接口/ }).click()
  await name.fill('应该放弃的草稿')
  await dialog.getByLabel('API Key', { exact: true }).fill('discard-this-key')
  await dialog.getByRole('button', { name: '更换服务' }).click()
  await expect(leave).toBeVisible()
  await leave.getByRole('button', { name: '放弃并退出' }).click()
  await expect(dialog.getByRole('heading', { name: '选择模型服务' })).toBeVisible()
  await dialog.getByRole('button', { name: /^导入本机配置/ }).click()
  await expect(dialog.getByRole('heading', { name: '导入本机模型配置' })).toBeVisible()
  await expect(leave).toBeHidden()
  await dialog.getByRole('button', { name: '返回', exact: true }).click()
  await dialog.getByRole('button', { name: /^OpenAI 兼容接口/ }).click()
  await expect(name).toHaveValue('OpenAI 兼容接口')
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue('')
  await dialog.getByRole('button', { name: '更换服务' }).click()
  await dialog.getByRole('button', { name: /^Anthropic/ }).click()
  await expect(name).toHaveValue('Anthropic')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(leave).toBeHidden()
})

Then('关闭未修改的连接向导不提示也不保存', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '添加连接', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^OpenAI 使用/ }).click()
  await dialog.getByRole('button', { name: '关闭模型连接配置' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('alertdialog', { name: '有未保存的修改' })).toBeHidden()
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).connections).toHaveLength(0)
})

When('通过服务卡片配置兼容模型并保留未保存草稿', async ({ runtime, scenario }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '添加连接', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('heading', { name: '选择模型服务' })).toBeVisible()
  await expect(dialog.getByRole('textbox')).toHaveCount(0)
  await expect(dialog.locator('.connection-dialog-intro [data-slot="dialog-description"]')).toHaveCount(0)
  await expect(dialog.locator('svg.connection-illustration')).toBeVisible()
  await expect(dialog.locator('.connection-steps .i-carbon-arrow-right')).toBeVisible()
  await page.screenshot({ animations: 'disabled', path: 'test-results/connections-select-light.png' })
  await dialog.getByRole('button', { name: /^OpenAI 兼容接口/ }).focus()
  await page.keyboard.press('Enter')
  await expect(dialog.locator('.connection-dialog-intro [data-slot="dialog-description"]')).toHaveCount(0)
  await expect(dialog.locator('svg.connection-illustration')).toBeVisible()
  await expect(dialog.getByLabel('连接名称', { exact: true })).toBeFocused()
  await dialog.getByLabel('连接名称', { exact: true }).fill('本地模型服务')
  await dialog.getByRole('button', { name: '保存连接', exact: true }).click()
  await expect(dialog.getByLabel('接口地址 Base URL', { exact: true })).toBeFocused()
  await dialog.getByLabel('接口地址 Base URL', { exact: true }).fill(scenario.connections!.baseUrl)
  await dialog.getByLabel('API Key', { exact: true }).fill('fixture-connection-key')
  await dialog.getByRole('button', { name: '显示 API Key', exact: true }).click()
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveAttribute('type', 'text')
  await dialog.getByRole('button', { name: '隐藏 API Key', exact: true }).click()
  await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText('已获取 2 个模型')
  await dialog.getByLabel('默认模型', { exact: true }).selectOption('local-model')
  await dialog.getByRole('button', { name: '更换服务' }).click()
  const leave = page.getByRole('alertdialog', { name: '有未保存的修改' })
  await expect(leave).toBeVisible()
  await leave.getByRole('button', { name: '继续编辑' }).click()
  await expect(dialog.getByLabel('连接名称', { exact: true })).toHaveValue('本地模型服务')
  await expect(dialog.getByLabel('API Key', { exact: true })).toHaveValue('fixture-connection-key')
  await page.screenshot({ animations: 'disabled', path: 'test-results/connections-form-light.png' })
  await page.keyboard.press('Escape')
  await expect(leave).toBeVisible()
  await leave.getByRole('button', { name: '继续编辑' }).click()
  await expect(dialog.getByLabel('默认模型', { exact: true })).toHaveValue('local-model')
  // Saving before going back must finish the save and leave the chooser clean.
  await dialog.getByRole('button', { name: '更换服务' }).click()
  await expect(leave).toBeVisible()
  await leave.getByRole('button', { name: '保存并退出' }).click()
  await expect(dialog.getByRole('heading', { name: '选择模型服务' })).toBeVisible()
  await dialog.getByRole('button', { name: '关闭模型连接配置' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('button', { name: '添加连接', exact: true })).toBeFocused()
  await expect(page.locator('.connection-row')).toContainText('本地模型服务')
})

Then('编辑连接回填密钥且可查看并测试', async ({ runtime, scenario }) => {
  const page = runtime.page, row = page.locator('.connection-row').filter({ hasText: '本地模型服务' })
  await row.getByRole('button', { name: '管理 本地模型服务' }).click()
  await page.getByRole('menuitem', { name: '编辑连接', exact: true }).click()
  const dialog = page.getByRole('dialog')
  const key = dialog.getByLabel('API Key', { exact: true })
  await expect(key).toHaveValue('fixture-connection-key')
  await expect(key).toHaveAttribute('type', 'password')
  await expect(dialog.getByText('密钥已保存，留空即可继续使用。')).toHaveCount(0)
  await expect(key).toHaveAttribute('placeholder', '输入 API Key')
  await dialog.getByRole('button', { name: '显示 API Key', exact: true }).click()
  await expect(key).toHaveAttribute('type', 'text')
  await expect(key).toHaveValue('fixture-connection-key')
  await dialog.getByRole('button', { name: '隐藏 API Key', exact: true }).click()
  await dialog.getByRole('button', { name: '关闭模型连接配置' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByRole('alertdialog')).toBeHidden()
  await row.getByRole('button', { name: '管理 本地模型服务' }).click()
  await page.getByRole('menuitem', { name: '编辑连接', exact: true }).click()
  await expect(key).toHaveValue('fixture-connection-key')
  await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText('已获取 2 个模型')
  expect(scenario.connections!.modelRequests.at(-1)?.authorization).toBe('Bearer fixture-connection-key')
  await dialog.getByLabel('默认模型', { exact: true }).selectOption('invalid-model')
  await dialog.getByRole('button', { name: '测试', exact: true }).click()
  await expect(dialog.locator('.connection-draft-feedback')).toContainText('该模型不可用')
  expect(scenario.connections!.requests.at(-1)).toEqual({ model: 'invalid-model', authorization: 'Bearer fixture-connection-key' })
  expect(await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).connections[0].defaultModel)).toBe('local-model')
  await dialog.getByRole('button', { name: '手动编辑模型' }).click()
  await dialog.getByLabel('默认模型 ID', { exact: true }).press('Enter')
  await expect(dialog).toBeHidden()
  await row.getByRole('button', { name: '管理 本地模型服务' }).click()
  await page.getByRole('menuitem', { name: '测试连接', exact: true }).click()
  await expect(row.getByRole('alert')).toContainText('该模型不可用')
  await row.getByRole('button', { name: '管理 本地模型服务' }).click()
  await page.getByRole('menuitem', { name: '编辑连接', exact: true }).click()
  await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText('已获取 2 个模型')
  await dialog.getByLabel('默认模型', { exact: true }).selectOption('local-model')
  await dialog.getByRole('button', { name: '保存连接', exact: true }).click()
  await expect(row.getByRole('alert')).toHaveCount(0)
  await row.getByRole('button', { name: '管理 本地模型服务' }).click()
  await page.getByRole('menuitem', { name: '测试连接', exact: true }).click()
  await expect(row.getByRole('status')).toHaveText('连接测试成功')
  expect(scenario.connections!.requests.at(-1)).toEqual({ model: 'local-model', authorization: 'Bearer fixture-connection-key' })
})

Then('弹窗测试使用当前配置且不保存草稿', async ({ runtime, scenario }) => {
  const page = runtime.page, connection = scenario.connections!
  const saved = await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).connections)
  await page.getByRole('button', { name: '添加连接', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: /^OpenAI 兼容接口/ }).click()
  await expect(dialog.getByText('服务允许无密钥访问时，可留空。')).toHaveCount(0)
  await dialog.getByRole('button', { name: '测试', exact: true }).click()
  await expect(dialog.getByLabel('接口地址 Base URL', { exact: true })).toBeFocused()
  await dialog.getByLabel('接口地址 Base URL', { exact: true }).fill(connection.baseUrl)
  await dialog.getByLabel('API Key', { exact: true }).fill('fixture-unsaved-key')
  await dialog.getByRole('button', { name: '手动编辑模型' }).click()
  const model = dialog.getByLabel('默认模型 ID', { exact: true })
  await model.fill('invalid-model')
  await dialog.getByRole('button', { name: '测试', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('该模型不可用')
  await expectInlineBefore(dialog.getByRole('alert'), dialog.getByRole('button', { name: '测试', exact: true }))
  await expectInlineBefore(dialog.getByRole('button', { name: '测试', exact: true }), dialog.getByRole('button', { name: '保存连接', exact: true }))
  await dialog.getByLabel('接口地址 Base URL', { exact: true }).fill(`${connection.baseUrl}/missing`)
  await dialog.getByRole('button', { name: '测试', exact: true }).click()
  await expect(dialog.locator('.connection-draft-feedback')).toContainText('该模型不可用')
  await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click()
  await expect(dialog.locator('.connection-model-message')).toContainText('该服务未提供模型列表')
  await expectInlineBefore(dialog.locator('.connection-model-message'), dialog.getByRole('button', { name: '获取模型列表', exact: true }))
  expect(await dialog.locator('form').evaluate(element => {
    const bounds = element.getBoundingClientRect()
    return [...element.querySelectorAll('input,select,button')].every(control => control.getBoundingClientRect().right <= bounds.right)
  })).toBe(true)
  await page.screenshot({ animations: 'disabled', path: 'test-results/connections-inline-errors.png' })
  await dialog.getByLabel('接口地址 Base URL', { exact: true }).fill(connection.baseUrl)
  await model.fill('slow-test-model')
  await expect(dialog.locator('.connection-draft-feedback')).toHaveCount(0)
  const testButton = dialog.getByRole('button', { name: '测试', exact: true })
  const testWidth = (await testButton.boundingBox())!.width
  await testButton.click()
  await expect.poll(() => connection.requests.at(-1)?.model).toBe('slow-test-model')
  try {
    await expect(testButton).toBeDisabled()
    await expect(testButton).toHaveAttribute('aria-busy', 'true')
    await expect(testButton.getByText('测试', { exact: true })).toBeHidden()
    await expect(testButton.locator('.spinner')).toBeVisible()
    expect((await testButton.boundingBox())!.width).toBeCloseTo(testWidth, 2)
    await expect(dialog.getByRole('button', { name: '保存连接', exact: true })).toBeDisabled()
    await expect(model).toBeDisabled()
    expect(await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).connections)).toEqual(saved)
    await page.screenshot({ animations: 'disabled', path: 'test-results/connections-test-loading.png' })
  } finally { connection.releaseProbe() }
  await expect(dialog.getByRole('status')).toHaveText('连接测试成功')
  expect((await testButton.boundingBox())!.width).toBeCloseTo(testWidth, 2)
  await expect(testButton.getByText('测试', { exact: true })).toBeVisible()
  await expectInlineBefore(dialog.getByRole('status'), dialog.getByRole('button', { name: '测试', exact: true }))
  expect(connection.requests.at(-1)).toEqual({ model: 'slow-test-model', authorization: 'Bearer fixture-unsaved-key' })
  await model.fill('local-model')
  await expect(dialog.locator('.connection-draft-feedback')).toHaveCount(0)
  await dialog.getByRole('button', { name: '测试', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText('连接测试成功')
  expect(await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).connections)).toEqual(saved)
  await page.screenshot({ animations: 'disabled', path: 'test-results/connections-draft-test.png' })
  await page.keyboard.press('Escape')
  await page.getByRole('alertdialog').getByRole('button', { name: '放弃并退出' }).click()
})

Then('模型连接在深浅色和窄窗口中保持可操作', async ({ runtime, scenario }) => {
  const page = runtime.page
  await page.evaluate(async () => {
    await window.boai.request('saveConnection', { name: 'OpenAI', provider: 'openai', defaultModel: 'openai-model', baseUrl: '', apiKey: 'fixture-openai' })
    await window.boai.request('saveConnection', { name: 'Anthropic', provider: 'anthropic', defaultModel: 'claude-model', baseUrl: '', apiKey: 'fixture-anthropic' })
  })
  await expect(page.locator('.connection-row')).toHaveCount(3)
  await page.screenshot({ animations: 'disabled', path: 'test-results/connections-list-light.png' })
  for (const mode of ['dark', 'light'] as const) {
    await page.evaluate(async mode => { const a = await window.boai.request('getAppearance', undefined); await window.boai.request('updateAppearance', { patch: { mode }, expectedRevision: a.revision }) }, mode)
    await page.getByRole('button', { name: '添加连接', exact: true }).click()
    await page.screenshot({ animations: 'disabled', path: `test-results/connections-select-${mode}.png` })
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: /^Anthropic/ }).click()
    await expect(dialog.getByLabel('接口地址 Base URL', { exact: true })).toBeVisible()
    await dialog.getByLabel('默认模型 ID', { exact: true }).fill('claude-model')
    await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 640))
    await dialog.getByRole('button', { name: '保存连接', exact: true }).scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('button', { name: '保存连接', exact: true })).toBeInViewport()
    const fits = await dialog.evaluate(element => { const box = element.getBoundingClientRect(); return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight && element.scrollWidth <= element.clientWidth })
    expect(fits).toBe(true)
    await page.screenshot({ animations: 'disabled', path: `test-results/connections-form-${mode}-narrow.png` })
    await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1340, 900))
    await dialog.getByRole('button', { name: '更换服务' }).click()
    await page.getByRole('alertdialog', { name: '有未保存的修改' }).getByRole('button', { name: '放弃并退出' }).click()
    await dialog.getByRole('button', { name: /^OpenAI 兼容接口/ }).click()
    await expect(dialog.getByRole('combobox', { name: '服务商', exact: true })).toHaveCount(0)
    await dialog.getByLabel('接口地址 Base URL', { exact: true }).fill(scenario.connections!.baseUrl)
    await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click()
    await expect(dialog.getByRole('status')).toHaveText('已获取 2 个模型')
    await dialog.getByLabel('默认模型', { exact: true }).selectOption('local-model')
    await page.screenshot({ animations: 'disabled', path: `test-results/connections-compact-${mode}.png` })
    await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 640))
    await dialog.getByRole('button', { name: '保存连接', exact: true }).scrollIntoViewIfNeeded()
    await expect(dialog.getByRole('button', { name: '保存连接', exact: true })).toBeInViewport()
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true)
    await page.screenshot({ animations: 'disabled', path: `test-results/connections-compact-${mode}-narrow.png` })
    await dialog.getByRole('button', { name: '更换服务' }).click()
    await page.getByRole('alertdialog', { name: '有未保存的修改' }).getByRole('button', { name: '放弃并退出' }).click()
    await dialog.getByRole('button', { name: /^OpenAI 使用/ }).click()
    await expect(dialog.getByRole('heading', { name: '连接 OpenAI', exact: true })).toBeVisible()
    await expect(dialog.getByLabel('默认模型 ID', { exact: true })).toHaveValue('')
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(page.getByRole('alertdialog', { name: '有未保存的修改' })).toBeHidden()
    await expect(page.locator('.connection-row')).toHaveCount(3)
    await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1340, 900))
  }
})

Then('可从连接菜单删除测试连接', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '管理 本地模型服务' }).click()
  await page.getByRole('menuitem', { name: '删除连接', exact: true }).click()
  await expect(page.locator('.connection-row')).toHaveCount(2)
  const connections = await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).connections)
  expect(connections.some(connection => connection.name === '本地模型服务')).toBe(false)
  expect(runtime.errors).toEqual([])
})

Then('模型目录异常和过期响应不影响手动配置', async ({ runtime, scenario }) => {
  const page = runtime.page, { baseUrl, modelRequests } = scenario.connections!
  await page.getByRole('button', { name: '管理 本地模型服务' }).click()
  await page.getByRole('menuitem', { name: '编辑连接', exact: true }).click()
  const dialog = page.getByRole('dialog'), url = dialog.getByLabel('接口地址 Base URL', { exact: true })
  await dialog.getByLabel('API Key', { exact: true }).fill('fixture-draft-key')
  await url.fill(`${baseUrl}/missing`)
  await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click()
  await expect(dialog.getByRole('alert')).toContainText('该服务未提供模型列表')
  await expectInlineBefore(dialog.getByRole('alert'), dialog.getByRole('button', { name: '获取模型列表', exact: true }))
  await expect(dialog.getByLabel('默认模型', { exact: true })).toHaveValue('local-model')
  await url.fill(`${baseUrl}/empty`)
  await expect(dialog.getByRole('alert')).toHaveCount(0)
  await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click()
  await expect(dialog.getByRole('status')).toContainText('未返回可用模型')
  const editButton = dialog.getByRole('button', { name: '手动编辑模型' })
  await expect(editButton.locator('.i-carbon-edit')).toHaveCount(1)
  const inactiveBackground = await editButton.evaluate(element => getComputedStyle(element).backgroundColor)
  await editButton.click()
  const listButton = dialog.getByRole('button', { name: '从列表选择' })
  await expect(listButton.locator('.i-carbon-list')).toHaveCount(1)
  expect(await listButton.evaluate(element => getComputedStyle(element).backgroundColor)).toBe(inactiveBackground)
  await dialog.getByLabel('默认模型 ID', { exact: true }).fill('custom-model')
  await dialog.getByRole('button', { name: '从列表选择' }).click()
  await expect(dialog.getByLabel('默认模型', { exact: true })).toHaveValue('custom-model')
  await url.fill(`${baseUrl}/slow`)
  const catalogButton = dialog.getByRole('button', { name: '获取模型列表', exact: true })
  const catalogWidth = (await catalogButton.boundingBox())!.width
  await catalogButton.click()
  await expect.poll(() => modelRequests.at(-1)?.url).toBe('/v1/slow/models')
  await expect(catalogButton).toHaveAttribute('aria-busy', 'true')
  await expect(catalogButton).toBeDisabled()
  await expect(catalogButton.locator('.spinner')).toBeVisible()
  expect((await catalogButton.boundingBox())!.width).toBeCloseTo(catalogWidth, 2)
  await page.screenshot({ animations: 'disabled', path: 'test-results/connections-catalog-loading.png' })
  await url.fill(baseUrl)
  await dialog.getByRole('button', { name: '获取模型列表', exact: true }).click()
  await expect(dialog.getByRole('status')).toHaveText('已获取 2 个模型')
  expect((await catalogButton.boundingBox())!.width).toBeCloseTo(catalogWidth, 2)
  scenario.connections!.releaseSlow()
  await expect(dialog.getByLabel('默认模型', { exact: true })).toHaveValue('custom-model')
  await expect(dialog.getByRole('option', { name: 'stale-model' })).toHaveCount(0)
  await dialog.getByLabel('默认模型', { exact: true }).selectOption('local-model')
  await page.screenshot({ animations: 'disabled', path: 'test-results/connections-model-select.png' })
  await page.keyboard.press('Escape')
  await page.getByRole('alertdialog').getByRole('button', { name: '放弃并退出' }).click()
})
