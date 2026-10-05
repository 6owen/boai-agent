/*
 * [INPUT]: 可选留证器、固定PNG原件与模拟采集元数据/失败。
 * [OUTPUT]: 原生PNG逐字节/hash保存、实际IHDR尺寸/窗口zoom元数据同源保留，原生失败显性留缺口且不回退普通截图；普通Playwright源独立标注。
 * [POS]: 留证传输与归档意图测试，不证明Electron实际整幅截取；真实原生采集由布局BDD另验。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header及所属.folder.md。
 */
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import type { Page, TestInfo } from '@playwright/test'
import { FeatureReview, type NativeReviewScreenshot } from './e2e/support/feature-review'

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64')
const metadata: NativeReviewScreenshot['metadata'] = { method: 'Electron.webContents.capturePage()', rect: null, pixelTransform: 'none', native: { windowId: 7, webContentsId: 11, contentSize: [760, 800], zoomFactor: 2 }, renderer: { width: 380, height: 400, devicePixelRatio: 4 }, image: { scaleFactors: [2], pngScaleFactor: 2 } }
const cleanup: string[] = []
afterEach(async () => { vi.unstubAllEnvs(); for (const root of cleanup.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-review-test-')); cleanup.push(root)
  vi.stubEnv('BOAI_REVIEW_RUN_DIR', join(root, 'review'))
  const info = { testId: 'review-source', title: '原生截图传输', titlePath: ['原生截图传输'], file: 'fixture.feature', line: 1, column: 1, project: { name: 'desktop' }, retry: 0, repeatEachIndex: 0, workerIndex: 0, status: 'passed', expectedStatus: 'passed', errors: [], annotations: [], attach: vi.fn(async () => {}) } as unknown as TestInfo
  const review = (await FeatureReview.create(root, info))!
  const directory = join(root, 'review', 'scenarios', (await readdir(join(root, 'review', 'scenarios')))[0])
  const manifest = async () => JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
  return { review, directory, manifest, info }
}

test('native checkpoint preserves exact PNG bytes and separately archives the same capture identity and dimensions', async () => {
  const { review, directory, manifest } = await fixture()
  await review.nativeCheckpoint('原生缩放关键帧', async () => ({ png, metadata }))
  const result = await manifest(), screenshot = result.evidence.find((item: { kind: string }) => item.kind === 'screenshot'), record = result.evidence.find((item: { kind: string }) => item.kind === 'data')
  expect(await readFile(join(directory, screenshot.path))).toEqual(png)
  expect(screenshot.sha256).toBe(createHash('sha256').update(png).digest('hex'))
  expect(screenshot.source).toBe(metadata.method)
  expect(screenshot.nativeCapture).toEqual({ ...metadata, pngDimensions: { width: 1, height: 1 } })
  const captured = JSON.parse(await readFile(join(directory, record.path), 'utf8'))
  expect(captured).toEqual({ ...metadata, pngDimensions: { width: 1, height: 1 }, pngBytes: png.length, pngSha256: screenshot.sha256 })
  expect(result.gaps).toEqual([])
})

test('native capture failure stays an explicit evidence gap without substituting a Playwright crop', async () => {
  const { review, manifest, info } = await fixture()
  await review.nativeCheckpoint('原生关键帧失败', async () => { throw new Error('实际原生窗口已关闭') })
  expect((await manifest()).evidence).toEqual([])
  expect((await manifest()).gaps).toMatchObject([{ label: '原生关键帧失败', reason: '实际原生窗口已关闭' }])
  expect(info.attach).not.toHaveBeenCalled()
})

test('ordinary page screenshots remain separately identified instead of claiming native window coverage', async () => {
  const { review, manifest } = await fixture()
  const page = { isClosed: () => false, screenshot: vi.fn(async () => png), viewportSize: () => null } as unknown as Page
  await review.checkpoint('普通页面关键帧', page)
  expect(page.screenshot).toHaveBeenCalledExactlyOnceWith({ timeout: 5000 })
  expect((await manifest()).evidence[0]).toMatchObject({ source: 'Playwright.page.screenshot()', viewport: null })
  expect((await manifest()).evidence[0].nativeCapture).toBeUndefined()
})
