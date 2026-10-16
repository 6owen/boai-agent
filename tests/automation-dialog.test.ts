// @vitest-environment jsdom
/*
 * [INPUT]: 生产任务Dialog/表单/草稿守卫、React Portal与可控保存回执。
 * [OUTPUT]: 创建/编辑弹窗不替换底页；关闭保护提交本弹窗表单，保存期间禁止关闭；对话草稿关闭后保留。
 * [POS]: 弹窗生命周期组件回归，不运行Electron或调用模型。
 * [PROTOCOL]: 修改同步Header和tests/.folder.md。
 */
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { toast } from 'sonner'
import type { AutomationDefinition, Snapshot } from '../src/shared/domain'
import type { DesktopApi } from '../src/shared/ipc'
import { AutomationDialog, type AutomationDialogTarget } from '../src/renderer/pages/schedules/automation-dialog'

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
      open && h(AutomationDialog, { api, snapshot, active: true, target, definitions: [], onClose() { closed(); setOpen(false) }, onSaved(value) { saved(value); setOpen(false) }, onOpen: vi.fn() }))
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
  await act(async () => button('保存并退出').click())
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

test('conversation creation opens in a dialog and keeps its draft when closed', async () => {
  const f = await fixture({ kind: 'assistant', key: 'assistant' })
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('对话创建定时任务')
  await change(document.querySelector<HTMLTextAreaElement>('textarea[aria-label="定时任务创建要求"]')!, '每周推荐一篇好文章')
  await act(async () => document.querySelector<HTMLButtonElement>('[data-slot=dialog-close]')!.click())
  expect(f.closed).toHaveBeenCalledOnce()
  expect(JSON.parse(localStorage.getItem('boai:schedule:assistant')!)).toMatchObject({ draft: '每周推荐一篇好文章' })
  expect(f.request).not.toHaveBeenCalled()
})
