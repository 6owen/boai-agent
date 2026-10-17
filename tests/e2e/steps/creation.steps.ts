/*
 * [OUTPUT]: 未保存确认使用取消/退出；需保存时取消确认并操作原表单，不通过确认提交。
 * [INPUT]: 创建员工与群聊并保持手动列表状态的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 会话菜单入口、创建员工与群聊并保持手动列表状态的真实桌面业务步骤与断言。
 * [POS]: tests/e2e/steps/creation.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'

type Scenario = {
  prepareCreation?: Awaited<ReturnType<typeof prepareCreation>>
  createEmployee?: Awaited<ReturnType<typeof createEmployee>>
  cancelGroupCreation?: Awaited<ReturnType<typeof cancelGroupCreation>>
  createAndEditGroup?: Awaited<ReturnType<typeof createAndEditGroup>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

async function prepareCreation(runtime: Desktop) {
  const root = runtime.root
  const app = await runtime.start({ dataDir: root })
  const page = await app.firstWindow(),
    errors: string[] = runtime.errors

  await expect(page.locator('.app-shell')).toBeVisible()
  const snapshot = () => page.evaluate(() => window.boai.request('snapshot', undefined))
  const create = async (label: string) => {
    await page.getByRole('button', { name: '新建', exact: true }).click()
    await page.getByRole('menuitem', { name: label, exact: true }).click()
  }
  return { app, page, errors, snapshot, create }
}

async function createEmployee(previous: Awaited<ReturnType<typeof prepareCreation>>) {
  let { app, page, errors, snapshot, create } = previous
  await create('新建员工')
  const employee = page.getByRole('dialog', { name: '新建数字员工', exact: true })
  await expect(employee.getByRole('textbox')).toHaveCount(3)
  await employee.getByRole('textbox', { name: '名称', exact: true }).fill('交互设计师')
  await employee.getByRole('textbox', { name: '角色', exact: true }).fill('打磨交互与界面')
  const prompt = employee.getByRole('textbox', { name: 'Prompt', exact: true })
  await prompt.fill('始终先理解用户的目标，再提出具体的设计改进。')
  await expect(prompt).toHaveCSS('outline-style', 'none')
  expect(await prompt.evaluate((el) => getComputedStyle(el).getPropertyValue('--tw-ring-shadow').trim())).toBe('0 0 transparent')
  await employee.getByRole('button', { name: '创建员工', exact: true }).click()
  await expect(employee).toBeHidden()
  await expect(page.locator('.conversation-item').filter({ hasText: '交互设计师' })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '消息内容' })).toBeVisible()
  const agent = (await snapshot()).agents.find((a) => a.name === '交互设计师')!
  expect(agent.role).toBe('打磨交互与界面')
  const rules = await page.evaluate((agentId) => window.boai.request('readAgentFile', { agentId, name: 'AGENTS.md' }), agent.id)
  expect(rules.content).toContain('始终先理解用户的目标')
  return { app, page, errors, snapshot, create }
}

async function cancelGroupCreation(previous: Awaited<ReturnType<typeof createEmployee>>) {
  let { app, page, errors, snapshot, create } = previous
  const before = (await snapshot()).conversations.length
  await create('新建群聊')
  const group = page.getByRole('dialog', { name: '发起群聊', exact: true })
  await expect(group.getByRole('button', { name: '完成', exact: true })).toBeDisabled()
  await group.getByRole('checkbox', { name: /^研究员/ }).check()
  await expect(group.getByRole('button', { name: '完成', exact: true })).toBeEnabled()
  await group.getByRole('textbox', { name: '搜索群成员' }).fill('交互')
  await group.getByRole('checkbox', { name: /^交互设计师/ }).check()
  await expect(group.getByRole('region', { name: '已选成员' })).toContainText('研究员')
  await group.getByRole('button', { name: '移除 研究员', exact: true }).click()
  await expect(group.getByRole('region', { name: '已选成员' })).not.toContainText('研究员')
  await group.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '退出' }).click()
  await expect(group).toBeHidden()
  expect((await snapshot()).conversations).toHaveLength(before)
  return { app, page, errors, snapshot, create, group }
}

async function createAndEditGroup(previous: Awaited<ReturnType<typeof cancelGroupCreation>>) {
  let { app, page, errors, snapshot, create, group } = previous
  await create('新建群聊')
  await group.getByRole('checkbox', { name: /^研究员/ }).check()
  await group.getByRole('checkbox', { name: /^写手/ }).check()
  await group.getByRole('button', { name: '完成', exact: true }).click()
  await expect(group).toBeHidden()
  const created = (await snapshot()).conversations.find((c) => c.kind === 'group')!
  expect(created.agentIds).toEqual(['researcher', 'writer'])
  const row = page.locator('.conversation-item').filter({ hasText: created.title })
  await expect(row).toBeVisible()
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '配置', exact: true }).click()
  const details = page.getByRole('complementary', { name: '群聊详情', exact: true })
  await expect(details).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await details.getByRole('textbox', { name: '群聊名称', exact: true }).fill('设计协作群')
  await details.getByRole('button', { name: '保存设置', exact: true }).click()
  await expect(details).toBeHidden()
  await expect(page.locator('.conversation-item').filter({ hasText: '设计协作群' })).toBeVisible()
  return { app, page, errors }
}

async function verifyManualSidebar(previous: Awaited<ReturnType<typeof createAndEditGroup>>) {
  let { app, page, errors } = previous
  const list = page.locator('.conversation-list-container')
  const toggle = page.getByRole('button', { name: '显示或隐藏会话列表', exact: true })
  const visibleIcon = await toggle.locator('.app-icon').getAttribute('class')
  for (const width of [1124, 900, 760, 1247]) {
    await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 720), width)
    await expect(list).toBeVisible()
    await expect(page.getByRole('textbox', { name: '消息内容' })).toBeVisible()
    await page.locator('.conversation-item').filter({ hasText: '交互设计师' }).click()
    await expect(list).toBeVisible()
    await page.getByRole('button', { name: '显示或隐藏详情', exact: true }).click()
    await expect(list).toBeVisible()
    const left = await list.boundingBox(),
      right = await page.locator('.detail-panel').boundingBox()
    expect(right!.x).toBeGreaterThanOrEqual(left!.x + left!.width)
    await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  }
  await toggle.click()
  await page.mouse.move(500, 100)
  await expect(list).toBeHidden()
  expect(await toggle.locator('.app-icon').getAttribute('class')).not.toBe(visibleIcon)
  await expect(toggle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 640))
  await expect(list).toBeHidden()
  await toggle.click()
  await page.mouse.move(500, 100)
  await expect(list).toBeVisible()
  await expect(toggle).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  expect(await toggle.locator('.app-icon').getAttribute('class')).toBe(visibleIcon)
  expect(errors).toEqual([])
}

Given('桌面已就绪并提供员工与群聊创建入口', async ({ runtime, scenario }) => {
  scenario.prepareCreation = await prepareCreation(runtime)
})

When('填写员工名称职责和工作规则并保存', async ({ scenario }) => {
  scenario.createEmployee = await createEmployee(scenario.prepareCreation!)
})

Then('取消群聊选择不会创建会话', async ({ scenario }) => {
  scenario.cancelGroupCreation = await cancelGroupCreation(scenario.createEmployee!)
})

When('创建双人群聊并在右侧修改群名', async ({ scenario }) => {
  scenario.createAndEditGroup = await createAndEditGroup(scenario.cancelGroupCreation!)
})

Then('窗口尺寸变化保留列表状态且仅手动开关改变状态', async ({ scenario }) => {
  await verifyManualSidebar(scenario.createAndEditGroup!)
})
