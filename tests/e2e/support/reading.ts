/*
 * [INPUT]: 隔离桌面、真实 SQLite 旧历史、同名材料原件与可控制结束顺序的离线 Mastra HTTP 流。
 * [OUTPUT]: 万条同文不同身份历史、混合搜索真实同名材料、可指定历史数量/追加正文的实际员工并行流和一次分页快照延迟；固定目标读取可等待真实删除事务后执行原 IPC 并恢复 handler，验证迟到异常隔离；完成顺序与浏览请求观测，不替代发布或阅读事务；隐藏会话由真实获准查询拒绝，不提供检索恢复显示旁路。
 * [OUTPUT]: 取证读取使用已有库只读连接，不执行启动迁移或使正文索引失效。
 * [POS]: D6 Electron 支撑；仅场景模型协议与私有历史种子，不调用商业模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { dirname, join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import type { ServerResponse } from 'node:http'
import type { Message, Conversation } from '../../../src/shared/domain'
import type { ConversationCompletion, ConversationReadingState } from '../../../src/shared/domain/reading'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import { teamEndpoint, sendTeamOutput } from '../../fixtures/team-planner'
import type { Desktop } from './desktop'

export const READING_DUPLICATE = '相同的阅读检索正文 D6_DUPLICATE，按身份定位原消息。'
export const historyId = (sequence: number) => `reading-history-${String(sequence).padStart(5, '0')}`
export async function prepareReadingSearchSource(source: string) {
  const path = join(dirname(source), '交付报告.md'), text = '# 交付报告材料\nREADING_SEARCH_MATERIAL：材料原件与同名成果拥有独立身份。\n'
  await writeFile(path, text)
  return { path, text }
}
export async function readingRecords(dataPath: string) {
  const store = await ProductStore.openReadOnly(join(dataPath, 'boai.sqlite'))
  try { return { messages: await store.load<Message>('messages'), completions: await store.load<ConversationCompletion>('conversationCompletions'), reading: await store.load<ConversationReadingState>('conversationReadingStates'), works: await store.load('workItems'), runs: await store.load('runs'), acceptances: await store.load('artifactAcceptances') } }
  finally { await store.close() }
}
export async function seedReadingHistory(dataPath: string, group: Conversation, other: Conversation, count = 10_000) {
  const baseTime = Date.UTC(2026, 8, 30), store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init()
  const messages = Array.from({ length: count }, (_, index): Message => ({ id: historyId(index + 1), conversationId: group.id, senderType: 'agent', senderId: 'researcher', senderName: '阅读作者甲', content: [17, 9700].includes(index + 1) ? READING_DUPLICATE : `第 ${index + 1} 条完整旧历史。`, sequence: index + 1, status: 'completed', createdAt: new Date(baseTime + index * 1000).toISOString() }))
  const independent: Message = { ...messages[Math.min(16, count - 1)], id: 'reading-other-duplicate', conversationId: other.id }
  try { await store.write([...messages, independent].map(value => ({ collection: 'messages', id: value.id, value }))) }
  finally { await store.close() }
  return { first: messages[16], second: messages[9699], independent }
}
export async function prepareReadingHistory(runtime: Desktop) {
  await runtime.start()
  const setup = await runtime.page.evaluate(async () => {
    const group = await window.boai.request('createConversation', { kind: 'group', title: '万条阅读历史', agentIds: ['researcher'] }), other = await window.boai.request('createConversation', { kind: 'group', title: '独立阅读历史', agentIds: ['researcher'] })
    return { group, other, dataPath: (await window.boai.request('snapshot', undefined)).dataPath }
  })
  await runtime.close(); const targets = await seedReadingHistory(setup.dataPath, setup.group, setup.other); await runtime.start()
  return { ...setup, targets }
}

interface PendingStream { response: ServerResponse; emit(delta: unknown, finish?: string | null): void }
const contentText = (content: unknown): string => typeof content === 'string' ? content : JSON.stringify(content)
export async function prepareReadingStreams(runtime: Desktop, historyCount = 120) {
  const streams = new Map<string, PendingStream>(), errors: string[] = []
  let delayedWriterDecision: ServerResponse | undefined
  const endpoint = await teamEndpoint((body, response, index) => {
    try {
      const messages = body.messages as { role: string; content: unknown }[], system = messages.filter(value => value.role === 'system').map(value => contentText(value.content)).join('\n')
      if (system.includes('Private participation decision')) {
        const { data } = JSON.parse(contentText(messages.at(-1)!.content))
        if (data.currentTurn?.ownCompletedMessageIds?.length || data.participation?.hasRespondedInTurn) { sendTeamOutput(response, { action: 'pass' }); return }
        if (data.currentEmployeeId === 'writer' && !streams.has('researcher')) { delayedWriterDecision = response; return }
        sendTeamOutput(response, { action: 'reply', responseKind: 'chat' }); return
      }
      if (system.includes('Private memory maintenance')) { sendTeamOutput(response, { candidates: [] }); return }
      if (system.includes('Read the actual new conversation facts. Publish a relevant, updated report')) {
        const { data } = JSON.parse(contentText(messages.at(-1)!.content)); sendTeamOutput(response, { action: 'publish', text: data.draft.text }); return
      }
      const sender = system.includes('__READING_AUTHOR_A__') ? 'researcher' : system.includes('__READING_AUTHOR_B__') ? 'writer' : undefined
      if (!sender || streams.has(sender)) throw new Error('并行流必须来自本场景获准的明确员工且只启动一次')
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `reading-${index}`, object: 'chat.completion.chunk', model: 'reading-fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      emit({ role: 'assistant' }); emit({ content: sender === 'researcher' ? 'READING_START_A\n' : 'READING_START_B\n' })
      streams.set(sender, { response, emit })
      if (sender === 'researcher' && delayedWriterDecision) { sendTeamOutput(delayedWriterDecision, { action: 'reply', responseKind: 'chat' }); delayedWriterDecision = undefined }
    } catch (error) { errors.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end(String(error)) }
  })
  runtime.trackServer(endpoint.server); await runtime.start()
  const setup = await runtime.page.evaluate(async url => {
    const connection = await window.boai.request('saveConnection', { name: '并行阅读离线协议', provider: 'openai-compatible', baseUrl: url, defaultModel: 'reading-fixture' })
    for (const agent of (await window.boai.request('snapshot', undefined)).agents.filter(value => ['researcher', 'writer'].includes(value.id))) {
      const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...input } = agent
      await window.boai.request('saveAgent', { ...input, name: agent.id === 'researcher' ? '阅读作者甲' : '阅读作者乙', instructions: agent.id === 'researcher' ? '__READING_AUTHOR_A__ 按本人明确请求仅给普通聊天回复。' : '__READING_AUTHOR_B__ 按本人明确请求仅给普通聊天回复。', connectionId: connection.id, modelId: 'reading-fixture', allowCommands: false, expectedConfigVersion: configVersion })
    }
    const group = await window.boai.request('createConversation', { kind: 'group', title: '并行阅读次序', agentIds: ['researcher', 'writer'] }), other = await window.boai.request('createConversation', { kind: 'direct', title: '阅读位置隔离', agentIds: ['researcher'] })
    return { group, other, dataPath: (await window.boai.request('snapshot', undefined)).dataPath }
  }, endpoint.url)
  await runtime.close(); await seedReadingHistory(setup.dataPath, setup.group, setup.other, historyCount); await runtime.start()
  const finish = (sender: 'researcher' | 'writer') => {
    const stream = streams.get(sender); if (!stream) throw new Error('尚未启动实际流')
    stream.emit({ content: `${'阅读内容按实际可见消息保存，不能越过未看到的回复。\n'.repeat(35)}READING_END_${sender === 'researcher' ? 'A' : 'B'}` }); stream.emit({}, 'stop'); stream.response.end('data: [DONE]\n\n')
  }
  const append = (sender: 'researcher' | 'writer', content: string) => {
    const stream = streams.get(sender); if (!stream) throw new Error('尚未启动实际流')
    stream.emit({ content })
  }
  return { ...setup, endpoint, errors, started: (sender: string) => streams.has(sender), append, finish }
}
export async function delayNextReadingPage(runtime: Desktop, conversationId: string, direction: 'before' | 'after' = 'before') {
  await runtime.app.evaluate(({ ipcMain }, { conversationId, direction }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers, original = handlers.get('boai:request')!
    const state = { claimed: false, captured: false, release: () => {} }
    const ready = new Promise<void>(resolve => { state.release = resolve })
    Object.assign(globalThis, { __boaiReadingPageDelay: state })
    ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', async (event, payload) => {
      if (state.claimed || payload.method !== 'getConversationView' || payload.input?.conversationId !== conversationId || !payload.input[direction]) return original(event, payload)
      state.claimed = true
      const response = await original(event, payload); state.captured = true
      await ready
      return response
    })
  }, { conversationId, direction })
  const captured = () => runtime.app.evaluate(() => (globalThis as typeof globalThis & { __boaiReadingPageDelay: { captured: boolean } }).__boaiReadingPageDelay.captured)
  const release = () => runtime.app.evaluate(() => (globalThis as typeof globalThis & { __boaiReadingPageDelay: { release(): void } }).__boaiReadingPageDelay.release())
  return { captured, release }
}
export async function delayNextReadingTarget(runtime: Desktop, conversationId: string, messageId: string) {
  await runtime.app.evaluate(({ ipcMain }, { conversationId, messageId }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers, original = handlers.get('boai:request')!
    const state = { claimed: false, settled: false, rejected: false, release: () => {}, dispose: () => {} }
    const ready = new Promise<void>(resolve => { state.release = resolve })
    state.dispose = () => { state.release(); ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', original) }
    Object.assign(globalThis, { __boaiReadingTargetDelay: state })
    ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', async (event, payload) => {
      if (state.claimed || payload.method !== 'getConversationView' || payload.input?.conversationId !== conversationId || payload.input.aroundMessageId !== messageId) return original(event, payload)
      state.claimed = true
      await ready
      try { return await original(event, payload) }
      catch (error) { state.rejected = true; throw error }
      finally { state.settled = true }
    })
  }, { conversationId, messageId })
  type DelayedTarget = typeof globalThis & { __boaiReadingTargetDelay: { claimed: boolean; settled: boolean; rejected: boolean; release(): void; dispose(): void } }
  return {
    inspect: () => runtime.app.evaluate(() => { const { claimed, settled, rejected } = (globalThis as DelayedTarget).__boaiReadingTargetDelay; return { claimed, settled, rejected } }),
    release: () => runtime.app.evaluate(() => (globalThis as DelayedTarget).__boaiReadingTargetDelay.release()),
    dispose: () => runtime.app.evaluate(() => (globalThis as DelayedTarget).__boaiReadingTargetDelay.dispose()),
  }
}
interface BrowserRequest { method: string; input: unknown }
type BrowserProbe = typeof globalThis & { __boaiReadingRequests: BrowserRequest[] }
export async function readingBrowserProbe(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers, original = handlers.get('boai:request')!
    Object.assign(globalThis, { __boaiReadingRequests: [] })
    ipcMain.removeHandler('boai:request'); ipcMain.handle('boai:request', async (event, payload) => { (globalThis as BrowserProbe).__boaiReadingRequests.push(structuredClone(payload)); return original(event, payload) })
  })
  return () => runtime.app.evaluate(() => structuredClone((globalThis as BrowserProbe).__boaiReadingRequests))
}
