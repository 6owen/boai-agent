// @vitest-environment jsdom
/*
 * [OUTPUT]: 数据源目录夹具符合完整DataSource合同（含MCP transport）；知识入口核对当前员工文件区，原菜单/草稿/关闭顺序和零写断言保持。
 * [OUTPUT]: 员工组编辑共用员工左右布局与贴边渐隐滚动；基础配置/自动化切换保护草稿，群版本化保存期间关闭和菜单禁用，新建群布局保持。
 * [OUTPUT]: 渠道编辑独立Dialog保留原列表；局部取消/退出、保存禁关及原版本请求保持，未知保存仅核对冻结回执，不重复提交。
 * [OUTPUT]: 技能添加入口位于分区标题且空态无Card；数据源普通绑定行纯文字菜单、Popover取消/确认、重新添加及版本化保存，不删除全局资源。
 * [OUTPUT]: 系统文件在独立Dialog编辑，取消关闭保留草稿、保存期间禁关，按原hash/配置版本提交；关闭后原文件列表及员工配置保持。
 * [OUTPUT]: 技能双栏多选/移除与本地/收藏搜索不提交绑定；统一添加逐项更新版本并保留草稿，未知停队列且仅核对原请求。
 * [OUTPUT]: 已选技能为群聊普通行和独立关闭按钮，已有项移除/重选仅改草稿；更多菜单红色移除经Popover取消/确认，保存才提交配置，无重复绑定。
 * [OUTPUT]: 数据源通过更多操作菜单打开详情，菜单展开不导航或改变绑定，原未保存确认保持。
 * [OUTPUT]: Codex/Claude编辑仅一个执行权限字段，三档选择真实提交对应原生访问与审批参数。
 * [OUTPUT]: 勾选源不锁技能，真实绑定回执更新版本并保留草稿；三类资源查看经原草稿守卫关闭弹窗后导航。
 * [OUTPUT]: 员工和员工组编辑无可见标题/无外层内边距，使用竖排菜单与贴边滚动内容，切换继续保护草稿，创建保持原导航。
 * [OUTPUT]: 配置页保留可编辑头像/姓名/职责，其他分类隐藏身份表单，原草稿和保存检查保持。
 * [INPUT]: 生产通讯录编辑/创建Dialog、原员工/群表单与受控IPC回执。
 * [OUTPUT]: 新建/编辑员工分区Card与群编辑左右布局、Portal底页保留、未保存确认仅取消/退出、原表单保存/版本核对及忙时关闭锁；执行记录关闭弹窗后打开全局面板。
 * [POS]: 通讯录弹窗组件回归，不运行E2E、模型或修改用户配置。
 * [PROTOCOL]: 修改同步Header和tests/.folder.md。
 */
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AgentFileContent, AgentHome, AgentInput, Conversation, DigitalAgent, Resource, Snapshot } from '../src/shared/domain'
import type { ChannelBindingInput, ChannelBindingState } from '../src/shared/domain/channels'
import type { BindLocalSkillInput, LocalSkill, SkillBindingPlan } from '../src/shared/domain/skills'
import type { DataSource } from '../src/shared/domain/sources'
import type { DesktopApi } from '../src/shared/ipc'
import { ContactEditorDialog } from '../src/renderer/pages/contacts/contact-editor-layout'
import { CreateAgentDialog, CreateGroupDialog } from '../src/renderer/components/employee/creation-dialogs'
import { EmployeeExecutionNavigation } from '../src/renderer/components/employee/execution-pane'
import { EmployeeResourceNavigation } from '../src/renderer/components/employee/resource-navigation'

const agent = { id: 'ds', name: 'DS', role: '数字员工', instructions: '', color: '#438b80', configVersion: 3, active: true, connectionId: 'connection', modelId: 'model', executionBackend: { kind: 'mastra-model' }, skillIds: [], knowledgeIds: [], sourceIds: ['source'], allowCommands: true } as DigitalAgent
const group = { id: 'group', kind: 'group', title: '天气小组', agentIds: [agent.id], sharedKnowledgeIds: [], configVersion: 4 } as unknown as Conversation
const snapshot = { agents: [agent], conversations: [group], resources: [], connections: [{ id: 'connection', name: 'API', provider: 'openai-compatible', baseUrl: 'https://example.test/v1', defaultModel: 'model' }] } as unknown as Snapshot
let host: HTMLDivElement, root: Root, request: ReturnType<typeof vi.fn<(method: string, input?: unknown) => Promise<unknown>>>, api: DesktopApi
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.getAnimations = () => []
  localStorage.clear()
  request = vi.fn<(method: string, input?: unknown) => Promise<unknown>>(async method => {
    if (method === 'listLaunchProfiles' || method === 'listDataSources' || method === 'listSkillInstallations') return []
    if (method === 'getSkillCollections') return { revision: 1, favoriteResourceIds: [], groups: [], groupByResourceId: {} }
    if (method === 'getAgentHome') return { files: [], configVersion: 3 }
    throw new Error(`Unexpected request: ${method}`)
  })
  api = { request, subscribe: () => () => {} } as unknown as DesktopApi
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(value => value.textContent === text)!
async function change(element: HTMLInputElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element, value); element.dispatchEvent(new Event('input', { bubbles: true })) })
}
async function fixture(kind: 'employee' | 'group', data = snapshot) {
  const closed = vi.fn(), refresh = vi.fn(async () => {}), backgroundSubmit = vi.fn(), openExecution = vi.fn(), openResource = vi.fn()
  function Page() {
    const [open, setOpen] = useState(true)
    return h(EmployeeResourceNavigation.Provider, { value: openResource }, h(EmployeeExecutionNavigation.Provider, { value: openExecution }, h('main', null, h('form', { 'data-background': true, onSubmit: backgroundSubmit }, '原通讯录资料'), open && h(ContactEditorDialog, {
      api, snapshot: data, active: true, ...(kind === 'employee' ? { agent: data.agents[0] } : { group }), refresh,
      onClose() { closed(); setOpen(false) }, onOpenAgent() {}, onConversation() {},
    }))))
  }
  await act(async () => root.render(h(Page)))
  return { closed, refresh, backgroundSubmit, openExecution, openResource }
}

test('execution rows inside configuration close the dialog before opening the original run in the global panel', async () => {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'listEmployeeExecutions' ? { items: [{
    run: { id: 'older-run', conversationId: group.id, agentId: agent.id, createdAt: '2026-10-17T06:00:00Z', status: 'completed' },
    conversationTitle: group.title, configuration: { label: 'API', modelId: 'model' },
  }] } : original(method, input))
  const f = await fixture('employee')
  await act(async () => button('执行详情').click())
  expect(document.querySelector('[role=dialog] [data-employee-run-id="older-run"]')).not.toBeNull()
  await act(async () => document.querySelector<HTMLButtonElement>('[data-employee-run-id="older-run"]')!.click())
  expect(f.closed).toHaveBeenCalledOnce()
  expect(f.openExecution).toHaveBeenCalledWith(expect.objectContaining({ conversationId: group.id, agentId: agent.id, runId: 'older-run' }))
  expect(f.closed.mock.invocationCallOrder[0]).toBeLessThan(f.openExecution.mock.invocationCallOrder[0]!)
  expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(host.querySelector('[data-background]')).not.toBeNull()
  expect(request.mock.calls.some(([method]) => method === 'saveAgent' || method === 'createConversation')).toBe(false)
})

