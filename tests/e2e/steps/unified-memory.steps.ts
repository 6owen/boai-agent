/*
 * [INPUT]: 统一记忆中文场景、真实 Electron/IPC 和独立 SQLite 旧记录。
 * [OUTPUT]: 列表/编辑/固定/忘记/冲突保留/范围/旧升级的实际 UI 断言。
 * [POS]: T2.5 桌面管理验收；模型质量由手动真实评估记录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from '../support/test'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import { join } from 'node:path'
const { Given, When, Then } = createBdd(test)
Given('在隔离桌面打开员工统一记忆', async ({ runtime }) => {
  await runtime.start(); const page = runtime.page
  await expect(page.locator('.app-shell')).toBeVisible()
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await page.getByRole('tab', { name: '记忆', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '记忆' }).getByText('没有符合条件的记忆。')).toBeVisible()
})
When('添加固定和忘记员工记忆', async ({ runtime }) => {
  const page = runtime.page, pane = page.getByRole('tabpanel', { name: '记忆' })
  await pane.getByRole('button', { name: '添加', exact: true }).click()
  await pane.getByRole('textbox', { name: '新增记忆', exact: true }).fill('中文海报偏好 UI_CANARY')
  await pane.getByRole('button', { name: '保存记忆', exact: true }).click()
  await expect(pane.getByText('中文海报偏好 UI_CANARY', { exact: true })).toBeVisible()
  await pane.getByRole('button', { name: '固定', exact: true }).click(); await expect(pane.getByText(/已固定/)).toBeVisible()
  await runtime.restart()
  await pageReady(runtime)
  await expect(runtime.page.getByRole('tabpanel', { name: '记忆' }).getByText('中文海报偏好 UI_CANARY', { exact: true })).toBeVisible()
  const next = runtime.page.getByRole('tabpanel', { name: '记忆' })
  await next.getByRole('button', { name: '忘记', exact: true }).click(); await next.getByRole('button', { name: '确认忘记', exact: true }).click()
  await expect(next.getByText('没有符合条件的记忆。')).toBeVisible()
})
async function pageReady(runtime: import('../support/desktop').Desktop) {
  const page = runtime.page; await expect(page.locator('.app-shell')).toBeVisible()
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await page.getByRole('button', { name: '编辑配置', exact: true }).click(); await page.getByRole('tab', { name: '记忆', exact: true }).click()
}
Then('记忆编辑版本冲突保留草稿并可核对', async ({ runtime }) => {
  const page = runtime.page, pane = page.getByRole('tabpanel', { name: '记忆' })
  await pane.getByRole('button', { name: '添加', exact: true }).click(); await pane.getByRole('textbox', { name: '新增记忆', exact: true }).fill('不能丢失的草稿')
  await page.evaluate(async () => { const query = { agentId: 'researcher', scope: 'employee' as const }; const view = await window.boai.request('getMemory', query); await window.boai.request('saveMemory', { ...query, content: '另一窗口已保存', expectedEpoch: view.epoch }) })
  await pane.getByRole('button', { name: '保存记忆', exact: true }).click()
  await expect(pane.getByRole('alert')).toContainText('记忆已变更'); await expect(pane.getByRole('textbox', { name: '新增记忆', exact: true })).toHaveValue('不能丢失的草稿')
  await pane.getByRole('button', { name: '取消', exact: true }).click(); await page.getByRole('button', { name: '放弃并退出', exact: true }).click()
  await pane.getByRole('button', { name: '刷新', exact: true }).click(); await expect(pane.getByText('另一窗口已保存', { exact: true })).toBeVisible()
})
Then('来源聊天限制和旧条目升级持久化', async ({ runtime }) => {
  const conversation = await runtime.page.evaluate(() => window.boai.request('createConversation', { kind: 'direct', title: '旧来源', agentIds: ['researcher'] }))
  await runtime.close()
  const store = new ProductStore(join(runtime.root, 'v2', 'boai.sqlite')); await store.init()
  try { await store.write([{ collection: 'memory', id: 'legacy', value: { id: 'legacy', ownerAgentId: 'researcher', scope: 'conversation', conversationId: conversation.id, content: '旧会话明确资料', origin: 'user', version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), sourceMessageIds: [], sourceResourceIds: [] } }]) } finally { await store.close() }
  await runtime.start(); await pageReady(runtime)
  const page = runtime.page, pane = page.getByRole('tabpanel', { name: '记忆' }), card = pane.locator('.memory-card').filter({ hasText: '旧会话明确资料' })
  await expect(card).toContainText('仅此聊天'); await card.getByRole('button', { name: '编辑', exact: true }).click()
  await pane.getByRole('combobox', { name: '使用范围', exact: true }).click(); await page.getByRole('option', { name: '相关聊天可用', exact: true }).click()
  await expect(pane.getByRole('button', { name: '保存记忆', exact: true })).toBeDisabled()
  await pane.getByRole('checkbox').check(); await pane.getByRole('button', { name: '保存记忆', exact: true }).click(); await expect(card).toContainText('相关聊天可用')
  await pane.getByRole('combobox', { name: '来源聊天', exact: true }).click(); await page.getByRole('option', { name: '旧来源', exact: true }).click()
  await pane.getByRole('combobox', { name: '此来源聊天的新交流', exact: true }).click(); await page.getByRole('option', { name: '仅在此聊天使用', exact: true }).click()
  await expect(card).toContainText('仅此聊天')
  await runtime.restart(); await pageReady(runtime)
  await expect(runtime.page.getByRole('tabpanel', { name: '记忆' }).locator('.memory-card').filter({ hasText: '旧会话明确资料' })).toContainText('仅此聊天')
  expect(runtime.errors).toEqual([])
})
