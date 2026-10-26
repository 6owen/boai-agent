/*
 * [OUTPUT]: 运行设置说明已移入Tooltip，按实际入口验证原文与禁用状态，原资源门槛保持。
 * [INPUT]: 原 Desktop、真实窗口/Utility PID、固定离线 API 员工回复。
 * [OUTPUT]: 原生窗口/草稿与原GC资源门槛；显式诊断只在原断言失败后收集DOM/堆，不改变通过条件。
 * [POS]: 后台常驻的 Electron BDD 步骤。
 * [PROTOCOL]: 变化同步 Header 与所属 .folder.md。
 */
import { createBdd } from 'playwright-bdd'
import { expect, type JSHandle } from '@playwright/test'
import { test } from '../support/test'
import { join } from 'node:path'
import { prepareGroupChat } from '../support/group-chat'
import type { Desktop } from '../support/desktop'
import type { BrowserWindow } from 'electron'
import { resourceSample, verifyResources, recordResourceFailure, type ResourceSample } from '../support/background-resources'
const { Given, When, Then } = createBdd(test)
const fixtures = new WeakMap<Desktop, Awaited<ReturnType<typeof prepareGroupChat>>>()
const identities = new WeakMap<Desktop, { window: number; pids: number[] }>()
const resourceSamples = new WeakMap<Desktop, ResourceSample[]>()
function idleSeconds() {
  const value = Number(process.env.BOAI_RESOURCE_IDLE_SECONDS ?? '120')
  if (!Number.isSafeInteger(value) || value < 120 || value > 86_400) throw new Error('资源观察时间应为120–86400秒。')
  return value
}
async function identity(runtime: Desktop) {
  return runtime.app.evaluate(({ app, BrowserWindow }) => ({ window: BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('index.html') || window.webContents.getURL().startsWith('http://127.0.0.1:'))!.id, pids: app.getAppMetrics().filter(metric => metric.type === 'Utility').map(metric => metric.pid).sort() }))
}
async function mainWindow(runtime: Desktop) { return runtime.app.browserWindow(runtime.page) as Promise<JSHandle<BrowserWindow>> }
Given('已启动隔离的后台员工桌面', async ({ runtime }) => {
  fixtures.set(runtime, await prepareGroupChat(runtime, { emulateViewport: false }))
  const nativeWindow = await mainWindow(runtime)
  try { expect(await runtime.page.evaluate(() => innerWidth)).toBe(await runtime.app.evaluate((_electron, window) => window.getContentSize()[0], nativeWindow)) } finally { await nativeWindow.dispose() }
  const settings = await runtime.page.evaluate(() => window.boai.request('getDesktopSettings', undefined))
  expect(settings.trayAvailable).toBe(true)
  await runtime.page.getByRole('textbox', { name: '消息内容' }).fill('后台关闭保留的草稿')
  const state = await identity(runtime); expect(state.pids.length).toBeGreaterThan(0); identities.set(runtime, state)
  await runtime.reviewNativeCheckpoint('关闭前草稿')
})
When('保留未发送草稿并关闭主窗口', async ({ runtime }) => {
  const window = await mainWindow(runtime)
  try { await runtime.app.evaluate((_electron, window) => window.close(), window) } finally { await window.dispose() }
})
Then('主窗口隐藏且员工在后台完成一次回复', async ({ runtime }) => {
  const window = await mainWindow(runtime)
  try { expect(await runtime.app.evaluate((_electron, window) => ({ visible: window.isVisible(), destroyed: window.isDestroyed() }), window)).toEqual({ visible: false, destroyed: false }) } finally { await window.dispose() }
  const fixture = fixtures.get(runtime)!
  await runtime.page.evaluate(id => globalThis.window.boai.request('sendMessage', { conversationId: id, content: '单聊统一交互验收', mentionIds: [], requestId: 'hidden-reply-once' }), fixture.direct.id)
  await expect.poll(async () => runtime.page.evaluate(async id => (await globalThis.window.boai.request('getConversation', { id })).messages.filter(message => message.senderType === 'agent' && message.content.includes('研究员：单聊和群聊保持一致') && message.status === 'completed').length, fixture.direct.id)).toBe(1)
  expect(await identity(runtime)).toEqual(identities.get(runtime))
  await runtime.reviewData('隐藏运行接收与回复', { visible: false, before: identities.get(runtime), after: await identity(runtime), employeeReplies: 1, modelFixture: true, realFeishu: false })
})
Then('多次重新打开保持同一主窗口和运行进程', async ({ runtime }) => {
  await runtime.app.evaluate(({ app }) => { app.emit('activate'); app.emit('second-instance', {}, [], ''); app.emit('activate') })
  const window = await mainWindow(runtime)
  try { await expect.poll(() => runtime.app.evaluate((_electron, window) => window.isVisible(), window)).toBe(true) } finally { await window.dispose() }
  expect(await identity(runtime)).toEqual(identities.get(runtime))
  await expect(runtime.page.getByRole('textbox', { name: '消息内容' })).toHaveText('后台关闭保留的草稿')
  expect(runtime.errors).toEqual([])
  await runtime.reviewNativeCheckpoint('重开后同一草稿')
})
Then('运行设置显示开发环境开机启动不可操作', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await runtime.page.getByRole('menuitem', { name: '设置', exact: true }).click()
  await runtime.page.getByRole('button', { name: '运行选项', exact: true }).click()
  await expect(runtime.page.getByRole('button', { name: '运行选项', exact: true })).toHaveAttribute('aria-current', 'page')
  await expect(runtime.page.getByRole('switch', { name: '关闭窗口后继续运行' })).toBeChecked()
  await expect(runtime.page.getByRole('switch', { name: '开机启动', exact: true })).toBeDisabled()
  await runtime.page.getByRole('button', { name: '开机启动说明', exact: true }).hover()
  await expect(runtime.page.getByText('安装应用后可设置开机启动，开发模式不会修改系统登录项。')).toBeVisible()
  await runtime.page.getByRole('heading', { name: '运行选项', exact: true }).hover()
  expect(await runtime.page.getByRole('switch').evaluateAll(switches => switches.every(control => { const rect = control.getBoundingClientRect(); return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight }))).toBe(true)
  await runtime.reviewNativeCheckpoint('运行选项')
})
Given('已启动隔离的后台设置桌面', async ({ runtime }) => { await runtime.start() })
When('关闭后台选项并重新启动应用', async ({ runtime }) => {
  const settings = await runtime.page.evaluate(() => window.boai.request('getDesktopSettings', undefined))
  await runtime.page.evaluate(settings => window.boai.request('updateDesktopSettings', { patch: { runInBackground: false }, expectedRevision: settings.revision }), settings)
  await runtime.restart()
})
Then('后台选项保留关闭且主窗口实际关闭', async ({ runtime }) => {
  expect((await runtime.page.evaluate(() => globalThis.window.boai.request('getDesktopSettings', undefined))).preferences.runInBackground).toBe(false)
  await runtime.reviewFile('后台关闭偏好原件', join(runtime.root, 'desktop-settings.json'), { required: true })
  const window = await mainWindow(runtime)
  try { await runtime.app.evaluate((_electron, window) => window.close(), window) } finally { await window.dispose() }
  await expect.poll(() => runtime.page.isClosed()).toBe(true)
  await runtime.close({ expectedWindowClosed: true })
})

