/*
 * [OUTPUT]: 旧terminal目标不可重开，预览目标仍沿原标签身份。
 * [OUTPUT]: 同一旧知识资源按员工隔离预览标签，避免授权身份串用。
 * [OUTPUT]: 同一会话不同Run分别打开过程标签，重复点击同Run去重，普通会话历史保持独立。
 * [OUTPUT]: 删除某次执行关闭所有页面的同源过程标签，其他标签及所选项保持。
 * [OUTPUT]: 数据源固定ID复用/显隐/重开请求与跨页面标签隔离回归。
 * [OUTPUT]: 文件修改员工选择支持纯本机Claude，同时拒绝缺失profile与失效/不兼容的显式API来源。
 * [OUTPUT]: 渠道只持一个详情视图，连续打开/返回不增标签；显式来源、关闭后迟到、跨员工/跨页与递归拒绝。
 * [OUTPUT]: 2026-10-11 第13组原生生产合同回归与旧阶段兼容分开；夹具成功不冒充真实模型验收。
 * [OUTPUT]: 员工渠道标签去重并更新明确会话/消息目标，其他员工与主页面标签独立保留。
 * [INPUT]: 详情标签/成果未决请求的纯状态转换与真实员工/连接配置。
 * [OUTPUT]: 固定修订回执必须匹配本人原请求与指定员工； 真实核心默认连接/显式连接保留与跨页迟到回执隔离；成果家族/明确版本/hash与主页面隔离、冻结请求的未知只读核对/重启统一 unknown（旧 null 不授权重发）/原身份重试；自动化新建草稿/按计划编辑去重、重命名与独立关闭；Trace 重开重新定位且按轮次/员工隔离；标签去重、会话范围、排序后身份/选择保留、关闭邻项和收起保留的不变量。
 * [POS]: 多标签状态的模块回归。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { describe, expect, it } from 'vitest'
import { detailTabsReducer as reduce, detailWorkspacesReducer, emptyDetailTabs, type DetailTarget } from '../apps/electron/src/renderer/components/detail-panel/tabs-state'
import { artifactPendingKey, artifactReceiptResult, artifactRequestAction, artifactRevisionTarget, artifactRevisionReceiptMatches, artifactAdoptionReceiptMatches, restoreArtifactPending, updateArtifactPending, type ArtifactPending } from '../apps/electron/src/renderer/components/detail-panel/artifact-state'
import type { Connection, DigitalAgent } from '../packages/shared/src/domain'

describe('detail workspace tabs', () => {
  it('keeps shared legacy knowledge preview scoped to the selected employee', () => {
    let state = emptyDetailTabs
    for (const agentId of ['a', 'b', 'a']) state = reduce(state, { type: 'open', target: { type: 'resource', id: 'shared', agentId } })
    expect(state.tabs.map(tab => tab.key)).toEqual(['resource:shared:a', 'resource:shared:b'])
    expect(state.tabs[0].target).toMatchObject({ agentId: 'a' }); expect(state.tabs[1].target).toMatchObject({ agentId: 'b' })
    expect(state.activeKey).toBe('resource:shared:a')
  })
  it('keeps exact execution tabs distinct from other runs and the full conversation history', () => {
    let state = reduce(emptyDetailTabs, { type: 'open', target: { type: 'trace', id: 'chat' } })
    for (const runId of ['one', 'two', 'one']) state = reduce(state, { type: 'open', target: { type: 'trace', id: 'chat', agentId: 'agent', runId } })
    expect(state.tabs.map(tab => tab.key)).toEqual(['trace:chat', 'trace:chat:one', 'trace:chat:two'])
    expect(state.activeKey).toBe('trace:chat:one')
  })
  it('removes deleted occurrence panels in every workspace and retains unrelated tabs', () => {
    let state = detailWorkspacesReducer({}, { scope: 'schedules', action: { type: 'open', target: { type: 'automation-occurrence', id: 'deleted' } } })
    state = detailWorkspacesReducer(state, { scope: 'conversations', action: { type: 'open', target: { type: 'automation-occurrence', id: 'deleted' } } })
    state = detailWorkspacesReducer(state, { scope: 'schedules', action: { type: 'open', target: { type: 'automation-occurrence', id: 'keep' } } })
    state = detailWorkspacesReducer(state, { type: 'remove-automation-occurrence', id: 'deleted' })
    expect(state.conversations).toMatchObject({ tabs: [], shown: false, activeKey: null })
    expect(state.schedules.tabs).toHaveLength(1)
    expect(state.schedules.tabs[0].target).toMatchObject({ type: 'automation-occurrence', id: 'keep' })
    expect(state.schedules.activeKey).toBe(state.schedules.tabs[0].key)
  })
  it('reopens the same data-source tab with fresh context without replacing skills or other pages', () => {
    const source: DetailTarget = { type: 'source', id: 'mcp-a', name: 'MCP', requestId: 'first' }
    const first = detailWorkspacesReducer({}, { scope: 'skills', action: { type: 'open', target: source } })
    const skill: DetailTarget = { type: 'local-skill', id: 'mcp-a', name: 'Skill', requestId: 'skill' }
    const both = detailWorkspacesReducer(first, { scope: 'skills', action: { type: 'open', target: skill } })
    const other = detailWorkspacesReducer(both, { scope: 'conversations', action: { type: 'open', target: source } })
    const reopened = detailWorkspacesReducer(other, { scope: 'skills', action: { type: 'open', target: { ...source, name: 'Updated MCP', requestId: 'second' } } })
    expect(reopened.skills.tabs).toHaveLength(2)
    expect(reopened.skills.tabs[0].target).toMatchObject({ name: 'Updated MCP', requestId: 'second' })
    expect(reopened.skills.tabs[1]).toBe(both.skills.tabs[1])
    expect(reopened.conversations).toBe(other.conversations)
    expect(reopened.skills.activeKey).toBe(first.skills.activeKey)
    const hidden = reduce(reopened.skills, { type: 'visibility', shown: false })
    expect(hidden.tabs).toBe(reopened.skills.tabs)
    expect(reduce(hidden, { type: 'visibility', shown: true }).activeKey).toBe(first.skills.activeKey)
  })
  const employee: DetailTarget = { type: 'agent', id: 'researcher', conversationId: 'group-a' }
  const activity: DetailTarget = { type: 'activity', id: 'group-a' }
  it('replaces channel details in one slot and returns to the same employee and room', () => {
    const channel: DetailTarget = { type: 'channels', id: 'researcher', conversationId: 'private-a', requestId: 'open' }
    const root = reduce(emptyDetailTabs, { type: 'open', target: channel })
    const info = reduce(root, { type: 'open', target: { type: 'group', id: 'private-a' }, withinKey: root.activeKey! })
    const configuration = reduce(info, { type: 'open', target: employee, withinKey: root.activeKey! })
    expect(configuration.tabs).toEqual([{ key: root.activeKey, target: channel, detail: employee }])
    expect(configuration.activeKey).toBe(root.activeKey)
    expect(reduce(configuration, { type: 'back', key: root.activeKey! })).toEqual(root)
    expect(reduce(configuration, { type: 'open', target: { ...channel, conversationId: 'group-b' } }).tabs[0]).toEqual({ key: root.activeKey, target: { ...channel, conversationId: 'group-b' } })
  })
  it('rejects nested channels and late detail opens after their owner closed', () => {
    const channel: DetailTarget = { type: 'channels', id: 'researcher', requestId: 'open' }
    const root = reduce(emptyDetailTabs, { type: 'open', target: channel })
    expect(reduce(root, { type: 'open', target: { ...channel, id: 'writer' }, withinKey: root.activeKey! })).toBe(root)
    const closed = reduce(root, { type: 'close', key: root.activeKey! })
    expect(reduce(closed, { type: 'open', target: employee, withinKey: root.activeKey! })).toBe(closed)
  })
  it('keeps main-chat details separate and prevents a foreign page from taking a channel owner', () => {
    const opened = detailWorkspacesReducer({}, { scope: 'conversations', action: { type: 'open', target: { type: 'channels', id: 'researcher', requestId: 'open' } } })
    const owner = opened.conversations.activeKey!
    const main = detailWorkspacesReducer(opened, { scope: 'conversations', action: { type: 'open', target: employee } })
    expect(main.conversations.tabs).toHaveLength(2)
    expect(main.conversations.tabs[0].detail).toBeUndefined()
    expect(detailWorkspacesReducer(main, { scope: 'contacts', action: { type: 'open', target: employee, withinKey: owner } })).toBe(main)
  })
  it('keeps employee channel tabs independent while updating an explicit room and message target', () => {
    const first: DetailTarget = { type: 'channels', id: 'researcher', conversationId: 'private-a', requestId: 'open-a' }
    const second: DetailTarget = { type: 'channels', id: 'writer', conversationId: 'private-b', requestId: 'open-b' }
    const both = reduce(reduce(emptyDetailTabs, { type: 'open', target: first }), { type: 'open', target: second })
    const focused: DetailTarget = { ...first, conversationId: 'group-a', requestId: 'focus', focusMessage: { id: 'message-a', requestId: 'focus' } }
    const next = reduce(both, { type: 'open', target: focused })
    expect(next.tabs.map(tab => tab.key)).toEqual(both.tabs.map(tab => tab.key))
    expect(next.tabs[0].target).toEqual(focused)
    expect(next.tabs[1]).toBe(both.tabs[1])
    expect(next.activeKey).toBe(next.tabs[0].key)
    const hidden = reduce(next, { type: 'visibility', shown: false })
    expect(hidden.tabs).toBe(next.tabs)
    expect(reduce(hidden, { type: 'visibility', shown: true }).tabs[0].target).toEqual(focused)
  })
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

it('reanchors the single conversation execution tab across employees and turns', () => {
  const target: DetailTarget = { type: 'trace', id: 'conversation', agentId: 'researcher', turnId: 'turn-1', messageId: 'reply-1', requestId: 'open-1' }
  const first = reduce(emptyDetailTabs, { type: 'open', target })
  const second = reduce(first, { type: 'open', target: { ...target, agentId: 'writer' } })
  const third = reduce(second, { type: 'open', target: { ...target, turnId: 'turn-2' } })
  const reopened = reduce(third, { type: 'open', target: { ...target, messageId: 'reply-2', requestId: 'open-2' } })
  expect(reopened.tabs).toHaveLength(1)
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
  it('offers native Claude without requiring an unrelated API connection', () => {
    const employee = { id: 'claude', active: true, connectionId: '', modelId: '', executionBackend: { kind: 'claude-local', profileId: 'claude-login' } } as DigitalAgent
    expect(artifactRevisionTarget(employee, [])).toEqual({ backend: 'claude-local' })
    expect(artifactRevisionTarget({ ...employee, active: false }, [])).toBeUndefined()
    expect(artifactRevisionTarget({ ...employee, executionBackend: { kind: 'claude-local', profileId: '' } }, [])).toBeUndefined()
    expect(artifactRevisionTarget({ ...employee, executionBackend: { kind: 'acp-local', profileId: 'old-acp' } }, [])).toBeUndefined()
  })
  it('keeps the explicit Claude provider validation and never substitutes another connection', () => {
    const connection: Connection = { id: 'anthropic', name: 'Claude', provider: 'anthropic', baseUrl: '', defaultModel: 'claude-test', hasApiKey: true }
    const employee = { id: 'claude', active: true, connectionId: connection.id, modelId: '', executionBackend: { kind: 'claude-local', profileId: 'claude-api' } } as DigitalAgent
    expect(artifactRevisionTarget(employee, [connection])).toEqual({ backend: 'claude-local' })
    expect(artifactRevisionTarget(employee, [{ ...connection, id: 'another' }])).toBeUndefined()
    for (const patch of [{ hasApiKey: false }, { defaultModel: '' }, { provider: 'openai' as const }, { provider: 'openai-compatible' as const, baseUrl: 'https://example.com/v1' }]) expect(artifactRevisionTarget(employee, [{ ...connection, ...patch }])).toBeUndefined()
    expect(artifactRevisionTarget({ ...employee, executionBackend: { kind: 'claude-local', profileId: '' } }, [connection])).toBeUndefined()
    expect(artifactRevisionTarget({ ...employee, executionBackend: { kind: 'codex-local', profileId: 'codex' } }, [connection])).toBeUndefined()
  })
  it('checks the adoption receipt belongs to the frozen request, family and expected adoption revision', () => {
    const input = pending.adoption!.input
    const receipt = { id: input.requestId, fingerprint: 'fingerprint', conversationId: 'chat', logicalArtifactId: 'report', artifactId: input.artifactId, contentHash: input.contentHash, eventId: 'event', adoptionRevision: input.expectedAdoptionRevision + 1, adoptedAt: '2026-10-03T00:00:00Z', userId: 'user' as const }
    expect(artifactAdoptionReceiptMatches(input, receipt, 'chat', 'report')).toBe(true)
    expect(artifactAdoptionReceiptMatches(input, { ...receipt, id: 'other-request' }, 'chat', 'report')).toBe(false)
    expect(artifactAdoptionReceiptMatches(input, { ...receipt, adoptionRevision: receipt.adoptionRevision + 1 }, 'chat', 'report')).toBe(false)
    expect(artifactAdoptionReceiptMatches(input, receipt, 'other-chat', 'report')).toBe(false)
    expect(artifactAdoptionReceiptMatches(input, receipt, 'chat', 'other-family')).toBe(false)
  })
  it('accepts only the original personal revision receipt for the explicitly selected employee', () => {
    const input = pending.revision!.input
    const receipt = { id: 'message', conversationId: input.conversationId, senderType: 'user' as const, senderId: 'user', senderName: '你', status: 'completed' as const, content: input.content, mentionIds: [input.targetAgentId], artifactRevisionRequestId: input.requestId, sequence: 1, createdAt: '2026-10-03T00:00:00Z' }
    expect(artifactRevisionReceiptMatches(input, receipt)).toBe(true)
    expect(artifactRevisionReceiptMatches(input, { ...receipt, artifactRevisionRequestId: 'another-request' })).toBe(false)
    expect(artifactRevisionReceiptMatches(input, { ...receipt, mentionIds: ['other-employee'] })).toBe(false)
    expect(artifactRevisionReceiptMatches(input, { ...receipt, content: 'different request' })).toBe(false)
    expect(artifactRevisionReceiptMatches(input, { ...receipt, artifactRevisionRequestId: undefined })).toBe(false)
    expect(artifactRevisionReceiptMatches(input, { ...receipt, conversationId: 'another-chat' })).toBe(false)
  })
  it('rejects corrupted or oversized inputs rather than restoring an executable incomplete request', () => {
    const key = artifactPendingKey(pending.scope, pending.conversationId, pending.logicalArtifactId)
    expect(restoreArtifactPending({ [key]: { ...pending, adoption: undefined, revision: { ...pending.revision, input: { ...pending.revision!.input, content: 'x'.repeat(12_001) } } } })).toEqual({})
    expect(restoreArtifactPending({ [key]: { ...pending, revision: undefined, adoption: { ...pending.adoption, input: { ...pending.adoption!.input, expectedAdoptionRevision: -1 } } } })).toEqual({})
    expect(restoreArtifactPending({ [key]: { ...pending, revision: undefined, adoption: { ...pending.adoption, input: { ...pending.adoption!.input, contentHash: 'old-size-only-identity' } } } })).toEqual({})
  })
})

it('rejects legacy terminal targets and keeps preview as the only public workspace tab', () => {
  const legacy: DetailTarget = { type: 'workspace', id: 'room', employeeId: 'employee', view: 'terminal' }
  expect(reduce(emptyDetailTabs, { type: 'open', target: legacy })).toBe(emptyDetailTabs)
  const preview = reduce(emptyDetailTabs, { type: 'open', target: { ...legacy, view: 'preview' } })
  expect(preview.tabs).toHaveLength(1)
  expect(reduce(preview, { type: 'open', target: legacy })).toBe(preview)
  expect(preview.tabs[0].target).toMatchObject({ view: 'preview' })
})
