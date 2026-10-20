// @vitest-environment jsdom
/*
 * [INPUT]: 实际资源库提示词Dialog、PromptBar/Tiptap与隔离IPC。
 * [OUTPUT]: @员工/$技能文件提示词候选分离，标签快照展开/文件核源；提示词创建查看编辑确认删除走同一版本合同。
 * [POS]: 前端组件回归，不运行Electron或模型。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { DesktopApi } from '../src/shared/ipc'
import type { DigitalAgent, Resource } from '../src/shared/domain'
import type { PromptTemplate } from '../src/shared/domain/prompt-templates'
import type { ChatDraft } from '../src/renderer/pages/conversations/presentation'
import { PromptBar } from '../src/renderer/pages/conversations/-components/prompt-bar'
import { draftContent, draftResourceReferences } from '../src/renderer/pages/conversations/inline-mentions'
import { PromptTemplatesView } from '../src/renderer/pages/library/prompt-templates-view'

let host: HTMLDivElement, root: Root, latestDraft: ChatDraft
const employee = { id: 'alice', name: 'Alice', role: '研究员', active: true, configVersion: 1, skillIds: ['skill-a'] } as DigitalAgent
const resources = [{ id: 'skill-a', kind: 'skill', name: '检索资料', description: '' }] as Resource[]
const prompt: PromptTemplate = { id: '88c2c9dc-c012-4979-b3cc-f9e52b33cf3e', revision: 1, name: '清楚总结', description: '总结格式', content: '先给结论，再列事实。', createdAt: '', updatedAt: '' }
const noop = () => {}
function apiFor(request: (method: string, input: any) => unknown): DesktopApi { return { request: vi.fn(async (method, input) => request(method, input)), subscribe: () => () => {} } as unknown as DesktopApi }
function Composer({ api, initial }: { api: DesktopApi; initial: string }) {
  const [draft, setDraft] = useState<ChatDraft>({ text: initial, mentionIds: [] }); latestDraft = draft
  return h(PromptBar, { api, resources, conversationId: 'chat', draft, setDraft, members: [employee], group: false, external: false, placeholder: '', onSend: noop, onActivity: noop, onOpenWorkspace: noop, children: () => null })
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.getAnimations = () => []
  Element.prototype.scrollIntoView = () => {}
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const button = (text: string) => Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(item => item.textContent === text)!
async function input(label: string, value: string) {
  const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!
  const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })) })
}

it('shows only current employees for @ and never fetches resource candidates', async () => {
  const api = apiFor(method => { throw new Error(`Unexpected request: ${method}`) })
  await act(async () => root.render(h(Composer, { api, initial: '@' })))
  expect(document.querySelector('[role=listbox]')?.getAttribute('aria-label')).toBe('会话员工')
  expect(Array.from(document.querySelectorAll('[role=option]')).map(item => item.textContent)).toEqual(['Alice员工'])
  expect(api.request).not.toHaveBeenCalled()
})

it('selects a $ prompt as an atomic snapshot and sends its real body independently of employee routing', async () => {
  const api = apiFor(method => method === 'listPromptTemplates' ? [prompt] : method === 'queryConversationFiles' ? { items: [] } : undefined)
  await act(async () => root.render(h(Composer, { api, initial: '$' })))
  await act(async () => vi.advanceTimersByTimeAsync(130))
  expect(document.querySelector('[role=listbox]')?.getAttribute('aria-label')).toBe('技能、文件和提示词')
  const rows = Array.from(document.querySelectorAll<HTMLButtonElement>('[role=option]'))
  expect(rows.map(item => item.textContent)).toEqual(['检索资料技能', '清楚总结提示词'])
  await act(async () => rows.find(item => item.textContent === '清楚总结提示词')!.click())
  expect(latestDraft.text).toBe('$清楚总结')
  expect(latestDraft.mentionIds).toEqual([])
  expect(draftContent(latestDraft)).toBe(prompt.content)
  expect(draftResourceReferences(latestDraft)).toEqual([])
  expect(document.querySelector('.composer-mention-node')?.textContent).toContain('$清楚总结')
})

it('verifies a selected $ file before inserting the original fixed source reference', async () => {
  const hash = 'a'.repeat(64)
  const api = apiFor(method => method === 'listPromptTemplates' ? [] : method === 'queryConversationFiles' ? { items: [{ id: 'file-a', kind: 'material', name: 'notes.txt', status: 'ready', contentHash: hash, sourceMessageId: 'message-a', revision: 2 }] } : undefined)
  await act(async () => root.render(h(Composer, { api, initial: '$' })))
  await act(async () => vi.advanceTimersByTimeAsync(130))
  await act(async () => Array.from(document.querySelectorAll<HTMLButtonElement>('[role=option]')).find(item => item.textContent === 'notes.txt文件')!.click())
  expect(api.request).toHaveBeenCalledWith('resolveConversationFileTarget', expect.objectContaining({ id: 'file-a', conversationId: 'chat', contentHash: hash, revision: 2 }))
  expect(latestDraft.text).toBe('$notes.txt')
  expect(draftResourceReferences(latestDraft)).toEqual([expect.objectContaining({ id: 'file-a', kind: 'material', revision: 2, contentHash: hash })])
})

it('creates, views, edits and confirms deletion of a library prompt using the seen revision', async () => {
  const api = apiFor((method, value) => method === 'savePromptTemplate' ? { ...value, revision: value.expectedRevision + 1, createdAt: '', updatedAt: '' } : undefined)
  function Library() {
    const [prompts, setPrompts] = useState<PromptTemplate[]>([])
    return h(PromptTemplatesView, { api, prompts, onChanged: value => setPrompts(items => [value, ...items.filter(item => item.id !== value.id)]), onRemoved: id => setPrompts(items => items.filter(item => item.id !== id)) })
  }
  await act(async () => root.render(h(Library)))
  await act(async () => button('新建提示词').click())
  await input('名称', '业务总结'); await input('提示词内容', '按事实和结论总结。')
  await act(async () => button('保存').click())
  expect(api.request).toHaveBeenCalledWith('savePromptTemplate', expect.objectContaining({ expectedRevision: 0, name: '业务总结', content: '按事实和结论总结。' }))
  await act(async () => document.querySelector<HTMLButtonElement>('.skill-list-select')!.click())
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('按事实和结论总结。')
  await act(async () => button('编辑').click())
  await input('提示词内容', '先结论，再事实。')
  await act(async () => button('保存').click())
  expect(api.request).toHaveBeenCalledWith('savePromptTemplate', expect.objectContaining({ expectedRevision: 1, content: '先结论，再事实。' }))
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="删除提示词 业务总结"]')!.click())
  expect(vi.mocked(api.request).mock.calls.filter(([method]) => method === 'removePromptTemplate')).toHaveLength(0)
  await act(async () => button('确认删除').click())
  expect(api.request).toHaveBeenCalledWith('removePromptTemplate', expect.objectContaining({ expectedRevision: 2 }))
  expect(document.querySelector('.skill-list-select')).toBeNull()
})
