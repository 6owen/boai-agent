/*
 * [OUTPUT]: 用户/模型/导入记忆展示不伪造事件时间或亲历身份，素材日期与保存时间分开；原正文/引用和预算保持。
 * [INPUT]: 统一记忆策略、获知回执和合成来源/中文请求。
 * [OUTPUT]: 员工隔离与有界证据预算、实际获知授权指纹/父条目版本；硬范围、期限与来源撤权不能从raw证据逃逸。
 * [POS]: T2.3 纯召回合同；实际 AppService 装配由 unified-memory.test.ts 验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { expect, test } from 'vitest'
import { observationAuthorityFingerprint, recallMemory } from '../src/runtime/modules/memory/memory-recall'
import { memoryText, memoryTokenEstimate, type MemoryAccess } from '../src/runtime/modules/memory/memory-policy'
import type { MemoryEntry, MemoryObservation, MemoryView, Message } from '../src/shared/domain'
const access: MemoryAccess = { agentId: 'a', conversationId: 'group', sourceAllowed: () => true, conversationRestricted: () => false, contextRefs: [{ kind: 'conversation', id: 'group' }] }
const entry = (id: string, extra: Partial<MemoryEntry> = {}): MemoryEntry => ({ id, ownerAgentId: 'a', scope: 'employee', content: '喜欢简洁中文写作', sourceMessageIds: ['source-' + id], sourceResourceIds: [], origin: 'model', version: 1, createdAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z', schemaVersion: 2, kind: 'experience', evidence: 'claim', useScope: 'employee', status: 'active', ...extra })
function recall(entries: MemoryEntry[], override: Partial<MemoryAccess> = {}, request = '请用简洁中文写作', extra: Partial<Parameters<typeof recallMemory>[0]> = {}) {
  return recallMemory({ view: { namespace: 'employee:a', epoch: 1, entries }, access: { ...access, ...override }, request, observations: [], messages: new Map(), ...extra })
}
test('UM01/05 own private background crosses chats; another employee and unrelated experience never enter the projection', () => {
  const result = recall([entry('own', { conversationId: 'direct', disclosure: 'private' }), entry('other', { ownerAgentId: 'b' }), entry('noise', { content: '火星岩石尺寸' })])
  expect(result.entries.map(entry => entry.id)).toEqual(['own']); expect(memoryText(result.entries[0])).toContain('私人来源')
})
test('UM04 hard restrictions apply before relevance and pinning, including inherited origins', () => {
  expect(recall([entry('canary', { pinned: true, conversationId: 'direct', useScope: 'conversation' })]).entries).toEqual([])
  expect(recall([entry('derived', { sourceConversationIds: ['direct', 'group'] })], { conversationRestricted: id => id === 'direct' }).entries).toEqual([])
})
test('UM03/11 context identity and expiration do not guess from same names or pinning', () => {
  const temporary = entry('role', { content: '本局女巫', kind: 'temporary', useScope: 'context', contextRef: { kind: 'conversation', id: 'game-a' }, expiresAt: '2026-10-01T00:00:00Z', pinned: true })
  expect(recall([temporary], {}, '女巫').entries).toEqual([])
  expect(recall([temporary], { contextRefs: [{ kind: 'conversation', id: 'game-a' }], now: Date.parse('2026-09-30') }, '女巫').entries).toHaveLength(1)
  expect(recall([temporary], { contextRefs: [{ kind: 'conversation', id: 'game-a' }], now: Date.parse('2026-10-02') }, '女巫').entries).toEqual([])
})
test('UM06/12 unavailable source, superseded, archive and expired records are excluded', () => {
  const entries = [entry('revoked'), entry('old', { status: 'superseded' }), entry('archive', { status: 'archived' }), entry('expired', { expiresAt: '2020-01-01' })]
  expect(recall(entries, { sourceAllowed: () => false }).entries).toEqual([])
  expect(recall(entries).entries.map(entry => entry.id)).toEqual(['revoked'])
})
test('UM15 old profile keeps its meaning; old conversation never silently expands', () => {
  expect(recall([entry('profile', { schemaVersion: undefined, kind: undefined, useScope: undefined, scope: 'profile', content: '稳定的基本资料' }), entry('legacy', { schemaVersion: undefined, useScope: undefined, scope: 'conversation', conversationId: 'direct' })]).entries.map(entry => entry.id)).toEqual(['profile'])
})
test('UM16 Chinese related wording is ranked and whole entries retain source metadata within budget', () => {
  const rows = Array.from({ length: 80 }, (_, index) => entry(String(index), { content: index === 30 ? '海报提纲面向大学新生，中文标题简洁' : '遥远星球岩石' }))
  const result = recall(rows, {}, '给大学新生写海报标题')
  expect(result.entries).toHaveLength(1); expect(result.entries[0].id).toBe('30')
  expect(result.recall!.tokenEstimate).toBe(memoryTokenEstimate(memoryText(result.entries[0])))
  expect(recall(rows, {}, '给大学新生写海报标题', { tokenBudget: 8 }).entries).toEqual([])
})
function raw(extra: Partial<MemoryObservation> = {}) {
  const message: Message = { id: 'm', conversationId: 'direct', sequence: 1, senderType: 'user', senderId: 'user', senderName: '本人', content: '海报提纲：主题、受众、行动', status: 'completed', createdAt: '2026-09-30T00:00:00Z' }
  const observation: MemoryObservation = { id: 'run', ownerAgentId: 'a', conversationId: 'direct', sourceMessageIds: [message.id], sourceResourceIds: [], sourceMemoryIds: [], useScope: 'employee', createdAt: message.createdAt, ...extra }
  return { observations: [observation], messages: new Map([[message.id, message]]) }
}
test('UM02 unextracted acknowledged evidence bridges immediately without becoming a fact or losing its speaker', () => {
  const result = recall([], {}, '继续海报提纲', raw())
  expect(result.entries[0]).toMatchObject({ content: '海报提纲：主题、受众、行动', evidence: 'claim', attribution: '本人', sourceMessageIds: ['m'] })
  expect(result.recall!.observationIds).toEqual(['run'])
})
test('UM04/09 raw evidence cannot bypass saved limits, supersession, archive, expiry or a missing parent', () => {
  for (const status of ['superseded', 'archived', 'expired'] as const) expect(recall([entry('known', { sourceMessageIds: ['m'], status })], {}, '海报提纲', raw()).entries).toEqual([])
  expect(recall([], {}, '海报提纲', raw({ useScope: 'conversation' })).entries).toEqual([])
  expect(recall([], {}, '海报提纲', raw({ sourceMemoryIds: ['missing'] })).entries).toEqual([])
})
test('complete recall tracks actual observation authority and its parent versions without adding unrelated rows', () => {
  const source = raw({ sourceMemoryIds: ['parent'] })
  const parent = entry('parent', { content: '相关来源的原始决定' })
  const result = recall([parent, entry('unused', { content: '岩石尺寸' })], {}, '海报提纲', source)
  expect(result.entries.map(entry => entry.id)).toEqual(['observation:run:m'])
  expect(result.recall).toMatchObject({ authorityVersion: 1, agentId: 'a', versions: [{ id: 'parent', version: 1 }], observationVersions: [{ id: 'run', fingerprint: observationAuthorityFingerprint(source.observations[0]), sourceMessageIds: ['m'] }] })
  expect(result.recall?.inputMessageIds).toBeUndefined()
})
test('observation fingerprint preserves authority independent of property order while scope changes invalidate it', () => {
  const observation = raw().observations[0]
  expect(observationAuthorityFingerprint(Object.fromEntries(Object.entries(observation).reverse()) as unknown as MemoryObservation)).toBe(observationAuthorityFingerprint(observation))
  for (const change of [{ useScope: 'conversation' as const }, { ownerAgentId: 'b' }, { sourceResourceIds: ['new'] }, { contextRef: { kind: 'work' as const, id: 'new-work' } }]) expect(observationAuthorityFingerprint({ ...observation, ...change })).not.toBe(observationAuthorityFingerprint(observation))
})

test('memory provenance labels never turn save times or record ownership into event facts', () => {
  const content = '去年朋友推荐了一本书，我只记下书名，还没有读。'
  const saved = '2026-10-20T09:00:00Z', updated = '2026-10-21T10:00:00Z'
  for (const origin of ['user', 'model', 'import'] as const) {
    const value = entry('saved', { origin, content, createdAt: saved, updatedAt: updated, sourceMessageIds: [], ...(origin === 'model' ? { sourceMemoryIds: ['original-note'], diary: { date: '2026-10-19', behaviorRunId: 'r' } } : {}), attribution: '原作者' })
    const before = structuredClone(value), text = memoryText(value)
    expect(text).toContain(`保存于 ${saved}`); expect(text).toContain(`记录更新于 ${updated}`)
    expect(text).not.toContain('发生于'); expect(text).not.toContain('用户设置')
    expect(text).toContain(origin === 'user' ? '用户提供' : origin === 'model' ? '模型提取或整理（不证明员工亲历）' : '导入记录（原作者按来源）')
    expect(text.endsWith('\n' + content)).toBe(true); expect(value).toEqual(before)
    if (origin === 'model') { expect(text).toContain('父记忆 original-note'); expect(text).toContain('反思素材日期 2026-10-19') }
    else expect(text).toContain('无关联消息或父记忆')
    expect(text).toContain('原归属 原作者')
  }
  const linked = memoryText(entry('quoted', { attribution: '实际发言者', sourceMessageIds: ['real-message'], sourceMemoryIds: ['derived-parent'] }))
  expect(linked).toContain('引用消息 real-message；父记忆 derived-parent')
  expect(memoryText(entry('legacy', { origin: undefined as unknown as MemoryEntry['origin'] }))).toContain('记录方式未知')
})