test.each(['employee', 'group'] as const)('%s editing uses the shared sidebar dialog and keeps its background', async kind => {
  const f = await fixture(kind), background = host.querySelector('[data-background]')
  const dialog = document.querySelector('[role=dialog]')!
  expect(dialog.classList.contains('employee-editor-dialog')).toBe(true)
  expect((dialog as HTMLElement).style.width).toBe('840px')
  expect((dialog as HTMLElement).style.height).toBe('640px')
  expect(dialog.querySelector('.employee-form-layout')).not.toBeNull()
  const viewport = dialog.querySelector('.employee-detail-main>[data-slot=scroll-area-viewport]')!
  expect(viewport).not.toBeNull()
  expect(viewport.classList.contains('scroll-fade-t')).toBe(true)
  expect(viewport.classList.contains('scroll-fade-6')).toBe(true)
  const navLabel = kind === 'employee' ? '员工设置' : '员工组设置'
  expect(dialog.querySelector(`nav[aria-label="${navLabel}"] [role=tablist]`)?.getAttribute('aria-orientation')).toBe('vertical')
  expect(dialog.querySelectorAll(`nav[aria-label="${navLabel}"] [role=tab]`)).toHaveLength(kind === 'employee' ? 7 : 2)
  expect(dialog.querySelector('[role=tab][aria-label="基础配置"]')?.getAttribute('aria-selected')).toBe('true')
  expect(dialog.querySelector('.employee-tabs-bar')).toBeNull()
  expect(dialog.querySelector('.connection-dialog-top')).toBeNull()
  expect(dialog.querySelector('[data-slot=dialog-title]')?.classList.contains('sr-only')).toBe(true)
  expect(host.querySelector('.editor-frame')).toBeNull()
  await act(async () => button('取消').click())
  expect(f.closed).toHaveBeenCalledOnce()
  expect(host.querySelector('[data-background]')).toBe(background)
  expect(request.mock.calls.some(([method]) => method === 'saveAgent' || method === 'createConversation')).toBe(false)
})

test('dirty employee edit saves only the dialog form with its original version and blocks closing during save', async () => {
  let finish!: (value: DigitalAgent) => void
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'saveAgent' ? new Promise<DigitalAgent>(resolve => { finish = resolve }) : original(method, input))
  const f = await fixture('employee')
  await change(document.querySelector<HTMLInputElement>('input[aria-label="员工名称"]')!, '天气研究员')
  await change(document.querySelector<HTMLInputElement>('input[aria-label="员工职责"]')!, '资料核对与汇总')
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="关闭编辑员工"]')!.click())
  expect(document.querySelector('[role=alertdialog]')?.textContent).toContain('有未保存的修改')
  expect(f.closed).not.toHaveBeenCalled()
  expect([...document.querySelectorAll('[role=alertdialog] button')].map(value => value.textContent)).toEqual(['取消', '退出'])
  expect(request.mock.calls.some(([method]) => method === 'saveAgent')).toBe(false)
  await act(async () => document.querySelector<HTMLButtonElement>('[role=alertdialog] [data-slot=alert-dialog-cancel]')!.click())
  expect(document.querySelector<HTMLInputElement>('input[aria-label="员工名称"]')!.value).toBe('天气研究员')
  expect(f.closed).not.toHaveBeenCalled()
  await act(async () => button('保存修改').click())
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)) })
  const payload = request.mock.calls.find(([method]) => method === 'saveAgent')?.[1] as AgentInput
  expect(payload).toMatchObject({ id: agent.id, name: '天气研究员', role: '资料核对与汇总', expectedConfigVersion: 3, sourceIds: ['source'], allowCommands: true })
  expect(f.backgroundSubmit).not.toHaveBeenCalled()
  expect(document.querySelector<HTMLButtonElement>('[aria-label="关闭编辑员工"]')!.disabled).toBe(true)
  await act(async () => document.querySelector('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(f.closed).not.toHaveBeenCalled()
  await act(async () => finish({ ...agent, ...payload, configVersion: 4 }))
  expect(f.refresh).toHaveBeenCalledOnce()
  expect(f.closed).toHaveBeenCalledOnce()
})

test('exiting a dirty employee editor discards without submitting either form', async () => {
  const f = await fixture('employee')
  await change(document.querySelector<HTMLInputElement>('input[aria-label="员工名称"]')!, '不保存的名称')
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="关闭编辑员工"]')!.click())
  expect(document.querySelector('[role=alertdialog]')?.textContent).toContain('未保存的修改将丢失')
  await act(async () => button('退出').click())
  expect(f.closed).toHaveBeenCalledOnce()
  expect(request.mock.calls.some(([method]) => method === 'saveAgent')).toBe(false)
  expect(f.backgroundSubmit).not.toHaveBeenCalled()
  expect(document.querySelector('[role=dialog]')).toBeNull()
})

test('group edits retain members and the versioned save contract while closing and navigation are locked', async () => {
  let finish!: (value: Conversation) => void
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'createConversation' ? new Promise<Conversation>(resolve => { finish = resolve }) : original(method, input))
  const f = await fixture('group')
  await change(document.querySelector<HTMLInputElement>('input[aria-label="群聊名称"]')!, '研究小组')
  await act(async () => button('保存设置').click())
  expect(request).toHaveBeenCalledWith('createConversation', expect.objectContaining({ id: group.id, title: '研究小组', expectedConfigVersion: 4, agentIds: [agent.id] }))
  expect(document.querySelector<HTMLButtonElement>('[aria-label="关闭编辑员工组"]')!.disabled).toBe(true)
  expect(button('自动化').getAttribute('aria-disabled')).toBe('true')
  await act(async () => {
    button('自动化').click()
    document.querySelector('[role=dialog]')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  })
  expect(document.querySelector('[role=tab][aria-label="基础配置"]')?.getAttribute('aria-selected')).toBe('true')
  expect(request.mock.calls.some(([method]) => method === 'listOwnerAutomations')).toBe(false)
  expect(f.closed).not.toHaveBeenCalled()
  expect(f.backgroundSubmit).not.toHaveBeenCalled()
  await act(async () => finish({ ...group, title: '研究小组', configVersion: 5 }))
  expect(f.refresh).toHaveBeenCalledOnce()
  expect(f.closed).toHaveBeenCalledOnce()
})

test('group sidebar keeps an unsaved draft on cancel and opens only the group automations after explicit discard', async () => {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'listOwnerAutomations' ? { definitions: [] } : original(method, input))
  const f = await fixture('group')
  await change(document.querySelector<HTMLInputElement>('input[aria-label="群聊名称"]')!, '未保存的小组')
  await act(async () => button('自动化').click())
  expect(document.querySelector('[role=alertdialog]')?.textContent).toContain('有未保存的修改')
  expect(request.mock.calls.some(([method]) => method === 'listOwnerAutomations')).toBe(false)
  await act(async () => document.querySelector<HTMLButtonElement>('[role=alertdialog] [data-slot=alert-dialog-cancel]')!.click())
  expect(document.querySelector<HTMLInputElement>('input[aria-label="群聊名称"]')!.value).toBe('未保存的小组')
  expect(document.querySelector('[role=tab][aria-label="基础配置"]')?.getAttribute('aria-selected')).toBe('true')
  await act(async () => button('自动化').click())
  await act(async () => button('退出').click())
  expect(document.querySelector('[role=tab][aria-label="自动化"]')?.getAttribute('aria-selected')).toBe('true')
  expect(request).toHaveBeenCalledWith('listOwnerAutomations', { owner: { kind: 'group', conversationId: group.id }, limit: 30 })
  expect(document.querySelector('[role=tabpanel]:not([inert])')?.textContent).toContain('暂无定时任务')
  await act(async () => button('基础配置').click())
  expect(document.querySelector<HTMLInputElement>('input[aria-label="群聊名称"]')!.value).toBe(group.title)
  expect(request.mock.calls.some(([method]) => method === 'createConversation')).toBe(false)
  expect(f.closed).not.toHaveBeenCalled()
})

