// @vitest-environment jsdom
/*
 * [OUTPUT]: 运行卡无常驻查看；历史失败/自动化镜像仅回到原消息页，新终态不闪退。
 * [OUTPUT]: 五项反馈的调度额度/取消接续或历史展示回归；具体验证边界以本文件用例为准。
 * [OUTPUT]: 覆盖增大任务额度、真实继续消息或本次运行同类批准；各文件以具体用例限定验证范围。
 * [OUTPUT]: 本轮覆盖复制/员工入口、定时运行防连点、失败过程、严格私有判断及保留原预算的显式继续；实际范围以各用例为准。
 * [OUTPUT]: 已载入执行流夹具显式限定非空ConversationView，保留共享ChatView新增加载态的类型边界。
 * [OUTPUT]: 自动化头像沿真实默认个人资料夹具，原任务执行镜像与定时角标共存。
 * [OUTPUT]: 定时任务聊天镜像沿原Run读取思考/工具，固定消息定位仍展示，完成后仅保留公开答复。
 * [OUTPUT]: 任务/文件迁入右侧后移除旧互斥view夹具，保留主聊天页面隐藏/恢复时执行读取生命周期检查。
 * [OUTPUT]: 流式消息先于Run快照时不闪现空回复泡；已有正文仍可见，Run到达后由单一执行卡接管。
 * [OUTPUT]: 思考增量在受控轨迹内更新，收起后新增内容可读，工具接续不丢思考；空态无伪造思考。
 * [INPUT]: 生产 ChatView 与 ExecutionFeed、执行中事件窗口。
 * [OUTPUT]: 最终消息发布前出现员工卡片，文本增量实时可见；结束与隐藏时不重复挂载过程。
 * [POS]: 聊天页执行流回归；隔离 composer/阅读及 IPC，不调用模型。
 * [PROTOCOL]: 修改同步 Header 与 tests/.folder.md。
 */
