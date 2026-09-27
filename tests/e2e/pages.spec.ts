/*
 * [INPUT]: 真实 Electron、统一 UI 页面控件与隔离的本地数据目录。
 * [OUTPUT]: 菜单焦点、创建弹窗必填校验、未保存保护、右侧复选框和表单提交回归。
 * [POS]: 业务页面接入 Soft UI 的跨组件交互验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('page controls preserve validation, saved navigation, checkbox values and popup focus', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-page-controls-'))
  const app = await electron.launch({ args: [resolve('.')], env: { ...process.env, BOAI_DATA_DIR: root, NODE_ENV: 'test' } })
  const page = await app.firstWindow(), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForFunction(() => Boolean(window.boai))
  try {
    const create = page.getByRole('button', { name: '新建', exact: true })
    await create.focus(); await create.press('Enter')
    await expect(page.getByRole('menuitem', { name: '新建员工' })).toBeVisible()
    await page.keyboard.press('Escape'); await expect(create).toBeFocused()
    await create.click(); await page.getByRole('menuitem', { name: '新建员工' }).click()
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
    await page.getByRole('button', { name: '员工设置', exact: true }).click()
    const enabled = page.getByRole('checkbox', { name: /启用员工/ })
    await expect(enabled).toBeChecked(); await enabled.uncheck(); await expect(enabled).not.toBeChecked()
    await page.getByRole('button', { name: '资料库', exact: true }).click()
    await leave.getByRole('button', { name: '继续编辑' }).click()
    await expect(enabled).not.toBeChecked()
    await page.getByRole('button', { name: '资料库', exact: true }).click()
    await leave.getByRole('button', { name: '保存并退出' }).click()
    await expect(page.getByRole('heading', { name: '资料库', exact: true })).toBeVisible()
    await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(a => a.name === '组件联调员工')?.active).toBe(false)

    await page.getByRole('button', { name: '会话', exact: true }).click()
    const employees = page.getByRole('button', { name: '数字员工', exact: true })
    await employees.click()
    const search = page.getByRole('textbox', { name: '搜索数字员工' })
    await expect(search).toBeFocused(); await search.fill('组件联调员工')
    await expect(page.getByRole('dialog', { name: '数字员工' })).toContainText('组件联调员工')
    await page.keyboard.press('Escape'); await expect(employees).toBeFocused()

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
    await filter.click(); await page.getByRole('menuitemradio', { name: '已暂停' }).click()
    await expect(page.getByRole('menu')).toBeHidden()
    await filter.click(); await expect(page.getByRole('menuitemradio', { name: '已暂停' })).toBeChecked()
    await page.keyboard.press('Escape'); await expect(filter).toBeFocused()
    expect(errors).toEqual([])
  } finally {
    // A failed assertion can leave a dirty form; close without the native unsaved prompt.
    await page.evaluate(() => window.boai.request('setUnsavedChanges', { dirty: false })).catch(() => {})
    await app.close(); await rm(root, { recursive: true, force: true })
  }
})
