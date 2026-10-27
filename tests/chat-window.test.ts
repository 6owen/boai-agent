// @vitest-environment jsdom
/*
 * [OUTPUT]: 使用真实use-stick-to-bottom；模拟浏览器ResizeObserver/rAF交付，覆盖流式阅读、双向滚动及同窗口刷新不重放旧锚点。
 * [OUTPUT]: 补发送后贴底/内容增长/手动滚动/跨会话迟到发送及渠道旧分页竞态回归；组件用例待运行，不代表Electron或E2E验证。
 * [INPUT]: 生产ChatView/PromptBar/MentionInput、真实分页消息与隔离IPC。
 * [OUTPUT]: 同一真实编辑器在会话切换加载/就绪时，contenteditable与无障碍禁用状态必须同步，草稿与DOM保持。
 * [OUTPUT]: 切换/加载保持header/composer节点，旧会话正文立即卸下；历史游标去重，草稿撤销不跨会话，过渡按真实opacity结束事件清理、遵循减少动态效果，补页不重播入场。
 * [POS]: 会话固定布局与消息窗口组件回归，不运行Electron或模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查tests/.folder.md。
 */
import { act, createElement as h, createRef, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Conversation, DigitalAgent, Message } from '../packages/shared/src/domain'
import type { ConversationView } from '../packages/shared/src/domain/reading'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { defaultUserProfile } from '../packages/shared/src/domain/profile'
import { ChatView, type ChatViewProps } from '../apps/electron/src/renderer/pages/conversations/-components/chat-view'
import { MentionInput, type MentionInputHandle } from '../apps/electron/src/renderer/pages/conversations/-components/mention-input'
import type { ChatDraft } from '../apps/electron/src/renderer/pages/conversations/presentation'
import { ChannelsTab, type ChannelChatWindow } from '../apps/electron/src/renderer/components/detail-panel/channels-tab'

