/*
 * [INPUT]: 预登记开发/回归题、固定采样/成本门槛、共享预算及逐轮原始服务记录。
 * [OUTPUT]: 真实业务开发/独立验证分组、区间与成本门禁、共享预算和只追加评审；旧无分组实验保留原描述性合同。
 * [POS]: tests/evaluation/optimization.ts，手动启动的持续优化实验控制层。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { mkdir, open, readFile, readdir, unlink, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { cases } from './cases'
import { DATASET_VERSION, SCORER_VERSION } from './schema'
import { compareTrials, digest, serviceTrial, summarizeTrials, type EvaluationTrial } from './experiment'
import { loadRecords } from './rescore'
import { calibrate, type CalibrationPair } from './calibration'
import type { ExternalReview } from './schema'
import { businessComparison, businessDecision } from './business'
import { writeReport } from './report'

const id = z.string().regex(/^[a-z0-9][a-z0-9-]*$/)
const calibrationPair = z.object({ sampleHash: z.string(), humanReviewer: z.string(), modelReviewer: z.string(), human: z.enum(['passed', 'failed']), model: z.enum(['passed', 'failed']), critical: z.boolean(), evidence: z.array(z.string()) }).strict()
const configuration = z.object({
  id, cases: z.array(id).min(1), samples: z.number().int().min(1).max(5),
  connectionId: z.string().min(1), dataPath: z.string().min(1),
  maxRequests: z.number().int().min(1).max(1000), maxRounds: z.number().int().min(1).max(10),
  stopAfterNoImprovement: z.number().int().min(1).max(10),
  minimumGain: z.number().positive().max(1), maxCallRatio: z.number().positive().max(10),
  allowedChanges: z.array(z.string().regex(/^src\/(runtime|shared)\/.+\.tsx?$/)).min(1),
  validationCases: z.array(id).min(1).optional(),
  goal: z.string().trim().min(1).max(8000).optional(),
  optimizerModel: z.string().regex(/^[\w.:-]+$/).optional(),
  judge: z.object({ connectionId: z.string().min(1), model: z.string().min(1), calibration: z.array(calibrationPair).max(1000).optional() }).strict().optional(),
}).strict()
export type OptimizationConfig = z.infer<typeof configuration>
type RegisteredCase = { id: string; cluster: string; split: string; contractHash: string }
export interface OptimizationPlan extends OptimizationConfig {
  version: 'boai-optimization-v1'; createdAt: string; evaluatorHash: string; scorerVersion: string; tasks: RegisteredCase[]
}
type Sealed<T> = { hash: string; value: T }
type Settings = { hashes: Record<string, string>; [key: string]: unknown }
interface Started { planHash: string; index: number; hypothesis: string; source: string; at: string; incumbent: number | null; usedBefore: number }
interface Finished {
  index: number; startHash: string; at: string; exitCode: number; issues: string[]; hashes: Record<string, string>
  originals: Record<string, string>; trials: EvaluationTrial[]; calls: number; modelSignature?: string; judgeReviewer?: string; decision: ReturnType<typeof assessCandidate>
}
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
async function json(path: string) { return JSON.parse(await readFile(path, 'utf8')) }
async function seal<T>(path: string, value: T) { await writeFile(path, JSON.stringify({ hash: digest(value), value }, null, 2), { flag: 'wx' }) }
async function unseal<T>(path: string): Promise<Sealed<T>> {
  const data = await json(path)
  if (!data.value || data.hash !== digest(data.value)) throw new Error(`实验登记或结果被修改：${path}`)
  return data
}
function evaluatorHash(hashes: Record<string, string>) { return digest(Object.entries(hashes).filter(([key]) => key.startsWith('evaluation:')).sort(([a], [b]) => a.localeCompare(b))) }
export async function currentEvaluatorHash() {
  const files = ['scripts/evaluate-collaboration.mjs', 'scripts/evaluation-experiment.mjs', 'scripts/judge-evaluation.mjs', ...(await readdir('tests/evaluation')).filter(file => /\.(ts|json)$/.test(file)).sort().map(file => `tests/evaluation/${file}`)]
  const hashes: Record<string, string> = {}
  for (const file of files) hashes[`evaluation:${file}`] = sha(await readFile(file))
  return evaluatorHash(hashes)
}
export function createPlan(input: OptimizationConfig, evaluator: string, now = new Date().toISOString()): OptimizationPlan {
  const config = configuration.parse(input)
  if (new Set(config.cases).size !== config.cases.length || new Set(config.allowedChanges).size !== config.allowedChanges.length) throw new Error('题目或允许修改的文件不能重复')
  if (config.allowedChanges.some(path => path.split('/').some(part => part === '..' || part === '.'))) throw new Error('允许修改项必须是仓库内的精确文件路径')
  if (config.stopAfterNoImprovement > config.maxRounds) throw new Error('停止轮次不能大于候选轮次上限')
  const allCases = [...config.cases, ...(config.validationCases ?? [])]
  if (new Set(allCases).size !== allCases.length) throw new Error('开发和独立验证题目不能重复或重叠')
  if (config.validationCases && !config.goal) throw new Error('业务优化必须明确目标')
  const tasks = allCases.map(id => {
    const scenario = cases.find(item => item.id === id)
    if (!scenario || scenario.split === 'holdout' || scenario.delivery) throw new Error(`持续优化仅接已登记普通开发/回归题；最终留出和独立交付协议不进入循环：${id}`)
    return { id, cluster: scenario.cluster, split: scenario.split, contractHash: digest({ dataset: digest({ version: DATASET_VERSION, scenario }), scenario }) }
  })
  if (config.validationCases) {
    const trainClusters = new Set(tasks.filter(task => config.cases.includes(task.id)).map(task => task.cluster))
    if (tasks.some(task => config.validationCases!.includes(task.id) && trainClusters.has(task.cluster))) throw new Error('同一任务簇不能跨开发和独立验证分组')
  }
  return { ...config, dataPath: resolve(config.dataPath), version: 'boai-optimization-v1', createdAt: now, evaluatorHash: evaluator, scorerVersion: SCORER_VERSION, tasks }
}
export async function registerExperiment(root: string, config: OptimizationConfig) {
  const plan = createPlan(config, await currentEvaluatorHash())
  await mkdir(root, { recursive: false }); await mkdir(join(root, 'rounds'))
  await seal(join(root, 'plan.json'), plan)
  return plan
}

function trialIssues(plan: OptimizationPlan, trials: EvaluationTrial[]) {
  const expected = new Set(plan.tasks.flatMap(task => Array.from({ length: plan.samples }, (_, index) => `${task.id}:${index + 1}`)))
  const seen = new Set<string>(), issues: string[] = []
  for (const trial of trials) {
    const key = `${trial.caseId}:${trial.sample}`, task = plan.tasks.find(task => task.id === trial.caseId)
    if (!expected.has(key) || seen.has(key)) issues.push(`未登记或重复样本：${key}`)
    seen.add(key)
    if (!task || task.contractHash !== trial.contractHash || task.cluster !== trial.cluster || task.split !== trial.split || trial.scorerVersion !== plan.scorerVersion) issues.push(`题目或评分合同变化：${key}`)
    if (!trial.attempted || trial.retry !== 0 || trial.source !== 'service' || trial.modelMode !== 'service-adapter' || trial.team !== 'multi' || !trial.sourceHash || !trial.modelSignature || !trial.budgetSignature || trial.issues.length) issues.push(`来源/执行/预算证据不完整：${key}`)
    if (trial.requests === null || !Number.isInteger(trial.requests) || trial.requests < 0 || trial.requestMetric !== 'provider-attempts') issues.push(`请求成本不完整：${key}`)
    if (trial.verdict !== 'passed' && trial.verdict !== 'failed') issues.push(`语义待评或证据不足：${key}`)
    if (plan.validationCases && trial.judgeStatus && !['human', 'model-assisted', 'not-required'].includes(trial.judgeStatus)) issues.push(`业务评分器尚未完成独立评审/校准：${key}`)
    if (trial.verdict === 'passed' && trial.technical !== 'passed') issues.push(`技术未通过不能判质量通过：${key}`)
  }
  for (const key of expected) if (!seen.has(key)) issues.push(`未执行计划样本：${key}`)
  for (const field of ['sourceHash', 'modelSignature'] as const) if (new Set(trials.map(trial => trial[field])).size > 1) issues.push(`同轮混有多个${field}`)
  for (const task of plan.tasks) if (new Set(trials.filter(trial => trial.caseId === task.id).map(trial => trial.budgetSignature)).size > 1) issues.push(`同题重复样本混有多个budgetSignature：${task.id}`)
  return issues
}

/** This is an observed development gate, not statistical certification or release approval. */
export function assessCandidate(plan: OptimizationPlan, current: EvaluationTrial[], baseline?: EvaluationTrial[], calls?: { current: number; baseline: number }) {
  const issues = [...trialIssues(plan, current), ...(baseline ? trialIssues(plan, baseline) : [])]
  const comparison = baseline ? compareTrials(current, baseline) : undefined
  if (comparison) issues.push(...comparison.issues)
  const result = (status: 'baseline' | 'blocked' | 'regressed' | 'no-improvement' | 'promising', reasons: string[]) => ({ status, reasons, comparison, business: plan.validationCases ? businessComparison(plan, current, baseline) : undefined, evidenceLevel: plan.validationCases ? 'fixed-business-suite' as const : 'observed-development-only' as const, releaseApproved: false as const })
  if (issues.length) return result('blocked', issues)
  if (!baseline) return result('baseline', ['仅登记基线；未比较候选'])
  if (!calls || !Number.isInteger(calls.current) || !Number.isInteger(calls.baseline) || calls.baseline < 1 || calls.current < 0) return result('blocked', ['缺少包含探针及失败调用的完整轮次预算'])
  if (current[0].sourceHash === baseline[0].sourceHash) return result('no-improvement', ['被测代码未变化；重复采样波动不能作为补丁提升'])
  if (plan.validationCases) {
    const decision = businessDecision(plan, current, baseline, calls)
    return { ...result(decision.status, decision.reasons), business: decision.business }
  }
  if (comparison!.pairs.some(pair => pair.delta! < 0)) return result('regressed', ['至少一个原通过样本退化；不以平均提升抵消'])
  if (calls.current > calls.baseline * plan.maxCallRatio) return result('regressed', ['候选实际请求成本超过登记比例'])
  if (comparison!.clusterMeanDelta! < plan.minimumGain) return result('no-improvement', ['观察到的按簇平均提升未达登记门槛'])
  if (plan.samples < 3 || new Set(plan.tasks.map(task => task.cluster)).size < 2) return result('blocked', ['探路批次样本不足；至少两个任务簇各三次才能给出开发候选建议'])
  return result('promising', ['开发样本达到预登记门槛；须另行验证、人工审阅及最终留出，不能据此发布'])
}

