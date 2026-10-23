// @vitest-environment jsdom
/*
 * [INPUT]: 真实MessageCard、受控系统/浏览器剪贴板。
 * [OUTPUT]: 成功后只弹一次Sonner，失败和未回执不弹；桌面复制不申请浏览器权限，完成回执前不显示成功；宿主失败不伪报复制成功。
 * [POS]: 消息复制组件回归，不访问真实系统剪贴板。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { MessageCard } from '../src/renderer/pages/conversations/-components/message-card'
import type { Message } from '../src/shared/domain'

vi.mock('sonner', () => ({ toast: { success: vi.fn() } }))
vi.mock('../src/renderer/components/common/error-feedback', () => ({ ErrorToast: () => null, showErrorToast: vi.fn() }))
let host: HTMLDivElement, root: Root
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
it.each([false, true])('reports native clipboard success only after acknowledgment (failure=%s)', async failure => {
  let finish!: () => void
  const native = vi.fn(() => new Promise<void>((resolve, reject) => { finish = () => failure ? reject(new Error('clipboard unavailable')) : resolve() }))
  const browser = vi.fn(async () => { throw new DOMException('Permission denied', 'NotAllowedError') })
  vi.stubGlobal('boai', { writeClipboardText: native })
  vi.stubGlobal('navigator', { clipboard: { writeText: browser } })
  const message = { id: 'message', conversationId: 'chat', senderType: 'agent', senderId: 'employee', senderName: '员工', content: '统计结果\n第一行', createdAt: new Date().toISOString(), status: 'completed', sequence: 1 } as Message
  await act(async () => root.render(h(MessageCard, { message, onReply() {}, onTrace() {}, children: message.content })))
  const button = host.querySelector<HTMLButtonElement>('[title="复制消息"]')!
  await act(async () => button.click())
  expect(native).toHaveBeenCalledWith(message.content)
  expect(browser).not.toHaveBeenCalled()
  expect(button.title).toBe('复制消息')
  expect(toast.success).not.toHaveBeenCalled()
  await act(async () => finish())
  expect(button.title).toBe(failure ? '复制消息' : '已复制')
  expect(toast.success).toHaveBeenCalledTimes(failure ? 0 : 1)
  if (!failure) expect(toast.success).toHaveBeenCalledWith('复制成功')
})
