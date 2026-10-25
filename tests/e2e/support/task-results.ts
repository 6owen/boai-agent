/*
 * [INPUT]: A test-owned Desktop with an isolated temporary profile.
 * [OUTPUT]: Real persisted Work/Run/message/artifact fixture with canonical temporary-path guard for task-result UI/CLI; zero model calls or mocked API responses.
 * [POS]: Optional focused desktop verification support; never accepts a personal data path.
 * [PROTOCOL]: Update Header and support/.folder.md on change.
 */
import { isAbsolute, join, relative, sep } from 'node:path'
import { mkdir, realpath, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import type { AgentRun, Conversation, DigitalAgent, Message, WorkItem } from '../../../packages/shared/src/domain'
import { ProductStore } from '../../../packages/runtime/src/adapters/storage/product-store'
import { ArtifactRepository } from '../../../packages/runtime/src/modules/workspaces/artifact-repository'
import { newWorkBudget } from '../../../packages/runtime/src/modules/collaboration/work-budget'
import type { Desktop } from './desktop'

export async function prepareTaskResults(runtime: Desktop) {
  await runtime.start()
  const setup = await runtime.page.evaluate(async () => {
    const snapshot = await window.boai.request('snapshot', undefined)
    const agent = snapshot.agents.find(value => value.id === 'researcher') ?? snapshot.agents.find(value => !value.systemRole && value.active)
    if (!agent) throw new Error('隔离profile缺少普通员工')
    const conversation = await window.boai.request('createConversation', { kind: 'group', title: '任务结果隔离验收', agentIds: [agent.id] })
    return { dataPath: snapshot.dataPath, conversation, agent }
  })
  const child = relative(await realpath(runtime.root), await realpath(setup.dataPath))
  if (!child || isAbsolute(child) || child === '..' || child.startsWith(`..${sep}`)) throw new Error('只允许写本场景的临时profile')
  await runtime.close()
  const store = new ProductStore(join(setup.dataPath, 'boai.sqlite')); await store.init()
  const time = new Date().toISOString(), workId = 'task-result-fixture-work', runId = 'task-result-fixture-run'
  const source: Message = { id: 'task-result-fixture-source', conversationId: setup.conversation.id, senderType: 'user', senderId: 'user', senderName: '本人', content: '核对任务结果夹具', status: 'completed', createdAt: time, sequence: 1 }
  const answer: Message = { ...source, id: 'task-result-fixture-answer', senderType: 'agent', senderId: setup.agent.id, senderName: setup.agent.name, content: '已保留阶段结果，后续步骤失败。', runId, sequence: 2 }
  const work: WorkItem = { id: workId, schemaVersion: 2, conversationId: setup.conversation.id, sourceMessageId: source.id, key: 'fixture', scope: '核对任务结果夹具', deliverable: '可读取的阶段报告与真实失败记录', ownerAgentId: setup.agent.id, version: 1, status: 'failed', budgetId: 'task-result-fixture-budget', rootWorkId: workId, dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: [answer.id], artifactIds: ['task-result-fixture-file'], resultVersion: 1, requiresReview: true, outcome: { disposition: 'progress', summary: '阶段报告已保存；后续操作结果尚待人工核对。' }, createdAt: time, updatedAt: time }
  const run: AgentRun = { id: runId, conversationId: setup.conversation.id, agentId: setup.agent.id, agentName: setup.agent.name, triggerMessageId: source.id, messageId: answer.id, workId, status: 'failed', phase: 'execution', responseKind: 'task', createdAt: time, finishedAt: time, error: '隔离夹具：后续步骤失败，保留已交付文件。', toolEvents: [{ id: 'fixture-tool', name: 'publish_artifact', status: 'completed', detail: '阶段报告已发布', createdAt: time }] }
  const file = join(setup.dataPath, 'workspaces', setup.conversation.id, 'artifacts', 'fixture', '阶段报告.md'), content = '# 阶段报告\n\n这是从真实受管文件读取的结果。\n', hash = createHash('sha256').update(content).digest('hex')
  try {
    await mkdir(join(file, '..'), { recursive: true }); await writeFile(file, content)
    const row = (collection: string, value: { id: string }) => ({ collection, id: value.id, value })
    await store.write([row('conversations', { ...setup.conversation, lastMessageAt: time, updatedAt: time } as Conversation), row('messages', source), row('messages', answer), row('workItems', work), row('runs', run), row('workBudgets', newWorkBudget(work.budgetId)), row('snapshots', { id: runId, agent: setup.agent as DigitalAgent, conversation: setup.conversation, resources: [], materialRefs: [] } as { id: string })])
    const artifacts = new ArtifactRepository(store, setup.dataPath)
    await store.transaction(tx => artifacts.register(tx, { id: 'task-result-fixture-file', name: '阶段报告.md', path: file, size: Buffer.byteLength(content), ownerAgentId: setup.agent.id, runId, contentHash: hash }, { conversationId: setup.conversation.id, sourceMessageId: answer.id, sourceWorkId: workId, revisionRequestId: null }))
  } finally { await store.close() }
  await runtime.start()
  return { dataPath: setup.dataPath, conversationId: setup.conversation.id, workId, runId, file, content, hash }
}
