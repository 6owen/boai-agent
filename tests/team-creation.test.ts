/*
 * [INPUT]: 真实 SQLite/AppService、隔离目录和团队严格合同。
 * [OUTPUT]: 草稿单实例、独立连接竞争、旧数据/重启、取消墓碑与零实体副作用验收。
 * [POS]: T1 团队创建存储及服务回归。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { TeamRepository } from '../packages/runtime/src/modules/teams/team-repository'
import { teamPlannerOutputSchema, type TeamDraft, type TeamEditable } from '../packages/shared/src/domain/team-creation'
import { AppService } from '../packages/runtime/src/service'
import type { Method, Methods } from '../packages/shared/src/ipc'

const roots: string[] = [], cleanup: (() => Promise<unknown> | void)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
const fields = (draft: TeamDraft): TeamEditable => ({ prompt: draft.prompt, selectedConnectionId: draft.selectedConnectionId, selectedModelId: draft.selectedModelId, createGroup: draft.createGroup, groupTitle: draft.groupTitle })
async function root() { const path = await mkdtemp(join(tmpdir(), 'boai-team-')); roots.push(path); return path }
async function repository(path: string) { const store = new ProductStore(join(path, 'boai.sqlite')); await store.init(); cleanup.push(() => store.close()); return { store, repo: new TeamRepository(store) } }
export const modelPlan = { kind: 'plan', schemaVersion: 1, name: '写作组', purpose: '编辑用户提供的文章', scenarioKind: 'work', assumptions: ['材料由用户提供'], collaborationGuide: '先讨论提纲，再撰写和审校', capabilityNotes: [], members: [{ name: '写手', role: '撰写文章', instructions: '自然简洁；不编造事实' }] }

test('strict model schema rejects capabilities, paths, duplicate names and member limits without truncating', () => {
  expect(teamPlannerOutputSchema.parse(modelPlan)).toEqual(modelPlan)
  for (const extra of [{ allowCommands: true }, { path: '/tmp/private' }, { connectionId: 'secret' }]) expect(teamPlannerOutputSchema.safeParse({ ...modelPlan, ...extra }).success).toBe(false)
  expect(teamPlannerOutputSchema.safeParse({ ...modelPlan, members: [{ ...modelPlan.members[0], skillIds: ['tool'] }] }).success).toBe(false)
  for (const count of [0, 13]) expect(teamPlannerOutputSchema.safeParse({ ...modelPlan, members: Array.from({ length: count }, (_, i) => ({ ...modelPlan.members[0], name: String(i) })) }).success).toBe(false)
  expect(teamPlannerOutputSchema.safeParse({ ...modelPlan, members: [modelPlan.members[0], modelPlan.members[0]] }).success).toBe(false)
  expect(teamPlannerOutputSchema.safeParse({ ...modelPlan, members: Array.from({ length: 12 }, (_, i) => ({ ...modelPlan.members[0], name: String(i) })) }).success).toBe(true)
})

test('independent connections open one draft and stale saves never overwrite the winning version', async () => {
  const path = await root(), a = await repository(path), b = await repository(path)
  const [first, second] = await Promise.all([a.repo.open(undefined), b.repo.open(undefined)])
  expect(first.id).toBe(second.id)
  const writes = await Promise.allSettled([a.repo, b.repo].map((repo, i) => repo.save({ draftId: first.id, expectedVersion: first.version, editableFields: { ...fields(first), prompt: `需求${i}` } })))
  expect(writes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
  expect(String((writes.find(result => result.status === 'rejected') as PromiseRejectedResult).reason)).toContain('DRAFT_CONFLICT')
  const stored = (await a.repo.get({ draftId: first.id })).draft
  expect(stored.version).toBe(2)
  await expect(a.repo.save({ draftId: first.id, expectedVersion: 2, editableFields: { ...fields(stored), allowCommands: true } })).rejects.toThrow()
  expect(await a.store.load('agents')).toEqual([]); expect(await a.store.load('conversations')).toEqual([])
})

test('abandon removes private content but an old draft cannot be revived', async () => {
  const { repo } = await repository(await root()), draft = await repo.open(undefined)
  const saved = await repo.save({ draftId: draft.id, expectedVersion: draft.version, editableFields: { ...fields(draft), prompt: 'private request' } })
  await repo.abandon({ draftId: draft.id, expectedVersion: saved.version })
  const tombstone = (await repo.get({ draftId: draft.id })).draft
  expect(tombstone.prompt).toBe(''); expect(tombstone.status).toBe('cancelled')
  await expect(repo.save({ draftId: draft.id, expectedVersion: tombstone.version, editableFields: fields(saved) })).rejects.toThrow('DRAFT_CONFLICT')
  expect((await repo.open(undefined)).id).not.toBe(draft.id)
})

test('real host reopens persisted input on restart and does not create agents, conversations, messages or Work', async () => {
  const dataPath = await root(); let calls = 0
  const start = async () => {
    const service = new AppService({ dataPath, engine: { run: async () => { calls++ }, test: async () => 'ok' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} }); await service.init()
    cleanup.push(() => service.close())
    return { service, api: <K extends Method>(method: K, input: Methods[K]['input']) => service.handle(method, input) as Promise<Methods[K]['output']> }
  }
  const a = await start(), before = await a.api('snapshot', undefined), draft = await a.api('openTeamDraft', undefined)
  const saved = await a.api('saveTeamDraft', { draftId: draft.id, expectedVersion: draft.version, editableFields: { ...fields(draft), prompt: '写作' } })
  await a.service.close(); cleanup.pop()
  const b = await start()
  expect(await b.api('openTeamDraft', undefined)).toEqual(saved)
  const after = await b.api('snapshot', undefined)
  expect(after.agents).toEqual(before.agents); expect(after.conversations).toEqual(before.conversations); expect(calls).toBe(0)
  const { store } = await repository(dataPath)
  for (const collection of ['messages', 'works', 'teamGenerations', 'teamCreations']) expect(await store.load(collection)).toEqual([])
})