vi.mock('../apps/electron/src/renderer/pages/conversations/-components/composer-toolbar', () => ({ ComposerToolbar: () => null }))
let host: HTMLDivElement, root: Root, props: ChatViewProps
const resizeObservers = new Set<{ targets: Set<Element>; callback: ResizeObserverCallback }>()
function resize(element: Element, height: number) {
  for (const observer of resizeObservers) if (observer.targets.has(element)) observer.callback([{ target: element, contentRect: new DOMRect(0, 0, 600, height) } as ResizeObserverEntry], {} as ResizeObserver)
}
const frames = () => act(async () => { await vi.advanceTimersByTimeAsync(80) })
const noop = () => {}
const room = (id: string): Conversation => ({ id, kind: 'direct', title: `会话${id}`, agentIds: ['employee'], workspacePath: `/workspace/${id}`, createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z' }) as Conversation
function view(id: string, start = 1): ConversationView {
  const message: Message = { id: `${id}-${start}`, conversationId: id, sequence: start, senderType: 'user', senderId: 'user', senderName: '我', content: `正文${id}-${start}`, status: 'completed', createdAt: '2026-10-20T00:00:00Z' }
  return { conversation: room(id), messages: [message], runs: [], artifacts: [], messagePage: { conversationId: id, items: [{ messageId: message.id, sequence: start, status: 'available', message }], beforeCursor: { id: message.id, sequence: start }, afterCursor: { id: message.id, sequence: start } }, reading: { id: id, conversationId: id, userId: 'user', epoch: 1, revision: 0, boundary: 0, sparseSeen: [], completionCount: 0, unreadCount: 0, legacyCompletedUnknown: false, anchor: null } }
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  resizeObservers.clear()
  vi.stubGlobal('ResizeObserver', class {
    targets = new Set<Element>()
    constructor(public callback: ResizeObserverCallback) { resizeObservers.add(this) }
    observe(element: Element) { this.targets.add(element) }
    unobserve(element: Element) { this.targets.delete(element) }
    disconnect() { this.targets.clear() }
  })
  vi.spyOn(document, 'hasFocus').mockReturnValue(true)
  Element.prototype.getAnimations = () => []
  Element.prototype.scrollIntoView = () => {}
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  const api = { request: vi.fn(async () => []), subscribe: () => noop } as unknown as DesktopApi
  props = { api, detail: view('A'), conversation: room('A'), loading: false, pageActive: true, snapshot: { conversations: [room('A'), room('B'), room('C')], agents: [{ id: 'employee', name: '同事', active: true, skillIds: [], knowledgeIds: [] } as unknown as DigitalAgent], resources: [], approvals: [], connections: [], dataPath: '', userProfile: defaultUserProfile }, draft: { text: 'A的草稿', mentionIds: [] }, setDraft: noop, busy: false, questionReplies: { values: {} }, artifactActions: { values: {} }, pageEdges: { before: true, after: true }, paging: false, onReading: noop, onLocation: noop, onScrollPosition: noop, onPage: noop, onLatest: async () => false, onConfigureAgent: noop, onManageModels: noop, onDetails: noop, onTrace: noop, onProfile: noop, onFiles: noop, onSend: noop, onSettings: noop, onOpenPath: noop, onEditTitle: noop, onClear: async () => {}, onRetry: noop } as unknown as ChatViewProps
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const render = () => act(async () => root.render(h(ChatView, props)))
const finishReveal = (element: Element) => {
  const event = new Event('transitionend', { bubbles: true })
  Object.defineProperty(event, 'propertyName', { value: 'opacity' })
  element.dispatchEvent(event)
}
const enter = () => host.querySelector('[role=textbox]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
function viewportGeometry() {
  const viewport = host.querySelector<HTMLElement>('.messages')!
  let height = 1400, top = 350
  Object.defineProperties(viewport, {
    clientHeight: { configurable: true, get: () => 300 },
    scrollHeight: { configurable: true, get: () => height },
    scrollTop: { configurable: true, get: () => Math.min(top, height - 300), set: (value: number) => { top = Math.max(0, Math.min(value, height - 300)) } },
  })
  viewport.getBoundingClientRect = () => new DOMRect(0, 0, 600, 300)
  const rows = () => { for (const row of viewport.querySelectorAll<HTMLElement>('[data-reading-message-id]')) row.getBoundingClientRect = () => new DOMRect(0, -viewport.scrollTop, 600, height) }
  rows()
  viewport.style.overflow = 'auto'
  return { viewport, rows, height: (value: number) => { height = value }, notify: () => { resize(viewport.firstElementChild!, height); resize(viewport, 300) }, scroll: () => viewport.dispatchEvent(new Event('scroll')) }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

it('returns from restored history to the latest window on dispatch and follows growing replies until the user scrolls up', async () => {
  const onLatest = vi.fn(async (_isCurrent: () => boolean) => true), onLocation = vi.fn()
  props = { ...props, detail: view('A', 50), restoreAnchor: { messageId: 'A-50', offset: 350 }, onLatest, onLocation, onSend: onDispatch => onDispatch?.() }
  await render()
  const geometry = viewportGeometry()
  props = { ...props, detail: view('A', 50) }; await render()
  await act(async () => geometry.notify()); await frames()
  expect(geometry.viewport.scrollTop).toBe(350)
  await act(async () => enter()); await frames()
  expect(onLatest).toHaveBeenCalledTimes(1)
  expect(onLatest.mock.calls[0]![0]()).toBe(true)
  expect(onLocation).toHaveBeenCalledWith(undefined, true)
  expect(geometry.viewport.scrollTop).toBe(1099)

  // The server returns the actual tail, not the bottom of the old history page.
  geometry.height(1800)
  props = { ...props, detail: view('A', 1000) }; await render(); geometry.rows()
  await act(async () => geometry.notify()); await frames()
  expect(geometry.viewport.scrollTop).toBe(1499)
  // A layout-induced scroll event before React/ResizeObserver must not turn following off.
  geometry.height(2200)
  await act(async () => { geometry.scroll(); geometry.notify() }); await frames()
  props = { ...props, detail: view('A', 1000) }; await render()
  expect(geometry.viewport.scrollTop).toBe(1899)

  await act(async () => {
    geometry.viewport.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -20 }))
    geometry.viewport.scrollTop -= 40; geometry.scroll()
  })
  expect(onLatest.mock.calls[0]![0]()).toBe(false)
  geometry.height(2500)
  props = { ...props, detail: view('A', 1000) }; await render()
  await act(async () => geometry.notify()); await frames()
  expect(geometry.viewport.scrollTop).toBe(1859)
  expect(onLocation.mock.calls.at(-1)?.[1]).toBe(false)
})

it('keeps history when sending is rejected locally and ignores a delayed dispatch from a different conversation', async () => {
  let dispatch: (() => void) | undefined
  const onLatest = vi.fn(async () => true)
  props = { ...props, detail: view('A', 50), restoreAnchor: { messageId: 'A-50', offset: 350 }, onLatest, onSend: callback => { dispatch = callback } }
  await render()
  const { viewport } = viewportGeometry()
  props = { ...props, detail: view('A', 50) }; await render()
  await act(async () => enter())
  expect(dispatch).toBeTypeOf('function')
  expect(onLatest).not.toHaveBeenCalled()
  expect(viewport.scrollTop).toBe(350)
  props = { ...props, conversation: room('B'), detail: view('B'), restoreAnchor: undefined }; await render()
  await act(async () => dispatch?.())
  expect(onLatest).not.toHaveBeenCalled()
})

it('cancels a pending tail jump on manual scrolling and still allows paging forward from the old window', async () => {
  const tail = deferred<boolean>(), onPage = vi.fn(), onLatest = vi.fn((_isCurrent: () => boolean) => tail.promise)
  props = { ...props, detail: view('A', 50), restoreAnchor: { messageId: 'A-50', offset: 350 }, onPage, onLatest, onSend: dispatch => dispatch?.() }
  await render()
  const geometry = viewportGeometry()
  props = { ...props, detail: view('A', 50) }; await render()
  await act(async () => enter())
  await act(async () => {
    geometry.viewport.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -100 }))
    geometry.viewport.scrollTop = 700; geometry.scroll()
  })
  expect(onLatest.mock.calls[0]![0]()).toBe(false)
  await act(async () => tail.resolve(false))
  await act(async () => {
    geometry.viewport.scrollTop = 1100; geometry.scroll()
  })
  expect(onPage.mock.calls).toEqual([['after']])
})

