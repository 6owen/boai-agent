/*
 * [OUTPUT]: 未保存确认使用取消/退出；需保存时取消确认并操作原表单，不通过确认提交。
 * [INPUT]: 统一记忆原场景、现行高级配置/独立记忆Dialog、真实 Electron/IPC 和隔离旧记录。
 * [OUTPUT]: 原添加/固定/忘记/冲突草稿/范围/旧升级/重启断言保持，错误沿Sonner；旧格式注入前后核对实际数据路径/员工ID与运行快照并留原件。
 * [POS]: T2.5 桌面管理验收；模型质量由手动真实评估记录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from '../support/test'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import { join } from 'node:path'
import { realpath } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
const { Given, When, Then } = createBdd(test)
Given('在隔离桌面打开员工统一记忆', async ({ runtime }) => {
  await runtime.start(); await pageReady(runtime)
  await expect(runtime.page.getByRole('tabpanel', { name: '记忆' }).getByText('没有符合条件的记忆。')).toBeVisible()
})
When('添加固定和忘记员工记忆', async ({ runtime }) => {
  const page = runtime.page, pane = page.getByRole('tabpanel', { name: '记忆' })
  await pane.getByRole('button', { name: '添加记忆', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '添加记忆', exact: true })
  await editor.getByRole('textbox', { name: '新增记忆', exact: true }).fill('中文海报偏好 UI_CANARY')
  await editor.getByRole('button', { name: '保存记忆', exact: true }).click()
  await expect(editor).toBeHidden()
  await expect(pane.getByText('中文海报偏好 UI_CANARY', { exact: true })).toBeVisible()
  await pane.getByRole('button', { name: '固定', exact: true }).click(); await expect(pane.getByText(/已固定/)).toBeVisible()
  await runtime.restart()
  await pageReady(runtime)
  await expect(runtime.page.getByRole('tabpanel', { name: '记忆' }).getByText('中文海报偏好 UI_CANARY', { exact: true })).toBeVisible()
  const next = runtime.page.getByRole('tabpanel', { name: '记忆' })
  await next.getByRole('button', { name: '忘记', exact: true }).click(); await next.getByRole('button', { name: '确认忘记', exact: true }).click()
  await expect(next.getByText('没有符合条件的记忆。')).toBeVisible()
  await runtime.reviewCheckpoint('原记忆经重启固定后明确忘记')
})
async function pageReady(runtime: import('../support/desktop').Desktop) {
  const page = runtime.page; await expect(page.locator('.app-shell')).toBeVisible()
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await page.getByRole('button', { name: '高级配置', exact: true }).click()
  await page.getByRole('dialog', { name: '高级配置', exact: true }).getByRole('tab', { name: '记忆', exact: true }).click()
}
Then('记忆编辑版本冲突保留草稿并可核对', async ({ runtime }) => {
  const page = runtime.page, pane = page.getByRole('tabpanel', { name: '记忆' })
  await pane.getByRole('button', { name: '添加记忆', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '添加记忆', exact: true })
  await editor.getByRole('textbox', { name: '新增记忆', exact: true }).fill('不能丢失的草稿')
  await page.evaluate(async () => { const query = { agentId: 'researcher', scope: 'employee' as const }; const view = await window.boai.request('getMemory', query); await window.boai.request('saveMemory', { ...query, content: '另一窗口已保存', expectedEpoch: view.epoch }) })
  await editor.getByRole('button', { name: '保存记忆', exact: true }).click()
  await expect(page.locator('[data-sonner-toast][data-type="error"]').filter({ hasText: '记忆已变更' })).toBeVisible()
  await expect(editor.getByRole('textbox', { name: '新增记忆', exact: true })).toHaveValue('不能丢失的草稿')
  await runtime.reviewCheckpoint('真实版本冲突保留记忆Dialog草稿')
  await editor.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '退出', exact: true }).click()
  await expect(editor).toBeHidden()
  await pane.getByRole('button', { name: '刷新', exact: true }).click(); await expect(pane.getByText('另一窗口已保存', { exact: true })).toBeVisible()
})
Then('来源聊天限制和旧条目升级持久化', async ({ runtime }) => {
  const conversation = await runtime.page.evaluate(() => window.boai.request('createConversation', { kind: 'direct', title: '旧来源', agentIds: ['researcher'] }))
  const before = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  const database = join(before.dataPath, 'boai.sqlite')
  expect(await realpath(database)).toBe(await realpath(join(runtime.root, 'v2', 'boai.sqlite')))
  const ids = () => {
    const client = new DatabaseSync(database, { readOnly: true })
    try { return client.prepare("SELECT id FROM records WHERE collection='agents' ORDER BY id").all().map(row => String(row.id)) }
    finally { client.close() }
  }
  const expectedIds = before.agents.map(agent => agent.id).sort()
  await runtime.close()
  await runtime.reviewData('旧记忆注入前关闭后的实际员工', { expectedIds, actualIds: ids() })
  expect(ids()).toEqual(expectedIds)
  const store = new ProductStore(database); await store.init()
  try {
    await runtime.reviewData('旧记忆夹具存储初始化后的实际员工', { actualIds: (await store.load<{ id: string }>('agents')).map(agent => agent.id).sort() })
    await store.write([{ collection: 'memory', id: 'legacy', value: { id: 'legacy', ownerAgentId: 'researcher', scope: 'conversation', conversationId: conversation.id, content: '旧会话明确资料', origin: 'user', version: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), sourceMessageIds: [], sourceResourceIds: [] } }])
  } finally { await store.close() }
  await runtime.reviewData('旧记忆写入并关闭后的实际员工', { expectedIds, actualIds: ids() })
  expect(ids()).toEqual(expectedIds)
  await runtime.start()
  const reopened = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  await runtime.reviewData('旧记忆写入后重启的实际运行快照', { expectedIds, actualIds: reopened.agents.map(agent => agent.id).sort(), errors: runtime.errors })
  expect(reopened.agents.map(agent => agent.id).sort()).toEqual(expectedIds)
  await pageReady(runtime)
  const page = runtime.page, pane = page.getByRole('tabpanel', { name: '记忆' }), card = pane.getByRole('article').filter({ hasText: '旧会话明确资料' })
  await expect(card).toContainText('仅此聊天'); await card.getByRole('button', { name: '编辑', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑记忆', exact: true })
  await editor.getByRole('combobox', { name: '使用范围', exact: true }).click(); await page.getByRole('option', { name: '相关聊天可用', exact: true }).click()
  await expect(editor.getByRole('button', { name: '保存记忆', exact: true })).toBeDisabled()
  await editor.getByRole('checkbox').check(); await editor.getByRole('button', { name: '保存记忆', exact: true }).click()
  await expect(editor).toBeHidden(); await expect(card).toContainText('相关聊天可用')
  await pane.getByRole('combobox', { name: '来源聊天', exact: true }).click(); await page.getByRole('option', { name: '旧来源', exact: true }).click()
  await pane.getByRole('combobox', { name: '此来源聊天的新交流', exact: true }).click(); await page.getByRole('option', { name: '仅在此聊天使用', exact: true }).click()
  await expect(card).toContainText('仅此聊天')
  await runtime.restart(); await pageReady(runtime)
  await expect(runtime.page.getByRole('tabpanel', { name: '记忆' }).getByRole('article').filter({ hasText: '旧会话明确资料' })).toContainText('仅此聊天')
  await runtime.reviewData('原记忆来源收紧与重启实际记录', await runtime.page.evaluate(() => window.boai.request('getMemory', { agentId: 'researcher', scope: 'employee' })))
  await runtime.reviewCheckpoint('原旧记忆显式升级后来源收紧且重启保持')
  expect(runtime.errors).toEqual([])
})
