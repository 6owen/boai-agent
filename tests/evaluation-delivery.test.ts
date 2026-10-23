/*
 * [INPUT]: MD-v1 固定开发合同、真实 AppService/Mastra/SQLite 与本地兼容模型协议。
 * [OUTPUT]: 附件到成果/修订/采用/重启、共享预算和失败保存的离线贯通；证据hash/身份篡改拒绝、冻结兼容与人工pending。
 * [POS]: D3 评估入口 Vitest 验收；受控模型只检验流程，不证明商业模型质量。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServerResponse } from 'node:http'
import { teamEndpoint, sendTeamOutput } from './fixtures/team-planner'
import { AppService } from '../src/runtime/service'
import { MastraEngine } from '../src/runtime/adapters/mastra/engine'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { runEvaluation } from './evaluation/harness'
import { materialDeliveryCase, MATERIAL_DELIVERY_VERSION, deliveryHash } from './evaluation/material-delivery'
import { sampleHash, scoreRecord } from './evaluation/checks'
import { loadRecords } from './evaluation/rescore'
import { compareResults, writeReport } from './evaluation/report'
import { validateFrozenHoldout } from './evaluation/matrix'
import type { EvaluationRecord, ExternalReview } from './evaluation/schema'
import { SCORER_VERSION } from './evaluation/schema'

const roots: string[] = [], endpoints: Awaited<ReturnType<typeof teamEndpoint>>[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const endpoint of endpoints.splice(0)) await endpoint.close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const text = (value: unknown): string => typeof value === 'string' ? value : Array.isArray(value) ? value.map(part => part.text ?? JSON.stringify(part)).join('\n') : JSON.stringify(value)
function tool(response: ServerResponse, name: string, args: unknown, index: number) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  for (const [delta, finish_reason] of [[{ role: 'assistant' }, null], [{ tool_calls: [{ index: 0, id: `delivery-tool-${index}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, null], [{}, 'tool_calls']] as const) response.write(`data: ${JSON.stringify({ id: `delivery-output-${index}`, object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
  response.end('data: [DONE]\n\n')
}
async function fixture(options: { noArtifact?: boolean } = {}) {
  const errors: string[] = [], materialInputs: string[] = [], replacements: string[] = []
  const endpoint = await teamEndpoint((body, response, index) => {
    try {
      const messages = body.messages as { role: string; content: unknown; tool_calls?: { function: { name: string } }[] }[], system = messages.filter(message => message.role === 'system').map(message => text(message.content)).join('\n')
      if (!body.stream) { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ id: 'probe', model: 'fixture', choices: [{ message: { role: 'assistant', content: 'connected' }, finish_reason: 'stop' }] })); return }
      if (system.includes('Private participation decision')) {
        const data = JSON.parse(text(messages.at(-1)!.content)).data
        sendTeamOutput(response, data.participation?.hasRespondedInTurn || data.currentTurn?.ownCompletedMessageIds?.length ? { action: 'pass' } : { action: 'reply', responseKind: 'task', work: { key: `delivery-${data.originalUserRequestId}`, scope: '订单核对', deliverable: '真实 Markdown 报告' } }, false); return
      }
      if (system.includes('Private memory maintenance')) { sendTeamOutput(response, { candidates: [] }, false); return }
      if (system.includes('Read the actual new conversation facts. Publish a relevant, updated report')) { sendTeamOutput(response, { action: 'publish', text: JSON.parse(text(messages.at(-1)!.content)).data.draft.text }, false); return }
      const tools = body.tools as { function: { name: string; description?: string } }[] | undefined, writer = tools?.find(value => value.function.name === 'write_file')
      if (!writer) { sendTeamOutput(response, 'connected', false); return }
      const runId = writer.function.description?.match(/self:\/runs\/([a-zA-Z0-9_-]+)\//)?.[1]
      if (!runId) throw new Error('Missing real private run path')
      const revision = tools!.find(value => value.function.name === 'publish_artifact')!.function.description?.match(/revisionRequestId=([a-zA-Z0-9_-]+)/)?.[1]
      if (revision && !replacements.includes(revision)) replacements.push(revision)
      const source = messages.filter(message => message.role === 'user').map(message => text(message.content)).join('\n')
      if (!revision && !materialInputs.includes(source)) materialInputs.push(source)
      const materialIds = [...new Set([...source.matchAll(/"materialId":"([0-9a-f-]{36})"/g), ...source.matchAll(/material:([0-9a-f-]{36}):text-v1:L/g)].map(value => value[1]))]
      const content = `# 订单核对报告\n\n成交笔数：3\n成交总额：250\n退款额：20\n净额：230\n\n${materialIds.map(id => `材料依据：material:${id}:text-v1:L2`).join('\n')}\n${revision ? '\n## 处理说明\n重复的 O2 只计算一次，已取消的 O4 排除。\n' : ''}`
      const path = `self:/runs/${runId}/report.md`, called = messages.flatMap(message => message.tool_calls ?? []).map(value => value.function.name)
      if (options.noArtifact) {
        if (!called.includes('report_work')) tool(response, 'report_work', { disposition: 'delivered', summary: '只有回答，没有报告文件', evidence: [{ kind: 'answer', reference: '只有回答，没有报告文件' }] }, index)
        else sendTeamOutput(response, '只有回答，没有报告文件', false)
        return
      }
      if (!called.includes('write_file')) { tool(response, 'write_file', { path, content }, index); return }
      if (!called.includes('publish_artifact')) { tool(response, 'publish_artifact', { path, name: 'report.md', ...(revision ? { revisionRequestId: revision } : {}) }, index); return }
      const artifactId = messages.filter(message => message.role === 'tool').map(message => { try { return JSON.parse(text(message.content))?.artifact?.id as string | undefined } catch { return undefined } }).find(Boolean)
      if (!artifactId) throw new Error('Missing production publication receipt')
      if (!called.includes('report_work')) { tool(response, 'report_work', { disposition: 'delivered', summary: '实际报告已发布', evidence: [{ kind: 'artifact', reference: artifactId }] }, index); return }
      sendTeamOutput(response, '实际报告已发布', false)
    } catch (error) { errors.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end(String(error)) }
  })
  endpoints.push(endpoint)
  const rawRoot = await mkdtemp(join(tmpdir(), 'boai-delivery-eval-')); roots.push(rawRoot); const root = await realpath(rawRoot)
  const input = { settings: { label: 'offline-delivery', source: process.cwd(), output: root, samples: 1, sampleStart: 1, maxRequests: 40, cases: [materialDeliveryCase.id], team: 'single' as const, revision: 'offline', hashes: {} }, connection: { id: 'fixture', name: 'fixture', provider: 'openai-compatible' as const, baseUrl: endpoint.url, defaultModel: 'fixture', hasApiKey: true }, apiKey: 'fixture-only-secret' }
  return { root, endpoint, errors, materialInputs, replacements, input }
}
async function run(options: { noArtifact?: boolean; requestLimit?: number } = {}) {
  const value = await fixture(options)
  if (options.requestLimit) value.input.settings.maxRequests = options.requestLimit
  await runEvaluation(value.input, { AppService, MastraEngine })
  const record = JSON.parse(await readFile(join(value.root, `${materialDeliveryCase.id}-1.json`), 'utf8')) as EvaluationRecord
  return { ...value, record, score: scoreRecord(record, materialDeliveryCase), ledger: JSON.parse(await readFile(join(value.root, 'request-budget.json'), 'utf8')) as { used: number; limit: number; phases: Record<string, number> } }
}

it('runs real two-material V1/revision/V2/adoption/restart, charging the shared ceiling and leaving quality pending', async () => {
  const value = await run(), { record, score, ledger } = value, evidence = record.delivery!
  expect(value.errors).toEqual([])
  expect(score.hardChecks.every(check => check.status === 'passed')).toBe(true)
  expect(score).toMatchObject({ executionStatus: 'completed', verdict: 'review-needed', judgeStatus: 'pending', totalTokens: null })
  expect(evidence).toMatchObject({ version: MATERIAL_DELIVERY_VERSION, stage: 'restarted', adoptionActor: 'script', humanAcceptance: 'pending' })
  expect(evidence.beforeRestart!.providerRequests).toBe(evidence.afterRestart!.providerRequests)
  expect(evidence.beforeRestart!.detail.messages.filter(message => message.senderType === 'user')).toHaveLength(2)
  expect(evidence.beforeRestart!.detail.turns).toHaveLength(2)
  expect(evidence.beforeRestart!.detail.runs.filter(run => run.phase === 'execution')).toHaveLength(2)
  const oldWork = evidence.beforeRevision!.detail.workItems!.find(work => work.id === evidence.v1!.artifact.sourceWorkId)!
  expect(evidence.beforeRestart!.detail.workItems!.find(work => work.id === oldWork.id)).toEqual(oldWork)
  expect(evidence.beforeRestart!.detail.workBudgets!.find(budget => budget.id === oldWork.budgetId)).toEqual(evidence.beforeRevision!.detail.workBudgets!.find(budget => budget.id === oldWork.budgetId))
  expect(evidence.beforeRestart!.previews.find(preview => preview.artifact.id === evidence.v2!.artifact.id)!.adoption.events).toHaveLength(1)
  expect(value.materialInputs.some(text => text.includes('O1,已完成,100') && text.includes('固定退款金额为20元'))).toBe(true)
  expect(value.replacements).toEqual([evidence.revisionInput!.requestId])
  expect(ledger.used).toBe(value.endpoint.requests.length); expect(ledger.used).toBe(record.requests.length + 1); expect(ledger.limit).toBe(40)
  expect(ledger.phases).toHaveProperty('connection', 1); expect(ledger.phases.execution).toBeGreaterThanOrEqual(8)
  const store = new ProductStore(join(value.root, 'data', record.caseId, 'boai.sqlite')); await store.init()
  try { expect(await store.load('artifactRevisionRequests')).toHaveLength(1); expect(await store.load('artifactAdoptionEvents')).toHaveLength(1); expect(await store.load('materials')).toHaveLength(2) } finally { await store.close() }
  const summary = await writeReport(join(value.root, 'offline-report'), [{ record, score }])
  expect(summary).toMatchObject({ passed: 0, reviewNeeded: 1, deliveryVersions: [MATERIAL_DELIVERY_VERSION] })
  const template = JSON.parse(await readFile(join(value.root, 'offline-report', 'review-template.json'), 'utf8'))
  expect(template[0].criteria).toHaveLength(3)
  await validateFrozenHoldout()
}, 30_000)

it('retains a missing-file delivery failure and its actual requests instead of accepting a completion claim', async () => {
  const value = await run({ noArtifact: true })
  expect(value.errors).toEqual([]); expect(value.record.error).toContain('首次交付应有一份真实成果')
  expect(value.record.delivery?.stage).toBe('materials'); expect(value.record.artifacts).toHaveLength(0)
  expect(value.score.verdict).toBe('failed'); expect(value.ledger.used).toBe(value.endpoint.requests.length)
  expect(value.ledger.used).toBeGreaterThan(1)
  const report = JSON.parse(await readFile(join(value.root, 'report', 'scores.json'), 'utf8'))
  expect(report).toMatchObject({ started: 1, passed: 0, failed: 1 })
}, 30_000)

it('retains budget exhaustion and cannot exceed or reset the existing experiment allowance', async () => {
  const value = await run({ requestLimit: 3 })
  expect(value.ledger.used).toBe(3); expect(value.endpoint.requests).toHaveLength(3); expect(value.record.requests).toHaveLength(2)
  expect(value.score.verdict).not.toBe('passed'); expect(value.record.delivery?.stage).not.toBe('restarted')
  expect(value.record.error || value.record.runtimeErrors.join('\n') || value.record.detail?.runs.map(run => run.error).join('\n')).toBeTruthy()
}, 30_000)

it('binds independent reviews to all delivery bytes and rejects changed sources, relationships, current adoption and restart replay', async () => {
  const { record, root } = await run(), originalHash = sampleHash(record)
  const review: ExternalReview = { caseId: record.caseId, sampleHash: originalHash, scorerVersion: SCORER_VERSION, source: 'human', reviewer: 'offline-review-contract', criteria: materialDeliveryCase.semantic.map(criterion => ({ criterion, score: 2, reason: '仅检验独立评审合同，非实际质量结论', evidence: [record.delivery!.v2!.artifact.id, record.delivery!.materials[0].material.id] })) }
  expect(scoreRecord(record, materialDeliveryCase, review).verdict).toBe('passed')
  const changes: ((value: EvaluationRecord) => void)[] = [
    value => { value.delivery!.beforeRestart!.materials[0].original += '外改' },
    value => { value.delivery!.v2!.artifact.previousArtifactId = 'wrong-original' },
    value => { value.delivery!.beforeRestart!.previews.find(preview => preview.artifact.id === value.delivery!.v2!.artifact.id)!.adoption.current!.artifactId = value.delivery!.v1!.artifact.id },
    value => { value.delivery!.afterRestart!.providerRequests++ },
    value => { value.delivery!.v1!.text = value.delivery!.v1!.text.replace('净额：230', '净额：999') },
    value => { value.delivery!.beforeRevision!.detail.workBudgets![0].modelCalls++ },
    value => { value.scenario!.delivery!.expected[0].value = 999 },
  ]
  for (const change of changes) {
    const modified = structuredClone(record); change(modified)
    expect(sampleHash(modified)).not.toBe(originalHash)
    expect(scoreRecord(modified, modified.scenario!).hardChecks.some(check => check.status === 'failed')).toBe(true)
    expect(scoreRecord(modified, modified.scenario!, review).verdict).not.toBe('passed')
  }
  const legacy = structuredClone(record); delete legacy.delivery
  const oldHash = deliveryHash(JSON.stringify({ caseId: legacy.caseId, prompt: legacy.prompt, metadata: legacy.metadata, detail: legacy.detail, artifacts: legacy.artifacts, events: legacy.events }))
  expect(sampleHash(legacy)).toBe(oldHash)
  expect(scoreRecord(legacy, materialDeliveryCase).hardChecks[0].status).toBe('incomplete')
  const incompatible = structuredClone(record); incompatible.delivery!.version = 'next-contract'
  expect(compareResults([{ record, score: scoreRecord(record, materialDeliveryCase) }], [{ record: incompatible, score: scoreRecord(incompatible, materialDeliveryCase) }])[0].comparable).toBe(false)
  const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Offline rescore must not fetch'))
  expect((await loadRecords(root)).some(row => row.score.verdict === 'review-needed')).toBe(true)
  expect(fetch).not.toHaveBeenCalled()
}, 30_000)

it('refuses an unregistered multi-sample or expanded-budget MD-v1 run before any provider call', async () => {
  const value = await fixture(); value.input.settings.samples = 2
  await expect(runEvaluation(value.input, { AppService, MastraEngine })).rejects.toThrow('MD-v1 首轮')
  expect(value.endpoint.requests).toHaveLength(0)
  value.input.settings.samples = 1; value.input.settings.maxRequests = 41
  await expect(runEvaluation(value.input, { AppService, MastraEngine })).rejects.toThrow('MD-v1 首轮')
  expect(value.endpoint.requests).toHaveLength(0)
})
