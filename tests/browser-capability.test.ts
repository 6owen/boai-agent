/*
 * [INPUT]: 员工真实 SQLite 配置、版本保存和旧记录省略能力字段。
 * [OUTPUT]: 浏览器不因创建/迁移/其他配置保存获得权限，只有已保存员工明确启用；ACP 拒绝且失败不变更原配置。
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

const roots: string[] = [], stores: ProductStore[] = []
afterEach(async () => { for (const store of stores.splice(0)) await store.close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-browser-capability-')); roots.push(root)
  const store = new ProductStore(join(root, 'boai.sqlite')); stores.push(store); await store.init()
  const employees = new EmployeeService(store, new WorkspaceService(root), { connection: () => ({ id: 'model', name: 'test', provider: 'openai-compatible', baseUrl: 'http://localhost', defaultModel: 'test', hasApiKey: false }), resource: () => undefined, cancel: async () => {}, invalidateMemory: async () => {}, changed: () => {} })
  await store.write(await employees.initialize())
  return { store, employees }
}
function input(agent: DigitalAgent): AgentInput { return { id: agent.id, expectedConfigVersion: agent.configVersion, name: agent.name, role: agent.role, instructions: agent.instructions, color: agent.color, connectionId: agent.connectionId, modelId: agent.modelId, skillIds: agent.skillIds, knowledgeIds: agent.knowledgeIds, allowCommands: false, active: true } }

test('creating an employee or saving an old employee never implicitly enables browser access', async () => {
  const { employees } = await fixture(), original = employees.get('researcher')
  expect(original.allowBrowser ?? false).toBe(false)
  const saved = await employees.save(agentSchema.parse(input(original)))
  expect(saved.allowBrowser).toBe(false)
  const { id: _id, expectedConfigVersion: _version, ...newEmployee } = input(saved)
  await expect(employees.save({ ...newEmployee, allowBrowser: true })).rejects.toThrow('先保存')
  expect((await employees.save(newEmployee)).allowBrowser).toBe(false)
})

test('explicit capability persists across unrelated updates, while ACP rejection leaves the original authority intact', async () => {
  const { employees, store } = await fixture(), original = employees.get('writer')
  const enabled = await employees.save({ ...input(original), allowBrowser: true })
  expect(enabled.allowBrowser).toBe(true)
  const renamed = await employees.save({ ...input(enabled), name: '长期写作员' })
  expect(renamed.allowBrowser).toBe(true)
  await expect(employees.save({ ...input(renamed), executionBackend: { kind: 'acp-local', profileId: 'local' } })).rejects.toThrow('浏览器能力')
  expect(employees.get(original.id)).toEqual(renamed)
  expect((await store.load<DigitalAgent>('agents')).find(agent => agent.id === original.id)?.allowBrowser).toBe(true)
  expect((await employees.save({ ...input(renamed), allowBrowser: false })).allowBrowser).toBe(false)
})
