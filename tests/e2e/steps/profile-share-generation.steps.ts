/*
 * [INPUT]: 真实 Electron、个人资料分享、原版点阵 DOM 与 PNG 导出源。
 * [OUTPUT]: 页面不播放；动画层在弹窗内部，逐帧核对收尾期间外层不消失或重建；PNG 原件一致、重新打开/关闭清理及减少动态效果。
 * [POS]: profile-share-generation.feature 的视觉生命周期回归，不调用模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { writeFile } from 'node:fs/promises'
import { createBdd } from 'playwright-bdd'
import { expect } from '@playwright/test'
import { test } from '../support/test'

const { Given, When, Then } = createBdd(test)
Given('已启动隔离的个人资料分享桌面', async ({ runtime }) => {
  await runtime.start()
  await runtime.page.emulateMedia({ reducedMotion: 'no-preference' })
})
Then('打开个人资料页面直接显示且不播放点阵', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '我的菜单', exact: true }).click()
  await page.getByRole('menuitem', { name: '个人资料', exact: true }).click()
  await expect(page.getByLabel('个人活动摘要')).toBeVisible()
  await page.waitForTimeout(300)
  await expect(page.locator('.t-gen')).toHaveCount(0)
  await expect(page.locator('.profile-document [data-slot=skeleton]')).toHaveCount(0)
})
When('从个人资料打开分享', async ({ runtime }) => {
  await runtime.page.getByRole('button', { name: '分享', exact: true }).click()
})
Then('分享点阵铺满容器且动画不改变导出图片', async ({ runtime }) => {
  const page = runtime.page
  const cdp = await page.context().newCDPSession(page)
  await expect(page.locator('.t-gen')).toBeVisible()
  const continuity = await page.evaluateHandle(() => {
    const dialog = document.querySelector<HTMLElement>('.profile-share-dialog')!
    let frames = 0, after = 0
    const failures: string[] = []
    return { done: new Promise<{ frames: number; failures: string[] }>(resolve => {
      const sample = () => {
        const style = getComputedStyle(dialog), rect = dialog.getBoundingClientRect()
        const overlay = document.querySelector('.t-gen')
        if (!dialog.isConnected || document.querySelector('.profile-share-dialog') !== dialog) failures.push('shell replaced')
        if (style.opacity !== '1' || style.visibility !== 'visible' || style.display === 'none' || rect.width < innerWidth - 2 || rect.height < innerHeight - 2) failures.push('shell hidden or resized')
        if (style.animationName !== 'none') failures.push('shell animated')
        if (overlay && overlay.parentElement !== dialog) failures.push('drawing outside shell')
        frames++
        if (!overlay) after++
        if (after >= 30 || frames >= 600) resolve({ frames, failures })
        else requestAnimationFrame(sample)
      }
      sample()
    }) }
  })
  await page.waitForTimeout(400)
  const frame = await page.evaluate(() => {
    const overlay = document.querySelector('.t-gen'), body = document.querySelector('.profile-share-body')
    const dialog = document.querySelector<HTMLElement>('.profile-share-dialog')!
    const canvas = document.querySelector<HTMLCanvasElement>('.profile-share-card canvas')!
    return { overlay: overlay?.getBoundingClientRect().toJSON(), body: body?.getBoundingClientRect().toJSON(), dialogOpacity: getComputedStyle(dialog).opacity, dialogClip: dialog.style.clipPath, dialogFilter: dialog.style.filter, dots: overlay?.querySelectorAll('circle').length ?? 0, png: canvas.toDataURL('image/png') }
  })
  expect(frame.overlay).toBeDefined(); expect(frame.body).toBeDefined(); expect(frame.dots).toBeGreaterThan(100)
  expect(frame.dialogOpacity).toBe('1'); expect(frame.dialogClip).toBe(''); expect(frame.dialogFilter).toBe('')
  for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(frame.body[key] - frame.overlay[key])).toBeLessThan(1)
  try {
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    await writeFile(test.info().outputPath('share-dotted-generation.png'), Buffer.from(shot.data, 'base64'))
  } finally { await cdp.detach() }
  await expect(page.getByRole('button', { name: '关闭分享' })).toBeVisible()
  await expect(page.locator('.t-gen')).toHaveCount(0)
  const stable = await continuity.evaluate(async state => state.done)
  await continuity.dispose()
  expect(stable.frames).toBeGreaterThan(30)
  expect(stable.failures).toEqual([])
  await expect(page.getByRole('button', { name: '保存活动图片' })).toBeEnabled()
  expect(await page.locator('.profile-share-card canvas').evaluate(canvas => (canvas as HTMLCanvasElement).toDataURL('image/png'))).toBe(frame.png)
  // Capture the actual download source without opening Electron's native save dialog.
  await page.evaluate(() => {
    const original = HTMLAnchorElement.prototype.click
    const createObjectURL = URL.createObjectURL
    const sources = new Map<string, Blob>()
    URL.createObjectURL = function (source) {
      const url = createObjectURL.call(URL, source)
      if (source instanceof Blob) sources.set(url, source)
      return url
    }
    HTMLAnchorElement.prototype.click = function () {
      if (!this.download.startsWith('BoAI-活动-')) return original.call(this)
      HTMLAnchorElement.prototype.click = original
      URL.createObjectURL = createObjectURL
      const capture = document.createElement('output'); capture.id = 'share-download-capture'
      capture.hidden = true
      capture.dataset.filename = this.download; document.body.append(capture)
      const reader = new FileReader()
      reader.onload = () => { capture.textContent = String(reader.result) }
      reader.readAsDataURL(sources.get(this.href)!)
    }
  })
  await page.getByRole('button', { name: '保存活动图片' }).click()
  await expect(page.locator('#share-download-capture')).toHaveText(frame.png)
  await expect(page.locator('#share-download-capture')).toHaveAttribute('data-filename', /^BoAI-活动-.*\.png$/)
  await page.locator('#share-download-capture').evaluate(element => element.remove())
})
Then('再次打开分享重新播放且关闭后清理动画', async ({ runtime }) => {
  const page = runtime.page
  await page.getByRole('button', { name: '关闭分享' }).click()
  await page.getByRole('button', { name: '分享', exact: true }).click()
  await expect(page.locator('.t-gen')).toBeVisible()
  await page.getByRole('button', { name: '关闭分享' }).click()
  await expect(page.locator('.profile-share-dialog')).toHaveCount(0)
  await expect(page.locator('.t-gen')).toHaveCount(0)
  await expect(page.getByLabel('个人活动摘要')).toBeVisible()
})
Then('减少动态效果时分享图片直接可用', async ({ runtime }) => {
  const page = runtime.page
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: '分享', exact: true }).click()
  await expect(page.getByRole('button', { name: '保存活动图片' })).toBeEnabled()
  await page.waitForTimeout(400)
  await expect(page.locator('.t-gen')).toHaveCount(0)
  await expect(page.locator('.profile-share-card canvas')).toBeVisible()
  await page.getByRole('button', { name: '关闭分享' }).click()
})
