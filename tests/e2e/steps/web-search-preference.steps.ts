/*
 * [OUTPUT]: 模型连接从本人菜单“其他配置”进入，原行为断言保持。
 * [INPUT]: Actual settings/employee UI, synthetic keys and isolated persisted state.
 * [OUTPUT]: Browser/DeepSeek only, model-style dialog/menu, global default, employee choice, disable/restart and confirmed removal.
 * [POS]: Web-search capability BDD, shared Desktop supports pnpm dev; no remote provider calls.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { WebSearchServiceConfig } from '../../../packages/shared/src/domain/web-search'

export const test = base.extend<{ search: { service?: WebSearchServiceConfig } }>({ search: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
Given('从全局网页检索页面配置{string}', async ({ runtime, search }, provider: string) => {
  await runtime.start()
  const page = runtime.page
  await page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '其他配置', exact: true }).click()
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '网页检索', exact: true }).click()
  await expect(page.getByRole('region', { name: '网页检索设置' })).toContainText('BOAI 浏览器')
  await expect(page.locator('[data-search-provider]')).toHaveCount(2)
  await expect(page.getByRole('region', { name: '网页检索设置' })).not.toContainText(/Jina|Tavily|Exa/)
  await page.locator(`[data-search-provider="${provider.toLowerCase()}"]`).getByRole('button', { name: '配置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: `连接 ${provider}`, exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: `${provider} API Key`, exact: true }).fill('ISOLATED_SEARCH_KEY')
  await dialog.getByRole('button', { name: '保存连接', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  search.service = (await page.evaluate(() => window.boai.request('getWebSearchSettings', undefined))).services[0]
  expect(search.service.provider).toBe(provider.toLowerCase())
  expect(search.service.hasCredential).toBe(true)
  await page.getByRole('combobox', { name: '默认检索方式' }).click()
  await expect(page.getByRole('option')).toHaveText(['BOAI 浏览器', provider])
  await page.getByRole('option', { name: provider, exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('getWebSearchSettings', undefined))).default).toEqual({ mode: 'service', serviceId: search.service.id })
  expect(await page.evaluate(() => window.boai.request('listDataSources', undefined))).toEqual([])
  await runtime.reviewNativeCheckpoint('独立网页检索设置')
})
When('在员工独立网页检索分区选择服务并保存', async ({ runtime, search }) => {
  const page = runtime.page, name = search.service!.name
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await expect(page.getByRole('region', { name: '网页检索配置' })).toContainText('跟随全局默认')
  await expect(page.getByRole('region', { name: '网页检索配置' })).toContainText(name)
  for (const choice of [name, 'BOAI 浏览器', name]) {
    const before = await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!)
    await page.getByRole('button', { name: '编辑网页检索', exact: true }).click()
    await page.getByRole('combobox', { name: '员工网页检索方式' }).click()
    await expect(page.getByRole('option')).toHaveText(['跟随全局默认', 'BOAI 浏览器', name, '关闭网页检索'])
    await page.getByRole('option', { name: choice, exact: true }).click()
    expect((await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!)).webSearch).toEqual(before.webSearch)
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('combobox', { name: '员工网页检索方式' })).toHaveCount(0)
    const saved = await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!)
    expect(saved.webSearch).toEqual(choice === 'BOAI 浏览器' ? { mode: 'browser' } : { mode: 'service', serviceId: search.service!.id })
    expect(saved.sourceIds ?? []).toEqual([]); expect(saved.modelId).toBe(before.modelId); expect(saved.executionBackend).toEqual(before.executionBackend)
  }
  await runtime.reviewNativeCheckpoint('员工独立网页检索 Card')
  await page.getByRole('button', { name: '配置检索服务', exact: true }).click()
  await expect(page.getByRole('region', { name: '网页检索设置' })).toBeVisible()
  await page.getByRole('button', { name: `管理 ${name}`, exact: true }).click()
  await page.getByRole('menuitem', { name: '编辑配置', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: `连接 ${name}`, exact: true })
  const key = dialog.getByRole('textbox', { name: `${name} API Key`, exact: true })
  await expect(key).toHaveValue('ISOLATED_SEARCH_KEY'); await expect(key).toHaveAttribute('type', 'password')
  await dialog.getByRole('switch').click()
  await dialog.getByRole('button', { name: '保存连接', exact: true }).click()
  await expect(dialog).toHaveCount(0)
})
Then('检索配置重启后保持且停用状态准确', async ({ runtime, search }) => {
  await runtime.restart()
  const page = runtime.page
  const employee = await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!)
  expect(employee.webSearch).toEqual({ mode: 'service', serviceId: search.service!.id })
  expect(employee.sourceIds ?? []).toEqual([])
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await expect(page.getByRole('region', { name: '网页检索配置' })).toContainText(search.service!.name + '（已停用）')
  expect((await page.evaluate(() => window.boai.request('getWebSearchSettings', undefined))).services[0].enabled).toBe(false)
  expect(await page.evaluate(() => window.boai.request('listDataSources', undefined))).toEqual([])
  await page.getByRole('button', { name: '配置检索服务', exact: true }).click()
  await page.getByRole('button', { name: `管理 ${search.service!.name}`, exact: true }).click()
  await page.getByRole('menuitem', { name: '移除', exact: true }).click()
  await expect(page.getByText(`移除“${search.service!.name}”？`, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect((await page.evaluate(() => window.boai.request('getWebSearchSettings', undefined))).services).toHaveLength(1)
  await page.getByRole('button', { name: `管理 ${search.service!.name}`, exact: true }).click()
  await page.getByRole('menuitem', { name: '移除', exact: true }).click()
  await page.getByRole('button', { name: '确认移除', exact: true }).click()
  await expect(page.locator('[data-search-provider="deepseek"]').getByRole('button', { name: '配置', exact: true })).toBeVisible()
  expect((await page.evaluate(() => window.boai.request('getWebSearchSettings', undefined))).services).toEqual([])
  expect(runtime.errors).toEqual([])
})
