/*
 * [OUTPUT]: 模型连接从本人菜单“其他配置”进入，原行为断言保持。
 * [INPUT]: 真实 Electron/原群聊夹具、设置开关和录入按钮。
 * [OUTPUT]: 四动作原功能保持、单行原子提交、菜单保护、实际窗口焦点前置、分类/失焦与重启保存。
 * [POS]: 可编辑快捷键增量 BDD；不改原冻结五场或 UI 基线。
 * [PROTOCOL]: 变化同步 Header 和所属 .folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { randomUUID } from 'node:crypto'
import { test as base } from '../support/test'
import { prepareGroupChat } from '../support/group-chat'
import type { Desktop } from '../support/desktop'
import type { ShortcutSnapshot } from '../../../packages/shared/src/shortcuts'

type State = { fixture?: Awaited<ReturnType<typeof prepareGroupChat>>; before?: ShortcutSnapshot; marker?: string }
export const test = base.extend<{ editing: State }>({ editing: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const primary = process.platform === 'darwin' ? 'Meta' : 'Control'
const snapshot = (runtime: Desktop) => runtime.page.evaluate(() => window.boai.request('getShortcutSettings', undefined))
const recorder = (runtime: Desktop, id = 'search') => runtime.page.locator(`[data-shortcut-recorder=${id}]`)
const toggle = (runtime: Desktop) => runtime.page.getByRole('switch', { name: 'Open Search / 全局搜索', exact: true })
async function settings(runtime: Desktop) {
  await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '其他配置', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '设置分类', exact: true }).getByRole('button', { name: '快捷键', exact: true }).click()
  await expect(recorder(runtime)).toBeEnabled()
}
async function record(runtime: Desktop, combination: string, id = 'search') {
  const focusedBefore = await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFocused())
  await runtime.app.evaluate(({ app, BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; app.focus({ steal: true }); window.show(); window.focus() })
  await expect.poll(() => runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFocused())).toBe(true)
  await runtime.reviewData('录入前原生窗口焦点', { id, focusedBefore, focusedAfter: true })
  await recorder(runtime, id).click()
  await expect(recorder(runtime, id)).toHaveAttribute('aria-pressed', 'true')
  await expect(recorder(runtime, id)).not.toHaveText('正在准备…')
  await runtime.page.keyboard.press(combination)
}
async function conversation(runtime: Desktop, state: State) {
  await runtime.page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '会话', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '会话列表', exact: true }).getByRole('button', { name: new RegExp(`^${state.fixture!.direct.title}`) }).click()
  await expect(runtime.page.locator(`[data-conversation-view=chat][data-conversation-id="${state.fixture!.direct.id}"] .chat-messages-transition`)).toHaveAttribute('aria-busy', 'false')
}
Given('快捷键编辑验收已打开隔离会话', async ({ runtime, editing }) => {
  editing.fixture = await prepareGroupChat(runtime)
  await runtime.page.emulateMedia({ reducedMotion: 'reduce' })
  await settings(runtime); editing.before = await snapshot(runtime)
  await expect(runtime.page.getByRole('button', { name: /^(保存|应用)$/ })).toHaveCount(0)
})
When('我关闭搜索快捷键并使用原搜索按钮', async ({ runtime, editing }) => {
  await toggle(runtime).click()
  await expect.poll(async () => (await snapshot(runtime)).preferences.search.enabled).toBe(false)
  await conversation(runtime, editing)
  const search = runtime.page.getByRole('button', { name: '搜索会话内容', exact: true })
  await search.focus(); await runtime.page.keyboard.press(`${primary}+k`)
  await expect(runtime.page.getByRole('dialog', { name: '搜索会话内容', exact: true })).toHaveCount(0)
  await search.click(); await expect(runtime.page.getByRole('dialog', { name: '搜索会话内容', exact: true })).toBeVisible()
  await runtime.page.getByRole('button', { name: '关闭搜索', exact: true }).click()
})
When('我录入新搜索组合并直接打开同一行开关', async ({ runtime, editing }) => {
  await settings(runtime)
  const before = await snapshot(runtime)
  await record(runtime, `${primary}+Shift+p`)
  expect(await snapshot(runtime)).toEqual(before)
  await toggle(runtime).click()
  await expect.poll(async () => (await snapshot(runtime)).revision).toBe(before.revision + 1)
  expect((await snapshot(runtime)).preferences.search).toEqual({ enabled: true, binding: { code: 'KeyP', shift: true, alt: false } })
  editing.before = await snapshot(runtime)
  await runtime.reviewCheckpoint('搜索组合与启用一次自动保存')
})
Then('只有新搜索组合触发原搜索且重启保持', async ({ runtime, editing }) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) { await runtime.restart(); expect(await snapshot(runtime)).toEqual(editing.before) }
    await conversation(runtime, editing)
    const search = runtime.page.getByRole('button', { name: '搜索会话内容', exact: true })
    await search.focus(); await runtime.page.keyboard.press(`${primary}+k`)
    await expect(runtime.page.getByRole('dialog', { name: '搜索会话内容', exact: true })).toHaveCount(0)
    await runtime.page.keyboard.press(`${primary}+Shift+p`)
    await expect(runtime.page.getByRole('dialog', { name: '搜索会话内容', exact: true })).toBeVisible()
    await runtime.page.getByRole('button', { name: '关闭搜索', exact: true }).click()
  }
  expect(editing.fixture!.state.calls).toBe(0)
  await runtime.reviewData('自动保存快捷键重启保持', { settings: await snapshot(runtime), modelCalls: editing.fixture!.state.calls })
})
When('我在录入中按退出重载和重复组合', async ({ runtime, editing }) => {
  editing.marker = randomUUID()
  await runtime.page.evaluate(value => { document.documentElement.dataset.shortcutEditingMarker = value }, editing.marker)
  for (const key of process.platform === 'darwin' ? ['q', 'r', 'b'] : ['w', 'r', 'b']) {
    await record(runtime, `${primary}+${key}`)
    await runtime.page.getByRole('heading', { name: '快捷键', exact: true }).click()
    await expect(runtime.page.locator('[data-sonner-toast]').filter({ hasText: /占用|已用于/ }).last()).toBeVisible()
    expect(await snapshot(runtime)).toEqual(editing.before)
    await recorder(runtime).click(); await runtime.page.keyboard.press('Escape')
  }
})
Then('应用未退出重载且原绑定保持', async ({ runtime, editing }) => {
  expect(await runtime.page.evaluate(() => document.documentElement.dataset.shortcutEditingMarker)).toBe(editing.marker)
  expect(await snapshot(runtime)).toEqual(editing.before)
  await conversation(runtime, editing)
  await runtime.page.getByRole('button', { name: '搜索会话内容', exact: true }).focus()
  await runtime.page.keyboard.press(`${primary}+k`)
  await expect(runtime.page.getByRole('dialog', { name: '搜索会话内容', exact: true })).toBeVisible()
  expect(editing.fixture!.state.calls).toBe(0)
})
When('我录入组合后切设置分类并在下一次录入时让窗口失焦', async ({ runtime }) => {
  await record(runtime, `${primary}+Shift+p`)
  await runtime.page.getByRole('navigation', { name: '设置分类', exact: true }).getByRole('button', { name: '外观', exact: true }).click()
  await expect(runtime.page.getByRole('navigation', { name: '设置分类', exact: true }).getByRole('button', { name: '外观', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(runtime.page.getByRole('alertdialog', { name: '有未保存的修改', exact: true })).toHaveCount(0)
  await runtime.page.getByRole('navigation', { name: '设置分类', exact: true }).getByRole('button', { name: '快捷键', exact: true }).click()
  await expect.poll(async () => (await snapshot(runtime)).preferences.search.binding?.code).toBe('KeyP')
  await record(runtime, `${primary}+Shift+l`, 'sidebar')
  await runtime.app.evaluate(({ BrowserWindow }) => { BrowserWindow.getFocusedWindow()?.blur() })
  await expect.poll(async () => (await snapshot(runtime)).preferences.sidebar.binding?.code).toBe('KeyL')
  await runtime.app.evaluate(({ BrowserWindow }) => { const window = BrowserWindow.getAllWindows()[0]; window.show(); window.focus() })
  await expect(recorder(runtime, 'sidebar')).toHaveAttribute('aria-pressed', 'false')
})
Then('两次自动保存持久化且没有放弃确认', async ({ runtime, editing }) => {
  const saved = await snapshot(runtime)
  expect(saved.revision).toBe(editing.before!.revision + 2)
  await expect(runtime.page.getByRole('alertdialog', { name: '有未保存的修改', exact: true })).toHaveCount(0)
  await runtime.restart(); expect(await snapshot(runtime)).toEqual(saved)
  expect(editing.fixture!.state.calls).toBe(0)
  await runtime.reviewData('切分类与真实窗口失焦后重启', { settings: saved, modelCalls: editing.fixture!.state.calls })
})