it('treats an upward scrollbar movement as manual reading and leaves it in place on new content', async () => {
  props = { ...props, onLatest: async () => true, onSend: dispatch => dispatch?.() }
  await render()
  const geometry = viewportGeometry()
  await act(async () => enter()); await frames()
  await act(async () => { geometry.scroll() }); await frames()
  await act(async () => { geometry.viewport.scrollTop = 900; geometry.scroll() }); await frames()
  geometry.height(1700)
  props = { ...props, detail: view('A') }; await render()
  await act(async () => geometry.notify()); await frames()
  expect(geometry.viewport.scrollTop).toBe(900)
})

it.each([false, true])('loads the channel tail without an old focus and rejects obsolete pages (manual cancellation: %s)', async cancel => {
  const older = deferred<ConversationView>(), tail = deferred<ConversationView>()
  const request = vi.fn(async (method: string, input: { before?: unknown; aroundMessageId?: string }) => {
    if (method !== 'getConversationView') throw new Error(`Unexpected request: ${method}`)
    if (input.before) return older.promise
    if (input.aroundMessageId) return view('A', 50)
    return tail.promise
  })
  let chat!: ChannelChatWindow
  await act(async () => root.render(h(ChannelsTab, {
    api: { request, subscribe: () => noop } as unknown as DesktopApi,
    agent: props.snapshot.agents[0]!, active: true, chatActive: true, internal: true, onMaterials: noop,
    target: { type: 'channels', id: 'employee', conversationId: 'A', requestId: 'panel', focusMessage: { id: 'A-50', requestId: 'focus' } },
    listProps: { snapshot: { ...props.snapshot, conversations: [{ ...room('A'), purpose: 'channel-internal' }] } } as ComponentProps<typeof ChannelsTab>['listProps'],
    renderChat: value => { chat = value; return h('div', null, value.detail.messages.map(message => message.content).join(',')) },
  })))
  expect(chat.detail.messages[0]!.id).toBe('A-50')
  await act(async () => chat.onPage('before'))
  expect(chat.paging).toBe(true)
  let current = true, loading!: Promise<boolean>
  await act(async () => { loading = chat.onLatest(() => current) })
  expect(chat.paging).toBe(false)
  expect(request.mock.calls.at(-1)?.[1]).toEqual({ conversationId: 'A', limit: 80, aroundMessageId: undefined })
  if (cancel) { current = false; chat.onLocation('A-50', false, 350) }
  await act(async () => { tail.resolve(view('A', 1000)); expect(await loading).toBe(!cancel) })
  await act(async () => older.resolve(view('A', 10)))
  expect(chat.detail.messages[0]!.id).toBe(cancel ? 'A-50' : 'A-1000')
  expect(chat.paging).toBe(false)
})

