/*
 * [INPUT]: Real detail-tab reducers, host flush barriers and employee/conversation/board identities.
 * [OUTPUT]: Canvas identity, scope cleanup and one aggregate save/backup acknowledgement.
 * [POS]: WT4 targeted UI state acceptance; no Electron, model or personal data.
 * [PROTOCOL]: Update Header and tests/.folder.md when this file changes.
 */
import { describe, expect, it, vi } from 'vitest'
import { detailTabsReducer, detailTargetKey, detailWorkspacesReducer, emptyDetailTabs, type CanvasTarget, type DetailWorkspaces } from '../apps/electron/src/renderer/components/detail-panel/tabs-state'
import { createCanvasHostBarrier } from '../apps/electron/src/renderer/components/canvas/host-barrier'

const board: CanvasTarget = { type: 'canvas', id: 'diagram', name: '设计图', employeeId: 'employee-a', conversationId: 'chat-a' }

describe('managed canvas view identity', () => {
  it('keeps the same board on reopen while updating its title, independently of other work scopes', () => {
    let state = emptyDetailTabs
    for (const target of [board, { ...board, employeeId: 'employee-b' }, { ...board, conversationId: 'chat-b' }, { ...board, name: '修订的设计图' }]) state = detailTabsReducer(state, { type: 'open', target }, 'conversations')
    expect(state.tabs).toHaveLength(3)
    expect(state.tabs[0]!.target).toEqual({ ...board, name: '修订的设计图' })
    expect(state.activeKey).toBe(`conversations/${detailTargetKey(board)}`)
    expect(new Set(state.tabs.map(tab => tab.key)).size).toBe(3)
  })
  it('hides a view without changing its document identity or reopening it on catalog refresh', () => {
    let state = detailTabsReducer(emptyDetailTabs, { type: 'open', target: board }, 'conversations')
    state = detailTabsReducer(state, { type: 'visibility', shown: false }, 'conversations')
    state = detailTabsReducer(state, { type: 'update', target: { ...board, name: '新标题' } }, 'conversations')
    expect(state.shown).toBe(false)
    expect(state.tabs[0]!.key).toBe(`conversations/${detailTargetKey(board)}`)
    const closed = detailTabsReducer(state, { type: 'close', key: state.tabs[0]!.key }, 'conversations')
    expect(detailTabsReducer(closed, { type: 'update', target: board }, 'conversations')).toBe(closed)
  })
  it('withdraws every canvas view of a cleared conversation and retains other documents and panels', () => {
    let workspaces: DetailWorkspaces = {}
    for (const scope of ['conversations', 'contacts']) {
      for (const target of [board, { ...board, id: 'other-diagram' }, { ...board, conversationId: 'chat-b' }, { type: 'files' as const, owner: 'employee' as const, id: 'employee-a' }]) {
        workspaces = detailWorkspacesReducer(workspaces, { scope, action: { type: 'open', target } })
      }
    }
    const cleared = detailWorkspacesReducer(workspaces, { type: 'remove-workspace', id: 'chat-a' })
    for (const state of Object.values(cleared)) {
      expect(state.tabs.map(tab => tab.target.type)).toEqual(['canvas', 'files'])
      expect(state.tabs[0]!.target).toMatchObject({ conversationId: 'chat-b' })
    }
  })
})

describe('managed canvas host barrier', () => {
  const handle = () => ({ flush: vi.fn(async () => {}), flushForHost: vi.fn(async (_id?: string) => {}), resumeHost: vi.fn() })
  it('acknowledges exactly once when no matching view is open', async () => {
    const reply = vi.fn(async () => {}), onError = vi.fn()
    const barrier = createCanvasHostBarrier({ targets: () => [], reply, errorText: String, onError })
    await barrier.receive({ type: 'canvas:flush', id: 'no-views', scope: { employeeId: 'employee-a' } })
    expect(reply.mock.calls).toEqual([[{ id: 'no-views' }]])
    expect(onError).not.toHaveBeenCalled()
  })
  it('flushes hidden views in scope and holds all scopes for backup until the matching resume', async () => {
    const a = handle(), b = handle(), reply = vi.fn(async () => {})
    const targets = [{ scope: { employeeId: 'a', conversationId: 'chat-a' }, boardId: 'a', handle: a }, { scope: { employeeId: 'b', conversationId: 'chat-b' }, boardId: 'b', handle: b }]
    const barrier = createCanvasHostBarrier({ targets: () => targets, reply, errorText: String, onError: vi.fn() })
    await barrier.receive({ type: 'canvas:flush', id: 'scoped', scope: { employeeId: 'a' } })
    expect(a.flushForHost.mock.calls).toEqual([[undefined]])
    expect(b.flushForHost).not.toHaveBeenCalled()
    await barrier.receive({ type: 'canvas:flush', id: 'backup', hold: true })
    expect(a.flushForHost).toHaveBeenLastCalledWith('backup')
    expect(b.flushForHost).toHaveBeenLastCalledWith('backup')
    await barrier.receive({ type: 'canvas:resume', id: 'unrelated' })
    expect(a.resumeHost).not.toHaveBeenCalled()
    await barrier.receive({ type: 'canvas:resume', id: 'backup' })
    expect(a.resumeHost.mock.calls).toEqual([['backup']])
    expect(b.resumeHost.mock.calls).toEqual([['backup']])
    expect(reply).toHaveBeenCalledTimes(2)
  })
  it('waits for every matching view, reports save failure once and releases a failed hold', async () => {
    const a = handle(), b = handle(), reply = vi.fn(async () => {})
    let finish: () => void = () => {}
    a.flushForHost.mockRejectedValueOnce(new Error('保存失败'))
    b.flushForHost.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
    const barrier = createCanvasHostBarrier({ targets: () => [a, b].map((handle, i) => ({ scope: { employeeId: 'a' }, boardId: String(i), handle })), reply, errorText: error => (error as Error).message, onError: vi.fn() })
    const first = barrier.receive({ type: 'canvas:flush', id: 'failed', hold: true })
    await barrier.receive({ type: 'canvas:flush', id: 'failed', hold: true })
    expect(reply).not.toHaveBeenCalled()
    finish(); await first
    expect(reply.mock.calls).toEqual([[{ id: 'failed', error: '保存失败' }]])
    barrier.release()
    expect(a.resumeHost).toHaveBeenCalledWith('failed')
    expect(b.resumeHost).toHaveBeenCalledWith('failed')
  })
})
