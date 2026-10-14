/*
 * [OUTPUT]: 2026-10-14现行分离合同：独立员工渠道页面、返回/私聊群筛选/真实阅读提示、搜索和历史任务固定定位；实际pnpm dev与GC/资源观察。
 * [OUTPUT]: 独立渠道列表/只读来源、内部群配置、单绑定/草稿守卫、43次详情循环及120秒资源观察。
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
import type { Conversation, Message, WorkItem } from '../../../src/shared/domain'
import { mainConversations, channelConversations } from '../../../src/shared/domain/conversation-list'
import { resourceSample, verifyResources } from '../support/background-resources'
const { Given, When, Then } = createBdd(test)

Then('新回复提示进入员工渠道且实际阅读后消失', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await page.evaluate(() => window.boai.request('sendMessage', { conversationId: 'feishu-group-a', content: '单聊统一交互验收', mentionIds: [], requestId: 'channel-notice-message' }))
  const notice = page.getByRole('button', { name: '研究员的渠道有1条新回复', exact: true })
  await expect(notice).toBeVisible()
  await expect(page.getByText('研究员：单聊和群聊保持一致，可以查看我的资料、回应消息、引用、复制和查看执行过程。', { exact: true })).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('员工主列表-渠道新回复提示')
  await notice.click()
  await expect(page.getByRole('heading', { name: '研究员的渠道', exact: true })).toBeVisible()
  await expect(page.getByText('研究员：单聊和群聊保持一致，可以查看我的资料、回应消息、引用、复制和查看执行过程。', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(async () => (await window.boai.request('snapshot', undefined)).conversations.find(room => room.id === 'feishu-group-a')?.channelUnreadCount)).toBe(0)
  await page.getByRole('button', { name: '返回员工主聊天', exact: true }).click()
  await expect(notice).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('渠道真实可见阅读-返回主聊天提示消失')
})

Then('渠道私聊群筛选及搜索任务定位进入正确页面', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '打开员工渠道会话', exact: true }).click()
  await page.getByRole('tab', { name: '私聊', exact: true }).click()
  await expect(page.getByRole('group', { name: '渠道会话', exact: true }).getByRole('button', { name: /研发A群|研发B群/ })).toHaveCount(0)
  await expect(page.getByText('手机飞书私聊的历史消息', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '群聊', exact: true }).click()
  await expect(page.getByRole('group', { name: '渠道会话', exact: true }).getByRole('button', { name: '飞书 · 研究员', exact: true })).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('员工渠道页面-群聊筛选')
  await page.getByRole('button', { name: '返回员工主聊天', exact: true }).click()
  await page.getByRole('button', { name: '搜索会话内容', exact: true }).click()
  const search = page.getByRole('dialog', { name: '搜索会话内容', exact: true })
  await search.getByRole('textbox', { name: '搜索关键词', exact: true }).fill('手机飞书私聊的历史消息')
  await search.locator('[data-search-kind="message"][data-search-result-id="legacy-feishu-owner-message"]').click()
  await expect(page.getByRole('heading', { name: '研究员的渠道', exact: true })).toBeVisible()
  await expect(page.getByText('手机飞书私聊的历史消息', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '群聊', exact: true }).click()
  await page.getByRole('textbox', { name: '搜索会话', exact: true }).fill('研发')
  await page.getByRole('button', { name: '搜索会话内容', exact: true }).click()
  await search.getByRole('textbox', { name: '搜索关键词', exact: true }).fill('手机飞书私聊的历史消息')
  await search.locator('[data-search-kind="message"][data-search-result-id="legacy-feishu-owner-message"]').click()
  await expect(page.getByRole('tab', { name: '私聊', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('textbox', { name: '搜索会话', exact: true })).toHaveValue('')
  await expect(page.getByRole('group', { name: '渠道会话', exact: true }).getByRole('button', { name: '飞书 · 研究员', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.getByRole('tab', { name: '群聊', exact: true }).click()
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '任务', exact: true }).click()
  const card = page.locator('[data-work-id="channel-history-work"]')
  await card.scrollIntoViewIfNeeded()
  await card.getByRole('button', { name: '查看原聊天', exact: true }).click()
  await expect(page.getByRole('heading', { name: '研究员的渠道', exact: true })).toBeVisible()
  await expect(page.getByText('手机飞书私聊的历史消息', { exact: true })).toBeVisible()
  await expect(page.getByRole('tab', { name: '私聊', exact: true })).toHaveAttribute('aria-selected', 'true')
  await runtime.reviewNativeCheckpoint('搜索和历史任务-固定渠道来源导航')
})

Then('渠道详情反复打开和本地处理后的空闲资源保持有界', async ({ runtime }) => {
  test.setTimeout(420_000)
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('button', { name: '打开员工渠道会话', exact: true }).click()
  await page.getByRole('group', { name: '渠道会话', exact: true }).getByRole('button', { name: '研发A群 · 飞书', exact: true }).click()
  const cycle = async () => {
    await page.getByRole('button', { name: '会话操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '渠道信息', exact: true }).click()
    await expect(page.locator('.detail-section[aria-label="渠道信息"]')).toBeVisible()
    await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  }
  const message = async (index: number) => {
    await page.evaluate(index => window.boai.request('sendMessage', { conversationId: 'feishu-group-a', content: '单聊统一交互验收', mentionIds: [], requestId: `channel-resource-${index}` }), index)
    await expect.poll(() => page.evaluate(async () => (await window.boai.request('getConversation', { id: 'feishu-group-a' })).messages.filter(message => message.senderType === 'agent' && message.status === 'completed').length)).toBe(index + 1)
  }
  const cdp = await page.context().newCDPSession(page)
  let samplingError: unknown
  try {
    for (let index = 0; index < 3; index++) await cycle()
    await message(0)
    const samples = [await resourceSample(runtime, cdp)]
    for (let batch = 0; batch < 4; batch++) {
      for (let index = 0; index < 10; index++) await cycle()
      await message(batch + 1)
      samples.push(await resourceSample(runtime, cdp))
    }
    await runtime.reviewData('渠道循环压力采样', { detailCycles: 43, messages: 5, samples })
    const deadline = Date.now() + 120_000
    while (Date.now() < deadline) {
      await page.waitForTimeout(Math.min(15_000, deadline - Date.now()))
      samples.push(await resourceSample(runtime, cdp))
      await runtime.reviewData('渠道空闲资源采样', samples.at(-1))
    }
    await runtime.reviewData('渠道资源验收结果', { samples, budgets: { postGcMainAndRendererGrowthMb: 16, perProcessResidentGrowthMb: 64, idleCpuMedianPercent: 5 }, longTermCertified: false })
    verifyResources(samples)
    expect(runtime.errors).toEqual([])
    await runtime.reviewNativeCheckpoint('渠道压力与两分钟空闲后窗口可用')
  } catch (error) {
    samplingError = error
    await runtime.reviewData('渠道资源采样失败原始原因', { error: String(error), pageClosed: page.isClosed(), processExitCode: runtime.app.process().exitCode, processSignal: runtime.app.process().signalCode })
    throw error
  } finally {
    try { await cdp.detach() } catch (error) {
      if (!samplingError) throw error
      await runtime.reviewData('采样失败后的CDP退出错误', { error: String(error) })
    }
  }
})

Then('外部群单列渠道会话并显示只读来源信息', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await expect(page.getByRole('group', { name: '渠道会话', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '打开员工渠道会话', exact: true }).click()
  const channelList = page.getByRole('group', { name: '渠道会话', exact: true })
  await expect(channelList.getByRole('button', { name: '研发A群 · 飞书', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: '普通会话', exact: true }).getByRole('button', { name: /研发A群/ })).toHaveCount(0)
  await channelList.getByRole('button', { name: '研发A群 · 飞书', exact: true }).click()
  await expect(page.locator('.chat-header').getByLabel('接入员工')).toBeVisible()
  await expect(page.locator('.chat-header').getByLabel('群聊成员')).toHaveCount(0)
  await page.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '渠道信息', exact: true }).click()
  const info = page.locator('.detail-section[aria-label="渠道信息"]')
  await expect(info).toContainText('oc_room_a')
  await expect(info).toContainText('研究员')
  await expect(info.getByRole('textbox')).toHaveCount(0)
  await expect(info.getByRole('button', { name: /添加|解散|保存/ })).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('渠道会话-单独列表与只读来源信息')
})

Then('BOAI群仍有成员配置而外部群不在通讯录群聊中', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  const groups = page.getByRole('complementary', { name: '通讯录列表' }).getByRole('group', { name: '群聊', exact: true })
  await expect(groups.getByRole('button', { name: /研发A群|研发B群/ })).toHaveCount(0)
  await groups.getByRole('button', { name: '产品讨论组', exact: true }).click()
  await expect(page.getByRole('heading', { name: '群成员 3', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '群聊名称', exact: true })).toHaveValue('产品讨论组')
  await runtime.reviewNativeCheckpoint('BOAI内部群-独立多员工配置')
})

Then('渠道本地消息沿单员工执行且重启保留原房间', async ({ runtime }) => {
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('button', { name: '与研究员对话', exact: true }).click()
  await runtime.page.getByRole('button', { name: '打开员工渠道会话', exact: true }).click()
  await runtime.page.getByRole('group', { name: '渠道会话', exact: true }).getByRole('button', { name: '研发A群 · 飞书', exact: true }).click()
  await expect(runtime.page.getByRole('textbox', { name: '消息内容' })).toHaveAttribute('data-placeholder', /本地交流/)
  await runtime.page.getByRole('textbox', { name: '消息内容' }).fill('单聊统一交互验收')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(runtime.page.getByText('研究员：单聊和群聊保持一致，可以查看我的资料、回应消息、引用、复制和查看执行过程。', { exact: true })).toBeVisible()
  const read = () => runtime.page.evaluate(() => window.boai.request('getConversation', { id: 'feishu-group-a' }))
  const before = await read()
  expect(before.conversation.agentIds).toEqual(['researcher'])
  expect(before.messages.filter(message => message.senderType === 'user').every(message => !message.channel)).toBe(true)
  await runtime.reviewNativeCheckpoint('渠道会话-本地输入与单员工回复')
  await runtime.restart()
  const after = await read()
  expect(after.conversation.id).toBe(before.conversation.id)
  expect(after.messages.map(message => message.id)).toEqual(before.messages.map(message => message.id))
  expect(after.runs.map(run => run.id)).toEqual(before.runs.map(run => run.id))
  await runtime.reviewData('渠道本地处理与重启-隔离平台预置模型协议', { before, after })
})

Then('从员工联系人发消息只打开本人主私聊', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '写手', exact: true }).click()
  await page.getByRole('button', { name: '发消息', exact: true }).click()
  await expect(page.getByRole('group', { name: '普通会话', exact: true }).getByRole('button', { name: '写手', exact: true })).toHaveAttribute('aria-current', 'page')
  const rooms = await page.evaluate(async () => (await window.boai.request('snapshot', undefined)).conversations.filter(room => room.kind === 'direct' && room.agentIds[0] === 'writer'))
  expect(rooms.filter(room => room.mainPrivate && !room.channel)).toHaveLength(1)
  expect(rooms.find(room => room.id === 'writer-external-private')?.mainPrivate).toBeFalsy()
  await runtime.reviewData('从员工开聊不误选外部联系人', rooms)
})

Given('已有研究员主私聊和独立飞书私聊群聊历史', async ({ runtime }) => {
  const setup = await prepareGroupChat(runtime, { emulateViewport: false })
  const binding = await runtime.page.evaluate(() => window.boai.request('saveChannelBinding', { agentId: 'researcher', platform: 'feishu', appId: 'room-fixture-bot', name: '研究员飞书', credential: 'isolated-room-fixture-secret', allowedUserIds: ['ou_room_owner'], allowedChatIds: ['oc_room_a', 'oc_room_b'], requestId: 'room-fixture-binding' }))
  await runtime.close()
  const source = { platform: 'feishu' as const, tenantId: 'fixture-tenant', chatId: 'oc_room_private', kind: 'direct' as const, bindingId: binding.id, userId: 'ou_room_owner' }
  const privateRoom: Conversation = { ...setup.direct, id: 'legacy-feishu-private', mainPrivate: undefined, purpose: 'channel', channel: source, title: '飞书 · 研究员', workspacePath: join(setup.dataPath, 'workspaces', 'legacy-feishu-private'), createdAt: '2026-10-13T00:00:00.000Z' }
  const message: Message = { id: 'legacy-feishu-owner-message', conversationId: privateRoom.id, senderType: 'user', senderId: 'channel-user:fixture-owner', senderName: '外部本人', content: '手机飞书私聊的历史消息', status: 'completed', sequence: 1, createdAt: '2026-10-13T01:00:00.000Z', channel: { ...source, eventId: 'fixture-history-event', replyThreadId: 'lark:oc_room_private:fixture-history-event' } }
  const groups: Conversation[] = ['a', 'b'].map(suffix => ({ ...setup.group, id: `feishu-group-${suffix}`, agentIds: ['researcher'], title: `研发${suffix.toUpperCase()}群 · 飞书`, purpose: 'channel', channel: { platform: 'feishu', tenantId: 'fixture-tenant', chatId: `oc_room_${suffix}`, kind: 'group' }, workspacePath: join(setup.dataPath, 'workspaces', `feishu-group-${suffix}`) }))
  const writerPrivate: Conversation = { ...privateRoom, id: 'writer-external-private', title: '飞书外部联系人', agentIds: ['writer'], workspacePath: join(setup.dataPath, 'workspaces', 'writer-external-private'), channel: { ...source, bindingId: 'legacy-writer-bot', userId: 'external-colleague' } }
  const historyWork: WorkItem = { schemaVersion: 2, id: 'channel-history-work', conversationId: privateRoom.id, sourceMessageId: message.id, key: 'channel-history-work', scope: '渠道历史任务定位', deliverable: '渠道历史任务定位', ownerAgentId: 'researcher', version: 1, status: 'cancelled', budgetId: 'channel-history-budget', rootWorkId: 'channel-history-work', dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: [], artifactIds: [], resultVersion: 0, requiresReview: false, createdAt: message.createdAt, updatedAt: message.createdAt }
  const store = new ProductStore(join(setup.dataPath, 'boai.sqlite')); await store.init()
  try { await store.write([{ collection: 'conversations', id: privateRoom.id, value: privateRoom }, { collection: 'conversations', id: writerPrivate.id, value: writerPrivate }, { collection: 'messages', id: message.id, value: message }, { collection: 'workItems', id: historyWork.id, value: historyWork }, ...groups.map(value => ({ collection: 'conversations', id: value.id, value }))]) } finally { await store.close() }
  await runtime.start()
  await runtime.page.getByRole('button', { name: '与研究员对话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await runtime.page.getByRole('button', { name: '编辑配置', exact: true }).click()
  await runtime.page.getByRole('tab', { name: '渠道', exact: true }).click()
  await runtime.reviewCheckpoint('分离历史-本人平台标识表单')
})
When('在渠道表单明确关联本人的飞书账号', async ({ runtime }) => {
  const pane = runtime.page.getByRole('tabpanel', { name: '渠道', exact: true })
  await pane.getByRole('button', { name: '编辑绑定', exact: true }).click()
  await pane.getByRole('textbox', { name: '本人用户 ID', exact: true }).fill('ou_room_owner')
  await pane.getByRole('button', { name: '保存绑定', exact: true }).click()
  await expect(pane).toContainText('本人账号：ou_room_owner')
  await runtime.reviewCheckpoint('本人标识保存-历史原位保留')
})
Then('研究员主列表一个入口且渠道页保留独立私聊和两个群', async ({ runtime }) => {
  const data = await runtime.page.evaluate(async () => {
    const snapshot = await window.boai.request('snapshot', undefined)
    const main = await window.boai.request('createConversation', { kind: 'direct', title: '研究员', agentIds: ['researcher'] })
    return { snapshot, main, detail: await window.boai.request('getConversation', { id: main.id }), legacy: await window.boai.request('getConversation', { id: 'legacy-feishu-private' }) }
  })
  const visible = mainConversations(data.snapshot.conversations)
  expect(visible.filter(room => room.kind === 'direct' && room.agentIds[0] === 'researcher')).toHaveLength(1)
  expect(visible.filter(room => room.id.startsWith('feishu-group-'))).toHaveLength(0)
  expect(channelConversations(data.snapshot.conversations, 'researcher')).toHaveLength(3)
  expect(data.detail.messages.map(message => message.content)).not.toContain('手机飞书私聊的历史消息')
  expect(data.legacy.messages.map(message => message.content)).toContain('手机飞书私聊的历史消息')
  expect(data.detail.messages.map(message => message.content)).toContain('单聊历史中也要保留头像、发言人与正文。')
  expect(data.legacy.conversation.id).toBe('legacy-feishu-private')
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await expect(runtime.page.getByRole('navigation', { name: '会话列表' }).getByRole('button', { name: '与研究员对话', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(runtime.page.getByText('手机飞书私聊的历史消息', { exact: true })).toHaveCount(0)
  await runtime.page.getByRole('button', { name: '打开员工渠道会话', exact: true }).click()
  await runtime.page.getByRole('group', { name: '渠道会话', exact: true }).getByRole('button', { name: '飞书 · 研究员', exact: true }).click()
  await expect(runtime.page.getByText('手机飞书私聊的历史消息', { exact: true })).toBeVisible()
  await runtime.page.getByRole('button', { name: '返回员工主聊天', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: /研发A群/ })).toHaveCount(0)
  await expect(runtime.page.getByRole('button', { name: /研发B群/ })).toHaveCount(0)
  await runtime.reviewData('房间与历史-隔离夹具明确来源', data)
  await runtime.reviewCheckpoint('一个员工BOAI入口-渠道私聊与群独立')
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
  await runtime.reviewCheckpoint('BOAI主私聊-真实本地模型协议回复')
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
  await expect(pane.getByRole('button', { name: '添加绑定', exact: true })).toHaveCount(0)
  const values = await page.evaluate(async () => ({ bindings: await window.boai.request('listChannelBindings', { agentId: 'researcher' }), snapshot: await window.boai.request('snapshot', undefined) }))
  expect(values.bindings).toHaveLength(1); expect(values.bindings[0]).toMatchObject({ platform: 'feishu', appId: 'fixture-feishu-app', enabled: false, hasCredential: true })
  expect(JSON.stringify(values)).not.toContain('channel-ui-fixture-secret')
  await runtime.reviewCheckpoint('员工飞书绑定-真实本地保存')
})
Then('员工已有绑定时不能新增渠道且编辑草稿受原未保存守卫保护', async ({ runtime }) => {
  const page = runtime.page, pane = page.getByRole('tabpanel', { name: '渠道', exact: true })
  await expect(pane.getByRole('button', { name: '添加绑定', exact: true })).toHaveCount(0)
  await pane.getByRole('button', { name: '编辑绑定', exact: true }).click()
  await expect(pane.getByLabel('App Secret', { exact: true })).toHaveValue('')
  await expect(pane.getByRole('combobox', { name: '平台', exact: true })).toBeDisabled()
  await pane.getByRole('textbox', { name: '绑定名称', exact: true }).fill('尚未保存的渠道')
  await page.getByRole('tab', { name: '系统文件', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(pane.getByRole('textbox', { name: '绑定名称', exact: true })).toHaveValue('尚未保存的渠道')
  await page.getByRole('tab', { name: '系统文件', exact: true }).click()
  await page.getByRole('button', { name: '放弃并退出', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '系统文件', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '渠道', exact: true }).click()
  await expect(pane.getByRole('textbox', { name: '绑定名称', exact: true })).toHaveCount(0)
  await pane.getByRole('button', { name: '编辑绑定', exact: true }).click()
  await expect(pane.getByRole('textbox', { name: '绑定名称', exact: true })).not.toHaveValue('尚未保存的渠道')
  await expect(page.getByRole('tab', { name: '渠道', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.evaluate(() => { for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish() })
  await runtime.reviewCheckpoint('单一渠道配置-编辑草稿保护')
})
