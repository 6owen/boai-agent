// @vitest-environment jsdom
/*
 * [OUTPUT]: 核对核心主聊使用员工名称，最后一个核心会话删除后只保留列表空态。
 * [OUTPUT]: 核对置顶员工话题只在标题栏 Popover 查阅，侧栏余白可取消置顶。
 * [OUTPUT]: 核对拖影和置顶卡片使用员工名、等待 IPC 时的落点。
 * [OUTPUT]: 核对 bobo 主聊统一展示、拖拽置顶与取消、置顶话题归属及空区回收。
 * [OUTPUT]: 聊天顶部和侧栏只让真正等待标题的首句闪烁。
 * [OUTPUT]: 列表夹具沿仅已发送消息的Props，不再向列表传入composer草稿。
 * [OUTPUT]: 员工配置与置顶共组、清理独立，导航仍沿明确员工身份。
 * [OUTPUT]: 本轮覆盖复制/员工入口、定时运行防连点、失败过程、严格私有判断及保留原预算的显式继续；实际范围以各用例为准。
 * [OUTPUT]: 员工行点击与折叠动作分离，话题标题可通过右键和更多菜单编辑。
 * [OUTPUT]: 群组侧栏直达原会话，话题展开只出现在员工行。
 * [OUTPUT]: 收起所选话题时，归属提示留在员工行，返回主聊天时恢复主聊天选中状态。
 * [INPUT]: 生产ConversationList/清理确认弹窗、隔离快照与清理回调。
 * [OUTPUT]: 核心助手行无悬停新话题按钮，右键菜单提供新增/设置及批量操作；搜索范围、删除/清空、失败停止/继续和空分组禁用回归。
 * [POS]: 会话列表前端交互回归，不读取用户数据、不运行Electron或E2E。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h, type ComponentProps } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Conversation, DigitalAgent, Snapshot } from '../packages/shared/src/domain'
import { ConversationList } from '../apps/electron/src/renderer/pages/conversations/-components/conversation-list'
import { ConversationHeader, ConversationTopics } from '../apps/electron/src/renderer/pages/conversations/-components/conversation-header'
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
  props = { snapshot: { agents: [coreAgent], conversations, resources: [], connections: [] } as unknown as Snapshot, selectedId: null, previews: {}, messageTimes: {}, busy: false, onSelect: vi.fn(), onCreate: vi.fn(), onOpenMain: vi.fn(), onCreateTopic: vi.fn(), onConfigureAgent: vi.fn(), onEditTitle: vi.fn(), onChange: vi.fn(), onClear: vi.fn(async () => {}), onOpenChannels: vi.fn() }
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.clearAllMocks() })
const render = () => act(async () => root.render(h(ConversationList, props)))
const menuItem = (label: string) => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent === label)!
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === label)!
const openMenu = () => act(async () => host.querySelector('button[aria-label="Bobo 的主聊天"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 })))
const choose = (label: string) => act(async () => menuItem(label).click())
const confirm = (label: string) => act(async () => button(label).click())

it('uses shimmer on the title placeholder in both surfaces and removes it on the next title', async () => {
  const draft = room('topic', { employeeChat: 'topic', title: '你知道今天星期几吗？', titleGenerating: true })
  const display = (conversation: Conversation) => act(async () => root.render([
    h(ConversationList, { ...props, key: 'list', snapshot: { ...props.snapshot, conversations: [conversation] } }),
    h(ConversationHeader, { key: 'header', conversation, members: [coreAgent], resources: [], busy: false,
      onDetails: vi.fn(), onConfigureAgent: vi.fn(), onEditTitle: vi.fn(), onClear: async () => {} }),
  ]))
  await display(draft)
  expect(host.querySelector('h2.chat-title.shimmer')?.textContent).toBe(draft.title)
  expect(host.querySelector('.conversation-core-title .shimmer')?.textContent).toBe(draft.title)
  await display({ ...draft, title: '查询今天是星期几', titleGenerating: undefined })
  expect(host.querySelectorAll('.shimmer')).toHaveLength(0)
  expect(host.querySelector('.chat-title')?.textContent).toBe('查询今天是星期几')
  expect(host.querySelector('.conversation-core-title .truncate')?.textContent).toBe('查询今天是星期几')
})

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

it('opens new topics and settings from the Bobo context menu without an inline compose button', async () => {
  await render()
  expect(host.querySelector('button[aria-label="与 Bobo 新建会话"]')).toBeNull()
  await openMenu()
  expect([...document.querySelectorAll('[role="menuitem"]')].map(item => item.textContent)).toEqual(['新话题', '助手设置', '清空所有记录', '删除所有会话'])
  expect(host.querySelector('[aria-label="普通会话"] button[aria-label="Bobo 的主聊天"]')).not.toBeNull()
  await choose('新话题')
  expect(props.onCreateTopic).toHaveBeenCalledWith(coreAgent)
  await openMenu(); await choose('助手设置')
  expect(props.onConfigureAgent).toHaveBeenCalledWith(coreAgent)
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
  expect(showErrorToast).toHaveBeenCalledWith('已清理 1 / 3 个会话。 清理失败')
  expect(document.querySelector('[role="alertdialog"]')?.textContent).not.toContain('已清理 1 / 3')
  await confirm('继续清理剩余会话')
  expect(clear.mock.calls).toEqual([['A', false], ['B', false], ['B', false], ['C', false]])
  expect(document.querySelector('[role="alertdialog"][data-open]')).toBeNull()
})

it('disables bulk operations for an empty Bobo group while keeping creation available', async () => {
  props = { ...props, snapshot: { ...props.snapshot, conversations: [] } }
  await render(); await openMenu()
  expect(menuItem('清空所有记录').getAttribute('aria-disabled')).toBe('true')
  expect(menuItem('删除所有会话').getAttribute('aria-disabled')).toBe('true')
  expect(menuItem('新话题').getAttribute('aria-disabled')).not.toBe('true')
})


it('keeps main chat navigation and topic expansion independent for bobo and ordinary employees', async () => {
  props.snapshot.conversations.push(
    room('bobo-main', { employeeChat: 'main' }),
    room('天气话题', { employeeChat: 'topic', purpose: 'personal', agentIds: ['employee'] }),
  )
  await render()
  const byName = (name: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!
  await act(async () => byName('Bobo 的主聊天').click())
  expect(props.onSelect).toHaveBeenCalledWith('bobo-main')
  const boboToggle = byName('Bobo 的话题')
  expect(boboToggle.getAttribute('aria-expanded')).toBe('true')
  await act(async () => boboToggle.click())
  expect(boboToggle.getAttribute('aria-expanded')).toBe('false')
  expect(props.onSelect).toHaveBeenCalledWith('bobo-main')
  expect(props.onSelect).toHaveBeenCalledTimes(1)
  const employeeToggle = byName('employee 的话题')
  expect(employeeToggle.getAttribute('aria-expanded')).toBe('false')
  await act(async () => employeeToggle.click())
  expect(employeeToggle.getAttribute('aria-expanded')).toBe('true')
  expect(props.onSelect).toHaveBeenCalledTimes(1)
  const more = byName('天气话题 的更多操作')
  expect(more.parentElement?.querySelectorAll('button')).toHaveLength(1)
  expect(byName('编辑 天气话题 的标题')).toBeNull()
  await act(async () => byName('天气话题').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 })))
  await choose('编辑标题')
  expect(props.onEditTitle).toHaveBeenCalledWith(expect.objectContaining({ id: '天气话题' }))
  await act(async () => more.click())
  expect(menuItem('删除会话')).toBeDefined()
  await choose('编辑标题')
  expect(props.onEditTitle).toHaveBeenCalledTimes(2)
  await act(async () => byName('天气话题').click())
  await act(async () => byName('employee').click())
  expect(host.querySelector('button[aria-label="group 的话题"]')).toBeNull()
  await act(async () => byName('group').click())
  expect(vi.mocked(props.onSelect).mock.calls).toEqual([['bobo-main'], ['天气话题'], ['employee'], ['group']])
})


it.each([
  { main: 'bobo-main', topic: 'core-topic', employeeLabel: 'Bobo 的主聊天', toggleLabel: 'Bobo 的话题' },
  { main: 'employee', topic: 'weather-topic', employeeLabel: 'employee', toggleLabel: 'employee 的话题' },
])('keeps the owner of $topic marked when its list is collapsed', async ({ main, topic, employeeLabel, toggleLabel }) => {
  props.snapshot.conversations.push(
    room('bobo-main', { employeeChat: 'main' }),
    room('core-topic', { employeeChat: 'topic' }),
    room('weather-topic', { employeeChat: 'topic', purpose: 'personal', agentIds: ['employee'] }),
  )
  await render()
  const buttonByName = (label: string) => host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  props = { ...props, selectedId: topic }
  await render()
  expect(buttonByName(employeeLabel)?.getAttribute('data-active-topic')).toBe('true')
  expect(buttonByName(employeeLabel)?.getAttribute('aria-current')).toBeNull()
  expect(buttonByName(topic)?.getAttribute('aria-current')).toBe('page')
  expect(buttonByName('group')?.getAttribute('data-active-topic')).toBeNull()
  await act(async () => buttonByName(toggleLabel)!.click())
  expect(buttonByName(toggleLabel)?.getAttribute('aria-expanded')).toBe('false')
  expect(buttonByName(employeeLabel)?.getAttribute('data-active-topic')).toBe('true')
  expect(props.onSelect).not.toHaveBeenCalled()
  props = { ...props, selectedId: main }
  await render()
  expect(buttonByName(employeeLabel)?.getAttribute('data-active-topic')).toBeNull()
  expect(buttonByName(employeeLabel)?.getAttribute('aria-current')).toBe('page')
})


it('hides a deleted Bobo main chat and only keeps an entry when another topic is visible', async () => {
  const main = room('bobo-main', { employeeChat: 'main', title: 'hi' })
  props.snapshot.conversations = [main]
  await render()
  const selector = 'button[aria-label="Bobo 的主聊天"]'
  expect(host.querySelector(selector)?.querySelector('.conversation-title')?.textContent).toBe('Bobo')
  await openMenu()
  expect(menuItem('编辑标题')).toBeUndefined()
  await choose('删除会话')
  expect(document.querySelector('[role=alertdialog]')?.textContent).toContain('“Bobo”')
  await confirm('删除会话及记录')
  expect(props.onClear).toHaveBeenCalledWith(main.id, true)

  const hidden = { ...main, list: { hidden: true } }
  props.snapshot.conversations = [hidden]
  await render()
  expect(host.querySelector(selector)).toBeNull()
  expect(host.querySelector('.conversation-list-empty img')).not.toBeNull()

  props.snapshot.conversations = [hidden, room('weather', { employeeChat: 'topic', title: '仍保留的话题' })]
  await render()
  expect(host.querySelector('.conversation-list-empty')).toBeNull()
  expect(host.querySelector('[aria-label="仍保留的话题"]')).not.toBeNull()
  const entry = host.querySelector<HTMLButtonElement>(selector)!
  expect(entry.hasAttribute('data-main-placeholder')).toBe(true)
  await act(async () => entry.click())
  expect(props.onOpenMain).toHaveBeenCalledWith(coreAgent)
  expect(props.onSelect).not.toHaveBeenCalled()
})

it('moves an actual Bobo main chat into and out of the avatar shelf via drag', async () => {
  const main = room('bobo-main', { employeeChat: 'main', title: 'hi' })
  const topic = room('weather', { employeeChat: 'topic', title: '天气话题' })
  props.snapshot.conversations = [main, topic]
  let settlePin!: () => void
  props.onChange = vi.fn(() => new Promise<void>(resolve => { settlePin = resolve }))
  const transfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), setDragImage: vi.fn() }
  const drag = (element: Element, type: string) => act(async () => {
    const event = new MouseEvent(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: transfer })
    element.dispatchEvent(event)
  })
  const entry = () => host.querySelector<HTMLButtonElement>('[aria-label="Bobo 的主聊天"]')!
  const shelf = () => host.querySelector('.conversation-pin-shelf')!
  await render()
  expect(entry().closest('[aria-label="普通会话"]')).not.toBeNull()
  expect(shelf()).toBeNull()
  await drag(entry(), 'dragstart')
  const dragImage = transfer.setDragImage.mock.calls[0][0] as HTMLElement
  expect(dragImage.textContent).toBe('Bobo')
  expect(dragImage.querySelector('.avatar img')).not.toBeNull()
  expect(dragImage.querySelector('time, .conversation-preview, svg')).toBeNull()
  expect(shelf().textContent).toBe('拖到此处置顶')
  await drag(shelf(), 'dragover')
  expect(shelf().getAttribute('data-drop')).toBe('inside')
  await drag(shelf(), 'drop')
  expect(props.onChange).toHaveBeenLastCalledWith({ id: main.id, action: 'pin', pinned: true })
  expect(entry().closest('[aria-label="置顶会话"]')).not.toBeNull()
  expect(entry().textContent).toBe('Bobo')
  expect(entry().parentElement?.querySelector('svg, .conversation-topic-toggle')).toBeNull()

  props = { ...props, selectedId: topic.id, snapshot: { ...props.snapshot, conversations: props.snapshot.conversations.map(value => value.id === main.id ? { ...value, list: { pinned: true } } : value) } }
  await render()
  expect(entry().closest('[aria-label="置顶会话"]')).not.toBeNull()
  expect(entry().getAttribute('data-active-topic')).toBe('true')
  expect(host.querySelector('button[aria-label="天气话题"]')).toBeNull()
  await act(async () => settlePin())
  await openMenu()
  expect(menuItem('收起话题')).toBeUndefined()
  expect(menuItem('展开话题')).toBeUndefined()
  await act(async () => document.querySelector('[role="menu"]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  await drag(entry(), 'dragstart')
  const ordinaryArea = host.querySelector('.conversation-regular-drop')!
  expect(ordinaryArea.textContent).toBe('')
  await drag(ordinaryArea, 'dragover')
  expect(ordinaryArea.getAttribute('data-drop')).toBe('inside')
  await drag(ordinaryArea, 'drop')
  expect(props.onChange).toHaveBeenLastCalledWith({ id: main.id, action: 'pin', pinned: false })
  expect(entry().closest('[aria-label="普通会话"]')).not.toBeNull()
  expect(host.querySelector('button[aria-label="天气话题"]')?.getAttribute('aria-current')).toBe('page')
  await act(async () => settlePin())
  expect(entry().closest('[aria-label="置顶会话"]')).not.toBeNull()
})

it('opens visible topics for only the current employee from the chat header', async () => {
  const current = room('current', { employeeChat: 'topic', title: '当前话题' })
  const legacy = room('legacy', { title: '旧核心话题' })
  const hidden = room('hidden-topic', { title: '已经删除', employeeChat: 'topic', list: { hidden: true } })
  const other = room('other-topic', { title: '其他员工的话题', purpose: 'personal', employeeChat: 'topic', agentIds: ['other'] })
  const onSelect = vi.fn()
  await act(async () => root.render(h(ConversationTopics, {
    conversation: current, conversations: [current, legacy, hidden, other], messageTimes: {}, onSelect,
  })))
  await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="话题列表"]')!.click())
  const popover = document.querySelector('[data-slot="popover-content"]')!
  expect([...popover.querySelectorAll('button')].map(item => item.textContent)).toEqual(['当前话题', '旧核心话题'])
  expect(popover.querySelector('[aria-current="page"]')?.textContent).toBe('当前话题')
  await act(async () => button('旧核心话题').click())
  expect(onSelect).toHaveBeenCalledWith(legacy.id)
})

it('saves the same pin command from the ordinary employee menu', async () => {
  await render()
  const row = host.querySelector('[aria-label="employee"]')!
  await act(async () => row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 })))
  await choose('置顶')
  expect(props.onChange).toHaveBeenCalledWith({ id: 'employee', action: 'pin', pinned: true })
})