When('反复隐藏重开切换设置并在后台处理消息', async ({ runtime }) => {
  test.setTimeout(Math.max(420_000, (idleSeconds() + 180) * 1000))
  const fixture = fixtures.get(runtime)!, page = runtime.page
  const cdp = await page.context().newCDPSession(page)
  const nativeWindow = await mainWindow(runtime)
  const cycle = async () => { await runtime.app.evaluate(({ app }, window) => { window.close(); app.emit('activate') }, nativeWindow) }
  const openSettings = async () => {
    await page.getByRole('button', { name: '我的菜单', exact: true }).click()
    await page.getByRole('menuitem', { name: '设置', exact: true }).click()
  }
  const settingsCycle = async () => {
    await page.getByRole('button', { name: '运行选项', exact: true }).click()
    await expect(page.getByRole('switch', { name: '关闭窗口后继续运行' })).toBeChecked()
    await page.getByRole('button', { name: '模型连接', exact: true }).click()
  }
  const message = async (index: number) => {
    await page.evaluate(({ id, index }) => window.boai.request('sendMessage', { conversationId: id, content: '单聊统一交互验收', mentionIds: [], requestId: `resource-message-${index}` }), { id: fixture.direct.id, index })
    await expect.poll(() => page.evaluate(async id => (await window.boai.request('getConversation', { id })).messages.filter(value => value.senderType === 'agent' && value.content.includes('研究员：单聊和群聊保持一致') && value.status === 'completed').length, fixture.direct.id)).toBe(index + 1)
  }
  const samples: ResourceSample[] = []
  try {
    await openSettings()
    for (let i = 0; i < 10; i++) { await cycle(); await settingsCycle() }
    for (let i = 0; i < 4; i++) await message(i)
    await page.waitForTimeout(1000)
    samples.push(await resourceSample(runtime, cdp))
    for (let batch = 0; batch < 4; batch++) {
      for (let i = 0; i < 50; i++) await cycle()
      for (let i = 0; i < 15; i++) await settingsCycle()
      await runtime.app.evaluate((_electron, window) => window.close(), nativeWindow)
      for (let i = 4 + batch * 6; i < 10 + batch * 6; i++) await message(i)
      await runtime.app.evaluate(({ app }) => app.emit('activate'))
      await page.waitForTimeout(500)
      samples.push(await resourceSample(runtime, cdp))
    }
    resourceSamples.set(runtime, samples)
    await runtime.reviewData('后台压力资源采样', { windowCycles: 210, settingsCycles: 70, messages: 28, gc: true, samples })
    await runtime.reviewNativeCheckpoint('压力完成后窗口仍可用')
  } finally { await nativeWindow.dispose(); await cdp.detach() }
})
Then('空闲采样的内存监听器和进程数量保持有界', async ({ runtime }) => {
  test.setTimeout(Math.max(420_000, (idleSeconds() + 180) * 1000))
  const samples = resourceSamples.get(runtime)!, cdp = await runtime.page.context().newCDPSession(runtime.page)
  const nativeWindow = await mainWindow(runtime)
  try {
    await runtime.app.evaluate((_electron, window) => window.close(), nativeWindow)
    const deadline = Date.now() + idleSeconds() * 1000
    let index = 0
    while (Date.now() < deadline) { await runtime.page.waitForTimeout(Math.min(15_000, deadline - Date.now())); samples.push(await resourceSample(runtime, cdp)); await runtime.reviewData(`后台空闲第${++index}次采样`, samples.at(-1)) }
    await runtime.app.evaluate(({ app }) => app.emit('activate'))
    await runtime.reviewData('后台完整资源结果', { samples, budgets: { postGcMainAndRendererGrowthMb: 16, perProcessResidentGrowthMb: 64, idleCpuMedianPercent: 5 }, longTermCertified: false })
    try { verifyResources(samples) }
    catch (error) {
      try { await recordResourceFailure(runtime, cdp) }
      catch (diagnosticError) { await runtime.reviewData('资源失败后的诊断错误', { error: String(diagnosticError), originalFailureRetained: true }).catch(() => {}) }
      throw error
    }
    expect(runtime.errors).toEqual([])
  } finally { await nativeWindow.dispose(); await cdp.detach() }
})
