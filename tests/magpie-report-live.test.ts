/*
 * [INPUT]: Explicit new batch, previously completed real gateway file evidence and read-only isolated product records.
 * [OUTPUT]: Three real private-report schema results reference the original artifact without executing or publishing any operation.
 * [POS]: API report-phase gateway acceptance; separate from the original business runs and publication transaction.
 * [PROTOCOL]: Update Header, tests/.folder.md and the Magpie ledger for every batch.
 */
import { workspaceInputFiles } from './support/workspace-inputs'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { MastraEngine } from '../packages/runtime/src/adapters/mastra/engine'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { listModelCatalog, probeMagpie } from '../packages/runtime/src/adapters/mastra/model-catalog'
import type { Connection, Conversation, DigitalAgent, ModelUsage, WorkItem, WorkReport } from '../packages/shared/src/domain'
import type { GatewayRouteEvidence, ModelCatalog } from '../packages/shared/src/domain/model-gateway'
import type { EngineContext } from '../packages/runtime/src/contracts'

const enabled = process.env.BOAI_MAGPIE_REPORT_REAL === '1', batch = process.env.BOAI_MAGPIE_BATCH ?? '', sourceBatch = process.env.BOAI_MAGPIE_REPORT_SOURCE ?? ''
const root = 'http://127.0.0.1:3425', evidence = resolve('.local/magpie-20261017', `report-${batch}`), originalFetch = globalThis.fetch
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
let catalog: ModelCatalog, version = '', sourceBefore: Record<string, string>, current = ''
const requests: { protocol: string; path: string; model: string; tools: number; status?: number; actualModel?: string | null; actualProvider?: string | null }[] = []
async function sources() {
  const paths = (await workspaceInputFiles()).filter(path => /\.(ts|tsx|json)$/.test(path))
  paths.push('package.json', 'pnpm-lock.yaml', 'tests/magpie-report-live.test.ts')
  return Object.fromEntries(await Promise.all(paths.sort().map(async path => [path, sha(await readFile(path))])))
}
beforeAll(async () => {
  if (!enabled) return
  if (![batch, sourceBatch].every(value => /^[a-z0-9-]{1,80}$/.test(value))) throw Error('Fresh batch and explicit existing source batch are required')
  await mkdir(evidence)
  version = (await probeMagpie(root)).version; catalog = await listModelCatalog(`${root}/v1`, 'magpie-boai'); sourceBefore = await sources()
  await writeFile(join(evidence, 'plan.json'), JSON.stringify({ batch, sourceBatch, version, sourceBefore, catalog, protocols: ['chat', 'responses', 'messages'], maxInferenceRequests: 3, maxPerProtocol: 1, scope: 'production private-report adapter with original real file evidence; no business republishing or operation replay' }, null, 2))
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    if (url.origin !== root || !url.pathname.startsWith('/v1/') || (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase() !== 'POST') return originalFetch(input, init)
    if (!current || requests.length >= 3 || requests.some(row => row.protocol === current)) throw Error('Report experiment cap reached; no retry')
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
    const row: typeof requests[number] = { protocol: current, path: url.pathname, model: body.model, tools: body.tools?.length ?? 0 }; requests.push(row)
    if (row.tools) throw Error('Private report must not have tools')
    const response = await originalFetch(input, init); row.status = response.status; row.actualModel = response.headers.get('x-magpie-model'); row.actualProvider = response.headers.get('x-magpie-provider'); return response
  }
})
afterAll(async () => { globalThis.fetch = originalFetch; if (enabled && version) await writeFile(join(evidence, 'requests.json'), JSON.stringify({ requests, sourceBefore, sourceAfter: await sources() }, null, 2)) })
test.skipIf(!enabled).each(['chat', 'responses', 'messages'] as const)('Magpie %s report preserves real artifact authority and performs no tools', async protocol => {
  current = protocol
  const source = resolve('.local/magpie-20261017', `business-${sourceBatch}`, protocol), sourceResultPath = join(source, 'result.json')
  const sourceResult = JSON.parse(await readFile(sourceResultPath, 'utf8'))
  expect(sourceResult.status).toBe('passed')
  const artifact = sourceResult.second
  const bytes = await readFile(artifact.path); expect(sha(bytes)).toBe(artifact.contentHash)
  const store = await ProductStore.openReadOnly(join(source, 'data', 'boai.sqlite'))
  let agent: DigitalAgent, connection: Connection, conversation: Conversation, work: WorkItem
  try {
    work = (await store.load<WorkItem>('workItems')).find(work => work.id === artifact.sourceWorkId)!
    agent = (await store.load<DigitalAgent>('agents')).find(agent => agent.id === work.ownerAgentId)!
    connection = (await store.load<Connection>('connections')).find(connection => connection.id === agent.connectionId)!
    conversation = (await store.load<Conversation>('conversations')).find(conversation => conversation.id === work.conversationId)!
  } finally { await store.close() }
  expect(work.status).toBe('delivered'); expect(work.artifactIds).toContain(artifact.id); expect(connection.gateway?.protocol).toBe(protocol)
  const callId = `report-${batch}-${protocol}`, usage: ModelUsage[] = [], routes: { id: string; route: GatewayRouteEvidence }[] = [], started: string[] = []
  let report: WorkReport | undefined, failure: string | undefined
  const request = '请重新汇报这次已经完成的文件修订：说明只替换了状态、其他正文保持，并引用该工作已登记的文件作为交付依据。不要重新执行任何操作。'
  const context: EngineContext = { agent, connection, apiKey: '', modelCatalog: catalog, conversation, work, resources: [], runId: callId, modelCallId: callId, signal: AbortSignal.timeout(90000),
    messages: [{ id: callId, conversationId: conversation.id, senderType: 'user', senderId: 'test-user', senderName: 'User', content: request, sequence: 1, status: 'completed', createdAt: new Date().toISOString() }],
    onModelCallStarted: async id => { started.push(id) }, onModelCallRoute: async (id, route) => { routes.push({ id, route }) }, onModelCallUsage: async (_, value) => { usage.push(value) },
    onDelta: async () => { throw Error('Private report cannot publish a delta') }, onTool: async () => { throw Error('Private report cannot execute a tool') }, approveCommand: async () => false,
  }
  const draft = { text: `已完成文件${artifact.name}修订，仅将状态改为已验证，其余原文保持。`, observedThroughSequence: 1, revisions: 1, status: 'private' as const, reason: '需要按用户最新要求重新汇报已完成结果；只更新汇报，不执行操作。' }
  await writeFile(join(evidence, `${protocol}-input.json`), JSON.stringify({ request, draft, work, artifact, sourceResultPath, sourceResultHash: sha(await readFile(sourceResultPath)), originalHash: sha(bytes) }, null, 2))
  try {
    report = await new MastraEngine().report(context, draft)
    expect(report.action).toBe('publish'); expect(report.text).toContain('已验证'); expect(report.outcome?.disposition).toBe('delivered')
    expect(report.outcome?.evidence).toContainEqual({ kind: 'artifact', reference: artifact.id })
    expect(started).toEqual([callId]); expect(routes).toHaveLength(1); expect(routes[0]).toMatchObject({ id: callId, route: { routeSource: 'response-headers' } })
    expect(requests.filter(row => row.protocol === protocol)).toHaveLength(1); expect(await readFile(artifact.path)).toEqual(bytes); expect(await sources()).toEqual(sourceBefore)
  } catch (error) { failure = error instanceof Error ? error.message : String(error); throw error }
  finally { await writeFile(join(evidence, `${protocol}-result.json`), JSON.stringify({ status: failure ? 'failed' : 'passed', failure, protocol, report, usage, started, routes }, null, 2)) }
}, 95000)
