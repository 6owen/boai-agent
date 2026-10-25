/*
 * [OUTPUT]: 文件源码/预览使用header图标切换；原阅读/来源和无业务写入断言保持。
 * [OUTPUT]: 各关键节点仅用无rect的原生capturePage整幅截取与窗口/zoom/PNG元数据；旧layout5几何通过但缩放PNG可能裁切的证据缺口独立保留。
 * [INPUT]: 中文布局矩阵、既有真实材料/成果协议fixture、原生Electron窗口及生产工作视图。
 * [OUTPUT]: 五份真实工具交付和一个真实等待Work的九组合关键帧；看板全列适配时核列/主动作完整，实际溢出才滚动；无详情按钮核实无可见详情，恢复失败不覆盖原阶段；即时原件/实际等待/原生尺寸/卡片矩形/键盘/局部滚动后回可读源码首行留证、实际标签关闭和零业务变更。
 * [POS]: 工作视图可视验收步骤；只控制离线模型协议及原生尺寸/zoom，不改CSS、仓库或业务实现；200%不表示外观配置已支持。
 * [PROTOCOL]: 修改时同步Header及所属.folder.md。
 */
import { expect, type Locator, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { join } from 'node:path'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { artifactDetail, artifactRecords, prepareArtifactsDesktop } from '../support/artifacts'
import { nextMaterialDialog } from '../support/materials'
import { messageDraft } from '../support/editor-controls'
import type { ArtifactVersion } from '../../../packages/shared/src/domain/artifacts'
import type { ConversationDetail, WorkItem } from '../../../packages/shared/src/domain'

interface State {
  fixture?: Awaited<ReturnType<typeof prepareArtifactsDesktop>>
  artifacts?: ArtifactVersion[]
  waiting?: WorkItem
  questionId?: string
  before?: Awaited<ReturnType<typeof artifactRecords>>
  calls?: number
  attempts: { width: number; height: number; zoom: number; completed: boolean }[]
  failures: { combination: string; stage: string; error: string }[]
}
export const test = base.extend<{ workLayout: State }>({ workLayout: async ({}, use) => use({ attempts: [], failures: [] }) })
const { Given, When, Then } = createBdd(test)
const draft = '布局检查保留的原会话草稿，不提交。'
const markdown = ['# 工作视图真实布局交付', '', 'LAYOUT_DELIVERY：由实际文件工具发布的原件。', '',
  ...Array.from({ length: 40 }, (_, index) => `第 ${index + 1} 项检查：真实来源、独立工作、原消息和明确文件身份。\n`),
  '| 文件 | 版本 | 来源 | 工作 | 员工 | 日期 | 校验 | 状态 | 记录 | 说明 |',
  '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  '| 明确原件 | 固定版本 | 原消息 | 真实工作 | 成果作者 | 实际日期 | SHA256 | 只读 | 独立记录 | 长表格只在局部滚动 |', '',
  '```typescript', `export const layoutEvidence = "${'LONG_CODE_LOCAL_SCROLL_'.repeat(18)}"`, '```', '', 'LAYOUT_END：局部正文末尾。'].join('\n')
const main = (page: Page) => page.getByRole('navigation', { name: '主导航', exact: true })
const chat = (page: Page) => page.locator('.chat-panel:visible')
const files = (page: Page) => chat(page).getByRole('region', { name: '会话文件', exact: true })
const tasks = (page: Page) => chat(page).getByRole('region', { name: '任务工作视图', exact: true })
const globalTasks = (page: Page) => page.getByRole('main', { name: '全局任务', exact: true })
const work = (parent: Locator, id: string) => parent.locator(`[data-work-id="${id}"]`)

async function keyboardActivate(page: Page, target: Locator) {
  await expect(target).toBeEnabled()
  if (await target.getAttribute('role') === 'tab') {
    const list = target.locator('xpath=ancestor::*[@role="tablist"][1]')
    const indices = await target.evaluate(element => { const tabs = [...element.closest('[role="tablist"]')!.querySelectorAll('[role="tab"]')]; return { current: tabs.findIndex(tab => tab.getAttribute('aria-selected') === 'true'), next: tabs.indexOf(element) } })
    expect(indices.current).toBeGreaterThanOrEqual(0)
    await list.getByRole('tab', { selected: true }).focus()
    for (let index = 0; index < Math.abs(indices.next - indices.current); index++) await page.keyboard.press(indices.next > indices.current ? 'ArrowRight' : 'ArrowLeft')
    await page.keyboard.press('Enter'); await expect(target).toHaveAttribute('aria-selected', 'true'); await reachable(target)
    return
  }
  await target.scrollIntoViewIfNeeded()
  await reachable(target)
  expect(await target.evaluate(element => (element as HTMLElement).tabIndex)).toBeGreaterThanOrEqual(0)
  await target.focus(); await expect(target).toBeFocused(); await page.keyboard.press('Enter')
}
/** Visibility alone misses flex-shrunk cards whose buttons overflow their actual bounds. */
async function reachable(target: Locator, card?: Locator) {
  await expect(target).toBeVisible()
  const bounds = await target.evaluate(element => {
    const rect = element.getBoundingClientRect(), x = rect.left + rect.width / 2, y = rect.top + rect.height / 2
    const hit = document.elementFromPoint(x, y)
    return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height, viewport: { width: innerWidth, height: innerHeight }, hit: Boolean(hit && (hit === element || element.contains(hit))) }
  })
  expect(bounds.width).toBeGreaterThan(0); expect(bounds.height).toBeGreaterThan(0)
  expect(bounds.left).toBeGreaterThanOrEqual(-1); expect(bounds.top).toBeGreaterThanOrEqual(-1)
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewport.width + 1); expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewport.height + 1)
  expect(bounds.hit).toBe(true)
  if (card) {
    const rect = await card.boundingBox(); expect(rect).not.toBeNull()
    expect(bounds.left).toBeGreaterThanOrEqual(rect!.x - 1); expect(bounds.right).toBeLessThanOrEqual(rect!.x + rect!.width + 1)
    expect(bounds.top).toBeGreaterThanOrEqual(rect!.y - 1); expect(bounds.bottom).toBeLessThanOrEqual(rect!.y + rect!.height + 1)
  }
}
async function nativeWindow(runtime: Desktop) {
  return runtime.app.evaluate(({ BrowserWindow, WebContentsView, screen }) => {
    const window = BrowserWindow.getAllWindows()[0], bounds = window.getBounds(), display = screen.getDisplayMatching(bounds)
    const pageView = [window.contentView, ...window.contentView.children].find((view): view is Electron.WebContentsView => view instanceof WebContentsView && view.webContents.id === window.webContents.id)
    return { contentSize: window.getContentSize(), bounds, contentBounds: window.getContentBounds(), contentViewBounds: window.contentView.getBounds(), webContentsViewBounds: pageView?.getBounds() ?? null, zoom: window.webContents.getZoomFactor(), display: { bounds: display.bounds, workArea: display.workArea, scaleFactor: display.scaleFactor } }
  })
}
async function rendererWindow(runtime: Desktop) {
  return runtime.page.evaluate(() => ({ width: innerWidth, height: innerHeight, outerWidth, outerHeight, devicePixelRatio, visualViewport: visualViewport && { width: visualViewport.width, height: visualViewport.height, scale: visualViewport.scale } }))
}
async function setWindow(runtime: Desktop, width: number, height: number, zoom: number) {
  await runtime.app.evaluate(({ BrowserWindow }, value) => { const window = BrowserWindow.getAllWindows()[0]; window.setContentSize(value.width, value.height); window.webContents.setZoomFactor(value.zoom) }, { width, height, zoom })
  try {
    await expect.poll(async () => (await nativeWindow(runtime)).zoom).toBeCloseTo(zoom, 5)
    await expect.poll(async () => {
      const native = await nativeWindow(runtime), viewport = await rendererWindow(runtime)
      return Math.max(Math.abs(native.contentSize[0] - width), Math.abs(viewport.width * native.zoom - native.contentSize[0]))
    }).toBeLessThanOrEqual(1.5)
  } finally {
    const native = await nativeWindow(runtime), viewport = await rendererWindow(runtime)
    // The OS can constrain the requested height. Actual viewport bounds govern every UI check.
    await runtime.reviewData(`原生窗口尺寸核对 ${width}×${height} · ${zoom * 100}%`, { requested: { width, height, zoom }, native, renderer: viewport, differences: { nativeHeightMinusRequested: native.contentSize[1] - height, nativeHeightMinusRendered: native.contentSize[1] - viewport.height * native.zoom, webContentsHeightMinusRendered: native.webContentsViewBounds ? native.webContentsViewBounds.height - viewport.height * native.zoom : null }, heightConclusion: 'Requested fixture height is not assumed to equal the rendered height; all raw bounds retained. The prior 40px difference remains unattributed until this native evidence is inspected. A null WebContentsView bound means no matching public child view was available, not a guessed size.' })
  }
}
async function windowEvidence(runtime: Desktop) {
  const native = await nativeWindow(runtime)
  const layout = await runtime.page.evaluate(() => {
    const shell = document.querySelector('.app-shell')!.getBoundingClientRect(), frame = document.querySelector('.content-frame')!.getBoundingClientRect()
    const scrollers = [...document.querySelectorAll<HTMLElement>('[data-slot="scroll-fade"], [aria-label="任务看板"], .contacts-detail, pre.shiki-code-block')].filter(element => element.getClientRects().length).map(element => ({ label: element.getAttribute('aria-label') ?? element.className, width: element.clientWidth, height: element.clientHeight, scrollWidth: element.scrollWidth, scrollHeight: element.scrollHeight, left: element.scrollLeft, top: element.scrollTop }))
    return { viewport: { width: innerWidth, height: innerHeight }, shell: { right: shell.right, bottom: shell.bottom }, frame: { right: frame.right, bottom: frame.bottom }, document: { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, left: scrollX, top: scrollY }, scrollers }
  })
  expect(layout.document.width).toBeLessThanOrEqual(layout.viewport.width + 1); expect(layout.document.height).toBeLessThanOrEqual(layout.viewport.height + 1)
  expect(layout.document.left).toBe(0); expect(layout.document.top).toBe(0)
  expect(Math.abs(layout.shell.right - layout.viewport.width)).toBeLessThanOrEqual(1.5); expect(Math.abs(layout.shell.bottom - layout.viewport.height)).toBeLessThanOrEqual(1.5)
  return { native, layout }
}
async function closeDetails(runtime: Desktop) {
  const button = runtime.page.getByRole('button', { name: '显示或隐藏详情', exact: true })
  if (await button.count() === 0) {
    await expect(runtime.page.locator('.detail-panel:visible')).toHaveCount(0)
    await expect(runtime.page.locator('.file-preview-detail:visible, [data-artifact-id]:visible, [data-file-preview-kind]:visible')).toHaveCount(0)
    return
  }
  if (await button.getAttribute('aria-pressed') === 'true') await keyboardActivate(runtime.page, button)
}
async function listShown(runtime: Desktop, kind: '会话' | '通讯录', shown: boolean) {
  const button = runtime.page.getByRole('button', { name: `显示或隐藏${kind}列表`, exact: true })
  if ((await button.getAttribute('aria-pressed') === 'true') !== shown) await keyboardActivate(runtime.page, button)
}
async function pane(runtime: Desktop, label: '聊天' | '任务' | '文件') {
  const labels = ['聊天', '任务', '文件'], tabs = chat(runtime.page).getByRole('tablist', { name: '会话视图', exact: true })
  const current = labels.indexOf(await tabs.getByRole('tab', { selected: true }).innerText()), next = labels.indexOf(label)
  await tabs.getByRole('tab', { selected: true }).focus()
  for (let index = 0; index < Math.abs(next - current); index++) await runtime.page.keyboard.press(next > current ? 'ArrowRight' : 'ArrowLeft')
  await runtime.page.keyboard.press('Enter')
  await expect(chat(runtime.page)).toHaveAttribute('data-conversation-view', { 聊天: 'chat', 任务: 'tasks', 文件: 'files' }[label])
  await reachable(tabs.getByRole('tab', { name: label, exact: true }))
}
async function localScroll(runtime: Desktop, scroller: Locator, horizontal = false) {
  const size = await scroller.evaluate((element, horizontal) => ({ client: horizontal ? element.clientWidth : element.clientHeight, scroll: horizontal ? element.scrollWidth : element.scrollHeight }), horizontal)
  expect(size.client).toBeGreaterThan(0); expect(size.scroll).toBeGreaterThan(size.client)
  await scroller.hover(); await runtime.page.mouse.wheel(horizontal ? -10000 : 0, horizontal ? 0 : -10000)
  await expect.poll(() => scroller.evaluate((element, horizontal) => horizontal ? element.scrollLeft : element.scrollTop, horizontal)).toBe(0)
  await runtime.page.mouse.wheel(horizontal ? 900 : 0, horizontal ? 0 : 700)
  await expect.poll(() => scroller.evaluate((element, horizontal) => horizontal ? element.scrollLeft : element.scrollTop, horizontal)).toBeGreaterThan(0)
  expect(await runtime.page.evaluate(() => ({ left: scrollX, top: scrollY }))).toEqual({ left: 0, top: 0 })
}
async function cardButtons(runtime: Desktop, parent: Locator, ids: string[], attribute: 'work' | 'file', name: string) {
  for (const id of ids) {
    const card = parent.locator(`[data-${attribute}-id="${id}"]`), button = card.getByRole('button', { name, exact: true })
    await button.scrollIntoViewIfNeeded(); await reachable(button, card)
  }
}
async function boardLayout(runtime: Desktop, board: Locator) {
  const size = await board.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth, left: element.scrollLeft }))
  expect(size.client).toBeGreaterThan(0)
  const columns = board.locator(':scope > section'); await expect(columns).toHaveCount(5)
  if (size.scroll > size.client) {
    await localScroll(runtime, board, true)
    return { mode: 'actual-overflow', before: size, after: await board.evaluate(element => ({ client: element.clientWidth, scroll: element.scrollWidth, left: element.scrollLeft })) }
  }
  expect(size.left).toBe(0)
  const frame = await board.boundingBox(); expect(frame).not.toBeNull()
  const bounds = []
  for (const column of await columns.all()) {
    const rect = await column.boundingBox(); expect(rect).not.toBeNull()
    expect(rect!.x).toBeGreaterThanOrEqual(frame!.x - 1); expect(rect!.x + rect!.width).toBeLessThanOrEqual(frame!.x + frame!.width + 1)
    await reachable(column.getByRole('heading'))
    for (const card of await column.locator('[data-work-id]').all()) {
      const button = card.getByRole('button', { name: '查看原聊天', exact: true })
      await button.scrollIntoViewIfNeeded(); await reachable(button, card); await reachable(button, column)
    }
    bounds.push({ name: await column.getAttribute('aria-label'), ...rect! })
  }
  expect(await board.evaluate(element => element.scrollLeft)).toBe(0)
  expect(await runtime.page.evaluate(() => ({ left: scrollX, top: scrollY }))).toEqual({ left: 0, top: 0 })
  return { mode: 'all-five-columns-fit', size, columns: bounds }
}

