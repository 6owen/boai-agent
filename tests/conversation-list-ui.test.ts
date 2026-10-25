// @vitest-environment jsdom
/*
 * [OUTPUT]: 员工配置与置顶共组、清理独立，导航仍沿明确员工身份。
 * [OUTPUT]: 本轮覆盖复制/员工入口、定时运行防连点、失败过程、严格私有判断及保留原预算的显式继续；实际范围以各用例为准。
 * [INPUT]: 生产ConversationList/清理确认弹窗、隔离快照与清理回调。
 * [OUTPUT]: 核心助手右键菜单新增/设置入口及无渠道入口；批量确认固定完整核心分组、不受搜索影响，删除/清空标记、失败停止/继续和空分组禁用回归。
 * [POS]: 会话列表前端交互回归，不读取用户数据、不运行Electron或E2E。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Conversation, DigitalAgent, Snapshot } from '../packages/shared/src/domain'
import { ConversationList } from '../apps/electron/src/renderer/pages/conversations/-components/conversation-list'
import { showErrorToast } from '../apps/electron/src/renderer/components/common/error-feedback'

vi.mock('../apps/electron/src/renderer/components/common/error-feedback', () => ({ ErrorToast: () => null, showErrorToast: vi.fn() }))
type Props = ComponentProps<typeof ConversationList>
let root: Root, host: HTMLDivElement, props: Props
const room = (id: string, extra: Partial<Conversation> = {}): Conversation => ({ id, kind: 'direct', title: id, agentIds: ['bobo'], purpose: 'core', mode: 'natural', workspacePath: `/workspace/${id}`, sharedKnowledgeIds: [], createdAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z', ...extra })
const coreAgent: DigitalAgent = { id: 'bobo', name: 'Bobo', role: '系统核心 Agent', systemRole: 'core', active: true, skillIds: [], knowledgeIds: [], instructions: '', color: '#438b80', connectionId: '', modelId: '', allowCommands: true, configVersion: 1 }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  Element.prototype.getAnimations = () => []
  const conversations = [room('A'), room('B'), room('hidden', { list: { hidden: true } }), room('employee', { purpose: undefined, agentIds: ['employee'], mainPrivate: true }), room('group', { purpose: undefined, kind: 'group', agentIds: ['employee'] }), room('channel', { channel: { platform: 'feishu', tenantId: 'tenant', chatId: 'p2p', kind: 'direct', bindingId: 'bot' } })]
  props = { snapshot: { agents: [coreAgent], conversations, resources: [], connections: [] } as unknown as Snapshot, selectedId: null, previews: {}, messageTimes: {}, drafts: new Map(), busy: false, onSelect: vi.fn(), onCreate: vi.fn(), onCreateCore: vi.fn(), onConfigureCore: vi.fn(), onEditTitle: vi.fn(), onChange: vi.fn(), onClear: vi.fn(async () => {}), onOpenChannels: vi.fn() }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks() })
const render = () => act(async () => root.render(h(ConversationList, props)))
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent === label)!
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === label)!
const openMenu = () => act(async () => host.querySelector('.conversation-core-section-row')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 })))
const choose = (label: string) => act(async () => menuItem(label).click())
const confirm = (label: string) => act(async () => button(label).click())

it('opens the selected employee configuration from its conversation context menu', async () => {
  const employee = { ...coreAgent, id: 'weekly-employee', name: '周报统计', systemRole: undefined }
  props = { ...props, onConfigureAgent: vi.fn(), snapshot: { ...props.snapshot, agents: [...props.snapshot.agents, employee], conversations: [...props.snapshot.conversations, room('周报统计', { agentIds: [employee.id], purpose: 'personal' })] } }
  await render()
  await act(async () => host.querySelector('[aria-label="周报统计"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 })))
  expect(menuItem('员工配置').closest('[role=group]')).toBe(menuItem('置顶').closest('[role=group]'))
  expect(menuItem('员工配置').closest('[role=group]')).not.toBe(menuItem('清空聊天记录').closest('[role=group]'))
  await choose('员工配置')
  expect(props.onConfigureAgent).toHaveBeenCalledWith(employee)
  expect(props.onSelect).not.toHaveBeenCalled()
})

it('offers create and settings on the Bobo row without a channel entry', async () => {
  await render(); await openMenu()
  expect([...document.querySelectorAll('[role="menuitem"]')].map(item => item.textContent)).toEqual(['新增会话', '助手设置', '清空所有记录', '删除所有会话'])
  await choose('新增会话')
  expect(props.onCreateCore).toHaveBeenCalledTimes(1)
  await openMenu(); await choose('助手设置')
  expect(props.onConfigureCore).toHaveBeenCalledTimes(1)
  expect(props.onOpenChannels).not.toHaveBeenCalled()
})

it('confirms the entire core group despite search and freezes its targets until completion', async () => {
  await render()
  await act(async () => {
    const input = host.querySelector('input')!
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'A')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
  expect(host.querySelector('.conversation-core-history')?.textContent).not.toContain('B')
  await openMenu(); await choose('清空所有记录')
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('全部 2 个会话')
  expect(props.onClear).not.toHaveBeenCalled()
  await confirm('取消')
  expect(props.onClear).not.toHaveBeenCalled()
  await openMenu(); await choose('清空所有记录')
  props = { ...props, snapshot: { ...props.snapshot, conversations: [...props.snapshot.conversations, room('new')] } }
  await render(); await confirm('确认清空')
  expect(vi.mocked(props.onClear).mock.calls).toEqual([['A', false], ['B', false]])
  expect(document.querySelector('[role="alertdialog"][data-open]')).toBeNull()
})

it('removes core conversations only after the bulk deletion confirmation', async () => {
  await render(); await openMenu(); await choose('删除所有会话')
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain('同时移出会话列表')
  expect(props.onClear).not.toHaveBeenCalled()
  await confirm('删除所有会话及记录')
  expect(vi.mocked(props.onClear).mock.calls).toEqual([['A', true], ['B', true]])
})

it('stops on a failed item and resumes only the remaining items on an explicit click', async () => {
  const clear = vi.fn(async (_id: string, _hide: boolean) => {}).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('清理失败'))
  props = { ...props, onClear: clear, snapshot: { ...props.snapshot, conversations: [...props.snapshot.conversations, room('C')] } }
  await render(); await openMenu(); await choose('清空所有记录'); await confirm('确认清空')
  expect(clear.mock.calls).toEqual([['A', false], ['B', false]])
  expect(showErrorToast).toHaveBeenCalledWith('清理失败')
  expect(document.querySelector('[role="status"]')?.textContent).toContain('已清理 1 / 3')
  await confirm('继续清理剩余会话')
  expect(clear.mock.calls).toEqual([['A', false], ['B', false], ['B', false], ['C', false]])
  expect(document.querySelector('[role="alertdialog"][data-open]')).toBeNull()
})

it('disables bulk operations for an empty Bobo group while keeping creation available', async () => {
  props = { ...props, snapshot: { ...props.snapshot, conversations: [] } }
  await render(); await openMenu()
  expect(menuItem('清空所有记录').getAttribute('aria-disabled')).toBe('true')
  expect(menuItem('删除所有会话').getAttribute('aria-disabled')).toBe('true')
  expect(menuItem('新增会话').getAttribute('aria-disabled')).not.toBe('true')
})