async function usedBudget(root: string, plan: OptimizationPlan) {
  let ledger
  try { ledger = await json(join(root, 'request-budget.json')) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 0; throw error }
  const values = Object.values(ledger.phases ?? {})
  if (ledger.limit !== plan.maxRequests || !Number.isInteger(ledger.used) || ledger.used < 0 || ledger.used > ledger.limit || values.some(value => !Number.isInteger(value) || Number(value) < 0) || values.reduce<number>((sum, value) => sum + Number(value), 0) !== ledger.used) throw new Error('共享实验预算损坏或上限被改变')
  return ledger.used as number
}
const roundName = (index: number) => String(index).padStart(3, '0')
export async function experimentStatus(root: string) {
  const registered = await unseal<OptimizationPlan>(join(root, 'plan.json')), plan = registered.value
  const names = (await readdir(join(root, 'rounds'))).filter(name => /^\d{3}\.started\.json$/.test(name)).sort()
  const rounds: { started: Started; finished?: Finished }[] = []
  for (const [index, name] of names.entries()) {
    const started = await unseal<Started>(join(root, 'rounds', name))
    if (started.value.planHash !== registered.hash || started.value.index !== index || name !== `${roundName(index)}.started.json`) throw new Error('轮次链不连续或计划hash不一致')
    let finished: Finished | undefined
    try { finished = (await unseal<Finished>(join(root, 'rounds', `${roundName(index)}.finished.json`))).value }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    if (finished) {
      let previousHash = digest(finished)
      const reviews = (await readdir(join(root, 'rounds'))).filter(file => file.startsWith(`${roundName(index)}.review-`) && file.endsWith('.json')).sort()
      for (const [reviewIndex, file] of reviews.entries()) {
        const revision = await unseal<{ previousHash: string; result: Finished; reviews: ExternalReview[]; calibration?: CalibrationPair[] }>(join(root, 'rounds', file))
        if (file !== `${roundName(index)}.review-${roundName(reviewIndex + 1)}.json` || revision.value.previousHash !== previousHash || digest(revision.value.result.originals) !== digest(finished.originals)) throw new Error('评审链不连续或修改了原始运行证据')
        finished = revision.value.result; previousHash = digest(finished)
      }
      if (finished.index !== index || finished.startHash !== started.hash) throw new Error('轮次结果不属于原登记')
      for (const [file, hash] of Object.entries(finished.originals)) {
        if (!/^(judge\/)?[a-zA-Z0-9-]+\.json$/.test(file) || sha(await readFile(join(root, `run-${roundName(index)}`, file))) !== hash) throw new Error('轮次原始证据已变化')
      }
    }
    rounds.push({ started: started.value, finished })
  }
  const used = await usedBudget(root, plan)
  let accounted = 0
  for (const round of rounds) {
    if (round.started.usedBefore !== accounted) throw new Error('轮次开始预算与前序累计不一致')
    if (!round.finished) break
    if (!Number.isInteger(round.finished.calls) || round.finished.calls < 0) throw new Error('轮次调用计量损坏')
    accounted += round.finished.calls
  }
  if (used < accounted || (rounds.every(round => !!round.finished) && used !== accounted)) throw new Error('共享预算被重置或存在未归属调用；不能继续实验')
  let incumbent: number | null = null, stale = 0
  for (const [index, round] of rounds.entries()) {
    if (round.finished?.decision.status === 'baseline' || round.finished?.decision.status === 'promising') { incumbent = index; stale = 0 }
    else if (index > 0) stale++
  }
  const stopReason = rounds.some(round => !round.finished) ? 'unfinished-round'
    : rounds.length && !rounds[0].finished?.trials.length ? 'baseline-unavailable'
    : rounds.length && incumbent === null ? 'baseline-needs-review'
    : plan.validationCases && rounds.at(-1)?.finished?.decision.status === 'blocked' ? 'candidate-needs-review-or-diagnostics'
    : used >= plan.maxRequests ? 'budget-exhausted'
    : rounds.length > plan.maxRounds ? 'round-limit'
    : stale >= plan.stopAfterNoImprovement ? 'no-improvement-limit' : null
  return { plan, planHash: registered.hash, rounds, used, incumbent, stale, stopReason }
}

