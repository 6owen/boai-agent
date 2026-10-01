/*
 * [INPUT]: 会话列表排序和纯更新规则。
 * [OUTPUT]: 手动顺序不随消息跳动、核心/普通分类与置顶边界及隐藏不删除记录的回归验证。
 * [POS]: 会话展示偏好的模块测试；真实 IPC/重启由 Electron BDD 验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it } from 'vitest'
import type { Conversation } from '../src/shared/domain'
import { conversationListUpdates, sortedConversations, type ConversationListChange } from '../src/shared/domain/conversation-list'
const conversation = (id: string, time: string): Conversation => ({ id, kind: 'group', title: id, agentIds: ['researcher'], mode: 'natural', workspacePath: `/work/${id}`, sharedKnowledgeIds: [], createdAt: time, updatedAt: time, configVersion: 3 })
const names = (items: Conversation[]) => sortedConversations(items).map(item => item.id)
const change = (items: Conversation[], action: ConversationListChange) => {
  const updates = conversationListUpdates(items, action)
  return items.map(item => updates.find(update => update.id === item.id) ?? item)
}
describe('conversation list preferences', () => {
  it('keeps legacy recency until manually sorted, then resists incoming message jumps', () => {
    const original = [conversation('A', '2026-01-01'), conversation('B', '2026-01-02'), conversation('C', '2026-01-03')]
    expect(names(original)).toEqual(['C', 'B', 'A'])
    const moved = change(original, { action: 'move', id: 'A', targetId: 'C', placement: 'before' })
    expect(sortedConversations(moved, { B: '2026-12-01' }).map(item => item.id)).toEqual(['A', 'C', 'B'])
    expect(moved.every(item => item.configVersion === 3 && item.updatedAt === original.find(old => old.id === item.id)!.updatedAt)).toBe(true)
    expect(original.every(item => !item.list)).toBe(true)
  })
  it('moves relative to a filtered target without losing unshown items and keeps pins separate', () => {
    let items = ['A', 'B', 'C', 'D'].map(id => conversation(id, '2026-01-01'))
    items = change(items, { action: 'move', id: 'D', targetId: 'B', placement: 'after' })
    expect(names(items)).toEqual(['A', 'B', 'D', 'C'])
    items = change(items, { action: 'pin', id: 'C', pinned: true })
    expect(names(items)).toEqual(['C', 'A', 'B', 'D'])
    expect(() => change(items, { action: 'move', id: 'A', targetId: 'C', placement: 'before' })).toThrow('同一置顶分组')
    items = change(items, { action: 'pin', id: 'C', pinned: false })
    expect(names(items)).toEqual(['C', 'A', 'B', 'D'])
  })
  it('hides only the list entry and restores the same identity and workspace', () => {
    const original = conversation('A', '2026-01-01')
    const hidden = change([{ ...original, list: { pinned: true } }], { id: 'A', action: 'hide' })
    expect(names(hidden)).toEqual([])
    expect(hidden[0]).toMatchObject(original)
    expect(() => change(hidden, { id: 'A', action: 'pin', pinned: true })).toThrow('通讯录')
    const restored = change(hidden, { id: 'A', action: 'show' })
    expect(names(restored)).toEqual(['A'])
    expect(restored[0]).toMatchObject({ ...original, list: { pinned: false, hidden: false } })
    expect(() => change(restored, { id: 'A', action: 'move', targetId: 'missing', placement: 'after' })).toThrow('目标会话不存在')
  })
  it('keeps core assistant ordering and pinning independent of ordinary conversations', () => {
    const regular = { ...conversation('ordinary', '2026-01-01'), list: { pinned: false, order: 7 } }
    const core = ['core-A', 'core-B'].map(id => ({ ...conversation(id, '2026-01-01'), kind: 'direct' as const, purpose: 'core' as const, agentIds: ['bobo'] }))
    const original = [regular, ...core]
    expect(() => change(original, { id: 'core-A', action: 'move', targetId: 'ordinary', placement: 'before' })).toThrow('同一会话分类')
    const moved = change(original, { id: 'core-B', action: 'move', targetId: 'core-A', placement: 'before' })
    expect(names(moved).filter(id => id.startsWith('core'))).toEqual(['core-B', 'core-A'])
    expect(moved[0]).toBe(regular)
    const pinned = change(moved, { id: 'core-A', action: 'pin', pinned: true })
    expect(pinned[0]).toBe(regular)
    const hidden = change(pinned, { id: 'core-A', action: 'hide' })
    const restored = change(hidden, { id: 'core-A', action: 'show' })
    expect(restored[0]).toBe(regular)
    expect(restored.find(item => item.id === 'core-A')?.purpose).toBe('core')
  })
})
