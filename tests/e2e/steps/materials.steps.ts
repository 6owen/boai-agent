/*
 * [OUTPUT]: Lody原PDF/Office真实发送/核源/阅读，延迟预览后的文件切换、隐藏停读与清理隔离，零新增模型调用。
 * [OUTPUT]: 可选审阅模式保留Markdown排版/源码、TypeScript/HTML关键帧及已发送原件与身份，不改变业务断言。
 * [INPUT]: D1 中文材料场景、生产 Electron UI/IPC、隔离原件与共享协议 fixture。
 * [OUTPUT]: 聊天Markdown/代码在右侧安全预览与Shiki高亮，来源行保持；新材料随当前成员授权、通用PDF不虚构正文、同字节恢复/未知回执与重启不重放。
 * [POS]: tests/e2e/steps/materials.steps.ts；准备文件和故障注入只在 support 层。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { join } from 'node:path'
import { realpath, writeFile } from 'node:fs/promises'
import { sampleDocx, sampleXlsx, samplePptx, createSamplePdf } from '../../lody/office-viewer-files'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { observeWorkViews } from '../support/work-views'
import { messageDraft } from '../support/editor-controls'
import { dropNativeMaterialFile, forgedMaterialRequests, managedMaterialFiles, legacyMaterialGrant, materialOriginal, materialRecords, materialReplyFault, materialSendReplyFault, nextMaterialDialog, prepareMaterialsDesktop, temporarilyRemoveMaterialOriginal } from '../support/materials'
import type { ConversationMaterial } from '../../../src/shared/domain/materials'
import type { ConversationDetail, Message } from '../../../src/shared/domain'

type SendFault = Awaited<ReturnType<typeof materialSendReplyFault>>
interface State {
  fixture?: Awaited<ReturnType<typeof prepareMaterialsDesktop>>
  materials?: ConversationMaterial[]
  failed?: { name: string; reason: string; id: string }[]
  message?: Message
  fault?: Awaited<ReturnType<typeof materialReplyFault>>
  originalRequestId?: string
  rejectedSources?: Awaited<ReturnType<typeof forgedMaterialRequests>>
  nativeDrop?: Awaited<ReturnType<typeof dropNativeMaterialFile>>
  sendFault?: SendFault
  frozenSend?: Awaited<ReturnType<SendFault['inspect']>>
  beforeRecovery?: ConversationDetail
  modelCalls?: number
  binaryKind?: string
  restoreOriginal?: () => Promise<void>
}
export const test = base.extend<{ materialsState: State }>({ materialsState: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const drafts = (page: Page) => page.getByRole('region', { name: '待发送材料', exact: true }).locator('[data-material-draft-id]')
const detail = (runtime: Desktop, id: string) => runtime.page.evaluate(id => window.boai.request('getConversation', { id }), id)
async function selectConversation(page: Page, title: string) {
  await page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${title}`) }).click()
}
async function addMaterial(runtime: Desktop, path: string) {
  await nextMaterialDialog(runtime, { path })
  await runtime.page.getByRole('button', { name: '添加或更多操作', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
}
async function idle(runtime: Desktop, conversationId: string) {
  await expect.poll(async () => {
    const current = await detail(runtime, conversationId)
    return !!current.turns?.length && current.turns.every(turn => turn.status === 'completed') && current.runs.every(run => ['completed', 'cancelled', 'failed', 'interrupted'].includes(run.status))
  }, { timeout: 30_000 }).toBe(true)
}
async function inspectPreview(runtime: Desktop, material: ConversationMaterial, expectedLine: string) {
  const preview = runtime.page.locator(`[data-material-preview-id="${material.id}"]:visible`)
  await expect(preview).toBeVisible()
  const source = preview.getByRole('tab', { name: '源码', exact: true })
  if (await source.isVisible()) await source.click()
  await expect(preview.locator('[data-file-line="2"] .shiki-line-content')).toHaveText(expectedLine)
  await preview.getByText('材料来源与解析记录', { exact: true }).click()
  await expect(preview).toContainText(material.id)
  await expect(preview).toContainText(material.contentHash!)
  await expect(preview).toContainText('text-v1')
}

When('用户将文档代码和网页源码作为聊天文件发送', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, page = runtime.page
  await selectConversation(page, fixture.direct.title)
  for (const [index, path] of [fixture.files.markdown, fixture.files.code, fixture.files.html].entries()) {
    await addMaterial(runtime, path)
    await expect(drafts(page).nth(index)).toHaveAttribute('data-material-status', 'ready')
  }
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('这些文件供预览检查。')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await idle(runtime, fixture.direct.id)
  const current = await detail(runtime, fixture.direct.id)
  materialsState.materials = current.materials!
  materialsState.message = current.messages.find(message => message.senderType === 'user')!
  materialsState.beforeRecovery = current
  materialsState.modelCalls = fixture.endpoint.requests.length
  expect(materialsState.message.materialIds).toHaveLength(3)
  for (const material of materialsState.materials) await runtime.reviewFile(material.name, join(fixture.dataPath, 'materials', material.conversationId, material.id, 'original'))
  await runtime.reviewData('已发送材料身份', { messageId: materialsState.message.id, materials: materialsState.materials.map(({ id, name, contentHash, conversationId }) => ({ id, name, contentHash, conversationId })) })
  await runtime.reviewCheckpoint('在聊天中发送三份真实文件')
})
Then('聊天文件在右侧预览Markdown和Shiki源码且不执行业务操作', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, page = runtime.page
  const byName = (name: string) => materialsState.materials!.find(material => material.name === name)!
  async function open(name: string) {
    const material = byName(name)
    await page.locator(`#message-${materialsState.message!.id} [data-material-id="${material.id}"]`).getByRole('button', { name: `预览材料 ${name}`, exact: true }).click()
    const preview = page.locator(`[data-material-preview-id="${material.id}"]:visible`)
    await expect(preview).toBeVisible()
    return preview
  }
  const markdown = await open('预览说明.md')
  await expect(markdown.locator('[data-file-preview-kind="markdown"]')).toBeVisible()
  await expect(markdown.getByRole('heading', { name: '可预览的聊天文档', exact: true })).toBeVisible()
  await expect(markdown.locator('strong')).toHaveText('加粗正文')
  await expect(markdown.locator('pre.shiki-code-block .shiki-token').first()).toBeVisible()
  await expect(markdown.locator('pre.shiki-code-block')).toContainText('CHAT_MARKDOWN_CODE')
  await expect(markdown.locator('script, iframe')).toHaveCount(0)
  await runtime.reviewCheckpoint('Markdown 排版预览')
  await markdown.getByRole('tab', { name: '源码', exact: true }).click()
  await expect(markdown.locator('[data-file-line="1"] .shiki-line-content')).toHaveText('# 可预览的聊天文档')
  await runtime.reviewCheckpoint('Markdown 源码与行号')
  await markdown.getByRole('tab', { name: '预览', exact: true }).click()
  await expect(markdown.getByRole('heading', { name: '可预览的聊天文档', exact: true })).toBeVisible()

  const code = await open('preview.ts')
  await expect(code.locator('[data-file-preview-kind="code"]')).toBeVisible()
  await expect(code.locator('pre.shiki-code-block')).toHaveAttribute('data-language', /^(ts|typescript)$/)
  await expect(code.locator('.shiki-token').first()).toBeVisible()
  await expect(code.locator('[data-file-line="1"] .shiki-line-content')).toHaveText(fixture.texts.code.split('\n')[0])
  await expect(code.locator('[data-file-line="2"] .shiki-line-content')).toHaveText(fixture.texts.code.split('\n')[1])
  await runtime.reviewCheckpoint('TypeScript 附件的 Shiki 高亮')

  const html = await open('preview.html')
  await expect(html.locator('[data-file-preview-kind="code"]')).toBeVisible()
  await expect(html.locator('pre.shiki-code-block')).toHaveAttribute('data-language', 'html')
  await expect(html.locator('[data-file-line="2"] .shiki-line-content')).toHaveText(fixture.texts.html.split('\n')[1])
  await expect(html.locator('script, iframe, object, embed')).toHaveCount(0)
  expect(await page.evaluate(() => (window as typeof window & { __boaiPreviewExecuted?: boolean }).__boaiPreviewExecuted)).toBeUndefined()
  await runtime.reviewCheckpoint('HTML 文件仅显示源码')
  const after = await detail(runtime, fixture.direct.id), before = materialsState.beforeRecovery!
  expect(after.messages).toEqual(before.messages)
  expect(after.materials).toEqual(before.materials)
  expect(after.artifacts).toEqual([])
  expect(after.workItems).toEqual([])
  expect(fixture.endpoint.requests).toHaveLength(materialsState.modelCalls!)
})

Given('材料协作组和私聊已连接离线协议模型', async ({ runtime, materialsState }) => {
  materialsState.fixture = await prepareMaterialsDesktop(runtime)
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  expect(materialsState.fixture.endpoint.requests).toHaveLength(0)
})
When('用户向材料协作组添加两份同名报告', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!
  await selectConversation(runtime.page, fixture.group.title)
  await addMaterial(runtime, fixture.files.first)
  await expect(drafts(runtime.page)).toHaveCount(1); await expect(drafts(runtime.page).first()).toHaveAttribute('data-material-status', 'ready')
  await addMaterial(runtime, fixture.files.second)
  await expect(drafts(runtime.page)).toHaveCount(2); await expect(drafts(runtime.page).nth(1)).toHaveAttribute('data-material-status', 'ready')
  materialsState.materials = (await detail(runtime, fixture.group.id)).materials!
})
Then('两份报告有独立原文行号和来源身份', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, materials = materialsState.materials!
  expect(materials).toHaveLength(2)
  expect(materials[0].name).toBe('报告.md'); expect(materials[1].name).toBe('报告.md')
  expect(materials[0].id).not.toBe(materials[1].id); expect(materials[0].contentHash).not.toBe(materials[1].contentHash)
  for (const [index, text] of [fixture.texts.first, fixture.texts.second].entries()) {
    await drafts(runtime.page).nth(index).getByRole('button', { name: '预览材料 报告.md', exact: true }).click()
    await inspectPreview(runtime, materials[index], text.replace(/\r\n/g, '\n').split('\n')[1])
  }
  expect(fixture.endpoint.requests).toHaveLength(0)
})
When('用户将两份报告随消息发送给当前群成员', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, page = runtime.page
  await expect(drafts(page).locator('summary')).toHaveCount(0)
  await expect(drafts(page).getByRole('checkbox')).toHaveCount(0)
  materialsState.materials = (await detail(runtime, fixture.group.id)).materials!
  // Attachment-only sending exercises the real empty-body association and model projection.
  await expect.poll(() => messageDraft(page.getByRole('textbox', { name: '消息内容', exact: true }))).toBe('')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.getByRole('region', { name: '待发送材料', exact: true })).toHaveCount(0)
  await idle(runtime, fixture.group.id)
  const current = await detail(runtime, fixture.group.id)
  materialsState.message = current.messages.find(message => message.senderType === 'user')!
  expect(materialsState.message.content).toBe('')
  expect(materialsState.message.materialIds?.sort()).toEqual(materialsState.materials.map(material => material.id).sort())
})
Then('员工只收到获准原文且回复来源可以定位', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, current = await detail(runtime, fixture.group.id), page = runtime.page
  const [first, second] = materialsState.materials!
  expect(current.materials?.every(material => material.deliveryScope === 'conversation')).toBe(true)
  const researchRequests = fixture.endpoint.requests.filter(request => request.model === 'materials-researcher').map(request => JSON.stringify(request))
  const writerRequests = fixture.endpoint.requests.filter(request => request.model === 'materials-writer').map(request => JSON.stringify(request))
  expect(researchRequests.some(request => request.includes('FIRST_PRIVATE_TOKEN_A') && request.includes('SECOND_SHARED_TOKEN_B'))).toBe(true)
  expect(writerRequests.some(request => request.includes('SECOND_SHARED_TOKEN_B'))).toBe(true)
  expect(writerRequests.some(request => request.includes('FIRST_PRIVATE_TOKEN_A') && request.includes('SECOND_SHARED_TOKEN_B'))).toBe(true)
  const researcher = current.messages.find(message => message.senderId === 'researcher' && message.status === 'completed')!, writer = current.messages.find(message => message.senderId === 'writer' && message.status === 'completed')!
  expect(researcher.materialSources?.map(ref => ref.id).sort()).toEqual([first.id, second.id].sort())
  expect(writer.materialSources?.map(ref => ref.id).sort()).toEqual([first.id, second.id].sort())
  const source = page.locator(`#message-${researcher.id}`).getByRole('button', { name: '查看材料 报告.md 第 2 至 2 行', exact: true })
  await expect(source).toHaveCount(2); await source.first().click()
  const selected = page.locator(`[data-material-preview-id="${first.id}"]:visible`)
  await expect(selected.getByRole('button', { name: '定位第 2 行', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(selected).toContainText(`来源定位：${first.id}:L2`)
  expect(current.workItems).toEqual([])
})
Then('材料详情切页后恢复且重启不重复调用模型', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, first = materialsState.materials![0], page = runtime.page
  await page.getByRole('button', { name: '通讯录', exact: true }).click()
  await expect(page.locator('[data-material-preview-id]:visible')).toHaveCount(0)
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await expect(page.locator(`[data-material-preview-id="${first.id}"]:visible`)).toBeVisible()
  const before = await detail(runtime, fixture.group.id), calls = fixture.endpoint.requests.length
  await runtime.restart(); await expect(runtime.page.locator('.app-shell')).toBeVisible()
  await selectConversation(runtime.page, fixture.group.title)
  const sent = runtime.page.getByRole('region', { name: '消息材料', exact: true }).locator('[data-material-id]')
  await expect(sent).toHaveCount(2)
  const after = await detail(runtime, fixture.group.id)
  expect(after.messages.map(message => message.id)).toEqual(before.messages.map(message => message.id))
  expect(after.materials).toEqual(before.materials); expect(fixture.endpoint.requests).toHaveLength(calls)
  await runtime.page.locator(`[data-material-id="${first.id}"]`).getByRole('button', { name: '预览材料 报告.md', exact: true }).click()
  await inspectPreview(runtime, first, fixture.texts.first.split('\r\n')[1])
  expect(fixture.endpoint.requests).toHaveLength(calls)
})

When('用户在私聊核对通用文件并逐项添加坏编码和超限材料', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, page = runtime.page
  await selectConversation(page, fixture.direct.title); await addMaterial(runtime, fixture.files.valid)
  await expect(drafts(page).first()).toHaveAttribute('data-material-status', 'ready')
  materialsState.materials = (await detail(runtime, fixture.direct.id)).materials!
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('只处理保留的有效材料')
  await addMaterial(runtime, fixture.files.unsupported)
  await expect(drafts(page).nth(1)).toHaveAttribute('data-material-status', 'ready')
  const generic = (await detail(runtime, fixture.direct.id)).materials!.find(material => material.name === '通用资料.pdf')!
  expect(generic).toMatchObject({ format: 'file', parseVersion: 'binary-v1', status: 'ready' })
  expect(generic.lineCount).toBeUndefined(); expect(generic.characterCount).toBeUndefined()
  await drafts(page).nth(1).getByRole('button', { name: '移除材料 通用资料.pdf', exact: true }).click()
  materialsState.failed = []
  for (const [path, name, reason] of [[fixture.files.encoding, '坏编码.txt', 'UTF-8'], [fixture.files.large, '超限.txt', '128 KiB'], [fixture.files.oversized, '超限文件.pdf', '20 MiB']]) {
    await addMaterial(runtime, path)
    const failure = drafts(page).nth(1)
    await expect(failure).toHaveAttribute('data-material-status', 'failed')
    await expect(failure.getByRole('alert')).toContainText(reason)
    await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeDisabled()
    await expect(drafts(page).first()).toHaveAttribute('data-material-status', 'ready')
    expect(await messageDraft(page.getByRole('textbox', { name: '消息内容', exact: true }))).toBe('只处理保留的有效材料')
    const stored = (await detail(runtime, fixture.direct.id)).materials!.find(material => material.name === name)!
    materialsState.failed.push({ name, reason, id: stored.id })
    if (name !== '超限文件.pdf') { await failure.getByRole('button', { name: `移除材料 ${name}`, exact: true }).click(); await expect(drafts(page)).toHaveCount(1) }
  }
})
Then('每份失败都有明确原因且其他原文和正文草稿保持', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, good = materialsState.materials![0]
  expect(materialsState.failed).toHaveLength(3)
  const stored = (await detail(runtime, fixture.direct.id)).materials!
  expect(stored.find(material => material.id === good.id)).toEqual(good)
  expect(stored.filter(material => material.status === 'removed')).toHaveLength(3)
  expect(stored.find(material => material.name === '超限文件.pdf')?.status).toBe('failed')
  await drafts(runtime.page).first().getByRole('button', { name: '预览材料 有效材料.txt', exact: true }).click()
  await inspectPreview(runtime, good, fixture.texts.valid.split('\n')[1])
  expect(fixture.endpoint.requests).toHaveLength(0)
})
When('用户移除失败材料并发送保留的有效材料', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, page = runtime.page
  await drafts(page).nth(1).getByRole('button', { name: '移除材料 超限文件.pdf', exact: true }).click()
  await expect(drafts(page)).toHaveCount(1)
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '发送消息', exact: true }).click(); await idle(runtime, fixture.direct.id)
  materialsState.message = (await detail(runtime, fixture.direct.id)).messages.find(message => message.senderType === 'user')!
})
Then('消息只关联有效原件且普通聊天没有工作项', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, current = await detail(runtime, fixture.direct.id)
  expect(materialsState.message).toMatchObject({ content: '只处理保留的有效材料', materialIds: [materialsState.materials![0].id] })
  expect(current.materials!.filter(material => material.messageId).map(material => material.id)).toEqual([materialsState.materials![0].id])
  expect(current.workItems).toEqual([])
  await expect(runtime.page.getByRole('region', { name: '消息材料', exact: true }).locator('[data-material-id]')).toHaveCount(1)
  expect(fixture.endpoint.requests.some(request => JSON.stringify(request).includes('VALID_DRAFT_TOKEN_C'))).toBe(true)
})

When('用户在原生选择失败后添加材料但导入回复失联', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, page = runtime.page
  await selectConversation(page, fixture.direct.title)
  await nextMaterialDialog(runtime, { error: '验收：原生选择失败' })
  await page.getByRole('button', { name: '添加或更多操作', exact: true }).click(); await page.getByRole('menuitem', { name: '添加文件', exact: true }).click()
  await expect(page.getByText(/原生选择失败/)).toBeVisible(); await expect(drafts(page)).toHaveCount(0)
  expect((await detail(runtime, fixture.direct.id)).materials).toEqual([]); expect(fixture.endpoint.requests).toHaveLength(0)
  materialsState.fault = await materialReplyFault(runtime)
  await addMaterial(runtime, fixture.files.valid)
  await expect(drafts(page)).toHaveCount(1); await expect(drafts(page).first()).toHaveAttribute('data-material-status', 'unavailable')
  await expect(drafts(page).first().getByRole('button', { name: '核对材料 有效材料.txt', exact: true })).toBeVisible()
})
Then('未知材料阻止发送并保留原准备请求', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, fault = await materialsState.fault!.inspect()
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('等材料核对完成再发送')
  await expect(runtime.page.getByRole('button', { name: '发送消息', exact: true })).toBeDisabled()
  expect(fault.preparations).toHaveLength(1); expect(fault.lostReplies).toBe(1); expect(fault.unavailableLookups).toBeGreaterThan(0)
  materialsState.originalRequestId = fault.preparations[0].requestId
  expect(fault.lookups.every(id => id === materialsState.originalRequestId)).toBe(true)
  expect('path' in fault.preparations[0]).toBe(false)
  const stored = await materialRecords(fixture.dataPath)
  expect(stored.materials).toHaveLength(1); expect(stored.preparations).toHaveLength(1)
  expect(stored.materials[0]).toMatchObject({ id: fault.committedIds[0], status: 'ready' })
  expect(JSON.stringify(stored.preparations)).not.toContain(fixture.files.valid)
  expect(fixture.endpoint.requests).toHaveLength(0)
})
When('用户核对原材料准备回执', async ({ runtime, materialsState }) => {
  await materialsState.fault!.allowLookup()
  await drafts(runtime.page).first().getByRole('button', { name: '核对材料 有效材料.txt', exact: true }).click()
  await expect(drafts(runtime.page).first()).toHaveAttribute('data-material-status', 'ready')
})
Then('只恢复同一个原件且没有重复准备或模型调用', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, fault = await materialsState.fault!.inspect(), stored = await materialRecords(fixture.dataPath)
  expect(fault.preparations).toHaveLength(1); expect(fault.committedIds).toHaveLength(1)
  expect(fault.lookups.length).toBeGreaterThan(1); expect(fault.lookups.every(id => id === materialsState.originalRequestId)).toBe(true)
  expect(stored.materials).toHaveLength(1); expect(stored.preparations).toHaveLength(1)
  expect(stored.materials[0].id).toBe(fault.committedIds[0]); expect(fixture.endpoint.requests).toHaveLength(0)
  await expect(runtime.page.getByRole('button', { name: '发送消息', exact: true })).toBeEnabled()
  expect(await messageDraft(runtime.page.getByRole('textbox', { name: '消息内容', exact: true }))).toBe('等材料核对完成再发送')
  await drafts(runtime.page).first().getByRole('button', { name: '预览材料 有效材料.txt', exact: true }).click()
  await inspectPreview(runtime, stored.materials[0], fixture.texts.valid.split('\n')[1])
  expect(fixture.endpoint.requests).toHaveLength(0)
})

When('页面尝试用任意路径和未授权选择身份准备材料', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!
  await selectConversation(runtime.page, fixture.direct.title)
  materialsState.rejectedSources = await forgedMaterialRequests(runtime, fixture.direct.id, fixture.files.valid)
})
Then('伪造来源被明确拒绝且没有材料记录或原件', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, rejected = materialsState.rejectedSources!, stored = await materialRecords(fixture.dataPath)
  expect(rejected.map(result => result.accepted)).toEqual([false, false])
  expect(rejected[0].error).toContain('path'); expect(rejected[1].error).toContain('重新选择文件')
  expect(stored.materials).toEqual([]); expect(stored.preparations).toEqual([])
  expect(await managedMaterialFiles(fixture.dataPath)).toEqual([])
  await expect(drafts(runtime.page)).toHaveCount(0); expect(fixture.endpoint.requests).toHaveLength(0)
})
When('用户将真实本机文本文件拖入私聊', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!
  materialsState.nativeDrop = await dropNativeMaterialFile(runtime, fixture.files.valid)
  await expect(drafts(runtime.page)).toHaveCount(1)
  await expect(drafts(runtime.page).first()).toHaveAttribute('data-material-status', 'ready')
})
Then('原生授权对应真实原件且原文可检查', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, drop = materialsState.nativeDrop!, observed = await drop.inspect(), stored = await materialRecords(fixture.dataPath)
  expect(observed).toHaveLength(1); expect(observed[0]).toMatchObject({ path: fixture.files.valid, name: '有效材料.txt' })
  expect(observed[0].selectionId).toMatch(/^[0-9a-f-]{36}$/)
  expect(drop.file).toMatchObject({ name: '有效材料.txt', size: Buffer.byteLength(fixture.texts.valid) })
  expect(stored.materials).toHaveLength(1); expect(stored.preparations).toHaveLength(1)
  expect(stored.materials[0]).toMatchObject({ name: '有效材料.txt', status: 'ready', authorizedAgentIds: ['researcher'] })
  expect(await materialOriginal(fixture.dataPath, stored.materials[0])).toBe(fixture.texts.valid)
  expect((await managedMaterialFiles(fixture.dataPath)).filter(path => path.endsWith('original'))).toHaveLength(1)
  await drafts(runtime.page).first().getByRole('button', { name: '预览材料 有效材料.txt', exact: true }).click()
  await inspectPreview(runtime, stored.materials[0], fixture.texts.valid.split('\n')[1])
  expect(fixture.endpoint.requests).toHaveLength(0)
})

When('用户发送材料后消息回复与回执暂时失联', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, page = runtime.page
  await selectConversation(page, fixture.direct.title); await addMaterial(runtime, fixture.files.valid)
  await expect(drafts(page).first()).toHaveAttribute('data-material-status', 'ready')
  materialsState.materials = (await detail(runtime, fixture.direct.id)).materials!
  materialsState.sendFault = await materialSendReplyFault(runtime)
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('发送回执失联材料验收')
  await page.getByRole('button', { name: '发送消息', exact: true }).click()
  await expect(page.getByRole('button', { name: '核对发送结果', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeDisabled()
  await idle(runtime, fixture.direct.id)
  materialsState.frozenSend = await materialsState.sendFault.inspect()
  materialsState.beforeRecovery = await detail(runtime, fixture.direct.id)
  materialsState.modelCalls = fixture.endpoint.requests.length
})
Then('切换会话再回来保留原消息身份和冻结载荷', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, page = runtime.page, frozen = materialsState.frozenSend!, material = materialsState.materials![0]
  expect(frozen.sends).toHaveLength(1); expect(frozen.committedMessages).toHaveLength(1)
  expect(frozen.lostReplies).toBe(1); expect(frozen.unavailableLookups).toBeGreaterThan(0)
  expect(frozen.sends[0]).toMatchObject({ conversationId: fixture.direct.id, content: '发送回执失联材料验收', materialSelections: [{ id: material.id, revision: material.revision }], mentionIds: [] })
  materialsState.originalRequestId = frozen.sends[0].requestId
  expect(frozen.lookups.every(id => id === materialsState.originalRequestId)).toBe(true)
  // Later editing is a separate unsent draft; receipt lookup must retain the original frozen body/selections.
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('核对后保留的新草稿')
  await selectConversation(page, fixture.group.title)
  await expect(drafts(page)).toHaveCount(0); await expect(page.getByRole('button', { name: '核对发送结果', exact: true })).toHaveCount(0)
  expect(await messageDraft(page.getByRole('textbox', { name: '消息内容', exact: true }))).toBe('')
  await selectConversation(page, fixture.direct.title)
  expect(await messageDraft(page.getByRole('textbox', { name: '消息内容', exact: true }))).toBe('核对后保留的新草稿')
  await expect(page.getByRole('button', { name: '核对发送结果', exact: true })).toBeVisible()
  await expect(drafts(page).first().getByRole('button', { name: '移除材料 有效材料.txt', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeDisabled()
  expect((await materialsState.sendFault!.inspect()).sends).toEqual(frozen.sends)
  const stored = await materialRecords(fixture.dataPath)
  expect(stored.requests).toHaveLength(1); expect(stored.requests[0]).toMatchObject({ id: materialsState.originalRequestId, messageId: frozen.committedMessages[0].id })
  expect(JSON.parse(stored.requests[0].fingerprint)).toMatchObject(JSON.parse(JSON.stringify(frozen.sends[0])))
  expect(stored.messages.filter(message => message.senderType === 'user')).toHaveLength(1)
  expect(stored.turns).toHaveLength(1); expect(fixture.endpoint.requests).toHaveLength(materialsState.modelCalls!)
})
When('用户明确核对材料消息发送结果', async ({ runtime, materialsState }) => {
  await materialsState.sendFault!.allowLookup()
  await runtime.page.getByRole('button', { name: '核对发送结果', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: '核对发送结果', exact: true })).toHaveCount(0)
  await expect(drafts(runtime.page)).toHaveCount(0)
  expect(await messageDraft(runtime.page.getByRole('textbox', { name: '消息内容', exact: true }))).toBe('核对后保留的新草稿')
})
Then('只核对原消息与轮次且重启不重复关联或模型调用', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, original = materialsState.frozenSend!.committedMessages[0], before = materialsState.beforeRecovery!, fault = await materialsState.sendFault!.inspect()
  expect(fault.sends).toEqual(materialsState.frozenSend!.sends); expect(fault.committedMessages).toEqual([original])
  expect(fault.lookups.length).toBeGreaterThan(1); expect(fault.lookups.every(id => id === materialsState.originalRequestId)).toBe(true)
  const after = await detail(runtime, fixture.direct.id), stored = await materialRecords(fixture.dataPath)
  expect(after.messages.map(message => message.id)).toEqual(before.messages.map(message => message.id)); expect(after.turns).toEqual(before.turns)
  expect(after.materials).toEqual(before.materials)
  expect(after.messages.find(message => message.id === original.id)).toMatchObject({ content: '发送回执失联材料验收', materialIds: [materialsState.materials![0].id] })
  expect(stored.messageReceipts).toHaveLength(1); expect(stored.messageReceipts[0]).toMatchObject({ id: materialsState.originalRequestId, messageId: original.id, conversationId: fixture.direct.id })
  expect(stored.materials[0].messageId).toBe(original.id); expect(stored.requests).toHaveLength(1)
  expect(fixture.endpoint.requests).toHaveLength(materialsState.modelCalls!)
  await runtime.restart(); await selectConversation(runtime.page, fixture.direct.title)
  const restarted = await detail(runtime, fixture.direct.id)
  expect(restarted.messages.map(message => message.id)).toEqual(before.messages.map(message => message.id)); expect(restarted.turns).toEqual(before.turns)
  expect(restarted.materials).toEqual(before.materials)
  await expect(runtime.page.getByRole('region', { name: '消息材料', exact: true }).locator('[data-material-id]')).toHaveCount(1)
  expect(fixture.endpoint.requests).toHaveLength(materialsState.modelCalls!)
})

Then('群成员变化后当前范围与旧显式名单各自保持', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!
  await legacyMaterialGrant(runtime, fixture.dataPath, materialsState.materials![0].id)
  const beforeCalls = fixture.endpoint.requests.length
  await runtime.page.evaluate(async id => {
    const conversation = (await window.boai.request('getConversation', { id })).conversation
    await window.boai.request('createConversation', { id, kind: 'group', title: conversation.title, mode: conversation.mode, agentIds: ['researcher', 'reviewer'], expectedConfigVersion: conversation.configVersion })
    await window.boai.request('sendMessage', { conversationId: id, content: '请当前成员继续核对两份历史报告', mentionIds: ['researcher', 'reviewer'], requestId: 'materials-current-members' })
  }, fixture.group.id)
  await idle(runtime, fixture.group.id)
  const requests = fixture.endpoint.requests.slice(beforeCalls)
  expect(requests.some(request => request.model === 'materials-writer')).toBe(false)
  expect(requests.filter(request => request.model === 'materials-researcher').some(request => JSON.stringify(request).includes('FIRST_PRIVATE_TOKEN_A') && JSON.stringify(request).includes('SECOND_SHARED_TOKEN_B'))).toBe(true)
  const reviewer = requests.filter(request => request.model === 'materials-reviewer').map(request => JSON.stringify(request))
  expect(reviewer.some(request => request.includes('SECOND_SHARED_TOKEN_B'))).toBe(true)
  expect(reviewer.every(request => !request.includes('FIRST_PRIVATE_TOKEN_A'))).toBe(true)
  expect((await detail(runtime, fixture.group.id)).conversation.agentIds).toEqual(['researcher', 'reviewer'])
})

When('已发送材料的原件暂时缺失并重新启动', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, page = runtime.page
  await selectConversation(page, fixture.direct.title); await addMaterial(runtime, fixture.files.valid)
  await expect(drafts(page).first()).toHaveAttribute('data-material-status', 'ready')
  await page.getByRole('button', { name: '发送消息', exact: true }).click(); await idle(runtime, fixture.direct.id)
  const current = await detail(runtime, fixture.direct.id)
  materialsState.beforeRecovery = current; materialsState.materials = current.materials!; materialsState.modelCalls = fixture.endpoint.requests.length
  materialsState.restoreOriginal = await temporarilyRemoveMaterialOriginal(fixture.dataPath, current.materials![0])
  await runtime.page.reload(); await selectConversation(runtime.page, fixture.direct.title)
  await expect(runtime.page.getByRole('button', { name: '核对材料 有效材料.txt', exact: true })).toBeVisible()
  await runtime.restart(); await selectConversation(runtime.page, fixture.direct.title)
  await runtime.page.getByRole('button', { name: '核对材料 有效材料.txt', exact: true }).click()
})
Then('材料显示不可用且不会展示之前的正文', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, material = materialsState.materials![0]
  expect((await materialRecords(fixture.dataPath)).materials.find(value => value.id === material.id)?.status).toBe('unavailable')
  await expect(runtime.page.getByRole('button', { name: '重新核对材料', exact: true })).toBeVisible()
  await expect(runtime.page.locator(`[data-material-preview-id="${material.id}"]:visible`)).toHaveCount(0)
  expect(fixture.endpoint.requests).toHaveLength(materialsState.modelCalls!)
})
When('用户恢复相同原件后明确重新核对材料', async ({ runtime, materialsState }) => {
  await materialsState.restoreOriginal!()
  await runtime.page.getByRole('button', { name: '重新核对材料', exact: true }).click()
})
Then('原材料正文恢复且消息和模型调用均未重放', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, material = materialsState.materials![0], before = materialsState.beforeRecovery!
  await inspectPreview(runtime, material, fixture.texts.valid.split('\n')[1])
  const current = await detail(runtime, fixture.direct.id), repaired = current.materials!.find(value => value.id === material.id)!
  expect(repaired).toMatchObject({ status: 'ready', contentHash: material.contentHash, messageId: material.messageId, deliveryScope: material.deliveryScope })
  expect(repaired.revision).toBeGreaterThan(material.revision)
  expect(current.messages).toEqual(before.messages); expect(current.turns).toEqual(before.turns)
  expect(fixture.endpoint.requests).toHaveLength(materialsState.modelCalls!)
  await runtime.page.getByRole('button', { name: '查看材料 有效材料.txt 第 2 至 2 行', exact: true }).click()
  await inspectPreview(runtime, repaired, fixture.texts.valid.split('\n')[1])
})

When('用户发送Lody原样本文件 {string}', async ({ runtime, materialsState }, inputKind: string) => {
  const fixture = materialsState.fixture!, page = runtime.page
  const kind = inputKind.replace('invalid-', '')
  const factories: Record<string, () => Uint8Array> = { pdf: createSamplePdf, docx: sampleDocx, xlsx: sampleXlsx, pptx: samplePptx }
  const path = join(await realpath(runtime.root), `Lody样本.${kind}`); await writeFile(path, inputKind.startsWith('invalid-') ? Buffer.from('INVALID_LODY_DOCUMENT') : factories[kind]())
  await selectConversation(page, fixture.direct.title); await addMaterial(runtime, path)
  await expect(drafts(page)).toHaveCount(1)
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('保存此文件以供阅读。')
  await page.getByRole('button', { name: '发送消息', exact: true }).click(); await idle(runtime, fixture.direct.id)
  const current = await detail(runtime, fixture.direct.id)
  materialsState.materials = current.materials!.filter(material => material.name === `Lody样本.${kind}`)
  materialsState.binaryKind = kind; materialsState.modelCalls = fixture.endpoint.requests.length
  expect(materialsState.materials).toHaveLength(1)
  const material = materialsState.materials[0]
  await runtime.reviewFile(material.name, join(fixture.dataPath, 'materials', material.conversationId, material.id, 'original'), { required: true, expectedSha256: material.contentHash })
  await runtime.reviewData('二进制来源', { id: material.id, revision: material.revision, contentHash: material.contentHash, kind })
  await page.getByRole('button', { name: `预览材料 ${material.name}`, exact: true }).click()
})
Then('Lody原查看器对损坏文件显示错误且不生成业务写入', async ({ runtime, materialsState }) => {
  const page = runtime.page, material = materialsState.materials![0]
  const preview = page.locator(`[data-material-preview-id="${material.id}"]:visible`)
  await expect(preview.getByTestId('session-file-error-state')).toBeVisible()
  await expect(preview.locator('.textLayer, [data-testid="pptx-viewport"], [role="grid"]')).toHaveCount(0)
  expect(materialsState.fixture!.endpoint.requests).toHaveLength(materialsState.modelCalls!)
  await runtime.reviewNativeCheckpoint(`Lody ${materialsState.binaryKind} 损坏原件错误`)
})
Then('Lody查看器显示原内容且原操作和关闭重开可用', async ({ runtime, materialsState }) => {
  const material = materialsState.materials![0], kind = materialsState.binaryKind!, page = runtime.page
  const preview = page.locator(`[data-material-preview-id="${material.id}"]:visible`), viewer = preview.locator(`[data-binary-viewer="${kind}"]`)
  await expect(viewer).toBeVisible()
  if (kind === 'pdf') {
    await expect(viewer.locator('.textLayer').getByText('Overview', { exact: true })).toBeVisible()
    await viewer.getByRole('button', { name: '下一页', exact: true }).click()
    await expect(viewer.getByRole('spinbutton', { name: '页码', exact: true })).toHaveValue('2')
    await viewer.getByRole('combobox', { name: '缩放比例', exact: true }).click()
    await page.getByRole('option', { name: '125%', exact: true }).click()
    await expect(viewer.getByRole('combobox', { name: '缩放比例', exact: true })).toContainText('125%')
    await viewer.getByRole('button', { name: '搜索文档', exact: true }).click()
    await viewer.getByRole('searchbox', { name: '在文档中查找', exact: true }).fill('Revenue')
    await expect(viewer.getByText('1/1', { exact: true })).toBeVisible()
    await viewer.getByRole('button', { name: '顺时针旋转', exact: true }).click()
  } else if (kind === 'docx') {
    await expect(viewer.getByText('Quarterly report', { exact: true })).toBeVisible()
    await expect(viewer.getByText('Revenue increased across all regions.', { exact: true })).toBeVisible()
    await viewer.getByRole('combobox', { name: '缩放比例', exact: true }).click()
    await page.getByRole('option', { name: '125%', exact: true }).click()
    await expect(viewer.getByRole('combobox', { name: '缩放比例', exact: true })).toContainText('125%')
  } else if (kind === 'xlsx') {
    await expect(viewer.getByRole('grid', { name: 'Revenue worksheet grid' })).toBeVisible()
    await viewer.getByRole('button', { name: '放大', exact: true }).click()
    await expect(viewer.getByText('110%', { exact: true })).toBeVisible()
  } else {
    await expect(viewer.getByTestId('pptx-viewport').getByText('Quarterly report', { exact: true })).toBeVisible()
    await expect(viewer.getByRole('navigation', { name: 'Slide thumbnails' })).toBeVisible()
    await viewer.getByRole('button', { name: '放大', exact: true }).click()
  }
  await expect(viewer.getByTestId('session-file-error-state')).toHaveCount(0)
  await runtime.reviewNativeCheckpoint(`Lody ${kind} 实际阅读与操作`)
  await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await expect(page.locator('[data-binary-viewer]:visible')).toHaveCount(0)
  await page.getByRole('button', { name: `预览材料 ${material.name}`, exact: true }).click()
  const reopened = page.locator(`[data-binary-viewer="${kind}"]:visible`)
  await expect(reopened).toBeVisible()
  if (kind === 'pdf') await expect(reopened.locator('.textLayer').getByText('Overview', { exact: true })).toBeVisible()
  else if (kind === 'xlsx') await expect(reopened.getByRole('grid', { name: 'Revenue worksheet grid' })).toBeVisible()
  else if (kind === 'pptx') await expect(reopened.getByTestId('pptx-viewport').getByText('Quarterly report', { exact: true })).toBeVisible()
  else await expect(reopened.getByText('Quarterly report', { exact: true })).toBeVisible()
  expect(materialsState.fixture!.endpoint.requests).toHaveLength(materialsState.modelCalls!)
  await runtime.reviewCheckpoint(`Lody ${kind} 关闭重开`)
})

When('用户发送两份不同格式的Lody原样本', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, root = await realpath(runtime.root)
  await selectConversation(runtime.page, fixture.direct.title)
  const samples: [string, Uint8Array][] = [['Lody切换.pdf', createSamplePdf()], ['Lody切换.docx', sampleDocx()]]
  for (const [index, [name, bytes]] of samples.entries()) {
    const path = join(root, name); await writeFile(path, bytes)
    await addMaterial(runtime, path)
    await expect(drafts(runtime.page).nth(index)).toHaveAttribute('data-material-status', 'ready')
  }
  await runtime.page.getByRole('textbox', { name: '消息内容', exact: true }).fill('两份原样本用于文件查看器切换。')
  await runtime.page.getByRole('button', { name: '发送消息', exact: true }).click()
  await idle(runtime, fixture.direct.id)
  materialsState.beforeRecovery = await detail(runtime, fixture.direct.id)
  materialsState.materials = materialsState.beforeRecovery.materials!
  expect(materialsState.materials).toHaveLength(2)
  materialsState.modelCalls = fixture.endpoint.requests.length
  for (const material of materialsState.materials) await runtime.reviewFile(material.name, join(fixture.dataPath, 'materials', material.conversationId, material.id, 'original'), { required: true, expectedSha256: material.contentHash })
})
Then('Lody迟到PDF不会覆盖新文件且隐藏停读', async ({ runtime, materialsState }) => {
  const observation = await observeWorkViews(runtime, 'getMaterialPreview'), page = runtime.page
  await page.getByRole('button', { name: '预览材料 Lody切换.pdf', exact: true }).click()
  await expect.poll(async () => (await observation.inspect()).delayed).toBe(true)
  await page.getByRole('button', { name: '预览材料 Lody切换.docx', exact: true }).click()
  const viewer = page.locator('[data-binary-viewer="docx"]:visible')
  await expect(viewer.getByText('Quarterly report', { exact: true })).toBeVisible()
  await observation.release()
  await expect(page.locator('[data-binary-viewer]')).toHaveCount(1)
  await expect(page.locator('[data-binary-viewer="pdf"]')).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('迟到PDF不覆盖DOCX原件')
  await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await expect(page.locator('[data-binary-viewer="docx"]')).toHaveCount(0)
  // Closing the current tab selects the previous PDF tab; close that actual tab as well.
  await expect(page.locator('[data-binary-viewer="pdf"] .textLayer').getByText('Overview', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '关闭详情', exact: true }).click()
  await expect(page.locator('[data-binary-viewer]')).toHaveCount(0)
  const reads = (await observation.inspect()).calls.filter(value => value === 'getMaterialPreview').length
  await page.waitForTimeout(250)
  expect((await observation.inspect()).calls.filter(value => value === 'getMaterialPreview')).toHaveLength(reads)
  const after = await detail(runtime, materialsState.fixture!.direct.id), before = materialsState.beforeRecovery!
  expect(after.messages).toEqual(before.messages); expect(after.workItems).toEqual(before.workItems); expect(after.materials).toEqual(before.materials)
  expect(materialsState.fixture!.endpoint.requests).toHaveLength(materialsState.modelCalls!)
  await runtime.reviewCheckpoint('关闭后卸载全部二进制查看器且停读')
})
Then('Lody迟到二进制预览在清理后不能恢复原件', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, observation = await observeWorkViews(runtime, 'getMaterialPreview')
  await runtime.page.getByRole('button', { name: '预览材料 Lody切换.pdf', exact: true }).click()
  await expect.poll(async () => (await observation.inspect()).delayed).toBe(true)
  await runtime.page.evaluate(id => window.boai.request('clearConversationHistory', { id, hide: false }), fixture.direct.id)
  await observation.release()
  await expect(runtime.page.locator('[data-binary-viewer]')).toHaveCount(0)
  await expect(runtime.page.locator('[data-material-preview-id]:visible')).toHaveCount(0)
  const after = await detail(runtime, fixture.direct.id)
  expect(after.materials).toEqual([]); expect(after.messages).toEqual([])
  expect(fixture.endpoint.requests).toHaveLength(materialsState.modelCalls!)
  await runtime.reviewCheckpoint('真实材料清理后迟到字节不恢复文件标签')
})
