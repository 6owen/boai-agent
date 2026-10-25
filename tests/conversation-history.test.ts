/*
 * [OUTPUT]: 原清理恢复先处理关联讨论，保留其独立待决回执，最后完成父会话删除并保持共享资料。
 * [INPUT]: SQLite 清理用例与独立本地数据目录。
 * [OUTPUT]: T2 清理前来源屏障与后续历史清理各推进版本；待提交和提交中通知的清理/状态与引用不复活；无 Work 的自动化预算及调用回执清理验证；Trace 随会话删除；自动化跨工作证据清除/等待终结/去重保留、关联记录删除、共享数据保留、重启续清与符号链接边界验证。
 * [POS]: tests/conversation-history.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Conversation } from '../packages/shared/src/domain'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { ConversationHistory } from '../packages/runtime/src/modules/conversations/history'
import { prepareSessionDeletion, sessionFingerprint, type SessionOperationRecord } from '../packages/runtime/src/modules/conversations/session-operations'
const fixtures: { root: string; store: ProductStore }[] = []
const row = (collection: string, id: string, value: object) => ({ collection, id, value: { id, ...value } })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'boai-cleanup-')), store = new ProductStore(join(root, 'boai.sqlite'))
  fixtures.push({ root, store }); await store.init()
  const conversation: Conversation = { id: 'c', title: '清理对象', kind: 'group', agentIds: ['a'], mode: 'natural', sharedKnowledgeIds: ['shared'], workspacePath: join(root, 'workspaces', 'c'), createdAt: '2026-01-01', updatedAt: '2026-01-01' }
  await mkdir(conversation.workspacePath, { recursive: true })
  await store.write([row('conversations', 'c', conversation), row('agents', 'a', { name: '保留的联系人' }), row('resources', 'shared', { name: '共享知识' })])
  return { root, store, conversation, history: new ConversationHistory(store, root) }
}
afterEach(async () => { for (const { root, store } of fixtures.splice(0)) { await store.close(); await rm(root, { recursive: true, force: true }) } })

it('recovers dependent discussion cleanup before completing the parent session receipt', async () => {
  const { root, store, conversation, history } = await setup()
  const discussion: Conversation = { ...conversation, id: 'discussion', purpose: 'channel-internal', channelDiscussion: { conversationId: conversation.id, epoch: 1 }, workspacePath: join(root, 'workspaces', 'discussion') }
  await mkdir(discussion.workspacePath, { recursive: true })
  await store.write([row('conversations', discussion.id, discussion), row('messages', 'parent-message', { conversationId: conversation.id }), row('messages', 'discussion-message', { conversationId: discussion.id })])
  const receipt = (requestId: string, conversationId: string): SessionOperationRecord => ({ id: requestId, requestId, operation: 'delete', conversationId, state: 'pending', fingerprint: sessionFingerprint({ operation: 'delete', conversationId }) })
  await prepareSessionDeletion(store, discussion, [], receipt('discussion-request', discussion.id))
  await prepareSessionDeletion(store, conversation, [discussion], receipt('parent-request', conversation.id))
  expect(await history.recover()).toEqual([])
  expect(await store.get('conversations', discussion.id)).toBeUndefined()
  expect(await store.get('conversations', conversation.id)).toMatchObject({ list: { hidden: true } })
  expect(await store.get('sessionReceipts', 'discussion-request')).toMatchObject({ state: 'completed' })
  expect(await store.get('sessionReceipts', 'parent-request')).toMatchObject({ state: 'completed' })
  expect(await store.load('messages')).toEqual([])
  expect(await store.load('conversationCleanup')).toEqual([])
  expect(await store.get('resources', 'shared')).toMatchObject({ name: '共享知识' })
})

it('removes linked content while preserving other conversations, contacts, shared resources and native trigger identities', async () => {
  const { root, store, conversation, history } = await setup()
  const owned = ['traceSpans', 'messages', 'runs', 'turns', 'events', 'deliveries', 'approvals', 'artifacts', 'jobs', 'workWakes']
  await store.write([
    ...owned.flatMap(collection => [row(collection, 'target', { conversationId: 'c' }), row(collection, 'other', { conversationId: 'elsewhere' })]),
    ...['decisions', 'contributions', 'grants'].map(collection => row(collection, 'target', { turnId: 'target' })),
    row('snapshots', 'target', { conversation: { id: 'c' } }),
    row('workItems', 'work', { conversationId: 'c', budgetId: 'budget' }), row('workExecutions', 'execution', { workId: 'work' }), row('workBudgets', 'budget', {}),
    row('requests', 'retry', { fingerprint: JSON.stringify({ kind: 'retry', id: 'target' }) }), row('requests', 'message', { messageId: 'target' }),
    row('memory', 'memory', { ownerAgentId: 'a', conversationId: 'c', scope: 'conversation', content: '须删除的来源记忆', sourceMessageIds: ['target'], sourceResourceIds: [], origin: 'model', version: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01' }),
    row('memory', 'profile', { ownerAgentId: 'a', scope: 'profile', sourceMessageIds: [] }),
    row('memoryEpochs', 'employee:a:conversation:c', { epoch: 9 }),
    row('automationOccurrences', 'occurrence', { conversationId: 'c', status: 'completed', nativeRunId: 'native-id', messageId: 'target', turnId: 'target', reason: 'private text', runIds: ['target'], resultMessageIds: ['target'] }),
    row('automationDispatches', 'occurrence', { schemaVersion: 1, requestId: 'automatic-request', status: 'started', definition: { prompt: 'private text' }, messageId: 'target', turnId: 'target', origin: { name: 'private source' } }),
    row('automationTriggerAliases', 'native-alias', { occurrenceId: 'occurrence' }),
  ])
  const session = join(root, 'agents/a/workspace/sessions/c'), external = join(root, 'external-workspaces/a/c'), runtime = join(root, 'external-runtime/target')
  for (const path of [session, external, runtime]) { await mkdir(path, { recursive: true }); await writeFile(join(path, 'media.png'), 'remove') }
  await mkdir(join(root, 'knowledge'), { recursive: true }); await writeFile(join(root, 'knowledge/shared.txt'), 'keep')
  await writeFile(join(conversation.workspacePath, 'file.mp4'), 'remove')
  const result = await history.clear(conversation, true)
  for (const collection of owned) expect(await store.load(collection)).toEqual([{ id: 'other', conversationId: 'elsewhere' }])
  for (const collection of ['snapshots', 'workItems', 'workExecutions', 'workBudgets', 'decisions', 'contributions', 'grants', 'requests', 'conversationCleanup']) expect(await store.load(collection)).toEqual([])
  expect(await store.load('memory')).toEqual([{ id: 'profile', ownerAgentId: 'a', scope: 'profile', sourceMessageIds: [] }])
  expect(result.memoryEpochs).toContainEqual({ id: 'employee:a:conversation:c', epoch: 11 })
  expect(result.conversation).toMatchObject({ id: 'c', agentIds: ['a'], sharedKnowledgeIds: ['shared'], list: { hidden: true } })
  expect(await store.load('automationOccurrences')).toEqual([{ id: 'occurrence', conversationId: 'c', status: 'completed', nativeRunId: 'native-id', reason: '聊天记录已清空', runIds: [], resultMessageIds: [] }])
  expect(await store.load('automationDispatches')).toEqual([{ schemaVersion: 1, id: 'occurrence', requestId: 'automatic-request', status: 'cleared' }])
  expect(await store.load('automationTriggerAliases')).toEqual([{ id: 'native-alias', occurrenceId: 'occurrence' }])
  expect(await store.load('agents')).toHaveLength(1); expect(await store.load('resources')).toHaveLength(1)
  expect(await readFile(join(root, 'knowledge/shared.txt'), 'utf8')).toBe('keep')
  for (const path of [session, external, runtime]) await expect(readFile(join(path, 'media.png'))).rejects.toMatchObject({ code: 'ENOENT' })
  await expect(readFile(join(conversation.workspacePath, 'file.mp4'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('resumes a durable cleanup after restart and finishes only once', async () => {
  const { store, conversation, history } = await setup()
  await store.write([row('messages', 'm', { conversationId: 'c', content: 'private' }), row('conversationCleanup', 'c', { hide: false })])
  await writeFile(join(conversation.workspacePath, 'file.txt'), 'remove')
  await history.recover()
  const epoch = await store.load('memoryEpochs')
  await history.recover()
  expect(await store.load('messages')).toEqual([])
  expect(await store.load('memoryEpochs')).toEqual(epoch)
  expect(await store.load('conversationCleanup')).toEqual([])
  await expect(readFile(join(conversation.workspacePath, 'file.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('clears private cross-work evidence and ends a waiting occurrence without deleting its trigger identity', async () => {
  const { store, conversation, history } = await setup()
  await store.write([
    row('automationOccurrences', 'waiting', { schemaVersion: 1, stateVersion: 4, conversationId: 'c', status: 'waiting_work', deliveryStatus: 'partial', turnId: 'turn', turnIds: ['turn', 'continued'], workIds: ['parent', 'child'], rootWorkIds: ['parent'], resultEvidence: [{ reference: 'private result' }], runIds: ['run'], resultMessageIds: ['message'], nativeRunId: 'native' }),
    row('automationTriggerAliases', 'alias', { occurrenceId: 'waiting' }),
    row('automationNotices', 'pending-notice', { occurrenceId: 'waiting', conversationId: 'c', messageId: 'message', status: 'pending' }),
    row('automationNotices', 'in-flight-notice', { occurrenceId: 'waiting', conversationId: 'c', messageId: 'message', status: 'submitting', attemptId: 'attempt' }),
    row('workBudgets', 'before-any-work', { conversationId: 'c', accounting: 'model-calls-v1' }),
    row('budgetModelCalls', 'decision', { conversationId: 'c', budgetId: 'before-any-work', runId: 'run' }),
  ])
  await history.clear(conversation, false)
  const records = await store.load('automationOccurrences')
  expect(records).toEqual([{ id: 'waiting', schemaVersion: 1, stateVersion: 5, conversationId: 'c', status: 'interrupted', deliveryStatus: 'unknown', runIds: [], resultMessageIds: [], nativeRunId: 'native', finishedAt: expect.any(String), reason: '聊天记录已清空' }])
  expect(await store.load('automationTriggerAliases')).toEqual([{ id: 'alias', occurrenceId: 'waiting' }])
  expect(await store.load('automationNotices')).toEqual([{ id: 'pending-notice', occurrenceId: 'waiting', status: 'suppressed', error: '聊天记录已清理', finishedAt: expect.any(String) }, { id: 'in-flight-notice', occurrenceId: 'waiting', status: 'unknown', attemptId: 'attempt', error: '聊天记录已清理', finishedAt: expect.any(String) }])
  expect(await store.load('budgetModelCalls')).toEqual([])
  expect(await store.load('workBudgets')).toEqual([])
})

it('rejects a symlinked parent before any destructive work and ignores stored external file paths', async () => {
  const { root, store, conversation, history } = await setup()
  const outside = join(root, 'outside')
  await mkdir(join(outside, 'sessions/c'), { recursive: true }); await writeFile(join(outside, 'sessions/c/keep'), 'keep')
  await mkdir(join(root, 'agents/a'), { recursive: true }); await symlink(outside, join(root, 'agents/a/workspace'))
  await writeFile(join(conversation.workspacePath, 'still-here'), 'keep')
  await expect(history.clear(conversation, false)).rejects.toThrow('符号链接')
  expect(await readFile(join(outside, 'sessions/c/keep'), 'utf8')).toBe('keep')
  expect(await readFile(join(conversation.workspacePath, 'still-here'), 'utf8')).toBe('keep')
  expect(await store.load('conversationCleanup')).toEqual([])
  await rm(join(root, 'agents/a/workspace'))
  await store.write([row('artifacts', 'outside-path', { conversationId: 'c', path: join(outside, 'sessions/c/keep'), sourcePath: join(outside, 'sessions/c/keep') })])
  await history.clear({ ...conversation, workspacePath: outside }, false)
  expect(await readFile(join(outside, 'sessions/c/keep'), 'utf8')).toBe('keep')
})
