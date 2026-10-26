/*
 * [INPUT]: BC-v1 全已有/缺员混合真实需求、显式模型连接与仅内存凭据、生产 AppService/Mastra。
 * [OUTPUT]: 实际组织/群成员交流/依赖成果/唯一预算/重启不重放证据；并行回执串行原子保存，累计模型上限、技术检查和人工质量 pending 分开。
 * [POS]: BC4 手动真实供应商评估；不替换判断/文件/群调度，也不改冻结留出题或用户库。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
import { AppService } from '../../packages/runtime/src/service'
import { MastraEngine } from '../../packages/runtime/src/adapters/mastra/engine'
import type { AgentEngine, EngineContext } from '../../packages/runtime/src/contracts'
import type { Connection, Conversation, ConversationDetail, ModelUsage, Snapshot } from '../../packages/shared/src/domain'
import type { BoboCollaborationReceipt } from '../../packages/shared/src/domain/bobo-collaboration'

export const boboCollaborationVersion = 'BC-v1'
const cases = [
  { id: 'all-existing', missingWriter: false, prompt: '请实际组织并完成任务：只使用通讯录中的已有研究员和已有写作员，拉一个新的独立群。研究员先核算12、27、40的合计并发布数据Markdown原件；写作员等待该真实研究成果，读取原件后撰写并发布简洁Markdown报告，正文加 BC_REAL_COLLABORATION_REPORT。你以自己的身份在群中说明目标和分工，等待真实交付后汇总。请通过实际组织工具和群工作完成，不仅给文字计划；员工始终保持独立身份。' },
  { id: 'missing-writer', missingWriter: true, prompt: '请实际组织并完成任务：先找通讯录中的已有研究员，缺少写作员就创建一位必要的写作员工，再拉一个新的独立群。研究员先核算8、19、31的合计并发布数据Markdown原件；写作员等待该真实成果，读取后撰写并发布报告，正文加 BC_REAL_COLLABORATION_REPORT。你在群中以自己的身份说明目标与分工，等待成员实际交付后汇总；不要重复创建已有研究员，不要读取或复制我的无关私聊。' },
] as const
interface Settings { version: string; output: string; maxRequests: number; maxOutputTokens: number; deadlineMs: number }
export async function runBoboCollaborationEvaluation(input: { settings: Settings; connection: Connection; apiKey: string }) {
  const { settings, connection, apiKey } = input, started = Date.now(), calls = new Map<string, { id: string; caseId: string; phase: string; usage?: ModelUsage }>(), rows: unknown[] = [], traces: unknown[] = []
  let unknownUsage = false, current = '', service: AppService | undefined
  const adapter = new MastraEngine({ runTimeoutMs: 45000, connectionTimeoutMs: 30000 })
  let saveQueue = Promise.resolve()
  const save = async () => {
    const serialized = JSON.stringify({ version: boboCollaborationVersion, cases: rows, calls: [...calls.values()], traces, unknownUsage, credentialsSaved: false, humanReview: { status: 'pending', questions: ['成员选择与缺员补齐是否合理？','两个员工成果是否正确且实际互相依赖？','群沟通与最终报告是否实用？'] } }, null, 2)
    const payload = apiKey ? serialized.split(apiKey).join('[redacted]') : serialized
    const pending = saveQueue.then(async () => {
      await writeFile(join(settings.output, 'result.pending.json'), payload)
      await rename(join(settings.output, 'result.pending.json'), join(settings.output, 'result.json'))
    })
    saveQueue = pending.catch(() => {})
    await pending
  }
  const wrap = (context: EngineContext): EngineContext => ({ ...context,
    onModelCallStarted: async (id, phase, thinking) => {
      const used = [...calls.values()].reduce((sum, call) => sum + (call.usage?.outputTokens ?? 0), 0)
      if (Date.now() - started >= settings.deadlineMs || !calls.has(id) && calls.size >= settings.maxRequests || used >= settings.maxOutputTokens || unknownUsage) throw new Error('BC-v1 实际模型共享预算/期限或未知用量门禁已到，不续用')
      calls.set(id, { id, caseId: current, phase }); await save(); await context.onModelCallStarted?.(id, phase, thinking)
    },
    onModelCallUsage: async (id, usage) => { const call = calls.get(id); if (call) call.usage = usage; if (usage.outputTokens === undefined) unknownUsage = true; await context.onModelCallUsage?.(id, usage); await save() },
    onTrace: async span => { traces.push({ caseId: current, ...span }); await context.onTrace?.(span) },
  })
  const engine: AgentEngine = { test: (...args) => adapter.test(...args), decide: context => adapter.decide(wrap(context)), run: context => adapter.run(wrap(context)), extractMemory: context => adapter.extractMemory(wrap(context)), report: (context, draft) => adapter.report(wrap(context), draft) }
  await mkdir(settings.output, { recursive: true }); await save()
  try {
    for (const example of cases) {
      current = example.id; const dataPath = join(settings.output, example.id, 'data'), beforeCalls = calls.size
      service = new AppService({ dataPath, engine, secrets: { get: async () => apiKey, set: async () => {}, delete: async () => {} }, emit: () => {} }); await service.init()
      const configured = await service.handle('saveConnection', { name: connection.name, provider: connection.provider, baseUrl: connection.baseUrl, defaultModel: connection.defaultModel, api: connection.api }) as Connection
      const initial = await service.handle('snapshot', undefined) as Snapshot
      for (const employee of initial.agents) {
        const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...fields } = employee
        await service.handle('saveAgent', { ...fields, name: employee.id === 'researcher' ? '已有研究员' : employee.id === 'writer' ? '已有写作员' : employee.name, connectionId: configured.id, modelId: configured.defaultModel, allowCommands: false, allowBrowser: false, thinkingLevel: 'low', active: employee.id === 'bobo' || employee.id === 'researcher' || employee.id === 'writer' && !example.missingWriter, expectedConfigVersion: configVersion })
      }
      const before = await service.handle('snapshot', undefined) as Snapshot
      let original: Conversation | undefined, receipt: BoboCollaborationReceipt | undefined, error: string | undefined, group: ConversationDetail | undefined
      try {
        original = await service.handle('startCoreConversation', { requestId: `BC-v1-${example.id}`, content: example.prompt }) as Conversation
        const deadline = Math.min(started + settings.deadlineMs, Date.now() + 110000)
        while (Date.now() < deadline) {
          receipt = (await service.handle('listBoboCollaborationOperations', { conversationId: original.id }) as BoboCollaborationReceipt[]).find(operation => operation.status === 'committed')
          if (receipt?.groupConversationId) {
            group = await service.handle('getConversation', { id: receipt.groupConversationId }) as ConversationDetail
            const root = group.workItems?.find(work => work.id === receipt!.groupRootWorkId)
            if (root && ['delivered','failed','cancelled','interrupted','blocked'].includes(root.status) && group.runs.every(run => ['completed','failed','cancelled','interrupted'].includes(run.status))) break
          }
          await new Promise(resolve => setTimeout(resolve, 150))
        }
        if (!receipt) throw new Error('真实模型没有发布可核对组织回执')
        if (!group?.workItems?.some(work => work.id === receipt!.groupRootWorkId && work.status === 'delivered')) throw new Error('原群业务根没有实际交付，模型文字不能计为成功')
      } catch (failure) { error = failure instanceof Error ? failure.message : String(failure); if (original) await service.handle('cancelRun', { conversationId: original.id }).catch(() => {}); if (receipt?.groupConversationId) await service.handle('cancelRun', { conversationId: receipt.groupConversationId }).catch(() => {}) }
      const after = await service.handle('snapshot', undefined) as Snapshot
      const originals: { id: string; ownerAgentId: string; hash: string; text: string; hashMatches: boolean }[] = []
      for (const artifact of group?.artifacts ?? []) { if (!artifact.id || !artifact.ownerAgentId) throw new Error('公开成果缺少真实 Artifact/员工身份，不能计为证据'); const text = await readFile(artifact.path, 'utf8'); const hash = createHash('sha256').update(text).digest('hex'); originals.push({ id: artifact.id, ownerAgentId: artifact.ownerAgentId, hash, text, hashMatches: hash === artifact.contentHash }) }
      const db = new DatabaseSync(join(dataPath, 'boai.sqlite'), { readOnly: true }), load = (collection: string) => db.prepare('SELECT value FROM records WHERE collection=?').all(collection).map(row => JSON.parse(String(row.value)))
      let records: any; try { records = { works: load('workItems'), budgets: load('workBudgets'), modelCalls: load('budgetModelCalls'), starts: load('collaborationStarts'), operations: load('boboCollaborations') } } finally { db.close() }
      const org = records.works.find((work:any) => work.organization), root = records.works.find((work:any) => work.id === receipt?.groupRootWorkId), children = records.works.filter((work:any) => work.parentWorkId === root?.id)
      const checks = { originalCoreRetained: after.conversations.some(conversation => conversation.id === original?.id && conversation.purpose === 'core' && conversation.agentIds.length === 1 && conversation.agentIds[0] === 'bobo'), independentGroup: !!receipt?.groupConversationId && receipt.groupConversationId !== original?.id, expectedNewEmployees: after.agents.length - before.agents.length === (example.missingWriter ? 1 : 0), researcherReused: group?.conversation.agentIds.includes('researcher') === true && JSON.stringify(after.agents.find(agent => agent.id === 'researcher')) === JSON.stringify(before.agents.find(agent => agent.id === 'researcher')), twoEmployeeArtifacts: new Set(originals.filter(original => original.ownerAgentId !== 'bobo' && original.hashMatches).map(original => original.ownerAgentId)).size >= 2, dependencyDelivered: children.some((work:any) => work.status === 'delivered' && work.dependsOnWorkIds.some((id:string) => children.some((dependency:any) => dependency.id === id && dependency.status === 'delivered'))), oneSharedBudget: !!org && !!root && org.budgetId === root.budgetId && records.budgets.length === 1 && records.works.every((work:any) => work.budgetId === root.budgetId), knownUsage: records.budgets.length === 1 && !records.budgets[0].usageIncomplete, budgetBounded: records.budgets.every((budget:any) => budget.modelCalls <= budget.maxModelCalls) }
      await service.close(); service = undefined
      const callsAtRestart = calls.size
      service = new AppService({ dataPath, engine, secrets: { get: async () => apiKey, set: async () => {}, delete: async () => {} }, emit: () => {} }); await service.init(); const restored = await service.handle('snapshot', undefined) as Snapshot
      Object.assign(checks, { restartNoModelReplay: calls.size === callsAtRestart, restartObjectsRetained: !!receipt?.groupConversationId && restored.conversations.some(conversation => conversation.id === receipt!.groupConversationId) })
      rows.push({ id: example.id, prompt: example.prompt, receipt, group, originals, records, checks, error, actualCalls: calls.size - beforeCalls, status: !error && Object.values(checks).every(Boolean) ? 'technical_pass_human_pending' : 'failed_or_incomplete', humanQuality: 'pending' }); await save(); await service.close(); service = undefined
      if (unknownUsage || calls.size >= settings.maxRequests || Date.now() - started >= settings.deadlineMs) break
    }
  } finally { await service?.close(); await save() }
  if (rows.length !== cases.length || rows.some((row:any) => row.status !== 'technical_pass_human_pending')) process.exitCode = 1
}
