/*
 * [OUTPUT]: 真实保存暂停与目录刷新期间核对菜单高度/顺序/无冗余文案，连续切换使用新版本，管理跳转通讯录且保留草稿。
 * [INPUT]: 当前模型目录、隔离Electron真实IPC与本地技能/文件。
 * [OUTPUT]: 当前连接内保存/重启/失败、隐藏权限、斜线命令、资源精确身份与群点名真实UI验收。
 * [POS]: Composer BDD步骤；HTTP只提供目录并保持任务等待，不调用真实供应商。
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createServer } from 'node:http'
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test as base } from '../support/test'
import { messageDraft } from '../support/editor-controls'
import { nextMaterialDialog } from '../support/materials'
import type { Conversation, DigitalAgent, Resource } from '../../../src/shared/domain'

type State = { direct?: Conversation; group?: Conversation; employee?: DigitalAgent; writer?: DigitalAgent; connectionId?: string; skill?: Resource; materialId?: string; catalogRequests?: number; holdCatalog?: boolean; releaseCatalog?: () => void }
export const test = base.extend<{ scenario: State }>({ scenario: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)

Given('输入框具备当前连接的模型目录和独立员工', async ({ runtime, scenario }) => {
  const server = createServer((request, response) => {
    if (request.url?.endsWith('/models')) {
      scenario.catalogRequests = (scenario.catalogRequests ?? 0) + 1
      const send = () => { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ data: [{ id: 'research-v1' }, { id: 'research-v2' }] })) }
      if (scenario.holdCatalog) scenario.releaseCatalog = send; else send()
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' }); response.write(': waiting\n\n')
  })
  runtime.trackServer(server)
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  await runtime.start()
  const setup = await runtime.page.evaluate(async baseUrl => {
    const a = await window.boai.request('saveConnection', { name: '研究连接', provider: 'openai-compatible', baseUrl, defaultModel: 'research-v1' })
    await window.boai.request('saveConnection', { name: '其他连接', provider: 'openai-compatible', baseUrl, defaultModel: 'other-model' })
    const snapshot = await window.boai.request('snapshot', undefined)
    const employee = snapshot.agents.find(agent => agent.id === 'researcher')!, writer = snapshot.agents.find(agent => agent.id === 'writer')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...definition } = employee
    await window.boai.request('saveAgent', { ...definition, connectionId: a.id, modelId: 'research-v1', expectedConfigVersion: configVersion })
    const direct = await window.boai.request('createConversation', { kind: 'direct', title: '研究员', agentIds: ['researcher'] })
    const group = await window.boai.request('createConversation', { kind: 'group', title: '菜单协作', agentIds: ['researcher', 'writer'] })
    return { direct, group, employee, writer, connectionId: a.id }
  }, `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`)
  Object.assign(scenario, setup)
  await runtime.page.locator('.conversation-item[aria-label="研究员"]').click()
  await runtime.page.getByRole('textbox', { name: '消息内容' }).fill('未发送的草稿')
})
When('连续切换和刷新模型时保持菜单稳定', async ({ runtime, scenario }) => {
  const page = runtime.page, trigger = page.getByRole('button', { name: '选择模型', exact: true }), menu = page.getByRole('menu', { name: '选择模型', exact: true })
  await trigger.click()
  const options = menu.getByRole('menuitemradio')
  await expect(options).toHaveText(['research-v1', 'research-v2'])
  await expect(menu.getByText(/^使用 /)).toHaveCount(0)
  await expect(menu.getByText(/正在读取模型/)).toHaveCount(0)
  const height = await menu.evaluate(element => element.getBoundingClientRect().height)
  await runtime.app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers.get('boai:request')!
    let held = false
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (!held && payload.method === 'saveAgent' && payload.input.id === 'researcher') {
        held = true
        await new Promise<void>(resolve => { (globalThis as unknown as { releaseComposerSave: () => void }).releaseComposerSave = resolve })
      }
      return original(event, payload)
    })
  })
  await menu.getByRole('menuitemradio', { name: 'research-v2', exact: true }).click()
  await expect(menu.getByRole('menuitemradio', { name: 'research-v2', exact: true })).toBeDisabled()
  await expect(menu.getByText(/暂不可修改/)).toHaveCount(0)
  expect(await menu.evaluate(element => element.getBoundingClientRect().height)).toBeCloseTo(height, 0)
  await runtime.app.evaluate(() => (globalThis as unknown as { releaseComposerSave: () => void }).releaseComposerSave())
  await expect(menu).toBeHidden()
  await expect(trigger).toHaveText('research-v2')
  const requests = scenario.catalogRequests
  await trigger.click()
  await expect(options).toHaveText(['research-v1', 'research-v2'])
  expect(scenario.catalogRequests).toBe(requests)
  await menu.getByRole('menuitemradio', { name: 'research-v1', exact: true }).click()
  await expect(menu).toBeHidden()
  await expect(trigger).toHaveText('research-v1')
  await trigger.click()
  scenario.holdCatalog = true
  await menu.getByRole('menuitem', { name: '刷新模型', exact: true }).click()
  await expect.poll(() => Boolean(scenario.releaseCatalog)).toBe(true)
  await expect(options).toHaveText(['research-v1', 'research-v2'])
  await expect(menu.getByText(/正在读取模型/)).toHaveCount(0)
  expect(await menu.evaluate(element => element.getBoundingClientRect().height)).toBeCloseTo(height, 0)
  scenario.releaseCatalog!()
  await expect(menu.getByRole('menuitem', { name: '刷新模型', exact: true })).toBeEnabled()
})
Then('管理模型定位通讯录员工且保留原草稿', async ({ runtime, scenario }) => {
  const page = runtime.page
  await page.getByRole('menuitem', { name: '管理模型', exact: true }).click()
  await expect(page.getByRole('button', { name: '通讯录', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(page.locator('.contacts-detail h1')).toHaveText(scenario.employee!.name)
  await expect(page.locator('.contacts-list [aria-current="true"]')).toHaveAttribute('aria-label', scenario.employee!.name)
  await expect(page.getByRole('menu', { name: '选择模型', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '会话', exact: true }).click()
  await expect.poll(() => messageDraft(page.getByRole('textbox', { name: '消息内容' }))).toBe('未发送的草稿')
  expect(runtime.errors).toEqual([])
})
When('切换当前连接内模型并检查窄窗口', async ({ runtime, scenario }) => {
  const page = runtime.page, model = page.getByRole('button', { name: '选择模型', exact: true })
  await expect(page.getByRole('button', { name: '权限批准', exact: true })).toHaveCount(0)
  await model.click()
  await expect(page.getByRole('menuitemradio', { name: 'research-v2', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: 'other-model', exact: true })).toHaveCount(0)
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await page.getByRole('menuitemradio', { name: 'research-v2', exact: true }).click()
  await expect(model).toHaveText('research-v2')
  await expect.poll(() => messageDraft(page.getByRole('textbox', { name: '消息内容' }))).toBe('未发送的草稿')
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 640))
  await model.click()
  expect(await page.getByRole('menu', { name: '选择模型', exact: true }).evaluate(element => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight })).toBe(true)
  await page.keyboard.press('Escape'); await expect(model).toBeFocused()
  await page.getByRole('textbox', { name: '消息内容' }).fill('保持执行，检查锁定')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.find(item => item.id === scenario.direct!.id)?.activity).toBe('running')
  await model.click(); await expect(page.getByRole('menuitemradio', { name: 'research-v1', exact: true })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.evaluate(id => window.boai.request('cancelRun', { conversationId: id }), scenario.direct!.id)
  await runtime.reviewNativeCheckpoint('当前连接模型与权限隐藏')
})
Then('重启仍保留模型且权限与另一个员工未变化', async ({ runtime, scenario }) => {
  await runtime.restart()
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.find(agent => agent.id === 'researcher')).toMatchObject({ connectionId: scenario.connectionId, modelId: 'research-v2', allowCommands: scenario.employee!.allowCommands })
  expect(snapshot.agents.find(agent => agent.id === 'writer')).toEqual(scenario.writer)
  expect(runtime.errors).toEqual([])
})
When('下一次模型保存失败', async ({ runtime }) => {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:request')!
    let rejected = false
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (!rejected && payload.method === 'saveAgent' && payload.input.id === 'researcher') { rejected = true; throw new Error('验收：模型保存失败，未提交') }
      return original(event, payload)
    })
  })
  await runtime.page.getByRole('button', { name: '选择模型', exact: true }).click()
  await runtime.page.getByRole('menuitemradio', { name: 'research-v2', exact: true }).click()
})
Then('模型显示仍与已保存配置一致且需核对配置', async ({ runtime }) => {
  const page = runtime.page
  await expect(page.getByRole('button', { name: '选择模型', exact: true })).toHaveText('research-v1')
  await expect(page.getByRole('menuitem', { name: '核对员工配置', exact: true })).toBeVisible()
  await expect(page.getByRole('menuitemradio', { name: 'research-v2', exact: true })).toBeDisabled()
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')?.modelId).toBe('research-v1')
  await expect.poll(() => messageDraft(page.getByRole('textbox', { name: '消息内容' }))).toBe('未发送的草稿')
})
When('使用斜线菜单并提及已绑定技能和已发送文件', async ({ runtime, scenario }) => {
  const page = runtime.page, input = page.getByRole('textbox', { name: '消息内容' })
  await input.fill('/'); await expect(page.getByRole('listbox', { name: '快捷命令' })).toBeVisible()
  await input.press('Enter')
  await expect.poll(() => messageDraft(input)).toContain('请总结当前会话')
  expect((await page.evaluate(id => window.boai.request('getConversation', { id }), scenario.direct!.id)).messages).toEqual([])
  const root = await realpath(runtime.root), skillPath = join(root, 'composer-skill'), filePath = join(root, 'brief.md')
  await mkdir(skillPath); await writeFile(join(skillPath, 'SKILL.md'), '---\nname: composer-research\ndescription: Research fixture\n---\nUse current sources.')
  await writeFile(filePath, 'COMPOSER_FILE_ORIGINAL')
  await nextMaterialDialog(runtime, { path: skillPath })
  scenario.skill = await page.evaluate(async () => {
    const path = await window.boai.request('choosePath', { kind: 'skill' })
    const skill = await window.boai.request('importResource', { kind: 'skill', path: path! })
    const employee = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...definition } = employee
    await window.boai.request('saveAgent', { ...definition, skillIds: [skill.id], expectedConfigVersion: configVersion })
    return skill
  })
  await nextMaterialDialog(runtime, { path: filePath })
  scenario.materialId = await page.evaluate(async conversationId => {
    const source = await window.boai.request('chooseMaterialSource', undefined)
    const material = await window.boai.request('prepareMaterial', { conversationId, selectionId: source!.id, requestId: crypto.randomUUID() })
    await window.boai.request('sendMessage', { conversationId, content: '保留此材料', mentionIds: [], requestId: crypto.randomUUID(), materialSelections: [{ id: material.id, revision: material.revision }] })
    await window.boai.request('cancelRun', { conversationId })
    return material.id
  }, scenario.direct!.id)
  await input.fill('@'); await expect(page.getByRole('option', { name: scenario.skill.name, exact: true })).toBeVisible()
  await page.getByRole('option', { name: scenario.skill.name, exact: true }).click()
  await input.press('End'); await input.pressSequentially(' @brief')
  await page.getByRole('option', { name: 'brief.md', exact: true }).click()
  await expect(page.locator('.chat-composer .composer-mention-tag')).toHaveCount(2)
  await expect(page.getByRole('listbox', { name: '技能和文件' })).toBeHidden()
  await runtime.reviewNativeCheckpoint('技能和文件原子标签')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
})
Then('资源引用随消息受理且群聊成员提及仍可用', async ({ runtime, scenario }) => {
  const page = runtime.page
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getConversation', { id }), scenario.direct!.id)).messages.filter(message => message.senderType === 'user').length).toBe(2)
  const view = await page.evaluate(id => window.boai.request('getConversation', { id }), scenario.direct!.id)
  const message = view.messages.filter(message => message.senderType === 'user').at(-1)!
  expect(message.mentionIds).toEqual([])
  expect(message.composerReferences).toEqual([expect.objectContaining({ kind: 'skill', id: scenario.skill!.id }), expect.objectContaining({ kind: 'material', id: scenario.materialId, conversationId: scenario.direct!.id })])
  await page.evaluate(id => window.boai.request('cancelRun', { conversationId: id }), scenario.direct!.id)
  await page.locator('.conversation-item[aria-label="菜单协作"]').click()
  await expect(page.getByRole('button', { name: '选择模型', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '提及群聊成员', exact: true }).click()
  await page.getByRole('option', { name: '@' + scenario.writer!.name, exact: true }).click()
  await expect(page.locator('.chat-composer .composer-mention-tag')).toHaveText('@' + scenario.writer!.name)
  expect(runtime.errors).toEqual([])
})

When('打开支持模型的推理子菜单并保存低强度', async ({ runtime, scenario }) => {
  const page = runtime.page
  await runtime.app.evaluate(({ ipcMain }) => {
    const original = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers.get('boai:request')!
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', (event, payload) => payload.method === 'listConnectionModels' && payload.input.baseUrl === 'https://api.deepseek.com' ? ['deepseek-v4-pro'] : original(event, payload))
  })
  scenario.connectionId = await page.evaluate(async () => {
    const connection = await window.boai.request('saveConnection', { name: '推理能力协议', provider: 'openai-compatible', baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-v4-pro' })
    const employee = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...definition } = employee
    await window.boai.request('saveAgent', { ...definition, connectionId: connection.id, modelId: 'deepseek-v4-pro', thinkingLevel: 'auto', expectedConfigVersion: configVersion })
    return connection.id
  })
  await page.getByRole('button', { name: '选择模型', exact: true }).click()
  await page.getByRole('menuitem', { name: /推理强度/ }).hover()
  await page.getByRole('menuitemradio', { name: '低', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')?.thinkingLevel).toBe('low')
  await expect.poll(() => messageDraft(page.getByRole('textbox', { name: '消息内容' }))).toBe('未发送的草稿')
})
Then('推理设置重启后仍保留且模型连接未变化', async ({ runtime, scenario }) => {
  await runtime.restart()
  const agent = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')!
  expect(agent).toMatchObject({ connectionId: scenario.connectionId, modelId: 'deepseek-v4-pro', thinkingLevel: 'low', allowCommands: scenario.employee!.allowCommands })
  expect(runtime.errors).toEqual([])
})
