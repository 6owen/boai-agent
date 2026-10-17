/*
 * [INPUT]: Explicit local Magpie business opt-in, three saved gateway connections and production AppService/MastraEngine.
 * [OUTPUT]: Bounded creation/revision/explicit post-restart continuation with selectable catalog model/effort and per-request actual route evidence.
 * [POS]: Deterministic integration acceptance, not semantic quality optimization; personal BOAI/Magpie settings are untouched.
 * [PROTOCOL]: Update Header and tests/.folder.md and record every actual batch in the Magpie acceptance ledger.
 */
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { AppService } from '../src/runtime/service'
import { MastraEngine } from '../src/runtime/adapters/mastra/engine'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { probeMagpie } from '../src/runtime/adapters/mastra/model-catalog'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, Message } from '../src/shared/domain'
import type { ArtifactPreview, ArtifactVersion } from '../src/shared/domain/artifacts'
import type { ModelProtocol } from '../src/shared/domain/model-gateway'

const enabled = process.env.BOAI_MAGPIE_BUSINESS_REAL === '1'
const batch = process.env.BOAI_MAGPIE_BATCH ?? 'unset'
const root = 'http://127.0.0.1:3425', selected = process.env.BOAI_MAGPIE_BUSINESS_MODEL ?? 'deepseek/deepseek-flash', thinkingLevel = process.env.BOAI_MAGPIE_BUSINESS_EFFORT ?? 'none'
const evidenceRoot = resolve('.local/magpie-20261017', `business-${batch}`)
const initialBody = '# 接入验收\n状态：待验证\n备注：保留原文。'
const initialPrompt = `请创建并交付真实文件 magpie-check.md，正文恰好为以下三行，不增加解释：\n${initialBody}\n请实际保存文件并作为成果交付，不要只在聊天中展示正文。`
const revisionPrompt = '请修订这份文件，仅把“状态：待验证”改为“状态：已验证”，保留其他所有文字和换行，并交付更新后的文件。'
const continuationPrompt = '根据刚才已经交付的最新文件，仅回答其中的状态值。不修改文件，不重新交付。'
const originalFetch = globalThis.fetch
const requests: { protocol: ModelProtocol; phase: string; path: string; model: unknown; reasoning: unknown; thinking: unknown; effort: unknown; hasTools: boolean; startedAt: string; status?: number; actualModel?: string | null; actualProvider?: string | null; error?: string }[] = []
let current: { protocol: ModelProtocol; phase: string } | undefined, version = ''
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
async function inputs() {
  const files = (await readdir(resolve('src'), { recursive: true })).filter(file => /\.(ts|tsx|json)$/.test(file)).map(file => `src/${file}`)
  files.push('package.json', 'pnpm-lock.yaml', 'tests/magpie-business-live.test.ts')
  const entries = await Promise.all(files.sort().map(async file => [file, sha(await readFile(file))] as const))
  return { hash: sha(JSON.stringify(entries)), files: Object.fromEntries(entries) }
}
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted', 'waiting_user'])
async function settled(service: AppService, conversationId: string, message: Message): Promise<ConversationDetail> {
  const deadline = Date.now() + 240_000
  while (Date.now() < deadline) {
    const detail = await service.handle('getConversation', { id: conversationId }) as ConversationDetail
    if (detail.runs.some(run => run.triggerMessageId === message.id) && detail.runs.every(run => terminal.has(run.status)) && detail.turns?.length && detail.turns.every(turn => terminal.has(turn.status))) return detail
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw new Error('Business experiment observation deadline reached; close and retain actual final records, never replay')
}
function assertPublished(detail: ConversationDetail, protocol: ModelProtocol) {
  expect(detail.runs.length).toBeGreaterThan(0)
  expect(detail.runs.every(run => run.status === 'completed')).toBe(true)
  expect(detail.turns?.every(turn => turn.status === 'completed')).toBe(true)
  const calls = detail.runs.flatMap(run => run.modelCalls ?? [])
  expect(calls.length).toBeGreaterThan(0)
  expect(new Set(calls.map(call => call.callId)).size).toBe(calls.length)
  expect(calls.every(call => call.protocol === protocol && call.selectedModelId === selected && call.route?.routeSource === 'response-headers' && Boolean(call.route.actualModelId) && Boolean(call.route.actualProvider))).toBe(true)
}
beforeAll(async () => {
  if (!enabled) return
  if (!/^[a-z0-9-]{1,80}$/.test(batch) || batch === 'unset') throw new Error('A new explicit batch ID is required')
  await mkdir(evidenceRoot, { recursive: false })
  version = (await probeMagpie(root)).version
  await writeFile(join(evidenceRoot, 'plan.json'), JSON.stringify({ batch, version, selected, thinkingLevel, protocols: ['chat', 'responses', 'messages'], userMessages: 9, maxInferenceRequests: 90, maxPerProtocol: 30, observationDeadlinePerMessageMs: 240000, retries: 0, tasks: [initialPrompt, revisionPrompt, continuationPrompt], oracle: 'actual file bytes, version/Work references, route evidence and restart no replay followed by explicit new message', scope: 'source AppService; no Electron/app-package or semantic quality claim', source: await inputs() }, null, 2))
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    if (url.origin !== root || !url.pathname.startsWith('/v1/') || (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase() !== 'POST') return originalFetch(input, init)
    if (!current || requests.length >= 90 || requests.filter(request => request.protocol === current!.protocol).length >= 30) throw new Error('Predeclared real experiment request cap reached')
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : {}
    const row: typeof requests[number] = { ...current, path: url.pathname, model: body.model, reasoning: body.reasoning ?? body.reasoning_effort, thinking: body.thinking, effort: body.output_config?.effort, hasTools: Array.isArray(body.tools) && body.tools.length > 0, startedAt: new Date().toISOString() }
    requests.push(row)
    try { const response = await originalFetch(input, init); row.status = response.status; row.actualModel = response.headers.get('x-magpie-model'); row.actualProvider = response.headers.get('x-magpie-provider'); return response } catch (error) { row.error = String(error); throw error }
  }
})
afterAll(async () => { globalThis.fetch = originalFetch; if (enabled && version) await writeFile(join(evidenceRoot, 'requests.json'), JSON.stringify(requests, null, 2)) })
test.skipIf(!enabled).each(['chat', 'responses', 'messages'] as const)('Magpie %s employee creates/revises a real artifact and continues only on a new message after restart', async protocol => {
  current = { protocol, phase: 'setup' }
  const caseRoot = join(evidenceRoot, protocol); await mkdir(caseRoot)
  const dataPath = join(caseRoot, 'data'), keys = new Map<string, string>(), startingSource = await inputs()
  let service: AppService | undefined, chat: Conversation | undefined, detail: ConversationDetail | undefined
  let first: ArtifactVersion | undefined, second: ArtifactVersion | undefined, status = 'running', error: string | undefined
  const snapshots: { phase: string; detail: ConversationDetail }[] = []
  const makeService = () => new AppService({ dataPath, engine: new MastraEngine(), secrets: { get: async id => keys.get(id), set: async (id, value) => { keys.set(id, value) }, delete: async id => { keys.delete(id) } }, emit: () => {} })
  try {
    service = makeService(); await service.init()
    const connection = await service.handle('saveConnection', { name: `Magpie ${protocol}`, provider: protocol === 'messages' ? 'anthropic' : 'openai-compatible', baseUrl: root, defaultModel: selected, gateway: { kind: 'magpie', protocol, auth: 'local' } }) as Connection
    await service.handle('getConnectionModelCatalog', { id: connection.id, baseUrl: root, gateway: connection.gateway, expectedRevision: connection.revision })
    const employee = await service.handle('saveAgent', { name: '接入验收员工', role: '按要求处理文件', instructions: '根据用户明确要求处理文件，并通过应用提供的能力交付实际文件。', color: '#123456', connectionId: connection.id, modelId: selected, thinkingLevel, skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent
    chat = await service.handle('createConversation', { kind: 'direct', title: `Magpie ${protocol} 文件业务`, agentIds: [employee.id], mode: 'mention', sharedKnowledgeIds: [] }) as Conversation
    current.phase = 'create'
    const message = await service.handle('sendMessage', { conversationId: chat.id, content: initialPrompt, requestId: `${batch}-${protocol}-create`, mentionIds: [] }) as Message
    detail = await settled(service, chat.id, message); snapshots.push({ phase: 'create', detail }); assertPublished(detail, protocol)
    expect(detail.artifacts).toHaveLength(1)
    first = (await service.handle('getArtifactPreview', { id: detail.artifacts[0].id! }) as ArtifactPreview).artifact
    const original = await readFile(first.path, 'utf8'); expect(original.trimEnd()).toBe(initialBody); expect(sha(Buffer.from(original))).toBe(first.contentHash)
    expect(detail.workItems?.find(work => work.id === first!.sourceWorkId)?.status).toBe('delivered')
    await writeFile(join(caseRoot, 'original.md'), original)
    current.phase = 'revision'
    const revision = await service.handle('reviseArtifact', { conversationId: chat.id, artifactId: first.id, contentHash: first.contentHash, targetAgentId: employee.id, content: revisionPrompt, requestId: `${batch}-${protocol}-revision` }) as Message
    detail = await settled(service, chat.id, revision); snapshots.push({ phase: 'revision', detail }); assertPublished(detail, protocol)
    const revised = detail.artifacts.find(artifact => artifact.previousArtifactId === first!.id)
    expect(revised).toBeDefined(); second = (await service.handle('getArtifactPreview', { id: revised!.id! }) as ArtifactPreview).artifact
    expect(second).toMatchObject({ logicalArtifactId: first.logicalArtifactId, previousArtifactId: first.id, contentVersion: first.contentVersion + 1 })
    const updated = await readFile(second.path, 'utf8'); expect(updated).toBe(original.replace('状态：待验证', '状态：已验证')); expect(sha(Buffer.from(updated))).toBe(second.contentHash); expect(await readFile(first.path, 'utf8')).toBe(original)
    expect(second.sourceWorkId).not.toBe(first.sourceWorkId); expect(detail.workItems?.find(work => work.id === second!.sourceWorkId)?.status).toBe('delivered')
    await writeFile(join(caseRoot, 'revision.md'), updated)
    const tools = detail.runs.flatMap(run => run.toolEvents).filter(event => event.status === 'completed')
    expect(tools.filter(event => event.name === 'publish_artifact')).toHaveLength(2)
    expect(tools.some(event => ['write_file', 'edit_file'].includes(event.name))).toBe(true)
    expect(requests.filter(request => request.protocol === protocol && request.hasTools).length).toBeGreaterThan(0)
    current.phase = 'restart'; await service.close(); service = undefined
    const beforeRestart = requests.length
    service = makeService(); await service.init(); await new Promise(resolve => setTimeout(resolve, 150))
    const recovered = await service.handle('getConversation', { id: chat.id }) as ConversationDetail
    expect(requests).toHaveLength(beforeRestart); expect(recovered.runs.map(run => [run.id, run.status, run.modelCalls])).toEqual(detail.runs.map(run => [run.id, run.status, run.modelCalls]))
    expect(recovered.artifacts).toEqual(detail.artifacts); snapshots.push({ phase: 'restart', detail: recovered })
    expect(recovered.runs.flatMap(run => run.modelCalls ?? [])).toHaveLength(requests.filter(row => row.protocol === protocol).length)
    current.phase = 'explicit-new-message'
    const continuation = await service.handle('sendMessage', { conversationId: chat.id, content: continuationPrompt, requestId: `${batch}-${protocol}-continue`, mentionIds: [] }) as Message
    detail = await settled(service, chat.id, continuation); snapshots.push({ phase: 'explicit-new-message', detail }); assertPublished(detail, protocol)
    expect(detail.messages.some(value => value.senderType === 'agent' && value.createdAt >= continuation.createdAt && value.content.includes('已验证'))).toBe(true)
    expect(detail.artifacts).toEqual(recovered.artifacts); expect(detail.workItems?.map(work => work.id)).toEqual(recovered.workItems?.map(work => work.id))
    expect(detail.runs.flatMap(run => run.modelCalls ?? [])).toHaveLength(requests.filter(row => row.protocol === protocol).length)
    if (selected.startsWith('group/')) expect(detail.runs.flatMap(run => run.modelCalls ?? []).every(call => call.route?.actualModelId !== selected)).toBe(true)
    expect((await inputs()).hash).toBe(startingSource.hash); status = 'passed'
  } catch (failure) { status = 'failed'; error = String(failure instanceof Error ? failure.message : failure).slice(0, 4000); throw failure }
  finally {
    if (service && chat) { try { detail = await service.handle('getConversation', { id: chat.id }) as ConversationDetail } catch { /* Preserve existing observed data. */ } }
    await service?.close()
    let closedRecords: Record<string, unknown> | undefined, closedEvidenceError: string | undefined
    try { const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite')); try { closedRecords = { runs: await store.load('runs'), turns: await store.load('turns'), works: await store.load('workItems'), artifacts: await store.load('artifacts'), messages: await store.load('messages') } } finally { await store.close() } } catch (failure) { closedEvidenceError = String(failure).slice(0, 1000); if (status === 'passed') { status = 'failed'; error = 'Final read-only evidence unavailable' } }
    await writeFile(join(caseRoot, 'result.json'), JSON.stringify({ batch, protocol, selected, thinkingLevel, version, status, error, inferenceRequests: requests.filter(row => row.protocol === protocol), sourceBefore: startingSource, sourceAfter: await inputs(), first, second, snapshots, lastObserved: detail, closedRecords, closedEvidenceError, closedAt: new Date().toISOString(), scope: 'source production business gate, no desktop/package certification' }, null, 2))
    if (closedEvidenceError && !closedRecords) throw new Error(`Final evidence capture failed: ${closedEvidenceError}`)
  }
}, 750_000)
