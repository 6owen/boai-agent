/*
 * [OUTPUT]: 文件源码/预览使用header图标切换；原阅读/来源和无业务写入断言保持。
 * [INPUT]: WV-T01/T05/T09中文场景、生产三视图/材料API及明确预置历史。
 * [OUTPUT]: 附件草稿/锚点/隐藏阅读与同名全类型文件证据；实际原件移走、历史撤权和清空后迟到预览均不能保留旧正文。
 * [OUTPUT]: 核心/普通会话按确切标题按钮定位；本机图片来源先核对真实路径，源码逐行核对原文/空行并排除行号。
 * [OUTPUT]: 会话任务/文件/标题与草稿定位固定当前chat-panel，常驻隐藏全局任务不参与会话看板的滚动与恢复核对。
 * [POS]: 工作视图完整状态BDD步骤；不替换业务仓库、读取或预览实现。
 * [PROTOCOL]: 修改时同步Header及所属.folder.md。
 */
import { expect, type Locator, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { realpath, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { ConversationMaterial } from '../../../packages/shared/src/domain/materials'
import type { ConversationReadingState } from '../../../packages/shared/src/domain/reading'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { artifactRecords } from '../support/artifacts'
import { legacyMaterialGrant, nextMaterialDialog, prepareMaterialsDesktop } from '../support/materials'
import { messageDraft } from '../support/editor-controls'
import { observeWorkViews } from '../support/work-views'
import { prepareViewMaterial, prepareWorkViewFormats, prepareWorkViewHistory, workViewPng } from '../support/work-views-state'

interface State {
  history?: Awaited<ReturnType<typeof prepareWorkViewHistory>>
  formats?: Awaited<ReturnType<typeof prepareWorkViewFormats>>
  materialFixture?: Awaited<ReturnType<typeof prepareMaterialsDesktop>>
  material?: ConversationMaterial
  before?: Awaited<ReturnType<typeof artifactRecords>>
  observation?: Awaited<ReturnType<typeof observeWorkViews>>
  anchor?: { id: string; top: number }
  boardLeft?: number
  reading?: ConversationReadingState
  draftIds?: string[]
  hiddenReads?: number
  calls?: number
  previews?: { id: string; name: string; kind: string; language?: string }[]
  remoteRequests?: string[]
}
export const test = base.extend<{ viewState: State }>({ viewState: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const main = (page: Page) => page.getByRole('navigation', { name: '主导航', exact: true })
const chat = (page: Page) => page.locator('.chat-panel')
const taskView = (page: Page) => chat(page).getByRole('region', { name: '任务工作视图', exact: true })
const board = (page: Page) => taskView(page).getByLabel('任务看板', { exact: true })
const fileView = (page: Page) => chat(page).getByRole('region', { name: '会话文件', exact: true })
const file = (page: Page, id: string) => fileView(page).locator(`[data-file-id="${id}"]`)
const materialPreview = (page: Page, id: string) => page.locator(`[data-material-preview-id="${id}"]:visible`)
const hiddenComposer = (page: Page) => chat(page).locator('.conversation-chat-body [aria-label="消息内容"]')
const read = (runtime: Desktop, conversationId: string) => runtime.page.evaluate(conversationId => window.boai.request('getConversationReading', { conversationId }), conversationId)
async function select(runtime: Desktop, title: string) {
  await main(runtime.page).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: title, exact: true }).click()
}
async function pane(runtime: Desktop, label: '聊天' | '任务' | '文件') {
  await chat(runtime.page).getByRole('tablist', { name: '会话视图', exact: true }).getByRole('tab', { name: label, exact: true }).click()
  await expect(chat(runtime.page)).toHaveAttribute('data-conversation-view', { 聊天: 'chat', 任务: 'tasks', 文件: 'files' }[label])
}
async function addDraft(runtime: Desktop, path: string) {
  const before = await chat(runtime.page).locator('[data-material-draft-id]').count()
  await nextMaterialDialog(runtime, { path }); await chat(runtime.page).getByRole('button', { name: '添加或更多操作', exact: true }).click(); await runtime.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
  await expect(chat(runtime.page).locator('[data-material-draft-id]')).toHaveCount(before + 1)
  await expect(chat(runtime.page).locator('[data-material-draft-id][data-material-status="ready"]')).toHaveCount(before + 1)
}
async function expectSourceLines(pre: Locator, text: string) {
  const lines = text.split(/\r\n?|\n/)
  await expect(pre.locator('[data-file-line]')).toHaveCount(lines.length)
  await expect.poll(async () => (await pre.locator('.shiki-line-content').allTextContents()).map((content, index) => lines[index] === '' && content === '\u00a0' ? '' : content)).toEqual(lines)
}
async function prepareOne(runtime: Desktop, state: State) {
  const fixture = state.materialFixture = await prepareMaterialsDesktop(runtime)
  await runtime.page.evaluate(async () => {
    for (const agent of (await window.boai.request('snapshot', undefined)).agents.filter(value => ['researcher', 'writer'].includes(value.id))) { const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent; await window.boai.request('saveAgent', { ...input, active: false, expectedConfigVersion: configVersion }) }
  })
  const material = await prepareViewMaterial(runtime, fixture.group.id, fixture.files.valid)
  await runtime.page.evaluate(({ conversationId, material }) => window.boai.request('sendMessage', { conversationId, content: '已经发送的预览材料', materialSelections: [{ id: material.id, revision: material.revision }], mentionIds: [], requestId: 'wv-state-file-send' }), { conversationId: fixture.group.id, material })
  state.material = (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), fixture.group.id)).materials!.find(value => value.id === material.id)!
  await runtime.reviewFile('真实已发送输入原件', join(fixture.dataPath, 'materials', fixture.group.id, material.id, 'original'))
  await select(runtime, fixture.group.title); await pane(runtime, '文件')
  await expect(file(runtime.page, material.id)).toBeVisible()
  state.before = await artifactRecords(fixture.dataPath); state.calls = fixture.endpoint.requests.length
}
async function openMaterial(runtime: Desktop, material: ConversationMaterial) {
  await file(runtime.page, material.id).getByRole('button', { name: '预览', exact: true }).click()
  await expect(materialPreview(runtime.page, material.id)).toContainText('VALID_DRAFT_TOKEN_C')
}