Given('工作视图布局已有真实材料五份交付和一个等待工作', async ({ runtime, workLayout }) => {
  test.setTimeout(360_000)
  const protocol = { askForSupplement: false, file: { name: '工作视图长报告.md', fileName: 'layout-report.md', content: markdown } }
  const fixture = workLayout.fixture = await prepareArtifactsDesktop(runtime, protocol)
  const archived = new Set<string>()
  const preserveOriginals = async (detail: ConversationDetail) => {
    for (const material of detail.materials ?? []) if (material.messageId && material.contentHash && !archived.has(material.id)) {
      await runtime.reviewFile(`布局已发送输入原件 ${material.id}`, join(fixture.dataPath, 'materials', fixture.group.id, material.id, 'original')); archived.add(material.id)
    }
    for (const artifact of detail.artifacts) if (artifact.id && artifact.sourceMessageId && artifact.contentHash && !archived.has(artifact.id)) {
      await runtime.reviewFile(`布局已发布独立原件 ${artifact.id}`, artifact.path); archived.add(artifact.id)
    }
  }
  try {
  await setWindow(runtime, 1340, 900, 1)
  await keyboardActivate(runtime.page, main(runtime.page).getByRole('button', { name: '会话', exact: true }))
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${fixture.group.title}`) }).click()
  await nextMaterialDialog(runtime, { path: fixture.source })
  await keyboardActivate(runtime.page, runtime.page.getByRole('button', { name: '添加或更多操作', exact: true }))
  await runtime.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
  await expect(runtime.page.locator('[data-material-draft-id]')).toHaveAttribute('data-material-status', 'ready')
  for (let index = 1; index <= 5; index++) {
    await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(`第${index}份明确独立文件任务：发布可检查的工作视图长报告。`)
    await keyboardActivate(runtime.page, runtime.page.getByRole('button', { name: '发送消息', exact: true }))
    if (index === 1) {
      await expect.poll(async () => (await artifactDetail(runtime, fixture.group.id)).materials?.filter(material => material.messageId && material.contentHash).length).toBe(1)
      const sent = await artifactDetail(runtime, fixture.group.id); await preserveOriginals(sent)
      await runtime.reviewData('布局输入材料实际提交，先保留原件', { materials: sent.materials, messages: sent.messages.filter(message => message.materialIds?.length) })
    }
    await expect.poll(async () => { const detail = await artifactDetail(runtime, fixture.group.id); return detail.artifacts.length === index && detail.workItems?.filter(work => work.status === 'delivered').length === index && detail.runs.every(run => run.status === 'completed') && detail.turns!.every(turn => turn.status === 'completed') }, { timeout: 30_000 }).toBe(true)
    const completed = await artifactDetail(runtime, fixture.group.id); await preserveOriginals(completed)
    await runtime.reviewData(`布局准备实际完成 ${index} 份交付`, { workItems: completed.workItems, runs: completed.runs, turns: completed.turns, artifacts: completed.artifacts, archivedIds: [...archived] })
  }
  // Only the existing offline protocol changes its next decision; the host creates the real waiting Work.
  protocol.askForSupplement = true
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('第六份独立文件任务：交付对象不清楚，先明确提问。')
  await keyboardActivate(runtime.page, runtime.page.getByRole('button', { name: '发送消息', exact: true }))
  await expect.poll(async () => {
    const detail = await artifactDetail(runtime, fixture.group.id), waiting = detail.workItems?.filter(work => work.status === 'waiting') ?? []
    const owner = waiting[0], question = owner?.userQuestion, message = detail.messages.find(message => message.id === question?.messageId)
    const run = detail.runs.find(run => run.id === message?.runId), turn = detail.turns?.find(turn => turn.id === message?.turnId)
    return detail.workItems?.length === 6 && detail.workItems.filter(work => work.status === 'delivered').length === 5 && detail.artifacts.length === 5
      && waiting.length === 1 && Boolean(question && !question.answeredMessageId && message?.status === 'completed' && message.senderType === 'agent' && message.senderId === owner.ownerAgentId && message.content.includes(question.content) && owner.resultMessageIds.includes(message.id)
        && run?.status === 'completed' && run.workId === owner.id && run.agentId === owner.ownerAgentId && run.messageId === message.id && run.triggerMessageId === owner.sourceMessageId
        && turn?.status === 'waiting_user' && run.turnId === turn.id && turn.triggerMessageId === owner.sourceMessageId)
      && detail.runs.every(run => run.status === 'completed') && detail.turns?.length === 6
      && detail.turns.filter(item => item.id !== turn?.id).length === 5 && detail.turns.filter(item => item.id !== turn?.id).every(item => item.status === 'completed')
  }, { timeout: 30_000 }).toBe(true)
  const detail = await artifactDetail(runtime, fixture.group.id)
  workLayout.artifacts = detail.artifacts as ArtifactVersion[]; workLayout.waiting = detail.workItems!.find(work => work.status === 'waiting')!
  workLayout.questionId = workLayout.waiting.userQuestion!.messageId
  expect(workLayout.questionId).toBeTruthy(); expect(fixture.errors).toEqual([])
  expect(detail.materials).toHaveLength(1); expect(new Set(workLayout.artifacts.map(artifact => artifact.sourceWorkId)).size).toBe(5)
  workLayout.before = await artifactRecords(fixture.dataPath); workLayout.calls = fixture.endpoint.requests.length
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill(draft)
  await runtime.reviewData('布局矩阵准备：实际生产工具/事务，供应商协议离线控制', { workItems: detail.workItems, artifacts: workLayout.artifacts, materials: detail.materials, questionId: workLayout.questionId, modelProtocolRequests: workLayout.calls, nativeZoomNote: '200% is direct Electron stress coverage, not saved appearance support or human acceptance' })
  await runtime.reviewNativeCheckpoint('工作视图真实五份交付与原员工等待问题')
  } finally {
    try {
      const detail = await artifactDetail(runtime, fixture.group.id)
      await runtime.reviewData('布局准备实际Work运行轮次：成功与失败均保留', { conversationId: fixture.group.id, workItems: detail.workItems, runs: detail.runs, turns: detail.turns, messages: detail.messages.map(({ id, runId, turnId, senderId, senderType, status, content }) => ({ id, runId, turnId, senderId, senderType, status, content })), artifactIds: detail.artifacts.map(artifact => artifact.id), protocolErrors: fixture.errors })
      await preserveOriginals(detail)
    } catch (error) { await runtime.reviewData('布局准备状态读取或原件留证失败', { conversationId: fixture.group.id, error: String(error), protocolErrors: fixture.errors, archivedIds: [...archived] }) }
  }
})

When('用户逐组合检查工作视图的三种原生宽度和三种实际缩放', async ({ runtime, workLayout }) => {
  const fixture = workLayout.fixture!, artifacts = workLayout.artifacts!, ids = artifacts.map(artifact => artifact.sourceWorkId!), original = artifacts[0]
  for (const [width, height] of [[1340, 900], [1124, 800], [760, 800]]) for (const zoom of [1, 1.25, 2]) {
    const combination = `${width}×${height} · ${zoom * 100}%`, attempt = { width, height, zoom, completed: false }; workLayout.attempts.push(attempt)
    let stage = '原生窗口'
    try {
      await setWindow(runtime, width, height, zoom)
      stage = '聊天主入口与原消息动作'
      await keyboardActivate(runtime.page, main(runtime.page).getByRole('button', { name: '会话', exact: true })); await closeDetails(runtime); await listShown(runtime, '会话', false); await pane(runtime, '聊天')
      const composer = runtime.page.getByRole('textbox', { name: '消息内容', exact: true })
      await composer.scrollIntoViewIfNeeded(); await reachable(composer); expect(await messageDraft(composer)).toBe(draft)
      await reachable(runtime.page.getByRole('button', { name: '发送消息', exact: true }))
      const originalCard = chat(runtime.page).locator(`[data-chat-artifact-id="${original.id}"]`)
      await keyboardActivate(runtime.page, originalCard.getByRole('button', { name: '要求修改', exact: true }))
      await expect(chat(runtime.page).locator('[aria-label="修改交付文件"]')).toContainText('第 1 版')
      await keyboardActivate(runtime.page, runtime.page.getByRole('button', { name: '取消成果修改', exact: true }))
      await localScroll(runtime, chat(runtime.page).locator('.messages'))
      await runtime.reviewData(`${combination} · 聊天布局`, await windowEvidence(runtime)); await runtime.reviewNativeCheckpoint(`${combination} · 原聊天动作及输入框可达`)

      stage = '会话任务多卡片'
      await pane(runtime, '任务'); await expect(tasks(runtime.page).locator('[data-work-id]')).toHaveCount(6)
      await cardButtons(runtime, tasks(runtime.page), [...ids, workLayout.waiting!.id], 'work', '查看原聊天')
      await localScroll(runtime, tasks(runtime.page).locator('[data-slot="scroll-fade"]').first())
      await runtime.reviewData(`${combination} · 会话任务布局`, await windowEvidence(runtime)); await runtime.reviewNativeCheckpoint(`${combination} · 会话任务多卡片自然高度与局部滚动`)

      stage = '会话文件多卡片与只读预览'
      await pane(runtime, '文件'); await expect(files(runtime.page).locator('[data-file-id]')).toHaveCount(6)
      await cardButtons(runtime, files(runtime.page), artifacts.map(artifact => artifact.id), 'file', '预览')
      await localScroll(runtime, files(runtime.page).locator('[data-slot="scroll-fade"]').first())
      await runtime.reviewData(`${combination} · 文件列表布局`, await windowEvidence(runtime)); await runtime.reviewNativeCheckpoint(`${combination} · 文件清单与独立原件`)
      await keyboardActivate(runtime.page, files(runtime.page).locator(`[data-file-id="${original.id}"]`).getByRole('button', { name: '预览', exact: true }))
      const preview = runtime.page.locator(`[data-artifact-id="${original.id}"]:visible`)
      await expect(preview).toContainText('LAYOUT_DELIVERY')
      expect(await preview.boundingBox()).not.toBeNull()
      const rect = await preview.boundingBox(), viewport = await runtime.page.evaluate(() => ({ width: innerWidth, height: innerHeight }))
      expect(rect!.width).toBeGreaterThan(0); expect(rect!.height).toBeGreaterThan(0); expect(rect!.x).toBeGreaterThanOrEqual(0); expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width + 1)
      await expect(preview.getByRole('button', { name: /^(采用此版本|要求修改|允许这次执行)$/ })).toHaveCount(0)
      await keyboardActivate(runtime.page, preview.getByRole('button', { name: '显示源码', exact: true }))
      await expect(preview.locator('.shiki-token').first()).toBeAttached()
      const body = preview.locator('[data-slot="scroll-fade"]').first()
      await localScroll(runtime, body)
      await localScroll(runtime, preview.locator('pre.shiki-code-block'), true)
      const scrolledPreviewLayout = await windowEvidence(runtime)
      await preview.locator('pre.shiki-code-block').hover(); await runtime.page.mouse.wheel(-10000, 0)
      await expect.poll(() => preview.locator('pre.shiki-code-block').evaluate(element => element.scrollLeft)).toBe(0)
      await body.hover(); await runtime.page.mouse.wheel(0, -10000)
      await expect.poll(() => body.evaluate(element => element.scrollTop)).toBe(0)
      await expect(preview.locator('[data-file-line="1"]')).toBeInViewport()
      await reachable(runtime.page.getByRole('button', { name: '显示或隐藏详情', exact: true }))
      const closePreview = runtime.page.getByRole('button', { name: '关闭详情', exact: true })
      await reachable(closePreview)
      await runtime.reviewData(`${combination} · 原版只读预览布局`, { scrolled: scrolledPreviewLayout, readable: await windowEvidence(runtime) }); await runtime.reviewNativeCheckpoint(`${combination} · Markdown源码Shiki与局部双向滚动`)
      await keyboardActivate(runtime.page, closePreview)
      await expect(preview).toHaveCount(0)
      await closeDetails(runtime)

      stage = '全局看板和列表多卡片'
      await keyboardActivate(runtime.page, main(runtime.page).getByRole('button', { name: '任务', exact: true }))
      const global = globalTasks(runtime.page)
      await keyboardActivate(runtime.page, global.getByRole('tab', { name: '看板', exact: true }))
      const board = global.locator('[aria-label="任务看板"]'), delivered = board.getByRole('region', { name: '已交付', exact: true })
      await expect(delivered.locator('[data-work-id]')).toHaveCount(5)
      await cardButtons(runtime, delivered, ids, 'work', '查看原聊天')
      await localScroll(runtime, delivered.locator('[data-slot="scroll-fade"]').first())
      const boardEvidence = await boardLayout(runtime, board)
      await runtime.reviewData(`${combination} · 全局看板布局`, { ...await windowEvidence(runtime), board: boardEvidence }); await runtime.reviewNativeCheckpoint(`${combination} · 五列适配或真实横向滚动及交付列自然高度`)
      await keyboardActivate(runtime.page, global.getByRole('tab', { name: '列表', exact: true }))
      await expect(global.locator('[data-work-id]')).toHaveCount(6); await cardButtons(runtime, global, [...ids, workLayout.waiting!.id], 'work', '查看原聊天')
      await localScroll(runtime, global.locator('[data-slot="scroll-fade"]').first())
      await runtime.reviewData(`${combination} · 全局列表布局`, await windowEvidence(runtime)); await runtime.reviewNativeCheckpoint(`${combination} · 全局六卡片主按钮在卡内`)
      await keyboardActivate(runtime.page, work(global, original.sourceWorkId!).getByRole('button', { name: '查看原聊天', exact: true }))
      await expect(chat(runtime.page).locator(`#message-${workLayout.before!.workItems.find(work => work.id === original.sourceWorkId)!.sourceMessageId}`)).toBeInViewport()

      stage = '员工概览与当前实际工作'
      await keyboardActivate(runtime.page, main(runtime.page).getByRole('button', { name: '通讯录', exact: true })); await listShown(runtime, '通讯录', true)
      await keyboardActivate(runtime.page, runtime.page.getByRole('complementary', { name: '通讯录列表', exact: true }).getByRole('button', { name: '成果作者', exact: true }))
      await listShown(runtime, '通讯录', false)
      const profile = runtime.page.getByRole('region', { name: '通讯录详情', exact: true })
      await expect(profile.getByRole('heading', { name: '成果作者', exact: true })).toBeAttached()
      await expect(profile.getByRole('region', { name: '员工实际能力', exact: true })).toContainText('配置存在不代表连接或输出效果已验证')
      await expect(profile.locator('[data-work-id]')).toHaveCount(1)
      await localScroll(runtime, profile)
      const current = work(profile, workLayout.waiting!.id), question = current.getByRole('button', { name: '查看问题', exact: true })
      await question.scrollIntoViewIfNeeded(); await reachable(question, current)
      const allTasks = profile.getByRole('button', { name: '查看全部任务', exact: true }); await allTasks.scrollIntoViewIfNeeded(); await reachable(allTasks)
      await allTasks.focus(); await runtime.page.keyboard.press('Tab'); await runtime.page.keyboard.press('Shift+Tab'); await expect(allTasks).toBeFocused()
      await runtime.reviewData(`${combination} · 员工概览布局`, await windowEvidence(runtime)); await runtime.reviewNativeCheckpoint(`${combination} · 员工实际能力与原等待工作`)
      await keyboardActivate(runtime.page, question)
      const message = chat(runtime.page).locator(`#message-${workLayout.questionId}`)
      await expect(message).toBeInViewport(); await expect(message.getByRole('button', { name: '回复此问题', exact: true })).toBeVisible()
      attempt.completed = true
    } catch (error) {
      workLayout.failures.push({ combination, stage, error: String(error) })
      await runtime.reviewData(`${combination} · 实际布局失败`, { stage, error: String(error), native: await runtime.app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; return { size: window.getContentSize(), zoom: window.webContents.getZoomFactor() } }) })
      await runtime.reviewNativeCheckpoint(`${combination} · 失败原画面 · ${stage}`)
      // Restore only the native test window so later combinations still leave independent evidence.
      try { await setWindow(runtime, 1340, 900, 1); await closeDetails(runtime) }
      catch (recoveryError) {
        workLayout.failures.push({ combination, stage: `恢复窗口（原阶段：${stage}）`, error: String(recoveryError) })
        await runtime.reviewData(`${combination} · 恢复也失败，保留原阶段`, { originalStage: stage, originalError: String(error), recoveryError: String(recoveryError) })
        await runtime.reviewNativeCheckpoint(`${combination} · 恢复失败原画面`)
      }
    }
  }
  try { await setWindow(runtime, 1340, 900, 1) }
  catch (error) { workLayout.failures.push({ combination: '矩阵结束', stage: '恢复原生窗口', error: String(error) }); await runtime.reviewData('矩阵结束恢复失败，不覆盖此前阶段', { error: String(error), failures: workLayout.failures }) }
})

