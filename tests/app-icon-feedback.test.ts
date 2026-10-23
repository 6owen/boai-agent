// @vitest-environment jsdom
/*
 * [INPUT]: 实际图标状态组件与逐目标Main回执。
 * [OUTPUT]: 开发版托盘失败可见、成功无Toast、部分失败不报全成功及迟到序号隔离。
 * [POS]: 外观图标状态组件回归，非真实菜单栏验证。
 * [PROTOCOL]: 变化同步Header和tests/.folder.md。
 */
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { toast } from 'sonner'
import type { AppIconStatus } from '../src/shared/appearance'
import { AppIconFeedback, acceptAppIconStatus } from '../src/renderer/pages/settings/app-icon-feedback'
let host: HTMLDivElement, root: Root
const status = (): AppIconStatus => ({ sequence: 1, platform: 'macos', environment: 'development', requestedId: 'avatar-bear', pending: false, dock: { appliedId: 'avatar-bear', error: null }, tray: { supported: true, available: true, state: 'applied', appliedId: 'avatar-bear', fallback: null, error: null }, installed: { available: false, appliedId: null, error: null } })
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.spyOn(toast, 'error').mockReturnValue('error'); vi.spyOn(toast, 'success').mockReturnValue('success'); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
test('开发版正确显示Dock已更新/托盘未更新和原重试，不能只因Dock成功隐藏错误', async () => {
  const value = status(), retry = vi.fn(); value.tray = { ...value.tray, appliedId: 'avatar-cat', state: 'failed', error: '保留原图标' }
  await act(async () => root.render(createElement(AppIconFeedback, { status: value, onRetry: retry })))
  expect(host.textContent).toContain('Dock：已更新；托盘：未更新'); expect(host.textContent).not.toContain('安装图标')
  expect(toast.error).toHaveBeenCalledWith('托盘：保留原图标'); expect(toast.success).not.toHaveBeenCalled()
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click()); expect(retry).toHaveBeenCalledTimes(1)
})
test('安装图标在途/失败不否认已更新的运行态，备用B不显示已更新用户选择', async () => {
  const value = status(); value.environment = 'installed'; value.pending = true; value.installed.available = true
  await act(async () => root.render(createElement(AppIconFeedback, { status: value, onRetry() {} })))
  expect(host.textContent).toContain('Dock：已更新；托盘：已更新；安装图标：正在更新…')
  expect(toast.error).not.toHaveBeenCalled()
  value.pending = false; value.installed.error = '安装失败'; value.tray = { ...value.tray, appliedId: null, fallback: 'builtin', error: '备用图标', state: 'failed' }
  await act(async () => root.render(createElement(AppIconFeedback, { status: { ...value }, onRetry() {} })))
  expect(host.textContent).toContain('托盘：未更新'); expect(host.textContent).toContain('托盘当前使用备用图标')
  expect(host.textContent).toContain('安装图标：未更新')
})
test('全部成功没有成功Toast，较早查询/重试回执不覆盖新状态', async () => {
  const next = { ...status(), sequence: 8 }, previous = { ...status(), sequence: 3, requestedId: 'avatar-cat' }
  expect(acceptAppIconStatus(next, previous)).toBe(next)
  expect(acceptAppIconStatus(previous, next)).toBe(next)
  await act(async () => root.render(createElement(AppIconFeedback, { status: next, onRetry() {} })))
  expect(host.querySelector('button')).toBeNull(); expect(toast.success).not.toHaveBeenCalled(); expect(toast.error).not.toHaveBeenCalled()
})
