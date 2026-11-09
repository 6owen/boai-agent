// @vitest-environment jsdom
/*
 * [INPUT]: Production application and source OAuth UI, isolated DOM and controlled application receipts.
 * [OUTPUT]: Real menu/checkbox selection excludes managed/employee-owned resources; directory and unknown-close recovery preserve the original creation intent.
 * [OUTPUT]: Capability recovery clicks resolve running/unknown application receipts and never reconcile preparing or replay the original write.
 * [OUTPUT]: Cleanup attempts survive lost receipts/reopen with one identity; a settled retained result permits a new explicit attempt only.
 * [OUTPUT]: Committed update/uninstall receipts remain pending until cleanup settles; only an unknown application permits mid-commit reconciliation.
 * [POS]: WT2 focused renderer tests; no Electron, personal accounts or real network.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { act, createElement as h } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { DesktopApi } from '@boai/shared/ipc'
import type { DataSource, SourceOAuthStatus } from '@boai/shared/domain/sources'
import type { CapabilityInspection, CapabilityOperation } from '@boai/shared/domain/capability-packages'
import { applicationSourceDefaults } from '@boai/shared/domain/resource-catalog'
import { ApplicationsView } from '../apps/electron/src/renderer/pages/library/applications-view'
import { SourceOAuthDialog } from '../apps/electron/src/renderer/pages/sources/source-oauth-dialog'
import { PENDING_SOURCE_CREATION_KEY } from '../apps/electron/src/renderer/pages/library/source-creation-request'
import { SourcePicker } from '../apps/electron/src/renderer/pages/sources/source-picker'
import { CapabilityPackagesDialog } from '../apps/electron/src/renderer/pages/library/capability-packages-dialog'

let root: Root, host: HTMLDivElement, request: ReturnType<typeof vi.fn>, api: DesktopApi
const source: DataSource = { ...applicationSourceDefaults('github'), id: 'source-1', revision: 1, createdAt: '2026-11-07T00:00:00Z', updatedAt: '2026-11-07T00:00:00Z', hasCredential: true, applicationOrigin: { applicationId: 'github', version: '1' } }
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true); vi.stubGlobal('PointerEvent', MouseEvent)
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  Element.prototype.getAnimations = () => []
  localStorage.clear(); host = document.createElement('div'); document.body.append(host); root = createRoot(host)
  request = vi.fn(async () => null); api = { request, subscribe: () => () => {} } as unknown as DesktopApi
})
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function click(text: string) {
  const button = [...document.querySelectorAll('button')].find(item => item.textContent?.trim() === text)
  expect(button, text).toBeTruthy(); await act(async () => button!.click())
}
async function input(label: string, value: string) {
  const element = document.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)
  expect(element).toBeTruthy()
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(element!, value); element!.dispatchEvent(new Event('input', { bubbles: true })) })
}
test('browsing a catalog performs no service connection and only explicit origins appear as existing accounts', async () => {
  await act(async () => root.render(h(ApplicationsView, { api, sources: [{ ...source, name: 'Personal' }, { ...source, id: 'legacy', name: 'Legacy URL match', applicationOrigin: undefined }], onOpenSource: vi.fn(), onChanged: vi.fn() })))
  await click('GitHub仓库、议题与拉取请求')
  expect(document.body.textContent).toContain('Personal'); expect(document.body.textContent).not.toContain('Legacy URL match')
  expect(request).not.toHaveBeenCalled()
})
test('a source with a lost response keeps its original intent, and no implicit test runs', async () => {
  const changed = vi.fn(), open = vi.fn(); let calls = 0
  request.mockImplementation(async (method: string) => {
    if (method === 'getApplicationReceipt') return calls > 0 ? { status: 'succeeded', data: source } : null
    if (method === 'executeApplicationOperation') { calls++; throw new Error('lost response') }
    throw new Error(`Unexpected ${method}`)
  })
  await act(async () => root.render(h(ApplicationsView, { api, sources: [], onOpenSource: open, onChanged: changed })))
  await click('GitHub仓库、议题与拉取请求'); await click('连接'); await input('访问密钥', 'fixture-secret')
  const form = document.querySelector('form')!
  await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })))
  expect(changed).toHaveBeenCalledWith(source); expect(open).toHaveBeenCalledWith(source)
  expect(request.mock.calls.filter(args => args[0] === 'executeApplicationOperation')).toHaveLength(1)
  const submitted = request.mock.calls.find(args => args[0] === 'executeApplicationOperation')![1]
  expect(submitted.input.applicationOrigin).toEqual({ applicationId: 'github', version: '1' })
  expect(submitted.input.config.enabled).toBe(false)
  expect(localStorage.getItem(PENDING_SOURCE_CREATION_KEY)).toBeNull()
  expect(request.mock.calls.some(args => args[0] === 'testDataSource')).toBe(false)
})
test('restart recovery can read an original receipt with an empty locked form without creating another source', async () => {
  localStorage.setItem(PENDING_SOURCE_CREATION_KEY, 'original-id')
  request.mockResolvedValue({ status: 'succeeded', data: source }); const changed = vi.fn()
  await act(async () => root.render(h(ApplicationsView, { api, sources: [], onOpenSource: vi.fn(), onChanged: changed })))
  await click('核对连接创建'); await click('核对创建结果')
  expect(changed).toHaveBeenCalledWith(source)
  expect(request).toHaveBeenCalledWith('getApplicationReceipt', { requestId: 'original-id' })
  expect(request.mock.calls.every(args => args[0] !== 'executeApplicationOperation')).toBe(true)
})
test('OAuth is explicit, keeps the Source identity and cancels on unmount', async () => {
  const oauth: DataSource = { ...source, type: 'mcp', mcp: { transport: 'http', url: 'https://mcp.example.test', authType: 'oauth' } }
  const state: SourceOAuthStatus = { authorizationId: 'authorization-1', sourceId: source.id, revision: 1, status: 'authorizing', expiresAt: new Date(Date.now() + 60000).toISOString(), url: 'https://login.example.test/authorize' }
  request.mockImplementation(async (method: string, value: any) => method === 'getApplicationReceipt' ? null : { status: 'succeeded', data: value.operation === 'sources.oauthStart' ? state : { ...state, status: 'cancelled' } })
  await act(async () => root.render(h(SourceOAuthDialog, { api, source: oauth, onClose: vi.fn(), onAuthorized: vi.fn() })))
  expect(request).not.toHaveBeenCalled(); await click('开始授权')
  expect(document.querySelector('a')?.href).toBe(state.url)
  expect(request.mock.calls.find(args => args[1]?.operation === 'sources.oauthStart')?.[1].input).toEqual({ id: source.id, expectedRevision: 1 })
  await act(async () => root.render(null))
  expect(request.mock.calls.find(args => args[1]?.operation === 'sources.oauthCancel')?.[1].input).toEqual({ authorizationId: 'authorization-1' })
})
test('a late authorization start after close is cancelled rather than attached to another dialog', async () => {
  let resolve!: (value: unknown) => void
  request.mockImplementation(async (method: string, value: any) => method === 'getApplicationReceipt' ? null : value.operation === 'sources.oauthStart' ? new Promise(value => { resolve = value }) : { status: 'succeeded', data: {} })
  const oauth: DataSource = { ...source, type: 'mcp', mcp: { transport: 'http', url: 'https://mcp.example.test', authType: 'oauth' } }
  await act(async () => root.render(h(SourceOAuthDialog, { api, source: oauth, onClose: vi.fn(), onAuthorized: vi.fn() })))
  await click('开始授权'); await act(async () => root.render(null))
  await act(async () => resolve({ status: 'succeeded', data: { authorizationId: 'late', sourceId: source.id, revision: 1, status: 'authorizing', expiresAt: new Date(Date.now() + 60000).toISOString() } }))
  expect(request.mock.calls.find(args => args[1]?.operation === 'sources.oauthCancel')?.[1].input).toEqual({ authorizationId: 'late' })
})

import type { Conversation, DigitalAgent, Snapshot } from '@boai/shared/domain'
import { CreateAgentDialog, PENDING_EMPLOYEE_CREATION_KEY } from '../apps/electron/src/renderer/components/employee/creation-dialogs'
test('employee creation resumes the original employee after reopen when opening its conversation previously failed', async () => {
  localStorage.setItem(PENDING_EMPLOYEE_CREATION_KEY, JSON.stringify({ requestId: 'created-employee', sessionRequestId: 'original-session' }))
  const employee = { id: 'employee-1', name: '研究员', configVersion: 1 } as DigitalAgent
  const conversation = { id: 'conversation-1', agentIds: [employee.id] } as Conversation
  request.mockImplementation(async (method: string, value: any) => {
    if (method === 'listLaunchProfiles' || method === 'listDataSources') return []
    if (method === 'getApplicationReceipt') return { status: 'succeeded', data: value.requestId === 'created-employee' ? employee : { conversationId: conversation.id } }
    if (method === 'getConversation') return { conversation }
    throw new Error(`Unexpected ${method}`)
  })
  const created = vi.fn()
  await act(async () => root.render(h(CreateAgentDialog, { api, snapshot: { agents: [], connections: [], resources: [], conversations: [] } as unknown as Snapshot, template: 'researcher', onClose: vi.fn(), onCreated: created })))
  await click('核对创建结果')
  expect(created).toHaveBeenCalledWith(conversation)
  expect(request.mock.calls.some(args => args[0] === 'executeApplicationOperation')).toBe(false)
  expect(localStorage.getItem(PENDING_EMPLOYEE_CREATION_KEY)).toBeNull()
})

test('ordinary source selection excludes package sources without changing existing bindings implicitly', async () => {
  const ordinary = { ...source, enabled: true, name: '普通连接' }
  const managed = { ...ordinary, id: 'package-source', name: '能力包连接', capabilityPackage: { installationId: 'installation-1', contributionId: 'mcp:github', version: 'hash' } }
  request.mockResolvedValue([ordinary, managed]); const changed = vi.fn(), opened = vi.fn()
  const props = { api, ids: [] as string[], onChange: changed, onOpen: opened, active: true, disabled: false }
  await act(async () => root.render(h(SourcePicker, props)))
  expect(changed).not.toHaveBeenCalled(); await click('添加数据源')
  const options = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
  expect(options.map(item => item.textContent)).toEqual(['普通连接'])
  await act(async () => options[0].click())
  expect(changed).toHaveBeenCalledExactlyOnceWith([ordinary.id])
  // A legacy mixed-in package ID remains removable, but never opens the ordinary editor or grants access.
  changed.mockClear()
  await act(async () => root.render(h(SourcePicker, { ...props, ids: [managed.id] })))
  expect(changed).not.toHaveBeenCalled()
  const menu = document.querySelector<HTMLButtonElement>('[aria-label="数据源操作 能力包连接"]')!
  await act(async () => menu.click())
  expect([...document.querySelectorAll('[role="menuitem"]')].map(item => item.textContent)).toEqual(['移除'])
  await act(async () => document.querySelector<HTMLElement>('[role="menuitem"]')!.click())
  await click('确认移除'); expect(changed).toHaveBeenCalledExactlyOnceWith([]); expect(opened).not.toHaveBeenCalled()
})

const employeeSnapshot = (): Snapshot => ({ agents: [], conversations: [], connections: [{ id: 'api', name: '已配置连接', provider: 'openai-compatible', baseUrl: 'https://example.test/v1', defaultModel: 'default-model' }], resources: [
  { id: 'global-skill', kind: 'skill', name: '公共技能', description: '', path: '/fixtures/shared-skill', createdAt: '' },
  { id: 'other-skill', kind: 'skill', name: '其他员工技能', description: '', path: '/fixtures/private-skill', ownerAgentId: 'other-employee', createdAt: '' },
] } as unknown as Snapshot)
async function chooseCreationConnection() {
  const select = document.querySelector<HTMLButtonElement>('[role="combobox"][aria-label="模型连接"]')!
  expect(select).toBeTruthy(); await act(async () => select.click())
  const option = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(item => item.textContent === '已配置连接 · default-model')!
  expect(option).toBeTruthy()
  await act(async () => { option.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); option.click() })
}
test('assistant creation binds only an explicitly selected public skill and sends a project directory without directory grants', async () => {
  const employee = { id: 'employee-1', name: '研究员', configVersion: 1 } as DigitalAgent
  const conversation = { id: 'conversation-1', agentIds: [employee.id] } as Conversation
  request.mockImplementation(async (method: string, value: any) => {
    if (method === 'listLaunchProfiles') return []
    if (method === 'listDataSources') return [source]
    if (method === 'chooseEmployeeDirectory') return '/fixtures/project'
    if (method === 'getApplicationReceipt') return null
    if (method === 'executeApplicationOperation') return { status: 'succeeded', data: value.operation === 'employees.create' ? employee : { conversationId: conversation.id } }
    if (method === 'getConversation') return { conversation }
    throw new Error(`Unexpected ${method}`)
  })
  const created = vi.fn()
  await act(async () => root.render(h(CreateAgentDialog, { api, snapshot: employeeSnapshot(), template: 'researcher', onClose: vi.fn(), onCreated: created })))
  const skills = [...document.querySelectorAll<HTMLElement>('.resource-option')]
  expect(skills.map(item => item.textContent)).toEqual(['公共技能/fixtures/shared-skill'])
  const checkbox = skills[0].querySelector<HTMLElement>('[role="checkbox"]')!
  expect(checkbox.getAttribute('aria-checked')).toBe('false')
  expect(request.mock.calls.some(args => args[0] === 'executeApplicationOperation')).toBe(false)
  await chooseCreationConnection(); await act(async () => checkbox.click()); await click('选择')
  expect(document.querySelector<HTMLInputElement>('input[aria-label="项目目录"]')?.value).toBe('/fixtures/project')
  await input('项目目录', '  /fixtures/project  '); await click('创建员工')
  const submitted = request.mock.calls.find(args => args[1]?.operation === 'employees.create')![1]
  expect(submitted.input).toMatchObject({ templateId: 'researcher', templateVersion: '1', skillIds: ['global-skill'], sourceIds: [], defaultProjectDirectory: '/fixtures/project', connectionId: 'api' })
  expect(submitted.input).not.toHaveProperty('directoryGrants')
  expect(created).toHaveBeenCalledExactlyOnceWith(conversation)
})

test('closing an unknown employee creation and reopening never repeats it, then resumes its original receipt', async () => {
  let known = false
  const employee = { id: 'employee-original', name: '研究员', configVersion: 1 } as DigitalAgent
  const conversation = { id: 'conversation-original', agentIds: [employee.id] } as Conversation
  request.mockImplementation(async (method: string, value: any) => {
    if (method === 'listLaunchProfiles' || method === 'listDataSources') return []
    if (method === 'getApplicationReceipt') return known && value.requestId === JSON.parse(localStorage.getItem(PENDING_EMPLOYEE_CREATION_KEY)!).requestId ? { status: 'succeeded', data: employee } : null
    if (method === 'executeApplicationOperation') { if (value.operation === 'employees.create') throw new Error('lost response'); return { status: 'succeeded', data: { conversationId: conversation.id } } }
    if (method === 'getConversation') return { conversation }
    throw new Error(`Unexpected ${method}`)
  })
  const created = vi.fn(), close = vi.fn(), props = { api, snapshot: employeeSnapshot(), onClose: close, onCreated: created }
  await act(async () => root.render(h(CreateAgentDialog, { ...props, template: 'researcher' })))
  await chooseCreationConnection(); await click('创建员工')
  const identity = JSON.parse(localStorage.getItem(PENDING_EMPLOYEE_CREATION_KEY)!)
  expect(Object.keys(identity).sort()).toEqual(['requestId', 'sessionRequestId'])
  await click('取消'); expect(close).toHaveBeenCalledOnce()
  await act(async () => root.render(null))
  await act(async () => root.render(h(CreateAgentDialog, { ...props, template: 'writer' })))
  await click('核对创建结果')
  expect(request.mock.calls.filter(args => args[1]?.operation === 'employees.create')).toHaveLength(1)
  expect(localStorage.getItem(PENDING_EMPLOYEE_CREATION_KEY)).not.toBeNull()
  known = true; await click('核对创建结果')
  expect(request.mock.calls.filter(args => args[1]?.operation === 'employees.create')).toHaveLength(1)
  expect(request.mock.calls.find(args => args[1]?.operation === 'sessions.create')?.[1]).toEqual({ operation: 'sessions.create', requestId: identity.sessionRequestId, input: { employeeId: employee.id } })
  expect(created).toHaveBeenCalledExactlyOnceWith(conversation)
  expect(localStorage.getItem(PENDING_EMPLOYEE_CREATION_KEY)).toBeNull()
})

const capabilityPendingKey = 'boai.library.pending-capability-request'
const capabilityRecoveryKey = 'boai.library.pending-capability-recovery'
const capabilityReceiptId = 'a'.repeat(64)
const packageInspection: CapabilityInspection = { format: 'portable', specVersion: 'agent-plugins/1.0.0', packageId: 'fixture-package', name: '测试能力包', version: '1', description: '', source: { kind: 'local', path: '/fixtures/package', origin: 'local' }, contentHash: 'b'.repeat(64), files: [], bytes: 0, definitions: [], unsupported: [], warnings: [], partialAllowed: false }
async function pendingPackageFixture(applicationStatus: 'running' | 'unknown', domainStatus: CapabilityOperation['status'], recoveredStatus: 'completed' | 'failed' = 'completed') {
  let operation: CapabilityOperation = { requestId: `application-${capabilityReceiptId}`, fingerprint: 'fingerprint', action: 'install', installationId: 'installation-1', status: domainStatus, phase: 'prepare' }
  const changed = vi.fn(), props = { api, onClose: vi.fn(), onChanged: changed }
  request.mockImplementation(async (method: string, value: any) => {
    if (method === 'snapshot') return { agents: [] }
    if (method === 'getApplicationReceipt') return { status: applicationStatus, receiptId: capabilityReceiptId }
    if (method === 'executeApplicationOperation') {
      if (value.operation === 'capabilityPackages.list') return { status: 'succeeded', data: [] }
      if (value.operation === 'capabilityPackages.inspect') return { status: 'succeeded', data: packageInspection }
      if (value.operation === 'capabilityPackages.install') throw new Error('lost original response')
      if (value.operation === 'capabilityPackages.receipt') return { status: 'succeeded', data: operation }
      if (value.operation === 'capabilityPackages.recover') {
        expect(operation.status).toBe('interrupted')
        operation = { ...operation, status: recoveredStatus, phase: 'reconciled' }
        return { status: 'succeeded', data: operation }
      }
    }
    throw new Error(`Unexpected ${method} ${value?.operation}`)
  })
  await act(async () => root.render(h(CapabilityPackagesDialog, props)))
  await input('能力包目录', packageInspection.source.path); await click('预检'); await click('导入能力包')
  const original = request.mock.calls.find(args => args[1]?.operation === 'capabilityPackages.install')![1]
  expect(localStorage.getItem(capabilityPendingKey)).toBe(original.requestId)
  return { changed, original, props, setStatus(status: CapabilityOperation['status']) { operation = { ...operation, status } } }
}
test.each(['running', 'unknown'] as const)('a %s application receipt recovers its package result by receipt identity without reconciling preparing work', async status => {
  const fixture = await pendingPackageFixture(status, 'preparing')
  await click('核对原操作'); await click('核对原操作')
  expect(request.mock.calls.filter(args => args[1]?.operation === 'capabilityPackages.receipt').map(args => args[1].input)).toEqual([{ applicationReceiptId: capabilityReceiptId }, { applicationReceiptId: capabilityReceiptId }])
  expect(request.mock.calls.some(args => args[1]?.operation === 'capabilityPackages.recover')).toBe(false)
  expect(fixture.changed).not.toHaveBeenCalled()
  expect(localStorage.getItem(capabilityPendingKey)).toBe(fixture.original.requestId)
  fixture.setStatus('completed'); await click('核对原操作')
  expect(request.mock.calls.filter(args => args[1]?.operation === 'capabilityPackages.install')).toHaveLength(1)
  expect(fixture.changed).toHaveBeenCalledOnce()
  expect(localStorage.getItem(capabilityPendingKey)).toBeNull()
})
test.each(['completed', 'failed'] as const)('reopening an interrupted package request reconciles its original domain identity to %s without replaying installation', async finalStatus => {
  const fixture = await pendingPackageFixture('unknown', 'interrupted', finalStatus)
  await act(async () => root.render(null))
  await act(async () => root.render(h(CapabilityPackagesDialog, fixture.props)))
  await click('核对原操作')
  expect(request).toHaveBeenCalledWith('getApplicationReceipt', { requestId: fixture.original.requestId })
  const recovery = request.mock.calls.filter(args => args[1]?.operation === 'capabilityPackages.recover')
  expect(recovery).toHaveLength(1)
  expect(recovery[0][1]).toEqual({ operation: 'capabilityPackages.recover', requestId: expect.any(String), input: { originalRequestId: `application-${capabilityReceiptId}` } })
  expect(recovery[0][1].requestId).not.toBe(fixture.original.requestId)
  expect(request.mock.calls.filter(args => args[1]?.operation === 'capabilityPackages.install')).toHaveLength(1)
  expect(fixture.changed).toHaveBeenCalledTimes(finalStatus === 'completed' ? 1 : 0)
  expect(localStorage.getItem(capabilityPendingKey)).toBeNull()
})

test('a settled cleanup with retained content permits a new explicit attempt against the same original operation', async () => {
  const fixture = await pendingPackageFixture('unknown', 'interrupted')
  const originalImplementation = request.getMockImplementation()! as (method: string, value: unknown) => Promise<unknown>
  let attempts = 0
  request.mockImplementation(async (method: string, value: any) => {
    if (method === 'executeApplicationOperation' && value.operation === 'capabilityPackages.recover') {
      attempts++
      return { status: 'succeeded', data: { requestId: `application-${capabilityReceiptId}`, status: attempts === 1 ? 'interrupted' : 'completed', retained: attempts === 1 ? ['/fixtures/customized-skill'] : [] } }
    }
    return originalImplementation(method, value)
  })
  await click('核对原操作')
  expect(attempts).toBe(1)
  expect(localStorage.getItem(capabilityRecoveryKey)).toBeNull()
  expect(localStorage.getItem(capabilityPendingKey)).toBe(fixture.original.requestId)
  expect(fixture.changed).not.toHaveBeenCalled()
  await click('核对原操作')
  const recoveries = request.mock.calls.filter(args => args[1]?.operation === 'capabilityPackages.recover').map(args => args[1])
  expect(recoveries).toHaveLength(2)
  expect(new Set(recoveries.map(item => item.requestId)).size).toBe(2)
  expect(recoveries.map(item => item.input)).toEqual([{ originalRequestId: `application-${capabilityReceiptId}` }, { originalRequestId: `application-${capabilityReceiptId}` }])
  expect(request.mock.calls.filter(args => args[1]?.operation === 'capabilityPackages.install')).toHaveLength(1)
  expect(fixture.changed).toHaveBeenCalledOnce()
  expect(localStorage.getItem(capabilityPendingKey)).toBeNull()
  expect(localStorage.getItem(capabilityRecoveryKey)).toBeNull()
})

test('a lost cleanup response survives reopen and reads the same attempt through unknown and running until completion', async () => {
  const fixture = await pendingPackageFixture('unknown', 'interrupted')
  const originalImplementation = request.getMockImplementation()! as (method: string, value: unknown) => Promise<unknown>
  let attemptId = '', attemptStatus: 'unknown' | 'running' | 'succeeded' = 'unknown'
  request.mockImplementation(async (method: string, value: any) => {
    if (method === 'executeApplicationOperation' && value.operation === 'capabilityPackages.recover') { attemptId = value.requestId; throw new Error('lost cleanup response') }
    if (method === 'getApplicationReceipt' && value.requestId === attemptId) return { status: attemptStatus, ...(attemptStatus === 'succeeded' ? { data: { requestId: `application-${capabilityReceiptId}`, status: 'completed' } } : {}) }
    return originalImplementation(method, value)
  })
  await click('核对原操作')
  expect(JSON.parse(localStorage.getItem(capabilityRecoveryKey)!)).toEqual({ pendingId: fixture.original.requestId, requestId: attemptId })
  await act(async () => root.render(null))
  await act(async () => root.render(h(CapabilityPackagesDialog, fixture.props)))
  const originalLookups = request.mock.calls.filter(args => args[0] === 'getApplicationReceipt' && args[1].requestId === fixture.original.requestId).length
  await click('核对原操作'); attemptStatus = 'running'; await click('核对原操作')
  expect(request.mock.calls.filter(args => args[1]?.operation === 'capabilityPackages.recover')).toHaveLength(1)
  expect(request.mock.calls.filter(args => args[0] === 'getApplicationReceipt' && args[1].requestId === fixture.original.requestId)).toHaveLength(originalLookups)
  expect(request.mock.calls.filter(args => args[0] === 'getApplicationReceipt' && args[1].requestId === attemptId)).toHaveLength(2)
  expect(JSON.parse(localStorage.getItem(capabilityRecoveryKey)!)).toEqual({ pendingId: fixture.original.requestId, requestId: attemptId })
  expect(fixture.changed).not.toHaveBeenCalled()
  attemptStatus = 'succeeded'; await click('核对原操作')
  expect(request.mock.calls.filter(args => args[1]?.operation === 'capabilityPackages.recover')).toHaveLength(1)
  expect(request.mock.calls.filter(args => args[1]?.operation === 'capabilityPackages.install')).toHaveLength(1)
  expect(fixture.changed).toHaveBeenCalledOnce()
  expect(localStorage.getItem(capabilityPendingKey)).toBeNull()
  expect(localStorage.getItem(capabilityRecoveryKey)).toBeNull()
})

async function committedCleanupFixture(action: 'update' | 'uninstall', applicationStatus: 'running' | 'unknown') {
  const originalRequestId = `original-${action}-request`
  localStorage.setItem(capabilityPendingKey, originalRequestId)
  let operation: CapabilityOperation = { requestId: `application-${capabilityReceiptId}`, fingerprint: 'fingerprint', action, installationId: 'installation-1', status: 'completed', phase: 'committed' }
  request.mockImplementation(async (method: string, value: any) => {
    if (method === 'snapshot') return { agents: [] }
    if (method === 'getApplicationReceipt') return { status: applicationStatus, receiptId: capabilityReceiptId }
    if (method === 'executeApplicationOperation') {
      if (value.operation === 'capabilityPackages.list') return { status: 'succeeded', data: [] }
      if (value.operation === 'capabilityPackages.receipt') return { status: 'succeeded', data: operation }
      if (value.operation === 'capabilityPackages.recover') { operation = { ...operation, phase: 'committed-cleaned' }; return { status: 'succeeded', data: operation } }
    }
    throw new Error(`Unexpected ${method} ${value?.operation}`)
  })
  const changed = vi.fn()
  await act(async () => root.render(h(CapabilityPackagesDialog, { api, onClose: vi.fn(), onChanged: changed })))
  return { changed, originalRequestId, finishWithRetained() { operation = { ...operation, phase: 'committed-cleanup-required', retained: ['/fixtures/customized-skill'] } } }
}
test('a running committed update remains pending until cleanup finishes, including a settled result with retained content', async () => {
  const fixture = await committedCleanupFixture('update', 'running')
  await click('核对原操作'); await click('核对原操作')
  expect(fixture.changed).not.toHaveBeenCalled()
  expect(localStorage.getItem(capabilityPendingKey)).toBe(fixture.originalRequestId)
  expect(request.mock.calls.some(args => args[1]?.operation === 'capabilityPackages.recover')).toBe(false)
  fixture.finishWithRetained(); await click('核对原操作')
  expect(fixture.changed).toHaveBeenCalledOnce()
  expect(localStorage.getItem(capabilityPendingKey)).toBeNull()
  expect(localStorage.getItem(capabilityRecoveryKey)).toBeNull()
  expect(request.mock.calls.some(args => ['capabilityPackages.update', 'capabilityPackages.recover'].includes(args[1]?.operation))).toBe(false)
})
test('an unknown application permits explicit reconciliation of a committed uninstall against its original identity', async () => {
  const fixture = await committedCleanupFixture('uninstall', 'unknown')
  await click('核对原操作')
  const recoveries = request.mock.calls.filter(args => args[1]?.operation === 'capabilityPackages.recover')
  expect(recoveries).toHaveLength(1)
  expect(recoveries[0][1].input).toEqual({ originalRequestId: `application-${capabilityReceiptId}` })
  expect(request.mock.calls.some(args => args[1]?.operation === 'capabilityPackages.uninstall')).toBe(false)
  expect(fixture.changed).toHaveBeenCalledOnce()
  expect(localStorage.getItem(capabilityPendingKey)).toBeNull()
  expect(localStorage.getItem(capabilityRecoveryKey)).toBeNull()
})
