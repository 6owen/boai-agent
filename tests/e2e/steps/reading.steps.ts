/*
 * [OUTPUT]: DS02在原万条历史场景核最新侧栏摘要；定位旧页及真实重启不得用旧阅读页尾替换最新消息，保持原分页/锚点/清空与期限。
 * [OUTPUT]: 流式阅读核对真实占位消息与执行卡；分页等待期间追加并完成API正文，再核对公开消息不被旧快照覆盖及80条窗口。
 * [OUTPUT]: 文件预览正文采用统一名称，不展示版本标记。
 * [OUTPUT]: 成果修订沿原员工文件卡和同一composer； 标题栏无阅读状态/说明/跳转按钮；新回复经正常滚动补页及实际可见观察登记，保留完成次序、独立锚点、重启与零新增业务断言。本次合同同步未执行测试。
 * [INPUT]: 隐藏/删除会话与旧固定目标、D6 中文场景、会话常驻名称输入与普通搜索 Dialog/可选筛选/实际 Calendar range、真实发布完成身份、万条旧历史、固定文件版本、跨页面全局检索及当前详情作用域与个人浏览 API。
 * [OUTPUT]: 四项检索筛选均为 sm、28px 等高/全局 text-xs 字号/14px图标，明暗同款 secondary 的 card/渐变/无外侧阴影输入边缘/零边框并留真实顶栏截图，默认四筛选文字/图标同为muted、时间选中正文色/图标仍muted及清除恢复占位，时间聚焦/展开保持中性边缘；长选项限高及真实排列末项滚动/选中、日历实际起止日筛选与清除；隐藏会话的四类结果/筛选/旧目标全部隔离、显式恢复正常检索且清理删除不回流旧内容；固定搜索消息后清空不显示缺失提示，删除后迟到真实 IPC 拒绝不污染空态；全局搜索明确选择当前会话后固定身份及其余默认空条件；常驻名称输入不取代全局顶栏图标入口和32px关键词输入/无筛选混合搜索/精确定位及关闭停读；双向滚动自动有界补页、短聊天空页后跟随/长正文顶部保持、分页期间真实流式正文和反向滚动锚点不被旧快照覆盖；真实完成次序/阅读缺口与独立锚点重启、清理代际及原件失效的业务断言。
 * [POS]: D6 Electron 步骤；仅 support 控制历史/HTTP 和传输观测，业务与 SQLite 事务保持真实。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { writeFile } from 'node:fs/promises'
import { test as base } from '../support/test'
import { prepareArtifactsDesktop } from '../support/artifacts'
import { delayNextReadingPage, delayNextReadingTarget, historyId, prepareReadingHistory, prepareReadingSearchSource, prepareReadingStreams, readingBrowserProbe, readingRecords } from '../support/reading'
import { nextMaterialDialog } from '../support/materials'
import type { Desktop } from '../support/desktop'
import type { ArtifactVersion } from '../../../src/shared/domain/artifacts'
import type { ConversationMaterial } from '../../../src/shared/domain/materials'
import type { Conversation } from '../../../src/shared/domain'
import { READING_LIMITS, type ConversationReadingState, type ConversationSearchTarget, type ConversationView } from '../../../src/shared/domain/reading'

interface State {
  history?: Awaited<ReturnType<typeof prepareReadingHistory>>
  streams?: Awaited<ReturnType<typeof prepareReadingStreams>>
  files?: Awaited<ReturnType<typeof prepareArtifactsDesktop>>
  probe?: Awaited<ReturnType<typeof readingBrowserProbe>>
  anchor?: ConversationReadingState
  target?: ConversationSearchTarget
  a?: string
  b?: string
  artifacts?: ArtifactVersion[]
  searchMaterial?: ConversationMaterial
  searchConversation?: Conversation
  searchCandidates?: Conversation[]
  hiddenTargets?: ConversationSearchTarget[]
  calls?: number
  paging?: { anchor: { messageId: string; top: number }; before: number; after: number }
  pageDelay?: Awaited<ReturnType<typeof delayNextReadingPage>>
  reverseAnchor?: { messageId: string; top: number }
  delayedTargetRejected?: boolean
}
export const test = base.extend<{ readingState: State }>({ readingState: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const readState = (runtime: Desktop, conversationId: string) => runtime.page.evaluate(conversationId => window.boai.request('getConversationReading', { conversationId }), conversationId)
const view = (runtime: Desktop, conversationId: string): Promise<ConversationView> => runtime.page.evaluate(conversationId => window.boai.request('getConversationView', { conversationId }), conversationId)
async function streamingView(runtime: Desktop, conversationId: string) {
  // API chat may buffer publishable text while its live text is shown by the execution card.
  await expect.poll(async () => {
    const current = await view(runtime, conversationId)
    return ['researcher', 'writer'].every(id => current.messages.some(message => message.senderId === id && message.status === 'streaming' && message.runId))
  }).toBe(true)
  return view(runtime, conversationId)
}
const message = (runtime: Desktop, id: string) => runtime.page.locator(`#message-${id}:visible`)
const artifact = (runtime: Desktop, id: string) => runtime.page.locator(`[data-artifact-id="${id}"]:visible`)
const searchDialog = (runtime: Desktop) => runtime.page.getByRole('dialog', { name: '搜索会话内容', exact: true })
async function foreground(runtime: Desktop) { await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.focus()); await runtime.page.bringToFront() }
async function openConversation(runtime: Desktop, title: string) {
  await foreground(runtime)
  if (await searchDialog(runtime).isVisible()) { await runtime.page.keyboard.press('Escape'); await expect(searchDialog(runtime)).toHaveCount(0) }
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${title}`) }).click()
}
async function chooseFilter(runtime: Desktop, name: string, value: string) {
  await searchDialog(runtime).getByRole('combobox', { name, exact: true }).click()
  await runtime.page.getByRole('option', { name: value, exact: true }).click()
}
async function search(runtime: Desktop, kind: '全部类型' | '消息' | '文件', text: string) {
  const dialog = searchDialog(runtime)
  if (!(await dialog.isVisible())) await runtime.page.getByRole('button', { name: '搜索会话内容', exact: true }).click()
  await expect(dialog).toBeVisible()
  if (await dialog.getByRole('button', { name: '清除筛选', exact: true }).isVisible()) await dialog.getByRole('button', { name: '清除筛选', exact: true }).click()
  if (kind !== '全部类型') await chooseFilter(runtime, '检索类型', kind)
  await dialog.getByRole('textbox', { name: '搜索关键词', exact: true }).fill(text)
  return dialog
}
async function rejectOldSearchTargets(runtime: Desktop, targets: ConversationSearchTarget[], privateTexts: string[]) {
  const replies = await runtime.page.evaluate(async targets => Promise.all(targets.map(async target => {
    try { return { rejected: false, reply: await window.boai.request('resolveConversationSearchTarget', target) } }
    catch (error) { return { rejected: true, reply: String(error) } }
  })), targets)
  for (const result of replies) {
    expect(result.rejected).toBe(true)
    for (const text of privateTexts) expect(JSON.stringify(result.reply)).not.toContain(text)
  }
}
async function settled(runtime: Desktop, conversationId: string, artifactCount?: number) {
  await expect.poll(async () => {
    const current = await view(runtime, conversationId)
    return (artifactCount === undefined || current.artifacts.length === artifactCount) && current.turns!.every(turn => ['completed', 'waiting_user', 'failed', 'interrupted', 'cancelled', 'budget_exhausted'].includes(turn.status)) && current.runs.every(run => ['completed', 'failed', 'interrupted', 'cancelled'].includes(run.status))
  }, { timeout: 30_000 }).toBe(true)
  return view(runtime, conversationId)
}
async function savedAnchor(runtime: Desktop, conversationId: string, afterRevision = -1) {
  const visible = await runtime.page.locator('.messages:visible').evaluate((element, offsetLimit) => {
    const viewport = element.getBoundingClientRect()
    for (const row of element.querySelectorAll<HTMLElement>('[data-reading-message-id]')) {
      const bounds = row.getBoundingClientRect()
      if (bounds.bottom <= viewport.top || bounds.top >= viewport.bottom) continue
      return { messageId: row.dataset.readingMessageId, offset: Math.min(offsetLimit, Math.max(0, Math.round(viewport.top - bounds.top))) }
    }
    return null
  }, READING_LIMITS.anchorOffset)
  expect(visible).not.toBeNull()
  // Reading and location use independent transactions and debounce windows.
  await expect.poll(async () => {
    const anchor = (await readState(runtime, conversationId)).anchor
    return Boolean(anchor && anchor.revision > afterRevision && anchor.messageId === visible!.messageId && anchor.offset === visible!.offset)
  }).toBe(true)
  return readState(runtime, conversationId)
}

Given('两个聊天包含一万条旧历史和三条同文消息', async ({ runtime, readingState }) => {
  const fixture = readingState.history = await prepareReadingHistory(runtime)
  expect((await readingRecords(fixture.dataPath)).messages).toHaveLength(10_001)
  readingState.probe = await readingBrowserProbe(runtime)
})

Given('不同会话已保存同词名称正文和同名材料成果', async ({ runtime, readingState }) => {
  const fixture = readingState.files = await prepareArtifactsDesktop(runtime), source = await prepareReadingSearchSource(fixture.source)
  readingState.searchConversation = await runtime.page.evaluate(() => window.boai.request('createConversation', { kind: 'group', title: '交付报告检索专用会话', agentIds: ['researcher'] }))
  readingState.searchCandidates = await runtime.page.evaluate(async () => {
    const conversations: Conversation[] = []
    for (let index = 1; index <= 30; index++) conversations.push(await window.boai.request('createConversation', { kind: 'group', title: `下拉候选 ${String(index).padStart(2, '0')}`, agentIds: ['researcher'] }))
    return conversations
  })
  await openConversation(runtime, fixture.group.title); await nextMaterialDialog(runtime, { path: source.path })
  await runtime.page.getByRole('button', { name: '添加或更多操作', exact: true }).click(); await runtime.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
  await expect(runtime.page.locator('[data-material-draft-id]')).toHaveAttribute('data-material-status', 'ready')
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('请根据材料发布交付报告，保留可检查的原件与来源。')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  const current = await settled(runtime, fixture.group.id, 1)
  readingState.searchMaterial = current.materials!.find(item => item.name === '交付报告.md')!
  expect(readingState.searchMaterial).toBeDefined(); expect(current.artifacts[0].materialSources?.map(item => item.id)).toEqual([readingState.searchMaterial.id])
  readingState.artifacts = current.artifacts as ArtifactVersion[]; readingState.calls = fixture.endpoint.requests.length
  readingState.probe = await readingBrowserProbe(runtime); expect(fixture.errors).toEqual([])
})
When('用户从全局顶栏检索图标输入关键词而不选择筛选', async ({ runtime }) => {
  await expect(runtime.page.locator('[aria-label="会话搜索类型"]')).toHaveCount(0)
  await expect(runtime.page.getByRole('textbox', { name: '搜索会话', exact: true })).toBeVisible()
  await expect(runtime.page.getByRole('textbox', { name: '搜索会话', exact: true })).toHaveValue('')
  const dialog = await search(runtime, '全部类型', '交付报告')
  await expect(dialog.getByRole('textbox')).toHaveCount(1)
  await expect(dialog.getByRole('textbox', { name: '搜索关键词', exact: true })).toHaveAttribute('placeholder', '搜索会话、消息或文件')
  await expect(dialog.locator('[data-slot=input-group]')).toHaveCSS('height', '32px')
  await expect(dialog.getByRole('combobox', { name: '检索类型', exact: true })).toContainText('全部类型')
  await expect(dialog.getByRole('combobox', { name: '所在会话', exact: true })).toContainText('全部会话')
  await expect(dialog.getByRole('combobox', { name: '发言员工', exact: true })).toContainText('全部员工')
})
Then('同一弹窗同时返回会话消息材料和成果而保持各自身份', async ({ runtime, readingState }) => {
  const dialog = searchDialog(runtime), material = readingState.searchMaterial!, first = readingState.artifacts![0], named = readingState.searchConversation!
  await expect(dialog.locator(`[data-search-kind="conversation"][data-search-result-id="${named.id}"]`)).toBeVisible()
  await expect(dialog.locator('[data-search-kind="message"]').first()).toBeVisible()
  await expect(dialog.locator(`[data-search-kind="material"][data-search-result-id="${material.id}"]`)).toContainText('交付报告.md')
  await expect(dialog.locator(`[data-search-kind="artifact"][data-search-result-id="${first.id}"]`)).toContainText('交付报告.md')
  expect(material.id).not.toBe(first.id); expect((await readingRecords(readingState.files!.dataPath)).acceptances).toEqual([])
  expect(readingState.files!.endpoint.requests).toHaveLength(readingState.calls!)
  await runtime.page.screenshot({ path: '.local/search-dialog-20261001.png', animations: 'disabled' })
  await runtime.reviewCheckpoint('全局顶栏检索与32px关键词输入及混合来源结果')
})
Then('筛选均为 sm 同款且长会话选项限高可滚动', async ({ runtime, readingState }) => {
  const dialog = searchDialog(runtime), trigger = dialog.getByRole('combobox', { name: '所在会话', exact: true })
  await dialog.getByRole('textbox', { name: '搜索关键词', exact: true }).click(); await runtime.page.mouse.move(0, 0)
  const original = await runtime.page.evaluate(() => window.boai.request('getAppearance', undefined)), originalTheme = await runtime.page.locator('html').getAttribute('data-theme')
  for (const name of ['检索类型', '所在会话', '发言员工']) await expect(dialog.getByRole('combobox', { name, exact: true })).toHaveAttribute('data-size', 'sm')
  await expect(dialog.getByRole('button', { name: '时间筛选', exact: true })).toHaveAttribute('data-size', 'sm')
  await expect(dialog.getByRole('button', { name: '时间筛选', exact: true })).toHaveAttribute('data-slot', 'date-range-trigger')
  await expect(dialog.getByRole('button', { name: '时间筛选', exact: true })).toHaveAttribute('data-placeholder', '')
  const readAppearance = () => dialog.evaluate(element => {
    const style = (selector: string) => {
      const target = element.querySelector(selector)!, value = getComputedStyle(target)
      const icon = target.querySelector(':is(svg,.app-icon)')!, iconBounds = icon.getBoundingClientRect()
      return { shadow: value.boxShadow, background: value.backgroundColor, gradient: value.backgroundImage, border: value.borderWidth, radius: value.borderRadius, color: value.color, iconColor: getComputedStyle(icon).color, font: value.fontFamily, fontSize: value.fontSize, height: target.getBoundingClientRect().height, iconWidth: iconBounds.width, iconHeight: iconBounds.height }
    }
    const sample = document.createElement('div')
    sample.className = 'text-xs'
    element.appendChild(sample)
    Object.assign(sample.style, { backgroundColor: 'var(--card)', backgroundImage: 'linear-gradient(transparent,transparent),linear-gradient(to bottom,transparent,var(--soft-shade))', boxShadow: 'var(--shadow-input)', border: '0', borderRadius: 'var(--radius-control)', color: 'var(--muted-foreground)' })
    const value = getComputedStyle(sample)
    const secondary = { shadow: value.boxShadow, background: value.backgroundColor, gradient: value.backgroundImage, border: value.borderWidth, radius: value.borderRadius, color: value.color, iconColor: value.color, fontSize: value.fontSize }
    sample.remove()
    return { controls: ['检索类型', '所在会话', '发言员工', '时间筛选'].map(name => style(`[aria-label="${name}"]`)), secondary }
  })
  try {
    for (const mode of ['light', 'dark'] as const) {
      await runtime.page.evaluate(async mode => {
        const appearance = await window.boai.request('getAppearance', undefined)
        await window.boai.request('updateAppearance', { patch: { mode }, expectedRevision: appearance.revision })
      }, mode)
      await expect(runtime.page.locator('html')).toHaveAttribute('data-theme', mode)
      const appearance = await readAppearance(), reference = { ...appearance.secondary, font: appearance.controls[3].font, height: 28, iconWidth: 14, iconHeight: 14 }
      await expect.poll(async () => (await readAppearance()).controls).toEqual(Array.from({ length: 4 }, () => reference))
      const bounds = await dialog.boundingBox(), filters = await dialog.locator('[aria-label="搜索筛选"]').boundingBox()
      const screenshot = test.info().outputPath(`search-filters-${mode}.png`)
      await runtime.page.screenshot({ path: screenshot, clip: { x: bounds!.x, y: bounds!.y, width: bounds!.width, height: filters!.y + filters!.height - bounds!.y + 1 }, animations: 'disabled' })
      await test.info().attach(`search-filters-${mode}`, { path: screenshot, contentType: 'image/png' })
    }
  } finally {
    await runtime.page.evaluate(async mode => {
      const appearance = await window.boai.request('getAppearance', undefined)
      await window.boai.request('updateAppearance', { patch: { mode }, expectedRevision: appearance.revision })
    }, original.preferences.mode)
    await expect(runtime.page.locator('html')).toHaveAttribute('data-theme', originalTheme!)
  }
  await trigger.click()
  const popup = runtime.page.locator('[data-slot="select-content"]:visible'), list = popup.locator('[data-slot="select-list"]')
  await expect(list).toBeVisible()
  const bounds = await popup.boundingBox(), rem = await runtime.page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))
  expect(bounds!.height).toBeLessThanOrEqual(Math.min(320, 20 * rem) + 1)
  expect(await list.evaluate(element => element.scrollHeight)).toBeGreaterThan(await list.evaluate(element => element.clientHeight))
  // Conversation order follows recent activity, so the last-created fixture is near the top.
  const option = list.getByRole('option').last(), lastTitle = await option.innerText()
  const emptyConversation = [readingState.files!.other, readingState.searchConversation!, ...readingState.searchCandidates!].find(item => item.title === lastTitle)
  expect(emptyConversation).toBeDefined()
  await expect(option).not.toBeInViewport()
  await option.scrollIntoViewIfNeeded()
  await expect.poll(() => list.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
  await expect(option).toBeInViewport()
  await runtime.page.screenshot({ path: '.local/search-dialog-select-20261001.png', animations: 'disabled' })
  await option.click(); await expect(trigger).toContainText(emptyConversation!.title)
  await expect(dialog.getByText('没有找到相关内容', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '清除筛选', exact: true })).toHaveAttribute('data-size', 'sm')
  await dialog.getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect(dialog.locator('[data-search-kind="material"]')).toHaveCount(1)
})
When('用户按类型会话员工和日期筛选后清除条件', async ({ runtime, readingState }) => {
  const dialog = searchDialog(runtime)
  await chooseFilter(runtime, '检索类型', '消息')
  await expect(dialog.locator('[data-search-kind="message"]').first()).toBeVisible()
  await expect(dialog.locator('[data-search-kind="conversation"], [data-search-kind="material"], [data-search-kind="artifact"]')).toHaveCount(0)
  await chooseFilter(runtime, '所在会话', readingState.searchConversation!.title)
  await expect(dialog.getByText('没有找到相关内容', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect(dialog.locator('[data-search-kind="material"]')).toHaveCount(1)
  await chooseFilter(runtime, '发言员工', '成果作者')
  await expect(dialog.locator('[data-search-kind="artifact"]')).toHaveCount(1)
  const time = dialog.getByRole('button', { name: '时间筛选', exact: true })
  await time.hover(); await runtime.page.mouse.down(); await expect(time).toHaveCSS('transform', 'none'); await runtime.page.mouse.up()
  await runtime.page.mouse.move(0, 0)
  const theme = await time.evaluate(element => {
    const sample = document.createElement('div'); element.appendChild(sample)
    sample.style.boxShadow = 'var(--shadow-input)'
    sample.style.color = 'var(--muted-foreground)'
    const style = getComputedStyle(sample), shadow = style.boxShadow, muted = style.color
    sample.style.color = 'var(--foreground)'
    const foreground = getComputedStyle(sample).color; sample.remove(); return { shadow, muted, foreground }
  })
  await expect(time).toHaveAttribute('data-popup-open', '')
  await expect(time).toHaveCSS('box-shadow', theme.shadow)
  await expect(time).toHaveCSS('outline-width', '0px')
  await expect(time).toHaveCSS('color', theme.muted)
  await expect(time.locator('.app-icon')).toHaveCSS('color', theme.muted)
  const calendar = runtime.page.locator('[aria-label="检索时间范围"]'), dates = await runtime.page.evaluate(() => {
    const now = new Date(), start = new Date(now.getFullYear(), now.getMonth() - 1, 1), end = new Date(now.getFullYear(), now.getMonth() - 1, 2)
    const label = (date: Date) => `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`
    return { start: start.toLocaleDateString('zh-CN'), end: end.toLocaleDateString('zh-CN'), label: `${label(start)} 至 ${label(end)}`, from: start.toISOString(), to: new Date(end.getFullYear(), end.getMonth(), end.getDate(), 23, 59, 59, 999).toISOString() }
  })
  await expect(runtime.page.getByText('选择时间范围', { exact: true })).toBeVisible()
  await expect(calendar).toBeVisible(); await expect(calendar.locator('.rdp-month')).toHaveCount(2)
  await expect(runtime.page.getByRole('button', { name: '清除时间', exact: true })).toHaveAttribute('data-size', 'sm')
  await calendar.locator('.rdp-button_previous').click()
  const start = calendar.locator(`[data-day="${dates.start}"]`).first(), end = calendar.locator(`[data-day="${dates.end}"]`).first()
  await start.click(); await end.click()
  await expect(start).toHaveAttribute('data-range-start', 'true'); await expect(end).toHaveAttribute('data-range-end', 'true')
  await expect(dialog.getByRole('button', { name: '时间筛选', exact: true })).toHaveText(dates.label)
  await expect.poll(() => time.getAttribute('data-placeholder')).toBeNull()
  await expect(time).toHaveCSS('color', theme.foreground)
  await expect(time.locator('.app-icon')).toHaveCSS('color', theme.muted)
  await runtime.page.screenshot({ path: '.local/search-dialog-calendar-20261001.png', animations: 'disabled' })
  await runtime.page.keyboard.press('Escape')
  await expect(dialog.getByText('没有找到相关内容', { exact: true })).toBeVisible()
  expect((await readingState.probe!()).filter(item => item.method === 'searchConversations').at(-1)!.input).toMatchObject({ from: dates.from, to: dates.to })
  await dialog.getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect(time).toHaveAttribute('data-placeholder', '')
  await expect(time).toHaveCSS('color', theme.muted)
  await expect(time.locator('.app-icon')).toHaveCSS('color', theme.muted)
})
Then('清除筛选保留关键词并恢复全部范围的混合结果', async ({ runtime, readingState }) => {
  const dialog = searchDialog(runtime)
  await expect(dialog.getByRole('textbox', { name: '搜索关键词', exact: true })).toHaveValue('交付报告')
  await expect(dialog.getByRole('combobox', { name: '检索类型', exact: true })).toContainText('全部类型')
  await expect(dialog.getByRole('combobox', { name: '所在会话', exact: true })).toContainText('全部会话')
  await expect(dialog.getByRole('combobox', { name: '发言员工', exact: true })).toContainText('全部员工')
  await expect(dialog.locator(`[data-search-result-id="${readingState.searchConversation!.id}"]`)).toBeVisible()
  await expect(dialog.locator('[data-search-kind="message"]').first()).toBeVisible()
  await expect(dialog.locator('[data-search-kind="material"]')).toHaveCount(1)
  await expect(dialog.locator('[data-search-kind="artifact"]')).toHaveCount(1)
  await expect(dialog.getByRole('button', { name: '清除筛选', exact: true })).toHaveCount(0)
})
When('用户选择会话和同名材料结果后关闭检索', async ({ runtime, readingState }) => {
  const named = readingState.searchConversation!, material = readingState.searchMaterial!
  await searchDialog(runtime).locator(`[data-search-kind="conversation"][data-search-result-id="${named.id}"]`).click()
  await expect(searchDialog(runtime)).toHaveCount(0); await expect(runtime.page.locator('.chat-panel:visible .chat-title')).toHaveText(named.title)
  const dialog = await search(runtime, '全部类型', '交付报告')
  await dialog.locator(`[data-search-kind="material"][data-search-result-id="${material.id}"]`).click()
  await expect(searchDialog(runtime)).toHaveCount(0)
  await expect(runtime.page.locator(`[data-material-preview-id="${material.id}"]:visible`)).toContainText('READING_SEARCH_MATERIAL')
  await search(runtime, '全部类型', '交付报告'); await runtime.page.keyboard.press('Escape'); await expect(searchDialog(runtime)).toHaveCount(0)
})
Then('全局检索在其他页面打开材料且详情留在当前页面', async ({ runtime, readingState }) => {
  const page = runtime.page, material = readingState.searchMaterial!
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-page', 'contacts')
  const dialog = await search(runtime, '全部类型', '交付报告')
  await dialog.locator(`[data-search-kind="material"][data-search-result-id="${material.id}"]`).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-page', 'contacts')
  await expect(page.locator(`[data-material-preview-id="${material.id}"]:visible`)).toContainText('READING_SEARCH_MATERIAL')
  await runtime.reviewCheckpoint('通讯录页全局检索的原材料预览保持当前详情工作区')
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await expect(page.locator('.app-shell')).toHaveAttribute('data-page', 'conversations')
})
Then('关闭的检索不再读取且会话列表仍可正常选中', async ({ runtime, readingState }) => {
  const count = async () => (await readingState.probe!()).filter(request => request.method === 'searchConversations').length
  const before = await count()
  // A real unrelated change exercises the unmounted search subscription, not just an idle interval.
  await runtime.page.evaluate(() => window.boai.request('createConversation', { kind: 'group', title: '关闭检索后的正常会话', agentIds: ['researcher'] }))
  await openConversation(runtime, '关闭检索后的正常会话')
  await expect(runtime.page.locator('.chat-panel:visible .chat-title')).toHaveText('关闭检索后的正常会话')
  await runtime.page.waitForTimeout(500)
  expect(await count()).toBe(before)
  expect(readingState.files!.endpoint.requests).toHaveLength(readingState.calls!)
  const records = await readingRecords(readingState.files!.dataPath); expect(records.works).toHaveLength(1); expect(records.acceptances).toEqual([]); expect(runtime.errors).toEqual([])
})
When('用户隐藏原会话后核对全范围检索和筛选选项', async ({ runtime, readingState }) => {
  const named = readingState.searchConversation!, fixture = readingState.files!, dialog = await search(runtime, '全部类型', '交付报告')
  await expect(dialog.locator(`[data-search-kind="material"][data-search-result-id="${readingState.searchMaterial!.id}"]`)).toBeVisible()
  const found = await runtime.page.evaluate(() => window.boai.request('searchConversations', { keyword: '交付报告', scope: 'all', limit: 80 }))
  readingState.hiddenTargets = [...found.results.map(item => item.target), { kind: 'conversation', conversationId: fixture.group.id }]
  expect(new Set(readingState.hiddenTargets.map(item => item.kind))).toEqual(new Set(['conversation', 'message', 'material', 'artifact']))
  await chooseFilter(runtime, '所在会话', fixture.group.title)
  await expect(dialog.locator(`[data-search-kind="material"][data-search-result-id="${readingState.searchMaterial!.id}"]`)).toBeVisible()
  await expect(dialog.locator('[aria-label="搜索结果"]')).toHaveAttribute('aria-busy', 'false')
  await runtime.page.evaluate(id => window.boai.request('updateConversationList', { id, action: 'hide' }), fixture.group.id)
  await expect(dialog.getByText('所选会话已从列表移除，请重新选择或清除筛选。', { exact: true })).toBeVisible()
  await expect(dialog.locator('[data-search-result-id]')).toHaveCount(0)
  const count = (await readingState.probe!()).filter(item => item.method === 'searchConversations').length
  // Another real source change must leave the removed scope stopped until the user clears it.
  await runtime.page.evaluate(id => window.boai.request('updateConversationList', { id, action: 'hide' }), named.id)
  await dialog.getByRole('combobox', { name: '所在会话', exact: true }).click()
  await expect(runtime.page.getByRole('option', { name: new RegExp(`^${fixture.group.title}`) })).toHaveCount(0)
  await expect(runtime.page.getByRole('option', { name: new RegExp(`^${named.title}`) })).toHaveCount(0)
  await runtime.page.keyboard.press('Escape')
  expect((await readingState.probe!()).filter(item => item.method === 'searchConversations')).toHaveLength(count)
  await dialog.getByRole('button', { name: '清除筛选', exact: true }).click()
  await expect(dialog.getByRole('textbox', { name: '搜索关键词', exact: true })).toHaveValue('交付报告')
  await expect(dialog.getByRole('combobox', { name: '所在会话', exact: true })).toContainText('全部会话')
  await expect(dialog.getByText('没有找到相关内容', { exact: true })).toBeVisible()
  const list = runtime.page.getByRole('navigation', { name: '会话列表', exact: true })
  await expect(list.getByRole('button', { name: new RegExp(`^${fixture.group.title}`) })).toHaveCount(0)
  await expect(list.getByRole('button', { name: new RegExp(`^${named.title}`) })).toHaveCount(0)
})
Then('隐藏会话的四类内容和旧固定目标均不可用且检索不恢复显示', async ({ runtime, readingState }) => {
  const fixture = readingState.files!, named = readingState.searchConversation!
  for (const keyword of ['交付报告', fixture.group.title, named.title, 'READING_SEARCH_MATERIAL']) {
    const result = await runtime.page.evaluate(keyword => window.boai.request('searchConversations', { keyword, scope: 'all', limit: 1 }), keyword)
    expect(result.results).toEqual([]); expect(result.nextCursor).toBeUndefined()
  }
  await rejectOldSearchTargets(runtime, readingState.hiddenTargets!, [fixture.group.title, named.title, '交付报告.md', 'READING_SEARCH_MATERIAL'])
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.conversations.filter(item => [fixture.group.id, named.id].includes(item.id)).map(item => item.list?.hidden)).toEqual([true, true])
  expect((await readingState.probe!()).filter(item => item.method === 'updateConversationList' && (item.input as { action: string }).action === 'show')).toEqual([])
  expect(readingState.files!.endpoint.requests).toHaveLength(readingState.calls!)
  const records = await readingRecords(fixture.dataPath); expect(records.works).toHaveLength(1); expect(records.acceptances).toEqual([])
})
When('用户显式恢复会话后重新选择原材料和会话', async ({ runtime, readingState }) => {
  const fixture = readingState.files!, named = readingState.searchConversation!, material = readingState.searchMaterial!
  await runtime.page.keyboard.press('Escape'); await expect(searchDialog(runtime)).toHaveCount(0)
  await runtime.page.evaluate(async ids => { for (const id of ids) await window.boai.request('updateConversationList', { id, action: 'show' }) }, [fixture.group.id, named.id])
  const dialog = await search(runtime, '全部类型', '交付报告')
  await expect(dialog.locator(`[data-search-kind="conversation"][data-search-result-id="${named.id}"]`)).toBeVisible()
  await expect(dialog.locator('[data-search-kind="message"]').first()).toBeVisible()
  await expect(dialog.locator(`[data-search-kind="artifact"][data-search-result-id="${readingState.artifacts![0].id}"]`)).toBeVisible()
  await dialog.locator(`[data-search-kind="material"][data-search-result-id="${material.id}"]`).click()
  await expect(dialog).toHaveCount(0)
  await expect(runtime.page.locator(`[data-material-preview-id="${material.id}"]:visible`)).toContainText('READING_SEARCH_MATERIAL')
  await search(runtime, '全部类型', named.title)
  await searchDialog(runtime).locator(`[data-search-kind="conversation"][data-search-result-id="${named.id}"]`).click()
  await expect(searchDialog(runtime)).toHaveCount(0); await expect(runtime.page.locator('.chat-panel:visible .chat-title')).toHaveText(named.title)
})
Then('全局搜索选择本会话固定原身份且关闭后仍保留当前会话', async ({ runtime, readingState }) => {
  const named = readingState.searchConversation!
  await runtime.page.getByRole('button', { name: '搜索会话内容', exact: true }).click()
  const dialog = searchDialog(runtime)
  await expect(dialog).toBeVisible()
  await dialog.getByRole('combobox', { name: '所在会话', exact: true }).click()
  await runtime.page.getByRole('option', { name: named.title + ' · 当前会话', exact: true }).click()
  await expect(dialog.getByRole('combobox', { name: '所在会话', exact: true })).toContainText(named.title + ' · 当前会话')
  await expect(dialog.getByRole('combobox', { name: '检索类型', exact: true })).toContainText('全部类型')
  await expect(dialog.getByRole('combobox', { name: '发言员工', exact: true })).toContainText('全部员工')
  await expect(dialog.getByRole('textbox', { name: '搜索关键词', exact: true })).toHaveValue('')
  await expect(dialog.getByRole('button', { name: '时间筛选', exact: true })).toHaveText('时间')
  await dialog.getByRole('textbox', { name: '搜索关键词', exact: true }).fill(named.title)
  await expect(dialog.locator(`[data-search-kind="conversation"][data-search-result-id="${named.id}"]`)).toBeVisible()
  const queries = (await readingState.probe!()).filter(item => item.method === 'searchConversations')
  expect(queries.at(-1)!.input).toMatchObject({ scope: 'current', conversationId: named.id, keyword: named.title })
  await dialog.getByRole('button', { name: '关闭搜索', exact: true }).click(); await expect(dialog).toHaveCount(0)
  await expect(runtime.page.locator('.chat-panel:visible .chat-title')).toHaveText(named.title)
  expect(readingState.files!.endpoint.requests).toHaveLength(readingState.calls!); expect(runtime.errors).toEqual([])
})
When('用户清空并隐藏材料会话且删除命名会话', async ({ runtime, readingState }) => {
  const fixture = readingState.files!, named = readingState.searchConversation!
  await openConversation(runtime, '关闭检索后的正常会话')
  const dialog = await search(runtime, '全部类型', '交付报告')
  await expect(dialog.locator(`[data-search-kind="material"][data-search-result-id="${readingState.searchMaterial!.id}"]`)).toBeVisible()
  await runtime.page.evaluate(async ({ groupId, namedId }) => {
    await window.boai.request('clearConversationHistory', { id: groupId, hide: true })
    await window.boai.request('deleteConversation', { id: namedId })
  }, { groupId: fixture.group.id, namedId: named.id })
  await expect(dialog.getByText('没有找到相关内容', { exact: true })).toBeVisible()
  await expect(dialog.locator('[data-search-result-id]')).toHaveCount(0)
  await dialog.getByRole('combobox', { name: '所在会话', exact: true }).click()
  await expect(runtime.page.getByRole('option', { name: new RegExp(`^${fixture.group.title}`) })).toHaveCount(0)
  await expect(runtime.page.getByRole('option', { name: new RegExp(`^${named.title}`) })).toHaveCount(0)
  await runtime.page.keyboard.press('Escape')
})
Then('删除名称与清空的正文文件不再检索且恢复空会话也不回流旧内容', async ({ runtime, readingState }) => {
  const named = readingState.searchConversation!, fixture = readingState.files!
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.conversations.find(item => item.id === named.id)).toBeUndefined()
  expect(snapshot.conversations.find(item => item.id === fixture.group.id)?.list?.hidden).toBe(true)
  await rejectOldSearchTargets(runtime, readingState.hiddenTargets!, [fixture.group.title, named.title, '交付报告.md', 'READING_SEARCH_MATERIAL'])
  for (const keyword of ['交付报告', fixture.group.title, 'READING_SEARCH_MATERIAL']) {
    expect((await runtime.page.evaluate(keyword => window.boai.request('searchConversations', { keyword, scope: 'all' }), keyword)).results).toEqual([])
  }
  await runtime.page.keyboard.press('Escape'); await expect(searchDialog(runtime)).toHaveCount(0)
  await runtime.page.evaluate(id => window.boai.request('updateConversationList', { id, action: 'show' }), fixture.group.id)
  expect((await runtime.page.evaluate(() => window.boai.request('searchConversations', { keyword: '交付报告', scope: 'all' }))).results).toEqual([])
  await rejectOldSearchTargets(runtime, readingState.hiddenTargets!.filter(item => item.kind !== 'conversation'), ['交付报告.md', 'READING_SEARCH_MATERIAL'])
  const dialog = await search(runtime, '全部类型', fixture.group.title)
  await expect(dialog.getByRole('combobox', { name: '所在会话', exact: true })).toContainText('全部会话')
  await expect(dialog.locator(`[data-search-kind="conversation"][data-search-result-id="${fixture.group.id}"]`)).toBeVisible()
  await dialog.locator(`[data-search-kind="conversation"][data-search-result-id="${fixture.group.id}"]`).click()
  await expect(dialog).toHaveCount(0)
  await expect(runtime.page.locator('.chat-panel:visible .chat-title')).toHaveText(fixture.group.title)
  const current = await view(runtime, fixture.group.id)
  expect(current.messages).toEqual([]); expect(current.materials).toEqual([]); expect(current.artifacts).toEqual([]); expect(current.workItems).toEqual([])
  expect(fixture.endpoint.requests).toHaveLength(readingState.calls!)
  const records = await readingRecords(fixture.dataPath); expect(records.works).toEqual([]); expect(records.runs).toEqual([]); expect(records.acceptances).toEqual([]); expect(runtime.errors).toEqual([])
})
Then('个人浏览只载入有界历史并明确旧阅读未知', async ({ runtime, readingState }) => {
  const fixture = readingState.history!; await openConversation(runtime, fixture.group.title)
  await expect(message(runtime, historyId(10_000))).toBeVisible()
  await expect(runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${fixture.group.title}`) }).locator('.conversation-preview')).toContainText('第 10000 条完整旧历史。')
  const current = await view(runtime, fixture.group.id)
  expect(current.messages.length).toBeLessThanOrEqual(80); expect(current.messagePage.items.length).toBeLessThanOrEqual(80)
  expect(current.messagePage.beforeCursor).toBeDefined(); expect(current.reading).toMatchObject({ legacyCompletedUnknown: true, unreadCount: 0, completionCount: 0, boundary: 0, sparseSeen: [] })
  await expect(runtime.page.getByText('旧历史阅读状态未知，仅统计启用后的完成回复。', { exact: true })).toHaveCount(0)
  expect((await readingState.probe!()).some(request => request.method === 'getConversation')).toBe(false)
  expect(await readingRecords(fixture.dataPath)).toMatchObject({ completions: [], works: [], runs: [], acceptances: [] })
})
When('用户滚动到历史顶部和底部自动接续消息', async ({ runtime, readingState }) => {
  const fixture = readingState.history!, container = runtime.page.locator('.messages:visible')
  await expect(runtime.page.getByRole('button', { name: /载入(更早|较新|最新)消息/ })).toHaveCount(0)
  const requests = async (direction: 'before' | 'after') => (await readingState.probe!()).filter(request => request.method === 'getConversationView' && (request.input as { conversationId: string }).conversationId === fixture.group.id && direction in (request.input as object)).length
  const scroll = async (direction: 'before' | 'after') => container.evaluate((element, direction) => {
    element.scrollTop = direction === 'before' ? 0 : element.scrollHeight
    const viewport = element.getBoundingClientRect()
    const row = [...element.querySelectorAll<HTMLElement>('[data-reading-message-id]')].find(row => row.getBoundingClientRect().bottom > viewport.top)
    const anchor = { messageId: row!.dataset.readingMessageId!, top: row!.getBoundingClientRect().top - viewport.top }
    element.dispatchEvent(new Event('scroll'))
    return anchor
  }, direction)
  const initialBefore = await requests('before')
  for (let page = 1; page <= 2; page++) {
    const anchor = await scroll('before')
    await expect.poll(() => requests('before')).toBe(initialBefore + page)
    await expect(container).toHaveAttribute('aria-busy', 'false')
    await expect.poll(() => message(runtime, anchor.messageId).evaluate(row => row.getBoundingClientRect().top - row.closest('.messages')!.getBoundingClientRect().top)).toBeCloseTo(anchor.top, 0)
    expect(await container.locator('[data-reading-message-id]').count()).toBeLessThanOrEqual(80)
  }
  await expect(message(runtime, historyId(10_000))).toHaveCount(0)
  const initialAfter = await requests('after'), anchor = await scroll('after')
  await expect.poll(() => requests('after')).toBe(initialAfter + 1)
  await expect(container).toHaveAttribute('aria-busy', 'false')
  await expect.poll(() => message(runtime, anchor.messageId).evaluate(row => row.getBoundingClientRect().top - row.closest('.messages')!.getBoundingClientRect().top)).toBeCloseTo(anchor.top, 0)
  readingState.paging = { anchor, before: initialBefore + 2, after: initialAfter + 1 }
})
Then('补页保持原阅读位置且不会跳到最新或后台加载', async ({ runtime, readingState }) => {
  const fixture = readingState.history!, proof = readingState.paging!, container = runtime.page.locator('.messages:visible')
  await expect.poll(() => message(runtime, proof.anchor.messageId).evaluate(row => row.getBoundingClientRect().top - row.closest('.messages')!.getBoundingClientRect().top)).toBeCloseTo(proof.anchor.top, 0)
  expect(await container.locator('[data-reading-message-id]').count()).toBeLessThanOrEqual(80)
  await container.evaluate(element => { element.dispatchEvent(new Event('scroll')); element.dispatchEvent(new Event('scroll')) })
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.locator('.messages').evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')) })
  const requests = (await readingState.probe!()).filter(request => request.method === 'getConversationView' && (request.input as { conversationId: string }).conversationId === fixture.group.id)
  expect(requests.filter(request => 'before' in (request.input as object))).toHaveLength(proof.before)
  expect(requests.filter(request => 'after' in (request.input as object))).toHaveLength(proof.after)
  expect(await readingRecords(fixture.dataPath)).toMatchObject({ completions: [], works: [], runs: [], acceptances: [] })
  await openConversation(runtime, fixture.group.title)
})
When('用户搜索旧正文并打开第一条原消息', async ({ runtime, readingState }) => {
  const fixture = readingState.history!, input = { keyword: 'D6_DUPLICATE', scope: 'all' as const, kinds: ['message' as const], limit: 1 }
  const ids: string[] = []; let before: import('../../../src/shared/domain/reading').ConversationSearchCursor | undefined
  for (let page = 0; page < 4; page++) {
    const result = await runtime.page.evaluate(query => window.boai.request('searchConversations', query), { ...input, before })
    ids.push(...result.results.map(item => item.id)); before = result.nextCursor; if (!before) break
  }
  expect(ids.sort()).toEqual([fixture.targets.first.id, fixture.targets.second.id, fixture.targets.independent.id].sort())
  const current = await runtime.page.evaluate(conversationId => window.boai.request('searchConversations', { keyword: 'D6_DUPLICATE', scope: 'current', conversationId, agentId: 'researcher', kinds: ['message'], limit: 80 }), fixture.group.id)
  expect(current.results.map(item => item.id).sort()).toEqual([fixture.targets.first.id, fixture.targets.second.id].sort())
  readingState.target = current.results.find(item => item.id === fixture.targets.first.id)!.target
  const list = await search(runtime, '消息', 'D6_DUPLICATE'); await expect(list.locator('[data-search-kind="message"]')).toHaveCount(3)
  await list.locator(`[data-search-result-id="${fixture.targets.first.id}"]`).click()
  await expect(searchDialog(runtime)).toHaveCount(0)
  await expect(message(runtime, fixture.targets.first.id)).toHaveClass(/message-target/)
  await expect(message(runtime, fixture.targets.first.id)).toContainText(fixture.targets.first.content)
  expect(await runtime.page.locator('.chat-panel:visible [data-reading-message-id]').count()).toBeLessThanOrEqual(80)
  await expect.poll(async () => Number((await readState(runtime, fixture.group.id)).anchor?.messageId.split('-').at(-1) ?? 10_000)).toBeLessThan(100)
  readingState.anchor = await savedAnchor(runtime, fixture.group.id)
  await expect(runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${fixture.group.title}`) }).locator('.conversation-preview')).toContainText('第 10000 条完整旧历史。')
})
Then('原消息定位和历史锚点重启准确且没有业务执行', async ({ runtime, readingState }) => {
  const fixture = readingState.history!, previous = readingState.anchor!
  const requests = await readingState.probe!(); expect(requests.some(item => item.method === 'getConversation')).toBe(false)
  expect(await readingRecords(fixture.dataPath)).toMatchObject({ completions: [], works: [], runs: [], acceptances: [] })
  await runtime.restart(); await openConversation(runtime, fixture.group.title)
  await expect(message(runtime, previous.anchor!.messageId)).toBeVisible()
  await expect(runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${fixture.group.title}`) }).locator('.conversation-preview')).toContainText('第 10000 条完整旧历史。')
  const current = await readState(runtime, fixture.group.id); expect(current).toMatchObject({ epoch: previous.epoch, legacyCompletedUnknown: true, boundary: 0, sparseSeen: [], unreadCount: 0 })
  expect(current.anchor?.messageId).toBe(previous.anchor!.messageId)
  expect(await readingRecords(fixture.dataPath)).toMatchObject({ completions: [], works: [], runs: [], acceptances: [] })
})
When('用户清空该聊天后再核对原搜索目标', async ({ runtime, readingState }) => {
  const fixture = readingState.history!, dialog = await search(runtime, '消息', 'D6_DUPLICATE')
  await dialog.locator(`[data-search-result-id="${fixture.targets.first.id}"]`).click()
  await expect(dialog).toHaveCount(0); await expect(message(runtime, fixture.targets.first.id)).toHaveClass(/message-target/)
  readingState.anchor = await readState(runtime, fixture.group.id)
  await runtime.page.evaluate(id => window.boai.request('clearConversationHistory', { id, hide: false }), fixture.group.id)
})
Then('原目标和迟到阅读位置不能重新显示已清空正文', async ({ runtime, readingState }) => {
  const fixture = readingState.history!, previous = readingState.anchor!
  const result = await runtime.page.evaluate(async ({ target, previous }) => {
    const rejected = async (action: () => Promise<unknown>) => { try { await action(); return 'accepted' } catch (error) { return String(error) } }
    return { target: await rejected(() => window.boai.request('resolveConversationSearchTarget', target)), anchor: await rejected(() => window.boai.request('saveConversationAnchor', { conversationId: previous.conversationId, epoch: previous.epoch, expectedAnchorRevision: previous.anchor!.revision, messageId: previous.anchor!.messageId, offset: previous.anchor!.offset })), observed: await rejected(() => window.boai.request('observeConversationReading', { conversationId: previous.conversationId, epoch: previous.epoch, expectedRevision: previous.revision, completions: [] })) }
  }, { target: readingState.target!, previous })
  expect(result.target).not.toBe('accepted'); expect(result.anchor).not.toBe('accepted'); expect(result.observed).not.toBe('accepted')
  const current = await view(runtime, fixture.group.id); expect(current.messages).toEqual([]); expect(current.reading.epoch).toBeGreaterThan(previous.epoch)
  expect(current.reading).toMatchObject({ completionCount: 0, unreadCount: 0, anchor: null, legacyCompletedUnknown: false })
  const missing = await runtime.page.evaluate(({ conversationId, aroundMessageId }) => window.boai.request('listConversationMessages', { conversationId, aroundMessageId }), { conversationId: fixture.group.id, aroundMessageId: fixture.targets.first.id })
  expect(missing).toEqual({ conversationId: fixture.group.id, items: [], targetMessageId: fixture.targets.first.id })
  const found = await runtime.page.evaluate(() => window.boai.request('searchConversations', { keyword: 'D6_DUPLICATE', scope: 'all', kinds: ['message'] }))
  expect(found.results.map(item => item.id)).toEqual([fixture.targets.independent.id])
  await expect(runtime.page.locator('.chat-panel:visible .chat-title')).toHaveText(fixture.group.title)
  await expect(runtime.page.locator('.chat-panel:visible [data-reading-message-id]')).toHaveCount(0)
  await expect(runtime.page.locator('.content-main > .banner.error')).toHaveCount(0)
  await expect(runtime.page.getByText('目标消息已不存在，不会跳到其他消息', { exact: true })).toHaveCount(0)
  await expect(runtime.page.getByText('这条结果消息已被清理或不可用。当前显示保留的聊天记录。', { exact: true })).toHaveCount(0)
  expect(runtime.errors).toEqual([])
})
When('用户删除正在定位的独立聊天后原窗口读取迟到失败', async ({ runtime, readingState }) => {
  const fixture = readingState.history!, dialog = await search(runtime, '消息', 'D6_DUPLICATE')
  await expect(dialog.locator(`[data-search-result-id="${fixture.targets.independent.id}"]`)).toBeVisible()
  const delayed = await delayNextReadingTarget(runtime, fixture.other.id, fixture.targets.independent.id)
  try {
    await dialog.locator(`[data-search-result-id="${fixture.targets.independent.id}"]`).click()
    await expect(dialog).toHaveCount(0); await expect.poll(async () => (await delayed.inspect()).claimed).toBe(true)
    await runtime.page.evaluate(id => window.boai.request('deleteConversation', { id }), fixture.other.id)
    await expect(runtime.page.locator('.conversation-stage img.empty-illustration[alt="等你开聊的小伙伴"]')).toBeVisible()
    await delayed.release(); await expect.poll(async () => (await delayed.inspect()).settled).toBe(true)
    readingState.delayedTargetRejected = (await delayed.inspect()).rejected
    await runtime.page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  } finally { await delayed.dispose() }
})
Then('已删除聊天的迟到错误不显示且会话仍为空态', async ({ runtime, readingState }) => {
  const fixture = readingState.history!
  expect(readingState.delayedTargetRejected).toBe(true)
  await expect(runtime.page.locator('.content-main > .banner.error')).toHaveCount(0)
  await expect(runtime.page.locator('.conversation-stage')).toHaveText('')
  await expect(runtime.page.locator('.conversation-stage img.empty-illustration[alt="等你开聊的小伙伴"]')).toBeVisible()
  await expect(runtime.page.locator('.chat-panel:visible')).toHaveCount(0)
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.conversations.find(item => item.id === fixture.other.id)).toBeUndefined()
  expect(await readingRecords(fixture.dataPath)).toMatchObject({ messages: [], works: [], runs: [], acceptances: [] })
  expect(runtime.errors).toEqual([])
})

Given('两位员工正在实际并行流式回复而用户回到旧历史', async ({ runtime, readingState }) => {
  const fixture = readingState.streams = await prepareReadingStreams(runtime); await openConversation(runtime, fixture.group.title)
  const list = await search(runtime, '消息', 'D6_DUPLICATE'); await list.locator(`[data-search-result-id="${historyId(17)}"]`).click()
  await expect(searchDialog(runtime)).toHaveCount(0)
  await expect(message(runtime, historyId(17))).toBeVisible()
  await expect.poll(async () => Number((await readState(runtime, fixture.group.id)).anchor?.messageId.split('-').at(-1) ?? 1000)).toBeLessThan(60)
  readingState.anchor = await savedAnchor(runtime, fixture.group.id)
  await runtime.page.evaluate(conversationId => window.boai.request('sendMessage', { conversationId, content: '请两位分别给普通聊天回复，验证阅读次序。', mentionIds: ['researcher', 'writer'], requestId: 'reading-parallel-chat' }), fixture.group.id)
  await expect.poll(() => fixture.started('researcher') && fixture.started('writer')).toBe(true)
  const current = await streamingView(runtime, fixture.group.id); readingState.a = current.messages.find(item => item.senderId === 'researcher' && item.status === 'streaming')!.id; readingState.b = current.messages.find(item => item.senderId === 'writer' && item.status === 'streaming')!.id
  expect(current.messages.find(item => item.id === readingState.a)!.sequence).toBeLessThan(current.messages.find(item => item.id === readingState.b)!.sequence)
  expect(current.reading.completionCount).toBe(0); expect(current.workItems).toEqual([])
})
When('用户离开聊天后乙先完成甲后完成', async ({ runtime, readingState }) => {
  const fixture = readingState.streams!
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  fixture.finish('writer'); await expect.poll(async () => (await readState(runtime, fixture.group.id)).completionCount).toBe(1)
  fixture.finish('researcher'); await expect.poll(async () => (await readState(runtime, fixture.group.id)).completionCount).toBe(2)
  await settled(runtime, fixture.group.id); readingState.calls = fixture.endpoint.requests.length
})
Then('完成身份按乙甲次序计数且隐藏聊天没有标已读', async ({ runtime, readingState }) => {
  const fixture = readingState.streams!, records = await readingRecords(fixture.dataPath), current = await readState(runtime, fixture.group.id)
  expect(records.completions.sort((a, b) => a.ordinal - b.ordinal)).toEqual([expect.objectContaining({ messageId: readingState.b, ordinal: 1, epoch: current.epoch }), expect.objectContaining({ messageId: readingState.a, ordinal: 2, epoch: current.epoch })])
  expect(current).toMatchObject({ boundary: 0, sparseSeen: [], unreadCount: 2, firstUnreadMessageId: readingState.b })
  expect(records.works).toEqual([]); expect(records.acceptances).toEqual([]); expect(fixture.errors).toEqual([])
})
When('用户恢复旧阅读位置并滚动阅读新回复', async ({ runtime, readingState }) => {
  const fixture = readingState.streams!; await openConversation(runtime, fixture.group.title)
  await expect(message(runtime, readingState.anchor!.anchor!.messageId)).toBeVisible()
  await expect(message(runtime, readingState.a!)).toHaveCount(0); await expect(message(runtime, readingState.b!)).toHaveCount(0)
  await expect(runtime.page.locator('.chat-header [data-unread-count]')).toHaveCount(0)
  await expect(runtime.page.locator('.chat-header').getByRole('button', { name: /返回未读|查看最新消息/ })).toHaveCount(0)
  expect((await readState(runtime, fixture.group.id)).unreadCount).toBe(2)
  const container = runtime.page.locator('.messages:visible')
  for (let page = 0; page < 8; page++) {
    if (await message(runtime, readingState.a!).count() && await message(runtime, readingState.b!).count()) break
    const lastId = await container.locator('[data-reading-message-id]').last().getAttribute('data-reading-message-id')
    await container.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll')) })
    await expect.poll(() => container.locator('[data-reading-message-id]').last().getAttribute('data-reading-message-id')).not.toBe(lastId)
    await expect(container).toHaveAttribute('aria-busy', 'false')
    expect(await container.locator('[data-reading-message-id]').count()).toBeLessThanOrEqual(80)
  }
  await message(runtime, readingState.b!).scrollIntoViewIfNeeded()
  await expect(message(runtime, readingState.b!)).toBeVisible()
  await expect.poll(async () => (await readState(runtime, fixture.group.id)).unreadCount).toBeLessThan(2)
  await message(runtime, readingState.a!).scrollIntoViewIfNeeded()
  await expect(message(runtime, readingState.a!)).toBeVisible()
  await expect.poll(async () => (await readState(runtime, fixture.group.id)).unreadCount).toBe(0)
})
Then('实际可见完成被阅读且独立锚点在重启后保留', async ({ runtime, readingState }) => {
  await expect(runtime.page.locator('.chat-header [data-unread-count]')).toHaveCount(0)
  const fixture = readingState.streams!, previous = await savedAnchor(runtime, fixture.group.id, readingState.anchor!.anchor!.revision)
  expect(previous).toMatchObject({ completionCount: 2, boundary: 2, sparseSeen: [], unreadCount: 0 })
  expect(fixture.endpoint.requests).toHaveLength(readingState.calls!); expect((await readingRecords(fixture.dataPath)).works).toEqual([])
  await runtime.restart(); await openConversation(runtime, fixture.group.title)
  await expect(message(runtime, previous.anchor!.messageId)).toBeVisible()
  expect(await readState(runtime, fixture.group.id)).toMatchObject({ epoch: previous.epoch, completionCount: 2, boundary: 2, sparseSeen: [], unreadCount: 0 })
  expect((await readingRecords(fixture.dataPath)).completions).toHaveLength(2); expect(fixture.endpoint.requests).toHaveLength(readingState.calls!)
  expect(runtime.errors).toEqual([])
})

Given('短聊天只包含一条未满屏的旧消息', async ({ runtime, readingState }) => {
  const fixture = readingState.streams = await prepareReadingStreams(runtime, 1)
  readingState.probe = await readingBrowserProbe(runtime); await openConversation(runtime, fixture.group.title)
  await expect(message(runtime, historyId(1))).toBeVisible()
  expect(await runtime.page.locator('.messages:visible').evaluate(element => element.scrollHeight - element.clientHeight)).toBeLessThanOrEqual(1)
})
When('用户向上滚动核对更早消息后收到实际长回复', async ({ runtime, readingState }) => {
  const fixture = readingState.streams!, container = runtime.page.locator('.messages:visible')
  await container.hover(); await runtime.page.mouse.wheel(0, -10_000)
  await expect.poll(async () => (await readingState.probe!()).filter(request => request.method === 'getConversationView' && 'before' in (request.input as object)).length).toBe(1)
  await expect(container).toHaveAttribute('aria-busy', 'false')
  await runtime.page.evaluate(conversationId => window.boai.request('sendMessage', { conversationId, content: '请两位分别给普通聊天长回复，验证空历史页后仍跟随。', mentionIds: ['researcher', 'writer'], requestId: 'reading-short-follow' }), fixture.group.id)
  await expect.poll(() => fixture.started('researcher') && fixture.started('writer')).toBe(true)
  fixture.finish('researcher'); fixture.finish('writer'); await settled(runtime, fixture.group.id)
  await expect(container).toContainText('READING_END_A'); await expect(container).toContainText('READING_END_B')
})
Then('新回复仍跟随底部而长消息顶部阅读不会被强制跳底', async ({ runtime, readingState }) => {
  const fixture = readingState.streams!, container = runtime.page.locator('.messages:visible')
  await expect.poll(() => container.evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight)).toBeLessThan(80)
  await container.hover(); await runtime.page.mouse.wheel(0, -100_000)
  await expect.poll(async () => (await readingState.probe!()).filter(request => request.method === 'getConversationView' && 'before' in (request.input as object)).length).toBe(2)
  await expect(container).toHaveAttribute('aria-busy', 'false')
  await expect.poll(() => container.evaluate(element => element.scrollTop)).toBeLessThan(2)
  await view(runtime, fixture.group.id)
  expect(await container.evaluate(element => element.scrollTop)).toBeLessThan(2)
  expect(await readingRecords(fixture.dataPath)).toMatchObject({ works: [], acceptances: [] }); expect(fixture.errors).toEqual([]); expect(runtime.errors).toEqual([])
})

Given('最新历史中的两位员工已经开始实际流式回复', async ({ runtime, readingState }) => {
  const fixture = readingState.streams = await prepareReadingStreams(runtime); await openConversation(runtime, fixture.group.title)
  await runtime.page.evaluate(conversationId => window.boai.request('sendMessage', { conversationId, content: '请两位分别给普通聊天回复，验证分页期间的新正文。', mentionIds: ['researcher', 'writer'], requestId: 'reading-page-live' }), fixture.group.id)
  await expect.poll(() => fixture.started('researcher') && fixture.started('writer')).toBe(true)
  const current = await streamingView(runtime, fixture.group.id)
  readingState.a = current.messages.find(item => item.senderId === 'researcher' && item.status === 'streaming')!.id
  readingState.b = current.messages.find(item => item.senderId === 'writer' && item.status === 'streaming')!.id
  await expect(runtime.page.locator('.messages:visible')).toContainText('READING_START_A'); await expect(runtime.page.locator('.messages:visible')).toContainText('READING_START_B')
  expect(await runtime.page.locator('.messages:visible [data-reading-message-id]').count()).toBeLessThanOrEqual(80)
  readingState.calls = fixture.endpoint.requests.length
  readingState.probe = await readingBrowserProbe(runtime)
})
When('较新历史响应等待期间员工继续追加正文', async ({ runtime, readingState }) => {
  const fixture = readingState.streams!, container = runtime.page.locator('.messages:visible')
  for (let page = 0; page < 2 && (page === 0 || await message(runtime, readingState.a!).count()); page++) {
    const firstId = await container.locator('[data-reading-message-id]').first().getAttribute('data-reading-message-id')
    await container.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')) })
    await expect.poll(() => container.locator('[data-reading-message-id]').first().getAttribute('data-reading-message-id')).not.toBe(firstId)
    await expect(container).toHaveAttribute('aria-busy', 'false')
  }
  await expect(message(runtime, readingState.a!)).toHaveCount(0)
  readingState.pageDelay = await delayNextReadingPage(runtime, fixture.group.id, 'after')
  await container.evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll')) })
  await expect.poll(() => readingState.pageDelay!.captured()).toBe(true); await expect(container).toHaveAttribute('aria-busy', 'true')
  fixture.append('researcher', 'READING_PAGE_NEW_STREAM_BODY\n')
  // The stale page contains the pre-publication placeholders. Complete both original
  // streams while it is held, so real public message events race with that snapshot.
  fixture.finish('researcher'); fixture.finish('writer'); await settled(runtime, fixture.group.id)
  await expect.poll(async () => (await view(runtime, fixture.group.id)).messages.find(message => message.id === readingState.a)?.content).toContain('READING_PAGE_NEW_STREAM_BODY')
  readingState.calls = fixture.endpoint.requests.length
  await readingState.pageDelay.release()
})
Then('旧分页响应不能覆盖新的流式正文且浏览仍有界', async ({ runtime, readingState }) => {
  const container = runtime.page.locator('.messages:visible')
  await expect(container).toHaveAttribute('aria-busy', 'false')
  await expect(message(runtime, readingState.a!)).toContainText('READING_PAGE_NEW_STREAM_BODY')
  expect(await container.locator('[data-reading-message-id]').count()).toBe(80)
  expect(readingState.streams!.endpoint.requests).toHaveLength(readingState.calls!); expect(readingState.streams!.errors).toEqual([])
})
When('用户在较早历史响应等待时反向滚回当前窗口底部', async ({ runtime, readingState }) => {
  const fixture = readingState.streams!, container = runtime.page.locator('.messages:visible')
  readingState.pageDelay = await delayNextReadingPage(runtime, fixture.group.id)
  await container.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')) })
  await expect.poll(() => readingState.pageDelay!.captured()).toBe(true); await expect(container).toHaveAttribute('aria-busy', 'true')
  readingState.reverseAnchor = await container.evaluate(element => {
    element.scrollTop = element.scrollHeight
    const viewport = element.getBoundingClientRect()
    const row = [...element.querySelectorAll<HTMLElement>('[data-reading-message-id]')].find(row => row.getBoundingClientRect().bottom > viewport.top)!
    const anchor = { messageId: row.dataset.readingMessageId!, top: row.getBoundingClientRect().top - viewport.top }
    element.dispatchEvent(new Event('scroll'))
    return anchor
  })
  await readingState.pageDelay.release()
})
Then('迟到页不会淘汰当前消息锚点或改变阅读位置', async ({ runtime, readingState }) => {
  const fixture = readingState.streams!, container = runtime.page.locator('.messages:visible'), anchor = readingState.reverseAnchor!
  await expect(container).toHaveAttribute('aria-busy', 'false')
  await expect(message(runtime, anchor.messageId)).toBeVisible()
  await expect.poll(() => message(runtime, anchor.messageId).evaluate(row => row.getBoundingClientRect().top - row.closest('.messages')!.getBoundingClientRect().top)).toBeCloseTo(anchor.top, 0)
  await expect(message(runtime, readingState.a!)).toContainText('READING_PAGE_NEW_STREAM_BODY')
  expect(await container.locator('[data-reading-message-id]').count()).toBeLessThanOrEqual(80)
  expect(fixture.endpoint.requests).toHaveLength(readingState.calls!); expect(fixture.errors).toEqual([])
  expect(await readingRecords(fixture.dataPath)).toMatchObject({ works: [], acceptances: [] }); expect(runtime.errors).toEqual([])
})

Given('原工作与明确修订已经发布两版同名报告', async ({ runtime, readingState }) => {
  const fixture = readingState.files = await prepareArtifactsDesktop(runtime)
  await runtime.page.evaluate(conversationId => window.boai.request('sendMessage', { conversationId, content: '请发布可检查的报告。', mentionIds: [], requestId: 'reading-file-v1' }), fixture.group.id)
  const first = (await settled(runtime, fixture.group.id, 1)).artifacts[0] as ArtifactVersion
  await openConversation(runtime, fixture.group.title); await message(runtime, first.sourceMessageId!).getByRole('button', { name: `打开 ${first.name}`, exact: true }).click()
  await runtime.page.locator(`.messages [data-chat-artifact-id="${first.id}"]`).getByRole('button', { name: '要求修改', exact: true }).click()
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('保留原报告并补充说明，发布修订版。')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  readingState.artifacts = (await settled(runtime, fixture.group.id, 2)).artifacts as ArtifactVersion[]
  expect(readingState.artifacts.find(item => item.contentVersion === 2)!.previousArtifactId).toBe(first.id); readingState.calls = fixture.endpoint.requests.length
})
When('用户搜索文件名并打开第一版结果', async ({ runtime, readingState }) => {
  const first = readingState.artifacts!.find(item => item.contentVersion === 1)!, list = await search(runtime, '文件', '交付报告.md')
  await expect(list.locator('[data-search-kind="artifact"]')).toHaveCount(2)
  const row = list.locator(`[data-search-result-id="${first.id}"]`); await expect(row).toContainText('第 1 版'); await row.click()
  await expect(searchDialog(runtime)).toHaveCount(0)
  readingState.target = { kind: 'artifact', conversationId: first.conversationId, artifactId: first.id, logicalArtifactId: first.logicalArtifactId, contentVersion: first.contentVersion, contentHash: first.contentHash }
})
Then('预览仍是原版且查询没有采用成果', async ({ runtime, readingState }) => {
  const first = readingState.artifacts!.find(item => item.contentVersion === 1)!, panel = artifact(runtime, first.id)
  await expect(panel.getByRole('region', { name: '文件正文', exact: true })).toContainText('ARTIFACT_V1')
  await expect(panel.getByRole('region', { name: '文件正文', exact: true })).not.toContainText('ARTIFACT_V2')
  const records = await readingRecords(readingState.files!.dataPath); expect(records.works).toHaveLength(2); expect(records.acceptances).toEqual([])
  expect(readingState.files!.endpoint.requests).toHaveLength(readingState.calls!)
})
When('第一版受管原件被外部改变后再次核对结果', async ({ runtime, readingState }) => {
  const first = readingState.artifacts!.find(item => item.contentVersion === 1)!; await writeFile(first.path, '# 外部改变\nEXTERNAL_D6_CHANGED_BYTES\n')
  await search(runtime, '文件', '交付报告'); await search(runtime, '文件', '交付报告.md')
})
Then('失效结果不展示旧正文也不猜测跳到新版', async ({ runtime, readingState }) => {
  const first = readingState.artifacts!.find(item => item.contentVersion === 1)!, second = readingState.artifacts!.find(item => item.contentVersion === 2)!
  const resolved = await runtime.page.evaluate(target => window.boai.request('resolveConversationSearchTarget', target), readingState.target!)
  expect(resolved).toMatchObject({ id: first.id, status: 'unavailable', target: readingState.target }); expect(resolved.name).toBeUndefined(); expect(resolved.excerpt).toBeUndefined(); expect(resolved.reason).toBeTruthy()
  const row = runtime.page.locator(`[data-search-result-id="${first.id}"]:visible`); await expect(row).toBeDisabled(); await expect(row).not.toContainText('ARTIFACT_V1')
  await expect(artifact(runtime, first.id).getByRole('region', { name: '文件正文', exact: true })).toHaveCount(0)
  await expect(artifact(runtime, first.id)).not.toContainText('ARTIFACT_V1')
  await expect(artifact(runtime, second.id)).toHaveCount(0)
  const preview = await runtime.page.evaluate(async id => { try { await window.boai.request('getArtifactPreview', { id }); return 'accepted' } catch (error) { return String(error) } }, first.id)
  expect(preview).not.toBe('accepted'); expect(readingState.files!.endpoint.requests).toHaveLength(readingState.calls!); expect(runtime.errors).toEqual([])
})
