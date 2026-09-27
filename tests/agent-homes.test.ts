import { afterEach, expect, test } from 'vitest'
import { mkdtemp, readFile, writeFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { AgentHomes } from '../src/runtime/agent-homes'
import { ProductStore } from '../src/runtime/store'
import { MemoryRepository } from '../src/runtime/memory'
import { prepareV2DataRoot } from '../src/main/migration'
import type { DigitalAgent, MemoryQuery, MemoryView, Conversation } from '../src/shared/contracts'
const roots: string[] = []
const stores: ProductStore[] = []
afterEach(async () => { for (const store of stores.splice(0)) await store.close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'boai-homes-')); roots.push(root)
  const agent: DigitalAgent = { id: 'researcher', name: '研究员', role: '研究', instructions: '原始工作指令，必须保留。', color: '#112233', connectionId: '', modelId: '', skillIds: [], knowledgeIds: [], active: true, allowCommands: false, configVersion: 1 }
  const homes = new AgentHomes(root); await homes.initialize(agent)
  return { root, agent, homes }
}
const empty: MemoryView = { entries: [], epoch: 0, namespace: 'test' }
test('each employee has separate source files; ordinary bootstrap does not read root private projections', async () => {
  const { root, agent, homes } = await setup()
  const second = { ...agent, id: 'writer', workspaceRef: undefined }; await homes.initialize(second)
  expect((await homes.read(agent, 'AGENTS.md')).content).toBe(agent.instructions)
  await writeFile(join(homes.root(agent.id), 'MEMORY.md'), 'PRIVATE_SENTINEL')
  const conversation: Conversation = { id: 'group', kind: 'group', title: 'group', agentIds: [agent.id], mode: 'natural', workspacePath: join(root, 'workspaces/group'), sharedKnowledgeIds: [], createdAt: '', updatedAt: '' }
  const { bootstrap, workspace } = await homes.load(agent, conversation, empty, 'run')
  expect(bootstrap.instructions).not.toContain('PRIVATE_SENTINEL')
  expect(workspace.root).toBe(join(root, 'agents/researcher/workspace/sessions/group'))
  expect((await homes.inspect(second)).workspacePath).not.toBe((await homes.inspect(agent)).workspacePath)
  expect(bootstrap.instructions.match(/原始工作指令/g)).toHaveLength(1)
})
test('source writes require matching hash and recover unfinished DB/file commit without overwriting later edits', async () => {
  const { agent, homes } = await setup()
  const file = await homes.read(agent, 'AGENTS.md')
  await expect(homes.save(agent, 'AGENTS.md', 'new', 'wrong')).rejects.toThrow('文件已被修改')
  await homes.save(agent, 'AGENTS.md', '新的工作规则', file.hash)
  await homes.initialize(agent)
  expect(agent.configVersion).toBe(2)
  expect(agent.instructions).toBe('新的工作规则')
  const next = await homes.read(agent, 'AGENTS.md')
  await homes.save(agent, 'AGENTS.md', 'pending', next.hash)
  await writeFile(next.path, '用户后来的改动')
  await homes.initialize(agent)
  expect((await homes.read(agent, 'AGENTS.md')).content).toBe('用户后来的改动')
})
test('external projection changes are preserved and only explicit regeneration replaces them with a saved copy', async () => {
  const { root, agent, homes } = await setup()
  const file = await homes.read(agent, 'MEMORY.md')
  await writeFile(file.path, '外部笔记不是已批准记忆')
  await homes.regenerate(agent, empty)
  expect((await homes.read(agent, 'MEMORY.md')).status).toBe('modified')
  expect((await homes.read(agent, 'MEMORY.md')).content).toContain('外部笔记')
  await homes.regenerate(agent, empty, undefined, true)
  expect((await homes.read(agent, 'MEMORY.md')).status).toBe('current')
  const { readdir } = await import('node:fs/promises')
  const backups = await readdir(join(root, 'agents/researcher/state/projection-conflicts'))
  expect(backups).toHaveLength(1)
  expect(await readFile(join(root, 'agents/researcher/state/projection-conflicts', backups[0]), 'utf8')).toContain('外部笔记')
})
test('missing sources, oversized inputs and symlink sources do not silently load or overwrite other files', async () => {
  const { root, agent, homes } = await setup()
  const file = await homes.read(agent, 'SOUL.md')
  await expect(homes.save(agent, 'SOUL.md', 'x'.repeat(65537), file.hash)).rejects.toThrow('64 KiB')
  await rm(file.path)
  expect((await homes.read(agent, 'SOUL.md')).status).toBe('missing')
  await homes.initialize(agent)
  expect((await homes.read(agent, 'SOUL.md')).status).toBe('missing')
  await writeFile(join(root, 'outside.md'), 'outside')
  await symlink(join(root, 'outside.md'), file.path)
  expect((await homes.read(agent, 'SOUL.md')).status).toBe('invalid')
  await expect(homes.save(agent, 'SOUL.md', 'new', '')).rejects.toThrow('符号链接')
  expect(await readFile(join(root, 'outside.md'), 'utf8')).toBe('outside')
})
test('canonical memory survives restart, isolates namespaces, checks sources and rejects late extraction after clear', async () => {
  const { root } = await setup(); const store = new ProductStore(join(root, 'boai.sqlite')); stores.push(store); await store.init()
  let memory = new MemoryRepository(store); await memory.init()
  const query: MemoryQuery = { agentId: 'researcher', scope: 'conversation', conversationId: 'direct' }
  await memory.extract(query, [{ content: '用户希望简洁回复', sourceMessageIds: ['m1'] }], 0, ['m1'], [])
  expect((await memory.get({ ...query, conversationId: 'group' })).entries).toHaveLength(0)
  expect((await memory.get({ ...query, agentId: 'writer' })).entries).toHaveLength(0)
  memory = new MemoryRepository(store); await memory.init(); expect((await memory.get(query)).entries).toHaveLength(1)
  await expect(memory.extract(query, [{ content: 'fake', sourceMessageIds: ['missing'] }], 1, ['m1'], [])).rejects.toThrow('未授权来源')
  await memory.clear(query, 1)
  await expect(memory.extract(query, [{ content: 'late', sourceMessageIds: ['m1'] }], 1, ['m1'], [])).rejects.toThrow('记忆已变更')
  expect((await memory.get(query)).entries).toHaveLength(0)
  const tombstones = await store.load<{ deletedAt?: string }>('memory'); expect(tombstones[0].deletedAt).toBeTruthy()
})
test('revoking a knowledge source invalidates derived memories', async () => {
  const { root } = await setup(); const store = new ProductStore(join(root, 'boai.sqlite')); stores.push(store); await store.init()
  const memory = new MemoryRepository(store); await memory.init()
  const query: MemoryQuery = { agentId: 'researcher', scope: 'conversation', conversationId: 'group' }
  await memory.extract(query, [{ content: '资料结论', sourceMessageIds: ['m1'], sourceResourceIds: ['k1'] }], 0, ['m1'], ['k1'])
  await memory.invalidateResources(['k1']); expect((await memory.get(query)).entries).toHaveLength(0)
})
test('v0.1 migration creates an independent consistent snapshot; later old-version writes cannot change v2', async () => {
  const { root } = await setup()
  const old = new ProductStore(join(root, 'boai.sqlite')); await old.init(); await old.write([{ collection: 'messages', id: 'm1', value: { id: 'm1', content: 'history' } }]); await old.close()
  const v2 = await prepareV2DataRoot(root)
  const next = new ProductStore(join(v2, 'boai.sqlite')); stores.push(next); await next.init()
  expect(await next.load('messages')).toEqual([{ id: 'm1', content: 'history' }])
  const reopenedOld = new ProductStore(join(root, 'boai.sqlite')); await reopenedOld.init(); await reopenedOld.write([{ collection: 'messages', id: 'm1', value: { id: 'm1', content: 'old fork' } }]); await reopenedOld.close()
  expect(await next.load('messages')).toEqual([{ id: 'm1', content: 'history' }])
  expect(await prepareV2DataRoot(root)).toBe(v2)
})
test('a failed copy preserves legacy records, removes incomplete staging and allows retry', async () => {
  const { root } = await setup()
  const old = new ProductStore(join(root, 'boai.sqlite')); await old.init(); await old.write([{ collection: 'agents', id: 'a', value: { id: 'a' } }]); await old.close()
  await symlink(join(root, 'agents'), join(root, 'skills'))
  await expect(prepareV2DataRoot(root)).rejects.toThrow('原有数据保持不变')
  const { readdir } = await import('node:fs/promises')
  expect((await readdir(root)).some(name => name.startsWith('.v2-migration') || name === 'v2')).toBe(false)
  const verify = new ProductStore(join(root, 'boai.sqlite')); await verify.init(); expect(await verify.load('agents')).toEqual([{ id: 'a' }]); await verify.close()
  await rm(join(root, 'skills')); expect(await prepareV2DataRoot(root)).toBe(join(root, 'v2'))
})
test('source changes become a new config version while an earlier bootstrap remains immutable', async () => {
  const { root, agent, homes } = await setup()
  const conversation: Conversation = { id: 'group', kind: 'group', title: 'group', agentIds: [agent.id], mode: 'natural', workspacePath: join(root, 'workspaces/group'), sharedKnowledgeIds: [], createdAt: '', updatedAt: '' }
  const previous = await homes.load(agent, conversation, empty, 'run-1')
  await writeFile(join(homes.root(agent.id), 'AGENTS.md'), '外部新规则')
  expect(await homes.reconcile(agent)).toBe(true); await homes.commit(agent)
  expect(agent.configVersion).toBe(2)
  const current = await homes.load(agent, conversation, empty, 'run-2')
  expect(current.bootstrap.hashes['AGENTS.md']).not.toBe(previous.bootstrap.hashes['AGENTS.md'])
  expect(previous.bootstrap.instructions).toContain('原始工作指令')
  expect(current.bootstrap.instructions).toContain('外部新规则')
})
test('restart recovers version when a manifest was committed before the database record', async () => {
  const { agent, homes } = await setup()
  const staleDatabase = structuredClone(agent)
  await writeFile(join(homes.root(agent.id), 'AGENTS.md'), '外部规则版本二')
  await homes.initialize(agent)
  expect(agent.configVersion).toBe(2)
  await homes.initialize(staleDatabase)
  expect(staleDatabase.configVersion).toBe(2)
  expect(staleDatabase.instructions).toBe('外部规则版本二')
})
