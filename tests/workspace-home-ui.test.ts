// @vitest-environment jsdom
/*
 * [INPUT]: 工具开始页、真实共享控件与受控桌面回执。
 * [OUTPUT]: 四项入口使用当前员工；群聊明确选择，浏览器去重/失败恢复，隐藏或成员移除不接受迟到终端导航。
 * [POS]: 工作区工具入口组件回归，不创建真实终端或浏览器窗口。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与tests/.folder.md。
 */
import { act, createElement as h, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import type { Snapshot } from '../packages/shared/src/domain'
import type { DesktopApi } from '../packages/shared/src/ipc'
import type { TerminalInfo } from '../packages/shared/src/domain/workspace-tools'
import { WorkspaceHome } from '../apps/electron/src/renderer/components/detail-panel/workspace-home'

let root: Root, host: HTMLDivElement
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.getAnimations = () => []
  Element.prototype.scrollIntoView = () => {}
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

const snapshot = (group = false) => ({
  agents: [{ id: 'a', name: '员工甲' }, { id: 'b', name: '员工乙' }],
  conversations: [{ id: 'room', kind: group ? 'group' : 'direct', agentIds: group ? ['a', 'b'] : ['a'] }],
}) as Snapshot
const terminal: TerminalInfo = { id: 'pty', title: '终端', employeeId: 'a', conversationId: 'room', cwd: '/workspace', createdAt: '', status: 'running' }
const button = (label: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === label)!
const render = (props: ComponentProps<typeof WorkspaceHome>) => act(async () => root.render(h(WorkspaceHome, props)))
function setup(group = false, respond?: (method: string, input: Record<string, unknown>) => Promise<unknown>) {
  const request = vi.fn(async (method: string, input: Record<string, unknown>) => {
    if (method === 'workspaceTerminal' && input.action === 'list') return { kind: 'listed', terminals: [] }
    if (respond) return respond(method, input)
    throw new Error(`Unexpected request: ${method}`)
  })
  const props = { api: { request } as unknown as DesktopApi, snapshot: snapshot(group), active: true, conversationId: 'room', onTasks: vi.fn(), onKnowledge: vi.fn(), onTerminal: vi.fn() }
  return { props, request }
}

it('opens tasks and knowledge for the chat employee without creating terminals or browser windows on mount', async () => {
  const { props, request } = setup()
  await render(props)
  expect([...host.querySelectorAll('.workspace-home-actions button')].map(item => item.textContent)).toEqual(['任务', '终端', '知识资料', '浏览器'])
  expect(request.mock.calls).toEqual([['workspaceTerminal', { action: 'list', scope: { employeeId: 'a', conversationId: 'room' } }]])
  await act(async () => { button('任务').click(); button('知识资料').click() })
  expect(props.onTasks.mock.calls).toEqual([['a']])
  expect(props.onKnowledge.mock.calls).toEqual([['a']])
  expect(props.onTerminal).not.toHaveBeenCalled()
  expect(request).toHaveBeenCalledTimes(1)
})

it('requires a group employee for employee tools, then routes both entries to the explicitly selected member', async () => {
  const { props, request } = setup(true)
  await render(props)
  for (const label of ['任务', '终端', '知识资料']) expect(button(label).disabled).toBe(true)
  expect(button('浏览器').disabled).toBe(false)
  expect(request).not.toHaveBeenCalled()
  await act(async () => host.querySelector<HTMLButtonElement>('[role=combobox]')!.click())
  const option = [...document.querySelectorAll<HTMLElement>('[role=option]')].find(item => item.textContent === '员工乙')!
  expect(option).toBeDefined()
  await act(async () => { option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); option.click() })
  await act(async () => { button('任务').click(); button('知识资料').click() })
  expect(props.onTasks.mock.calls).toEqual([['b']])
  expect(props.onKnowledge.mock.calls).toEqual([['b']])
  expect(request.mock.calls).toEqual([['workspaceTerminal', { action: 'list', scope: { employeeId: 'b', conversationId: 'room' } }]])
})

it('creates one terminal for repeated clicks and opens only the host-confirmed instance', async () => {
  let complete!: (result: unknown) => void
  const { props, request } = setup(false, async () => new Promise(resolve => { complete = resolve }))
  await render(props)
  await act(async () => { button('终端').click(); button('终端').click() })
  const creates = request.mock.calls.filter(([, input]) => input.action === 'create')
  expect(creates).toHaveLength(1)
  expect(creates[0]).toEqual(['workspaceTerminal', { action: 'create', requestId: expect.any(String), scope: { employeeId: 'a', conversationId: 'room' } }])
  expect(props.onTerminal).not.toHaveBeenCalled()
  await act(async () => complete({ kind: 'created', terminal }))
  expect(props.onTerminal.mock.calls).toEqual([[terminal]])
})

it.each(['hidden', 'removed'] as const)('does not navigate from a late terminal reply after the page is %s', async change => {
  let complete!: (result: unknown) => void
  const { props } = setup(false, async () => new Promise(resolve => { complete = resolve }))
  await render(props)
  await act(async () => button('终端').click())
  await render({ ...props, active: change !== 'hidden', snapshot: change === 'removed' ? { ...props.snapshot, agents: [] } : props.snapshot })
  await act(async () => complete({ kind: 'created', terminal }))
  expect(props.onTerminal).not.toHaveBeenCalled()
})

it('opens the global browser once while pending and allows another explicit attempt after a reported failure', async () => {
  const failure = vi.spyOn(toast, 'error').mockImplementation(() => 'toast')
  let reject!: (error: Error) => void
  const { props, request } = setup(true, async () => new Promise((_, fail) => { reject = fail }))
  await render(props)
  await act(async () => { button('浏览器').click(); button('浏览器').click() })
  expect(request.mock.calls).toEqual([['openBrowser', {}]])
  await act(async () => reject(new Error('无法打开浏览器')))
  expect(failure).toHaveBeenCalledWith('无法打开浏览器')
  expect(button('浏览器').disabled).toBe(false)
  request.mockResolvedValueOnce({ isVisible: true })
  await act(async () => button('浏览器').click())
  expect(request.mock.calls).toEqual([['openBrowser', {}], ['openBrowser', {}]])
  expect(props.onTasks).not.toHaveBeenCalled()
  expect(props.onKnowledge).not.toHaveBeenCalled()
})
