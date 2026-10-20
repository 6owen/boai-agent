/*
 * [INPUT]: 固定UI场景、真实Electron版本、期望图hash与runner环境身份。
 * [OUTPUT]: 缺基线/错环境拒绝及实际像素比较；显式本地布局故障演练，候选仅写独立目录。
 * [POS]: UI回归截图支撑；只读比较不修改产品页面或现有基线。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, type TestInfo } from '@playwright/test'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import type { Desktop } from './desktop'
import contract from '../baselines/contract.json' with { type: 'json' }
// @ts-expect-error Shared plain Node CLI exports the deterministic comparison contract hash.
import { baselineContractHash } from '../../../scripts/ui-regression.mjs'

export async function compareUiBaseline(runtime: Desktop, caseId: string, info: TestInfo) {
  if (!process.env.BOAI_UI_ENVIRONMENT) throw new Error('请通过pnpm test:ui运行，缺少环境核对')
  const environment = JSON.parse(process.env.BOAI_UI_ENVIRONMENT) as { electron: string; locale: string; timezone: string }
  const actual = await runtime.app.evaluate(({ app }) => ({ electron: process.versions.electron, chrome: process.versions.chrome, packaged: app.isPackaged }))
  expect(actual.electron).toBe(environment.electron)
  expect(actual.packaged).toBe(false)
  const renderer = new URL(runtime.page.url()); renderer.search = ''; renderer.hash = ''
  expect(renderer.href).toBe(pathToFileURL(resolve('dist/renderer/index.html')).href)
  const candidate = process.env.BOAI_UI_CANDIDATE_DIR
  if (candidate && process.env.CI) throw new Error('CI禁止候选基线写入')
  if (!candidate) {
    const manifest = JSON.parse(await readFile(resolve('tests/e2e/baselines/manifest.json'), 'utf8'))
    if (JSON.stringify(manifest.environment) !== JSON.stringify(environment)) throw new Error('UI基线环境不匹配；需要独立审阅环境迁移')
    const expected = manifest.cases[caseId]
    if (!expected) throw new Error(`缺少已接受UI基线：${caseId}`)
    if (baselineContractHash(contract, caseId) !== expected.contract) throw new Error(`UI比较合同变化，需重新审阅：${caseId}`)
    const bytes = await readFile(resolve('tests/e2e/baselines', `${caseId}.png`))
    if (createHash('sha256').update(bytes).digest('hex') !== expected.sha256) throw new Error(`UI基线hash不匹配：${caseId}`)
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
  await info.attach('UI环境与页面', { body: JSON.stringify({ caseId, environment, actual, browser }), contentType: 'application/json' })
  if (process.env.BOAI_UI_FAULT === 'layout') await runtime.page.addStyleTag({ content: '.chat-header { padding-left: 80px !important; }' })
  const selected = contract.cases.find(item => item.id === caseId) as { threshold?: number } | undefined
  await expect(runtime.page).toHaveScreenshot(`${caseId}.png`, { animations: 'disabled', caret: 'hide', scale: 'css', threshold: selected?.threshold ?? contract.threshold, maxDiffPixels: contract.maxDiffPixels })
}
