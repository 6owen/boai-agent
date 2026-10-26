/*
 * [INPUT]: Production AppService/Mastra/planner/SQLite and three-protocol HTTP fault injection.
 * [OUTPUT]: Durable EOF/cancel failures including naturally triggered report/group interpretation, positive publication controls, retained tools and restart zero replay.
 * [POS]: Model-gateway product fault acceptance; offline server, no external model requests or desktop claim.
 * [PROTOCOL]: Update Header, tests/.folder.md and the Magpie acceptance ledger with actual results.
 */
import { createServer, type ServerResponse } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, test } from 'vitest'
import { AppService } from '../packages/runtime/src/service'
import { MastraEngine } from '../packages/runtime/src/adapters/mastra/engine'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import type { Connection, Conversation, ConversationDetail, DigitalAgent, Snapshot } from '../packages/shared/src/domain'
import type { ModelProtocol } from '../packages/shared/src/domain/model-gateway'
import type { TeamDraft, TeamDraftView } from '../packages/shared/src/domain/team-creation'
import { streamText, streamTool } from './fixtures/gateway-stream'
import { writingPlan } from './fixtures/team-planner'
import { gatewayImportUrl } from '../packages/shared/src/domain/gateway-import'

const protocols = ['chat', 'responses', 'messages'] as const
const terminal = new Set(['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted', 'waiting_user'])
const cleanups: (() => Promise<void>)[] = []
const chatDecision = JSON.stringify({ action: 'reply', responseKind: 'chat' })
const taskDecision = JSON.stringify({ action: 'reply', responseKind: 'task', work: { key: 'once', scope: '保存文件后回答', deliverable: '验证文件' } })
const automation = JSON.stringify({ name: 'Review', prompt: 'Review', target: null, frequency: 'daily', daysOfWeek: [], time: '09:00', timezone: null, notificationPolicy: 'muted', unsupported: [] })
const collections = ['connections', 'runs', 'turns', 'workItems', 'messages', 'artifacts', 'memories', 'teamDrafts', 'teamGenerations', 'connectionTestCalls', 'automationDraftCalls', 'automations']
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
async function setup(protocol: ModelProtocol, reply: (response: ServerResponse, index: number) => void) {
  const evidence = process.env.BOAI_GATEWAY_FAULT_EVIDENCE
  if (evidence) await mkdir(resolve(evidence), { recursive: true })
  const root = await mkdtemp(join(evidence ? resolve(evidence) : tmpdir(), `boai-product-${protocol}-`)), dataPath = join(root, 'data')
  const requests: { path: string; model: string; tools: string[]; privateProtocol?: string; closed: boolean }[] = []
  const server = createServer((request, response) => { void (async () => {
    let raw = ''; for await (const part of request) raw += part
    const body = JSON.parse(raw), row = { path: request.url!, model: body.model, tools: (body.tools ?? []).map((tool: { name?: string; function?: { name: string } }) => tool.name ?? tool.function?.name ?? ''), privateProtocol: ['private-work-report-v1', 'private-group-interpretation-v1'].find(marker => raw.includes(marker)), closed: false }
    requests.push(row); response.once('close', () => { row.closed = true })
    if (requests.length > 6) { response.writeHead(429); response.end('Unexpected replay'); return }
    reply(response, requests.length)
  })().catch(error => response.destroy(error)) })
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  const create = () => new AppService({ dataPath, engine: new MastraEngine(), secrets: { get: async () => undefined, set: async () => { throw Error('No private credential expected') }, delete: async () => {} }, emit: () => {} })
  let service = create()
  const read = async () => {
    const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite'))
    try { return Object.fromEntries(await Promise.all(collections.map(async name => [name, await store.load<Record<string, unknown>>(name)]))) } finally { await store.close() }
  }
  cleanups.push(async () => {
    await service.close(); server.closeAllConnections(); await new Promise<void>(done => server.close(() => done()))
    if (evidence) await writeFile(join(root, 'closed-evidence.json'), JSON.stringify({ test: expect.getState().currentTestName, protocol, requests, records: await read() }, null, 2))
    else await rm(root, { recursive: true, force: true })
  })
  await service.init()
  const connection = await service.handle('saveConnection', { name: 'Fault gateway', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`, defaultModel: 'group/route', gateway: { kind: 'magpie', auth: 'local', protocol } }) as Connection
  const restart = async () => {
    await service.close(); const before = await read(), count = requests.length
    service = create(); await service.init(); await new Promise(done => setTimeout(done, 100)); await service.close()
    expect(requests).toHaveLength(count); expect(await read()).toEqual(before)
    service = create(); await service.init(); await new Promise(done => setTimeout(done, 100))
    expect(requests).toHaveLength(count); expect(await read()).toEqual(before)
  }
  return { get service() { return service }, connection, root, requests, read, restart }
}
async function changeSource(fixture: Awaited<ReturnType<typeof setup>>, change: 'edit' | 'delete' | 'import') {
  const connection = fixture.connection
  if (change === 'delete') return fixture.service.handle('deleteConnection', { id: connection.id })
  if (change === 'edit') return fixture.service.handle('saveConnection', { id: connection.id, expectedRevision: connection.revision, name: 'Changed source', provider: connection.provider, baseUrl: connection.baseUrl, defaultModel: 'group/new', gateway: connection.gateway })
  const draft = await fixture.service.receiveGatewayImport({ eventId: randomUUID(), url: gatewayImportUrl({ version: 1, kind: 'magpie', name: 'Imported source', baseUrl: connection.baseUrl, protocol: connection.gateway!.protocol, modelId: 'group/new' }) })
  return fixture.service.handle('confirmGatewayImport', { draftId: draft.id, requestId: randomUUID(), target: { id: connection.id, revision: connection.revision! } })
}
async function employee(fixture: Awaited<ReturnType<typeof setup>>) {
  const agent = await fixture.service.handle('saveAgent', { name: '故障验收员工', role: '验收', instructions: '按用户要求处理', color: '#123456', connectionId: fixture.connection.id, modelId: 'group/route', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent
  const chat = await fixture.service.handle('createConversation', { kind: 'direct', title: '故障验收', agentIds: [agent.id], mode: 'mention', sharedKnowledgeIds: [] }) as Conversation
  await fixture.service.handle('sendMessage', { conversationId: chat.id, requestId: `fault-${chat.id}`, content: '保存文件然后回答', mentionIds: [] })
  return chat
}
async function settled(fixture: Awaited<ReturnType<typeof setup>>, chat: Conversation) {
  let detail: ConversationDetail | undefined
  await expect.poll(async () => {
    detail = await fixture.service.handle('getConversation', { id: chat.id }) as ConversationDetail
    return !!detail.runs.length && detail.runs.every(run => terminal.has(run.status)) && !!detail.turns?.length && detail.turns.every(turn => terminal.has(turn.status))
  }, { timeout: 5000, interval: 10 }).toBe(true)
  return detail!
}
function routes(detail: ConversationDetail, protocol: ModelProtocol, count: number, unfinishedCallId?: string) {
  const calls = detail.runs.flatMap(run => run.modelCalls ?? [])
  expect(calls).toHaveLength(count); expect(new Set(calls.map(call => call.callId)).size).toBe(count)
  for (const call of calls) {
    expect(call.protocol).toBe(protocol)
    // onStepFinish need not fire for an aborted step; an unobserved route stays unknown.
    if (call.callId === unfinishedCallId && !call.route?.actualModelId) continue
    expect(call.route?.actualModelId).toBe('provider/actual')
  }
}
for (const phase of ['decision', 'chat', 'task', 'memory'] as const) test.each(protocols)(`product %s ${phase} EOF preserves durable failure and never replays on restart`, async protocol => {
  const fixture = await setup(protocol, (response, index) => {
    if (index === 1) streamText(response, protocol, phase === 'task' ? taskDecision : chatDecision, phase === 'decision' ? 'eof' : 'complete')
    else if (index === 2 && phase === 'task') streamTool(response, protocol, 'write_file', { path: 'self:/work/effect.txt', content: 'WRITTEN_ONCE' })
    else if (index === 2) streamText(response, protocol, 'CONFIRMED_REPLY', phase === 'memory' ? 'complete' : 'eof')
    else streamText(response, protocol, phase === 'memory' ? '{"candidates":[]}' : 'UNCONFIRMED_TASK_REPLY', 'eof')
  })
  const chat = await employee(fixture), detail = await settled(fixture, chat), count = phase === 'decision' ? 1 : phase === 'chat' ? 2 : 3
  expect(fixture.requests).toHaveLength(count); routes(detail, protocol, count)
  const failed = detail.runs.find(run => run.status === 'failed')!
  expect(failed).toMatchObject({ phase: phase === 'chat' || phase === 'task' ? 'execution' : phase, error: expect.stringContaining('未确认正常完成') })
  expect(detail.artifacts).toHaveLength(0)
  const published = detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed')
  if (phase === 'memory') expect(published.map(message => message.content)).toEqual(['CONFIRMED_REPLY'])
  else { expect(published).toHaveLength(0); expect(detail.turns?.[0].status).not.toBe('completed') }
  if (phase === 'task') {
    expect(detail.workItems).toHaveLength(1); expect(detail.workItems![0].status).not.toBe('delivered')
    expect(detail.runs.flatMap(run => run.toolEvents).filter(tool => tool.name === 'write_file')).toMatchObject([{ id: 'write-once', status: 'completed' }])
    const paths = (await readdir(join(fixture.root, 'data'), { recursive: true })).filter(path => path.endsWith('/effect.txt'))
    expect(paths).toHaveLength(1); expect(await readFile(join(fixture.root, 'data', paths[0]), 'utf8')).toBe('WRITTEN_ONCE')
  } else expect(detail.workItems ?? []).toHaveLength(0)
  await fixture.restart()
  const restored = await fixture.service.handle('getConversation', { id: chat.id }) as ConversationDetail
  expect(restored.runs).toEqual(detail.runs); expect(restored.messages).toEqual(detail.messages)
})
test.each(protocols)('product %s team EOF is failed without plan, format repair or employee creation', async protocol => {
  const fixture = await setup(protocol, response => streamText(response, protocol, JSON.stringify(writingPlan), 'eof'))
  const before = await fixture.service.handle('snapshot', undefined) as Snapshot
  const draft = await fixture.service.handle('openTeamDraft', undefined) as TeamDraft
  const saved = await fixture.service.handle('saveTeamDraft', { draftId: draft.id, expectedVersion: draft.version, editableFields: { prompt: '设计两人写作团队', selectedConnectionId: fixture.connection.id, selectedModelId: '', createGroup: true, groupTitle: '' } }) as TeamDraft
  const request = { draftId: draft.id, expectedVersion: saved.version, requestId: `team-${draft.id}` }
  await fixture.service.handle('generateTeamPlan', request)
  let view: TeamDraftView | undefined
  await expect.poll(async () => { view = await fixture.service.handle('getTeamDraft', { draftId: draft.id }) as TeamDraftView; return view.generation?.status }, { timeout: 5000, interval: 10 }).toBe('failed')
  expect(view!.draft.plan).toBeUndefined(); expect(view!.generation!.attempts).toHaveLength(1); expect(fixture.requests).toHaveLength(1)
  await fixture.service.handle('generateTeamPlan', request); expect(fixture.requests).toHaveLength(1)
  const records = await fixture.read(); for (const name of ['runs', 'turns', 'workItems', 'artifacts']) expect(records[name]).toHaveLength(0)
  const after = await fixture.service.handle('snapshot', undefined) as Snapshot
  expect(after.agents).toEqual(before.agents); expect(after.conversations).toEqual(before.conversations)
  await fixture.restart(); expect(await fixture.service.handle('getTeamDraft', { draftId: draft.id })).toEqual(view)
})
for (const operation of ['connection-test', 'automation-draft'] as const) test.each(protocols)(`product %s ${operation} EOF persists failed call and cannot become ready`, async protocol => {
  const fixture = await setup(protocol, response => streamText(response, protocol, operation === 'connection-test' ? 'CONNECTED' : automation, 'eof'))
  const request = { connectionId: fixture.connection.id, draftId: 'draft', version: 1, requestId: 'draft-call', instruction: '每天整理资料', timezone: 'Asia/Singapore' }
  const pending = operation === 'connection-test' ? fixture.service.handle('testConnection', { id: fixture.connection.id }) : fixture.service.handle('generateAutomationDraft', request)
  await expect(pending).rejects.toThrow('未确认正常完成'); expect(fixture.requests).toHaveLength(1)
  const records = await fixture.read(), calls = records[operation === 'connection-test' ? 'connectionTestCalls' : 'automationDraftCalls']
  expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ status: 'failed', finishedAt: expect.any(String), modelCall: { phase: operation, protocol, route: { actualModelId: 'provider/actual' } } })
  for (const name of ['runs', 'turns', 'workItems', 'artifacts', 'automations']) expect(records[name]).toHaveLength(0)
  await fixture.restart()
  if (operation === 'automation-draft') await expect(fixture.service.handle('generateAutomationDraft', request)).rejects.toThrow('已经受理')
  expect(fixture.requests).toHaveLength(1)
})
test.each(protocols)('product %s user cancellation closes real HTTP transport and stays cancelled after restart', async protocol => {
  const fixture = await setup(protocol, (response, index) => streamText(response, protocol, index === 1 ? chatDecision : 'IN_PROGRESS', index === 1 ? 'complete' : 'hold'))
  const chat = await employee(fixture)
  await expect.poll(() => fixture.requests.length, { timeout: 5000, interval: 10 }).toBe(2)
  await fixture.service.handle('cancelRun', { conversationId: chat.id }); const detail = await settled(fixture, chat)
  await expect.poll(() => fixture.requests[1].closed, { timeout: 2000, interval: 10 }).toBe(true)
  expect(detail.runs.find(run => run.phase === 'execution')?.status).toBe('cancelled')
  expect(detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed')).toHaveLength(0)
  await fixture.restart(); expect(fixture.requests).toHaveLength(2)
})

for (const operation of ['connection-test', 'automation-draft'] as const) for (const change of ['edit', 'delete', 'import'] as const) test.each(protocols)(`product ${operation} ${change} %s aborts the old live source and keeps its call identity`, async protocol => {
  const fixture = await setup(protocol, response => streamText(response, protocol, operation === 'connection-test' ? 'IN_PROGRESS' : automation, 'hold'))
  const draftRequest = { connectionId: fixture.connection.id, draftId: 'changed-source', version: 1, requestId: 'changed-source-call', instruction: '每天整理资料', timezone: 'Asia/Singapore' }
  const pending = (operation === 'connection-test' ? fixture.service.handle('testConnection', { id: fixture.connection.id }) : fixture.service.handle('generateAutomationDraft', draftRequest)).then(value => ({ value, error: '' }), error => ({ value: undefined, error: String(error) }))
  await expect.poll(() => fixture.requests.length, { timeout: 5000, interval: 10 }).toBe(1)
  await changeSource(fixture, change)
  if (process.env.BOAI_GATEWAY_FAULT_EVIDENCE) await writeFile(join(fixture.root, 'source-change-observed.json'), JSON.stringify({ operation, change, requests: fixture.requests, records: await fixture.read() }, null, 2))
  await expect.poll(() => fixture.requests[0].closed, { timeout: 1500, interval: 10 }).toBe(true)
  const result = await pending; expect(result.value).toBeUndefined(); expect(result.error).toBeTruthy()
  const records = await fixture.read(), calls = records[operation === 'connection-test' ? 'connectionTestCalls' : 'automationDraftCalls']
  expect(calls).toHaveLength(1); expect(calls[0]).toMatchObject({ status: 'cancelled', modelCall: { connectionId: fixture.connection.id, connectionRevision: fixture.connection.revision, selectedModelId: 'group/route' } })
  expect(fixture.requests).toHaveLength(1); await fixture.restart()
})

for (const change of ['edit', 'delete', 'import'] as const) test.each(protocols)(`product team-plan ${change} %s stops the original generation and its HTTP request`, async protocol => {
  const fixture = await setup(protocol, response => streamText(response, protocol, JSON.stringify(writingPlan), 'hold'))
  const draft = await fixture.service.handle('openTeamDraft', undefined) as TeamDraft
  const saved = await fixture.service.handle('saveTeamDraft', { draftId: draft.id, expectedVersion: draft.version, editableFields: { prompt: '设计两人团队', selectedConnectionId: fixture.connection.id, selectedModelId: '', createGroup: true, groupTitle: '' } }) as TeamDraft
  await fixture.service.handle('generateTeamPlan', { draftId: draft.id, expectedVersion: saved.version, requestId: `source-${draft.id}` })
  await expect.poll(() => fixture.requests.length, { timeout: 5000, interval: 10 }).toBe(1)
  await changeSource(fixture, change)
  await expect.poll(() => fixture.requests[0].closed, { timeout: 1500, interval: 10 }).toBe(true)
  const view = await fixture.service.handle('getTeamDraft', { draftId: draft.id }) as TeamDraftView
  expect(view.generation?.status).toBe('cancelled'); expect(view.draft.plan).toBeUndefined(); expect(view.generation?.attempts).toHaveLength(1)
  expect(fixture.requests).toHaveLength(1); await fixture.restart()
})

test.each(protocols)('product %s connection changes cancel only that source, leaving another live connection untouched', async protocol => {
  const fixture = await setup(protocol, response => streamText(response, protocol, 'IN_PROGRESS', 'hold'))
  const other = await fixture.service.handle('saveConnection', { name: 'Independent source', provider: fixture.connection.provider, baseUrl: fixture.connection.baseUrl, defaultModel: 'group/other', gateway: fixture.connection.gateway }) as Connection
  const first = fixture.service.handle('testConnection', { id: fixture.connection.id }).catch(error => error)
  await expect.poll(() => fixture.requests.length, { timeout: 5000, interval: 10 }).toBe(1)
  const second = fixture.service.handle('testConnection', { id: other.id }).catch(error => error)
  await expect.poll(() => fixture.requests.length, { timeout: 5000, interval: 10 }).toBe(2)
  await fixture.service.handle('deleteConnection', { id: fixture.connection.id }); await first
  await expect.poll(() => fixture.requests[0].closed, { timeout: 1500, interval: 10 }).toBe(true)
  expect(fixture.requests[1].closed).toBe(false)
  expect((await fixture.read()).connectionTestCalls).toEqual(expect.arrayContaining([
    expect.objectContaining({ status: 'cancelled', modelCall: expect.objectContaining({ connectionId: fixture.connection.id }) }),
    expect.objectContaining({ status: 'running', modelCall: expect.objectContaining({ connectionId: other.id }) }),
  ]))
  await fixture.service.close(); await second
  await expect.poll(() => fixture.requests[1].closed, { timeout: 1500, interval: 10 }).toBe(true)
})

for (const mode of ['complete', 'eof', 'cancel'] as const) test.each(protocols)(`product %s private report ${mode} gates the original task publication without repeating its tool`, async protocol => {
  const outcome = { disposition: 'delivered', summary: '已计算', evidence: [{ kind: 'answer', reference: '总和：60' }] }
  const report = JSON.stringify({ action: 'publish', text: '总和：60', outcome })
  const fixture = await setup(protocol, (response, index) => {
    if (index === 1) streamText(response, protocol, taskDecision, 'complete')
    else if (index === 2) streamTool(response, protocol, 'write_file', { path: 'self:/work/effect.txt', content: 'WRITTEN_ONCE' })
    else if (index === 3) streamTool(response, protocol, 'report_work', outcome, true, undefined, 'outcome-once')
    else if (index === 4) streamText(response, protocol, '总和为 **60**。', 'complete')
    else if (index === 5) streamText(response, protocol, report, mode === 'cancel' ? 'hold' : mode)
    else streamText(response, protocol, '{"candidates":[]}', 'complete')
  })
  const chat = await employee(fixture)
  await expect.poll(() => fixture.requests.length, { timeout: 5000, interval: 10 }).toBeGreaterThanOrEqual(5)
  expect(fixture.requests[4]).toMatchObject({ privateProtocol: 'private-work-report-v1', tools: [] })
  const files = (await readdir(join(fixture.root, 'data'), { recursive: true })).filter(path => path.endsWith('/effect.txt'))
  expect(files).toHaveLength(1)
  const path = join(fixture.root, 'data', files[0])
  const fingerprint = async () => ({ hash: createHash('sha256').update(await readFile(path)).digest('hex'), mtimeMs: (await stat(path)).mtimeMs })
  const original = await fingerprint()
  if (mode === 'cancel') await fixture.service.handle('cancelRun', { conversationId: chat.id })
  const detail = await settled(fixture, chat), execution = detail.runs.find(run => run.phase === 'execution')!
  expect(execution.modelCalls?.filter(call => call.phase === 'report')).toHaveLength(1)
  expect(execution.toolEvents.filter(tool => tool.name === 'write_file')).toMatchObject([{ id: 'write-once', status: 'completed' }])
  expect(execution.toolEvents.filter(tool => tool.name === 'report_work')).toMatchObject([{ id: 'outcome-once', status: 'completed' }])
  expect(detail.workItems).toHaveLength(1); expect(detail.artifacts).toHaveLength(0)
  const published = detail.messages.filter(message => message.senderType === 'agent' && message.status === 'completed')
  if (mode === 'complete') {
    expect(execution).toMatchObject({ status: 'completed', draft: { status: 'published', revisions: 1, text: '总和：60' } })
    expect(detail.workItems![0]).toMatchObject({ status: 'delivered', resultMessageIds: [published[0].id] })
    expect(published.map(message => message.content)).toEqual(['总和：60'])
    expect(fixture.requests).toHaveLength(6)
  } else {
    expect(execution).toMatchObject({ status: mode === 'eof' ? 'failed' : 'cancelled', draft: { status: 'withheld', revisions: 0, text: '总和为 **60**。' } })
    if (mode === 'eof') expect(execution.error).toContain('未确认正常完成')
    expect(detail.workItems![0].status).not.toBe('delivered'); expect(detail.workItems![0].resultMessageIds).toEqual([])
    expect(published).toHaveLength(0); expect(fixture.requests).toHaveLength(5)
  }
  routes(detail, protocol, fixture.requests.length, mode === 'cancel' ? execution.modelCalls!.find(call => call.phase === 'report')!.callId : undefined)
  await expect.poll(() => fixture.requests.every(row => row.closed), { timeout: 2000, interval: 10 }).toBe(true)
  await fixture.restart()
  expect(await fingerprint()).toEqual(original); expect(await readFile(path, 'utf8')).toBe('WRITTEN_ONCE')
  const restored = await fixture.service.handle('getConversation', { id: chat.id }) as ConversationDetail
  expect(restored.runs).toEqual(detail.runs); expect(restored.messages).toEqual(detail.messages)
})

for (const mode of ['complete', 'eof', 'cancel'] as const) test.each(protocols)(`product %s group interpretation ${mode} gates actual member decisions`, async protocol => {
  const fixture = await setup(protocol, (response, index) => streamText(response, protocol,
    index === 1 ? '{"mode":"independent"}' : '{"action":"pass"}', index === 1 ? mode === 'cancel' ? 'hold' : mode : 'complete'))
  const agents: DigitalAgent[] = []
  for (const name of ['群成员甲', '群成员乙']) agents.push(await fixture.service.handle('saveAgent', { name, role: '验收', instructions: '按用户要求处理', color: '#123456', connectionId: fixture.connection.id, modelId: 'group/route', skillIds: [], knowledgeIds: [], allowCommands: false, active: true }) as DigitalAgent)
  const chat = await fixture.service.handle('createConversation', { kind: 'group', title: '群解释故障验收', agentIds: agents.map(agent => agent.id), mode: 'mention', sharedKnowledgeIds: [] }) as Conversation
  await fixture.service.handle('sendMessage', { conversationId: chat.id, requestId: chat.id, content: '请两位各自判断是否需要处理', mentionIds: [] })
  await expect.poll(() => fixture.requests.length, { timeout: 5000, interval: 10 }).toBeGreaterThanOrEqual(1)
  expect(fixture.requests[0]).toMatchObject({ privateProtocol: 'private-group-interpretation-v1', tools: [] })
  if (mode === 'cancel') await fixture.service.handle('cancelRun', { conversationId: chat.id })
  const detail = await settled(fixture, chat), coordination = detail.runs.find(run => run.phase === 'coordination')!
  expect(coordination.modelCalls).toHaveLength(1); expect(coordination.modelCalls![0].phase).toBe('decision')
  if (mode === 'complete') {
    expect(coordination.status).toBe('completed')
    expect(detail.turns?.[0].coordination).toMatchObject({ mode: 'independent', sourceRunId: coordination.id, agentIds: agents.map(agent => agent.id) })
    expect(detail.runs.filter(run => run.phase === 'decision')).toHaveLength(2)
    expect(fixture.requests).toHaveLength(3)
  } else {
    expect(coordination.status).toBe(mode === 'eof' ? 'failed' : 'cancelled')
    if (mode === 'eof') expect(coordination.error).toContain('未确认正常完成')
    expect(detail.turns?.[0].coordination).toBeUndefined(); expect(detail.runs).toHaveLength(1)
    expect(fixture.requests).toHaveLength(1)
  }
  expect(detail.messages.filter(message => message.senderType === 'agent')).toHaveLength(0)
  expect(detail.workItems ?? []).toHaveLength(0); expect(detail.artifacts).toHaveLength(0)
  routes(detail, protocol, fixture.requests.length, mode === 'cancel' ? coordination.modelCalls![0].callId : undefined)
  await expect.poll(() => fixture.requests.every(row => row.closed), { timeout: 2000, interval: 10 }).toBe(true)
  await fixture.restart()
  const restored = await fixture.service.handle('getConversation', { id: chat.id }) as ConversationDetail
  expect(restored.runs).toEqual(detail.runs); expect(restored.turns).toEqual(detail.turns)
})
