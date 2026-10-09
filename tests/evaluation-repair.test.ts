/*
 * [INPUT]: 固定开发检查、异常Vitest报告、越界建议、真实隔离测试与模拟Codex建议。
 * [OUTPUT]: 自动失败修复/拒绝/续迭代、原目录保护、测试不改判定、真实进程取消和证据完整性回归。
 * [POS]: tests/evaluation-repair.test.ts，模型建议使用明确夹具；真实Codex留证单独登记。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import { applyRepairEdits, compareRepairChecks, parseRepairReport, repairConfigSchema, type RepairEvaluation, type RepairProposal } from './evaluation/repair-contract'
import { runRepairLoop, repairStatus } from './evaluation/repair'
import { repairProcess, type RepairAgentRequest, type RepairAgentResult } from './evaluation/repair-process'

const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const config = { goal: 'Respect Unicode and blank text in the counter', allowedFiles: ['src/counter.ts'], tests: ['tests/counter.test.ts'], maxRounds: 2, maxNoImprovement: 2, typecheck: false, codexTimeoutMs: 10_000, totalTimeoutMs: 30_000 }
const good = "export const count = (text: string) => Array.from(text.replace(/\\s/gu, '')).length\n"
const bad = "export const count = (text: string) => text.length\n"
const proposal = (text = good): RepairProposal => ({ hypothesis: 'Count code points, excluding whitespace', edits: [{ path: 'src/counter.ts', oldText: bad, newText: text }] })
function evaluation(statuses: ('passed' | 'failed')[] = ['passed', 'failed']): RepairEvaluation {
  return { checks: statuses.map((status, index) => ({ key: String(index), file: config.tests[0], name: String(index), sample: 1, status, failures: status === 'failed' ? ['expected count'] : [] })), issues: [], typecheck: 'not-requested', evidence: [] }
}
function report() {
  return { numTotalTests: 2, numPassedTests: 1, numFailedTests: 1, numPendingTests: 0, numTodoTests: 0, success: false,
    testResults: [{ name: '/workspace/tests/counter.test.ts', status: 'failed', message: '', assertionResults: [{ fullName: 'empty', status: 'passed', failureMessages: [] }, { fullName: 'unicode', status: 'failed', failureMessages: ['expected 1'] }] }] }
}
it('requires exact source paths and freezes test selection independently of repairable files', () => {
  expect(repairConfigSchema.parse(config).repeats).toBe(1)
  for (const patch of [{ allowedFiles: ['../src/a.ts'] }, { allowedFiles: ['tests/counter.test.ts'] }, { tests: ['tests/holdout.test.ts'] }, { contextFiles: ['tests/evaluation/datasets.ts'] }, { contextFiles: ['.env'] }, { tests: [...config.tests, ...config.tests] }, { maxNoImprovement: 3 }]) expect(() => repairConfigSchema.parse({ ...config, ...patch })).toThrow()
})
it('applies all exact text edits in memory and rejects forbidden, ambiguous or unchanged edits', () => {
  expect(applyRepairEdits({ 'src/counter.ts': bad }, proposal(), config.allowedFiles)['src/counter.ts']).toBe(good)
  expect(() => applyRepairEdits({ 'src/counter.ts': bad + bad }, proposal(), config.allowedFiles)).toThrow('唯一')
  expect(() => applyRepairEdits({ 'src/counter.ts': bad }, { ...proposal(), edits: [{ path: config.tests[0], oldText: 'a', newText: 'b' }] }, config.allowedFiles)).toThrow('超出')
  expect(() => applyRepairEdits({ 'src/counter.ts': bad }, proposal(bad), config.allowedFiles)).toThrow('没有改变')
})
it('derives a fixed test denominator from the actual runner rather than the agent completion claim', () => {
  const parsed = parseRepairReport(report(), '/workspace', config.tests, 1, 1)
  expect(parsed.issues).toEqual([]); expect(parsed.checks.map(check => check.status)).toEqual(['passed', 'failed'])
})
it.each(['skip', 'missing', 'duplicate', 'empty', 'bad-count', 'uncaught', 'extra'])('blocks %s test reports instead of accepting a smaller passing set', kind => {
  const value = report()
  if (kind === 'skip') value.testResults[0].assertionResults[1].status = 'pending'
  if (kind === 'missing') value.testResults = []
  if (kind === 'duplicate') value.testResults[0].assertionResults.push(value.testResults[0].assertionResults[0])
  if (kind === 'empty') value.testResults[0].assertionResults = []
  if (kind === 'bad-count') value.numTotalTests = 1
  if (kind === 'uncaught') value.testResults[0].message = 'hook error'
  if (kind === 'extra') value.testResults[0].name = '/workspace/tests/other.test.ts'
  expect(parseRepairReport(value, '/workspace', config.tests, 1, 1).issues.length).toBeGreaterThan(0)
})
it('retains an improvement only when every original passing assertion stays passed', () => {
  expect(compareRepairChecks(evaluation(['passed', 'passed']), evaluation())).toMatchObject({ status: 'improved', allPassed: true, semanticQuality: 'not-assessed' })
  expect(compareRepairChecks(evaluation(['failed', 'passed']), evaluation()).status).toBe('rejected')
  const fewer = evaluation(['passed']); expect(compareRepairChecks(fewer, evaluation()).status).toBe('blocked')
  expect(compareRepairChecks({ ...evaluation(['passed', 'passed']), typecheck: 'failed' }, evaluation()).status).toBe('rejected')
})
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-repair-'))); roots.push(root)
  const source = join(root, 'source'); await mkdir(source); await mkdir(join(source, 'src')); await mkdir(join(source, 'tests'))
  await writeFile(join(source, 'src/counter.ts'), bad)
  await writeFile(join(source, 'tests/counter.test.ts'), "import { expect, it } from 'vitest'; import { count } from '../src/counter'; it('empty',()=>expect(count('')).toBe(0)); it('Unicode and whitespace',()=>expect(count(' 😀 ')).toBe(1));\n")
  await writeFile(join(source, 'package.json'), '{"type":"module"}')
  await writeFile(join(source, 'vitest.config.ts'), "import { defineConfig } from 'vitest/config'; export default defineConfig({test:{include:['tests/**/*.test.ts']}})")
  await symlink(await realpath('node_modules'), join(source, 'node_modules'), 'dir')
  execFileSync('git', ['init', '-q', source]); execFileSync('git', ['-C', source, 'add', 'src', 'tests', 'package.json', 'vitest.config.ts'])
  execFileSync('git', ['-C', source, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'core.hooksPath=/dev/null', 'commit', '-qm', 'fixture'])
  return { root, source, output: join(root, 'run') }
}
const agent = (value = proposal()) => vi.fn(async (_input: RepairAgentRequest): Promise<RepairAgentResult> => ({ proposal: value, receipt: { exitCode: 0, elapsedMs: 10 }, usage: { inputTokens: 10, outputTokens: 10, cachedInputTokens: 0 } }))
it('executes red→repair→green with actual frozen Vitest files and exports an applicable patch without editing the source', async () => {
  const { source, output } = await fixture(), propose = agent()
  const result = await runRepairLoop(source, output, config, undefined, { propose })
  expect(result).toMatchObject({ stopReason: 'checks-passed', codexInvocations: 1, patch: 'best.patch', sourceUnchanged: true })
  expect(result.rounds.map(round => round.status)).toEqual(['baseline', 'improved'])
  expect(await readFile(join(source, 'src/counter.ts'), 'utf8')).toBe(bad)
  execFileSync('git', ['-C', source, 'apply', '--check', join(output, 'best.patch')])
  expect((await repairStatus(output)).stopReason).toBe('checks-passed')
  await expect(runRepairLoop(source, output, config, undefined, { propose })).rejects.toThrow()
  expect(propose).toHaveBeenCalledTimes(1)
}, 20_000)
it('rejects a regression, feeds its failure into the next prompt, and retries from the last accepted code', async () => {
  const { source, output } = await fixture(); let calls = 0
  const propose = vi.fn(async (input: RepairAgentRequest): Promise<RepairAgentResult> => {
    calls++
    if (calls === 2) { expect(input.prompt).toContain('rejected'); expect(await readFile(join(input.context, 'src/counter.ts'), 'utf8')).toBe(bad) }
    return agent(proposal(calls === 1 ? 'export const count = (_text: string) => 1\n' : good))(input)
  })
  const result = await runRepairLoop(source, output, config, undefined, { propose })
  expect(result.stopReason).toBe('checks-passed'); expect(result.rounds.map(round => round.status)).toEqual(['baseline', 'rejected', 'improved'])
  expect(result.codexInvocations).toBe(2)
}, 20_000)
it('stops without Codex calls if the baseline is already green and preserves existing uncommitted input', async () => {
  const { source, output } = await fixture(); await writeFile(join(source, 'src/counter.ts'), good)
  const propose = agent(), result = await runRepairLoop(source, output, config, undefined, { propose })
  expect(result.stopReason).toBe('baseline-already-passed'); expect(propose).not.toHaveBeenCalled(); expect(result.patch).toBeNull()
}, 15_000)
it('does not promote a suggestion that tampers with the read-only context or a changed test file', async () => {
  const { source, output } = await fixture()
  const propose = async (input: RepairAgentRequest) => { await writeFile(join(input.context, config.tests[0]), 'changed'); return agent()(input) }
  const result = await runRepairLoop(source, output, config, undefined, { propose })
  expect(result.stopReason).toBe('blocked'); expect(result.patch).toBeNull(); expect(result.sourceUnchanged).toBe(true)
}, 15_000)
it('retains no-op attempts and stops at the fixed no-improvement limit', async () => {
  const { source, output } = await fixture(), propose = agent({ hypothesis: 'No justified change', edits: [] })
  const result = await runRepairLoop(source, output, config, undefined, { propose })
  expect(result).toMatchObject({ stopReason: 'no-improvement-limit', codexInvocations: 2, patch: null })
}, 15_000)
it('detects changed original results rather than silently re-scoring a successful attempt', async () => {
  const { source, output } = await fixture(); await runRepairLoop(source, output, config, undefined, { propose: agent() })
  await writeFile(join(output, 'round-000/tests-1.json'), '{}')
  await expect(repairStatus(output)).rejects.toThrow('证据被改写')
}, 20_000)
it('keeps failed Codex dispatch usage unknown and prevents an automatic retry', async () => {
  const { source, output } = await fixture(), propose = vi.fn(async () => { throw new Error('lost response') })
  const result = await runRepairLoop(source, output, config, undefined, { propose })
  expect(result).toMatchObject({ stopReason: 'error', codexInvocations: 1, usageComplete: false, patch: null })
  expect(propose).toHaveBeenCalledTimes(1)
}, 15_000)
it('rejects changed controller or patch artifacts during read-only status verification', async () => {
  const { source, output } = await fixture(); await runRepairLoop(source, output, config, undefined, { propose: agent() })
  const path = join(output, 'controller.mjs'), original = await readFile(path)
  await writeFile(path, 'modified')
  await expect(repairStatus(output)).rejects.toThrow('控制器')
  await writeFile(path, original); await writeFile(join(output, 'best.patch'), 'modified')
  await expect(repairStatus(output)).rejects.toThrow('补丁')
}, 20_000)
it('labels missing hashes in legacy runs as evidence gaps without inventing provenance', async () => {
  const { source, output } = await fixture(); await runRepairLoop(source, output, config, undefined, { propose: agent() })
  for (const file of ['plan.json', 'result.json']) {
    const path = join(output, file), value = JSON.parse(await readFile(path, 'utf8')); delete value.controllerHash; delete value.patchHash
    await writeFile(path, JSON.stringify(value))
  }
  const result = await repairStatus(output)
  expect('evidenceGaps' in result && result.evidenceGaps.length).toBe(2)
  expect(result.stopReason).toBe('checks-passed')
}, 20_000)
it('does not dispatch tests or Codex after cancellation was requested', async () => {
  const { source, output } = await fixture(), controller = new AbortController(), propose = agent(), evaluate = vi.fn(async () => evaluation())
  controller.abort()
  const result = await runRepairLoop(source, output, config, controller.signal, { propose, evaluate })
  expect(result).toMatchObject({ stopReason: 'cancelled', codexInvocations: 0, patch: null })
  expect(propose).not.toHaveBeenCalled(); expect(evaluate).not.toHaveBeenCalled()
})
it('preserves Codex proxy routing without inheriting unrelated application secrets', async () => {
  vi.stubEnv('HTTPS_PROXY', 'http://127.0.0.1:12345'); vi.stubEnv('BOAI_EVAL_API_KEY', 'fixture-secret-not-forwarded')
  try {
    const result = await repairProcess({ command: process.execPath, args: ['-e', 'process.stdout.write(JSON.stringify({proxy:!!process.env.HTTPS_PROXY,privateKey:!!process.env.BOAI_EVAL_API_KEY}))'], cwd: process.cwd(), timeoutMs: 5000, signal: new AbortController().signal, codex: true })
    expect(JSON.parse(result.stdout)).toEqual({ proxy: true, privateKey: false })
  } finally { vi.unstubAllEnvs() }
})
it('kills a timed-out process group, retains the failure and never interprets timeout as success', async () => {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-repair-process-'))); roots.push(root)
  const result = await repairProcess({ command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], cwd: root, timeoutMs: 150, signal: new AbortController().signal })
  expect(result.exitCode).not.toBe(0); expect(result.failure).toContain('期限')
}, 10_000)