it('keeps header, composer and editor nodes through switching and loading without displaying the previous conversation', async () => {
  await render()
  const header = host.querySelector('.chat-header'), composer = host.querySelector('.composer-wrap'), editor = host.querySelector('[role=textbox]')
  expect(host.textContent).toContain('正文A-1')
  expect(editor?.getAttribute('contenteditable')).toBe('true')
  expect(editor?.getAttribute('aria-disabled')).toBe('false')
  props = { ...props, detail: null, conversation: room('B'), loading: true, draft: { text: 'B的草稿', mentionIds: [] } }
  await render()
  expect(host.querySelector('.chat-header')).toBe(header)
  expect(host.querySelector('.composer-wrap')).toBe(composer)
  expect(host.querySelector('[role=textbox]')).toBe(editor)
  expect(header?.textContent).toContain('会话B')
  expect(editor?.textContent).toBe('B的草稿')
  expect(editor?.getAttribute('contenteditable')).toBe('false')
  expect(editor?.getAttribute('aria-disabled')).toBe('true')
  expect(host.textContent).not.toContain('正文A-1')
  expect(host.querySelector('.chat-messages-transition')?.getAttribute('aria-busy')).toBe('true')
  props = { ...props, detail: view('B'), loading: false }
  await render()
  expect(host.querySelector('.chat-header')).toBe(header)
  expect(host.querySelector('.composer-wrap')).toBe(composer)
  expect(host.querySelector('[role=textbox]')).toBe(editor)
  expect(host.textContent).toContain('正文B-1')
  expect(editor?.getAttribute('contenteditable')).toBe('true')
  expect(editor?.getAttribute('aria-disabled')).toBe('false')
  const content = host.querySelector('.chat-messages-content')!
  expect(content.classList.contains('settings-page-transition')).toBe(true)
  expect(content.classList.contains('t-panel-slide')).toBe(true)
  expect(content.getAttribute('data-open')).toBe('true')
  await act(async () => vi.advanceTimersByTimeAsync(1000))
  expect(content.getAttribute('data-settled')).toBe('false')
  finishReveal(content)
  expect(content.getAttribute('data-settled')).toBe('true')
})

it('rejects a late view for another conversation and hides the prior reveal immediately', async () => {
  await render()
  props = { ...props, conversation: room('B'), detail: view('A'), loading: true }
  await render()
  props = { ...props, conversation: room('C'), detail: view('C'), loading: false }
  await render()
  props = { ...props, detail: null, loading: true }
  await render()
  await act(async () => vi.advanceTimersByTimeAsync(500))
  expect(host.querySelector<HTMLElement>('.chat-messages-content')?.hidden).toBe(true)
  expect(host.querySelector('.chat-history-skeleton')?.classList.contains('messages')).toBe(true)
  expect(host.querySelector('.chat-history-skeleton [data-reading-message-id]')).toBeNull()
  expect(host.querySelector('.chat-header')?.textContent).toContain('会话C')
  expect(host.textContent).not.toMatch(/正文[ABC]-1/)
  expect(host.querySelector('.chat-history-retry')).toBeNull()
})

