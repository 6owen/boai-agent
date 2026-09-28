/*
 * [INPUT]: SQLite 清理用例与独立本地数据目录。
 * [OUTPUT]: 增加 Trace 随会话删除且保留其他会话记录；关联记录删除、共享数据保留、重启续清与符号链接边界验证。
 * [POS]: tests/conversation-history.test.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Conversation } from '../src/shared/domain'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { ConversationHistory } from '../src/runtime/modules/conversations/history'
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

it('removes linked content while preserving other conversations, contacts, shared resources and native trigger identities', async () => {
  const { root, store, conversation, history } = await setup()
  const owned = ['traceSpans', 'messages', 'runs', 'turns', 'events', 'deliveries', 'approvals', 'artifacts', 'jobs', 'workWakes']
  await store.write([
    ...owned.flatMap(collection => [row(collection, 'target', { conversationId: 'c' }), row(collection, 'other', { conversationId: 'elsewhere' })]),
    ...['decisions', 'contributions', 'grants'].map(collection => row(collection, 'target', { turnId: 'target' })),
    row('snapshots', 'target', { conversation: { id: 'c' } }),
    row('workItems', 'work', { conversationId: 'c', budgetId: 'budget' }), row('workExecutions', 'execution', { workId: 'work' }), row('workBudgets', 'budget', {}),
    row('requests', 'retry', { fingerprint: JSON.stringify({ kind: 'retry', id: 'target' }) }), row('requests', 'message', { messageId: 'target' }),
    row('memory', 'memory', { ownerAgentId: 'a', conversationId: 'c', scope: 'conversation', sourceMessageIds: ['target'] }),
    row('memory', 'profile', { ownerAgentId: 'a', scope: 'profile', sourceMessageIds: [] }),
    row('memoryEpochs', 'employee:a:conversation:c', { epoch: 9 }),
    row('automationOccurrences', 'occurrence', { conversationId: 'c', status: 'completed', nativeRunId: 'native-id', messageId: 'target', turnId: 'target', reason: 'private text', runIds: ['target'], resultMessageIds: ['target'] }),
  ])
  const session = join(root, 'agents/a/workspace/sessions/c'), external = join(root, 'external-workspaces/a/c'), runtime = join(root, 'external-runtime/target')
  for (const path of [session, external, runtime]) { await mkdir(path, { recursive: true }); await writeFile(join(path, 'media.png'), 'remove') }
  await mkdir(join(root, 'knowledge'), { recursive: true }); await writeFile(join(root, 'knowledge/shared.txt'), 'keep')
  await writeFile(join(conversation.workspacePath, 'file.mp4'), 'remove')
  const result = await history.clear(conversation, true)
  for (const collection of owned) expect(await store.load(collection)).toEqual([{ id: 'other', conversationId: 'elsewhere' }])
  for (const collection of ['snapshots', 'workItems', 'workExecutions', 'workBudgets', 'decisions', 'contributions', 'grants', 'requests', 'conversationCleanup']) expect(await store.load(collection)).toEqual([])
  expect(await store.load('memory')).toEqual([{ id: 'profile', ownerAgentId: 'a', scope: 'profile', sourceMessageIds: [] }])
  expect(result.memoryEpochs).toContainEqual({ id: 'employee:a:conversation:c', epoch: 10 })
  expect(result.conversation).toMatchObject({ id: 'c', agentIds: ['a'], sharedKnowledgeIds: ['shared'], list: { hidden: true } })
  expect(await store.load('automationOccurrences')).toEqual([{ id: 'occurrence', conversationId: 'c', status: 'completed', nativeRunId: 'native-id', reason: '聊天记录已清空', runIds: [], resultMessageIds: [] }])
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
