// @vitest-environment jsdom
/*
 * [INPUT]: 群聊资料页/高级配置/共用双栏成员选择器与受控IPC。
 * [OUTPUT]: 名称局部保存/并发草稿、成员回填/取消/版本提交、选择人数限制和高级配置草稿隔离的前端回归。
 * [POS]: 群聊就地配置交互测试，不运行E2E或真实模型。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Conversation, ConversationInput, DigitalAgent, Snapshot } from '../src/shared/domain'
import type { DesktopApi } from '../src/shared/ipc'
import { GuardContext } from '../src/renderer/components/common'
import { useEditorGuard } from '../src/renderer/components/common/use-editor-guard'
import { GroupProfile } from '../src/renderer/pages/contacts/group-profile'
import { GroupMemberDialog } from '../src/renderer/components/employee/group-member-selection'

const agents = ['Alice', 'Bob', 'Carol'].map((name, index) => ({ id: `a${index}`, name, role: '研究员', active: true, color: '#438b80' } as DigitalAgent))
const initial = { id: 'g', kind: 'group', title: '原群名', agentIds: ['a0', 'a1'], mode: 'mention', sharedKnowledgeIds: [], memoryScope: 'conversation', configVersion: 4 } as unknown as Conversation
let committed: Conversation, host: HTMLDivElement, root: Root, api: DesktopApi, request: ReturnType<typeof vi.fn<(method: string, input?: unknown) => Promise<unknown>>>
const snapshot = () => ({ agents, conversations: [committed], connections: [], resources: [{ id: 'k', kind: 'knowledge', name: '共享资料', description: '知识说明' }] } as unknown as Snapshot)
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.getAnimations = () => []
  committed = { ...initial }; localStorage.clear()
  request = vi.fn(async (method, input) => {
    if (method === 'snapshot') return snapshot()
    if (method === 'createConversation') {
      const { expectedConfigVersion, ...value } = input as ConversationInput
      if (expectedConfigVersion !== committed.configVersion) throw new Error('version conflict')
      committed = { ...committed, ...value, configVersion: (committed.configVersion ?? 0) + 1 } as Conversation
      return committed
    }
    throw new Error(`Unexpected request: ${method}`)
  })
  api = { request, subscribe: () => () => {} } as unknown as DesktopApi
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === text)!
const click = async (label: string) => act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click())
const title = () => host.querySelector<HTMLElement>('[role=textbox][aria-label="群聊名称"]')!
const saves = () => request.mock.calls.filter(([method]) => method === 'createConversation')
async function rename(value: string) { await act(async () => { title().textContent = value; title().dispatchEvent(new Event('input', { bubbles: true })); title().focus(); title().blur() }) }
async function toggle(name: string) {
  const label = [...document.querySelectorAll<HTMLElement>('label')].find(item => item.textContent?.includes(name))!
  await act(async () => label.querySelector<HTMLButtonElement>('[role=checkbox]')!.click())
}
async function fixture() {
  const refresh = vi.fn(), onMessage = vi.fn(), saved = vi.fn()
  function Page() {
    const [data, setData] = useState(snapshot), [advanced, setAdvanced] = useState(false), [key, setKey] = useState(0)
    const { guard, confirmation } = useEditorGuard({ reset: () => setKey(value => value + 1) })
    return h(GuardContext.Provider, { value: guard }, h(GroupProfile, { key, api, snapshot: data, group: data.conversations[0]!, active: true, busy: false,
      onGroupSaved: result => { saved(result); setData(previous => ({ ...previous, conversations: [result] })) }, refresh: async () => { refresh(); setData(snapshot()) },
      onMessage, advancedOpen: advanced, onAdvancedChange: setAdvanced, onOpenAgent() {}, onConversation() {},
    }), confirmation)
  }
  await act(async () => root.render(h(Page)))
  return { refresh, saved, onMessage }
}

test('group title keeps its original heading and saves locally without refreshing or losing newer typing', async () => {
  committed = { ...committed, memoryContextRef: { kind: 'work', id: 'w' } }
  let finish!: () => Promise<void>
  const original = request.getMockImplementation()!
  let first = true
  request.mockImplementation((method, input) => method === 'createConversation' && first ? (first = false, new Promise(resolve => { finish = async () => resolve(await original(method, input)) })) : original(method, input))
  const f = await fixture(), heading = title(), container = host.querySelector('.contact-document')!
  await rename('第一次改名')
  expect(title()).toBe(heading); expect(title().tagName).toBe('H1')
  expect(container.hasAttribute('data-identity-saving')).toBe(true)
  expect(button('高级配置').disabled).toBe(true)
  await rename('保存期间改名')
  await act(async () => finish())
  expect(saves()).toHaveLength(2)
  expect(saves()[1]?.[1]).toMatchObject({ id: 'g', title: '保存期间改名', expectedConfigVersion: 5, agentIds: ['a0', 'a1'], mode: 'mention', memoryScope: 'conversation', memoryContextRef: { kind: 'work', id: 'w' } })
  expect(title()).toBe(heading); expect(title().textContent).toBe('保存期间改名')
  expect(host.querySelector('.contact-document')).toBe(container)
  expect(container.hasAttribute('data-identity-saving')).toBe(false)
  expect(f.refresh).not.toHaveBeenCalled()
})

test('title autosave preserves knowledge draft and its next versioned section save', async () => {
  const f = await fixture()
  await click('编辑群内共享知识'); await toggle('共享资料')
  await rename('新群名')
  expect(saves()[0]?.[1]).toMatchObject({ title: '新群名', sharedKnowledgeIds: [] })
  expect(document.querySelector('[role=checkbox]')?.getAttribute('aria-checked')).toBe('true')
  await act(async () => button('高级配置').click())
  expect(document.querySelector('[role=alertdialog]')).not.toBeNull()
  await act(async () => document.querySelector<HTMLButtonElement>('[data-slot=alert-dialog-cancel]')!.click())
  await act(async () => button('保存').click())
  expect(saves()[1]?.[1]).toMatchObject({ title: '新群名', expectedConfigVersion: 5, sharedKnowledgeIds: ['k'] })
  expect(host.querySelector('form')).toBeNull(); expect(f.refresh).not.toHaveBeenCalled()
})

test('group avatar opens preselected members and only Done saves the full selected set', async () => {
  const f = await fixture(); await click('配置群成员')
  expect(document.querySelectorAll('[role=checkbox][aria-checked=true]')).toHaveLength(2)
  expect(document.querySelector('[aria-label="已选成员"]')?.textContent).toContain('Alice')
  await toggle('Alice'); await toggle('Carol')
  expect(saves()).toHaveLength(0)
  await act(async () => button('完成').click())
  expect(saves()[0]?.[1]).toMatchObject({ id: 'g', expectedConfigVersion: 4, agentIds: ['a1', 'a2'], title: initial.title, memoryScope: initial.memoryScope })
  expect(document.querySelector('[role=dialog]')).toBeNull(); expect(f.refresh).not.toHaveBeenCalled()
  await click('配置群成员')
  expect(document.querySelector('[aria-label="已选成员"]')?.textContent).toContain('Carol')
  await toggle('Carol'); await act(async () => button('取消').click())
  expect(saves()).toHaveLength(1); expect(committed.agentIds).toEqual(['a1', 'a2'])
})

test('advanced basic configuration keeps the same picker and defers membership changes until Save settings', async () => {
  await fixture(); await act(async () => button('高级配置').click())
  expect(document.querySelector('[role=tab][aria-label="基础配置"]')).not.toBeNull()
  await click('配置群成员 Alice')
  expect(document.querySelectorAll('[role=checkbox][aria-checked=true]')).toHaveLength(2)
  await toggle('Carol'); await act(async () => button('完成').click())
  expect(saves()).toHaveLength(0)
  await click('添加群成员')
  expect(document.querySelectorAll('[role=checkbox][aria-checked=true]')).toHaveLength(3)
  await act(async () => button('取消').click())
  await act(async () => button('保存设置').click())
  expect(saves()[0]?.[1]).toMatchObject({ id: 'g', expectedConfigVersion: 4, agentIds: ['a0', 'a1', 'a2'] })
})

test('member picker enforces 1–12 members and search does not clear selection', async () => {
  const many = Array.from({ length: 13 }, (_, i) => ({ ...agents[0]!, id: `m${i}`, name: `员工${i}` }))
  await act(async () => root.render(h(GroupMemberDialog, { agents: many, ids: many.slice(0, 12).map(item => item.id), onClose() {}, onConfirm() {} })))
  const checks = [...document.querySelectorAll<HTMLButtonElement>('[role=checkbox]')]
  expect(checks[12]!.getAttribute('aria-disabled')).toBe('true')
  const input = document.querySelector<HTMLInputElement>('[aria-label="搜索群成员"]')!
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '没有匹配'); input.dispatchEvent(new Event('input', { bubbles: true })) })
  expect(document.querySelectorAll('[aria-label="已选成员"] .creation-member')).toHaveLength(12)
  for (let i = 0; i < 12; i++) await click(`移除 员工${i}`)
  expect(button('完成').disabled).toBe(true)
})

test('failed autosave keeps its draft, blocks automatic retry and can explicitly reload the committed version', async () => {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => { const result = await original(method, input); if (method === 'createConversation') throw new Error('response lost'); return result })
  await fixture(); await rename('未知回执名称')
  await rename('不会重复提交')
  expect(saves()).toHaveLength(1)
  expect(button('载入当前配置')).toBeDefined()
  await act(async () => button('载入当前配置').click())
  await act(async () => button('退出').click())
  expect(title().textContent).toBe('未知回执名称')
  expect(saves()).toHaveLength(1)
})
