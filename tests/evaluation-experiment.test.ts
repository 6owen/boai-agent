/*
 * [INPUT]: 服务/桌面投影、最终BDD报告与同场原件、缺失/篡改/重试/不可比样本。
 * [OUTPUT]: 防止丢弃失败、跨场拼接、未知计零和以技术通过冒充质量通过的实验合同回归。
 * [POS]: tests/evaluation-experiment.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { compareTrials, summarizeTrials, type EvaluationTrial } from './evaluation/experiment'
import { loadDesktopTrials } from './evaluation/desktop'
import { rescoreDesktop } from './evaluation/rescore'

const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const sha = (value: string) => createHash('sha256').update(value).digest('hex')
function trial(patch: Partial<EvaluationTrial> = {}): EvaluationTrial {
  return { id: 'case-1', caseId: 'case', sample: 1, retry: 0, cluster: 'cluster', split: 'development', source: 'service', modelMode: 'service-adapter', attempted: true,
    technical: 'passed', verdict: 'passed', contractHash: 'contract', modelSignature: 'model', budgetSignature: 'budget', sourceHash: 'baseline', team: 'multi',
    scorerVersion: 'v1', sampleHash: 'sample', requests: 5, requestMetric: 'provider-attempts', totalTokens: 20, knownTokens: 20, durationMs: 100, evidence: ['case-1.json'], issues: [], ...patch }
}
it('pairs each independent repetition and retains baseline-only failures instead of selecting a convenient subset', () => {
  const previous = [trial(), trial({ id: 'case-2', sample: 2, verdict: 'failed', requests: 8 })]
  const candidate = [trial({ sourceHash: 'candidate', requests: 3 }), trial({ id: 'case-2', sample: 2, sourceHash: 'candidate', requests: 4 })]
  const comparison = compareTrials(candidate, previous)
  expect(comparison.status).toBe('descriptive-only')
  expect(comparison.pairs.map(row => [row.sample, row.delta, row.requestsDelta])).toEqual([[1, 0, -2], [2, 1, -4]])
  expect(comparison.decision).toBe('not-assessed')
  const missing = compareTrials(candidate.slice(0, 1), previous)
  expect(missing.pairs).toHaveLength(2); expect(missing.status).toBe('insufficient-evidence'); expect(missing.clusterMeanDelta).toBeNull()
})
it.each([
  ['unknown config', { modelSignature: undefined }], ['different budget', { budgetSignature: 'higher-budget' }],
  ['different source', { source: 'desktop' }], ['different scoring', { scorerVersion: 'relaxed' }],
  ['unknown evidence', { issues: ['lost artifact'] }], ['pending quality', { verdict: 'review-needed' }],
  ['retry', { retry: 1 }],
] as [string, Partial<EvaluationTrial>][])('does not select a candidate with %s', (_, patch) => {
  expect(compareTrials([trial(patch)], [trial()])).toMatchObject({ status: 'insufficient-evidence', clusterMeanDelta: null, decision: 'not-assessed' })
})
it('rejects duplicate attempts and mixed code versions without hiding any pair', () => {
  expect(compareTrials([trial(), trial()], [trial()]).pairs[0].comparable).toBe(false)
  expect(compareTrials([trial(), trial({ sample: 2, sourceHash: 'another-version' })], [trial(), trial({ sample: 2 })]).issues).toContain('candidate混有多个代码输入版本')
})
it('keeps unknown usage and separates service requests from desktop profile calls', () => {
  const summary = summarizeTrials([trial(), trial({ source: 'desktop', modelMode: 'development/real-provider', verdict: 'review-needed', totalTokens: null, knownTokens: 99, requests: null, requestMetric: 'unknown' })])
  expect(summary).toMatchObject({ listed: 2, passed: 1, reviewNeeded: 1, technicalPassed: 2 })
  expect(summary.groups[1]).toMatchObject({ totalTokens: null, knownTokens: 99, requests: null, usageKnownSamples: 0 })
})

async function fixture(statuses = ['passed', 'failed']) {
  const root = await mkdtemp(join(tmpdir(), 'boai-experiment-')); roots.push(root)
  await mkdir(join(root, 'scenarios'))
  const specs = []
  for (const [sample, status] of statuses.entries()) {
    const id = `test-${sample}`, directory = join(root, 'scenarios', id); await mkdir(directory)
    const add = async (name: string, label: string, data: unknown) => {
      const bytes = JSON.stringify(data); await writeFile(join(directory, name), bytes)
      return { path: name, kind: 'data', label, bytes: Buffer.byteLength(bytes), sha256: sha(bytes) }
    }
    const evidence = [await add('artifact.json', '成果', { text: '实际文件' }),
      await add('model.json', '独立员工及模型来源', { provider: 'fixture', model: 'fixture-model', agents: [{ modelId: 'fixture-model', connectionId: 'fixed', role: '写手', thinkingLevel: 'off', allowCommands: false, allowBrowser: false }] }),
      await add('usage.json', '结束或失败时实际状态共享预算与调用', { profileCalls: [{ id: 'call', usage: { totalTokens: 11 } }], budgets: [{ maxModelCalls: 24, maxRuns: 8, maxOutputTokens: 16000, usageIncomplete: true }] })]
    const trace = await add('trace.zip', 'trace', 'fixture trace bytes')
    await writeFile(join(directory, 'manifest.json'), JSON.stringify({ testId: id, title: '<script>业务</script>', location: { file: 'editorial-collaboration.feature.spec.js' }, project: '', retry: 0, repeatEachIndex: sample,
      startedAt: new Date(1100).toISOString(), completedAt: new Date(1800).toISOString(), modelMode: 'offline-protocol', evidence, traces: [trace], gaps: [], cleanupErrors: [] }))
    specs.push({ id, title: '<script>业务</script>', file: 'editorial-collaboration.feature.spec.js', tests: [{ projectName: '', expectedStatus: 'passed', status: status === 'passed' ? 'expected' : 'unexpected', results: [{ retry: 0, status, duration: 1000, startTime: new Date(1000).toISOString() }] }] })
  }
  await writeFile(join(root, 'playwright-results.json'), JSON.stringify({ stats: { startTime: new Date(1000).toISOString() }, suites: [{ specs }], errors: [] }))
  await writeFile(join(root, 'build-manifest.json'), JSON.stringify({ files: { 'tests/e2e/features/editorial-collaboration.feature': sha('fixed input'), 'src/runtime/service.ts': sha('runtime') } }))
  await writeFile(join(root, 'registration.json'), JSON.stringify({ desktopMode: 'development', desktopModelMode: 'offline-protocol', repeat: statuses.length }))
  await writeFile(join(root, 'verification.json'), JSON.stringify({ changed: [] }))
  return root
}
it('imports complete desktop attempts without rerunning models and preserves failure, quality pending and ledger unknown', async () => {
  const root = await fixture(), fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline only'))
  const data = await loadDesktopTrials(root)
  expect(data.issues).toEqual([])
  expect(data.trials.map(row => row.verdict)).toEqual(['review-needed', 'failed'])
  expect(data.trials.map(row => row.sample)).toEqual([1, 2])
  expect(data.trials[0]).toMatchObject({ technical: 'passed', requests: 1, totalTokens: null, knownTokens: 11 })
  const report = await rescoreDesktop(root, join(root, 'report'))
  expect(report).toMatchObject({ passed: 0, failed: 1, reviewNeeded: 1, incomplete: 0 })
  const html = await readFile(join(root, 'report/index.html'), 'utf8')
  expect(html).not.toContain('<script>业务</script>'); expect(html).toContain('&lt;script&gt;')
  expect(fetch).not.toHaveBeenCalled()
  await expect(rescoreDesktop(root, join(root, 'report'))).rejects.toThrow()
})
it.each(['missing', 'changed', 'symlink', 'other-scene'])('does not pass when original evidence is %s', async mode => {
  const root = await fixture(['passed']), artifact = join(root, 'scenarios/test-0/artifact.json')
  if (mode === 'changed') await writeFile(artifact, '{}')
  else if (mode === 'missing') await rm(artifact)
  else if (mode === 'symlink') { await rm(artifact); await symlink(join(root, 'registration.json'), artifact) }
  else {
    const path = join(root, 'scenarios/test-0/manifest.json'), manifest = JSON.parse(await readFile(path, 'utf8'))
    manifest.evidence[0].path = '../../registration.json'; await writeFile(path, JSON.stringify(manifest))
  }
  const { trials } = await loadDesktopTrials(root)
  expect(trials[0].technical).toBe('incomplete'); expect(trials[0].verdict).toBe('incomplete'); expect(trials[0].issues.length).toBeGreaterThan(0)
})
it('retains a final failure when its fixture manifest incorrectly says passed and includes unrun tests', async () => {
  const root = await fixture(['failed']), manifestPath = join(root, 'scenarios/test-0/manifest.json'), manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
  manifest.status = 'passed'; await writeFile(manifestPath, JSON.stringify(manifest))
  const path = join(root, 'playwright-results.json'), report = JSON.parse(await readFile(path, 'utf8'))
  report.suites[0].specs.push({ id: 'not-run', title: '未运行', tests: [{ projectName: '', expectedStatus: 'passed', status: 'skipped', results: [] }] }); await writeFile(path, JSON.stringify(report))
  const { trials } = await loadDesktopTrials(root)
  expect(trials.map(row => row.verdict)).toEqual(['failed', 'incomplete']); expect(trials[1].attempted).toBe(false)
})
it('rejects ambiguous duplicate manifests and orphan evidence instead of merging different attempts', async () => {
  const root = await fixture(['passed']), duplicate = join(root, 'scenarios/duplicate'); await mkdir(duplicate)
  const manifest = await readFile(join(root, 'scenarios/test-0/manifest.json'), 'utf8'); await writeFile(join(duplicate, 'manifest.json'), manifest)
  expect((await loadDesktopTrials(root)).trials[0].verdict).toBe('incomplete')
  await writeFile(join(duplicate, 'manifest.json'), JSON.stringify({ ...JSON.parse(manifest), testId: 'orphan' }))
  const imported = await loadDesktopTrials(root)
  expect(imported.issues.some(issue => issue.includes('不在最终报告'))).toBe(true); expect(imported.trials[0].verdict).toBe('incomplete')
})
it('rejects malformed final reports and never treats expected failures as successful business', async () => {
  const root = await fixture(['passed']), path = join(root, 'playwright-results.json'), report = JSON.parse(await readFile(path, 'utf8'))
  report.suites[0].specs[0].tests[0].expectedStatus = 'failed'; await writeFile(path, JSON.stringify(report))
  expect((await loadDesktopTrials(root)).trials[0].verdict).toBe('incomplete')
  report.suites[0].specs[0].tests[0].results[0].duration = -1; await writeFile(path, JSON.stringify(report))
  await expect(loadDesktopTrials(root)).rejects.toThrow()
})
it('does not certify equal desktop budgets from partial Work limits or confuse reported token coverage with ledger completeness', async () => {
  const root = await fixture(['passed']), { trials } = await loadDesktopTrials(root)
  expect(trials[0]).toMatchObject({ budgetSignature: undefined, totalTokens: null, knownTokens: 11 })
  expect(compareTrials(trials, trials).pairs[0].reasons).toContain('budgetSignature缺失或不一致')
})
