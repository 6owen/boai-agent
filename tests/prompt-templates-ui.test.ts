// @vitest-environment jsdom
/*
 * [OUTPUT]: 普通bobo首发提供五项管理命令，选择生成真实标签且零IPC；普通员工不显示核心管理命令。
 * [OUTPUT]: 右侧表单创建/编辑/AI入口及草稿保护；菜单删除冻结所见版本，不削减原CRUD断言。
 * [INPUT]: 实际提示词目录/右侧表单/删除菜单、PromptBar/Tiptap与隔离IPC。
 * [OUTPUT]: @员工/$技能文件提示词候选分离，标签快照展开/文件核源；提示词创建查看编辑确认删除走同一版本合同。
 * [POS]: 前端组件回归，不运行Electron或模型。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h, Fragment, useEffect, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { AppEvent, DesktopApi } from '../packages/shared/src/ipc'
import type { DigitalAgent, Resource } from '../packages/shared/src/domain'
import type { PromptTemplate } from '../packages/shared/src/domain/prompt-templates'
import type { ChatDraft } from '../apps/electron/src/renderer/pages/conversations/presentation'
import { PromptBar } from '../apps/electron/src/renderer/pages/conversations/-components/prompt-bar'
import { draftContent, draftResourceReferences } from '../apps/electron/src/renderer/pages/conversations/inline-mentions'
import { PromptTemplatesView } from '../apps/electron/src/renderer/pages/library/prompt-templates-view'

import { PromptDetailPanel } from '../apps/electron/src/renderer/pages/library/prompt-detail-panel'
import { GuardContext } from '../apps/electron/src/renderer/components/common'
import { useEditorGuard } from '@boai/ui/use-editor-guard'

let host: HTMLDivElement, root: Root, latestDraft: ChatDraft
const employee = { id: 'alice', name: 'Alice', role: '研究员', active: true, configVersion: 1, skillIds: ['skill-a'] } as DigitalAgent
const resources = [{ id: 'skill-a', kind: 'skill', name: '检索资料', description: '' }] as Resource[]
const prompt: PromptTemplate = { id: '88c2c9dc-c012-4979-b3cc-f9e52b33cf3e', revision: 1, name: '清楚总结', description: '总结格式', content: '先给结论，再列事实。', createdAt: '', updatedAt: '' }
const noop = () => {}
function apiFor(request: (method: string, input: any) => unknown): DesktopApi { return { request: vi.fn(async (method, input) => request(method, input)), subscribe: () => () => {} } as unknown as DesktopApi }
function Composer({ api, initial, member = employee, ready = true }: { api: DesktopApi; initial: string; member?: DigitalAgent; ready?: boolean }) {
  const [draft, setDraft] = useState<ChatDraft>({ text: initial, mentionIds: [] }); latestDraft = draft
  return h(PromptBar, { api, resources, conversationId: ready ? 'chat' : undefined, conversationReady: ready, draft, setDraft, members: [member], group: false, external: false, placeholder: '', onSend: noop, onActivity: noop, onOpenWorkspace: noop, children: () => null })
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('PointerEvent', MouseEvent)
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

it('offers all five management commands before the first bobo message and inserts a skill tag without IPC or sending', async () => {
  const api = apiFor(method => { throw new Error(`Unexpected request: ${method}`) })
  await act(async () => root.render(h(Composer, { api, initial: '/', member: { ...employee, id: 'bobo', systemRole: 'core' }, ready: false })))
  const rows = Array.from(document.querySelectorAll<HTMLButtonElement>('[role=option]'))
  for (const name of ['管理定时任务', '管理技能', '管理数据源', '管理提示词', '管理通讯录']) expect(rows.some(row => row.textContent?.startsWith(name))).toBe(true)
  await act(async () => rows.find(row => row.textContent?.startsWith('管理定时任务'))!.click())
  expect(latestDraft.text).toBe('$管理定时任务')
  expect(draftResourceReferences(latestDraft)).toEqual([{ kind: 'builtin-skill', id: 'automations', agentId: 'bobo', name: '管理定时任务', version: 1 }])
  expect(document.querySelector('.composer-mention-node')?.textContent).toContain('$管理定时任务')
  expect(api.request).not.toHaveBeenCalled()
})

it('does not offer bobo management commands to an ordinary employee', async () => {
  const api = apiFor(() => undefined)
  await act(async () => root.render(h(Composer, { api, initial: '/' })))
  expect(document.querySelector('[role=listbox]')?.textContent).not.toContain('管理定时任务')
  expect(document.querySelector('[role=listbox]')?.textContent).toContain('总结会话')
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

it('edits in the right panel, guards AI navigation and deletes through the row menu at the confirmed revision', async () => {
  let stored: PromptTemplate[] = [], collectionRevision = 0
  const listeners = new Set<(event: AppEvent) => void>(), manage = vi.fn()
  const emit = () => { for (const listener of listeners) listener({ type: 'changed' }) }
  const api = apiFor((method, value) => {
    if (method === 'getPromptCollections') return { revision: collectionRevision, promptIds: stored.map(item => item.id), groups: [], groupByPromptId: {} }
    if (method === 'listPromptTemplates') return [...stored]
    if (method === 'savePromptTemplate') {
      const saved = { ...value, revision: value.expectedRevision + 1, createdAt: '', updatedAt: '' }
      if (!stored.some(item => item.id === value.id)) collectionRevision++
      stored = [saved, ...stored.filter(item => item.id !== value.id)]; emit(); return saved
    }
    if (method === 'removePromptTemplate') {
      if (stored.find(item => item.id === value.id)?.revision !== value.expectedRevision) throw new Error('提示词版本已变化')
      stored = stored.filter(item => item.id !== value.id); collectionRevision++; emit(); return
    }
    throw new Error(`Unexpected request: ${method}`)
  })
  api.subscribe = callback => { listeners.add(callback); return () => { listeners.delete(callback) } }
  function Library() {
    const [prompts, setPrompts] = useState<PromptTemplate[]>([])
    const [target, setTarget] = useState<{ id: string; name: string; requestId: string; create?: boolean } | null>(null)
    const [generation, setGeneration] = useState(0)
    const { guard, confirmation } = useEditorGuard({ reset: () => setGeneration(value => value + 1) })
    const reload = () => setPrompts([...stored])
    useEffect(() => api.subscribe(event => { if (event.type === 'changed' && !event.conversationId) setPrompts([...stored]) }), [])
    return h(Fragment, null,
      h(PromptTemplatesView, { api, prompts, selected: target?.id, onOpen: value => setTarget({ ...value, requestId: 'open' }), onCreate: () => setTarget({ id: prompt.id, name: '新建提示词', requestId: 'create', create: true }), onRemoved: () => { reload(); setTarget(null) } }),
      h(GuardContext.Provider, { value: guard }, target && h(PromptDetailPanel, { key: `${target.id}:${generation}`, api, ...target, active: true, onManage: manage, onSaved: value => { reload(); setTarget({ ...value, requestId: `saved:${value.revision}` }) }, onClose: () => setTarget(null) })),
      confirmation)
  }
  await act(async () => root.render(h(Library)))
  expect(host.textContent).not.toContain('在输入框中使用 $ 引用')
  expect(host.querySelector('[aria-label="提示词用法"]')).not.toBeNull()
  await act(async () => button('新建提示词').click())
  expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(host.querySelector('.skill-detail-title')).not.toBeNull()
  await input('名称', '业务总结'); await input('描述（可选）', '总结格式'); await input('提示词内容', '按事实和结论总结。')
  await act(async () => button('保存').click())
  await act(async () => vi.advanceTimersByTimeAsync(130))
  expect(api.request).toHaveBeenCalledWith('savePromptTemplate', expect.objectContaining({ expectedRevision: 0, name: '业务总结', description: '总结格式', content: '按事实和结论总结。' }))
  await act(async () => host.querySelector<HTMLButtonElement>('.skill-list-select')!.click())
  expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('按事实和结论总结。')
  expect(host.querySelectorAll('.prompt-catalog-row button')).toHaveLength(2)
  await input('提示词内容', '先结论，再事实。')
  await act(async () => button('AI 管理').click())
  expect(manage).not.toHaveBeenCalled()
  expect(document.querySelector('[role=alertdialog]')?.textContent).toContain('有未保存的修改')
  await act(async () => document.querySelector<HTMLButtonElement>('[role=alertdialog] button')!.click())
  expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('先结论，再事实。')
  await act(async () => button('保存').click())
  expect(api.request).toHaveBeenCalledWith('savePromptTemplate', expect.objectContaining({ expectedRevision: 1, content: '先结论，再事实。' }))
  await act(async () => button('AI 管理').click())
  expect(manage).toHaveBeenCalledWith(expect.objectContaining({ id: prompt.id, name: '业务总结' }))
  await act(async () => host.querySelector<HTMLButtonElement>('.prompt-row-actions button')!.click())
  expect(Array.from(document.querySelectorAll('[role=menuitem]')).map(item => item.textContent)).toEqual(['删除提示词'])
  await act(async () => document.querySelector<HTMLElement>('[role=menuitem]')!.click())
  expect(vi.mocked(api.request).mock.calls.filter(([method]) => method === 'removePromptTemplate')).toHaveLength(0)
  // An AI edit after confirmation opened must not silently authorize deleting its newer version.
  stored = [{ ...stored[0], revision: 3, content: 'AI 新版本' }]
  await act(async () => { emit(); await vi.advanceTimersByTimeAsync(130) })
  expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('AI 新版本')
  await act(async () => button('确认删除').click())
  expect(api.request).toHaveBeenCalledWith('removePromptTemplate', { id: prompt.id, expectedRevision: 2 })
  expect(host.querySelector('.skill-list-select')).not.toBeNull()
  await act(async () => document.querySelector<HTMLButtonElement>('[data-slot=popover-content] button')!.click())
  await act(async () => vi.advanceTimersByTimeAsync(300))
  await act(async () => host.querySelector<HTMLButtonElement>('.prompt-row-actions button')!.click())
  await act(async () => document.querySelector<HTMLElement>('[role=menuitem]')!.click())
  await act(async () => button('确认删除').click())
  expect(api.request).toHaveBeenCalledWith('removePromptTemplate', { id: prompt.id, expectedRevision: 3 })
  expect(host.querySelector('.skill-list-select')).toBeNull()
  expect(host.querySelector('.prompt-detail-panel')).toBeNull()
})
