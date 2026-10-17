// @vitest-environment jsdom
/*
 * [OUTPUT]: 技能弹窗搜索与本地/收藏互斥标签复用实际目录/收藏，筛选/清除不提交绑定；原预览/确认绑定保持。
 * [OUTPUT]: 数据源通过更多操作菜单打开详情，菜单展开不导航或改变绑定，原未保存确认保持。
 * [OUTPUT]: Codex/Claude编辑仅一个执行权限字段，三档选择真实提交对应原生访问与审批参数。
 * [OUTPUT]: 勾选源不锁技能，真实绑定回执更新版本并保留草稿；三类资源查看经原草稿守卫关闭弹窗后导航。
 * [OUTPUT]: 员工编辑无可见标题/无外层内边距，使用竖排菜单与贴边滚动内容，切换继续保护草稿，员工组与创建保持原导航。
 * [OUTPUT]: 配置页保留可编辑头像/姓名/职责，其他分类隐藏身份表单，原草稿和保存检查保持。
 * [INPUT]: 生产通讯录编辑/创建Dialog、原员工/群表单与受控IPC回执。
 * [OUTPUT]: 新建/编辑员工分区Card与群原布局、Portal底页保留、未保存确认仅取消/退出、原表单保存/版本核对及忙时关闭锁；执行记录关闭弹窗后打开全局面板。
 * [POS]: 通讯录弹窗组件回归，不运行E2E、模型或修改用户配置。
 * [PROTOCOL]: 修改同步Header和tests/.folder.md。
 */
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AgentInput, Conversation, DigitalAgent, Resource, Snapshot } from '../src/shared/domain'
import type { BindLocalSkillInput, LocalSkill, SkillBindingPlan } from '../src/shared/domain/skills'
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
    if (method === 'listLaunchProfiles' || method === 'listDataSources') return []
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

