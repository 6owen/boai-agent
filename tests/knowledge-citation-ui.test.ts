// @vitest-environment jsdom
/*
 * [OUTPUT]: 未变化正文保留引用焦点，回调切换使用新处理器；正文更新及撤权仍及时反映。
 * [INPUT]: 生产Markdown引用/预览组件和受控宿主回执。
 * [OUTPUT]: 未读/伪造引用纯文本，实际读取按钮仅传消息身份；网页链接允许预览/外开且不请求元数据，其他协议不导航；更新/隐藏与迟到正文隔离。
 * [POS]: 知识引用UI合同，实际桌面另验。
 * [PROTOCOL]: 变化同步Header与tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DesktopApi } from '../packages/shared/src/ipc'
import type { ConversationDetail, Message } from '../packages/shared/src/domain'
import type { KnowledgePreview, KnowledgeReadRef } from '../packages/shared/src/domain/knowledge'
import { MaterialMarkdown } from '../apps/electron/src/renderer/pages/conversations/-components/material-citations'
import { KnowledgeCitationPane } from '../apps/electron/src/renderer/components/work-views/knowledge-citation'

vi.mock('../apps/electron/src/renderer/components/common/file-preview', () => ({ FilePreview: ({ file, line }: { file: { text: string }; line: number }) => h('p', { 'data-line': line }, file.text) }))
let root: Root, host: HTMLDivElement
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks() })
const reference: KnowledgeReadRef = { resourceId: 'r', resourceHash: 'a'.repeat(64), revision: 1, copyId: 'copy', fileKey: '', contentHash: 'a'.repeat(64), path: '/资料/品牌 规范.md', name: '规范', firstLine: 2, lastLine: 3 }
it('only makes actual read lines clickable and sends no model path to the preview', async () => {
  const open = vi.fn(), message = { id: 'reply', senderId: 'employee', senderType: 'agent', status: 'completed', knowledgeSources: [reference], content: `[实际引用](<${reference.path}:2>) [未读](<${reference.path}:4>) [伪造](</etc/passwd:2>) [网页](https://example.com)` } as Message
  await act(async () => root.render(h(MaterialMarkdown, { message, detail: { materials: [] } as unknown as ConversationDetail, onPreview: vi.fn(), onKnowledgePreview: open })))
  expect(host.querySelectorAll('button')).toHaveLength(1); expect(host.querySelectorAll('a')).toHaveLength(1)
  expect(host.querySelector('a')?.href).toBe('https://example.com/')
  await act(async () => host.querySelector('button')!.click())
  expect(open).toHaveBeenCalledWith({ messageId: 'reply', referenceIndex: 0, line: 2 }, reference, 'employee')
  await act(async () => root.render(h(MaterialMarkdown, { message: { ...message, knowledgeSources: undefined }, detail: { materials: [] } as unknown as ConversationDetail, onPreview: vi.fn(), onKnowledgePreview: open })))
  expect(host.querySelectorAll('button')).toHaveLength(0)
})
it('previews web links without fetching and leaves local, email and script references inert', async () => {
  vi.useFakeTimers()
  const fetch = vi.spyOn(globalThis, 'fetch'), open = vi.fn()
  const message = { id: 'reply', senderId: 'employee', senderType: 'agent', status: 'completed', content: '[天气来源](https://weather.example/nanjing?q=today) [HTTP](http://example.com) [本机](file:///tmp/private.md) [资料](/tmp/private.md) [邮件](mailto:someone@example.com) [脚本](javascript:alert%281%29)' } as Message
  await act(async () => root.render(h(MaterialMarkdown, { message, detail: { materials: [] } as unknown as ConversationDetail, onPreview: open })))
  const links = Array.from(host.querySelectorAll('a'))
  expect(links.map(link => link.href)).toEqual(['https://weather.example/nanjing?q=today', 'http://example.com/'])
  expect(links.every(link => link.target === '_blank' && link.rel === 'noopener noreferrer')).toBe(true)
  expect(document.querySelector('[data-slot="hover-card-content"]')).toBeNull()
  await act(async () => { links[0].focus(); await vi.advanceTimersByTimeAsync(350) })
  const preview = document.querySelector('[data-slot="hover-card-content"]')
  expect(preview?.textContent).toContain('天气来源')
  expect(preview?.textContent).toContain('weather.example')
  expect(preview?.textContent).toContain('https://weather.example/nanjing?q=today')
  const action = preview?.querySelector('a')
  expect(action?.textContent).toContain('在浏览器中打开')
  expect(action?.href).toBe(links[0].href)
  expect(action?.target).toBe('_blank')
  expect(action?.rel).toBe('noopener noreferrer')
  expect(fetch).not.toHaveBeenCalled()
  expect(open).not.toHaveBeenCalled()
})
it('drops a visible citation on change and ignores a delayed response after hiding', async () => {
  vi.useFakeTimers()
  let changed!: (event: { type: 'changed' }) => void, resolve!: (value: KnowledgePreview) => void
  const preview = { resource: { id: 'r', name: '规范' }, contentHash: reference.contentHash, filePreview: { kind: 'text', text: '实际原文' } } as KnowledgePreview
  const request = vi.fn().mockResolvedValueOnce(preview).mockImplementation(() => new Promise<KnowledgePreview>(done => { resolve = done }))
  const api = { request, subscribe: (callback: typeof changed) => { changed = callback; return () => {} } } as unknown as DesktopApi
  const target = { messageId: 'reply', referenceIndex: 0, line: 2, requestId: 'open' }
  await act(async () => root.render(h(KnowledgeCitationPane, { api, active: true, target })))
  expect(host.textContent).toContain('实际原文'); expect(host.querySelector('[data-line="2"]')).toBeTruthy()
  expect(request).toHaveBeenCalledWith('getKnowledgeCitationPreview', { messageId: 'reply', referenceIndex: 0, line: 2 })
  await act(async () => changed({ type: 'changed' })); expect(host.textContent).not.toContain('实际原文')
  await act(async () => vi.advanceTimersByTime(120))
  await act(async () => root.render(h(KnowledgeCitationPane, { api, active: false, target })))
  await act(async () => resolve(preview)); expect(host.textContent).not.toContain('实际原文')
})

it('keeps citation focus across callback changes, invokes the current handler and still updates content and authorization', async () => {
  const first = vi.fn(), latest = vi.fn()
  const detail = { materials: [] } as unknown as ConversationDetail
  const message = { id: 'reply', senderId: 'employee', senderType: 'agent', status: 'completed', knowledgeSources: [reference], content: `[引用](<${reference.path}:2>)` } as Message
  await act(async () => root.render(h(MaterialMarkdown, { message, detail, onPreview: vi.fn(), onKnowledgePreview: first })))
  const button = host.querySelector('button')!
  button.focus()
  await act(async () => root.render(h(MaterialMarkdown, { message, detail, onPreview: vi.fn(), onKnowledgePreview: latest })))
  expect(document.activeElement).toBe(button)
  await act(async () => button.click())
  expect(first).not.toHaveBeenCalled()
  expect(latest).toHaveBeenCalledWith({ messageId: 'reply', referenceIndex: 0, line: 2 }, reference, 'employee')
  await act(async () => root.render(h(MaterialMarkdown, { message: { ...message, content: '更新后的正文' }, detail, onPreview: vi.fn(), onKnowledgePreview: latest })))
  expect(host.textContent).toBe('更新后的正文')
  await act(async () => root.render(h(MaterialMarkdown, { message: { ...message, knowledgeSources: undefined }, detail, onPreview: vi.fn(), onKnowledgePreview: latest })))
  expect(host.querySelector('button')).toBeNull()
})