test.each(['employee', 'group'] as const)('%s creation preserves its layout without creating on open', async kind => {
  const onClose = vi.fn(), onCreated = vi.fn(async () => {})
  await act(async () => root.render(h(kind === 'employee' ? CreateAgentDialog : CreateGroupDialog, { api, snapshot, onClose, onCreated })))
  const dialog = document.querySelector('[role=dialog]')!
  if (kind === 'employee') {
    expect(dialog.classList.contains('connection-dialog')).toBe(true)
    expect(dialog.querySelector('form.employee-form-layout .employee-form-footer')).not.toBeNull()
  } else {
    expect(dialog.classList.contains('connection-dialog')).toBe(false)
    expect(dialog.querySelector('#create-group-form [aria-label="搜索群成员"]')).not.toBeNull()
    expect(dialog.querySelector('[aria-label="已选成员"] [data-slot=dialog-title]')?.textContent).toBe('发起群聊')
    expect(button('完成').disabled).toBe(true)
  }
  expect(dialog.querySelector('form form')).toBeNull()
  await act(async () => button('取消').click())
  expect(onClose).toHaveBeenCalledOnce()
  expect(onCreated).not.toHaveBeenCalled()
  expect(request.mock.calls.some(([method]) => method === 'saveAgent' || method === 'createConversation')).toBe(false)
})


async function selectOption(label: string, option: string) {
  const trigger = document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
  await act(async () => trigger.click())
  const item = [...document.querySelectorAll<HTMLElement>('[role=option]')].find(item => item.textContent === option)!
  expect(item).toBeDefined()
  await act(async () => { item.dispatchEvent(Object.assign(new Event('pointerdown', { bubbles: true }), { pointerType: 'mouse' })); item.click() })
}

test.each(['只读', '请求审批', '完全访问（跳过审批）'])('employee editing saves actual %s execution policy', async label => {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'saveAgent' ? { ...agent, ...(input as object), configVersion: 4 } : original(method, input))
  await fixture('employee')
  expect(document.querySelector('button[aria-label="命令执行"]')).toBeNull()
  await selectOption('执行权限', label)
  await act(async () => button('保存修改').click())
  const value = label === '只读' ? 'read-only' : label === '请求审批' ? 'ask' : 'full-access'
  expect(request).toHaveBeenCalledWith('saveAgent', expect.objectContaining({ executionPermission: value, allowCommands: value !== 'read-only' }))
})

test.each(['codex-local', 'claude-local'] as const)('%s editing has a single whole execution permission that saves native access and approvals together', async kind => {
  const profile = { id: 'native', name: '本机 Agent', protocol: kind === 'codex-local' ? 'codex-app-server' : 'claude-cli', useExistingLogin: true, revision: 1, verified: { name: 'native', version: '0.162.1' } }
  const native = { ...agent, connectionId: '', modelId: '', executionBackend: { kind, profileId: profile.id }, nativeOptions: { effort: 'high' } }
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'listLaunchProfiles' ? [profile] : method === 'listLaunchProfileModels' ? [] : method === 'saveAgent' ? { ...native, ...(input as object), configVersion: 4 } : original(method, input))
  await fixture('employee', { ...snapshot, agents: [native] })
  expect(document.querySelector('[role=dialog]')?.textContent).not.toContain('操作批准')
  expect(document.querySelectorAll('button[aria-label="执行权限"]')).toHaveLength(1)
  await selectOption('执行权限', '只读')
  await selectOption('执行权限', '请求审批')
  await selectOption('执行权限', '完全访问（跳过审批）')
  await act(async () => button('保存修改').click())
  expect(request).toHaveBeenCalledWith('saveAgent', expect.objectContaining({ executionPermission: 'full-access', nativeOptions: kind === 'codex-local' ? { effort: 'high', codexSandbox: 'danger-full-access', codexApprovalPolicy: 'never' } : { effort: 'high', claudePermissionMode: 'bypassPermissions' } }))
})

test('creation inherits the connection default and can clear a model override before saving', async () => {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'saveAgent' ? { ...agent, ...(input as object) } : method === 'createConversation' ? group : original(method, input))
  const onCreated = vi.fn(async () => {})
  await act(async () => root.render(h(CreateAgentDialog, { api, snapshot, onClose: vi.fn(), onCreated })))
  await change(document.querySelector<HTMLInputElement>('input[aria-label="名称"]')!, '继承默认模型')
  await selectOption('模型连接', 'API · model')
  expect(document.querySelector('button[aria-label="模型 ID"]')?.textContent).toContain('使用连接默认模型（model）')
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="手动编辑模型"]')!.click())
  const model = document.querySelector<HTMLInputElement>('input[aria-label="模型 ID"]')!
  expect(model.required).toBe(false)
  await change(model, 'custom-model')
  await change(model, '')
  await act(async () => button('创建员工').click())
  expect(request).toHaveBeenCalledWith('saveAgent', expect.objectContaining({ connectionId: 'connection', modelId: '', executionPermission: 'ask' }))
  expect(onCreated).toHaveBeenCalledOnce()
})


test('sidebar navigation preserves the draft on cancel and discards only after explicit exit', async () => {
  await fixture('employee')
  await change(document.querySelector<HTMLInputElement>('input[aria-label="员工名称"]')!, '未保存姓名')
  await act(async () => button('系统文件').click())
  expect(document.querySelector('[role=alertdialog]')?.textContent).toContain('有未保存的修改')
  await act(async () => document.querySelector<HTMLButtonElement>('[role=alertdialog] [data-slot=alert-dialog-cancel]')!.click())
  expect(document.querySelector<HTMLInputElement>('input[aria-label="员工名称"]')!.value).toBe('未保存姓名')
  expect(document.querySelector('[role=tab][aria-label="基础配置"]')?.getAttribute('aria-selected')).toBe('true')
  await act(async () => button('系统文件').click())
  await act(async () => button('退出').click())
  expect(document.querySelector('[role=tab][aria-label="系统文件"]')?.getAttribute('aria-selected')).toBe('true')
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('工作规则与风格是可编辑源文件')
  const identityInput = document.querySelector<HTMLInputElement>('input[aria-label="员工名称"]')!
  expect(identityInput.value).toBe(agent.name)
  expect(identityInput.closest<HTMLElement>('[role=tabpanel]')?.hasAttribute('inert')).toBe(true)
  expect(document.querySelector('[role=tabpanel]:not([inert]) .employee-identity')).toBeNull()
  await act(async () => button('基础配置').click())
  expect(identityInput.closest<HTMLElement>('[role=tabpanel]')?.hasAttribute('inert')).toBe(false)
  expect(identityInput.disabled).toBe(false)
  expect(document.querySelector<HTMLButtonElement>('[aria-label="更换员工头像"]')!.disabled).toBe(false)
  expect(request.mock.calls.some(([method]) => method === 'saveAgent')).toBe(false)
})

