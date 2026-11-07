// @vitest-environment jsdom
/*
 * [INPUT]: 生产项目目录菜单、原生选择器回执与受控版本化IPC。
 * [OUTPUT]: 验证显式目录/受管切换保留版本、取消零写、隐藏后迟到目录不写回及活动禁切。
 * [POS]: W2定向组件验收；不启动Electron、模型或个人目录访问。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Conversation } from '../packages/shared/src/domain'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { ConversationProjectPicker } from '../apps/electron/src/renderer/components/employee/project-directory-picker'

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
const room = { id: 'task-session', projectSelection: { mode: 'directory', directory: '/Projects/旧项目', source: 'explicit', revision: 4 } } as Conversation
const calls = (request: ReturnType<typeof vi.fn>, name: string) => request.mock.calls.filter(([method]) => method === name)
async function choose(label: string) {
  await act(async () => host.querySelector<HTMLButtonElement>('button')!.click())
  await act(async () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent === label)!.click())
}

test('directory and managed choices send the displayed version and publish only the committed receipt', async () => {
  const saved = vi.fn()
  const committed = { ...room, projectSelection: { mode: 'directory', directory: '/Projects/新项目', source: 'explicit', revision: 5 } }
  const request = vi.fn(async (method: string) => method === 'chooseProjectDirectory' ? '/Projects/新项目' : committed)
  const api = { request } as unknown as DesktopApi
  await act(async () => root.render(h(ConversationProjectPicker, { api, conversation: room, onSaved: saved })))
  expect(host.textContent).toContain('旧项目')
  await choose('选择项目目录')
  expect(calls(request, 'updateConversationProject')).toEqual([['updateConversationProject', { conversationId: room.id, expectedRevision: 4, mode: 'directory', directory: '/Projects/新项目' }]])
  expect(saved).toHaveBeenCalledWith(committed)
  await act(async () => root.render(h(ConversationProjectPicker, { api, conversation: committed as Conversation, onSaved: saved })))
  await choose('使用 BOAI 受管目录')
  expect(calls(request, 'updateConversationProject').at(-1)).toEqual(['updateConversationProject', { conversationId: room.id, expectedRevision: 5, mode: 'managed' }])
})

test('canceling the native chooser preserves the current project without a write', async () => {
  const request = vi.fn(async () => null), saved = vi.fn()
  await act(async () => root.render(h(ConversationProjectPicker, { api: { request } as unknown as DesktopApi, conversation: room, onSaved: saved })))
  await choose('选择项目目录')
  expect(request).toHaveBeenCalledTimes(1)
  expect(saved).not.toHaveBeenCalled()
  expect(host.textContent).toContain('旧项目')
})

test('a chooser completing after the conversation hides does not change its project', async () => {
  let finish!: (path: string) => void
  const request = vi.fn(() => new Promise<string>(resolve => { finish = resolve })), saved = vi.fn()
  const props = { api: { request } as unknown as DesktopApi, conversation: room, onSaved: saved }
  await act(async () => root.render(h(ConversationProjectPicker, { ...props, active: true })))
  await choose('选择项目目录')
  await act(async () => root.render(h(ConversationProjectPicker, { ...props, active: false })))
  await act(async () => finish('/Projects/迟到目录'))
  expect(request).toHaveBeenCalledTimes(1)
  expect(saved).not.toHaveBeenCalled()
})

test('active execution disables project changes while keeping the current location visible', async () => {
  const request = vi.fn(), saved = vi.fn()
  await act(async () => root.render(h(ConversationProjectPicker, { api: { request } as unknown as DesktopApi, conversation: room, disabled: true, onSaved: saved })))
  const trigger = host.querySelector<HTMLButtonElement>('button')!
  expect(trigger.disabled).toBe(true)
  expect(trigger.getAttribute('aria-label')).toBe('项目目录：旧项目')
  await act(async () => trigger.click())
  expect(request).not.toHaveBeenCalled()
})
