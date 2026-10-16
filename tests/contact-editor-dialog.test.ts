// @vitest-environment jsdom
/*
 * [INPUT]: 生产通讯录编辑/创建Dialog、原员工/群表单与受控IPC回执。
 * [OUTPUT]: Portal底页保留、局部草稿守卫/原版本保存、忙时关闭锁；员工创建Card、群创建原双栏；执行记录先关闭弹窗再按原Run打开全局面板。
 * [POS]: 通讯录弹窗组件回归，不运行E2E、模型或修改用户配置。
 * [PROTOCOL]: 修改同步Header和tests/.folder.md。
 */
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AgentInput, Conversation, DigitalAgent, Snapshot } from '../src/shared/domain'
import type { DesktopApi } from '../src/shared/ipc'
import { ContactEditorDialog } from '../src/renderer/pages/contacts/contact-editor-layout'
import { CreateAgentDialog, CreateGroupDialog } from '../src/renderer/components/employee/creation-dialogs'
import { EmployeeExecutionNavigation } from '../src/renderer/components/employee/execution-pane'

const agent = { id: 'ds', name: 'DS', role: '数字员工', instructions: '', color: '#438b80', configVersion: 3, active: true, connectionId: 'connection', modelId: 'model', executionBackend: { kind: 'mastra-model' }, skillIds: [], knowledgeIds: [], sourceIds: ['source'], allowCommands: true } as DigitalAgent
const group = { id: 'group', kind: 'group', title: '天气小组', agentIds: [agent.id], sharedKnowledgeIds: [], configVersion: 4 } as unknown as Conversation
const snapshot = { agents: [agent], conversations: [group], resources: [], connections: [{ id: 'connection', name: 'API', provider: 'openai-compatible', baseUrl: 'https://example.test/v1', defaultModel: 'model' }] } as unknown as Snapshot
let host: HTMLDivElement, root: Root, request: ReturnType<typeof vi.fn<(method: string, input?: unknown) => Promise<unknown>>>, api: DesktopApi
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.getAnimations = () => []
  localStorage.clear()
  request = vi.fn<(method: string, input?: unknown) => Promise<unknown>>(async method => {
    if (method === 'listLaunchProfiles' || method === 'listDataSources') return []
    if (method === 'getAgentHome') return { files: [], configVersion: 3 }
    throw new Error(`Unexpected request: ${method}`)
  })
  api = { request, subscribe: () => () => {} } as unknown as DesktopApi
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(value => value.textContent === text)!
async function change(element: HTMLInputElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })) })
}
async function fixture(kind: 'employee' | 'group') {
  const closed = vi.fn(), refresh = vi.fn(async () => {}), backgroundSubmit = vi.fn(), openExecution = vi.fn()
  function Page() {
    const [open, setOpen] = useState(true)
    return h(EmployeeExecutionNavigation.Provider, { value: openExecution }, h('main', null, h('form', { 'data-background': true, onSubmit: backgroundSubmit }, '原通讯录资料'), open && h(ContactEditorDialog, {
      api, snapshot, active: true, ...(kind === 'employee' ? { agent } : { group }), refresh,
      onClose() { closed(); setOpen(false) }, onOpenAgent() {}, onConversation() {},
    })))
  }
  await act(async () => root.render(h(Page)))
  return { closed, refresh, backgroundSubmit, openExecution }
}

test('execution rows inside configuration close the dialog before opening the original run in the global panel', async () => {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'listEmployeeExecutions' ? { items: [{
    run: { id: 'older-run', conversationId: group.id, agentId: agent.id, createdAt: '2026-10-17T06:00:00Z', status: 'completed' },
    conversationTitle: group.title, configuration: { label: 'API', modelId: 'model' },
  }] } : original(method, input))
  const f = await fixture('employee')
  await act(async () => button('执行详情').click())
  expect(document.querySelector('[role=dialog] [data-employee-run-id="older-run"]')).not.toBeNull()
  await act(async () => document.querySelector<HTMLButtonElement>('[data-employee-run-id="older-run"]')!.click())
  expect(f.closed).toHaveBeenCalledOnce()
  expect(f.openExecution).toHaveBeenCalledWith(expect.objectContaining({ conversationId: group.id, agentId: agent.id, runId: 'older-run' }))
  expect(f.closed.mock.invocationCallOrder[0]).toBeLessThan(f.openExecution.mock.invocationCallOrder[0]!)
  expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(host.querySelector('[data-background]')).not.toBeNull()
  expect(request.mock.calls.some(([method]) => method === 'saveAgent' || method === 'createConversation')).toBe(false)
})

