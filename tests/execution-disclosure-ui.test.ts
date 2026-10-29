// @vitest-environment jsdom
/*
 * [OUTPUT]: 无工具/思考事件的失败判断保留原原因并直接展开，不显示没有保存过程的误导文案。
 * [INPUT]: 生产ExecutionFeed、原生工具事件与真实显示方式切换；仅替换分页读取。
 * [OUTPUT]: 正文流式版本竞争自动恢复、更新保留已读文本、缓存命中清除旧错误；真实读取错误保留。
 * [OUTPUT]: 缓存恢复后首次点击可收起、显式收起不被运行中默认值覆盖的回归。
 * [POS]: 执行面板状态集成测试，不调用模型或启动Electron。
 * [PROTOCOL]: 修改同步Header和tests/.folder.md。
 */
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AgentRun } from '../packages/shared/src/domain'
import type { ExecutionEvidence } from '../packages/shared/src/domain/execution'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { nativeActivity } from '../packages/runtime/src/adapters/native-events'
import { ExecutionFeed, type ExecutionView } from '../apps/electron/src/renderer/components/detail-panel/execution-feed'
import { ExecutionNarration } from '../apps/electron/src/renderer/components/detail-panel/ExecutionNarration'
import { ExecutionContentContext } from '../apps/electron/src/renderer/components/detail-panel/ExecutionVirtualList'
import { ExecutionContentCache } from '../apps/electron/src/renderer/components/detail-panel/execution-content-cache'

const fixture = vi.hoisted(() => ({ evidence: [] as ExecutionEvidence[] }))
vi.mock('../apps/electron/src/renderer/components/detail-panel/useExecutionWindow', () => ({
  useExecutionWindow: () => ({ root: useRef(null), evidence: fixture.evidence, loading: false }),
}))

const run: AgentRun = { id: 'run', agentId: 'agent', agentName: 'Codex', conversationId: 'chat', triggerMessageId: 'question', messageId: 'answer', status: 'completed', createdAt: '2026-10-12T00:00:00Z', toolEvents: [] }
const api = { request: async () => [], subscribe: () => () => {} } as unknown as DesktopApi
let host: HTMLDivElement, root: Root, cache: ExecutionContentCache
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  fixture.evidence = ['first', 'second'].map((id, index) => ({
    ...nativeActivity(id, { type: 'commandExecution', command: `echo ${id}`, aggregatedOutput: id, exitCode: 0 }, true),
    agentRunId: run.id, runId: run.id, conversationId: run.conversationId, agentId: run.agentId,
    createdAt: run.createdAt, updatedAt: run.createdAt, sequence: index + 1, revision: 1, contentLength: 0, deferred: false,
  }))
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); cache = new ExecutionContentCache()
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.unstubAllGlobals() })
const render = async (view: ExecutionView = 'rendered', status: AgentRun['status'] = 'completed') => {
  await act(async () => root.render(createElement(ExecutionFeed, { api, run: { ...run, status }, cache, active: true, view })))
}
const group = () => {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(button => button.title === '已完成 2 个步骤')
  expect(button, '生产工具步骤组应可见').toBeDefined()
  return button!
}
const clickGroup = async () => { await act(async () => group().click()) }

test('the first collapse click works after an expanded group is restored from the display cache', async () => {
  await render(); await clickGroup(); expect(group().getAttribute('aria-expanded')).toBe('true')
  await render('raw'); await render()
  expect(group().getAttribute('aria-expanded')).toBe('true')
  await clickGroup()
  expect(group().getAttribute('aria-expanded')).toBe('false')
  await render('raw'); await render()
  expect(group().getAttribute('aria-expanded')).toBe('false')
})

test('a running group stays explicitly collapsed after leaving and returning to the process view', async () => {
  await render('rendered', 'running')
  const trigger = () => host.querySelector<HTMLButtonElement>('[data-slot="collapsible-trigger"]')!
  expect(trigger().getAttribute('aria-expanded')).toBe('true')
  await act(async () => trigger().click())
  expect(trigger().getAttribute('aria-expanded')).toBe('false')
  await render('raw', 'running'); await render('rendered', 'running')
  expect(trigger().getAttribute('aria-expanded')).toBe('false')
})


const narration = (revision: number, text: string) => ({ ...fixture.evidence[0], id: 'body', eventType: 'agent.reasoning.block' as const, revision, payload: { text } })
const contentPage = (event: ExecutionEvidence) => ({ content: JSON.stringify(event), length: JSON.stringify(event).length, revision: event.revision })
const renderNarration = async (evidence: ExecutionEvidence, request: ReturnType<typeof vi.fn>) => {
  await act(async () => root.render(createElement(ExecutionContentContext.Provider, { value: cache },
    createElement(ExecutionNarration, { api: { request } as unknown as DesktopApi, run, evidence: { ...evidence, deferred: true }, preview: '' }))))
}

test('streaming version changes recover automatically without showing a false read failure', async () => {
  vi.useFakeTimers()
  let version = 1, updating = true
  const request = vi.fn(async (_method, query) => {
    if (!updating) return contentPage(narration(20, '流式正文读取成功'))
    return { content: 'unused', length: 30000, revision: ++version, ...(query.offset === 0 ? { next: 24000 } : {}) }
  })
  await renderNarration(narration(1, ''), request)
  expect(request).toHaveBeenCalledTimes(6)
  expect(host.textContent).not.toContain('正文读取失败')
  updating = false
  await act(async () => { await vi.advanceTimersByTimeAsync(300) })
  expect(host.textContent).toContain('流式正文读取成功')
  expect(host.textContent).not.toContain('正文读取失败')
})

test('keeps already loaded text visible while a newer revision is being read', async () => {
  const request = vi.fn(async () => contentPage(narration(1, '已读取的正文')))
  await renderNarration(narration(1, ''), request)
  let resolve!: (value: ReturnType<typeof contentPage>) => void
  request.mockImplementationOnce(() => new Promise(done => { resolve = done }))
  await renderNarration(narration(2, ''), request)
  expect(host.textContent).toContain('已读取的正文')
  await act(async () => resolve(contentPage(narration(2, '更新后的完整正文'))))
  expect(host.textContent).toContain('更新后的完整正文')
})

test('a successful cached revision clears an earlier real read error', async () => {
  const request = vi.fn(async () => { throw new Error('IPC连接断开') })
  await renderNarration(narration(1, ''), request)
  expect(host.textContent).toContain('正文读取失败，重试')
  const next = narration(2, '缓存中的正文')
  cache.set(`body:${run.id}:${next.id}:${next.revision}:${next.contentLength}`, '缓存中的正文')
  await renderNarration(next, request)
  expect(host.textContent).toContain('缓存中的正文')
  expect(host.textContent).not.toContain('正文读取失败')
  expect(request).toHaveBeenCalledTimes(1)
})


test('shows the stored decision failure even when no tool or reasoning events were produced', async () => {
  fixture.evidence = []
  await act(async () => root.render(createElement(ExecutionFeed, { api, run: { ...run, phase: 'decision', status: 'failed', error: '成员判断失败：getaddrinfo ENOTFOUND api.deepseek.com' }, cache, active: true })))
  expect(host.querySelector('details')?.open).toBe(true)
  expect(host.textContent).toContain('getaddrinfo ENOTFOUND api.deepseek.com')
  expect(host.textContent).not.toContain('没有保存原生过程')
  expect(host.textContent).not.toContain('未记录工具或思考步骤')
})
