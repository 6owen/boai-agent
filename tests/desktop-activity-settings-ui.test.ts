// @vitest-environment jsdom
/*
 * [INPUT]: Production settings sections with confirmed state and mutation callbacks.
 * [OUTPUT]: 权限冷读行稳定、短时重进零查询、聚焦后台复核、API与失活迟到隔离；原独立开关与草稿回归保持。
 * [POS]: DOM interaction checks; real OS permissions and Electron visual acceptance remain separate.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ActivityRecorderSettings } from '../apps/electron/src/renderer/pages/settings/activity-recorder-settings'
import { DesktopActivityPage } from '../apps/electron/src/renderer/pages/settings/desktop-activity'
import { activityDefaults } from '../packages/runtime/src/modules/desktop-activity/activity-settings'
import type { ActivityStatus } from '../packages/shared/src/domain/desktop-activity'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { initializeSettingsQueries } from '../apps/electron/src/renderer/stores/settings-query'
let host: HTMLDivElement, root: Root
const cleanups: (() => void)[] = []
const update = vi.fn(), permission = vi.fn(), openDirectory = vi.fn()
const initial: ActivityStatus = { settings: activityDefaults, supported: true, permission: false, count: 0, accessibilityPermission: false, monitoring: false, state: 'disabled', screenshotCount: 0, storageBytes: 0, sessionCount: 0, recentSessions: [], outputDirectory: '/test/activity-records' }
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('PointerEvent', MouseEvent); vi.clearAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); cleanups.splice(0).forEach(cleanup => cleanup()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })
const render = (status = initial, busy = false) => act(async () => root.render(createElement(ActivityRecorderSettings, { status, busy, update, permission, openDirectory })))
it('loads without writing or requesting permissions and keeps both new capture switches off', async () => {
  await render()
  expect(update).not.toHaveBeenCalled(); expect(permission).not.toHaveBeenCalled()
  for (const label of ['保存桌面截图', '全局键鼠事件监听']) expect(host.querySelector(`[role="switch"][aria-label="${label}"]`)?.getAttribute('aria-checked')).toBe('false')
})
it('screenshot opt-in changes only the screenshot preference', async () => {
  await render()
  await act(async () => (host.querySelector('[role="switch"][aria-label="保存桌面截图"]') as HTMLElement).click())
  expect(update).toHaveBeenCalledExactlyOnceWith({ saveScreenshots: true })
})
it('uses permission badges without adding recorder status text', async () => {
  await render({ ...initial, settings: { ...activityDefaults, enabled: true }, state: 'permission' })
  expect([...host.querySelectorAll('[data-slot="badge"]')].map(badge => badge.textContent)).toEqual(['未授权', '未授权'])
  expect(host.textContent).not.toContain('记录中')
  const buttons = [...host.querySelectorAll('button')].filter(button => button.textContent === '打开系统设置')
  await act(async () => buttons[1]!.click())
  expect(permission).toHaveBeenCalledExactlyOnceWith('input', true)
})
it('renders granted permissions with the shared badge component', async () => {
  await render({ ...initial, permission: true, accessibilityPermission: true })
  expect([...host.querySelectorAll('[data-slot="badge"]')].map(badge => badge.textContent)).toEqual(['已授权', '已授权'])
})
it('uses generic OCR labels and disables unavailable adapter features without changing preferences', async () => {
  await render({ ...initial, permission: true, capabilities: { platform: 'windows', screenshots: true, inputMonitor: false, ocr: false } })
  expect(host.textContent).not.toContain('macOS')
  expect(host.textContent).not.toContain('Vision')
  expect(host.textContent).not.toContain('辅助功能')
  const ocrSwitch = host.querySelector('[role="switch"][aria-label="OCR 文字识别"]') as HTMLElement
  expect(ocrSwitch.getAttribute('aria-disabled')).toBe('true')
  await act(async () => {
    ocrSwitch.click()
    ocrSwitch.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    ocrSwitch.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }))
  })
  expect((host.querySelector('[aria-label="OCR 语言"]') as HTMLInputElement).disabled).toBe(true)
  expect(update).not.toHaveBeenCalled()
})
it('does not overwrite an unsaved exclude-list draft on status polling', async () => {
  await render()
  const textarea = host.querySelector('textarea')!
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'custom.private.app')
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await render({ ...initial, count: 10, settings: { ...activityDefaults } })
  expect(textarea.value).toBe('custom.private.app')
  await act(async () => textarea.dispatchEvent(new FocusEvent('focusout', { bubbles: true })))
  expect(update).toHaveBeenCalledExactlyOnceWith({ excludedApps: ['custom.private.app'] })
})
it('busy controls cannot dispatch duplicate writes', async () => {
  await render(initial, true)
  await act(async () => (host.querySelector('[role="switch"][aria-label="保存桌面截图"]') as HTMLElement).click())
  expect(update).not.toHaveBeenCalled()
})
it('keeps both permission rows through the first read and does not treat unknown as denied', async () => {
  await act(async () => root.render(createElement(ActivityRecorderSettings, { busy: false, update, permission, openDirectory })))
  const section = [...host.querySelectorAll('section')].find(section => section.querySelector('h3')?.textContent === '系统权限')!
  const rows = [...section.querySelectorAll('.appearance-row')]
  expect(rows).toHaveLength(2)
  expect(rows.map(row => row.firstElementChild?.textContent)).toEqual(['屏幕录制', '辅助功能'])
  expect([...section.querySelectorAll('[data-slot="badge"]')].map(badge => badge.textContent)).toEqual(['读取中', '读取中'])
  expect(section.textContent).not.toContain('申请权限')
  const settingsButtons = [...section.querySelectorAll('button')]
  expect(settingsButtons).toHaveLength(2)
  expect(settingsButtons.every(button => button.disabled)).toBe(true)
  await render({ ...initial, permission: true, accessibilityPermission: true })
  expect([...section.querySelectorAll('.appearance-row')]).toEqual(rows)
  expect([...section.querySelectorAll('button')]).toEqual(settingsButtons)
  expect([...section.querySelectorAll('[data-slot="badge"]')].map(badge => badge.textContent)).toEqual(['已授权', '已授权'])
})
function pendingStatusApi() {
  const replies: ((data: ActivityStatus) => void)[] = []
  const request = vi.fn(() => new Promise(resolve => replies.push(data => resolve({ status: 'succeeded', data }))))
  return { api: { request, subscribe: () => () => {} } as unknown as DesktopApi, request, replies }
}
const badges = () => [...host.querySelectorAll('[data-slot="badge"]')].map(badge => badge.textContent)
it('reuses fresh permissions without a read on re-entry and checks external changes on focus', async () => {
  vi.useFakeTimers()
  const { api, request, replies } = pendingStatusApi()
  cleanups.push(initializeSettingsQueries(api))
  const show = () => act(async () => root.render(createElement(DesktopActivityPage, { api, active: true })))
  await show()
  await act(async () => replies.shift()!({ ...initial, permission: true, accessibilityPermission: true }))
  await act(async () => root.render(null))
  await show()
  expect(request).toHaveBeenCalledTimes(1)
  expect(request).toHaveBeenLastCalledWith('executeApplicationOperation', { operation: 'activity.status', input: {} })
  expect(badges()).toEqual(['已授权', '已授权'])
  expect(host.textContent).not.toContain('读取中')
  await act(async () => { window.dispatchEvent(new Event('focus')); await vi.advanceTimersByTimeAsync(450) })
  expect(request).toHaveBeenCalledTimes(2)
  expect(badges()).toEqual(['已授权', '已授权'])
  await act(async () => replies.shift()!(initial))
  expect(badges()).toEqual(['未授权', '未授权'])
  expect([...host.querySelectorAll('button')].filter(button => button.textContent === '申请权限')).toHaveLength(2)
})
it('does not reuse another API state or cache a response arriving after unmount', async () => {
  const first = pendingStatusApi(), second = pendingStatusApi()
  await act(async () => root.render(createElement(DesktopActivityPage, { api: first.api, active: true })))
  await act(async () => first.replies.shift()!({ ...initial, permission: true, accessibilityPermission: true }))
  await act(async () => root.render(createElement(DesktopActivityPage, { api: second.api, active: true })))
  expect(badges()).toEqual(['读取中', '读取中'])
  await act(async () => root.render(null))
  await act(async () => second.replies.shift()!({ ...initial, permission: true, accessibilityPermission: true }))
  await act(async () => root.render(createElement(DesktopActivityPage, { api: second.api, active: true })))
  expect(badges()).toEqual(['读取中', '读取中'])
  expect(second.request).toHaveBeenCalledTimes(2)
})
it('invalidates a completed write after leaving the page without starting a hidden read', async () => {
  const { api, request, replies } = pendingStatusApi()
  const show = () => act(async () => root.render(createElement(DesktopActivityPage, { api, active: true })))
  await show()
  await act(async () => replies.shift()!(initial))
  await act(async () => (host.querySelector('[role="switch"][aria-label="记录桌面活动"]') as HTMLElement).click())
  expect(request).toHaveBeenCalledTimes(2)
  await act(async () => root.render(null))
  await act(async () => replies.shift()!({ ...initial, settings: { ...initial.settings, enabled: true, revision: 2 } }))
  expect(request).toHaveBeenCalledTimes(2)
  await show()
  expect(request).toHaveBeenCalledTimes(3)
})
