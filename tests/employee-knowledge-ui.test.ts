// @vitest-environment jsdom
/*
 * [OUTPUT]: 默认列表夹具沿原上传/未决检查，表格用例显式切换，保留两种视图的行为覆盖。
 * [OUTPUT]: 上传选择/保存/事件刷新保留原表格或列表DOM及滚动位置，未决核对仅标题栏；跨员工/重新显示不沿用旧页，迟到结果丢弃。
 * [OUTPUT]: 2026-11-06 表格/列表菜单直接插入真实composer标签，核验版本并保留最新正文/附件；重复选择去重，隐藏/切会话/锁定后拒绝迟到插入。
 * [OUTPUT]: 旧资料多文件选择、当前清单及解绑核读；真故障仍Sonner，隐藏后不接收迟到正文或解绑核对。
 * [INPUT]: 生产知识预览组件、滞后全局快照与受控宿主回执。
 * [OUTPUT]: 列表先刷新时预览核对当前hash；隐藏期间拒绝迟到元数据/正文，不误读旧版本或误报成功。
 * [POS]: 知识文件预览生命周期回归，不替代Electron实际场景。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与tests/.folder.md。
 */
import { act, createElement as h, Fragment, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { DigitalAgent, Resource, Snapshot } from '../packages/shared/src/domain'
import type { AppEvent, DesktopApi } from '../packages/shared/src/ipc'
import { EmployeeKnowledge, KnowledgePreviewPane } from '../apps/electron/src/renderer/components/work-views/employee-knowledge'
import { PromptBar } from '../apps/electron/src/renderer/pages/conversations/-components/prompt-bar'
import { appendDraftReference, draftResourceReferences } from '../apps/electron/src/renderer/pages/conversations/inline-mentions'
import type { ChatDraft } from '../apps/electron/src/renderer/pages/conversations/presentation'
vi.mock('../apps/electron/src/renderer/components/common/file-preview', () => ({ FilePreview: ({ name, file }: { name: string; file: { text: string } }) => h('article', { 'aria-label': name }, file.text) }))
vi.mock('../apps/electron/src/renderer/components/ui/select-field', () => ({ SelectField: ({ value, options, onValueChange }: { value: string; options: {value: string; label: string}[]; onValueChange(value: string): void }) => h('select', { 'aria-label': '知识资料文件', value, onChange: (event: {target: {value: string}}) => onValueChange(event.target.value) }, options.map(option => h('option', { key: option.value, value: option.value }, option.label))) }))
const first = { id: 'resource', kind: 'knowledge', ownerAgentId: 'employee', name: '旧资料.md', knowledge: { revision: 1, contentHash: 'old' } } as Resource
const latest = { ...first, name: '新资料.md', knowledge: { ...first.knowledge!, revision: 2, contentHash: 'new' } }
let root: Root, host: HTMLDivElement
beforeEach(() => {
  localStorage.removeItem('boai.knowledge.pending:employee')
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
afterEach(async () => { await act(async () => root.unmount()); await act(async () => vi.runOnlyPendingTimersAsync()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const employee: DigitalAgent = { id: 'employee', name: '审核员', role: '审核', instructions: '', color: '', connectionId: '', modelId: '', allowCommands: false, active: true, configVersion: 1, skillIds: [], knowledgeIds: [first.id] }
const snapshot = { agents: [employee] } as Snapshot
const originalDraft: ChatDraft = { text: '保留正文', mentionIds: [], materials: [{ id: 'existing-upload', name: '附件.txt', requestId: 'upload-request', status: 'preparing' }] }
let composerDraft: ChatDraft, editDraft: (draft: ChatDraft) => void
function KnowledgeChat({ api, active = true, conversationId = 'chat', locked = false }: { api: DesktopApi; active?: boolean; conversationId?: string; locked?: boolean }) {
  const [draft, setDraft] = useState(originalDraft); composerDraft = draft; editDraft = setDraft
  return h(Fragment, null,
    h(EmployeeKnowledge, { api, snapshot, agentId: employee.id, active, composer: locked ? undefined : { id: conversationId, add: reference => setDraft(previous => appendDraftReference(previous, reference)) } }),
    h(PromptBar, { api, conversationId, draft, setDraft, members: [employee], group: false, external: false, placeholder: '', onSend() {}, onActivity() {}, onOpenWorkspace() {}, children: () => null }))
}
async function addKnowledge() {
  await act(async () => host.querySelector<HTMLButtonElement>(`[role=tabpanel]:not([hidden]) [aria-label="知识资料操作 ${first.name}"]`)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })))
  await act(async () => vi.advanceTimersByTimeAsync(150))
  const item = Array.from(document.querySelectorAll<HTMLElement>('[role=menuitem]')).find(item => item.textContent === '添加到输入框')!
  expect(item).toBeDefined()
  await act(async () => item.click())
  await act(async () => vi.advanceTimersByTimeAsync(150))
}
it.each(['table', 'list'])('adds a verified knowledge file directly from the %s menu to the real composer while retaining the latest draft and attachments', async view => {
  let resolve!: (value: unknown) => void
  const request = vi.fn(async (method: string) => {
    if (method === 'listEmployeeKnowledge') return [first]
    if (method === 'getEmployeeKnowledgeFiles') return new Promise(done => { resolve = done })
    throw new Error(`Unexpected request: ${method}`)
  }), api = { request, subscribe: () => () => {} } as unknown as DesktopApi
  await act(async () => root.render(h(KnowledgeChat, { api })))
  if (view === 'table') {
    await act(async () => Array.from(host.querySelectorAll<HTMLElement>('[role=tab]')).find(tab => tab.textContent === '表格')!.click())
    await act(async () => vi.advanceTimersByTimeAsync(150))
  }
  await addKnowledge()
  await act(async () => editDraft({ ...composerDraft, text: '读取期间继续输入' }))
  const result = { resource: { ...latest, path: '/private/never-send' }, revision: 2, contentHash: 'b'.repeat(64), files: [] }
  await act(async () => resolve(result))
  expect(composerDraft.text).toBe('读取期间继续输入 $新资料.md ')
  expect(composerDraft.materials).toBe(originalDraft.materials)
  expect(draftResourceReferences(composerDraft)).toEqual([{ kind: 'knowledge', id: first.id, name: latest.name, agentId: employee.id, revision: 2, contentHash: 'b'.repeat(64) }])
  expect(host.querySelector('.composer-mention-node')?.textContent).toContain('$新资料.md')
  expect(JSON.stringify(composerDraft)).not.toContain('/private')
  await addKnowledge()
  await act(async () => resolve(result))
  expect(draftResourceReferences(composerDraft)).toHaveLength(1)
  expect(request.mock.calls.every(([method]) => ['listEmployeeKnowledge', 'getEmployeeKnowledgeFiles'].includes(method))).toBe(true)
})

it.each(['hidden', 'conversation', 'locked'] as const)('does not insert a late knowledge result after the target is %s', async mode => {
  let resolve!: (value: unknown) => void
  const api = { request: async (method: string) => method === 'listEmployeeKnowledge' ? [first] : new Promise(done => { resolve = done }), subscribe: () => () => {} } as unknown as DesktopApi
  await act(async () => root.render(h(KnowledgeChat, { api })))
  await addKnowledge()
  await act(async () => root.render(h(KnowledgeChat, { api, active: mode !== 'hidden', conversationId: mode === 'conversation' ? 'other-chat' : 'chat', locked: mode === 'locked' })))
  await act(async () => resolve({ resource: latest, revision: 2, contentHash: 'b'.repeat(64), files: [] }))
  expect(composerDraft).toBe(originalDraft)
  expect(host.querySelector('.composer-mention-node')).toBeNull()
})

it.each(['table', 'list'])('keeps the %s mounted throughout file selection, upload and background refresh', async view => {
  const listeners = new Set<(event: AppEvent) => void>()
  let choose!: (value: unknown) => void, save!: (value: unknown) => void, requestId = '', reads = 0
  const refreshes: ((value: Resource[]) => void)[] = []
  const request = vi.fn(async (method: string, input: any) => {
    if (method === 'listEmployeeKnowledge') return ++reads === 1 ? [first] : new Promise<Resource[]>(resolve => refreshes.push(resolve))
    if (method === 'chooseKnowledgeSource') return new Promise(resolve => { choose = resolve })
    if (method === 'saveEmployeeKnowledge') { requestId = input.requestId; return new Promise(resolve => { save = resolve }) }
    throw new Error(`Unexpected request: ${method}`)
  }), api = { request, subscribe: (listener: (event: AppEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener) } } as unknown as DesktopApi
  await act(async () => root.render(h(EmployeeKnowledge, { api, snapshot, agentId: employee.id, active: true })))
  if (view === 'table') {
    await act(async () => Array.from(host.querySelectorAll<HTMLElement>('[role=tab]')).find(tab => tab.textContent === '表格')!.click())
    await act(async () => vi.advanceTimersByTimeAsync(150))
  }
  const viewport = host.querySelector<HTMLElement>('[aria-label="知识资料滚动区域"]')!
  const panel = viewport.querySelector('[role=tabpanel]')!, row = viewport.querySelector(view === 'table' ? 'tbody tr' : 'li')!
  viewport.scrollTop = 120
  const stable = () => {
    expect(viewport.querySelector('[role=tabpanel]')).toBe(panel)
    expect(viewport.querySelector(view === 'table' ? 'tbody tr' : 'li')).toBe(row)
    expect(viewport.scrollTop).toBe(120)
    expect(viewport.textContent).not.toContain('核对知识资料操作结果')
    expect(viewport.textContent).not.toContain('暂无知识资料')
    expect(panel.parentElement!.firstElementChild).toBe(panel)
  }
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="添加资料"]')!.click())
  stable()
  await act(async () => choose({ id: 'source' }))
  stable(); expect(host.textContent).not.toContain('核对知识资料操作结果')
  await act(async () => { for (const listener of listeners) listener({ type: 'changed' }) })
  stable()
  await act(async () => vi.advanceTimersByTimeAsync(130))
  stable()
  await act(async () => save({ requestId, status: 'completed' }))
  stable()
  const added = { ...first, id: 'added', name: '上传完成.txt' }
  await act(async () => refreshes.at(-1)!([first, added]))
  stable(); expect(viewport.textContent).toContain(added.name)
  // The refresh started during upload must not overwrite the final upload result.
  await act(async () => refreshes[0]([]))
  stable(); expect(viewport.textContent).toContain(added.name)
  expect(request.mock.calls.filter(([method]) => method === 'saveEmployeeKnowledge')).toHaveLength(1)
})

it('offers an unconfirmed upload check in the header without inserting a row above the files or resubmitting', async () => {
  vi.spyOn(toast, 'error')
  let requestId = '', checks = 0
  const request = vi.fn(async (method: string, input: any) => {
    if (method === 'listEmployeeKnowledge') return [first]
    if (method === 'chooseKnowledgeSource') return { id: 'source' }
    if (method === 'saveEmployeeKnowledge') { requestId = input.requestId; throw new Error('回执丢失') }
    if (method === 'getEmployeeKnowledgeReceipt') { if (++checks === 1) throw new Error('暂时无法核对'); return { requestId, status: 'completed' } }
    throw new Error(`Unexpected request: ${method}`)
  }), api = { request, subscribe: () => () => {} } as unknown as DesktopApi
  await act(async () => root.render(h(EmployeeKnowledge, { api, snapshot, agentId: employee.id, active: true })))
  const viewport = host.querySelector('[aria-label="知识资料滚动区域"]')!, row = viewport.querySelector('li')!
  expect(row).not.toBeNull()
  expect(host.querySelector('[role=tab][aria-selected=true]')?.textContent).toBe('列表')
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="添加资料"]')!.click())
  expect(viewport.querySelector('li')).toBe(row)
  expect(viewport.textContent).not.toContain('核对知识资料操作结果')
  const check = Array.from(host.querySelectorAll<HTMLButtonElement>('header button')).find(button => button.textContent === '核对知识资料操作结果')!
  expect(check).toBeDefined()
  await act(async () => check.click())
  expect(viewport.querySelector('li')).toBe(row)
  expect(host.textContent).not.toContain('核对知识资料操作结果')
  expect(request.mock.calls.filter(([method]) => method === 'saveEmployeeKnowledge')).toHaveLength(1)
})

it.each(['employee', 'visibility'] as const)('does not reuse a retained page after changing %s or accept its late response', async change => {
  const listeners = new Set<(event: AppEvent) => void>(), refreshes: ((items: Resource[]) => void)[] = []
  let reads = 0
  const api = { request: async () => ++reads === 1 ? [first] : new Promise<Resource[]>(resolve => refreshes.push(resolve)), subscribe: (listener: (event: AppEvent) => void) => { listeners.add(listener); return () => listeners.delete(listener) } } as unknown as DesktopApi
  const props = { api, snapshot: { agents: [employee, { ...employee, id: 'other' }] } as Snapshot, agentId: employee.id, active: true }
  await act(async () => root.render(h(EmployeeKnowledge, props)))
  await act(async () => { for (const listener of listeners) listener({ type: 'changed' }); await vi.advanceTimersByTimeAsync(130) })
  expect(host.textContent).toContain(first.name)
  if (change === 'visibility') await act(async () => root.render(h(EmployeeKnowledge, { ...props, active: false })))
  await act(async () => root.render(h(EmployeeKnowledge, { ...props, agentId: change === 'employee' ? 'other' : employee.id })))
  expect(host.textContent).not.toContain(first.name)
  await act(async () => refreshes[0]([first]))
  expect(host.textContent).not.toContain(first.name)
  await act(async () => refreshes.at(-1)!([{ ...latest, id: 'new-resource' }]))
  expect(host.textContent).toContain(latest.name)
})

it('reads the currently authorized revision when the list has updated before the global resource snapshot', async () => {
  const request = vi.fn(async (method: string, input: unknown) => {
    if (method === 'getEmployeeKnowledgeFiles') return { resource: latest, revision: 2, contentHash: 'new', files: [{ key: '', name: '新资料.md', contentHash: 'new', size: 20 }] }
    if (method === 'getEmployeeKnowledgePreview') { expect(input).toMatchObject({ contentHash: 'new' }); return { resource: latest, contentHash: 'new', filePreview: { text: '新版内容' } } }
    throw new Error('unexpected request')
  }), api = { request } as unknown as DesktopApi
  await act(async () => root.render(h(KnowledgePreviewPane, { api, resource: first, active: true })))
  expect(host.textContent).toBe('新版内容'); expect(host.querySelector('article')?.getAttribute('aria-label')).toBe('新资料.md')
  expect(request.mock.calls.filter(([method]) => method === 'getEmployeeKnowledgePreview')).toHaveLength(1)
})
it('does not start a body read from metadata that arrives after the pane becomes hidden', async () => {
  let resolve!: (value: unknown) => void
  const request = vi.fn(() => new Promise<unknown>(done => { resolve = done })), api = { request } as unknown as DesktopApi
  await act(async () => root.render(h(KnowledgePreviewPane, { api, resource: first, active: true })))
  await act(async () => root.render(h(KnowledgePreviewPane, { api, resource: first, active: false })))
  await act(async () => resolve({ resource: latest, revision: 2, contentHash: 'new', files: [{ key: '', name: '新资料.md', contentHash: 'new', size: 20 }] }))
  expect(request).toHaveBeenCalledTimes(1); expect(host.textContent).toBe('')
})

it('switches between historical directory files without accepting a late response for the previous selection', async () => {
  const legacy = { id: 'legacy', kind: 'knowledge', name: '历史目录' } as Resource
  let firstRead!: (value: unknown) => void
  const request = vi.fn(async (method: string, input: any) => {
    expect(input.agentId).toBe('employee')
    if (method === 'getEmployeeKnowledgeFiles') return { resource: legacy, revision: 0, contentHash: 'directory-hash', files: [{ key: 'a.md', name: 'a.md', contentHash: 'a', size: 10 }, { key: 'nested/b.txt', name: 'nested/b.txt', contentHash: 'b', size: 10 }] }
    expect(input.contentHash).toBe('directory-hash')
    if (input.fileKey === 'a.md') return new Promise(resolve => { firstRead = resolve })
    return { resource: legacy, fileName: 'b.txt', contentHash: 'b', filePreview: { text: '第二份实际内容' } }
  }), api = { request } as unknown as DesktopApi
  await act(async () => root.render(h(KnowledgePreviewPane, { api, resource: legacy, agentId: 'employee', active: true })))
  const select = host.querySelector('select')!
  await act(async () => { select.value = 'nested/b.txt'; select.dispatchEvent(new Event('change', { bubbles: true })) })
  expect(host.querySelector('article')?.textContent).toBe('第二份实际内容')
  await act(async () => firstRead({ resource: legacy, fileName: 'a.md', contentHash: 'a', filePreview: { text: '迟到的第一份内容' } }))
  expect(host.querySelector('article')?.textContent).toBe('第二份实际内容'); expect(host.textContent).not.toContain('迟到')
})

it('shows a confirmed removed binding without a false error when the global snapshot still contains the old resource', async () => {
  const error = vi.spyOn(toast, 'error')
  const request = vi.fn(async (method: string) => {
    if (method === 'getEmployeeKnowledgeFiles') throw new Error('员工未绑定此知识资料')
    if (method === 'listEmployeeKnowledge') return []
    throw new Error('unexpected body read')
  }), api = { request } as unknown as DesktopApi
  await act(async () => root.render(h(KnowledgePreviewPane, { api, resource: first, active: true })))
  expect(host.textContent).toBe('该员工已移除此资料。'); expect(error).not.toHaveBeenCalled()
  expect(request.mock.calls.map(([method]) => method)).toEqual(['getEmployeeKnowledgeFiles', 'listEmployeeKnowledge'])
})

it('keeps a genuine read failure visible through Sonner and a retry action when the binding still exists', async () => {
  const error = vi.spyOn(toast, 'error')
  const api = { request: async (method: string) => {
    if (method === 'getEmployeeKnowledgeFiles') throw new Error('实际磁盘读取失败')
    return [first]
  } } as unknown as DesktopApi
  await act(async () => root.render(h(KnowledgePreviewPane, { api, resource: first, active: true })))
  expect(error).toHaveBeenCalledWith('实际磁盘读取失败', expect.any(Object)); expect(host.textContent).toBe('重新读取资料')
})

it('ignores a removal check that completes after the preview is hidden', async () => {
  let resolve!: (value: Resource[]) => void
  const error = vi.spyOn(toast, 'error')
  const api = { request: async (method: string) => {
    if (method === 'getEmployeeKnowledgeFiles') throw new Error('员工未绑定此知识资料')
    return new Promise<Resource[]>(done => { resolve = done })
  } } as unknown as DesktopApi
  await act(async () => root.render(h(KnowledgePreviewPane, { api, resource: first, active: true })))
  await act(async () => root.render(h(KnowledgePreviewPane, { api, resource: first, active: false })))
  await act(async () => resolve([]))
  expect(host.textContent).toBe(''); expect(error).not.toHaveBeenCalled()
})
