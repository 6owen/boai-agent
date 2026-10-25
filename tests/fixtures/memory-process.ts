/*
 * [INPUT]: 场景独立数据路径、真实 AppService/SQLite 和提交断点。
 * [OUTPUT]: 在整理事务提交前/后驻留，供父进程 SIGKILL；不进入产品构建。
 * [POS]: T2.4 原生进程中断支撑。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { AppService } from '../../packages/runtime/src/service'
import { ProductStore } from '../../packages/runtime/src/adapters/storage/product-store'
import type { AgentEngine } from '../../packages/runtime/src/contracts'
import type { Connection, Conversation, Snapshot } from '../../packages/shared/src/domain'
const [root, phase] = process.argv.slice(2), hold = () => new Promise<void>(() => {})
const engine: AgentEngine = {
  test: async () => '', decide: async context => ({ action: context.messages.some(m => m.senderId === context.agent.id && m.turnId === context.turnId) ? 'pass' : 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }),
  run: async context => { await context.onDelta('真实进程已接收消息') }, extractMemory: async context => [{ content: '未完成摘要', sourceMessageIds: [context.triggerMessageId!] }],
}
const service = new AppService({ dataPath: root, engine, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} }); await service.init()
const connection = await service.handle('saveConnection', { name: 'crash', provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', defaultModel: 'test' }) as Connection
const a = (await service.handle('snapshot', undefined) as Snapshot).agents[0], { configVersion: _, workspaceRef: _w, memoryNamespace: _n, policyVersion: _p, ...input } = a
await service.handle('saveAgent', { ...input, connectionId: connection.id, modelId: 'test' })
await service.handle('saveMemory', { agentId: a.id, scope: 'employee', content: '已提交基线', expectedEpoch: 0, requestId: 'baseline' })
const c = await service.handle('createConversation', { kind: 'direct', title: '中断试验', agentIds: [a.id] }) as Conversation
const store = (service as unknown as { store: ProductStore }).store, transaction = store.transaction.bind(store)
store.transaction = (async operation => {
  let touched = false
  const result = await transaction(tx => operation({ ...tx, put: async record => {
    await tx.put(record)
    if (record.collection === 'memory' && (record.value as { content?: string }).content === '未完成摘要') {
      touched = true
      if (phase === 'before-commit') { process.send?.({ conversationId: c.id, agentId: a.id }); await hold() }
    }
  } }))
  if (touched && phase === 'after-commit') { process.send?.({ conversationId: c.id, agentId: a.id }); await hold() }
  return result
}) as ProductStore['transaction']
await service.handle('sendMessage', { conversationId: c.id, content: '真实进程中断提取', mentionIds: [], requestId: 'crash' })
await hold()