import { act, createElement, useRef, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { beforeEach, afterEach, expect, test, vi } from 'vitest'
import { ChatView } from '../src/renderer/pages/conversations/-components/chat-view'
import type { ExecutionEvidence } from '../src/shared/domain/execution'
import type { AgentRun } from '../src/shared/domain'
import { defaultUserProfile } from '../src/shared/domain/profile'
import { nativeActivity } from '../src/runtime/adapters/native-events'

vi.mock('../src/renderer/pages/conversations/-components/prompt-bar', () => ({ PromptBar: () => null }))
vi.mock('../src/renderer/pages/conversations/-components/conversation-header', () => ({ ConversationHeader: () => null }))
vi.mock('../src/renderer/pages/conversations/-components/use-conversation-reading', () => ({ useConversationReading: () => ({}) }))
const fixture = vi.hoisted(() => ({ evidence: [] as ExecutionEvidence[], active: false, source: '' }))
vi.mock('../src/renderer/components/detail-panel/useExecutionWindow', () => ({
  useExecutionWindow: (_client: unknown, active: boolean, source: string) => { fixture.active = active; fixture.source = source; return { root: useRef(null), evidence: fixture.evidence, loading: false } },
}))

const run: AgentRun = { id: 'run', agentId: 'employee', agentName: '员工', phase: 'execution', responseKind: 'task', conversationId: 'chat', triggerMessageId: 'question', messageId: 'answer', status: 'running', createdAt: '2026-10-16T00:00:00Z', toolEvents: [] }
type LoadedChatProps = ComponentProps<typeof ChatView> & { detail: NonNullable<ComponentProps<typeof ChatView>['detail']> }
let host: HTMLDivElement, root: Root, props: LoadedChatProps
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  fixture.evidence = []
  Element.prototype.getAnimations = () => []
  const noop = () => {}
  props = {
    api: { request: async () => [], subscribe: () => () => {} }, pageActive: true,
    detail: { conversation: { id: 'chat', kind: 'direct', title: '员工', agentIds: ['employee'] }, messages: [], messagePage: { items: [] }, runs: [run], turns: [], workItems: [], artifacts: [], materials: [] },
    snapshot: { conversations: [], resources: [], agents: [{ id: 'employee', name: '员工', skillIds: [], knowledgeIds: [] }], approvals: [], connections: [], userProfile: defaultUserProfile },
    draft: { text: '', mentionIds: [] }, questionReplies: { values: {} }, artifactActions: { values: {} },
    pageEdges: { before: true, after: true }, onReading: noop, onLocation: noop, onScrollPosition: noop, onLatest: async () => true,
  } as unknown as LoadedChatProps
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
const render = async () => { await act(async () => root.render(createElement(ChatView, props))) }
const textEvent = (text: string, revision: number): ExecutionEvidence => ({ id: 'text', eventType: 'agent.text.block', payload: { text, itemId: 'text' }, agentRunId: run.id, runId: run.id, conversationId: run.conversationId, agentId: run.agentId, createdAt: run.createdAt, updatedAt: run.createdAt, sequence: 1, revision, contentLength: text.length, deferred: false })

test.each(['failed', 'cancelled', 'interrupted'] as const)('retains %s execution content at its original message and admits one explicit continuation', async status => {
  const trigger = { id: 'question', conversationId: 'chat', senderType: 'user' as const, senderId: 'user', senderName: '我', content: '统计周报', status: 'completed' as const, sequence: 1, createdAt: run.createdAt }
  const request = vi.fn(async (_method: string) => undefined)
  props = { ...props, api: { ...props.api, request: request as typeof props.api.request }, detail: { ...props.detail, runs: [{ ...run, status, error: '网络断开' }], messages: [trigger], messagePage: { ...props.detail.messagePage, items: [{ messageId: trigger.id, sequence: 1, status: 'available', message: trigger }] } } }
  fixture.evidence = [textEvent('已经整理第一部分周报', 1)]
  await render()
  expect(host.querySelectorAll('[data-chat-execution-run]')).toHaveLength(1)
  expect(host.textContent).toContain('已经整理第一部分周报')
  expect(host.textContent).not.toContain('已有过程保留')
  expect(host.textContent).not.toContain('已取消 ·')
  expect(host.querySelector('[data-chat-execution-run]')?.classList.contains('w-full')).toBe(true)
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === '继续')!
  await act(async () => { button.click(); button.click() })
  expect(request.mock.calls.filter(([method]) => method === 'sendMessage')).toHaveLength(1)
  expect(request).toHaveBeenCalledWith('sendMessage', { conversationId: run.conversationId, content: '继续', mentionIds: [], requestId: expect.any(String) })
  expect(button.closest('.button-row')).not.toBeNull()
  const view = host.querySelector<HTMLButtonElement>('[aria-label="查看完整执行过程"]')!
  expect(view.parentElement).toBe(button.parentElement)
  expect(view.textContent).toBe('查看')
  expect(button.textContent).toBe('已发送')
  expect(button.disabled).toBe(true)
})

test('retains failed automation mirrors at a located public trigger', async () => {
  const trigger = { id: 'published-question', conversationId: 'chat', senderType: 'user' as const, senderId: 'automation', senderName: '定时任务', content: '统计周报', status: 'completed' as const, sequence: 1, createdAt: run.createdAt }
  props = { ...props, restoreAnchor: { messageId: trigger.id }, detail: { ...props.detail, runs: [], executionMirrors: [{ run: { ...run, conversationId: 'task-chat', status: 'cancelled', error: '达到本次自动化的时间预算' }, triggerMessage: trigger }], messages: [trigger], messagePage: { ...props.detail.messagePage, items: [{ messageId: trigger.id, sequence: 1, status: 'available', message: trigger }] } } }
  const request = vi.fn(async (_method: string) => undefined)
  props = { ...props, api: { ...props.api, request: request as typeof props.api.request } }
  fixture.evidence = [textEvent('已读取的周报统计过程', 1)]
  await render()
  expect(host.querySelector('[data-chat-execution-run]')).not.toBeNull()
  expect(host.textContent).toContain('已读取的周报统计过程')
  expect(fixture.source).toBe('task-chat')
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === '继续')!.click())
  expect(request).toHaveBeenCalledWith('sendMessage', { conversationId: 'chat', content: '继续', mentionIds: [], requestId: expect.any(String) })
})

