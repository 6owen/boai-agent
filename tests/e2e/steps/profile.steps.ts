/*
 * [INPUT]: 生产个人资料/聊天 UI、真实 IPC 与隔离 Desktop。
 * [OUTPUT]: 通过本人菜单进入资料、损坏旧图片回退到可解码的内置头像；编辑/联动/重启、未保存/冲突、运行中保存及主题缩放验收。
 * [POS]: profile.feature 的业务步骤，协议服务在 support/profile。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { test } from '../support/test'
import { cancelProfileWindowClose, prepareProfile } from '../support/profile'
import type { Desktop } from '../support/desktop'

const states = new WeakMap<Desktop, Awaited<ReturnType<typeof prepareProfile>> & { uploaded?: string }>()
const { Given, When, Then } = createBdd(test)
const openProfile = async (runtime: Desktop) => { await runtime.page.getByRole('button', { name: '我的菜单', exact: true }).click(); await runtime.page.getByRole('menuitem', { name: '个人资料', exact: true }).click(); await expect(runtime.page.getByRole('heading', { name: '个人资料', exact: true })).toBeVisible() }
Given('个人资料使用隔离的旧历史桌面', async ({ runtime }) => {
  states.set(runtime, await prepareProfile(runtime)); await openProfile(runtime)
  const fallback = runtime.page.locator('.profile-identity .user-avatar img')
  await expect(fallback).toHaveJSProperty('naturalWidth', 320)
  await fallback.evaluate(image => (image as HTMLImageElement).decode())
})
Given('个人资料使用隔离的大历史桌面', async ({ runtime }) => { states.set(runtime, await prepareProfile(runtime, true)); await openProfile(runtime) })
When('从设置搜索进入资料并保存名称用户名和上传头像', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('textbox', { name: '搜索设置' }).fill('个人资料')
  await page.getByRole('navigation', { name: '设置分类' }).getByRole('button', { name: '个人资料' }).click()
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '编辑个人资料' })
  await expect(dialog.getByRole('textbox', { name: '显示名称' })).toBeFocused()
  await dialog.getByRole('textbox', { name: '显示名称' }).fill('Ada 王')
  await dialog.getByRole('textbox', { name: '用户名', exact: true }).fill('ada_wang')
  await dialog.getByRole('button', { name: '更换个人头像' }).click()
  const bad = page.waitForEvent('filechooser'); await page.getByRole('button', { name: '上传本地图片' }).click(); await (await bad).setFiles({ name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('broken') })
  await expect(page.getByRole('alert')).toContainText('无法读取这张图片')
  const image = await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 32; const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#4477cc'; ctx.fillRect(0, 0, 64, 32); return canvas.toDataURL().split(',')[1] })
  const choosing = page.waitForEvent('filechooser'); await page.getByRole('button', { name: '上传本地图片' }).click(); await (await choosing).setFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') })
  await expect(dialog.locator('.user-avatar img')).toHaveAttribute('src', /^data:image\/png;base64,/)
  states.get(runtime)!.uploaded = (await dialog.locator('.user-avatar img').getAttribute('src'))!
  await dialog.getByRole('button', { name: '保存', exact: true }).click(); await expect(dialog).toBeHidden()
  await expect(page.locator('.profile-identity h1')).toHaveText('Ada 王'); await expect(page.locator('.profile-identity p')).toHaveText('@ada_wang')
  await expect(page.locator('.rail-bottom .user-avatar img')).toHaveAttribute('src', states.get(runtime)!.uploaded!)
})
Then('单聊群聊人工补充与外部历史使用同一个头像', async ({ runtime }) => {
  const page = runtime.page, state = states.get(runtime)!
  for (const [kind, chat] of Object.entries(state.chats)) {
    await page.getByRole('button', { name: '会话', exact: true }).first().click()
    await page.locator('.conversation-item').filter({ hasText: chat.title }).first().click()
    const message = page.locator(`#message-${kind}-human`), avatar = message.locator('.user-avatar')
    await expect(avatar).toBeVisible(); await expect(avatar.locator('img')).toHaveAttribute('src', state.uploaded!)
    const boxes = await message.evaluate(element => ({ avatar: element.querySelector('.message-avatar')!.getBoundingClientRect().x, body: element.querySelector('.message-main,.message-content-space')!.getBoundingClientRect().x }))
    expect(boxes.avatar).toBeGreaterThan(boxes.body)
    const before = await page.evaluate(async id => (await window.boai.request('getConversation', { id })).messages.find(message => message.senderId === 'user')!.senderName, chat.id)
    expect(before).toBe('旧名称')
  }
})
Then('自动触发与连续消息仍保留各自的身份布局', async ({ runtime }) => {
  const page = runtime.page, state = states.get(runtime)!
  await page.locator('.conversation-item').filter({ hasText: state.chats.group.title }).first().click()
  await expect(page.locator('#message-group-auto .automation-avatar')).toHaveText('定')
  await expect(page.locator('#message-group-supplement .user-avatar img')).toHaveAttribute('src', state.uploaded!)
  await expect(page.locator('#message-group-continued')).toHaveClass(/message-continuation/)
  await page.locator('#message-group-human').hover()
  await expect(page.locator('#message-group-human').getByRole('button', { name: '引用 你 的消息' })).toBeVisible()
})
Then('个人资料在重启后保留且资料取消不会修改历史', async ({ runtime }) => {
  const state = states.get(runtime)!
  await runtime.restart(); await openProfile(runtime)
  await expect(runtime.page.locator('.profile-identity .user-avatar img')).toHaveAttribute('src', state.uploaded!)
  await runtime.page.getByRole('button', { name: '编辑', exact: true }).click()
  await runtime.page.getByRole('textbox', { name: '显示名称' }).fill('放弃的名称')
  await runtime.page.getByRole('button', { name: '取消', exact: true }).click()
  await runtime.page.getByRole('button', { name: '放弃并退出' }).click()
  await expect(runtime.page.locator('.profile-identity h1')).toHaveText('Ada 王')
  await expect(runtime.page.getByRole('button', { name: '编辑', exact: true })).toBeFocused()
  expect(runtime.errors).toEqual([])
})
Then('个人资料支持关闭守卫输入校验和冲突恢复', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '编辑', exact: true }).click()
  await page.getByRole('textbox', { name: '显示名称' }).fill('我的草稿')
  await expect.poll(async () => (await page.evaluate(() => window.boai.request('snapshot', undefined))).userProfile?.revision).toBe(1)
  expect(await cancelProfileWindowClose(runtime)).toBe('有未保存的修改')
  await page.keyboard.press('Escape'); await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: '继续编辑' }).click(); await expect(page.getByRole('textbox', { name: '显示名称' })).toHaveValue('我的草稿')
  await page.getByRole('textbox', { name: '用户名', exact: true }).fill('用户名不合法')
  await page.getByRole('button', { name: '保存', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('用户名需要')
  await page.evaluate(async () => { const saved = (await window.boai.request('snapshot', undefined)).userProfile!; await window.boai.request('updateUserProfile', { expectedRevision: saved.revision, displayName: '其他已保存名称', username: null, avatar: { kind: 'text' } }) })
  await expect(page.getByRole('textbox', { name: '显示名称' })).toHaveValue('我的草稿')
  await expect(page.getByRole('button', { name: '保存', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: '重新载入已保存资料' }).click(); await page.getByRole('button', { name: '放弃并退出' }).click()
  await page.getByRole('button', { name: '编辑', exact: true }).click(); await expect(page.getByRole('textbox', { name: '显示名称' })).toHaveValue('其他已保存名称')
  await page.getByRole('textbox', { name: '显示名称' }).fill('最终资料')
  await page.keyboard.press('Escape'); await page.getByRole('button', { name: '保存并退出' }).click()
  await expect(page.getByRole('dialog', { name: '编辑个人资料' })).toBeHidden(); await expect(page.locator('.profile-identity h1')).toHaveText('最终资料')
})
Then('编辑个人资料时运行和输入草稿保持且用量可核对', async ({ runtime }) => {
  const page = runtime.page, state = states.get(runtime)!; state.model.hold = true
  await page.getByRole('button', { name: '会话', exact: true }).first().click(); await page.locator('.conversation-item').filter({ hasText: state.chats.direct.title }).first().click()
  await page.evaluate(async id => { await window.boai.request('sendMessage', { conversationId: id, content: '你好，请回复', mentionIds: [], requestId: 'profile-live' }) }, state.chats.direct.id)
  await expect.poll(() => state.model.started).toBe(true)
  const composer = page.getByRole('textbox', { name: '消息内容', exact: true }); await composer.fill('我的未发草稿')
  await openProfile(runtime); await page.getByRole('button', { name: '编辑', exact: true }).click(); await page.getByRole('textbox', { name: '显示名称' }).fill('运行中改名')
  await page.getByRole('button', { name: '更换个人头像' }).click(); await page.getByRole('button', { name: '恢复默认头像' }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click(); await expect(page.getByRole('dialog', { name: '编辑个人资料' })).toBeHidden()
  state.model.hold = false; state.model.release()
  await page.getByRole('button', { name: '会话', exact: true }).first().click(); await expect(composer).toHaveValue('我的未发草稿')
  await expect(page.locator('.message-row.agent')).toContainText('当前运行继续完成')
  await expect.poll(async () => (await page.evaluate(id => window.boai.request('getConversation', { id }), state.chats.direct.id)).runs.every(run => ['completed', 'failed'].includes(run.status))).toBe(true)
  await openProfile(runtime)
  await expect.poll(async () => { const date = new Date().toISOString().slice(0, 10); return (await page.evaluate(query => window.boai.request('getProfileActivity', query), { from: date, to: date, timezone: 'UTC' })).totalTokens }).toBe(state.model.calls * 15)
  const detail = await page.evaluate(id => window.boai.request('getConversation', { id }), state.chats.direct.id); expect(detail.workItems ?? []).toHaveLength(0)
  await page.getByRole('button', { name: '每周', exact: true }).click(); await expect(page.locator('.profile-chart')).toBeVisible()
  await page.getByRole('button', { name: '累计', exact: true }).click(); await expect(page.locator('.profile-activity')).toContainText('区间累计')
})
Then('个人资料通过浅深色窗口缩放和键盘图表验收', async ({ runtime }) => {
  const page = runtime.page
  await expect(page.locator('.profile-metrics>div')).toHaveCount(5)
  await expect(page.locator('.profile-insights')).toContainText('最常用的技能')
  for (const mode of ['light', 'dark'] as const) for (const width of [760, 1124, 1440]) for (const zoom of [1, 1.25, 2]) {
    await page.evaluate(async mode => { const current = await window.boai.request('getAppearance', undefined); await window.boai.request('updateAppearance', { patch: { mode }, expectedRevision: current.revision }) }, mode)
    await runtime.app.evaluate(({ BrowserWindow }, zoom) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom), zoom)
    await page.setViewportSize({ width, height: 1050 })
    expect(await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())).toBe(zoom)
    if (width === 1440 && zoom === 1) expect(await page.locator('.profile-metrics').evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length)).toBe(5)
    await expect(page.getByRole('button', { name: '编辑', exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    expect(await page.locator('.profile-document').evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
    if (width === 1440 && zoom === 1 || width === 760 && zoom === 2) await page.screenshot({ path: test.info().outputPath(`profile-${mode}-${width}-${zoom}.png`) })
  }
  await runtime.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(1))
  await page.setViewportSize({ width: 1124, height: 900 })
  await page.locator('.profile-day').last().focus(); await page.keyboard.press('ArrowLeft')
  await expect(page.locator('.profile-day').nth(await page.locator('.profile-day').count() - 8)).toBeFocused()
  await page.locator('.profile-text-data summary').click(); await expect(page.getByRole('table')).toBeVisible()
  expect(runtime.errors).toEqual([])
})
