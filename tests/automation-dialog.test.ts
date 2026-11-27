// @vitest-environment jsdom
/*
 * [OUTPUT]: 检查启停待决时操作栏保持可用，以及已有日程首次打开直接可保存。
 * [OUTPUT]: 2026-11-27 验证标题开关、图标顺序、主色运行提交及计划摘要只读。
 * [OUTPUT]: 2026-11-27 定时页夹具使用新会话定位回调。
 * [OUTPUT]: 手动运行收到排队或运行回执即恢复立即运行，工具栏无聊天定位，未知回执复用原请求。
 * [OUTPUT]: 对话创建允许独立读取列表偏好，仍不写入或执行计划。
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
import type { AutomationDefinition, AutomationOccurrence, Snapshot } from '../packages/shared/src/domain'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { AutomationDialog, type AutomationDialogTarget } from '../apps/electron/src/renderer/pages/schedules/automation-dialog'
import { SchedulePage, type ScheduleLocation } from '../apps/electron/src/renderer/pages/schedules'
import { AutomationRunActions } from '../apps/electron/src/renderer/pages/schedules/automation-run-actions'

const snapshot = { agents: [{ id: 'employee', name: 'DS', active: true, connectionId: 'connection', modelId: 'model' }], connections: [{ id: 'connection', defaultModel: 'model' }], conversations: [] } as unknown as Snapshot
const plan = { id: 'plan', name: '每日天气预报', prompt: '查询南京天气', frequency: 'manual', time: '09:00', weekday: 1, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, enabled: false, notify: true, notificationPolicy: 'important_only', conversationPolicy: 'new-conversation', employeeIds: ['employee'], owner: { kind: 'employee', employeeId: 'employee' }, revision: 1 } as AutomationDefinition
let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  localStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); toast.dismiss(); vi.unstubAllGlobals() })
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(value => value.textContent === text)!

test.each(['queued', 'running'] as const)('manual run resets as soon as a %s receipt arrives', async status => {
  let resolve!: (value: AutomationOccurrence) => void
  const occurrence = { id: 'once', automationId: plan.id, conversationId: 'task-chat', status, runIds: ['run'] } as AutomationOccurrence
  const request = vi.fn((_method: string, _input: unknown) => new Promise<AutomationOccurrence>(done => { resolve = done }))
  const api = { request } as unknown as DesktopApi
  await act(async () => root.render(h(AutomationRunActions, { api, automationId: plan.id, active: true })))

  const run = button('立即运行')
  await act(async () => { run.click(); run.click() })
  expect(request).toHaveBeenCalledOnce()
  expect(button('正在提交…')).toBe(run)
  expect(run.disabled).toBe(true)
  await act(async () => resolve(occurrence))
  expect(button('立即运行')).toBe(run)
  expect(run.disabled).toBe(false)
  expect([...host.querySelectorAll('button')]).toEqual([run])

  await act(async () => run.click())
  expect(request).toHaveBeenCalledTimes(2)
  expect(request.mock.calls[1][1]).not.toEqual(request.mock.calls[0][1])
  await act(async () => resolve({ ...occurrence, id: 'next' }))
})

test('a missing run receipt can be checked with the original request ID', async () => {
  const request = vi.fn((_method: string, _input: unknown) => Promise.resolve({ status: 'queued' }))
    .mockRejectedValueOnce(new Error('回执未返回'))
  const api = { request } as unknown as DesktopApi
  await act(async () => root.render(h(AutomationRunActions, { api, automationId: plan.id, active: true })))
  await act(async () => button('立即运行').click())
  await act(async () => button('核对本次运行').click())
  expect(request).toHaveBeenCalledTimes(2)
  expect(request.mock.calls[1]).toEqual(request.mock.calls[0])
  expect(button('立即运行').disabled).toBe(false)
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

test('toggles the saved plan in the toolbar and runs from the primary button', async () => {
  let enabled = false
  let finishPause!: () => void
  const savedPlan = { ...plan, frequency: 'daily' as const, nextTimes: [] }
  const listeners = new Set<Parameters<DesktopApi['subscribe']>[0]>()
  const request = vi.fn(async (method: string, _input?: unknown) => {
    if (method === 'getScheduleList') return { revision: 0, tags: [], tagIdsByAutomationId: {}, order: [] }
    if (method === 'listAutomations') return { definitions: [{ ...savedPlan, enabled }], occurrences: [], available: true }
    if (method === 'listAutomationHistory') return { occurrences: [] }
    if (method === 'resumeAutomation' || method === 'pauseAutomation') {
      if (method === 'pauseAutomation') await new Promise<void>(resolve => { finishPause = resolve })
      enabled = method === 'resumeAutomation'
      for (const listener of listeners) listener({ type: 'changed' })
      return enabled ? { ...plan, enabled } : undefined
    }
    if (method === 'runAutomation') return { id: 'once', automationId: plan.id, status: 'completed', runIds: [] }
    throw new Error(`Unexpected request: ${method}`)
  })
  const api = {
    request,
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
  } as DesktopApi
  await act(async () => root.render(h(SchedulePage, {
    api, snapshot, active: true, sidebarShown: true, divider: null, location: { kind: 'definition', id: plan.id },
    onLocation() {}, onCreateConversation() {}, onConversation() {}, onNavigateMessage() {},
  })))
  const toolbar = host.querySelector('[aria-label="定时任务操作"]')!
  for (const name of ['编辑', '删除']) {
    const action = toolbar.querySelector(`button[aria-label="${name}"]`)
    expect(action?.getAttribute('data-size')).toBe('icon')
    expect(action?.textContent).toBe('')
  }
  expect(host.querySelector('[aria-label="计划摘要"] button')).toBeNull()
  const run = button('立即运行')
  expect(run.getAttribute('data-variant')).toBe('default')
  expect(run.classList.contains('ml-2')).toBe(true)
  const controls = [...toolbar.querySelectorAll<HTMLElement>('button, [role="switch"]')]
  expect(controls.map(element => element.getAttribute('aria-label') ?? element.textContent)).toEqual(['启用定时任务', '编辑', '删除', '立即运行'])
  const toggle = controls[0]
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  await act(async () => toggle.click())
  expect(request).toHaveBeenCalledWith('resumeAutomation', { id: plan.id })
  expect(toggle.getAttribute('aria-checked')).toBe('true')
  const edit = toolbar.querySelector<HTMLButtonElement>('[aria-label="编辑"]')!
  const remove = toolbar.querySelector<HTMLButtonElement>('[aria-label="删除"]')!
  await act(async () => { toggle.click(); toggle.click() })
  expect(request.mock.calls.filter(([method]) => method === 'pauseAutomation')).toEqual([['pauseAutomation', { id: plan.id }]])
  expect(toggle.getAttribute('aria-busy')).toBe('true')
  expect(toggle.getAttribute('aria-checked')).toBe('true')
  expect([edit, remove, run].every(action => !action.disabled)).toBe(true)
  await act(async () => finishPause())
  expect(toggle.getAttribute('aria-checked')).toBe('false')
  expect(toolbar.querySelector('[aria-label="编辑"]')).toBe(edit)
  expect(toolbar.querySelector('[aria-label="删除"]')).toBe(remove)
  expect(button('立即运行')).toBe(run)
  await act(async () => remove.click())
  expect(button('确认删除').disabled).toBe(false)
  await act(async () => button('取消').click())
  await act(async () => edit.click())
  expect(button('关闭').disabled).toBe(false)
  expect(button('保存修改').disabled).toBe(false)
  expect(request.mock.calls.some(([method]) => method === 'getAutomation' || method === 'previewAutomation')).toBe(false)
  await act(async () => button('关闭').click())
  await act(async () => run.click())
  expect(request.mock.calls.filter(([method]) => method === 'runAutomation')).toEqual([['runAutomation', { id: plan.id, requestId: expect.any(String) }]])
})

test('an edited schedule waits for its own validation and ignores an outdated preview', async () => {
  const daily = { ...plan, frequency: 'daily' as const, time: '09:00' }
  const nativeSnapshot: Snapshot = { ...snapshot, agents: snapshot.agents.map(agent => ({
    ...agent, executionBackend: { kind: 'codex-local', profileId: 'profile' },
  })) }
  const profiles = [{ id: 'profile', protocol: 'codex-app-server', verified: { checkedAt: '2026-11-27T09:00:00Z' } }]
  let finishProfiles!: (value: typeof profiles) => void
  let finishPreview!: (value: { nextTimes: string[] }) => void
  const request = vi.fn(async (method: string) => {
    if (method === 'listLaunchProfiles') return new Promise<typeof profiles>(resolve => { finishProfiles = resolve })
    if (method === 'previewAutomation') return new Promise<{ nextTimes: string[] }>(resolve => { finishPreview = resolve })
    throw new Error(`Unexpected request: ${method}`)
  })
  const api = { request, subscribe: () => () => {} } as unknown as DesktopApi
  await act(async () => root.render(h(AutomationDialog, { api, snapshot: nativeSnapshot, active: true,
    target: { kind: 'manual', id: daily.id, initialDefinition: daily, key: 'daily' }, onClose() {}, onSaved() {},
  })))
  const time = document.querySelector<HTMLInputElement>('input[aria-label="执行时间"]')!
  expect(button('保存修改').disabled).toBe(false)
  await act(async () => finishProfiles(profiles))
  expect(button('保存修改').disabled).toBe(false)
  await change(time, '10:00')
  expect(button('保存修改').disabled).toBe(true)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 180)) })
  await change(time, '11:00')
  await act(async () => finishPreview({ nextTimes: ['2026-11-27T10:00:00Z'] }))
  expect(button('保存修改').disabled).toBe(true)
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 180)) })
  await act(async () => finishPreview({ nextTimes: ['2026-11-27T11:00:00Z'] }))
  expect(button('保存修改').disabled).toBe(false)
})

test('conversation creation delegates to the ordinary chat without creating a dialog or submitting', async () => {
  const request = vi.fn(async (method: string) => {
    if (method === 'getScheduleList') return { revision: 0, tags: [], tagIdsByAutomationId: {}, order: [] }
    if (method === 'listAutomations') return { definitions: [], occurrences: [], available: true }
    throw new Error(`Unexpected request: ${method}`)
  })
  const api = { request, subscribe: () => () => {} } as unknown as DesktopApi
  const openConversation = vi.fn()
  function Page() {
    const [location, setLocation] = useState<ScheduleLocation>({ kind: 'overview' })
    return h(SchedulePage, { api, snapshot, active: true, sidebarShown: true, divider: null, location, onLocation: setLocation, onCreateConversation: openConversation, onConversation() {}, onNavigateMessage() {} })
  }
  await act(async () => root.render(h(Page)))
  await act(async () => button('新建定时任务').click())
  await act(async () => [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(item => item.textContent === '对话创建')!.click())
  expect(openConversation).toHaveBeenCalledOnce()
  expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(host.querySelector('.schedule-assistant-chat')).toBeNull()
  expect(request.mock.calls.every(([method]) => ['listAutomations', 'getScheduleList'].includes(method))).toBe(true)
})


test('ordinary employee tasks pin their owner and manual execution without changing the scheduled editor', async () => {
  const f = await fixture({ kind: 'task', employeeId: 'employee', key: 'new-task' })
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('新建任务')
  expect(document.querySelector('[aria-label="频率"]')).toBeNull()
  expect(f.request.mock.calls.find(([method]) => method === 'previewAutomation')?.[1]).toMatchObject({ frequency: 'manual' })
  expect((document.querySelector('[aria-label="执行员工"]') as HTMLButtonElement)?.disabled).toBe(true)
  expect(f.request.mock.calls.some(([method]) => method === 'saveAutomation' || method === 'runAutomation')).toBe(false)
})
