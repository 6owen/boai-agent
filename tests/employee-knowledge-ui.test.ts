// @vitest-environment jsdom
/*
 * [OUTPUT]: 旧资料多文件选择、当前清单及解绑核读；真故障仍Sonner，隐藏后不接收迟到正文或解绑核对。
 * [INPUT]: 生产知识预览组件、滞后全局快照与受控宿主回执。
 * [OUTPUT]: 列表先刷新时预览核对当前hash；隐藏期间拒绝迟到元数据/正文，不误读旧版本或误报成功。
 * [POS]: 知识文件预览生命周期回归，不替代Electron实际场景。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { Resource } from '../src/shared/domain'
import type { DesktopApi } from '../src/shared/ipc'
import { KnowledgePreviewPane } from '../src/renderer/components/work-views/employee-knowledge'
vi.mock('../src/renderer/components/common/file-preview', () => ({ FilePreview: ({ name, file }: { name: string; file: { text: string } }) => h('article', { 'aria-label': name }, file.text) }))
vi.mock('../src/renderer/components/ui/select-field', () => ({ SelectField: ({ value, options, onValueChange }: { value: string; options: {value: string; label: string}[]; onValueChange(value: string): void }) => h('select', { 'aria-label': '知识资料文件', value, onChange: (event: {target: {value: string}}) => onValueChange(event.target.value) }, options.map(option => h('option', { key: option.value, value: option.value }, option.label))) }))
const first = { id: 'resource', kind: 'knowledge', ownerAgentId: 'employee', name: '旧资料.md', knowledge: { revision: 1, contentHash: 'old' } } as Resource
const latest = { ...first, name: '新资料.md', knowledge: { ...first.knowledge!, revision: 2, contentHash: 'new' } }
let root: Root, host: HTMLDivElement
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
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
