// @vitest-environment jsdom
/*
 * [INPUT]: 生产聊天执行卡片、原Run/occurrence身份及受控IPC。
 * [OUTPUT]: 顶部图标停止定时/普通/原生运行，防连点、错误恢复和隐藏禁用；停止保留外层收起/展开选择及固定耗时。
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
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('scrollTo', vi.fn()); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); toast.dismiss(); vi.restoreAllMocks(); vi.unstubAllGlobals() })
const button = () => host.querySelector<HTMLButtonElement>('header [aria-label="停止本次执行"]')!
const run: AgentRun = { id: 'original-run', conversationId: 'original-room', triggerMessageId: 'question', messageId: 'answer', agentId: 'employee', agentName: '员工', status: 'running', createdAt: '2026-10-29T12:00:00.000Z', toolEvents: [] }
async function render(request: ReturnType<typeof vi.fn>, value = run, active = true) {
  await act(async () => root.render(h(TooltipProvider, null, h(ChatExecutionCard, { api: { request } as unknown as DesktopApi, run: value, active }))))
}
it.each([
  ['scheduled', { origin: { kind: 'automation', automationId: 'plan', occurrenceId: 'original-occurrence' } }, 'stopAutomation', { id: 'original-occurrence' }],
  ['ordinary', {}, 'cancelRunExecution', { conversationId: 'original-room', runId: 'original-run' }],
  ['native', { backend: { kind: 'codex-local' } }, 'stopNativeExecution', { conversationId: 'original-room', runId: 'original-run' }],
] as const)('stops only the original %s execution from the chat header', async (_label, fields, method, input) => {
  const request = vi.fn(async () => undefined)
  await render(request, { ...run, ...fields } as AgentRun)
  expect(button().getAttribute('aria-label')).toBe('停止本次执行')
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
it('removes the stop button when the original run becomes terminal and never stops from a hidden page', async () => {
  const request = vi.fn()
  await render(request, run, false)
  expect(button().disabled).toBe(true)
  await act(async () => button().click())
  expect(request).not.toHaveBeenCalled()
  await render(request, { ...run, status: 'cancelled' })
  expect(button()).toBeNull()
})

it.each([
  ['cancelled', false], ['cancelled', true], ['interrupted', false], ['interrupted', true],
] as const)('preserves expansion when stopping becomes %s (expanded=%s)', async (status, expanded) => {
  const request = vi.fn(async () => undefined)
  await render(request)
  const toggle = () => host.querySelector<HTMLButtonElement>('header [aria-expanded]')!
  if (expanded) await act(async () => toggle().click())
  await act(async () => button().click())
  expect(request).toHaveBeenCalledExactlyOnceWith('cancelRunExecution', { conversationId: run.conversationId, runId: run.id })
  await render(request, { ...run, status, error: '用户停止执行', finishedAt: '2026-10-29T12:00:03.000Z' })
  expect(button()).toBeNull()
  expect(toggle().getAttribute('aria-expanded')).toBe(String(expanded))
  expect(host.querySelector<HTMLElement>('[data-slot="chat-execution-viewport"]')?.dataset.collapsed).toBe(String(!expanded))
  expect(host.querySelector('header [role="status"]')?.textContent).toBe('已停止')
  expect(host.querySelector('[data-slot="execution-elapsed"]')?.textContent?.trim()).toBe('3.0s')
  await act(async () => toggle().click())
  expect(toggle().getAttribute('aria-expanded')).toBe(String(!expanded))
})
