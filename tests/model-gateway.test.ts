/*
 * [OUTPUT]: 旧SQLite连接缺省字段保持；旧员工沿原备份/API后端迁移一次，另加网关不改绑定/协议/密钥或触发推理。
 * [OUTPUT]: 无Run连接换源等待实际适配器退出；即使适配器忽略abort并返回成功，也不采用迟到结果。
 * [OUTPUT]: 无Run路由按原连接测试/团队attempt/草稿身份留证，正常关闭等待实际退出。
 * [OUTPUT]: 长模型ID从目录/连接/员工/团队/插件保存至三SDK请求保真；越界/控制符拒绝且不留下半保存。
 * [INPUT]: Public gateway contracts, AppService persistence and actual Mastra/Anthropic SDKs against isolated HTTP fixtures.
 * [OUTPUT]: Persistent source-matched catalog, refresh races and raw reasoning on three SDK wires; root/protocol/auth isolation, bounded catalog metadata, revision checks and three real SDK wire contracts; not a supplier certification.
 * [POS]: Magpie integration module regression; personal Magpie configuration is never accessed here.
 * [PROTOCOL]: Update Header and tests/.folder.md when changing coverage.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { Agent } from '@mastra/core/agent'
import { teamEditableSchema } from '../packages/shared/src/domain/team-creation'
import { claudeProvider } from '../packages/shared/src/domain/claude-provider'
import { claudeProviderEnvironment } from '../packages/runtime/src/adapters/claude/policy'
import { hostFrameSchema } from '../packages/runtime/src/adapters/plugins/validation'
import { decisionProviderOptions, modelConfig, thinkingProviderOptions } from '../packages/runtime/src/adapters/mastra/model-config'
import { gatewayRouteEvidence, gatewayRouteObserver } from '../packages/runtime/src/adapters/mastra/gateway-route'
import { assertThinkingPreference } from '../packages/shared/src/domain/model-preferences'
import type { ModelCatalog } from '../packages/shared/src/domain/model-gateway'
import { gatewayApiKey, gatewayEndpoint, type ModelGateway, type ModelProtocol } from '../packages/shared/src/domain/model-gateway'
import type { AgentInput, Connection, ConnectionInput, Snapshot } from '../packages/shared/src/domain'
import { listModelCatalog, probeMagpie } from '../packages/runtime/src/adapters/mastra/model-catalog'
import { MastraEngine } from '../packages/runtime/src/adapters/mastra/engine'
import type { AgentEngine } from '../packages/runtime/src/contracts'
import { AppService } from '../packages/runtime/src/service'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { sendTeamOutput, writingPlan } from './fixtures/team-planner'
import type { TeamDraft, TeamDraftView } from '../packages/shared/src/domain/team-creation'

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn() })
async function server(handler: (req: IncomingMessage, res: ServerResponse) => void) {
  const host = createServer(handler)
  await new Promise<void>(resolve => host.listen(0, '127.0.0.1', resolve))
  cleanup.push(async () => { host.closeAllConnections(); await new Promise<void>(resolve => host.close(() => resolve())) })
  return `http://127.0.0.1:${(host.address() as { port: number }).port}`
}
const gateway = (protocol: ModelProtocol = 'chat'): ModelGateway => ({ kind: 'magpie', auth: 'local', protocol })
async function fixture(engine?: AgentEngine) {
  const dataPath = await mkdtemp(join(tmpdir(), 'boai-magpie-'))
  cleanup.push(() => rm(dataPath, { recursive: true, force: true }))
  const keys = new Map<string, string>(), calls: { connection: Connection; key: string }[] = []
  const create = () => new AppService({ dataPath, engine: engine ?? { run: async () => {}, test: async (connection, key) => { calls.push({ connection, key }); return 'OK' } },
    secrets: { get: async id => keys.get(id), set: async (id, key) => { keys.set(id, key) }, delete: async id => { keys.delete(id) } }, emit: () => {} })
  let service = create()
  cleanup.push(() => service.close()); await service.init()
  return { service, dataPath, keys, calls, restart: async () => { await service.close(); service = create(); await service.init(); return service } }
}

test('standalone SDK calls persist routes under tests, draft requests and individual planning attempts without fake Runs', async () => {
  let requests = 0, plans = 0
  const root = await server((req, res) => { void (async () => {
    let raw = ''; for await (const part of req) raw += part
    const body = JSON.parse(raw); requests++
    expect(body.model).toBe('group/work'); expect(req.headers.authorization).toBe('Bearer magpie-boai')
    const system = JSON.stringify(body.messages.filter((message: { role: string }) => message.role === 'system'))
    if (requests !== 5) { res.setHeader('X-Magpie-Model', `vendor/model-${requests}`); res.setHeader('X-Magpie-Provider', 'vendor') }
    if (system.includes('只提取可审阅')) sendTeamOutput(res, { name: '日报', prompt: '整理资料', target: null, frequency: 'daily', daysOfWeek: [], time: '09:00', timezone: null, notificationPolicy: 'important_only', unsupported: [] })
    else if (system.includes('BoAI 内置团队创建助手')) sendTeamOutput(res, plans++ ? writingPlan : { ...writingPlan, allowCommands: true })
    else sendTeamOutput(res, 'OK')
  })() })
  const f = await fixture(new MastraEngine()), { service } = f
  const source: ConnectionInput = { name: 'Magpie', provider: 'openai-compatible', baseUrl: root, defaultModel: 'group/work', gateway: gateway() }
  const saved = await service.handle('saveConnection', source) as Connection
  const tested = await service.handle('testConnection', { id: saved.id }) as { modelCall: import('../packages/shared/src/domain/model-gateway').GatewayModelCall }
  const draftTest = await service.handle('testConnectionDraft', { ...source, id: saved.id, expectedRevision: saved.revision }) as typeof tested
  expect(tested.modelCall).toMatchObject({ connectionId: saved.id, connectionRevision: 1, phase: 'connection-test', route: { actualModelId: 'vendor/model-1' } })
  expect(draftTest.modelCall.connectionId).not.toBe(saved.id); expect(draftTest.modelCall.connectionRevision).toBe(0)
  expect(draftTest.modelCall.route?.actualModelId).toBe('vendor/model-2')
  const draftRequest = { draftId: 'draft', version: 1, requestId: 'draft-call', connectionId: saved.id, instruction: '每天九点整理资料', timezone: 'Asia/Singapore' }
  await service.handle('generateAutomationDraft', draftRequest)
  await expect(service.handle('generateAutomationDraft', draftRequest)).rejects.toThrow('已经受理')
  const draft = await service.handle('openTeamDraft', undefined) as TeamDraft
  const edited = await service.handle('saveTeamDraft', { draftId: draft.id, expectedVersion: draft.version, editableFields: { prompt: '写作团队', selectedConnectionId: saved.id, selectedModelId: '', createGroup: true, groupTitle: '' } }) as TeamDraft
  await service.handle('generateTeamPlan', { draftId: draft.id, expectedVersion: edited.version, requestId: 'plan-call' })
  let view: TeamDraftView | undefined
  await expect.poll(async () => { view = await service.handle('getTeamDraft', { draftId: draft.id }) as TeamDraftView; return view.generation?.status }, { timeout: 5000 }).toBe('succeeded')
  const attempts = view!.generation!.attempts
  expect(attempts).toHaveLength(2); expect(attempts.map(a => a.phase)).toEqual(['initial', 'repair'])
  expect(attempts[0].modelCall).toMatchObject({ callId: attempts[0].callId, phase: 'team-plan', route: { actualModelId: 'vendor/model-4' } })
  expect(attempts[1].modelCall).toMatchObject({ callId: attempts[1].callId, route: { routeSource: 'unknown' } })
  expect(attempts[1].modelCall!.route!.actualModelId).toBeUndefined()
  expect(new Set([tested.modelCall.callId, draftTest.modelCall.callId, 'draft-call', ...attempts.map(a => a.callId)]).size).toBe(5)
  const restarted = await f.restart()
  expect(requests).toBe(5)
  expect((await restarted.handle('getTeamDraft', { draftId: draft.id }) as TeamDraftView).generation?.attempts).toEqual(attempts)
  expect((await restarted.handle('snapshot', undefined) as Snapshot).connections).toHaveLength(1)
  const store = await ProductStore.openReadOnly(join(f.dataPath, 'boai.sqlite'))
  try {
    expect(await store.load('connectionTestCalls')).toMatchObject([{ source: 'saved', status: 'completed', modelCall: tested.modelCall }, { source: 'draft', status: 'completed', modelCall: draftTest.modelCall }])
    expect(await store.load('automationDraftCalls')).toMatchObject([{ id: 'draft-call', status: 'completed', modelCall: { callId: 'draft-call', phase: 'automation-draft', route: { actualModelId: 'vendor/model-3' } } }])
    for (const collection of ['runs', 'turns', 'workItems', 'messages', 'automations', 'automationOccurrences']) expect(await store.load(collection)).toEqual([])
  } finally { await store.close() }
})

test('closing a gateway connection test cancels its transport and waits for actual adapter exit', async () => {
  let begin!: () => void, finish!: () => void, aborted = false, closed = false
  const began = new Promise<void>(resolve => { begin = resolve }), drained = new Promise<void>(resolve => { finish = resolve })
  const f = await fixture({ run: async () => {}, test: async (_connection, _key, observation) => {
    begin(); await new Promise<void>(resolve => { observation!.signal!.addEventListener('abort', () => { aborted = true; resolve() }, { once: true }) })
    await drained; throw new Error('cancelled transport')
  } })
  const connection = await f.service.handle('saveConnection', { name: 'Magpie', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:3425', defaultModel: 'group/work', gateway: gateway() }) as Connection
  const result = f.service.handle('testConnection', { id: connection.id }).catch(error => error)
  await began
  const closing = f.service.close().then(() => { closed = true })
  try { await expect.poll(() => aborted).toBe(true); expect(closed).toBe(false) } finally { finish(); await closing }
  expect(await result).toBeInstanceOf(Error)
  const store = await ProductStore.openReadOnly(join(f.dataPath, 'boai.sqlite'))
  try { expect(await store.load('connectionTestCalls')).toMatchObject([{ status: 'cancelled', modelCall: { phase: 'connection-test' } }]); expect(await store.load('runs')).toEqual([]) } finally { await store.close() }
})

test.skipIf(!process.env.BOAI_MAGPIE_READONLY)('installed Magpie is readable through the production service without inference or saved connections', async () => {
  const { service, keys, calls } = await fixture(), baseUrl = 'http://127.0.0.1:3425'
  const identity = await service.handle('probeModelGateway', { baseUrl })
  expect(identity).toMatchObject({ name: 'magpie', baseUrl })
  const catalog = await service.handle('getConnectionModelCatalog', { baseUrl, gateway: gateway() }) as import('../packages/shared/src/domain/model-gateway').ModelCatalog
  expect(catalog.models.length).toBeGreaterThan(0)
  expect(catalog.models.every(model => model.id.length > 0)).toBe(true)
  expect((await service.handle('snapshot', undefined) as Snapshot).connections).toEqual([])
  expect(keys.size).toBe(0); expect(calls).toEqual([])
})

test('gateway roots preserve proxy prefixes and local identity cannot authenticate a remote gateway', () => {
  expect(gatewayEndpoint('https://example.test/relay/', '/v1/messages')).toBe('https://example.test/relay/v1/messages')
  expect(gatewayEndpoint('http://[::1]:3425', 'v1')).toBe('http://[::1]:3425/v1')
  for (const url of ['file:///private', 'https://key@example.test', 'https://example.test/?token=x', 'https://example.test/#fragment']) expect(() => gatewayEndpoint(url, 'v1')).toThrow()
  expect(gatewayApiKey({ baseUrl: 'http://127.0.0.1:3425', gateway: gateway() }, '')).toBe('magpie-boai')
  expect(() => gatewayApiKey({ baseUrl: 'https://example.test', gateway: gateway() }, 'secret')).toThrow('本机')
  expect(() => gatewayApiKey({ baseUrl: 'https://example.test', gateway: { ...gateway(), auth: 'key' } }, 'magpie-boai')).toThrow('真实网关密钥')
})

test('discovery verifies the service without inference; catalog retains raw IDs and unknown capabilities', async () => {
  const requests: string[] = []
  const root = await server((req, res) => {
    requests.push(req.url!); res.setHeader('Content-Type', 'application/json')
    if (req.url === '/proxy/api/hello') return void res.end(JSON.stringify({ name: 'magpie', version: 'fixture' }))
    if (req.url === '/wrong/api/hello') return void res.end(JSON.stringify({ name: 'other', version: 'fixture' }))
    expect(req.headers.authorization).toBe('Bearer magpie-boai')
    res.end(JSON.stringify({ data: [{ id: 'group/team' }, { id: 'vendor/org/model', display_name: 'Model', reasoning: true, supported_reasoning_levels: [{ effort: 'medium' }, { effort: 'xhigh' }], context_window: 128000, modalities: { input: ['text', 'image'] }, native_endpoints: ['/v1/messages'] }, { id: 'group/team' }, { id: 'unknown', reasoning: 'yes', context_window: -1 }] }))
  })
  await expect(probeMagpie(`${root}/proxy`)).resolves.toMatchObject({ name: 'magpie', version: 'fixture' })
  await expect(probeMagpie(`${root}/wrong`)).rejects.toThrow('未识别')
  const catalog = await listModelCatalog(`${root}/proxy/v1`, 'magpie-boai')
  expect(catalog.models).toEqual([{ id: 'group/team' }, { id: 'unknown' }, { id: 'vendor/org/model', name: 'Model', reasoning: true, reasoningLevels: ['medium', 'xhigh'], contextWindow: 128000, modalities: { input: ['text', 'image'] }, nativeEndpoints: ['/v1/messages'] }])
  expect(requests).toEqual(['/proxy/api/hello', '/wrong/api/hello', '/proxy/v1/models'])
})

test('saved local gateway uses no stored secret and rejects stale revisions; remote keys cannot follow changed endpoints', async () => {
  const { service, keys, calls } = await fixture()
  const input: ConnectionInput = { name: 'Magpie', provider: 'anthropic', baseUrl: 'http://127.0.0.1:3425', defaultModel: 'group/team', gateway: gateway('messages') }
  const saved = await service.handle('saveConnection', input) as Connection
  expect(saved).toMatchObject({ revision: 1, hasApiKey: false, gateway: gateway('messages') }); expect(keys.size).toBe(0)
  await service.handle('testConnection', { id: saved.id })
  expect(calls[0].key).toBe('magpie-boai')
  await service.handle('saveConnection', { ...input, id: saved.id, expectedRevision: 1, name: 'Changed' })
  await expect(service.handle('saveConnection', { ...input, id: saved.id, expectedRevision: 1 })).rejects.toThrow('连接已被修改')
  const remote = { ...input, gateway: { ...gateway(), auth: 'key' as const }, provider: 'openai-compatible' as const, baseUrl: 'https://gateway.example', apiKey: 'private-key' }
  const protectedConnection = await service.handle('saveConnection', remote) as Connection
  await expect(service.handle('getConnectionModelCatalog', { id: protectedConnection.id, baseUrl: 'https://other.example', gateway: remote.gateway })).rejects.toThrow('重新输入')
  expect(JSON.stringify(await service.handle('snapshot', undefined) as Snapshot)).not.toContain('private-key')
  await expect(service.handle('saveConnection', { ...input, baseUrl: 'https://remote.example' })).rejects.toThrow('网关密钥')
})

test.each(['chat', 'responses', 'messages'] as const)('actual SDK uses the gateway %s endpoint and preserves the full model ID', async protocol => {
  const received: { url: string; model: string; key: string; body: Record<string, unknown> }[] = []
  const root = await server((req, res) => { void (async () => {
    let raw = ''; for await (const part of req) raw += part
    const body = JSON.parse(raw); received.push({ url: req.url!, model: body.model, key: String(req.headers.authorization ?? req.headers['x-api-key']), body })
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'X-Magpie-Provider': 'upstream-vendor', 'X-Magpie-Model': `upstream-vendor/model-${received.length}` })
    const event = (type: string, data: object) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
    if (protocol === 'chat') {
      const chunk = (delta: object, finish_reason: string | null = null) => res.write(`data: ${JSON.stringify({ id: 'r', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      chunk({ role: 'assistant', content: 'OK' }); chunk({}, 'stop'); res.end('data: [DONE]\n\n')
    } else if (protocol === 'messages') {
      event('message_start', { message: { id: 'r', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } })
      event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
      event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'OK' } })
      event('content_block_stop', { index: 0 }); event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } }); event('message_stop', {}); res.end()
    } else {
      event('response.created', { response: { id: 'r', created_at: 1, model: body.model } })
      event('response.output_item.added', { output_index: 0, item: { id: 'm', type: 'message', role: 'assistant', content: [] } })
      event('response.content_part.added', { item_id: 'm', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })
      event('response.output_text.delta', { item_id: 'm', output_index: 0, content_index: 0, delta: 'OK' })
      event('response.output_item.done', { output_index: 0, item: { id: 'm', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: 'OK', annotations: [] }] } })
      event('response.completed', { response: { id: 'r', status: 'completed', created_at: 1, model: body.model, output: [], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } }); res.end()
    }
  })() })
  const connection: Connection = { id: `test-${protocol}`, name: 'Magpie', provider: 'openai-compatible', baseUrl: `${root}/proxy`, defaultModel: `vendor/org/${'m'.repeat(989)}`, hasApiKey: false, gateway: gateway(protocol) }
  await expect(new MastraEngine().test(connection, '')).resolves.toBe('OK')
  expect(received.map(({ body: _, ...request }) => request)).toEqual([{ url: `/proxy/v1/${protocol === 'chat' ? 'chat/completions' : protocol}`, model: connection.defaultModel, key: protocol === 'messages' ? 'magpie-boai' : 'Bearer magpie-boai' }])
  const levels = ['medium', 'xhigh', 'none', 'future_effort', ...(protocol === 'messages' ? ['off'] : [])]
  const catalog: ModelCatalog = { source: 'service-declared', fetchedAt: new Date().toISOString(), models: [{ id: connection.defaultModel, reasoningLevels: levels }] }
  const sdk = new Agent({ id: 'gateway-preferences', name: 'Fixture', instructions: 'Reply OK.', model: modelConfig(connection, '') })
  const routes: { id: string; route: import('../packages/shared/src/domain/model-gateway').GatewayRouteEvidence }[] = []
  for (const level of [...levels, 'auto']) {
    const output = await sdk.stream('Reply OK.', { maxSteps: 1, modelSettings: { maxOutputTokens: 100 }, providerOptions: thinkingProviderOptions(connection, undefined, level, 'chat', catalog), onStepFinish: gatewayRouteObserver({ connection, apiKey: 'magpie-boai', onModelCallRoute: async (id, route) => { routes.push({ id, route }) } }, () => `call-${level}`) })
    let text = ''; for await (const delta of output.textStream) text += delta
    expect(text).toBe('OK')
    const body = received.at(-1)!.body
    if (level === 'auto') {
      expect(body.reasoning_effort).toBeUndefined(); expect(body.reasoning).toBeUndefined(); expect(body.output_config).toBeUndefined(); expect(body.thinking).toBeUndefined()
    } else if (protocol === 'messages') {
      if (level === 'none' || level === 'off') { expect(body.output_config).toBeUndefined(); expect(body.thinking).toEqual({ type: 'disabled' }) }
      else { expect(body.output_config).toMatchObject({ effort: level }); expect(body.thinking).toEqual({ type: 'adaptive' }) }
    } else if (protocol === 'responses') expect(body.reasoning).toMatchObject({ effort: level })
    else expect(body.reasoning_effort).toBe(level)
    expect(body.model).toBe(connection.defaultModel)
    expect(routes.at(-1)).toMatchObject({ id: `call-${level}`, route: { routeSource: 'response-headers', actualModelId: `upstream-vendor/model-${received.length}`, actualProvider: 'upstream-vendor', reportedModelId: connection.defaultModel } })
  }
  if (protocol === 'messages') {
    const offset = received.length
    await Promise.all(['none', 'future_effort'].map(async level => {
      const output = await sdk.stream('Reply OK.', { maxSteps: 1, providerOptions: thinkingProviderOptions(connection, undefined, level, 'chat', catalog) })
      for await (const _delta of output.textStream) { /* Drain both overlapping requests. */ }
    }))
    const bodies = received.slice(offset).map(item => item.body)
    expect(bodies).toHaveLength(2)
    expect(bodies.some(body => (body.thinking as { type: string }).type === 'disabled' && body.output_config === undefined)).toBe(true)
    expect(bodies.some(body => (body.output_config as { effort?: string } | undefined)?.effort === 'future_effort' && (body.thinking as { type: string }).type === 'adaptive')).toBe(true)
  }

})


