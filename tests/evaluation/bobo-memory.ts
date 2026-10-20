/*
 * [INPUT]: Isolated synthetic bobo chats, explicit read-only model credential and actual Mastra engine.
 * [OUTPUT]: Bounded real-model evidence for automatic preference extraction, cross-chat answer, correction and forget.
 * [POS]: Manual memory quality probe; does not modify the user's daily database.
 * [PROTOCOL]: Update Header and tests/evaluation/.folder.md when changed.
 */
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppService } from '../../src/runtime/service'
import { MastraEngine } from '../../src/runtime/adapters/mastra/engine'
import type { AgentEngine, EngineContext } from '../../src/runtime/contracts'
import type { Connection, Conversation, ConversationDetail, MemoryView, ModelUsage, Snapshot } from '../../src/shared/domain'

interface Settings { output: string; maxRequests: number; maxOutputTokens: number; deadlineMs: number }
export async function runBoboMemoryEvaluation({ settings, connection, apiKey }: { settings: Settings; connection: Connection; apiKey: string }) {
  await mkdir(settings.output, { recursive: true })
  const started = Date.now(), calls = new Map<string, { id: string; caseId: string; phase: string; usage?: ModelUsage }>(), rows: unknown[] = []
  let current = '', unknownUsage = false, service: AppService | undefined
  let saveQueue = Promise.resolve()
  const save = async () => {
    const raw = JSON.stringify({ cases: rows, calls: [...calls.values()], unknownUsage, credentialsSaved: false, humanQuality: 'pending' }, null, 2)
    const payload = apiKey ? raw.split(apiKey).join('[redacted]') : raw
    const pending = saveQueue.then(async () => {
      await writeFile(join(settings.output, 'result.pending.json'), payload)
      await rename(join(settings.output, 'result.pending.json'), join(settings.output, 'result.json'))
    })
    saveQueue = pending.catch(() => {})
    await pending
  }
  const base = new MastraEngine({ memoryPath: join(settings.output, 'data', 'memory', 'bobo-mastra.db'), runTimeoutMs: 45_000, connectionTimeoutMs: 30_000 })
  const wrap = (context: EngineContext): EngineContext => { const caseId = current; return { ...context,
    onModelCallStarted: async (id, phase, thinking) => {
      const used = [...calls.values()].reduce((sum, call) => sum + (call.usage?.outputTokens ?? 0), 0)
      const key = `${caseId}:${id}`
      if (Date.now() - started >= settings.deadlineMs || !calls.has(key) && calls.size >= settings.maxRequests || used >= settings.maxOutputTokens || unknownUsage) throw new Error('bobo记忆评估已达到预设预算/期限或用量未知')
      calls.set(key, { id, caseId, phase }); await save(); await context.onModelCallStarted?.(id, phase, thinking)
    },
    onModelCallUsage: async (id, usage) => { const call = calls.get(`${caseId}:${id}`); if (call) call.usage = usage; if (usage.outputTokens === undefined) unknownUsage = true; await context.onModelCallUsage?.(id, usage); await save() },
  } }
  const engine: AgentEngine = {
    test: (...args) => base.test(...args),
    decide: async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }),
    run: context => base.run(wrap(context)), extractMemory: context => base.extractMemory(wrap(context)),
    forgetConversationMemory: id => base.forgetConversationMemory(id), forgetAllConversationMemory: () => base.forgetAllConversationMemory(),
  }
  const query = { agentId: 'bobo', scope: 'employee' as const }
  const pause = () => new Promise(resolve => setTimeout(resolve, 150))
  const send = async (caseId: string, prompt: string) => {
    current = caseId
    const before = calls.size, room = await service!.handle('startCoreConversation', { content: prompt, requestId: `memory-eval-${caseId}` }) as Conversation
    const deadline = Math.min(started + settings.deadlineMs, Date.now() + 100_000)
    let detail: ConversationDetail
    do {
      detail = await service!.handle('getConversation', { id: room.id }) as ConversationDetail
      if (detail.turns?.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status)) && detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))) break
      if (Date.now() > deadline) { await service!.handle('cancelRun', { conversationId: room.id }); throw new Error(`${caseId}达到绝对期限`) }
      await pause()
    } while (true)
    rows.push({ id: caseId, prompt, messages: detail.messages.map(message => ({ senderType: message.senderType, content: message.content, status: message.status })), runs: detail.runs.map(run => ({ status: run.status, error: run.error })), actualCalls: calls.size - before })
    await save()
    if (detail.runs.some(run => run.status === 'failed' || run.status === 'interrupted') || detail.messages.some(message => message.senderType === 'agent' && message.status === 'failed')) throw new Error(`${caseId}真实运行失败，保留原件`)
    if ([...calls.values()].some(call => !call.usage)) unknownUsage = true
    return room
  }
  await save()
  try {
    service = new AppService({ dataPath: join(settings.output, 'data'), engine, secrets: { get: async () => apiKey, set: async () => {}, delete: async () => {} }, emit: () => {} })
    await service.init()
    const configured = await service.handle('saveConnection', { name: connection.name, provider: connection.provider, baseUrl: connection.baseUrl, defaultModel: connection.defaultModel, api: connection.api }) as Connection
    const bobo = (await service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'bobo')!
    const { configVersion, workspaceRef: _workspace, memoryNamespace: _namespace, policyVersion: _policy, ...fields } = bobo
    await service.handle('saveAgent', { ...fields, connectionId: configured.id, modelId: configured.defaultModel, thinkingLevel: 'low', allowCommands: false, allowBrowser: false, expectedConfigVersion: configVersion })
    const source = await send('remember', '请记住我的稳定写作偏好：写产品更新说明时先写一句结论，称呼我为“白桦”。只需简短确认。')
    let view = await service.handle('getMemory', query) as MemoryView
    const extractionDeadline = Date.now() + 30_000
    while (!view.entries.some(entry => entry.content.includes('白桦')) && Date.now() < extractionDeadline) { await pause(); view = await service.handle('getMemory', query) as MemoryView }
    const extracted = view.entries.some(entry => entry.content.includes('白桦'))
    if (!extracted) view = await service.handle('saveMemory', { ...query, expectedEpoch: view.epoch, content: '写产品更新说明时先写一句结论，称呼用户为白桦。', kind: 'long_term', evidence: 'preference', requestId: 'memory-eval-manual-save' }) as MemoryView
    rows.push({ id: 'extraction', sourceConversationId: source.id, extracted, entries: view.entries.map(entry => ({ id: entry.id, content: entry.content, origin: entry.origin, sourceMessageIds: entry.sourceMessageIds })) }); await save()
    if (unknownUsage) return
    await send('recall', '写一条产品更新说明的开头。你应该怎样称呼我？')
    const previous = (await service.handle('getMemory', query) as MemoryView).entries.find(entry => entry.content.includes('白桦'))
    if (!previous) throw new Error('跨会话问答后原偏好丢失')
    view = await service.handle('saveMemory', { ...query, id: previous.id, expectedEpoch: (await service.handle('getMemory', query) as MemoryView).epoch, content: '写产品更新说明时先写一句结论，称呼用户为银杏。', kind: 'long_term', evidence: 'preference', requestId: 'memory-eval-correct' }) as MemoryView
    await send('corrected', '再写一条产品更新说明的开头，并按我最新的偏好称呼我。')
    await service.handle('deleteMemory', { ...query, id: previous.id, expectedEpoch: (await service.handle('getMemory', query) as MemoryView).epoch, requestId: 'memory-eval-forget' })
    await send('forgotten', '你还知道我希望你怎样称呼我吗？不知道就直接说不知道。')
    rows.push({ id: 'final', activeMemory: (await service.handle('getMemory', { ...query, status: 'active' }) as MemoryView).entries.map(entry => entry.content), correctedVersion: view.entries.find(entry => entry.id === previous.id)?.version }); await save()
  } finally { await service?.close(); await save() }
}
