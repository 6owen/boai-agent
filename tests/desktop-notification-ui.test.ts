// @vitest-environment jsdom
/*
 * [INPUT]: Desktop notice snapshots and the production Sonner and notification provider.
 * [OUTPUT]: Top-right placement, one delivery per live notice, exact action target, stale snapshot protection and teardown.
 * [POS]: Renderer notification regression without a desktop window.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { act, createElement, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import type { AppEvent, DesktopApi } from '../packages/shared/src/ipc'
import type { DesktopNotice, NotificationSnapshot } from '../packages/shared/src/ipc/notifications'
import { DesktopNotificationProvider } from '../apps/electron/src/renderer/components/app-shell/notification-center'
import { Toaster } from '../apps/electron/src/renderer/components/ui/sonner'

it('dispatches live notices once in the top right and opens the original target', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  const host = document.createElement('div')
  document.body.append(host)
  const root = createRoot(host)
  const listeners = new Set<(event: AppEvent) => void>()
  const read = vi.fn<NonNullable<DesktopApi['notifications']>['read']>().mockResolvedValue(undefined)
  const open = vi.fn()
  const task: DesktopNotice = {
    id: 'task:run-1', title: '天气助手 的任务待确认', level: 'success', createdAt: '2026-11-26T02:00:00.000Z', read: false,
    target: { kind: 'employee-task', employeeId: 'weather', taskId: 'today' },
  }
  const historical = { ...task, id: 'task:archived', title: '上一次任务结果' }
  const state: NotificationSnapshot = { revision: 1, items: [historical], pendingIds: [], agentUpdates: [], checking: false }
  let resolveSnapshot!: (value: NotificationSnapshot) => void
  const api = {
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener) } },
    notifications: { snapshot: () => new Promise(resolve => { resolveSnapshot = resolve }), read, installAgentUpdate: vi.fn() },
  } satisfies Pick<DesktopApi, 'subscribe' | 'notifications'>
  const emit = (next: NotificationSnapshot) => { for (const listener of listeners) listener({ type: 'notifications:changed', state: next }) }
  const toastElements = '[data-sonner-toaster][data-x-position=right][data-y-position=top] [data-sonner-toast]'
  try {
    await act(async () => root.render(createElement(StrictMode, null,
      createElement(Toaster, { theme: 'light' }),
      createElement(DesktopNotificationProvider, { api, onOpen: open, children: null }),
    )))
    expect(listeners.size).toBe(1)
    const live = { ...state, revision: 2, items: [task, historical], pendingIds: [task.id] }
    await act(async () => {
      emit(live)
      emit({ ...live, revision: 3 })
      resolveSnapshot(state)
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(read.mock.calls).toEqual([[[task.id]]])
    const toasts = document.querySelectorAll(toastElements)
    expect(toasts).toHaveLength(1)
    expect(toasts[0].textContent).toContain(task.title)
    expect(toasts[0].querySelector('[data-description]')).toBeNull()
    expect(document.body.textContent).not.toContain(historical.title)
    await act(async () => toasts[0].querySelector<HTMLButtonElement>('[data-action]')!.click())
    expect(open).toHaveBeenCalledWith(task.target)
    const nextTask = { ...task, id: 'task:run-2', title: '天气助手 的任务有新结果' }
    const update: DesktopNotice = { ...task, id: 'app:1.0.1', title: 'BoAI 应用可更新', detail: 'v1.0.1', level: 'info', target: { kind: 'app-update' } }
    await act(async () => {
      emit({ ...state, revision: 4, items: [update, nextTask, task, historical], pendingIds: [nextTask.id, update.id] })
      await vi.advanceTimersByTimeAsync(500)
    })
    expect(read.mock.calls[1]).toEqual([[nextTask.id, update.id]])
    expect(document.body.textContent).toContain(nextTask.title)
    expect(document.body.textContent).toContain(update.title)
  } finally {
    await act(async () => root.unmount())
    host.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  }
  expect(listeners.size).toBe(0)
})
