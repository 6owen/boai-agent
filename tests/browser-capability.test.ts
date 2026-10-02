/*
 * [INPUT]: 员工真实 SQLite 配置、版本保存和旧记录省略能力字段。
 * [OUTPUT]: 默认/新建/旧关闭与缺省 Mastra 员工及 bobo 浏览器可用；启动正规化不提升版本，旧值不影响后端切换且 ACP 不支持，技能/知识/命令边界保留。
 * [POS]: Browser 员工配置授权不变量；网页执行与宿主隔离另由 Browser 模块/BDD 验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { EmployeeService, agentSchema } from '../src/runtime/modules/employees/employee-service'
import { WorkspaceService } from '../src/runtime/modules/workspaces/workspace-service'
import type { AgentInput, DigitalAgent } from '../src/shared/domain'
import { isBrowserCapableAgent } from '../src/shared/domain'

const roots: string[] = [], stores: ProductStore[] = []
afterEach(async () => { for (const store of stores.splice(0)) await store.close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-browser-capability-')); roots.push(root)
  const store = new ProductStore(join(root, 'boai.sqlite')); stores.push(store); await store.init()
  const openEmployees = () => new EmployeeService(store, new WorkspaceService(root), { connection: () => ({ id: 'model', name: 'test', provider: 'openai-compatible', baseUrl: 'http://localhost', defaultModel: 'test', hasApiKey: false }), resource: () => undefined, cancel: async () => {}, invalidateMemory: async () => {}, changed: () => {} })
  const employees = openEmployees()
  await store.write(await employees.initialize())
  return { store, employees, openEmployees }
}
function input(agent: DigitalAgent): AgentInput { return { id: agent.id, expectedConfigVersion: agent.configVersion, name: agent.name, role: agent.role, instructions: agent.instructions, color: agent.color, connectionId: agent.connectionId, modelId: agent.modelId, skillIds: agent.skillIds, knowledgeIds: agent.knowledgeIds, allowCommands: false, active: true } }

test('browser capability is active Mastra identity, including old false and omitted flags', () => {
  const legacy = { active: true, executionBackend: { kind: 'mastra-model' as const }, allowBrowser: false }
  expect(isBrowserCapableAgent(legacy)).toBe(true)
  expect(isBrowserCapableAgent({ active: true })).toBe(true)
  expect(isBrowserCapableAgent({ ...legacy, active: false })).toBe(false)
  const acp = { ...legacy, allowBrowser: true, executionBackend: { kind: 'acp-local' as const, profileId: 'old' } }
  expect(isBrowserCapableAgent(acp)).toBe(false)
  expect(isBrowserCapableAgent(undefined)).toBe(false)
})

test('every new Mastra employee and bobo have browser capability without a separate saved switch', async () => {
  const { employees } = await fixture(), original = employees.get('researcher')
  expect(original.allowBrowser).toBe(true)
  expect(employees.get('bobo').allowBrowser).toBe(true)
  const saved = await employees.save(agentSchema.parse(input(original)))
  expect(saved.allowBrowser).toBe(true)
  const { id: _id, expectedConfigVersion: _version, ...newEmployee } = input(saved)
  expect((await employees.save({ ...newEmployee, allowBrowser: true })).allowBrowser).toBe(true)
  expect((await employees.save({ ...newEmployee, allowBrowser: false })).allowBrowser).toBe(true)
  expect((await employees.save(newEmployee)).allowBrowser).toBe(true)
})

test('legacy browser input does not revoke Mastra or obstruct ACP switches, while other ACP restrictions remain', async () => {
  const { employees, store } = await fixture(), original = employees.get('writer')
  const enabled = await employees.save({ ...input(original), allowBrowser: true })
  expect(enabled.allowBrowser).toBe(true)
  const renamed = await employees.save({ ...input(enabled), name: '长期写作员' })
  expect(renamed.allowBrowser).toBe(true)
  const acp = await employees.save({ ...input(renamed), allowBrowser: true, executionBackend: { kind: 'acp-local', profileId: 'local' } })
  expect(acp.allowBrowser).toBe(false)
  expect((await store.load<DigitalAgent>('agents')).find(agent => agent.id === original.id)?.allowBrowser).toBe(false)
  await expect(employees.save({ ...input(acp), allowCommands: true })).rejects.toThrow('命令')
  await expect(employees.save({ ...input(acp), skillIds: ['bound'] })).rejects.toThrow('Skills')
  await expect(employees.save({ ...input(acp), knowledgeIds: ['bound'] })).rejects.toThrow('知识')
  expect(employees.get(original.id)).toEqual(acp)
  const restored = await employees.save({ ...input(acp), allowBrowser: false, executionBackend: { kind: 'mastra-model' } })
  expect(restored.allowBrowser).toBe(true)
})

test('startup normalizes false and omitted legacy browser facts without upgrading versions or changing backend identity', async () => {
  const { employees, store, openEmployees } = await fixture()
  const missing = employees.get('researcher'); delete missing.allowBrowser
  const off = { ...employees.get('writer'), allowBrowser: false }
  const core = { ...employees.get('bobo'), allowBrowser: false }
  const acp = { ...off, id: 'acp-old', allowBrowser: true, executionBackend: { kind: 'acp-local' as const, profileId: 'existing-profile' } }
  await store.write([missing, off, core, acp].map(agent => ({ collection: 'agents', id: agent.id, value: agent })))
  const restarted = openEmployees(); await store.write(await restarted.initialize())
  for (const original of [missing, off, core]) expect(restarted.get(original.id)).toMatchObject({ allowBrowser: true, configVersion: original.configVersion, executionBackend: original.executionBackend })
  expect(restarted.get(acp.id)).toMatchObject({ allowBrowser: false, configVersion: acp.configVersion, executionBackend: acp.executionBackend })
  const persisted = await store.load<DigitalAgent>('agents')
  expect(persisted.filter(agent => agent.executionBackend?.kind === 'mastra-model').every(agent => agent.allowBrowser === true)).toBe(true)
  expect(persisted.find(agent => agent.id === acp.id)?.allowBrowser).toBe(false)
})
