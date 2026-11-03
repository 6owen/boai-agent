/*
 * [INPUT]: Installed Mastra/LibSQL, the production memory bridge and engine, isolated transcripts and a controlled HTTP provider.
 * [OUTPUT]: Cold-start official recall guidance, unchanged thresholds, cross-thread tool round trip and autonomous no-tool replies.
 * [POS]: Recall integration regressions; real-model behavioral comparisons are recorded separately.
 * [PROTOCOL]: Update this Header and tests/.folder.md on change.
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ServerResponse } from 'node:http'
import { EmployeeConversationMemory, boboRecallGuidance, memoryResourceId } from '../packages/runtime/src/adapters/mastra/conversation-memory'
import { MastraEngine } from '../packages/runtime/src/adapters/mastra/engine'
import type { EngineContext } from '../packages/runtime/src/contracts'
import type { Message } from '../packages/shared/src/domain'
import { teamEndpoint, sendTeamOutput } from './fixtures/team-planner'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
async function fixture(agentId = 'bobo') {
  const root = await mkdtemp(join(tmpdir(), 'boai-recall-guidance-'))
  cleanup.push(() => rm(root, { recursive: true, force: true }))
  const message = (id: string, conversationId: string, content: string): Message => ({ id, conversationId, content, sequence: 1, senderType: 'user', senderId: 'user', senderName: '用户', status: 'completed', createdAt: '2026-11-03T00:00:00Z', turnId: id })
  const old = message('old-source', 'old-room', '我周三上午九点半去体检。'), current = message('current-request', 'new-room', '你知道我什么时候体检吗？')
  const context: EngineContext = {
    agent: { id: agentId, configVersion: 1, systemRole: agentId === 'bobo' ? 'core' : undefined, name: agentId, role: '助手', instructions: '', color: '#112233', connectionId: 'c', modelId: 'test', skillIds: [], knowledgeIds: [], allowCommands: false, active: true },
    conversation: { id: 'new-room', kind: 'direct', purpose: 'core', title: '新会话', agentIds: [agentId], mode: 'natural', workspacePath: root, sharedKnowledgeIds: [], createdAt: '', updatedAt: '' },
    connection: { id: 'c', name: 'local', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'test', hasApiKey: false }, apiKey: '',
    resources: [], messages: [current], runId: 'recall-run', turnId: current.turnId, triggerMessageId: current.id, responseKind: 'chat', signal: new AbortController().signal,
    workspace: { root, workPath: root, runPath: root, sharedPath: root }, onDelta: async () => {}, onTool: async () => {}, approveCommand: async () => false,
    onAdditionalModelCall: async () => crypto.randomUUID(),
    memorySources: async () => ({ resourceId: memoryResourceId(agentId), threads: [{ conversationId: 'old-room', title: '旧会话', messages: [old] }, { conversationId: 'new-room', title: '新会话', messages: [current] }] }),
  }
  return { root, context }
}

it('supplies cold-start guidance without creating OM or loading other threads and preserves thresholds and read-only tools', async () => {
  const f = await fixture(), bridge = new EmployeeConversationMemory(join(f.root, 'memory.db'))
  cleanup.push(() => bridge.close())
  const prepared = await bridge.prepare(f.context), om = (await prepared.memory.omEngine)!
  const record = await om.getRecord(prepared.option.thread, prepared.option.resource)
  expect(record).toBeNull()
  expect(prepared.recallInstructions).toContain(boboRecallGuidance)
  expect((await prepared.memory.getContext({ threadId: prepared.option.thread, resourceId: prepared.option.resource })).hasObservations).toBe(false)
  expect(JSON.stringify((await prepared.memory.getContext({ threadId: prepared.option.thread, resourceId: prepared.option.resource })).messages)).not.toContain('周三上午九点半')
  await om.getOrCreateRecord(prepared.option.thread, prepared.option.resource)
  const warm = await bridge.prepare(f.context)
  expect(warm.recallInstructions).toBeUndefined()
  expect(await om.buildContextSystemMessage({ threadId: prepared.option.thread, resourceId: prepared.option.resource })).toContain(boboRecallGuidance)
  expect(prepared.memory.getMergedThreadConfig({}).observationalMemory).toMatchObject({ observation: { messageTokens: 6000 }, reflection: { observationTokens: 12000 } })
  expect(prepared.option.options.readOnly).toBe(true)
  expect(Object.keys(prepared.memory.listTools({ readOnly: true }))).toEqual(['recall'])
})

it('does not extend the Bobo bootstrap to ordinary employees or retrieval-disabled stages', async () => {
  for (const id of ['writer', 'bobo']) {
    const f = await fixture(id), bridge = new EmployeeConversationMemory(join(f.root, 'memory.db'))
    cleanup.push(() => bridge.close())
    if (id === 'bobo') f.context.work = { organization: { mode: 'organize_only' } } as EngineContext['work']
    const prepared = await bridge.prepare(f.context), om = (await prepared.memory.omEngine)!
    expect(await om.getRecord(prepared.option.thread, prepared.option.resource)).toBeNull()
    expect(prepared.recallInstructions).toBeUndefined()
    if (id === 'bobo') expect(prepared.memory.listTools({ readOnly: true }).recall).toBeUndefined()
  }
})

function sendTool(response: ServerResponse, args: object, index: number) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  for (const [delta, finish_reason] of [[{ role: 'assistant', tool_calls: [{ index: 0, id: `recall-${index}`, type: 'function', function: { name: 'recall', arguments: JSON.stringify(args) } }] }, null], [{}, 'tool_calls']] as const) response.write(`data: ${JSON.stringify({ id: `reply-${index}`, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
  response.end('data: [DONE]\n\n')
}

it.each(['history', 'clarification', 'ordinary'] as const)('injects actual model instructions while preserving autonomous %s replies', async kind => {
  const f = await fixture(), toolEvents: { name: string; status: string }[] = [], answers: string[] = []
  if (kind === 'ordinary') f.context.messages[0].content = '17乘以6是多少？'
  if (kind === 'clarification') f.context.decision = { action: 'ask', responseKind: 'chat', observedThroughSequence: 1 }
  const endpoint = await teamEndpoint((body, response, index) => {
    const tools = body.tools as { function: { name: string } }[]
    expect(tools.some(tool => tool.function.name === 'recall')).toBe(true)
    expect(body.tool_choice === undefined || body.tool_choice === 'auto').toBe(true)
    const messages = body.messages as { role: string; content: string }[]
    const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
    expect(system).toContain(boboRecallGuidance)
    const results = messages.filter(message => message.role === 'tool')
    if (!results.length) expect(JSON.stringify(messages)).not.toContain('周三上午九点半')
    if (kind === 'ordinary') return sendTeamOutput(response, '102')
    if (!results.length) return sendTool(response, { mode: 'threads', limit: 5 }, index)
    if (results.length === 1) {
      expect(results[0].content).toContain('employee:bobo:thread:old-room')
      return sendTool(response, { mode: 'messages', threadId: 'employee:bobo:thread:old-room', detail: 'high', limit: 5 }, index)
    }
    expect(results.at(-1)!.content).toContain('周三上午九点半')
    expect(results.at(-1)!.content).toContain('old-source')
    sendTeamOutput(response, '你周三上午九点半体检。')
  })
  cleanup.push(() => endpoint.close())
  f.context.connection!.baseUrl = endpoint.url
  f.context.onTool = async event => { toolEvents.push(event) }
  f.context.onDelta = async text => { answers.push(text) }
  const engine = new MastraEngine({ memoryPath: join(f.root, 'memory.db') })
  cleanup.push(() => engine.closeMemory())
  await engine.run(f.context)
  expect(endpoint.requests).toHaveLength(kind === 'ordinary' ? 1 : 3)
  expect(toolEvents.filter(event => event.status === 'completed')).toHaveLength(kind === 'ordinary' ? 0 : 2)
  expect(answers.join('')).toContain(kind === 'ordinary' ? '102' : '周三上午九点半')
})
