/*
 * [INPUT]: 详情标签/成果未决请求的纯状态转换与真实员工/连接配置。
 * [OUTPUT]: 真实核心默认连接/显式连接保留与跨页迟到回执隔离；成果家族/明确版本/hash与主页面隔离、冻结请求的未知只读核对/重启统一 unknown（旧 null 不授权重发）/原身份重试；自动化新建草稿/按计划编辑去重、重命名与独立关闭；Trace 重开重新定位且按轮次/员工隔离；标签去重、会话范围、排序后身份/选择保留、关闭邻项和收起保留的不变量。
 * [POS]: 多标签状态的模块回归。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it } from 'vitest'
import { detailTabsReducer as reduce, detailWorkspacesReducer, emptyDetailTabs, type DetailTarget } from '../src/renderer/components/detail-panel/tabs-state'
import { artifactPendingKey, artifactReceiptResult, artifactRequestAction, artifactRevisionTarget, restoreArtifactPending, updateArtifactPending, type ArtifactPending } from '../src/renderer/components/detail-panel/artifact-state'
import type { Connection, DigitalAgent } from '../src/shared/domain'

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
it('keeps a stable automation draft and separate edit sessions while updating only their label', () => {
  let state = reduce(emptyDetailTabs, { type: 'open', target: { type: 'automation-editor' } })
  state = reduce(state, { type: 'open', target: { type: 'automation-editor', id: 'a', name: 'A' } })
  state = reduce(state, { type: 'open', target: { type: 'automation-editor', id: 'b', name: 'B' } })
  const reopened = reduce(state, { type: 'open', target: { type: 'automation-editor' } })
  expect(reopened.tabs).toHaveLength(3)
  expect(reopened.activeKey).toBe('automation-editor:new')
  const renamed = reduce(reopened, { type: 'open', target: { type: 'automation-editor', id: 'a', name: 'New A' } })
  expect(renamed.tabs.map(tab => tab.key)).toEqual(reopened.tabs.map(tab => tab.key))
  expect(renamed.tabs[1].target).toEqual({ type: 'automation-editor', id: 'a', name: 'New A' })
  expect(reduce(renamed, { type: 'close', key: 'automation-editor:new' }).tabs.map(tab => tab.key)).toEqual(['automation-editor:a', 'automation-editor:b'])
})

describe('artifact review identity and pending requests', () => {
  const first: DetailTarget = { type: 'artifact', id: 'v1', logicalArtifactId: 'report', conversationId: 'chat', name: 'report.md', contentHash: 'a'.repeat(64), requestId: 'open-v1' }
  const pending: ArtifactPending = { scope: 'conversations', conversationId: 'chat', logicalArtifactId: 'report', revision: { status: 'pending', input: { conversationId: 'chat', artifactId: 'v1', contentHash: 'a'.repeat(64), targetAgentId: 'writer', content: '修改结论', requestId: 'revision-1' } }, adoption: { status: 'unknown', input: { artifactId: 'v1', contentHash: 'a'.repeat(64), expectedAdoptionRevision: 2, requestId: 'adoption-1' } } }
  it('reuses the logical family only on an explicit version open and preserves review through ordinary navigation', () => {
    const opened = reduce(emptyDetailTabs, { type: 'open', target: first })
    const background = reduce(opened, { type: 'open', target: { type: 'activity', id: 'chat' } })
    const restored = reduce(background, { type: 'select', key: opened.activeKey! })
    expect(restored.tabs[0].target).toBe(first)
    const next = { ...first, id: 'v2', contentHash: 'b'.repeat(64), requestId: 'open-v2' }
    const switched = reduce(restored, { type: 'open', target: next })
    expect(switched.activeKey).toBe(opened.activeKey); expect(switched.tabs.map(tab => tab.key)).toEqual(restored.tabs.map(tab => tab.key))
    expect(switched.tabs[0].target).toEqual(next); expect(switched.tabs[1]).toBe(restored.tabs[1])
  })
  it('keeps identically named independent files and the same family in another chat separate', () => {
    let state = reduce(emptyDetailTabs, { type: 'open', target: first })
    state = reduce(state, { type: 'open', target: { ...first, id: 'unrelated', logicalArtifactId: 'other-report' } })
    state = reduce(state, { type: 'open', target: { ...first, conversationId: 'other-chat' } })
    expect(state.tabs).toHaveLength(3); expect(new Set(state.tabs.map(tab => tab.key)).size).toBe(3)
    expect(state.tabs[0].target).toEqual(first)
  })
  it('isolates family review sessions by sidebar page and preserves the hidden page version', () => {
    let state = detailWorkspacesReducer({}, { scope: 'conversations', action: { type: 'open', target: first } })
    const original = state.conversations
    state = detailWorkspacesReducer(state, { scope: 'schedules', action: { type: 'open', target: { ...first, id: 'v2', contentHash: 'b'.repeat(64) } } })
    expect(state.conversations).toBe(original); expect(state.schedules.activeKey).not.toBe(state.conversations.activeKey)
    expect(state.conversations.tabs[0].target).toEqual(first)
  })
  it('restores pending as unknown, retains both exact keys and inputs and discards extra cached content', () => {
    const key = artifactPendingKey(pending.scope, pending.conversationId, pending.logicalArtifactId)
    const restored = restoreArtifactPending(JSON.parse(JSON.stringify({ [key]: { ...pending, previewText: 'private old file', revision: { ...pending.revision, input: { ...pending.revision!.input, previewText: 'private old file' } } } })))
    expect(restored[key].revision).toEqual({ input: pending.revision!.input, status: 'unknown' })
    expect(restored[key].adoption).toEqual(pending.adoption)
    expect(JSON.stringify(restored)).not.toContain('private old file')
    expect(artifactRequestAction(restored[key].revision)).toBe('lookup'); expect(artifactRequestAction(restored[key].adoption)).toBe('lookup')
  })
  it('requires a readonly receipt result before the original request becomes retryable or removable', () => {
    const request = { ...pending.revision!, status: 'unknown' as const }
    expect(artifactRequestAction(request)).toBe('lookup'); expect(artifactRequestAction(pending.revision)).toBe('wait')
    const notAccepted = artifactReceiptResult(request, false)!
    expect(notAccepted.input).toBe(request.input); expect(notAccepted.input.requestId).toBe('revision-1'); expect(artifactRequestAction(notAccepted)).toBe('submit')
    expect(artifactReceiptResult(request, true)).toBeUndefined(); expect(artifactRequestAction(undefined)).toBe('new')
    const key = artifactPendingKey(pending.scope, pending.conversationId, pending.logicalArtifactId)
    expect(restoreArtifactPending({ [key]: { ...pending, revision: notAccepted } })[key].revision).toEqual({ ...notAccepted, status: 'unknown' })
  })
  it('does not cross-restore a request into a different family, scope or conversation', () => {
    const key = artifactPendingKey(pending.scope, pending.conversationId, pending.logicalArtifactId)
    expect(restoreArtifactPending({ [key]: { ...pending, scope: 'schedules' } })).toEqual({})
    expect(restoreArtifactPending({ [key]: { ...pending, logicalArtifactId: 'other' } })).toEqual({})
    const revisionOnly = { ...pending, adoption: undefined, revision: { ...pending.revision, input: { ...pending.revision!.input, conversationId: 'other' } } }
    expect(restoreArtifactPending({ [key]: revisionOnly })).toEqual({})
    expect(artifactPendingKey('schedules', 'chat', 'report')).not.toBe(key)
  })
  it('applies late receipt updates only to their page family without overwriting another pending request', () => {
    const key = artifactPendingKey('conversations', 'chat', 'report'), otherKey = artifactPendingKey('schedules', 'chat', 'report')
    const other: ArtifactPending = { ...pending, scope: 'schedules', revision: { input: { ...pending.revision!.input, artifactId: 'v2', contentHash: 'b'.repeat(64), requestId: 'other-revision' }, status: 'unknown' } }
    const original = updateArtifactPending({ [key]: pending }, otherKey, other)
    const reconciled = updateArtifactPending(original, key, { ...pending, revision: artifactReceiptResult(pending.revision!, false) })
    expect(reconciled[otherKey]).toBe(other); expect(reconciled[key].revision!.input).toBe(pending.revision!.input)
    expect(reconciled[key].adoption).toBe(pending.adoption)
    const accepted = updateArtifactPending(reconciled, key)
    expect(accepted).toEqual({ [otherKey]: other }); expect(original[key]).toBe(pending)
  })
  it('offers only the true unconfigured core its first usable default without silently replacing an explicit connection', () => {
    const core: DigitalAgent = { id: 'bobo', systemRole: 'core', name: 'Renamed', role: '', instructions: '', color: '', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 }
    const unavailable: Connection = { id: 'missing-key', name: '', provider: 'openai', baseUrl: '', defaultModel: 'invalid', hasApiKey: false }
    const empty: Connection = { ...unavailable, id: 'empty-model', hasApiKey: true, defaultModel: '' }
    const local: Connection = { ...unavailable, id: 'local', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:1234', defaultModel: 'default' }
    expect(artifactRevisionTarget(core, [unavailable, empty, local])).toEqual({ connection: local, modelId: 'default' })
    expect(artifactRevisionTarget({ ...core, connectionId: unavailable.id }, [unavailable, local])).toBeUndefined()
    expect(artifactRevisionTarget({ ...core, id: 'ordinary' }, [local])).toBeUndefined()
    expect(artifactRevisionTarget({ ...core, systemRole: undefined }, [local])).toBeUndefined()
    expect(artifactRevisionTarget({ ...core, active: false }, [local])).toBeUndefined()
    expect(artifactRevisionTarget({ ...core, connectionId: empty.id, modelId: 'custom' }, [empty, local])).toEqual({ connection: empty, modelId: 'custom' })
  })
  it('rejects corrupted or oversized inputs rather than restoring an executable incomplete request', () => {
    const key = artifactPendingKey(pending.scope, pending.conversationId, pending.logicalArtifactId)
    expect(restoreArtifactPending({ [key]: { ...pending, adoption: undefined, revision: { ...pending.revision, input: { ...pending.revision!.input, content: 'x'.repeat(12_001) } } } })).toEqual({})
    expect(restoreArtifactPending({ [key]: { ...pending, revision: undefined, adoption: { ...pending.adoption, input: { ...pending.adoption!.input, expectedAdoptionRevision: -1 } } } })).toEqual({})
    expect(restoreArtifactPending({ [key]: { ...pending, revision: undefined, adoption: { ...pending.adoption, input: { ...pending.adoption!.input, contentHash: 'old-size-only-identity' } } } })).toEqual({})
  })
})