Given('工作视图准备了{word}会话的长历史', async ({ runtime, viewState }, kind: '核心' | '自动化') => {
  const fixture = viewState.history = await prepareWorkViewHistory(runtime, kind)
  await select(runtime, fixture.conversation.title)
  await expect(chat(runtime.page).locator('.messages:visible [data-reading-message-id]')).toHaveCount(80)
  await runtime.reviewData('预置范围说明', { layer: 'preseeded-history-with-production-ui', kind, conversation: fixture.conversation, historyMessages: fixture.messages.length })
})
When('用户保留正文和附件草稿在三视图与另一个聊天之间切换', async ({ runtime, viewState }) => {
  const fixture = viewState.history!, page = runtime.page
  await chat(page).getByRole('textbox', { name: '消息内容', exact: true }).fill('WV_STATE_DRAFT：这段交流与附件尚未发送。')
  await addDraft(runtime, fixture.files.valid)
  const image = join(await realpath(runtime.root), 'state-draft-image.png'); await writeFile(image, workViewPng); await addDraft(runtime, image)
  viewState.draftIds = await chat(page).locator('[data-material-draft-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-material-draft-id')!))
  await hiddenComposer(page).evaluate(element => { element.setAttribute('data-work-view-witness', 'original-composer') })
  const scroller = chat(page).locator('.messages:visible')
  viewState.anchor = await scroller.evaluate(element => {
    element.scrollTop = Math.min(1000, (element.scrollHeight - element.clientHeight) / 2); element.dispatchEvent(new Event('scroll'))
    const viewport = element.getBoundingClientRect(), row = [...element.querySelectorAll<HTMLElement>('[data-reading-message-id]')].find(row => row.getBoundingClientRect().bottom > viewport.top && row.getBoundingClientRect().top < viewport.bottom)!
    return { id: row.dataset.readingMessageId!, top: row.getBoundingClientRect().top - viewport.top }
  })
  await expect.poll(async () => (await read(runtime, fixture.conversation.id)).anchor?.messageId).toBe(viewState.anchor.id)
  viewState.reading = await read(runtime, fixture.conversation.id); viewState.before = await artifactRecords(fixture.dataPath); viewState.calls = fixture.endpoint.requests.length
  viewState.observation = await observeWorkViews(runtime)
  await runtime.reviewCheckpoint('原历史位置和正文/文本/图片附件草稿')
  await pane(runtime, '任务'); await taskView(page).getByRole('textbox', { name: '任务目标关键词', exact: true }).fill('原会话任务筛选')
  await taskView(page).getByRole('tab', { name: '看板', exact: true }).click()
  await expect(board(page)).toBeVisible()
  viewState.boardLeft = await board(page).evaluate(element => { element.scrollLeft = 100; element.dispatchEvent(new Event('scroll')); return element.scrollLeft })
  expect(viewState.boardLeft).toBeGreaterThan(0)
  await pane(runtime, '文件'); await fileView(page).getByRole('textbox', { name: '文件名称筛选', exact: true }).fill('原会话文件筛选')
  await expect(fileView(page)).toContainText('暂无符合条件的文件')
  viewState.hiddenReads = (await viewState.observation.inspect()).calls.filter(name => ['getConversationView', 'observeConversationReading'].includes(name)).length
  await main(page).getByRole('button', { name: '任务', exact: true }).click(); await expect(page.getByRole('main', { name: '全局任务', exact: true })).toBeVisible()
  await main(page).getByRole('button', { name: '会话', exact: true }).click(); await expect(fileView(page)).toBeVisible()
  await page.waitForTimeout(300)
  expect((await viewState.observation.inspect()).calls.filter(name => ['getConversationView', 'observeConversationReading'].includes(name))).toHaveLength(viewState.hiddenReads)
  await pane(runtime, '聊天'); await expect(hiddenComposer(page)).toHaveAttribute('data-work-view-witness', 'original-composer')
  await expect.poll(() => chat(page).locator(`#message-${viewState.anchor!.id}`).evaluate(row => row.getBoundingClientRect().top - row.closest('.messages')!.getBoundingClientRect().top)).toBeCloseTo(viewState.anchor.top, 0)
  await select(runtime, fixture.direct.title); await select(runtime, fixture.conversation.title)
})
Then('原会话历史锚点附件身份和隐藏阅读边界保持', async ({ runtime, viewState }) => {
  const fixture = viewState.history!, page = runtime.page, anchor = viewState.anchor!
  expect(await messageDraft(chat(page).getByRole('textbox', { name: '消息内容', exact: true }))).toBe('WV_STATE_DRAFT：这段交流与附件尚未发送。')
  expect(await chat(page).locator('[data-material-draft-id]').evaluateAll(elements => elements.map(element => element.getAttribute('data-material-draft-id')!))).toEqual(viewState.draftIds)
  await expect.poll(() => chat(page).locator(`#message-${anchor.id}`).evaluate(row => row.getBoundingClientRect().top - row.closest('.messages')!.getBoundingClientRect().top)).toBeCloseTo(anchor.top, 0)
  const reading = await read(runtime, fixture.conversation.id)
  expect({ boundary: reading.boundary, sparseSeen: reading.sparseSeen, unreadCount: reading.unreadCount }).toEqual({ boundary: viewState.reading!.boundary, sparseSeen: viewState.reading!.sparseSeen, unreadCount: viewState.reading!.unreadCount })
  await pane(runtime, '任务'); await expect(taskView(page).getByRole('textbox', { name: '任务目标关键词', exact: true })).toHaveValue('原会话任务筛选')
  await expect(board(page)).toBeVisible()
  await expect.poll(() => board(page).evaluate(element => element.scrollLeft)).toBe(viewState.boardLeft)
  await pane(runtime, '文件'); await expect(fileView(page).getByRole('textbox', { name: '文件名称筛选', exact: true })).toHaveValue('原会话文件筛选')
  expect(await fileView(page).locator('[data-file-id]').count()).toBe(0)
  const after = await artifactRecords(fixture.dataPath); expect(after.workItems).toEqual(viewState.before!.workItems); expect(after.messages).toEqual(viewState.before!.messages); expect(after.materials).toEqual(viewState.before!.materials); expect(fixture.endpoint.requests).toHaveLength(viewState.calls!)
  await pane(runtime, '聊天'); await runtime.reviewData('草稿与锚点保持核对', { conversationId: fixture.conversation.id, anchor, reading, draftIds: viewState.draftIds, providerRequests: viewState.calls }); await runtime.reviewCheckpoint('原会话回到同一历史位置，正文和两个附件草稿保持')
})

