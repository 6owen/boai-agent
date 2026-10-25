/*
 * [OUTPUT]: 独立知识提交经真实IPC刷新版本，实际编辑器保留工作方式/目录草稿，保存及重启核对。
 * [OUTPUT]: 群成果文件经原工具发布并从实际菜单保留给明确员工，来源清空/重启与零额外请求核对。
 * [OUTPUT]: 旧共用知识目录经实际选择及隔离v2库准备；核对多文件预览、更新无解绑误报及共享/原件/重启。
 * [INPUT]: 真实Electron文件区/全局预览/菜单/确认与宿主IPC；只替代一次系统文件选择返回。
 * [OUTPUT]: 知识管理/从附件保留及保存应答丢失核对；真实规范文件、配置/原件与重启验证，供应商调用为零。
 * [POS]: 知识资料桌面步骤；不以此证明普通问答或本机员工实际读取。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { test as base } from '../support/test'
import { nextMaterialDialog, prepareMaterialsDesktop } from '../support/materials'
import { knowledgeReplyFault, knowledgeReplyState } from '../support/employee-knowledge'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import type { ConversationDetail, Resource } from '../../../packages/shared/src/domain'
import type { ArtifactVersion } from '../../../packages/shared/src/domain/artifacts'
import { prepareArtifactsDesktop, artifactRecords } from '../support/artifacts'
import { archiveNativeFinalReview } from '../support/native-final-review'
import { teamEndpoint, sendTeamOutput } from '../../fixtures/team-planner'

interface State { legacy?: Resource; legacyDirectory?: string; first?: string; second?: string; groupId?: string; resource?: Resource; materials?: Awaited<ReturnType<typeof prepareMaterialsDesktop>>; requestId?: string; messageCount?: number; artifactSetup?: Awaited<ReturnType<typeof prepareArtifactsDesktop>>; passive?: Awaited<ReturnType<typeof teamEndpoint>>; passiveBefore?: number; artifact?: ArtifactVersion; detailBefore?: ConversationDetail; requestsBefore?: number; targetName?: string }
export const test = base.extend<{ knowledge: State }>({ knowledge: async ({ runtime }, use) => {
  const state: State = {}
  try { await use(state) } finally {
    if (state.artifactSetup) {
      await runtime.reviewData('成果保留受控请求账本', { author: state.artifactSetup.endpoint.requests, recipient: state.passive?.requests, protocolErrors: state.artifactSetup.errors, externalRequests: 0 })
      await archiveNativeFinalReview(runtime, { label: '成果保留', records: async () => {
        const records = await artifactRecords(state.artifactSetup!.dataPath), store = await ProductStore.openReadOnly(join(state.artifactSetup!.dataPath, 'boai.sqlite'))
        try { return { ...records, resources: await store.load('resources'), knowledgeOperations: await store.load('knowledgeOperations'), agents: await store.load('agents') } } finally { await store.close() }
      } })
    }
  }
} })
const { Given, When, Then } = createBdd(test)
Given('员工正在编辑尚未保存的工作方式', async ({ runtime, knowledge }) => {
  const root = await realpath(runtime.root)
  knowledge.first = join(root, '草稿知识.md'); knowledge.second = join(root, '草稿知识更新.md')
  knowledge.legacyDirectory = join(root, 'draft-coding'); await mkdir(knowledge.legacyDirectory)
  await writeFile(knowledge.first, 'DRAFT-KNOWLEDGE-FIRST'); await writeFile(knowledge.second, 'DRAFT-KNOWLEDGE-UPDATED')
  await runtime.start()
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await page.getByRole('button', { name: '编辑工作方式', exact: true }).click()
  await page.getByRole('textbox', { name: '工作方式', exact: true }).fill('KEEP-KNOWLEDGE-CONFIG-DRAFT')
})
When('独立知识添加和更新期间分别保存工作方式与目录草稿', async ({ runtime, knowledge }) => {
  const page = runtime.page
  const retain = async (path: string, replace = false) => {
    await nextMaterialDialog(runtime, { path })
    return page.evaluate(async replace => {
      const agent = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!
      const selected = await window.boai.request('chooseKnowledgeSource', undefined)
      const prior = replace ? (await window.boai.request('listEmployeeKnowledge', { agentId: agent.id }))[0] : undefined
      return window.boai.request('saveEmployeeKnowledge', { requestId: crypto.randomUUID(), agentId: agent.id, expectedConfigVersion: agent.configVersion, source: { kind: 'file', selectionId: selected!.id }, ...(prior ? { replace: { resourceId: prior.id, revision: prior.knowledge!.revision, contentHash: prior.knowledge!.contentHash } } : {}) })
    }, replace)
  }
  const added = await retain(knowledge.first!)
  await expect(page.getByRole('button', { name: '知识资料 · 1 份', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '工作方式', exact: true })).toHaveValue('KEEP-KNOWLEDGE-CONFIG-DRAFT')
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')?.instructions).not.toBe('KEEP-KNOWLEDGE-CONFIG-DRAFT')
  await runtime.reviewNativeCheckpoint('知识添加已提交而工作方式草稿保留')
  await page.getByRole('region', { name: '工作方式', exact: true }).getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByRole('textbox', { name: '工作方式', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '高级配置', exact: true }).click()
  await page.getByRole('tab', { name: '工作区', exact: true }).click()
  const card = page.getByRole('region', { name: '授权目录', exact: true })
  await nextMaterialDialog(runtime, { path: knowledge.legacyDirectory! })
  await card.getByRole('button', { name: '添加授权目录', exact: true }).click()
  const updated = await retain(knowledge.second!, true)
  expect(updated.resourceId).toBe(added.resourceId)
  await expect(card.getByRole('combobox', { name: `目录权限 ${knowledge.legacyDirectory}`, exact: true })).toBeVisible()
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')?.directoryGrants).toBeUndefined()
  await runtime.reviewNativeCheckpoint('知识更新已提交而目录选择仍为草稿')
  await card.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')?.directoryGrants).toEqual([{ path: knowledge.legacyDirectory, access: 'read-write' }])
  knowledge.resource = (await page.evaluate(() => window.boai.request('listEmployeeKnowledge', { agentId: 'researcher' })))[0]
  await runtime.reviewData('知识独立提交与配置保存回执', { added, updated, snapshot: await page.evaluate(() => window.boai.request('snapshot', undefined)) })
})
Then('重启后知识内容和明确保存的配置都保持且没有模型执行', async ({ runtime, knowledge }) => {
  await runtime.restart()
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined)), agent = snapshot.agents.find(agent => agent.id === 'researcher')!
  expect(agent.instructions).toBe('KEEP-KNOWLEDGE-CONFIG-DRAFT')
  expect(agent.directoryGrants).toEqual([{ path: knowledge.legacyDirectory, access: 'read-write' }])
  expect(agent.knowledgeIds).toEqual([knowledge.resource!.id]); expect(snapshot.conversations).toEqual([])
  const resource = (await runtime.page.evaluate(() => window.boai.request('listEmployeeKnowledge', { agentId: 'researcher' })))[0]
  expect(resource.knowledge?.revision).toBe(2); expect(await readFile(resource.path, 'utf8')).toBe('DRAFT-KNOWLEDGE-UPDATED')
  expect(await readFile(knowledge.first!, 'utf8')).toBe('DRAFT-KNOWLEDGE-FIRST')
  expect(await readFile(knowledge.second!, 'utf8')).toBe('DRAFT-KNOWLEDGE-UPDATED')
  await runtime.reviewFile('知识最新独立副本', resource.path, { required: true, expectedSha256: resource.knowledge!.contentHash })
  await runtime.reviewData('重启后的配置和零会话事实', { snapshot, resource, externalRequests: 0 })
  expect(runtime.errors).toEqual([])
})
Given('员工知识资料的两份外部原件和目标群已准备好', async ({ runtime, knowledge }) => {
  const sourceRoot = await realpath(runtime.root)
  knowledge.first = join(sourceRoot, '品牌规范.md'); knowledge.second = join(sourceRoot, '品牌规范更新.md')
  await writeFile(knowledge.first, '# 品牌规范\n知识原件：使用蓝色标题。'); await writeFile(knowledge.second, '# 品牌规范\n知识更新：使用绿色标题。')
  await runtime.start()
  knowledge.groupId = (await runtime.page.evaluate(() => window.boai.request('createConversation', { kind: 'group', title: '知识资料共享验收群', agentIds: ['researcher', 'writer'] }))).id
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await runtime.page.getByRole('button', { name: '知识资料 · 0 份', exact: true }).click()
  await expect(runtime.page.getByRole('region', { name: '员工知识资料', exact: true })).toBeVisible()
})
When('从员工文件区添加预览更新并共享知识资料', async ({ runtime, knowledge }) => {
  const page = runtime.page, files = page.getByRole('region', { name: '员工知识资料', exact: true })
  await nextMaterialDialog(runtime, { path: knowledge.first! }); await files.getByRole('button', { name: '添加资料', exact: true }).click()
  await expect(files.getByRole('button', { name: '品牌规范.md', exact: true })).toBeVisible()
  knowledge.resource = (await page.evaluate(() => window.boai.request('listEmployeeKnowledge', { agentId: 'researcher' })))[0]
  expect(await readFile(knowledge.resource.path, 'utf8')).toContain('使用蓝色标题')
  await files.getByRole('button', { name: '品牌规范.md', exact: true }).click()
  await expect(page.getByText('知识原件：使用蓝色标题。', { exact: true })).toBeVisible()
  await runtime.reviewNativeCheckpoint('知识原件在全局预览中显示')
  await page.getByRole('tab', { name: '研究员 · 文件', exact: true }).click()
  await files.getByRole('button', { name: '知识资料操作 品牌规范.md', exact: true }).click()
  await nextMaterialDialog(runtime, { path: knowledge.second! }); await page.getByRole('menuitem', { name: '更新内容', exact: true }).click()
  await expect(files.getByRole('button', { name: '品牌规范更新.md', exact: true })).toBeVisible()
  const updated = (await page.evaluate(() => window.boai.request('listEmployeeKnowledge', { agentId: 'researcher' })))[0]
  expect(updated.id).toBe(knowledge.resource.id); expect(updated.knowledge?.revision).toBe(2)
  await expect(readFile(knowledge.resource.path)).rejects.toMatchObject({ code: 'ENOENT' }); knowledge.resource = updated
  await files.getByRole('button', { name: '品牌规范更新.md', exact: true }).click()
  await expect(page.getByText('知识更新：使用绿色标题。', { exact: true })).toBeVisible()
  expect(await page.getByText('知识资料内容已变化，请重新打开', { exact: true }).count()).toBe(0)
  await expect(page.getByText('知识原件：使用蓝色标题。', { exact: true })).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('更新后同一资料仅预览当前内容')
  await page.getByRole('tab', { name: '研究员 · 文件', exact: true }).click()
  await files.getByRole('button', { name: '知识资料操作 品牌规范更新.md', exact: true }).click(); await page.getByRole('menuitem', { name: '共享到会话', exact: true }).click()
  const sharing = page.getByRole('dialog', { name: '共享到会话', exact: true })
  await sharing.getByRole('button', { name: '共享', exact: true }).click(); await expect(sharing.getByRole('button', { name: '取消共享', exact: true })).toBeVisible()
  await runtime.reviewNativeCheckpoint('知识仅明确共享到选定群')
  await page.keyboard.press('Escape')
  await expect(sharing).toHaveCount(0)
  await expect(page.getByRole('tab', { name: '研究员 · 文件', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(files.getByRole('button', { name: '品牌规范更新.md', exact: true })).toBeVisible()
  const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), knowledge.groupId!)
  expect(detail.conversation.sharedKnowledgeIds).toEqual([updated.id]); expect(detail.messages).toEqual([]); expect(detail.runs).toEqual([])
  await runtime.reviewFile('已保留的新知识原件', updated.path, { required: true, expectedSha256: updated.knowledge!.contentHash })
  await runtime.reviewData('更新与共享实际身份', { resource: updated, conversation: detail.conversation })
})
Then('移除知识资料后绑定和共享消失且外部原件与重启事实保持', async ({ runtime, knowledge }) => {
  const files = runtime.page.getByRole('region', { name: '员工知识资料', exact: true })
  await files.getByRole('button', { name: '知识资料操作 品牌规范更新.md', exact: true }).click(); await runtime.page.getByRole('menuitem', { name: '移除', exact: true }).click()
  await expect(runtime.page.getByText('停止使用这份知识资料；原会话文件和外部原件保留。', { exact: true })).toBeVisible()
  await expect(runtime.page.getByRole('menu')).toHaveCount(0)
  await runtime.reviewNativeCheckpoint('知识移除的Popover确认')
  await runtime.page.getByRole('button', { name: '确认移除', exact: true }).click()
  await expect(files.getByText('知识资料 · 0 份', { exact: true })).toBeVisible()
  await expect(readFile(knowledge.resource!.path)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(await readFile(knowledge.first!, 'utf8')).toContain('使用蓝色标题'); expect(await readFile(knowledge.second!, 'utf8')).toContain('使用绿色标题')
  await runtime.reviewFile('外部原件一保持', knowledge.first!, { required: true }); await runtime.reviewFile('外部原件二保持', knowledge.second!, { required: true })
  await runtime.restart()
  const current = await runtime.page.evaluate(async groupId => ({ resources: await window.boai.request('listEmployeeKnowledge', { agentId: 'researcher' }), group: await window.boai.request('getConversation', { id: groupId }) }), knowledge.groupId!)
  expect(current.resources).toEqual([]); expect(current.group.conversation.sharedKnowledgeIds).toEqual([]); expect(current.group.runs).toEqual([])
  await runtime.reviewData('重启后的移除与零执行事实', current)
  expect(runtime.errors).toEqual([])
})

Given('员工已收到附件且知识保存应答暂时不可查询', async ({ runtime, knowledge }) => {
  const setup = knowledge.materials = await prepareMaterialsDesktop(runtime)
  await nextMaterialDialog(runtime, { path: setup.files.valid })
  await runtime.page.evaluate(async conversationId => {
    const selected = await window.boai.request('chooseMaterialSource', undefined)
    const material = await window.boai.request('prepareMaterial', { conversationId, selectionId: selected!.id, requestId: crypto.randomUUID() })
    await window.boai.request('sendMessage', { conversationId, content: '请确认收到附件。', mentionIds: ['researcher'], requestId: crypto.randomUUID(), materialSelections: [{ id: material.id, revision: material.revision }] })
  }, setup.direct.id)
  await expect.poll(async () => { const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), setup.direct.id); return detail.runs.length > 0 && detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) }).toBe(true)
  knowledge.messageCount = (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), setup.direct.id)).messages.length
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await runtime.page.getByRole('button', { name: '知识资料 · 0 份', exact: true }).click()
  await runtime.page.getByRole('group', { name: '文件视图', exact: true }).getByRole('button', { name: '会话文件', exact: true }).click()
  await knowledgeReplyFault(runtime)
})
When('从附件菜单保留为知识资料并在未知结果时重启', async ({ runtime, knowledge }) => {
  const page = runtime.page, files = page.getByRole('region', { name: '员工文件', exact: true })
  await files.getByRole('button', { name: '文件操作 有效材料.txt', exact: true }).click()
  await page.getByRole('menuitem', { name: '添加到知识资料', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '添加到知识资料', exact: true })
  await dialog.getByRole('button', { name: '保存资料', exact: true }).click()
  await expect(dialog.getByRole('button', { name: '核对保存结果', exact: true })).toBeEnabled()
  await expect(dialog.getByRole('combobox', { name: '知识资料目标员工', exact: true })).toBeDisabled()
  await dialog.getByRole('button', { name: '取消', exact: true }).click()
  await expect(files.getByRole('button', { name: '核对知识资料保存结果', exact: true })).toBeVisible()
  const fault = await knowledgeReplyState(runtime)
  expect(fault.saves).toHaveLength(1); expect(fault.lostReplies).toBe(1); expect(fault.lookups).toEqual(fault.saves)
  knowledge.requestId = fault.saves[0]
  knowledge.resource = (await page.evaluate(() => window.boai.request('listEmployeeKnowledge', { agentId: 'researcher' })))[0]
  expect(knowledge.resource.id).toBe(fault.resourceId)
  await runtime.reviewData('未知保存的唯一实际请求', fault)
  await runtime.reviewFile('已提交的附件知识副本', knowledge.resource.path, { required: true, expectedSha256: knowledge.resource.knowledge!.contentHash })
  await runtime.reviewNativeCheckpoint('关闭弹窗后原请求核对入口保持')
  await runtime.restart()
})
Then('只核对原请求且清空来源会话后知识资料仍可预览', async ({ runtime, knowledge }) => {
  const page = runtime.page, setup = knowledge.materials!
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await page.getByRole('button', { name: '知识资料 · 1 份', exact: true }).click()
  await page.getByRole('group', { name: '文件视图', exact: true }).getByRole('button', { name: '会话文件', exact: true }).click()
  const check = page.getByRole('button', { name: '核对知识资料保存结果', exact: true })
  await expect(check).toBeVisible(); await check.click(); await expect(check).toHaveCount(0)
  const beforeClear = await page.evaluate(async ({ requestId, conversationId }) => ({ receipt: await window.boai.request('getEmployeeKnowledgeReceipt', { requestId }), detail: await window.boai.request('getConversation', { id: conversationId }), resources: await window.boai.request('listEmployeeKnowledge', { agentId: 'researcher' }) }), { requestId: knowledge.requestId!, conversationId: setup.direct.id })
  expect(beforeClear.receipt).toMatchObject({ requestId: knowledge.requestId, status: 'completed', resourceId: knowledge.resource!.id })
  expect(beforeClear.resources).toHaveLength(1); expect(beforeClear.detail.messages).toHaveLength(knowledge.messageCount!)
  await page.evaluate(id => window.boai.request('clearConversationHistory', { id, hide: false }), setup.direct.id)
  await page.getByRole('group', { name: '文件视图', exact: true }).getByRole('button', { name: '知识资料', exact: true }).click()
  await page.getByRole('region', { name: '员工知识资料', exact: true }).getByRole('button', { name: '有效材料.txt', exact: true }).click()
  await expect(page.getByText('VALID_DRAFT_TOKEN_C：应保留的原文。', { exact: false })).toBeVisible()
  const cleared = await page.evaluate(id => window.boai.request('getConversation', { id }), setup.direct.id)
  expect(cleared.messages).toEqual([])
  expect(await readFile(knowledge.resource!.path, 'utf8')).toBe(setup.texts.valid)
  expect(await readFile(setup.files.valid, 'utf8')).toBe(setup.texts.valid)
  await runtime.reviewData('核对结果与未增加聊天的实际事实', beforeClear)
  await runtime.reviewData('来源聊天清空后的实际事实', cleared)
  await runtime.reviewNativeCheckpoint('来源聊天清空后仍可读取知识原件')
  expect(runtime.errors).toEqual([])
})

Given('两位员工已绑定旧知识目录并共享到群', async ({ runtime, knowledge }) => {
  const root = await realpath(runtime.root)
  knowledge.first = join(root, '旧知识原件.md'); knowledge.second = join(root, '员工专属新资料.md')
  await writeFile(knowledge.first, '旧来源保留原件'); await writeFile(knowledge.second, '# 员工专属新资料\n只更新研究员的绿色标题规范。')
  await runtime.start()
  await nextMaterialDialog(runtime, { path: knowledge.first })
  knowledge.legacy = await runtime.page.evaluate(async () => {
    const path = await window.boai.request('choosePath', { kind: 'knowledge' })
    return window.boai.request('importResource', { kind: 'knowledge', path: path! })
  })
  knowledge.groupId = await runtime.page.evaluate(async id => {
    const snapshot = await window.boai.request('snapshot', undefined)
    for (const agentId of ['researcher', 'writer']) {
      const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...agent } = snapshot.agents.find(agent => agent.id === agentId)!
      await window.boai.request('saveAgent', { ...agent, expectedConfigVersion: configVersion, knowledgeIds: [id] })
    }
    return (await window.boai.request('createConversation', { kind: 'group', title: '旧知识共享群', agentIds: ['researcher', 'writer'], sharedKnowledgeIds: [id] })).id
  }, knowledge.legacy.id)
  await runtime.close()
  // Prepare the historical directory shape while the isolated application is fully stopped.
  const directory = knowledge.legacyDirectory = join(dirname(knowledge.legacy.path), 'legacy-directory')
  await mkdir(join(directory, 'nested'), { recursive: true }); await writeFile(join(directory, 'a.md'), '# 旧目录第一份\n旧目录蓝色标题。'); await writeFile(join(directory, 'nested/b.txt'), '旧目录第二份：原文保持。')
  await rm(knowledge.legacy.path)
  knowledge.legacy = { ...knowledge.legacy, path: directory, name: '旧共用知识目录' }
  const store = new ProductStore(join(root, 'v2', 'boai.sqlite')); await store.init()
  try { await store.write([{ collection: 'resources', id: knowledge.legacy.id, value: knowledge.legacy }]) } finally { await store.close() }
  await runtime.reviewData('准备的旧知识目录身份', knowledge.legacy)
  await runtime.start()
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: '研究员', exact: true }).click()
  await runtime.page.getByRole('button', { name: '知识资料 · 1 份', exact: true }).click()
})
When('在员工文件区切换旧目录文件并更新当前员工的资料', async ({ runtime, knowledge }) => {
  const page = runtime.page, files = page.getByRole('region', { name: '员工知识资料', exact: true })
  await files.getByRole('button', { name: '旧共用知识目录', exact: true }).click()
  await expect(page.getByText('旧目录蓝色标题。', { exact: false })).toBeVisible()
  await page.getByRole('combobox', { name: '知识资料文件', exact: true }).click()
  await page.getByRole('option', { name: 'nested/b.txt', exact: true }).click()
  await expect(page.getByRole('listbox')).toHaveCount(0)
  await expect(page.getByText('旧目录第二份：原文保持。', { exact: false })).toBeVisible()
  await runtime.reviewNativeCheckpoint('旧知识目录切换第二份实际原件')
  await page.getByRole('tab', { name: '研究员 · 文件', exact: true }).click()
  await nextMaterialDialog(runtime, { path: knowledge.second! })
  await files.getByRole('button', { name: '知识资料操作 旧共用知识目录', exact: true }).click()
  await page.getByRole('menuitem', { name: '更新内容', exact: true }).click()
  await expect(files.getByRole('button', { name: '员工专属新资料.md', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '旧共用知识目录', exact: true }).click()
  await expect(page.getByText('该员工已移除此资料。', { exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '研究员 · 文件', exact: true }).click()
  await files.getByRole('button', { name: '员工专属新资料.md', exact: true }).click()
  await expect(page.getByText('只更新研究员的绿色标题规范。', { exact: false })).toBeVisible()
  await expect(page.getByText('员工未绑定此知识资料', { exact: true })).toHaveCount(0)
  knowledge.resource = (await page.evaluate(() => window.boai.request('listEmployeeKnowledge', { agentId: 'researcher' })))[0]
  expect(knowledge.resource.id).not.toBe(knowledge.legacy!.id)
  await runtime.reviewNativeCheckpoint('当前员工已切到专属资料，旧标签撤销访问')
})
Then('其他员工仍读取旧资料且原共享范围与重启结果保持', async ({ runtime, knowledge }) => {
  const observed = await runtime.page.evaluate(async ({ oldId, newId, groupId }) => {
    const writer = await window.boai.request('getEmployeeKnowledgeFiles', { agentId: 'writer', resourceId: oldId })
    const preview = await window.boai.request('getEmployeeKnowledgePreview', { agentId: 'writer', resourceId: oldId, contentHash: writer.contentHash, fileKey: 'nested/b.txt' })
    return { writer, preview, researcher: await window.boai.request('listEmployeeKnowledge', { agentId: 'researcher' }), group: (await window.boai.request('getConversation', { id: groupId })).conversation, newId }
  }, { oldId: knowledge.legacy!.id, newId: knowledge.resource!.id, groupId: knowledge.groupId! })
  expect(observed.preview.filePreview.text).toBe('旧目录第二份：原文保持。')
  expect(observed.researcher.map(resource => resource.id)).toEqual([knowledge.resource!.id])
  expect(observed.group.sharedKnowledgeIds).toEqual([knowledge.legacy!.id, knowledge.resource!.id])
  await runtime.reviewData('当前员工与其他员工的实际绑定和共享', observed)
  await runtime.reviewFile('旧知识目录第二份原件', join(knowledge.legacyDirectory!, 'nested/b.txt'))
  await runtime.reviewFile('当前员工更新后的知识副本', knowledge.resource!.path)
  await runtime.restart()
  const restored = await runtime.page.evaluate(async id => ({ researcher: await window.boai.request('listEmployeeKnowledge', { agentId: 'researcher' }), writer: await window.boai.request('listEmployeeKnowledge', { agentId: 'writer' }), group: (await window.boai.request('getConversation', { id })).conversation }), knowledge.groupId!)
  expect(restored.researcher.map(resource => resource.id)).toEqual([knowledge.resource!.id]); expect(restored.writer.map(resource => resource.id)).toEqual([knowledge.legacy!.id])
  expect(restored.group.sharedKnowledgeIds).toEqual(observed.group.sharedKnowledgeIds)
  expect(await readFile(knowledge.first!, 'utf8')).toBe('旧来源保留原件')
  expect(await readFile(join(knowledge.legacyDirectory!, 'a.md'), 'utf8')).toContain('旧目录蓝色标题')
  await runtime.reviewData('重启后的旧资料兼容事实', restored); expect(runtime.errors).toEqual([])
})

Given('群内员工已经通过原工具发布可保留的成果', async ({ runtime, knowledge }) => {
  const setup = knowledge.artifactSetup = await prepareArtifactsDesktop(runtime, { file: { name: '员工交付规范.md', fileName: 'retained-guide.md', content: '# 员工交付规范\n\n成果知识独立保留：紫色标题，归档十五天。' } })
  knowledge.passive = await teamEndpoint((_body, response) => sendTeamOutput(response, { action: 'pass' })); runtime.trackServer(knowledge.passive.server)
  const created = await runtime.page.evaluate(async url => {
    const snapshot = await window.boai.request('snapshot', undefined)
    const connection = await window.boai.request('saveConnection', { name: '成果接收员工离线协议', provider: 'openai-compatible', baseUrl: url, defaultModel: 'passive-fixture' })
    const { configVersion, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...agent } = snapshot.agents.find(agent => agent.id === 'writer')!
    await window.boai.request('saveAgent', { ...agent, expectedConfigVersion: configVersion, connectionId: connection.id, modelId: 'passive-fixture' })
    const group = await window.boai.request('createConversation', { kind: 'group', title: '成果知识保留群', agentIds: ['researcher', 'writer'] })
    await window.boai.request('sendMessage', { conversationId: group.id, content: '请发布员工交付规范文件。', mentionIds: ['researcher'], requestId: crypto.randomUUID() })
    return { group, targetName: snapshot.agents.find(agent => agent.id === 'writer')!.name }
  }, knowledge.passive.url)
  knowledge.groupId = created.group.id; knowledge.targetName = created.targetName
  await expect.poll(async () => {
    const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), knowledge.groupId!)
    return detail.artifacts.length === 1 && detail.runs.length > 0 && detail.runs.every(run => run.status === 'completed') && detail.turns!.every(turn => turn.status === 'completed')
  }, { timeout: 30000 }).toBe(true)
  knowledge.detailBefore = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), knowledge.groupId)
  knowledge.artifact = knowledge.detailBefore.artifacts[0] as ArtifactVersion
  expect(knowledge.artifact.ownerAgentId).toBe('researcher'); expect(setup.errors).toEqual([])
  await runtime.reviewFile('员工实际交付原件', knowledge.artifact.path, { required: true, expectedSha256: knowledge.artifact.contentHash })
  await runtime.reviewData('成果保留前原消息与工具交付', knowledge.detailBefore)
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: /^成果知识保留群/ }).click()
  await runtime.page.getByRole('button', { name: '会话操作', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '文件', exact: true }).click()
  await expect(runtime.page.getByRole('region', { name: '会话文件', exact: true }).getByRole('button', { name: '文件操作 员工交付规范.md', exact: true })).toBeVisible()
  knowledge.requestsBefore = setup.endpoint.requests.length
  knowledge.passiveBefore = knowledge.passive.requests.length
})
When('从群文件菜单明确选择另一位员工保存知识资料', async ({ runtime, knowledge }) => {
  const page = runtime.page
  await page.getByRole('region', { name: '会话文件', exact: true }).getByRole('button', { name: '文件操作 员工交付规范.md', exact: true }).click()
  await page.getByRole('menuitem', { name: '添加到知识资料', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '添加到知识资料', exact: true })
  await expect(dialog.getByRole('button', { name: '保存资料', exact: true })).toBeDisabled()
  await dialog.getByRole('combobox', { name: '知识资料目标员工', exact: true }).click()
  await page.getByRole('option', { name: knowledge.targetName!, exact: true }).click()
  await runtime.reviewNativeCheckpoint('群成果必须明确选择保留员工')
  await dialog.getByRole('button', { name: '保存资料', exact: true }).click(); await expect(dialog).toHaveCount(0)
  const current = await page.evaluate(async id => ({ target: await window.boai.request('listEmployeeKnowledge', { agentId: 'writer' }), author: await window.boai.request('listEmployeeKnowledge', { agentId: 'researcher' }), detail: await window.boai.request('getConversation', { id }) }), knowledge.groupId!)
  expect(current.target).toHaveLength(1); expect(current.author).toEqual([])
  knowledge.resource = current.target[0]
  expect(knowledge.resource.ownerAgentId).toBe('writer'); expect(knowledge.resource.path).not.toBe(knowledge.artifact!.path)
  expect(knowledge.resource.knowledge!.contentHash).toBe(knowledge.artifact!.contentHash)
  expect(current.detail.messages).toEqual(knowledge.detailBefore!.messages); expect(current.detail.runs).toEqual(knowledge.detailBefore!.runs)
  expect(current.detail.conversation.sharedKnowledgeIds ?? []).toEqual([])
  expect(knowledge.artifactSetup!.endpoint.requests).toHaveLength(knowledge.requestsBefore!)
  expect(knowledge.passive!.requests).toHaveLength(knowledge.passiveBefore!)
  await runtime.reviewFile('目标员工独立知识副本', knowledge.resource.path, { required: true, expectedSha256: knowledge.resource.knowledge!.contentHash })
  await runtime.reviewData('成果保留后的实际身份与零额外执行', current)
})
Then('原会话清空和重启后仅目标员工保留知识原件且没有新增执行', async ({ runtime, knowledge }) => {
  const original = knowledge.artifact!, resource = knowledge.resource!, setup = knowledge.artifactSetup!
  await runtime.page.evaluate(id => window.boai.request('clearConversationHistory', { id, hide: false }), knowledge.groupId!)
  await expect.poll(() => readFile(original.path).then(() => false, error => { if (error.code !== 'ENOENT') throw error; return true })).toBe(true)
  await runtime.restart()
  const current = await runtime.page.evaluate(async id => ({ target: await window.boai.request('listEmployeeKnowledge', { agentId: 'writer' }), author: await window.boai.request('listEmployeeKnowledge', { agentId: 'researcher' }), detail: await window.boai.request('getConversation', { id }) }), knowledge.groupId!)
  expect(current.target.map(item => item.id)).toEqual([resource.id]); expect(current.author).toEqual([])
  expect(current.detail.messages).toEqual([]); expect(current.detail.artifacts).toEqual([]); expect(current.detail.runs).toEqual([])
  expect(await readFile(resource.path, 'utf8')).toBe('# 员工交付规范\n\n成果知识独立保留：紫色标题，归档十五天。')
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await runtime.page.getByRole('complementary', { name: '通讯录列表' }).getByRole('button', { name: knowledge.targetName!, exact: true }).click()
  await runtime.page.getByRole('button', { name: '知识资料 · 1 份', exact: true }).click()
  await runtime.page.getByRole('region', { name: '员工知识资料', exact: true }).getByRole('button', { name: '员工交付规范.md', exact: true }).click()
  await expect(runtime.page.getByText('成果知识独立保留：紫色标题，归档十五天。', { exact: true })).toBeVisible()
  expect(setup.endpoint.requests).toHaveLength(knowledge.requestsBefore!); expect(setup.errors).toEqual([]); expect(runtime.errors).toEqual([])
  expect(knowledge.passive!.requests).toHaveLength(knowledge.passiveBefore!)
  await runtime.reviewData('清空与重启后知识和零重放事实', { ...current, controlledRequests: setup.endpoint.requests, externalRequests: 0 })
  await runtime.reviewNativeCheckpoint('原成果清空后目标员工仍可预览独立资料')
})
