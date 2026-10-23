/*
 * [INPUT]: Three synthetic source-bound OCR windows, actual bobo/Mastra model and read-only saved connection credential.
 * [OUTPUT]: Bounded real-model report/analysis/search receipts and original reply for factual-quality review.
 * [POS]: Manual desktop activity memory probe; synthetic records stay in an isolated ProductStore.
 * [PROTOCOL]: Update Header and tests/evaluation/.folder.md when changed.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ProductStore } from '../../src/runtime/adapters/storage/product-store'
import { AppService } from '../../src/runtime/service'
import { MastraEngine } from '../../src/runtime/adapters/mastra/engine'
import type { AgentEngine, EngineContext } from '../../src/runtime/contracts'
import type { ActivitySample } from '../../src/shared/domain/desktop-activity'
import type { Connection, Conversation, ConversationDetail, ModelUsage, Snapshot } from '../../src/shared/domain'

interface Settings { output: string; maxRequests: number; maxOutputTokens: number; deadlineMs: number }
export async function runBoboActivityMemoryEvaluation({ settings, connection, apiKey }: { settings: Settings; connection: Connection; apiKey: string }) {
  await mkdir(settings.output, { recursive: true })
  const started = Date.now(), calls = new Map<string, { id: string; caseId: string; phase: string; usage?: ModelUsage }>(), rows: unknown[] = []
  let current = '', service: AppService | undefined, saveQueue = Promise.resolve(), unknownUsage = false
  const save = async () => {
    const raw = JSON.stringify({ cases: rows, calls: [...calls.values()], unknownUsage, credentialsSaved: false, humanQuality: 'pending' }, null, 2)
    const payload = apiKey ? raw.split(apiKey).join('[redacted]') : raw
    const pending = saveQueue.then(async () => { await writeFile(join(settings.output, 'result.pending.json'), payload); await rename(join(settings.output, 'result.pending.json'), join(settings.output, 'result.json')) })
    saveQueue = pending.catch(() => {}); await pending
  }
  const dataPath = join(settings.output, 'data'), now = new Date(), day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const source = [
    { app: 'Editor', bundleId: 'eval.editor', title: 'BOAI Memory draft', text: 'Draft notes: plan to add source validation to activity analysis. Tests have not been run.' },
    { app: 'Browser', bundleId: 'eval.browser', title: 'GitHub BOAI PR #42 Draft', text: 'PR #42 Draft — activity memory source validation. Review pending. Not merged.' },
    { app: 'Calendar', bundleId: 'eval.calendar', title: 'Tomorrow Bobo review', text: 'Tomorrow 10:00 review planned. No completion record.' },
  ].map((item, index): ActivitySample => ({ ...item, id: randomUUID(), capturedAt: new Date(now.getTime() - (3 - index) * 60_000).toISOString(), hash: createHash('sha256').update(JSON.stringify([item.bundleId, item.title, item.text])).digest('hex') }))
  const store = new ProductStore(join(dataPath, 'boai.sqlite'))
  await store.init(); await store.write(source.map(sample => ({ collection: 'desktopActivitySamples', id: sample.id, value: sample }))); await store.close()
  const base = new MastraEngine({ memoryPath: join(dataPath, 'memory', 'bobo-mastra.db'), runTimeoutMs: 45_000, connectionTimeoutMs: 30_000 })
  const wrap = (context: EngineContext): EngineContext => { const caseId = current; return { ...context,
    onModelCallStarted: async (id, phase, thinking) => {
      const used = [...calls.values()].reduce((sum, call) => sum + (call.usage?.outputTokens ?? 0), 0), key = `${caseId}:${id}`
      if (Date.now() - started >= settings.deadlineMs || !calls.has(key) && calls.size >= settings.maxRequests || used >= settings.maxOutputTokens || unknownUsage) throw new Error('桌面记忆评估已达到预设预算/期限或用量未知')
      calls.set(key, { id, caseId, phase }); await save(); await context.onModelCallStarted?.(id, phase, thinking)
    },
    onModelCallUsage: async (id, usage) => { const call = calls.get(`${caseId}:${id}`); if (call) call.usage = usage; if (usage.outputTokens === undefined) unknownUsage = true; await context.onModelCallUsage?.(id, usage); await save() },
  } }
  const engine: AgentEngine = { test: (...args) => base.test(...args), decide: async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }), run: context => base.run(wrap(context)), extractMemory: context => base.extractMemory(wrap(context)), forgetConversationMemory: id => base.forgetConversationMemory(id), forgetAllConversationMemory: () => base.forgetAllConversationMemory() }
  const send = async (caseId: string, prompt: string) => {
    current = caseId
    const before = calls.size, room = await service!.handle('startCoreConversation', { content: prompt, requestId: `activity-memory-${caseId}` }) as Conversation
    const deadline = Math.min(started + settings.deadlineMs, Date.now() + 150_000)
    let detail: ConversationDetail
    do {
      detail = await service!.handle('getConversation', { id: room.id }) as ConversationDetail
      if (detail.turns?.every(turn => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(turn.status)) && detail.runs.every(run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status))) break
      if (Date.now() > deadline) { await service!.handle('cancelRun', { conversationId: room.id }); throw new Error(`${caseId}达到绝对期限`) }
      await new Promise(resolve => setTimeout(resolve, 150))
    } while (true)
    rows.push({ id: caseId, prompt, messages: detail.messages.map(message => ({ senderType: message.senderType, content: message.content, status: message.status })), runs: detail.runs.map(run => ({ status: run.status, error: run.error })), actualCalls: calls.size - before }); await save()
    if (detail.runs.some(run => run.status === 'failed' || run.status === 'interrupted') || detail.messages.some(message => message.senderType === 'agent' && message.status === 'failed')) throw new Error(`${caseId}真实运行失败，保留原件`)
    if ([...calls.values()].some(call => !call.usage)) unknownUsage = true
  }
  await save()
  try {
    service = new AppService({ dataPath, engine, skillDiscovery: { homeDir: join(settings.output, 'skill-home'), bundledRoot: join(process.cwd(), 'resources', 'agent-skills') }, secrets: { get: async () => apiKey, set: async () => {}, delete: async () => {} }, emit: () => {} })
    await service.init()
    const configured = await service.handle('saveConnection', { name: connection.name, provider: connection.provider, baseUrl: connection.baseUrl, defaultModel: connection.defaultModel, api: connection.api }) as Connection
    const bobo = (await service.handle('snapshot', undefined) as Snapshot).agents.find(agent => agent.id === 'bobo')!
    const { configVersion, workspaceRef: _workspace, memoryNamespace: _namespace, policyVersion: _policy, ...fields } = bobo
    await service.handle('saveAgent', { ...fields, connectionId: configured.id, modelId: configured.defaultModel, thinkingLevel: 'low', allowCommands: false, allowBrowser: false, expectedConfigVersion: configVersion })
    await send('daily-report', `请使用 boai-daily-report 技能，根据 ${day} 至 ${day} 的真实桌面活动生成主题日报，并保存日报。不要使用聊天历史补造活动；没有记录就如实说明。`)
    rows.push({ id: 'stored', analyses: await service.handle('executeApplicationOperation', { operation: 'activity.analyses', input: { from: day, to: day } }), reports: await service.handle('executeApplicationOperation', { operation: 'activity.reports', input: {} }), search: await service.handle('executeApplicationOperation', { operation: 'activity.memory.search', input: { search: 'PR #42' } }) }); await save()
  } finally { await service?.close(); await save() }
}