test.each(['employee', 'group'] as const)('%s editing uses the shared connection dialog and keeps its background', async kind => {
  const f = await fixture(kind), background = host.querySelector('[data-background]')
  const dialog = document.querySelector('[role=dialog]')!
  expect(dialog.classList.contains(kind === 'employee' ? 'employee-editor-dialog' : 'connection-dialog')).toBe(true)
  expect(dialog.querySelector(kind === 'employee' ? '.employee-form-layout' : '.contact-configuration-card')).not.toBeNull()
  expect(dialog.querySelector(kind === 'employee' ? '.employee-detail-main>[data-slot=scroll-area-viewport]' : '.connection-dialog-body [data-slot=scroll-area-viewport]')).not.toBeNull()
  if (kind === 'employee') {
    expect(dialog.querySelector('nav[aria-label="员工设置"] [role=tablist]')?.getAttribute('aria-orientation')).toBe('vertical')
    expect(dialog.querySelectorAll('nav[aria-label="员工设置"] [role=tab]')).toHaveLength(7)
    expect(dialog.querySelector('.employee-tabs-bar')).toBeNull()
    expect(dialog.querySelector('.connection-dialog-top')).toBeNull()
    expect(dialog.querySelector('[data-slot=dialog-title]')?.classList.contains('sr-only')).toBe(true)
  }
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

test('group edits retain members and the versioned save contract inside the dialog', async () => {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'createConversation' ? { ...group, ...(input as object), configVersion: 5 } : original(method, input))
  const f = await fixture('group')
  await change(document.querySelector<HTMLInputElement>('input[aria-label="群聊名称"]')!, '研究小组')
  await act(async () => button('保存设置').click())
  expect(request).toHaveBeenCalledWith('createConversation', expect.objectContaining({ id: group.id, title: '研究小组', expectedConfigVersion: 4, agentIds: [agent.id] }))
  expect(f.closed).toHaveBeenCalledOnce()
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
function sourceCatalog(method: string) { return method === 'listDataSources' ? [{ id: 'source', name: '本地文件夹', type: 'local', enabled: true, description: '资料目录' }] : undefined }
async function openSourceDetails(name: string) {
  await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="数据源操作 ${name}"]`)!.click())
  const item = [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(item => item.textContent === '打开详情')!
  expect(item).toBeDefined()
  await act(async () => item.click())
}

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

test('source drafts leave local skill binding available and survive its committed version when the employee is saved', async () => {
  const localSkill: LocalSkill = { id: 'local:research', name: '资料检索', slug: 'research', description: '检索说明', path: '/fixture/local', source: 'global', sourceLabel: '本机技能' }
  const plan: SkillBindingPlan = { id: 'plan', candidateId: 'candidate', agentId: agent.id, localSkillId: localSkill.id, expectedConfigVersion: 3, localSkill, expiresAt: new Date(Date.now() + 60_000).toISOString(), source: { kind: 'local', identity: 'fixture' }, contentHash: 'a'.repeat(64), warnings: [] }
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => {
    if (method === 'listDataSources') return sourceCatalog(method)
    if (method === 'listLocalSkills') return { skills: [localSkill], issues: [] }
    if (method === 'prepareLocalSkillBinding') return plan
    if (method === 'getSkillPreview') return { content: '检索说明', files: [] }
    if (method === 'bindLocalSkill') return { ...(input as BindLocalSkillInput), id: (input as BindLocalSkillInput).requestId, status: 'completed', source: plan.source, createdAt: '2026-10-17', resource: resources[0], agent: { ...agent, skillIds: [resources[0].id], configVersion: 4 } }
    if (method === 'saveAgent') return { ...agent, ...(input as AgentInput), configVersion: 5 }
    return original(method, input)
  })
  const f = await fixture('employee')
  expect(document.querySelector('[role=tab][aria-label="基础配置"]')).not.toBeNull()
  await change(document.querySelector<HTMLInputElement>('[aria-label="员工名称"]')!, '未保存姓名')
  await act(async () => document.querySelector<HTMLButtonElement>('section[aria-label="数据源"] [role=checkbox]')!.click())
  expect(button('从本机技能选择').disabled).toBe(false)
  expect(document.body.textContent).not.toContain('请先保存员工配置，再绑定本机技能。')
  await act(async () => button('从本机技能选择').click())
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="选择本机技能 资料检索（本机技能）"]')!.click())
  expect(request).toHaveBeenCalledWith('prepareLocalSkillBinding', { localSkillId: localSkill.id, agentId: agent.id, expectedConfigVersion: 3 })
  await act(async () => button('确认绑定给 DS').click())
  expect(request.mock.calls.some(([method]) => method === 'saveAgent')).toBe(false)
  await act(async () => button('关闭').click())
  expect(document.querySelector<HTMLInputElement>('[aria-label="员工名称"]')!.value).toBe('未保存姓名')
  expect(document.querySelector('section[aria-label="数据源"] [role=checkbox]')?.getAttribute('aria-checked')).toBe('false')
  await act(async () => button('保存修改').click())
  expect(request).toHaveBeenCalledWith('saveAgent', expect.objectContaining({ expectedConfigVersion: 4, name: '未保存姓名', sourceIds: [], skillIds: [resources[0].id] }))
  expect(f.closed).toHaveBeenCalledOnce()
})

test.each([
  ['查看技能 资料检索', 'resource', 'skill-resource'],
  ['查看知识资料 知识库', 'resource', 'knowledge-resource'],
  ['数据源操作 本地文件夹', 'source', 'source'],
])('%s closes the employee dialog before opening the original resource details without changing bindings', async (label, kind, id) => {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => sourceCatalog(method) ?? original(method, input))
  const f = await fixture('employee', { ...snapshot, resources })
  if (kind === 'source') await openSourceDetails('本地文件夹')
  else await act(async () => document.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!.click())
  expect(f.closed).toHaveBeenCalledOnce()
  expect(f.openResource).toHaveBeenCalledWith(expect.objectContaining({ kind, id }))
  expect(f.closed.mock.invocationCallOrder[0]).toBeLessThan(f.openResource.mock.invocationCallOrder[0]!)
  expect(request.mock.calls.some(([method]) => method === 'saveAgent' || method === 'bindLocalSkill')).toBe(false)
})

test('resource navigation protects an unsaved source choice until the user explicitly exits', async () => {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => sourceCatalog(method) ?? original(method, input))
  const f = await fixture('employee')
  await act(async () => document.querySelector<HTMLButtonElement>('section[aria-label="数据源"] [role=checkbox]')!.click())
  await openSourceDetails('本地文件夹')
  expect(document.querySelector('[role=alertdialog]')).not.toBeNull()
  expect(f.openResource).not.toHaveBeenCalled()
  await act(async () => document.querySelector<HTMLButtonElement>('[role=alertdialog] [data-slot=alert-dialog-cancel]')!.click())
  expect(document.querySelector('section[aria-label="数据源"] [role=checkbox]')?.getAttribute('aria-checked')).toBe('false')
  expect(f.closed).not.toHaveBeenCalled()
  await openSourceDetails('本地文件夹')
  await act(async () => button('退出').click())
  expect(f.openResource).toHaveBeenCalledWith({ kind: 'source', id: 'source', name: '本地文件夹' })
  expect(f.closed).toHaveBeenCalledOnce()
  expect(request.mock.calls.some(([method]) => method === 'saveAgent')).toBe(false)
})