Given('文件视图已有全部支持格式的真实已发送原件', async ({ runtime, viewState }) => {
  test.setTimeout(180_000)
  const fixture = viewState.formats = await prepareWorkViewFormats(runtime); await select(runtime, fixture.group.title); await pane(runtime, '文件')
  while (await fileView(runtime.page).getByRole('button', { name: /^加载更多/ }).count()) { const count = await fileView(runtime.page).locator('[data-file-id]').count(); await fileView(runtime.page).getByRole('button', { name: /^加载更多/ }).click(); await expect.poll(() => fileView(runtime.page).locator('[data-file-id]').count()).toBeGreaterThan(count) }
  await expect(fileView(runtime.page).locator('[data-file-id]')).toHaveCount(fixture.samples.length)
  await expect(file(runtime.page, fixture.draft.id)).toHaveCount(0); await expect(fileView(runtime.page)).not.toContainText('尚未发布.txt')
  viewState.before = await artifactRecords(fixture.dataPath); viewState.calls = fixture.endpoint.requests.length; viewState.previews = []; viewState.remoteRequests = []
  runtime.page.on('request', request => { if (request.url().includes('example.invalid')) viewState.remoteRequests!.push(request.url()) })
  await runtime.reviewData('全部支持格式与独立原件', { layer: 'production-preparation-and-send-with-offline-employees', samples: fixture.samples.map(sample => ({ name: sample.name, id: sample.material.id, hash: sample.material.contentHash, kind: sample.kind, language: sample.language })), unsentDraftId: fixture.draft.id, unpublished: fixture.unpublishedPath }); await runtime.reviewCheckpoint('真实文件清单全部加载，同名两份与草稿/未发布反例')
})
When('用户逐一从文件清单预览并切换明暗主题与源码', async ({ runtime, viewState }) => {
  const fixture = viewState.formats!, page = runtime.page
  for (const sample of fixture.samples) {
    await file(page, sample.material.id).getByRole('button', { name: '预览', exact: true }).click()
    const panel = materialPreview(page, sample.material.id); await expect(panel).toBeVisible()
    if (sample.kind === 'code' || sample.kind === 'text') {
      await expect(panel.locator('[data-file-preview-kind]')).toHaveAttribute('data-file-preview-kind', sample.kind)
      const pre = panel.locator('pre.shiki-code-block'); if (sample.language) { await expect(pre).toHaveAttribute('data-language', sample.language); await expect(pre.locator('.shiki-token').first()).toBeVisible() }
      await expectSourceLines(pre, sample.text!)
    } else if (sample.kind === 'markdown') {
      await expect(panel.locator('[data-file-preview-kind]')).toHaveAttribute('data-file-preview-kind', 'markdown'); await expect(panel.locator('h1')).toHaveText(sample.text!.split('\n')[0].slice(2))
      await panel.getByRole('button', { name: '显示源码', exact: true }).click(); await expectSourceLines(panel.locator('pre.shiki-code-block'), sample.text!); await panel.getByRole('button', { name: '显示预览', exact: true }).click()
    } else if (sample.kind === 'image') { await expect(panel.locator('img')).toBeVisible(); await expect.poll(() => panel.locator('img').evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true) }
    else await expect(panel).toContainText('暂不支持正文预览')
    await expect(panel.locator('script,iframe,svg')).toHaveCount(0)
    viewState.previews!.push({ id: sample.material.id, name: sample.name, kind: sample.kind, language: sample.language }); await runtime.reviewFile(`输入原件 · ${sample.name} · ${sample.material.id}`, join(fixture.dataPath, 'materials', fixture.group.id, sample.material.id, 'original'))
    if (['html', 'svg', 'md', 'ts'].includes(sample.name.split('.').at(-1)!) || ['image', 'unsupported', 'text'].includes(sample.kind)) await runtime.reviewCheckpoint(`文件清单真实预览 · ${sample.name} · ${sample.kind}`)
  }
  const html = fixture.samples.find(value => value.name.endsWith('.html'))!
  await file(page, html.material.id).getByRole('button', { name: '预览', exact: true }).click()
  await page.evaluate(async () => { const appearance = await window.boai.request('getAppearance', undefined); await window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: appearance.revision }) })
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark'); await expect(materialPreview(page, html.material.id).locator('.shiki-token').first()).toBeVisible(); await runtime.reviewCheckpoint('深色HTML源码仍为真实文字高亮')
})
Then('同名独立文件保留身份且危险源码图片与二进制各有真实结果', async ({ runtime, viewState }) => {
  const fixture = viewState.formats!, page = runtime.page, sameName = fixture.samples.filter(sample => sample.name === '报告.md')
  expect(sameName).toHaveLength(2); expect(sameName[0].material.id).not.toBe(sameName[1].material.id); expect(sameName[0].material.contentHash).not.toBe(sameName[1].material.contentHash)
  await fileView(page).getByRole('textbox', { name: '文件名称筛选', exact: true }).fill('报告.md'); await expect(fileView(page).locator('[data-file-id]')).toHaveCount(2)
  for (const sample of sameName) { await file(page, sample.material.id).getByRole('button', { name: '预览', exact: true }).click(); await expect(materialPreview(page, sample.material.id)).toContainText(sample.text!.split('\n')[0].slice(2)) }
  expect(await page.evaluate(() => Boolean((window as typeof window & { __boaiWorkPreviewExecuted?: boolean }).__boaiWorkPreviewExecuted))).toBe(false); expect(viewState.remoteRequests).toEqual([]); expect(viewState.previews).toHaveLength(fixture.samples.length)
  const after = await artifactRecords(fixture.dataPath); expect(after.messages).toEqual(viewState.before!.messages); expect(after.workItems).toEqual([]); expect(after.adoptionEvents).toEqual([]); expect(fixture.endpoint.requests).toHaveLength(viewState.calls!)
  await runtime.reviewData('每份原件的实际展示结果', { previews: viewState.previews, remoteRequests: viewState.remoteRequests, providerRequests: viewState.calls }); await runtime.reviewCheckpoint('同名两份原件独立筛选和预览，无脚本/远程媒体执行')
})

