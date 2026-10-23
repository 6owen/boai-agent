// @vitest-environment jsdom
/*
 * [OUTPUT]: 手动本次查看按钮仅运行期间显示；历史/自动执行及完成/失败/取消/中断后的按钮均隐藏。
 * [OUTPUT]: 本轮覆盖复制/员工入口、定时运行防连点、失败过程、严格私有判断及保留原预算的显式继续；实际范围以各用例为准。
 * [OUTPUT]: 对话创建仅委托普通会话导航、无弹窗/自动提交；手动创建编辑原Portal、草稿和关闭保护保持。
 * [INPUT]: 生产任务页面/Dialog/表单/草稿守卫、React Portal与可控保存回执。
 * [OUTPUT]: 手动创建/编辑保留弹窗/草稿/忙时保护；对话入口进入普通会话，不在定时页建立聊天。
 * [POS]: 弹窗生命周期组件回归，不运行Electron或调用模型。
 * [PROTOCOL]: 修改同步Header和tests/.folder.md。
 */
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { toast } from 'sonner'
import type { AutomationDefinition, AutomationOccurrence, Snapshot } from '../src/shared/domain'
import type { DesktopApi } from '../src/shared/ipc'
import { AutomationDialog, type AutomationDialogTarget } from '../src/renderer/pages/schedules/automation-dialog'
import { SchedulePage, type ScheduleLocation } from '../src/renderer/pages/schedules'
import { AutomationRunActions } from '../src/renderer/pages/schedules/automation-run-actions'

const snapshot = { agents: [{ id: 'employee', name: 'DS', active: true, connectionId: 'connection', modelId: 'model' }], connections: [{ id: 'connection', defaultModel: 'model' }], conversations: [] } as unknown as Snapshot
const plan = { id: 'plan', name: '每日天气预报', prompt: '查询南京天气', frequency: 'manual', time: '09:00', weekday: 1, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, enabled: false, notify: true, notificationPolicy: 'important_only', conversationPolicy: 'new-conversation', employeeIds: ['employee'], owner: { kind: 'employee', employeeId: 'employee' }, revision: 1 } as AutomationDefinition
let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  localStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); toast.dismiss(); vi.unstubAllGlobals() })
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(value => value.textContent === text)!

test.each(['completed', 'failed', 'cancelled', 'interrupted'] as const)('manual run navigation is hidden for history and automatic runs and disappears after %s', async terminalStatus => {
  let resolve!: (o: AutomationOccurrence) => void
  const occurrence = { id: 'once', automationId: plan.id, conversationId: 'task-chat', startedAt: new Date().toISOString(), status: 'running', stateVersion: 1, runIds: [] } as unknown as AutomationOccurrence
  const request = vi.fn(async (method: string) => method === 'runAutomation' ? new Promise<AutomationOccurrence>(done => { resolve = done }) : { conversationId: 'employee-chat', messageId: 'published-trigger' })
  const api = { request, subscribe: () => () => {} } as unknown as DesktopApi
  const open = vi.fn(), navigate = vi.fn()
  const render = async (occurrences: AutomationOccurrence[]) => act(async () => root.render(h(AutomationRunActions, { api, automationId: plan.id, occurrences, active: true, onOccurrence: open, onNavigateMessage: navigate })))
  const historical = { ...occurrence, id: 'historical', status: 'completed', runIds: ['old-run'] } as AutomationOccurrence
  await render([historical])
  expect(host.querySelector('[aria-label="查看本次执行过程"]')).toBeNull()
  expect(host.querySelector('[aria-label="定位聊天记录"]')).toBeNull()
  await render([{ ...historical, status: 'running' }])
  expect(button('本次运行中').disabled).toBe(true)
  expect(host.querySelector('[aria-label="查看本次执行过程"]')).toBeNull()
  expect(host.querySelector('[aria-label="定位聊天记录"]')).toBeNull()
  await render([historical])
  await act(async () => { button('立即运行一次').click(); button('正在提交…')?.click() })
  expect(request).toHaveBeenCalledOnce()
  expect(button('正在提交…').disabled).toBe(true)
  await act(async () => resolve(occurrence))
  expect(open).not.toHaveBeenCalled()
  expect(button('本次运行中').disabled).toBe(true)
  expect(host.querySelector<HTMLButtonElement>('[aria-label="定位聊天记录"]')!.disabled).toBe(true)
  await render([{ ...occurrence, runIds: ['run'] }])
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="查看本次执行过程"]')!.click())
  expect(open).toHaveBeenCalledWith('once')
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-label="定位聊天记录"]')!.click())
  expect(navigate).toHaveBeenCalledWith('employee-chat', 'published-trigger', expect.any(Function))
  await render([{ ...occurrence, status: terminalStatus, stateVersion: 2 }])
  expect(host.querySelector('[aria-label="查看本次执行过程"]')).toBeNull()
  expect(host.querySelector('[aria-label="定位聊天记录"]')).toBeNull()
  expect(button('立即运行一次').disabled).toBe(false)
  await render([{ ...historical, status: 'running' }])
  expect(host.querySelector('[aria-label="查看本次执行过程"]')).toBeNull()
  expect(host.querySelector('[aria-label="定位聊天记录"]')).toBeNull()
  await render([]) // History cleanup/eviction must not revive the accepted running receipt.
  expect(button('立即运行一次').disabled).toBe(false)
})
async function change(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
async function fixture(target: AutomationDialogTarget) {
  let save: ((value: AutomationDefinition) => void) | undefined
  const request = vi.fn(async (method: string, input?: unknown) => {
    if (method === 'getAutomation') return plan
    if (method === 'previewAutomation') return { nextTimes: [], timezone: (input as { timezone: string }).timezone }
    if (method === 'saveAutomation') return new Promise<AutomationDefinition>(resolve => { save = resolve })
    throw new Error(`Unexpected request: ${method}`)
  })
  const api = { request, subscribe: () => () => {} } as unknown as DesktopApi
  const closed = vi.fn(), saved = vi.fn(), backgroundSubmit = vi.fn()
  function Page() {
    const [open, setOpen] = useState(true)
    return h('main', null, h('form', { 'data-background': true, onSubmit: backgroundSubmit }, '原任务详情'),
      open && h(AutomationDialog, { api, snapshot, active: true, target, onClose() { closed(); setOpen(false) }, onSaved(value) { saved(value); setOpen(false) } }))
  }
  await act(async () => root.render(h(Page)))
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 180)) })
  return { request, closed, saved, backgroundSubmit, finish: async () => { await act(async () => save!({ ...plan, name: '修改后的任务' })) } }
}

