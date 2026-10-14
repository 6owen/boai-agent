/*
 * [OUTPUT]: 2026-10-14 实际表单/列表/归一时间线、本地模型协议及重启核对；平台历史为隔离预置夹具。
 * [INPUT]: 实际Electron表单、vault/SQLite和既有BDD生命周期。
 * [OUTPUT]: 保存成功但响应失联的产品界面、只读核对、区域隔离及未保存守卫；平台通信未运行。
 * [POS]: 第16组桌面验收步骤。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from '../support/test'
import { prepareGroupChat } from '../support/group-chat'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import { join } from 'node:path'
import type { Conversation, Message } from '../../../src/shared/domain'
import { sortedConversations } from '../../../src/shared/domain/conversation-list'
const { Given, When, Then } = createBdd(test)

Given('已有研究员主私聊和独立飞书私聊群聊历史', async ({ runtime }) => {
  const setup = await prepareGroupChat(runtime, { emulateViewport: false })
  const binding = await runtime.page.evaluate(() => window.boai.request('saveChannelBinding', { agentId: 'researcher', platform: 'feishu', appId: 'room-fixture-bot', name: '研究员飞书', credential: 'isolated-room-fixture-secret', allowedUserIds: ['ou_room_owner'], allowedChatIds: ['oc_room_a', 'oc_room_b'], requestId: 'room-fixture-binding' }))
  await runtime.close()
  const source = { platform: 'feishu' as const, tenantId: 'fixture-tenant', chatId: 'oc_room_private', kind: 'direct' as const, bindingId: binding.id, userId: 'ou_room_owner' }
  const privateRoom: Conversation = { ...setup.direct, id: 'legacy-feishu-private', mainPrivate: undefined, purpose: 'channel', channel: source, title: '飞书 · 研究员', workspacePath: join(setup.dataPath, 'workspaces', 'legacy-feishu-private'), createdAt: '2026-10-13T00:00:00.000Z' }
  const message: Message = { id: 'legacy-feishu-owner-message', conversationId: privateRoom.id, senderType: 'user', senderId: 'channel-user:fixture-owner', senderName: '外部本人', content: '手机飞书私聊的历史消息', status: 'completed', sequence: 1, createdAt: '2026-10-13T01:00:00.000Z', channel: { ...source, eventId: 'fixture-history-event', replyThreadId: 'lark:oc_room_private:fixture-history-event' } }
  const groups: Conversation[] = ['a', 'b'].map(suffix => ({ ...setup.group, id: `feishu-group-${suffix}`, agentIds: ['researcher'], title: `研发${suffix.toUpperCase()}群 · 飞书`, purpose: 'channel', channel: { platform: 'feishu', tenantId: 'fixture-tenant', chatId: `oc_room_${suffix}`, kind: 'group' }, workspacePath: join(setup.dataPath, 'workspaces', `feishu-group-${suffix}`) }))
  const store = new ProductStore(join(setup.dataPath, 'boai.sqlite')); await store.init()
  try { await store.write([{ collection: 'conversations', id: privateRoom.id, value: privateRoom }, { collection: 'messages', id: message.id, value: message }, ...groups.map(value => ({ collection: 'conversations', id: value.id, value }))]) } finally { await store.close() }
  await runtime.start()
  await runtime.page.getByRole('button', { name: '飞书 · 研究员', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await runtime.page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await runtime.page.getByRole('tab', { name: '渠道', exact: true }).click()
  await runtime.reviewCheckpoint('归一前-独立平台私聊与本人关联表单')
})
When('在渠道表单明确关联本人的飞书账号', async ({ runtime }) => {
  const pane = runtime.page.getByRole('tabpanel', { name: '渠道', exact: true })
  await pane.getByRole('button', { name: '编辑绑定', exact: true }).click()
  await pane.getByRole('textbox', { name: '本人用户 ID', exact: true }).fill('ou_room_owner')
  await pane.getByRole('button', { name: '保存绑定', exact: true }).click()
  await expect(pane).toContainText('本人账号：ou_room_owner')
  await runtime.reviewCheckpoint('本人账号明确关联-历史归一已提交')
})
Then('研究员只显示一个私聊入口并保留两个群及同一时间线', async ({ runtime }) => {
  const data = await runtime.page.evaluate(async () => {
    const snapshot = await window.boai.request('snapshot', undefined)
    const main = await window.boai.request('createConversation', { kind: 'direct', title: '研究员', agentIds: ['researcher'] })
    return { snapshot, main, detail: await window.boai.request('getConversation', { id: main.id }), legacy: await window.boai.request('getConversation', { id: 'legacy-feishu-private' }) }
  })
  const visible = sortedConversations(data.snapshot.conversations)
  expect(visible.filter(room => room.kind === 'direct' && room.agentIds[0] === 'researcher')).toHaveLength(1)
  expect(visible.filter(room => room.id.startsWith('feishu-group-'))).toHaveLength(2)
  expect(data.detail.messages.map(message => message.content)).toContain('手机飞书私聊的历史消息')
  expect(data.detail.messages.map(message => message.content)).toContain('单聊历史中也要保留头像、发言人与正文。')
  expect(data.legacy.conversation.id).toBe(data.main.id)
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await expect(runtime.page.getByRole('navigation', { name: '会话列表' }).getByRole('button', { name: '研究员', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(runtime.page.getByText('手机飞书私聊的历史消息', { exact: true })).toBeVisible()
  await expect(runtime.page.getByRole('button', { name: /研发A群/ })).toBeVisible()
  await expect(runtime.page.getByRole('button', { name: /研发B群/ })).toBeVisible()
  await runtime.reviewData('房间与历史-隔离夹具明确来源', data)
  await runtime.reviewCheckpoint('一个员工主私聊-两个独立飞书群-同一时间线')
})
Then('本地新消息沿主私聊执行且重启不重放', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('textbox', { name: '消息内容' }).fill('单聊统一交互验收')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.getByText('研究员：单聊和群聊保持一致，可以查看我的资料、回应消息、引用、复制和查看执行过程。', { exact: true })).toBeVisible()
  const read = () => runtime.page.evaluate(async () => {
    const main = (await window.boai.request('snapshot', undefined)).conversations.find(room => room.mainPrivate && room.agentIds[0] === 'researcher')!
    return window.boai.request('getConversation', { id: main.id })
  })
  const before = await read()
  expect(before.messages.filter(message => message.content === '单聊统一交互验收')).toHaveLength(1)
  await runtime.reviewCheckpoint('归一主私聊-真实本地模型协议回复')
  await runtime.restart()
  const after = await read()
  expect(after.messages.map(message => message.id)).toEqual(before.messages.map(message => message.id))
  expect(after.runs.map(run => run.id)).toEqual(before.runs.map(run => run.id))
  await runtime.reviewData('重启消息与执行ID零增量', { before, after })
  await runtime.reviewCheckpoint('重启后-同主私聊历史保持')
})

When('打开员工渠道并模拟保存响应失联', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('tab', { name: '渠道', exact: true }).click()
  const pane = page.getByRole('tabpanel', { name: '渠道', exact: true })
  await expect(pane).toContainText('员工渠道')
  await pane.getByRole('textbox', { name: 'App ID', exact: true }).fill('fixture-feishu-app')
  await pane.getByLabel('App Secret', { exact: true }).fill('channel-ui-fixture-secret')
  await pane.getByRole('textbox', { name: '授权用户 ID', exact: true }).fill('ou_fixture_owner')
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = Reflect.get(ipcMain, '_invokeHandlers') as Map<string, (event: Electron.IpcMainInvokeEvent, payload: { method: string; input: unknown }) => Promise<unknown>>
    const original = handlers.get('boai:request')!
    let lose = true
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      const result = await original(event, payload)
      if (payload.method === 'saveChannelBinding' && lose) { lose = false; throw new Error('夹具：保存已提交，响应失联') }
      return result
    })
  })
  await pane.getByRole('button', { name: '添加绑定', exact: true }).click()
  await expect(pane).toContainText('原请求和草稿已保留')
  await expect(pane.getByLabel('App Secret', { exact: true })).toBeDisabled()
  await runtime.reviewCheckpoint('渠道保存响应失联-冻结原请求')
})
Then('核对原渠道保存回执后只有一份飞书绑定', async ({ runtime }) => {
  const page = runtime.page, pane = page.getByRole('tabpanel', { name: '渠道', exact: true })
  await pane.getByRole('button', { name: '核对保存结果', exact: true }).click()
  await expect(pane).toContainText('渠道绑定已保存')
  await expect(pane.getByLabel('App Secret', { exact: true })).toHaveValue('')
  const values = await page.evaluate(async () => ({ bindings: await window.boai.request('listChannelBindings', { agentId: 'researcher' }), snapshot: await window.boai.request('snapshot', undefined) }))
  expect(values.bindings).toHaveLength(1); expect(values.bindings[0]).toMatchObject({ platform: 'feishu', appId: 'fixture-feishu-app', enabled: false, hasCredential: true })
  expect(JSON.stringify(values)).not.toContain('channel-ui-fixture-secret')
  await runtime.reviewCheckpoint('员工飞书绑定-真实本地保存')
})
Then('Lark独立配置且渠道草稿受原未保存守卫保护', async ({ runtime }) => {
  const page = runtime.page, pane = page.getByRole('tabpanel', { name: '渠道', exact: true })
  await pane.getByRole('combobox', { name: '平台', exact: true }).click()
  await page.getByRole('option', { name: 'Lark', exact: true }).click()
  await pane.getByRole('textbox', { name: 'App ID', exact: true }).fill('fixture-lark-app')
  await pane.getByLabel('App Secret', { exact: true }).fill('lark-ui-fixture-secret')
  await pane.getByRole('textbox', { name: '授权用户 ID', exact: true }).fill('ou_fixture_owner')
  await pane.getByRole('button', { name: '添加绑定', exact: true }).click()
  await expect(pane).toContainText('fixture-lark-app')
  const bindings = await page.evaluate(() => window.boai.request('listChannelBindings', { agentId: 'researcher' }))
  expect(bindings.map(binding => binding.platform)).toEqual(['feishu', 'lark'])
  expect(bindings.every(binding => !binding.enabled)).toBe(true)
  await pane.getByRole('textbox', { name: '绑定名称', exact: true }).fill('尚未保存的渠道')
  await page.getByRole('tab', { name: '系统文件', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(pane.getByRole('textbox', { name: '绑定名称', exact: true })).toHaveValue('尚未保存的渠道')
  await page.getByRole('tab', { name: '系统文件', exact: true }).click()
  await page.getByRole('button', { name: '放弃并退出', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '系统文件', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '渠道', exact: true }).click()
  await expect(pane.getByRole('textbox', { name: '绑定名称', exact: true })).not.toHaveValue('尚未保存的渠道')
  await expect(page.getByRole('tab', { name: '渠道', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.evaluate(() => { for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish() })
  await runtime.reviewCheckpoint('飞书与Lark独立配置-草稿保护')
})
