/*
 * [OUTPUT]: 2026-10-29 文件浏览器入口/预览/启停与目录撤权回归，原终端生命周期断言保持。
 * [OUTPUT]: 模型连接从本人菜单“其他配置”进入，原行为断言保持。
 * [OUTPUT]: 2026-10-27 语音主要控件220px同宽、辅助操作居左和快捷键无箭头；自动保存、持久化及零下载合同保持。
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
  await runtime.page.getByRole('menuitem', { name: '其他配置', exact: true }).click()
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
  await expect.poll(() => runtime.page.locator('[data-application-plugin]').evaluateAll(elements => elements.map(element => element.getAttribute('data-application-plugin')).sort())).toEqual(['boai.preview.text', 'boai.preview.image', 'boai.preview.pdf', 'boai.preview.office', 'boai.theme.vscode-plus', 'boai.theme.base46', 'boai.search.deepseek', 'boai.runtime.pi', 'boai.runtime.opencode', 'boai.voice-input', 'boai.file-explorer'].sort())
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
  await page.getByRole('button', { name: '配置语音输入', exact: true }).click()
  const voicePage = page.getByRole('region', { name: '语音输入设置', exact: true })
  await expect(voicePage).toBeVisible()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(voicePage.getByRole('switch', { name: '启用语音输入', exact: true })).not.toBeChecked()
  await expect(voicePage.getByRole('button', { name: '下载模型', exact: true })).toBeDisabled()
  await toggle(page, '启用语音输入', true)
  await voicePage.getByRole('combobox', { name: '识别语言', exact: true }).click()
  await page.getByRole('option', { name: '中文', exact: true }).click()
  await voicePage.getByRole('switch', { name: '启用文字整理', exact: true }).click()
  await voicePage.getByText('编辑润色规则', { exact: true }).click()
  await voicePage.getByRole('textbox', { name: '高级润色规则', exact: true }).fill('保留语气词，使用中文标点')
  await voicePage.getByRole('switch', { name: '启用文字整理', exact: true }).click()
  await voicePage.getByRole('textbox', { name: '语音术语表', exact: true }).fill('BOAI | 波艾')
  await voicePage.getByRole('heading', { name: '语音输入', exact: true }).click()
  await expect.poll(async () => (await page.evaluate(() => window.boai.voice!.snapshot())).settings.terms).toEqual([{ word: 'BOAI', aliases: ['波艾'] }])
  await expect(voicePage.getByRole('button', { name: '保存', exact: true })).toHaveCount(0)
  await expect(voicePage.locator('kbd')).toHaveCount(0)
  const language = await voicePage.getByRole('combobox', { name: '识别语言', exact: true }).boundingBox()
  const languageRow = await voicePage.getByRole('combobox', { name: '识别语言', exact: true }).locator('xpath=ancestor::*[@data-voice-setting-row][1]').boundingBox()
  expect(language!.width).toBeLessThan(languageRow!.width / 2)
  expect(Math.abs(language!.x + language!.width - languageRow!.x - languageRow!.width)).toBeLessThanOrEqual(2)
  const microphone = await voicePage.getByRole('combobox', { name: '麦克风', exact: true }).boundingBox()
  const authorize = await voicePage.getByRole('button', { name: '授权并刷新设备', exact: true }).boundingBox()
  expect(authorize!.height).toBe(32); expect(microphone!.height).toBe(authorize!.height)
  const mode = await voicePage.getByRole('combobox', { name: '识别方式', exact: true }).boundingBox()
  const shortcutButton = voicePage.getByRole('button', { name: '前往快捷键设置', exact: true })
  const shortcut = await shortcutButton.boundingBox()
  const download = await voicePage.getByRole('button', { name: '下载模型', exact: true }).boundingBox()
  const license = await voicePage.getByRole('link', { name: '模型许可', exact: true }).boundingBox()
  for (const control of [mode, language, microphone, shortcut, download]) {
    expect(control!.width).toBe(220)
    expect(Math.abs(control!.x + control!.width - languageRow!.x - languageRow!.width)).toBeLessThanOrEqual(2)
  }
  expect(authorize!.x + authorize!.width).toBeLessThan(microphone!.x)
  expect(license!.x + license!.width).toBeLessThan(download!.x)
  await expect(voicePage.getByRole('button', { name: '授权并刷新设备', exact: true })).toHaveAttribute('data-variant', 'link')
  await expect(voicePage.getByRole('button', { name: '授权并刷新设备', exact: true })).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
  const authorizationFont = await voicePage.getByRole('button', { name: '授权并刷新设备', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize))
  const microphoneFont = await voicePage.getByRole('combobox', { name: '麦克风', exact: true }).evaluate(element => parseFloat(getComputedStyle(element).fontSize))
  expect(authorizationFont).toBeLessThan(microphoneFont)
  await expect(shortcutButton.locator('svg, .app-icon')).toHaveCount(0)
  await page.getByRole('button', { name: '插件', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByRole('switch', { name: '语音输入', exact: true })).toBeChecked()
  await page.getByRole('navigation', { name: '设置分类', exact: true }).getByRole('button', { name: '语音输入', exact: true }).click()
  await expect(voicePage.getByRole('textbox', { name: '语音术语表', exact: true })).toHaveValue('BOAI | 波艾')
  await voicePage.getByRole('textbox', { name: '语音术语表', exact: true }).fill('BOAI | 波艾 | 博艾')
  await page.getByRole('button', { name: '插件', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await expect(page.getByRole('region', { name: '内置插件', exact: true })).toBeVisible()
  await expect.poll(async () => (await page.evaluate(() => window.boai.voice!.snapshot())).settings.terms).toEqual([{ word: 'BOAI', aliases: ['波艾', '博艾'] }])
})
Then('重启保留语音选择且没有自动下载或录音', async ({ runtime }) => {
  await runtime.restart(); await openPlugins(runtime)
  await expect(runtime.page.getByRole('switch', { name: '语音输入', exact: true })).toBeChecked()
  const snapshot = await runtime.page.evaluate(() => window.boai.voice!.snapshot())
  expect(snapshot.settings.terms).toEqual([{ word: 'BOAI', aliases: ['波艾', '博艾'] }])
  expect(snapshot.localReady).toBe(false); expect(snapshot.download).toBeUndefined()
  expect(snapshot.settings.refinement.enabled).toBe(false)
  expect(snapshot.settings.language).toBe('zh')
  expect(snapshot.settings.microphoneDeviceId).toBe('')
  expect(snapshot.settings.refinement.instructions).toBe('保留语气词，使用中文标点')
  await toggle(runtime.page, '语音输入', false)
  await runtime.page.getByRole('button', { name: '配置语音输入', exact: true }).click()
  const voicePage = runtime.page.getByRole('region', { name: '语音输入设置', exact: true })
  await expect(voicePage).toBeVisible()
  await expect(voicePage.getByRole('switch', { name: '启用语音输入', exact: true })).not.toBeChecked()
  await expect(voicePage.getByRole('textbox', { name: '语音术语表', exact: true })).toHaveValue('BOAI | 波艾 | 博艾')
})

Then('语音页沿统一快捷键设置且不会开始录音', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '前往快捷键设置', exact: true }).click()
  await expect(runtime.page.getByRole('heading', { name: '快捷键', exact: true })).toBeVisible()
  const voice = runtime.page.locator('.appearance-row').filter({ hasText: '语音输入' })
  await expect(voice.getByRole('switch', { name: '语音输入', exact: true })).not.toBeChecked()
  await expect(voice.locator('kbd')).toHaveText('无')
  const snapshot = await runtime.page.evaluate(() => window.boai.voice!.snapshot())
  expect(snapshot.localReady).toBe(false); expect(snapshot.download).toBeUndefined()
})
