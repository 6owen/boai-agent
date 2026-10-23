/*
 * [INPUT]: Mastra LibSQL adapter and completed ProductStore-shaped public messages.
 * [OUTPUT]: R-M1/R-M2 persistence, same-turn deduplication, forgotten-source pruning, single-thread and all-thread clear.
 * [POS]: Focused integration test using the installed Mastra storage packages.
 * [PROTOCOL]: Update this Header and tests/.folder.md when this file changes.
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Message } from '../src/shared/domain'
import { BoboConversationMemory } from '../src/runtime/adapters/mastra/conversation-memory'

const roots: string[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const message = (id: string, sequence: number, senderType: 'user' | 'agent', content: string, turnId: string): Message => ({
  id, sequence, senderType, senderId: senderType === 'agent' ? 'bobo' : 'user', senderName: senderType === 'agent' ? 'bobo' : '我',
  content, turnId, conversationId: 'room', createdAt: new Date(2026, 0, 1, 0, sequence).toISOString(), status: 'completed',
} as Message)
const text = (entry: Awaited<ReturnType<BoboConversationMemory['memory']['recall']>>['messages'][number]) => entry.content.parts.filter(part => part.type === 'text').map(part => part.text).join('')

it('projects completed prior turns into Mastra once, excludes the current request and prunes forgotten sources', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-bobo-memory-')); roots.push(root)
  const path = join(root, 'memory', 'bobo.db')
  const history = [message('u1', 1, 'user', '我喜欢简短回复', 't1'), message('a1', 2, 'agent', '我会简洁回答', 't1')]
  const current = message('u2', 3, 'user', '今天讨论什么？', 't2')
  const adapter = new BoboConversationMemory(path)
  const prepared = await adapter.prepare([...history, current], 'room', current.id, current.turnId, '用户明确偏好：简短回复；来源 u1')
  expect(prepared.current.map(item => item.id)).toEqual(['u2'])
  expect(prepared.option.options.readOnly).toBe(true)
  expect(await adapter.memory.getWorkingMemory({ threadId: 'bobo:room', resourceId: 'boai-local-owner' })).toBe('用户明确偏好：简短回复；来源 u1')
  let saved = (await adapter.memory.recall({ threadId: 'bobo:room', perPage: false })).messages
  expect(saved.map(item => [item.id, item.role, text(item)])).toEqual([['u1', 'user', history[0].content], ['a1', 'assistant', history[1].content]])
  await adapter.prepare([...history, current], 'room', current.id, current.turnId)
  expect((await adapter.memory.recall({ threadId: 'bobo:room', perPage: false })).messages).toHaveLength(2)
  const restarted = new BoboConversationMemory(path)
  await restarted.prepare([history[1], current], 'room', current.id, current.turnId)
  saved = (await restarted.memory.recall({ threadId: 'bobo:room', perPage: false })).messages
  expect(saved.map(item => item.id)).toEqual(['a1'])
  expect(await restarted.memory.getWorkingMemory({ threadId: 'bobo:room', resourceId: 'boai-local-owner' })).toBe('尚无相关记忆。')
  await restarted.forgetConversation('room')
  expect(await restarted.memory.getThreadById({ threadId: 'bobo:room', resourceId: 'boai-local-owner' })).toBeNull()
  await restarted.prepare([...history, current], 'room', current.id, current.turnId, '旧投影')
  const other = [message('other-u1', 1, 'user', '另一聊天', 'other-t1'), message('other-u2', 2, 'user', '现在的问题', 'other-t2')].map(item => ({ ...item, conversationId: 'other-room' }))
  await restarted.prepare(other, 'other-room', 'other-u2', 'other-t2', '旧偏好')
  await restarted.forgetAll()
  expect(await restarted.memory.getThreadById({ threadId: 'bobo:room', resourceId: 'boai-local-owner' })).toBeNull()
  expect(await restarted.memory.getThreadById({ threadId: 'bobo:other-room', resourceId: 'boai-local-owner' })).toBeNull()
})