test.each(['employee', 'group'] as const)('%s editing uses the shared connection dialog and keeps its background', async kind => {
  const f = await fixture(kind), background = host.querySelector('[data-background]')
  const dialog = document.querySelector('[role=dialog]')!
  expect(dialog.classList.contains('connection-dialog')).toBe(true)
  expect(dialog.querySelector('.contact-configuration-card')).not.toBeNull()
  expect(dialog.querySelector('.connection-dialog-body [data-slot=scroll-area-viewport]')).not.toBeNull()
  expect(host.querySelector('.editor-frame')).toBeNull()
  await act(async () => button('取消').click())
  expect(f.closed).toHaveBeenCalledOnce()
  expect(host.querySelector('[data-background]')).toBe(background)
  expect(request.mock.calls.some(([method]) => method === 'saveAgent' || method === 'createConversation')).toBe(false)
})

test('dirty employee edit saves only the dialog form with its original version and blocks closing during save', async () => {
  let finish!: (value: DigitalAgent) => void
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'saveAgent' ? new Promise<DigitalAgent>(resolve => { finish = resolve }) : original(method, input))
  const f = await fixture('employee')
  await change(document.querySelector<HTMLInputElement>('input[aria-label="员工名称"]')!, '天气研究员')
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="关闭编辑员工"]')!.click())
  expect(document.querySelector('[role=alertdialog]')?.textContent).toContain('有未保存的修改')
  expect(f.closed).not.toHaveBeenCalled()
  await act(async () => button('保存并退出').click())
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  const payload = request.mock.calls.find(([method]) => method === 'saveAgent')?.[1] as AgentInput
  expect(payload).toMatchObject({ id: agent.id, name: '天气研究员', expectedConfigVersion: 3, sourceIds: ['source'], allowCommands: true })
  expect(f.backgroundSubmit).not.toHaveBeenCalled()
  expect(document.querySelector<HTMLButtonElement>('[aria-label="关闭编辑员工"]')!.disabled).toBe(true)
  await act(async () => document.querySelector('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(f.closed).not.toHaveBeenCalled()
  await act(async () => finish({ ...agent, ...payload, configVersion: 4 }))
  expect(f.refresh).toHaveBeenCalledOnce()
  expect(f.closed).toHaveBeenCalledOnce()
})

test('group edits retain members and the versioned save contract inside the dialog', async () => {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'createConversation' ? { ...group, ...(input as object), configVersion: 5 } : original(method, input))
  const f = await fixture('group')
  await change(document.querySelector<HTMLInputElement>('input[aria-label="群聊名称"]')!, '研究小组')
  await act(async () => button('保存设置').click())
  expect(request).toHaveBeenCalledWith('createConversation', expect.objectContaining({ id: group.id, title: '研究小组', expectedConfigVersion: 4, agentIds: [agent.id] }))
  expect(f.closed).toHaveBeenCalledOnce()
})

test.each(['employee', 'group'] as const)('%s creation preserves its layout without creating on open', async kind => {
  const onClose = vi.fn(), onCreated = vi.fn(async () => {})
  await act(async () => root.render(h(kind === 'employee' ? CreateAgentDialog : CreateGroupDialog, { api, snapshot, onClose, onCreated })))
  const dialog = document.querySelector('[role=dialog]')!
  if (kind === 'employee') {
    expect(dialog.classList.contains('connection-dialog')).toBe(true)
    expect(dialog.querySelector('form.connection-editor .connection-editor-footer')).not.toBeNull()
  } else {
    expect(dialog.classList.contains('connection-dialog')).toBe(false)
    expect(dialog.querySelector('#create-group-form [aria-label="搜索群成员"]')).not.toBeNull()
    expect(dialog.querySelector('[aria-label="已选成员"] [data-slot=dialog-title]')?.textContent).toBe('发起群聊')
    expect(button('完成').disabled).toBe(true)
  }
  expect(dialog.querySelector('form form')).toBeNull()
  await act(async () => button('取消').click())
  expect(onClose).toHaveBeenCalledOnce()
  expect(onCreated).not.toHaveBeenCalled()
  expect(request.mock.calls.some(([method]) => method === 'saveAgent' || method === 'createConversation')).toBe(false)
})
