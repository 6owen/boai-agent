// @vitest-environment jsdom
/*
 * [INPUT]: Production settings sections with confirmed state and mutation callbacks.
 * [OUTPUT]: Independent opt-ins, shared permission Badges, capability-aware OCR fallback and polling-safe drafts.
 * [POS]: DOM interaction checks; real OS permissions and Electron visual acceptance remain separate.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ActivityRecorderSettings } from '../apps/electron/src/renderer/pages/settings/activity-recorder-settings'
import { activityDefaults } from '../packages/runtime/src/modules/desktop-activity/activity-settings'
import type { ActivityStatus } from '../packages/shared/src/domain/desktop-activity'
let host: HTMLDivElement, root: Root
const update = vi.fn(), permission = vi.fn(), openDirectory = vi.fn()
const initial: ActivityStatus = { settings: activityDefaults, supported: true, permission: false, count: 0, accessibilityPermission: false, monitoring: false, state: 'disabled', screenshotCount: 0, storageBytes: 0, sessionCount: 0, recentSessions: [], outputDirectory: '/test/activity-records' }
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('PointerEvent', MouseEvent); vi.clearAllMocks(); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
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
  expect((host.querySelector('[role="switch"][aria-label="OCR 文字识别"]') as HTMLButtonElement).disabled).toBe(true)
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
