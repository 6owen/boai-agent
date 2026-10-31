/*
 * [OUTPUT]: 普通聊天与两次员工任务沿兼容原生session续接，仅追加新输入。
 * [OUTPUT]: 已退出且确认接收的取消轮次只投递新消息；投递未知/会话错配/来源漂移/宿主中断仍重建。
 * [INPUT]: 实际SQLite、获准消息投影及原生会话公开终态。
 * [OUTPUT]: Codex/Claude逐个验证增量/来源/恢复和迟到提交；各自原生turn或宿主完成回执不可替代，分集合不互相续用。
 * [POS]: 本机会话来源事务验收；真实协议与Electron分别留证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { EngineContext } from '../packages/runtime/src/contracts'
import type { Message, MemoryEntry } from '../packages/shared/src/domain'
import { MATERIAL_PARSE_VERSION } from '../packages/shared/src/domain/materials'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { CodexSessions, digest } from '../packages/runtime/src/adapters/codex/sessions'
import { NativeSessions } from '../packages/runtime/src/adapters/native-sessions'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup() })
describe.each(['codex', 'claude'] as const)('%s session source contract', runtime => {
const repository = (store: ProductStore) => runtime === 'codex' ? new CodexSessions(store) : new NativeSessions(store, 'claude')
const createdAt = '2026-10-05T00:00:00.000Z'
function message(id: string, sequence: number, overrides: Partial<Message> = {}): Message {
  return { id, sequence, conversationId: 'chat-a', turnId: `turn-${id}`, senderType: 'user', senderId: 'user', senderName: 'User', content: `Private message ${id}`, status: 'completed', createdAt, ...overrides }
}
function context(messages: Message[], overrides: Partial<EngineContext> = {}): EngineContext {
  return { agent: { id: 'employee-a', name: 'Employee', role: '', instructions: '', active: true, color: '#112233', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, configVersion: 1 },
    conversation: { id: 'chat-a', title: 'Chat A', kind: 'direct', agentIds: ['employee-a'], mode: 'natural', workspacePath: '', sharedKnowledgeIds: [], createdAt, updatedAt: createdAt },
    runId: 'run-1', apiKey: '', resources: [], messages, signal: new AbortController().signal,
    triggerMessageId: messages.at(-1)?.id, onDelta: async () => {}, onTool: async () => {}, approveCommand: async () => false, ...overrides }
}
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-codex-sessions-')); cleanups.push(() => rm(root, { recursive: true, force: true }))
  const store = new ProductStore(join(root, 'boai.sqlite')); await store.init(); cleanups.push(() => store.close())
  const sessions = repository(store)
  await sessions.recover(root)
  const publish = async (current: EngineContext) => {
    const started = await sessions.begin(current, 'verified-config')
    const reply = message(`reply-${current.runId}`, current.messages.at(-1)!.sequence + 1, { conversationId: current.conversation.id, runId: current.runId, senderType: 'agent', senderId: current.agent.id, content: `Answer ${current.runId}` })
    await sessions.update(started.session, { state: 'completed', threadId: started.threadId ?? `native-${current.runId}`, ...(runtime === 'codex' ? { turnId: `native-turn-${current.runId}` } : { completedInvocationId: current.runId }), outputHash: digest(reply.content) })
    return { ...started, reply }
  }
  return { store, sessions, publish, root }
}

it('appends only new authorized messages across multiple published turns and a new repository instance', async () => {
  const f = await fixture(), firstContext = context([message('first', 1)])
  const first = await f.publish(firstContext)
  expect(first.messages.map(value => value.id)).toEqual(['first'])
  const secondContext = context([...firstContext.messages, first.reply, message('second', 3)], { runId: 'run-2' })
  const second = await f.publish(secondContext)
  expect(second.threadId).toBe('native-run-1')
  expect(second.messages.map(value => value.id)).toEqual(['second'])
  expect(second.priorReply).toEqual({ messageId: first.reply.id, ...(runtime === 'codex' ? { nativeTurnId: 'native-turn-run-1' } : { hostRunId: 'run-1' }) })
  const next = repository(f.store)
  const third = await next.begin(context([...secondContext.messages, second.reply, message('third', 5)], { runId: 'run-3' }), 'verified-config')
  expect(third.threadId).toBe('native-run-1')
  expect(third.messages.map(value => value.id)).toEqual(['third'])
  expect(third.session.inputMessageIds).toEqual(['third'])
  expect(third.session.sources.map(source => source.id)).toEqual(['first', first.reply.id, 'second', second.reply.id, 'third'])
  expect(JSON.stringify(await f.store.load(`${runtime}Sessions`))).not.toContain('Private message')
})

it('continues the same native session across ordinary chat and two employee task messages', async () => {
  const f = await fixture(), firstMessage = message('chat', 1)
  const first = await f.publish(context([firstMessage]))
  const task = message('task-one', 3, { origin: { kind: 'automation', automationId: 'plan', occurrenceId: 'one', name: 'Daily news', authorizedFingerprint: 'allowed' } })
  const second = await f.publish(context([firstMessage, first.reply, task], { runId: 'task-run-one' }))
  expect(second.threadId).toBe(first.session.threadId ?? 'native-run-1')
  expect(second.messages.map(m => m.id)).toEqual(['task-one'])
  const next = message('task-two', 5, { origin: { ...task.origin!, occurrenceId: 'two' } as Message['origin'] })
  const third = await f.sessions.begin(context([firstMessage, first.reply, task, second.reply, next], { runId: 'task-run-two' }), 'verified-config')
  expect(third.threadId).toBe('native-run-1')
  expect(third.messages.map(m => m.id)).toEqual(['task-two'])
})

it.each(['confirmed', 'pending', 'host-interrupted', 'unknown-input', 'wrong-session', 'wrong-turn', 'changed-source', 'changed-config', 'unknown-answer', 'unknown-approval', 'unanswered-input'] as const)('checks cancelled native session continuation: %s', async condition => {
  const f = await fixture(), source = message('cancelled-input', 1), first = await f.sessions.begin(context([source]), 'verified-config')
  await f.sessions.update(first.session, { state: condition === 'pending' ? 'pending' : 'interrupted', threadId: 'native-cancelled', turnId: 'native-turn' })
  await f.store.write([{ collection: 'runs', id: 'run-1', value: {
    id: 'run-1', status: condition === 'host-interrupted' ? 'interrupted' : 'cancelled',
    backend: { kind: `${runtime}-local`, sessionId: condition === 'wrong-session' ? 'other' : 'native-cancelled', turnId: condition === 'wrong-turn' ? undefined : 'native-turn', inputAccepted: condition !== 'unknown-input' },
  } }])
  if (['unknown-answer', 'unknown-approval', 'unanswered-input'].includes(condition)) await f.store.write([{ collection: 'nativeActions', id: 'answer', value: { id: 'answer', runId: 'run-1', kind: condition === 'unknown-approval' ? 'approval' : 'input', status: condition === 'unanswered-input' ? 'interrupted' : 'answered', delivery: 'unknown' } }])
  const next = await repository(f.store).begin(context([condition === 'changed-source' ? { ...source, content: 'edited source' } : source, message('followup', 2)], { runId: 'run-2' }), condition === 'changed-config' ? 'new-config' : 'verified-config')
  const allowed = condition === 'confirmed' || condition === 'wrong-turn' && runtime === 'claude'
  expect(next.threadId).toBe(allowed ? 'native-cancelled' : undefined)
  expect(next.messages.map(value => value.id)).toEqual(allowed ? ['followup'] : ['cancelled-input', 'followup'])
  expect(next.priorReply).toBeUndefined()
})

it('keeps two employees and multiple conversations isolated when they use the same executable configuration', async () => {
  const f = await fixture(), base = context([])
  const contexts = [['employee-a', 'chat-a'], ['employee-b', 'chat-a'], ['employee-a', 'chat-b']].map(([agentId, conversationId], index) => context([message(`private-${index}`, 1, { conversationId })], {
    agent: { ...base.agent, id: agentId }, conversation: { ...base.conversation, id: conversationId, agentIds: [agentId] }, runId: `isolated-${index}`,
  }))
  const first = await Promise.all(contexts.map(value => f.publish(value)))
  const second = await Promise.all(contexts.map((value, index) => f.sessions.begin({ ...value, runId: `next-${index}`, messages: [...value.messages, first[index].reply, message(`followup-${index}`, 3, { conversationId: value.conversation.id })], triggerMessageId: `followup-${index}` }, 'verified-config')))
  expect(new Set(second.map(value => value.threadId)).size).toBe(3)
  second.forEach((value, index) => {
    expect(value.threadId).toBe(`native-isolated-${index}`)
    expect(value.messages.map(item => item.id)).toEqual([`followup-${index}`])
  })
  expect(await f.store.load(`${runtime}Sessions`)).toHaveLength(3)
})

it.each(['content', 'senderId', 'senderName', 'replyToMessageId', 'mentionIds', 'sequence', 'turnId'] as const)('starts from authorized context when an already injected message changes %s', async field => {
  const f = await fixture(), source = message('first', 1), first = await f.publish(context([source]))
  const changed: Message = { ...source, [field]: field === 'sequence' ? 0 : field === 'mentionIds' ? ['another-employee'] : 'changed' }
  const next = await f.sessions.begin(context([changed, first.reply, message('new', 3)], { runId: 'new-run' }), 'verified-config')
  expect(next.threadId).toBeUndefined()
  expect(next.priorReply).toBeUndefined()
  expect(next.messages.map(value => value.id)).toEqual(['first', first.reply.id, 'new'])
})

it.each(['unpublished', 'changed-reply', 'incomplete-reply', 'changed-config', 'old-mapping', 'pending', 'missing-turn'] as const)('does not continue an unproven transcript: %s', async condition => {
  const f = await fixture(), source = message('first', 1), first = await f.publish(context([source]))
  const messages = [source, first.reply, message('new', 3)]
  if (condition === 'unpublished') messages.splice(1, 1)
  if (condition === 'changed-reply') messages[1] = { ...first.reply, content: 'Different public answer' }
  if (condition === 'incomplete-reply') messages[1] = { ...first.reply, status: 'streaming' }
  if (['old-mapping', 'pending', 'missing-turn'].includes(condition)) {
    const saved = (await f.store.load<typeof first.session>(`${runtime}Sessions`))[0]
    await f.store.write([{ collection: `${runtime}Sessions`, id: saved.id, value: { ...saved,
      ...(condition === 'old-mapping' ? { sourceVersion: undefined } : condition === 'pending' ? { state: 'pending' } : { turnId: undefined, completedInvocationId: undefined }) } }])
  }
  const next = await f.sessions.begin(context(messages, { runId: 'new-run' }), condition === 'changed-config' ? 'different-config' : 'verified-config')
  expect(next.threadId).toBeUndefined()
  expect(next.messages.some(value => value.id === 'first')).toBe(true)
})

it.each(['material', 'memory', 'bounded-history'] as const)('never continues after prior %s leaves the authorized context', async removed => {
  const f = await fixture(), source = message('first', 1)
  const memory: MemoryEntry = { id: 'memory', ownerAgentId: 'employee-a', scope: 'conversation', conversationId: 'chat-a', content: 'Private preference', sourceMessageIds: [source.id], sourceResourceIds: [], origin: 'model', version: 1, createdAt, updatedAt: createdAt }
  const current = context([source], { memory: { entries: [memory], namespace: 'employee-a', epoch: 1 }, materialRefs: [{ id: 'material', revision: 1, contentHash: 'image-hash', parseVersion: MATERIAL_PARSE_VERSION, conversationId: 'chat-a' }] })
  const first = await f.publish(current)
  const nextContext = { ...current, runId: 'next', messages: [source, first.reply, message('new', 3)], triggerMessageId: 'new' }
  if (removed === 'material') nextContext.materialRefs = []
  if (removed === 'memory') nextContext.memory = { ...current.memory!, entries: [] }
  if (removed === 'bounded-history') nextContext.messages = [first.reply, ...Array.from({ length: 105 }, (_, index) => message(`history-${index}`, index + 3)), message('new', 108)]
  const next = await f.sessions.begin(nextContext, 'verified-config')
  expect(next.threadId).toBeUndefined()
  expect(next.messages).toHaveLength(removed === 'bounded-history' ? 100 : 3)
})

it('does not let a replaced run or a cleared mapping accept a late completion', async () => {
  const f = await fixture(), first = await f.sessions.begin(context([message('first', 1)]), 'verified-config')
  const second = await f.sessions.begin(context([message('new', 2)], { runId: 'next' }), 'verified-config')
  await expect(f.sessions.update(first.session, { state: 'completed', threadId: 'late-first' })).rejects.toThrow('新运行替代')
  expect((await f.store.load<typeof second.session>(`${runtime}Sessions`))[0].runId).toBe('next')
  await f.store.write([], [{ collection: `${runtime}Sessions`, id: second.session.id }])
  await expect(f.sessions.update(second.session, { state: 'completed', threadId: 'late-second' })).rejects.toThrow('清理')
  expect(await f.store.load(`${runtime}Sessions`)).toEqual([])
})

it('keeps a confirmed native session reusable during normal restarts of the same installation', async () => {
  const f = await fixture(), source = message('first', 1), first = await f.publish(context([source]))
  const before = await f.store.load(`${runtime}Sessions`)
  const reopened = repository(f.store)
  await reopened.recover(f.root)
  expect(await f.store.load(`${runtime}Sessions`)).toEqual(before)
  const next = await reopened.begin(context([source, first.reply, message('new', 3)], { runId: 'next' }), 'verified-config')
  expect(next.threadId).toBe('native-run-1')
  expect(next.messages.map(value => value.id)).toEqual(['new'])
})

it('keeps another runtime isolated even for the same employee, conversation and source fingerprint', async () => {
  const f = await fixture(), source = message('first', 1), first = await f.publish(context([source]))
  const own = await f.store.load(`${runtime}Sessions`)
  const otherKind = runtime === 'codex' ? 'claude' : 'codex', other = new NativeSessions(f.store, otherKind)
  await other.recover(f.root)
  const started = await other.begin(context([source, first.reply, message('next', 3)], { runId: 'other-run' }), 'verified-config')
  expect(started.threadId).toBeUndefined()
  await other.recover(join(f.root, 'moved'))
  expect(await f.store.load(`${runtime}Sessions`)).toEqual(own)
  expect(await f.store.load(`${otherKind}Sessions`)).toHaveLength(1)
})

it.each(['restored-backup', 'installation-changed', 'unverified-installation'] as const)('revokes only native continuation for %s and does not revoke a later newly established session', async reason => {
  const f = await fixture(), source = message('first', 1), first = await f.publish(context([source]))
  const before = (await f.store.load<typeof first.session>(`${runtime}Sessions`))[0]
  if (reason === 'restored-backup') await f.store.write([{ collection: `${runtime}Runtime`, id: 'installation', value: { id: 'installation', root: f.root, restorePending: true } }])
  if (reason === 'unverified-installation') await f.store.write([], [{ collection: `${runtime}Runtime`, id: 'installation' }])
  const root = reason === 'installation-changed' ? join(f.root, 'moved') : f.root
  await f.sessions.recover(root)
  expect((await f.store.load(`${runtime}Sessions`))[0]).toEqual({ ...before, resumeInvalidated: reason })
  expect(await f.store.load(`${runtime}Runtime`)).toEqual([{ id: 'installation', root, restorePending: false }])
  await expect(f.sessions.update(first.session, { state: 'completed', threadId: 'late-old' })).rejects.toThrow('恢复失效')
  const current = context([source, first.reply, message('new', 3)], { runId: 'new' })
  const next = await f.publish(current)
  expect(next.threadId).toBeUndefined()
  expect(next.messages.map(value => value.id)).toEqual(['first', first.reply.id, 'new'])
  await f.sessions.recover(root)
  const continued = await f.sessions.begin(context([...current.messages, next.reply, message('followup', 5)], { runId: 'followup' }), 'verified-config')
  expect(continued.threadId).toBe('native-new')
  expect(continued.messages.map(value => value.id)).toEqual(['followup'])
})

})
