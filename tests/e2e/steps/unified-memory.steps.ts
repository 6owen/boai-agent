/*
 * [INPUT]: 真实 Electron/Mastra、回环协议服务器、员工 Working Memory 与来源设置。
 * [OUTPUT]: 编辑/重启/版本冲突草稿/来源收紧/清空验收；旧记录迁移由 bobo-conversation-memory 独立回归。
 * [POS]: 当前 API 员工记忆管理验收；不调用外部模型，不认证语义记忆质量。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { createServer } from 'node:http'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
export const test = base.extend<{ memoryState: { conversationId: string; calls: number } }>({ memoryState: async ({}, use) => use({ conversationId: '', calls: 0 }) })
const { Given, When, Then } = createBdd(test)
const query = { agentId: 'researcher', scope: 'employee' as const }
async function pageReady(runtime: Desktop) {
  const page = runtime.page; await expect(page.locator('.app-shell')).toBeVisible()
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await page.getByRole('button', { name: '高级配置', exact: true }).click()
  await page.getByRole('dialog', { name: '高级配置', exact: true }).getByRole('tab', { name: '记忆', exact: true }).click()
}
Given('在隔离桌面打开员工统一记忆', async ({ runtime, memoryState: state }) => {
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw), system = JSON.stringify(body.messages.filter((m: { role: string }) => m.role === 'system'))
    state.calls++
    const content = system.includes('Private participation decision') ? JSON.stringify({ action: 'reply', responseKind: 'chat' }) : '收到。'
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.end(`data: ${JSON.stringify({ id: 'memory-ui', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta: { role: 'assistant', content }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`)
  })
  runtime.trackServer(server); await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  await runtime.start(); await pageReady(runtime)
  await expect(runtime.page.getByText('开始 API 对话后，将在这里显示员工记忆。', { exact: true })).toBeVisible()
  const port = (server.address() as { port: number }).port
  state.conversationId = await runtime.page.evaluate(async port => {
    const connection = await window.boai.request('saveConnection', { name: '记忆回环协议', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${port}/v1`, defaultModel: 'fixture' })
    const agent = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
    await window.boai.request('saveAgent', { ...input, connectionId: connection.id, modelId: 'fixture', expectedConfigVersion: configVersion })
    const room = await window.boai.request('createConversation', { kind: 'direct', title: '记忆来源', agentIds: ['researcher'] })
    await window.boai.request('sendMessage', { conversationId: room.id, content: '本次验收只使用回环协议。', mentionIds: [], requestId: crypto.randomUUID() })
    return room.id
  }, port)
  await expect.poll(async () => {
    const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.conversationId)
    return detail.runs.length > 0 && detail.runs.every(run => run.status === 'completed')
  }).toBe(true)
  await runtime.page.getByRole('tabpanel', { name: '记忆' }).getByRole('button', { name: '刷新', exact: true }).click()
  await expect(runtime.page.getByRole('tabpanel', { name: '记忆' }).getByRole('button', { name: '编辑', exact: true })).toBeVisible()
})
When('编辑员工 Working Memory 并重启保留', async ({ runtime, memoryState: state }) => {
  const page = runtime.page, pane = page.getByRole('tabpanel', { name: '记忆' })
  await pane.getByRole('button', { name: '编辑', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑 Working Memory', exact: true })
  await editor.getByRole('textbox', { name: 'Working Memory', exact: true }).fill('中文海报偏好 UI_CANARY')
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(editor).toBeHidden()
  await expect(pane.getByText('中文海报偏好 UI_CANARY', { exact: true })).toBeVisible()
  const before = await page.evaluate(query => window.boai.request('getMemory', query), query), calls = state.calls
  await runtime.restart(); await pageReady(runtime)
  await expect(runtime.page.getByText('中文海报偏好 UI_CANARY', { exact: true })).toBeVisible()
  expect((await runtime.page.evaluate(query => window.boai.request('getMemory', query), query)).managed).toEqual(before.managed)
  expect(state.calls).toBe(calls)
})
Then('记忆编辑版本冲突保留草稿并可核对', async ({ runtime }) => {
  const page = runtime.page, pane = page.getByRole('tabpanel', { name: '记忆' })
  await pane.getByRole('button', { name: '编辑', exact: true }).click()
  const editor = page.getByRole('dialog', { name: '编辑 Working Memory', exact: true })
  await editor.getByRole('textbox', { name: 'Working Memory', exact: true }).fill('不能丢失的草稿')
  await page.evaluate(async query => {
    const view = await window.boai.request('getMemory', query), document = view.managed!.documents[0]!
    await window.boai.request('saveMemory', { ...query, content: '另一窗口已保存', expectedEpoch: view.epoch, managed: { resourceId: document.resourceId, expectedVersion: document.version } })
  }, query)
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.locator('[data-sonner-toast][data-type="error"]').filter({ hasText: /变更|变化|过期/ })).toBeVisible()
  await expect(editor.getByRole('textbox', { name: 'Working Memory', exact: true })).toHaveValue('不能丢失的草稿')
  await runtime.reviewCheckpoint('Working Memory真实版本冲突保留草稿')
  await editor.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('alertdialog').getByRole('button', { name: '退出', exact: true }).click()
  await pane.getByRole('button', { name: '刷新', exact: true }).click()
  await expect(pane.getByText('另一窗口已保存', { exact: true })).toBeVisible()
})
Then('来源聊天限制和清空记忆持久化', async ({ runtime, memoryState: state }) => {
  const page = runtime.page, pane = page.getByRole('tabpanel', { name: '记忆' })
  const room = await page.evaluate(id => window.boai.request('getConversation', { id }), state.conversationId)
  await pane.getByRole('combobox', { name: '来源聊天', exact: true }).click()
  await page.getByRole('option', { name: room.conversation.title, exact: true }).click()
  await pane.getByRole('combobox', { name: '此来源聊天的新交流', exact: true }).click()
  await page.getByRole('option', { name: '仅在此聊天使用', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getConversation', { id }), state.conversationId)).conversation.memoryScope).toBe('conversation')
  await runtime.restart(); await pageReady(runtime)
  expect((await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.conversationId)).conversation.memoryScope).toBe('conversation')
  // Restricting a source invalidates its former shared memory immediately.
  const restricted = await runtime.page.evaluate(query => window.boai.request('getMemory', query), query)
  expect(JSON.stringify(restricted.managed)).not.toContain('另一窗口已保存')
  const roomMessages = (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.conversationId)).messages
  await runtime.page.getByRole('tabpanel', { name: '记忆' }).getByRole('button', { name: '清空记忆', exact: true }).click()
  const clearing = runtime.page.getByRole('dialog', { name: '清空员工记忆', exact: true })
  await clearing.getByRole('button', { name: '清空', exact: true }).click()
  await expect(clearing).toBeHidden()
  await runtime.restart(); await pageReady(runtime)
  expect(JSON.stringify((await runtime.page.evaluate(query => window.boai.request('getMemory', query), query)).managed)).not.toContain('UI_CANARY')
  expect((await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), state.conversationId)).messages).toEqual(roomMessages)
  await runtime.reviewData('来源收紧与清空后记忆', await runtime.page.evaluate(query => window.boai.request('getMemory', query), query))
  expect(runtime.errors).toEqual([])
})
