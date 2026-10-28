/*
 * [OUTPUT]: 2026-10-28保留旧截图工具及其回归，已退出自动PR工作流；现行Test/UI preview见第22组06。
 * [OUTPUT]: 分片报告核合同并标明局部范围，伪造片号保持失败。
 * [OUTPUT]: 原始四步计时独立汇总；不把缺失/负值或未登记步骤补为零，不改变视觉门禁。
 * [INPUT]: 代表Playwright结果、实际临时PNG、执行摘要及现有UI门禁。
 * [OUTPUT]: 视觉变化仅可待审阅；行为/环境/中断/缺图保持失败，报告不授门禁资格或修改基线。
 * [POS]: CI审阅反馈的基础设施回归；不启动Electron或真实模型。
 * [PROTOCOL]: 修改同步Header和tests/.folder.md。
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
// @ts-expect-error Plain Node ESM CLI intentionally has no declaration file.
import { classifyUiResults, generateUiReview, renderUiReview, reviewMarkdown } from '../scripts/ui-review-report.mjs'
// @ts-expect-error Shared plain Node CI gate.
import { validateUiSummary } from '../scripts/ci-result.mjs'

const id = 'settings-light', sha = 'a'.repeat(40)
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aO1sAAAAASUVORK5CYII=', 'base64')
const hash = createHash('sha256').update(png).digest('hex')
const mismatch = { message: `Error: expect(page).toHaveScreenshot(expected) failed\n  30334 pixels (ratio 0.03 of all image pixels) are different.\n  Snapshot: ${id}.png` }
const raw = (testPatch = {}, resultPatch = {}) => ({ errors: [], suites: [{ title: 'ui-regression.feature.spec.js', specs: [{ id: 'one', file: 'ui-regression.feature.spec.js', line: 1, title: `已登记界面 ${id} 保持行为布局和视觉基线`, tests: [{ expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0, duration: 10, errors: new Array<{ message: string }>(), attachments: new Array<{ path: string; contentType: string }>(), ...resultPatch }], ...testPatch }] }] }] })
const execution = (status = 'passed') => ({ status, cases: [id], errors: status === 'passed' ? [] : [`${id}: 未完整通过（unexpected）`, '测试进程退出：{"code":1,"signal":null}'], exit: { code: status === 'passed' ? 0 : 1, signal: null } })
const summary = (status = 'passed') => ({ ...execution(status), source: { commit: sha, dirty: false } })
let directory: string, input: string, output: string
const save = (path: string, value: unknown) => writeFile(path, JSON.stringify(value))
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'boai-ui-report-')); input = join(directory, 'input'); output = join(directory, 'review')
  await mkdir(join(input, 'compare'), { recursive: true })
  await save(join(input, 'summary.json'), summary())
  await save(join(input, 'compare/summary.json'), execution())
  await save(join(input, 'compare/playwright.json'), raw())
})
afterEach(async () => { await rm(directory, { recursive: true, force: true }) })

async function visualFailure() {
  const attachments = []
  for (const kind of ['expected', 'actual', 'diff']) {
    const path = join(input, 'compare', `${id}-${kind}.png`)
    await writeFile(path, png); attachments.push({ path, contentType: 'image/png' })
  }
  await save(join(input, 'summary.json'), summary('failed'))
  await save(join(input, 'compare/summary.json'), execution('failed'))
  const report = raw({ status: 'unexpected' }, { status: 'failed', errors: [mismatch], attachments })
  await save(join(input, 'compare/playwright.json'), report)
  return report
}

it('正常一次通过可以展示比较通过，报告本身不能提供合并资格', async () => {
  const result = await generateUiReview(input, output, [id])
  expect(result.status).toBe('passed')
  expect(() => validateUiSummary({ ui: { result: 'success' } }, result, [id], sha)).toThrow()
})
it('从原四步时长分别展示准备、交互、截图和其余fixture耗时', async () => {
  const steps = [
    { title: '假如UI回归已准备隔离的固定历史和资源', duration: 18000 },
    { title: `当用户打开UI基准场景 "${id}"`, duration: 500 },
    { title: '那么当前场景的真实交互和布局满足原约定', duration: 1000 },
    { title: '并且当前场景与已接受的UI截图一致', duration: 500 },
  ]
  await save(join(input, 'compare/playwright.json'), raw({}, { duration: 28000, steps }))
  const report = await generateUiReview(input, output, [id])
  expect(report.cases[0].timing).toEqual({ total: 28000, prepare: 18000, interaction: 1500, screenshot: 500, other: 8000 })
  expect(reviewMarkdown(report)).toContain('准备 18.0 秒，交互/布局 1.5 秒，截图比较 0.5 秒，其他（含收尾）8.0 秒')
  expect(renderUiReview(report)).toContain('不含安装、构建和排队')
  expect(classifyUiResults(raw({}, { duration: 1, steps }), [id]).cases[0].timing).toBeNull()
  expect(classifyUiResults(raw({}, { duration: 28000, steps: steps.slice(1) }), [id]).cases[0].timing).toBeNull()
  expect(classifyUiResults(raw({}, { duration: 28000, steps: steps.map(s => ({ ...s, duration: -1 })) }), [id]).cases[0].timing).toBeNull()
})
it('真实三张PNG的纯像素差异显示待审阅，保留原失败和原图片字节', async () => {
  await visualFailure()
  const original = await readFile(join(input, 'summary.json'))
  const result = await generateUiReview(input, output, [id])
  expect(result.status).toBe('needs-review'); expect(result.counts).toEqual({ passed: 0, changed: 1, failed: 0 })
  expect(await readFile(join(output, `${id}-actual.png`))).toEqual(png)
  expect(await readFile(join(input, 'summary.json'))).toEqual(original)
  expect(() => validateUiSummary({ ui: { result: 'failure' } }, result, [id], sha)).toThrow()
})
it('支持Playwright按附件name登记、path指向当前checkout已接受旧基线的真实格式', async () => {
  const report = await visualFailure()
  const expected = report.suites[0].specs[0].tests[0].results[0].attachments[0]
  Object.assign(expected, { name: `${id}-expected.png`, path: resolve(`tests/e2e/baselines/github-macos15-arm64/${id}.png`) })
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
  await save(join(input, 'summary.json'), { ...summary('failed'), profile: 'github-macos15-arm64', source: { commit, dirty: false } })
  await save(join(input, 'compare/playwright.json'), report)
  const result = await generateUiReview(input, output, [id])
  expect(result.status).toBe('needs-review'); expect(result.cases[0].status).toBe('changed')
  expect(await readFile(join(output, `${id}-expected.png`))).toEqual(await readFile(expected.path))
  await save(join(input, 'summary.json'), { ...summary('failed'), profile: 'github-macos15-arm64' })
  const wrongCommit = await generateUiReview(input, join(directory, 'wrong-commit'), [id])
  expect(wrongCommit.status).toBe('failed'); expect(wrongCommit.cases[0].images.expected).toBeUndefined()
  expected.path = join(directory, `${id}.png`); await writeFile(expected.path, png)
  await save(join(input, 'summary.json'), { ...summary('failed'), profile: 'github-macos15-arm64', source: { commit, dirty: false } })
  await save(join(input, 'compare/playwright.json'), report)
  const outside = await generateUiReview(input, join(directory, 'arbitrary-outside'), [id])
  expect(outside.status).toBe('failed'); expect(outside.cases[0].images.expected).toBeUndefined()
})
it.each([
  ['跳过', { status: 'skipped' }, { status: 'skipped' }],
  ['预期失败', { expectedStatus: 'failed' }, { status: 'failed', errors: [mismatch] }],
  ['重试', { status: 'unexpected' }, { status: 'failed', retry: 1, errors: [mismatch] }],
  ['行为错误', { status: 'unexpected' }, { status: 'failed', errors: [{ message: 'save button disabled' }] }],
  ['环境错误', { status: 'unexpected' }, { status: 'failed', errors: [{ message: 'UI基线环境不匹配' }] }],
  ['多种错误', { status: 'unexpected' }, { status: 'failed', errors: [mismatch, { message: 'afterEach failed' }] }],
  ['场景错配', { status: 'unexpected' }, { status: 'failed', errors: [{ message: mismatch.message.replace(id, 'chat-dark') }] }],
  ['中断', { status: 'unexpected' }, { status: 'interrupted', errors: [mismatch] }],
])('%s不能归为可接受的视觉差异', (_name, testPatch, resultPatch) => {
  expect(classifyUiResults(raw(testPatch, resultPatch), [id]).cases[0].status).toBe('failed')
})
it('重复与缺失场景均不能通过', () => {
  const report = raw(); report.suites[0]!.specs.push(report.suites[0]!.specs[0]!)
  expect(classifyUiResults(report, [id]).cases[0].status).toBe('failed')
  expect(classifyUiResults(raw(), ['chat-dark']).cases[0].status).toBe('failed')
})
it.each(['missing', 'symlink', 'not-png'])('差异图片%s时保持失败', async kind => {
  await visualFailure()
  const path = join(input, 'compare', `${id}-diff.png`)
  await rm(path)
  if (kind === 'symlink') { const outside = join(directory, 'outside.png'); await writeFile(outside, png); await symlink(outside, path) }
  if (kind === 'not-png') await writeFile(path, 'not an image')
  expect((await generateUiReview(input, output, [id])).status).toBe('failed')
})
it('拒绝收集报告输入目录之外的图片', async () => {
  const report = await visualFailure()
  const outside = join(directory, `${id}-diff.png`); await writeFile(outside, png)
  report.suites[0]!.specs[0]!.tests[0]!.results[0]!.attachments = [{ path: outside, contentType: 'image/png' }]
  await save(join(input, 'compare/playwright.json'), report)
  expect((await generateUiReview(input, output, [id])).status).toBe('failed')
})
it.each(['global-error', 'source-change', 'signal'])('纯截图差异不能掩盖%s', async kind => {
  const report = await visualFailure()
  if (kind === 'global-error') await save(join(input, 'compare/playwright.json'), { ...report, errors: [{ message: 'worker lost' }] })
  if (kind === 'source-change') await save(join(input, 'summary.json'), { ...summary('failed'), errors: [...summary('failed').errors, '执行期间源码变化，结论失效'] })
  if (kind === 'signal') await save(join(input, 'compare/summary.json'), { ...execution('failed'), exit: { code: null, signal: 'SIGTERM' } })
  expect((await generateUiReview(input, output, [id])).status).toBe('failed')
})
it('安装或构建失败时也能生成明确未执行的报告', async () => {
  const result = await generateUiReview(join(directory, 'absent'), join(directory, 'nested', 'review'), [id])
  expect(result.status).toBe('failed'); expect(result.issues.join()).toContain('未生成')
})
it('候选的原始图片必须对应登记hash，采集成功仍待审阅', async () => {
  await mkdir(join(input, 'capture')); await mkdir(join(input, 'review'))
  await save(join(input, 'capture/summary.json'), execution())
  await save(join(input, 'capture/playwright.json'), raw())
  await save(join(input, 'candidate.json'), { source: summary().source, cases: { [id]: { sha256: hash } } })
  await save(join(input, 'review/differences.json'), { cases: { [id]: { oldSha256: hash, newSha256: hash, diffSha256: hash, changedPixels: 3 } } })
  for (const kind of ['old', 'new', 'diff']) await writeFile(join(input, `review/${id}-${kind}.png`), png)
  expect((await generateUiReview(input, output, [id], true)).status).toBe('needs-review')
  await save(join(input, 'candidate.json'), { source: summary().source, cases: { [id]: { sha256: 'wrong' } } })
  expect((await generateUiReview(input, join(directory, 'bad'), [id], true)).status).toBe('failed')
})
it.each([false, true])('无变化或首次候选仍展示实际原图且等待审阅：首次=%s', async initial => {
  await mkdir(join(input, 'capture')); await mkdir(join(input, 'review'))
  await save(join(input, 'capture/summary.json'), execution())
  await save(join(input, 'capture/playwright.json'), raw())
  await save(join(input, 'candidate.json'), { source: summary().source, cases: { [id]: { sha256: hash } } })
  await save(join(input, 'review/differences.json'), { cases: { [id]: { oldSha256: initial ? null : hash, newSha256: hash, diffSha256: initial ? null : hash, changedPixels: initial ? null : 0 } } })
  for (const kind of initial ? ['new'] : ['old', 'new', 'diff']) await writeFile(join(input, `review/${id}-${kind}.png`), png)
  const result = await generateUiReview(input, output, [id], true)
  expect(result.status).toBe('needs-review')
  expect(result.cases[0].images.actual.sha256).toBe(hash)
  expect(reviewMarkdown(result)).not.toContain('比较通过')
})
it('摘要和HTML展示原始错误时转义内容，链接只接受本仓库附件', async () => {
  const result = await generateUiReview(input, output, [id])
  result.issues.push('<script>alert(1)</script>')
  expect(renderUiReview(result)).not.toContain('<script>')
  expect(reviewMarkdown(result, 'javascript:alert(1)')).not.toContain('javascript:')
  expect(reviewMarkdown(result, 'https://github.com/6owen/boai-agent/actions/runs/123/artifacts/456')).toContain('[下载轻量审阅附件]')
})
it('输出目录必须独立且全新，不能覆盖原材料', async () => {
  await expect(generateUiReview(input, input, [id])).rejects.toThrow('独立目录')
  await generateUiReview(input, output, [id])
  await expect(generateUiReview(input, output, [id])).rejects.toThrow()
})
it('真实CLI在无报告时生成失败说明，退出0只表示报告生成成功', async () => {
  const cli = resolve('scripts/ui-review-report.mjs')
  const stdout = execFileSync(process.execPath, [cli, 'report', join(directory, 'absent'), output], { encoding: 'utf8' })
  expect(stdout).toContain('执行失败或材料不完整')
  expect(JSON.parse(await readFile(join(output, 'report.json'), 'utf8')).status).toBe('failed')
  const stepSummary = join(directory, 'actions-summary.md')
  execFileSync(process.execPath, [cli, 'summary', output], { env: { ...process.env, GITHUB_STEP_SUMMARY: stepSummary, UI_REVIEW_ARTIFACT_URL: 'https://github.com/6owen/boai-agent/actions/runs/123/artifacts/456' } })
  expect(await readFile(stepSummary, 'utf8')).toContain('下载轻量审阅附件')
})
it('分片报告只展示合同内本片，明确完整资格仍由汇总核验', async () => {
  // @ts-expect-error Shared Node protocol.
  const { uiShardPlan } = await import('../scripts/ui-shards.mjs')
  const ids = [id, 'settings-dark']
  await save(join(input, 'summary.json'), { ...summary(), shard: uiShardPlan(ids, 1) })
  const result = await generateUiReview(input, output, ids)
  expect(result.status).toBe('passed')
  expect(result.cases.map((item: { id: string }) => item.id)).toEqual([id])
  expect(reviewMarkdown(result)).toContain('分片 1/2')
  expect(renderUiReview(result)).toContain('完整资格由 Required checks 汇总')
})
it('伪造分片不能隐藏缺失场景', async () => {
  await save(join(input, 'summary.json'), { ...summary(), shard: { index: 1, total: 2, cases: [id] } })
  expect((await generateUiReview(input, output, [id, 'settings-dark'])).status).toBe('failed')
})