test('saved gateway catalog survives restart without modifying source or employee, and stale preferences are refused', async () => {
  let levels = ['medium', 'xhigh']
  const root = await server((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'vendor/model', supported_reasoning_levels: levels.map(effort => ({ effort })) }] })) })
  const f = await fixture()
  const connection = await f.service.handle('saveConnection', { name: 'Gateway', provider: 'openai-compatible', baseUrl: root, defaultModel: 'vendor/model', gateway: gateway() }) as Connection
  const input: AgentInput = { name: 'Gateway employee', role: '', instructions: '', color: '#123456', connectionId: connection.id, modelId: 'vendor/model', thinkingLevel: 'medium', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }
  await expect(f.service.handle('saveAgent', input)).rejects.toThrow('推理目录')
  const request = { id: connection.id, baseUrl: root, gateway: gateway(), expectedRevision: connection.revision }
  await f.service.handle('getConnectionModelCatalog', request)
  const employee = await f.service.handle('saveAgent', input) as import('../packages/shared/src/domain').DigitalAgent
  const before = await f.service.handle('snapshot', undefined) as Snapshot
  levels = ['medium', 'xhigh', 'future_effort']
  await f.service.handle('getConnectionModelCatalog', request)
  const after = await f.service.handle('snapshot', undefined) as Snapshot
  expect(after.connections).toEqual(before.connections); expect(after.agents).toEqual(before.agents)
  const restarted = await f.restart()
  await expect(restarted.handle('saveAgent', { ...input, id: employee.id, expectedConfigVersion: employee.configVersion, thinkingLevel: 'future_effort' })).resolves.toMatchObject({ thinkingLevel: 'future_effort' })
  const changed = await restarted.handle('saveConnection', { name: 'Changed', provider: connection.provider, baseUrl: root, defaultModel: connection.defaultModel, gateway: gateway(), id: connection.id, expectedRevision: connection.revision })
  expect(changed).toMatchObject({ revision: 2 })
  await expect(restarted.handle('saveAgent', { ...input, thinkingLevel: 'xhigh' })).rejects.toThrow('推理目录')
})

