/*
 * [INPUT]: 隔离目录、真实 AppService/SQLite 与成果复制或登记事务断点。
 * [OUTPUT]: 通过生产文件工具复制原件，在指定断点驻留供父进程 SIGKILL；模型判断为离线夹具。
 * [POS]: 成果发布中断的原生进程测试支撑，不进入产品构建。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { RequestContext } from '@mastra/core/request-context'
import { noopObserve } from '@mastra/core/tools'
import { AppService } from '../../packages/runtime/src/service'
import { ProductStore } from '../../packages/runtime/src/adapters/storage/product-store'
import { createTaskRuntime } from '../../packages/runtime/src/adapters/mastra/task-runtime'
import type { AgentEngine } from '../../packages/runtime/src/contracts'
import type { Artifact, Connection, Conversation, Snapshot } from '../../packages/shared/src/domain'

const [root, phase] = process.argv.slice(2), hold = () => new Promise<void>(() => {})
let publication: Artifact | undefined
const checkpoint = async () => { process.send?.({ conversationId: conversation.id, artifact: publication }); await hold() }
const engine: AgentEngine = {
  test: async () => '',
  decide: async context => ({ action: 'reply', responseKind: 'task', observedThroughSequence: context.participation!.observedThroughSequence, work: { key: 'publication-crash', scope: '生成本次报告', deliverable: '可核对 Markdown 文件' } }),
  run: async context => {
    const accepted = context.onArtifact!
    context.onArtifact = async artifact => {
      publication = artifact
      if (phase === 'before-register') await checkpoint()
      await accepted(artifact)
    }
    const runtime = await createTaskRuntime(context), invocation = { requestContext: new RequestContext(), observe: noopObserve }
    try {
      const path = `self:/runs/${context.runId}/report.md`
      await runtime.tools.write_file.execute!({ path, content: '# 已复制但尚未交付\n原始内容。' }, invocation)
      await runtime.tools.publish_artifact.execute!({ path, name: 'report.md' }, invocation)
      throw new Error('测试必须停在发布断点')
    } finally { await runtime.workspace.destroy() }
  },
}
const service = new AppService({ dataPath: root, engine, secrets: { get: async () => '', set: async () => {}, delete: async () => {} }, emit: () => {} })
await service.init()
const connection = await service.handle('saveConnection', { name: '离线中断场景', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1/v1', defaultModel: 'fixture' }) as Connection
const agent = (await service.handle('snapshot', undefined) as Snapshot).agents.find(value => value.id === 'researcher')!
const { configVersion: _, workspaceRef: _w, memoryNamespace: _m, policyVersion: _p, ...input } = agent
await service.handle('saveAgent', { ...input, connectionId: connection.id, modelId: 'fixture' })
const conversation = await service.handle('createConversation', { kind: 'direct', title: '成果登记中断', agentIds: [agent.id] }) as Conversation
const store = (service as unknown as { store: ProductStore }).store, transaction = store.transaction.bind(store)
store.transaction = (async operation => {
  let touched = false
  const result = await transaction(async tx => {
    const value = await operation({ ...tx, put: async record => {
      await tx.put(record)
      if (record.collection === 'artifacts' && record.id === publication?.id) touched = true
    } })
    if (touched && phase === 'before-commit') await checkpoint()
    return value
  })
  if (touched && phase === 'after-commit') await checkpoint()
  return result
}) as ProductStore['transaction']
await service.handle('sendMessage', { conversationId: conversation.id, content: '生成报告并发布文件。', mentionIds: [], requestId: 'crash-publication' })
await hold()
