/*
 * [INPUT]: 中文 Skills 场景、生产 Electron/IPC/worker 与隔离网络 fixture。
 * [OUTPUT]: 现行商城本地安装与旧员工受管副本显式兼容导入分别验证；两份身份/收藏和零隐式绑定保持；下载取消后悬停分组标题继续新建，断流/私网拒绝适配来源 Tabs 与扫描动作且无安装入口；商城会话式两栏与常驻搜索； 商店预览不授权/不执行 HTML 或包脚本/不请求图片、明确更新与本地修改保护、稳定身份/绑定/收藏、取消/断流清理、私网拒绝与重启不重放的断言。
 * [POS]: 原生 Skills 桌面业务步骤；不替换页面、IPC 或运行服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { appendFile, readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { selectSkillStore } from '../support/local-skills'
import { test as base } from '../support/test'
import { startNativeSkills } from '../support/native-skills'

export const test = base.extend<{ nativeSkills: {
  fixture?: Awaited<ReturnType<typeof startNativeSkills>>
  resourceId?: string
  localResourceId?: string
  resourcePath?: string
  boundVersion?: number
  finalHash?: string
  requestsBefore?: number
} }>({ nativeSkills: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)

Given('原生桌面连接隔离商店与可更新的技能包', async ({ runtime, nativeSkills }) => {
  test.skip(Boolean(process.env.BOAI_TEST_PACKAGED_PATH), 'This scenario launches the built main and worker with a test-only network bootstrap; it does not validate a packaged executable.')
  nativeSkills.fixture = await startNativeSkills(runtime)
  await runtime.page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '资料库', exact: true }).click()
})

When('我从商店预览实际内容并安装技能', async ({ runtime, nativeSkills }) => {
  const page = runtime.page
  await page.getByRole('tab', { name: '技能商店', exact: true }).click()
  await selectSkillStore(page, 'ClawHub')
  await page.getByRole('button', { name: /原生商店助手.*fixture/ }).click()
  await expect(page.locator('.skills-list-pane .skills-browser-header').filter({ has: page.getByRole('tablist', { name: '技能分类', exact: true }) })).toBeVisible()
  await expect(page.locator('.skills-detail-pane .chat-header')).toHaveCSS('height', '52px')
  const heading = await page.locator('.skills-list-pane .skills-browser-header').filter({ has: page.getByRole('tablist', { name: '技能分类', exact: true }) }).boundingBox(), detailHeading = await page.locator('.skills-detail-pane .chat-header').boundingBox(), search = await page.getByRole('textbox', { name: '搜索 ClawHub' }).boundingBox()
  expect(heading!.y).toBe(detailHeading!.y); expect(search!.y).toBeGreaterThanOrEqual(heading!.y + heading!.height)
  await expect(page.getByRole('textbox', { name: '搜索 ClawHub' })).toBeVisible()
  await expect(page.getByRole('separator', { name: '调整技能列表宽度' })).toBeVisible()
  await page.screenshot({ path: 'test-results/skill-store-layout.png' })
  await expect(page.getByRole('heading', { name: '商店说明', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '安装到本地', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '导入技能', exact: true })
  await dialog.getByRole('button', { name: '扫描', exact: true }).click()
  await dialog.getByRole('button', { name: '查看内容', exact: true }).click()
  await expect(dialog.getByRole('heading', { name: '原生上游版本 1', exact: true })).toBeVisible()
  await expect(dialog.getByText('[图片：未加载的远程图片]', { exact: true })).toBeVisible()
  await expect(dialog.locator('.skill-markdown img, .skill-markdown script')).toHaveCount(0)
  expect(await page.title()).not.toBe('UNEXPECTED_SKILL_SCRIPT')
  await dialog.getByRole('button', { name: 'references/guide.md', exact: true }).click()
  await expect(dialog.getByText('版本 1 的参考依据', { exact: true })).toBeVisible()
  const before = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(before.resources).toEqual([])
  expect(before.agents.every(agent => !agent.skillIds.length && !agent.allowCommands)).toBe(true)
  await dialog.getByRole('checkbox', { name: '同时加入收藏' }).check()
  await dialog.getByRole('button', { name: '安装所选 · 1', exact: true }).click()
  await expect(dialog.getByText('已安装', { exact: true })).toBeVisible()
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.resources).toEqual([])
  const operations = await page.evaluate(() => window.boai.request('listSkillOperations', undefined))
  nativeSkills.localResourceId = operations.find(value => value.items.some(item => item.status === 'installed'))!.items[0].resourceId!
  expect(nativeSkills.localResourceId.startsWith('local:')).toBe(true)
  await dialog.getByRole('button', { name: '查看技能', exact: true }).click()

})

Then('已安装内容可读但员工尚未获得使用权限', async ({ runtime, nativeSkills }) => {
  const page = runtime.page
  await expect(page.getByRole('heading', { name: '原生上游版本 1', exact: true })).toBeVisible()
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.agents.every(agent => !agent.skillIds.length && !agent.allowCommands)).toBe(true)
  const local = await page.evaluate(id => window.boai.request('getLocalSkillDetail', { id }), nativeSkills.localResourceId!)
  expect(local.content).toContain('原生上游版本 1')
  // Keep the explicit employee-resource compatibility path after proving that the
  // current local installation created no managed resource and granted no access.
  const operation = await page.evaluate(async () => {
    const scan = await window.boai.request('scanSkillSource', { kind: 'marketplace', provider: 'clawhub', source: 'fixture/native-helper' })
    return window.boai.request('installSkills', { scanId: scan.id, candidateIds: scan.candidates.filter(value => !value.error).map(value => value.id), requestId: 'managed-marketplace-copy', addToFavorites: true })
  })
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getSkillOperation', { id }), operation.id)).status).toBe('completed')
  const managed = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(managed.resources).toHaveLength(1)
  expect(managed.agents.every(agent => !agent.skillIds.length && !agent.allowCommands)).toBe(true)
  nativeSkills.resourceId = managed.resources[0].id; nativeSkills.resourcePath = managed.resources[0].path
  expect(nativeSkills.resourcePath).not.toBe(local.skill.path)
  const detail = await page.evaluate(resourceId => window.boai.request('getSkillDetail', { resourceId }), nativeSkills.resourceId!)
  expect(detail.installation?.source).toMatchObject({ kind: 'marketplace', provider: 'clawhub', providerItemId: 'fixture/native-helper' })
  expect(detail.installation?.contentHash).toBe(detail.contentHash)
  expect(detail.files.map(file => file.path)).toEqual(expect.arrayContaining(['SKILL.md', 'references/guide.md', 'scripts/do-not-run.mjs', 'package.json']))
  expect((await page.evaluate(() => window.boai.request('getSkillCollections', undefined))).favoriteResourceIds).toEqual([nativeSkills.localResourceId, nativeSkills.resourceId])
  await expect(readFile(nativeSkills.fixture!.executionMarker)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(nativeSkills.fixture!.imageRequests()).toBe(0)
  await selectSkillStore(page, 'ClawHub')
  const installed = page.getByRole('button', { name: /原生商店助手.*fixture/ }), distinct = page.getByRole('button', { name: /原生商店助手 other-owner/ })
  await expect(installed).toContainText('已安装')
  await expect(distinct).not.toContainText('已安装')
  await distinct.click()
  await expect(page.getByRole('main', { name: '商店技能详情' }).getByText('other-owner · 1', { exact: true })).toBeVisible()
  await expect(page.getByRole('main', { name: '商店技能详情' }).getByRole('button', { name: /查看本地技能/ })).toHaveCount(0)
  await installed.click()
  await page.getByRole('button', { name: '查看本地技能 · 原生商店助手', exact: true }).click()
  await expect(page.getByRole('heading', { name: '原生上游版本 1', exact: true })).toBeVisible()
})

When('我明确绑定员工后检查并确认上游更新', async ({ runtime, nativeSkills }) => {
  const page = runtime.page
  const bound = await page.evaluate(async resourceId => {
    const agent = (await window.boai.request('snapshot', undefined)).agents.find(value => value.id === 'researcher')!
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
    return window.boai.request('saveAgent', { ...input, skillIds: [resourceId], expectedConfigVersion: configVersion })
  }, nativeSkills.resourceId!)
  nativeSkills.boundVersion = bound.configVersion
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '资料库', exact: true }).click()
  await page.getByRole('button', { name: /native-helper 原生商店技能验收/ }).click()
  nativeSkills.fixture!.version(2)
  await page.getByRole('button', { name: '检查技能更新', exact: true }).click()
  await expect(page.getByLabel('更新文件变化')).toContainText('新增 1 · 修改 2 · 删除 0')
  await expect(page.getByText(/受影响员工：/)).toContainText('研究员')
  await page.getByText('查看更新后的技能内容', { exact: true }).click()
  await expect(page.getByRole('heading', { name: '原生上游版本 2', exact: true })).toBeVisible()
  expect(await readFile(join(nativeSkills.resourcePath!, 'SKILL.md'), 'utf8')).toContain('原生上游版本 1')
  await page.getByRole('button', { name: '升级技能', exact: true }).click()
})

Then('原生更新保留资源身份收藏和员工绑定', async ({ runtime, nativeSkills }) => {
  const page = runtime.page
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('listSkillOperations', undefined))).filter(operation => operation.status === 'completed' && operation.items[0]?.status === 'updated').length).toBe(1)
  expect((await page.evaluate(resourceId => window.boai.request('getSkillDetail', { resourceId }), nativeSkills.resourceId!)).installation?.revision).toBe(2)
  await expect(page.getByRole('heading', { name: '原生上游版本 2', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '原生上游版本 1', exact: true })).toHaveCount(0)
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.resources.map(resource => resource.id)).toEqual([nativeSkills.resourceId])
  expect(snapshot.agents.find(agent => agent.id === 'researcher')).toMatchObject({ skillIds: [nativeSkills.resourceId], configVersion: nativeSkills.boundVersion! + 1, allowCommands: false })
  expect(snapshot.agents.filter(agent => agent.id !== 'researcher').every(agent => !agent.skillIds.length)).toBe(true)
  expect((await page.evaluate(() => window.boai.request('getSkillCollections', undefined))).favoriteResourceIds).toEqual([nativeSkills.localResourceId, nativeSkills.resourceId])
})

When('本地技能有修改时我先保留再明确替换', async ({ runtime, nativeSkills }) => {
  const page = runtime.page, file = join(nativeSkills.resourcePath!, 'SKILL.md')
  await appendFile(file, '\n用户保留的本地修改。')
  nativeSkills.fixture!.version(3)
  await page.getByRole('button', { name: '检查技能更新', exact: true }).click()
  const consent = page.getByRole('checkbox', { name: '我已保留需要的内容，确认替换当前文件', exact: true })
  await expect(consent).not.toBeChecked()
  await expect(page.getByRole('button', { name: '请先确认替换当前文件', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '保留当前内容', exact: true }).click()
  expect(await readFile(file, 'utf8')).toContain('用户保留的本地修改。')
  await expect(page.getByRole('button', { name: '升级技能', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: '检查技能更新', exact: true }).click()
  await consent.check()
  await page.getByRole('button', { name: '升级技能', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('listSkillOperations', undefined))).filter(operation => operation.status === 'completed' && operation.items[0]?.status === 'updated').length).toBe(2)
  expect((await page.evaluate(resourceId => window.boai.request('getSkillDetail', { resourceId }), nativeSkills.resourceId!)).installation?.revision).toBe(3)
  await expect(page.getByRole('heading', { name: '原生上游版本 3', exact: true })).toBeVisible()
})

Then('新内容可读且离线检查失败不会被显示成最新', async ({ runtime, nativeSkills }) => {
  const page = runtime.page
  const detail = await page.evaluate(resourceId => window.boai.request('getSkillDetail', { resourceId }), nativeSkills.resourceId!)
  expect(detail.content).not.toContain('用户保留的本地修改。')
  expect(detail.installation?.contentHash).toBe(detail.contentHash)
  nativeSkills.finalHash = detail.contentHash
  nativeSkills.fixture!.offline(true)
  await page.getByRole('button', { name: '检查技能更新', exact: true }).click()
  await expect(page.getByText(/检查更新失败 ·/)).toBeVisible()
  await expect(page.getByText(/内容已是最新/)).toHaveCount(0)
  await expect(page.getByRole('tab', { name: '文件 · 5', exact: true })).toBeVisible()
  await page.getByRole('tab', { name: '文件 · 5', exact: true }).click()
  await page.getByRole('button', { name: /references\/new.md/ }).click()
  await expect(page.getByLabel('文件内容 references/new.md')).toHaveText('新增依据 3')
  expect((await page.evaluate(resourceId => window.boai.request('getSkillDetail', { resourceId }), nativeSkills.resourceId!)).contentHash).toBe(nativeSkills.finalHash)
})

Then('重启后已更新内容与授权保留且不自动重新下载', async ({ runtime, nativeSkills }) => {
  const requests = nativeSkills.fixture!.requests.length
  await runtime.restart()
  const page = runtime.page
  const snapshot = await page.evaluate(() => window.boai.request('snapshot', undefined))
  expect(snapshot.resources.map(resource => resource.id)).toEqual([nativeSkills.resourceId])
  expect(snapshot.agents.find(agent => agent.id === 'researcher')).toMatchObject({ skillIds: [nativeSkills.resourceId], configVersion: nativeSkills.boundVersion! + 2, allowCommands: false })
  expect((await page.evaluate(() => window.boai.request('getSkillCollections', undefined))).favoriteResourceIds).toEqual([nativeSkills.localResourceId, nativeSkills.resourceId])
  const detail = await page.evaluate(resourceId => window.boai.request('getSkillDetail', { resourceId }), nativeSkills.resourceId!)
  expect(detail.contentHash).toBe(nativeSkills.finalHash)
  expect(detail.installation?.revision).toBe(3)
  const operations = await page.evaluate(() => window.boai.request('listSkillOperations', undefined))
  expect(operations).toHaveLength(4)
  expect(operations.every(operation => operation.status === 'completed')).toBe(true)
  expect(operations.flatMap(operation => operation.items.map(item => item.status)).sort()).toEqual(['installed', 'installed', 'updated', 'updated'])
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '资料库', exact: true }).click()
  await page.getByRole('button', { name: /native-helper 原生商店技能验收/ }).click()
  await expect(page.getByRole('heading', { name: '原生上游版本 3', exact: true })).toBeVisible()
  expect(nativeSkills.fixture!.requests).toHaveLength(requests)
  await expect(readFile(nativeSkills.fixture!.executionMarker)).rejects.toMatchObject({ code: 'ENOENT' })
  expect(nativeSkills.fixture!.imageRequests()).toBe(0)
  expect(await page.title()).not.toBe('UNEXPECTED_SKILL_SCRIPT')
  expect(runtime.errors).toEqual([])
})

When('远程包仍在下载时我取消预览', async ({ runtime, nativeSkills }) => {
  nativeSkills.fixture!.stall(true)
  const page = runtime.page
  await page.getByRole('button', { name: '导入 Skill', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '导入技能', exact: true })
  await dialog.getByRole('tab', { name: '链接', exact: true }).click()
  await dialog.getByLabel('链接', { exact: true }).fill('https://native-fixture.example/stall.zip')
  await dialog.getByRole('button', { name: '扫描', exact: true }).click()
  await expect.poll(() => nativeSkills.fixture!.pending()).toBe(1)
  // A pending network body must not hold the runtime's local-state lock.
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).resources).toEqual([])
  expect((await page.evaluate(() => window.boai.request('getSkillCollections', undefined))).favoriteResourceIds).toEqual([])
  expect(nativeSkills.fixture!.pending()).toBe(1)
  await dialog.getByRole('button', { name: '取消扫描', exact: true }).click()
})

Then('下载实际退出且本地管理仍可用而没有安装资源', async ({ runtime, nativeSkills }) => {
  await expect.poll(() => nativeSkills.fixture!.pending()).toBe(0)
  const page = runtime.page, dialog = page.getByRole('dialog', { name: '导入技能', exact: true })
  await expect(dialog.getByRole('button', { name: '扫描', exact: true })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: /^安装所选/ })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.getByRole('tab', { name: '收藏', exact: true }).click()
  await page.getByRole('button', { name: '技能分组', exact: true }).click()
  await page.locator('.skill-groups-title').hover()
  await page.getByRole('button', { name: '新建分组', exact: true }).click()
  await page.getByRole('textbox', { name: '分组名称' }).fill('取消后仍可整理')
  await page.getByRole('button', { name: '保存分组', exact: true }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: /取消后仍可整理.*0/ })).toBeVisible()
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).resources).toEqual([])
  expect(await page.evaluate(() => window.boai.request('listSkillOperations', undefined))).toEqual([])
})

When('我尝试预览解析到私有网络的来源', async ({ runtime, nativeSkills }) => {
  nativeSkills.fixture!.stall(false)
  nativeSkills.requestsBefore = nativeSkills.fixture!.requests.length
  const page = runtime.page
  await page.getByRole('tab', { name: '本地', exact: true }).click()
  await page.getByRole('button', { name: '技能操作', exact: true }).click()
  await page.getByRole('menuitem', { name: '导入文件夹、ZIP 或链接', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '导入技能', exact: true })
  await dialog.getByRole('tab', { name: '链接', exact: true }).click()
  await dialog.getByLabel('链接', { exact: true }).fill('https://private-fixture.example/private.zip')
  await dialog.getByRole('button', { name: '扫描', exact: true }).click()
})

Then('来源被拒绝且没有发出下载请求', async ({ runtime, nativeSkills }) => {
  const page = runtime.page, dialog = page.getByRole('dialog', { name: '导入技能', exact: true })
  await expect(dialog.getByText('下载地址解析到非公开网络，已拒绝访问', { exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^安装所选/ })).toHaveCount(0)
  expect(nativeSkills.fixture!.requests).toHaveLength(nativeSkills.requestsBefore!)
  expect((await page.evaluate(() => window.boai.request('snapshot', undefined))).resources).toEqual([])
  expect(runtime.errors).toEqual([])
})
When('下载返回部分内容后连接中断', async ({ runtime, nativeSkills }) => {
  nativeSkills.fixture!.partial()
  await runtime.page.getByRole('button', { name: '导入 Skill', exact: true }).click()
  const dialog = runtime.page.getByRole('dialog', { name: '导入技能', exact: true })
  await dialog.getByRole('tab', { name: '链接', exact: true }).click()
  await dialog.getByLabel('链接', { exact: true }).fill('https://native-fixture.example/truncated.zip')
  await dialog.getByRole('button', { name: '扫描', exact: true }).click()
  await expect.poll(() => nativeSkills.fixture!.pending()).toBe(1)
  nativeSkills.fixture!.interruptDownload()
})
Then('预览明确失败且残缺包没有成为技能或临时残留', async ({ runtime, nativeSkills }) => {
  const dialog = runtime.page.getByRole('dialog', { name: '导入技能', exact: true })
  await expect(dialog.getByRole('alert')).toContainText(/aborted|中断|socket|连接/)
  await expect(dialog.getByRole('button', { name: '扫描', exact: true })).toBeEnabled()
  await expect(dialog.getByRole('button', { name: /^安装所选/ })).toHaveCount(0)
  expect((await runtime.page.evaluate(() => window.boai.request('snapshot', undefined))).resources).toEqual([])
  expect(await runtime.page.evaluate(() => window.boai.request('listSkillOperations', undefined))).toEqual([])
  const remaining = await readdir(join(runtime.root, 'v2/skill-staging')).catch(error => { if (error.code === 'ENOENT') return []; throw error })
  expect(remaining).toEqual([])
  expect(nativeSkills.fixture!.pending()).toBe(0)
  expect(nativeSkills.fixture!.requests).toEqual(['https://native-fixture.example/truncated.zip'])
  expect(runtime.errors).toEqual([])
})