test('out-of-order or changed-source catalog responses never replace the current cache', async () => {
  const pending: ServerResponse[] = [], waiting: (() => void)[] = []
  const root = await server((_req, res) => { pending.push(res); waiting.shift()?.() })
  const next = () => new Promise<void>(resolve => waiting.push(resolve))
  const reply = (index: number, effort: string) => { pending[index].setHeader('Content-Type', 'application/json'); pending[index].end(JSON.stringify({ data: [{ id: 'model', supported_reasoning_levels: [{ effort }] }] })) }
  const { service } = await fixture()
  const input: ConnectionInput = { name: 'Gateway', provider: 'openai-compatible', baseUrl: root, defaultModel: 'model', gateway: gateway() }
  const connection = await service.handle('saveConnection', input) as Connection
  const request = { id: connection.id, baseUrl: root, gateway: gateway() }
  const firstReceived = next(), first = service.handle('getConnectionModelCatalog', request); const firstRejected = expect(first).rejects.toThrow('已变化'); await firstReceived
  const secondReceived = next(), second = service.handle('getConnectionModelCatalog', request); await secondReceived
  reply(1, 'xhigh'); await expect(second).resolves.toMatchObject({ models: [{ reasoningLevels: ['xhigh'] }] })
  reply(0, 'low'); await firstRejected
  const agent: AgentInput = { name: 'Employee', role: '', instructions: '', color: '#123456', connectionId: connection.id, modelId: 'model', thinkingLevel: 'xhigh', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }
  await expect(service.handle('saveAgent', agent)).resolves.toMatchObject({ thinkingLevel: 'xhigh' })
  const thirdReceived = next(), third = service.handle('getConnectionModelCatalog', request); const thirdRejected = expect(third).rejects.toThrow('已变化'); await thirdReceived
  await service.handle('saveConnection', { ...input, id: connection.id, expectedRevision: 1, gateway: gateway('responses') })
  reply(2, 'medium'); await thirdRejected
  await expect(service.handle('saveAgent', { ...agent, thinkingLevel: 'medium' })).rejects.toThrow('推理目录')
})

