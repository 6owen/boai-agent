/*
 * [OUTPUT]: 真实监督墙钟窗口约束末场并绑定proof；44ms跨时钟偏差正例及缺失/错来源/越界/后改负例不放宽相邻场景。
 * [INPUT]: 临时原件/Playwright报告；覆盖调度/分段时钟、过期/跨串行时段、缺失、改字节及伪造清单。
 * [OUTPUT]: 执行后及CI汇总同一核验入口拒绝不完整原件；完整搬移保持可核对，不是GUI成功。
 * [POS]: T1截图/trace交付门槛的文件系统合同测试。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm, cp, symlink } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
// @ts-expect-error Shared Node contract has no declaration.
import { recordDesktopExecution, verifyDesktopEvidence } from '../scripts/desktop-evidence.mjs'
// @ts-expect-error Shared Node contract has no declaration.
import { verifyDesktopGate } from '../scripts/ci-result.mjs'
// @ts-expect-error Shared Node contract has no declaration.
import { desktopPlanIdentity } from '../scripts/desktop-plan.mjs'

const directories: string[] = []
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex')
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'boai-t1-evidence-')); directories.push(directory)
  const scene = join(directory, 'review/scenarios/one'), trace = join(directory, 'results/trace.zip')
  await mkdir(scene, { recursive: true }); await mkdir(join(directory, 'results'))
  await writeFile(join(scene, 'image.png'), 'original-image'); await writeFile(trace, 'original-trace')
  const manifest = { schemaVersion: 1, testId: 'pw-one', title: 'Case', titlePath: ['core.feature.spec.js', 'Core', 'Case'], location: { file: '/source/.features-gen/core.feature.spec.js', line: 6 }, project: '', retry: 0, repeatEachIndex: 0, status: 'passed', expectedStatus: 'passed', modelMode: 'offline-protocol-or-fixture', startedAt: '2026-10-21T00:00:00.001Z', completedAt: '2026-10-21T00:00:00.010Z', launchCount: 1, gaps: [], cleanupErrors: [], testErrors: [], evidence: [{ path: 'image.png', bytes: 14, sha256: hash('original-image'), kind: 'screenshot' }], traces: [{ path: trace, bytes: 14, sha256: hash('original-trace'), launch: 1 }] }
  const save = () => writeFile(join(scene, 'manifest.json'), JSON.stringify(manifest))
  await save()
  const window = { version: 1, directory, startedAt: '2026-10-21T00:00:00.000Z', completedAt: '2026-10-21T00:00:00.020Z' }
  const saveWindow = () => writeFile(join(directory, 'execution-window.json'), JSON.stringify(window))
  await saveWindow()
  const selected = [{ id: 'core-case', file: 'core.feature', titles: ['Core', 'Case'], playwrightId: 'pw-one', line: 6 }]
  const report = { suites: [{ title: 'core.feature.spec.js', suites: [{ title: 'Core', specs: [{ title: 'Case', file: 'core.feature.spec.js', id: 'pw-one', line: 6, tests: [{ projectName: '', expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0, duration: 12, startTime: '2026-10-21T00:00:00.000Z' }] }] }] }] }], errors: [], stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0, startTime: '2026-10-21T00:00:00.000Z', duration: 20 } }
  const identity = desktopPlanIdentity(Buffer.from(JSON.stringify({ version: 1, t1: { mode: 'offline-protocol-or-fixture', ui: 'all-registered-cases', cases: [{ ...selected[0], family: 'chat' }] } })))
  return { directory, scene, trace, manifest, save, selected, report, identity, window, saveWindow }
}
it('完整场景原件在runner及CI汇总均核对，整体搬移后保持原身份', async () => {
  const f = await fixture(), proof = await verifyDesktopEvidence(f.directory, f.report, f.selected)
  const summary = { outputDirectory: f.directory, evidenceSha256: hash(JSON.stringify(proof)) }
  await expect(verifyDesktopGate(f.directory, summary, f.report, f.identity)).resolves.toEqual(proof)
  const moved = f.directory + '-moved'; directories.push(moved); await cp(f.directory, moved, { recursive: true })
  await expect(verifyDesktopGate(moved, summary, f.report, f.identity)).resolves.toEqual(proof)
  await rm(join(moved, 'results/trace.zip'))
  await expect(verifyDesktopGate(moved, summary, f.report, f.identity)).rejects.toThrow()
})
it('调度到worker启动有延迟仍核对本次真实时段，不混用两个起点', async () => {
  const f = await fixture()
  f.manifest.startedAt = '2026-10-21T00:00:01.000Z'
  f.manifest.completedAt = '2026-10-21T00:00:01.012Z'
  f.report.stats.duration = 1020
  f.window.completedAt = '2026-10-21T00:00:01.020Z'
  await f.saveWindow()
  await f.save()
  await expect(verifyDesktopEvidence(f.directory, f.report, f.selected)).resolves.toHaveLength(1)
})
it('原件墙钟跨度包含worker分段计时之间的间隙，仍必须在本场串行时段内', async () => {
  const f = await fixture()
  f.manifest.completedAt = '2026-10-21T00:00:00.015Z'
  expect(Date.parse(f.manifest.completedAt) - Date.parse(f.manifest.startedAt)).toBeGreaterThan(f.report.suites[0]!.suites[0]!.specs[0]!.tests[0]!.results[0]!.duration + 1)
  await f.save()
  await expect(verifyDesktopEvidence(f.directory, f.report, f.selected)).resolves.toHaveLength(1)
})
it.each(['missing-run-time', 'outside-run', 'overlaps-next-case'] as const)('%s原件不能取得资格', async kind => {
  const f = await fixture()
  if (kind === 'missing-run-time') f.report.stats.startTime = ''
  if (kind === 'outside-run') { f.manifest.startedAt = '2026-10-21T00:00:00.021Z'; f.manifest.completedAt = '2026-10-21T00:00:00.022Z' }
  if (kind === 'overlaps-next-case') {
    const next = structuredClone(f.report.suites[0]!.suites[0]!.specs[0]!)
    next.id = 'pw-next'; next.title = 'Next'; next.line = 7
    next.tests[0]!.results[0]!.startTime = '2026-10-21T00:00:00.005Z'
    f.report.suites[0]!.suites[0]!.specs.push(next); f.report.stats.expected = 2
    f.selected.push({ ...f.selected[0]!, id: 'next-case', playwrightId: 'pw-next', line: 7, titles: ['Core', 'Next'] })
    const scene = join(f.directory, 'review/scenarios/two'); await mkdir(scene)
    await writeFile(join(scene, 'image.png'), 'original-image')
    await writeFile(join(scene, 'manifest.json'), JSON.stringify({ ...f.manifest, testId: 'pw-next', title: 'Next', titlePath: ['core.feature.spec.js', 'Core', 'Next'], location: { ...f.manifest.location, line: 7 }, startedAt: '2026-10-21T00:00:00.005Z', completedAt: '2026-10-21T00:00:00.012Z' }))
  }
  await f.save()
  await expect(verifyDesktopEvidence(f.directory, f.report, f.selected)).rejects.toThrow(kind === 'missing-run-time' ? '原报告缺少实际运行时段' : '原件清单身份、时间或来源不对应：core-case')
})
it.each(['missing-manifest', 'missing-trace', 'changed-image', 'symlink-image', 'extra-manifest', 'wrong-id', 'gap', 'cleanup', 'test-error', 'missing-errors', 'duplicate-trace', 'outside-path', 'wrong-title', 'wrong-project', 'wrong-time', 'real-provider'] as const)('%s不能靠测试成功取得原件资格', async kind => {
  const f = await fixture()
  if (kind === 'missing-manifest') await rm(join(f.scene, 'manifest.json'))
  else if (kind === 'missing-trace') await rm(f.trace)
  else if (kind === 'changed-image') await writeFile(join(f.scene, 'image.png'), 'modified-image')
  else if (kind === 'symlink-image') { await rm(join(f.scene, 'image.png')); await symlink(f.trace, join(f.scene, 'image.png')) }
  else if (kind === 'extra-manifest') await mkdir(join(f.directory, 'review/scenarios/extra'))
  else {
    if (kind === 'wrong-id') f.manifest.testId = 'other'
    if (kind === 'gap') Object.assign(f.manifest, { gaps: [{ label: 'capture', reason: 'failed' }] })
    if (kind === 'cleanup') Object.assign(f.manifest, { cleanupErrors: ['alive'] })
    if (kind === 'test-error') Object.assign(f.manifest, { testErrors: ['failed'] })
    if (kind === 'missing-errors') Object.assign(f.manifest, { gaps: undefined })
    if (kind === 'duplicate-trace') f.manifest.traces.push(f.manifest.traces[0]!)
    if (kind === 'outside-path') f.manifest.evidence[0]!.path = '../../outside.png'
    if (kind === 'wrong-title') f.manifest.title = 'Other'
    if (kind === 'wrong-project') f.manifest.project = 'other'
    if (kind === 'wrong-time') f.manifest.startedAt = '2026-10-20T00:00:00.000Z'
    if (kind === 'real-provider') f.manifest.modelMode = 'real-provider'
    await f.save()
  }
  await expect(verifyDesktopEvidence(f.directory, f.report, f.selected)).rejects.toThrow()
})
it('汇总后再修改清单说明也不能复用旧核验hash', async () => {
  const f = await fixture(), proof = await verifyDesktopEvidence(f.directory, f.report, f.selected)
  const bytes = JSON.parse(await readFile(join(f.scene, 'manifest.json'), 'utf8')); bytes.humanReview = 'approved'
  await writeFile(join(f.scene, 'manifest.json'), JSON.stringify(bytes))
  await expect(verifyDesktopGate(f.directory, { outputDirectory: f.directory, evidenceSha256: hash(JSON.stringify(proof)) }, f.report, f.identity)).rejects.toThrow('原件集合')
})

it('last case uses observed wall end instead of adding monotonic duration to wall start', async () => {
  const f = await fixture()
  f.manifest.completedAt = '2026-10-21T00:00:00.064Z'
  f.window.completedAt = '2026-10-21T00:00:00.100Z'
  await f.saveWindow(); await f.save()
  await expect(verifyDesktopEvidence(f.directory, f.report, f.selected)).resolves.toHaveLength(1)
})
it.each(['missing', 'source', 'reversed', 'before-start', 'after-end'] as const)('%s actual execution window cannot qualify originals', async kind => {
  const f = await fixture()
  if (kind === 'missing') await rm(join(f.directory, 'execution-window.json'))
  else {
    if (kind === 'source') f.window.directory += '-other'
    if (kind === 'reversed') f.window.completedAt = '2026-10-20T00:00:00.000Z'
    if (kind === 'before-start') f.window.startedAt = '2026-10-21T00:00:00.002Z'
    if (kind === 'after-end') { f.window.completedAt = '2026-10-21T00:00:00.008Z'; f.report.stats.duration = 1000 }
    await f.saveWindow()
  }
  await expect(verifyDesktopEvidence(f.directory, f.report, f.selected)).rejects.toThrow()
})
it('valid window bytes changed after sealing cannot reuse the original proof', async () => {
  const f = await fixture(), proof = await verifyDesktopEvidence(f.directory, f.report, f.selected)
  f.window.completedAt = '2026-10-21T00:00:00.021Z'; await f.saveWindow()
  await expect(verifyDesktopGate(f.directory, { outputDirectory: f.directory, evidenceSha256: hash(JSON.stringify(proof)) }, f.report, f.identity)).rejects.toThrow('原件集合')
})
it.each([false, true])('records observed start/end for successful or failed supervised execution: %s', async failed => {
  const f = await fixture(); await rm(join(f.directory, 'execution-window.json'))
  vi.useFakeTimers({ toFake: ['Date'] })
  try {
    vi.setSystemTime(new Date('2026-10-21T00:00:00.000Z'))
    const work = recordDesktopExecution(f.directory, async () => {
      vi.setSystemTime(new Date('2026-10-21T00:00:00.064Z'))
      if (failed) throw new Error('observed child failure')
      return 42
    })
    if (failed) await expect(work).rejects.toThrow('observed child failure')
    else await expect(work).resolves.toBe(42)
    expect(JSON.parse(await readFile(join(f.directory, 'execution-window.json'), 'utf8'))).toEqual({ version: 1, directory: f.directory, startedAt: '2026-10-21T00:00:00.000Z', completedAt: '2026-10-21T00:00:00.064Z' })
    const duplicate = vi.fn(async () => 0)
    await expect(recordDesktopExecution(f.directory, duplicate)).rejects.toThrow()
    expect(duplicate).not.toHaveBeenCalled()
  } finally { vi.useRealTimers() }
})
