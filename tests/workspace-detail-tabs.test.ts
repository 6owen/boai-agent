/*
 * [OUTPUT]: 2026-10-29 文件浏览器入口/预览/启停与目录撤权回归，原终端生命周期断言保持。
 * [INPUT]: 工作区文件/开始身份、真实终端ID和跨页面清理事件。
 * [OUTPUT]: 文件按员工隔离、终端保持实例、显式关闭回开始和清理不复活的状态合同。
 * [POS]: 工作区详情标签回归；不创建PTY或读取真实文件。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it } from 'vitest'
import { detailTabsReducer, detailWorkspacesReducer, emptyDetailTabs, type DetailTarget } from '../apps/electron/src/renderer/components/detail-panel/tabs-state'

describe('user workspace tabs', () => {
  it('separates workspace directories by employee and conversation while reusing the start tab', () => {
    let state = emptyDetailTabs
    const targets: DetailTarget[] = [
      { type: 'user-workspace', id: 'group', view: 'start' },
      { type: 'user-workspace', id: 'group', employeeId: 'a', view: 'start' },
      { type: 'user-workspace', id: 'group', employeeId: 'a', view: 'files' },
      { type: 'user-workspace', id: 'group', employeeId: 'b', view: 'files' },
      { type: 'user-workspace', id: 'private', employeeId: 'a', view: 'files' },
      { type: 'user-workspace', id: 'group', employeeId: 'a', view: 'files' },
    ]
    for (const target of targets) state = detailTabsReducer(state, { type: 'open', target })
    expect(state.tabs).toHaveLength(4)
    expect(state.activeKey).toBe('user-workspace:group:a:files')
  })
  it('keeps distinct real terminals and selecting or hiding never replaces their identities', () => {
    let state = emptyDetailTabs
    for (const id of ['one', 'two', 'one']) state = detailTabsReducer(state, { type: 'open', target: { type: 'user-terminal', id, employeeId: 'a', conversationId: 'room' } })
    expect(state.tabs).toHaveLength(2)
    const before = state.tabs
    state = detailTabsReducer(state, { type: 'visibility', shown: false })
    expect(state.tabs).toBe(before)
    expect(state.shown).toBe(false)
    state = detailTabsReducer(state, { type: 'select', key: 'user-terminal:two' })
    expect(state.tabs).toBe(before)
    expect(state.activeKey).toBe('user-terminal:two')
  })
  it('returns to start only after explicit terminal close and keeps page scope', () => {
    const opened = detailTabsReducer(emptyDetailTabs, { type: 'open', target: { type: 'user-terminal', id: 'pty', employeeId: 'a', conversationId: 'room' } }, 'conversations')
    const closed = detailTabsReducer(opened, { type: 'close', key: opened.activeKey!, keepWorkspace: true }, 'conversations')
    expect(closed).toMatchObject({ shown: true, activeKey: 'conversations/user-workspace:room:start', tabs: [{ target: { type: 'user-workspace', id: 'room', employeeId: 'a', view: 'start' } }] })
    const hidden = detailTabsReducer(closed, { type: 'close', key: closed.activeKey!, keepWorkspace: true }, 'conversations')
    expect(hidden).toEqual(emptyDetailTabs)
  })
  it('clears all owned workspace views without recreating a start tab or closing other conversations', () => {
    let state = {}
    for (const scope of ['conversations', 'contacts']) {
      for (const target of [
        { type: 'user-workspace', id: 'deleted', employeeId: 'a', view: 'files' },
        { type: 'user-terminal', id: 'pty', employeeId: 'a', conversationId: 'deleted' },
        { type: 'user-terminal', id: 'keep', employeeId: 'a', conversationId: 'other' },
      ] as DetailTarget[]) state = detailWorkspacesReducer(state, { scope, action: { type: 'open', target } })
    }
    const cleared = detailWorkspacesReducer(state, { type: 'remove-workspace', id: 'deleted' })
    for (const value of Object.values(cleared)) expect(value.tabs.map(tab => tab.target.type === 'user-terminal' ? tab.target.id : '')).toEqual(['keep'])
  })
  it('does not reopen the retired employee terminal target', () => {
    expect(detailTabsReducer(emptyDetailTabs, { type: 'open', target: { type: 'workspace', id: 'room', employeeId: 'a', view: 'terminal' } })).toBe(emptyDetailTabs)
  })
})

it('keeps employee configuration workspace distinct from conversation authorized directories and delivered files', () => {
  let state = emptyDetailTabs
  for (const target of [
    { type: 'employee-workspace', id: 'a' }, { type: 'employee-workspace', id: 'a' },
    { type: 'user-workspace', id: 'room', employeeId: 'a', view: 'files' },
    { type: 'files', owner: 'employee', id: 'a' },
  ] as DetailTarget[]) state = detailTabsReducer(state, { type: 'open', target })
  expect(state.tabs.map(tab => tab.key)).toEqual(['employee-workspace:a', 'user-workspace:room:a:files', 'files:employee:a'])
})
