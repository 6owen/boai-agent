/*
 * [INPUT]: Production MastraEngine/team planner/SDK and controlled three-protocol HTTP streams.
 * [OUTPUT]: Confirmed completion versus EOF across public/private stages, no format retry, retained file side effects and actual cancellation.
 * [POS]: Gateway stream integrity regression; real local HTTP/tools shared with the product fault suite, no supplier inference.
 * [PROTOCOL]: Update Header, tests/.folder.md and the Magpie ledger when coverage changes.
 */
import { createServer, type ServerResponse } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { MastraEngine } from '../packages/runtime/src/adapters/mastra/engine'
import { planTeam, TeamPlanFormatError } from '../packages/runtime/src/adapters/mastra/team-planner'
import type { EngineContext } from '../packages/runtime/src/contracts'
import type { ModelProtocol } from '../packages/shared/src/domain/model-gateway'
import type { ToolEvent } from '../packages/shared/src/domain'
import { writingPlan } from './fixtures/team-planner'
import { streamText, streamTool } from './fixtures/gateway-stream'

const cleanup: (() => Promise<void>)[] = []
const protocols = ['chat', 'responses', 'messages'] as const
const operations = ['chat', 'report', 'decision', 'memory', 'group', 'automation-draft', 'team-plan', 'connection-test'] as const
const content = {
  chat: 'MODEL_REPLY', report: '{"action":"publish","text":"Confirmed draft"}', decision: '{"action":"reply","responseKind":"chat"}', memory: '{"candidates":[]}', group: '{"mode":"independent"}',
  'automation-draft': JSON.stringify({ name: 'Review', prompt: 'Review', target: null, frequency: 'daily', daysOfWeek: [], time: '09:00', timezone: null, notificationPolicy: 'muted', unsupported: [] }),
  'team-plan': JSON.stringify(writingPlan), 'connection-test': 'MODEL_REPLY',
}
afterEach(async () => { for (const dispose of cleanup.splice(0).reverse()) await dispose() })
function streamWrite(response: ServerResponse, protocol: ModelProtocol, complete = true) {
  streamTool(response, protocol, 'write_file', { path: 'self:/runs/run/effect.txt', content: 'WRITTEN_ONCE' }, complete)
}
async function setup(protocol: ModelProtocol, reply: (response: ServerResponse, index: number, body: string) => void) {
  const root = await mkdtemp(join(tmpdir(), 'boai-gateway-eof-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  let requests = 0, text = '', extraCalls = 0
  const tools = new Map<string, ToolEvent>(), controller = new AbortController()
  const server = createServer((request, response) => { void (async () => {
    let body = ''; for await (const part of request) body += part
    requests++; if (requests > 2) { response.writeHead(500); response.end('Unexpected replay'); return }
    reply(response, requests, body)
  })().catch(error => { response.destroy(error) }) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const connection = { id: 'gateway', name: 'Stream test', provider: 'openai-compatible' as const, baseUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}`, defaultModel: 'group/route', hasApiKey: false, gateway: { kind: 'magpie' as const, auth: 'local' as const, protocol } }
  const context: EngineContext = { connection, apiKey: '', agent: { id: 'employee', name: 'Employee', role: '', instructions: '', color: '#123456', connectionId: connection.id, modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 },
    conversation: { id: 'chat', kind: 'direct', title: 'EOF', agentIds: ['employee'], mode: 'mention', sharedKnowledgeIds: [], workspacePath: join(root, 'shared'), createdAt: '', updatedAt: '' },
    messages: [{ id: 'request', conversationId: 'chat', senderType: 'user', senderId: 'user', senderName: 'User', content: 'Reply once.', sequence: 1, status: 'completed', createdAt: '' }],
    resources: [], runId: 'run', modelCallId: 'call', responseKind: 'chat', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
    workspace: { root: join(root, 'private'), workPath: join(root, 'private/work'), runPath: join(root, 'private/runs/run'), sharedPath: join(root, 'shared') },
    onAdditionalModelCall: async () => `additional-${++extraCalls}`, onDelta: async value => { text += value }, onTool: async event => { tools.set(event.id, event) }, approveCommand: async () => false,
  }
  return { context, connection, controller, root, tools, requests: () => requests, text: () => text, extraCalls: () => extraCalls }
}
function invoke(operation: typeof operations[number], context: EngineContext) {
  const engine = new MastraEngine(), connection = context.connection!
  switch (operation) {
    case 'chat': return engine.run(context)
    case 'report': return engine.report(context, { text: 'Old draft', observedThroughSequence: 1, revisions: 0, status: 'private' })
    case 'decision': return engine.decide(context)
    case 'memory': return engine.extractMemory(context)
    case 'group': return engine.interpretGroup(context)
    case 'automation-draft': return engine.draftAutomation({ connection, apiKey: '', instruction: 'Review daily', timezone: 'Asia/Singapore', targets: [], signal: context.signal, onUsage: async () => {} })
    case 'team-plan': return planTeam({ connection, apiKey: '', modelId: '', prompt: 'Writing team', signal: context.signal, usage: async () => {} })
    case 'connection-test': return engine.test(connection, '', { signal: context.signal })
  }
}
for (const operation of operations) for (const mode of ['eof', 'complete'] as const) test.each(protocols)(`${operation} %s ${mode}: require model completion before accepting output or repairing JSON`, async protocol => {
  const fixture = await setup(protocol, response => streamText(response, protocol, content[operation], mode))
  const request = invoke(operation, fixture.context)
  if (mode === 'eof') await expect(request).rejects.toThrow('未确认正常完成')
  else {
    const expected = operation === 'chat' ? undefined : operation === 'connection-test' ? content[operation] : operation === 'memory' ? [] : operation === 'decision' ? { ...JSON.parse(content[operation]), observedThroughSequence: 1 } : JSON.parse(content[operation])
    await expect(request).resolves.toEqual(expected)
  }
  expect(fixture.requests()).toBe(1); expect(fixture.extraCalls()).toBe(0)
  expect(fixture.text()).toBe(operation === 'chat' ? content[operation] : '')
})
test.each(protocols)('team-plan %s truncated invalid JSON remains a transport failure, never a repairable format error', async protocol => {
  const fixture = await setup(protocol, response => streamText(response, protocol, '{"kind":', 'eof'))
  const error = await invoke('team-plan', fixture.context).catch(error => error)
  expect(error).toBeInstanceOf(Error); expect(error).not.toBeInstanceOf(TeamPlanFormatError); expect((error as Error).message).toContain('未确认正常完成')
  expect(fixture.requests()).toBe(1)
})
test.each(protocols)('task %s retains an executed real file tool when the next response ends without completion', async protocol => {
  let secondBody = ''
  const fixture = await setup(protocol, (response, index, body) => { if (index === 1) streamWrite(response, protocol); else { secondBody = body; streamText(response, protocol, 'Unconfirmed final', 'eof') } })
  fixture.context.responseKind = 'task'
  await expect(new MastraEngine().run(fixture.context)).rejects.toThrow('未确认正常完成')
  expect(await readFile(join(fixture.root, 'private/runs/run/effect.txt'), 'utf8')).toBe('WRITTEN_ONCE')
  expect([...fixture.tools.values()].filter(event => event.name === 'write_file')).toMatchObject([{ id: 'write-once', status: 'completed' }])
  expect(secondBody).toContain('write-once'); expect(fixture.requests()).toBe(2); expect(fixture.extraCalls()).toBe(1); expect(fixture.text()).toBe('')
})
test.each(protocols)('chat %s abort closes the actual HTTP response without replay', async protocol => {
  let arrived!: () => void, closed!: () => void
  const ready = new Promise<void>(resolve => { arrived = resolve }), disconnected = new Promise<void>(resolve => { closed = resolve })
  const fixture = await setup(protocol, response => { response.once('close', closed); streamText(response, protocol, 'In progress', 'hold'); arrived() })
  const pending = new MastraEngine().run(fixture.context); const rejected = expect(pending).rejects.toThrow()
  await ready; fixture.controller.abort(); await rejected
  await Promise.race([disconnected, new Promise((_, reject) => { const timer = setTimeout(() => reject(Error('Transport still open')), 1000); timer.unref() })])
  expect(fixture.requests()).toBe(1); expect(fixture.extraCalls()).toBe(0)
})
test.each(protocols)('task %s never continues after an unconfirmed tool step', async protocol => {
  const fixture = await setup(protocol, (response, index) => { if (index === 1) streamWrite(response, protocol, false); else streamText(response, protocol, 'Must not reach this request', 'complete') })
  fixture.context.responseKind = 'task'
  await expect(new MastraEngine().run(fixture.context)).rejects.toThrow('未确认正常完成')
  expect(fixture.requests()).toBe(1); expect(fixture.extraCalls()).toBe(0); expect(fixture.text()).toBe('')
  expect(await readFile(join(fixture.root, 'private/runs/run/effect.txt'), 'utf8')).toBe('WRITTEN_ONCE')
  expect([...fixture.tools.values()].filter(event => event.name === 'write_file')).toMatchObject([{ id: 'write-once', status: 'completed' }])
})
