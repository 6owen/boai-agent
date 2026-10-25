/*
 * [INPUT]: 真实 ProductStore 发布事务、隔离消息、固定可见完成快照及备份 SQLite。
 * [OUTPUT]: 单调完成与回滚/重复事件、连续边界/搜索缺口、流式迟到拒绝、独立锚点 CAS、旧历史未知、清理 epoch 与恢复零业务重放。
 * [POS]: D6 个人阅读模块验收；不调用模型或 Electron，不使用假事务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Message } from '../packages/shared/src/domain'
import { READING_LIMITS, type ConversationCompletion } from '../packages/shared/src/domain/reading'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { completionHash, ConversationReadingRepository } from '../packages/runtime/src/modules/conversations/reading-repository'
import { MaterialRepository } from '../packages/runtime/src/modules/materials/material-repository'

const roots: string[] = [], stores: ProductStore[] = []
afterEach(async () => { await Promise.all(stores.splice(0).map(store => store.close())); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })
const record = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const message = (id: string, overrides: Partial<Message> = {}): Message => ({ id, conversationId: 'chat', senderType: 'agent', senderId: 'alice', senderName: '员工', content: `结果 ${id}`, status: 'completed', sequence: 1, createdAt: '2026-10-01T00:00:00.000Z', ...overrides })
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-reading-'))); roots.push(root)
  const store = new ProductStore(join(root, 'product.sqlite')); await store.init(); stores.push(store)
  await store.write([record('conversations', { id: 'chat', title: '交付' }), record('conversations', { id: 'other', title: '其他' })])
  const reading = new ConversationReadingRepository(store)
  const publish = async (value: Message): Promise<ConversationCompletion> => store.transaction(async tx => { await tx.put(record('messages', value)); return (await reading.recordCompletion(tx, value))! })
  return { root, store, reading, publish }
}

describe('真实发布后的个人阅读事实', () => {
  it('员工真实完成顺序与开始 sequence/时间独立，重复完成只计一次', async () => {
    const { store, reading, publish } = await fixture()
    const earlyStarted = message('early', { sequence: 1, createdAt: '2026-09-30T00:00:00.000Z', status: 'streaming' })
    await store.write([record('messages', earlyStarted)])
    const later = await publish(message('later', { sequence: 2 })), early = await publish({ ...earlyStarted, status: 'completed' })
    expect(later.ordinal).toBe(1); expect(early.ordinal).toBe(2)
    const duplicate = await store.transaction(tx => reading.recordCompletion(tx, { ...earlyStarted, status: 'completed' }))
    expect(duplicate).toEqual(early)
    expect((await reading.readState('chat')).completionCount).toBe(2)
    expect((await store.load('conversationCompletions')).length).toBe(2)
  })
  it('自己的消息、系统、失败和流式状态不产生完成，伪造未提交消息拒绝', async () => {
    const { store, reading } = await fixture()
    for (const value of [message('user', { senderType: 'user', senderId: 'user' }), message('system', { senderType: 'system' }), message('failed', { status: 'failed' }), message('streaming', { status: 'streaming' })]) await store.transaction(async tx => { await tx.put(record('messages', value)); expect(await reading.recordCompletion(tx, value)).toBeNull() })
    await expect(store.transaction(tx => reading.recordCompletion(tx, message('absent')))).rejects.toThrow('真实完成')
    expect(await reading.readState('chat')).toMatchObject({ completionCount: 0, unreadCount: 0, legacyCompletedUnknown: false })
    expect(await store.load('conversationCompletions')).toEqual([])
  })
  it('发布事务回滚时消息、完成序号和阅读事实一起回滚', async () => {
    const { store, reading } = await fixture()
    await expect(store.transaction(async tx => { const value = message('rolled'); await tx.put(record('messages', value)); await reading.recordCompletion(tx, value); throw new Error('发布失败') })).rejects.toThrow('发布失败')
    expect(await store.load('messages')).toEqual([])
    expect(await store.load('conversationCompletions')).toEqual([])
    expect(await reading.readState('chat')).toMatchObject({ completionCount: 0, legacyCompletedUnknown: false })
  })
  it('两个真实 SQLite 连接并发发布仍为不同消息分配唯一连续完成身份', async () => {
    const { store, reading } = await fixture(), secondStore = new ProductStore(store.filename); await secondStore.init(); stores.push(secondStore)
    const second = new ConversationReadingRepository(secondStore)
    const results = await Promise.all([store.transaction(async tx => { const value = message('one'); await tx.put(record('messages', value)); return reading.recordCompletion(tx, value) }), secondStore.transaction(async tx => { const value = message('two'); await tx.put(record('messages', value)); return second.recordCompletion(tx, value) })])
    expect(results.map(value => value!.ordinal).sort()).toEqual([1, 2])
    expect((await reading.readState('chat')).unreadCount).toBe(2)
  })
  it('跳转较晚搜索结果只标那条所见完成，连续边界保持未见缺口', async () => {
    const { reading, publish } = await fixture(), first = await publish(message('one')), second = await publish(message('two', { sequence: 2 })), third = await publish(message('three', { sequence: 3 }))
    let state = await reading.readState('chat')
    expect(state.firstUnreadMessageId).toBe(first.messageId)
    state = await reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: [third] })
    expect(state).toMatchObject({ boundary: 0, sparseSeen: [3], unreadCount: 2 })
    expect(state.firstUnreadMessageId).toBe(first.messageId)
    state = await reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: [first] })
    expect(state).toMatchObject({ boundary: 1, sparseSeen: [3], unreadCount: 1 })
    expect(state.firstUnreadMessageId).toBe(second.messageId)
    state = await reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: [second] })
    expect(state).toMatchObject({ boundary: 3, sparseSeen: [], unreadCount: 0 })
    expect(state.firstUnreadMessageId).toBeUndefined()
    const duplicate = await reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: [first, third] })
    expect(duplicate.revision).toBe(state.revision)
  })
  it('流式旧快照与迟到阅读 revision 不得把离开后才完成的正文算已读', async () => {
    const { store, reading, publish } = await fixture(), streaming = message('streaming', { content: '草稿', status: 'streaming' })
    await store.write([record('messages', streaming)])
    expect(await reading.completionSnapshot('chat', [streaming.id])).toEqual([])
    const state = await reading.readState('chat'), completed = await publish({ ...streaming, status: 'completed', content: '最终结果' })
    await expect(reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: [{ ...completed, contentHash: completionHash(streaming) }] })).rejects.toThrow('完成身份已变化')
    const fresh = await reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: [completed] })
    await expect(reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: [completed] })).rejects.toThrow('迟到观测')
    expect(fresh.unreadCount).toBe(0)
  })
  it('完成正文随后变化、错误 ordinal/epoch 及跨聊天身份不能越过固定快照', async () => {
    const { store, reading, publish } = await fixture(), completed = await publish(message('one')), state = await reading.readState('chat')
    for (const altered of [{ ...completed, ordinal: 2 }, { ...completed, epoch: 2 }, { ...completed, contentHash: '0'.repeat(64) }]) await expect(reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: [altered] })).rejects.toThrow()
    await expect(reading.observe({ conversationId: 'other', epoch: state.epoch, expectedRevision: 0, completions: [completed] })).rejects.toThrow('完成身份已变化')
    await store.write([record('messages', message('one', { content: '外部改写' }))])
    await expect(reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: [completed] })).rejects.toThrow('完成身份已变化')
    expect((await reading.readState('chat')).unreadCount).toBe(1)
  })
  it('缺口达到显式上限后原状态完整保留，补回缺口后可继续', async () => {
    const { store, reading } = await fixture(), events: ConversationCompletion[] = []
    await store.transaction(async tx => { for (let ordinal = 1; ordinal <= READING_LIMITS.sparseSeen + 2; ordinal++) { const value = message(`m${ordinal}`, { sequence: ordinal }); await tx.put(record('messages', value)); events.push((await reading.recordCompletion(tx, value))!) } })
    let state = await reading.readState('chat')
    for (let start = 1; start < events.length - 1; start += READING_LIMITS.observedCompletions) state = await reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: events.slice(start, Math.min(start + READING_LIMITS.observedCompletions, events.length - 1)) })
    expect(state.sparseSeen).toHaveLength(READING_LIMITS.sparseSeen)
    await expect(reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: [events.at(-1)!] })).rejects.toThrow('缺口记录已达上限')
    expect(await reading.readState('chat')).toEqual(state)
    state = await reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: [events[0]!] })
    expect(state).toMatchObject({ boundary: READING_LIMITS.sparseSeen + 1, sparseSeen: [] })
    expect((await reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: [events.at(-1)!] })).unreadCount).toBe(0)
  })
  it('锚点使用独立 CAS，不推进阅读边界，也不覆盖更晚锚点', async () => {
    const { reading, publish } = await fixture(), one = await publish(message('one')), two = await publish(message('two', { sequence: 2 }))
    const state = await reading.readState('chat'), anchored = await reading.saveAnchor({ conversationId: 'chat', epoch: state.epoch, expectedAnchorRevision: 0, messageId: two.messageId, offset: 123 })
    expect(anchored).toMatchObject({ revision: 0, boundary: 0, unreadCount: 2, anchor: { messageId: two.messageId, revision: 1, offset: 123 } })
    const seen = await reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: 0, completions: [one] })
    expect(seen.anchor).toEqual(anchored.anchor)
    await expect(reading.saveAnchor({ conversationId: 'chat', epoch: state.epoch, expectedAnchorRevision: 0, messageId: one.messageId, offset: 0 })).rejects.toThrow('迟到位置')
    expect((await reading.saveAnchor({ conversationId: 'chat', epoch: state.epoch, expectedAnchorRevision: 1, messageId: one.messageId, offset: 0 })).revision).toBe(seen.revision)
    await expect(reading.saveAnchor({ conversationId: 'chat', epoch: state.epoch, expectedAnchorRevision: 2, messageId: 'absent', offset: 0 })).rejects.toThrow('原消息已不存在')
    await expect(reading.saveAnchor({ conversationId: 'chat', epoch: state.epoch, expectedAnchorRevision: 2, messageId: one.messageId, offset: -1 })).rejects.toThrow('有界偏移')
  })
  it('旧 completed 历史明示未知，新空聊天与新发布不伪造旧阅读事实', async () => {
    const { store, reading, publish } = await fixture()
    expect((await reading.readState('other')).legacyCompletedUnknown).toBe(false)
    await store.write([record('messages', message('legacy'))])
    expect(await reading.readState('chat')).toMatchObject({ legacyCompletedUnknown: true, unreadCount: 0, boundary: 0 })
    await publish(message('new', { sequence: 2 }))
    expect(await reading.readState('chat')).toMatchObject({ legacyCompletedUnknown: true, unreadCount: 1 })
    expect(await reading.completionSnapshot('chat', ['legacy', 'new'])).toHaveLength(1)
  })
  it('材料来源在阅读事务内真实复核，撤权后旧可见快照不能保存已读或锚点', async () => {
    const { root, store, publish } = await fixture()
    await store.write([record('conversations', { id: 'chat', title: '交付', agentIds: ['alice'] }), record('agents', { id: 'alice', active: true })])
    const materials = new MaterialRepository(store, root), source = join(root, 'input.txt'); await writeFile(source, '仅当前授权材料')
    const material = await materials.prepare({ conversationId: 'chat', requestId: 'prepare', path: source, authorizedAgentIds: ['alice'] })
    await store.transaction(async tx => { await tx.put(record('messages', message('input', { senderType: 'user', senderId: 'user', materialIds: [material.id] }))); await materials.attach(tx, 'chat', 'input', [{ id: material.id, revision: material.revision }]) })
    const ref = (await materials.read(material.id, 'alice', 'chat')).ref, completed = await publish(message('derived', { materialSources: [ref] }))
    const reading = new ConversationReadingRepository(store, { validateMessage: (tx, value) => materials.validateRefsInTransaction(tx, value.materialSources ?? [], undefined, value.conversationId) }), state = await reading.readState('chat')
    expect(await reading.completionSnapshot('chat', ['derived'])).toHaveLength(1)
    await materials.authorize(material.id, material.revision, [])
    await expect(reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: [completed] })).rejects.toThrow('版本')
    await expect(reading.saveAnchor({ conversationId: 'chat', epoch: state.epoch, expectedAnchorRevision: 0, messageId: 'derived', offset: 0 })).rejects.toThrow('版本')
    expect(await reading.readState('chat')).toEqual(state)
    await expect(reading.completionSnapshot('chat', ['derived'])).rejects.toThrow('版本')
  })
  it('未接来源核对的模块拒绝为含材料正文保存阅读事实', async () => {
    const { reading, publish } = await fixture(), completed = await publish(message('derived', { materialIds: ['unverified'] })), state = await reading.readState('chat')
    await expect(reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: [completed] })).rejects.toThrow('接入当前来源核对')
    expect(await reading.readState('chat')).toEqual(state)
  })
  it('清理门禁阻止读取和发布，重置在原事务回滚/提交并阻止旧 epoch 复活', async () => {
    const { store, reading, publish } = await fixture(), completed = await publish(message('one')), state = await reading.readState('chat')
    await reading.saveAnchor({ conversationId: 'chat', epoch: state.epoch, expectedAnchorRevision: 0, messageId: 'one', offset: 12 })
    await expect(store.transaction(async tx => { await reading.resetConversation(tx, 'chat'); throw new Error('清理回滚') })).rejects.toThrow('清理回滚')
    expect((await reading.readState('chat')).epoch).toBe(state.epoch)
    await store.write([record('conversationCleanup', { id: 'chat' })])
    await expect(reading.readState('chat')).rejects.toThrow('正在清理')
    await expect(publish(message('blocked'))).rejects.toThrow('正在清理')
    await store.transaction(async tx => { await reading.resetConversation(tx, 'chat'); await tx.remove('messages', 'one'); await tx.remove('conversationCleanup', 'chat') })
    const cleared = await reading.readState('chat')
    expect(cleared).toMatchObject({ epoch: state.epoch + 1, boundary: 0, sparseSeen: [], anchor: null, unreadCount: 0 })
    await expect(reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: 0, completions: [completed] })).rejects.toThrow('迟到观测')
    await expect(reading.saveAnchor({ conversationId: 'chat', epoch: state.epoch, expectedAnchorRevision: 0, messageId: 'one', offset: 0 })).rejects.toThrow('迟到位置')
    expect((await publish(message('one', { content: '清理后的新结果' }))).ordinal).toBe(1)
  })
  it('真实备份与重启恢复已提交边界/缺口/锚点，没有模型工作或业务重放', async () => {
    const { root, store, reading, publish } = await fixture(), first = await publish(message('one')), second = await publish(message('two', { sequence: 2 }))
    let state = await reading.readState('chat')
    state = await reading.observe({ conversationId: 'chat', epoch: state.epoch, expectedRevision: state.revision, completions: [second] })
    state = await reading.saveAnchor({ conversationId: 'chat', epoch: state.epoch, expectedAnchorRevision: 0, messageId: first.messageId, offset: 42 })
    const backup = join(root, 'backup.sqlite'); await store.backup(backup)
    const restoredStore = new ProductStore(backup); await restoredStore.init(); stores.push(restoredStore)
    const restored = new ConversationReadingRepository(restoredStore)
    expect(await restored.readState('chat')).toEqual(state)
    expect(await restored.completionSnapshot('chat', ['one', 'two'])).toHaveLength(2)
    expect(await restoredStore.load('workItems')).toEqual([])
    expect(await restoredStore.load('runs')).toEqual([])
    expect(await restoredStore.load('artifactAdoptionEvents')).toEqual([])
  })
})