const resources: Resource[] = [
  { id: 'skill-resource', kind: 'skill', name: '资料检索', description: '检索说明', path: '/fixture/skill', createdAt: '2026-10-17' },
  { id: 'knowledge-resource', kind: 'knowledge', name: '知识库', description: '知识说明', path: '/fixture/knowledge', createdAt: '2026-10-17' },
]
function sourceCatalog(method: string): DataSource[] | undefined {
  const common = { enabled: true, guide: '', revision: 1, createdAt: '2026-10-18T00:00:00Z', updatedAt: '2026-10-18T00:00:00Z', hasCredential: false }
  return method === 'listDataSources' ? [
    { ...common, id: 'source', name: '本地文件夹', type: 'local', description: '资料目录', local: { path: '/fixture/materials' } },
    { ...common, id: 'second-source', name: 'MCP资料', type: 'mcp', description: '检索服务', mcp: { transport: 'http', authType: 'none', url: 'https://mcp.example.test/mcp' } },
  ] : undefined
}
async function sourceAction(name: string, action: string) {
  await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="数据源操作 ${name}"]`)!.click())
  const item = [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(item => item.textContent === action)!
  expect(item).toBeDefined()
  await act(async () => item.click())
}
async function openSourceDetails(name: string) { await sourceAction(name, '打开详情') }
async function removeSource(name: string) {
  await sourceAction(name, '移除')
  await act(async () => button('确认移除').click())
}
async function addSource(name: string) {
  await act(async () => button('添加数据源').click())
  await act(async () => [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(item => item.textContent === name)!.click())
}

test('bound sources use text menus and confirmation before removal, with re-add and versioned draft save', async () => {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'saveAgent' ? { ...agent, ...(input as AgentInput), configVersion: 4 } : sourceCatalog(method) ?? original(method, input))
  const f = await fixture('employee')
  const sourceRow = () => document.querySelector('[aria-label="数据源操作 本地文件夹"]')
  expect(document.querySelector('section[aria-label="数据源"] [role=checkbox]')).toBeNull()
  expect(document.querySelector('[aria-label="数据源操作 MCP资料"]')).toBeNull()
  expect(button('添加数据源').closest('.contact-section-heading')).not.toBeNull()
  await act(async () => (sourceRow() as HTMLButtonElement).click())
  const items = [...document.querySelectorAll<HTMLElement>('[role=menuitem]')]
  expect(items.map(item => item.textContent)).toEqual(['打开详情', '移除'])
  expect(items.every(item => !item.querySelector('svg, .app-icon'))).toBe(true)
  await act(async () => items[1].click())
  expect(document.querySelector('[data-slot=popover-title]')?.textContent).toBe('移除“本地文件夹”？')
  expect(sourceRow()).not.toBeNull()
  await act(async () => document.querySelector<HTMLButtonElement>('[data-slot=popover-content] button')!.click())
  expect(sourceRow()).not.toBeNull()
  await removeSource('本地文件夹')
  expect(sourceRow()).toBeNull()
  await addSource('本地文件夹')
  expect(sourceRow()).not.toBeNull()
  await removeSource('本地文件夹')
  expect(sourceRow()).toBeNull()
  expect(request.mock.calls.some(([method]) => method === 'saveAgent' || method === 'removeDataSource' || method === 'deleteDataSource')).toBe(false)
  await act(async () => button('保存修改').click())
  expect(request).toHaveBeenCalledWith('saveAgent', expect.objectContaining({ expectedConfigVersion: 3, sourceIds: [] }))
  expect(f.closed).toHaveBeenCalledOnce()
})

test('skill selection uses a single removable local or favorites search tag without changing bindings', async () => {
  const skills: LocalSkill[] = [
    { id: 'local:alpha', slug: 'alpha', name: 'Alpha 技能', description: '资料检索', path: '/fixture/alpha', source: 'global', sourceLabel: '本机技能' },
    { id: 'local:beta', slug: 'beta', name: 'Beta 技能', description: '文件整理', path: '/fixture/beta', source: 'global', sourceLabel: '本机技能' },
  ]
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'listLocalSkills' ? { skills, issues: [] } : method === 'getSkillCollections' ? { revision: 1, favoriteResourceIds: ['local:beta'], groups: [], groupByResourceId: {} } : original(method, input))
  await fixture('employee')
  await act(async () => button('从本机技能选择').click())
  const dialog = [...document.querySelectorAll('[role=dialog]')].at(-1)!
  const rows = () => [...dialog.querySelectorAll('button[aria-label^="选择本机技能 "]')].map(item => item.getAttribute('aria-label'))
  const tags = () => dialog.querySelectorAll('[aria-label="技能搜索"] [data-slot=badge]')
  expect(dialog.querySelector('[data-slot=dialog-title]')?.textContent).toBe('选择技能')
  expect(dialog.querySelector('[data-slot=dialog-description]')).toBeNull()
  expect(rows()).toHaveLength(2)
  await act(async () => dialog.querySelector<HTMLButtonElement>('[aria-label="筛选收藏技能"]')!.click())
  expect(tags()).toHaveLength(1)
  expect(tags()[0].textContent).toBe('收藏')
  expect(rows()).toEqual(['选择本机技能 Beta 技能（本机技能）'])
  await change(dialog.querySelector<HTMLInputElement>('[aria-label="搜索本机技能"]')!, 'Alpha')
  expect(rows()).toHaveLength(0)
  await act(async () => dialog.querySelector<HTMLButtonElement>('[aria-label="筛选本地技能"]')!.click())
  expect(tags()).toHaveLength(1)
  expect(tags()[0].textContent).toBe('本地')
  expect(rows()).toEqual(['选择本机技能 Alpha 技能（本机技能）'])
  await act(async () => dialog.querySelector<HTMLButtonElement>('[aria-label="清除技能来源筛选"]')!.click())
  expect(tags()).toHaveLength(0)
  expect(rows()).toHaveLength(1)
  expect(dialog.querySelector<HTMLInputElement>('[aria-label="搜索本机技能"]')!.value).toBe('Alpha')
  await change(dialog.querySelector<HTMLInputElement>('[aria-label="搜索本机技能"]')!, '')
  expect(rows()).toHaveLength(2)
  expect(request.mock.calls.some(([method]) => method === 'prepareLocalSkillBinding' || method === 'bindLocalSkill' || method === 'saveAgent' || method === 'updateSkillCollections')).toBe(false)
})

test('system files edit in a separate dialog with local draft protection and a busy close lock', async () => {
  const file: AgentFileContent = { name: 'SOUL.md', purpose: '员工风格', kind: 'source', path: '/fixture/SOUL.md', hash: 'old-hash', status: 'current', content: '原来的风格' }
  const home: AgentHome = { agentId: agent.id, workspacePath: '/fixture/workspace', memoryNamespace: 'employee:ds', configVersion: 3, files: [file] }
  const original = request.getMockImplementation()!
  let finishSave!: (value: AgentHome) => void
  let saved = false
  request.mockImplementation(async (method, input) => {
    if (method === 'getAgentHome') return home
    if (method === 'readAgentFile') return saved ? { ...file, content: '新的风格', hash: 'new-hash' } : file
    if (method === 'saveAgentFile') return new Promise<AgentHome>(resolve => { finishSave = value => { saved = true; resolve(value) } })
    return original(method, input)
  })
  const f = await fixture('employee')
  await act(async () => button('系统文件').click())
  const fileRow = document.querySelector<HTMLButtonElement>('.file-row')!
  await act(async () => fileRow.click())
  const editor = document.querySelector<HTMLTextAreaElement>('[aria-label="SOUL.md 内容"]')!
  const popup = editor.closest<HTMLElement>('[role=dialog]')!
  expect(popup).not.toBe(document.querySelector('[aria-label="员工名称"]')!.closest('[role=dialog]'))
  expect(fileRow.isConnected).toBe(true)
  expect(document.querySelector('[role=tab][aria-label="系统文件"]')?.getAttribute('aria-selected')).toBe('true')
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor, '新的风格'); editor.dispatchEvent(new Event('input', { bubbles: true })) })
  await act(async () => popup.querySelector<HTMLButtonElement>('[aria-label="关闭系统文件 SOUL.md"]')!.click())
  expect(document.querySelector('[role=alertdialog][data-open]')).not.toBeNull()
  await act(async () => document.querySelector<HTMLButtonElement>('[role=alertdialog][data-open] [data-slot=alert-dialog-cancel]')!.click())
  expect(editor.value).toBe('新的风格')
  expect(f.closed).not.toHaveBeenCalled()
  await act(async () => popup.querySelector<HTMLFormElement>('form')!.requestSubmit())
  expect(request).toHaveBeenCalledWith('saveAgentFile', { agentId: agent.id, name: file.name, content: '新的风格', expectedHash: file.hash, expectedConfigVersion: 3 })
  expect(popup.querySelector<HTMLButtonElement>('[aria-label="关闭系统文件 SOUL.md"]')!.disabled).toBe(true)
  expect(editor.disabled).toBe(true)
  await act(async () => finishSave({ ...home, configVersion: 4 }))
  const closeFile = document.querySelector<HTMLButtonElement>('[aria-label="关闭系统文件 SOUL.md"]')!
  expect(closeFile.disabled).toBe(false)
  await act(async () => closeFile.click())
  expect(document.querySelector('[aria-label="SOUL.md 内容"]')).toBeNull()
  expect(fileRow.isConnected).toBe(true)
  expect(document.querySelector('[aria-label="员工名称"]')).not.toBeNull()
  expect(request.mock.calls.filter(([method]) => method === 'saveAgentFile')).toHaveLength(1)
  expect(request.mock.calls.some(([method]) => method === 'saveAgent' || method === 'saveMemory')).toBe(false)
})

test('generated system files remain read-only in the separate dialog', async () => {
  const file: AgentFileContent = { name: 'MEMORY.md', purpose: '记忆视图', kind: 'generated', path: '/fixture/MEMORY.md', hash: 'memory-hash', status: 'current', content: '生成的记忆' }
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'getAgentHome' ? { agentId: agent.id, workspacePath: '/fixture/workspace', memoryNamespace: 'employee:ds', configVersion: 3, files: [file] } : method === 'readAgentFile' ? file : original(method, input))
  await fixture('employee')
  await act(async () => button('系统文件').click())
  await act(async () => document.querySelector<HTMLButtonElement>('.file-row')!.click())
  const editor = document.querySelector<HTMLTextAreaElement>('[aria-label="MEMORY.md 内容"]')!
  expect(editor.readOnly).toBe(true)
  const popup = editor.closest<HTMLElement>('[role=dialog]')!
  expect([...popup.querySelectorAll('button')].map(item => item.textContent)).toEqual(expect.arrayContaining(['查看记忆', '导入为记忆', '重新生成视图']))
  expect(popup.textContent).not.toContain('保存文件')
  await act(async () => popup.querySelector<HTMLButtonElement>('[aria-label="关闭系统文件 MEMORY.md"]')!.click())
  expect(document.querySelector('[aria-label="MEMORY.md 内容"]')).toBeNull()
  expect(request.mock.calls.some(([method]) => method === 'saveAgentFile' || method === 'regenerateAgentViews' || method === 'saveMemory')).toBe(false)
})

const channelBinding: ChannelBindingState = {
  id: 'channel:feishu', agentId: agent.id, platform: 'feishu', appId: 'app-fixture', name: '员工飞书连接',
  allowedUserIds: ['owner', 'colleague'], allowedChatIds: ['team'], ownerUserId: 'owner',
  enabled: false, revision: 7, hasCredential: true, installedAt: '2026-10-18T00:00:00Z', updatedAt: '2026-10-18T00:00:00Z',
  status: 'disconnected', pendingDeliveries: 0,
}
async function channelFixture(bindings = () => [channelBinding]) {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'listChannelBindings' ? bindings() : method === 'listChannelDeliveries' ? [] : original(method, input))
  const f = await fixture('employee')
  await act(async () => button('渠道').click())
  return f
}
async function openChannelEditor() {
  await act(async () => button('编辑绑定').click())
  return document.querySelector<HTMLInputElement>('[aria-label="绑定名称"]')!.closest<HTMLElement>('[role=dialog]')!
}

test('channel binding editing opens a separate dialog and discards only its local draft after explicit exit', async () => {
  const f = await channelFixture()
  const edit = button('编辑绑定'), parent = edit.closest('[role=dialog]')
  const popup = await openChannelEditor()
  expect(popup).not.toBe(parent)
  expect(popup.querySelector('[data-slot=dialog-title]')?.textContent).toBe('编辑渠道绑定')
  expect(edit.isConnected).toBe(true)
  expect(document.querySelector('[role=tab][aria-label="渠道"]')?.getAttribute('aria-selected')).toBe('true')
  const name = popup.querySelector<HTMLInputElement>('[aria-label="绑定名称"]')!
  await change(name, '未保存的渠道名称')
  await act(async () => popup.querySelector<HTMLButtonElement>('[aria-label="关闭渠道绑定编辑"]')!.click())
  const confirm = document.querySelector('[role=alertdialog][data-open]')!
  expect(confirm.textContent).toContain('有未保存的修改')
  await act(async () => confirm.querySelector<HTMLButtonElement>('[data-slot=alert-dialog-cancel]')!.click())
  expect(name.value).toBe('未保存的渠道名称')
  expect(f.closed).not.toHaveBeenCalled()
  await act(async () => popup.querySelector<HTMLButtonElement>('[aria-label="关闭渠道绑定编辑"]')!.click())
  await act(async () => button('退出').click())
  expect(document.querySelector('[aria-label="绑定名称"]')).toBeNull()
  expect(edit.isConnected).toBe(true)
  expect(parent?.isConnected).toBe(true)
  expect(f.closed).not.toHaveBeenCalled()
  const reopened = await openChannelEditor()
  expect(reopened.querySelector<HTMLInputElement>('[aria-label="绑定名称"]')!.value).toBe(channelBinding.name)
  expect(request.mock.calls.some(([method]) => method === 'saveChannelBinding' || method === 'saveAgent')).toBe(false)
})

test('channel save locks its dialog, submits the original binding revision once, and refreshes the retained list', async () => {
  const original = request.getMockImplementation()!
  let finish!: (binding: ChannelBindingState) => void
  let current = channelBinding
  request.mockImplementation(async (method, input) => method === 'saveChannelBinding' ? new Promise<ChannelBindingState>(resolve => { finish = value => { current = value; resolve(value) } }) : original(method, input))
  const f = await channelFixture(() => [current])
  const edit = button('编辑绑定'), parent = edit.closest('[role=dialog]')!
  const popup = await openChannelEditor()
  const name = popup.querySelector<HTMLInputElement>('[aria-label="绑定名称"]')!
  await change(name, '已修改的渠道名称')
  await act(async () => popup.querySelector<HTMLFormElement>('form')!.requestSubmit())
  expect(request).toHaveBeenCalledWith('saveChannelBinding', {
    id: channelBinding.id, expectedRevision: 7, agentId: agent.id, platform: 'feishu', appId: channelBinding.appId,
    name: '已修改的渠道名称', allowedUserIds: ['owner', 'colleague'], allowedChatIds: ['team'], ownerUserId: 'owner', requestId: expect.any(String),
  })
  expect(name.disabled || name.closest('fieldset')?.disabled).toBe(true)
  expect(popup.querySelector<HTMLButtonElement>('[aria-label="关闭渠道绑定编辑"]')!.disabled).toBe(true)
  const cancel = [...popup.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === '取消')!
  expect(cancel.disabled || cancel.closest('fieldset')?.disabled).toBe(true)
  await act(async () => popup.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(f.closed).not.toHaveBeenCalled()
  expect(name.isConnected).toBe(true)
  await act(async () => finish({ ...channelBinding, name: '已修改的渠道名称', revision: 8 }))
  expect(document.querySelector('[aria-label="绑定名称"]')).toBeNull()
  expect(parent.isConnected).toBe(true)
  expect(parent.textContent).toContain('已修改的渠道名称')
  expect(button('编辑绑定')).toBe(edit)
  expect(f.closed).not.toHaveBeenCalled()
  expect(f.backgroundSubmit).not.toHaveBeenCalled()
  expect(request.mock.calls.filter(([method]) => method === 'saveChannelBinding')).toHaveLength(1)
  expect(request.mock.calls.filter(([method]) => method === 'listChannelBindings')).toHaveLength(2)
})

test('an unconfirmed channel save keeps its dialog locked and only looks up the frozen request before closing', async () => {
  const original = request.getMockImplementation()!
  let finishReceipt!: (binding: ChannelBindingState) => void
  request.mockImplementation(async (method, input) => {
    if (method === 'saveChannelBinding') throw new Error('连接中断，保存结果未知')
    if (method === 'getChannelBindingReceipt') return new Promise<ChannelBindingState>(resolve => { finishReceipt = resolve })
    return original(method, input)
  })
  const f = await channelFixture()
  const parent = button('编辑绑定').closest('[role=dialog]')!
  const popup = await openChannelEditor()
  const name = popup.querySelector<HTMLInputElement>('[aria-label="绑定名称"]')!
  await change(name, '等待核对的渠道名称')
  await act(async () => popup.querySelector<HTMLFormElement>('form')!.requestSubmit())
  const submitted = request.mock.calls.find(([method]) => method === 'saveChannelBinding')![1] as ChannelBindingInput
  expect(submitted).toMatchObject({ id: channelBinding.id, expectedRevision: 7, name: '等待核对的渠道名称' })
  expect(name.disabled || name.closest('fieldset')?.disabled).toBe(true)
  expect(popup.querySelector<HTMLButtonElement>('[aria-label="关闭渠道绑定编辑"]')!.disabled).toBe(true)
  await act(async () => popup.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  expect(name.isConnected).toBe(true)
  expect(f.closed).not.toHaveBeenCalled()
  await act(async () => popup.querySelector<HTMLFormElement>('form')!.requestSubmit())
  await act(async () => button('核对保存结果').click())
  expect(request).toHaveBeenCalledWith('getChannelBindingReceipt', { agentId: agent.id, requestId: submitted.requestId })
  expect(request.mock.calls.filter(([method]) => method === 'saveChannelBinding')).toHaveLength(1)
  expect(popup.querySelector<HTMLButtonElement>('[aria-label="关闭渠道绑定编辑"]')!.disabled).toBe(true)
  await act(async () => finishReceipt({ ...channelBinding, name: submitted.name, revision: 8 }))
  expect(document.querySelector('[aria-label="绑定名称"]')).toBeNull()
  expect(parent.isConnected).toBe(true)
  expect(f.closed).not.toHaveBeenCalled()
  expect(request.mock.calls.filter(([method]) => method === 'saveChannelBinding')).toHaveLength(1)
})

test('an employee without channel bindings keeps the inline create form', async () => {
  await channelFixture(() => [])
  expect(document.querySelectorAll('[role=dialog][data-open]')).toHaveLength(1)
  expect(document.querySelector('[role=dialog]')?.textContent).toContain('添加渠道绑定')
  expect(document.querySelector('[aria-label="关闭渠道绑定编辑"]')).toBeNull()
  expect(button('添加绑定')).toBeDefined()
  expect(request.mock.calls.some(([method]) => method === 'saveChannelBinding')).toBe(false)
})

test('skill multi-selection only binds on final add and preserves source drafts across committed versions', async () => {
  const localSkill: LocalSkill = { id: 'local:research', name: '资料检索', slug: 'research', description: '检索说明', path: '/fixture/local', source: 'global', sourceLabel: '本机技能' }
  const secondSkill = { ...localSkill, id: 'local:files', name: '文件整理', slug: 'files' }
  const secondResource = { ...resources[0], id: 'second-skill', name: '文件整理' }
  const plan: SkillBindingPlan = { id: 'plan', candidateId: 'candidate', agentId: agent.id, localSkillId: localSkill.id, expectedConfigVersion: 3, localSkill, expiresAt: new Date(Date.now() + 60_000).toISOString(), source: { kind: 'local', identity: 'fixture' }, contentHash: 'a'.repeat(64), warnings: [] }
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => {
    if (method === 'listDataSources') return sourceCatalog(method)
    if (method === 'listLocalSkills') return { skills: [localSkill, secondSkill], issues: [] }
    if (method === 'prepareLocalSkillBinding') {
      const second = (input as { localSkillId: string }).localSkillId === secondSkill.id
      return second ? { ...plan, id: 'second-plan', localSkillId: secondSkill.id, localSkill: secondSkill, expectedConfigVersion: 4 } : plan
    }
    if (method === 'bindLocalSkill') {
      const second = (input as BindLocalSkillInput).localSkillId === secondSkill.id
      return { ...(input as BindLocalSkillInput), id: (input as BindLocalSkillInput).requestId, status: 'completed', source: plan.source, createdAt: '2026-10-17', resource: second ? secondResource : resources[0], agent: { ...agent, skillIds: second ? [resources[0].id, secondResource.id] : [resources[0].id], configVersion: second ? 5 : 4 } }
    }
    if (method === 'saveAgent') return { ...agent, ...(input as AgentInput), configVersion: 6 }
    return original(method, input)
  })
  const f = await fixture('employee')
  expect(document.querySelector('[role=tab][aria-label="基础配置"]')).not.toBeNull()
  expect(button('从本机技能选择').closest('.contact-section-heading')).not.toBeNull()
  expect(button('从本机技能选择').closest('[data-slot=card]')).toBeNull()
  expect(document.querySelector('section[aria-label="技能"] [data-slot=card]')).toBeNull()
  await change(document.querySelector<HTMLInputElement>('[aria-label="员工名称"]')!, '未保存姓名')
  await removeSource('本地文件夹')
  expect(button('从本机技能选择').disabled).toBe(false)
  expect(document.body.textContent).not.toContain('请先保存员工配置，再绑定本机技能。')
  await act(async () => button('从本机技能选择').click())
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="选择本机技能 资料检索（本机技能）"]')!.click())
  expect(document.querySelector('section[aria-label="已选技能"]')?.textContent).toContain('资料检索')
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="移除技能 资料检索"]')!.click())
  expect(document.querySelector('section[aria-label="已选技能"]')?.textContent).toContain('已选择 0 个技能')
  expect(button('添加').disabled).toBe(true)
  await act(async () => document.querySelector<HTMLButtonElement>('[role=checkbox][aria-label="选择技能 资料检索"]')!.click())
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="选择本机技能 文件整理（本机技能）"]')!.click())
  expect(document.querySelector('section[aria-label="已选技能"]')?.textContent).toContain('已选择 2 个技能')
  expect(request.mock.calls.some(([method]) => method === 'prepareLocalSkillBinding' || method === 'bindLocalSkill')).toBe(false)
  await act(async () => button('添加').click())
  expect(request.mock.calls.filter(([method]) => method === 'prepareLocalSkillBinding').map(([, input]) => input)).toEqual([
    { localSkillId: localSkill.id, agentId: agent.id, expectedConfigVersion: 3 },
    { localSkillId: secondSkill.id, agentId: agent.id, expectedConfigVersion: 4 },
  ])
  expect(request.mock.calls.filter(([method]) => method === 'bindLocalSkill')).toHaveLength(2)
  expect(request.mock.calls.some(([method]) => method === 'saveAgent' || method === 'getSkillPreview')).toBe(false)
  expect(document.querySelector('[role=dialog][data-open] section[aria-label="已选技能"]')).toBeNull()
  expect(document.querySelector('section[aria-label="技能"] [role=checkbox]')).toBeNull()
  expect(document.body.textContent).not.toContain('已添加技能')
  expect(document.querySelector('.banner.notice')).toBeNull()
  await act(async () => button('从本机技能选择').click())
  for (const skill of [localSkill, secondSkill]) expect(document.querySelector(`[aria-label="选择本机技能 ${skill.name}（本机技能）"]`)?.getAttribute('aria-pressed')).toBe('true')
  expect(button('添加').disabled).toBe(true)
  const selector = [...document.querySelectorAll('[role=dialog]')].at(-1)!
  await act(async () => [...selector.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === '取消')!.click())
  expect(request.mock.calls.filter(([method]) => method === 'bindLocalSkill')).toHaveLength(2)
  expect(document.querySelector<HTMLInputElement>('[aria-label="员工名称"]')!.value).toBe('未保存姓名')
  expect(document.querySelector('[aria-label="数据源操作 本地文件夹"]')).toBeNull()
  await act(async () => button('保存修改').click())
  expect(request).toHaveBeenCalledWith('saveAgent', expect.objectContaining({ expectedConfigVersion: 5, name: '未保存姓名', sourceIds: [], skillIds: [resources[0].id, secondResource.id] }))
  expect(f.closed).toHaveBeenCalledOnce()
})

test('an unknown skill addition stops the selection queue and lookup never submits remaining skills', async () => {
  const skills: LocalSkill[] = ['first', 'second', 'third'].map(name => ({ id: `local:${name}`, slug: name, name, description: '', path: `/fixture/${name}`, source: 'global', sourceLabel: '本机技能' }))
  const original = request.getMockImplementation()!
  let unknown: BindLocalSkillInput | undefined
  request.mockImplementation(async (method, input) => {
    if (method === 'listLocalSkills') return { skills, issues: [] }
    if (method === 'prepareLocalSkillBinding') {
      const value = input as { localSkillId: string; expectedConfigVersion: number }
      return { ...value, id: `plan:${value.localSkillId}`, candidateId: 'candidate', agentId: agent.id, localSkill: skills.find(skill => skill.id === value.localSkillId)!, expiresAt: new Date(Date.now() + 60_000).toISOString(), source: { kind: 'local', identity: value.localSkillId }, contentHash: 'a'.repeat(64), warnings: [] } satisfies SkillBindingPlan
    }
    if (method === 'bindLocalSkill') {
      const value = input as BindLocalSkillInput
      if (value.localSkillId === skills[1].id) { unknown = value; throw new Error('连接中断') }
      return { ...value, id: value.requestId, status: 'completed', createdAt: '2026-10-17', resource: { ...resources[0], id: 'managed:first' }, agent: { ...agent, configVersion: 4, skillIds: ['managed:first'] } }
    }
    if (method === 'getSkillBindingReceipt') return { ...unknown!, id: unknown!.requestId, status: 'completed', createdAt: '2026-10-17', resource: { ...resources[0], id: 'managed:second' }, agent: { ...agent, configVersion: 5, skillIds: ['managed:first', 'managed:second'] } }
    return original(method, input)
  })
  await fixture('employee')
  await act(async () => button('从本机技能选择').click())
  for (const skill of skills) await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="选择本机技能 ${skill.name}（本机技能）"]`)!.click())
  await act(async () => button('添加').click())
  expect(request.mock.calls.filter(([method]) => method === 'bindLocalSkill')).toHaveLength(2)
  expect(document.querySelector('section[aria-label="已选技能"]')?.textContent).toContain('已选择 3 个技能')
  expect(document.querySelector<HTMLButtonElement>('[aria-label="已绑定技能 资料检索"] [aria-label="移除技能 资料检索"]')?.disabled).toBe(true)
  expect(document.body.textContent).not.toContain('添加结果待核对')
  expect(document.querySelector('[role=status]')).toBeNull()
  await act(async () => button('核对添加结果').click())
  expect(request).toHaveBeenCalledWith('getSkillBindingReceipt', { requestId: unknown!.requestId })
  expect(request.mock.calls.filter(([method]) => method === 'bindLocalSkill')).toHaveLength(2)
  expect(request.mock.calls.filter(([method]) => method === 'prepareLocalSkillBinding')).toHaveLength(2)
  expect(document.querySelector('section[aria-label="已选技能"]')?.textContent).toContain('已选择 3 个技能')
  expect(document.querySelector('[aria-label="移除技能 third"]')).not.toBeNull()
  expect(button('添加').disabled).toBe(false)
})

