/*
 * [INPUT]: 详情标签的纯状态转换。
 * [OUTPUT]: Trace 重开重新定位且按轮次/员工隔离；标签去重、会话范围、排序后身份/选择保留、关闭邻项和收起保留的不变量。
 * [POS]: 多标签状态的模块回归。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it } from 'vitest'
import { detailTabsReducer as reduce, emptyDetailTabs, type DetailTarget } from '../src/renderer/components/detail-panel/tabs-state'

describe('detail workspace tabs', () => {
  const employee: DetailTarget = { type: 'agent', id: 'researcher', conversationId: 'group-a' }
  const activity: DetailTarget = { type: 'activity', id: 'group-a' }
  it('reuses an existing tab without reordering or replacing its session', () => {
    const first = reduce(emptyDetailTabs, { type: 'open', target: activity })
    const both = reduce(first, { type: 'open', target: employee })
    const reopened = reduce(both, { type: 'open', target: activity })
    expect(reopened.tabs).toBe(both.tabs)
    expect(reopened.activeKey).toBe(first.activeKey)
    expect(reopened.tabs).toHaveLength(2)
    const anotherScope = reduce(reopened, { type: 'open', target: { ...employee, conversationId: 'group-b' } })
    expect(anotherScope.tabs).toHaveLength(3)
    expect(anotherScope.tabs[1]?.target).toEqual(employee)
  })
  it('closing a background tab preserves the active tab; closing the active tab selects its neighbor', () => {
    let state = reduce(emptyDetailTabs, { type: 'open', target: activity })
    state = reduce(state, { type: 'open', target: employee })
    state = reduce(state, { type: 'open', target: { type: 'schedule' } })
    const background = reduce(state, { type: 'close', key: state.tabs[0]!.key })
    expect(background.activeKey).toBe(state.activeKey)
    const active = reduce(background, { type: 'close', key: background.activeKey! })
    expect(active.activeKey).toBe(background.tabs[0]?.key)
    expect(reduce(active, { type: 'close', key: active.activeKey! })).toEqual(emptyDetailTabs)
    expect(reduce(state, { type: 'close', key: 'unknown' })).toBe(state)
  })
  it('hiding and restoring retains every open tab and its selection', () => {
    const opened = reduce(emptyDetailTabs, { type: 'open', target: employee })
    const hidden = reduce(opened, { type: 'visibility', shown: false })
    expect(hidden.tabs).toBe(opened.tabs)
    expect(hidden.activeKey).toBe(opened.activeKey)
    expect(reduce(hidden, { type: 'visibility', shown: true })).toEqual(opened)
  })
})

it('reorders stable tab sessions without changing active selection and closes by the new order', () => {
  let state = emptyDetailTabs
  for (const id of ['a', 'b', 'c']) state = reduce(state, { type: 'open', target: { type: 'activity', id } })
  const original = state.tabs
  state = reduce(state, { type: 'move', key: 'activity:c', targetKey: 'activity:a', placement: 'before' })
  expect(state.tabs.map(tab => tab.key)).toEqual(['activity:c', 'activity:a', 'activity:b'])
  expect(state.tabs[0]).toBe(original[2])
  expect(state.activeKey).toBe('activity:c')
  expect(reduce(state, { type: 'move', key: 'activity:a', targetKey: 'unknown', placement: 'after' })).toBe(state)
  expect(reduce(state, { type: 'close', key: 'activity:c' }).activeKey).toBe('activity:a')
})

it('reanchors an existing trace tab on icon open while preserving other employee and turn tabs', () => {
  const target: DetailTarget = { type: 'trace', id: 'conversation', agentId: 'researcher', turnId: 'turn-1', messageId: 'reply-1', requestId: 'open-1' }
  const first = reduce(emptyDetailTabs, { type: 'open', target })
  const second = reduce(first, { type: 'open', target: { ...target, agentId: 'writer' } })
  const third = reduce(second, { type: 'open', target: { ...target, turnId: 'turn-2' } })
  const reopened = reduce(third, { type: 'open', target: { ...target, messageId: 'reply-2', requestId: 'open-2' } })
  expect(reopened.tabs).toHaveLength(3)
  expect(reopened.activeKey).toBe(first.activeKey)
  expect(reopened.tabs[0].target).toMatchObject({ messageId: 'reply-2', requestId: 'open-2' })
  expect(reopened.tabs.slice(1)).toEqual(third.tabs.slice(1))
})
