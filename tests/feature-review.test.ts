/*
 * [OUTPUT]: 升级批次的旧包/当前入口来源单独显示，不能误标全批开发或同一新包；原两类和缺省报告保持。
 * [OUTPUT]: 必需原件归档核对期望hash，失败显式拒绝且不毒化后续留证队列。
 * [OUTPUT]: 附加Playwright报告仅在常规HTML文件存在时提供链接；缺失、目录和符号链接不会生成失效入口。
 * [OUTPUT]: 报告按逐场景来源聚合，真实/离线/混合/未知以及旧批次兼容分别验证，单项声明优先于批次。
 * [INPUT]: 可选留证器、固定PNG原件与模拟采集元数据/失败。
 * [OUTPUT]: 原生PNG同源留证/失败不回退；逐场景明确模型声明，不能从全局真实测试开关误标另一离线场景。
 * [POS]: 留证传输与归档意图测试，不证明Electron实际整幅截取；真实原生采集由布局BDD另验。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header及所属.folder.md。
 */
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
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
  return { root, review, directory, manifest, info }
}

test('required originals reject changed bytes before archiving and still allow later evidence', async () => {
  const { root, review, directory, manifest } = await fixture()
  const path = join(root, 'published.txt'), original = '原已发布字节', changed = '外部修改字节'
  const expectedSha256 = createHash('sha256').update(original).digest('hex')
  await writeFile(path, changed)
  await expect(review.file('必须保留固定原版', path, { required: true, expectedSha256 })).rejects.toThrow('原件hash')
  expect((await manifest()).evidence).toEqual([])
  expect((await manifest()).gaps).toMatchObject([{ label: '必须保留固定原版' }])
  await writeFile(path, original)
  await review.file('随后原件仍可独立归档', path, { required: true, expectedSha256 })
  const result = await manifest()
  expect(result.evidence).toHaveLength(1)
  expect(await readFile(join(directory, result.evidence[0].path), 'utf8')).toBe(original)
  expect(result.evidence[0].sha256).toBe(expectedSha256)
})

test('required missing originals fail explicitly while optional evidence retains a gap', async () => {
  const { root, review, manifest } = await fixture()
  const path = join(root, 'missing.txt')
  await expect(review.file('必需原件缺失', path, { required: true })).rejects.toThrow()
  await expect(review.file('可选材料缺失', path)).resolves.toBeUndefined()
  await review.data('后续证据仍可保存', { actual: '未用其他文件填补' })
  const result = await manifest()
  expect(result.gaps).toHaveLength(2)
  expect(result.evidence).toMatchObject([{ kind: 'data', label: '后续证据仍可保存' }])
})

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

test('records a real provider only for the scenario that explicitly declares it', async () => {
  vi.stubEnv('BOAI_TEST_REAL_CODEX', '1')
  const { review, manifest, info } = await fixture()
  expect((await manifest()).modelMode).toBe('offline-protocol-or-fixture')
  info.annotations.push({ type: 'model-mode', description: 'real-provider' })
  await review.nativeCheckpoint('本场真实来源', async () => ({ png, metadata }))
  expect((await manifest()).modelMode).toBe('real-provider')
})

test.each(['missing', 'file', 'directory', 'symlink'])('optional Playwright report links require an actual regular file: %s', async kind => {
  const root = await mkdtemp(join(tmpdir(), 'boai-review-report-link-')); cleanup.push(root)
  const input = join(root, 'input'), output = join(root, 'report')
  const reportPath = join(input, 'playwright-report', 'index.html')
  await mkdir(join(input, 'playwright-report'), { recursive: true })
  await writeFile(join(input, 'playwright-results.json'), JSON.stringify({ stats: { startTime: '2026-10-06T00:00:00Z' }, suites: [] }))
  if (kind === 'file') await writeFile(reportPath, '<!doctype html><title>Actual report</title>')
  if (kind === 'directory') await mkdir(reportPath)
  if (kind === 'symlink') {
    const unrelated = join(root, 'unrelated.html')
    await writeFile(unrelated, '<!doctype html><title>Other report</title>')
    await symlink(unrelated, reportPath)
  }
  await promisify(execFile)(process.execPath, [resolve('scripts/generate-feature-review.mjs'), '--input', input, '--output', output])
  const result = JSON.parse(await readFile(join(output, 'checks.json'), 'utf8'))
  const actualPath = kind === 'file' ? await realpath(reportPath) : undefined
  expect(result.playwrightReport).toEqual(actualPath ? { path: actualPath, href: pathToFileURL(actualPath).href } : undefined)
  expect(result.humanReview).toBe('pending')
})

