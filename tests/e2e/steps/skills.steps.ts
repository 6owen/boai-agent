/*
 * [INPUT]: 中文技能管理场景、真实 Electron 与专用本地目录。
 * [OUTPUT]: 资料库主页面退役后，旧受管技能正文/文件/收藏/移除/更新来源/导出通过真实兼容 IPC 核对，不将协议断言称作 UI 验收；完整应用备份恢复后真实技能工具读取/产物发布与授权保持；目录/ZIP 预览、技能库原生保存/往返、收藏/绑定分离、重启记录及清理重试的业务断言。
 * [POS]: skills 的桌面步骤；目录选择仅替代系统原生交互。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { cp, mkdir, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { localSkillsEntry } from '../support/local-skills'
import { test as base } from '../support/test'
import { startSkillDeliveryModel } from '../../fixtures/skills/delivery-model'

export const test = base.extend<{ skills: { source?: string; resourceId?: string; scanId?: string; candidateId?: string; operationId?: string; cleanupId?: string; cleanupRoot?: string; outside?: string; exported?: string } }>({ skills: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)

Given('技能管理使用独立桌面与两个本地候选', async ({ runtime, skills }) => {
  skills.source = join(runtime.root, 'library')
  await mkdir(join(skills.source, 'report-helper/references'), { recursive: true })
  await mkdir(join(skills.source, 'invalid'), { recursive: true })
  await writeFile(join(skills.source, 'report-helper/SKILL.md'), '---\nname: report-helper\ndescription: |\n  整理报告\n  保留依据\n---\n# 报告助手\n只读取获准资料，不自行增加权限。')
  await writeFile(join(skills.source, 'report-helper/references/guide.md'), '引用原始资料并标明结论依据。')
  await writeFile(join(skills.source, 'invalid/SKILL.md'), '---\nname: Invalid_Name\n---\ninvalid')
  await runtime.start({ mainEntry: await localSkillsEntry(runtime), dataDir: join(runtime.root, 'app') })
  await runtime.app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source!] }) }, skills.source)
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '技能', exact: true }).click()
})

When('通过兼容接口预览技能目录并只安装有效技能', async ({ runtime, skills }) => {
  const page = runtime.page
  const scan = await page.evaluate(async () => {
    const source = await window.boai.request('chooseSkillSource', { kind: 'folder' })
    return window.boai.request('scanSkillSource', { kind: 'folder', source: source! })
  })
  expect(scan.candidates.find(candidate => candidate.name !== 'report-helper')?.error).toContain('SKILL.md 的 name 必须')
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).resources).toHaveLength(0)
  const operation = await page.evaluate(scan => window.boai.request('installSkills', { scanId: scan.id, candidateIds: scan.candidates.filter(candidate => !candidate.error).map(candidate => candidate.id), requestId: 'managed-folder', addToFavorites: true }), scan)
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getSkillOperation', { id }), operation.id)).status).toBe('completed')
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.resources).toHaveLength(1)
  skills.resourceId = snapshot.resources[0].id
})

Then('技能内容和参考文件可读且员工尚未绑定', async ({ runtime, skills }) => {
  const page = runtime.page
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.every(agent => !agent.skillIds.length)).toBe(true)
  const detail = await page.evaluate(resourceId => window.boai.request('getSkillDetail', { resourceId: resourceId! }), skills.resourceId)
  expect(detail.content).toContain('# 报告助手')
  expect(detail.files).toHaveLength(2)
  const reference = await page.evaluate(resourceId => window.boai.request('readSkillFile', { resourceId: resourceId!, path: 'references/guide.md' }), skills.resourceId)
  expect(reference.content).toContain('标明结论依据')
})

When('将受管技能加入分组并明确绑定一位员工', async ({ runtime, skills }) => {
  await runtime.page.evaluate(async resourceId => {
    const collection = await window.boai.request('getSkillCollections', undefined)
    const created = await window.boai.request('updateSkillCollections', { expectedRevision: collection.revision, action: { kind: 'create-group', name: '报告工具' } })
    await window.boai.request('updateSkillCollections', { expectedRevision: created.revision, action: { kind: 'assign-group', resourceId: resourceId!, groupId: created.groups.find(group => group.name === '报告工具')!.id } })
    const agent = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
    await window.boai.request('saveAgent', { ...input, skillIds: [resourceId!], expectedConfigVersion: configVersion })
  }, skills.resourceId)
  const groups = await runtime.page.evaluate(() => window.boai.request('getSkillCollections', undefined))
  expect(groups.groupByResourceId[skills.resourceId!]).toBe(groups.groups.find(group => group.name === '报告工具')!.id)
})

Then('重启后分组和绑定保留且取消收藏不撤权', async ({ runtime, skills }) => {
  await runtime.restart()
  const page = runtime.page
  const groups = await page.evaluate(() => window.boai.request('getSkillCollections', undefined))
  expect(groups.groupByResourceId[skills.resourceId!]).toBe(groups.groups.find(group => group.name === '报告工具')!.id)
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '技能', exact: true }).click()
  await page.evaluate(async resourceId => {
    const collection = await window.boai.request('getSkillCollections', undefined)
    await window.boai.request('updateSkillCollections', { expectedRevision: collection.revision, action: { kind: 'favorite', resourceId: resourceId!, favorite: false } })
  }, skills.resourceId)
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('getSkillCollections', undefined))).favoriteResourceIds).toEqual([])
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')?.skillIds).toEqual([skills.resourceId])
})

When('移除技能的受管副本', async ({ runtime, skills }) => {
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '技能', exact: true }).click()
  await page.evaluate(id => window.boai.request('removeResource', { id: id! }), skills.resourceId)
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).resources.length).toBe(0)
})

Then('员工绑定被撤销且原始技能仍然存在', async ({ runtime, skills }) => {
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')?.skillIds).toEqual([])
  expect(await readFile(join(skills.source!, 'report-helper/SKILL.md'), 'utf8')).toContain('报告助手')
  expect(runtime.errors).toEqual([])
})

When('完成技能任务并从完整应用备份恢复后再次读取', async ({ runtime, skills }) => {
  const model = await startSkillDeliveryModel('report-helper'); runtime.trackServer(model.server)
  const marker = `SKILL_EVIDENCE_${crypto.randomUUID().replaceAll('-', '')}`
  await writeFile(join(skills.source!, 'report-helper/references/evidence.md'), marker)
  const installed = await runtime.page.evaluate(async () => {
    const path = await window.boai.request('chooseSkillSource', { kind: 'folder' })
    const scan = await window.boai.request('scanSkillSource', { kind: 'folder', source: path! })
    return window.boai.request('installSkills', { scanId: scan.id, candidateIds: scan.candidates.filter(c => !c.error).map(c => c.id), requestId: 'backup-skill', addToFavorites: true })
  })
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getSkillOperation', { id }), installed.id)).status).toBe('completed')
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined)), resource = snapshot.resources[0]
  expect(snapshot.agents.every(a => !a.skillIds.length)).toBe(true)
  const before = await runtime.page.evaluate(id => window.boai.request('getSkillDetail', { resourceId: id }), resource.id)
  const conversation = await runtime.page.evaluate(async ({ resourceId, baseUrl }) => {
    const c = await window.boai.request('saveConnection', { name: '本地技能验收', provider: 'openai-compatible', baseUrl, defaultModel: 'fixture' })
    const agent = (await window.boai.request('snapshot', undefined)).agents.find(a => a.id === 'researcher')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
    await window.boai.request('saveAgent', { ...input, skillIds: [resourceId], connectionId: c.id, expectedConfigVersion: configVersion })
    return window.boai.request('createConversation', { kind: 'direct', title: '完整备份技能验收', agentIds: [agent.id] })
  }, { resourceId: resource.id, baseUrl: model.url })
  const run = async (requestId: string) => {
    await runtime.page.evaluate(({ conversationId, requestId }) => window.boai.request('sendMessage', { conversationId, requestId, content: '使用明确绑定的技能读取依据并发布报告', mentionIds: [] }), { conversationId: conversation.id, requestId })
    await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)).turns?.at(-1)?.status).toBe('completed')
    const detail = await runtime.page.evaluate(id => window.boai.request('getConversation', { id }), conversation.id)
    const task = detail.runs.filter(r => r.phase === 'execution').at(-1)!
    expect(task.environment).toMatchObject({ resourceVersions: [expect.objectContaining({ id: resource.id })], commandMode: 'disabled' })
    expect(task.toolEvents.filter(t => t.status === 'completed').map(t => t.name)).toEqual(['skill', 'skill_read', 'write_file', 'publish_artifact'])
    expect(await readFile(detail.artifacts.at(-1)!.path, 'utf8')).toBe(`# 技能依据\n${marker}`)
  }
  await run('before-backup')
  const exports = join(runtime.root, 'exports'); await mkdir(exports)
  await runtime.app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }) }, exports)
  const backup = (await runtime.page.evaluate(() => window.boai.request('exportBackup', undefined)))!
  expect(await readdir(backup)).not.toContain('skill-staging')
  expect(JSON.parse(await readFile(join(backup, 'backup.json'), 'utf8')).credentialsIncluded).toBe(false)
  const calls = model.requests.length
  await runtime.close()
  const restoredRoot = join(runtime.root, 'restored')
  await cp(backup, join(restoredRoot, 'v2'), { recursive: true })
  await rm(join(runtime.root, 'app'), { recursive: true })
  await runtime.start({ mainEntry: await localSkillsEntry(runtime), dataDir: restoredRoot })
  const restored = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(restored.agents.find(a => a.id === 'researcher')?.skillIds).toEqual([resource.id])
  expect(restored.resources[0].path.startsWith(join(restoredRoot, 'v2'))).toBe(true)
  const recovered = await runtime.page.evaluate(id => window.boai.request('getSkillDetail', { resourceId: id }), resource.id)
  expect(recovered.contentHash).toBe(before.contentHash)
  expect(recovered.installation).toEqual(before.installation)
  expect((await runtime.page.evaluate(() => window.boai.request('getSkillCollections', undefined))).favoriteResourceIds).toEqual([resource.id])
  expect(model.requests).toHaveLength(calls)
  await run('after-backup')
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '技能', exact: true }).click()
  expect((await runtime.page.evaluate(resourceId => window.boai.request('getSkillDetail', { resourceId }), resource.id)).content).toContain('# 报告助手')
  expect(await readFile(join(skills.source!, 'report-helper/references/evidence.md'), 'utf8')).toBe(marker)
  expect(runtime.errors).toEqual([])
})

Given('技能管理使用独立桌面与离线技能压缩包', async ({ runtime, skills }) => {
  skills.source = join(runtime.root, 'bundle.zip')
  await writeFile(skills.source, zipSync({
    'zip-helper/SKILL.md': strToU8('---\nname: zip-helper\ndescription: 离线报告技能\n---\n# 压缩包中的真实说明\n只处理明确授权的资料。'),
    'zip-helper/references/guide.md': strToU8('压缩包参考文件：保留核查依据。'),
    'zip-helper/scripts/setup.js': strToU8('throw new Error("SKILL SCRIPT MUST NOT EXECUTE")'),
  }))
  await runtime.start({ mainEntry: await localSkillsEntry(runtime), dataDir: join(runtime.root, 'app') })
  await runtime.app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source!] }) }, skills.source)
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '技能', exact: true }).click()
})

When('通过兼容接口选择压缩包并阅读安装前正文和参考文件', async ({ runtime, skills }) => {
  await expect(runtime.page.evaluate(source => window.boai.request('scanSkillSource', { kind: 'folder', source }), runtime.root)).rejects.toThrow('请先通过文件选择器')
  const scan = await runtime.page.evaluate(async () => {
    const source = await window.boai.request('chooseSkillSource', { kind: 'zip' })
    return window.boai.request('scanSkillSource', { kind: 'zip', source: source! })
  })
  const candidate = scan.candidates.find(value => value.name === 'zip-helper' && !value.error)!
  skills.scanId = scan.id; skills.candidateId = candidate.id
  const preview = await runtime.page.evaluate(input => window.boai.request('getSkillPreview', input), { scanId: scan.id, candidateId: candidate.id })
  expect(preview.content).toContain('压缩包中的真实说明')
  const file = await runtime.page.evaluate(input => window.boai.request('readSkillPreviewFile', input), { scanId: scan.id, candidateId: candidate.id, path: 'references/guide.md' })
  expect(file.content).toBe('压缩包参考文件：保留核查依据。')
})

Then('预览期间受管资源仍为空且没有员工权限变化', async ({ runtime }) => {
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.resources).toEqual([])
  expect(snapshot.agents.every(agent => !agent.skillIds.length && !agent.allowCommands)).toBe(true)
})

When('安装受管压缩包并重新启动桌面', async ({ runtime, skills }) => {
  const operation = await runtime.page.evaluate(input => window.boai.request('installSkills', input), { scanId: skills.scanId!, candidateIds: [skills.candidateId!], requestId: 'managed-zip', addToFavorites: false })
  skills.operationId = operation.id
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getSkillOperation', { id }), operation.id)).status).toBe('completed')
  skills.resourceId = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).resources[0].id
  await runtime.restart()
})

Then('持久安装回执可定位受管副本且包内代码未执行', async ({ runtime, skills }) => {
  const page = runtime.page
  const operations = await page.evaluate(() => window.boai.request('listSkillOperations', undefined))
  expect(operations.find(value => value.id === skills.operationId)).toMatchObject({ status: 'completed', items: [expect.objectContaining({ name: 'zip-helper', status: 'installed', resourceId: skills.resourceId })] })
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '技能', exact: true }).click()
  const detail = await page.evaluate(resourceId => window.boai.request('getSkillDetail', { resourceId: resourceId! }), skills.resourceId)
  expect(detail.content).toContain('# 压缩包中的真实说明')
  const check = await page.evaluate(id => window.boai.request('checkSkillUpdate', { id: id! }), skills.resourceId)
  expect(check.status).toBe('unsupported')
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.resources[0].id).toBe(skills.resourceId)
  expect(snapshot.agents.every(agent => !agent.skillIds.length && !agent.allowCommands)).toBe(true)
  expect(await readFile(join(snapshot.resources[0].path, 'scripts/setup.js'), 'utf8')).toContain('MUST NOT EXECUTE')
  expect(runtime.errors).toEqual([])
})

When('删除一个受管目录已被外部改动的技能', async ({ runtime, skills }) => {
  const resource = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).resources[0]
  skills.cleanupRoot = dirname(resource.path); skills.outside = join(runtime.root, 'outside-original')
  await mkdir(skills.outside); await writeFile(join(skills.outside, 'keep.txt'), '外部原件必须保留')
  await rm(skills.cleanupRoot, { recursive: true }); await symlink(skills.outside, skills.cleanupRoot)
  await expect(runtime.page.evaluate(id => window.boai.request('removeResource', { id: id! }), skills.resourceId)).rejects.toThrow('受管文件清理未完成')
})

Then('持久清理记录保留待处理状态且原件仍然保留', async ({ runtime, skills }) => {
  await expect.poll(async () => (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).resources.length).toBe(0)
  const cleanups = await runtime.page.evaluate(() => window.boai.request('listResourceCleanups', undefined))
  expect(cleanups).toHaveLength(1)
  expect(cleanups[0]).toMatchObject({ id: skills.resourceId, name: 'zip-helper', status: 'failed' })
  skills.cleanupId = cleanups[0].id
  expect(await readFile(join(skills.outside!, 'keep.txt'), 'utf8')).toBe('外部原件必须保留')
})

When('恢复受管目录并重试清理', async ({ runtime, skills }) => {
  await unlink(skills.cleanupRoot!); await mkdir(skills.cleanupRoot!); await writeFile(join(skills.cleanupRoot!, 'remainder.txt'), 'managed remainder')
  await runtime.page.evaluate(id => window.boai.request('retryResourceCleanup', { id: id! }), skills.cleanupId)
})

Then('待清理记录消失且外部文件未被删除', async ({ runtime, skills }) => {
  expect(await runtime.page.evaluate(() => window.boai.request('listResourceCleanups', undefined))).toEqual([])
  expect(await readFile(join(skills.outside!, 'keep.txt'), 'utf8')).toBe('外部原件必须保留')
  expect(runtime.errors).toEqual([])
})

When('预览技能库并通过原生保存位置导出', async ({ runtime, skills }) => {
  skills.exported = join(runtime.root, 'portable-library.zip')
  await runtime.app.evaluate(({ dialog }, destination) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination! }) }, skills.exported)
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '技能', exact: true }).click()
  const preview = await runtime.page.evaluate(resourceId => window.boai.request('planSkillLibraryExport', { resourceIds: [resourceId!], name: '我的技能库' }), skills.resourceId)
  expect(preview.files.map(file => file.path).join('\n')).toContain('report-helper')
  expect(preview.files.map(file => file.path).join('\n')).toContain('guide.md')
  await expect(runtime.page.evaluate(() => window.boai.request('exportSkillLibrary', { planId: 'untrusted', requestId: 'untrusted', destination: '/tmp/unauthorized.zip' } as never))).rejects.toThrow()
  const operation = await runtime.page.evaluate(planId => window.boai.request('exportSkillLibrary', { planId, requestId: 'managed-portable-library' }), preview.id)
  expect(operation).not.toBeNull()
  await expect.poll(async () => (await runtime.page.evaluate(id => window.boai.request('getSkillOperation', { id }), operation!.id)).status).toBe('completed')
  const result = await runtime.page.evaluate(id => window.boai.request('getSkillOperation', { id }), operation!.id)
  expect(result.items[0].status).toBe('exported')
  expect(result.outputName).toBe('portable-library.zip')
})

Then('导出的包保存完整文件和分组而不包含员工绑定', async ({ runtime, skills }) => {
  const files = unzipSync(await readFile(skills.exported!))
  expect(strFromU8(files['skills/report-helper/references/guide.md'])).toContain('标明结论依据')
  const collections = strFromU8(files['boai-agent.collections.json'])
  expect(collections).toContain('报告工具'); expect(collections).not.toContain(skills.resourceId!)
  const metadata = ['boai.json', 'boai.lock.json', 'boai-agent.sources.json', 'boai-agent.collections.json'].map(name => strFromU8(files[name])).join('\n')
  expect(metadata).not.toContain('researcher'); expect(metadata).not.toContain(runtime.root)
})

When('移除原副本并通过兼容接口导入刚导出的技能库', async ({ runtime, skills }) => {
  const page = runtime.page
  await page.evaluate(id => window.boai.request('removeResource', { id: id! }), skills.resourceId)
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).resources.length).toBe(0)
  await runtime.app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source!] }) }, skills.exported)
  const scan = await page.evaluate(async () => {
    const source = await window.boai.request('chooseSkillSource', { kind: 'zip' })
    return window.boai.request('scanSkillSource', { kind: 'zip', source: source! })
  })
  expect(scan.library).toMatchObject({ name: '我的技能库', groups: ['报告工具'] })
  const operation = await page.evaluate(scan => window.boai.request('installSkills', { scanId: scan.id, candidateIds: scan.candidates.filter(value => !value.error).map(value => value.id), requestId: 'managed-library-import', addToFavorites: true, restoreCollections: true }), scan)
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getSkillOperation', { id }), operation.id)).status).toBe('completed')
})

Then('重新启动后收藏分组恢复且员工没有自动绑定', async ({ runtime, skills }) => {
  await runtime.restart()
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '技能', exact: true }).click()
  const groups = await page.evaluate(() => window.boai.request('getSkillCollections', undefined))
  expect(groups.groups.some(group => group.name === '报告工具')).toBe(true)
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.resources).toHaveLength(1); expect(snapshot.resources[0].id).not.toBe(skills.resourceId)
  expect(groups.favoriteResourceIds).toEqual([snapshot.resources[0].id])
  expect(groups.groupByResourceId[snapshot.resources[0].id]).toBe(groups.groups.find(group => group.name === '报告工具')!.id)
  expect(snapshot.agents.every(agent => !agent.skillIds.length && !agent.allowCommands)).toBe(true)
  expect(await readFile(join(snapshot.resources[0].path, 'references/guide.md'), 'utf8')).toContain('标明结论依据')
  expect(runtime.errors).toEqual([])
})
