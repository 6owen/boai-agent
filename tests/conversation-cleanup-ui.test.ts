// @vitest-environment jsdom
/*
 * [INPUT]: 生产组织结果/清理确认组件、可控读取和清理生命周期事件。
 * [OUTPUT]: 清理期间停读、在途/迟到错误隔离、真实错误保持与单次/批量成功反馈回归。
 * [POS]: bobo会话删除状态误报的组件回归；真实宿主窗口由service-reading测试覆盖。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { toast } from 'sonner'
import type { Conversation, Snapshot } from '../packages/shared/src/domain'
import type { AppEvent, DesktopApi } from '../packages/shared/src/ipc'
import { CoreCollaborationResults } from '../apps/electron/src/renderer/pages/conversations/-components/core-collaboration-results'
import { ConversationHistoryDialog, type ConversationHistoryTarget } from '../apps/electron/src/renderer/pages/conversations/-components/conversation-history-dialog'

let host: HTMLDivElement, root: Root, api: DesktopApi
let pending: Array<{ resolve(value: []): void; reject(error: Error): void }>
let listeners: Set<(event: AppEvent) => void>
beforeEach(() => {
  vi.useFakeTimers(); vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.getAnimations = () => []
  localStorage.clear(); pending = []; listeners = new Set()
  api = { request: vi.fn(() => new Promise((resolve, reject) => pending.push({ resolve, reject }))), subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } } } as DesktopApi
  vi.spyOn(toast, 'error').mockReturnValue('error'); vi.spyOn(toast, 'success').mockReturnValue('success')
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals() })
const emit = (event: AppEvent) => { for (const listener of listeners) listener(event) }
const renderResults = async (conversationId = 'core', active = true) => act(async () => root.render(createElement(CoreCollaborationResults, { api, conversationId, active, busy: false, snapshot: { agents: [], conversations: [] } as unknown as Snapshot, onGroup() {}, onAgent() {} })))
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(value => value.textContent === label)!

test.each([true, false])('cleanup invalidates pending errors and blocks refresh until completion; hidden=%s', async hidden => {
  await renderResults(); expect(pending).toHaveLength(1)
  await act(async () => {
    emit({ type: 'conversation:clearing', conversationId: 'core' })
    emit({ type: 'changed', conversationId: 'core' })
    pending.shift()!.reject(new Error('此会话清理尚未完成，请重试清空聊天记录'))
    await vi.advanceTimersByTimeAsync(500)
  })
  expect(api.request).toHaveBeenCalledTimes(1); expect(toast.error).not.toHaveBeenCalled()
  await act(async () => {
    emit({ type: 'conversation:cleared', conversationId: 'core', hidden })
    emit({ type: 'changed', conversationId: 'core' })
    await vi.advanceTimersByTimeAsync(500)
  })
  expect(api.request).toHaveBeenCalledTimes(hidden ? 1 : 2)
  expect(toast.error).not.toHaveBeenCalled(); expect(toast.success).not.toHaveBeenCalled()
})

test('a read rejected after deletion and a pending timer cannot recreate a cleared error', async () => {
  await renderResults()
  await act(async () => {
    emit({ type: 'changed', conversationId: 'core' })
    emit({ type: 'conversation:clearing', conversationId: 'core' })
    emit({ type: 'conversation:deleted', conversationId: 'core' })
    emit({ type: 'changed' })
    pending.shift()!.reject(new Error('会话不存在'))
    await vi.advanceTimersByTimeAsync(500)
  })
  expect(api.request).toHaveBeenCalledTimes(1); expect(toast.error).not.toHaveBeenCalled()
})

test('clearing another conversation does not suppress real query failures or the recovery action', async () => {
  await renderResults()
  await act(async () => { emit({ type: 'conversation:clearing', conversationId: 'other' }); pending.shift()!.reject(new Error('真正的读取失败')) })
  expect(toast.error).toHaveBeenCalledWith('组织结果暂不可核对：真正的读取失败', expect.anything())
  expect(button('核对组织结果')).toBeDefined()
})

test('switching conversations rejects old failures while the new conversation still refreshes', async () => {
  await renderResults(); const old = pending.shift()!
  await renderResults('new')
  await act(async () => { old.reject(new Error('旧错误')); pending.shift()!.resolve([]) })
  expect(toast.error).not.toHaveBeenCalled()
  await renderResults('new', false)
  await act(async () => { emit({ type: 'changed' }); await vi.advanceTimersByTimeAsync(500) })
  expect(api.request).toHaveBeenCalledTimes(2)
})

test.each([true, false])('the confirmation owns one success only after cleanup resolves; hide=%s', async hide => {
  let finish!: () => void
  const clear = vi.fn(() => new Promise<void>(resolve => { finish = resolve })), close = vi.fn()
  const target = { hide, conversation: { id: 'core', title: 'bobo' } as Conversation }
  await act(async () => root.render(createElement(ConversationHistoryDialog, { target, busy: false, onClear: clear, onClose: close })))
  await act(async () => { const confirm = button(hide ? '删除会话及记录' : '确认清空'); confirm.click(); confirm.click() })
  expect(clear).toHaveBeenCalledTimes(1); expect(toast.success).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled()
  expect(button('正在清理…').disabled).toBe(true)
  await act(async () => finish())
  expect(toast.success).toHaveBeenCalledTimes(1)
  expect(toast.success).toHaveBeenCalledWith(hide ? '会话已删除' : '聊天记录已清空')
  expect(close).toHaveBeenCalledTimes(1)
})

test('partial batch failure retains progress and does not repeat a completed deletion on retry', async () => {
  const clear = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('真实清理失败')).mockResolvedValueOnce(undefined), close = vi.fn()
  const target: ConversationHistoryTarget = { hide: true, agentName: 'bobo', conversations: ['one', 'two'].map(id => ({ id, title: id } as Conversation)) }
  await act(async () => root.render(createElement(ConversationHistoryDialog, { target, busy: false, onClear: clear, onClose: close })))
  await act(async () => button('删除所有会话及记录').click())
  expect(toast.success).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled()
  expect(document.body.textContent).toContain('已清理 1 / 2 个会话')
  expect(toast.error).toHaveBeenCalledWith('真实清理失败', expect.anything())
  await act(async () => button('继续清理剩余会话').click())
  expect(clear.mock.calls).toEqual([['one', true], ['two', true], ['two', true]])
  expect(toast.success).toHaveBeenCalledTimes(1); expect(toast.success).toHaveBeenCalledWith('已删除 2 个会话')
})
