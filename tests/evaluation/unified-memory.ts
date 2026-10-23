/*
 * [INPUT]: UM-v1 固定合成交流、显式连接/内存凭据、实际 AppService 与 Mastra 回答/整理。
 * [OUTPUT]: 隔离目录的召回/实际模型请求 Trace/原始输出/调用用量和待人工评审样本，硬上限不自动扩额。
 * [POS]: T2.6 手动真实模型入口；决策固定为普通聊天，仅评估连续记忆和回答质量。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { AppService } from '../../src/runtime/service'
import { MastraEngine } from '../../src/runtime/adapters/mastra/engine'
import type { AgentEngine, EngineContext } from '../../src/runtime/contracts'
import type { Connection, Conversation, ConversationDetail, MemoryView, Snapshot } from '../../src/shared/domain'
export const unifiedMemoryVersion = 'UM-v1'
export const unifiedMemoryCases = [
  { id: 'dm-group', side: 'direct', content: '请记住我的海报写作偏好：用简洁中文，称呼大学新生为“同学”，避免营销口吻。先简短确认。' },
  { id: 'dm-group-use', side: 'group', content: '按我之前说的海报写作偏好，给大学新生写两句欢迎文案。' },
  { id: 'group-dm-immediate', side: 'group', content: '海报提纲定为三块：社团探索、同伴互助、校园行动。请简短确认。', immediate: true },
  { id: 'group-dm-use', side: 'direct', content: '继续刚才群里的海报提纲，列出约定的三个部分，不要另拟。', immediate: true },
  { id: 'correction', side: 'direct', content: '纠正之前的海报写作偏好：现在称呼大学新生为“探索者”，仍用简洁中文。请替换旧称呼。' },
  { id: 'correction-use', side: 'group', content: '按我最新的海报称呼偏好，写一句欢迎文案。' },
  { id: 'chinese-paraphrase', side: 'direct', content: '上次大家商定的新生海报，版面安排成哪三块？请沿用原来的安排。' },
  { id: 'chat-only', side: 'direct', content: '这条只留在本聊天：海报内部暗号是 ONLY_CHAT_7F4C。简短确认。', restricted: true },
  { id: 'chat-only-use', side: 'group', content: '你知道海报内部暗号吗？如果不知道直接说明，不要猜。' },
  { id: 'temporary', side: 'direct', content: '请记住临时角色陈述：仅本局扮演女巫。这是合成测试，不能作为长期人格。简短确认。', temporary: true },
  { id: 'temporary-use', side: 'group', content: '我刚刚私聊告知你本局扮演什么角色？只说角色。' },
  { id: 'temporary-expired', side: 'group', content: '现在还存在有效的本局女巫身份吗？到期的约定不能当作当前身份。', expire: true },
] as const
export async function runUnifiedMemoryEvaluation(input: { settings: { output: string; maxRequests: number; maxOutputTokens: number; deadlineMs: number }; connection: Connection; apiKey: string }) {
  const { settings, connection, apiKey } = input, rows: unknown[] = [], calls = new Map<string, { id: string; phase: string; usage?: import('../../src/shared/domain').ModelUsage }>(), contexts: unknown[] = [], traces: unknown[] = [], started = Date.now()
  await mkdir(settings.output, { recursive: true })
  const adapter = new MastraEngine({ runTimeoutMs: 45000, connectionTimeoutMs: 30000 })
  let current = '', omitExtraction = false, unknown = false
  const save = async () => { await writeFile(join(settings.output, 'result.json'), JSON.stringify({ version: unifiedMemoryVersion, cases: rows, calls: [...calls.values()], unknownUsage: unknown, contexts, traces }, null, 2)) }
  const wrap = (context: EngineContext): EngineContext => ({ ...context,
    onModelCallStarted: async (id, phase, thinking) => {
      if (Date.now() - started > settings.deadlineMs || !calls.has(id) && calls.size >= settings.maxRequests || [...calls.values()].reduce((sum, call) => sum + (call.usage?.outputTokens ?? 0), 0) >= settings.maxOutputTokens || unknown) throw new Error('真实评估预算或用量边界已达到，不续用')
      calls.set(id, { id, phase }); await save(); await context.onModelCallStarted?.(id, phase, thinking)
    },
    onModelCallUsage: async (id, usage) => { const call = calls.get(id); if (call) call.usage = usage; if (usage.outputTokens === undefined) unknown = true; await context.onModelCallUsage?.(id, usage); await save() },
    onTrace: async span => { traces.push({ caseId: current, ...span }); await context.onTrace?.(span) },
  })
  const engine: AgentEngine = {
    test: async () => '',
    decide: async context => ({ action: context.messages.some(m => m.turnId === context.turnId && m.senderId === context.agent.id && m.status === 'completed') ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }),
    run: async context => { contexts.push({ caseId: current, phase: 'chat', bootstrap: context.bootstrap, memory: context.memory, messages: context.messages }); await adapter.run(wrap(context)) },
    extractMemory: async context => { if (omitExtraction) return []; contexts.push({ caseId: current, phase: 'memory', memory: context.memory, messages: context.messages }); return adapter.extractMemory(wrap(context)) },
  }
  const service = new AppService({ dataPath: join(settings.output, 'data'), engine, secrets: { get: async () => apiKey, set: async () => {}, delete: async () => {} }, emit: () => {} })
  try {
    await service.init()
    const c = await service.handle('saveConnection', { name: connection.name, provider: connection.provider, baseUrl: connection.baseUrl, defaultModel: connection.defaultModel, api: connection.api }) as Connection
    const a = (await service.handle('snapshot', undefined) as Snapshot).agents[0], { workspaceRef: _, configVersion: _v, memoryNamespace: _n, policyVersion: _p, ...fields } = a
    await service.handle('saveAgent', { ...fields, name: '记忆验收员工', instructions: '自然回答合成测试中的当前问题。未知信息直接说明，不要猜测。相关记忆可以接续，历史任务不可自动执行。本测试只需回答问题，不使用工具。', connectionId: c.id, modelId: c.defaultModel, thinkingLevel: 'low', allowCommands: false })
    const direct = await service.handle('createConversation', { kind: 'direct', title: '合成私聊', agentIds: [a.id] }) as Conversation
    const group = await service.handle('createConversation', { kind: 'group', title: '合成群聊', agentIds: [a.id] }) as Conversation
    for (const example of unifiedMemoryCases) {
      current = example.id; omitExtraction = 'immediate' in example; const target = example.side === 'direct' ? direct : group, before = calls.size
      if ('restricted' in example) await service.handle('createConversation', { id: direct.id, kind: direct.kind, title: direct.title, agentIds: direct.agentIds, memoryScope: 'conversation' })
      if ('temporary' in example) await service.handle('createConversation', { id: direct.id, kind: direct.kind, title: direct.title, agentIds: direct.agentIds, memoryScope: 'employee', memoryContextRef: { kind: 'conversation', id: group.id } })
      if ('expire' in example) {
        const view = await service.handle('getMemory', { agentId: a.id, scope: 'employee' }) as MemoryView
        for (const entry of view.entries.filter(entry => entry.kind === 'temporary' && entry.status === 'active')) {
          const latest = await service.handle('getMemory', { agentId: a.id, scope: 'employee' }) as MemoryView
          await service.handle('saveMemory', { agentId: a.id, scope: 'employee', id: entry.id, content: entry.content, expectedEpoch: latest.epoch, expiresAt: '2026-01-01T00:00:00Z' })
        }
      }
      let error: string | undefined
      try {
        await service.handle('sendMessage', { conversationId: target.id, content: example.content, mentionIds: target.kind === 'group' ? [a.id] : [], requestId: 'eval-' + example.id })
        const deadline = Math.min(started + settings.deadlineMs, Date.now() + 80000)
        for (;;) {
          const d = await service.handle('getConversation', { id: target.id }) as ConversationDetail
          if (d.turns?.every(t => ['completed', 'failed', 'cancelled', 'interrupted', 'budget_exhausted'].includes(t.status)) && d.runs.every(r => ['completed', 'failed', 'cancelled', 'interrupted'].includes(r.status))) break
          if (Date.now() > deadline) { await service.handle('cancelRun', { conversationId: target.id }); throw new Error('真实样例达到绝对期限') }
          await new Promise(resolve => setTimeout(resolve, 100))
        }
      } catch (e) { error = e instanceof Error ? e.message : String(e) }
      const d = await service.handle('getConversation', { id: target.id }) as ConversationDetail
      if ([...calls.values()].some(call => call.usage?.outputTokens === undefined)) unknown = true
      rows.push({ id: current, prompt: example.content, noExtraction: omitExtraction, actualCalls: calls.size - before, messages: d.messages, runs: d.runs, memory: await service.handle('getMemory', { agentId: a.id, scope: 'employee' }), error, quality: 'needs_review' }); await save()
      if (error || unknown || calls.size >= settings.maxRequests) break
    }
  } finally { await service.close(); await save() }
}