test('gateway reasoning requires current metadata, default adds no effort, and Messages never maps off to low', () => {
  const connection: Connection = { id: 'c', name: 'Gateway', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:3425', defaultModel: 'model', hasApiKey: false, gateway: gateway() }
  const catalog: ModelCatalog = { source: 'service-declared', fetchedAt: new Date().toISOString(), models: [{ id: 'model', reasoningLevels: ['none', 'medium', 'xhigh'] }] }
  expect(thinkingProviderOptions(connection, undefined, 'auto', 'decision')).toBeUndefined()
  expect(decisionProviderOptions({ ...connection, baseUrl: 'https://api.deepseek.com', defaultModel: 'deepseek-v4-pro' }, undefined, 'auto')).toBeUndefined()
  expect(() => assertThinkingPreference(connection, undefined, 'medium')).toThrow('推理目录')
  expect(() => assertThinkingPreference(connection, 'other', 'medium', catalog)).toThrow('推理目录')
  expect(() => assertThinkingPreference(connection, undefined, 'off', catalog)).toThrow('未声明')
  expect(() => assertThinkingPreference(connection, undefined, 'off', { ...catalog, models: [{ id: 'model', reasoningLevels: ['off'] }] })).toThrow('保真')
  expect(() => assertThinkingPreference({ ...connection, gateway: gateway('messages') }, undefined, 'none', catalog)).not.toThrow()
  expect(() => assertThinkingPreference({ ...connection, gateway: undefined }, undefined, 'medium', catalog)).toThrow('直连')
})


test('route evidence never infers actual model from body alone and observation failures do not fail the request', async () => {
  expect(gatewayRouteEvidence({ modelId: 'body-only', headers: { 'Set-Cookie': 'private', 'X-Magpie-Model': 'private-secret' } }, 'private-secret')).toMatchObject({ routeSource: 'unknown', reportedModelId: 'body-only' })
  const unknown = gatewayRouteEvidence({ modelId: 'body-only', headers: { 'X-Magpie-Model': 'invalid\nmodel', 'X-Magpie-Provider': 'vendor' } }, '')
  expect(unknown).toMatchObject({ routeSource: 'unknown', actualProvider: 'vendor' }); expect(unknown.actualModelId).toBeUndefined()
  const observer = gatewayRouteObserver({ connection: { gateway: gateway() } as Connection, apiKey: '', onModelCallRoute: async () => { throw new Error('store unavailable') } }, () => 'original-call')
  await expect(observer({ response: { modelId: 'body' } })).resolves.toBeUndefined()
})


test('host persists route evidence by original run/call across restart and never makes the last model the whole Work model', async () => {
  const f = await fixture({
    test: async () => 'OK',
    decide: async ctx => ({ action: ctx.messages.some(message => message.senderType === 'agent') ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: Math.max(...ctx.messages.map(message => message.sequence)) }),
    run: async ctx => {
      const first = ctx.modelCallId!; await ctx.onModelCallStarted!(first, 'chat')
      await ctx.onModelCallRoute!('foreign-request', gatewayRouteEvidence({ headers: { 'x-magpie-model': 'foreign/model' } }, ''))
      await ctx.onModelCallRoute!(first, gatewayRouteEvidence({ id: 'response-a', modelId: 'body-a', headers: { 'x-magpie-model': 'vendor/model-a', 'x-magpie-provider': 'vendor' } }, ''))
      const second = await ctx.onAdditionalModelCall!(); if (typeof second !== 'string') throw new Error('missing request identity')
      await ctx.onModelCallStarted!(second, 'chat'); await ctx.onModelCallRoute!(second, gatewayRouteEvidence({ id: 'response-b', modelId: 'body-b' }, ''))
      // A duplicate/late result must not overwrite the first exact response.
      await ctx.onModelCallRoute!(first, gatewayRouteEvidence({ headers: { 'x-magpie-model': 'later/model' } }, ''))
      await ctx.onDelta('完成')
    },
  })
  const connection = await f.service.handle('saveConnection', { name: 'Magpie', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:3425', defaultModel: 'group/route', gateway: gateway() }) as Connection
  const employee = await f.service.handle('saveAgent', { name: 'Routing employee', role: '', instructions: '', color: '#123456', connectionId: connection.id, modelId: 'group/route', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as import('../packages/shared/src/domain').DigitalAgent
  const conversation = await f.service.handle('createConversation', { kind: 'direct', title: 'Routing fixture', agentIds: [employee.id], mode: 'mention', sharedKnowledgeIds: [] }) as import('../packages/shared/src/domain').Conversation
  await f.service.handle('sendMessage', { conversationId: conversation.id, content: '你好', requestId: 'gateway-route-fixture', mentionIds: [] })
  const detail = () => f.service.handle('getConversation', { id: conversation.id }) as Promise<import('../packages/shared/src/domain').ConversationDetail>
  await expect.poll(async () => (await detail()).runs.find(run => run.phase === 'execution')?.status, { timeout: 5000 }).toBe('completed')
  const run = (await detail()).runs.find(run => run.phase === 'execution')!
  expect(run.modelCalls).toHaveLength(2)
  expect(run.modelCalls![0]).toMatchObject({ connectionId: connection.id, connectionRevision: 1, selectedModelId: 'group/route', route: { actualModelId: 'vendor/model-a', reportedModelId: 'body-a', routeSource: 'response-headers' } })
  expect(run.modelCalls![1]).toMatchObject({ selectedModelId: 'group/route', route: { routeSource: 'unknown', reportedModelId: 'body-b' } })
  expect(run.modelCalls![1].route?.actualModelId).toBeUndefined(); expect(run.modelCalls![0].callId).not.toBe(run.modelCalls![1].callId)
  const restarted = await f.restart(), after = await restarted.handle('getConversation', { id: conversation.id }) as import('../packages/shared/src/domain').ConversationDetail
  expect(after.runs.find(item => item.id === run.id)?.modelCalls).toEqual(run.modelCalls)
})


test('one long model identity survives catalog and saved API/employee/team/native/plugin boundaries; invalid IDs write nothing', async () => {
  const modelId = `vendor/org/${'m'.repeat(989)}`
  expect(modelId).toHaveLength(1000)
  const root = await server((_req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ data: [{ id: modelId }, { id: `${modelId}x` }, { id: 'bad\u0000model' }] })) })
  const { service } = await fixture()
  const catalog = await service.handle('getConnectionModelCatalog', { baseUrl: root, gateway: gateway() }) as ModelCatalog
  expect(catalog.models.map(model => model.id)).toEqual([modelId])
  const input: ConnectionInput = { name: 'Long model', provider: 'openai-compatible', baseUrl: root, defaultModel: modelId, gateway: gateway() }
  const connection = await service.handle('saveConnection', input) as Connection
  const employee: AgentInput = { name: 'Long model employee', role: '', instructions: '', color: '#123456', connectionId: connection.id, modelId, skillIds: [], knowledgeIds: [], allowCommands: false, active: true }
  expect(await service.handle('saveAgent', employee)).toMatchObject({ modelId })
  const team = { prompt: '', selectedConnectionId: connection.id, selectedModelId: modelId, createGroup: false, groupTitle: '' }
  expect(teamEditableSchema.parse(team).selectedModelId).toBe(modelId)
  const native = { ...connection, gateway: undefined, provider: 'anthropic' as const, baseUrl: 'https://api.anthropic.com', hasApiKey: true }
  expect(claudeProvider(native, modelId).model).toBe(modelId)
  expect(claudeProviderEnvironment({ configDirectory: '/isolated', baseUrl: native.baseUrl, apiKey: 'fixture-key', model: modelId }).ANTHROPIC_MODEL).toBe(modelId)
  const frame = { type: 'request', id: 'frame', method: 'initialize', input: { entry: '/entry', launch: { executable: '/program', args: [], cwd: '/work', privateHome: '/home', modelId, config: {} } } }
  expect(hostFrameSchema.parse(frame)).toEqual(frame)
  const before = await service.handle('snapshot', undefined) as Snapshot
  for (const invalid of [`${modelId}x`, 'bad\u0000model']) {
    await expect(service.handle('saveConnection', { ...input, defaultModel: invalid })).rejects.toThrow()
    await expect(service.handle('saveAgent', { ...employee, modelId: invalid })).rejects.toThrow()
    expect(() => teamEditableSchema.parse({ ...team, selectedModelId: invalid })).toThrow()
    expect(() => claudeProvider(native, invalid)).toThrow()
    expect(() => hostFrameSchema.parse({ ...frame, input: { ...frame.input, launch: { ...frame.input.launch, modelId: invalid } } })).toThrow()
  }
  const after = await service.handle('snapshot', undefined) as Snapshot
  expect(after.connections).toEqual(before.connections); expect(after.agents).toEqual(before.agents)
})

test.each(['connection-test', 'automation-draft'] as const)('%s source replacement waits for actual exit and rejects a late adapter success', async operation => {
  let release!: () => void, started!: () => void, aborted!: () => void, calls = 0, observedKey = ''
  const ready = new Promise<void>(done => { started = done }), stopped = new Promise<void>(done => { aborted = done }), gate = new Promise<void>(done => { release = done })
  const hold = async (signal: AbortSignal) => { calls++; signal.addEventListener('abort', aborted, { once: true }); started(); await gate }
  const f = await fixture({ run: async () => {}, test: async (_connection, _key, observation) => { observedKey = _key; await hold(observation!.signal!); return 'LATE_SUCCESS' }, draftAutomation: async context => {
    observedKey = context.apiKey; await hold(context.signal)
    return { name: '日报', prompt: '整理资料', target: null, frequency: 'daily', daysOfWeek: [], time: '09:00', timezone: null, notificationPolicy: 'muted', unsupported: [] }
  } })
  const input: ConnectionInput = { name: 'Original', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:3425', defaultModel: 'group/original', gateway: { ...gateway(), auth: 'key' }, apiKey: 'synthetic-original-key' }
  const connection = await f.service.handle('saveConnection', input) as Connection
  const pending = (operation === 'connection-test' ? f.service.handle('testConnection', { id: connection.id }) : f.service.handle('generateAutomationDraft', { connectionId: connection.id, draftId: 'late', version: 1, requestId: 'late-call', instruction: '每天整理资料', timezone: 'Asia/Singapore' })).catch(error => error)
  try {
    await ready
    let saved = false
    const update = f.service.handle('saveConnection', { ...input, id: connection.id, expectedRevision: connection.revision, defaultModel: 'group/replacement', apiKey: 'synthetic-replacement-key' }).then(value => { saved = true; return value })
    await stopped; expect(saved).toBe(false)
    release(); await update
    expect(await pending).toBeInstanceOf(Error); expect(calls).toBe(1); expect(observedKey).toBe('synthetic-original-key'); expect(f.keys.get(connection.id)).toBe('synthetic-replacement-key')
    const store = await ProductStore.openReadOnly(join(f.dataPath, 'boai.sqlite'))
    try { expect(await store.load(operation === 'connection-test' ? 'connectionTestCalls' : 'automationDraftCalls')).toEqual([expect.objectContaining({ status: 'cancelled', modelCall: expect.objectContaining({ connectionRevision: 1, selectedModelId: 'group/original' }) })]) } finally { await store.close() }
  } finally { release(); await pending }
})


test('legacy SQLite API records retain absent gateway/protocol/revision fields when a separate gateway is added and refreshed', async () => {
  const f = await fixture(), original = await f.service.handle('saveConnection', { name: 'Legacy direct', provider: 'openai-compatible', baseUrl: 'https://legacy.example/v1', defaultModel: 'old/vendor/model', apiKey: 'legacy-private-key' }) as Connection
  const employee = await f.service.handle('saveAgent', { name: 'Legacy employee', role: '', instructions: '', color: '#123456', connectionId: original.id, modelId: 'old/vendor/model', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as import('../packages/shared/src/domain').DigitalAgent
  const { gateway: _gateway, api: _api, revision: _revision, ...legacy } = original
  const { executionBackend: _backend, ...legacyEmployee } = employee
  await f.service.close()
  const store = new ProductStore(join(f.dataPath, 'boai.sqlite')); await store.init()
  try { await store.transaction(async tx => { await tx.put({ collection: 'connections', id: legacy.id, value: legacy }); await tx.put({ collection: 'agents', id: employee.id, value: legacyEmployee }) }) } finally { await store.close() }
  const restarted = await f.restart(), before = await restarted.handle('snapshot', undefined) as Snapshot
  expect(before.connections.find(row => row.id === legacy.id)).toEqual(legacy)
  const migratedEmployee = { ...legacyEmployee, executionBackend: { kind: 'mastra-model' }, configVersion: legacyEmployee.configVersion + 1 }
  expect(before.agents.find(row => row.id === employee.id)).toEqual(migratedEmployee)
  const backups = (await readdir(f.dataPath)).filter(name => name.startsWith('boai.sqlite.before-backends-'))
  expect(backups).toHaveLength(1)
  const preserved = await ProductStore.openReadOnly(join(f.dataPath, backups[0]))
  try { expect((await preserved.load<import('../packages/shared/src/domain').DigitalAgent>('agents')).find(row => row.id === employee.id)).toEqual(legacyEmployee) } finally { await preserved.close() }
  expect(f.calls).toEqual([])
  const root = await server((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ data: [{ id: 'new/vendor/model' }] })) })
  const added = await restarted.handle('saveConnection', { name: 'Separate Magpie', provider: 'openai-compatible', baseUrl: root, defaultModel: 'new/vendor/model', gateway: gateway() }) as Connection
  await restarted.handle('getConnectionModelCatalog', { id: added.id, baseUrl: root, gateway: gateway(), expectedRevision: added.revision })
  expect(f.calls).toEqual([])
  await restarted.handle('testConnection', { id: legacy.id })
  expect(f.calls).toEqual([{ connection: legacy, key: 'legacy-private-key' }])
  expect(modelConfig(f.calls[0].connection, f.calls[0].key)).toMatchObject({ api: 'chat', id: 'openai/old/vendor/model' })
  const readonly = await ProductStore.openReadOnly(join(f.dataPath, 'boai.sqlite'))
  try {
    expect((await readonly.load<Connection>('connections')).find(row => row.id === legacy.id)).toEqual(legacy)
    expect((await readonly.load<import('../packages/shared/src/domain').DigitalAgent>('agents')).find(row => row.id === employee.id)).toEqual(migratedEmployee)
    expect(await readonly.load('messages')).toEqual([])
  } finally { await readonly.close() }
  const second = await f.restart(), final = await second.handle('snapshot', undefined) as Snapshot
  expect(final.agents.find(row => row.id === employee.id)).toEqual(migratedEmployee)
  expect((await readdir(f.dataPath)).filter(name => name.startsWith('boai.sqlite.before-backends-'))).toEqual(backups)
  expect(f.calls).toHaveLength(1)
})
