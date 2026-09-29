/*
 * [INPUT]: 中文技能管理场景、真实 Electron 与专用本地目录。
 * [OUTPUT]: 隔离用户技能目录、含本机/BoAI 来源标识的列表选择及导入弹窗内历史恢复； 完整应用备份恢复后真实技能工具读取/产物发布与授权保持；UI 目录/ZIP 预览、技能库原生保存/往返、收藏/绑定分离、重启记录及清理重试的业务断言。
 * [POS]: skills 的桌面步骤；目录选择仅替代系统原生交互。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { cp, mkdir, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { selectSkillsSection, localSkillsEntry } from '../support/local-skills'
import { test as base } from '../support/test'
import { startSkillDeliveryModel } from '../../fixtures/skills/delivery-model'

export const test = base.extend<{ skills: { source?: string; resourceId?: string; cleanupRoot?: string; outside?: string; exported?: string } }>({ skills: async ({}, use) => use({}) })
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
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '资料库', exact: true }).click()
})

When('预览技能目录并只安装有效技能', async ({ runtime, skills }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '导入 Skill', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '导入 Skills', exact: true })
  await dialog.getByRole('button', { name: '选择技能目录' }).click()
  await expect(dialog.getByRole('checkbox', { name: '选择 report-helper' })).toBeChecked()
  await expect(dialog.getByText(/SKILL.md 的 name 必须/)).toBeVisible()
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).resources).toHaveLength(0)
  await dialog.getByRole('checkbox', { name: '同时加入“我的”' }).check()
  await dialog.getByRole('button', { name: '安装所选 · 1' }).click()
  await expect(dialog.getByText('已安装', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.resources).toHaveLength(1)
  skills.resourceId = snapshot.resources[0].id
})

Then('技能内容和参考文件可读且员工尚未绑定', async ({ runtime }) => {
  const page = runtime.page
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.every(agent => !agent.skillIds.length)).toBe(true)
  await page.getByRole('button', { name: /report-helper .*整理报告/ }).click()
  await expect(page.getByRole('heading', { name: '报告助手' })).toBeVisible()
  await page.getByRole('tab', { name: '文件 · 2' }).click()
  await page.getByRole('button', { name: /references\/guide.md/ }).click()
  await expect(page.getByLabel('文件内容 references/guide.md')).toContainText('标明结论依据')
})

When('将技能加入分组并明确绑定一位员工', async ({ runtime, skills }) => {
  const page = runtime.page
  await page.getByRole('tab', { name: '我的', exact: true }).click()
  await page.getByRole('button', { name: '技能分组', exact: true }).click()
  await page.getByRole('button', { name: '新建分组', exact: true }).click()
  await page.getByRole('textbox', { name: '分组名称' }).fill('报告工具')
  await page.getByRole('button', { name: '保存分组', exact: true }).click()
  await page.keyboard.press('Escape')
  const groups = await page.evaluate(() => window.boai.request('getSkillCollections', undefined))
  await page.getByRole('combobox', { name: 'report-helper 的分组' }).selectOption(groups.groups[0].id)
  await expect(page.locator('.skills-list-group').filter({ has: page.getByRole('button', { name: /报告工具.*1/ }) })).toContainText('report-helper')
  await page.evaluate(async resourceId => {
    const agent = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
    await window.boai.request('saveAgent', { ...input, skillIds: [resourceId!], expectedConfigVersion: configVersion })
  }, skills.resourceId)
})

Then('重启后分组和绑定保留且取消收藏不撤权', async ({ runtime, skills }) => {
  await runtime.restart()
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '资料库', exact: true }).click()
  await page.getByRole('tab', { name: '我的', exact: true }).click()
  await expect(page.getByRole('button', { name: /报告工具.*1/ })).toBeVisible()
  await page.getByRole('button', { name: '移出我的', exact: true }).click()
  await expect(page.getByRole('heading', { name: '还没有收藏的技能' })).toBeVisible()
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).agents.find(agent => agent.id === 'researcher')?.skillIds).toEqual([skills.resourceId])
})

When('移除技能的受管副本', async ({ runtime }) => {
  const page = runtime.page
  await selectSkillsSection(page, '全部技能')
  await page.getByRole('button', { name: /report-helper .*整理报告/ }).click()
  await page.getByRole('button', { name: '移除资源', exact: true }).click()
  await page.getByRole('button', { name: '确认移除', exact: true }).click()
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
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '资料库', exact: true }).click()
  await runtime.page.getByRole('button', { name: /report-helper .*整理报告/ }).click()
  await expect(runtime.page.getByRole('heading', { name: '报告助手' })).toBeVisible()
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
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '资料库', exact: true }).click()
})

When('选择压缩包并阅读安装前正文和参考文件', async ({ runtime }) => {
  await expect(runtime.page.evaluate(source => window.boai.request('scanSkillSource', { kind: 'folder', source }), runtime.root)).rejects.toThrow('请先通过文件选择器')
  await runtime.page.getByRole('button', { name: '导入 Skill', exact: true }).click()
  const dialog = runtime.page.getByRole('dialog', { name: '导入 Skills', exact: true })
  await dialog.getByLabel('技能来源', { exact: true }).selectOption('zip')
  await dialog.getByRole('button', { name: '选择 ZIP 文件' }).click()
  await dialog.getByRole('button', { name: '检查 zip-helper 的内容' }).click()
  await expect(dialog.getByRole('heading', { name: '压缩包中的真实说明' })).toBeVisible()
  await dialog.getByRole('button', { name: 'references/guide.md', exact: true }).click()
  await expect(dialog.getByText('压缩包参考文件：保留核查依据。', { exact: true })).toBeVisible()
})

Then('预览期间资料库仍为空且没有员工权限变化', async ({ runtime }) => {
  const snapshot = await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.resources).toEqual([])
  expect(snapshot.agents.every(agent => !agent.skillIds.length && !agent.allowCommands)).toBe(true)
})

When('安装压缩包并重新启动桌面', async ({ runtime, skills }) => {
  const dialog = runtime.page.getByRole('dialog', { name: '导入 Skills', exact: true })
  await dialog.getByRole('button', { name: '安装所选 · 1' }).click()
  await expect(dialog.getByText('已安装', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  skills.resourceId = (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).resources[0].id
  await runtime.restart()
})

Then('可从安装记录打开已安装副本且包内代码未执行', async ({ runtime, skills }) => {
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '资料库', exact: true }).click()
  await page.getByRole('button', { name: '导入 Skill', exact: true }).click()
  await page.getByRole('dialog', { name: '导入 Skills', exact: true }).getByRole('button', { name: '安装记录', exact: true }).click()
  await page.getByRole('button', { name: /zip-helper.*1\/1 成功/ }).click()
  const dialog = page.getByRole('dialog', { name: '安装记录', exact: true })
  await expect(dialog.getByText('已安装', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '查看 zip-helper', exact: true }).click()
  await expect(page.getByRole('heading', { name: '压缩包中的真实说明' })).toBeVisible()
  await page.getByRole('button', { name: '检查更新', exact: true }).click()
  await expect(page.getByText(/此来源不支持检查更新/)).toBeVisible()
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
  await runtime.page.getByRole('button', { name: '移除资源', exact: true }).click()
  await runtime.page.getByRole('button', { name: '确认移除', exact: true }).click()
})

Then('安装记录显示待清理且原件仍然保留', async ({ runtime, skills }) => {
  await expect.poll(async () => (await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).resources.length).toBe(0)
  await runtime.page.getByRole('button', { name: '导入 Skill', exact: true }).click()
  await runtime.page.getByRole('dialog', { name: '导入 Skills', exact: true }).getByRole('button', { name: '安装记录', exact: true }).click()
  await expect(runtime.page.getByText('zip-helper · 文件待清理', { exact: true })).toBeVisible()
  expect(await readFile(join(skills.outside!, 'keep.txt'), 'utf8')).toBe('外部原件必须保留')
})

When('恢复受管目录并重试清理', async ({ runtime, skills }) => {
  await unlink(skills.cleanupRoot!); await mkdir(skills.cleanupRoot!); await writeFile(join(skills.cleanupRoot!, 'remainder.txt'), 'managed remainder')
  await runtime.page.getByRole('button', { name: '重试清理', exact: true }).click()
})

Then('待清理记录消失且外部文件未被删除', async ({ runtime, skills }) => {
  await expect(runtime.page.getByText('zip-helper · 文件待清理', { exact: true })).toHaveCount(0)
  expect(await runtime.page.evaluate(() => window.boai.request('listResourceCleanups', undefined))).toEqual([])
  expect(await readFile(join(skills.outside!, 'keep.txt'), 'utf8')).toBe('外部原件必须保留')
  expect(runtime.errors).toEqual([])
})

When('预览技能库并通过原生保存位置导出', async ({ runtime, skills }) => {
  skills.exported = join(runtime.root, 'portable-library.zip')
  await runtime.app.evaluate(({ dialog }, destination) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination! }) }, skills.exported)
  await runtime.page.getByRole('button', { name: '技能管理菜单', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '导出技能库', exact: true }).click()
  const dialog = runtime.page.getByRole('dialog', { name: '导出技能库', exact: true })
  await dialog.getByRole('button', { name: '预览导出', exact: true }).click()
  await expect(dialog.getByLabel('技能库导出预览')).toContainText('report-helper · 2 个文件')
  await expect(runtime.page.evaluate(() => window.boai.request('exportSkillLibrary', { planId: 'untrusted', requestId: 'untrusted', destination: '/tmp/unauthorized.zip' } as never))).rejects.toThrow()
  await dialog.getByRole('button', { name: '保存 ZIP', exact: true }).click()
  const result = runtime.page.getByRole('dialog', { name: '安装记录', exact: true })
  await expect(result.getByText('已导出', { exact: true })).toBeVisible()
  await expect(result.getByText('portable-library.zip', { exact: true })).toBeVisible()
  await result.getByRole('button', { name: '关闭', exact: true }).click()
})

Then('导出的包保存完整文件和分组而不包含员工绑定', async ({ runtime, skills }) => {
  const files = unzipSync(await readFile(skills.exported!))
  expect(strFromU8(files['skills/report-helper/references/guide.md'])).toContain('标明结论依据')
  const collections = strFromU8(files['boai-agent.collections.json'])
  expect(collections).toContain('报告工具'); expect(collections).not.toContain(skills.resourceId!)
  const metadata = ['boai.json', 'boai.lock.json', 'boai-agent.sources.json', 'boai-agent.collections.json'].map(name => strFromU8(files[name])).join('\n')
  expect(metadata).not.toContain('researcher'); expect(metadata).not.toContain(runtime.root)
})

When('移除原副本并导入刚导出的技能库', async ({ runtime, skills }) => {
  const page = runtime.page
  await page.evaluate(id => window.boai.request('removeResource', { id: id! }), skills.resourceId)
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).resources.length).toBe(0)
  await runtime.app.evaluate(({ dialog }, source) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [source!] }) }, skills.exported)
  await page.getByRole('button', { name: '导入 Skill', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '导入 Skills', exact: true })
  await dialog.getByLabel('技能来源', { exact: true }).selectOption('zip')
  await dialog.getByRole('button', { name: '选择 ZIP 文件', exact: true }).click()
  await expect(dialog.getByText('技能库 · 我的技能库', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('checkbox', { name: '恢复包内收藏与分组', exact: true })).toBeChecked()
  await dialog.getByRole('button', { name: '安装所选 · 1', exact: true }).click()
  await expect(dialog.getByText('已安装', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
})

Then('重新启动后收藏分组恢复且员工没有自动绑定', async ({ runtime, skills }) => {
  await runtime.restart()
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '资料库', exact: true }).click()
  await page.getByRole('tab', { name: '我的', exact: true }).click()
  await expect(page.getByRole('button', { name: /报告工具.*1/ })).toBeVisible()
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.resources).toHaveLength(1); expect(snapshot.resources[0].id).not.toBe(skills.resourceId)
  expect(snapshot.agents.every(agent => !agent.skillIds.length && !agent.allowCommands)).toBe(true)
  expect(await readFile(join(snapshot.resources[0].path, 'references/guide.md'), 'utf8')).toContain('标明结论依据')
  expect(runtime.errors).toEqual([])
})
