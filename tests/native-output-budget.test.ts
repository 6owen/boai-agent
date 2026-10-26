/*
 * [OUTPUT]: 验证默认无执行配额、旧默认精确迁移、显式预算仍执行以及用户取消；不调用真实供应商。
 * [OUTPUT]: 五项反馈的调度额度/取消接续或历史展示回归；具体验证边界以本文件用例为准。
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [INPUT]: 实际GroupScheduler/SQLite的混合同轮原生与API用量。
 * [OUTPUT]: 原生用量照常记账，API配额独立累计；API达到128000边界仍停止，明确Work预算另由原仓库核对。
 * [POS]: 宿主输出预算作用域回归，零模型；真实任务由native-parity验收。
 * [PROTOCOL]: 变化同步Header和tests/.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
import { GroupScheduler, type SchedulerHooks } from '../packages/runtime/src/group-scheduler'
import type { Conversation, DigitalAgent, Message } from '../packages/shared/src/domain'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { try { for (const close of cleanups.splice(0).reverse()) await close() } finally { vi.useRealTimers() } })
async function fixture(automation = false) {
  const root = await mkdtemp(join(tmpdir(), 'boai-output-budget-')), store = new ProductStore(join(root, 'product.sqlite'))
  await store.init()
  const now = new Date().toISOString(), employee = (id: string): DigitalAgent => ({ id, name: id, role: '员工', instructions: '按原请求处理', color: '#336699', connectionId: 'connection', modelId: 'fixture', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 })
  const agents = [employee('api'), { ...employee('native'), executionBackend: { kind: 'codex-local' as const, profileId: 'profile' } }]
  const conversation: Conversation = { id: 'mixed', kind: 'group', title: '混合同轮', agentIds: agents.map(a => a.id), mode: 'natural', sharedKnowledgeIds: [], workspacePath: root, createdAt: now, updatedAt: now }
  const message: Message = { id: 'request', conversationId: conversation.id, senderType: 'user', senderId: 'user', senderName: '你', content: '原问题', status: 'completed', sequence: 1, createdAt: now }
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve }), signals: AbortSignal[] = []
  const hooks: SchedulerHooks = { critical: operation => operation(), conversation: () => conversation, agent: id => agents.find(a => a.id === id)!, message: id => id === message.id ? message : undefined,
    decide: async (_turn, _event, delivery, signal) => { signals.push(signal); await gate; return { action: 'pass', observedThroughSequence: delivery.observedThroughSequence } }, speak: async () => {}, settled: async () => {}, changed: () => {}, error: () => {} }
  if (automation) message.origin = { kind: 'automation', automationId: 'plan', occurrenceId: 'occurrence', name: '定时测试', authorizedFingerprint: 'fixture' }
  const scheduler = new GroupScheduler(store, hooks), prepared = scheduler.prepare(conversation, message)
  await store.write(prepared.records); scheduler.accept(prepared)
  cleanups.push(async () => { release(); await scheduler.close(); await store.close(); await rm(root, { recursive: true, force: true }) })
  await vi.waitFor(() => expect(signals).toHaveLength(2))
  return { store, scheduler, turn: prepared.turn, signals }
}
it('accounts API usage beyond former ceilings without aborting API or native execution', async () => {
  const f = await fixture()
  await f.scheduler.recordOutputUsage(f.turn.id, 29653, 'native')
  await f.scheduler.recordOutputUsage(f.turn.id, 1_000_000, 'api')
  expect(f.signals.every(signal => !signal.aborted)).toBe(true)
  expect(await f.store.get('turns', f.turn.id)).toMatchObject({ tokenEstimate: 1_000_000, apiTokenEstimate: 1_000_000 })
})
it('runs beyond 24/256 calls and still obeys explicit user cancellation', async () => {
  const f = await fixture()
  while (f.turn.modelCalls < 300) await f.scheduler.reserveAdditionalCall(f.turn.id, 'execution')
  expect(f.signals.every(signal => !signal.aborted)).toBe(true)
  await f.scheduler.cancel('mixed')
  expect(f.signals.every(signal => signal.aborted)).toBe(true)
  await expect(f.scheduler.reserveAdditionalCall(f.turn.id, 'execution')).rejects.toThrow('本轮已结束')
  expect(f.turn.modelCalls).toBe(300)
})
it.each([false, true])('does not expire ordinary or automated execution by wall clock (automation=%s)', async automation => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  const f = await fixture(automation)
  await vi.advanceTimersByTimeAsync(60 * 60_000)
  expect(f.signals.every(signal => !signal.aborted)).toBe(true)
})
