// @vitest-environment jsdom
/*
 * [INPUT]: 员工项目目录直接选择控件、原生选择器回执与表单草稿回调。
 * [OUTPUT]: 直接点击选择目录且不提供清空菜单；原取消/隐藏迟到/禁用守卫保留，本轮按用户要求未运行。
 * [POS]: W2定向组件验收；不启动Electron、模型或个人目录访问。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { ProjectDirectoryPicker } from '../apps/electron/src/renderer/components/employee/project-directory-picker'

let host: HTMLDivElement, root: Root
const originalAnimations = Element.prototype.getAnimations
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.getAnimations = () => []
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); if (originalAnimations) Element.prototype.getAnimations = originalAnimations; else Reflect.deleteProperty(Element.prototype, 'getAnimations'); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const directory = '/Projects/旧项目'
async function choose() {
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
}

test('clicking the employee project opens the native chooser directly and updates only its form draft', async () => {
  const saved = vi.fn(), request = vi.fn(async () => '/Projects/新项目')
  const api = { request } as unknown as DesktopApi
  await act(async () => root.render(h(ProjectDirectoryPicker, { api, directory, onChange: saved })))
  expect(host.textContent).toContain('旧项目')
  await choose()
  expect(saved).toHaveBeenCalledWith('/Projects/新项目')
  expect(request.mock.calls).toEqual([['chooseProjectDirectory', undefined]])
  expect(host.querySelector('[aria-haspopup=menu]')).toBeNull()
  expect(request).toHaveBeenCalledTimes(1)
})

test('canceling the native chooser preserves the current project without a write', async () => {
  const request = vi.fn(async () => null), saved = vi.fn()
  await act(async () => root.render(h(ProjectDirectoryPicker, { api: { request } as unknown as DesktopApi, directory, onChange: saved })))
  await choose()
  expect(request).toHaveBeenCalledTimes(1)
  expect(saved).not.toHaveBeenCalled()
  expect(host.textContent).toContain('旧项目')
})

test('a chooser completing after the conversation hides does not change its project', async () => {
  let finish!: (path: string) => void
  const request = vi.fn(() => new Promise<string>(resolve => { finish = resolve })), saved = vi.fn()
  const props = { api: { request } as unknown as DesktopApi, directory, onChange: saved }
  await act(async () => root.render(h(ProjectDirectoryPicker, { ...props, active: true })))
  await choose()
  await act(async () => root.render(h(ProjectDirectoryPicker, { ...props, active: false })))
  await act(async () => finish('/Projects/迟到目录'))
  expect(request).toHaveBeenCalledTimes(1)
  expect(saved).not.toHaveBeenCalled()
})

test('active execution disables project changes while keeping the current location visible', async () => {
  const request = vi.fn(), saved = vi.fn()
  await act(async () => root.render(h(ProjectDirectoryPicker, { api: { request } as unknown as DesktopApi, directory, disabled: true, onChange: saved })))
  const trigger = host.querySelector<HTMLButtonElement>('button')!
  expect(trigger.disabled).toBe(true)
  expect(trigger.getAttribute('aria-label')).toBe(`项目目录：${directory}`)
  await act(async () => trigger.click())
  expect(request).not.toHaveBeenCalled()
})