test('manual creation opens a portal dialog and cancellation keeps the background page', async () => {
  const f = await fixture({ kind: 'manual', key: 'new' })
  const background = host.querySelector('[data-background]')
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('新建定时任务')
  expect(host.querySelector('.automation-editor')).toBeNull()
  expect(document.querySelector('.automation-editor')).not.toBeNull()
  await act(async () => button('取消').click())
  expect(f.closed).toHaveBeenCalledOnce()
  expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(host.querySelector('[data-background]')).toBe(background)
  expect(f.request.mock.calls.some(([method]) => method === 'saveAutomation')).toBe(false)
})

test('dirty edit saves only its own form before closing and cannot be dismissed while saving', async () => {
  const f = await fixture({ kind: 'manual', id: plan.id, key: 'edit' })
  const name = document.querySelector<HTMLInputElement>('input[aria-label="名称"]')!
  expect(name.value).toBe(plan.name)
  await change(name, '修改后的任务')
  await act(async () => document.querySelector<HTMLButtonElement>('[data-slot=dialog-close]')!.click())
  expect(f.closed).not.toHaveBeenCalled()
  expect(document.querySelector('[role=alertdialog]')?.textContent).toContain('有未保存的修改')
  expect([...document.querySelectorAll('[role=alertdialog] button')].map(value => value.textContent)).toEqual(['取消', '退出'])
  expect(f.request.mock.calls.some(([method]) => method === 'saveAutomation')).toBe(false)
  await act(async () => document.querySelector<HTMLButtonElement>('[role=alertdialog] [data-slot=alert-dialog-cancel]')!.click())
  expect(name.value).toBe('修改后的任务')
  expect(f.closed).not.toHaveBeenCalled()
  await act(async () => button('保存修改').click())
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  expect(f.request.mock.calls.filter(([method]) => method === 'saveAutomation')).toHaveLength(1)
  expect(f.request.mock.calls.find(([method]) => method === 'saveAutomation')?.[1]).toMatchObject({ id: plan.id, name: '修改后的任务', enabled: false, expectedRevision: 1 })
  expect(f.backgroundSubmit).not.toHaveBeenCalled()
  expect(document.querySelector('[data-slot=dialog-close]')).toBeNull()
  expect(button('关闭').disabled).toBe(true)
  await act(async () => document.querySelector('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(f.closed).not.toHaveBeenCalled()
  await f.finish()
  expect(f.saved).toHaveBeenCalledOnce()
  expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(host.textContent).toBe('原任务详情')
})

test('exiting a dirty schedule discards without saving', async () => {
  const f = await fixture({ kind: 'manual', id: plan.id, key: 'discard' })
  await change(document.querySelector<HTMLInputElement>('input[aria-label="名称"]')!, '不保存的任务')
  await act(async () => document.querySelector<HTMLButtonElement>('[data-slot=dialog-close]')!.click())
  await act(async () => button('退出').click())
  expect(f.closed).toHaveBeenCalledOnce()
  expect(f.saved).not.toHaveBeenCalled()
  expect(f.request.mock.calls.some(([method]) => method === 'saveAutomation')).toBe(false)
  expect(f.backgroundSubmit).not.toHaveBeenCalled()
})

test('conversation creation delegates to the ordinary chat without creating a dialog or submitting', async () => {
  const request = vi.fn(async (method: string) => {
    if (method === 'listAutomations') return { definitions: [], occurrences: [], available: true }
    throw new Error(`Unexpected request: ${method}`)
  })
  const api = { request, subscribe: () => () => {} } as unknown as DesktopApi
  const openConversation = vi.fn()
  function Page() {
    const [location, setLocation] = useState<ScheduleLocation>({ kind: 'overview' })
    return h(SchedulePage, { api, snapshot, active: true, sidebarShown: true, divider: null, location, onLocation: setLocation, onCreateConversation: openConversation, onInfo() {}, onOccurrence() {}, onNavigateMessage() {} })
  }
  await act(async () => root.render(h(Page)))
  await act(async () => button('新建定时任务').click())
  await act(async () => [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(item => item.textContent === '对话创建')!.click())
  expect(openConversation).toHaveBeenCalledOnce()
  expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(host.querySelector('.schedule-assistant-chat')).toBeNull()
  expect(request.mock.calls.every(([method]) => method === 'listAutomations')).toBe(true)
})