test.each([
  { modes: ['real-provider'], expected: 'real-provider' },
  { modes: ['offline-protocol-or-fixture'], expected: 'offline-protocol' },
  { modes: ['real-provider', 'offline-protocol-or-fixture'], expected: 'mixed' },
  { modes: [undefined], expected: 'unverified' },
  { modes: [undefined], registration: 'real-provider', expected: 'real-provider' },
  { modes: ['offline-protocol-or-fixture'], registration: 'real-provider', expected: 'offline-protocol' },
])('report preserves actual per-scenario model declarations: $expected / $modes / $registration', async ({ modes, expected, registration }) => {
  const root = await mkdtemp(join(tmpdir(), 'boai-review-report-')); cleanup.push(root)
  const input = join(root, 'input'), output = join(root, 'report'), stamp = '2026-10-05T00:00:00Z'
  await mkdir(input)
  const specs = []
  for (const [index, modelMode] of modes.entries()) {
    const id = `case-${index}`, directory = join(input, 'scenarios', id)
    await mkdir(directory, { recursive: true })
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ testId: id, title: id, location: { file: 'codex-employee.feature' }, retry: 0, completedAt: stamp, modelMode, evidence: [], traces: [] }))
    specs.push({ id, title: id, file: 'codex-employee.feature', tests: [{ testId: id, status: 'expected', expectedStatus: 'passed', results: [{ retry: 0, status: 'passed', startTime: stamp, duration: 1 }] }] })
  }
  await writeFile(join(input, 'playwright-results.json'), JSON.stringify({ stats: { startTime: stamp }, suites: [{ specs }] }))
  if (registration) await writeFile(join(input, 'registration.json'), JSON.stringify({ desktopModelMode: registration }))
  await promisify(execFile)(process.execPath, [resolve('scripts/generate-feature-review.mjs'), '--input', input, '--output', output])
  const result = JSON.parse(await readFile(join(output, 'checks.json'), 'utf8'))
  expect(result.reportGeneratorSha256).toBe(createHash('sha256').update(await readFile(resolve('scripts/generate-feature-review.mjs'))).digest('hex'))
  const html = await readFile(join(output, 'index.html'), 'utf8')
  const script = html.match(/<script>([\s\S]+)<\/script>/)![1]
  expect(() => new Function(script)).not.toThrow()
  expect(result.desktopModelMode).toBe(expected)
  expect(result.cases.map((item: { attempts: { modelMode: string }[] }) => item.attempts[0].modelMode)).toEqual(modes.map(mode => (mode ?? registration) === 'real-provider' ? 'real-provider' : mode === 'offline-protocol-or-fixture' ? 'offline-protocol' : 'unverified'))
  expect(result.humanReview).toBe('pending')
  if (expected === 'mixed' || expected === 'unverified') expect(result.modelNote).toContain('不能扩大为全批真实')
})

test.each([
  { mode: undefined, label: '当前 macOS 开发构建' },
  { mode: 'development', label: '当前 macOS 开发构建' },
  { mode: 'packaged', label: '当前 macOS 应用包' },
  { mode: 'mixed-version', label: '旧应用包至当前入口升级' },
])('report preserves actual desktop upgrade provenance without changing prior modes: $mode', async ({ mode, label }) => {
  const root = await mkdtemp(join(tmpdir(), 'boai-review-upgrade-')); cleanup.push(root)
  const input = join(root, 'input'), output = join(root, 'report')
  await mkdir(input)
  await writeFile(join(input, 'playwright-results.json'), JSON.stringify({ stats: { startTime: '2026-10-07T00:00:00Z' }, suites: [] }))
  if (mode) await writeFile(join(input, 'registration.json'), JSON.stringify({ desktopMode: mode }))
  await promisify(execFile)(process.execPath, [resolve('scripts/generate-feature-review.mjs'), '--input', input, '--output', output])
  const result = JSON.parse(await readFile(join(output, 'checks.json'), 'utf8'))
  expect(result.desktopMode).toContain(label)
  expect(result.desktopModelMode).toBe('unverified')
  expect(result.humanReview).toBe('pending')
  if (mode === 'mixed-version') {
    expect(result.desktopMode).not.toMatch(/当前 macOS (开发构建|应用包)/)
    expect(result.limitations.join('\n')).toContain('各次入口、版本和构建身份以原场景记录为准')
    expect(result.limitations.join('\n')).toContain('不能据此认定全部启动使用同一版本')
    expect(result.limitations.join('\n')).toContain('未验证 DMG 安装、签名公证或其他平台')
  }
})