test('the selector checks existing bindings by installation identity and offers no details action', async () => {
  const skill: LocalSkill = { id: 'local:research', name: '资料检索', slug: 'research', description: '', path: '/fixture/local', source: 'global', sourceLabel: '本机技能' }
  const sameName = { ...skill, id: 'local:other', source: 'plugin' as const, sourceLabel: '另一个来源' }
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'listLocalSkills' ? { skills: [skill, sameName], issues: [] } : method === 'listSkillInstallations' ? [{ resourceId: resources[0].id, localSkillId: skill.id }] : original(method, input))
  await fixture('employee', { ...snapshot, agents: [{ ...agent, skillIds: [resources[0].id] }], resources })
  await act(async () => button('从本机技能选择').click())
  const dialog = [...document.querySelectorAll('[role=dialog]')].at(-1)!
  const bound = dialog.querySelector<HTMLButtonElement>('[aria-label="选择本机技能 资料检索（本机技能）"]')!
  expect(bound.getAttribute('aria-pressed')).toBe('true')
  expect(bound.disabled).toBe(true)
  expect(dialog.querySelector('[aria-label="已绑定技能 资料检索"]')).not.toBeNull()
  const selectedRow = dialog.querySelector('[aria-label="已绑定技能 资料检索"]')!
  expect(selectedRow.classList.contains('creation-member')).toBe(true)
  expect(selectedRow.tagName).toBe('DIV')
  expect(dialog.querySelector('[aria-label^="技能操作 "]')).toBeNull()
  expect(dialog.querySelector('[aria-label="选择本机技能 资料检索（另一个来源）"]')?.getAttribute('aria-pressed')).toBe('false')
  expect(button('添加').disabled).toBe(true)
  await act(async () => selectedRow.querySelector<HTMLButtonElement>('[aria-label="移除技能 资料检索"]')!.click())
  expect(dialog.querySelector('section[aria-label="已选技能"]')?.textContent).toContain('已选择 0 个技能')
  expect(bound.getAttribute('aria-pressed')).toBe('false')
  expect(bound.disabled).toBe(false)
  await act(async () => bound.click())
  expect(dialog.querySelector('section[aria-label="已选技能"]')?.textContent).toContain('已选择 1 个技能')
  expect(bound.getAttribute('aria-pressed')).toBe('true')
  expect(button('添加').disabled).toBe(true)
  await act(async () => dialog.querySelector<HTMLButtonElement>('[aria-label="选择本机技能 资料检索（另一个来源）"]')!.click())
  expect(button('添加').disabled).toBe(false)
  expect(request.mock.calls.some(([method]) => method === 'prepareLocalSkillBinding' || method === 'bindLocalSkill' || method === 'getSkillPreview')).toBe(false)
})

