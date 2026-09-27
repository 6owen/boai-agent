/*
 * [INPUT]: 隔离 Electron、群聊和员工详情、原生窗口尺寸与未保存守卫。
 * [OUTPUT]: 内容宽度标签、上下分割线精确对齐、拖拽/缩放、标题截断、嵌套返回与关闭保存验证。
 * [POS]: 右侧配置面板从独立标题行迁入窗口 header 的桌面回归。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { test, expect, _electron as electron } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

test('detail title lives in the window header and stays aligned with its guarded content', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-detail-header-'))
  const app = await electron.launch({ args: [resolve('.')], env: { ...process.env, BOAI_DATA_DIR: root, NODE_ENV: 'test' } })
  const page = await app.firstWindow(), errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  try {
    await expect(page.locator('.app-shell')).toBeVisible()
    const title = '设计协作群 · 讨论产品体验与界面细节，让每一位数字同事都能清晰协作'
    await page.evaluate(async title => {
      await window.boai.request('createConversation', { title, kind: 'group', agentIds: ['researcher', 'writer'], mode: 'natural', sharedKnowledgeIds: [] })
      const appearance = await window.boai.request('getAppearance', undefined)
      await window.boai.request('updateAppearance', { patch: { mode: 'light' }, expectedRevision: appearance.revision })
    }, title)
    await page.locator('.conversation-item').filter({ hasText: title }).click()
    const trigger = page.getByRole('button', { name: '群聊设置', exact: true })
    await trigger.click()
    const header = page.locator('.global-toolbar .detail-header'), panel = page.locator('.detail-panel')
    await expect(header.getByRole('heading', { name: title, exact: true })).toBeFocused()
    await expect(panel.locator('.detail-header')).toHaveCount(0)
    const aligned = async () => {
      await expect.poll(() => page.evaluate(() => {
        const header = document.querySelector('.toolbar-detail')!.getBoundingClientRect()
        const panel = document.querySelector('.detail-panel')!.getBoundingClientRect()
        const content = document.querySelector('.detail-content')!.getBoundingClientRect()
        const divider = document.querySelector('.detail-resizer')!.getBoundingClientRect()
        const boundary = divider.width ? divider.left : panel.left
        const frameBorder = parseFloat(getComputedStyle(document.querySelector('.content-frame')!).borderTopWidth)
        return Math.max(Math.abs(header.left - boundary), Math.abs(header.right - panel.right), Math.abs(header.bottom + frameBorder - panel.top), Math.abs(content.top - panel.top))
      })).toBeLessThanOrEqual(0.1)
      await expect(header.getByRole('button', { name: '关闭详情', exact: true })).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    }
    for (const width of [1280, 1124, 1100, 1099, 900, 899, 760]) {
      await app.evaluate(({ BrowserWindow }, width) => BrowserWindow.getAllWindows()[0].setContentSize(width, 720), width)
      await aligned()
    }
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1247, 720))
    for (const zoom of [0.9, 1.25, 1.5, 1]) {
      await app.evaluate(({ BrowserWindow }, zoom) => BrowserWindow.getAllWindows()[0].webContents.setZoomFactor(zoom), zoom)
      await aligned()
    }
    await page.getByRole('button', { name: '显示或隐藏会话列表' }).click()
    await aligned()
    await page.getByRole('button', { name: '显示或隐藏会话列表' }).click()
    await aligned()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1280, 720))
    const divider = page.getByRole('separator', { name: '调整详情宽度', exact: true })
    await divider.focus(); await divider.press('Shift+ArrowLeft'); await aligned()
    const edge = await divider.boundingBox()
    await page.mouse.move(edge!.x + edge!.width / 2, edge!.y + edge!.height / 2)
    await page.mouse.down(); await page.mouse.move(edge!.x - 25, edge!.y + edge!.height / 2); await page.mouse.up()
    await aligned()
    const titleBox = header.locator('.detail-tab-title')
    expect(await titleBox.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
    await panel.getByRole('textbox', { name: '群聊名称', exact: true }).fill('设计协作群')
    await expect(header).toContainText('未保存')
    await header.getByRole('button', { name: '关闭详情', exact: true }).click()
    await page.getByRole('button', { name: '继续编辑', exact: true }).click()
    await expect(panel.getByRole('textbox', { name: '群聊名称', exact: true })).toHaveValue('设计协作群')
    await header.getByRole('button', { name: '关闭详情', exact: true }).click()
    await page.getByRole('button', { name: '保存并退出', exact: true }).click()
    await expect(panel).toBeHidden(); await expect(trigger).toBeFocused()
    await trigger.click()
    await expect(header.getByRole('heading')).toHaveText('设计协作群')
    const tabWidth = (await header.locator('.detail-tab').boundingBox())!.width
    expect(tabWidth).toBeLessThan(180)
    expect((await header.boundingBox())!.width - tabWidth).toBeGreaterThan(100)
    await page.mouse.move(400, 300)
    await page.screenshot({ path: 'test-results/detail-header-light.png', animations: 'disabled' })
    await panel.locator('.group-member-grid').getByRole('button', { name: '研究员', exact: true }).click()
    await expect(header.getByRole('heading', { name: '研究员', exact: true })).toBeFocused()
    await panel.getByRole('textbox', { name: '职责简介', exact: true }).fill('未保存职责')
    await header.getByRole('button', { name: '返回上一级详情' }).click()
    await page.getByRole('button', { name: '放弃并退出', exact: true }).click()
    await expect(header.getByRole('heading')).toHaveText('设计协作群')
    await panel.locator('.group-member-grid').getByRole('button', { name: '研究员', exact: true }).click()
    await expect(panel.getByRole('textbox', { name: '职责简介', exact: true })).not.toHaveValue('未保存职责')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(760, 640))
    await page.evaluate(async () => { const appearance = await window.boai.request('getAppearance', undefined); await window.boai.request('updateAppearance', { patch: { mode: 'dark' }, expectedRevision: appearance.revision }) })
    await expect(page.locator('html')).toHaveClass(/dark/)
    await aligned()
    await expect.poll(() => panel.locator('.detail-content').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    const before = await header.boundingBox()
    await panel.locator('.detail-content').evaluate(el => { el.scrollTop = el.scrollHeight })
    expect(await header.boundingBox()).toEqual(before)
    await panel.locator('.detail-content').evaluate(el => { el.scrollTop = 0 })
    await page.evaluate(() => Promise.allSettled(document.getAnimations().map(animation => animation.finished)))
    await page.screenshot({ path: 'test-results/detail-header-dark-narrow.png', animations: 'disabled' })
    await page.keyboard.press('Escape')
    await expect(panel).toBeHidden(); await expect(header).toBeHidden(); await expect(trigger).toBeFocused()
    expect(errors).toEqual([])
  } finally {
    await page.evaluate(() => window.boai.request('setUnsavedChanges', { dirty: false })).catch(() => {})
    await app.close(); await rm(root, { recursive: true, force: true })
  }
})
