/*
 * [INPUT]: D1 中文材料场景、生产 Electron UI/IPC、隔离原件与共享协议 fixture。
 * [OUTPUT]: 显式共享点击后等待实际提交的授权状态；同名独立来源、共享投影/可信行定位、切页重启不重放、严格失败门禁、真实 File 原生授权/伪造拒绝与未知准备/消息只读核对及唯一关联/轮次的业务断言。
 * [POS]: tests/e2e/steps/materials.steps.ts；准备文件和故障注入只在 support 层。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import type { Desktop } from '../support/desktop'
import { messageDraft } from '../support/editor-controls'
import { dropNativeMaterialFile, forgedMaterialRequests, managedMaterialFiles, materialOriginal, materialRecords, materialReplyFault, materialSendReplyFault, nextMaterialDialog, prepareMaterialsDesktop } from '../support/materials'
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
  await expect(preview.locator('[data-material-line="2"] > span')).toHaveText(expectedLine)
  await preview.getByText('材料来源与解析记录', { exact: true }).click()
  await expect(preview).toContainText(material.id)
  await expect(preview).toContainText(material.contentHash!)
  await expect(preview).toContainText('text-v1')
}

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
When('用户仅将第一份报告共享给研究员并发送材料', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, page = runtime.page
  const first = drafts(page).first()
  await first.locator('summary').click()
  await expect(first.getByRole('checkbox', { name: '写手', exact: true })).toBeChecked()
  // Sharing commits asynchronously; await the source-backed state rather than a synchronous checkbox toggle.
  await first.getByRole('checkbox', { name: '写手', exact: true }).click()
  await expect(first.getByRole('checkbox', { name: '写手', exact: true })).not.toBeChecked()
  await expect(first.locator('summary')).toHaveText('共享给：研究员')
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
  const first = materialsState.materials!.find(material => material.authorizedAgentIds.length === 1)!, second = materialsState.materials!.find(material => material.authorizedAgentIds.length === 2)!
  const researchRequests = fixture.endpoint.requests.filter(request => request.model === 'materials-researcher').map(request => JSON.stringify(request))
  const writerRequests = fixture.endpoint.requests.filter(request => request.model === 'materials-writer').map(request => JSON.stringify(request))
  expect(researchRequests.some(request => request.includes('FIRST_PRIVATE_TOKEN_A') && request.includes('SECOND_SHARED_TOKEN_B'))).toBe(true)
  expect(writerRequests.some(request => request.includes('SECOND_SHARED_TOKEN_B'))).toBe(true)
  expect(writerRequests.every(request => !request.includes('FIRST_PRIVATE_TOKEN_A'))).toBe(true)
  const researcher = current.messages.find(message => message.senderId === 'researcher' && message.status === 'completed')!, writer = current.messages.find(message => message.senderId === 'writer' && message.status === 'completed')!
  expect(researcher.materialSources?.map(ref => ref.id).sort()).toEqual([first.id, second.id].sort())
  expect(writer.materialSources?.map(ref => ref.id)).toEqual([second.id])
  const source = page.locator(`#message-${researcher.id}`).getByRole('button', { name: '查看材料 报告.md 第 2 至 2 行', exact: true })
  await expect(source).toHaveCount(2); await source.first().click()
  const selected = page.locator(`[data-material-preview-id="${first.id}"]:visible`)
  await expect(selected.getByRole('button', { name: '定位材料第 2 行', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(selected).toContainText(`来源定位：${first.id}:L2`)
  expect(current.workItems).toEqual([])
})
Then('材料详情切页后恢复且重启不重复调用模型', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, first = materialsState.materials!.find(material => material.authorizedAgentIds.length === 1)!, page = runtime.page
  await page.getByRole('button', { name: '通讯录', exact: true }).click()
  await expect(page.locator('[data-material-preview-id]:visible')).toHaveCount(0)
  await page.getByRole('button', { name: '会话', exact: true }).click()
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

When('用户在私聊保留有效材料并逐项添加坏编码超限与不支持材料', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, page = runtime.page
  await selectConversation(page, fixture.direct.title); await addMaterial(runtime, fixture.files.valid)
  await expect(drafts(page).first()).toHaveAttribute('data-material-status', 'ready')
  materialsState.materials = (await detail(runtime, fixture.direct.id)).materials!
  await page.getByRole('textbox', { name: '消息内容', exact: true }).fill('只处理保留的有效材料')
  materialsState.failed = []
  for (const [path, name, reason] of [[fixture.files.encoding, '坏编码.txt', 'UTF-8'], [fixture.files.large, '超限.txt', '128 KiB'], [fixture.files.unsupported, '不支持.pdf', 'TXT']]) {
    await addMaterial(runtime, path)
    const failure = drafts(page).nth(1)
    await expect(failure).toHaveAttribute('data-material-status', 'failed')
    await expect(failure.getByRole('alert')).toContainText(reason)
    await expect(page.getByRole('button', { name: '发送消息', exact: true })).toBeDisabled()
    await expect(drafts(page).first()).toHaveAttribute('data-material-status', 'ready')
    expect(await messageDraft(page.getByRole('textbox', { name: '消息内容', exact: true }))).toBe('只处理保留的有效材料')
    const stored = (await detail(runtime, fixture.direct.id)).materials!.find(material => material.name === name)!
    materialsState.failed.push({ name, reason, id: stored.id })
    if (name !== '不支持.pdf') { await failure.getByRole('button', { name: `移除材料 ${name}`, exact: true }).click(); await expect(drafts(page)).toHaveCount(1) }
  }
})
Then('每份失败都有明确原因且其他原文和正文草稿保持', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, good = materialsState.materials![0]
  expect(materialsState.failed).toHaveLength(3)
  const stored = (await detail(runtime, fixture.direct.id)).materials!
  expect(stored.find(material => material.id === good.id)).toEqual(good)
  expect(stored.filter(material => material.status === 'removed')).toHaveLength(2)
  expect(stored.find(material => material.name === '不支持.pdf')?.status).toBe('failed')
  await drafts(runtime.page).first().getByRole('button', { name: '预览材料 有效材料.txt', exact: true }).click()
  await inspectPreview(runtime, good, fixture.texts.valid.split('\n')[1])
  expect(fixture.endpoint.requests).toHaveLength(0)
})
When('用户移除失败材料并发送保留的有效材料', async ({ runtime, materialsState }) => {
  const fixture = materialsState.fixture!, page = runtime.page
  await drafts(page).nth(1).getByRole('button', { name: '移除材料 不支持.pdf', exact: true }).click()
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
