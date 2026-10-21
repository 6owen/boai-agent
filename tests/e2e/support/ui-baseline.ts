/*
 * [INPUT]: 固定UI场景、真实Electron版本、期望图hash与runner环境身份。
 * [OUTPUT]: 绑定实际截图page的原生窗口并核主屏工作区/全部显示器缩放；缺基线/错环境拒绝，CI禁止写基线。
 * [POS]: UI回归截图支撑；只读比较不修改产品页面或现有基线。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, type TestInfo } from '@playwright/test'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Desktop } from './desktop'
import contract from '../baselines/contract.json' with { type: 'json' }
// @ts-expect-error Shared plain Node CLI exports the deterministic comparison contract hash.
import { baselineContractHash } from '../../../scripts/ui-regression.mjs'
// @ts-expect-error Shared plain Node policy has no declaration file.
import { uiProfile, assertCaptureMode, readUiBaseline } from '../../../scripts/ui-profiles.mjs'

export async function compareUiBaseline(runtime: Desktop, caseId: string, info: TestInfo) {
  if (!process.env.BOAI_UI_ENVIRONMENT) throw new Error('请通过pnpm test:ui运行，缺少环境核对')
  const environment = JSON.parse(process.env.BOAI_UI_ENVIRONMENT) as { electron: string; locale: string; timezone: string; displays: unknown[] }
  const actual = await runtime.app.evaluate(({ app }) => ({ electron: process.versions.electron, chrome: process.versions.chrome, packaged: app.isPackaged }))
  expect(actual.electron).toBe(environment.electron)
  expect(actual.packaged).toBe(false)
  const targetWindow = await runtime.app.browserWindow(runtime.page)
  const display = await runtime.app.evaluate(({ screen }, window) => {
    const primary = screen.getPrimaryDisplay()
    return {
      windowId: window.id, webContentsId: window.webContents.id,
      onPrimary: screen.getDisplayMatching(window.getBounds()).id === primary.id,
      displays: screen.getAllDisplays().map(item => ({ width: item.bounds.width, height: item.bounds.height, ...(item.id === primary.id ? { workWidth: item.workArea.width, workHeight: item.workArea.height } : {}), scaleFactor: item.scaleFactor, primary: item.id === primary.id })),
    }
  }, targetWindow).finally(() => targetWindow.dispose())
  expect(display.onPrimary).toBe(true)
  const displayRows = (items: unknown[]) => items.map(item => JSON.stringify(Object.entries(item as Record<string, unknown>).sort())).sort()
  expect(displayRows(display.displays)).toEqual(displayRows(environment.displays))
  const renderer = new URL(runtime.page.url()); renderer.search = ''; renderer.hash = ''
  expect(renderer.href).toBe(pathToFileURL(resolve('dist/renderer/index.html')).href)
  const candidate = process.env.BOAI_UI_CANDIDATE_DIR
  assertCaptureMode('check')
  const profile = uiProfile(process.cwd(), process.env.BOAI_UI_PROFILE)
  if (!candidate) {
    await readUiBaseline(profile, environment, caseId, baselineContractHash(contract, caseId))
  }
  const browser = await runtime.page.evaluate(() => ({ language: navigator.language, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, dpr: devicePixelRatio, width: innerWidth, height: innerHeight }))
  expect(browser.language).toBe(environment.locale)
  expect(browser.timezone).toBe(environment.timezone)
  await runtime.page.evaluate(async () => {
    await document.fonts.ready
    const animations = document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime))
    await Promise.all(animations.map(animation => { animation.finish(); return animation.finished.catch(() => {}) }))
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  })
  const scene = contract.cases.find(item => item.id === caseId)?.scene
  if (['chat', 'detail', 'preview'].includes(scene ?? '')) {
    // Match the baseline's explicit reading position after fonts and panel
    // resizing settle. Use real input rather than assigning scrollTop.
    await runtime.page.locator('.messages').hover()
    await runtime.page.mouse.wheel(0, 100_000)
    await expect.poll(() => runtime.page.locator('.messages').evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)).toBeLessThanOrEqual(1)
    await runtime.page.mouse.move(0, 0)
  }
  await info.attach('UI环境与页面', { body: JSON.stringify({ caseId, environment, actual, browser, display }), contentType: 'application/json' })
  if (caseId === 'chat-dark') {
    const session = await runtime.page.context().newCDPSession(runtime.page)
    try {
      await session.send('DOM.enable'); await session.send('CSS.enable')
      const { root } = await session.send('DOM.getDocument')
      const { nodeIds } = await session.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '.messages p, .messages strong, .chat-header span' })
      const fonts = []
      for (const nodeId of nodeIds.slice(0, 16)) {
        const used = await session.send('CSS.getPlatformFontsForNode', { nodeId })
        if (used.fonts.length) fonts.push({ html: (await session.send('DOM.getOuterHTML', { nodeId })).outerHTML.slice(0, 400), ...used })
      }
      const styles = await runtime.page.evaluate(() => ({
        body: { family: getComputedStyle(document.body).fontFamily, size: getComputedStyle(document.body).fontSize },
        language: document.documentElement.lang,
        fontFaces: [...document.fonts].map(font => ({ family: font.family, status: font.status, weight: font.weight })),
      }))
      const system = await runtime.app.evaluate(({ app }) => ({ languages: app.getPreferredSystemLanguages(), gpu: app.getGPUFeatureStatus() }))
      const diagnostic = { caseId, fonts, styles, system }
      await info.attach('UI实际字体', { body: JSON.stringify(diagnostic), contentType: 'application/json' })
      console.log('UI_FONT_DIAGNOSTICS ' + JSON.stringify(diagnostic))
    } finally { await session.detach() }
  }
  if (process.env.BOAI_UI_FAULT === 'layout') await runtime.page.addStyleTag({ content: '.chat-header { padding-left: 80px !important; }' })
  const selected = contract.cases.find(item => item.id === caseId) as { threshold?: number } | undefined
  await expect(runtime.page).toHaveScreenshot(`${caseId}.png`, { animations: 'disabled', caret: 'hide', scale: 'css', threshold: selected?.threshold ?? contract.threshold, maxDiffPixels: contract.maxDiffPixels })
}
