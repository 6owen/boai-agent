/*
 * [OUTPUT]: 2026-10-27 本轮相关回归合同/源码更新；执行状态另行记录，不以源码存在判通过。
[OUTPUT]: 配色菜单先核实际打开及回退选项，再核禁用主题缺席与Escape关闭；不把尚未显示时按键当作关闭验证。
 * [OUTPUT]: 初始目录核对十项固定插件身份（含DeepSeek和双运行时），不从实现派生期望；原筛选/启停/重启断言保持。
 * [INPUT]: 插件平台中文场景、真实Electron与隔离固定配置文件。
 * [OUTPUT]: UI启停/同行筛选/窄窗/重启和主题真实token回退；未来配置零写入及开关动画结束后原生整幅截图。
 * [POS]: 内置插件平台BDD步骤，不调用真实模型。
 * [PROTOCOL]: 变化同步Header及所属.folder.md。
 */
import { expect, type Page } from '@playwright/test'
import { createBdd } from 'playwright-bdd'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { test } from '../support/test'
import type { Desktop } from '../support/desktop'

const { Given, When, Then } = createBdd(test)
const futureBytes = JSON.stringify({ schemaVersion: 99, revision: 17, disabledIds: ['future.unknown'] })
async function openPlugins(runtime: Desktop) {
  await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click()
  await runtime.page.getByRole('button', { name: '插件', exact: true }).click()
  await expect(runtime.page.getByRole('region', { name: '内置插件', exact: true })).toBeVisible()
}
async function start(runtime: Desktop) {
  await runtime.start({ dataDir: runtime.root })
  await expect(runtime.page.locator('.app-shell')).toBeVisible()
  await openPlugins(runtime)
}
const settings = (page: Page) => page.evaluate(() => window.boai.request('getPluginSettings', undefined))
async function toggle(page: Page, name: string, checked: boolean) {
  const control = page.getByRole('switch', { name, exact: true })
  await expect(control).toBeEnabled(); await control.click()
  await expect(control).toBeChecked({ checked }); await expect(control).toBeEnabled()
  await control.evaluate(async element => { await Promise.all(element.getAnimations({ subtree: true }).map(animation => animation.finished.catch(() => {}))) })
}
Given('内置插件管理在独立桌面打开', async ({ runtime }) => {
  await start(runtime)
  await expect.poll(() => runtime.page.locator('[data-application-plugin]').evaluateAll(elements => elements.map(element => element.getAttribute('data-application-plugin')).sort())).toEqual(['boai.preview.text', 'boai.preview.image', 'boai.preview.pdf', 'boai.preview.office', 'boai.theme.vscode-plus', 'boai.theme.base46', 'boai.search.deepseek', 'boai.runtime.pi', 'boai.runtime.opencode', 'boai.voice-input'].sort())
  await expect.poll(() => settings(runtime.page)).toEqual({ revision: 0, disabledIds: [], enabledIds: [] })
  const filters = runtime.page.locator('[data-plugin-filters]')
  expect(await filters.evaluate(element => {
    const input = element.querySelector('input')!.getBoundingClientRect(), select = element.querySelector('[role="combobox"]')!.getBoundingClientRect()
    return Math.abs(input.top - select.top) < 2 && input.right <= select.left
  })).toBe(true)
})
When('用户筛选并停用PDF预览插件', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('combobox', { name: '插件类型', exact: true }).click()
  await page.getByRole('option', { name: '主题', exact: true }).click()
  await expect(page.locator('[data-application-plugin]')).toHaveCount(2)
  await page.getByRole('combobox', { name: '插件类型', exact: true }).click()
  await page.getByRole('option', { name: '文件预览', exact: true }).click()
  await expect(page.locator('[data-application-plugin]')).toHaveCount(4)
  await page.getByRole('textbox', { name: '搜索插件', exact: true }).fill('PDF')
  await expect(page.locator('[data-application-plugin]')).toHaveCount(1)
  await toggle(page, 'PDF 预览', false)
  await expect(page.locator('[data-application-plugin="boai.preview.pdf"]')).toContainText('已停用')
  await page.getByRole('textbox', { name: '搜索插件', exact: true }).fill('no-such-plugin')
  await expect(page.getByText('没有匹配的插件。', { exact: true })).toBeVisible()
  await page.getByRole('textbox', { name: '搜索插件', exact: true }).fill('')
  await runtime.reviewNativeCheckpoint('插件管理已停用PDF')
})
Then('插件设置实际落盘且重启后保持停用', async ({ runtime }) => {
  const path = join(runtime.root, 'application-plugins.json')
  expect(JSON.parse(await readFile(path, 'utf8'))).toEqual({ schemaVersion: 2, revision: 1, disabledIds: ['boai.preview.pdf'], enabledIds: [] })
  await runtime.reviewFile('本机插件配置', path)
  await runtime.close(); await start(runtime)
  await expect(runtime.page.getByRole('switch', { name: 'PDF 预览', exact: true })).not.toBeChecked()
  await expect(runtime.page.getByRole('switch', { name: '文本预览', exact: true })).toBeChecked()
  await toggle(runtime.page, 'PDF 预览', true)
  await expect.poll(() => settings(runtime.page)).toEqual({ revision: 2, disabledIds: [], enabledIds: ['boai.preview.pdf'] })
  expect(runtime.errors).toEqual([])
  await runtime.reviewNativeCheckpoint('重启保留插件设置且可重新启用')
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(900, 700))
  await expect.poll(() => runtime.page.evaluate(() => innerWidth)).toBe(900)
  await expect.poll(() => runtime.page.evaluate(() => {
    const filters = document.querySelector('[data-plugin-filters]')!, select = filters.querySelector('[role="combobox"]')!.getBoundingClientRect()
    return select.right <= innerWidth && filters.scrollWidth <= filters.clientWidth
  })).toBe(true)
  await runtime.page.getByRole('combobox', { name: '插件类型', exact: true }).click()
  await runtime.page.getByRole('option', { name: '主题', exact: true }).click()
  await expect(runtime.page.getByRole('switch', { name: 'Base46 配色', exact: true })).toBeVisible()
  await runtime.reviewNativeCheckpoint('窄窗口筛选和插件操作可达')
})
When('用户选择Nord并在插件页停用Base46', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '外观', exact: true }).click()
  await page.getByRole('button', { name: '深色', exact: true }).click()
  await page.getByRole('combobox', { name: '深色配色', exact: true }).click()
  await page.getByRole('option', { name: 'Nord', exact: true }).click()
  await expect.poll(() => page.evaluate(() => window.boai.request('getAppearance', undefined))).toMatchObject({ preferences: { mode: 'dark', themeIds: { dark: 'nord' } }, resolvedThemeId: 'nord' })
  await expect(page.locator('html')).toHaveAttribute('data-theme-id', 'nord')
  await page.getByRole('button', { name: '插件', exact: true }).click()
  await expect(page.locator('[data-application-plugin="boai.theme.base46"]')).toContainText('正在使用 · 1 个视图')
  await toggle(page, 'Base46 配色', false)
  await expect(page.locator('html')).toHaveAttribute('data-theme-id', 'boai-dark')
  await expect(page.locator('[data-application-plugin="boai.theme.base46"]')).toContainText('已停用')
})
Then('默认配色生效且重启重新启用恢复Nord', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '外观', exact: true }).click()
  await expect(runtime.page.getByText('原主题插件已停用，暂用 BoAI 配色。重新启用插件后恢复原选择。', { exact: true })).toBeVisible()
  await runtime.page.getByRole('combobox', { name: '深色配色', exact: true }).click()
  const menu = runtime.page.getByRole('listbox')
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('option', { name: 'BoAI 深色', exact: true })).toBeVisible()
  await expect(runtime.page.getByRole('option', { name: 'Nord', exact: true })).toHaveCount(0)
  await runtime.page.keyboard.press('Escape')
  await expect(runtime.page.getByRole('listbox')).toBeHidden()
  await runtime.reviewNativeCheckpoint('停用主题使用默认配色并保留原选择')
  await runtime.close(); await start(runtime)
  await expect(runtime.page.locator('html')).toHaveAttribute('data-theme-id', 'boai-dark')
  await expect.poll(() => runtime.page.evaluate(() => window.boai.request('getAppearance', undefined))).toMatchObject({ preferences: { themeIds: { dark: 'nord' } }, resolvedThemeId: 'boai-dark' })
  await toggle(runtime.page, 'Base46 配色', true)
  await expect(runtime.page.locator('html')).toHaveAttribute('data-theme-id', 'nord')
  await expect(runtime.page.locator('[data-application-plugin="boai.theme.base46"]')).toContainText('正在使用 · 1 个视图')
  expect(runtime.errors).toEqual([])
  await runtime.reviewNativeCheckpoint('重新启用Base46恢复Nord原选择')
})
Given('本机插件配置是未来版本', async ({ runtime }) => {
  await writeFile(join(runtime.root, 'application-plugins.json'), futureBytes)
  await start(runtime)
})
Then('插件页显示只读诊断且重启没有覆盖配置', async ({ runtime }) => {
  for (let restart = 0; restart < 2; restart++) {
    await expect(runtime.page.getByText(/插件配置无法读取或来自更新版本/)).toBeVisible()
    const controls = runtime.page.locator('[data-application-plugin^="boai.preview."], [data-application-plugin^="boai.theme."]').getByRole('switch'); await expect(controls).toHaveCount(6)
    for (const control of await controls.all()) { await expect(control).toBeDisabled(); await expect(control).not.toBeChecked() }
    await expect(runtime.page.locator('[data-application-plugin="boai.runtime.pi"]').getByRole('switch')).toBeEnabled()
    expect(await readFile(join(runtime.root, 'application-plugins.json'), 'utf8')).toBe(futureBytes)
    await runtime.reviewNativeCheckpoint(`未来配置只读保护-${restart}`)
    if (!restart) { await runtime.close(); await start(runtime) }
  }
  expect(runtime.errors).toEqual([])
})

