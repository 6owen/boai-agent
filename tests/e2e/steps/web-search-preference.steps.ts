/*
 * [OUTPUT]: DeepSeek API与Tavily/Exa MCP使用同一实际首选配置/停用/解绑流程，零外部请求。
 * [INPUT]: Actual Electron employee editor, DeepSeek/Tavily/Exa candidate Select, source actions and isolated persisted data.
 * [OUTPUT]: Draft-only changes, preference save/restart, disabled-source display and explicit unbind reset; native evidence waits for the real contact transition; no model/provider calls.
 * [POS]: Search preference BDD steps, using the shared Desktop lifecycle.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { DataSource } from '../../../src/shared/domain/sources'

export const test = base.extend<{ search: { source?: DataSource } }>({ search: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
Given('员工已绑定{string}搜索源且另一份未绑定', async ({ runtime, search }, provider: string) => {
  await runtime.start()
  search.source = await runtime.page.evaluate(async provider => {
    const config = provider === 'DeepSeek' ? { name: '首选搜索验收', description: '仅配置验收，不连接服务', guide: '', enabled: true, type: 'api' as const, api: { baseUrl: 'https://api.deepseek.com', authType: 'bearer' as const, testPath: '/' } } : { name: '首选搜索验收', description: '仅配置验收，不连接服务', guide: '', enabled: true, type: 'mcp' as const, mcp: { transport: 'http' as const, url: provider === 'Exa' ? 'https://mcp.exa.ai/mcp' : 'https://mcp.tavily.com/mcp/', authType: 'none' as const } }
    const source = await window.boai.request('saveDataSource', { id: crypto.randomUUID(), expectedRevision: 0, config })
    await window.boai.request('saveDataSource', { id: crypto.randomUUID(), expectedRevision: 0, config: { ...config, name: '未绑定搜索验收' } })
    const employee = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!
    const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, directoryRevision, systemRole: _s, creationSource: _c, ...definition } = employee
    await window.boai.request('saveAgent', { ...definition, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, sourceIds: [source.id] })
    return source
  }, provider)
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
})
When('在数据源分区选择搜索源和浏览器并保存', async ({ runtime, search }) => {
  const page = runtime.page
  for (const choice of ['首选搜索验收', 'BOAI 浏览器', '首选搜索验收']) {
    const before = await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!)
    await page.getByRole('button', { name: '编辑数据源', exact: true }).click()
    await page.getByRole('combobox', { name: '首选检索方式', exact: true }).click()
    await expect(page.getByRole('option', { name: '未绑定搜索验收', exact: true })).toHaveCount(0)
    await page.getByRole('option', { name: choice, exact: true }).click()
    expect((await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!)).webSearch).toEqual(before.webSearch)
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByRole('combobox', { name: '首选检索方式', exact: true })).toHaveCount(0)
    const saved = await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!)
    expect(saved.webSearch).toEqual(choice === 'BOAI 浏览器' ? { mode: 'browser' } : { mode: 'source', sourceId: search.source!.id })
    expect(saved.sourceIds).toEqual([search.source!.id]); expect(saved.modelId).toBe(before.modelId); expect(saved.executionBackend).toEqual(before.executionBackend)
    await runtime.reviewNativeCheckpoint(`保存首选：${choice}`)
  }
})
Then('首选重启后保持且来源停用与解绑状态准确', async ({ runtime, search }) => {
  await runtime.restart()
  let employee = await runtime.page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!)
  expect(employee.webSearch).toEqual({ mode: 'source', sourceId: search.source!.id })
  const source = search.source!
  await runtime.page.evaluate(async source => {
    const { id, revision, createdAt: _c, updatedAt: _u, hasCredential: _h, test: _t, creationSource: _s, ...config } = source
    await window.boai.request('saveDataSource', { id, expectedRevision: revision, config: { ...config, enabled: false } })
  }, source)
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await expect(runtime.page.getByRole('region', { name: '数据源列表', exact: true })).toContainText('首选搜索验收（已停用）')
  await expect(runtime.page.locator('.contact-content-transition')).toHaveAttribute('data-settled', 'true')
  await runtime.reviewNativeCheckpoint('原首选来源停用后显示实际状态')
  await runtime.page.getByRole('button', { name: '编辑数据源', exact: true }).click()
  await runtime.page.getByRole('button', { name: '数据源操作 首选搜索验收', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '移除', exact: true }).click()
  await runtime.page.getByRole('button', { name: '确认移除', exact: true }).click()
  await expect(runtime.page.getByRole('combobox', { name: '首选检索方式', exact: true })).toContainText('自动')
  await runtime.page.getByRole('button', { name: '保存', exact: true }).click()
  await runtime.restart()
  employee = await runtime.page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!)
  expect(employee.webSearch).toEqual({ mode: 'auto' }); expect(employee.sourceIds).toEqual([])
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.approvals).toEqual([])
  await runtime.reviewData('重启后首选自动与零审批事实', { employee, approvals: snapshot.approvals, conversations: snapshot.conversations })
  expect(runtime.errors).toEqual([])
})
