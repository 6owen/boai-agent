/*
 * [OUTPUT]: 2026-10-29 文件浏览器入口/预览/启停与目录撤权回归，原终端生命周期断言保持。
 * [INPUT]: Isolated Electron profile, actual directory grants and real preview source files.
 * [OUTPUT]: UI entry/scope/tree/preview and plugin restart acceptance; no model or personal data.
 * [POS]: Official file explorer BDD; runtime assertions use original public IPC only.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from '../support/test'
import type { Desktop } from '../support/desktop'

const { Given, When, Then } = createBdd(test)
const groupTitle = '文件浏览器验收群'
async function employee(runtime: Desktop) {
  return runtime.page.evaluate(async () => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!)
}
async function contacts(runtime: Desktop) {
  const page = runtime.page, agent = await employee(runtime)
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '通讯录', exact: true }).click()
  await page.getByRole('complementary', { name: '通讯录列表' }).locator('.conversation-item').filter({ hasText: agent.name }).click()
  return page.getByRole('region', { name: '通讯录详情' })
}
async function start(runtime: Desktop, agentId = 'researcher') {
  const page = runtime.page
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '会话', exact: true }).click()
  await page.locator('.conversation-item').filter({ hasText: groupTitle }).click()
  await page.getByRole('button', { name: '打开工作区', exact: true }).click()
  const region = page.getByRole('region', { name: '工作区开始', exact: true })
  const agent = await page.evaluate(async id => (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === id)!, agentId)
  await region.getByRole('combobox', { name: '工作区员工', exact: true }).click()
  await page.getByRole('option', { name: agent.name, exact: true }).click()
  return region
}
async function plugins(runtime: Desktop) {
  const page = runtime.page
  await page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '其他配置', exact: true }).click()
  await page.getByRole('button', { name: '插件', exact: true }).click()
  return page.getByRole('switch', { name: '文件浏览器', exact: true })
}
async function grants(runtime: Desktop, paths: string[]) {
  await runtime.page.evaluate(async paths => {
    const agent = (await window.boai.request('snapshot', undefined)).agents.find(agent => agent.id === 'researcher')!
    const { configVersion, directoryRevision, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, creationSource: _c, systemRole: _s, ...input } = agent
    await window.boai.request('saveAgent', { ...input, expectedConfigVersion: configVersion, expectedDirectoryRevision: directoryRevision, directoryGrants: paths.map(path => ({ path, access: 'read-only' as const })) })
  }, paths)
}
Given('文件浏览器隔离桌面有两位员工和两个只读授权目录', async ({ runtime }) => {
  const project = join(runtime.root, 'authorized-project'), other = join(runtime.root, 'another-project')
  await mkdir(join(project, 'src'), { recursive: true }); await mkdir(other, { recursive: true })
  await writeFile(join(project, 'src', 'note.md'), '# 项目文件预览\n\n这是授权项目的实际内容。')
  await writeFile(join(project, 'src', 'example.ts'), 'export const projectFile = 42')
  await writeFile(join(project, '.hidden.txt'), 'hidden fixture')
  await writeFile(join(project, 'pixel.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ1kAAAAASUVORK5CYII=', 'base64'))
  await writeFile(join(other, 'other.txt'), '这是第二个授权目录。')
  await runtime.start()
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  await grants(runtime, [project, other])
  const root = await runtime.page.evaluate(async () => {
    await window.boai.request('createConversation', { title: '文件浏览器验收群', kind: 'group', agentIds: ['researcher', 'writer'] })
    return (await window.boai.request('listWorkspaceFiles', { scope: { employeeId: 'researcher' } })).rootPath
  })
  expect(root.startsWith(await import('node:fs/promises').then(fs => fs.realpath(runtime.root)))).toBe(true)
  await writeFile(join(root, 'employee-note.md'), '# 员工工作区文件\n\n这份文件属于员工工作区。')
})
When('我在员工配置点击工作区', async ({ runtime }) => {
  const profile = await contacts(runtime)
  await expect(profile.getByRole('button', { name: '发消息', exact: true })).toBeVisible()
  await expect(profile.getByRole('button', { name: '高级配置', exact: true })).toBeVisible()
  await profile.getByRole('button', { name: '工作区', exact: true }).click()
})
Then('右侧文件树展示员工工作区并能预览其中的文件', async ({ runtime }) => {
  const panel = runtime.page.getByRole('region', { name: '员工工作区', exact: true })
  await expect(panel).toBeVisible()
  await expect(panel.locator('.boai-explorer-path')).toContainText('/agents/researcher/workspace')
  await panel.getByRole('treeitem', { name: 'employee-note.md', exact: true }).click()
  await expect(panel.getByRole('heading', { name: '员工工作区文件', exact: true })).toBeVisible()
  await expect(panel.getByRole('tree')).toBeVisible()
  await test.info().attach('员工配置工作区', { body: await runtime.page.screenshot(), contentType: 'image/png' })
})
When('我在群会话开始页选择员工授权目录', async ({ runtime }) => {
  const empty = await start(runtime, 'writer')
  await expect(empty.getByRole('button', { name: /^授权目录/ })).toHaveCount(0)
  await expect(empty.getByRole('button', { name: /^新建终端/ })).toBeVisible()
  const permitted = await start(runtime)
  await permitted.getByRole('button', { name: /^授权目录/ }).click()
})
Then('文件树展示授权项目并支持目录切换与文件预览', async ({ runtime }) => {
  const page = runtime.page, panel = page.getByRole('region', { name: '授权目录文件', exact: true })
  await expect(panel).toBeVisible()
  await expect(panel.locator('.boai-explorer-path')).toContainText('/authorized-project')
  await expect(panel.getByRole('treeitem', { name: 'employee-note.md', exact: true })).toHaveCount(0)
  await panel.getByRole('treeitem', { name: 'src', exact: true }).click()
  await panel.getByRole('treeitem', { name: 'note.md', exact: true }).click()
  await expect(panel.getByRole('heading', { name: '项目文件预览', exact: true })).toBeVisible()
  await panel.getByRole('treeitem', { name: 'example.ts', exact: true }).click()
  await expect(panel.locator('.boai-explorer-preview')).toContainText('export const projectFile = 42')
  await panel.getByRole('treeitem', { name: 'pixel.png', exact: true }).click()
  await expect.poll(() => panel.locator('.boai-explorer-preview img').evaluateAll(images => images.some(image => (image as HTMLImageElement).naturalWidth > 0))).toBe(true)
  await expect(panel.getByRole('treeitem', { name: '.hidden.txt', exact: true })).toHaveCount(0)
  await panel.getByRole('button', { name: '显示隐藏文件', exact: true }).click()
  await expect(panel.getByRole('treeitem', { name: '.hidden.txt', exact: true })).toBeVisible()
  await panel.getByRole('treeitem', { name: 'note.md', exact: true }).click()
  await test.info().attach('授权目录文件树与预览', { body: await page.screenshot(), contentType: 'image/png' })
  await page.getByRole('combobox', { name: '授权目录', exact: true }).click()
  await page.getByRole('option', { name: /another-project$/ }).click()
  await panel.getByRole('treeitem', { name: 'other.txt', exact: true }).click()
  await expect(panel.locator('.boai-explorer-preview')).toContainText('这是第二个授权目录。')
  // Shared panel adapts to a narrow viewport without losing the tree or preview.
  await page.setViewportSize({ width: 1000, height: 800 })
  await expect(panel.getByRole('tree')).toBeVisible()
  await expect(panel.locator('.boai-explorer-preview')).toBeVisible()
  expect(await panel.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true)
})
When('我撤回这位员工的目录授权', async ({ runtime }) => { await grants(runtime, []) })
Then('授权目录入口和已打开面板关闭且业务文件保留', async ({ runtime }) => {
  await expect(runtime.page.getByRole('region', { name: '授权目录文件', exact: true })).toHaveCount(0)
  const home = await start(runtime)
  await expect(home.getByRole('button', { name: /^授权目录/ })).toHaveCount(0)
  expect(await readFile(join(runtime.root, 'authorized-project', 'src', 'note.md'), 'utf8')).toContain('项目文件预览')
})
When('我从插件设置停用文件浏览器', async ({ runtime }) => {
  const toggle = await plugins(runtime)
  await expect(toggle).toBeChecked(); await toggle.click(); await expect(toggle).not.toBeChecked(); await expect(toggle).toBeEnabled()
})
Then('员工工作区按钮和授权目录入口隐藏且宿主拒绝读取', async ({ runtime }) => {
  const profile = await contacts(runtime)
  await expect(profile.getByRole('button', { name: '工作区', exact: true })).toHaveCount(0)
  const home = await start(runtime)
  await expect(home.getByRole('button', { name: /^授权目录/ })).toHaveCount(0)
  expect(await runtime.page.evaluate(async () => {
    try { await window.boai.request('listWorkspaceFiles', { scope: { employeeId: 'researcher' } }); return 'allowed' } catch (error) { return String(error) }
  })).toContain('停用')
})
When('我重启后从插件设置启用文件浏览器', async ({ runtime }) => {
  await runtime.restart()
  const toggle = await plugins(runtime)
  await expect(toggle).not.toBeChecked(); await toggle.click(); await expect(toggle).toBeChecked(); await expect(toggle).toBeEnabled()
})
Then('员工工作区和授权目录可以重新浏览', async ({ runtime }) => {
  const profile = await contacts(runtime)
  await profile.getByRole('button', { name: '工作区', exact: true }).click()
  await expect(runtime.page.getByRole('region', { name: '员工工作区', exact: true }).getByRole('treeitem', { name: 'employee-note.md', exact: true })).toBeVisible()
  const home = await start(runtime)
  await home.getByRole('button', { name: /^授权目录/ }).click()
  await expect(runtime.page.getByRole('region', { name: '授权目录文件', exact: true }).getByRole('treeitem', { name: 'src', exact: true })).toBeVisible()
})