test.each([false, true])('mirrors scheduled reasoning and tools from the original run, including located messages (%s)', async located => {
  const publication = { automationId: 'plan', occurrenceId: 'occurrence', sourceConversationId: 'task-chat', sourceMessageId: 'question' }
  const trigger = { id: 'published-question', conversationId: 'chat', senderType: 'user' as const, senderId: 'automation', senderName: '定时任务', content: '查天气', status: 'completed' as const, sequence: 1, createdAt: run.createdAt, automationPublication: publication }
  const answer = { ...trigger, id: 'published-answer', senderType: 'agent' as const, senderId: 'employee', content: '正在查询', status: 'streaming' as const, sequence: 2, automationPublication: { ...publication, sourceMessageId: 'answer' } }
  const mirroredRun = { ...run, conversationId: 'task-chat' }
  const onTrace = vi.fn()
  // A live answer may arrive before the next metadata refresh supplies its public message id.
  props = { ...props, onTrace, ...(located ? { focusMessage: { id: trigger.id, requestId: 'locate' }, restoreAnchor: { messageId: trigger.id } } : {}), detail: { ...props.detail, runs: [], executionMirrors: [{ run: mirroredRun, triggerMessage: trigger }], messages: [trigger, answer], messagePage: { ...props.detail.messagePage, items: [trigger, answer].map(message => ({ messageId: message.id, sequence: message.sequence, status: 'available' as const, message })) } } }
  Element.prototype.scrollIntoView = vi.fn()
  fixture.evidence = [{ ...textEvent('核对天气来源', 1), id: 'reason', conversationId: 'task-chat', eventType: 'agent.reasoning.block' }]
  await render()
  expect(host.querySelectorAll('[data-chat-execution-run="run"]')).toHaveLength(1)
  expect(host.textContent).toContain('核对天气来源')
  expect(host.textContent).not.toContain('正在查询')
  expect(fixture.source).toBe('task-chat')
  fixture.evidence = [...fixture.evidence, { ...textEvent('', 1), ...nativeActivity('browser', { type: 'mcpToolCall', server: 'boai', tool: 'browser_tool', arguments: { action: 'snapshot' }, status: 'completed' }, true), sequence: 2 } as ExecutionEvidence]
  await render()
  expect(host.textContent).toContain('browser_tool')
  expect(host.textContent).toContain('核对天气来源')
  expect(host.querySelector('[aria-label="查看完整执行过程"]')).toBeNull()
  expect(onTrace).not.toHaveBeenCalled()
  props = { ...props, pageActive: false }; await render()
  expect(fixture.active).toBe(false)
  props = { ...props, pageActive: true, detail: { ...props.detail, executionMirrors: [{ run: { ...mirroredRun, status: 'waiting_approval' }, triggerMessage: trigger }] } }; await render()
  expect(fixture.active).toBe(true)
  expect(host.textContent).toContain('等待批准')
  const final = { ...answer, status: 'completed' as const, content: '天气查询完成' }
  props = { ...props, detail: { ...props.detail, executionMirrors: [], messages: [trigger, final], messagePage: { ...props.detail.messagePage, items: [trigger, final].map(message => ({ messageId: message.id, sequence: message.sequence, status: 'available' as const, message })) } } }
  await render()
  expect(host.querySelector('[data-chat-execution-run]')).toBeNull()
  expect(host.textContent).toContain('天气查询完成')
})

test('shows the employee execution card immediately and streams updates before a final message exists', async () => {
  await render()
  expect(host.querySelector('[data-chat-execution-run="run"]'), '执行开始就应出现员工消息卡片').not.toBeNull()
  expect(host.querySelector('[data-slot="loading-state"]')).not.toBeNull()
  expect(host.querySelector('[data-slot="thinking-state"]')).toBeNull()
  expect(host.textContent).not.toContain('等待员工输出')
  fixture.evidence = [textEvent('正在读取文件', 1)]; await render()
  expect(host.textContent).toContain('正在读取文件')
  fixture.evidence = [textEvent('正在读取文件，已找到需要修改的位置', 2)]; await render()
  expect(host.textContent).toContain('正在读取文件，已找到需要修改的位置')
  expect(props.detail.messages).toHaveLength(0)
  props = { ...props, detail: { ...props.detail, runs: [{ ...run, status: 'completed' }] } }; await render()
  expect(host.querySelector('[data-chat-execution-run]')).toBeNull()
})

