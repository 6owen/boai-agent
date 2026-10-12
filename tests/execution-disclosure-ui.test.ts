// @vitest-environment jsdom
/*
 * [INPUT]: 生产ExecutionFeed、原生工具事件与真实显示方式切换；仅替换分页读取。
 * [OUTPUT]: 缓存恢复后首次点击可收起、显式收起不被运行中默认值覆盖的回归。
 * [POS]: 执行面板状态集成测试，不调用模型或启动Electron。
 * [PROTOCOL]: 修改同步Header和tests/.folder.md。
 */
import { act, createElement, useRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AgentRun } from '../src/shared/domain'
import type { ExecutionEvidence } from '../src/shared/domain/execution'
import type { DesktopApi } from '../src/shared/ipc'
import { nativeActivity } from '../src/runtime/adapters/native-events'
import { ExecutionFeed, type ExecutionView } from '../src/renderer/components/detail-panel/execution-feed'
import { ExecutionContentCache } from '../src/renderer/components/detail-panel/execution-content-cache'

const fixture = vi.hoisted(() => ({ evidence: [] as ExecutionEvidence[] }))
vi.mock('../src/renderer/components/detail-panel/useExecutionWindow', () => ({
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
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })
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
