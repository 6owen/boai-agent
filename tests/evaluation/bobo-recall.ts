/*
 * [OUTPUT]: 原文工具对照增加数据库纠正场景和宿主查询/SQL耗时，查询证据与模型往返分别记录。
 * [OUTPUT]: historyMode对比同一代码按需/预检，记录真实预检耗时、首请求与事实检查，语义质量仍待独立评价。
 * [INPUT]: Frozen baseline/candidate sources, the selected existing Bobo API connection and synthetic cross-session/control questions.
 * [OUTPUT]: Isolated AppService/Mastra replies, real request/tool counts, timings and deterministic source-fact checks.
 * [POS]: Manual bounded recall comparison; never writes personal chats or stores credentials.
 * [PROTOCOL]: Update this Header and evaluation/.folder.md on change.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppService } from '../../packages/runtime/src/service'
import { MastraEngine } from '../../packages/runtime/src/adapters/mastra/engine'
import { ProductStore } from '../../packages/runtime/src/adapters/storage/product-store'
import type { AgentEngine, EngineContext } from '../../packages/runtime/src/contracts'
import type { Connection, Conversation, ConversationDetail, Message, ModelUsage, Snapshot } from '../../packages/shared/src/domain'

interface Settings { output: string; variant: string; maxRequests: number; maxOutputTokens: number; deadlineMs: number; repetitions: number; rawHistory?: boolean; historyMode?: 'agent' | 'prefetch'; modelId?: string; thinkingLevel?: import('../../packages/shared/src/domain').DigitalAgent['thinkingLevel'] }
export async function runBoboRecallEvaluation({ settings, connection, apiKey }: { settings: Settings; connection: Connection; apiKey: string }) {
  const started = Date.now(), rows: unknown[] = [], calls = new Map<string, { caseId: string; phase: string; startedAt: number; usage?: ModelUsage }>()
  let caseId = '', service: AppService | undefined, base: MastraEngine | undefined, unknownUsage = false
  const requests: unknown[] = [], historyReads: unknown[] = [], prefetchReads: { caseId: string; hits: number; elapsedMs: number; sqlMs: number; queries: string[] }[] = [], originalFetch = globalThis.fetch
  globalThis.fetch = async (input, init) => {
    if (typeof init?.body === 'string') {
      const body = JSON.parse(init.body), text = JSON.stringify(body.messages ?? [])
      if (body.messages) requests.push({ caseId, model: body.model, toolChoice: body.tool_choice ?? 'auto', tools: body.tools?.map((tool: { function: { name: string } }) => tool.function.name),
        officialGuidance: text.includes('Choosing a mode'), customGuidance: text.includes('主动结合相关的既往对话'), sourcePresent: text.includes('周三去体检') || text.includes('最终改用 PostgreSQL'),
        messageRoles: body.messages.map((message: { role: string }) => message.role) })
    }
    return originalFetch(input, init)
  }
  await mkdir(settings.output, { recursive: true })
  const save = async () => {
    const text = JSON.stringify({ variant: settings.variant, cases: rows, calls: [...calls.values()], requests, historyReads, prefetchReads, historyMode: settings.historyMode, actualRequests: calls.size, unknownUsage, credentialsSaved: false, humanQuality: 'not-assessed', elapsedMs: Date.now() - started }, null, 2)
    await writeFile(join(settings.output, 'result.json'), apiKey ? text.replaceAll(apiKey, '[redacted]') : text)
  }
  const wrap = (context: EngineContext): EngineContext => ({ ...context,
    ...(context.historySearch ? { historySearch: { ...context.historySearch, prefetch: async (text, visibleIds) => { const result = await context.historySearch!.prefetch(text, visibleIds); prefetchReads.push({ caseId, hits: result.hits.length, elapsedMs: result.elapsedMs, sqlMs: result.sqlMs, queries: result.queries }); return result }, search: async (input: Parameters<NonNullable<EngineContext['historySearch']>['search']>[0]) => { const start = performance.now(), result = await context.historySearch!.search(input); historyReads.push({ caseId, query: input.query, matching: result.matching, hits: result.hits.length, sqlMs: result.sqlMs, queryMs: result.elapsedMs, hostMs: performance.now() - start }); return result } } } : {}),
    onModelCallStarted: async (id, phase, thinking) => {
      if (Date.now() - started >= settings.deadlineMs || calls.size >= settings.maxRequests || unknownUsage || [...calls.values()].reduce((n, c) => n + (c.usage?.outputTokens ?? 0), 0) >= settings.maxOutputTokens) throw new Error('Recall evaluation request/token/time budget reached')
      calls.set(`${context.runId}:${id}`, { caseId, phase, startedAt: Date.now() }); await context.onModelCallStarted?.(id, phase, thinking)
    },
    onModelCallUsage: async (id, usage) => { const call = calls.get(`${context.runId}:${id}`); if (call) call.usage = usage; await context.onModelCallUsage?.(id, usage) },
  })
  try {
    for (let repetition = 1; repetition <= settings.repetitions; repetition++) for (const kind of ['history', 'ordinary'] as const) {
      caseId = `${kind}-${repetition}`
      const dataPath = join(settings.output, caseId, 'data'), sourceId = 'prior-conversation', stamp = '2026-11-03T01:00:00.000Z'
      const store = new ProductStore(join(dataPath, 'boai.sqlite')); await store.init()
      const source: Conversation = { id: sourceId, kind: 'direct', purpose: 'core', memoryScope: 'employee', title: '日常交流', agentIds: ['bobo'], mode: 'natural', workspacePath: join(dataPath, 'workspaces', sourceId), sharedKnowledgeIds: [], createdAt: stamp, updatedAt: stamp }
      const databaseCase = !!settings.rawHistory && repetition === 2
      const messages: Message[] = [
        { id: 'original-user', conversationId: sourceId, sequence: 1, senderType: 'user', senderId: 'user', senderName: '我', content: '周三去体检，周一晚上熬夜到3点，准备周二早点休息。', status: 'completed', createdAt: stamp },
        { id: 'original-reply', conversationId: sourceId, sequence: 2, senderType: 'agent', senderId: 'bobo', senderName: 'bobo', content: '知道了，按你的安排来。', status: 'completed', createdAt: '2026-11-03T01:00:01.000Z' },
      ]
      if (databaseCase) messages.splice(0, messages.length,
        { ...messages[0], content: '这个项目数据库先用 MySQL。' },
        { ...messages[0], id: 'original-correction', sequence: 2, content: '修改一下，数据库最终改用 PostgreSQL。', createdAt: '2026-11-03T01:00:01.000Z' },
        { ...messages[1], sequence: 3, content: '收到，按最终决定来。', createdAt: '2026-11-03T01:00:02.000Z' })
      await store.write([{ collection: 'conversations', id: source.id, value: source }, ...messages.map(message => ({ collection: 'messages', id: message.id, value: message }))]); await store.close()
      base = new MastraEngine({ memoryPath: join(dataPath, 'memory', 'bobo-mastra.db') })
      const engine: AgentEngine = { memoryOwner: 'mastra', test: (...args) => base!.test(...args), decide: context => base!.decide(wrap(context)), run: context => base!.run(wrap(context)), memoryView: id => base!.memoryView(id), closeMemory: () => base!.closeMemory() }
      service = new AppService({ dataPath, engine, secrets: { get: async () => apiKey, set: async () => {}, delete: async () => {} }, emit: () => {} }); await service.init()
      const configured = await service.handle('saveConnection', { name: connection.name, provider: connection.provider, baseUrl: connection.baseUrl, defaultModel: connection.defaultModel, api: connection.api }) as Connection
      const agent = (await service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'bobo')!
      const { configVersion, workspaceRef: _workspace, memoryNamespace: _memory, policyVersion: _policy, ...editable } = agent
      await service.handle('saveAgent', { ...editable, connectionId: configured.id, modelId: settings.modelId || configured.defaultModel, thinkingLevel: settings.thinkingLevel, allowCommands: false, allowBrowser: false, expectedConfigVersion: configVersion })
      if (settings.historyMode) await service.handle('configureHistorySearch', { agentId: 'bobo', expectedRevision: 0, settings: { mode: settings.historyMode, window: { kind: 'messages', before: 1, after: 1 }, limit: 3, maxCharacters: 20000 } })
      const prompt = kind === 'history' ? databaseCase ? '之前我们最后决定数据库用什么？' : '你知道我什么时候体检吗？' : '17乘以6是多少？'
      const before = calls.size, start = Date.now()
      const room = await service.handle('startCoreConversation', { content: prompt, requestId: `recall-eval-${caseId}` }) as Conversation
      let detail: ConversationDetail
      for (;;) {
        detail = await service.handle('getConversation', { id: room.id }) as ConversationDetail
        if (detail.runs.length && detail.runs.every(run => ['completed', 'failed', 'interrupted', 'cancelled'].includes(run.status)) && detail.turns?.every(turn => ['completed', 'waiting_user', 'failed', 'interrupted', 'cancelled', 'budget_exhausted'].includes(turn.status))) break
        if (Date.now() - started >= settings.deadlineMs) { await service.handle('cancelRun', { conversationId: room.id }); throw new Error('Recall evaluation deadline reached') }
        await new Promise(resolve => setTimeout(resolve, 50))
      }
      const elapsedMs = Date.now() - start, answer = detail.messages.filter(message => message.senderType === 'agent').map(message => message.content).join('\n')
      const tools = detail.runs.flatMap(run => run.toolEvents), recallCalls = tools.filter(event => event.name === 'recall' && event.status === 'completed').length
      const searchCalls = tools.filter(event => event.name === 'search_history' && event.status === 'completed').length
      const answerCorrect = kind === 'history' ? databaseCase ? /PostgreSQL/i.test(answer) : /周三|星期三|礼拜三/.test(answer) : /102/.test(answer)
      const complete = detail.runs.every(run => run.status === 'completed')
      rows.push({ caseId, kind, prompt, source: messages, answer, answerCorrect, complete, passed: complete && answerCorrect && (kind === 'history' ? settings.historyMode ? settings.historyMode === 'prefetch' ? prefetchReads.some(read => read.caseId === caseId && read.hits > 0) : searchCalls + recallCalls > 0 : settings.rawHistory && settings.variant === 'candidate' ? searchCalls > 0 && recallCalls === 0 : recallCalls > 0 : recallCalls + searchCalls === 0), actualRequests: calls.size - before, recallCalls, searchCalls, elapsedMs,
        tools: tools.map(({ name, status, input, detail }) => ({ name, status, input, detail })), runs: detail.runs.map(({ phase, status, error }) => ({ phase, status, error })) })
      await service.close(); service = undefined; base = undefined
      unknownUsage = [...calls.values()].some(call => !call.usage || call.usage.outputTokens === undefined)
      await save()
      if (!complete || unknownUsage) throw new Error('Incomplete run or unknown usage; comparison stopped without retry')
    }
  } catch (error) { rows.push({ failure: error instanceof Error ? error.message : String(error), caseId }); await save(); throw error }
  finally { globalThis.fetch = originalFetch; await service?.close(); await base?.closeMemory(); await save() }
}
