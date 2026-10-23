// @vitest-environment jsdom
/*
 * [INPUT]: Employee personality UI and a lost response after submitting a profile write.
 * [OUTPUT]: Deferred writes stay local, serialize against confirmed revisions, refresh only relevant data and halt queued changes on unknown outcomes.
 * [OUTPUT]: Source switches stay direct; activity details mount only in a right-side Popover, and confirmed delete/clear preserves recovery.
 * [POS]: Unknown-outcome recovery contract; no model or Electron claims.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PersonalityPane } from '../src/renderer/components/employee/personality-pane'
import { defaultAgentProfile, type AgentBehaviorDefinition } from '../src/shared/domain/agent-profile'
import type { DesktopApi } from '../src/shared/ipc'
import type { DigitalAgent, Snapshot } from '../src/shared/domain'
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let root: Root | undefined
beforeEach(() => { vi.stubGlobal('PointerEvent', MouseEvent) })
afterEach(async () => { await act(async () => root?.unmount()); document.body.innerHTML = ''; vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers() })
it('keeps unknown profile writes locked with a visible receipt-recovery action and the original draft', async () => {
  const profile = defaultAgentProfile('employee', false)
  let confirmed = false
  const request = vi.fn(async (method: string, input: any) => {
    if (method === 'executeApplicationOperation') {
      if (input.operation === 'employees.configure') throw new Error('连接中断，结果未知')
      const data = input.operation === 'employees.profile' ? profile : input.operation === 'employees.behaviorHistory' ? [] : { base: { id: 'state', agentId: profile.agentId, revision: 0, updatedAt: '' }, effective: { mood: 'cheerful', valence: 7, energy: 7, fatigue: 0, sleeping: false }, observedAt: '' }
      return { protocolVersion: 'boai.application.v1', operation: input.operation, status: 'succeeded', data }
    }
    if (method === 'getApplicationReceipt') return confirmed ? { status: 'succeeded', data: profile } : null
    throw new Error('Unexpected method ' + method)
  })
  const api = { request, subscribe: () => () => {} } as unknown as DesktopApi
  const agent = { id: 'employee', name: '员工', executionBackend: { kind: 'mastra-model' } } as DigitalAgent
  const node = document.createElement('div'); document.body.appendChild(node); root = createRoot(node)
  await act(async () => root!.render(h(PersonalityPane, { api, agent, snapshot: { conversations: [] } as unknown as Snapshot, active: true, onEditSource: vi.fn() })))
  const button = (name: string) => [...node.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === name)!
  const emotionInput = () => node.querySelector<HTMLInputElement>('#personality-emotions')!
  await act(async () => emotionInput().click())
  expect(emotionInput().checked).toBe(true)
  expect(node.querySelector('fieldset')?.disabled).toBe(true)
  expect(button('核对已保存配置与记录')).toBeTruthy()
  const writes = request.mock.calls.filter(([, input]) => input.operation === 'employees.configure')
  expect(writes).toHaveLength(1)
  expect(writes[0][1].input.config.features.emotions).toBe(true)
  await act(async () => emotionInput().click())
  expect(emotionInput().checked).toBe(true)
  await act(async () => button('核对已保存配置与记录').click())
  expect(request).toHaveBeenCalledWith('getApplicationReceipt', { requestId: writes[0][1].requestId })
  expect(request.mock.calls.filter(([, input]) => input.operation === 'employees.configure')).toHaveLength(1)
  expect(node.querySelector('fieldset')?.disabled).toBe(true)
  expect(emotionInput().checked).toBe(true)
  confirmed = true
  profile.features.emotions = true; profile.revision = 1
  await act(async () => button('核对已保存配置与记录').click())
  expect(node.querySelector('fieldset')?.disabled).toBe(false)
  expect(emotionInput().checked).toBe(true)
  expect(request.mock.calls.filter(([, input]) => input.operation === 'employees.configure')).toHaveLength(1)
})

it('saves features immediately, removes manual plans and shows state beside its feature', async () => {
  let profile = { ...defaultAgentProfile('employee', false), disabledPrompts: ['emotion' as const] }
  const request = vi.fn(async (_method: string, input: any) => {
    if (input.operation === 'employees.configure') profile = { ...profile, ...input.input.config, revision: profile.revision + 1 }
    const data = ['employees.profile', 'employees.configure'].includes(input.operation) ? profile : input.operation === 'employees.behaviorHistory' ? [] : { base: { revision: 0 }, effective: { mood: 'cheerful', valence: 7, energy: 7, fatigue: 25, sleeping: false } }
    return { status: 'succeeded', data }
  })
  const onEditSource = vi.fn()
  const api = { request, subscribe: () => () => {} } as unknown as DesktopApi
  const agent = { id: 'employee', name: '员工', executionBackend: { kind: 'mastra-model' } } as DigitalAgent
  const node = document.createElement('div'); document.body.appendChild(node); root = createRoot(node)
  await act(async () => root!.render(h(PersonalityPane, {
    api, agent, snapshot: { conversations: [] } as unknown as Snapshot, active: true, onEditSource,
    sourceFiles: renderPromptSwitch => h('section', { 'aria-label': '配置源文件' },
      ...['SOUL.md', 'AGENTS.md', 'prompts/emotion.md', 'MEMORY.md'].map(name => h('div', { key: name, role: 'group', 'aria-label': name }, name, renderPromptSwitch(name)))),
  })))
  const click = async (name: string) => act(async () => [...node.querySelectorAll<HTMLButtonElement>('button')].find(item => (item.textContent === name || item.getAttribute('aria-label') === name))!.click())
  const section = (name: string) => node.querySelector<HTMLElement>(`section[aria-label="${name}"]`)!
  expect(section('对话与工作').querySelectorAll('[role="switch"]')).toHaveLength(0)
  expect(section('对话与工作').querySelectorAll('button[aria-label^="编辑"]')).toHaveLength(4)
  expect(section('状态与成长').querySelectorAll('[role="switch"]')).toHaveLength(4)
  expect(section('状态与成长').textContent).toContain('无需单独提示词')
  expect(node.querySelector('[aria-label="情绪当前状态"]')).toBeNull()
  expect(node.querySelector('[aria-label="疲劳与休息当前状态"]')).toBeNull()
  expect(node.querySelector('#prompt-emotion')).not.toBeNull()
  await click('编辑判断规则')
  expect(onEditSource).toHaveBeenCalledWith('prompts/emotion.md', '情绪判断提示词')
  await click('编辑反思规则')
  expect(onEditSource).toHaveBeenCalledWith('prompts/reflection.md', '反思与成长提示词')
  await click('编辑旅行规则')
  expect(onEditSource).toHaveBeenCalledWith('prompts/travel.md', '虚拟旅行提示词')
  await click('编辑交流规则')
  expect(onEditSource).toHaveBeenCalledWith('prompts/greeting.md', '主动问候与跟进提示词')
  await act(async () => node.querySelector<HTMLInputElement>('#personality-emotions')!.click())
  expect(section('状态与成长').textContent).toContain('补充规则未加载')
  expect(node.textContent).not.toContain('保存人格与行为')
  expect(node.querySelector('section[aria-label="主动行为"]')).toBeNull()
  expect(node.textContent).not.toContain('添加行为')
  expect(node.querySelector('[role="region"][aria-label="行为记录"]')).toBeNull()
  expect(profile.features.emotions).toBe(true)
  expect(profile.disabledPrompts).toEqual(['emotion'])
  expect(profile.behaviors).toEqual([])
  expect(section('状态与成长').textContent).toContain('cheerful')
  expect(section('状态与成长').textContent).not.toContain('25/100')
  expect(section('主动交流').querySelector('button[aria-label="编辑主动问候与跟进提示词"]')).not.toBeNull()
  expect(node.querySelector('section[aria-label="主动问候与跟进"]')).toBeNull()
  expect(node.querySelector('button[aria-label="高级设置"]')).toBeNull()
  expect(section('提示词加载设置')).toBeNull()
  expect(section('配置源文件').querySelectorAll('[role="switch"]')).toHaveLength(1)
  expect(section('配置源文件').querySelector('[aria-label="prompts/emotion.md"] #prompt-emotion')).not.toBeNull()
  expect(section('配置源文件').querySelector('[role="checkbox"]')).toBeNull()
  await act(async () => node.querySelector<HTMLInputElement>('#prompt-emotion')!.click())
  expect(profile.disabledPrompts).toEqual([])
  expect(profile.features.emotions).toBe(true)
  expect(profile.behaviors).toEqual([])
})

const sampleBehavior = (): AgentBehaviorDefinition => ({ id: 'greeting', kind: 'greeting', enabled: false, conversationId: 'room', cron: '0 9 * * *', timezone: 'Asia/Shanghai', instruction: '早上问候', cooldownMinutes: 60, applicationAccess: 'none', maxModelCalls: 4 })
function fixture() {
  let profile = { ...defaultAgentProfile('employee', false), behaviors: [sampleBehavior()] }
  let failure = false, receipt: any = null
  const request = vi.fn(async (method: string, input: any) => {
    if (method === 'getApplicationReceipt') return receipt
    if (input.operation === 'employees.configure') {
      if (failure) return { status: 'failed', error: { message: '配置已变化' } }
      profile = { ...profile, ...input.input.config, revision: profile.revision + 1 }
    }
    const data = ['employees.profile', 'employees.configure'].includes(input.operation) ? profile : input.operation === 'employees.behaviorHistory' ? [{ id: 'old-run', behaviorId: 'greeting', status: 'completed', startedAt: '2026-10-19T09:00:00Z', result: '已问候', promptEvidence: { modules: [{ id: 'greeting', source: 'prompts/greeting.md', characters: 419, hash: 'a83ba9d908e7' }] } }] : { base: { revision: 1 }, effective: { mood: 'cheerful', valence: 7, energy: 7, fatigue: 25, sleeping: false } }
    return { status: 'succeeded', data }
  })
  return { request, get profile() { return profile }, set failure(value: boolean) { failure = value }, set receipt(value: any) { receipt = value },
    api: { request, subscribe: () => () => {} } as unknown as DesktopApi,
    agent: { id: 'employee', name: '员工', executionBackend: { kind: 'mastra-model' } } as DigitalAgent,
    snapshot: { conversations: [{ id: 'room', title: '员工聊天', agentIds: ['employee'] }] } as unknown as Snapshot }
}
function button(name: string) { return [...document.querySelectorAll<HTMLButtonElement>('button')].find(item => item.textContent === name || item.getAttribute('aria-label') === name)! }
async function mount(f: ReturnType<typeof fixture>) {
  const node = document.createElement('div'); document.body.appendChild(node); root = createRoot(node)
  await act(async () => root!.render(h(PersonalityPane, { api: f.api, agent: f.agent, snapshot: f.snapshot, active: true, onEditSource: vi.fn() })))
  return node
}
it('rolls back a rejected switch, keeps plans intact and uses the next confirmed revision for later saves', async () => {
  const f = fixture(), node = await mount(f)
  const emotion = () => node.querySelector<HTMLInputElement>('#personality-emotions')!
  f.failure = true
  await act(async () => emotion().click())
  expect(emotion().checked).toBe(false)
  expect(node.querySelector('[aria-label="情绪当前状态"]')).toBeNull()
  expect(button('重新读取配置与记录')).toBeTruthy()
  f.failure = false
  await act(async () => emotion().click())
  await act(async () => node.querySelector<HTMLInputElement>('#personality-fatigue')!.click())
  const writes = f.request.mock.calls.filter(([, input]) => input.operation === 'employees.configure')
  expect(writes.map(([, input]) => input.input.expectedRevision)).toEqual([0, 0, 1])
  expect(f.profile.features.emotions).toBe(true)
  expect(f.profile.features.fatigue).toBe(true)
  expect(f.profile.behaviors).toEqual([sampleBehavior()])
  expect(node.querySelector('[aria-label="疲劳与休息当前状态"]')?.textContent).toContain('25/100')
})
it('saves proactive preferences immediately and mounts activity details only when its Popover opens', async () => {
  const f = fixture(), node = await mount(f)
  expect(button('添加行为')).toBeUndefined()
  expect(button('保存行为')).toBeUndefined()
  expect(node.querySelector('section[aria-label="后台活动记录"]')).not.toBeNull()
  expect(node.querySelector('[data-slot=collapsible]')).toBeNull()
  const records = node.querySelector('[aria-label="后台活动记录详情"]')!
  expect(records.textContent).toContain('已完成')
  expect(document.body.textContent).not.toContain('已问候')
  expect(document.body.textContent).not.toContain('实际使用的提示词')
  expect(document.body.textContent).not.toContain('a83ba9d908e7')
  await act(async () => button('查看历史活动详情').click())
  const detail = document.querySelector('[data-slot=popover-content]')!
  expect(detail.textContent).toContain('已问候')
  expect(detail.textContent).toContain('prompts/greeting.md')
  expect(detail.textContent).toContain('a83ba9d908e7')
  expect(records.textContent).not.toContain('已问候')
  await act(async () => button('查看历史活动详情').click())
  expect(button('后台活动记录说明')).toBeTruthy()
  expect(node.querySelector('[aria-label="联系频率"]')).toBeNull()
  await act(async () => node.querySelector<HTMLInputElement>('#personality-proactive')!.click())
  expect(f.profile.proactive.enabled).toBe(true)
  expect(node.querySelector('[aria-label="联系频率"]')).not.toBeNull()
  expect(f.profile.behaviors).toEqual([sampleBehavior()])
  const writes = f.request.mock.calls.filter(([, input]) => input.operation === 'employees.configure')
  expect(writes).toHaveLength(1)
  expect(writes[0][1].input.config.proactive).toMatchObject({ enabled: true, frequency: 'normal', quietStart: 22, quietEnd: 8 })
  expect(node.textContent).toContain('旧版手动行为计划已停用')
  expect(node.querySelector('[aria-label="后台活动记录详情"]')?.textContent).not.toContain('已问候')
  expect(f.request.mock.calls.some(([, input]) => input.operation === 'employees.runBehavior')).toBe(false)
})
it('reads fresh profile on return so externally saved plans are not overwritten by an old settings page', async () => {
  const f = fixture()
  await mount(f)
  const props = { api: f.api, agent: f.agent, snapshot: f.snapshot, onEditSource: vi.fn() }
  await act(async () => root!.render(h(PersonalityPane, { ...props, active: false })))
  await f.request('executeApplicationOperation', { operation: 'employees.configure', input: { config: { ...f.profile, behaviors: [{ ...sampleBehavior(), instruction: '另一页面已保存' }] } } })
  await act(async () => root!.render(h(PersonalityPane, { ...props, active: true })))
  await act(async () => document.querySelector<HTMLInputElement>('#personality-emotions')!.click())
  expect(f.profile.behaviors[0].instruction).toBe('另一页面已保存')
  const writes = f.request.mock.calls.filter(([, input]) => input.operation === 'employees.configure')
  expect(writes.at(-1)?.[1].input.expectedRevision).toBe(1)
})

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
it('confirms deletion and updates only history while retaining the visible section and other controls', async () => {
  const f = fixture(), original = f.request.getMockImplementation()!, gate = deferred()
  let removed = false
  f.request.mockImplementation(async (method, input) => {
    if (input.operation === 'employees.deleteBehaviorHistory') { await gate.promise; removed = true; return { status: 'succeeded', data: { agentId: 'employee', deletedCount: 1 } } }
    if (removed && input.operation === 'employees.behaviorHistory') return { status: 'succeeded', data: [] }
    return original(method, input)
  })
  const node = await mount(f), edit = button('编辑人格')
  const region = node.querySelector('[aria-label="后台活动记录详情"]')
  await act(async () => button('删除后台活动记录 历史活动').click())
  expect(document.body.textContent).toContain('删除这条后台活动记录？')
  await act(async () => button('取消').click())
  expect(f.request.mock.calls.some(([, input]) => input.operation === 'employees.deleteBehaviorHistory')).toBe(false)
  await act(async () => button('删除后台活动记录 历史活动').click())
  await act(async () => button('确认删除').click())
  expect(button('刷新记录').disabled).toBe(true)
  expect(edit.matches(':disabled')).toBe(false)
  await act(async () => gate.resolve())
  const writes = f.request.mock.calls.filter(([, input]) => input.operation === 'employees.deleteBehaviorHistory')
  expect(writes).toHaveLength(1)
  expect(writes[0][1]).toMatchObject({ requestId: expect.any(String), input: { agentId: 'employee', runId: 'old-run' } })
  expect(node.querySelector('[aria-label="后台活动记录详情"]')).toBe(region)
  expect(region?.textContent).toContain('暂无后台活动记录')
  expect(node.querySelector('[data-slot=collapsible]')).toBeNull()
  expect(f.request.mock.calls.filter(([, input]) => input.operation === 'employees.profile')).toHaveLength(1)
  expect(f.request.mock.calls.filter(([, input]) => input.operation === 'employees.state')).toHaveLength(1)
})

it('freezes the clear cutoff at confirmation opening and retains running records', async () => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-19T12:00:00Z'))
  const f = fixture(), original = f.request.getMockImplementation()!
  let cleared = false
  f.request.mockImplementation(async (method, input) => {
    if (input.operation === 'employees.clearBehaviorHistory') { cleared = true; return { status: 'succeeded', data: { agentId: 'employee', deletedCount: 1 } } }
    if (input.operation === 'employees.behaviorHistory') return { status: 'succeeded', data: [...(cleared ? [] : [{ id: 'ended', kind: 'emotion', status: 'completed', startedAt: '2026-10-18T09:00:00Z' }]), { id: 'active', kind: 'reflection', status: 'running', startedAt: '2026-10-19T11:59:00Z' }] }
    return original(method, input)
  })
  const node = await mount(f)
  expect(button('删除后台活动记录 日终反思').disabled).toBe(true)
  await act(async () => button('全部清空').click())
  vi.setSystemTime(new Date('2026-10-19T12:01:00Z'))
  await act(async () => button('确认清空').click())
  const writes = f.request.mock.calls.filter(([, input]) => input.operation === 'employees.clearBehaviorHistory')
  expect(writes).toHaveLength(1)
  expect(writes[0][1]).toMatchObject({ requestId: expect.any(String), input: { agentId: 'employee', before: '2026-10-19T12:00:00.000Z' } })
  expect(node.querySelector('[data-activity-id="ended"]')).toBeNull()
  expect(node.querySelector('[data-activity-id="active"]')).not.toBeNull()
  expect(button('全部清空').disabled).toBe(true)
})

it('retains an unknown deletion and checks its original receipt without resubmitting', async () => {
  const f = fixture(), original = f.request.getMockImplementation()!
  f.request.mockImplementation(async (method, input) => input?.operation === 'employees.deleteBehaviorHistory' ? { status: 'unknown' } : original(method, input))
  const node = await mount(f)
  await act(async () => button('删除后台活动记录 历史活动').click())
  await act(async () => button('确认删除').click())
  expect(node.querySelector('[data-activity-id="old-run"]')).not.toBeNull()
  expect(button('全部清空').disabled).toBe(true)
  const writes = f.request.mock.calls.filter(([, input]) => input.operation === 'employees.deleteBehaviorHistory')
  await act(async () => button('核对已保存配置与记录').click())
  expect(f.request).toHaveBeenCalledWith('getApplicationReceipt', { requestId: writes[0][1].requestId })
  expect(f.request.mock.calls.filter(([, input]) => input.operation === 'employees.deleteBehaviorHistory')).toHaveLength(1)
})
it('keeps other controls and open content stable while serializing rapid changes against the latest revision', async () => {
  const f = fixture(), gate = deferred(), original = f.request.getMockImplementation()!
  let first = true
  f.request.mockImplementation(async (method, input) => {
    if (input.operation === 'employees.configure' && first) { first = false; await gate.promise }
    return original(method, input)
  })
  const node = await mount(f)
  const records = node.querySelector('[aria-label="后台活动记录详情"]')
  const edit = button('编辑人格'), form = node.querySelector('fieldset')!
  const emotion = node.querySelector<HTMLInputElement>('#personality-emotions')!
  const growth = node.querySelector<HTMLInputElement>('#personality-growth')!
  await act(async () => emotion.click())
  expect(form.disabled).toBe(false)
  expect(edit.matches(':disabled')).toBe(false)
  expect(emotion.matches(':disabled')).toBe(true)
  expect(growth.matches(':disabled')).toBe(false)
  await act(async () => growth.click())
  expect(emotion.checked).toBe(true)
  expect(growth.checked).toBe(true)
  expect(f.request.mock.calls.filter(([, input]) => input.operation === 'employees.configure')).toHaveLength(1)
  await act(async () => gate.resolve())
  const writes = f.request.mock.calls.filter(([, input]) => input.operation === 'employees.configure')
  expect(writes.map(([, input]) => input.input.expectedRevision)).toEqual([0, 1])
  expect(f.profile.features).toMatchObject({ emotions: true, growth: true })
  expect(node.querySelector('[aria-label="后台活动记录详情"]')).toBe(records)
  expect(button('编辑人格')).toBe(edit)
  expect(node.querySelector('fieldset')).toBe(form)
  expect(f.request.mock.calls.filter(([, input]) => input.operation === 'employees.profile')).toHaveLength(1)
  expect(f.request.mock.calls.filter(([, input]) => input.operation === 'employees.behaviorHistory')).toHaveLength(1)
})
it('leaves queued edits unsent when the preceding save becomes unknown', async () => {
  const f = fixture(), gate = deferred(), original = f.request.getMockImplementation()!
  f.request.mockImplementation(async (method, input) => {
    if (input.operation === 'employees.configure') { await gate.promise; return { status: 'unknown' } }
    return original(method, input)
  })
  const node = await mount(f)
  await act(async () => node.querySelector<HTMLInputElement>('#personality-emotions')!.click())
  await act(async () => node.querySelector<HTMLInputElement>('#personality-growth')!.click())
  await act(async () => gate.resolve())
  expect(node.querySelector('fieldset')!.disabled).toBe(true)
  expect(node.querySelector<HTMLInputElement>('#personality-emotions')!.checked).toBe(true)
  expect(node.querySelector<HTMLInputElement>('#personality-growth')!.checked).toBe(true)
  const writes = f.request.mock.calls.filter(([, input]) => input.operation === 'employees.configure')
  expect(writes).toHaveLength(1)
  await act(async () => button('核对已保存配置与记录').click())
  expect(f.request).toHaveBeenCalledWith('getApplicationReceipt', { requestId: writes[0][1].requestId })
  expect(f.request.mock.calls.filter(([, input]) => input.operation === 'employees.configure')).toHaveLength(1)
})
it('updates rest locally without rereading profile or activity history and preserves the next state revision', async () => {
  const f = fixture(), gate = deferred(), original = f.request.getMockImplementation()!
  f.profile.features.fatigue = true
  let revision = 1, sleeping = false
  f.request.mockImplementation(async (method, input) => {
    if (input.operation === 'employees.updateState') {
      await gate.promise; revision++; sleeping = input.input.change.action === 'sleep'
      return { status: 'succeeded', data: { revision } }
    }
    if (input.operation === 'employees.state') return { status: 'succeeded', data: { base: { revision }, effective: { mood: 'neutral', valence: 5, energy: 5, fatigue: 25, sleeping } } }
    return original(method, input)
  })
  const node = await mount(f), rest = button('休息'), edit = button('编辑人格')
  const form = node.querySelector('fieldset')!
  await act(async () => rest.click())
  expect(form.disabled).toBe(false)
  expect(rest.matches(':disabled')).toBe(true)
  expect(edit.matches(':disabled')).toBe(false)
  expect(node.querySelector<HTMLInputElement>('#personality-emotions')!.matches(':disabled')).toBe(false)
  await act(async () => gate.resolve())
  expect(button('休息中')).toBe(rest)
  expect(rest.getAttribute('aria-pressed')).toBe('true')
  expect(button('编辑人格')).toBe(edit)
  await act(async () => rest.click())
  expect(button('休息')).toBe(rest)
  const writes = f.request.mock.calls.filter(([, input]) => input.operation === 'employees.updateState')
  expect(writes.map(([, input]) => input.input.expectedRevision)).toEqual([1, 2])
  expect(f.request.mock.calls.filter(([, input]) => input.operation === 'employees.state')).toHaveLength(3)
  expect(f.request.mock.calls.filter(([, input]) => input.operation === 'employees.profile')).toHaveLength(1)
  expect(f.request.mock.calls.filter(([, input]) => input.operation === 'employees.behaviorHistory')).toHaveLength(1)
})
