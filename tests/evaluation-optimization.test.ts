/*
 * [INPUT]: 登记计划、完整/缺失/待评样本、模拟逐轮执行和真实零调用准备CLI。
 * [OUTPUT]: 固定题目/预算/补丁范围、按簇门禁、停止/中断与只追加评审的意图回归；夹具标签不作为真实人工校准。
 * [POS]: tests/evaluation-optimization.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assessCandidate, createPlan, executeEvaluation, experimentStatus, registerExperiment, reviewExperimentRound, runExperimentRound, type OptimizationConfig, type OptimizationPlan } from './evaluation/optimization'
import { digest, type EvaluationTrial } from './evaluation/experiment'
import { EvaluationBudget } from './evaluation/budget'
import { cases } from './evaluation/cases'
import { DATASET_VERSION, SCORER_VERSION, type EvaluationRecord, type ExternalReview } from './evaluation/schema'
import { sampleHash } from './evaluation/checks'
import { runEvaluation } from './evaluation/harness'

const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const config: OptimizationConfig = { id: 'fixture', cases: ['legal-silence', 'explicit-mention'], samples: 3, connectionId: 'fixture-only', dataPath: '/fixture-no-credentials',
  maxRequests: 30, maxRounds: 3, stopAfterNoImprovement: 2, minimumGain: 0.1, maxCallRatio: 1.1, allowedChanges: ['packages/runtime/src/adapters/mastra/prompts.ts'] }
const plan = () => createPlan(config, 'fixture-evaluator')
function trials(plan: OptimizationPlan, sourceHash = 'candidate', verdict: EvaluationTrial['verdict'] = 'passed'): EvaluationTrial[] {
  return plan.tasks.flatMap(task => Array.from({ length: plan.samples }, (_, index) => ({
    id: `${task.id}-${index + 1}`, caseId: task.id, sample: index + 1, retry: 0, cluster: task.cluster, split: task.split,
    source: 'service', modelMode: 'service-adapter', attempted: true, technical: 'passed', verdict, contractHash: task.contractHash,
    modelSignature: 'model', budgetSignature: 'fixed-budget', sourceHash, team: 'multi', scorerVersion: SCORER_VERSION, sampleHash: `sample-${task.id}-${index}`,
    requests: 1, requestMetric: 'provider-attempts', totalTokens: null, knownTokens: null, durationMs: 1000, evidence: ['fixture'], issues: [],
  })))
}
it('registers fixed cases and refuses final holdout, duplicates, path escapes and incompatible delivery protocol', () => {
  expect(plan().tasks).toHaveLength(2)
  for (const changes of [{ cases: [cases.find(row => row.split === 'holdout')!.id] }, { cases: ['legal-silence', 'legal-silence'] }, { allowedChanges: ['packages/runtime/src/../outside.ts'] }, { stopAfterNoImprovement: 4 }, { cases: ['unknown'] }, { maxRequests: 1001 }]) {
    expect(() => createPlan({ ...config, ...changes }, 'hash')).toThrow()
  }
})
it('uses cluster-balanced paired observations and never turns a development suggestion into release approval', () => {
  const p = plan(), before = trials(p, 'baseline', 'failed'), after = trials(p)
  expect(assessCandidate(p, after, before, { current: 7, baseline: 7 })).toMatchObject({ status: 'promising', releaseApproved: false, evidenceLevel: 'observed-development-only', comparison: { clusterMeanDelta: 1 } })
  expect(assessCandidate(p, after, before, { current: 8, baseline: 7 }).status).toBe('regressed')
  expect(assessCandidate(p, after, before).status).toBe('blocked')
})
it('rejects one regressed pair even when the overall average improves', () => {
  const p = plan(), before = trials(p, 'baseline', 'failed'), after = trials(p)
  before[0].verdict = 'passed'; after[0].verdict = 'failed'
  expect(assessCandidate(p, after, before, { current: 6, baseline: 6 }).status).toBe('regressed')
})
it.each(['missing', 'duplicate', 'pending', 'contract', 'budget', 'retry', 'unrun', 'extra', 'mixed-code', 'unknown-cost', 'failed-technical'])('blocks %s evidence without dropping planned failures', mode => {
  const p = plan(), before = trials(p, 'baseline', 'failed'), after = trials(p)
  if (mode === 'missing') after.pop()
  if (mode === 'duplicate') after.push(after[0])
  if (mode === 'pending') after[0].verdict = 'review-needed'
  if (mode === 'contract') after[0].contractHash = 'easier-question'
  if (mode === 'budget') after[0].budgetSignature = 'larger-budget'
  if (mode === 'retry') after[0].retry = 1
  if (mode === 'unrun') after[0].attempted = false
  if (mode === 'extra') after[0].caseId = 'unplanned'
  if (mode === 'mixed-code') after[0].sourceHash = 'another-patch'
  if (mode === 'unknown-cost') after[0].requests = null
  if (mode === 'failed-technical') after[0].technical = 'failed'
  expect(assessCandidate(p, after, before, { current: 6, baseline: 6 }).status).toBe('blocked')
})
it('does not promote a noisy unchanged build or a tiny pilot', () => {
  const p = plan(), before = trials(p, 'baseline', 'failed'), after = trials(p, 'baseline')
  expect(assessCandidate(p, after, before, { current: 6, baseline: 6 }).status).toBe('no-improvement')
  const small = createPlan({ ...config, samples: 1 }, 'hash')
  expect(assessCandidate(small, trials(small), trials(small, 'baseline', 'failed'), { current: 2, baseline: 2 }).status).toBe('blocked')
})

async function setup(overrides: Partial<OptimizationConfig> = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'boai-optimize-')); roots.push(directory)
  const root = join(directory, 'experiment'); await registerExperiment(root, { ...config, cases: ['legal-silence'], samples: 1, ...overrides })
  return root
}
/** The execution half is a labeled fixture. Preparation uses the actual CLI without credentials/model calls. */
function fixtureExecutor(root: string, failed = true, mutate?: (settings: any) => void) {
  return vi.fn(async (args: string[]) => {
    if (args.includes('--prepare')) {
      const code = await executeEvaluation(args)
      if (mutate && code === 0) {
        const path = join(args[args.indexOf('--output') + 1], 'settings.json'), settings = JSON.parse(await readFile(path, 'utf8'))
        mutate(settings); await writeFile(path, JSON.stringify(settings))
      }
      return code
    }
    const settings = JSON.parse(await readFile(args[1], 'utf8')), scenario = cases.find(row => row.id === 'legal-silence')!
    const budget = new EvaluationBudget(join(root, 'request-budget.json'), settings.maxRequests)
    await budget.reserve('connection'); await budget.reserve('decision')
    const members = [0, 1, 2].map(index => ({ id: `member-${index}`, name: '夹具', role: '测试' }))
    const record: EvaluationRecord = { caseId: 'legal-silence-1', scenario, prompt: scenario.prompt, startedAt: 500, sentAt: 1000, elapsedMs: 1000,
      metadata: { label: settings.label, revision: 'fixture', sourceHashes: settings.hashes, model: 'fixture-model', provider: 'fixture-only', modelSignature: 'fixture-model-signature', members, datasetHash: digest({ version: DATASET_VERSION, scenario }), team: 'multi', requestLimit: settings.maxRequests },
      requests: [{ startedAt: 1000, phase: 'decision', runId: 'run', status: 200 }], artifacts: [], runtimeErrors: [],
      detail: { messages: [{ id: 'user', senderType: 'user', createdAt: new Date(1000).toISOString(), content: scenario.prompt }],
        turns: [{ id: 'turn', status: failed ? 'failed' : 'completed', createdAt: new Date(1000).toISOString() }], runs: [], workItems: [],
        decisions: members.map(member => ({ agentId: member.id, turnId: 'turn', deliveryId: member.id })),
        deliveries: members.map(member => ({ id: member.id, eventId: 'event' })), events: [{ id: 'event', type: 'user_message' }],
      } as unknown as EvaluationRecord['detail'] }
    await writeFile(join(settings.output, 'legal-silence-1.json'), JSON.stringify(record))
    for (const file of ['summary.json', 'probe.json']) await writeFile(join(settings.output, file), '{}')
    await writeFile(join(settings.output, 'input-verification.json'), JSON.stringify({ changed: [], exitCode: 0 }))
    return 0
  })
}
it('runs baseline and candidates through one ledger, stops on registered flat rounds and retains every failure', async () => {
  const root = await setup(), execute = fixtureExecutor(root)
  expect((await runExperimentRound(root, '.', '夹具基线', execute)).decision.status).toBe('baseline')
  expect((await runExperimentRound(root, '.', '无修改重复对照1', execute)).decision.status).toBe('no-improvement')
  expect((await runExperimentRound(root, '.', '无修改重复对照2', execute)).decision.status).toBe('no-improvement')
  const status = await experimentStatus(root)
  expect(status).toMatchObject({ used: 6, stopReason: 'no-improvement-limit' }); expect(status.rounds).toHaveLength(3)
  expect(status.rounds.every(round => round.finished!.trials[0].verdict === 'failed')).toBe(true)
  await expect(runExperimentRound(root, '.', '不能加轮', execute)).rejects.toThrow('停止')
  expect(execute).toHaveBeenCalledTimes(6)
}, 20_000)
it('rejects changes outside the registered patch scope before the execution half', async () => {
  const root = await setup(); await runExperimentRound(root, '.', '基线', fixtureExecutor(root))
  const execute = fixtureExecutor(root, true, settings => { settings.hashes['packages/shared/src/domain.ts'] = 'outside-scope' })
  const result = await runExperimentRound(root, '.', '越界修改夹具', execute)
  expect(result.decision.status).toBe('blocked'); expect(result.issues.join(' ')).toContain('超出允许范围'); expect(result.calls).toBe(0)
  expect(execute).toHaveBeenCalledTimes(1)
}, 20_000)
it('retains pending quality, accepts only appended evidence-bound fixture human labels and never reruns the sample', async () => {
  const root = await setup(), execute = fixtureExecutor(root, false)
  const pending = await runExperimentRound(root, '.', '待评夹具', execute)
  expect(pending.decision.status).toBe('blocked'); expect((await experimentStatus(root)).stopReason).toBe('baseline-needs-review')
  const record = JSON.parse(await readFile(join(root, 'run-000/legal-silence-1.json'), 'utf8')) as EvaluationRecord
  const review: ExternalReview = { caseId: record.caseId, sampleHash: sampleHash(record), scorerVersion: SCORER_VERSION, source: 'model-assisted', reviewer: 'fixture-not-real-human', criteria: record.scenario!.semantic.map(criterion => ({ criterion, score: 2, evidence: ['user'], reason: '仅自动测试夹具标签' })) }
  expect((await reviewExperimentRound(root, [review])).decision.status).toBe('blocked')
  expect((await reviewExperimentRound(root, [{ ...review, source: 'human' }])).decision.status).toBe('baseline')
  expect((await experimentStatus(root)).used).toBe(2); expect(execute).toHaveBeenCalledTimes(2)
  const saved = JSON.parse(await readFile(join(root, 'rounds/000.finished.json'), 'utf8'))
  expect(saved.value.decision.status).toBe('blocked'); expect((await readdir(join(root, 'rounds'))).filter(file => file.includes('review-'))).toHaveLength(2)
}, 20_000)
it('refuses replay after an unfinished round, detects tampering and never extends an exhausted shared budget', async () => {
  const root = await setup({ maxRequests: 2 }); await runExperimentRound(root, '.', '耗尽预算', fixtureExecutor(root))
  expect((await experimentStatus(root)).stopReason).toBe('budget-exhausted')
  await expect(runExperimentRound(root, '.', '追加调用')).rejects.toThrow('停止')
  const evidence = join(root, 'run-000/legal-silence-1.json'); await writeFile(evidence, '{}')
  await expect(experimentStatus(root)).rejects.toThrow('证据已变化')
  const interrupted = await setup(); await runExperimentRound(interrupted, '.', '中断夹具', fixtureExecutor(interrupted))
  await rm(join(interrupted, 'rounds/000.finished.json'))
  expect((await experimentStatus(interrupted)).stopReason).toBe('unfinished-round')
  await expect(runExperimentRound(interrupted, '.', '不重试')).rejects.toThrow('停止')
}, 20_000)
it('rejects concurrent starts and modified preregistration', async () => {
  const root = await setup(); await writeFile(join(root, '.lock'), '')
  await expect(runExperimentRound(root, '.', '竞争')).rejects.toThrow()
  await rm(join(root, '.lock'))
  const path = join(root, 'plan.json'), saved = JSON.parse(await readFile(path, 'utf8')); saved.value.maxRequests++
  await writeFile(path, JSON.stringify(saved)); await expect(experimentStatus(root)).rejects.toThrow('被修改')
})
it('does not allow a missing or reset ledger to replenish a completed round', async () => {
  const root = await setup(); await runExperimentRound(root, '.', '账本核验夹具', fixtureExecutor(root))
  await rm(join(root, 'request-budget.json'))
  await expect(experimentStatus(root)).rejects.toThrow('预算被重置')
  await expect(runExperimentRound(root, '.', '不得重置预算')).rejects.toThrow('预算被重置')
}, 20_000)
it('rejects changed model configuration before any provider call', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('must not call'))
  await expect(runEvaluation({ settings: { expectedModelSignature: 'registered-model' }, connection: { provider: 'fixture', baseUrl: 'http://127.0.0.1', defaultModel: 'changed' } } as never, {} as never)).rejects.toThrow('未启动供应商')
  expect(fetch).not.toHaveBeenCalled()
})
