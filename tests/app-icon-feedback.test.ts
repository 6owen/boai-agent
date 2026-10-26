// @vitest-environment jsdom
/*
 * [INPUT]: 实际图标状态组件与逐目标Main回执。
 * [OUTPUT]: 开发/安装状态不渲染DOM文案，失败Sonner及重试保留、成功无Toast或空占位、迟到序号隔离。
 * [POS]: 外观图标状态组件回归，非真实菜单栏验证。
 * [PROTOCOL]: 变化同步Header和tests/.folder.md。
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { toast } from 'sonner'
import type { AppIconStatus } from '../packages/shared/src/appearance'
import { AppIconFeedback, acceptAppIconStatus } from '../apps/electron/src/renderer/pages/settings/app-icon-feedback'
let host: HTMLDivElement, root: Root
const status = (): AppIconStatus => ({ sequence: 1, platform: 'macos', environment: 'development', requestedId: 'avatar-bear', pending: false, dock: { appliedId: 'avatar-bear', error: null }, tray: { supported: true, available: true, state: 'applied', appliedId: 'avatar-bear', fallback: null, error: null }, installed: { available: false, appliedId: null, error: null } })
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.spyOn(toast, 'error').mockReturnValue('error'); vi.spyOn(toast, 'success').mockReturnValue('success'); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
test('开发版不显示Dock/托盘状态文案，部分失败保留Sonner与原重试', async () => {
  const value = status(), retry = vi.fn(); value.tray = { ...value.tray, appliedId: 'avatar-cat', state: 'failed', error: '保留原图标' }
  await act(async () => root.render(createElement(AppIconFeedback, { status: value, onRetry: retry })))
  expect(host.textContent).toBe('重试应用'); expect(host.querySelector('[role="status"]')).toBeNull()
  expect(toast.error).toHaveBeenCalledWith('托盘：保留原图标'); expect(toast.success).not.toHaveBeenCalled()
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click()); expect(retry).toHaveBeenCalledTimes(1)
})
test('安装图标在途不显示状态或空占位，安装失败和备用图标仅通过Sonner反馈', async () => {
  const value = status(); value.environment = 'installed'; value.pending = true; value.installed.available = true
  await act(async () => root.render(createElement(AppIconFeedback, { status: value, onRetry() {} })))
  expect(host.childElementCount).toBe(0)
  expect(toast.error).not.toHaveBeenCalled()
  value.pending = false; value.installed.error = '安装失败'; value.tray = { ...value.tray, appliedId: null, fallback: 'builtin', error: '备用图标', state: 'failed' }
  await act(async () => root.render(createElement(AppIconFeedback, { status: { ...value }, onRetry() {} })))
  expect(host.textContent).toBe('重试应用'); expect(host.querySelector('[role="status"]')).toBeNull()
  expect(toast.error).toHaveBeenCalledWith('托盘：备用图标；安装图标：安装失败'); expect(toast.success).not.toHaveBeenCalled()
})
test('全部成功没有成功Toast，较早查询/重试回执不覆盖新状态', async () => {
  const next = { ...status(), sequence: 8 }, previous = { ...status(), sequence: 3, requestedId: 'avatar-cat' }
  expect(acceptAppIconStatus(next, previous)).toBe(next)
  expect(acceptAppIconStatus(previous, next)).toBe(next)
  await act(async () => root.render(createElement(AppIconFeedback, { status: next, onRetry() {} })))
  expect(host.childElementCount).toBe(0); expect(toast.success).not.toHaveBeenCalled(); expect(toast.error).not.toHaveBeenCalled()
})
