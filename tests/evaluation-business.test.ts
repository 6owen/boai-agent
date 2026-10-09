/*
 * [INPUT]: 固定业务分组、业务轨迹、独立judge响应及隔离候选执行夹具。
 * [OUTPUT]: 开发/验证防串题、真实业务评分门禁、校准/噪声/成本与自动候选闭环回归；模型/人工标签夹具明确不是真实评审。
 * [POS]: tests/evaluation-business.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { execFileSync } from 'node:child_process'
import { createPlan, registerExperiment, assessCandidate, experimentStatus, type OptimizationConfig, type OptimizationPlan } from './evaluation/optimization'
import { businessDiagnostics, businessDifference } from './evaluation/business'
import { buildBusinessEval, developmentFeedback, runBusinessHillclimb } from './evaluation/hillclimb'
import { judgeRecord, judgeIdentity, judgeInput } from './evaluation/judge'
import { digest, type EvaluationTrial } from './evaluation/experiment'
import { sampleHash } from './evaluation/checks'
import { EvaluationBudget } from './evaluation/budget'
import { cases } from './evaluation/cases'
import { SCORER_VERSION, type EvaluationRecord } from './evaluation/schema'
import type { Connection } from '../src/shared/domain'

const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const sourceFile = 'src/runtime/prompt.ts'
const config: OptimizationConfig = { id: 'business-fixture', goal: '提高真实文件交付', cases: ['reviewed-operations', 'parallel-branches', 'conflicting-sources', 'hostile-source', 'no-unsupported-claims', 'wrong-child-result'],
  validationCases: ['renamed-team', 'changed-values', 'authorized-takeover', 'bounded-relay', 'independent-files', 'plan-only'], samples: 3,
  connectionId: 'fixture-only', dataPath: '/not-real-credentials', maxRequests: 100, maxRounds: 2, stopAfterNoImprovement: 2, minimumGain: 0.1, maxCallRatio: 1.1, allowedChanges: [sourceFile] }
function trials(plan: OptimizationPlan, passed: boolean, hash = 'source'): EvaluationTrial[] {
  return plan.tasks.flatMap(task => Array.from({ length: plan.samples }, (_, index) => ({ id: `${task.id}-${index + 1}`, caseId: task.id, sample: index + 1, retry: 0, cluster: task.cluster, split: task.split, source: 'service', modelMode: 'service-adapter', attempted: true,
    verdict: passed ? 'passed' : 'failed', technical: 'passed', judgeStatus: 'human', scorerVersion: SCORER_VERSION, sampleHash: 'fixture', contractHash: task.contractHash, modelSignature: 'model', budgetSignature: 'budget', sourceHash: hash, team: 'multi', requests: 0, requestMetric: 'provider-attempts', totalTokens: null, knownTokens: null, durationMs: 500, evidence: ['fixture-only'], issues: [] })))
}
it('requires separate task clusters, keeps existing semantic criteria, and rejects final holdout reuse', () => {
  const plan = createPlan(config, 'hash')
  expect(plan.tasks).toHaveLength(12)
  expect(cases.find(row => row.id === 'reviewed-operations')!.semantic.length).toBeGreaterThan(0)
  for (const change of [{ validationCases: [config.cases[0]] }, { cases: ['delegated-result'], validationCases: ['changed-values'] }, { validationCases: ['holdout-invoice-tax'] }, { goal: '' }]) expect(() => createPlan({ ...config, ...change }, 'hash')).toThrow()
})
it('keeps only real task improvement in both partitions with a positive bounded interval', () => {
  const plan = createPlan(config, 'hash'), before = trials(plan, false), after = trials(plan, true, 'candidate')
  const result = assessCandidate(plan, after, before, { current: 1, baseline: 1 })
  expect(result).toMatchObject({ status: 'promising', releaseApproved: false, business: { scope: 'fixed-business-suite', development: { difference: { delta: 1 } }, validation: { difference: { delta: 1 } } } })
  expect(result.business!.validation.difference!.interval![0]).toBeGreaterThan(0)
})
it('rejects training-only improvement, regression, excess cost and unchanged code', () => {
  const plan = createPlan(config, 'hash'), before = trials(plan, false), after = trials(plan, true, 'candidate')
  for (const row of after) if (config.validationCases!.includes(row.caseId)) row.verdict = 'failed'
  expect(assessCandidate(plan, after, before, { current: 1, baseline: 1 }).reasons.join()).toContain('独立验证')
  expect(assessCandidate(plan, trials(plan, true, 'candidate'), before, { current: 2, baseline: 1 }).status).toBe('regressed')
  expect(assessCandidate(plan, trials(plan, true), before, { current: 1, baseline: 1 }).status).toBe('no-improvement')
  expect(assessCandidate(plan, trials(plan, false, 'candidate'), trials(plan, true), { current: 1, baseline: 1 }).status).toBe('regressed')
})
it('does not turn technical failures into a calibrated business evaluator', () => {
  const plan = createPlan(config, 'hash'), rows = trials(plan, false)
  rows[0].judgeStatus = 'pending'
  expect(assessCandidate(plan, rows).status).toBe('blocked')
  rows[0].judgeStatus = 'invalid'
  expect(assessCandidate(plan, rows).status).toBe('blocked')
})
it('does not hide regression on one business task behind the overall improvement', () => {
  const plan = createPlan(config, 'hash'), before = trials(plan, false), after = trials(plan, true, 'candidate')
  for (const row of before) if (row.caseId === plan.cases[0]) row.verdict = 'passed'
  for (const row of after) if (row.caseId === plan.cases[0]) row.verdict = 'failed'
  expect(assessCandidate(plan, after, before, { current: 1, baseline: 1 }).status).toBe('regressed')
})
it('reports repeated trials as repeated trials, blocks noise and missing observations', () => {
  const plan = createPlan(config, 'hash'), before = trials(plan, false), after = trials(plan, true, 'candidate')
  for (const row of before) if (row.sample === 2) row.verdict = 'passed'
  expect(businessDiagnostics(before)).toMatchObject({ tasks: 12, repeats: 3, samples: 36, observedNoise: 1, tokens: null })
  expect(assessCandidate(plan, after, before, { current: 1, baseline: 1 }).status).toBe('blocked')
  expect(businessDifference(after.slice(1), before, 2).interval).toBeNull()
})
it('allows different registered budgets across tasks while rejecting inconsistent repeats of the same task', () => {
  const plan = createPlan(config, 'hash'), before = trials(plan, false), after = trials(plan, true, 'candidate')
  for (const row of [...before, ...after]) row.budgetSignature = `budget-for-${row.caseId}`
  expect(assessCandidate(plan, after, before, { current: 1, baseline: 1 }).status).toBe('promising')
  after[0].budgetSignature = 'changed-budget'
  expect(assessCandidate(plan, after, before, { current: 1, baseline: 1 }).status).toBe('blocked')
})
it('does not feed independent validation tasks, reference answers or output files to Codex', () => {
  const record = { ...judgedRecord(), caseId: 'reviewed-operations-1', prompt: 'train-task', scenario: cases.find(row => row.id === 'reviewed-operations') }
  const feedback = JSON.stringify(developmentFeedback([record, { ...record, caseId: 'private-1', prompt: 'validation-secret', scenario: cases.find(row => row.id === 'renamed-team') }], config.cases))
  expect(feedback).toContain('train-task'); expect(feedback).not.toContain('validation-secret'); expect(feedback).not.toContain('"fields"')
  expect(feedback).toContain('hardChecks'); expect(feedback).toContain('review-lineage')
})

const connection = { provider: 'openai-compatible', baseUrl: 'https://judge.invalid/v1', defaultModel: 'independent-fixture' } as Connection
function judgedRecord(): EvaluationRecord {
  const scenario = { ...cases.find(row => row.id === 'legal-silence')!, semantic: ['遵守明确无回复要求'] }
  return { caseId: 'legal-silence-1', prompt: scenario.prompt, scenario, startedAt: 1, sentAt: 1, elapsedMs: 20, metadata: { label: 'fixture', revision: 'fixture', model: 'tested-fixture', provider: 'fixture', sourceHashes: {}, members: [] }, requests: [], runtimeErrors: [], artifacts: [], detail: { messages: [{ id: 'user', senderType: 'user', createdAt: new Date(1).toISOString() }], turns: [], runs: [], decisions: [], deliveries: [], workItems: [] } as unknown as EvaluationRecord['detail'] }
}
const answer = (score = 2) => ({ output: { criteria: [{ criterion: '遵守明确无回复要求', score, evidence: ['user'], reason: '仅单测夹具，非人工校准' }] }, usage: null })
it('runs an independent judge twice, charges each call, retains reasons and remains uncalibrated', async () => {
  const reserve = vi.fn(), call = vi.fn().mockResolvedValue(answer())
  expect(await judgeRecord(judgedRecord(), connection, 'fixture-key', reserve, call)).toMatchObject({ consistent: true, calibrated: false, acceptedReview: { source: 'model-assisted', reviewer: judgeIdentity(connection) }, usage: [null, null] })
  expect(reserve).toHaveBeenCalledTimes(2); expect(call).toHaveBeenCalledTimes(2)
})
it('gives the judge the exact existing scorer reference whitelist instead of allowing every visible ID', () => {
  const record = judgedRecord()
  record.detail!.workItems = [{ id: 'work-id-not-a-review-reference' }] as NonNullable<EvaluationRecord['detail']>['workItems']
  const input = judgeInput(record)
  expect(input.allowedEvidenceIds).toEqual(['user'])
  expect(JSON.stringify(input)).toContain('work-id-not-a-review-reference')
  expect(input.allowedEvidenceIds).not.toContain('work-id-not-a-review-reference')
})
it('rejects self-judging before calls and detects inconsistent/ungrounded judgments', async () => {
  const reserve = vi.fn(), call = vi.fn().mockResolvedValueOnce(answer()).mockResolvedValueOnce(answer(0))
  await expect(judgeRecord(judgedRecord(), { ...connection, defaultModel: 'tested-fixture' }, '', reserve, call)).rejects.toThrow('自评')
  expect(reserve).not.toHaveBeenCalled()
  expect((await judgeRecord(judgedRecord(), connection, '', reserve, call)).acceptedReview).toBeNull()
  await expect(judgeRecord(judgedRecord(), connection, '', reserve, async () => ({ output: { criteria: [{ ...answer().output.criteria[0], evidence: ['invented'] }] }, usage: null }))).rejects.toThrow('证据')
})
it('retains the first judge answer when the second call fails, and never retries an unknown result', async () => {
  const reserve = vi.fn(), observe = vi.fn(), call = vi.fn().mockResolvedValueOnce(answer()).mockRejectedValueOnce(new Error('lost response'))
  await expect(judgeRecord(judgedRecord(), connection, '', reserve, call, observe)).rejects.toThrow('lost response')
  expect(reserve).toHaveBeenCalledTimes(2); expect(call).toHaveBeenCalledTimes(2)
  expect(observe.mock.calls.map(([row]) => row.status)).toEqual(['started', 'returned', 'started', 'failed-or-unknown'])
})
it('validates raw JSON using the product protocol and preserves rejected text and partial usage before stopping', async () => {
  const reserve = vi.fn(), observe = vi.fn()
  const raw = { text: JSON.stringify(answer().output), usage: { inputTokens: 10, outputTokens: 4 }, finishReason: 'stop' }
  expect((await judgeRecord(judgedRecord(), connection, '', reserve, async () => raw, observe)).consistent).toBe(true)
  for (const rejected of [{ ...raw, text: 'not JSON' }, { ...raw, failure: 'request lost after partial output' }]) {
    const call = vi.fn().mockResolvedValue(rejected)
    await expect(judgeRecord(judgedRecord(), connection, '', reserve, call, observe)).rejects.toThrow()
    expect(call).toHaveBeenCalledTimes(1)
    expect(observe.mock.calls.at(-1)![0]).toMatchObject({ status: 'returned', ...rejected })
  }
})

async function setup() {
  const parent = await mkdtemp(join(tmpdir(), 'boai-business-')); roots.push(parent)
  const source = join(parent, 'source'), root = join(parent, 'experiment')
  await mkdir(join(source, 'src/runtime'), { recursive: true })
  await writeFile(join(source, sourceFile), 'export const instruction = "broken"\n')
  await writeFile(join(source, 'package.json'), '{"type":"module"}'); await writeFile(join(source, 'vitest.config.ts'), 'export default {}')
  await symlink(resolve('node_modules'), join(source, 'node_modules'), 'dir')
  execFileSync('git', ['init', '-q', source]); execFileSync('git', ['-C', source, 'add', '.']); execFileSync('git', ['-C', source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'isolated fixture'])
  await registerExperiment(root, config)
  return { root, source }
}
/** Only this controller test uses fabricated service results; real provider evidence is separate. */
function fixtureRound(pending = false) {
  return vi.fn(async (root: string, source: string, hypothesis: string) => {
    const state = await experimentStatus(root), index = state.rounds.length, name = String(index).padStart(3, '0')
    const started = { planHash: state.planHash, index, source, hypothesis, at: new Date().toISOString(), incumbent: state.incumbent, usedBefore: state.used }
    await writeFile(join(root, `rounds/${name}.started.json`), JSON.stringify({ value: started, hash: digest(started) }))
    const values = trials(state.plan, index > 0, index ? 'candidate' : 'baseline')
    if (pending) values.forEach(row => { row.judgeStatus = 'pending'; row.verdict = 'review-needed' })
    const output = join(root, `run-${name}`); await mkdir(output)
    for (const row of values) await writeFile(join(output, `${row.id}.json`), JSON.stringify({ ...judgedRecord(), caseId: row.id, prompt: config.cases.includes(row.caseId) ? 'train-data' : 'validation-secret', scenario: cases.find(value => value.id === row.caseId) }))
    await new EvaluationBudget(join(root, 'request-budget.json'), config.maxRequests).reserve('fixture')
    const before = state.incumbent === null ? undefined : state.rounds[state.incumbent].finished!
    const decision = assessCandidate(state.plan, values, before?.trials, before ? { current: 1, baseline: before.calls } : undefined)
    const result = { index, startHash: digest(started), at: new Date().toISOString(), exitCode: 0, issues: [], hashes: {}, originals: {}, trials: values, calls: 1, decision }
    await writeFile(join(root, `rounds/${name}.finished.json`), JSON.stringify({ value: result, hash: digest(result) }))
    return result
  })
}
it('automatically proposes against business transcripts, evaluates isolated candidates and exports only accepted code', async () => {
  const { root, source } = await setup(), runFixture = fixtureRound()
  const runRound = vi.fn(async (root: string, source: string, hypothesis: string) => {
    const result = await runFixture(root, source, hypothesis)
    if (!result.index) {
      const record = JSON.parse(await readFile(join(root, 'run-000/reviewed-operations-1.json'), 'utf8')) as EvaluationRecord
      const value = { previousHash: digest(result), result, reviews: [{ caseId: record.caseId, sampleHash: sampleHash(record), scorerVersion: SCORER_VERSION, source: 'human', reviewer: 'fixture-only', criteria: [{ criterion: record.scenario!.semantic[0], score: 0, evidence: ['user'], reason: 'fixture-reviewed-diagnosis' }] }] }
      await writeFile(join(root, 'rounds/000.review-001.json'), JSON.stringify({ value, hash: digest(value) }))
    }
    return result
  })
  const propose = vi.fn(async input => {
    const feedback = await readFile(join(input.context, 'development-feedback.json'), 'utf8')
    expect(feedback).not.toContain('validation-secret'); expect(feedback).toContain('fixture-reviewed-diagnosis')
    expect(feedback).toContain('hardChecks'); expect(feedback).toContain('"verdict": "failed"')
    return { receipt: { exitCode: 0, elapsedMs: 1 }, usage: null, proposal: { hypothesis: '夹具验证业务反馈接线', edits: [{ path: sourceFile, oldText: 'broken', newText: 'fixed' }] } }
  })
  const result = await runBusinessHillclimb(root, source, undefined, { runRound, propose })
  expect(result).toMatchObject({ incumbent: 1, sourceUnchanged: true, releaseApproved: false })
  expect(propose).toHaveBeenCalledTimes(1); expect(runRound).toHaveBeenCalledTimes(2)
  expect(await readFile(join(source, sourceFile), 'utf8')).toContain('broken')
  execFileSync('git', ['-C', source, 'apply', '--check', result.patch!])
  expect(await readFile(result.patch!, 'utf8')).toContain('fixed')
})
it('halts on pending business quality without invoking Codex or rerunning a reviewed baseline', async () => {
  const { root, source } = await setup(), runRound = fixtureRound(true), propose = vi.fn()
  expect((await runBusinessHillclimb(root, source, undefined, { runRound, propose })).stopReason).toBe('baseline-needs-review')
  expect((await runBusinessHillclimb(root, source, undefined, { runRound, propose })).stopReason).toBe('baseline-needs-review')
  expect(runRound).toHaveBeenCalledTimes(1); expect(propose).not.toHaveBeenCalled()
})
it('builds a zero-call review page preserving business inputs and semantic requirements', async () => {
  const parent = await mkdtemp(join(tmpdir(), 'boai-design-')); roots.push(parent)
  const result = await buildBusinessEval(join(parent, 'review'), config)
  expect(result.providerCalls).toBe(0)
  const page = await readFile(result.review, 'utf8')
  expect(page).toContain('reviewed-operations'); expect(page).toContain('语义评审标准'); expect(page).toContain('尚未校准')
})
it('does not replay an unknown Codex proposal and rejects source changes on resume', async () => {
  const { root, source } = await setup(), runRound = fixtureRound(), propose = vi.fn().mockRejectedValue(new Error('unknown-call'))
  await expect(runBusinessHillclimb(root, source, undefined, { runRound, propose })).rejects.toThrow('unknown-call')
  await expect(runBusinessHillclimb(root, source, undefined, { runRound, propose })).rejects.toThrow()
  expect(propose).toHaveBeenCalledTimes(1); expect(runRound).toHaveBeenCalledTimes(1)
  await writeFile(join(source, sourceFile), 'external-change')
  await expect(runBusinessHillclimb(root, source, undefined, { runRound, propose })).rejects.toThrow('原工作树')
})
