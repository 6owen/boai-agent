/*
 * [INPUT]: Actual owned AppService, bobo core chats and the local MemoryRepository.
 * [OUTPUT]: Cross-conversation/restart preference recall, correction and explicit forget; completed-turn extraction and source-chat clear revoke bobo's model context.
 * [POS]: Host-level memory continuity test with a deterministic model, not a real-model quality evaluation.
 * [PROTOCOL]: Update this Header and tests/.folder.md when changed.
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { startOwnedRuntime } from '../src/runtime/bootstrap'
import type { AgentEngine, EngineContext } from '../src/runtime/contracts'
import type { Conversation, MemoryView, Snapshot } from '../src/shared/domain'

const cleanup: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const action of cleanup.splice(0).reverse()) await action() })

it('recalls a bobo preference across new chats and restart, then honors correction and forgetting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-bobo-global-memory-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const contexts: EngineContext[] = []
  let purges = 0
  const engine: AgentEngine = {
    test: async () => 'test',
    forgetAllConversationMemory: async () => { purges++ },
    decide: async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }),
    run: async context => { contexts.push(context); await context.onDelta('已核对当前记忆。') },
  }
  const options = { dataPath: root, skillDiscovery: { homeDir: root }, engine, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} }
  let owned = await startOwnedRuntime(options); cleanup.push(() => owned.close())
  const service = () => owned.service
  await service().handle('executeApplicationOperation', { operation: 'connections.create', input: { name: 'API', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture-model' }, requestId: 'bobo-memory-model' })
  const ask = async (requestId: string) => {
    const room = await service().handle('startCoreConversation', { content: '你记得我对回答长度的偏好吗？', requestId }) as Conversation
    await expect.poll(async () => (await service().handle('snapshot', undefined) as Snapshot).conversations.find(item => item.id === room.id)?.activity, { timeout: 10_000 }).toBe('idle')
    return [...contexts].reverse().find(context => context.conversation.id === room.id)!
  }
  const query = { agentId: 'bobo', scope: 'employee' as const }
  const before = await service().handle('getMemory', query) as MemoryView
  const saved = await service().handle('saveMemory', { ...query, expectedEpoch: before.epoch, content: '回答长度偏好：最多三句话', kind: 'long_term', evidence: 'preference', pinned: true, requestId: 'remember-length' }) as MemoryView
  expect(purges).toBe(1)
  const memoryId = saved.entries[0]!.id
  expect((await ask('bobo-room-1')).bootstrap?.memoryProjection).toContain('最多三句话')
  await owned.close()
  owned = await startOwnedRuntime(options)
  expect((await ask('bobo-room-2')).bootstrap?.memoryProjection).toContain('最多三句话')
  const corrected = await service().handle('saveMemory', { ...query, id: memoryId, expectedEpoch: (await service().handle('getMemory', query) as MemoryView).epoch, content: '回答长度偏好：最多一句话', kind: 'long_term', evidence: 'preference', pinned: true, requestId: 'correct-length' }) as MemoryView
  expect(purges).toBe(2)
  expect(corrected.entries.find(entry => entry.id === memoryId)?.content).toContain('最多一句话')
  const afterCorrection = (await ask('bobo-room-3')).bootstrap?.memoryProjection ?? ''
  expect(afterCorrection).toContain('最多一句话')
  expect(afterCorrection).not.toContain('最多三句话')
  await service().handle('deleteMemory', { ...query, id: memoryId, expectedEpoch: corrected.epoch, requestId: 'forget-length' })
  expect(purges).toBe(3)
  const afterForget = (await ask('bobo-room-4')).bootstrap?.memoryProjection ?? ''
  expect(afterForget).not.toContain('最多一句话')
  expect(afterForget).not.toContain('最多三句话')
})

it('extracts a bobo preference from a real completed turn and revokes it when the source chat is cleared', async () => {
  const root = await mkdtemp(join(tmpdir(), 'boai-bobo-extracted-memory-')); cleanup.push(() => rm(root, { recursive: true, force: true }))
  const contexts: EngineContext[] = []
  let purges = 0
  const engine: AgentEngine = {
    test: async () => 'test',
    forgetAllConversationMemory: async () => { purges++ },
    decide: async context => ({ action: 'reply', responseKind: 'chat', observedThroughSequence: context.participation!.observedThroughSequence }),
    run: async context => { contexts.push(context); await context.onDelta('已收到。') },
    extractMemory: async context => {
      const source = context.messages.find(message => message.id === context.triggerMessageId)
      return source?.content.includes('长期偏好蓝色') ? [{ content: '用户长期偏好蓝色', sourceMessageIds: [source.id], kind: 'long_term', evidence: 'preference' }] : []
    },
  }
  const owned = await startOwnedRuntime({ dataPath: root, skillDiscovery: { homeDir: root }, engine, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} }); cleanup.push(owned.close)
  await owned.service.handle('executeApplicationOperation', { operation: 'connections.create', input: { name: 'API', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1', defaultModel: 'fixture-model' }, requestId: 'extracted-memory-model' })
  const source = await owned.service.handle('startCoreConversation', { content: '请记住：我长期偏好蓝色。', requestId: 'source-blue' }) as Conversation
  const query = { agentId: 'bobo', scope: 'employee' as const }
  await expect.poll(async () => (await owned.service.handle('getMemory', query) as MemoryView).entries.some(entry => entry.content === '用户长期偏好蓝色'), { timeout: 10_000 }).toBe(true)
  const ask = async (requestId: string) => {
    const room = await owned.service.handle('startCoreConversation', { content: '我喜欢什么颜色？', requestId }) as Conversation
    await expect.poll(async () => (await owned.service.handle('snapshot', undefined) as Snapshot).conversations.find(item => item.id === room.id)?.activity, { timeout: 10_000 }).toBe('idle')
    return [...contexts].reverse().find(context => context.conversation.id === room.id)!
  }
  expect((await ask('ask-blue-before-clear')).bootstrap?.memoryProjection).toContain('用户长期偏好蓝色')
  await owned.service.handle('clearConversationHistory', { id: source.id, hide: false })
  expect(purges).toBe(1)
  expect((await ask('ask-blue-after-clear')).bootstrap?.memoryProjection).not.toContain('用户长期偏好蓝色')
})
