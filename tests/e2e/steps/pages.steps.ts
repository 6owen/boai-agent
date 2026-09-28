/*
 * [INPUT]: 页面表单校验与焦点恢复的中文场景、Electron fixture 与现有产品 API。
 * [OUTPUT]: 页面表单校验与焦点恢复的真实桌面业务步骤、通讯录搜索及添加菜单焦点断言。
 * [POS]: tests/e2e/steps/pages.steps.ts；场景状态仅在本次测试内共享。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'

type Scenario = {
  launchPageControls?: Awaited<ReturnType<typeof launchPageControls>>
  createWithValidation?: Awaited<ReturnType<typeof createWithValidation>>
  saveDisabledEmployee?: Awaited<ReturnType<typeof saveDisabledEmployee>>
  searchEmployee?: Awaited<ReturnType<typeof searchEmployee>>
}

export const test = base.extend<{ scenario: Scenario }>({
  scenario: async ({}, use) => use({}),
})
const { Given, When, Then } = createBdd(test)

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
  await page.getByRole('button', { name: '员工设置', exact: true }).click()
  const enabled = page.getByRole('checkbox', { name: /启用员工/ })
  await expect(enabled).toBeChecked()
  await enabled.uncheck()
  await expect(enabled).not.toBeChecked()
  await page.getByRole('button', { name: '资料库', exact: true }).click()
  await leave.getByRole('button', { name: '继续编辑' }).click()
  await expect(enabled).not.toBeChecked()
  await page.getByRole('button', { name: '资料库', exact: true }).click()
  await leave.getByRole('button', { name: '保存并退出' }).click()
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
  await page.getByLabel('连接名称', { exact: true }).fill('页面组件验证')
  await page.getByLabel('服务类型', { exact: true }).selectOption('openai-compatible')
  await page.getByLabel('接口地址 Base URL', { exact: true }).fill('http://127.0.0.1:1/v1')
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
