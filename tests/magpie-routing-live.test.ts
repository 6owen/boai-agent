/*
 * [INPUT]: Explicit opt-in, installed Magpie 0.1.1277, OS sandbox, controlled upstreams and production BOAI service.
 * [OUTPUT]: Three-protocol failover, independent or group/background concurrency, and gateway-process loss after a real file write.
 * [POS]: Actual installed-gateway acceptance with synthetic suppliers; no supplier inference or desktop certification.
 * [PROTOCOL]: Update Header, tests/.folder.md and the Magpie ledger; retain failures and closed-process evidence.
 */
import { createServer, type Server } from 'node:http'
import { createHash } from 'node:crypto'
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { AppService } from '../src/runtime/service'
import { MastraEngine } from '../src/runtime/adapters/mastra/engine'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import type { Connection, Conversation, ConversationDetail, DigitalAgent } from '../src/shared/domain'
import type { TeamDraft, TeamDraftView } from '../src/shared/domain/team-creation'
import type { AutomationDraftResult } from '../src/shared/domain/automations'
import { writingPlan } from './fixtures/team-planner'
import type { ModelProtocol } from '../src/shared/domain/model-gateway'
import { isolatedMagpie } from './fixtures/magpie-isolated'
import { streamText, streamTool } from './fixtures/gateway-stream'

