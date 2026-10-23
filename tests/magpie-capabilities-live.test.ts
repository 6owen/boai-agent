/*
 * [INPUT]: Explicit bounded real Magpie batch, current catalog and production MastraEngine/image projection.
 * [OUTPUT]: Three-protocol image bytes, settings and routes; an explicit case selector freezes a smaller regression plan before inference.
 * [POS]: Actual API capability acceptance; isolated contexts, no personal settings, no automatic inference retry.
 * [PROTOCOL]: Update Header, tests/.folder.md and the Magpie ledger for every actual batch, including failures.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { MastraEngine } from '../src/runtime/adapters/mastra/engine'
import { listModelCatalog, probeMagpie } from '../src/runtime/adapters/mastra/model-catalog'
import type { EngineContext } from '../src/runtime/contracts'
import type { Connection, ModelUsage } from '../src/shared/domain'
import type { GatewayRouteEvidence, ModelCatalog, ModelProtocol } from '../src/shared/domain/model-gateway'
import { gatewayVisionImage } from './fixtures/gateway-vision-image'

const enabled = process.env.BOAI_MAGPIE_CAPABILITIES_REAL === '1', batch = process.env.BOAI_MAGPIE_BATCH ?? ''
const root = 'http://127.0.0.1:3425', evidence = resolve('.local/magpie-20261017', `capabilities-${batch}`)
const availableCases = [
  { id: 'disabled', model: 'deepseek/deepseek-flash', level: 'none' },
  { id: 'low', model: 'deepseek/deepseek-flash', level: 'low' },
  { id: 'auto', model: 'deepseek/deepseek-flash', level: 'auto' },
  { id: 'routing-group', model: 'group/auto-gpt-6-luna', level: 'medium' },
] as const
const selectedCase = process.env.BOAI_MAGPIE_CAPABILITIES_CASE
const cases = availableCases.filter(spec => !selectedCase || spec.id === selectedCase)
const protocols = ['chat', 'responses', 'messages'] as const
const task = '看附图，识别左右两个图形。仅返回一个JSON对象，键为left和right；每个值包含color和shape，均用常见英文小写名称。不要解释，不要使用代码围栏。'
const oracle = { left: { color: 'blue', shape: 'circle' }, right: { color: 'red', shape: 'square' } }
const png = gatewayVisionImage(), sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
const originalFetch = globalThis.fetch
let catalog: ModelCatalog, version = '', current: { caseId: string; protocol: ModelProtocol } | undefined, sourceBefore: Record<string, string>
type RequestRecord = { caseId: string; protocol: ModelProtocol; path: string; model: string; reasoning?: unknown; thinking?: unknown; outputConfig?: unknown; imageHashes: string[]; status?: number; actualModel?: string | null; actualProvider?: string | null; error?: string }
const requests: RequestRecord[] = []
async function sources() {
  const files = (await readdir('src', { recursive: true })).filter(file => /\.(ts|tsx|json)$/.test(file)).map(file => `src/${file}`)
  files.push('package.json', 'pnpm-lock.yaml', 'tests/magpie-capabilities-live.test.ts', 'tests/fixtures/gateway-vision-image.ts')
  return Object.fromEntries(await Promise.all(files.sort().map(async file => [file, sha(await readFile(file))])))
}
function imageHashes(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(imageHashes)
  if (!value || typeof value !== 'object') return []
  const item = value as Record<string, unknown>
  if (item.type === 'base64' && item.media_type === 'image/png' && typeof item.data === 'string') return [sha(Buffer.from(item.data, 'base64'))]
  return Object.values(item).flatMap(part => typeof part === 'string' && part.startsWith('data:image/png;base64,') ? [sha(Buffer.from(part.slice(22), 'base64'))] : imageHashes(part))
}
beforeAll(async () => {
  if (!enabled) return
  if (!cases.length) throw Error('Unknown capability case')
  if (!/^[a-z0-9-]{1,80}$/.test(batch)) throw Error('A fresh BOAI_MAGPIE_BATCH is required')
  await mkdir(evidence)
  version = (await probeMagpie(root)).version; catalog = await listModelCatalog(`${root}/v1`, 'magpie-boai'); sourceBefore = await sources()
  for (const spec of cases) {
    const model = catalog.models.find(model => model.id === spec.model)
    if (!model?.modalities?.input?.includes('image') || spec.level !== 'auto' && !model.reasoningLevels?.includes(spec.level)) throw Error(`Current catalog does not declare ${spec.id}`)
  }
  await writeFile(join(evidence, 'input.png'), png)
  await writeFile(join(evidence, 'plan.json'), JSON.stringify({ batch, version, cases, protocols, catalog, sourceBefore, task, oracle, imageHash: sha(png), maxInferenceRequests: cases.length * protocols.length, maxRequestsPerCase: 1, observationMsPerRequest: 120000, scope: 'production MastraEngine/API media projection; no AppService material intake, UI, tools or business-delivery claim' }, null, 2))
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    if (url.origin !== root || !url.pathname.startsWith('/v1/') || (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase() !== 'POST') return originalFetch(input, init)
    if (!current || requests.length >= cases.length * protocols.length || requests.some(row => row.caseId === current!.caseId && row.protocol === current!.protocol)) throw Error('Predeclared experiment cap reached; no request replay')
    if (typeof init?.body !== 'string') throw Error('Expected inspectable SDK body')
    const body = JSON.parse(init.body)
    const record: RequestRecord = { ...current, path: url.pathname, model: body.model, reasoning: body.reasoning ?? body.reasoning_effort, thinking: body.thinking, outputConfig: body.output_config, imageHashes: imageHashes(body) }
    requests.push(record)
    // Reject a missing/corrupt image before spending an actual inference request.
    if (JSON.stringify(record.imageHashes) !== JSON.stringify([sha(png)])) throw Error('SDK did not preserve the original image')
    try {
      const response = await originalFetch(input, init)
      record.status = response.status; record.actualModel = response.headers.get('x-magpie-model'); record.actualProvider = response.headers.get('x-magpie-provider')
      return response
    } catch (error) { record.error = String(error).slice(0, 1000); throw error }
  }
})
afterAll(async () => {
  globalThis.fetch = originalFetch
  if (enabled && version) await writeFile(join(evidence, 'requests.json'), JSON.stringify({ requests, sourceBefore, sourceAfter: await sources() }, null, 2))
})
for (const protocol of protocols) test.skipIf(!enabled).each(cases)('Magpie ' + protocol + ' preserves image and $id preference', async spec => {
  current = { caseId: spec.id, protocol }
  const callId = `${batch}-${protocol}-${spec.id}`, startedAt = new Date().toISOString(), directory = join(evidence, `${protocol}-${spec.id}`)
  await mkdir(directory)
  const connection: Connection = { id: `connection-${protocol}`, revision: 1, name: 'Magpie capability acceptance', provider: 'openai-compatible', baseUrl: root, defaultModel: spec.model, gateway: { kind: 'magpie', protocol, auth: 'local' }, hasApiKey: false }
  const routes: { id: string; route: GatewayRouteEvidence }[] = [], usage: ModelUsage[] = [], started: { id: string; phase: string; effort?: string }[] = []
  let text = '', reasoningCharacters = 0, failure: string | undefined
  try {
    const context: EngineContext = {
      connection, modelCatalog: catalog, apiKey: '', modelCallId: callId,
      agent: { id: 'vision-employee', name: '图片验收', role: '', instructions: '根据用户提供的图片如实简短作答。', executionBackend: { kind: 'mastra-model' }, connectionId: connection.id, modelId: spec.model, thinkingLevel: spec.level, skillIds: [], knowledgeIds: [], color: '#123456', allowCommands: false, active: true, configVersion: 1 },
      conversation: { id: callId, kind: 'direct', title: 'Vision acceptance', agentIds: ['vision-employee'], mode: 'mention', sharedKnowledgeIds: [], workspacePath: directory, createdAt: startedAt, updatedAt: startedAt },
      messages: [{ id: 'user-image', conversationId: callId, senderType: 'user', senderId: 'human', senderName: 'User', content: task, status: 'completed', sequence: 1, createdAt: startedAt }],
      materialImages: [{ messageId: 'user-image', materialId: 'synthetic-original', dataUrl: `data:image/png;base64,${png.toString('base64')}`, mimeType: 'image/png' }],
      resources: [], runId: callId, signal: AbortSignal.timeout(120000), responseKind: 'chat',
      onModelCallStarted: async (id, phase, effort) => { started.push({ id, phase, effort }) }, onModelCallRoute: async (id, route) => { routes.push({ id, route }) }, onModelCallUsage: async (_, value) => { usage.push(value) },
      onExecutionEvent: async event => { if (event.eventType === 'agent.reasoning.block') reasoningCharacters += event.appendText?.length ?? 0 },
      onDelta: async value => { text += value }, onTool: async () => { throw Error('No tool expected in image recognition') }, approveCommand: async () => false,
    }
    await new MastraEngine().run(context)
    expect(JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))).toEqual(oracle)
    const received = requests.filter(row => row.caseId === spec.id && row.protocol === protocol)
    expect(received).toHaveLength(1); expect(received[0]).toMatchObject({ model: spec.model, status: 200, imageHashes: [sha(png)] })
    expect(received[0].path).toBe(`/v1/${protocol === 'chat' ? 'chat/completions' : protocol}`)
    if (spec.level === 'auto') {
      expect(received[0].reasoning).toBeUndefined(); expect(received[0].thinking).toBeUndefined(); expect(received[0].outputConfig).toBeUndefined()
    } else if (protocol === 'messages') {
      expect(received[0].thinking).toEqual({ type: spec.level === 'none' ? 'disabled' : 'adaptive' })
      expect(received[0].outputConfig).toEqual(spec.level === 'none' ? undefined : { effort: spec.level })
    } else expect(received[0].reasoning).toEqual(protocol === 'responses' ? { effort: spec.level } : spec.level)
    expect(started.map(value => value.id)).toEqual([callId]); expect(routes).toHaveLength(1)
    expect(routes[0]).toMatchObject({ id: callId, route: { routeSource: 'response-headers', actualModelId: received[0].actualModel, actualProvider: received[0].actualProvider } })
    expect(routes[0].route.actualModelId).toBeTruthy(); expect(routes[0].route.actualProvider).toBeTruthy()
    if (spec.id === 'routing-group') expect(routes[0].route.actualModelId).not.toBe(spec.model)
    if (spec.level === 'none') expect(reasoningCharacters).toBe(0)
    expect(await sources()).toEqual(sourceBefore)
  } catch (error) { failure = error instanceof Error ? error.message : String(error); throw error }
  finally {
    await writeFile(join(directory, 'result.json'), JSON.stringify({ status: failure ? 'failed' : 'passed', failure, batch, version, protocol, spec, startedAt, finishedAt: new Date().toISOString(), task, imageHash: sha(png), text, started, routes, usage, reasoningCharacters, requests: requests.filter(row => row.caseId === spec.id && row.protocol === protocol) }, null, 2))
  }
}, 125000)
