/*
 * [INPUT]: 工作视图纯筛选/分页生命周期、固定审批身份与真实React只读工作卡。
 * [OUTPUT]: 员工摘要不继承隐藏筛选、原范围AND查询、迟到分页停止、新代际游标重核与重复游标显性失败；文件/审批固定身份拒绝旧响应、可信计划可回查，卡片不提供状态改写/审批或成果采用。
 * [POS]: WV展示意图模块测试；实际页面切换/预览/清理由Electron BDD留证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录.folder.md。
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { WorkItem } from '../src/shared/domain'
import type { DesktopApi } from '../src/shared/ipc'
import type { ConversationFileItem, WorkViewItem, WorkViewTargetInput } from '../src/shared/domain/work-views'
import { emptyWorkFilters, workQuery, appendUnique, dateBoundary, fileRowTargetMatches, selectedFileMatches, workApprovalTargetMatches } from '../src/renderer/components/work-views/model'
import { readFreshPages } from '../src/renderer/components/work-views/pagination'
import { visibleQueryPage } from '../src/renderer/components/work-views/query-lifecycle'
import { WorkCard } from '../src/renderer/components/work-views/work-card'
import { DateFilter } from '../src/renderer/components/work-views/filters'
import { rememberedWorkCard, rememberWorkCard, rememberedWorkSelection, rememberWorkSelection } from '../src/renderer/components/work-views/view-state'

const approvalWork: WorkItem = { id: 'work', schemaVersion: 2, conversationId: 'chat', sourceMessageId: 'source', key: 'key', scope: 'scope', deliverable: '运行命令', ownerAgentId: 'alice', activeRunId: 'run', version: 1, status: 'running', budgetId: 'budget', rootWorkId: 'work', dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: [], artifactIds: [], resultVersion: 0, requiresReview: false, createdAt: '2026-10-05T00:00:00Z', updatedAt: '2026-10-05T00:00:00Z' }
const approvalItem: WorkViewItem = { work: approvalWork, conversationTitle: '员工聊天', ownerName: 'Alice', source: 'ordinary', sourceAvailable: true, childCount: 0, resultMessageIds: [], approvalTargets: [{ approvalId: 'approval', runId: 'run', kind: 'command' }] }
const approvalInput: WorkViewTargetInput = { workId: 'work', kind: 'approval', approvalId: 'approval', runId: 'run' }

describe('工作视图的读取意图', () => {
  it('员工当前工作摘要不受曾经看板中隐藏的关键词、来源、会话、日期和状态筛选影响', () => {
    const query = workQuery({ ...emptyWorkFilters, search: '旧筛选', conversationId: 'other', source: 'automation', state: 'delivered', from: '2026-10-02', to: '2026-10-01' }, { ownerAgentId: 'alice' }, true)
    expect(query).toEqual({ ownerAgentId: 'alice', states: ['ready', 'running', 'waiting', 'blocked'], limit: 5 })
  })
  it('同一任务上的负责人、状态和来源共同提交给宿主，并固定会话范围', () => {
    const query = workQuery({ ...emptyWorkFilters, ownerAgentId: 'bob', state: 'running', source: 'ordinary', conversationId: 'other', search: '  写报告  ' }, { conversationId: 'chat' })
    expect(query).toMatchObject({ conversationId: 'chat', ownerAgentId: 'bob', states: ['running'], source: 'ordinary', search: '写报告' })
  })
  it('时间范围失效不偷偷退回全部工作', () => {
    expect(() => workQuery({ ...emptyWorkFilters, from: '2026-10-03', to: '2026-10-01' }, {})).toThrow('开始日期')
  })
  it('时间按本地整日覆盖，非法月份日期不得自动滚动到下一月', () => {
    const start = new Date(dateBoundary('2026-10-05')!), end = new Date(dateBoundary('2026-10-05', true)!)
    expect([start.getHours(), start.getMinutes(), start.getSeconds()]).toEqual([0, 0, 0])
    expect([end.getHours(), end.getMinutes(), end.getSeconds(), end.getMilliseconds()]).toEqual([23, 59, 59, 999])
    expect(() => dateBoundary('2026-02-30')).toThrow('有效日期')
    expect(() => dateBoundary('2026-13-01')).toThrow('有效日期')
  })
  it('隐藏或改条件时，迟到的首页不启动其后的分页也不返回旧内容', async () => {
    let current = true
    const read = vi.fn(async () => { current = false; return { items: [{ id: 'old' }], nextCursor: 'old-cursor', total: 20 } })
    expect(await readFreshPages(read, 3, () => current, (item: { id: string }) => item.id)).toBeUndefined()
    expect(read).toHaveBeenCalledTimes(1)
  })
  it('再次显示时从新首页取游标，核对已加载范围而不复用旧代际位置', async () => {
    const read = vi.fn(async (cursor?: string) => cursor ? { items: [{ id: '2' }], total: 2 } : { items: [{ id: '1' }], nextCursor: 'fresh', total: 2 })
    const value = await readFreshPages(read, 3, () => true, (item: { id: string }) => item.id)
    expect(read.mock.calls).toEqual([[undefined], ['fresh']])
    expect(value?.items.map(item => item.id)).toEqual(['1', '2'])
  })
  it('隐藏后迟到失败不显示在新视图，当前范围真实失败仍须显性返回', async () => {
    let current = true
    const late = async () => { current = false; throw new Error('旧会话失败') }
    expect(await readFreshPages(late, 1, () => current, (item: { id: string }) => item.id)).toBeUndefined()
    await expect(readFreshPages(async () => { throw new Error('当前读取失败') }, 1, () => true, (item: { id: string }) => item.id)).rejects.toThrow('当前读取失败')
  })
  it('换员工或筛选即时隐藏旧页；隐藏保留DOM缓存，但重新显示必须重新核对', () => {
    const value = { key: 'alice:running', epoch: 1, page: { items: [{ id: 'alice-work' }] } }
    expect(visibleQueryPage(value, { key: 'bob:running', epoch: 1, active: true })).toBeUndefined()
    expect(visibleQueryPage(value, { key: 'alice:waiting', epoch: 1, active: true })).toBeUndefined()
    expect(visibleQueryPage(value, { key: 'alice:running', epoch: 2, active: false })).toBe(value.page)
    expect(visibleQueryPage(value, { key: 'alice:running', epoch: 3, active: true })).toBeUndefined()
    expect(visibleQueryPage({ ...value, epoch: 3 }, { key: 'alice:running', epoch: 3, active: true })).toBe(value.page)
  })
  it('重复游标显性失败，不重复读取无限历史', async () => {
    const read = vi.fn(async (_cursor?: string) => ({ items: [{ id: 'same' }], nextCursor: 'repeated', total: 100 }))
    await expect(readFreshPages(read, 20, () => true, (item: { id: string }) => item.id)).rejects.toThrow('分页位置重复')
    expect(read).toHaveBeenCalledTimes(2)
  })
  it('去重依据真实身份，保留同名独立文件或工作', () => {
    expect(appendUnique([{ id: 'a', name: '同名' }], [{ id: 'a', name: '同名' }, { id: 'b', name: '同名' }], item => item.id)).toHaveLength(2)
  })
  it('发布新版或同名文件不能替换已选择旧版；同id材料hash/读取版本变化也不继承选中', () => {
    const file: ConversationFileItem = { id: 'v1', conversationId: 'chat', kind: 'artifact', name: '报告.md', size: 10, fileType: 'md', createdAt: '2026-10-05T00:00:00Z', contentHash: 'old', contentVersion: 1, status: 'ready' }
    const selected = { id: file.id, kind: file.kind, contentHash: file.contentHash }
    expect(selectedFileMatches(selected, file)).toBe(true)
    expect(selectedFileMatches(selected, { ...file, id: 'v2', contentVersion: 2, contentHash: 'new' })).toBe(false)
    expect(selectedFileMatches(selected, { ...file, kind: 'material' })).toBe(false)
    expect(selectedFileMatches(selected, { ...file, contentHash: 'changed' })).toBe(false)
    expect(selectedFileMatches({ ...selected, kind: 'material', revision: 2 }, { ...file, kind: 'material', revision: 3 })).toBe(false)
  })
  it('同id文件原件、授权版本、来源或可读状态变化会使已经核对的旧预览回调失效', () => {
    const file: ConversationFileItem = { id: 'fixed-file', conversationId: 'chat', kind: 'material', name: '输入.txt', size: 10, fileType: 'txt', createdAt: '2026-10-05T00:00:00Z', contentHash: 'original', revision: 3, status: 'ready', sourceMessageId: 'original-message' }
    expect(fileRowTargetMatches(file, { ...file })).toBe(true)
    for (const changed of [{ contentHash: 'changed' }, { revision: 4 }, { status: 'unavailable' as const }, { conversationId: 'other-chat' }, { sourceMessageId: 'other-message' }, { kind: 'artifact' as const }, { id: 'next-file' }]) expect(fileRowTargetMatches(file, { ...file, ...changed })).toBe(false)
  })
  it('成果身份不以同名或当前版本替换固定内容家族与版号', () => {
    const file: ConversationFileItem = { id: 'artifact', conversationId: 'chat', kind: 'artifact', name: '报告.md', size: 10, fileType: 'md', createdAt: '2026-10-05T00:00:00Z', contentHash: 'original', logicalArtifactId: 'family', contentVersion: 1, status: 'ready' }
    expect(fileRowTargetMatches(file, { ...file, contentVersion: 2 })).toBe(false)
    expect(fileRowTargetMatches(file, { ...file, logicalArtifactId: 'other-family' })).toBe(false)
  })
  it('详情和真实子展开在重核后按原查询与工作身份恢复，不扩散到另一员工或全局范围', () => {
    const scope = 'conversation:query-for-remembered-details'
    rememberWorkCard(scope, 'work-a', { details: true, children: true })
    expect(rememberedWorkCard(scope, 'work-a')).toEqual({ details: true, children: true })
    expect(rememberedWorkCard(scope, 'work-b')).toEqual({ details: false, children: false })
    expect(rememberedWorkCard('global:query-for-remembered-details', 'work-a')).toEqual({ details: false, children: false })
    expect(rememberedWorkCard(scope + ':other-owner-filter', 'work-a')).toEqual({ details: false, children: false })
    rememberWorkCard(scope, 'work-a', { ...rememberedWorkCard(scope, 'work-a'), details: false })
    expect(rememberedWorkCard(scope, 'work-a')).toEqual({ details: false, children: true })
  })
  it('选中对象固定Work身份并隔离各查询及真实子清单，不用相似目标或父卡代替', () => {
    rememberWorkSelection('conversation:selection-a', 'child-work')
    expect(rememberedWorkSelection('conversation:selection-a')).toBe('child-work')
    expect(rememberedWorkSelection('conversation:selection-b')).toBeUndefined()
    expect(rememberedWorkSelection('global:selection-a')).toBeUndefined()
    rememberWorkSelection('conversation:selection-a:children', 'grandchild-work')
    expect(rememberedWorkSelection('conversation:selection-a')).toBe('child-work')
  })
  it('未发布回复的待审批仍按原审批及运行定位，不猜原请求或邻近消息', () => {
    expect(workApprovalTargetMatches(approvalItem, approvalInput)).toBe(true)
    expect(workApprovalTargetMatches(approvalItem, approvalInput, { conversationId: 'chat', workId: 'work', approvalId: 'approval', runId: 'run' })).toBe(true)
    expect(workApprovalTargetMatches(approvalItem, { ...approvalInput, messageId: 'source' })).toBe(false)
  })
  it('审批结束、替换运行或原卡身份改变后，旧点击失效且不改绑另一审批', () => {
    expect(workApprovalTargetMatches({ ...approvalItem, approvalTargets: [] }, approvalInput)).toBe(false)
    expect(workApprovalTargetMatches({ ...approvalItem, work: { ...approvalWork, status: 'delivered' } }, approvalInput)).toBe(false)
    expect(workApprovalTargetMatches({ ...approvalItem, work: { ...approvalWork, activeRunId: 'next-run' } }, approvalInput)).toBe(false)
    const resolved = { conversationId: 'chat', workId: 'work', approvalId: 'approval', runId: 'run' }
    for (const changed of [{ conversationId: 'another-chat' }, { workId: 'another-work' }, { approvalId: 'next-approval' }, { runId: 'next-run' }]) expect(workApprovalTargetMatches(approvalItem, approvalInput, { ...resolved, ...changed })).toBe(false)
  })
  it('已发布审批回复固定所见真实消息，不能继承后续或相邻消息', () => {
    const item = { ...approvalItem, approvalTargets: [{ approvalId: 'approval', runId: 'run', messageId: 'actual-reply' }] }, input = { ...approvalInput, messageId: 'actual-reply' }
    expect(workApprovalTargetMatches(item, input, { conversationId: 'chat', workId: 'work', approvalId: 'approval', runId: 'run', messageId: 'actual-reply' })).toBe(true)
    expect(workApprovalTargetMatches(item, input, { conversationId: 'chat', workId: 'work', approvalId: 'approval', runId: 'run', messageId: 'neighbor-reply' })).toBe(false)
    expect(workApprovalTargetMatches({ ...item, approvalTargets: [{ approvalId: 'approval', runId: 'run', messageId: 'next-reply' }] }, input)).toBe(false)
  })
})

it('待审批工作卡显示明确原审批入口，未发布消息不禁用且业务状态仍为进行中', () => {
  const html = renderToStaticMarkup(createElement(WorkCard, { api: {} as DesktopApi, active: true, item: approvalItem, onNavigate: () => {} }))
  expect(html).toContain('进行中')
  expect(html).toContain('待审批，请在原聊天查看请求并处理')
  const button = html.match(/<button\b[^>]*>查看原审批<\/button>/)?.[0]
  expect(button).toBeDefined()
  expect(button).not.toContain('disabled')
  expect(html).not.toMatch(/允许执行|拒绝执行|批准执行|标为完成|采用这个版本|要求修改/)
})

it('全局工作卡保留交付与人工采用边界，原消息未知不猜最近消息', () => {
  const work: WorkItem = { id: 'work', schemaVersion: 2, conversationId: 'chat', sourceMessageId: 'missing', key: 'key', scope: 'scope', deliverable: '交付说明', ownerAgentId: 'alice', version: 1, status: 'delivered', budgetId: 'budget', rootWorkId: 'work', dependsOnWorkIds: [], requiredResults: [], observedResults: [], waitRevision: 0, resultMessageIds: ['actual-result'], artifactIds: [], resultVersion: 1, requiresReview: true, createdAt: '2026-10-05T00:00:00Z', updatedAt: '2026-10-05T00:00:00Z' }
  const html = renderToStaticMarkup(createElement(WorkCard, { api: {} as DesktopApi, active: true, item: { work, conversationTitle: '员工聊天', ownerName: 'Alice', source: 'unknown', sourceAvailable: false, childCount: 0, resultMessageIds: ['actual-result'] }, onNavigate: () => {} }))
  expect(html).toContain('原请求消息不可定位')
  expect(html).toContain('采用及人工效果评价以原成果记录为准')
  expect(html).toContain('查看结果')
  expect(html).not.toMatch(/允许执行|拒绝执行|标为完成|采用这个版本|要求修改/)
})

it('失效的历史日期偏好保留可用筛选入口，不崩溃或展示自动滚动后的另一日', () => {
  const html = renderToStaticMarkup(createElement(DateFilter, { from: '2026-02-30', to: '', onChange: () => {} }))
  expect(html).toContain('时间筛选')
  expect(html).not.toContain('2026/03/02')
  expect(() => renderToStaticMarkup(createElement(DateFilter, { from: 'invalid', to: '', onChange: () => {} }))).not.toThrow()
})

it('可信定时工作显示原计划并提供具体触发回查，未接通或原来源失效不显示可用按钮', () => {
  const origin = { kind: 'automation' as const, automationId: 'plan', occurrenceId: 'occurrence', name: '每日交付检查', authorizedFingerprint: 'fixed-authorization' }, item = { ...approvalItem, source: 'automation' as const, work: { ...approvalWork, origin }, approvalTargets: [] }
  const render = (sourceAvailable: boolean, wired = true) => renderToStaticMarkup(createElement(WorkCard, { api: {} as DesktopApi, active: true, compact: true, item: { ...item, sourceAvailable }, onNavigate: () => {}, ...(wired ? { onAutomation: () => {} } : {}) }))
  expect(render(true)).toContain('每日交付检查')
  expect(render(true)).toContain('查看本次触发')
  expect(render(true, false)).not.toContain('查看本次触发')
  expect(render(false).match(/<button\b[^>]*>查看本次触发<\/button>/)?.[0]).toContain('disabled')
})
