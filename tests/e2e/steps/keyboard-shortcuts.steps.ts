/*
 * [INPUT]: 冻结快捷键合同、原Desktop/群聊夹具和真实键盘/导航控件。
 * [OUTPUT]: 四动作与原状态等价、输入/IME/重复按键/弹层边界，固定零模型断言。
 * [POS]: 第22组真实新功能验收；开发任务不可改本文件或期望截图。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { test as base } from '../support/test'
import { prepareGroupChat } from '../support/group-chat'
import { messageDraft } from '../support/editor-controls'

type State = { fixture?: Awaited<ReturnType<typeof prepareGroupChat>> }
export const test = base.extend<{ shortcuts: State }>({ shortcuts: async ({}, use) => use({}) })
const { Given, When, Then } = createBdd(test)
const primary = process.platform === 'darwin' ? 'Meta' : 'Control'
const draft = '快捷键切换后仍保留的未发送草稿。'
const pairs = [['Open Search / 全局搜索', 'K'], ['切换侧边栏', 'B'], ['后退', '['], ['前进', ']']]

Given('快捷键验收已打开隔离群聊和原导航', async ({ runtime, shortcuts }) => {
  shortcuts.fixture = await prepareGroupChat(runtime)
  await runtime.page.emulateMedia({ reducedMotion: 'reduce' })
})
When('用户在设置分类打开快捷键', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click()
  await runtime.page.getByRole('navigation', { name: '设置分类', exact: true }).getByRole('button', { name: '快捷键', exact: true }).click()
})
Then('设置列出搜索侧边栏后退和前进的实际组合', async ({ runtime, shortcuts }) => {
  await expect(runtime.page.getByRole('heading', { name: '快捷键', exact: true })).toBeVisible()
  for (const [label, key] of pairs) {
    const row = runtime.page.locator('.appearance-row').filter({ hasText: label })
    await expect(row).toHaveCount(1)
    await expect(row.locator('kbd')).toContainText(process.platform === 'darwin' ? '⌘' : 'Ctrl')
    await expect(row.locator('kbd')).toContainText(key!)
  }
  expect(shortcuts.fixture!.state.calls).toBe(0)
})
When('用户通过快捷键打开原搜索并切换当前侧边栏', async ({ runtime }) => {
  const page = runtime.page, input = page.getByRole('textbox', { name: '消息内容', exact: true })
  await input.fill(draft)
  await page.getByRole('button', { name: '搜索会话内容', exact: true }).focus()
  await page.keyboard.press(`${primary}+k`)
  await expect(page.getByRole('dialog', { name: '搜索会话内容', exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: '搜索关键词', exact: true })).toBeFocused()
  await page.getByRole('button', { name: '关闭搜索', exact: true }).click()
  const toggle = page.getByRole('button', { name: '显示或隐藏会话列表', exact: true })
  await toggle.focus(); await page.keyboard.press(`${primary}+b`)
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await toggle.click(); await expect(toggle).toHaveAttribute('aria-pressed', 'true')
})
Then('搜索列表和原会话草稿保持一致且没有模型请求', async ({ runtime, shortcuts }) => {
  await expect(runtime.page.locator('.app-shell')).toHaveAttribute('data-page', 'conversations')
  await expect(runtime.page.getByRole('dialog', { name: '搜索会话内容', exact: true })).toHaveCount(0)
  await expect.poll(() => messageDraft(runtime.page.getByRole('textbox', { name: '消息内容', exact: true }))).toBe(draft)
  expect(shortcuts.fixture!.state.calls).toBe(0)
})
When('用户从群聊切到通讯录再按后退和前进', async ({ runtime }) => {
  const page = runtime.page, shell = page.locator('.app-shell')
  await page.getByRole('navigation', { name: '主导航', exact: true }).getByRole('button', { name: '通讯录', exact: true }).click()
  await expect(shell).toHaveAttribute('data-page', 'contacts')
  await page.keyboard.press(`${primary}+[`); await expect(shell).toHaveAttribute('data-page', 'conversations')
  await page.keyboard.press(`${primary}+]`); await expect(shell).toHaveAttribute('data-page', 'contacts')
  await page.getByRole('button', { name: '后退', exact: true }).click()
  await expect(shell).toHaveAttribute('data-page', 'conversations')
  await page.getByRole('button', { name: '前进', exact: true }).click()
  await expect(shell).toHaveAttribute('data-page', 'contacts')
})
Then('按键与原导航按钮使用同一历史且没有越过边界', async ({ runtime, shortcuts }) => {
  const page = runtime.page, back = page.getByRole('button', { name: '后退', exact: true }), forward = page.getByRole('button', { name: '前进', exact: true })
  await expect(forward).toBeDisabled()
  await page.keyboard.press(`${primary}+]`); await expect(page.locator('.app-shell')).toHaveAttribute('data-page', 'contacts')
  for (let count = 0; count < 8 && await back.isEnabled(); count++) await back.click()
  await expect(back).toBeDisabled()
  const before = await page.locator('.app-shell').getAttribute('data-page')
  await page.getByRole('button', { name: '搜索会话内容', exact: true }).focus(); await page.keyboard.press(`${primary}+[`)
  await expect(page.locator('.app-shell')).toHaveAttribute('data-page', before!)
  expect(shortcuts.fixture!.state.calls).toBe(0)
})
When('用户在编辑器组合输入或弹层内按应用组合键', async ({ runtime }) => {
  const page = runtime.page, input = page.getByRole('textbox', { name: '消息内容', exact: true }), toggle = page.getByRole('button', { name: '显示或隐藏会话列表', exact: true, includeHidden: true })
  await input.fill(draft)
  for (const key of ['k', 'b', '[', ']']) await input.press(`${primary}+${key}`)
  await expect.poll(() => messageDraft(input)).toBe(draft)
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('dialog', { name: '搜索会话内容', exact: true })).toHaveCount(0)
  const search = page.getByRole('button', { name: '搜索会话内容', exact: true })
  for (const extra of [{ isComposing: true }, { repeat: true }, { altKey: true }, { shiftKey: true }]) {
    const unconsumed = await search.evaluate((element, options) => element.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', bubbles: true, cancelable: true, ...options })), { [process.platform === 'darwin' ? 'metaKey' : 'ctrlKey']: true, ...extra })
    expect(unconsumed).toBe(true)
    await expect(page.getByRole('dialog', { name: '搜索会话内容', exact: true })).toHaveCount(0)
  }
  await search.click()
  const dialog = page.getByRole('dialog', { name: '搜索会话内容', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: '搜索关键词', exact: true }).press(`${primary}+b`)
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '关闭搜索', exact: true }).click()
})
Then('输入未被消费且搜索侧边栏和导航没有误触发', async ({ runtime, shortcuts }) => {
  await expect(runtime.page.locator('.app-shell')).toHaveAttribute('data-page', 'conversations')
  await expect.poll(() => messageDraft(runtime.page.getByRole('textbox', { name: '消息内容', exact: true }))).toBe(draft)
  await expect(runtime.page.getByRole('button', { name: '显示或隐藏会话列表', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(shortcuts.fixture!.state.calls).toBe(0)
})