When('用户明确启用语音并保存术语配置', async ({ runtime }) => {
  const page = runtime.page
  await expect(page.getByRole('switch', { name: '语音输入', exact: true })).not.toBeChecked()
  const before = await page.evaluate(() => window.boai.voice!.snapshot())
  expect(before.settings.mode).toBe('local'); expect(before.settings.refinement.enabled).toBe(false)
  await toggle(page, '语音输入', true)
  await page.getByRole('button', { name: '配置语音输入', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '语音输入', exact: true })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('textbox', { name: '语音术语表', exact: true }).fill('BOAI | 波艾')
  await dialog.getByRole('button', { name: '保存', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.voice!.snapshot())).settings.terms).toEqual([{ word: 'BOAI', aliases: ['波艾'] }])
})
Then('重启保留语音选择且没有自动下载或录音', async ({ runtime }) => {
  await runtime.restart(); await openPlugins(runtime)
  await expect(runtime.page.getByRole('switch', { name: '语音输入', exact: true })).toBeChecked()
  const snapshot = await runtime.page.evaluate(() => window.boai.voice!.snapshot())
  expect(snapshot.settings.terms).toEqual([{ word: 'BOAI', aliases: ['波艾'] }])
  expect(snapshot.localReady).toBe(false); expect(snapshot.download).toBeUndefined()
  expect(snapshot.settings.refinement.enabled).toBe(false)
  await toggle(runtime.page, '语音输入', false)
  await expect(runtime.page.getByRole('button', { name: '配置语音输入', exact: true })).toHaveCount(0)
})
