// @vitest-environment jsdom
/*
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
let host: HTMLDivElement, root: Root, props: ComponentProps<typeof ChatView>
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
    pageEdges: { before: true, after: true }, onReading: noop, onLocation: noop, onScrollPosition: noop,
  } as unknown as ComponentProps<typeof ChatView>
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
const render = async () => { await act(async () => root.render(createElement(ChatView, props))) }
const textEvent = (text: string, revision: number): ExecutionEvidence => ({ id: 'text', eventType: 'agent.text.block', payload: { text, itemId: 'text' }, agentRunId: run.id, runId: run.id, conversationId: run.conversationId, agentId: run.agentId, createdAt: run.createdAt, updatedAt: run.createdAt, sequence: 1, revision, contentLength: text.length, deferred: false })

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
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="查看完整执行过程"]')!.click())
  expect(onTrace).toHaveBeenCalledWith(trigger)
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