Given('文件视图已有一份真实已发送文本材料', async ({ runtime, viewState }) => prepareOne(runtime, viewState))
Given('文件视图已有一份历史显式授权的已发送材料', async ({ runtime, viewState }) => {
  await prepareOne(runtime, viewState); await legacyMaterialGrant(runtime, viewState.materialFixture!.dataPath, viewState.material!.id)
  await select(runtime, viewState.materialFixture!.group.title); await pane(runtime, '文件')
  viewState.material = (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), viewState.materialFixture!.group.id)).materials!.find(value => value.id === viewState.material!.id)!
  viewState.before = await artifactRecords(viewState.materialFixture!.dataPath)
})
When('用户打开材料后受管原件缺失并重新核对', async ({ runtime, viewState }) => {
  await openMaterial(runtime, viewState.material!); await runtime.reviewCheckpoint('原件缺失前的明确材料正文')
  await rm(join(viewState.materialFixture!.dataPath, 'materials', viewState.material!.conversationId, viewState.material!.id, 'original'))
  await file(runtime.page, viewState.material!.id).getByRole('button', { name: '预览', exact: true }).click()
})
Then('当前预览不保留旧正文且文件列表显示原件不可用', async ({ runtime, viewState }) => {
  const page = runtime.page, material = viewState.material!
  await expect(materialPreview(page, material.id)).toHaveCount(0); await expect(page.locator('.file-preview-detail:visible')).not.toContainText('VALID_DRAFT_TOKEN_C')
  await pane(runtime, '聊天'); await pane(runtime, '文件'); await expect(file(page, material.id)).toContainText('原件不可用'); await expect(fileView(page)).not.toContainText('暂无符合条件的文件')
  const after = await artifactRecords(viewState.materialFixture!.dataPath); expect(after.messages).toEqual(viewState.before!.messages); expect(after.workItems).toEqual(viewState.before!.workItems); expect(viewState.materialFixture!.endpoint.requests).toHaveLength(viewState.calls!)
  await runtime.reviewData('原件缺失后的实际状态', after.materials.find(value => value.id === material.id)); await runtime.reviewCheckpoint('原件缺失清除当前正文，清单明确不可用而非空态')
})
When('用户打开原材料后通过生产接口撤销原授权', async ({ runtime, viewState }) => {
  await openMaterial(runtime, viewState.material!); await runtime.reviewCheckpoint('历史授权撤销前的原材料正文')
  await runtime.page.evaluate(material => window.boai.request('setMaterialAuthorization', { id: material.id, expectedRevision: material.revision, authorizedAgentIds: [] }), viewState.material!)
})
Then('当前预览与原引用不能继续读取撤权正文', async ({ runtime, viewState }) => {
  const material = viewState.material!, page = runtime.page
  await expect(materialPreview(page, material.id)).toHaveCount(0); await expect(page.locator('.file-preview-detail:visible')).not.toContainText('VALID_DRAFT_TOKEN_C')
  const outcome = await page.evaluate(async material => { try { await window.boai.request('getMaterialPreview', { id: material.id, expectedRevision: material.revision }); return 'accepted' } catch (error) { return String(error) } }, material)
  expect(outcome).not.toBe('accepted'); expect(outcome).not.toContain('VALID_DRAFT_TOKEN_C')
  const after = await artifactRecords(viewState.materialFixture!.dataPath); expect(after.messages).toEqual(viewState.before!.messages); expect(after.workItems).toEqual(viewState.before!.workItems); expect(viewState.materialFixture!.endpoint.requests).toHaveLength(viewState.calls!)
  await runtime.reviewData('原授权版本撤销的实际结果', { previous: material, current: after.materials.find(value => value.id === material.id), oldRead: outcome }); await runtime.reviewCheckpoint('授权撤销立即清除当前预览，原版本拒读')
})
When('用户打开材料的宿主预览回复被延迟并清空来源聊天', async ({ runtime, viewState }) => {
  viewState.observation = await observeWorkViews(runtime, 'getMaterialPreview')
  await file(runtime.page, viewState.material!.id).getByRole('button', { name: '预览', exact: true }).click()
  await expect.poll(async () => (await viewState.observation!.inspect()).delayed).toBe(true)
  await runtime.page.evaluate(id => window.boai.request('clearConversationHistory', { id, hide: false }), viewState.material!.conversationId)
  await viewState.observation.release()
})
Then('迟到预览不创建文件标签或恢复清理正文', async ({ runtime, viewState }) => {
  await runtime.page.waitForTimeout(250); await expect(materialPreview(runtime.page, viewState.material!.id)).toHaveCount(0); await expect(runtime.page.locator('.content-frame')).not.toContainText('VALID_DRAFT_TOKEN_C')
  await expect(runtime.page.getByRole('tab', { name: new RegExp(viewState.material!.name) })).toHaveCount(0)
  const after = await artifactRecords(viewState.materialFixture!.dataPath); expect(after.materials.filter(value => value.conversationId === viewState.material!.conversationId)).toEqual([]); expect(after.messages.filter(value => value.conversationId === viewState.material!.conversationId)).toEqual([]); expect(viewState.materialFixture!.endpoint.requests).toHaveLength(viewState.calls!)
  await runtime.reviewData('预览迟到时来源已清空的记录', { messages: after.messages.length, materials: after.materials.length }); await runtime.reviewCheckpoint('迟到预览没有恢复标签、材料或旧正文')
})