it('loads the next older page once per cursor and leaves the message viewport mounted', async () => {
  const onPage = vi.fn()
  props = { ...props, detail: view('A', 50), onPage }
  await render()
  const viewport = host.querySelector<HTMLElement>('.messages')!
  const content = host.querySelector('.chat-messages-content')!
  finishReveal(content)
  Object.defineProperties(viewport, { clientHeight: { configurable: true, value: 300 }, scrollHeight: { configurable: true, value: 1000 } })
  viewport.scrollTop = 200
  const older = () => viewport.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -20 }))
  await act(async () => { older(); older() })
  expect(onPage.mock.calls).toEqual([['before']])
  props = { ...props, paging: true }
  await render()
  expect(host.querySelector('[role=status]')?.textContent).toContain('正在载入更多消息')
  await act(async () => older())
  expect(onPage).toHaveBeenCalledTimes(1)
  props = { ...props, detail: view('A', 10), paging: false }
  await render()
  expect(host.querySelector('.messages')).toBe(viewport)
  expect(host.querySelector('.chat-messages-content')).toBe(content)
  expect(content.getAttribute('data-settled')).toBe('true')
  viewport.scrollTop = 200
  await act(async () => older())
  expect(onPage.mock.calls).toEqual([['before'], ['before']])
})

it('retains the editor DOM but clears undo history when its conversation scope changes', async () => {
  const ref = createRef<MentionInputHandle>()
  let scope = 'A', draft: ChatDraft = { text: '', mentionIds: [] }
  const draw = () => root.render(h(MentionInput, { ref, scope, draft, placeholder: '', onChange: value => { draft = value; draw() }, onSelection: noop, onKeyDown: noop, onComposing: noop }))
  await act(async () => draw())
  await act(async () => ref.current!.replace({ start: 0, end: 0 }, 'A的内容'))
  const editor = host.querySelector<HTMLElement>('[role=textbox]')!
  expect(editor.textContent).toBe('A的内容')
  scope = 'B'; draft = { text: '', mentionIds: [] }
  await act(async () => draw())
  expect(host.querySelector('[role=textbox]')).toBe(editor)
  await act(async () => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true })))
  expect(editor.textContent).toBe('')
  expect(draft.text).toBe('')
  await act(async () => ref.current!.replace({ start: 0, end: 0 }, 'B的新内容'))
  expect(draft.text).toBe('B的新内容')
  await act(async () => editor.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', code: 'KeyZ', ctrlKey: true, bubbles: true })))
  expect(editor.textContent).toBe('')
  expect(draft.text).toBe('')
})

it('uses the shared contact reveal without replay when reduced motion is requested', async () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  await render()
  const content = host.querySelector('.chat-messages-content')!
  expect(content.getAttribute('data-open')).toBe('true')
  expect(content.getAttribute('data-settled')).toBe('true')
  expect(content.getAttribute('style')).toBeNull()
})

it('does not replay an older anchor while a native scroll is between events and the same message window refreshes', async () => {
  props = { ...props, restoreAnchor: { messageId: 'A-1', offset: 350 } }
  await render()
  const geometry = viewportGeometry()
  await act(async () => { geometry.scroll() }); await frames()
  // A compositor scroll can move before the coalesced scroll event reaches React.
  geometry.viewport.scrollTop = 700
  props = { ...props, detail: view('A') }; await render()
  expect(geometry.viewport.scrollTop).toBe(700)
  geometry.viewport.scrollTop = 200
  props = { ...props, detail: view('A') }; await render()
  expect(geometry.viewport.scrollTop).toBe(200)
})