test('streams returned reasoning through a retained disclosure and keeps it alongside subsequent tools', async () => {
  const reasoning = (text: string, revision: number): ExecutionEvidence => ({ ...textEvent(text, revision), id: 'reason', eventType: 'agent.reasoning.block' })
  fixture.evidence = [reasoning('先检查输入', 1)]; await render()
  const trigger = () => host.querySelector<HTMLButtonElement>('[aria-label="思考过程"]')!
  expect(trigger().getAttribute('aria-expanded')).toBe('true')
  expect(trigger().textContent).toContain('思考中')
  expect(host.textContent).toContain('先检查输入')
  await act(async () => trigger().click())
  fixture.evidence = [reasoning('先检查输入，再核对实际文件', 2)]; await render()
  expect(trigger().getAttribute('aria-expanded')).toBe('false')
  await act(async () => trigger().click())
  expect(host.textContent).toContain('先检查输入，再核对实际文件')
  fixture.evidence = [...fixture.evidence, {
    ...textEvent('', 1), ...nativeActivity('command', { type: 'commandExecution', command: 'cat input.txt', aggregatedOutput: '实际输入', status: 'completed', exitCode: 0 }, true), sequence: 2,
  } as ExecutionEvidence]
  await render()
  expect(trigger().textContent).toContain('思考过程')
  expect(host.textContent).toContain('cat input.txt')
  expect(host.textContent).toContain('先检查输入，再核对实际文件')
  expect(props.detail.messages).toHaveLength(0)
})

test('does not insert current execution into a restored history window', async () => {
  props = { ...props, restoreAnchor: { messageId: 'old-message' } }
  await render()
  expect(host.querySelector('[data-chat-execution-run]')).toBeNull()
})

test('does not flash an empty reply bubble when the message event arrives before run metadata', async () => {
  const message = { id: 'answer', conversationId: 'chat', senderType: 'agent' as const, senderId: 'employee', senderName: '员工', runId: run.id, content: '', status: 'streaming' as const, sequence: 2, createdAt: run.createdAt }
  props = { ...props, detail: { ...props.detail, runs: [], messages: [message], messagePage: { ...props.detail.messagePage, items: [{ messageId: message.id, sequence: 2, status: 'available', message }] } } }
  await render()
  expect(host.querySelector('.message-row.agent .message-card')).toBeNull()
  expect(host.querySelector('.typing-indicator')).toBeNull()
  props = { ...props, detail: { ...props.detail, runs: [run] } }; await render()
  expect(host.querySelectorAll('.message-row.agent .message-card')).toHaveLength(1)
  expect(host.querySelector('[data-slot="loading-state"]')).not.toBeNull()
  expect(host.querySelector('.typing-indicator')).toBeNull()
})

test('keeps already returned text visible when run metadata has not arrived yet', async () => {
  const message = { id: 'answer', conversationId: 'chat', senderType: 'agent' as const, senderId: 'employee', senderName: '员工', runId: run.id, content: '已经收到的正文', status: 'streaming' as const, sequence: 2, createdAt: run.createdAt }
  props = { ...props, detail: { ...props.detail, runs: [], messages: [message], messagePage: { ...props.detail.messagePage, items: [{ messageId: message.id, sequence: 2, status: 'available', message }] } } }
  await render()
  expect(host.textContent).toContain('已经收到的正文')
})

test('replaces the existing API streaming bubble with one execution card and restores the final reply', async () => {
  const message = { id: 'answer', conversationId: 'chat', senderType: 'agent' as const, senderId: 'employee', senderName: '员工', runId: run.id, content: '最终答复', status: 'streaming' as const, sequence: 2, createdAt: run.createdAt }
  props = { ...props, detail: { ...props.detail, messages: [message], messagePage: { ...props.detail.messagePage, items: [{ messageId: message.id, sequence: 2, status: 'available', message }] } } }
  fixture.evidence = [textEvent(message.content, 1)]
  await render()
  expect(host.querySelectorAll('[data-chat-execution-run]')).toHaveLength(1)
  expect(host.textContent?.split('最终答复')).toHaveLength(2)
  const final = { ...message, status: 'completed' as const }
  props = { ...props, detail: { ...props.detail, runs: [{ ...run, status: 'completed' }], messages: [final], messagePage: { ...props.detail.messagePage, items: [{ messageId: final.id, sequence: 2, status: 'available', message: final }] } } }
  await render()
  expect(host.querySelector('[data-chat-execution-run]')).toBeNull()
  expect(host.textContent).toContain('最终答复')
})

