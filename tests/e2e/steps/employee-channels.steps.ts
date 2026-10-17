/*
 * [OUTPUT]: 渠道编辑定位独立Dialog，局部关闭确认后再切换员工分类；原绑定及保存断言保持。
 * [OUTPUT]: 未保存确认使用取消/退出；需保存时取消确认并操作原表单，不通过确认提交。
 * [OUTPUT]: 渠道与执行统一经会话操作菜单进入，保留原面板/来源/草稿业务断言。
 * [OUTPUT]: 渠道草稿断言兼容普通textarea与群聊contenteditable输入，不改变业务发送步骤。
 * [OUTPUT]: 2026-10-15最新16组03 §16替代旧只读镜像/额外讨论：渠道记录直接续聊共用上下文与session，回发按本轮来源；回答工具条明确发送，实际进度02 §7.23。
 * [OUTPUT]: 渠道文件通过正文选区发起修改，不依赖已退役的header按钮。
 * [OUTPUT]: 渠道发送编辑区/目标搜索/键盘换行与明确提交/草稿恢复/固定操作栏的真实Electron检查。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 空渠道/空消息插画、52px共享标题与16px渐隐衔接，以及真实ScrollArea滚动和主草稿保持的桌面检查。
 * [OUTPUT]: 侧边聊天与标题栏Popover；同一渠道内资料/执行/文件替换、返回与未保存守卫，不递归追加标签。
 * [OUTPUT]: 共用右侧容器以实际几何/同DOM验证宽窄内容切换、拖拽、窗口恢复、跨页与重载偏好，窄渠道内部适配。
 * [OUTPUT]: 2026-10-15右侧完整渠道面板与主聊天并存；草稿隔离、分组折叠/搜索展开/固定定位、关闭重开与本地消息回归。
 * [OUTPUT]: 2026-10-14现行分离合同：独立员工渠道页面、返回/私聊群筛选/真实阅读提示、搜索和历史任务固定定位；实际pnpm dev与GC/资源观察。
 * [OUTPUT]: 独立渠道列表/只读来源、内部群配置、单绑定/草稿守卫、43次详情循环及120秒资源观察。
 * [OUTPUT]: 2026-10-14 实际表单/列表/归一时间线、本地模型协议及重启核对；平台历史为隔离预置夹具。
 * [INPUT]: 实际Electron表单、vault/SQLite和既有BDD生命周期。
 * [OUTPUT]: 保存成功但响应失联的产品界面、只读核对、区域隔离及未保存守卫；平台通信未运行。
 * [POS]: 第16组桌面验收步骤。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test } from '../support/test'
import { selectPreviewLine } from '../support/file-preview'
import { prepareGroupChat } from '../support/group-chat'
import { ConversationReadingRepository } from '../../../src/runtime/modules/conversations/reading-repository'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import { join } from 'node:path'
import { mkdir, writeFile } from 'node:fs/promises'
import type { Artifact, Conversation, Message, WorkItem } from '../../../src/shared/domain'
import { mainConversations, channelConversations } from '../../../src/shared/domain/conversation-list'
import { resourceSample, verifyResources } from '../support/background-resources'
const { Given, When, Then } = createBdd(test)
const channelPanel = (page: Page) => page.locator('.channel-workspace:visible')
const mainChat = (page: Page) => page.locator('.content-main > .conversation-layout > .conversation-stage')
const channelPicker = (page: Page) => page.getByRole('dialog', { name: '选择渠道会话', exact: true })
const openChannels = async (page: Page) => {
  await mainChat(page).getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '渠道', exact: true }).click()
}
const openPicker = async (page: Page) => {
  await channelPanel(page).getByRole('button', { name: '选择渠道会话', exact: true }).click()
  await expect(channelPicker(page)).toBeVisible()
}
const selectChannel = async (page: Page, name: string) => {
  await openPicker(page)
  const picker = channelPicker(page), label = picker.getByRole('button', { name: name.includes('群') ? '群聊' : '私聊', exact: true })
  if (await label.getAttribute('aria-expanded') === 'false') await label.click()
  await picker.getByRole('button', { name, exact: true }).click()
  await expect(picker).toBeHidden()
}

const channelDraft = async (page: Page, text: string, check = false) => {
  const input = channelPanel(page).getByRole('textbox', { name: '消息内容', exact: true })
  if (check) {
    if (await input.getAttribute('contenteditable') === 'true') await expect(input).toHaveText(text)
    else await expect(input).toHaveValue(text)
  } else await input.fill(text)

}


Then('右侧容器在切换内容与跨页重开时保持统一宽度', async ({ runtime }) => {
  const page = runtime.page
  const setWindow = async (width: number) => {
    await runtime.app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'BoAI Agent')!.setContentSize(width, 900), width)
    await expect.poll(() => page.evaluate(() => innerWidth)).toBe(width)
  }
  await setWindow(1280)
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await mainChat(page).getByRole('textbox', { name: '消息内容', exact: true }).fill('容器切换保留主聊天草稿')
  await openChannels(page)
  const panel = page.locator('.detail-panel'), separator = page.getByRole('separator', { name: '调整详情宽度', exact: true })
  const originalContainer = (await panel.elementHandle())!
  const width = () => panel.evaluate(element => element.getBoundingClientRect().width)
  const sameContainer = async () => {
    await expect(panel).toHaveCount(1)
    expect(await originalContainer.evaluate(element => element.isConnected && element === document.querySelector('.detail-panel'))).toBe(true)
  }
  const resize = async (target: number) => {
    const box = (await separator.boundingBox())!, before = await width()
    await page.mouse.move(box.x + box.width / 2, box.y + 100)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + before - target, box.y + 100, { steps: 8 })
    await page.mouse.up()
    await expect.poll(width).toBe(target)
  }
  const geometry = () => page.evaluate(() => Object.fromEntries(['.detail-panel', '.content-main', '.content-main .chat-header'].map(selector => {
    const box = document.querySelector(selector)!.getBoundingClientRect()
    return [selector, { x: box.x, y: box.y, width: box.width, height: box.height }]
  })))
  await selectChannel(page, '飞书 · 研究员')
  await channelDraft(page, '容器切换保留渠道草稿')
  await resize(640)
  const wide = await geometry()
  await runtime.reviewNativeCheckpoint('统一容器-宽渠道与主聊天')
  await channelPanel(page).getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '渠道信息', exact: true }).click()
  await expect(page.locator('.detail-section[aria-label="渠道信息"]')).toBeVisible()
  await expect.poll(geometry).toEqual(wide)
  await sameContainer()
  await runtime.reviewNativeCheckpoint('统一容器-窄内容沿用宽度与主聊天位置')
  await page.getByRole('button', { name: '返回渠道聊天', exact: true }).click()
  await expect.poll(geometry).toEqual(wide)
  await channelDraft(page, '容器切换保留渠道草稿', true)
  await resize(320)
  const narrow = await geometry()
  await expect(channelPanel(page).locator('.channel-list-container')).toHaveCount(0)
  const chatBounds = (await channelPanel(page).locator('.channel-chat-stage').boundingBox())!
  expect(chatBounds.width).toBe(320)
  await expect(channelPanel(page).getByRole('textbox', { name: '消息内容', exact: true })).toBeInViewport()
  await channelPanel(page).getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '渠道信息', exact: true }).click()
  await expect.poll(geometry).toEqual(narrow)
  await page.getByRole('button', { name: '返回渠道聊天', exact: true }).click()
  await expect.poll(geometry).toEqual(narrow)
  await runtime.reviewNativeCheckpoint('统一容器-窄渠道内容内部适配')
  await separator.press('Home')
  await expect.poll(width).toBe(360)
  await separator.press('Shift+ArrowLeft')
  await expect.poll(width).toBe(400)
  await resize(640)
  await setWindow(760)
  const constrained = await width()
  expect(constrained).toBeLessThan(640)
  expect(await page.evaluate(() => localStorage.getItem('boai.v2.detailWidth'))).toBe('640')
  await channelPanel(page).getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '渠道信息', exact: true }).click()
  await expect.poll(width).toBe(constrained)
  await page.getByRole('button', { name: '返回渠道聊天', exact: true }).click()
  await setWindow(1280)
  await expect.poll(geometry).toEqual(wide)
  await page.getByRole('button', { name: '显示或隐藏详情', exact: true }).click()
  await expect(panel).toBeHidden()
  await page.getByRole('button', { name: '显示或隐藏详情', exact: true }).click()
  await expect.poll(geometry).toEqual(wide)
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '定时任务', exact: true }).click()
  await page.getByRole('button', { name: '显示或隐藏详情', exact: true }).click()
  await expect(panel).toBeVisible()
  await expect.poll(width).toBe(640)
  await expect(separator).toBeVisible()
  await sameContainer()
  await setWindow(1040)
  await expect.poll(width).toBe(640)
  expect(await panel.evaluate(element => getComputedStyle(element).position)).not.toBe('absolute')
  await expect(separator).toBeVisible()
  await setWindow(1280)
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await expect.poll(geometry).toEqual(wide)
  await expect(mainChat(page).getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('容器切换保留主聊天草稿')
  await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await expect(panel).toBeHidden()
  await openChannels(page)
  await expect.poll(geometry).toEqual(wide)
  await sameContainer()
  await runtime.reviewData('共用容器实际几何', { wide, narrow, constrained, sameContainer: true })
  await page.reload()
  await page.getByRole('button', { name: '与研究员对话', exact: true }).click()
  await openChannels(page)
  await expect.poll(width).toBe(640)
  await runtime.reviewNativeCheckpoint('统一容器-跨页重开与重载宽度恢复')
})

Then('渠道资料执行和文件都在同一面板切换且返回保留草稿', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await mainChat(page).getByRole('textbox', { name: '消息内容', exact: true }).fill('主员工草稿保持')
  await openChannels(page)
  await selectChannel(page, '飞书 · 研究员')
  const panel = channelPanel(page), tabs = page.getByRole('tablist', { name: '详情标签', exact: true })
  const container = (await page.locator('.detail-panel').elementHandle())!
  const initialWidth = await container.evaluate(element => element.getBoundingClientRect().width)
  const unchanged = async () => {
    await expect(tabs.getByRole('tab')).toHaveCount(1)
    await expect(tabs.getByRole('tab', { name: '研究员的渠道', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('.detail-panel')).toHaveCount(1)
    await expect(page.locator('.channel-detail-view')).toHaveCount(1)
    expect(await container.evaluate(element => element.isConnected && element === document.querySelector('.detail-panel'))).toBe(true)
    expect(await container.evaluate(element => element.getBoundingClientRect().width)).toBe(initialWidth)
  }
  await channelDraft(page, '侧边渠道独立草稿')
  await panel.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '渠道信息', exact: true }).click()
  const info = page.locator('.detail-section[aria-label="渠道信息"]')
  await expect(info).toBeVisible()
  await unchanged()
  await info.getByRole('button', { name: '研究员', exact: true }).click()
  await expect(info).toHaveCount(0)
  const responsibility = page.locator('.channel-detail-view').getByRole('textbox', { name: '员工职责', exact: true })
  await responsibility.fill('渠道面板未保存配置')
  await unchanged()
  await page.getByRole('button', { name: '返回渠道聊天', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  await expect(responsibility).toHaveValue('渠道面板未保存配置')
  await runtime.reviewNativeCheckpoint('渠道二级详情-员工编辑守卫与单容器')
  await page.getByRole('button', { name: '返回渠道聊天', exact: true }).click()
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await channelDraft(page, '侧边渠道独立草稿', true)
  await panel.getByRole('button', { name: '会话操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '执行过程', exact: true }).click()
  await unchanged()
  await expect(page.locator('.channel-detail-header')).toContainText('执行')
  await page.getByRole('button', { name: '返回渠道聊天', exact: true }).click()
  await panel.getByRole('button', { name: '查看渠道文件', exact: true }).click()
  await page.locator('.channel-detail-body').getByRole('button', { name: '渠道资料.md', exact: true }).click()
  await expect(page.locator('.channel-detail-body')).toContainText('侧边渠道的固定文件内容。')
  await unchanged()
  await runtime.reviewNativeCheckpoint('渠道文件预览-单容器替换且来源固定')
  await page.getByRole('button', { name: '返回渠道聊天', exact: true }).click()
  await expect(panel.getByRole('tab', { name: /聊天|文件|任务/ })).toHaveCount(0)
  await channelDraft(page, '侧边渠道独立草稿', true)
  await expect(mainChat(page).getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('主员工草稿保持')
  await expect(page.locator('.channel-detail-view')).toHaveCount(0)
  await expect(tabs.getByRole('tab')).toHaveText(['研究员的渠道'])
  const data = await page.evaluate(async () => ({ room: await window.boai.request('getConversation', { id: 'legacy-feishu-private' }), agent: (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher') }))
  expect(data.room.messages.map(message => message.id)).toEqual(['legacy-feishu-owner-message'])
  expect(data.agent?.instructions).not.toBe('渠道面板未保存配置')
  await runtime.reviewData('渠道二级导航与原消息未变', { initialWidth, sameContainer: true, messageIds: data.room.messages.map(message => message.id) })
  await runtime.reviewNativeCheckpoint('渠道返回聊天-主区与侧边草稿保持')
})

Then('新回复提示进入员工渠道且实际阅读后消失', async ({ runtime }) => {
  const dataPath = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).dataPath
  await runtime.close()
  const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init()
  const reply: Message = { id: 'channel-notice-reply', conversationId: 'feishu-group-a', senderType: 'agent', senderId: 'researcher', senderName: '研究员', content: '研究员：单聊和群聊保持一致，可以查看我的资料、回应消息、引用、复制和查看执行过程。', status: 'completed', sequence: 1, createdAt: new Date().toISOString() }
  try { const reading = new ConversationReadingRepository(store); await store.transaction(async tx => { await tx.put({ collection: 'messages', id: reply.id, value: reply }); await reading.recordCompletion(tx, reply) }) } finally { await store.close() }
  await runtime.start()
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await page.getByRole('button', { name: '与研究员对话', exact: true }).click()
  const notice = page.getByRole('button', { name: '研究员的渠道有1条新回复', exact: true })
  await expect(notice).toBeVisible()
  await expect(page.getByText('研究员：单聊和群聊保持一致，可以查看我的资料、回应消息、引用、复制和查看执行过程。', { exact: true })).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('员工主列表-渠道新回复提示')
  await mainChat(page).getByRole('textbox', { name: '消息内容', exact: true }).fill('主聊天未发送的草稿')
  await notice.click()
  await expect(mainChat(page).getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('主聊天未发送的草稿')
  await expect(page.locator('.content-main .conversation-list-panel').getByRole('button', { name: '与研究员对话', exact: true })).toHaveAttribute('aria-current', 'page')
  const mainBounds = await mainChat(page).boundingBox(), channelBounds = await channelPanel(page).boundingBox()
  expect(mainBounds).toBeTruthy(); expect(channelBounds).toBeTruthy()
  expect(channelBounds!.x).toBeGreaterThanOrEqual(mainBounds!.x + mainBounds!.width)
  await expect(page.getByRole('tab', { name: '研究员的渠道', exact: true })).toBeVisible()
  await expect(page.getByText('研究员：单聊和群聊保持一致，可以查看我的资料、回应消息、引用、复制和查看执行过程。', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(async () => (await window.boai.request('snapshot', undefined)).conversations.find(room => room.id === 'feishu-group-a')?.channelUnreadCount)).toBe(0)
  await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await expect(notice).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('渠道真实可见阅读-返回主聊天提示消失')
})

Then('渠道私聊群筛选及搜索任务定位进入正确页面', async ({ runtime }) => {
  const page = runtime.page
  await openChannels(page)
  const panel = channelPanel(page), picker = channelPicker(page)
  const privateGroup = picker.getByRole('group', { name: '渠道私聊', exact: true })
  const groupGroup = picker.getByRole('group', { name: '渠道群聊', exact: true })
  await selectChannel(page, '飞书 · 研究员')
  await expect(panel.locator('.channel-chat-stage').getByText('手机飞书私聊的历史消息', { exact: true })).toBeVisible()
  await channelDraft(page, '渠道私聊草稿')
  await openPicker(page)
  await expect(picker.getByRole('tab', { name: /全部|私聊|群聊/ })).toHaveCount(0)
  await picker.getByRole('button', { name: '私聊', exact: true }).click()
  await expect(privateGroup).toBeHidden()
  await expect(groupGroup).toBeVisible()
  await groupGroup.getByRole('button', { name: '研发A群 · 飞书', exact: true }).click()
  await expect(picker).toBeHidden()
  await channelDraft(page, '渠道群聊草稿')
  await openPicker(page)
  await expect(privateGroup).toBeHidden()
  await picker.getByRole('button', { name: '群聊', exact: true }).click()
  await expect(groupGroup).toBeHidden()
  await expect(mainChat(page).getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('主聊天未发送的草稿')
  await picker.getByRole('textbox', { name: '搜索会话', exact: true }).fill('飞书')
  await expect(privateGroup).toBeVisible(); await expect(groupGroup).toBeVisible()
  await picker.evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))) })
  await expect(privateGroup.getByRole('button', { name: '飞书 · 研究员', exact: true })).toBeInViewport()
  await expect(groupGroup.getByRole('button', { name: '研发B群 · 飞书', exact: true })).toBeInViewport()
  await runtime.reviewNativeCheckpoint('渠道标题栏Popover-搜索展开私聊群聊')
  await picker.getByRole('textbox', { name: '搜索会话', exact: true }).fill('')
  await expect(privateGroup).toBeHidden(); await expect(groupGroup).toBeHidden()
  await page.keyboard.press('Escape')
  await expect(picker).toBeHidden()
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('button', { name: '选择渠道会话', exact: true })).toBeFocused()
  await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await expect(mainChat(page).getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('主聊天未发送的草稿')
  await page.getByRole('button', { name: '搜索会话内容', exact: true }).click()
  const search = page.getByRole('dialog', { name: '搜索会话内容', exact: true })
  await search.getByRole('textbox', { name: '搜索关键词', exact: true }).fill('手机飞书私聊的历史消息')
  await search.locator('[data-search-kind="message"][data-search-result-id="legacy-feishu-owner-message"]').click()
  await expect(panel.locator('.channel-chat-stage').getByText('手机飞书私聊的历史消息', { exact: true })).toBeVisible()
  await channelDraft(page, '渠道私聊草稿', true)
  await openPicker(page)
  await picker.getByRole('button', { name: '私聊', exact: true }).click()
  await picker.getByRole('textbox', { name: '搜索会话', exact: true }).fill('研发')
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: '搜索会话内容', exact: true }).click()
  await search.getByRole('textbox', { name: '搜索关键词', exact: true }).fill('手机飞书私聊的历史消息')
  await search.locator('[data-search-kind="message"][data-search-result-id="legacy-feishu-owner-message"]').click()
  await openPicker(page)
  await expect(picker.getByRole('button', { name: '私聊', exact: true })).toHaveAttribute('aria-expanded', 'true')
  await expect(picker.getByRole('textbox', { name: '搜索会话', exact: true })).toHaveValue('')
  await expect(privateGroup.getByRole('button', { name: '飞书 · 研究员', exact: true })).toHaveAttribute('aria-current', 'page')
  await page.keyboard.press('Escape')
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '任务', exact: true }).click()
  await expect(panel).toHaveCount(0)
  const card = page.locator('[data-work-id="channel-history-work"]')
  await card.scrollIntoViewIfNeeded()
  await card.getByRole('button', { name: '查看原聊天', exact: true }).click()
  await expect(panel.locator('.channel-chat-stage').getByText('手机飞书私聊的历史消息', { exact: true })).toBeVisible()
  await expect(mainChat(page).getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('主聊天未发送的草稿')
  await selectChannel(page, '研发A群 · 飞书')
  await channelDraft(page, '渠道群聊草稿', true)
  await runtime.reviewNativeCheckpoint('搜索和历史任务-侧边聊天固定来源与独立草稿')
})

Then('渠道详情反复打开和本地处理后的空闲资源保持有界', async ({ runtime }) => {
  test.setTimeout(420_000)
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await openChannels(page)
  await selectChannel(page, '研发A群 · 飞书')
  const cycle = async () => {
    await channelPanel(page).getByRole('button', { name: '会话操作', exact: true }).click()
    await page.getByRole('menuitem', { name: '渠道信息', exact: true }).click()
    await expect(page.locator('.detail-section[aria-label="渠道信息"]')).toBeVisible()
    await page.getByRole('button', { name: '返回渠道聊天', exact: true }).click()
  }
  const message = async (index: number) => {
    const internalId = await page.evaluate(async index => { const room = { id: 'feishu-group-a' }; await window.boai.request('sendMessage', { conversationId: room.id, content: '单聊统一交互验收', mentionIds: [], requestId: `channel-resource-${index}` }); return room.id }, index)
    await expect.poll(() => page.evaluate(async id => (await window.boai.request('getConversation', { id })).messages.filter(message => message.senderType === 'agent' && message.status === 'completed').length, internalId)).toBe(index + 1)
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
  await openChannels(page)
  await openPicker(page)
  const channelList = channelPicker(page).getByRole('group', { name: '渠道会话', exact: true })
  await expect(channelList.getByRole('button', { name: '研发A群 · 飞书', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: '普通会话', exact: true }).getByRole('button', { name: /研发A群/ })).toHaveCount(0)
  await channelList.getByRole('button', { name: '研发A群 · 飞书', exact: true }).click()
  await expect(channelPanel(page).locator('.chat-header').getByLabel('接入员工')).toBeVisible()
  await expect(channelPanel(page).locator('.chat-header').getByLabel('群聊成员')).toHaveCount(0)
  await channelPanel(page).getByRole('button', { name: '会话操作', exact: true }).click()
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

Then('渠道原会话可直接续聊且重启保留', async ({ runtime }) => {
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('button', { name: '与研究员对话', exact: true }).click()
  await openChannels(runtime.page)
  await selectChannel(runtime.page, '研发A群 · 飞书')
  await channelPanel(runtime.page).getByRole('textbox', { name: '消息内容' }).fill('单聊统一交互验收')
  await channelPanel(runtime.page).getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(runtime.page.getByText('研究员：单聊和群聊保持一致，可以查看我的资料、回应消息、引用、复制和查看执行过程。', { exact: true })).toBeVisible()
  await expect(mainChat(runtime.page).getByText('研究员：单聊和群聊保持一致，可以查看我的资料、回应消息、引用、复制和查看执行过程。', { exact: true })).toHaveCount(0)
  const read = () => runtime.page.evaluate(() => window.boai.request('getConversation', { id: 'feishu-group-a' }))
  const before = await read()
  expect(before.conversation.agentIds).toEqual(['researcher'])
  expect(before.conversation.id).toBe('feishu-group-a')
  expect(before.messages.some(message => message.senderType === 'agent')).toBe(true)
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
  const fileContent = '# 渠道资料\n\n侧边渠道的固定文件内容。\n'
  const artifact: Artifact & { conversationId: string } = { id: 'channel-panel-file', name: '渠道资料.md', conversationId: privateRoom.id, ownerAgentId: 'researcher', runId: 'channel-history-run', path: join(privateRoom.workspacePath, 'artifacts', '渠道资料.md'), size: Buffer.byteLength(fileContent), publishedAt: message.createdAt }
  await mkdir(join(privateRoom.workspacePath, 'artifacts'), { recursive: true })
  await writeFile(artifact.path, fileContent)
  const store = new ProductStore(join(setup.dataPath, 'boai.sqlite')); await store.init()
  try { await store.write([{ collection: 'artifacts', id: artifact.id!, value: artifact }, { collection: 'conversations', id: privateRoom.id, value: privateRoom }, { collection: 'conversations', id: writerPrivate.id, value: writerPrivate }, { collection: 'messages', id: message.id, value: message }, { collection: 'workItems', id: historyWork.id, value: historyWork }, ...groups.map(value => ({ collection: 'conversations', id: value.id, value }))]) } finally { await store.close() }
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
  const editor = runtime.page.getByRole('dialog', { name: '编辑渠道绑定', exact: true })
  await editor.getByRole('textbox', { name: '本人用户 ID', exact: true }).fill('ou_room_owner')
  await editor.getByRole('button', { name: '保存绑定', exact: true }).click()
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
  await openChannels(runtime.page)
  await selectChannel(runtime.page, '飞书 · 研究员')
  await expect(channelPanel(runtime.page).locator('.channel-chat-stage').getByText('手机飞书私聊的历史消息', { exact: true })).toBeVisible()
  await runtime.page.getByRole('button', { name: '关闭详情', exact: true }).click()
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
  const editor = page.getByRole('dialog', { name: '编辑渠道绑定', exact: true })
  await expect(editor.getByLabel('App Secret', { exact: true })).toHaveValue('')
  await expect(editor.getByRole('combobox', { name: '平台', exact: true })).toBeDisabled()
  await editor.getByRole('textbox', { name: '绑定名称', exact: true }).fill('尚未保存的渠道')
  await editor.getByRole('button', { name: '关闭渠道绑定编辑', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  await expect(editor.getByRole('textbox', { name: '绑定名称', exact: true })).toHaveValue('尚未保存的渠道')
  await editor.getByRole('button', { name: '关闭渠道绑定编辑', exact: true }).click()
  await page.getByRole('button', { name: '退出', exact: true }).click()
  await expect(editor).toHaveCount(0)
  await page.getByRole('tab', { name: '系统文件', exact: true }).click()
  await expect(page.getByRole('tabpanel', { name: '系统文件', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '渠道', exact: true }).click()
  await expect(pane.getByRole('textbox', { name: '绑定名称', exact: true })).toHaveCount(0)
  await pane.getByRole('button', { name: '编辑绑定', exact: true }).click()
  await expect(editor.getByRole('textbox', { name: '绑定名称', exact: true })).not.toHaveValue('尚未保存的渠道')
  await expect(page.getByRole('tab', { name: '渠道', exact: true, includeHidden: true })).toHaveAttribute('aria-selected', 'true')
  await page.evaluate(() => { for (const animation of document.getAnimations()) if (Number.isFinite(animation.effect?.getComputedTiming().endTime)) animation.finish() })
  await runtime.reviewCheckpoint('单一渠道配置-编辑草稿保护')
})

Then('空渠道与空消息共用全局空态且标题和滚动布局一致', async ({ runtime }) => {
  const page = runtime.page
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.getTitle() === 'BoAI Agent')!.setContentSize(1280, 900))
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '设计师', exact: true }).click()
  await page.getByRole('button', { name: '发消息', exact: true }).click()
  await mainChat(page).getByRole('textbox', { name: '消息内容', exact: true }).fill('主聊天草稿保持')
  const before = await page.evaluate(() => window.boai.request('snapshot', undefined))
  await openChannels(page)
  const workspace = channelPanel(page)
  await expect(workspace.locator('.illustrated-empty')).toContainText('暂无渠道会话')
  await expect(workspace.locator('.empty-note')).toHaveCount(0)
  await expect(workspace.getByRole('img', { name: '等你开聊的小伙伴' })).toBeVisible()
  const geometry = () => workspace.evaluate(element => {
    const header = element.querySelector('.chat-header')!, viewport = element.querySelector('[data-slot="scroll-area-viewport"]')!, empty = viewport.querySelector('[data-slot="empty-header"]')!
    const h = header.getBoundingClientRect(), v = viewport.getBoundingClientRect(), e = empty.getBoundingClientRect()
    return { headerHeight: h.height, overlap: h.bottom - v.top, centerOffset: (e.top + e.height / 2) - (v.top + v.height / 2), fade: getComputedStyle(viewport).maskImage, titleSize: getComputedStyle(header.querySelector('h2')!).fontSize, hasScrollbar: !!element.querySelector('[data-slot="scroll-area-scrollbar"]') }
  })
  await expect.poll(async () => (await geometry()).headerHeight).toBe(52)
  await expect.poll(async () => Math.abs((await geometry()).centerOffset)).toBeLessThan(2)
  expect(await geometry()).toMatchObject({ overlap: 16, titleSize: '14px' })
  expect((await geometry()).fade).not.toBe('none')
  await runtime.reviewData('渠道空态标题与渐隐几何', await geometry())
  await runtime.reviewNativeCheckpoint('渠道空态-共享插画与悬浮标题')
  await openPicker(page)
  await expect(channelPicker(page).getByRole('navigation', { name: '会话列表' }).getByRole('button', { name: /飞书|研发/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(channelPicker(page)).toBeHidden()
  await expect(mainChat(page).getByRole('textbox', { name: '消息内容', exact: true })).toHaveText('主聊天草稿保持')
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.map(room => room.id)).toEqual(before.conversations.map(room => room.id))
  await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await page.getByRole('button', { name: '与研究员对话', exact: true }).click()
  await openChannels(page)
  await selectChannel(page, '研发A群 · 飞书')
  await expect(workspace.locator('.illustrated-empty')).toContainText('暂无渠道消息')
  await expect(workspace.locator('.messages')).toHaveAttribute('data-slot', 'scroll-area-viewport')
  await expect(mainChat(page).locator('.messages')).toHaveAttribute('data-slot', 'scroll-area-viewport')
  await expect.poll(() => mainChat(page).locator('.messages').evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true)
  const mainHeader = await mainChat(page).locator('.chat-header').boundingBox()
  await mainChat(page).locator('.messages').evaluate(element => { element.scrollTop = 200 })
  expect(await mainChat(page).locator('.chat-header').boundingBox()).toEqual(mainHeader)
  await runtime.reviewNativeCheckpoint('渠道空消息-共享空态与ScrollArea')
})

Then('渠道记录直接续聊并从回答工具条明确发送到渠道', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await mainChat(page).getByRole('textbox', { name: '消息内容', exact: true }).fill('主聊天草稿保持')
  await openChannels(page)
  await selectChannel(page, '飞书 · 研究员')
  const container = page.locator('.detail-panel'), width = await container.evaluate(element => element.getBoundingClientRect().width)
  const read = () => page.evaluate(() => window.boai.request('getConversation', { id: 'legacy-feishu-private' }))
  const beforeRooms = (await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.map(room => room.id)
  await expect(channelPanel(page).getByRole('tab', { name: /聊天|任务|文件/ })).toHaveCount(0)
  await expect(channelPanel(page).getByRole('button', { name: /内部讨论/ })).toHaveCount(0)
  const composer = channelPanel(page).getByRole('textbox', { name: '消息内容', exact: true })
  await expect(composer).toBeVisible()
  const original = channelPanel(page).locator('[data-reading-message-id="legacy-feishu-owner-message"]')
  await original.hover()
  await original.getByRole('button', { name: /引用.*的消息/ }).click()
  await expect(composer).toBeFocused()
  await composer.fill('单聊统一交互验收')
  await channelPanel(page).getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(channelPanel(page).getByText('研究员：单聊和群聊保持一致，可以查看我的资料、回应消息、引用、复制和查看执行过程。', { exact: true })).toBeVisible()
  const state = await read(), answer = state.messages.filter(message => message.senderType === 'agent').at(-1)!
  expect(state.messages.find(message => message.senderId === 'user')?.replyToMessageId).toBe('legacy-feishu-owner-message')
  expect(state.messages.map(message => message.id)).toContain('legacy-feishu-owner-message')
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).conversations.map(room => room.id).sort()).toEqual([...beforeRooms].sort())
  expect(await page.evaluate(({ id, messageId }) => window.boai.request('listChannelMessageDeliveries', { conversationId: id, messageIds: [messageId] }), { id: state.conversation.id, messageId: answer.id })).toHaveLength(0)
  await runtime.reviewNativeCheckpoint('渠道原记录-直接输入与同一历史')
  const answerRow = channelPanel(page).locator(`[data-reading-message-id="${answer.id}"]`)
  await answerRow.hover()
  const forward = answerRow.getByRole('button', { name: '发送到渠道', exact: true })
  await expect(forward).toBeVisible()
  await runtime.reviewNativeCheckpoint('渠道回答-悬停工具条发送入口')
  await forward.click()
  await expect(page.getByText('原渠道绑定或收件人授权已失效，未发送。', { exact: true })).toBeVisible()
  expect((await read()).messages.map(message => message.id)).toEqual(state.messages.map(message => message.id))
  await expect(page.getByRole('form', { name: '发送到渠道', exact: true })).toHaveCount(0)
  expect(await container.evaluate(element => element.getBoundingClientRect().width)).toBe(width)
  await runtime.reviewNativeCheckpoint('明确发送-撤权拒绝且保留原回答')
  const resize = page.getByRole('separator', { name: '调整详情宽度', exact: true })
  await resize.press('Home')
  await expect.poll(() => container.evaluate(element => element.getBoundingClientRect().width)).toBe(360)
  await composer.fill('在这条记录中继续聊的草稿')
  await expect(channelPanel(page).getByRole('button', { name: '发送消息', exact: true })).toBeInViewport()
  await runtime.reviewNativeCheckpoint('渠道原记录-窄面板输入与发送')
  for (let current = 360; current < width; current += 10) await resize.press('ArrowLeft')
  const publish = page.getByRole('form', { name: '发送到渠道', exact: true }), editor = publish.getByRole('textbox', { name: '发送到渠道的内容' }), send = publish.getByRole('button', { name: '发送', exact: true })
  await channelPanel(page).getByRole('button', { name: '查看渠道文件', exact: true }).click()
  await page.locator('.channel-detail-body').getByRole('button', { name: '渠道资料.md', exact: true }).click()
  const file = page.locator('[data-artifact-id="channel-panel-file"]')
  await file.getByRole('button', { name: '文件操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '发送到渠道…', exact: true }).click()
  await expect(editor).toHaveValue('')
  await expect(publish).toContainText('渠道资料.md')
  await expect(send).toBeDisabled()
  await publish.getByRole('button', { name: '选择回复消息', exact: true }).click()
  await page.getByRole('option', { name: /外部本人.*手机飞书私聊的历史消息/ }).click()
  await expect(send).toBeEnabled()
  await expect(editor).toBeFocused()
  await expect(page.getByRole('combobox', { name: '搜索渠道消息', exact: true })).toBeHidden()
  await runtime.reviewNativeCheckpoint('渠道发送-独立文件草稿与可选说明')
  await page.getByRole('button', { name: '返回渠道聊天', exact: true }).click()
  await channelPanel(page).getByRole('button', { name: '查看渠道文件', exact: true }).click()
  await page.locator('.channel-detail-body').getByRole('button', { name: '渠道资料.md', exact: true }).click()

  await selectPreviewLine(file)
  await page.getByRole('textbox', { name: '文件修改要求', exact: true }).fill('补充一段说明，只在BOAI保留。')
  await page.getByRole('button', { name: '发送文件修改', exact: true }).click()
  await expect.poll(async () => (await read()).messages.some(message => message.artifactRevisionRequestId && message.content.includes('只在BOAI保留'))).toBe(true)
  expect((await read()).messages.map(message => message.id)).toEqual(expect.arrayContaining(state.messages.map(message => message.id)))
  await expect(mainChat(page).getByRole('textbox', { name: '消息内容', exact: true })).toHaveValue('主聊天草稿保持')
  await expect(container).toHaveCount(1)
  expect(await container.evaluate(element => element.getBoundingClientRect().width)).toBe(width)
  await runtime.reviewData('渠道同记录续聊与明确外发', state)
  await runtime.reviewNativeCheckpoint('渠道文件修改-保留原会话且不外发')
})
