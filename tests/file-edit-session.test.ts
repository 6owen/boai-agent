// @vitest-environment jsdom
/*
 * [INPUT]: 生产FileEditSession、真实React生命周期和已受理文件请求；浮层视图适配器只提供交互入口。
 * [OUTPUT]: 关闭重选仍可读取原结果，新选区可以独立提交；不同原件/hash/材料代际不串入旧结果。
 * [POS]: 文件选区编辑会话回归；不调用模型或外部服务。
 * [PROTOCOL]: 修改时同步Header和tests/.folder.md。
 */
import { act, createElement, createRef, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Snapshot } from '../packages/shared/src/domain'
import type { DesktopApi } from '../packages/shared/src/ipc'
import type { SelectionActions } from '../apps/electron/src/renderer/components/ui/selection-actions'
import { FileEditSession, type FileEditHandle } from '../apps/electron/src/renderer/components/detail-panel/file-edit-session'
import type { FileEditRequest, FileEditSource } from '../apps/electron/src/renderer/components/detail-panel/file-edit-state'

// Geometry/animation belong to the real toolbar's browser regression. Keep its
// open, busy and action contract while testing the production session state.
vi.mock('../apps/electron/src/renderer/components/ui/selection-actions', () => ({
  SelectionActions: (props: ComponentProps<typeof SelectionActions>) => props.open ? createElement('section', null,
    createElement('button', { 'data-close': true, onClick: () => props.onOpenChange(false) }, '关闭'),
    createElement('button', { 'data-submit': true, disabled: props.disabled || props.pending || props.busy, onClick: () => props.onAction('精简这段。') }, '精简'),
    props.children) : null,
}))

const source: FileEditSource = { kind: 'material', id: 'material-a', conversationId: 'room-a', name: '计划.md', revision: 1, contentHash: 'a'.repeat(64), parseVersion: 'text-v1' }
const accepted: FileEditRequest = { id: 'request-a', source, agentId: 'employee-a', content: '解释原文。', createdAt: '2026-10-16T00:00:00.000Z', status: 'accepted', messageId: 'request-message' }
const snapshot = { agents: [{ id: 'employee-a', name: '员工', active: true, connectionId: '', modelId: '', executionBackend: { kind: 'codex-local', profileId: 'local' } }], connections: [], conversations: [{ id: source.conversationId, agentIds: ['employee-a'] }] } as unknown as Snapshot
let host: HTMLDivElement, root: Root
beforeEach(() => { vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); host = document.createElement('div'); document.body.append(host); root = createRoot(host) })
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals() })

function fixture(status: 'completed' | 'running' = 'completed') {
  const execute = vi.fn(async () => true)
  const ref = createRef<FileEditHandle>()
  const edits = {
    requests: [accepted], error: '', unavailable: false, readError: '', busy: false, execute, discard: vi.fn(),
    results: [{ request: accepted, works: [], runs: [{ id: 'run-a', phase: 'execution', status }], messageIds: ['reply-a'], artifacts: [] }],
    messages: [{ id: 'reply-a', content: '这是已受理解释请求的回答。' }],
  } as unknown as ComponentProps<typeof FileEditSession>['edits']
  const render = async (current = source) => { await act(async () => root.render(createElement(FileEditSession, { api: {} as DesktopApi, snapshot, edits, conversationId: current.conversationId, source: current, active: true, onResult: vi.fn(), ref }))) }
  const begin = async (quote: string, current = source) => { await act(async () => ref.current!.begin(current, { quote, location: '第 2 行' }, new DOMRect(1, 1, 10, 10))) }
  return { execute, render, begin }
}

test('reselecting after closing restores the accepted analysis response and can submit the new quote', async () => {
  const { execute, render, begin } = fixture()
  await render(); await begin('第一段')
  await act(async () => host.querySelector<HTMLButtonElement>('[data-close]')!.click())
  expect(host.textContent).not.toContain('这是已受理解释请求的回答。')
  await begin('新选中的第二段')
  expect(host.textContent).toContain('这是已受理解释请求的回答。')
  expect(host.querySelector<HTMLButtonElement>('[data-submit]')!.disabled).toBe(false)
  await act(async () => host.querySelector<HTMLButtonElement>('[data-submit]')!.click())
  expect(execute).toHaveBeenCalledOnce()
  const sent = (execute.mock.calls[0] as unknown as [FileEditRequest])[0]
  expect(sent.content).toContain('新选中的第二段')
  expect(sent.content).not.toContain('第一段')
  expect(sent.source).toEqual(source)
  expect(sent.id).not.toBe(accepted.id)
})

test('a fresh selection can submit while the restored previous result is still running', async () => {
  const { execute, render, begin } = fixture('running')
  await render(); await begin('新的独立要求')
  expect(host.textContent).toContain('员工正在处理…')
  expect(host.querySelector<HTMLButtonElement>('[data-submit]')!.disabled).toBe(false)
  await act(async () => host.querySelector<HTMLButtonElement>('[data-submit]')!.click())
  expect(execute).toHaveBeenCalledOnce()
})

test.each([
  { id: 'another-material' }, { contentHash: 'b'.repeat(64) }, { revision: 2 }, { parseVersion: 'binary-v1' as const }, { conversationId: 'another-room' },
])('does not restore another exact source into the selected file: %j', async patch => {
  const { render, begin } = fixture()
  const changed = { ...source, ...patch } as FileEditSource
  await render(changed); await begin('当前原文', changed)
  expect(host.textContent).not.toContain('这是已受理解释请求的回答。')
})