const enabled = process.env.BOAI_MAGPIE_ROUTING_REAL === '1', batch = process.env.BOAI_MAGPIE_BATCH ?? ''
const suite = process.env.BOAI_MAGPIE_ROUTING_SUITE ?? 'baseline'
const gatewayCap = suite === 'group-background' ? 36 : 45, upstreamCap = suite === 'group-background' ? 72 : 90
const evidence = resolve('.local/magpie-20261017', `routing-${batch}`), protocols = ['chat', 'responses', 'messages'] as const
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted', 'waiting_user'])
const pause = (ms: number) => new Promise<void>(done => setTimeout(done, ms))
type Row = { scenario: string; stage?: string; model: string; path: string; started: number; ended?: number; closed: boolean; status?: number; actualModel?: string | null; actualProvider?: string | null; stripped?: boolean; hold?: boolean; error?: string }
const upstreamRows: Row[] = [], incoming: Row[] = [], activeProxy = new Set<AbortController>(), tasks = new Set<Promise<unknown>>()
let upstream: Server | undefined, proxy: Server | undefined, gateway: Awaited<ReturnType<typeof isolatedMagpie>> | undefined, baseUrl = '', scenario = '', started = false, sourceBefore: Record<string, string>
const models = protocols.flatMap(protocol => [`route-${protocol}`, `parallel-a-${protocol}`, `parallel-b-${protocol}`, `probe-${protocol}`, `hidden-${protocol}`, `crash-${protocol}`, `group-a-${protocol}`, `group-b-${protocol}`, `team-${protocol}`, `hidden-draft-${protocol}`])
async function sources() {
  const files: string[] = []
  for (const directory of ['src', 'tests', 'scripts']) for (const name of await readdir(directory, { recursive: true })) if (/\.(ts|tsx|mjs|json)$/.test(name)) files.push(`${directory}/${name}`)
  files.push('package.json', 'pnpm-lock.yaml')
  return Object.fromEntries(await Promise.all(files.sort().map(async file => [file, createHash('sha256').update(await readFile(file)).digest('hex')])))
}
async function listen(server: Server) { await new Promise<void>(done => server.listen(0, '127.0.0.1', done)); return (server.address() as { port: number }).port }
async function close(server?: Server) { if (server) { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())) } }
function track(work: Promise<unknown>) { tasks.add(work); void work.finally(() => tasks.delete(work)) }
beforeAll(async () => {
  if (!enabled) return
  if (!['baseline', 'group-background'].includes(suite)) throw Error('Unknown routing suite')
  if (!/^[a-z0-9-]{1,80}$/.test(batch)) throw Error('A fresh explicit batch is required')
  await mkdir(evidence); started = true; sourceBefore = await sources()
  await writeFile(join(evidence, 'plan.json'), JSON.stringify({ batch, sourceBefore, suite, scenarios: suite === 'group-background' ? 3 : 9, maxGatewayPosts: gatewayCap, maxUpstreamPosts: upstreamCap, maxPerUpstreamRequestBytes: 1048576, scope: suite === 'group-background' ? 'Installed Magpie + controlled suppliers. Three protocols: actual two-member group with team plan and automation draft concurrently, per-call route and missing-header ownership. No personal configuration or supplier inference.' : 'Installed Magpie + controlled suppliers. Three protocols: ordered fallback, two employees plus saved/draft connection tests, owned gateway SIGKILL after file tool. No personal configuration or supplier inference.' }, null, 2))
  upstream = createServer((request, response) => {
    track((async () => {
      if (request.method === 'GET') { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify({ object: 'list', data: models.map(id => ({ id, object: 'model', owned_by: 'fixture' })) })); return }
      let raw = ''; for await (const part of request) { raw += part; if (raw.length > 1048576) throw Error('Upstream body cap reached') }
      const body = JSON.parse(raw), row: Row = { scenario, model: body.model, path: request.url!, started: Date.now(), closed: false }; upstreamRows.push(row)
      response.once('close', () => { row.closed = true; row.ended = Date.now() })
      if (upstreamRows.length > upstreamCap) throw Error('Predeclared upstream cap reached')
      const protocol: ModelProtocol = request.url!.endsWith('/messages') ? 'messages' : request.url!.endsWith('/responses') ? 'responses' : 'chat'
      if (request.url!.startsWith('/failure-')) { row.status = 503; response.writeHead(503, { 'content-type': 'application/json' }); response.end(JSON.stringify({ error: { message: 'CONTROLLED_UNAVAILABLE', type: 'server_error' } })); return }
      row.status = 200
      const count = upstreamRows.filter(previous => previous.model === row.model && previous.path.startsWith('/backup/')).length
      if (suite === 'group-background') {
        const strings = (value: unknown): string[] => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []
        const inputText = strings(body).find(value => value.startsWith('{"protocol":"private-'))
        const input = inputText ? JSON.parse(inputText) as { protocol: string; data?: { participation?: { hasRespondedInTurn?: boolean } } } : undefined
        row.stage = row.model.startsWith('team-') ? 'team-plan' : row.model.startsWith('hidden-draft-') ? 'automation-draft' : input?.protocol ?? 'chat'
        if (['team-plan', 'automation-draft', 'private-group-interpretation-v1'].includes(row.stage)) {
          // All three production entry points must actually arrive before any can finish.
          const deadline = Date.now() + 5000
          while (!['team-plan', 'automation-draft', 'private-group-interpretation-v1'].every(stage => upstreamRows.some(other => other.scenario === row.scenario && other.stage === stage))) {
            if (Date.now() > deadline) throw Error('Group/background barrier did not receive all three requests')
            await pause(5)
          }
        }
        let text: string
        if (row.stage === 'team-plan') { await pause(150); text = JSON.stringify(writingPlan) }
        else if (row.stage === 'automation-draft') { await pause(100); text = JSON.stringify({ name: 'GROUP_BACKGROUND_DRAFT', prompt: '整理群资料', target: null, frequency: 'daily', daysOfWeek: [], time: '09:00', timezone: null, notificationPolicy: 'muted', unsupported: [] }) }
        else if (row.stage === 'private-group-interpretation-v1') { await pause(25); text = '{"mode":"independent"}' }
        else if (row.stage === 'private-participation-v2') text = input!.data?.participation?.hasRespondedInTurn ? '{"action":"pass"}' : '{"action":"reply","responseKind":"chat"}'
        else if (row.stage === 'private-memory-delta-v1') text = '{"candidates":[]}'
        else { await pause(row.model.startsWith('group-a-') ? 80 : 5); text = `REPLY_${row.model}` }
        streamText(response, protocol, text, 'complete', {})
      } else if (row.model.startsWith('parallel-')) {
        await pause(row.model.includes('-a-') ? 60 : 5)
        const text = count === 1 ? JSON.stringify({ action: 'reply', responseKind: 'chat' }) : count === 2 ? `REPLY_${row.model}` : JSON.stringify({ candidates: [] })
        streamText(response, protocol, text, 'complete', {})
      } else if (row.model.startsWith('crash-')) {
        if (count === 1) streamText(response, protocol, JSON.stringify({ action: 'reply', responseKind: 'task', work: { key: 'once', scope: '保存文件后回答', deliverable: '文件' } }), 'complete', {})
        else if (count === 2) streamTool(response, protocol, 'write_file', { path: 'self:/work/effect.txt', content: 'WRITTEN_ONCE' }, true, {})
        else { row.hold = true; streamText(response, protocol, 'UNCONFIRMED_AFTER_TOOL', 'hold', {}) }
      } else {
        // Keep no-Run requests in flight while both employee decisions execute.
        if (row.model.startsWith('probe-') || row.model.startsWith('hidden-')) await pause(500)
        streamText(response, protocol, 'OK', 'complete', {})
      }
    })().catch(error => response.destroy(error instanceof Error ? error : undefined)))
  })
  const upstreamPort = await listen(upstream)
  gateway = await isolatedMagpie(evidence, upstreamPort)
  const provider = async (id: string, available: string[]) => {
    const root = `http://127.0.0.1:${upstreamPort}/${id}`
    await gateway!.command(['provider', 'add', id, `id=${id}`, `url=${root}/v1`, `responses=${root}/v1`, `anthropic=${root}`, `key=SYNTHETIC_${id}_NOT_A_SECRET`, `models=${available.join(',')}`])
  }
  await provider('backup', models)
  for (const protocol of suite === 'baseline' ? protocols : []) {
    await provider(`failure-${protocol}`, [`route-${protocol}`])
    await gateway.command(['group', 'add', `route-${protocol}`, `id=route-${protocol}`, `models=failure-${protocol}/route-${protocol},backup/route-${protocol}`, 'routing=order', 'stays=off'])
  }
  await gateway.start()
  proxy = createServer((request, response) => {
    track((async () => {
      let body = ''; for await (const part of request) { body += part; if (body.length > 1048576) throw Error('Gateway body cap reached') }
      const parsed = body ? JSON.parse(body) : {}, row: Row = { scenario, model: parsed.model ?? '', path: request.url!, started: Date.now(), closed: false }
      if (request.method !== 'POST' || incoming.length >= gatewayCap) throw Error('Unexpected gateway request or request cap')
      incoming.push(row); response.once('close', () => { row.closed = true; row.ended = Date.now() })
      const controller = new AbortController(); activeProxy.add(controller); response.once('close', () => controller.abort())
      try {
        const result = await fetch(gateway!.origin + row.path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer magpie-boai', 'x-api-key': 'magpie-boai', 'anthropic-version': '2023-06-01' }, body, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), redirect: 'error' })
        row.status = result.status; row.actualModel = result.headers.get('x-magpie-model'); row.actualProvider = result.headers.get('x-magpie-provider'); row.stripped = row.model.startsWith('backup/hidden-')
        const headers: Record<string, string> = { 'content-type': result.headers.get('content-type') ?? 'text/event-stream' }
        if (!row.stripped) { if (row.actualModel) headers['x-magpie-model'] = row.actualModel; if (row.actualProvider) headers['x-magpie-provider'] = row.actualProvider }
        response.writeHead(result.status, headers)
        if (result.body) for await (const chunk of result.body) response.write(chunk)
        response.end()
      } catch (error) { row.error = String(error); response.destroy(error instanceof Error ? error : undefined) }
      finally { activeProxy.delete(controller) }
    })().catch(error => response.destroy(error instanceof Error ? error : undefined)))
  })
  baseUrl = `http://127.0.0.1:${await listen(proxy)}`
}, 90000)
afterAll(async () => {
  if (!started) return
  for (const controller of activeProxy) controller.abort()
  await gateway?.close(); await close(proxy); await close(upstream); await Promise.all(tasks)
  await writeFile(join(evidence, 'closed.json'), JSON.stringify({ incoming, upstreamRows, sourceAfter: await sources(), sourceUnchanged: JSON.stringify(await sources()) === JSON.stringify(sourceBefore), allGatewayRequestsClosed: incoming.every(row => row.closed), allUpstreamRequestsClosed: upstreamRows.every(row => row.closed) }, null, 2))
})
async function business(protocol: ModelProtocol, name: string, model: string) {
  scenario = `${name}-${protocol}`
  const directory = join(evidence, scenario); await mkdir(directory)
  const dataPath = join(directory, 'data')
  const create = () => new AppService({ dataPath, engine: new MastraEngine(), secrets: { get: async () => undefined, set: async () => { throw Error('No private credential expected') }, delete: async () => {} }, emit: () => {} })
  let service = create(); await service.init()
  const input = { name: scenario, provider: 'openai-compatible', baseUrl, defaultModel: model, gateway: { kind: 'magpie', protocol, auth: 'local' } }
  const connection = await service.handle('saveConnection', input) as Connection
  const read = async (): Promise<Record<string, Record<string, unknown>[]>> => { const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite')); try { return Object.fromEntries(await Promise.all(['connections', 'runs', 'turns', 'messages', 'workItems', 'artifacts', 'connectionTestCalls', 'automationDraftCalls', 'teamDrafts', 'teamGenerations', 'agents', 'automations'].map(async name => [name, await store.load<Record<string, unknown>>(name)]))) } finally { await store.close() } }
  return {
    get service() { return service }, directory, dataPath, connection, input, read,
    async employee(modelId: string) {
      const agent = await service.handle('saveAgent', { name: modelId, role: '验收', instructions: '按用户要求处理', color: '#123456', connectionId: connection.id, modelId, skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent
      return await service.handle('createConversation', { kind: 'direct', title: modelId, agentIds: [agent.id], mode: 'mention', sharedKnowledgeIds: [] }) as Conversation
    },
    async settled(chat: Conversation) {
      let detail: ConversationDetail | undefined
      await expect.poll(async () => { detail = await service.handle('getConversation', { id: chat.id }) as ConversationDetail; return !!detail.runs.length && detail.runs.every(run => terminal.has(run.status)) && !!detail.turns?.length && detail.turns.every(turn => terminal.has(turn.status)) }, { timeout: 12000, interval: 20 }).toBe(true)
      return detail!
    },
    async reopen() { await service.close(); const saved = await read(), before = incoming.length; service = create(); await service.init(); await pause(100); expect(await read()).toEqual(saved); expect(incoming).toHaveLength(before) },
    async close(error?: unknown) { await service.close(); await writeFile(join(directory, 'result.json'), JSON.stringify({ status: error ? 'failed' : 'passed', error: error ? String(error) : undefined, protocol, records: await read(), incoming: incoming.filter(row => row.scenario === scenario), upstream: upstreamRows.filter(row => row.scenario === scenario) }, null, 2)) },
  }
}
test.skipIf(!enabled || suite !== 'baseline').each(protocols)('installed Magpie %s ordered fallback persists the actual member on the original call', async protocol => {
  const model = `group/route-${protocol}`, f = await business(protocol, 'fallback', model)
  let failure: unknown
  try {
    await f.service.handle('testConnection', { id: f.connection.id })
    const requests = incoming.filter(row => row.scenario === scenario), upstream = upstreamRows.filter(row => row.scenario === scenario), records = await f.read()
    expect(requests).toHaveLength(1); expect(requests[0]).toMatchObject({ status: 200, model, actualModel: `backup/route-${protocol}`, actualProvider: 'backup' })
    expect(upstream[0]).toMatchObject({ status: 503, model: `route-${protocol}` }); expect(upstream.at(-1)).toMatchObject({ status: 200, model: `route-${protocol}` })
    expect(upstream.filter(row => row.status === 200)).toHaveLength(1)
    expect(records.connectionTestCalls).toEqual([expect.objectContaining({ status: 'completed', modelCall: expect.objectContaining({ connectionId: f.connection.id, connectionRevision: 1, selectedModelId: model, protocol, route: expect.objectContaining({ actualModelId: `backup/route-${protocol}`, actualProvider: 'backup', routeSource: 'response-headers' }) }) })])
    for (const name of ['runs', 'workItems', 'artifacts']) expect(records[name]).toHaveLength(0)
    await f.reopen(); await f.reopen()
  } catch (error) { failure = error; throw error } finally { await f.close(failure) }
}, 20000)
test.skipIf(!enabled || suite !== 'baseline').each(protocols)('installed Magpie %s concurrent employees and no-Run calls keep their own route and missing headers stay unknown', async protocol => {
  const f = await business(protocol, 'parallel', `backup/probe-${protocol}`)
  let failure: unknown
  try {
    const models = [`backup/parallel-a-${protocol}`, `backup/parallel-b-${protocol}`], chats = await Promise.all(models.map(model => f.employee(model)))
    await Promise.all([...chats.map(chat => f.service.handle('sendMessage', { conversationId: chat.id, requestId: chat.id, content: '只回答当前任务的内容', mentionIds: [] })), f.service.handle('testConnection', { id: f.connection.id }), f.service.handle('testConnectionDraft', { ...f.input, defaultModel: `backup/hidden-${protocol}` })])
    for (const [index, chat] of chats.entries()) {
      const detail = await f.settled(chat), calls = detail.runs.flatMap(run => run.modelCalls ?? [])
      expect(calls).toHaveLength(3); expect(new Set(calls.map(call => call.callId)).size).toBe(3)
      for (const call of calls) expect(call).toMatchObject({ connectionId: f.connection.id, selectedModelId: models[index], protocol, route: { actualModelId: models[index], actualProvider: 'backup', routeSource: 'response-headers' } })
      expect(detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').map(message => message.content)).toEqual([`REPLY_parallel-${index ? 'b' : 'a'}-${protocol}`])
    }
    const records = await f.read(), rows = records.connectionTestCalls
    expect(rows).toHaveLength(2)
    expect(rows).toContainEqual(expect.objectContaining({ status: 'completed', modelCall: expect.objectContaining({ selectedModelId: `backup/probe-${protocol}`, route: expect.objectContaining({ actualModelId: `backup/probe-${protocol}` }) }) }))
    const hidden = rows.find(row => (row.modelCall as { selectedModelId: string }).selectedModelId === `backup/hidden-${protocol}`)!
    expect(hidden).toMatchObject({ source: 'draft', status: 'completed', modelCall: { connectionRevision: 0, route: { routeSource: 'unknown' } } }); expect((hidden.modelCall as { route: { actualModelId?: string } }).route.actualModelId).toBeUndefined()
    const requests = incoming.filter(row => row.scenario === scenario), a = requests.find(row => row.model === models[0])!, b = requests.find(row => row.model === models[1])!
    expect(requests).toHaveLength(8); expect(b.started).toBeLessThan(a.ended!); expect(b.ended).toBeLessThan(a.ended!)
    for (const noRun of requests.filter(row => row.model.includes('/probe-') || row.model.includes('/hidden-'))) {
      expect(noRun.started).toBeLessThanOrEqual(Math.min(a.started, b.started)); expect(noRun.ended).toBeGreaterThan(Math.max(a.started, b.started))
    }
    const allCallIds = [...records.runs.flatMap(row => (row.modelCalls as { callId: string }[] ?? []).map(call => call.callId)), ...rows.map(row => (row.modelCall as { callId: string }).callId)]
    expect(allCallIds).toHaveLength(8); expect(new Set(allCallIds).size).toBe(8); expect(records.workItems).toHaveLength(0)
    await f.reopen(); await f.reopen()
  } catch (error) { failure = error; throw error } finally { await f.close(failure) }
}, 25000)
test.skipIf(!enabled || suite !== 'baseline').each(protocols)('installed Magpie %s process loss after a completed file tool cannot publish or replay the task', async protocol => {
  const f = await business(protocol, 'crash', `backup/crash-${protocol}`)
  let failure: unknown
  try {
    const chat = await f.employee(`backup/crash-${protocol}`)
    await f.service.handle('sendMessage', { conversationId: chat.id, requestId: chat.id, content: '保存文件然后回答', mentionIds: [] })
    await expect.poll(() => upstreamRows.filter(row => row.scenario === scenario && row.hold).length, { timeout: 10000, interval: 20 }).toBe(1)
    const pid = gateway!.pid; expect(pid).toBeGreaterThan(0)
    await gateway!.stop('SIGKILL')
    const detail = await f.settled(chat)
    expect(detail.runs.some(run => run.status === 'failed')).toBe(true)
    expect(detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed')).toHaveLength(0)
    expect(detail.workItems).toHaveLength(1); expect(detail.workItems![0].status).not.toBe('delivered')
    expect(detail.runs.flatMap(run => run.toolEvents).filter(tool => tool.name === 'write_file')).toMatchObject([{ id: 'write-once', status: 'completed' }])
    const paths = (await readdir(f.dataPath, { recursive: true })).filter(path => path.endsWith('/effect.txt'))
    expect(paths).toHaveLength(1); expect(await readFile(join(f.dataPath, paths[0]), 'utf8')).toBe('WRITTEN_ONCE')
    expect(incoming.filter(row => row.scenario === scenario)).toHaveLength(3)
    await gateway!.start(); await f.reopen(); await f.reopen()
    expect(incoming.filter(row => row.scenario === scenario)).toHaveLength(3)
  } catch (error) { failure = error; throw error } finally { await f.close(failure); if (!gateway!.pid) await gateway!.start() }
}, 30000)

test.skipIf(!enabled || suite !== 'group-background').each(protocols)('installed Magpie %s group replies and independent background drafts overlap without sharing routes or business results', async protocol => {
  const f = await business(protocol, 'group-background', `backup/hidden-draft-${protocol}`)
  let failure: unknown
  try {
    const models = [`backup/group-a-${protocol}`, `backup/group-b-${protocol}`]
    const agents: DigitalAgent[] = []
    for (const modelId of models) agents.push(await f.service.handle('saveAgent', { name: modelId, role: '验收', instructions: '各自只回答一次', color: '#123456', connectionId: f.connection.id, modelId, skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent)
    const chat = await f.service.handle('createConversation', { kind: 'group', title: scenario, agentIds: agents.map(agent => agent.id), mode: 'mention', sharedKnowledgeIds: [] }) as Conversation
    const beforeAgents = (await f.read()).agents
    const draft = await f.service.handle('openTeamDraft', undefined) as TeamDraft
    const saved = await f.service.handle('saveTeamDraft', { draftId: draft.id, expectedVersion: draft.version, editableFields: { prompt: '四人写作团队', selectedConnectionId: f.connection.id, selectedModelId: `backup/team-${protocol}`, createGroup: true, groupTitle: '' } }) as TeamDraft
    const [, automation] = await Promise.all([
      f.service.handle('generateTeamPlan', { draftId: draft.id, expectedVersion: saved.version, requestId: `team-${protocol}` }),
      f.service.handle('generateAutomationDraft', { connectionId: f.connection.id, draftId: 'background', version: 1, requestId: `automation-${protocol}`, instruction: '每天九点整理群资料', timezone: 'Asia/Singapore' }) as Promise<AutomationDraftResult>,
      f.service.handle('sendMessage', { conversationId: chat.id, requestId: chat.id, content: '两位各自回答自己的任务', mentionIds: [] }),
    ])
    const detail = await f.settled(chat)
    expect(detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed').map(message => message.content).sort()).toEqual([`REPLY_group-a-${protocol}`, `REPLY_group-b-${protocol}`])
    const coordination = detail.runs.filter(run => run.phase === 'coordination')
    expect(coordination).toHaveLength(1); expect(coordination[0].status).toBe('completed')
    expect(detail.turns?.[0].coordination).toMatchObject({ mode: 'independent', sourceRunId: coordination[0].id, agentIds: agents.map(agent => agent.id) })
    expect(detail.runs.filter(run => run.phase === 'execution')).toHaveLength(2)
    const calls = detail.runs.flatMap(run => {
      const expected = agents.find(agent => agent.id === run.agentId)!.modelId
      for (const call of run.modelCalls ?? []) expect(call).toMatchObject({ connectionId: f.connection.id, connectionRevision: 1, selectedModelId: expected, protocol, route: { actualModelId: expected, actualProvider: 'backup', routeSource: 'response-headers' } })
      return run.modelCalls ?? []
    })
    let view: TeamDraftView | undefined
    await expect.poll(async () => { view = await f.service.handle('getTeamDraft', { draftId: draft.id }) as TeamDraftView; return view.generation?.status }, { timeout: 5000, interval: 20 }).toBe('succeeded')
    expect(view!.draft.plan?.name).toBe(writingPlan.name); expect(view!.draft.plan?.members).toHaveLength(4)
    expect(view!.generation!.attempts).toHaveLength(1)
    const planCall = view!.generation!.attempts[0].modelCall!
    expect(planCall).toMatchObject({ connectionId: f.connection.id, phase: 'team-plan', protocol, selectedModelId: `backup/team-${protocol}`, route: { actualModelId: `backup/team-${protocol}`, actualProvider: 'backup' } })
    expect(automation).toMatchObject({ draftId: 'background', version: 1, candidate: { name: 'GROUP_BACKGROUND_DRAFT', prompt: '整理群资料' } })
    const records = await f.read(), draftCalls = records.automationDraftCalls
    expect(draftCalls).toHaveLength(1)
    expect(draftCalls[0]).toMatchObject({ id: `automation-${protocol}`, status: 'completed', modelCall: { callId: `automation-${protocol}`, connectionId: f.connection.id, phase: 'automation-draft', protocol, selectedModelId: `backup/hidden-draft-${protocol}`, route: { routeSource: 'unknown' } } })
    const draftCall = draftCalls[0].modelCall as { callId: string; route: { actualModelId?: string } }
    expect(draftCall.route.actualModelId).toBeUndefined()
    const ids = [...calls.map(call => call.callId), planCall.callId, draftCall.callId]
    expect(new Set(ids).size).toBe(ids.length)
    const requests = incoming.filter(row => row.scenario === scenario), upstream = upstreamRows.filter(row => row.scenario === scenario)
    expect(requests).toHaveLength(ids.length); expect(upstream).toHaveLength(ids.length)
    expect(requests.length).toBeLessThanOrEqual(12)
    const interpretation = upstream.find(row => row.stage === 'private-group-interpretation-v1')!
    for (const stage of ['team-plan', 'automation-draft']) {
      const background = upstream.find(row => row.stage === stage)!
      expect(background.started).toBeLessThan(interpretation.ended!)
      expect(background.ended).toBeGreaterThan(interpretation.started)
    }
    const a = upstream.find(row => row.model === `group-a-${protocol}` && row.stage === 'chat')!, b = upstream.find(row => row.model === `group-b-${protocol}` && row.stage === 'chat')!
    expect(b.started).toBeLessThan(a.ended!); expect(b.ended).toBeLessThan(a.ended!)
    expect(records.agents).toEqual(beforeAgents)
    for (const name of ['workItems', 'artifacts', 'automations', 'connectionTestCalls']) expect(records[name]).toHaveLength(0)
    await expect.poll(() => requests.every(row => row.closed) && upstream.every(row => row.closed), { timeout: 2000, interval: 10 }).toBe(true)
    await writeFile(join(f.directory, 'observed.json'), JSON.stringify({ detail, team: view, automation, ids }, null, 2))
    await f.reopen(); await f.reopen()
  } catch (error) { failure = error; throw error } finally { await f.close(failure) }
}, 25000)
