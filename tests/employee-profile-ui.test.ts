// @vitest-environment jsdom
/*
 * [OUTPUT]: 身份自动保存期间维持静默外观标记与导航锁，连续输入保存后清除标记；普通配置保存不进入静默反馈。
 * [INPUT]: 生产EmployeeProfile、原AgentEditor/高级配置Dialog、受控IPC和页面草稿守卫。
 * [OUTPUT]: 身份保存局部更新不刷新页面，保留DOM/焦点/滚动及后台能力读取；原文字编辑、并发草稿/版本保护和高级配置隔离，无E2E。
 * [POS]: 员工资料与编辑的前端交互回归，不调用模型或用户配置。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { act, createElement as h, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { AgentInput, DigitalAgent, Snapshot } from '../src/shared/domain'
import type { AppEvent, DesktopApi } from '../src/shared/ipc'
import { GuardContext } from '../src/renderer/components/common'
import { useEditorGuard } from '../src/renderer/components/common/use-editor-guard'
import { EmployeeProfile } from '../src/renderer/pages/contacts/employee-profile'
import { ContactsPage } from '../src/renderer/pages/contacts'

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
    if (method === 'getSkillCollections') return { revision: 1, favoriteResourceIds: [], groups: [], groupByResourceId: {} }
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
      refresh: reload, onAgentSaved, onGroupSaved() {}, onMessage, onSelect() {}, onCreate() {}, onCreateTeam() {}, onConversation() {},
    }) : h(EmployeeProfile, { key: epoch, api, snapshot: data, agent: data.agents[0]!, active: true, busy: false,
      refresh: reload, onAgentSaved, onMessage, advancedOpen: advanced, onAdvancedChange: setAdvanced, onConversation() {}, onOpenAgent() {},
    }), confirmation)
  }
  await act(async () => root.render(h(Page)))
  return { refresh, onMessage, identitySaved, updateSnapshot: () => updateSnapshot() }
}

test('profile edits only the selected section and saves the original version without changing hidden permissions', async () => {
  const f = await fixture()
  expect(host.querySelectorAll('form[data-edit-form]')).toHaveLength(0)
  for (const label of ['模型与权限', '工作方式', '技能', '数据源', '知识资料']) expect(host.querySelector(`[aria-label="编辑${label}"]`)).not.toBeNull()
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
  expect(dialog.querySelector('[aria-label="基础配置"]')).toBeNull()
  expect(dialog.querySelector('[aria-label="系统文件"]')?.getAttribute('aria-selected')).toBe('true')
  expect(dialog.querySelector('input[aria-label="员工名称"]')).toBeNull()
  expect(host.querySelector('textarea')).toBeNull()
  await click('关闭高级配置')
  expect(document.querySelector('[role=dialog]')).toBeNull()
  expect(host.textContent).toContain('原工作方式')
  expect(request.mock.calls.some(([method]) => method === 'saveAgent')).toBe(false)
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
      onSelect() {}, onCreate() {}, onCreateTeam() {}, onMessage() {}, refresh: async () => {}, onAgentSaved() {}, onGroupSaved() {}, onConversation() {},
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
