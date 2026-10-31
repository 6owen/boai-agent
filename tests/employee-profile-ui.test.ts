// @vitest-environment jsdom
/*
 * [OUTPUT]: 2026-10-29 文件浏览器入口/预览/启停与目录撤权回归，原终端生命周期断言保持。
 * [OUTPUT]: 覆盖增大任务额度、真实继续消息或本次运行同类批准；各文件以具体用例限定验证范围。
 * [OUTPUT]: 网页检索独立能力沿全局服务配置保存；业务数据源解绑不重置检索，停用/迟到目录仍验证。
 * [OUTPUT]: 高级配置默认人格与行为，配置源文件/后台记录直接展示，主动交流即时保存；自动化仅展示员工任务；基础配置排除/草稿保护保持。
 * [OUTPUT]: 2026-10-19本机目录限制按用户要求退役；原生配置/工具保持，显式权限可返回本机配置；API目录授权及产品资源核验保持。
 * [OUTPUT]: 独立检索使用真实Select沿草稿保存；失效服务可见，业务数据源解绑不重置检索，旧身份编辑保持。
 * [OUTPUT]: 知识配置使用数量入口；独立资料绑定回填新版本并保留未保存工作方式与目录草稿。
 * [OUTPUT]: 验证组合命令多目录审批显示与本次/持久选项，明确持久目录不改变后续命令审批。
 * [OUTPUT]: 新增目录审批三选项、目录选择仅草稿和审批持久版本回填保留其他未保存字段。
 * [OUTPUT]: 身份自动保存期间维持静默外观标记与导航锁，连续输入保存后清除标记；普通配置保存不进入静默反馈。
 * [INPUT]: 生产EmployeeProfile、原AgentEditor/高级配置Dialog、受控IPC和页面草稿守卫。
 * [OUTPUT]: 身份保存局部更新不刷新页面，保留DOM/焦点/滚动及后台能力读取；原文字编辑、并发草稿/版本保护和高级配置隔离，无E2E。
 * [POS]: 员工资料与编辑的前端交互回归，不调用模型或用户配置。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AgentInput, DigitalAgent, Snapshot } from '../packages/shared/src/domain'
import type { AppEvent, DesktopApi } from '../packages/shared/src/ipc'
import { defaultAgentProfile } from '../packages/shared/src/domain/agent-profile'
import { GuardContext } from '../apps/electron/src/renderer/components/common'
import { useEditorGuard } from '../apps/electron/src/renderer/components/common/use-editor-guard'
import { AgentEditor } from '../apps/electron/src/renderer/components/employee/editors'
import { ApprovalCard } from '../apps/electron/src/renderer/pages/conversations/-components/chat-view'
import { EmployeeProfile } from '../apps/electron/src/renderer/pages/contacts/employee-profile'
import { ContactsPage } from '../apps/electron/src/renderer/pages/contacts'
import { webSourceConfig } from './fixtures/web-search-server'
import { SourcePicker } from '../apps/electron/src/renderer/pages/sources/source-picker'

const agent = { id: 'alice', name: 'Alice', role: '研究员', instructions: '原工作方式', color: '#438b80', configVersion: 3, active: true, connectionId: 'api', modelId: '', executionBackend: { kind: 'mastra-model' }, skillIds: [], knowledgeIds: [], sourceIds: [], allowCommands: true } as DigitalAgent
let root: Root, host: HTMLDivElement, request: ReturnType<typeof vi.fn<(method: string, input?: unknown) => Promise<unknown>>>, api: DesktopApi, committed: DigitalAgent
let resources: Snapshot['resources']
const subscribers = new Set<(event: AppEvent) => void>()
const snapshot = (): Snapshot => ({ agents: [committed], conversations: [], resources, connections: [{ id: 'api', name: '已配置连接', provider: 'openai-compatible', baseUrl: 'https://example.test/v1', defaultModel: '默认模型' }] } as unknown as Snapshot)
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.getAnimations = () => []
  localStorage.clear(); committed = { ...agent }; resources = []; subscribers.clear()
  request = vi.fn(async (method: string, input?: unknown) => {
    if (method === 'getAgentHome') return { agentId: committed.id, configVersion: committed.configVersion, files: [], environment: { skills: committed.skillIds.map(resourceId => ({ resourceId, instructions: 'available' })) } }
    if (method === 'getLaunchProfileStatus') return { status: 'available', profile: { id: 'native', name: '本机 Codex', protocol: 'codex-app-server', verified: { name: 'Codex', version: '1' } } }
    if (['listLaunchProfiles', 'listDataSources', 'listSkillInstallations'].includes(method)) return []
    if (method === 'getWebSearchSettings') return { revision: 0, default: { mode: 'browser' }, services: [] }
    if (method === 'getSkillCollections') return { revision: 1, favoriteResourceIds: [], groups: [], groupByResourceId: {} }
    if (method === 'executeApplicationOperation') {
      const operation = (input as { operation: string }).operation
      const data = operation === 'employees.profile' ? defaultAgentProfile(agent.id, false) : operation === 'employees.behaviorHistory' ? [] : { base: { revision: 0 }, effective: { mood: 'neutral', valence: 5, energy: 5, fatigue: 0, sleeping: false } }
      return { status: 'succeeded', data }
    }
    if (method === 'getContactList') return { revision: 1, agentOrder: [agent.id], groupOrder: [], tags: [], agentTags: {}, groupTags: {} }
    if (method === 'snapshot') return snapshot()
    if (method === 'saveAgent') { const { expectedConfigVersion: _, ...value } = input as AgentInput; committed = { ...committed, ...value, configVersion: committed.configVersion + 1 }; return committed }
    throw new Error(`Unexpected request: ${method}`)
  })
  api = { request, subscribe: (listener: (event: AppEvent) => void) => { subscribers.add(listener); return () => subscribers.delete(listener) } } as unknown as DesktopApi
  host = document.createElement('div'); document.body.append(host); root = createRoot(host)
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); localStorage.clear(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === text)!
const click = async (label: string) => act(async () => document.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click())
async function change(label: string, value: string) {
  const element = document.querySelector<HTMLElement>(`[role="textbox"][aria-label="${label}"], input[aria-label="${label}"], textarea[aria-label="${label}"]`)!
  await act(async () => {
    if (element.hasAttribute('contenteditable')) element.textContent = value
    else {
      const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value)
    }
    element.dispatchEvent(new Event('input', { bubbles: true }))
  })
}
const identityField = (label: string) => host.querySelector<HTMLElement>(`[role="textbox"][aria-label="${label}"]`)!
async function blur(label: string) {
  await act(async () => {
    const field = identityField(label)
    field.focus(); field.blur()
  })
}
async function fixture(fullPage = false) {
  const refresh = vi.fn(), onMessage = vi.fn(), identitySaved = vi.fn()
  let updateSnapshot!: () => void
  function Page() {
    const [data, setData] = useState(snapshot), [advanced, setAdvanced] = useState(false), [epoch, setEpoch] = useState(0)
    const { guard, confirmation } = useEditorGuard({ reset: () => setEpoch(value => value + 1) })
    updateSnapshot = () => setData(snapshot())
    const onAgentSaved = (saved: DigitalAgent) => { identitySaved(saved); setData(current => ({ ...current, agents: current.agents.map(item => item.id === saved.id ? saved : item) })) }
    const reload = async () => { refresh(); setData(snapshot()) }
    return h(GuardContext.Provider, { value: guard }, fullPage ? h(ContactsPage, {
      api, snapshot: data, selected: { kind: 'agent', id: agent.id }, active: true, sidebarShown: true, divider: null, generation: epoch, busy: false,
      refresh: reload, onAgentSaved, onGroupSaved() {}, onMessage, onSelect() {}, onCreate() {}, onCreateTeam() {}, onWorkspace() {}, onConversation() {},
    }) : h(EmployeeProfile, { key: epoch, api, snapshot: data, agent: data.agents[0]!, active: true, busy: false,
      refresh: reload, onAgentSaved, onMessage, advancedOpen: advanced, onAdvancedChange: setAdvanced, onWorkspace() {}, onConversation() {}, onOpenAgent() {},
    }), confirmation)
  }
  await act(async () => root.render(h(Page)))
  return { refresh, onMessage, identitySaved, updateSnapshot: () => updateSnapshot() }
}

test('independent search preference lists usable presets and saves without changing business source bindings', async () => {
  const id = 'bb3c6b67-463a-4d82-b630-c3c5c1af23ef'
  const service = { id, revision: 1, provider: 'deepseek', name: 'DeepSeek检索', enabled: true, pluginEnabled: true, hasCredential: true }
  const services = [service, { ...service, id: 'disabled', name: '停用检索', enabled: false }, { ...service, id: 'legacy', provider: 'tavily', name: '旧检索' }]
  committed = { ...agent, sourceIds: ['business-source'] }
  const original = request.getMockImplementation()!
  request.mockImplementation((method, input) => method === 'getWebSearchSettings' ? Promise.resolve({ revision: 1, default: { mode: 'browser' }, services }) : original(method, input))
  await fixture(); await click('编辑网页检索')
  const select = document.querySelector<HTMLButtonElement>('[role="combobox"][aria-label="员工网页检索方式"]')!
  await act(async () => select.click())
  const options = [...document.querySelectorAll<HTMLElement>('[role="option"]')]
  expect(options.map(option => option.textContent)).toEqual(['跟随全局默认', 'BOAI 浏览器', 'DeepSeek检索', '关闭网页检索'])
  await act(async () => { const option = options.find(option => option.textContent === 'DeepSeek检索')!; option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); option.click() })
  expect(request.mock.calls.some(([method]) => method === 'saveAgent')).toBe(false)
  await act(async () => button('保存').click())
  expect(request).toHaveBeenCalledWith('saveAgent', expect.objectContaining({ expectedConfigVersion: 3, sourceIds: ['business-source'], webSearch: { mode: 'service', serviceId: id }, instructions: agent.instructions }))
  expect(committed.webSearch).toEqual({ mode: 'service', serviceId: id })
  expect(host.querySelector('[aria-label="网页检索配置"]')?.textContent).toContain('DeepSeek检索')
})

test('shows a disabled search service and preserves it when an unrelated business source is removed', async () => {
  const id = 'bb3c6b67-463a-4d82-b630-c3c5c1af23ef', source = { ...webSourceConfig, id, enabled: false, revision: 1, name: '旧搜索', createdAt: '', updatedAt: '', hasCredential: false }
  const serviceId = '8b3c6b67-463a-4d82-b630-c3c5c1af23ef'
  committed = { ...agent, sourceIds: [id], webSearch: { mode: 'service', serviceId } }
  const original = request.getMockImplementation()!
  request.mockImplementation((method, input) => method === 'listDataSources' ? Promise.resolve([source]) : method === 'getWebSearchSettings' ? Promise.resolve({ revision: 1, default: { mode: 'browser' }, services: [{ id: serviceId, revision: 1, provider: 'deepseek', name: '独立搜索', enabled: false, pluginEnabled: true, hasCredential: true }] }) : original(method, input))
  await fixture()
  expect(host.querySelector('[aria-label="网页检索配置"]')?.textContent).toContain('独立搜索（已停用）')
  await click('编辑数据源'); await click('数据源操作 旧搜索')
  await act(async () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(item => item.textContent === '移除')!.click())
  await act(async () => button('确认移除').click())
  expect(document.querySelector('[aria-label="员工网页检索方式"]')).toBeNull()
  expect(request.mock.calls.some(([method]) => method === 'saveAgent')).toBe(false)
  await act(async () => button('保存').click())
  expect(committed.webSearch).toEqual({ mode: 'service', serviceId }); expect(committed.sourceIds).toEqual([])
})

test('refreshes source availability while editing and discards a pending catalog after hiding', async () => {
  const id = 'bb3c6b67-463a-4d82-b630-c3c5c1af23ef', source = { ...webSourceConfig, id, revision: 1, name: '活动搜索', createdAt: '', updatedAt: '', hasCredential: false }
  let pending: ((value: unknown) => void) | undefined
  request.mockImplementation(async method => { if (method === 'listDataSources') return new Promise(resolve => { pending = resolve }); throw new Error('Unexpected request') })
  const props = { api, ids: [id], onChange() {}, disabled: false, active: true }
  await act(async () => root.render(h(SourcePicker, props)))
  await act(async () => pending!([source]))
  expect(host.textContent).toContain('活动搜索')
  await act(async () => { subscribers.forEach(listener => listener({ type: 'changed' })); await new Promise(resolve => setTimeout(resolve, 150)) })
  await act(async () => pending!([{ ...source, enabled: false }]))
  expect(host.querySelector('strong')?.textContent).toBe('活动搜索（已停用）')
  await act(async () => { subscribers.forEach(listener => listener({ type: 'changed' })); await new Promise(resolve => setTimeout(resolve, 150)) })
  await act(async () => root.render(h(SourcePicker, { ...props, active: false })))
  await act(async () => pending!([{ ...source, name: '迟到内容' }]))
  expect(host.textContent).not.toContain('迟到内容')
  const reads = request.mock.calls.length
  await act(async () => { subscribers.forEach(listener => listener({ type: 'changed' })); await new Promise(resolve => setTimeout(resolve, 150)) })
  expect(request.mock.calls).toHaveLength(reads)
})

test('profile edits only the selected section and saves the original version without changing hidden permissions', async () => {
  const f = await fixture()
  expect(host.querySelectorAll('form[data-edit-form]')).toHaveLength(0)
  for (const label of ['模型与权限', '工作方式', '技能', '数据源']) expect(host.querySelector(`[aria-label="编辑${label}"]`)).not.toBeNull()
  expect(host.querySelector('[aria-label="编辑知识资料"]')).toBeNull()
  expect(button('知识资料 · 0 份')).toBeDefined()
  expect(host.textContent).not.toContain('基本信息')
  expect(host.querySelector('input[aria-label="员工名称"]')).toBeNull()
  expect(identityField('员工名称').tagName).toBe('H1')
  expect(identityField('员工职责').tagName).toBe('P')
  expect(identityField('员工名称').closest('.contact-profile-identity')).not.toBeNull()
  expect(host.textContent).toContain('默认模型')
  expect(host.textContent).not.toContain('查看配置与系统文件')
  await click('编辑工作方式')
  expect(host.querySelectorAll('form[data-edit-form]')).toHaveLength(1)
  expect(identityField('员工名称')).not.toBeNull()
  await change('工作方式', '新的工作方式')
  await act(async () => button('保存').click())
  expect(request).toHaveBeenCalledWith('saveAgent', expect.objectContaining({ id: agent.id, expectedConfigVersion: 3, instructions: '新的工作方式', connectionId: 'api', modelId: '', executionPermission: undefined, allowCommands: true }))
  expect(f.refresh).toHaveBeenCalledOnce()
  expect(host.querySelector('textarea')).toBeNull()
  expect(host.textContent).toContain('新的工作方式')
  await change('员工名称', 'Alice 新名称'); await change('员工职责', '新职责')
  await blur('员工职责')
  expect(f.refresh).toHaveBeenCalledOnce()
  expect(f.identitySaved).toHaveBeenCalledOnce()
  expect(request.mock.calls.filter(([method]) => method === 'saveAgent').at(-1)?.[1]).toMatchObject({ expectedConfigVersion: 4, name: 'Alice 新名称', role: '新职责', instructions: '新的工作方式' })
  expect(identityField('员工名称').textContent).toBe('Alice 新名称')
  await blur('员工名称')
  expect(request.mock.calls.filter(([method]) => method === 'saveAgent')).toHaveLength(2)
})

test('identity autosave preserves another section draft and its unsaved guard', async () => {
  await fixture(); await click('编辑工作方式'); await change('工作方式', '尚未提交的工作方式')
  await change('员工名称', '新姓名'); await blur('员工名称')
  expect(request).toHaveBeenCalledWith('saveAgent', expect.objectContaining({ expectedConfigVersion: 3, name: '新姓名', instructions: '原工作方式' }))
  expect(host.querySelector<HTMLTextAreaElement>('textarea')?.value).toBe('尚未提交的工作方式')
  await act(async () => button('取消').click())
  expect(document.querySelector('[role=alertdialog]')).not.toBeNull()
  await act(async () => document.querySelector<HTMLButtonElement>('[role=alertdialog] [data-slot=alert-dialog-cancel]')!.click())
  await act(async () => button('保存').click())
  expect(request.mock.calls.filter(([method]) => method === 'saveAgent').at(-1)?.[1]).toMatchObject({ expectedConfigVersion: 4, name: '新姓名', instructions: '尚未提交的工作方式' })
})

test('identity saves update the contact row without refreshing or clearing the page while capabilities revalidate', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  committed = { ...agent, skillIds: ['skill'], executionBackend: { kind: 'codex-local', profileId: 'native' } }
  resources = [{ id: 'skill', kind: 'skill', name: '写作技能', description: '技能说明', path: '/managed/skill', createdAt: '2026-10-18' }]
  const f = await fixture(true)
  const viewport = host.querySelector<HTMLElement>('.contacts-detail')!
  const transition = host.querySelector<HTMLElement>('.contact-content-transition')!
  const title = identityField('员工名称'), description = identityField('员工职责')
  const card = host.querySelector<HTMLElement>('[aria-label="模型与权限配置"]')!
  const skills = host.querySelector<HTMLElement>('[aria-label="技能列表"]')!
  const previousCard = card.textContent, previousSkills = skills.textContent
  expect(previousCard).toContain('已记录连接验证')
  expect(previousSkills).toContain('说明可读')
  viewport.scrollTop = 120
  const animate = vi.fn()
  const observer = new MutationObserver(animate)
  observer.observe(transition, { attributes: true, attributeFilter: ['data-open', 'data-settled'] })
  const original = request.getMockImplementation()!
  const pending: (() => Promise<void>)[] = []
  request.mockImplementation((method, input) => method === 'getAgentHome' ? new Promise(resolve => { pending.push(async () => resolve(await original(method, input))) }) : original(method, input))
  await change('员工名称', '局部更新姓名'); await blur('员工名称')
  await act(async () => description.focus())
  // The normal global change notification may arrive separately from the save response.
  await act(async () => subscribers.forEach(listener => listener({ type: 'changed' })))
  expect(f.refresh).not.toHaveBeenCalled()
  expect(f.identitySaved).toHaveBeenCalledOnce()
  expect(request.mock.calls.some(([method]) => method === 'snapshot')).toBe(false)
  expect(host.querySelector('aside')?.textContent).toContain('局部更新姓名')
  expect(identityField('员工名称')).toBe(title)
  expect(identityField('员工职责')).toBe(description)
  expect(document.activeElement).toBe(description)
  expect(viewport.scrollTop).toBe(120)
  expect(card.textContent).toBe(previousCard)
  expect(skills.textContent).toBe(previousSkills)
  await act(async () => { for (const resolve of pending.splice(0)) await resolve() })
  expect(card.textContent).toBe(previousCard)
  expect(skills.textContent).toBe(previousSkills)
  expect(animate).not.toHaveBeenCalled()
  observer.disconnect()

  // A different connection cannot borrow the previous connection's successful check.
  committed = { ...committed, executionBackend: { kind: 'codex-local', profileId: 'different' }, configVersion: 5 }
  await act(async () => f.updateSnapshot())
  expect(card.textContent).not.toContain('已记录连接验证')
  expect(card.textContent).toContain('读取中')
  await act(async () => { for (const resolve of pending.splice(0)) await resolve() })
})

test('failed background capability checks clear old status without refreshing or losing the saved identity', async () => {
  committed = { ...agent, executionBackend: { kind: 'codex-local', profileId: 'native' } }
  const f = await fixture()
  expect(host.querySelector('[aria-label="模型与权限配置"]')?.textContent).toContain('已记录连接验证')
  const original = request.getMockImplementation()!
  request.mockImplementation((method, input) => method === 'getAgentHome' ? Promise.reject(new Error('读取失败')) : original(method, input))
  await change('员工职责', '已保存的职责'); await blur('员工职责')
  expect(identityField('员工职责').textContent).toBe('已保存的职责')
  expect(f.refresh).not.toHaveBeenCalled()
  expect(host.querySelector('[aria-label="模型与权限配置"]')?.textContent).not.toContain('已记录连接验证')
  expect(button('重新读取')).not.toBeUndefined()
})

test('identity typing and focus survive an in-flight save and the next blur saves the newer draft', async () => {
  let finish!: () => Promise<void>
  const original = request.getMockImplementation()!
  let first = true
  request.mockImplementation((method, input) => {
    if (method === 'saveAgent' && first) {
      first = false
      return new Promise(resolve => { finish = async () => resolve(await original(method, input)) })
    }
    return original(method, input)
  })
  const f = await fixture(); await change('员工名称', '第一次修改'); await blur('员工名称')
  expect(host.querySelector('.contact-document')!.hasAttribute('data-identity-saving')).toBe(true)
  expect(button('发消息').disabled).toBe(true)
  expect(button('高级配置').disabled).toBe(true)
  expect([...host.querySelectorAll<HTMLButtonElement>('.contact-section-edit')].every(item => item.disabled)).toBe(true)
  await act(async () => { button('发消息').click(); button('高级配置').click() })
  await click('编辑模型与权限')
  expect(f.onMessage).not.toHaveBeenCalled()
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(host.querySelector('form[data-edit-form]')).toBeNull()
  expect(identityField('员工职责').getAttribute('aria-disabled')).toBe('false')
  await change('员工名称', '保存期间的新修改'); await change('员工职责', '新职责')
  await blur('员工职责')
  expect(request.mock.calls.filter(([method]) => method === 'saveAgent')).toHaveLength(1)
  await act(async () => finish())
  expect(request.mock.calls.filter(([method]) => method === 'saveAgent')).toHaveLength(2)
  expect(request.mock.calls.filter(([method]) => method === 'saveAgent').at(-1)?.[1]).toMatchObject({ expectedConfigVersion: 4, name: '保存期间的新修改', role: '新职责' })
  expect(identityField('员工名称').textContent).toBe('保存期间的新修改')
  expect(host.querySelector('.contact-document')!.hasAttribute('data-identity-saving')).toBe(false)
  expect(button('发消息').disabled).toBe(false)
  expect(button('高级配置').disabled).toBe(false)
})

test('the avatar can be changed directly and saves without a basic-info editor', async () => {
  await fixture(); await click('更换员工头像')
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="内置头像"] button[aria-pressed="false"]')!.click())
  expect(request.mock.calls.filter(([method]) => method === 'saveAgent')).toHaveLength(1)
  expect(request).toHaveBeenCalledWith('saveAgent', expect.objectContaining({ expectedConfigVersion: 3, avatar: { kind: 'preset', id: expect.any(String) } }))
  expect(button('保存')).toBeUndefined()
  expect(host.textContent).not.toContain('基本信息')
})

test('an empty name is retained without submitting and can be corrected directly', async () => {
  await fixture(); await change('员工名称', '  '); await blur('员工名称')
  expect(request.mock.calls.some(([method]) => method === 'saveAgent')).toBe(false)
  expect(identityField('员工名称').textContent).toBe('  ')
  await change('员工名称', '有效姓名'); await blur('员工名称')
  expect(request).toHaveBeenCalledWith('saveAgent', expect.objectContaining({ name: '有效姓名', expectedConfigVersion: 3 }))
})

test('an unknown identity save keeps the input draft and does not retry on blur', async () => {
  const original = request.getMockImplementation()!
  let finish!: () => Promise<void>
  request.mockImplementation((method, input) => {
    if (method === 'saveAgent') return new Promise((_resolve, reject) => { finish = async () => { await original(method, input); reject(new Error('response lost')) } })
    return original(method, input)
  })
  await fixture(); await change('员工名称', '待核对姓名'); await blur('员工名称')
  await change('员工职责', '请求中修改的职责'); await blur('员工职责')
  await act(async () => finish())
  expect(identityField('员工名称').textContent).toBe('待核对姓名')
  expect(identityField('员工职责').textContent).toBe('请求中修改的职责')
  expect(request).toHaveBeenCalledWith('snapshot', undefined)
  await blur('员工名称')
  expect(request.mock.calls.filter(([method]) => method === 'saveAgent')).toHaveLength(1)
  expect(button('高级配置').disabled).toBe(false)
})

test('profile text keeps the caret during Chinese composition and saves with Enter after composition', async () => {
  await fixture()
  const name = identityField('员工名称')
  await act(async () => { name.focus(); name.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })) })
  await change('员工名称', '编辑中的姓名')
  await act(async () => name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true })))
  expect(document.activeElement).toBe(name)
  expect(request.mock.calls.some(([method]) => method === 'saveAgent')).toBe(false)
  await act(async () => name.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })))
  const text = name.firstChild!
  const selection = window.getSelection()!, range = document.createRange()
  range.setStart(text, 2); range.collapse(true); selection.removeAllRanges(); selection.addRange(range)
  await change('员工职责', '另一项修改')
  expect(selection.anchorNode).toBe(text)
  expect(selection.anchorOffset).toBe(2)
  await act(async () => name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })))
  expect(request).toHaveBeenCalledWith('saveAgent', expect.objectContaining({ name: '编辑中的姓名', role: '另一项修改' }))
  expect(document.activeElement).not.toBe(name)
})

test('profile text normalizes pasted line breaks and retains the original length limit', async () => {
  await fixture()
  await change('员工名称', '员工\n名称' + '名'.repeat(90))
  expect(identityField('员工名称').textContent).toHaveLength(80)
  expect(identityField('员工名称').textContent).toContain('员工 名称')
  await blur('员工名称')
  expect(request).toHaveBeenCalledWith('saveAgent', expect.objectContaining({ name: ('员工 名称' + '名'.repeat(90)).slice(0, 80) }))
})

test('inline cancellation preserves the draft until explicit discard without submitting', async () => {
  await fixture(); await click('编辑工作方式'); await change('工作方式', '未保存内容')
  await act(async () => button('取消').click())
  await act(async () => document.querySelector<HTMLButtonElement>('[role=alertdialog] [data-slot=alert-dialog-cancel]')!.click())
  expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('未保存内容')
  await act(async () => button('取消').click()); await act(async () => button('退出').click())
  expect(host.querySelector('textarea')).toBeNull()
  expect(host.textContent).toContain('原工作方式')
  expect(request.mock.calls.some(([method]) => method === 'saveAgent')).toBe(false)
})

test('switching sections discards only after confirmation and advanced configuration excludes basic fields', async () => {
  await fixture(); await click('编辑工作方式'); await change('工作方式', '未保存内容')
  await click('编辑模型与权限')
  expect(host.querySelector('[aria-label="运行方式"]')).toBeNull()
  await act(async () => button('退出').click())
  expect(host.querySelector('textarea')).toBeNull()
  expect(host.querySelector('[aria-label="运行方式"]')).not.toBeNull()
  await act(async () => button('取消').click())
  await click('编辑工作方式'); await change('工作方式', '另一段草稿')
  await act(async () => button('高级配置').click())
  expect(document.querySelector('[role=dialog]')).toBeNull()
  await act(async () => button('退出').click())
  const dialog = document.querySelector('[role=dialog]')!
  expect(dialog.querySelectorAll('[role=tab]')).toHaveLength(6)
  expect(dialog.querySelector('[aria-label="人格与行为"]')).not.toBeNull()
  expect(dialog.querySelector('[aria-label="基础配置"]')).toBeNull()
  expect(dialog.querySelector('[aria-label="人格与行为"]')?.getAttribute('aria-selected')).toBe('true')
  expect(dialog.querySelector('[role=tab][aria-label="系统文件"]')).toBeNull()
  expect(button('编辑人格')).toBeTruthy()
  expect(dialog.querySelector('button[aria-label="高级设置"]')).toBeNull()
  expect(dialog.querySelector('section[aria-label="配置源文件"]')).not.toBeNull()
  expect(dialog.querySelector('section[aria-label="后台活动记录"]')).not.toBeNull()
  expect(dialog.querySelector('input[aria-label="员工名称"]')).toBeNull()
  expect(host.querySelector('textarea')).toBeNull()
  await click('关闭高级配置')
  expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(host.textContent).toContain('原工作方式')
  expect(request.mock.calls.some(([method]) => method === 'saveAgent')).toBe(false)
})

test('employee automation only shows employee tasks and never loads personality plans or history', async () => {
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'listOwnerAutomations' ? { definitions: [] } : original(method, input))
  await fixture(); await act(async () => button('高级配置').click())
  const dialog = () => document.querySelector('[role=dialog]')!
  expect(dialog().querySelector('section[aria-label="主动交流"]')).not.toBeNull()
  expect(dialog().textContent).not.toContain('添加行为')
  request.mockClear()
  await act(async () => button('自动化').click())
  expect(dialog().querySelector('[role=tab][aria-label="自动化"]')?.getAttribute('aria-selected')).toBe('true')
  expect(dialog().querySelector('section[aria-label="员工定时任务"]')).not.toBeNull()
  expect(dialog().querySelector('section[aria-label="主动交流"]')).toBeNull()
  expect(dialog().querySelector('section[aria-label="后台活动记录"]')).toBeNull()
  expect(dialog().querySelector('section[aria-label="状态与成长"]')).toBeNull()
  expect(request).toHaveBeenCalledWith('listOwnerAutomations', { owner: { kind: 'employee', employeeId: agent.id }, limit: 30 })
  expect(request.mock.calls.some(([method]) => method === 'executeApplicationOperation')).toBe(false)
  await act(async () => button('人格与行为').click())
  expect(dialog().querySelector('section[aria-label="状态与成长"]')).not.toBeNull()
  expect(dialog().textContent).not.toContain('添加行为')
})

test('native instruction edits preserve native model options and inherited permissions', async () => {
  committed = { ...agent, connectionId: '', executionBackend: { kind: 'codex-local', profileId: 'native' }, nativeOptions: { codexApprovalPolicy: 'on-request', codexSandbox: 'workspace-write' } }
  await fixture(); await click('编辑工作方式'); await change('工作方式', '仅修改工作规则')
  expect(button('保存').disabled).toBe(false)
  await act(async () => button('保存').click())
  expect(request).toHaveBeenCalledWith('saveAgent', expect.objectContaining({ instructions: '仅修改工作规则', executionPermission: undefined, nativeOptions: { codexApprovalPolicy: 'on-request', codexSandbox: 'workspace-write' }, executionBackend: { kind: 'codex-local', profileId: 'native' } }))
  expect(request.mock.calls.some(([method]) => method === 'listLaunchProfiles')).toBe(false)
})

test('saving disables section switches, cancellation, messaging and advanced configuration', async () => {
  let finish!: (value: DigitalAgent) => void
  const original = request.getMockImplementation()!
  request.mockImplementation((method, input) => method === 'saveAgent' ? new Promise<DigitalAgent>(resolve => { finish = resolve }) : original(method, input))
  const f = await fixture(); await click('编辑工作方式'); await change('工作方式', '等待保存')
  await act(async () => button('保存').click())
  expect(button('取消').disabled).toBe(true)
  expect(host.querySelector('.contact-document')!.hasAttribute('data-identity-saving')).toBe(false)
  expect(button('高级配置').disabled).toBe(true)
  expect(button('发消息').disabled).toBe(true)
  expect(host.querySelector<HTMLButtonElement>('[aria-label="编辑模型与权限"]')!.disabled).toBe(true)
  await act(async () => { committed = { ...agent, instructions: '等待保存', configVersion: 4 }; finish(committed) })
  expect(f.refresh).toHaveBeenCalledOnce()
  expect(button('高级配置').disabled).toBe(false)
  expect(host.querySelector('textarea')).toBeNull()
})

test('unknown save keeps its draft and requires loading the checked version before another save', async () => {
  const original = request.getMockImplementation()!
  let loseResponse = true
  request.mockImplementation(async (method, input) => {
    const value = await original(method, input)
    if (method === 'saveAgent' && loseResponse) { loseResponse = false; throw new Error('response lost') }
    return value
  })
  await fixture(); await click('编辑工作方式'); await change('工作方式', '已提交但响应丢失')
  await act(async () => button('保存').click())
  expect(request.mock.calls.filter(([method]) => method === 'saveAgent')).toHaveLength(1)
  expect(request).toHaveBeenCalledWith('snapshot', undefined)
  expect(button('保存').disabled).toBe(true)
  expect(host.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('已提交但响应丢失')
  await act(async () => button('载入已提交配置').click()); await act(async () => button('退出').click())
  await change('工作方式', '下一次明确修改'); await act(async () => button('保存').click())
  expect(request.mock.calls.filter(([method]) => method === 'saveAgent').at(-1)?.[1]).toMatchObject({ expectedConfigVersion: 4, instructions: '下一次明确修改' })
})

test('the contact context menu opens advanced settings after discarding the inline draft', async () => {
  function Page() {
    const [generation, setGeneration] = useState(0)
    const { guard, confirmation } = useEditorGuard({ reset: () => setGeneration(value => value + 1) })
    return h(GuardContext.Provider, { value: guard }, h(ContactsPage, {
      api, snapshot: snapshot(), selected: { kind: 'agent', id: agent.id }, active: true, sidebarShown: true, divider: null, generation, busy: false,
      onSelect() {}, onCreate() {}, onCreateTeam() {}, onMessage() {}, refresh: async () => {}, onAgentSaved() {}, onGroupSaved() {}, onWorkspace() {}, onConversation() {},
    }), confirmation)
  }
  await act(async () => root.render(h(Page)))
  await click('编辑工作方式'); await change('工作方式', '右键前的草稿')
  await act(async () => host.querySelector('[aria-label="通讯录列表"] [aria-label="Alice"]')!.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 })))
  await act(async () => [...document.querySelectorAll<HTMLElement>('[role=menuitem]')].find(item => item.textContent === '高级配置')!.click())
  expect(document.querySelector('[role=alertdialog]')).not.toBeNull()
  await act(async () => button('退出').click())
  expect(document.querySelector('[role=dialog] [aria-label="关闭高级配置"]')).not.toBeNull()
  expect(document.querySelector('[role=dialog] [aria-label="基础配置"]')).toBeNull()
  expect(host.querySelector('textarea')).toBeNull()
  expect(request.mock.calls.some(([method]) => method === 'saveAgent')).toBe(false)
})


test('directory approval displays scope and sends distinct run/persistent choices', async () => {
  const approve = vi.fn()
  await act(async () => root.render(h(ApprovalCard, { busy: false, onApprove: approve, approval: { id: 'directory', kind: 'directory', runId: 'run', conversationId: 'chat', agentName: '员工', command: '读取项目要求', cwd: '/projects/reports', rememberAllowed: true, directory: { directory: '/projects/reports', target: '/projects/reports/spec.md', access: 'read-only', reason: '读取项目要求' } } })))
  expect(host.textContent).toContain('/projects/reports/spec.md'); expect(host.textContent).toContain('只读')
  await act(async () => button('允许本次运行').click()); expect(approve).toHaveBeenLastCalledWith('directory', true)
  await act(async () => button('始终允许此目录').click()); expect(approve).toHaveBeenLastCalledWith('directory', true, true)
  await act(async () => button('拒绝').click()); expect(approve).toHaveBeenLastCalledWith('directory', false)
})

test('combined command approval shows every directory and keeps command permission one-time', async () => {
  const approve = vi.fn()
  await act(async () => root.render(h(ApprovalCard, { busy: false, onApprove: approve, approval: { id: 'combined', kind: 'command', runId: 'run', conversationId: 'chat', agentName: '员工', command: 'copy report', cwd: '/managed/run', rememberAllowed: true, commandDirectories: [{ directory: '/reports', target: '/reports', access: 'read-only', reason: '读取' }, { directory: '/output', target: '/output', access: 'read-write', reason: '输出' }] } })))
  expect(host.textContent).toContain('/reports'); expect(host.textContent).toContain('/output'); expect(host.textContent).toContain('/managed/run')
  expect(host.textContent).toContain('命令仅批准这一次'); expect(host.textContent).toContain('后续命令仍按员工权限审批')
  expect(host.textContent).not.toContain('始终允许此类操作')
  await act(async () => button('允许命令及本次目录访问').click()); expect(approve).toHaveBeenLastCalledWith('combined', true)
  await act(async () => button('运行命令并保留目录授权').click()); expect(approve).toHaveBeenLastCalledWith('combined', true, true)
  await act(async () => button('拒绝').click()); expect(approve).toHaveBeenLastCalledWith('combined', false)
})

test('directory selection stays in draft until save and persistent approvals preserve other edits', async () => {
  committed = { ...agent, directoryGrants: [{ path: '/coding', access: 'read-write' }], directoryRevision: 1 }
  let refresh!: () => void
  function Editor() {
    const [data, setData] = useState(snapshot), [epoch, setEpoch] = useState(0)
    const { guard, confirmation } = useEditorGuard({ reset: () => setEpoch(value => value + 1) })
    refresh = () => setData(snapshot())
    return h(GuardContext.Provider, { value: guard }, h(AgentEditor, { key: epoch, api, snapshot: data, agent: data.agents[0], onClose() {}, onSaved: async () => refresh() }), confirmation)
  }
  await act(async () => root.render(h(Editor)))
  await change('工作方式', 'KEEP-DRAFT')
  committed = { ...committed, directoryRevision: 2, directoryGrants: [...committed.directoryGrants!, { path: '/reports', access: 'read-only' }] }
  await act(async () => refresh())
  expect((host.querySelector('textarea[aria-label="工作方式"]') as HTMLTextAreaElement).value).toBe('KEEP-DRAFT')
  expect(host.textContent).toContain('/reports')
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'chooseEmployeeDirectory' ? '/selected' : original(method, input))
  await act(async () => button('添加授权目录').click())
  expect(request.mock.calls.filter(([method]) => method === 'saveAgent')).toHaveLength(0)
  expect(host.textContent).toContain('/selected')
  await act(async () => button('保存修改').click())
  const saved = request.mock.calls.find(([method]) => method === 'saveAgent')![1] as AgentInput
  expect(saved.instructions).toBe('KEEP-DRAFT'); expect(saved.expectedDirectoryRevision).toBe(2)
  expect(saved.directoryGrants).toEqual([{ path: '/coding', access: 'read-write' }, { path: '/reports', access: 'read-only' }, { path: '/selected', access: 'read-write' }])
})

test('independent knowledge changes preserve instruction and directory drafts while saving the committed binding version', async () => {
  committed = { ...agent, directoryGrants: [{ path: '/coding', access: 'read-write' }], directoryRevision: 1 }
  let refresh!: () => void
  function Editor() {
    const [data, setData] = useState(snapshot)
    const { guard, confirmation } = useEditorGuard({ reset() {} })
    refresh = () => setData(snapshot())
    return h(GuardContext.Provider, { value: guard }, h(AgentEditor, { api, snapshot: data, agent: data.agents[0], onClose() {}, onSaved: async () => refresh() }), confirmation)
  }
  await act(async () => root.render(h(Editor)))
  await change('工作方式', 'KEEP-KNOWLEDGE-DRAFT')
  const original = request.getMockImplementation()!
  request.mockImplementation(async (method, input) => method === 'chooseEmployeeDirectory' ? '/selected' : original(method, input))
  await act(async () => button('添加授权目录').click())
  committed = { ...committed, knowledgeIds: ['retained'], configVersion: committed.configVersion + 1 }
  await act(async () => refresh())
  expect((host.querySelector('textarea[aria-label="工作方式"]') as HTMLTextAreaElement).value).toBe('KEEP-KNOWLEDGE-DRAFT')
  expect(host.textContent).toContain('/selected')
  expect(host.textContent).toContain('知识资料 · 1 份')
  expect(request.mock.calls.filter(([method]) => method === 'saveAgent')).toHaveLength(0)
  await act(async () => button('保存修改').click())
  const saved = request.mock.calls.find(([method]) => method === 'saveAgent')![1] as AgentInput
  expect(saved).toMatchObject({ instructions: 'KEEP-KNOWLEDGE-DRAFT', expectedConfigVersion: 4, knowledgeIds: ['retained'], expectedDirectoryRevision: 1 })
  expect(saved.directoryGrants).toEqual([{ path: '/coding', access: 'read-write' }, { path: '/selected', access: 'read-write' }])
})


test.each(['codex-local', 'claude-local'] as const)('native %s directory view explains native ownership without an API allowlist editor', async kind => {
  committed={...agent,executionBackend:{kind,profileId:'native'},directoryGrants:[{path:'/coding',access:'read-write'}],directoryRevision:1}
  await act(async()=>root.render(h(AgentEditor,{api,snapshot:snapshot(),agent:committed,section:'directories',onClose(){},onSaved:async()=>{}})))
  expect(host.textContent).toContain('本机 Agent 使用自身的目录、工具和审批配置')
  expect(button('添加授权目录')).toBeUndefined()
  expect(host.textContent).not.toContain('接入中')
  expect(request.mock.calls.some(([method])=>method==='chooseEmployeeDirectory'||method==='saveAgent')).toBe(false)
})


test('operation approval exposes explicit same-kind scope and sends its distinct choice', async () => {
  const approve = vi.fn()
  await act(async () => root.render(h(ApprovalCard, { busy: false, onApprove: approve, approval: { id: 'operation', kind: 'file', runId: 'run', conversationId: 'chat', agentName: '员工', command: '保存报告', cwd: '/managed/run', sameKindAllowed: true } })))
  expect(host.textContent).toContain('仅对本次任务生效')
  await act(async () => button('本次任务允许所有同类操作').click())
  expect(approve).toHaveBeenLastCalledWith('operation', true, false, true)
  await act(async () => button('允许这次执行').click())
  expect(approve).toHaveBeenLastCalledWith('operation', true)
})
