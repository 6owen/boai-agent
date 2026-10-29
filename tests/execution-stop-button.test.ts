// @vitest-environment jsdom
/*
 * [INPUT]: 生产聊天执行卡片、原Run/occurrence身份及受控IPC。
 * [OUTPUT]: footer停止定时/普通/原生运行，防连点、错误恢复和终态/隐藏禁用回归。
 * [POS]: 执行停止入口组件验证；不调用模型或个人数据。
 * [PROTOCOL]: 变化同步Header与tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { AgentRun } from '../packages/shared/src/domain'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { TooltipProvider } from '../apps/electron/src/renderer/components/ui/tooltip'
import { ChatExecutionCard } from '../apps/electron/src/renderer/pages/conversations/-components/execution-progress'

vi.mock('../apps/electron/src/renderer/components/detail-panel/execution-feed', () => ({ ExecutionFeed: () => null }))
let host: HTMLDivElement, root: Root
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); toast.dismiss(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const button = () => host.querySelector<HTMLButtonElement>('footer button')!
const run = { id: 'original-run', conversationId: 'original-room', agentId: 'employee', agentName: '员工', status: 'running', createdAt: '2026-10-29T12:00:00.000Z' } as AgentRun
async function render(request: ReturnType<typeof vi.fn>, value = run, active = true) {
  await act(async () => root.render(h(TooltipProvider, null, h(ChatExecutionCard, { api: { request } as unknown as DesktopApi, run: value, active }))))
}
it.each([
  ['scheduled', { origin: { kind: 'automation', automationId: 'plan', occurrenceId: 'original-occurrence' } }, 'stopAutomation', { id: 'original-occurrence' }],
  ['ordinary', {}, 'cancelRunExecution', { conversationId: 'original-room', runId: 'original-run' }],
  ['native', { backend: { kind: 'codex-local' } }, 'stopNativeExecution', { conversationId: 'original-room', runId: 'original-run' }],
] as const)('stops only the original %s execution from the chat footer', async (_label, fields, method, input) => {
  const request = vi.fn(async () => undefined)
  await render(request, { ...run, ...fields } as AgentRun)
  expect(button().textContent).toContain('停止本次执行')
  await act(async () => button().click())
  expect(request).toHaveBeenCalledExactlyOnceWith(method, input)
})
it('locks rapid clicks until the same stop request settles and reports failures through Sonner', async () => {
  let reject!: (error: Error) => void
  const request = vi.fn(() => new Promise((_resolve, failure) => { reject = failure })), notify = vi.spyOn(toast, 'error')
  await render(request)
  await act(async () => { button().click(); button().click() })
  expect(request).toHaveBeenCalledTimes(1); expect(button().disabled).toBe(true)
  await act(async () => reject(new Error('停止请求失败')))
  expect(notify).toHaveBeenCalledExactlyOnceWith('停止请求失败'); expect(button().disabled).toBe(false)
  expect(host.textContent).not.toContain('停止请求失败')
})
it('removes the footer when the original run becomes terminal and never stops from a hidden page', async () => {
  const request = vi.fn()
  await render(request, run, false)
  expect(button().disabled).toBe(true)
  await act(async () => button().click())
  expect(request).not.toHaveBeenCalled()
  await render(request, { ...run, status: 'cancelled' })
  expect(host.querySelector('footer')).toBeNull()
})
