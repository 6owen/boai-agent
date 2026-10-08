/*
 * [OUTPUT]: 实际本机阶段退出时完成普通聊天观测，保留已知部分/未知用量、已完整终态及原预算归属，不创建缺失调用或改API记录。
 * [OUTPUT]: 本机流式三个计数字段齐全仍须最终回执；中途计量保留但活动未知，最终字段缺失不继承旧值。
 * [OUTPUT]: 外部turn后续未知用量不可继承早期完整计量；API既有回执兼容。
 * [INPUT]: 真实 SQLite、资料用例和隔离活动证据。
 * [OUTPUT]: 当前资料名称覆盖本人历史显示且不改历史原文；按 senderType/senderId 隔离自动化与员工同 ID；保存竞争/失败/重启/备份、图片校验、时区/缺失/去重/区间/清理及旧预算无调用日期的意图回归。
 * [POS]: 个人资料模块与持久化测试；不使用真实用户数据或模型。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { ProfileRepository } from '../src/runtime/modules/profile/profile-repository'
import { aggregateActivity, unionDuration, type ActivityEvidence, type ProfileModelCall } from '../src/runtime/modules/profile/profile-activity'
import { validateAvatarImage } from '../src/runtime/modules/profile/avatar-image'
import { defaultUserProfile, isPersonalMessage, messageDisplayName, profileInitials } from '../src/shared/domain/profile'
import type { AgentRun, BudgetModelCall, Conversation, Message, WorkItem } from '../src/shared/domain'
import { ConversationHistory } from '../src/runtime/modules/conversations/history'

const stores = new Set<ProductStore>(), roots: string[] = []
afterEach(async () => { vi.restoreAllMocks(); for (const store of stores) await store.close(); stores.clear(); for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function setup() { const root = await mkdtemp(join(tmpdir(), 'boai-profile-')); roots.push(root); const store = new ProductStore(join(root, 'boai.sqlite')); stores.add(store); await store.init(); return { root, store, repo: new ProfileRepository(store) } }
const draft = { expectedRevision: 0, displayName: ' 小王 ', username: 'wenbo_1', avatar: { kind: 'text' as const } }
function png(width = 256, corrupt = false) {
  const chunk = (type: string, data: Buffer) => { const payload = Buffer.concat([Buffer.from(type), data]), size = Buffer.alloc(4), crc = Buffer.alloc(4); size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(payload)); return Buffer.concat([size, payload, crc]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(256, 4); ihdr[8] = 8; ihdr[9] = 6
  return 'data:image/png;base64,' + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', corrupt ? Buffer.from('broken') : deflateSync(Buffer.alloc((width * 4 + 1) * 256))), chunk('IEND', Buffer.alloc(0))]).toString('base64')
}
const range = { from: '2026-01-01', to: '2026-12-31', timezone: 'UTC' }, now = '2026-09-30T12:00:00Z'
const empty = (): ActivityEvidence => ({ calls: [], budgets: [], runs: [], messages: [], works: [], intervals: [], skills: [], resources: [] })
const run = (id: string, more: Partial<AgentRun> = {}) => ({ id, conversationId: 'c', createdAt: '2026-09-29T23:00:00Z', status: 'completed', ...more }) as AgentRun
const call = (id: string, usage?: ProfileModelCall['usage'], more: Partial<ProfileModelCall> = {}): ProfileModelCall => ({ id, runId: 'r', conversationId: 'c', phase: 'chat', startedAt: '2026-09-29T23:00:00Z', budgetOwned: false, usage, ...more })
const message = (id: string, date: string, more: Partial<Message> = {}) => ({ id, conversationId: 'c', senderId: 'user', senderType: 'user', senderName: '旧名字', createdAt: date, ...more }) as Message

test('default is a projection; concurrent revisions cannot overwrite and invalid writes preserve the committed profile', async () => {
  const { store, repo } = await setup()
  expect(await repo.get()).toEqual(defaultUserProfile); expect(await store.load('userProfiles')).toEqual([])
  const writes = await Promise.allSettled([repo.update(draft), repo.update({ ...draft, displayName: '另一个人' })])
  expect(writes.filter(item => item.status === 'fulfilled')).toHaveLength(1)
  const saved = await repo.get(); expect(saved.revision).toBe(1)
  for (const change of [{ displayName: ' ' }, { displayName: '😀'.repeat(41) }, { username: '中' }, { avatar: { kind: 'image', dataUrl: 'https://example.com/a.png' } }]) await expect(repo.update({ ...draft, expectedRevision: 1, ...change } as typeof draft)).rejects.toThrow()
  const put = vi.spyOn(store, 'transaction').mockRejectedValueOnce(new Error('disk full'))
  await expect(repo.update({ ...draft, expectedRevision: 1 })).rejects.toThrow('disk full'); put.mockRestore()
  expect(await repo.get()).toEqual(saved)
  await store.write([{ collection: 'userProfiles', id: 'user', value: { ...saved, schemaVersion: 9 } }])
  await expect(repo.update({ ...draft, expectedRevision: 1 })).rejects.toThrow('较新版本')
})

test('Unicode names, personal identity and validated local images keep employee defaults separate', async () => {
  expect(profileInitials('  Ada Lovelace ')).toBe('AL'); expect(profileInitials('王文博')).toBe('王文'); expect(profileInitials('👨‍👩‍👦😊X')).toBe('👨‍👩‍👦😊'); expect(profileInitials('')).toBe('我')
  const human = message('h', now, { origin: { automationId: 'a', occurrenceId: 'o', name: '闹钟' } as Message['origin'] })
  const profile = { ...defaultUserProfile, displayName: 'Ada 王' }
  expect(isPersonalMessage(human)).toBe(true); expect(messageDisplayName(human)).toBe(defaultUserProfile.displayName)
  expect(messageDisplayName(human, profile)).toBe('Ada 王')
  expect(messageDisplayName(human, { ...profile, displayName: 'Ada 新名' })).toBe('Ada 新名')
  expect(human.senderName).toBe('旧名字')
  const automated = { ...human, senderId: 'automation:a', senderName: '定时任务 · 闹钟' }, employee = { ...human, senderType: 'agent' as const, senderName: '同 ID 员工' }
  expect(isPersonalMessage(automated)).toBe(false); expect(isPersonalMessage(employee)).toBe(false)
  expect(messageDisplayName(automated, profile)).toBe(automated.senderName); expect(messageDisplayName(employee, profile)).toBe(employee.senderName)
  const { repo } = await setup(), image = png()
  expect(() => validateAvatarImage(image)).not.toThrow()
  for (const invalid of [png(1), png(256, true), image.slice(0, -10), 'data:image/png;base64,' + 'A'.repeat(400001)]) expect(() => validateAvatarImage(invalid)).toThrow()
  const saved = await repo.update({ ...draft, displayName: '😀'.repeat(40), avatar: { kind: 'image', dataUrl: image } })
  expect(saved.avatar).toEqual({ kind: 'image', dataUrl: image })
})

test('native adapter exit finishes a failed unmetered call without inventing zero usage', async () => {
  const { repo, store } = await setup()
  await store.write([{ collection: 'runs', id: 'r', value: run('r', { status: 'failed' }) }])
  await repo.start(call('native', undefined, { callUnit: 'external-turn' }))
  await repo.finishExternal('native')
  const [entry] = await store.load<ProfileModelCall>('profileModelCalls')
  expect(entry.finishedAt).toBeTruthy(); expect(entry.usage).toBeUndefined(); expect(entry.usageComplete).toBe(false)
  expect(await repo.activity(range)).toMatchObject({ totalTokens: null, unknownCalls: 1, incomplete: true })
})

test('native adapter exit preserves partial counts and cannot rewrite complete, budget-owned or legacy observations', async () => {
  const { repo, store } = await setup()
  const partial = call('partial', { inputTokens: 12, outputTokens: 5 }, { callUnit: 'external-turn', usageComplete: false })
  const complete = call('complete', { inputTokens: 12, outputTokens: 5, totalTokens: 17 }, { callUnit: 'external-turn', usageComplete: true, finishedAt: now })
  const budget = call('budget', undefined, { callUnit: 'external-turn', budgetOwned: true })
  const legacy = call('legacy')
  for (const entry of [partial, complete, budget, legacy]) await repo.start(entry)
  for (const id of ['partial', 'complete', 'budget', 'legacy', 'missing']) await repo.finishExternal(id)
  const entries = await store.load<ProfileModelCall>('profileModelCalls')
  expect(entries).toHaveLength(4)
  expect(entries.find(entry => entry.id === 'partial')).toMatchObject({ usage: partial.usage, usageComplete: false, finishedAt: expect.any(String) })
  for (const original of [complete, budget, legacy]) expect(entries.find(entry => entry.id === original.id)).toEqual(original)
})

test('a native external turn with later missing usage remains unknown instead of preserving a falsely complete early receipt', async () => {
  const { repo, store } = await setup()
  await store.write([{ collection: 'runs', id: 'r', value: run('r') }])
  await repo.start({ ...call('native'), callUnit: 'external-turn' })
  await repo.settle('native', { totalTokens: 12, outputTokens: 3 })
  await repo.settle('native', { inputTokens: 20 })
  const entries = await store.load<{ usage: unknown }>('profileModelCalls')
  expect(entries[0].usage).toEqual({ inputTokens: 20 })
  const result = await repo.activity(range)
  expect(result.incomplete).toBe(true); expect(result.unknownCalls).toBe(1)
})

test('native partial usage is retained but cannot become a complete activity total before its final receipt', async () => {
  const { repo, store } = await setup()
  await store.write([{ collection: 'runs', id: 'r', value: run('r') }])
  await repo.start({ ...call('native'), callUnit: 'external-turn' })
  const usage = { inputTokens: 20, outputTokens: 5, totalTokens: 25 }
  await repo.settle('native', usage, false)
  expect((await store.load<{ usage: unknown; usageComplete: boolean }>('profileModelCalls'))[0]).toMatchObject({ usage, usageComplete: false })
  expect(await repo.activity(range)).toMatchObject({ totalTokens: null, unknownCalls: 1, incomplete: true })
  await repo.settle('native', usage, true)
  expect(await repo.activity(range)).toMatchObject({ totalTokens: 25, unknownCalls: 0, incomplete: false })
  await repo.settle('native', { inputTokens: 20 }, true)
  expect(await repo.activity(range)).toMatchObject({ totalTokens: null, unknownCalls: 1, incomplete: true })
})

test('restart and a complete SQLite backup restore profile and evidence without merging target records', async () => {
  const { root, store, repo } = await setup()
  await store.backup(join(root, 'old.sqlite'))
  const saved = await repo.update({ ...draft, avatar: { kind: 'image', dataUrl: png() } })
  await repo.start(call('call')); await repo.settle('call', { totalTokens: 12 }); await repo.settle('call', { totalTokens: 12 }); await repo.settle('call', {})
  await store.write([{ collection: 'runs', id: 'r', value: run('r') }])
  await store.backup(join(root, 'backup.sqlite')); await store.close(); stores.delete(store)
  const reopen = async (filename: string) => { const db = new ProductStore(join(root, filename)); stores.add(db); await db.init(); return new ProfileRepository(db) }
  const restarted = await reopen('boai.sqlite'); expect(await restarted.get()).toEqual(saved)
  expect((await restarted.activity(range)).totalTokens).toBe(12)
  const restored = await reopen('backup.sqlite'); expect(await restored.get()).toEqual(saved); expect((await restored.activity(range)).totalTokens).toBe(12)
  expect(await (await reopen('old.sqlite')).get()).toEqual(defaultUserProfile)
})

test('only unique per-call receipts count; run totals, budgets and automation metadata never count twice', () => {
  const e = empty(); e.runs = [run('r', { usage: { totalTokens: 99999 } }), run('legacy')]
  e.calls = [call('a', { totalTokens: 10 }), call('a', { totalTokens: 10 }), call('b', { inputTokens: 3 }), call('zero', { inputTokens: 0, outputTokens: 0 }), call('auto', undefined, { budgetOwned: true }), call('sum', { inputTokens: 3, outputTokens: 7 })]
  e.budgets = [{ id: 'auto', runId: 'r', conversationId: 'c', phase: 'execution', reservedAt: now, settledAt: now, usage: { totalTokens: 20 } } as BudgetModelCall]
  const result = aggregateActivity(e, range, now)
  expect(result.totalTokens).toBe(40); expect(result.unknownCalls).toBe(1); expect(result.unrecordedRuns).toBe(1); expect(result.incomplete).toBe(true)
  expect(result.days.find(day => day.date === '2026-09-29')).toMatchObject({ tokens: 40, calls: 5, unknownCalls: 2 })
  e.calls = [call('zero', { totalTokens: 0 })]; e.runs = [run('r')]; e.budgets = []
  expect(aggregateActivity(e, range, now)).toMatchObject({ totalTokens: 0, incomplete: false })
  e.calls = [call('unknown')]; expect(aggregateActivity(e, range, now).totalTokens).toBeNull()
  e.calls = []; e.budgets = [{ id: 'legacy-budget', runId: 'r', conversationId: 'c', phase: 'execution', reservedAt: now, settledAt: now, usage: { totalTokens: 20 } } as BudgetModelCall]
  const legacy = aggregateActivity(e, range, now)
  expect(legacy.totalTokens).toBe(20); expect(legacy.incomplete).toBe(true)
  expect(legacy.days.every(day => day.tokens === null)).toBe(true)
})

test('natural dates honor UTC, year boundaries and DST; yesterday keeps the streak and automation cannot extend it', () => {
  const e = empty(); e.runs = [run('r')]; e.calls = [call('a', { totalTokens: 9 }, { startedAt: '2025-12-31T23:30:00Z' }), call('b', { totalTokens: 9 }, { startedAt: '2026-01-01T23:30:00Z' })]
  expect(aggregateActivity(e, range, now).peak).toEqual({ date: '2026-01-01', tokens: 9 })
  expect(aggregateActivity(e, { ...range, timezone: 'Asia/Singapore' }, now).peak).toEqual({ date: '2026-01-02', tokens: 9 })
  e.messages = [message('1', '2026-03-07T17:00:00Z'), message('2', '2026-03-08T16:00:00Z'), message('3', '2026-03-09T16:00:00Z'), message('auto', '2026-03-10T16:00:00Z', { senderId: 'automation:a' })]
  const result = aggregateActivity(e, { ...range, timezone: 'America/New_York' }, '2026-03-10T20:00:00Z')
  expect(result.currentStreak).toBe(3); expect(result.longestStreak).toBe(3); expect(result.chats).toBe(1)
  expect(result.days.at(-1)?.date).toBe('2026-03-10')
  expect(aggregateActivity(e, range, '2026-03-11T20:00:00Z').currentStreak).toBe(0)
  e.messages.push(message('unknown', 'invalid')); expect(aggregateActivity(e, range, now).currentStreak).toBeNull()
})

test('ended root task durations union child executions and exclude waits; absent reliable evidence stays unknown', () => {
  const e = empty(); e.works = [{ id: 'root', rootWorkId: 'root', status: 'failed' }, { id: 'child', parentWorkId: 'root', rootWorkId: 'root', status: 'delivered' }] as WorkItem[]
  e.runs = [run('r', { workId: 'root' }), run('c', { workId: 'child' })]
  e.intervals = [{ id: 'r', runId: 'r', conversationId: 'c', workId: 'root', complete: true, intervals: [{ from: '2026-01-01T00:00:00Z', to: '2026-01-01T00:00:10Z' }, { from: '2026-01-01T01:00:00Z', to: '2026-01-01T01:00:10Z' }] }, { id: 'c', runId: 'c', conversationId: 'c', workId: 'child', complete: true, intervals: [{ from: '2026-01-01T00:00:05Z', to: '2026-01-01T00:00:15Z' }] }]
  expect(aggregateActivity(e, range, now).longestTaskMs).toBe(25000)
  e.intervals[1].complete = false; expect(aggregateActivity(e, range, now).longestTaskMs).toBeNull()
  expect(unionDuration([{ from: now, to: 'bad' }])).toBeNull()
})

test('skill activation identities survive resource removal, deduplicate streaming callbacks and clear with their conversation', async () => {
  const { root, store, repo } = await setup(), e = empty(); e.runs = [run('r')]
  for (const [id, skillId] of [['call-1', 's1'], ['call-1', 's1'], ['call-2', 's2'], ['call-3', 's1']]) await repo.skill({ id, skillId, name: '同名技能', runId: 'r', conversationId: 'c', createdAt: now })
  await store.write([{ collection: 'runs', id: 'r', value: run('r') }]); await repo.start(call('m')); await repo.settle('m', { totalTokens: 10 }); await repo.update(draft)
  const activity = await repo.activity(range)
  expect(activity.skills).toEqual([{ id: 's1', name: '同名技能', count: 2, available: false }, { id: 's2', name: '同名技能', count: 1, available: false }]); expect(activity.skillActivations).toBe(3)
  const conversation = { id: 'c', title: '测试', workspacePath: join(root, 'workspaces/c') } as Conversation
  await new ConversationHistory(store, root).clear(conversation, false)
  const after = await repo.activity(range); expect(after.totalTokens).toBeNull(); expect(after.skillActivations).toBe(0); expect(after.dataVersion).not.toBe(activity.dataVersion)
  expect((await repo.get()).displayName).toBe('小王')
})

test('activity query bounds reject impossible dates and timezone; range buckets never replace all-time totals', async () => {
  const { repo } = await setup()
  for (const query of [{ ...range, from: '2026-02-30' }, { ...range, timezone: 'unknown' }, { ...range, to: '2028-01-01' }, { ...range, from: '2027-01-01' }]) await expect(repo.activity(query)).rejects.toThrow()
  const e = empty(); e.runs = [run('r')]; e.calls = [call('old', { totalTokens: 100 }, { startedAt: '2025-01-01T00:00:00Z' }), call('new', { totalTokens: 10 }, { thinking: 'low' })]
  const result = aggregateActivity(e, range, now); expect(result.totalTokens).toBe(110); expect(result.days.reduce((sum, day) => sum + (day.tokens ?? 0), 0)).toBe(10); expect(result.thinking).toEqual({ level: 'low', count: 1, samples: 1 })
})
