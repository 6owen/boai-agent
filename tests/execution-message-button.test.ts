// @vitest-environment jsdom
/*
 * [INPUT]: 生产执行卡片定位按钮、受控IPC和Sonner。
 * [OUTPUT]: 固定消息导航、删除后toast和失效请求不跳页的组件回归。
 * [POS]: 执行过程到聊天记录定位；不启动E2E或外部模型。
 * [PROTOCOL]: 变化同步Header与tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { DesktopApi } from '../src/shared/ipc'
import { TooltipProvider } from '../src/renderer/components/ui/tooltip'
import { ExecutionMessageButton } from '../src/renderer/components/detail-panel/execution-message-button'

let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); toast.dismiss(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const button = () => host.querySelector<HTMLButtonElement>('[aria-label="定位聊天记录"]')!
async function setup(request: ReturnType<typeof vi.fn>) {
  const onNavigate = vi.fn(), api = { request } as unknown as DesktopApi
  const render = async (active: boolean) => act(async () => root.render(h(TooltipProvider, null, h(ExecutionMessageButton, { api, run: { id: 'run', conversationId: 'isolated-task' }, active, onNavigate }))))
  await render(true)
  return { onNavigate, render }
}
it('navigates to the checked public message instead of the isolated execution room', async () => {
  const request = vi.fn(async () => ({ conversationId: 'employee-main', messageId: 'published-prompt' })), f = await setup(request)
  await act(async () => button().click())
  expect(request).toHaveBeenCalledExactlyOnceWith('resolveExecutionMessage', { conversationId: 'isolated-task', runId: 'run' })
  expect(f.onNavigate).toHaveBeenCalledExactlyOnceWith('employee-main', 'published-prompt', expect.any(Function))
  expect(f.onNavigate.mock.calls[0][2]()).toBe(true)
})
it('only uses Sonner when the original chat message has been deleted', async () => {
  const notify = vi.spyOn(toast, 'error'), f = await setup(vi.fn(async () => { throw new Error('对应聊天记录已删除或不可用') }))
  await act(async () => button().click())
  expect(notify).toHaveBeenCalledExactlyOnceWith('对应聊天记录已删除或不可用')
  expect(f.onNavigate).not.toHaveBeenCalled()
  expect(host.textContent).not.toContain('已删除')
  expect(button().disabled).toBe(false)
})
it('ignores a late lookup after the execution panel becomes inactive', async () => {
  let resolve!: (target: { conversationId: string; messageId: string }) => void
  const f = await setup(vi.fn(() => new Promise(done => { resolve = done })))
  await act(async () => button().click())
  expect(button().disabled).toBe(true)
  await f.render(false)
  await act(async () => resolve({ conversationId: 'employee-main', messageId: 'old-message' }))
  expect(f.onNavigate).not.toHaveBeenCalled()
})
