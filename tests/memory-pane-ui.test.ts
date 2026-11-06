// @vitest-environment jsdom
/*
 * [INPUT]: 生产MemoryPane、真实Select Portal、编辑守卫和受控版本化IPC。
 * [OUTPUT]: 验证离区自动保存、Portal不误提交、在途去重/失败草稿、模型必填，以及清空明确确认和加载布局稳定。
 * [POS]: 组件回归；不读取个人记忆、不调用模型、不运行E2E。
 * [PROTOCOL]: 修改同步Header和tests/.folder.md。
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { DigitalAgent, EmployeeMemorySettings, MemoryView, Snapshot } from '../packages/shared/src/domain'
import type { DesktopApi } from '../packages/shared/src/ipc'
import { GuardContext, showErrorToast } from '../apps/electron/src/renderer/components/common'
import { useEditorGuard } from '../apps/electron/src/renderer/components/common/use-editor-guard'
import { MemoryPane } from '../apps/electron/src/renderer/components/employee/memory-pane'

vi.mock('../apps/electron/src/renderer/components/common/error-feedback', () => ({ ErrorToast: () => null, showErrorToast: vi.fn() }))
const agent = { id: 'alice', name: 'Alice', active: true, executionBackend: { kind: 'mastra-model' } } as DigitalAgent
const snapshot: Snapshot = { agents: [agent], conversations: [], resources: [], approvals: [], dataPath: '/isolated/memory-pane', connections: ['a', 'b'].map(id => ({ id, name: `连接${id}`, provider: 'openai-compatible', baseUrl: 'https://example.test/v1', defaultModel: '', hasApiKey: false })) }
let host: HTMLDivElement, root: Root, api: DesktopApi, view: MemoryView
let request: ReturnType<typeof vi.fn<(method: string, input?: unknown) => Promise<unknown>>>
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.getAnimations = () => []
  view = { entries: [], epoch: 12, namespace: 'alice', managed: { backend: 'mastra', semanticRecall: true,
    settings: { agentId: agent.id, revision: 7, embedding: { connectionId: 'a', modelId: 'embed-old' } },
    documents: [{ resourceId: 'alice-private', version: 'v1', workingMemory: '已保存资料', observations: '已整理观察', conversationIds: [] }],
  } }
  request = vi.fn(async (method, input) => {
    if (method === 'getMemory') return structuredClone(view)
    if (method === 'configureMemory') {
      const value = input as { expectedRevision: number; embedding: EmployeeMemorySettings['embedding'] | null }
      expect(value.expectedRevision).toBe(view.managed!.settings!.revision)
      const settings = { agentId: agent.id, revision: value.expectedRevision + 1, embedding: value.embedding ?? undefined }
      view.managed!.settings = settings
      return settings
    }
    if (method === 'clearMemory') { view.managed!.documents = []; return structuredClone(view) }
    throw new Error(`Unexpected request: ${method}`)
  })
  api = { request, subscribe: () => () => {} } as unknown as DesktopApi
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks() })
function Page({ active }: { active: boolean }) {
  const { guard, confirmation } = useEditorGuard({ reset() {} })
  return h(GuardContext.Provider, { value: guard }, h(MemoryPane, { api, agent, snapshot, active }), confirmation)
}
const render = (active = true) => act(async () => root.render(h(Page, { active })))
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === label)!
const calls = (method: string) => request.mock.calls.filter(([name]) => name === method)
const outside = () => act(async () => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })))
async function choose(label: string) {
  await act(async () => document.querySelector<HTMLButtonElement>('[role="combobox"][aria-label="Embedding 连接"]')!.click())
  await act(async () => {
    const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent === label)!
    option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); option.click()
  })
}
async function model(value: string) {
  await act(async () => {
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Embedding 模型"]')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

test('loading never flashes legacy filters and refreshed memory cards retain their DOM', async () => {
  let finish!: (value: MemoryView) => void
  request.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
  await render()
  expect([...host.querySelectorAll('h2')].map(item => item.textContent)).toEqual(['记忆范围', '语义检索', '记忆文件'])
  expect(host.textContent).not.toContain('记忆筛选')
  await act(async () => finish(structuredClone(view)))
  const working = host.querySelector('[role="region"][aria-label="Working Memory"]')!
  const observation = host.querySelector('[role="region"][aria-label="Observational Memory"]')!
  expect(working.parentElement).toBe(observation.parentElement)
  expect(host.querySelector('details')).toBeNull()
  expect(host.textContent).not.toContain('Mastra Memory')
  const before = calls('getMemory').length; await render(false)
  expect(calls('getMemory')).toHaveLength(before)
  await render()
  expect(host.querySelector('[role="region"][aria-label="Working Memory"]')).toBe(working)
})

test('select portal edits stay local until outside, saves are deduplicated and use the returned revision', async () => {
  await render()
  await choose('连接b'); await choose('连接a'); await choose('连接b')
  expect(calls('configureMemory')).toHaveLength(0)
  let finish!: () => void
  const original = request.getMockImplementation()!
  request.mockImplementation((method, input) => method === 'configureMemory' ? new Promise(resolve => { finish = () => { void original(method, input).then(resolve) } }) : original(method, input))
  await outside(); await outside()
  expect(calls('configureMemory')).toEqual([['configureMemory', { agentId: agent.id, expectedRevision: 7, embedding: { connectionId: 'b', modelId: 'embed-old' } }]])
  await act(async () => finish())
  request.mockImplementation(original)
  await choose('不使用向量检索'); await outside()
  expect(calls('configureMemory').at(-1)).toEqual(['configureMemory', { agentId: agent.id, expectedRevision: 8, embedding: null }])
  expect([...host.querySelectorAll('button')].some(item => item.textContent === '保存')).toBe(false)
})

test('failed autosave keeps the model draft and permits an explicit outside retry', async () => {
  await render(); await model('embed-new')
  const original = request.getMockImplementation()!
  request.mockImplementation((method, input) => method === 'configureMemory' ? Promise.reject(new Error('保存暂时失败')) : original(method, input))
  await outside()
  expect(showErrorToast).toHaveBeenCalledWith('保存暂时失败')
  expect(document.querySelector<HTMLInputElement>('input[aria-label="Embedding 模型"]')!.value).toBe('embed-new')
  request.mockImplementation(original); await outside()
  expect(view.managed!.settings).toMatchObject({ revision: 8, embedding: { connectionId: 'a', modelId: 'embed-new' } })
  expect(host.querySelector('[role="alert"]')).toBeNull()
})

test('a new connection requires a model and keyboard departure saves the completed selection', async () => {
  view.managed!.settings!.embedding = undefined
  await render(); await choose('连接a'); await outside()
  expect(calls('configureMemory')).toHaveLength(0)
  expect(showErrorToast).toHaveBeenCalledWith('请填写支持向量检索的模型名称')
  await model('embed-first')
  await act(async () => document.body.dispatchEvent(new FocusEvent('focusin', { bubbles: true })))
  expect(view.managed!.settings).toMatchObject({ revision: 8, embedding: { connectionId: 'a', modelId: 'embed-first' } })
  await render(false); await outside()
  expect(calls('configureMemory')).toHaveLength(1)
})

test('the destructive menu requires confirmation and cancel performs no memory deletion', async () => {
  await render()
  const open = () => act(async () => document.querySelector<HTMLButtonElement>('button[aria-label="记忆文件操作"]')!.click())
  const clear = () => act(async () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent === '清空记忆')!.click())
  await open()
  expect([...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent === '清空记忆')!.getAttribute('data-variant')).toBe('destructive')
  await clear(); expect(calls('clearMemory')).toHaveLength(0)
  await act(async () => button('取消').click()); expect(calls('clearMemory')).toHaveLength(0)
  await open(); await clear(); await act(async () => button('清空').click())
  expect(calls('clearMemory')).toEqual([['clearMemory', { agentId: agent.id, scope: 'employee', expectedEpoch: 12, requestId: expect.any(String) }]])
  expect(host.textContent).not.toContain('已保存资料')
})
