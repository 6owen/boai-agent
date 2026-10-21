/*
 * [INPUT]: 隔离UI汇总、真实格式Playwright原报告与具名截图/trace文件协议夹具。
 * [OUTPUT]: 同批完整原件可搬移核验；缺报告/场景/附件、跳过/重试、环境不符或改字节拒绝。
 * [POS]: 云端Required checks原件合同；不运行GUI或连接GitHub。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, cp } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
// @ts-expect-error Shared plain Node contract has no declaration file.
import { uiEvidence, verifyUiGate } from '../scripts/ci-result.mjs'

const roots: string[] = [], ids = ['chat-light']
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-ui-ci-evidence-')); roots.push(root)
  const compare = join(root, 'compare'), scene = join(compare, 'review/scenarios/one'), original = '/source/.local/ui-ci/compare'
  await mkdir(scene, { recursive: true }); await mkdir(join(compare, 'results'))
  await writeFile(join(scene, 'image.png'), 'original-image'); await writeFile(join(compare, 'results/trace.zip'), 'original-trace')
  const environment = { version: 3, electron: '41.0.0', displays: [{ width: 1024, height: 768, scaleFactor: 1, primary: true, workWidth: 1024, workHeight: 684 }] }
  const summary = { profile: 'github-macos15-arm64', environment, status: 'passed', source: { commit: 'a'.repeat(40), sourceHash: 'b'.repeat(64), dirty: false }, built: { version: 1, inputHash: 'c'.repeat(64), outputHash: 'd'.repeat(64) }, cases: ids, errors: [] }
  const title = '已登记界面 chat-light 保持行为布局和视觉基线', parent = '持续保护已有界面及交互'
  const value = { caseId: ids[0], environment, actual: { electron: environment.electron, packaged: false }, display: { displays: environment.displays, onPrimary: true, windowId: 1, webContentsId: 1 } }
  const attachments = [{ name: 'UI环境与页面', contentType: 'application/json', body: Buffer.from(JSON.stringify(value)).toString('base64') }]
  const manifest = { schemaVersion: 1, testId: 'pw-one', title, titlePath: ['ui-regression.feature.spec.js', parent, title], location: { file: '/source/.features-gen/ui-regression.feature.spec.js', line: 6 }, project: '', retry: 0, repeatEachIndex: 0, status: 'passed', expectedStatus: 'passed', modelMode: 'offline-protocol-or-fixture', startedAt: '2026-10-21T00:00:00.001Z', completedAt: '2026-10-21T00:00:00.010Z', launchCount: 1, gaps: [], cleanupErrors: [], testErrors: [], evidence: [{ path: 'image.png', bytes: 14, sha256: hash('original-image'), kind: 'screenshot' }], traces: [{ path: join(original, 'results/trace.zip'), bytes: 14, sha256: hash('original-trace'), launch: 1 }] }
  const raw = { config: { configFile: '/source/playwright.config.ts', projects: [{ outputDir: join(original, 'results'), retries: 0, repeatEach: 1 }] }, suites: [{ title: 'ui-regression.feature.spec.js', suites: [{ title: parent, specs: [{ title, file: 'ui-regression.feature.spec.js', id: 'pw-one', line: 6, tests: [{ projectName: '', expectedStatus: 'passed', status: 'expected', results: [{ status: 'passed', retry: 0, duration: 12, startTime: '2026-10-21T00:00:00.000Z', attachments }] }] }] }] }], errors: [], stats: { expected: 1, skipped: 0, unexpected: 0, flaky: 0, startTime: '2026-10-21T00:00:00.000Z', duration: 20 } }
  const comparison = { status: 'passed', cases: ids, errors: [], exit: { code: 0, signal: null } }
  const save = async () => {
    await writeFile(join(root, 'summary.json'), JSON.stringify(summary)); await writeFile(join(compare, 'playwright.json'), JSON.stringify(raw))
    await writeFile(join(compare, 'summary.json'), JSON.stringify(comparison)); await writeFile(join(scene, 'manifest.json'), JSON.stringify(manifest))
  }
  const seal = async () => { await save(); await writeFile(join(root, 'ui-evidence.json'), JSON.stringify(await uiEvidence(root, ids))) }
  await save()
  return { root, compare, scene, summary, raw, comparison, manifest, value, attachments, save, seal }
}
it('UI原报告和逐启动原件在独立云端门禁重核，搬移后仍对应原批次', async () => {
  const f = await fixture(); await f.seal()
  const proof = await verifyUiGate(f.root, ids)
  expect(proof.proof).toHaveLength(1)
  const moved = f.root + '-moved'; roots.push(moved); await cp(f.root, moved, { recursive: true })
  await expect(verifyUiGate(moved, ids)).resolves.toEqual(proof)
})
it.each(['raw-missing', 'case-missing', 'skipped', 'retry', 'env-missing', 'env-wrong-case', 'wrong-electron', 'wrong-window', 'secondary-screen', 'trace-missing', 'trace-changed', 'image-changed', 'manifest-changed', 'seal-missing', 'summary-changed', 'comparison-failed'] as const)('%s不能由成功汇总冒充完整UI原件', async kind => {
  const f = await fixture(); await f.seal()
  const result = f.raw.suites[0]!.suites[0]!.specs[0]!.tests[0]!.results[0]!
  if (kind === 'raw-missing') await rm(join(f.compare, 'playwright.json'))
  else if (kind === 'trace-missing') await rm(join(f.compare, 'results/trace.zip'))
  else if (kind === 'trace-changed') await writeFile(join(f.compare, 'results/trace.zip'), 'modified-trace')
  else if (kind === 'image-changed') await writeFile(join(f.scene, 'image.png'), 'modified-image')
  else if (kind === 'seal-missing') await rm(join(f.root, 'ui-evidence.json'))
  else {
    if (kind === 'case-missing') f.raw.suites[0]!.suites[0]!.specs.splice(0)
    if (kind === 'skipped') result.status = 'skipped'
    if (kind === 'retry') result.retry = 1
    if (kind === 'env-missing') f.attachments.splice(0)
    if (kind === 'env-wrong-case') f.value.caseId = 'other'
    if (kind === 'wrong-electron') f.value.actual.electron = 'old'
    if (kind === 'wrong-window') f.value.display.windowId = 0
    if (kind === 'secondary-screen') f.value.display.onPrimary = false
    if (f.attachments[0]) f.attachments[0].body = Buffer.from(JSON.stringify(f.value)).toString('base64')
    if (kind === 'manifest-changed') f.manifest.location.line = 7
    if (kind === 'summary-changed') f.summary.source.sourceHash = 'e'.repeat(64)
    if (kind === 'comparison-failed') f.comparison.exit.code = 1
    await f.save()
  }
  await expect(verifyUiGate(f.root, ids)).rejects.toThrow()
})
