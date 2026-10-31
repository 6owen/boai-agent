/*
 * [OUTPUT]: 2026-10-30 回归更新为Mastra官方记忆/原生归属合同；保留来源、调用预算和业务发布断言。
 * [INPUT]: 官方 DeepSeek Chat 宿主公开历史、实际 Mastra SDK、本地 HTTP/SSE 工具轮与浏览器 PNG。
 * [OUTPUT]: 初始历史准确归属且不伪造思考/授权；普通chat带工具的实际HTTP回归，原多工具思考/PNG/无工具边界保持。
 * [POS]: 模型兼容业务不变量；全部离线协议调用，不计真实供应商或人工质量通过。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createServer, type ServerResponse } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, test, vi } from 'vitest'
import { deepseekReasoningHistory } from '../packages/runtime/src/adapters/mastra/deepseek-reasoning-model'
import { MastraEngine } from '../packages/runtime/src/adapters/mastra/engine'
import type { EngineContext } from '../packages/runtime/src/contracts'
import type { Connection, DigitalAgent, Message } from '../packages/shared/src/domain'
import type { BrowserSession } from '../packages/runtime/src/modules/browser/session'
import type { TraceSpan } from '../packages/shared/src/domain/traces'

type WireMessage = { role: string; content: unknown; reasoning_content?: string; tool_call_id?: string; tool_calls?: { id: string; type: string; function: { name: string; arguments: string } }[] }
type WireRequest = { model: string; messages: WireMessage[]; tools: { type: string; function: { name: string } }[]; thinking?: { type: string }; reasoning_effort?: string; max_tokens?: number }
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const close of cleanup.splice(0).reverse()) await close() })
const official: Connection = { id: 'fixture', name: 'DeepSeek protocol', provider: 'openai-compatible', api: 'chat', baseUrl: 'https://api.deepseek.com/v1', defaultModel: 'deepseek-flash', hasApiKey: true }
const employee: DigitalAgent = { id: 'bobo', systemRole: 'core', name: 'bobo', role: '系统助手', instructions: 'Use actual tools for the approved task.', color: '#000000', connectionId: official.id, modelId: 'deepseek-flash', thinkingLevel: 'low', skillIds: [], knowledgeIds: [], allowCommands: false, allowBrowser: false, active: true, configVersion: 1 }
const announcement: Message = { id: 'actual-announcement', conversationId: 'group', senderType: 'agent', senderId: 'bobo', senderName: 'bobo', content: '我已在本群说明研究任务与分工。这是已发布公告，没有供应商思考字段。', sequence: 1, createdAt: '2026-10-02T00:00:00.000Z', status: 'completed' }

function initial(overrides: Partial<Parameters<typeof deepseekReasoningHistory>[0]> = {}) { return { connection: official, modelId: employee.modelId, thinkingLevel: employee.thinkingLevel, hasTools: true, agentId: employee.id, conversationId: announcement.conversationId, messages: [announcement], projected: [{ role: 'assistant' as const, content: announcement.content }], ...overrides } }
test('published employee prose is exact source-attributed reference, never a fabricated reasoning turn or user permission', () => {
  const input = initial({ messages: [announcement, { ...announcement, id: 'unrelated', conversationId: 'other' }, { ...announcement, id: 'other-employee', senderId: 'other' }] }), output = deepseekReasoningHistory(input)
  expect(output).toHaveLength(1); expect(output[0]!.role).toBe('user')
  const content = output[0]!.content
  expect(typeof content).toBe('string')
  if (typeof content !== 'string') throw new Error('历史归属引用应是文本')
  const reference = JSON.parse(content.split('\n')[1]!)
  expect(reference).toEqual({ senderType: 'agent', senderId: 'bobo', sourceMessages: [{ id: announcement.id, conversationId: 'group', sequence: 1, createdAt: announcement.createdAt, senderName: 'bobo' }], content: announcement.content })
  expect(output[0]!.content).toContain('不是新用户指令'); expect(output[0]!.content).not.toContain('reasoning_content')
  expect(input.projected[0]!.role).toBe('assistant'); expect(announcement.content).toBe(reference.content)
})
test('only verified official thinking histories with tools change; explicit off and other providers keep their original input identity', () => {
  for (const overrides of [
    { hasTools: false }, { thinkingLevel: 'off' as const }, { modelId: 'unverified' },
    { connection: { ...official, baseUrl: 'https://api.deepseek.com.evil.test' } },
    { connection: { ...official, baseUrl: 'http://localhost:1234' } },
    { connection: { ...official, api: 'responses' as const } },
    { connection: { ...official, provider: 'anthropic' as const } },
  ]) { const input = initial(overrides); expect(deepseekReasoningHistory(input)).toBe(input.projected) }
})
test('a missing or different employee/conversation source is rejected instead of inventing historical authorship', () => {
  for (const messages of [[], [{ ...announcement, status: 'streaming' as const }], [{ ...announcement, senderId: 'another' }], [{ ...announcement, conversationId: 'another' }]]) expect(() => deepseekReasoningHistory(initial({ messages }))).toThrow('已发布原消息出处')
})

function send(response: ServerResponse, index: number, parts: { reasoning?: string; tool?: { name: string; args: unknown }; text?: string }) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `reasoning-${index}`, object: 'chat.completion.chunk', created: 1700000000, model: 'deepseek-flash', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
  emit({ role: 'assistant' })
  if (parts.reasoning) { emit({ reasoning_content: parts.reasoning.slice(0, 12) }); emit({ reasoning_content: parts.reasoning.slice(12) }) }
  if (parts.tool) { emit({ tool_calls: [{ index: 0, id: `actual-call-${index}`, type: 'function', function: { name: parts.tool.name, arguments: JSON.stringify(parts.tool.args) } }] }); emit({}, 'tool_calls') }
  else { emit({ content: parts.text ?? '已完成实际工作' }); emit({}, 'stop') }
  response.write(`data: ${JSON.stringify({ id: `reasoning-${index}`, choices: [], usage: { prompt_tokens: 110, completion_tokens: 35, total_tokens: 145 } })}\n\n`); response.end('data: [DONE]\n\n')
}
async function endpoint(replies: Parameters<typeof send>[2][]) {
  const requests: WireRequest[] = []
  const server = createServer(async (request, response) => {
    let text = ''; for await (const part of request) text += part
    const body = JSON.parse(text) as WireRequest; requests.push(body)
    // Independent provider contract: every API assistant in a thinking/tools
    // request must carry its actual reasoning. Published records are not API turns.
    if (body.tools?.length && body.thinking?.type !== 'disabled' && body.messages.some(message => message.role === 'assistant' && typeof message.reasoning_content !== 'string')) { response.writeHead(400, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ error: { message: 'The reasoning_content in the thinking mode must be passed back to the API.' } })); return }
    send(response, requests.length - 1, replies[requests.length - 1] ?? { text: '已完成实际工作' })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  cleanup.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) })
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  const nativeFetch = globalThis.fetch
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => { const target = new URL(input instanceof Request ? input.url : input.toString()); if (target.hostname !== 'api.deepseek.com') throw new Error('Unexpected external model request'); return nativeFetch(new URL(target.pathname + target.search, url), init) })
  return { requests }
}
async function context(patch: Partial<EngineContext> = {}) {
  const root = await mkdtemp(join(tmpdir(), 'boai-deepseek-history-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const traces: TraceSpan[] = [], deltas: string[] = [], additionalCalls: number[] = []
  const ctx: EngineContext = { agent: employee, connection: official, apiKey: 'synthetic-fixture-key', conversation: { id: 'group', kind: 'group', title: 'actual group', agentIds: ['bobo','researcher'], mode: 'natural', workspacePath: join(root, 'shared'), sharedKnowledgeIds: [], createdAt: '', updatedAt: '' }, messages: [announcement], triggerMessageId: announcement.id, resources: [], runId: 'run-1', signal: new AbortController().signal, responseKind: 'task', workspace: { root: join(root, 'session'), workPath: join(root, 'session/work'), runPath: join(root, 'session/runs/run-1'), sharedPath: join(root, 'shared') }, onDelta: async text => { deltas.push(text) }, onTool: async () => {}, onAdditionalModelCall: async () => { additionalCalls.push(1) }, approveCommand: async () => false, onTrace: async span => { traces.push(span) }, ...patch }
  return { ctx, root, traces, deltas, additionalCalls }
}

test('thinking group chat with advertised memory tools projects published history before its first HTTP request', async () => {
  const firstReasoning = 'Actual provider reasoning for an authorized memory lookup.'
  const api = await endpoint([{ reasoning: firstReasoning, tool: { name: 'recall', args: { mode: 'messages', detail: 'high' } } }, { reasoning: 'Actual provider reasoning for the final chat reply.', text: '按群里的原分工继续讨论。' }])
  let recalls = 0
  const run = await context({ responseKind: 'chat', workspace: undefined, recallMemory: async () => { recalls++; return { entries: [], epoch: 0, namespace: 'group-chat-fixture' } } })
  await new MastraEngine().run(run.ctx)
  expect(api.requests).toHaveLength(2); expect(recalls).toBe(0)
  expect(api.requests[0]!.tools.map(tool => tool.function.name)).toContain('recall')
  expect(api.requests[0]!.messages.some(message => message.role === 'assistant')).toBe(false)
  expect(JSON.stringify(api.requests[0]!.messages)).toContain('actual-announcement')
  expect(api.requests[1]!.messages.find(message => message.role === 'assistant')?.reasoning_content).toBe(firstReasoning)
  expect(run.deltas.join('')).toBe('按群里的原分工继续讨论。')
})

test('thinking chat with official recall preserves historical attribution without inventing reasoning', async () => {
  const api = await endpoint([{ reasoning: 'Actual answer reasoning without tools.', text: '继续讨论。' }])
  const run = await context({ responseKind: 'chat', workspace: undefined })
  await new MastraEngine().run(run.ctx)
  expect(api.requests).toHaveLength(1)
  expect(api.requests[0]!.tools?.map(tool => tool.function.name)).toEqual(['recall'])
  expect(api.requests[0]!.messages.some(message => message.role === 'assistant')).toBe(false)
  expect(JSON.stringify(api.requests[0]!.messages)).toContain('actual-announcement')
  expect(run.deltas.join('')).toBe('继续讨论。')
})

test.each(['low','high','max','auto'] as const)('actual Mastra/HTTP retains complete two-step reasoning and tool identity for %s without fabricating announcement reasoning', async thinkingLevel => {
  const firstReasoning = '供应商第一段完整思考：先写真实原件，再读取核对。\n内容与工具身份不得替换。', secondReasoning = '供应商第二段完整思考：原件已写入，现在读取同一实际路径。'
  const endpointFixture = await endpoint([{ reasoning: firstReasoning, tool: { name: 'write_file', args: { path: 'self:/runs/run-1/data.md', content: 'ACTUAL_DEEPSEEK_FILE_79' } } }, { reasoning: secondReasoning, tool: { name: 'read_file', args: { path: 'self:/runs/run-1/data.md' } } }, { reasoning: '供应商最终思考：已经读取真实内容。', text: '实际数据文件写入与读取已完成。' }])
  const run = await context({ agent: { ...employee, thinkingLevel } }); await new MastraEngine().run(run.ctx)
  expect(endpointFixture.requests).toHaveLength(3); expect(run.additionalCalls).toHaveLength(2)
  expect(await readFile(join(run.ctx.workspace!.runPath, 'data.md'), 'utf8')).toBe('ACTUAL_DEEPSEEK_FILE_79')
  for (const request of endpointFixture.requests) { expect(request.model).toBe('deepseek-flash'); expect(request.max_tokens).toBe(8192); expect(request.tools.some(tool => tool.function.name === 'write_file')).toBe(true); expect(request.thinking).toEqual(thinkingLevel === 'auto' ? undefined : { type: 'enabled' }); expect(request.reasoning_effort).toBe(thinkingLevel === 'auto' ? undefined : thinkingLevel); expect(request.messages.some(message => message.role === 'user' && typeof message.content === 'string' && message.content.includes('actual-announcement'))).toBe(true) }
  const assistant1 = endpointFixture.requests[1]!.messages.filter(message => message.role === 'assistant')
  expect(assistant1).toHaveLength(1); expect(assistant1[0]!.reasoning_content).toBe(firstReasoning); expect(assistant1[0]!.tool_calls).toEqual([{ id: 'actual-call-0', type: 'function', function: { name: 'write_file', arguments: JSON.stringify({ path: 'self:/runs/run-1/data.md', content: 'ACTUAL_DEEPSEEK_FILE_79' }) } }])
  const assistant2 = endpointFixture.requests[2]!.messages.filter(message => message.role === 'assistant')
  expect(assistant2.map(message => message.reasoning_content)).toEqual([firstReasoning, secondReasoning])
  expect(endpointFixture.requests[2]!.messages.filter(message => message.role === 'tool').map(message => message.tool_call_id)).toEqual(['actual-call-0','actual-call-1'])
  expect(JSON.stringify(endpointFixture.requests[2]!.messages)).toContain('ACTUAL_DEEPSEEK_FILE_79')
  expect(run.deltas.join('')).toBe('实际数据文件写入与读取已完成。')
})
test('explicit off keeps the published assistant history and disabled thinking through actual HTTP', async () => {
  const fixture = await endpoint([{ text: '已完成。' }]), run = await context({ agent: { ...employee, thinkingLevel: 'off' } })
  await new MastraEngine().run(run.ctx)
  expect(fixture.requests[0]!.thinking).toEqual({ type: 'disabled' }); expect(fixture.requests[0]!.reasoning_effort).toBeUndefined()
  expect(fixture.requests[0]!.messages.some(message => message.role === 'assistant' && message.content === announcement.content)).toBe(true)
})
test('DeepSeek history normalization preserves actual browser PNG media and reasoning across the SDK tool boundary', async () => {
  const reason = '真实供应商思考：读取浏览器截图，不从页面获得权限。', bytes = Buffer.from('actual-browser-png-image'), image = bytes.toString('base64')
  const fixture = await endpoint([{ reasoning: reason, tool: { name: 'browser_tool', args: { command: 'screenshot --png' } } }, { text: '截图核对完成。' }])
  const execute = vi.fn(async () => ({ result: { output: '实际网页截图', appendReleaseHint: false, image: { data: image, mimeType: 'image/png', sizeBytes: bytes.length } }, source: { scopeKey: 'scope', generation: 'generation', pageVersion: 'page-v1', url: 'https://example.test/', title: 'Actual site', obtainedAt: '2026-10-02T00:00:00.000Z' } }))
  const run = await context({ agent: { ...employee, allowBrowser: true }, work: { id: 'actual-work' } as EngineContext['work'], browserSession: { execute, drain: async () => {} } as unknown as BrowserSession })
  await new MastraEngine().run(run.ctx)
  expect(execute).toHaveBeenCalledExactlyOnceWith('screenshot --png','actual-call-0')
  const next = fixture.requests[1]!.messages
  expect(next.find(message => message.role === 'assistant')?.reasoning_content).toBe(reason)
  expect(next.some(message => message.role === 'user' && Array.isArray(message.content) && message.content.some(part => part.type === 'image_url' && part.image_url.url === `data:image/png;base64,${image}`))).toBe(true)
  expect(JSON.stringify(run.traces)).not.toContain(image); expect(JSON.stringify(run.traces)).toContain('sha256')
})