export async function reviewExperimentRound(root: string, reviews: ExternalReview[], calibration?: CalibrationPair[]) {
  const lock = await open(join(root, '.lock'), 'wx')
  try {
    const state = await experimentStatus(root), index = state.rounds.length - 1, round = state.rounds[index]
    if (!round?.finished || !reviews.length) throw new Error('只能追加最后一轮的独立评审，不能重放未结束的实验')
    if (await currentEvaluatorHash() !== state.plan.evaluatorHash) throw new Error('评估器已变化；不能重写原实验结论')
    const calibrated = calibration && calibrate(calibration).status === 'passed' ? calibration[0].modelReviewer : undefined
    const rows = await loadRecords(join(root, `run-${roundName(index)}`), reviews, calibrated)
    if (state.plan.validationCases && reviews.some(review => review.source === 'model-assisted' && rows.some(row => row.record.caseId === review.caseId && review.reviewer === row.record.metadata.model))) throw new Error('独立judge不能与被测模型相同')
    if (state.plan.judge && reviews.some(review => review.source === 'model-assisted' && review.reviewer !== round.finished?.judgeReviewer)) throw new Error('评审模型身份与本轮登记judge不一致')
    if (new Set(reviews.map(review => review.caseId)).size !== reviews.length || reviews.some(review => !rows.some(row => row.record.caseId === review.caseId))) throw new Error('重复或不属于本轮的评审')
    const trials = rows.map(serviceTrial), incumbent = round.started.incumbent === null ? undefined : state.rounds[round.started.incumbent].finished
    const decision = assessCandidate(state.plan, trials, incumbent?.trials, incumbent ? { current: round.finished.calls, baseline: incumbent.calls } : undefined)
    if (round.finished.issues.length || round.finished.exitCode !== 0) { decision.status = 'blocked'; decision.reasons.push(...round.finished.issues, '独立评审不能覆盖原执行错误') }
    const result = { ...round.finished, trials, decision }
    const count = (await readdir(join(root, 'rounds'))).filter(file => file.startsWith(`${roundName(index)}.review-`)).length
    await seal(join(root, 'rounds', `${roundName(index)}.review-${roundName(count + 1)}.json`), { previousHash: digest(round.finished), result, reviews, calibration })
    return result
  } finally { await lock.close(); await unlink(join(root, '.lock')) }
}

