/*
 * [INPUT]: Explicit opt-in, installed Codex, isolated native config/AppService and HTTP Responses fixture.
 * [OUTPUT]: Real CLI source/model/auth precedence, native tools and settings preservation; no supplier inference or personal configuration changes.
 * [POS]: G2 Codex actual installed binary wire gate, separate from Magpie business evidence.
 * [PROTOCOL]: Update Header and tests/.folder.md when changing this gate.
 */
import { createServer, type Server } from 'node:http'
import { mkdtemp, mkdir, realpath, writeFile, readFile, rm } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, test, vi } from 'vitest'
import { AppService } from '../src/runtime/service'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, LaunchProfile, Message } from '../src/shared/domain'

test.skipIf(process.env.BOAI_CODEX_GATEWAY_WIRE !== '1')('installed Codex uses the explicit gateway over native profile and ambient sources without losing tools', async () => {
  const batch = process.env.BOAI_MAGPIE_BATCH
  if (!batch || !/^[a-z0-9-]{1,80}$/.test(batch)) throw new Error('Specify a new BOAI_MAGPIE_BATCH')
  const evidence = resolve('.local/magpie-20261017', `codex-wire-${batch}`)
  await mkdir(evidence)
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-codex-wire-'))), config = join(root, '.codex')
  await mkdir(config)
  const servers: Server[] = [], requests: { path: string; model: string; keyIsPublic: boolean; toolNames: string[] }[] = []
  let service: AppService | undefined, forbidden = 0, parentCalls = 0, profile: LaunchProfile | undefined, run: ConversationDetail['runs'][number] | undefined, failure: string | undefined
  const listen = async (host: Server) => { servers.push(host); await new Promise<void>(resolve => host.listen(0, '127.0.0.1', resolve)); return `http://127.0.0.1:${(host.address() as { port: number }).port}` }
  const trap = await listen(createServer((_req, res) => { forbidden++; res.writeHead(503); res.end('wrong source') }))
  const endpoint = await listen(createServer((req, res) => { void (async () => {
    let raw = ''; for await (const part of req) { raw += part; if (raw.length > 4_000_000) throw new Error('Fixture request too large') }
    const body = raw ? JSON.parse(raw) : {}
    if (req.method !== 'POST' || req.url !== '/relay/v1/responses') { res.writeHead(404); res.end('{}'); return }
    const names = (tools: { name?: string; type?: string; tools?: never[] }[]): string[] => tools.flatMap(tool => [tool.name ?? tool.type ?? '', ...names(tool.tools ?? [])])
    requests.push({ path: req.url, model: body.model, keyIsPublic: req.headers.authorization === 'Bearer magpie-boai', toolNames: names(body.tools ?? []) })
    if (requests.length > 6) { res.writeHead(429); res.end('fixture request cap'); return }
    res.writeHead(200, { 'content-type': 'text/event-stream' })
    let sequence = 0
    const event = (type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...data })}\n\n`)
    const item = { id: 'msg_wire', type: 'message', role: 'assistant', phase: 'final_answer', status: 'completed', content: [{ type: 'output_text', text: 'BOAI_GATEWAY_WIRE_OK', annotations: [] }] }
    const response = { id: `resp_${requests.length}`, object: 'response', created_at: 1, model: body.model, status: 'in_progress', output: [] }
    event('response.created', { response })
    event('response.output_item.added', { output_index: 0, item: { ...item, status: 'in_progress', content: [] } })
    event('response.content_part.added', { item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })
    event('response.output_text.delta', { item_id: item.id, output_index: 0, content_index: 0, delta: 'BOAI_GATEWAY_WIRE_OK' })
    event('response.output_text.done', { item_id: item.id, output_index: 0, content_index: 0, text: 'BOAI_GATEWAY_WIRE_OK' })
    event('response.output_item.done', { output_index: 0, item })
    event('response.completed', { response: { ...response, status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } }); res.end()
  })().catch(() => { res.writeHead(500); res.end('fixture failure') }) }))
  const settings = `model = "wrong-root-model"\nmodel_provider = "wrong"\n[model_providers.wrong]\nname = "Wrong trap"\nbase_url = "${trap}/v1"\nwire_api = "responses"\nenv_key = "BOAI_WIRE_WRONG_KEY"\nrequires_openai_auth = false\nsupports_websockets = false\n[analytics]\nenabled = false\n`
  await writeFile(join(config, 'config.toml'), settings)
  await writeFile(join(evidence, 'plan.json'), JSON.stringify({ batch, model: 'group/work', savedApiProtocol: 'chat', nativeProtocol: 'responses', maxRequests: 6, scope: 'installed Codex with local HTTP fixture; no supplier inference', settingsHash: createHash('sha256').update(settings).digest('hex') }, null, 2))
  vi.stubEnv('HOME', root); vi.stubEnv('CODEX_HOME', config); vi.stubEnv('OPENAI_BASE_URL', trap); vi.stubEnv('OPENAI_API_KEY', 'synthetic-wrong-ambient'); vi.stubEnv('BOAI_WIRE_WRONG_KEY', 'synthetic-wrong-profile')
  try {
    service = new AppService({ dataPath: join(root, 'data'), engine: { run: async () => { parentCalls++; throw new Error('No API parent') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
    await service.init()
    const draft = { name: 'Installed Codex wire', executable: process.env.BOAI_CODEX_EXECUTABLE ?? 'codex', args: [], protocol: 'codex-app-server', useExistingLogin: true, codexHome: config, hostAccessAcknowledged: true }
    await service.handle('testLaunchProfileDraft', draft); profile = await service.handle('saveLaunchProfile', draft) as LaunchProfile
    const connection = await service.handle('saveConnection', { name: 'Wire Magpie', provider: 'openai-compatible', baseUrl: `${endpoint}/relay`, defaultModel: 'group/work', gateway: { kind: 'magpie', auth: 'local', protocol: 'chat' } }) as Connection
    const agent = await service.handle('saveAgent', { name: '网关原生验证', role: '测试', instructions: '按消息回答', color: '#00AABB', connectionId: connection.id, modelId: '', executionBackend: { kind: 'codex-local', profileId: profile.id }, skillIds: [], knowledgeIds: [], allowCommands: true, active: true }) as DigitalAgent
    const chat = await service.handle('createConversation', { kind: 'direct', title: 'Wire', agentIds: [agent.id] }) as Conversation
    const message = await service.handle('sendMessage', { conversationId: chat.id, content: '只回答 BOAI_GATEWAY_WIRE_OK。', mentionIds: [], requestId: `${batch}-message` }) as Message
    await expect.poll(async () => { const view = await service!.handle('getConversation', { id: chat.id }) as ConversationDetail; run = view.runs.find(value => value.triggerMessageId === message.id); return run && ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status) }, { timeout: 45000, interval: 100 }).toBe(true)
    expect(run?.status, run?.error).toBe('completed')
    expect(requests.length).toBeGreaterThan(0); expect(requests.length).toBeLessThanOrEqual(6)
    expect(requests.every(request => request.model === 'group/work' && request.keyIsPublic)).toBe(true)
    expect(requests.some(request => request.toolNames.some(name => ['exec_command', 'shell', 'shell_command'].includes(name)))).toBe(true)
    expect(requests.some(request => request.toolNames.includes('publish_artifact'))).toBe(true)
    expect(forbidden).toBe(0); expect(parentCalls).toBe(0)
    expect(run?.backend?.modelSource).toMatchObject({ protocol: 'responses', selectedModelId: 'group/work', connectionRevision: 1 })
    expect(await readFile(join(config, 'config.toml'), 'utf8')).toBe(settings)
  } catch (error) { failure = error instanceof Error ? error.message : String(error); throw error }
  finally {
    await service?.close()
    await writeFile(join(evidence, 'result.json'), JSON.stringify({ status: failure ? 'failed' : 'passed', failure, version: profile?.verified?.version, executableHash: profile?.executableHash, requests, forbidden, parentCalls, run: run ? { id: run.id, status: run.status, error: run.error, backend: run.backend } : undefined }, null, 2))
    vi.unstubAllEnvs()
    for (const host of servers) { host.closeAllConnections(); await new Promise<void>(resolve => host.close(() => resolve())) }
    await rm(root, { recursive: true, force: true })
  }
}, 60000)
