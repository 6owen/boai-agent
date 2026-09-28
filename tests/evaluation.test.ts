/*
 * [INPUT]: 完整/缺损/失败评估证据、原始文件、外部评审和跨批次预算。
 * [OUTPUT]: 防止假通过的评分回归、离线重评分/HTML安全、留出冻结与独立校准门禁。
 * [POS]: tests/evaluation.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, rm, writeFile, access } from 'node:fs/promises'
import { createServer } from 'node:http'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { scoreRecord, sampleHash } from './evaluation/checks'
import { compareResults, summarize, writeReport } from './evaluation/report'
import { loadRecords } from './evaluation/rescore'
import { EvaluationBudget } from './evaluation/budget'
import { cases, holdoutCases } from './evaluation/cases'
import { calibrate, type CalibrationPair } from './evaluation/calibration'
import { datasetManifest, validateFrozenHoldout } from './evaluation/matrix'
import { teamScorer } from './evaluation/scorers'
import type { ArtifactEvidence, EvaluationCase, EvaluationRecord, ExternalReview } from './evaluation/schema'
import { SCORER_VERSION } from './evaluation/schema'
import { runEvaluation } from './evaluation/harness'
import { AppService } from '../src/runtime/service'
import { MastraEngine } from '../src/runtime/adapters/mastra/engine'
const roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function temporary() { const root = await mkdtemp(join(tmpdir(), 'boai-eval-')); roots.push(root); return root }
const scenario: EvaluationCase = { id: 'objective', matrixId: 'B04', members: 1, prompt: '计算实际净额', criterion: '真实产物', split: 'development', category: 'B', cluster: 'sales', checks: [{ kind: 'json-fields', name: 'result.json', fields: { net: 230 } }], semantic: [] }
function artifact(content = '{"net":230}'): ArtifactEvidence { return { id: 'artifact', name: 'result.json', path: '/isolated/shared/result.json', size: Buffer.byteLength(content), ownerAgentId: 'member', runId: 'run', publishedAt: new Date(3000).toISOString(), content, bytes: Buffer.byteLength(content), complete: true, sha256: createHash('sha256').update(content).digest('hex') } }
function record(): EvaluationRecord {
  // Minimal persisted fields used by the scoring contract; product persistence is tested separately.
  return { caseId: 'objective-1', prompt: scenario.prompt, scenario, startedAt: 500, sentAt: 1000, elapsedMs: 3000, metadata: { label: 'test', revision: 'test', sourceHashes: {}, datasetHash: 'same-contract', model: 'local', provider: 'fixture', members: [{ id: 'member', name: '员工', role: '计算' }] }, requests: [{ startedAt: 1500, phase: 'execution', runId: 'run', status: 200 }], runtimeErrors: [], artifacts: [artifact()],
    detail: { messages: [{ id: 'user', senderType: 'user', status: 'completed', content: scenario.prompt, createdAt: new Date(1000).toISOString(), sequence: 1 }, { id: 'reply', turnId: 'turn', runId: 'run', senderType: 'agent', senderId: 'member', status: 'completed', content: '净额230', sequence: 2, createdAt: new Date(1500).toISOString() }], turns: [{ id: 'turn', status: 'completed', createdAt: new Date(1000).toISOString(), finishedAt: new Date(3500).toISOString() }], runs: [{ id: 'run', agentId: 'member', turnId: 'turn', phase: 'execution', status: 'completed', toolEvents: [], finishedAt: new Date(3000).toISOString() }], workItems: [], workWakes: [] } as unknown as NonNullable<EvaluationRecord['detail']> }
}
it('requires a real complete artifact with correct business values instead of a completion claim', () => {
  const evidence = record()
  expect(scoreRecord(evidence, scenario)).toMatchObject({ verdict: 'passed', firstReplyMs: 2000, lastReplyMs: 2000, turnCompletedMs: 2500, totalTokens: null })
  evidence.artifacts = []; expect(scoreRecord(evidence, scenario).verdict).toBe('failed')
  evidence.artifacts = [artifact('{"net":250}')]; expect(scoreRecord(evidence, scenario).verdict).toBe('failed')
})
it('never upgrades truncated legacy content or a forged artifact hash to passed', () => {
  const evidence = record(); delete evidence.artifacts[0].complete
  expect(scoreRecord(evidence, scenario).verdict).toBe('incomplete')
  evidence.artifacts[0].complete = true; evidence.artifacts[0].content = '{"net":999}'
  expect(scoreRecord(evidence, scenario).verdict).toBe('failed')
})
it('separates a delivered goal, recovered runtime error, failed execution and unknown usage', () => {
  const evidence = record(); evidence.runtimeErrors.push('earlier malformed JSON, recovered')
  expect(scoreRecord(evidence, scenario)).toMatchObject({ verdict: 'passed', runtimeErrors: evidence.runtimeErrors, totalTokens: null, usageCoverage: null })
  evidence.metrics = { usage: { reported: { totalTokens: 10 }, totalRuns: 2, runsReportingEachField: { totalTokens: 1 } } }
  expect(scoreRecord(evidence, scenario)).toMatchObject({ totalTokens: null, usageCoverage: 0.5 })
  evidence.detail!.turns![0].status = 'budget_exhausted'
  expect(scoreRecord(evidence, scenario)).toMatchObject({ executionStatus: 'failed', goalVerdict: 'passed', verdict: 'failed' })
})
it('rejects forbidden tools and unexpected replies even if the numeric answer is correct', () => {
  const evidence = record(); evidence.detail!.runs[0].toolEvents.push({ id: 'tool', name: 'write_file', status: 'completed', detail: 'result.json', createdAt: new Date(2000).toISOString() })
  expect(scoreRecord(evidence, { ...scenario, checks: [{ kind: 'no-tools' }] }).verdict).toBe('failed')
  expect(scoreRecord(evidence, { ...scenario, checks: [{ kind: 'no-replies' }] }).verdict).toBe('failed')
})
it('requires evidence that a fault injection actually happened', () => {
  const evidence = record(), injected = { ...scenario, checks: [{ kind: 'event-hit' as const, id: 'wrong-child' }] }
  expect(scoreRecord(evidence, injected).verdict).toBe('incomplete')
  evidence.events = [{ id: 'wrong-child', action: 'replace-child-output', at: 2000, trigger: 'child-run', status: 'failed' }]
  expect(scoreRecord(evidence, injected).verdict).toBe('failed')
  evidence.events[0].status = 'applied'; expect(scoreRecord(evidence, injected).verdict).toBe('passed')
})
it('checks final delivery after the child instead of mistaking a parent waiting update for its result', () => {
  const evidence = record(), detail = evidence.detail!
  detail.messages.push({ ...detail.messages[1], id: 'child-result', sequence: 3 }, { ...detail.messages[1], id: 'final-result', sequence: 4 })
  detail.workItems = [{ id: 'parent', status: 'delivered', observedResults: [{ workId: 'child', resultVersion: 1 }], resultMessageIds: ['reply','final-result'] }, { id: 'child', parentWorkId: 'parent', status: 'delivered', resultMessageIds: ['child-result'] }] as NonNullable<typeof detail.workItems>
  detail.workWakes = [{ id: 'wake', workId: 'parent', waitRevision: 1, status: 'consumed', requiredResults: [{ workId: 'child', resultVersion: 1 }] }] as NonNullable<typeof detail.workWakes>
  const contract = { ...scenario, checks: [{ kind: 'delegation' as const }] }
  expect(scoreRecord(evidence, contract).verdict).toBe('passed')
  detail.workItems[0].observedResults = []
  expect(scoreRecord(evidence, contract).verdict).toBe('failed')
})
it('requires the final report to match the actual reviewed bytes and to be published after review', () => {
  const evidence = record(), detail = evidence.detail!, draft = { ...artifact('净额230，排除取消订单并按编号去重。'), id: 'draft', name: 'draft.md', path: '/isolated/shared/draft.md' }
  evidence.artifacts = [draft, { ...draft, id: 'final', name: 'report.md', path: '/isolated/shared/report.md', publishedAt: new Date(4000).toISOString() }]
  detail.conversation = { workspacePath: '/isolated/shared' } as typeof detail.conversation
  evidence.metadata.members[0].role = '审核员'
  detail.runs[0].toolEvents = [{ id: 'read', name: 'read_file', status: 'completed', detail: JSON.stringify({ path: 'shared:/draft.md', content: draft.content }), createdAt: new Date(2000).toISOString() }]
  const contract = { ...scenario, checks: [{ kind: 'review-lineage' as const }] }
  expect(scoreRecord(evidence, contract).verdict).toBe('passed')
  evidence.artifacts[1].publishedAt = new Date(2500).toISOString(); expect(scoreRecord(evidence, contract).verdict).toBe('failed')
  detail.runs[0].toolEvents[0].detail = '{truncated'; expect(scoreRecord(evidence, contract).verdict).toBe('incomplete')
})
it('accepts only evidence-bound independent reviews and keeps uncalibrated model reviews pending', () => {
  const evidence = record(), judged = { ...scenario, semantic: ['事实有据'] }
  expect(scoreRecord(evidence, judged).verdict).toBe('review-needed')
  const review: ExternalReview = { caseId: evidence.caseId, sampleHash: sampleHash(evidence), scorerVersion: SCORER_VERSION, source: 'human', reviewer: 'reviewer-one', criteria: [{ criterion: '事实有据', score: 2, evidence: ['artifact'], reason: '核对原始销售资料和净额计算' }] }
  expect(scoreRecord(evidence, judged, review).verdict).toBe('passed')
  expect(scoreRecord(evidence, judged, { ...review, sampleHash: 'another-sample' }).verdict).toBe('incomplete')
  expect(scoreRecord(evidence, judged, { ...review, criteria: [{ ...review.criteria[0], evidence: ['invented'] }] }).verdict).toBe('incomplete')
  expect(scoreRecord(evidence, judged, { ...review, source: 'model-assisted' }).verdict).toBe('review-needed')
  expect(scoreRecord(evidence, judged, { ...review, source: 'model-assisted' }, true).verdict).toBe('passed')
})
it('does not silently compare different models or exclude failed samples from the denominator', () => {
  const evidence = record(), good = { record: evidence, score: scoreRecord(evidence, scenario) }
  const bad = { record: { ...evidence, error: 'timeout' }, score: scoreRecord({ ...evidence, error: 'timeout' }, scenario) }
  expect(summarize([good.score, bad.score])).toMatchObject({ started: 2, passed: 1, failed: 1, totalTokens: null })
  expect(compareResults([good], [{ ...bad, record: { ...bad.record, metadata: { ...bad.record.metadata, model: 'different' } } }])[0].comparable).toBe(false)
})
it('re-scores stored records without fetching or rerunning agents and retains corrupt samples', async () => {
  const root = await temporary(), evidence = record(); await writeFile(join(root, 'objective-1.json'), JSON.stringify(evidence)); await writeFile(join(root, 'objective-2.json'), '{broken')
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network in offline scorer'))
  const rows = await loadRecords(root)
  expect(rows.map(row => row.score.verdict)).toEqual(['passed', 'incomplete']); expect(fetch).not.toHaveBeenCalled()
})
it('escapes untrusted model output in the HTML report and makes pending review visible', async () => {
  const root = await temporary(), evidence = record(); evidence.detail!.messages[1].content = '<script>alert(1)</script>'
  const summary = await writeReport(root, [{ record: evidence, score: scoreRecord(evidence, { ...scenario, semantic: ['需要评审'] }) }])
  expect(summary.reviewNeeded).toBe(1); expect(summary.passed).toBe(0)
  const html = await readFile(join(root, 'index.html'), 'utf8'); expect(html).not.toContain('<script>alert(1)</script>'); expect(html).toContain('&lt;script&gt;')
})
it('uses a single atomic request ceiling across batches and charges connection, failed and judge attempts', async () => {
  const root = await temporary(), path = join(root, 'budget.json'), first = new EvaluationBudget(path, 3), second = new EvaluationBudget(path, 3)
  const attempts = await Promise.allSettled([first.reserve('connection'), second.reserve('failed-decision'), first.reserve('judge'), second.reserve('execution')])
  expect(attempts.filter(result => result.status === 'fulfilled')).toHaveLength(3)
  const ledger = JSON.parse(await readFile(path, 'utf8')); expect(ledger.used).toBe(3); expect(Object.values(ledger.phases).reduce((a: number, b) => a + Number(b), 0)).toBe(3)
  await expect(new EvaluationBudget(path, 4).reserve('execution')).rejects.toThrow('不能改变')
})
it('requires 20 distinct human labels and rejects even one critical false pass', () => {
  const pairs: CalibrationPair[] = Array.from({ length: 20 }, (_, i) => ({ sampleHash: createHash('sha256').update(String(i)).digest('hex'), humanReviewer: 'human', modelReviewer: 'judge-v1', human: 'passed', model: 'passed', critical: false, evidence: ['sample:result'] }))
  expect(calibrate(pairs.slice(1)).status).toBe('incomplete'); expect(calibrate([...pairs.slice(1), pairs[1]]).status).toBe('incomplete')
  expect(calibrate(pairs).status).toBe('incomplete')
  pairs[0] = { ...pairs[0], human: 'failed', model: 'failed', critical: true }
  expect(calibrate(pairs).status).toBe('passed'); pairs[0].model = 'passed'; expect(calibrate(pairs).status).toBe('failed')
})
it('scores the complete team through the installed Mastra scorer without extra model calls', async () => {
  const score = scoreRecord(record(), scenario)
  expect((await teamScorer.run({ input: scenario, output: score })).score).toBe(1)
  expect((await teamScorer.run({ input: scenario, output: { ...score, verdict: 'review-needed' } })).score).toBe(0)
})
it('keeps 16 independent frozen holdout clusters and validates every matrix entry path', async () => {
  await validateFrozenHoldout(); expect(holdoutCases).toHaveLength(16); expect(new Set(holdoutCases.map(item => item.cluster)).size).toBe(16)
  expect(new Set(cases.map(item => item.id)).size).toBe(cases.length)
  const manifest = datasetManifest(); expect(manifest.matrix).toHaveLength(32)
  for (const row of manifest.matrix) { expect(row.protocol.length + row.desktop.length + row.realCases.length).toBeGreaterThan(0); for (const file of [...row.protocol, ...row.desktop]) await access(file) }
})
it('runs actual AppService and Mastra through the harness, retaining real artifacts, event input and every HTTP request', async () => {
  const root = await temporary(); let calls = 0
  const errors: string[] = []
  const server = createServer(async (request, response) => {
    try {
      let text = ''; for await (const part of request) text += part
      const body = JSON.parse(text), messages = body.messages as { role: string; content: string }[], system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
      calls++; let content = 'connected', tool: { name: string; arguments: string } | undefined
      if (system.includes('Private participation decision')) {
        const data = JSON.parse(messages.at(-1)!.content).data, prompt = data.currentTurnMessages.find((message: { isRootRequest?: boolean }) => message.isRootRequest)?.content ?? ''
        const eligible = prompt.includes('两个独立部分') ? ['researcher','writer'].includes(data.currentEmployeeId) : data.currentEmployeeId === 'researcher'
        content = JSON.stringify(!data.participation.hasRespondedInTurn && eligible ? { action: 'reply', responseKind: prompt.includes('先检查销售100') ? 'chat' : 'task', ...(prompt.includes('两个独立部分') ? { work: { key: `independent-${data.currentEmployeeId}`, scope: '独立文件', deliverable: '各自文件' } } : {}) } : { action: 'pass' })
      } else if (system.includes('Private memory maintenance')) content = '{"candidates":[]}'
      else if (system.includes('private-work-report-v1')) content = '{"action":"publish","text":"文件已发布"}'
      else if (system.includes('Your host-claimed work:')) {
        const work = JSON.parse(system.match(/Your host-claimed work: (.*?)\. Before the final answer/s)![1])
        const independent = messages.some(message => String(message.content).includes('两个独立部分'))
        const name = independent ? work.ownerAgentId === 'researcher' ? 'facts.md' : 'outline.md' : 'result.json'
        const data = name === 'facts.md' ? '今天有三笔销售，数值为12、18、30' : name === 'outline.md' ? '背景、数据、结论' : '{"net":80}'
        const count = messages.filter(message => message.role === 'tool').length
        const operations = [{ name: 'write_file', args: { path: `self:/work/${name}`, content: data } }, { name: 'publish_artifact', args: { path: `self:/work/${name}`, name } }, { name: 'report_work', args: { disposition: 'delivered', summary: '文件已发布', evidence: [{ kind: 'answer', reference: '文件已发布' }] } }]
        const operation = operations[count]; if (operation) tool = { name: operation.name, arguments: JSON.stringify(operation.args) }
        content = '文件已发布'
      } else if (system.includes('研究员')) content = '退款应该扣除吗？'
      if (!body.stream) { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ id: 'probe', model: 'fixture', choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }] })); return }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `eval-${calls}`, object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      emit({ role: 'assistant' }); if (tool) emit({ tool_calls: [{ index: 0, id: `tool-${calls}`, type: 'function', function: tool }] }); else emit({ content })
      emit({}, tool ? 'tool_calls' : 'stop'); response.end('data: [DONE]\n\n')
    } catch (error) { errors.push(String(error)); response.writeHead(500); response.end(JSON.stringify({ error: { message: String(error) } })) }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  try {
    const port = (server.address() as { port: number }).port
    await runEvaluation({ settings: { label: 'local-fixture', source: '.', output: root, samples: 1, maxRequests: 80, cases: ['independent-files', 'clarify-refunds'], revision: 'fixture', hashes: {} }, connection: { id: 'fixture', name: 'Local only', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${port}/v1`, defaultModel: 'fixture', hasApiKey: true }, apiKey: 'fixture-only-secret' }, { AppService, MastraEngine })
    expect(errors).toEqual([])
    const samples = await loadRecords(root); expect(samples).toHaveLength(2)
    for (const sample of samples) { expect(sample.score.executionStatus).toBe('completed'); expect(sample.score.hardChecks, JSON.stringify({ metadata: sample.record.metadata, checks: sample.score.hardChecks })).toEqual(expect.arrayContaining(sample.score.hardChecks.map(check => expect.objectContaining({ name: check.name, status: 'passed' })))); expect(sample.score.runtimeErrors).toEqual([]); expect(sample.score.verdict).toBe('review-needed') }
    const clarification = samples.find(sample => sample.record.caseId.startsWith('clarify'))!.record
    expect(clarification.events).toMatchObject([{ id: 'refund-policy', status: 'applied' }]); expect(clarification.detail!.messages.filter(message => message.senderType === 'user')).toHaveLength(2)
    const ledger = JSON.parse(await readFile(join(root, 'request-budget.json'), 'utf8')); expect(ledger.used).toBe(calls); expect(ledger.phases.connection).toBe(1)
    expect((await readFile(join(root, 'independent-files-1.json'), 'utf8')).includes('fixture-only-secret')).toBe(false)
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) }
})
