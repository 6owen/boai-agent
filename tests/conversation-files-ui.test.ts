// @vitest-environment jsdom
/*
 * [INPUT]: 生产会话文件面板、CatalogSearch、真实行菜单及受控分页/来源回执。
 * [OUTPUT]: 仅文件名检索且不继承旧筛选；列表/表格保持来源身份、刷新DOM/滚动及迟到隔离。
 * [POS]: 后台组件回归，不启动Electron或外部模型。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Snapshot } from '../packages/shared/src/domain'
import type { AppEvent, DesktopApi } from '../packages/shared/src/ipc'
import type { ConversationFileItem, ConversationFilePage, ConversationFileTarget } from '../packages/shared/src/domain/work-views'
import { ConversationFiles, type ConversationFilesProps } from '../apps/electron/src/renderer/components/work-views/conversation-files'

let host: HTMLDivElement, root: Root, props: ConversationFilesProps
let listeners: Set<(event: AppEvent) => void>
let request: ReturnType<typeof vi.fn<(method: string, input?: unknown) => Promise<unknown>>>
const file: ConversationFileItem = { id: 'input', kind: 'material', conversationId: 'original-room', name: '报告.md', size: 1024, fileType: 'md', createdAt: '2026-11-06T00:00:00Z', contentHash: 'original-hash', revision: 3, sourceMessageId: 'original-message', status: 'ready' }
const page = (items = [file]): ConversationFilePage => ({ items, total: items.length, revision: 1 })
const target: ConversationFileTarget = { conversationId: file.conversationId, messageId: file.sourceMessageId!, kind: file.kind, id: file.id }
beforeEach(() => {
  localStorage.clear(); vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.getAnimations = () => []; Element.prototype.scrollIntoView = () => {}
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  listeners = new Set()
  request = vi.fn(async method => { if (method === 'queryConversationFiles') return page(); if (method === 'resolveConversationFileTarget') return target; throw new Error(method) })
  const api = { request, subscribe: (listener: (event: AppEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener) } } as unknown as DesktopApi
  props = { api, snapshot: { agents: [], conversations: [] } as unknown as Snapshot, ownerAgentId: crypto.randomUUID(), active: true, onPreview: vi.fn(), onNavigate: vi.fn() }
})
afterEach(async () => { await act(async () => root.unmount()); await act(async () => vi.runOnlyPendingTimersAsync()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const render = () => act(async () => root.render(h(ConversationFiles, props)))
const button = (label: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent === label || item.getAttribute('aria-label') === label)!
const tick = () => act(async () => vi.advanceTimersByTimeAsync(150))
async function view(value: string) { await act(async () => Array.from(host.querySelectorAll<HTMLElement>('[role=tab]')).find(tab => tab.textContent === value)!.click()); await tick() }
async function menu() { await act(async () => button(`文件操作 ${file.name}`).dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))); await tick() }
async function action(label: string) { await act(async () => Array.from(document.querySelectorAll<HTMLElement>('[role=menuitem]')).find(item => item.textContent === label)!.click()); await tick() }

it('searches only file names through the catalog search and ignores removed legacy filters', async () => {
  const legacy = { name: '  报告  ', kind: 'artifact', actorId: 'deleted', fileType: 'pdf', from: '2026-11-08', to: '2026-11-01', expanded: [] }
  props.state = legacy
  await render()
  expect(request.mock.calls[0]).toEqual(['queryConversationFiles', { ownerAgentId: props.ownerAgentId, conversationId: undefined, name: '报告', limit: 30, cursor: undefined }])
  expect(host.querySelector('[aria-label="会话文件列表"]')).not.toBeNull()
  expect(host.querySelector('[role=combobox]')).toBeNull()
  props.state = undefined; await render()
  await act(async () => button('搜索文件名').click()); await tick()
  const input = host.querySelector<HTMLInputElement>('input[aria-label="搜索文件名"]')!
  expect(document.activeElement).toBe(input)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '  预算  ')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(request.mock.calls.at(-1)).toEqual(['queryConversationFiles', { ownerAgentId: props.ownerAgentId, conversationId: undefined, name: '预算', limit: 30, cursor: undefined }])
})

it.each(['list', 'table'])('keeps %s rows and scroll position while refreshing and disables stale file actions', async mode => {
  let resolve!: (result: ConversationFilePage) => void, reads = 0
  request.mockImplementation(async method => { if (method === 'queryConversationFiles') return ++reads === 1 ? page() : new Promise<ConversationFilePage>(done => { resolve = done }); throw new Error(method) })
  await render(); if (mode === 'table') await view('表格')
  const viewport = host.querySelector<HTMLElement>('[aria-label="会话文件滚动区域"]')!, row = host.querySelector('[data-file-id]')
  viewport.scrollTop = 120; await act(async () => viewport.dispatchEvent(new Event('scroll')))
  await act(async () => { listeners.forEach(listener => listener({ type: 'changed' })); await vi.advanceTimersByTimeAsync(150) })
  expect(host.querySelector('[data-file-id]')).toBe(row); expect(viewport.scrollTop).toBe(120)
  expect(button(`文件操作 ${file.name}`).disabled).toBe(true)
  await act(async () => resolve(page()))
  expect(host.querySelector('[data-file-id]')).toBe(row); expect(viewport.scrollTop).toBe(120)
  expect(button(`文件操作 ${file.name}`).disabled).toBe(false)
})

it.each(['list', 'table'])('keeps the original file identity for %s preview and source navigation', async mode => {
  await render(); if (mode === 'table') await view('表格')
  await act(async () => button(file.name).click())
  expect(props.onPreview).toHaveBeenCalledWith(file, expect.any(Function))
  await menu()
  expect(Array.from(document.querySelectorAll('[role=menuitem]')).map(item => item.textContent)).toEqual(['预览', '查看原消息', '添加到知识资料'])
  await action('查看原消息')
  expect(request.mock.calls.filter(([method]) => method === 'resolveConversationFileTarget')).toEqual([['resolveConversationFileTarget', { conversationId: file.conversationId, kind: file.kind, id: file.id, contentHash: file.contentHash, revision: file.revision }]])
  expect(props.onNavigate).toHaveBeenCalledWith(target, expect.any(Function))
})

it('rejects late source navigation and an old file page after switching the employee scope', async () => {
  let resolve!: (value: ConversationFileTarget) => void
  request.mockImplementation(async method => { if (method === 'queryConversationFiles') return page(); return new Promise<ConversationFileTarget>(done => { resolve = done }) })
  await render(); await menu(); await action('查看原消息')
  request.mockImplementation(async () => new Promise(() => {}))
  props.ownerAgentId = 'different-employee'; await render()
  expect(host.querySelector('[data-file-id]')).toBeNull()
  await act(async () => resolve(target))
  expect(props.onNavigate).not.toHaveBeenCalled()
})