test('bound skill menus protect unsaved details navigation and remove only the employee draft binding', async () => {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'saveAgent' ? { ...agent, ...(input as AgentInput), configVersion: 4 } : original(method, input))
  const f = await fixture('employee', { ...snapshot, agents: [{ ...agent, skillIds: [resources[0].id] }], resources })
  const openMenu = async () => { await act(async () => document.querySelector<HTMLButtonElement>('section[aria-label="技能"] [aria-label="技能操作 资料检索"]')!.click()) }
  const openDetails = async () => { await act(async () => [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(item => item.textContent === '打开详情')!.click()) }
  expect(document.querySelector('section[aria-label="技能"] [role=checkbox]')).toBeNull()
  expect(document.querySelector('[aria-label="查看技能 资料检索"]')).toBeNull()
  await change(document.querySelector<HTMLInputElement>('[aria-label="员工名称"]')!, '未保存姓名')
  await openMenu()
  expect(f.openResource).not.toHaveBeenCalled()
  await openDetails()
  await act(async () => document.querySelector<HTMLButtonElement>('[role=alertdialog] [data-slot=alert-dialog-cancel]')!.click())
  expect(f.closed).not.toHaveBeenCalled()
  expect(document.querySelector<HTMLInputElement>('[aria-label="员工名称"]')!.value).toBe('未保存姓名')
  await openMenu()
  const removeItem = [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(item => item.textContent === '移除')!
  expect(removeItem.getAttribute('data-variant')).toBe('destructive')
  await act(async () => removeItem.click())
  expect(document.querySelector('[data-slot=popover-content]')?.textContent).toContain('移除“资料检索”？')
  expect(document.querySelector('section[aria-label="技能"] [aria-label="技能操作 资料检索"]')).not.toBeNull()
  expect(request.mock.calls.some(([method]) => method === 'saveAgent' || method === 'deleteResource' || method === 'bindLocalSkill')).toBe(false)
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[data-slot=popover-content] button')].find(item => item.textContent === '取消')!.click())
  expect(document.querySelector('[data-slot=popover-content][data-open]')).toBeNull()
  expect(document.querySelector('section[aria-label="技能"] [aria-label="技能操作 资料检索"]')).not.toBeNull()
  await openMenu()
  await act(async () => [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(item => item.textContent === '移除')!.click())
  await act(async () => button('确认移除').click())
  expect(document.querySelector('section[aria-label="技能"] [aria-label="技能操作 资料检索"]')).toBeNull()
  expect(request.mock.calls.some(([method]) => method === 'saveAgent' || method === 'deleteResource' || method === 'bindLocalSkill')).toBe(false)
  await act(async () => button('保存修改').click())
  expect(request).toHaveBeenCalledWith('saveAgent', expect.objectContaining({ expectedConfigVersion: 3, name: '未保存姓名', skillIds: [] }))
  expect(f.closed).toHaveBeenCalledOnce()
})

test.each([
  ['技能操作 资料检索', 'resource', 'skill-resource'],
  ['知识资料 · 1 份', 'knowledge-files', agent.id],
  ['数据源操作 本地文件夹', 'source', 'source'],
])('%s closes the employee dialog before opening its existing resource or knowledge-files destination without changing bindings', async (label, kind, id) => {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => sourceCatalog(method) ?? original(method, input))
  const f = await fixture('employee', { ...snapshot, agents: [{ ...agent, skillIds: [resources[0].id], knowledgeIds: [resources[1].id] }], resources })
  if (kind === 'source') await openSourceDetails('本地文件夹')
  else if (id === 'skill-resource') {
    await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click())
    await act(async () => [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(item => item.textContent === '打开详情')!.click())
  }
  else await act(async () => button(label).click())
  expect(f.closed).toHaveBeenCalledOnce()
  expect(f.openResource).toHaveBeenCalledWith(expect.objectContaining({ kind, id }))
  expect(f.closed.mock.invocationCallOrder[0]).toBeLessThan(f.openResource.mock.invocationCallOrder[0]!)
  expect(request.mock.calls.some(([method]) => method === 'saveAgent' || method === 'bindLocalSkill')).toBe(false)
})

test('resource navigation protects an unsaved source choice until the user explicitly exits', async () => {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => sourceCatalog(method) ?? original(method, input))
  const f = await fixture('employee')
  await addSource('MCP资料')
  await openSourceDetails('本地文件夹')
  expect(document.querySelector('[role=alertdialog]')).not.toBeNull()
  expect(f.openResource).not.toHaveBeenCalled()
  await act(async () => document.querySelector<HTMLButtonElement>('[role=alertdialog] [data-slot=alert-dialog-cancel]')!.click())
  expect(document.querySelector('[aria-label="数据源操作 MCP资料"]')).not.toBeNull()
  expect(f.closed).not.toHaveBeenCalled()
  await openSourceDetails('本地文件夹')
  await act(async () => button('退出').click())
  expect(f.openResource).toHaveBeenCalledWith({ kind: 'source', id: 'source', name: '本地文件夹' })
  expect(f.closed).toHaveBeenCalledOnce()
  expect(request.mock.calls.some(([method]) => method === 'saveAgent')).toBe(false)
})