Then('工作视图入口键盘滚动与原消息身份完整且没有业务提交', async ({ runtime, workLayout }) => {
  const fixture = workLayout.fixture!, after = await artifactRecords(fixture.dataPath)
  expect(after.workItems).toEqual(workLayout.before!.workItems); expect(after.messages).toEqual(workLayout.before!.messages); expect(after.artifacts).toEqual(workLayout.before!.artifacts)
  expect(after.adoptionEvents).toEqual([]); expect(after.revisions).toEqual([]); expect(fixture.endpoint.requests).toHaveLength(workLayout.calls!); expect(fixture.errors).toEqual([]); expect(runtime.errors).toEqual([])
  await runtime.reviewData('工作视图原生九组合完整结论', { attempts: workLayout.attempts, failures: workLayout.failures, workIds: after.workItems.map(work => work.id), artifacts: after.artifacts.map(({ id, contentHash, sourceMessageId, sourceWorkId }) => ({ id, contentHash, sourceMessageId, sourceWorkId })), modelProtocolRequestsBefore: workLayout.calls, modelProtocolRequestsAfter: fixture.endpoint.requests.length, savedAppearanceSupport: 'unchanged; direct native 200% stress check only', screenshotSource: 'Electron.webContents.capturePage()无rect；各关键帧保留原生窗口/zoom/PNG尺寸与原始字节，实际全幅画面仍供审阅', priorScreenshotGap: 'layout5几何及九组合通过，但原Playwright缩放PNG可能只截左上区域；旧原件保留，该通过不能充当完整缩放截图证据', humanVerdict: 'pending' })
  expect(workLayout.attempts).toHaveLength(9); expect(workLayout.failures).toEqual([]); expect(workLayout.attempts.every(attempt => attempt.completed)).toBe(true)
})