export async function executeEvaluation(args: string[]) {
  const child = spawn(process.execPath, args[0] === '--judge' ? ['scripts/judge-evaluation.mjs', ...args.slice(1)] : ['scripts/evaluate-collaboration.mjs', ...args], { stdio: 'inherit' })
  const interrupt = () => child.kill('SIGINT')
  process.on('SIGINT', interrupt); process.on('SIGTERM', interrupt)
  try { return await new Promise<number>((done, reject) => { child.once('error', reject); child.once('exit', code => done(code ?? 1)) }) }
  finally { process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt) }
}
export async function runExperimentRound(root: string, source: string, hypothesis: string, execute = executeEvaluation) {
  root = resolve(root); source = resolve(source)
  if (!hypothesis.trim()) throw new Error('每轮必须登记可检验假设')
  const lock = await open(join(root, '.lock'), 'wx')
  try {
    const state = await experimentStatus(root), { plan } = state
    if (state.stopReason) throw new Error(`实验已停止：${state.stopReason}`)
    if (await currentEvaluatorHash() !== plan.evaluatorHash) throw new Error('评估器已变化；必须创建新实验，不能继续旧比较')
    const index = state.rounds.length, name = roundName(index), output = join(root, `run-${name}`)
    const started: Started = { planHash: state.planHash, index, hypothesis, source, at: new Date().toISOString(), incumbent: state.incumbent, usedBefore: state.used }
    await seal(join(root, 'rounds', `${name}.started.json`), started)
    const issues: string[] = [], originals: Record<string, string> = {}
    let hashes: Record<string, string> = {}, trials: EvaluationTrial[] = [], modelSignature: string | undefined, judgeReviewer: string | undefined, exitCode = 1, calls = 0
    const incumbent = state.incumbent === null ? undefined : state.rounds[state.incumbent].finished
    try {
      const args = ['--prepare', '--label', `${plan.id}-${name}`, '--source', source, '--output', output, '--cases', plan.tasks.map(task => task.id).join(','), '--samples', String(plan.samples), '--sample-start', '1', '--team', 'multi', '--connection', plan.connectionId, '--data', plan.dataPath, '--max-requests', String(plan.maxRequests), '--budget-file', join(root, 'request-budget.json')]
      if (incumbent?.modelSignature) args.push('--expected-model-signature', incumbent.modelSignature)
      if (await execute(args) !== 0) throw new Error('实验准备失败；未启动本轮评估')
      const settings = await json(join(output, 'settings.json')) as Settings; hashes = settings.hashes
      if (evaluatorHash(hashes) !== plan.evaluatorHash) throw new Error('准备时评估器hash变化')
      const initial = state.rounds[0]?.finished?.hashes
      if (initial) {
        const changed = [...new Set([...Object.keys(initial), ...Object.keys(hashes)])].filter(key => initial[key] !== hashes[key])
        if (changed.some(file => !plan.allowedChanges.includes(file))) throw new Error(`补丁超出允许范围：${changed.filter(file => !plan.allowedChanges.includes(file)).join(', ')}`)
      }
      await seal(join(output, 'arm-registration.json'), { planHash: state.planHash, startHash: digest(started), settings })
      exitCode = await execute(['--registered-settings', join(output, 'settings.json')])
      const verification = await json(join(output, 'input-verification.json'))
      if (digest(await json(join(output, 'settings.json'))) !== digest(settings)) issues.push('运行登记在执行期间变化')
      if (verification.exitCode !== 0 || !Array.isArray(verification.changed) || verification.changed.length) issues.push('运行失败或执行期间输入变化')
      let rows = await loadRecords(output)
      if (plan.judge && exitCode === 0) {
        const judgeDirectory = join(output, 'judge'); await mkdir(judgeDirectory)
        await saveJudgeSettings(judgeDirectory, { output: judgeDirectory, input: output, dataPath: plan.dataPath, connectionId: plan.judge.connectionId, expectedModel: plan.judge.model, budgetFile: join(root, 'request-budget.json'), maxRequests: plan.maxRequests })
        const judgeExit = await execute(['--judge', join(judgeDirectory, 'settings.json')])
        const judged = await json(join(judgeDirectory, 'result.json')); judgeReviewer = judged.reviewer
        if (judgeExit !== 0 || !judged.consistencyPassed) issues.push('judge执行失败或重复评分不一致；不能优化')
        const calibration = plan.judge.calibration
        const calibrated = calibration && calibrate(calibration).status === 'passed' ? calibration[0].modelReviewer : undefined
        rows = await loadRecords(output, await json(join(judgeDirectory, 'reviews.json')), calibrated)
        await writeReport(join(output, 'report-judged'), rows)
        for (const file of ['settings.json', 'result.json', 'reviews.json', 'progress.json']) originals[`judge/${file}`] = sha(await readFile(join(judgeDirectory, file)))
      }
      trials = rows.map(serviceTrial)
      if (await currentEvaluatorHash() !== plan.evaluatorHash) issues.push('业务运行或评分期间评估器变化')
      modelSignature = rows[0].record.metadata.modelSignature
      if (!modelSignature || rows.some(row => row.record.metadata.modelSignature !== modelSignature || digest(row.record.metadata.sourceHashes) !== digest(hashes) || row.record.metadata.requestLimit !== plan.maxRequests)) issues.push('样本配置与运行登记不一致')
      for (const file of ['settings.json', 'input-verification.json', 'summary.json', 'probe.json', ...rows.map(row => `${row.record.caseId}.json`)]) originals[file] = sha(await readFile(join(output, file)))
    } catch (error) { issues.push(error instanceof Error ? error.message : String(error)) }
    try { calls = await usedBudget(root, plan) - state.used; if (calls < 0 || calls < trials.reduce((sum, row) => sum + (row.requests ?? 0), 0)) issues.push('调用账本与样本不一致') }
    catch (error) { issues.push(String(error)) }
    const decision = assessCandidate(plan, trials, incumbent?.trials, incumbent ? { current: calls, baseline: incumbent.calls } : undefined)
    if (issues.length || exitCode !== 0) { decision.status = 'blocked'; decision.reasons.push(...issues, ...(exitCode !== 0 ? [`执行器退出${exitCode}`] : [])) }
    const finished: Finished = { index, startHash: digest(started), at: new Date().toISOString(), exitCode, issues, hashes, originals, trials, calls, modelSignature, judgeReviewer, decision }
    await seal(join(root, 'rounds', `${name}.finished.json`), finished)
    await writeFile(join(root, `round-${name}.md`), `# ${plan.id} · ${name}\n\n假设：${hypothesis}\n\n结果：${decision.status}；实际请求：${calls}。仅开发样本观察，不是发布批准。\n\n${decision.reasons.map(reason => `- ${reason}`).join('\n')}\n\n\`\`\`json\n${JSON.stringify(summarizeTrials(trials), null, 2)}\n\`\`\`\n`, { flag: 'wx' })
    return finished
  } finally { await lock.close(); await unlink(join(root, '.lock')) }
}
async function saveJudgeSettings(directory: string, value: unknown) { await writeFile(join(directory, 'settings.json'), JSON.stringify(value, null, 2), { flag: 'wx' }) }