test('pauses execution reads only while the chat page is hidden and resumes when visible', async () => {
 const request = vi.spyOn(props.api, 'request')
 props = { ...props, pageActive: false }; await render()
 expect(fixture.active).toBe(false)
 expect(request).not.toHaveBeenCalled()
 props = { ...props, pageActive: true }; await render()
 expect(fixture.active).toBe(true)
 expect(request).toHaveBeenCalledWith('listNativeActions', expect.objectContaining({ runId: run.id }))
})


test('keeps the execution card width rule when its content collapses after failure', async () => {
  fixture.evidence = [textEvent('仍在处理的内容', 1)]
  await render()
  const before = host.querySelector('[data-chat-execution-run]')!.className
  props = { ...props, detail: { ...props.detail, runs: [{ ...run, status: 'failed', error: '网络断开' }] } }
  await render()
  expect(host.querySelector('[data-chat-execution-run]')!.className).toBe(before)
  expect(before).toContain('w-full')
  expect(before).not.toContain('w-fit')
})

test('shows resource queue state instead of pretending the employee is generating', async () => {
  props = { ...props, detail: { ...props.detail, runs: [{ ...run, status: 'queued' }] } }
  await render()
  expect(host.textContent).toContain('等待执行资源')
  expect(host.textContent).not.toContain('正在处理')
  expect(host.querySelector('[aria-label="查看完整执行过程"]')).toBeNull()
  expect(host.querySelector('[data-chat-execution-run] .button-row')).toBeNull()
})

test('does not append old failures or terminal automation mirrors below the newest queued task', async () => {
  const old = { id: 'old-question', conversationId: 'chat', senderType: 'user' as const, senderId: 'user', senderName: '我', content: '上周的请求', status: 'completed' as const, sequence: 1, createdAt: run.createdAt }
  const current = { ...old, id: 'today-question', content: '调用浏览器查询一下南京的天气', sequence: 100, createdAt: '2026-10-24T00:00:00Z' }
  const historical = { ...run, id: 'old-failure', triggerMessageId: old.id, status: 'failed' as const, error: '已达到单次任务的工具步骤上限，请继续发送消息' }
  const mirror = { run: { ...historical, id: 'old-mirror', conversationId: 'task-old', error: '工作当前为 failed，不能重复执行' }, triggerMessage: { ...old, id: 'old-publication' } }
  props = { ...props, pageEdges: { before: true, after: false }, detail: { ...props.detail, messages: [current], messagePage: { ...props.detail.messagePage, items: [{ messageId: current.id, sequence: current.sequence, status: 'available', message: current }] }, runs: [{ ...run, status: 'queued', triggerMessageId: current.id }, historical], executionMirrors: [mirror] } }
  await render()
  expect(host.querySelectorAll('[data-chat-execution-run]')).toHaveLength(1)
  expect(host.textContent).toContain('等待执行资源')
  expect(host.textContent).not.toContain('工具步骤上限')
  expect(host.textContent).not.toContain('不能重复执行')
  // Reading the original page still exposes both original failures and their retained process.
  const originals = [old, mirror.triggerMessage]
  props = { ...props, restoreAnchor: { messageId: old.id }, pageEdges: { before: false, after: true }, detail: { ...props.detail, messages: originals, messagePage: { ...props.detail.messagePage, items: originals.map((message, index) => ({ messageId: message.id, sequence: index + 1, status: 'available' as const, message })) } } }
  await render()
  expect(host.querySelector('[data-chat-execution-run="old-failure"]')).not.toBeNull()
  expect(host.querySelector('[data-chat-execution-run="old-mirror"]')).not.toBeNull()
})
