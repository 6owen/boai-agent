import { createServer, type ServerResponse } from 'node:http'
import { mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { MastraEngine, projectMessages } from '../src/runtime/mastra-engine'
import type { Connection, DigitalAgent, Artifact, EngineContext, Message, ModelUsage, ToolEvent } from '../src/shared/contracts'

type RequestBody = { model: string; max_tokens?: number; max_completion_tokens?: number; messages: { role: string; content: unknown; tool_call_id?: string }[]; tools?: { function: { name: string } }[] }
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })

function send(response: ServerResponse, content: string | { name: string; args: unknown; preface?: string; reasoning?: string }, index: number, usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }, finishReason = 'stop') {
  response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' })
  const chunk = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `response-${index}`, object: 'chat.completion.chunk', created: 1700000000, model: 'test-model', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
  chunk({ role: 'assistant' })
  if (typeof content === 'string') {
    chunk({ content: content.slice(0, 2) })
    chunk({ content: content.slice(2) })
    chunk({}, finishReason)
  } else {
    if (content.preface) chunk({ content: content.preface })
    if (content.reasoning) chunk({ reasoning_content: content.reasoning })
    chunk({ tool_calls: [{ index: 0, id: `call-${index}`, type: 'function', function: { name: content.name, arguments: JSON.stringify(content.args) } }] })
    chunk({}, 'tool_calls')
  }
  if (usage) response.write(`data: ${JSON.stringify({ id: `response-${index}`, object: 'chat.completion.chunk', created: 1700000000, model: 'test-model', choices: [], usage })}\n\n`)
  response.end('data: [DONE]\n\n')
}
async function endpoint(replies: (string | { name: string; args: unknown; preface?: string; reasoning?: string })[] | ((body: RequestBody, response: ServerResponse, index: number) => void)) {
  const requests: RequestBody[] = []
  const headers: string[] = []
  const server = createServer(async (request, response) => {
    let text = ''
    for await (const part of request) text += part
    const body = JSON.parse(text) as RequestBody
    requests.push(body)
    headers.push(request.headers.authorization ?? '')
    if (typeof replies === 'function') replies(body, response, requests.length - 1)
    else send(response, replies[requests.length - 1] ?? 'Done.', requests.length - 1)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Server did not start')
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  return { url: `http://127.0.0.1:${address.port}/v1`, requests, headers }
}
async function temporary() {
  const directory = await mkdtemp(path.join(tmpdir(), 'boai-engine-test-'))
  cleanup.push(() => rm(directory, { recursive: true, force: true }))
  return directory
}
function connection(url: string): Connection { return { id: 'connection', name: 'Fixture', provider: 'openai-compatible', baseUrl: url, defaultModel: 'user-specified-model', hasApiKey: true } }
function employee(overrides: Partial<DigitalAgent> = {}): DigitalAgent {
  return { id: 'agent-a', name: 'Alice', role: 'Researcher', instructions: 'Help the user.', color: '#00AABB', connectionId: 'connection', modelId: 'user-model-override', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1, ...overrides }
}
function message(content: string, sequence = 1, overrides: Partial<Message> = {}): Message {
  return { id: `message-${sequence}`, conversationId: 'conversation', senderType: 'user', senderId: 'human', senderName: 'User', content, status: 'completed', sequence, createdAt: new Date().toISOString(), ...overrides }
}
async function context(url: string, overrides: Partial<EngineContext> = {}) {
  const directory = await temporary()
  const deltas: string[] = [], tools: ToolEvent[] = [], approvals: string[] = [], artifacts: Artifact[] = [], additionalCalls: number[] = []
  const controller = new AbortController()
  const ctx: EngineContext = {
    agent: employee(), connection: connection(url), apiKey: 'fixture-secret',
    conversation: { id: 'conversation', kind: 'group', title: 'Test', agentIds: ['agent-a', 'agent-b'], mode: 'mention', workspacePath: path.join(directory, 'workspace'), sharedKnowledgeIds: [], createdAt: '', updatedAt: '' },
    messages: [message('Please do the task')], resources: [], runId: 'run-1', signal: controller.signal, responseKind: 'task',
    workspace: { root: path.join(directory, 'employees/agent-a/sessions/conversation'), workPath: path.join(directory, 'employees/agent-a/sessions/conversation/work'), runPath: path.join(directory, 'employees/agent-a/sessions/conversation/runs/run-1'), sharedPath: path.join(directory, 'workspace') },
    onArtifact: async artifact => { artifacts.push(artifact) },
    onAdditionalModelCall: async () => { additionalCalls.push(1) },
    onDelta: async text => { deltas.push(text) }, onTool: async event => { tools.push(event) },
    approveCommand: async command => { approvals.push(command); return true }, ...overrides,
  }
  return { ctx, deltas, tools, approvals, artifacts, additionalCalls, directory, controller }
}
function allMessageText(request: RequestBody) { return request.messages.map(message => JSON.stringify(message.content)).join('\n') }
function toolResultText(request: RequestBody) { return request.messages.filter(message => message.role === 'tool').map(message => JSON.stringify(message.content)).join('\n') }

describe('MastraEngine with real Mastra and a local model HTTP endpoint', () => {
  it('sends configured model/key and yields real streaming deltas with correct conversation projection', async () => {
    const mock = await endpoint(['Hello world'])
    const { ctx, deltas } = await context(mock.url)
    ctx.responseKind = 'chat'
    ctx.messages = [message('Earlier request', 1), message('My own answer', 2, { senderType: 'agent', senderId: 'agent-a', senderName: 'Alice' }), message('Bob found a source', 3, { senderType: 'agent', senderId: 'agent-b', senderName: 'Bob' }), message('Unrelated secret', 4, { conversationId: 'other' }), message('Current request', 5), message('Partial should not replay', 6, { status: 'streaming' })]
    await new MastraEngine().run(ctx)
    expect(deltas.join('')).toBe('Hello world')
    expect(deltas.length).toBeGreaterThan(1)
    expect(mock.headers).toEqual(['Bearer fixture-secret'])
    expect(mock.requests[0].model).toBe('user-model-override')
    expect(mock.requests[0].messages.filter(message => message.role === 'assistant').map(message => message.content)).toContain('My own answer')
    const projected = mock.requests[0].messages.find(message => JSON.stringify(message.content).includes('Bob found a source'))
    expect(projected?.role).toBe('user')
    expect(JSON.stringify(projected?.content)).toContain('Bob')
    expect(allMessageText(mock.requests[0])).not.toMatch(/Unrelated secret|Partial should not replay/)
    expect(mock.requests[0].tools ?? []).toHaveLength(0)
  })

  it('keeps chat tool-free without touching resources and uses the host bootstrap exactly once', async () => {
    const mock = await endpoint(['Hello!'])
    const { ctx, approvals, tools } = await context(mock.url, { responseKind: 'chat' })
    ctx.agent.allowCommands = true
    ctx.agent.instructions = 'LEGACY_INSTRUCTIONS_MUST_NOT_REPEAT'
    ctx.agent.skillIds = ['missing-skill']
    ctx.resources = [{ id: 'missing-skill', kind: 'skill', name: 'Unavailable resource', description: '', path: '/no-such-skill', createdAt: '' }]
    ctx.bootstrap = { instructions: 'HOST_SYSTEM_FILE_RULE', hashes: {}, configVersion: 1, memoryVersion: 0, policyVersion: 1, sources: [] }
    await new MastraEngine().run(ctx)
    expect(mock.requests[0].tools ?? []).toHaveLength(0)
    expect(allMessageText(mock.requests[0]).match(/HOST_SYSTEM_FILE_RULE/g)).toHaveLength(1)
    expect(allMessageText(mock.requests[0])).not.toContain('LEGACY_INSTRUCTIONS_MUST_NOT_REPEAT')
    expect(allMessageText(mock.requests[0])).not.toContain('Unavailable resource')
    expect(approvals).toHaveLength(0)
    expect(tools).toHaveLength(0)
    await expect(readdir(ctx.workspace!.root)).rejects.toThrow()
  })

  it('bounds complete history messages while retaining the root request and exact newest sequence', async () => {
    const mock = await endpoint(['{"action":"pass","observedThroughSequence":120}', 'A brief answer.'])
    const { ctx } = await context(mock.url, { responseKind: 'chat' })
    ctx.messages = [message('CURRENT_ROOT_REQUEST', 1), ...Array.from({ length: 119 }, (_, index) => message(`${index === 118 ? 'LATEST_EVENT' : 'HISTORY_' + index}: ${'x'.repeat(1000)}`, index + 2, { senderType: 'agent', senderId: index % 2 ? 'agent-a' : 'agent-b' }))]
    ctx.triggerMessageId = 'message-1'
    const engine = new MastraEngine()
    expect(await engine.decide(ctx)).toMatchObject({ action: 'pass', observedThroughSequence: 120 })
    await engine.run(ctx)
    for (const [index, request] of mock.requests.entries()) {
      expect(allMessageText(request)).toContain('CURRENT_ROOT_REQUEST')
      expect(allMessageText(request)).toContain('LATEST_EVENT')
      expect(allMessageText(request)).not.toContain('HISTORY_0:')
      const payload = index === 0 ? JSON.parse(request.messages.find(message => message.role === 'user')!.content as string).data : undefined
      const transcript = payload ? [...payload.historicalBackground, ...payload.currentTurnMessages] : request.messages.filter(message => message.role !== 'system')
      expect(transcript.length).toBeLessThan(100)
      expect(transcript.reduce((total: number, message: { content: unknown }) => total + JSON.stringify(message.content).length, 0)).toBeLessThan(48_000)
    }
  })

  it('rejects oversized initiating requests instead of silently truncating their instructions', async () => {
    const mock = await endpoint(['Should not be called'])
    const { ctx } = await context(mock.url, { responseKind: 'chat' })
    ctx.messages = [message('x'.repeat(48_001))]
    ctx.triggerMessageId = 'message-1'
    await expect(new MastraEngine().run(ctx)).rejects.toThrow('上下文长度限制')
    expect(mock.requests).toHaveLength(0)
  })

  it('keeps task step text in activity and publishes only the final SDK step, excluding reasoning', async () => {
    const mock = await endpoint([
      { name: 'write_file', args: { path: 'self:/runs/run-1/note.md', content: 'result' }, preface: 'I will write the note now.', reasoning: 'PRIVATE_REASONING_MUST_NOT_LEAK' },
      'The note is ready.',
    ])
    const { ctx, deltas, tools } = await context(mock.url)
    await new MastraEngine().run(ctx)
    expect(deltas).toEqual(['The note is ready.'])
    const activity = tools.find(event => event.name === 'task_step')
    expect(activity?.detail).toContain('I will write the note now.')
    expect(JSON.stringify(tools)).not.toContain('PRIVATE_REASONING_MUST_NOT_LEAK')
    expect(deltas.join('')).not.toContain('I will write')
  })

  it('reports actual cumulative step usage for tasks, decisions and memory; missing usage stays unknown', async () => {
    const mock = await endpoint((_body, response, index) => {
      const replies = [{ name: 'list_files', args: { path: 'self:/' } }, 'Task done.', '{"action":"pass","observedThroughSequence":1}', '{"candidates":[]}', 'Hello']
      send(response, replies[index], index, index === 4 ? undefined : { prompt_tokens: 20, completion_tokens: 7, total_tokens: 27 })
    })
    const usages: ModelUsage[] = []
    const { ctx } = await context(mock.url, { onUsage: async usage => { usages.push(usage) } })
    const engine = new MastraEngine()
    await engine.run(ctx)
    expect(usages).toEqual([{ inputTokens: 20, outputTokens: 7, totalTokens: 27 }, { inputTokens: 40, outputTokens: 14, totalTokens: 54 }])
    usages.length = 0
    await engine.decide(ctx)
    expect(usages).toEqual([{ inputTokens: 20, outputTokens: 7, totalTokens: 27 }])
    usages.length = 0
    await engine.extractMemory(ctx)
    expect(usages).toEqual([{ inputTokens: 20, outputTokens: 7, totalTokens: 27 }])
    usages.length = 0
    ctx.responseKind = 'chat'
    await engine.run(ctx)
    expect(usages).toEqual([{}])
  })

  it('propagates a usage-budget cancellation before publishing task text or starting a second step', async () => {
    const mock = await endpoint((_body, response, index) => send(response, { name: 'list_files', args: { path: 'self:/' } }, index, { prompt_tokens: 20, completion_tokens: 8000, total_tokens: 8020 }))
    const { ctx, controller, deltas } = await context(mock.url)
    ctx.onUsage = async usage => { if ((usage.outputTokens ?? 0) > 1000) controller.abort() }
    await expect(new MastraEngine().run(ctx)).rejects.toThrow('取消')
    expect(mock.requests).toHaveLength(1)
    expect(deltas).toEqual([])
  })

  it.each(['ask', 'request_handoff'] as const)('never grants task capabilities to a %s response even if a caller passes task', async action => {
    const mock = await endpoint(['Please clarify the intended review.'])
    const { ctx } = await context(mock.url)
    ctx.agent.allowCommands = true
    ctx.decision = { action, responseKind: 'task', observedThroughSequence: 1, recipientAgentIds: ['agent-b'] }
    await new MastraEngine().run(ctx)
    expect(mock.requests[0].tools ?? []).toHaveLength(0)
    await expect(readdir(ctx.workspace!.root)).rejects.toThrow()
  })

  it('keeps drafts private and explicitly copies only selected artifacts with ownership metadata', async () => {
    const mock = await endpoint([
      { name: 'write_file', args: { path: 'self:/runs/run-1/report.md', content: 'Published report' } },
      { name: 'write_file', args: { path: 'self:/work/private.md', content: 'Private notes' } },
      { name: 'list_files', args: { path: 'shared:/' } },
      { name: 'publish_artifact', args: { path: 'self:/runs/run-1/report.md', name: 'report.md' } },
      'Published.',
    ])
    const { ctx, artifacts } = await context(mock.url)
    await mkdir(path.join(ctx.workspace!.sharedPath, 'artifacts'), { recursive: true })
    await writeFile(path.join(ctx.workspace!.sharedPath, 'artifacts/existing.md'), 'Keep existing')
    await new MastraEngine().run(ctx)
    const listing = JSON.stringify(mock.requests[3].messages.filter(message => message.role === 'tool').at(-1)?.content)
    expect(listing).not.toContain('private.md')
    expect(listing).not.toContain('report.md')
    expect(artifacts).toHaveLength(1)
    const artifact = artifacts[0]
    expect(artifact).toMatchObject({ ownerAgentId: 'agent-a', runId: 'run-1', name: 'report.md', size: 16, sourcePath: path.join(ctx.workspace!.runPath, 'report.md') })
    expect(artifact.path.startsWith(path.join(ctx.workspace!.sharedPath, 'artifacts') + path.sep)).toBe(true)
    expect(await readFile(artifact.path, 'utf8')).toBe('Published report')
    expect(await readFile(path.join(ctx.workspace!.sharedPath, 'artifacts/existing.md'), 'utf8')).toBe('Keep existing')
    expect(await readdir(path.join(ctx.workspace!.sharedPath, 'artifacts'))).toHaveLength(2)
  })

  it('removes the new shared copy when artifact registration fails', async () => {
    const mock = await endpoint([
      { name: 'write_file', args: { path: 'self:/runs/run-1/report.md', content: 'Private draft' } },
      { name: 'publish_artifact', args: { path: 'self:/runs/run-1/report.md' } },
      'Publication failed.',
    ])
    const { ctx, tools } = await context(mock.url, { onArtifact: async () => { throw new Error('Registration unavailable') } })
    await new MastraEngine().run(ctx)
    expect(await readdir(path.join(ctx.workspace!.sharedPath, 'artifacts'))).toEqual([])
    expect(await readFile(path.join(ctx.workspace!.runPath, 'report.md'), 'utf8')).toBe('Private draft')
    expect(tools.find(event => event.name === 'publish_artifact' && event.status === 'failed')?.detail).toContain('Registration unavailable')
  })

  it('rejects system files, other sessions, shared writes and unqualified file paths', async () => {
    const mock = await endpoint([
      { name: 'read_file', args: { path: 'self:/MEMORY.md' } },
      { name: 'write_file', args: { path: 'self:/work/SOUL.md', content: 'change rules' } },
      { name: 'read_file', args: { path: 'self:/../other-conversation/work/private.md' } },
      { name: 'write_file', args: { path: 'shared:/report.md', content: 'bypass publishing' } },
      { name: 'read_file', args: { path: 'report.md' } },
      { name: 'list_files', args: { path: 'self:/' } },
      'Rejected.',
    ])
    const { ctx, tools } = await context(mock.url)
    await mkdir(ctx.workspace!.root, { recursive: true })
    await writeFile(path.join(ctx.workspace!.root, 'MEMORY.md'), 'SYSTEM_MEMORY_SECRET')
    await new MastraEngine().run(ctx)
    expect(tools.filter(event => event.status === 'failed')).toHaveLength(5)
    expect(toolResultText(mock.requests[1])).not.toContain('SYSTEM_MEMORY_SECRET')
    expect(toolResultText(mock.requests[6])).not.toContain('SYSTEM_MEMORY_SECRET')
    expect(toolResultText(mock.requests[6])).toContain('work')
    await expect(readFile(path.join(ctx.workspace!.sharedPath, 'report.md'))).rejects.toThrow()
  })

  it('extracts scoped source-backed memory with its own model and rejects unknown sources', async () => {
    const mock = await endpoint([
      JSON.stringify({ candidates: [
        { content: 'Prefers concise reports.', sourceMessageIds: ['message-1'] },
        { content: 'Friday deadline.', sourceMessageIds: ['message-2', 'message-2'], sourceResourceIds: ['facts'] },
        { content: 'Friday deadline.', sourceMessageIds: ['message-2'] },
      ] }),
      JSON.stringify({ candidates: [{ content: 'Invented fact', sourceMessageIds: ['other-message'] }] }),
      JSON.stringify({ candidates: [{ content: 'Wrong resource', sourceMessageIds: ['message-2'], sourceResourceIds: ['other-resource'] }] }),
      JSON.stringify({ candidates: [] }),
    ])
    const { ctx } = await context(mock.url)
    ctx.messages = [message('I prefer concise reports.'), message('The deadline is Friday.', 2), message('OTHER_CONVERSATION_SECRET', 3, { id: 'other-message', conversationId: 'other' }), message('PARTIAL_DRAFT', 4, { status: 'streaming' })]
    ctx.agent.knowledgeIds = ['facts']
    ctx.resources = [{ id: 'facts', kind: 'knowledge', name: 'Facts', description: '', path: '/unread-during-memory', createdAt: '' }]
    ctx.memory = { namespace: 'agent-a:conversation', epoch: 4, entries: [
      { id: 'm1', ownerAgentId: 'agent-a', scope: 'conversation', conversationId: 'conversation', content: 'Prefers concise reports.', sourceMessageIds: ['message-1'], sourceResourceIds: [], origin: 'model', version: 1, createdAt: '', updatedAt: '' },
      { id: 'm2', ownerAgentId: 'agent-b', scope: 'conversation', conversationId: 'conversation', content: 'OTHER_EMPLOYEE_MEMORY', sourceMessageIds: [], sourceResourceIds: [], origin: 'model', version: 1, createdAt: '', updatedAt: '' },
    ] }
    const engine = new MastraEngine()
    expect(await engine.extractMemory(ctx)).toEqual([{ content: 'Friday deadline.', sourceMessageIds: ['message-2'], sourceResourceIds: ['facts'] }])
    expect(mock.requests[0].model).toBe('user-model-override')
    expect(mock.requests[0].tools ?? []).toHaveLength(0)
    expect(allMessageText(mock.requests[0])).not.toMatch(/OTHER_CONVERSATION_SECRET|PARTIAL_DRAFT|OTHER_EMPLOYEE_MEMORY/)
    await expect(engine.extractMemory(ctx)).rejects.toThrow('未授权或不存在')
    await expect(engine.extractMemory(ctx)).rejects.toThrow('未授权或不存在')
    expect(await engine.extractMemory(ctx)).toEqual([])
    await expect(readdir(ctx.workspace!.root)).rejects.toThrow()
  })

  it('extracts only current-turn memory deltas and keeps full retained facts as deduplication background', async () => {
    const mock = await endpoint([
      JSON.stringify({ candidates: [{ content: 'Prefers Chinese reports.', sourceMessageIds: ['message-3'] }] }),
      JSON.stringify({ candidates: [{ content: 'The old introduction is not a new fact.', sourceMessageIds: ['message-2'] }] }),
    ])
    const { ctx, additionalCalls } = await context(mock.url, { turnId: 'current', triggerMessageId: 'message-3' })
    ctx.messages = [
      message('OLD_USER_GREETING', 1, { turnId: 'old' }),
      message('OLD_SELF_INTRODUCTION_NEEDS_RESEARCH_TARGET', 2, { turnId: 'old', senderType: 'agent', senderId: 'agent-a' }),
      // Retry uses a new host turn even if its initiating message belongs to the earlier turn.
      message('Hello again. Please use Chinese for future reports.', 3, { turnId: 'retried-original' }),
      message('好的，以后的报告会用中文。', 4, { turnId: 'current', senderType: 'agent', senderId: 'agent-a' }),
      message('LATE_REPLY_FROM_OLD_TURN', 5, { turnId: 'old', senderType: 'agent', senderId: 'agent-a' }),
    ]
    ctx.memory = { namespace: 'agent-a:conversation', epoch: 4, entries: [
      { id: 'm1', ownerAgentId: 'agent-a', scope: 'conversation', conversationId: 'conversation', content: 'FULL_EXISTING_FACT_IN_BOOTSTRAP', sourceMessageIds: ['message-1'], sourceResourceIds: [], origin: 'model', version: 1, createdAt: '', updatedAt: '' },
      { id: 'm2', ownerAgentId: 'agent-a', scope: 'profile', content: 'FULL_EXISTING_FACT_OUTSIDE_BOOTSTRAP', sourceMessageIds: [], sourceResourceIds: [], origin: 'user', version: 1, createdAt: '', updatedAt: '' },
      { id: 'm3', ownerAgentId: 'agent-b', scope: 'conversation', conversationId: 'conversation', content: 'OTHER_EMPLOYEE_PRIVATE_FACT', sourceMessageIds: [], sourceResourceIds: [], origin: 'user', version: 1, createdAt: '', updatedAt: '' },
      { id: 'm4', ownerAgentId: 'agent-a', scope: 'conversation', conversationId: 'other', content: 'OTHER_CONVERSATION_PRIVATE_FACT', sourceMessageIds: [], sourceResourceIds: [], origin: 'user', version: 1, createdAt: '', updatedAt: '' },
    ] }
    ctx.bootstrap = { instructions: 'HOST_RULES\nExisting authorized memory: FULL_EXISTING_FACT_IN_BOOTSTRAP', hashes: {}, configVersion: 1, memoryVersion: 4, policyVersion: 2, sources: [] }
    const memoryBefore = structuredClone(ctx.memory)
    const engine = new MastraEngine()
    expect(await engine.extractMemory(ctx)).toEqual([{ content: 'Prefers Chinese reports.', sourceMessageIds: ['message-3'], sourceResourceIds: [] }])
    const payload = JSON.parse(mock.requests[0].messages.find(message => message.role === 'user')!.content as string)
    expect(payload.protocol).toBe('private-memory-delta-v1')
    expect(payload.data.currentTurn).toEqual({ id: 'current', rootMessageId: 'message-3' })
    expect(payload.data.currentTurnMessages.map((message: { id: string }) => message.id)).toEqual(['message-3', 'message-4'])
    expect(payload.data.additionalRetainedFacts).toEqual([{ id: 'm2', content: 'FULL_EXISTING_FACT_OUTSIDE_BOOTSTRAP' }])
    for (const fact of ['FULL_EXISTING_FACT_IN_BOOTSTRAP', 'FULL_EXISTING_FACT_OUTSIDE_BOOTSTRAP']) expect(allMessageText(mock.requests[0]).match(new RegExp(fact, 'g'))).toHaveLength(1)
    expect(allMessageText(mock.requests[0])).not.toMatch(/OLD_USER_GREETING|OLD_SELF_INTRODUCTION|LATE_REPLY_FROM_OLD_TURN|OTHER_EMPLOYEE_PRIVATE_FACT|OTHER_CONVERSATION_PRIVATE_FACT/)
    expect(mock.requests[0].tools ?? []).toHaveLength(0)
    await expect(engine.extractMemory(ctx)).rejects.toThrow('未授权或不存在的来源')
    expect(additionalCalls).toHaveLength(0)
    expect(ctx.memory).toEqual(memoryBefore)
  })

  it.each(['complete JSON with length finish', 'no visible text before length finish'])('repairs memory %s only with an accounted request and cumulative usage', async variant => {
    const firstCandidate = { content: 'REJECTED_LENGTH_RESULT', sourceMessageIds: ['message-1'] }
    const finalCandidate = { content: 'Prefers concise reports.', sourceMessageIds: ['message-1'] }
    const mock = await endpoint((_body, response, index) => {
      const text = index === 0 ? variant.startsWith('complete') ? JSON.stringify({ candidates: [firstCandidate] }) : '' : JSON.stringify({ candidates: [finalCandidate] })
      send(response, text, index, { prompt_tokens: 40, completion_tokens: index === 0 ? 6000 : 80, total_tokens: index === 0 ? 6040 : 120 }, index === 0 ? 'length' : 'stop')
    })
    const usages: ModelUsage[] = []
    const { ctx, additionalCalls, deltas, tools } = await context(mock.url, { onUsage: async usage => { usages.push(usage) } })
    ctx.messages = [message('I prefer concise reports.')]
    expect(await new MastraEngine().extractMemory(ctx)).toEqual([{ ...finalCandidate, sourceResourceIds: [] }])
    expect(additionalCalls).toHaveLength(1)
    expect(mock.requests).toHaveLength(2)
    expect(usages).toEqual([{ inputTokens: 40, outputTokens: 6000, totalTokens: 6040 }, { inputTokens: 80, outputTokens: 6080, totalTokens: 6160 }])
    const repair = JSON.parse(mock.requests[1].messages.find(message => message.role === 'user')!.content as string)
    expect(repair.repair.validationError).toContain('模型输出超过限制')
    expect(repair.repair.instruction).toContain('NOTHING from it was saved')
    expect(mock.requests.every(request => (request.max_tokens ?? request.max_completion_tokens) === 6000)).toBe(true)
    expect(deltas).toHaveLength(0)
    expect(tools).toHaveLength(0)
  })

  it.each(['Here are the memories.', '{"candidates":[{"content":"Incomplete source fields"}]}'])('repairs malformed memory protocol without fabricating facts: %s', async invalid => {
    const mock = await endpoint([invalid, '```json\n{"candidates":[{"content":"Deadline is Friday.","sourceMessageIds":["message-1"]}]}\n```'])
    const { ctx, additionalCalls } = await context(mock.url)
    ctx.messages = [message('The deadline is Friday.')]
    expect(await new MastraEngine().extractMemory(ctx)).toEqual([{ content: 'Deadline is Friday.', sourceMessageIds: ['message-1'], sourceResourceIds: [] }])
    expect(additionalCalls).toHaveLength(1)
    expect(mock.requests).toHaveLength(2)
  })

  it.each(['missing callback', 'exhausted budget', 'cancel during reservation', 'cancel from usage'])('does not accept truncated memory or spend another request when %s', async condition => {
    const mock = await endpoint((_body, response, index) => send(response, '{"candidates":[{"content":"TRUNCATED_FACT","sourceMessageIds":["message-1"]}]}', index, { prompt_tokens: 10, completion_tokens: 6000, total_tokens: 6010 }, 'length'))
    const { ctx, controller } = await context(mock.url)
    let reservations = 0
    const usages: ModelUsage[] = []
    ctx.onAdditionalModelCall = condition === 'missing callback' ? undefined : async () => {
      reservations++
      if (condition === 'exhausted budget') throw new Error('MODEL_CALL_BUDGET_EXHAUSTED')
      controller.abort(new Error('CANCELLED_DURING_RESERVATION'))
    }
    ctx.onUsage = async usage => {
      usages.push(usage)
      if (condition === 'cancel from usage') controller.abort(new Error('TOKEN_BUDGET_EXHAUSTED'))
    }
    const expected = condition === 'missing callback' ? '未提供协议修复预算' : condition === 'exhausted budget' ? 'MODEL_CALL_BUDGET_EXHAUSTED' : condition === 'cancel from usage' ? 'TOKEN_BUDGET_EXHAUSTED' : 'CANCELLED_DURING_RESERVATION'
    await expect(new MastraEngine().extractMemory(ctx)).rejects.toThrow(expected)
    expect(mock.requests).toHaveLength(1)
    expect(reservations).toBe(condition === 'missing callback' || condition === 'cancel from usage' ? 0 : 1)
    expect(usages).toEqual([{ inputTokens: 10, outputTokens: 6000, totalTokens: 6010 }])
  })

  it('stops after one memory repair and never returns incomplete candidates or changes existing memory', async () => {
    const mock = await endpoint((_body, response, index) => send(response, '{"candidates":[{"content":"DO_NOT_SAVE","sourceMessageIds":["message-1"]}]}', index, undefined, 'length'))
    const { ctx, additionalCalls } = await context(mock.url)
    ctx.memory = { namespace: 'agent-a:conversation', epoch: 7, entries: [{ id: 'kept', ownerAgentId: 'agent-a', scope: 'conversation', conversationId: 'conversation', content: 'Retain this actual fact.', sourceMessageIds: ['message-1'], sourceResourceIds: [], origin: 'model', version: 1, createdAt: '', updatedAt: '' }] }
    const before = structuredClone(ctx.memory)
    await expect(new MastraEngine().extractMemory(ctx)).rejects.toThrow('连续两次未返回完整有效的记忆候选')
    expect(mock.requests).toHaveLength(2)
    expect(additionalCalls).toHaveLength(1)
    expect(ctx.memory).toEqual(before)
  })

  it('uses native bound skills, searches actual knowledge with citations, writes and reads a real artifact', async () => {
    const mock = await endpoint([
      { name: 'skill', args: { name: 'research-note' } },
      { name: 'skill_read', args: { skillName: 'research-note', path: 'scripts/create.sh' } },
      { name: 'search_knowledge', args: { query: 'Orion' } },
      { name: 'write_file', args: { path: 'self:/runs/run-1/report.md', content: '# Orion\nLaunch is Friday.' } },
      { name: 'read_file', args: { path: 'self:/runs/run-1/report.md' } },
      'The report is ready.',
    ])
    const { ctx, directory, tools } = await context(mock.url)
    const skills = path.join(directory, 'skills', 'opaque-resource-id', 'research-note')
    await mkdir(path.join(skills, 'scripts'), { recursive: true })
    await writeFile(path.join(skills, 'SKILL.md'), '---\nname: research-note\ndescription: Research Orion and produce a report\n---\nUse search_knowledge, cite sources, then write a report.\n')
    await writeFile(path.join(skills, 'scripts/create.sh'), 'printf "Skill script read successfully"\n')
    const knowledge = path.join(directory, 'orion.md')
    await writeFile(knowledge, '# Orion\nLaunch is Friday.\n')
    ctx.agent.skillIds = ['skill-1']; ctx.agent.knowledgeIds = ['knowledge-1']
    ctx.conversation.sharedKnowledgeIds = ['knowledge-1'] // Group knowledge requires both grants.
    ctx.resources = [
      { id: 'skill-1', kind: 'skill', name: 'Research', description: '', path: skills, createdAt: '' },
      { id: 'knowledge-1', kind: 'knowledge', name: 'Orion facts', description: '', path: knowledge, createdAt: '' },
      { id: 'unbound', kind: 'skill', name: 'Private skill', description: '', path: '/does-not-exist', createdAt: '' },
    ]
    await new MastraEngine().run(ctx)
    expect(mock.requests[0].tools?.map(tool => tool.function.name)).toContain('skill')
    expect(allMessageText(mock.requests[0])).toContain('research-note')
    expect(allMessageText(mock.requests[0])).not.toContain('Private skill')
    expect(toolResultText(mock.requests[1])).toContain('Use search_knowledge')
    expect(toolResultText(mock.requests[2])).toContain('Skill script read successfully')
    expect(toolResultText(mock.requests[3])).toContain('Launch is Friday')
    expect(toolResultText(mock.requests[3])).toContain('citation')
    expect(await readFile(path.join(ctx.workspace!.root, 'runs/run-1/report.md'), 'utf8')).toBe('# Orion\nLaunch is Friday.')
    expect(tools.filter(event => event.status === 'completed').map(event => event.name)).toEqual(['skill', 'skill_read', 'search_knowledge', 'write_file', 'read_file'])
  })

  it('rejects traversal and symlink escapes through file tools', async () => {
    const mock = await endpoint([
      { name: 'read_file', args: { path: 'self:/../outside.txt' } },
      { name: 'read_file', args: { path: 'self:/work/escape/private.txt' } },
      { name: 'write_file', args: { path: 'self:/work/escape/new.txt', content: 'must not write' } },
      'Access rejected.',
    ])
    const { ctx, directory, tools } = await context(mock.url)
    await mkdir(ctx.workspace!.workPath, { recursive: true })
    const outside = path.join(directory, 'outside')
    await mkdir(outside)
    await writeFile(path.join(outside, 'private.txt'), 'SECRET OUTSIDE WORKSPACE')
    await symlink(outside, path.join(ctx.workspace!.workPath, 'escape'))
    await new MastraEngine().run(ctx)
    expect(toolResultText(mock.requests[1])).toContain('relative path')
    expect(toolResultText(mock.requests[2])).not.toContain('SECRET OUTSIDE WORKSPACE')
    await expect(readFile(path.join(outside, 'new.txt'))).rejects.toThrow()
    expect(tools.filter(event => event.status === 'failed')).toHaveLength(3)
  })

  it('executes a skill script only after approval, in its run directory, without model credentials', async () => {
    let command = ''
    const mock = await endpoint((_body, response, index) => {
      if (index === 0) send(response, { name: 'execute_command', args: { command } }, index)
      else send(response, 'Executed after approval.', index)
    })
    const { ctx, approvals, directory } = await context(mock.url)
    const skill = path.join(directory, 'skills', 'opaque-maker-id', 'artifact-maker')
    await mkdir(path.join(skill, 'scripts'), { recursive: true })
    await writeFile(path.join(skill, 'SKILL.md'), '---\nname: artifact-maker\ndescription: Create a report artifact\n---\nRun scripts/create.sh after approval.\n')
    await writeFile(path.join(skill, 'scripts/create.sh'), 'printf "artifact" > result.txt; printf "%s" "$OPENAI_API_KEY"\n')
    command = `sh '${path.join(skill, 'scripts/create.sh')}'`
    ctx.agent.skillIds = ['maker']
    ctx.resources = [{ id: 'maker', kind: 'skill', name: 'Maker', description: '', path: skill, createdAt: '' }]
    ctx.agent.allowCommands = true
    const before = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = 'do-not-inherit-this-key'
    try {
      await new MastraEngine().run(ctx)
      expect(approvals).toHaveLength(1)
      expect(approvals[0]).toBe(command)
      expect(await readFile(path.join(ctx.workspace!.root, 'runs/run-1/result.txt'), 'utf8')).toBe('artifact')
      expect(toolResultText(mock.requests[1])).not.toContain('do-not-inherit-this-key')
    } finally {
      if (before === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = before
    }
  })

  it('does not run declined commands', async () => {
    const mock = await endpoint([{ name: 'execute_command', args: { command: 'touch refused.txt' } }, 'Declined.'])
    const { ctx } = await context(mock.url, { approveCommand: async () => false })
    ctx.agent.allowCommands = true
    await new MastraEngine().run(ctx)
    expect(toolResultText(mock.requests[1])).toContain('User declined')
    await expect(readFile(path.join(ctx.workspace!.root, 'runs/run-1/refused.txt'))).rejects.toThrow()
  })

  it('cancels pending approval without executing a late approval', async () => {
    const mock = await endpoint([{ name: 'execute_command', args: { command: 'touch late.txt' } }, 'Done.'])
    let resolveApproval: (approved: boolean) => void = () => {}
    let approvalReached: () => void = () => {}
    const reached = new Promise<void>(resolve => { approvalReached = resolve })
    const { ctx, controller } = await context(mock.url, { approveCommand: () => { approvalReached(); return new Promise(resolve => { resolveApproval = resolve }) } })
    ctx.agent.allowCommands = true
    const run = new MastraEngine().run(ctx)
    await reached
    controller.abort()
    resolveApproval(true)
    await expect(run).rejects.toThrow('取消')
    await expect(readFile(path.join(ctx.workspace!.root, 'runs/run-1/late.txt'))).rejects.toThrow()
  })

  it('bounds host command execution time', async () => {
    const mock = await endpoint([{ name: 'execute_command', args: { command: 'sleep 10; touch too-late.txt' } }, 'Command failed.'])
    const { ctx } = await context(mock.url)
    ctx.agent.allowCommands = true
    await new MastraEngine({ commandTimeoutMs: 40 }).run(ctx)
    expect(toolResultText(mock.requests[1])).toContain('Command timed out')
    await expect(readFile(path.join(ctx.workspace!.root, 'runs/run-1/too-late.txt'))).rejects.toThrow()
  })

  it('decides only its own participation with its own model and validates dependency references', async () => {
    const mock = await endpoint([
      '{"action":"reply","responseKind":"chat","purpose":"Say hello","observedThroughSequence":1}',
      '{"action":"wait","responseKind":"task","proposedContribution":{"key":"main","purpose":"Write summary"},"dependsOnContributions":[{"agentId":"agent-b","key":"main"}],"observedThroughSequence":1}',
      '{"action":"wait","dependencyMessageIds":["future-message"],"observedThroughSequence":1}',
      '{"action":"wait","dependencyMessageIds":["future-message"],"observedThroughSequence":1}',
      '{"action":"request_handoff","recipientAgentIds":["stranger"],"observedThroughSequence":1}',
      '{"action":"request_handoff","recipientAgentIds":["stranger"],"observedThroughSequence":1}',
    ])
    const { ctx } = await context(mock.url)
    ctx.members = [employee(), employee({ id: 'agent-b', name: 'Bob', role: 'Writer' })]
    const engine = new MastraEngine()
    expect(await engine.decide(ctx)).toMatchObject({ action: 'reply', responseKind: 'chat' })
    expect(mock.requests[0].model).toBe('user-model-override')
    expect(mock.requests[0].tools ?? []).toHaveLength(0)
    expect(await engine.decide(ctx)).toMatchObject({ action: 'wait', dependsOnContributions: [{ agentId: 'agent-b', key: 'main' }] })
    await expect(engine.decide(ctx)).rejects.toThrow('尚不存在')
    await expect(engine.decide(ctx)).rejects.toThrow('接续对象无效')
  })

  it('repairs a prose decision once without publishing it, using a private schema request and cumulative usage', async () => {
    const mock = await endpoint((_body, response, index) => send(response, index === 0 ? '您好！我是研究员，很高兴认识您。' : '{"action":"reply","responseKind":"chat","purpose":"以我的身份简短问候"}', index, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }))
    const usages: ModelUsage[] = []
    const { ctx, deltas, tools, additionalCalls } = await context(mock.url, { onUsage: async usage => { usages.push(usage) } })
    ctx.messages = [message('你们好'), message('您好，我是写手。', 2, { senderType: 'agent', senderId: 'agent-b' }), message('我之前写的普通公开回复', 3, { senderType: 'agent', senderId: 'agent-a' })]
    ctx.triggerMessageId = 'message-1'
    ctx.participation = { isFirstDecision: true, hasRespondedInTurn: false, triggerEventType: 'user_message', eventMessageId: 'message-1', observedThroughSequence: 7 }
    expect(await new MastraEngine().decide(ctx)).toMatchObject({ action: 'reply', responseKind: 'chat', observedThroughSequence: 7 })
    expect(mock.requests).toHaveLength(2)
    expect(additionalCalls).toHaveLength(1)
    expect(usages).toEqual([{ inputTokens: 10, outputTokens: 5, totalTokens: 15 }, { inputTokens: 20, outputTokens: 10, totalTokens: 30 }])
    for (const request of mock.requests) {
      expect(request.messages.map(message => message.role)).toEqual(['system', 'user'])
      expect(request.tools ?? []).toHaveLength(0)
      const payload = JSON.parse(request.messages[1].content as string)
      expect(payload.jsonSchema.required).toEqual(['action'])
      expect(payload.jsonSchema.properties).not.toHaveProperty('observedThroughSequence')
      expect(payload.data.participation).toMatchObject({ isFirstDecision: true, hasRespondedInTurn: false, triggerEventType: 'user_message' })
      expect(payload.data.currentTurnMessages).toHaveLength(3)
    }
    expect(JSON.parse(mock.requests[1].messages[1].content as string).repair.invalidOutput).toContain('您好')
    expect(deltas).toEqual([])
    expect(tools).toEqual([])
  })

  it('separates earlier greetings and self-introductions from the new user turn without forcing a reply', async () => {
    const mock = await endpoint(['{"action":"reply","responseKind":"chat"}', '{"action":"pass"}'])
    const { ctx } = await context(mock.url)
    ctx.turnId = 'new-turn'; ctx.triggerMessageId = 'message-5'
    ctx.messages = [
      message('你们好', 1, { turnId: 'old-turn-1' }),
      message('旧的第一次自我介绍，必须提供工作主题才可以开始研究。', 2, { turnId: 'old-turn-1', senderType: 'agent', senderId: 'agent-a' }),
      message('你们好', 3, { turnId: 'old-turn-2' }),
      message('旧的第二次自我介绍，等待具体任务。', 4, { turnId: 'old-turn-2', senderType: 'agent', senderId: 'agent-a' }),
      message('你们好', 5, { turnId: 'new-turn' }),
      message('我先问候了。', 6, { turnId: 'new-turn', senderType: 'agent', senderId: 'agent-b' }),
    ]
    ctx.participation = { isFirstDecision: false, hasRespondedInTurn: false, triggerEventType: 'agent_message', eventMessageId: 'message-6', observedThroughSequence: 6 }
    ctx.bootstrap = { instructions: '历史记忆：我以前介绍过自己的研究职责，研究任务需要主题。', hashes: {}, configVersion: 1, memoryVersion: 1, policyVersion: 2, sources: [] }
    const engine = new MastraEngine()
    expect(await engine.decide(ctx)).toMatchObject({ action: 'reply', observedThroughSequence: 6 })
    const payload = JSON.parse(mock.requests[0].messages[1].content as string).data
    expect(payload.currentTurn).toMatchObject({ id: 'new-turn', rootMessageId: 'message-5', rootSequence: 5, ownCompletedMessageIds: [] })
    expect(payload.currentTurnMessages.map((item: Message) => item.id)).toEqual(['message-5', 'message-6'])
    expect(payload.currentTurnMessages[0]).toMatchObject({ turnId: 'new-turn', sequence: 5, isRootRequest: true })
    expect(payload.historicalBackground.map((item: Message) => item.id)).toEqual(['message-1', 'message-2', 'message-3', 'message-4'])
    expect(payload.participation.hasRespondedInTurn).toBe(false)
    expect(await engine.decide(ctx)).toMatchObject({ action: 'pass' })
  })

  it('uses the actual retry turn id instead of treating the old trigger and its replies as current', async () => {
    const mock = await endpoint(['{"action":"reply","responseKind":"chat"}'])
    const { ctx } = await context(mock.url)
    ctx.turnId = 'retry-turn'; ctx.triggerMessageId = 'message-1'
    ctx.messages = [message('请再次说一下。', 1, { turnId: 'old-turn' }), message('OLD_REPLY', 2, { turnId: 'old-turn', senderType: 'agent', senderId: 'agent-a' }), message('LEGACY_REPLY_WITHOUT_TURN', 3, { senderType: 'agent', senderId: 'agent-a' }), message('NEW_TEAMMATE_REPLY', 4, { turnId: 'retry-turn', senderType: 'agent', senderId: 'agent-b' })]
    ctx.participation = { isFirstDecision: true, hasRespondedInTurn: false, triggerEventType: 'user_message', observedThroughSequence: 4 }
    await new MastraEngine().decide(ctx)
    const payload = JSON.parse(mock.requests[0].messages[1].content as string).data
    expect(payload.currentTurn).toMatchObject({ id: 'retry-turn', rootMessageId: 'message-1', ownCompletedMessageIds: [] })
    expect(payload.currentTurnMessages.map((item: Message) => item.id)).toEqual(['message-1', 'message-4'])
    expect(payload.historicalBackground.map((item: Message) => item.id)).toEqual(['message-2', 'message-3'])
  })

  it('keeps current-turn own replies identifiable while older and overlapping previous-turn replies stay background', async () => {
    const mock = await endpoint(['{"action":"pass"}'])
    const { ctx } = await context(mock.url)
    ctx.turnId = 'current-turn'; ctx.triggerMessageId = 'message-3'
    ctx.messages = [message('old request', 1, { turnId: 'old-turn' }), message('old own answer', 2, { turnId: 'old-turn', senderType: 'agent', senderId: 'agent-a' }), message('new greeting', 3, { turnId: 'current-turn' }), message('late old-turn result', 4, { turnId: 'old-turn', senderType: 'agent', senderId: 'agent-a' }), message('current own greeting', 5, { turnId: 'current-turn', senderType: 'agent', senderId: 'agent-a' })]
    ctx.participation = { isFirstDecision: false, hasRespondedInTurn: true, triggerEventType: 'agent_message', observedThroughSequence: 5 }
    await new MastraEngine().decide(ctx)
    const payload = JSON.parse(mock.requests[0].messages[1].content as string).data
    expect(payload.currentTurn.ownCompletedMessageIds).toEqual(['message-5'])
    expect(payload.currentTurnMessages.map((item: Message) => item.id)).toEqual(['message-3', 'message-5'])
    expect(payload.historicalBackground.map((item: Message) => item.id)).toEqual(['message-1', 'message-2', 'message-4'])
  })

  it('does not replay old verbose introductions as assistant-role examples for a new chat response', async () => {
    const mock = await endpoint(['你好！'])
    const { ctx, deltas } = await context(mock.url, { responseKind: 'chat' })
    ctx.turnId = 'new-turn'; ctx.triggerMessageId = 'message-3'
    ctx.messages = [message('详细介绍所有工具，再追问工作素材。', 1, { turnId: 'old-turn' }), message('OLD_VERBOSE_SELF_INTRODUCTION_AND_WORK_QUESTION', 2, { turnId: 'old-turn', senderType: 'agent', senderId: 'agent-a' }), message('你们好', 3, { turnId: 'new-turn' })]
    await new MastraEngine().run(ctx)
    expect(mock.requests[0].messages.filter(message => message.role === 'assistant')).toEqual([])
    expect(allMessageText(mock.requests[0])).toContain('HISTORICAL BACKGROUND FROM OTHER TURNS')
    expect(allMessageText(mock.requests[0])).toContain('CURRENT TURN USER REQUEST')
    expect(allMessageText(mock.requests[0])).toContain('OLD_VERBOSE_SELF_INTRODUCTION_AND_WORK_QUESTION')
    expect(mock.requests[0].tools ?? []).toHaveLength(0)
    expect(deltas.join('')).toBe('你好！')
  })

  it.each([
    '{"action":"reply","responseKind":"chat"}',
    '```json\n{"action":"reply","responseKind":"chat"}\n```',
    '{"action":"reply","responseKind":"chat","observedThroughSequence":999}',
  ])('binds infrastructure fields to the host snapshot without asking the model to provide them: %s', async reply => {
    const mock = await endpoint([reply])
    const { ctx, additionalCalls } = await context(mock.url)
    ctx.participation = { isFirstDecision: true, hasRespondedInTurn: false, triggerEventType: 'user_message', observedThroughSequence: 12 }
    expect(await new MastraEngine().decide(ctx)).toMatchObject({ action: 'reply', observedThroughSequence: 12 })
    expect(additionalCalls).toEqual([])
  })

  it('repairs missing action but never infers reply from ordinary text or uses a fixed greeting fallback', async () => {
    const mock = await endpoint(['{"responseKind":"chat"}', '{"action":"pass"}', '您好', '还是您好'])
    const { ctx, additionalCalls, deltas } = await context(mock.url)
    const engine = new MastraEngine()
    expect(await engine.decide(ctx)).toMatchObject({ action: 'pass' })
    await expect(engine.decide(ctx)).rejects.toThrow('连续两次')
    expect(mock.requests).toHaveLength(4)
    expect(additionalCalls).toHaveLength(2)
    expect(deltas).toEqual([])
  })

  it('does not make a repair request after the host rejects its call budget or cancels the turn', async () => {
    const mock = await endpoint(['你好', '{"action":"reply"}'])
    const { ctx } = await context(mock.url, { onAdditionalModelCall: async () => { throw new Error('本轮判断调用预算已用尽') } })
    await expect(new MastraEngine().decide(ctx)).rejects.toThrow('预算已用尽')
    expect(mock.requests).toHaveLength(1)
    const stopped = await endpoint(['你好', '{"action":"reply"}'])
    const fixture = await context(stopped.url)
    fixture.ctx.onAdditionalModelCall = async () => { fixture.controller.abort() }
    await expect(new MastraEngine().decide(fixture.ctx)).rejects.toThrow('判断已取消')
    expect(stopped.requests).toHaveLength(1)
  })

  it('honors usage cancellation after invalid output and does not retry network/authentication failures', async () => {
    const mock = await endpoint((_body, response, index) => send(response, '你好', index, { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }))
    const { ctx, controller, additionalCalls } = await context(mock.url)
    ctx.onUsage = async () => { controller.abort() }
    await expect(new MastraEngine().decide(ctx)).rejects.toThrow('判断已取消')
    expect(mock.requests).toHaveLength(1)
    expect(additionalCalls).toEqual([])
    const bad = await endpoint((_body, response) => { response.writeHead(401, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: 'Bad fixture-secret', type: 'authentication_error' } })) })
    const badFixture = await context(bad.url)
    await expect(new MastraEngine().decide(badFixture.ctx)).rejects.toThrow('[redacted]')
    expect(bad.requests).toHaveLength(1)
    expect(badFixture.additionalCalls).toEqual([])
  })

  it('tests a real connection and reports sanitized failures and timeouts', async () => {
    const good = await endpoint(['OK'])
    expect(await new MastraEngine().test(connection(good.url), 'fixture-secret')).toBe('OK')
    expect(good.requests[0].model).toBe('user-specified-model')
    const bad = await endpoint((_body, response) => { response.writeHead(401, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: 'Invalid fixture-secret', type: 'authentication_error' } })) })
    await expect(new MastraEngine().test(connection(bad.url), 'fixture-secret')).rejects.toThrow('[redacted]')
    const hanging = await endpoint(() => {})
    await expect(new MastraEngine({ connectionTimeoutMs: 50 }).test(connection(hanging.url), 'fixture-secret')).rejects.toThrow('超时')
  })

  it('allows a compatible local endpoint without a key and never falls back to process credentials', async () => {
    const mock = await endpoint(['OK'])
    const before = process.env.OPENAI_API_KEY
    process.env.OPENAI_API_KEY = 'ambient-secret-must-not-be-used'
    try {
      expect(await new MastraEngine().test(connection(mock.url), '')).toBe('OK')
      expect(mock.headers[0]).not.toContain('ambient-secret')
      await expect(new MastraEngine().test({ ...connection(mock.url), provider: 'openai' }, '')).rejects.toThrow('API Key')
      await expect(new MastraEngine().test({ ...connection(mock.url), provider: 'anthropic' }, '')).rejects.toThrow('API Key')
    } finally {
      if (before === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = before
    }
  })

  it('uses the Anthropic messages protocol with the explicitly configured base URL and key', async () => {
    let auth = '', requestPath = '', requestedModel = ''
    const server = createServer(async (request, response) => {
      auth = String(request.headers['x-api-key'] ?? '')
      requestPath = request.url ?? ''
      let body = ''
      for await (const chunk of request) body += chunk
      requestedModel = JSON.parse(body).model
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const event = (type: string, value: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`)
      event('message_start', { message: { id: 'anthropic-fixture', type: 'message', role: 'assistant', content: [], model: requestedModel, stop_reason: null, stop_sequence: null, usage: { input_tokens: 5, output_tokens: 0 } } })
      event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } })
      event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: 'OK' } })
      event('content_block_stop', { index: 0 })
      event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } })
      event('message_stop', {})
      response.end()
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Server did not start')
    cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
    const config = { ...connection(`http://127.0.0.1:${address.port}/v1`), provider: 'anthropic' as const }
    expect(await new MastraEngine().test(config, 'anthropic-fixture-key')).toBe('OK')
    expect(auth).toBe('anthropic-fixture-key')
    expect(requestPath).toBe('/v1/messages')
    expect(requestedModel).toBe(config.defaultModel)
  })

  it('stops an approved command that exceeds its output bound', async () => {
    const mock = await endpoint([{ name: 'execute_command', args: { command: 'yes output' } }, 'Output limit reached.'])
    const { ctx } = await context(mock.url)
    ctx.agent.allowCommands = true
    await new MastraEngine().run(ctx)
    expect(toolResultText(mock.requests[1])).toContain('output exceeded')
    expect(toolResultText(mock.requests[1]).length).toBeLessThan(5000)
  })
})

describe('projectMessages', () => {
  it('does not mutate the stored transcript', () => {
    const messages = [message('second', 2), message('first', 1)]
    expect(projectMessages(messages, 'agent-a', 'conversation').map(message => message.content)).toEqual(['first', 'second'])
    expect(messages.map(message => message.sequence)).toEqual([2, 1])
  })
})
