/*
 * [INPUT]: Explicit bounded local Magpie batch, original PNG and production AppService/Mastra/SQLite.
 * [OUTPUT]: Bounded selected-protocol attachment preparation/send/continuation, none/auto and durable route/material/optional Work evidence.
 * [POS]: Real supplier material business acceptance; internal service entry, not public IPC or desktop certification.
 * [PROTOCOL]: Update Header, tests/.folder.md and the Magpie ledger for each actual batch, preserving failures.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { AppService } from '../src/runtime/service'
import { MastraEngine } from '../src/runtime/adapters/mastra/engine'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { listModelCatalog, probeMagpie } from '../src/runtime/adapters/mastra/model-catalog'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, Message } from '../src/shared/domain'
import type { ConversationMaterial, MaterialPreview } from '../src/shared/domain/materials'
import type { ModelProtocol } from '../src/shared/domain/model-gateway'
import { gatewayVisionImage } from './fixtures/gateway-vision-image'

const enabled = process.env.BOAI_MAGPIE_MATERIALS_REAL === '1', batch = process.env.BOAI_MAGPIE_BATCH ?? ''
const selectedProtocol = process.env.BOAI_MAGPIE_MATERIALS_PROTOCOL
const protocols = (['chat', 'responses', 'messages'] as const).filter(protocol => !selectedProtocol || protocol === selectedProtocol)
const root = 'http://127.0.0.1:3425', model = 'deepseek/deepseek-flash'
const evidence = resolve('.local/magpie-20261017', `materials-${batch}`)
const png = gatewayVisionImage(), sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex')
const prompt = '看附图，识别左右两个图形。仅返回一个JSON对象，键为left和right；每个值包含color和shape，均用常见英文小写名称。不要解释，不要使用代码围栏，不创建文件。'
const followup = '请再次查看这段聊天的原图片，按刚才相同的JSON格式回答左右图形。不创建文件。'
const oracle = { left: { color: 'blue', shape: 'circle' }, right: { color: 'red', shape: 'square' } }
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted', 'waiting_user'])
const collections = ['connections', 'agents', 'conversations', 'materials', 'materialPreparations', 'messageReceipts', 'messages', 'runs', 'turns', 'workItems', 'artifacts', 'memories']
const originalFetch = globalThis.fetch
type Wire = { protocol: ModelProtocol; effort: string; stage: string; path: string; model: string; imageHashes: string[]; reasoning?: unknown; thinking?: unknown; outputConfig?: unknown; status?: number; actualModel?: string | null; actualProvider?: string | null; closed: boolean; error?: string }
const requests: Wire[] = []
let current: { protocol: ModelProtocol; effort: string } | undefined, version = '', sourceBefore: Record<string, string>
async function sources() {
  const files = (await readdir('src', { recursive: true })).filter(name => /\.(ts|tsx|json)$/.test(name)).map(name => `src/${name}`)
  files.push('package.json', 'pnpm-lock.yaml', 'tests/magpie-materials-live.test.ts', 'tests/fixtures/gateway-vision-image.ts')
  return Object.fromEntries(await Promise.all(files.sort().map(async name => [name, sha(await readFile(name))])))
}
function images(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(images)
  if (!value || typeof value !== 'object') return []
  const item = value as Record<string, unknown>
  if (item.type === 'base64' && item.media_type === 'image/png' && typeof item.data === 'string') return [sha(Buffer.from(item.data, 'base64'))]
  return Object.values(item).flatMap(part => typeof part === 'string' && part.startsWith('data:image/png;base64,') ? [sha(Buffer.from(part.slice(22), 'base64'))] : images(part))
}
beforeAll(async () => {
  if (!enabled) return
  if (!protocols.length) throw Error('Unknown selected protocol')
  if (!/^[a-z0-9-]{1,80}$/.test(batch)) throw Error('A fresh explicit batch is required')
  await mkdir(evidence)
  version = (await probeMagpie(root)).version
  const catalog = await listModelCatalog(`${root}/v1`, 'magpie-boai'), selected = catalog.models.find(item => item.id === model)
  if (!selected?.reasoningLevels?.includes('none') || !selected.modalities?.input?.includes('image')) throw Error('Current catalog lacks the selected capability')
  sourceBefore = await sources()
  await writeFile(join(evidence, 'plan.json'), JSON.stringify({ batch, version, model, selected, sourceBefore, protocols, efforts: ['none', 'auto'], userMessages: protocols.length * 2, maxInferenceRequests: protocols.length * 12, maxPerProtocol: 12, observationMsPerMessage: 240000, prompt, followup, oracle, imageHash: sha(png), scope: 'production material preparation and publication; Work state preserved, no complete task-delivery, desktop/package or internal reasoning claim' }, null, 2))
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    if (url.origin !== root || !url.pathname.startsWith('/v1/') || (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase() !== 'POST') return originalFetch(input, init)
    if (!current || requests.length >= protocols.length * 12 || requests.filter(row => row.protocol === current!.protocol).length >= 12) throw Error('Predeclared experiment request cap reached')
    if (typeof init?.body !== 'string') throw Error('Inspectable SDK body required')
    const body = JSON.parse(init.body), stage = init.body.includes('private-participation-v2') ? 'decision' : init.body.includes('private-memory-delta-v1') ? 'memory' : 'chat'
    const row: Wire = { ...current, stage, path: url.pathname, model: body.model, reasoning: body.reasoning ?? body.reasoning_effort, thinking: body.thinking, outputConfig: body.output_config, imageHashes: images(body), closed: false }
    requests.push(row)
    if (stage === 'chat' && JSON.stringify(row.imageHashes) !== JSON.stringify([sha(png)])) throw Error('Original material image was lost or duplicated before inference')
    if (row.imageHashes.some(hash => hash !== sha(png))) throw Error('Unexpected image bytes')
    try {
      const response = await originalFetch(input, init)
      row.status = response.status; row.actualModel = response.headers.get('x-magpie-model'); row.actualProvider = response.headers.get('x-magpie-provider')
      if (!response.body) { row.closed = true; return response }
      const reader = response.body.getReader()
      return new Response(new ReadableStream({
        async pull(controller) { try { const next = await reader.read(); if (next.done) { row.closed = true; controller.close() } else controller.enqueue(next.value) } catch (error) { row.closed = true; controller.error(error) } },
        async cancel(reason) { try { await reader.cancel(reason) } finally { row.closed = true } },
      }), { status: response.status, statusText: response.statusText, headers: response.headers })
    } catch (error) { row.closed = true; row.error = String(error).slice(0, 1000); throw error }
  }
})
afterAll(async () => { globalThis.fetch = originalFetch; if (enabled && version) await writeFile(join(evidence, 'requests.json'), JSON.stringify({ requests, sourceBefore, sourceAfter: await sources() }, null, 2)) })
async function settled(service: AppService, conversationId: string, messageId: string) {
  const deadline = Date.now() + 240000
  while (Date.now() < deadline) {
    const detail = await service.handle('getConversation', { id: conversationId }) as ConversationDetail
    if (detail.runs.some(run => run.triggerMessageId === messageId) && detail.runs.every(run => terminal.has(run.status)) && detail.turns?.length && detail.turns.every(turn => terminal.has(turn.status))) return detail
    await new Promise(done => setTimeout(done, 100))
  }
  throw Error('Observation deadline; retain the actual final state and close owned service, never replay')
}
function completed(detail: ConversationDetail, protocol: ModelProtocol) {
  expect(detail.runs.length).toBeGreaterThan(0); expect(detail.runs.every(run => run.status === 'completed')).toBe(true)
  expect(detail.turns?.every(turn => turn.status === 'completed')).toBe(true)
  expect(detail.artifacts).toEqual([])
  // A supplier may classify the request as task. Preserve that actual state rather
  // than claiming successful Work delivery from a correct public image answer.
  for (const work of detail.workItems ?? []) {
    expect(work.conversationId).toBe(detail.conversation.id)
    expect(detail.conversation.agentIds).toContain(work.ownerAgentId)
    expect(detail.messages.some(message => message.id === work.sourceMessageId && message.senderType === 'user')).toBe(true)
    expect(work.materialSources?.every(source => source.contentHash === sha(png) && detail.materials?.some(material => material.id === source.id))).toBe(true)
    expect(work.artifactIds).toEqual([])
    expect(work.resultMessageIds?.every(id => detail.messages.some(message => message.id === id && message.senderType === 'agent'))).toBe(true)
  }
  const calls = detail.runs.flatMap(run => run.modelCalls ?? []), rows = requests.filter(row => row.protocol === protocol)
  expect(calls).toHaveLength(rows.length); expect(new Set(calls.map(call => call.callId)).size).toBe(calls.length)
  expect(calls.every(call => call.protocol === protocol && call.selectedModelId === model && call.route?.actualModelId && call.route.actualProvider)).toBe(true)
  for (const reply of detail.messages.filter(message => message.senderType === 'agent')) {
    expect(reply.status).toBe('completed'); expect(JSON.parse(reply.content.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''))).toEqual(oracle)
  }
  for (const row of rows) {
    expect(row).toMatchObject({ status: 200, model, closed: true, path: `/v1/${protocol === 'chat' ? 'chat/completions' : protocol}` })
    if (row.effort === 'auto') { expect(row.reasoning).toBeUndefined(); expect(row.thinking).toBeUndefined(); expect(row.outputConfig).toBeUndefined() }
    else if (protocol === 'messages') { expect(row.thinking).toEqual({ type: 'disabled' }); expect(row.outputConfig).toBeUndefined() }
    else expect(row.reasoning).toEqual(protocol === 'chat' ? 'none' : { effort: 'none' })
  }
}
test.skipIf(!enabled).each(protocols)('Magpie %s original material reaches the public reply and survives explicit auto continuation', async protocol => {
  current = { protocol, effort: 'none' }
  const directory = join(evidence, protocol); await mkdir(directory)
  const dataPath = join(directory, 'data'), source = join(directory, 'input.png'); await writeFile(source, png)
  const create = () => new AppService({ dataPath, engine: new MastraEngine(), secrets: { get: async () => undefined, set: async () => { throw Error('No secret needed') }, delete: async () => {} }, emit: () => {} })
  let service: AppService | undefined, status = 'running', failure: string | undefined
  const snapshots: { phase: string; detail: ConversationDetail }[] = []
  const read = async () => { const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite')); try { return Object.fromEntries(await Promise.all(collections.map(async name => [name, await store.load(name)]))) } finally { await store.close() } }
  try {
    service = create(); await service.init()
    const connection = await service.handle('saveConnection', { name: `Material ${protocol}`, provider: 'openai-compatible', baseUrl: root, defaultModel: model, gateway: { kind: 'magpie', protocol, auth: 'local' } }) as Connection
    await service.handle('getConnectionModelCatalog', { id: connection.id, baseUrl: root, gateway: connection.gateway, expectedRevision: connection.revision })
    const definition = { name: '图片员工', role: '回答图片问题', instructions: '如实查看用户图片，按用户要求回答，不创建文件。', color: '#123456', connectionId: connection.id, modelId: model, thinkingLevel: 'none', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }
    const agent = await service.handle('saveAgent', definition) as DigitalAgent
    expect(agent.thinkingLevel).toBe('none')
    const conversation = await service.handle('createConversation', { kind: 'direct', title: `Material ${protocol}`, agentIds: [agent.id], mode: 'mention', sharedKnowledgeIds: [] }) as Conversation
    const material = await service.handle('prepareMaterial', { conversationId: conversation.id, path: source, requestId: `${batch}-${protocol}-prepare` }) as ConversationMaterial
    expect(material).toMatchObject({ status: 'ready', deliveryScope: 'conversation', format: 'image', mimeType: 'image/png', contentHash: sha(png) })
    const preview = await service.handle('getMaterialPreview', { id: material.id, expectedRevision: material.revision }) as MaterialPreview
    expect(sha(Buffer.from(preview.imageUrl!.split(',')[1], 'base64'))).toBe(sha(png))
    const prepared = await service.handle('getConversation', { id: conversation.id }) as ConversationDetail
    expect(prepared.messages).toEqual([]); expect(prepared.runs).toEqual([]); expect(prepared.turns).toEqual([]); expect(prepared.workItems).toEqual([])
    expect(requests.filter(row => row.protocol === protocol)).toEqual([])
    const send = { conversationId: conversation.id, content: prompt, requestId: `${batch}-${protocol}-send`, mentionIds: [], materialSelections: [{ id: material.id, revision: material.revision }] }
    await expect(service.handle('sendMessage', { ...send, requestId: `${send.requestId}-stale`, materialSelections: [{ id: material.id, revision: material.revision + 1 }] })).rejects.toThrow()
    const foreign = await service.handle('createConversation', { kind: 'group', title: 'Unrelated chat', agentIds: [agent.id], mode: 'mention', sharedKnowledgeIds: [] }) as Conversation
    await expect(service.handle('sendMessage', { ...send, conversationId: foreign.id, requestId: `${send.requestId}-foreign` })).rejects.toThrow()
    expect(requests.filter(row => row.protocol === protocol)).toEqual([])
    const sent = await service.handle('sendMessage', send) as Message
    expect(await service.handle('getMessageReceipt', { requestId: send.requestId })).toEqual(sent)
    let detail = await settled(service, conversation.id, sent.id); completed(detail, protocol)
    expect(detail.messages.filter(message => message.senderType === 'agent')).toHaveLength(1)
    expect(detail.materials).toEqual([expect.objectContaining({ id: material.id, messageId: sent.id, contentHash: sha(png) })])
    expect(sent.materialIds).toEqual([material.id]); snapshots.push({ phase: 'none', detail })
    const original = join(dataPath, 'materials', conversation.id, material.id, 'original')
    expect(sha(await readFile(original))).toBe(sha(png))
    await service.close(); service = undefined
    const before = await read(), beforeCount = requests.length
    expect(JSON.stringify(before)).not.toContain('data:image/')
    service = create(); await service.init(); await new Promise(done => setTimeout(done, 150))
    expect(requests).toHaveLength(beforeCount); expect(await read()).toEqual(before)
    await service.handle('getConnectionModelCatalog', { id: connection.id, baseUrl: root, gateway: connection.gateway, expectedRevision: connection.revision })
    const updated = await service.handle('saveAgent', { ...definition, id: agent.id, expectedConfigVersion: agent.configVersion, thinkingLevel: 'auto' }) as DigitalAgent
    expect(updated.thinkingLevel).toBe('auto'); current.effort = 'auto'
    const next = await service.handle('sendMessage', { conversationId: conversation.id, content: followup, requestId: `${batch}-${protocol}-continue`, mentionIds: [] }) as Message
    detail = await settled(service, conversation.id, next.id); completed(detail, protocol)
    expect(detail.messages.filter(message => message.senderType === 'agent')).toHaveLength(2)
    expect(requests.filter(row => row.protocol === protocol && row.stage === 'chat').map(row => [row.effort, row.imageHashes])).toEqual([['none', [sha(png)]], ['auto', [sha(png)]]])
    expect(detail.materials).toEqual(snapshots[0].detail.materials); expect(sha(await readFile(original))).toBe(sha(png))
    snapshots.push({ phase: 'auto-explicit-continuation', detail })
    expect(await sources()).toEqual(sourceBefore); status = 'passed'
  } catch (error) { status = 'failed'; failure = String(error).slice(0, 4000); throw error }
  finally {
    await service?.close()
    const records = await read()
    await writeFile(join(directory, 'result.json'), JSON.stringify({ batch, version, protocol, model, status, failure, imageHash: sha(png), requests: requests.filter(row => row.protocol === protocol), snapshots, closedRecords: records, closedAt: new Date().toISOString() }, null, 2))
  }
}, 520000)
