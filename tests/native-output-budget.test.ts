/*
 * [OUTPUT]: 2026-10-13本机不展示/计入BOAI用量与预算；API独立受限，原生停止/身份/成果与未知不重放保持，实际验证归13组06 §147。
 * [INPUT]: 实际GroupScheduler/SQLite的混合同轮原生与API用量。
 * [OUTPUT]: 原生用量照常记账，API配额独立累计；API达到原16000边界仍停止，明确Work预算另由原仓库核对。
 * [POS]: 宿主输出预算作用域回归，零模型；真实任务由native-parity验收。
 * [PROTOCOL]: 变化同步Header和tests/.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { GroupScheduler, type SchedulerHooks } from '../src/runtime/group-scheduler'
import type { Conversation, DigitalAgent, Message } from '../src/shared/domain'
const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanups.splice(0).reverse()) await close() })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-output-budget-')), store = new ProductStore(join(root, 'product.sqlite'))
  await store.init()
  const now = new Date().toISOString(), employee = (id: string): DigitalAgent => ({ id, name: id, role: '员工', instructions: '按原请求处理', color: '#336699', connectionId: 'connection', modelId: 'fixture', skillIds: [], knowledgeIds: [], allowCommands: false, active: true, configVersion: 1 })
  const agents = [employee('api'), { ...employee('native'), executionBackend: { kind: 'codex-local' as const, profileId: 'profile' } }]
  const conversation: Conversation = { id: 'mixed', kind: 'group', title: '混合同轮', agentIds: agents.map(a => a.id), mode: 'natural', sharedKnowledgeIds: [], workspacePath: root, createdAt: now, updatedAt: now }
  const message: Message = { id: 'request', conversationId: conversation.id, senderType: 'user', senderId: 'user', senderName: '你', content: '原问题', status: 'completed', sequence: 1, createdAt: now }
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve }), signals: AbortSignal[] = []
  const hooks: SchedulerHooks = { critical: operation => operation(), conversation: () => conversation, agent: id => agents.find(a => a.id === id)!, message: id => id === message.id ? message : undefined,
    decide: async (_turn, _event, delivery, signal) => { signals.push(signal); await gate; return { action: 'pass', observedThroughSequence: delivery.observedThroughSequence } }, speak: async () => {}, settled: async () => {}, changed: () => {}, error: () => {} }
  const scheduler = new GroupScheduler(store, hooks), prepared = scheduler.prepare(conversation, message)
  await store.write(prepared.records); scheduler.accept(prepared)
  cleanups.push(async () => { release(); await scheduler.close(); await store.close(); await rm(root, { recursive: true, force: true }) })
  await expect.poll(() => signals.length).toBe(2)
  return { store, scheduler, turn: prepared.turn, signals }
}
it('keeps native usage out of the shared API allowance and still cancels at exactly 16000 API tokens', async () => {
  const f = await fixture()
  await f.scheduler.recordOutputUsage(f.turn.id, 29653, 'native')
  await f.scheduler.recordOutputUsage(f.turn.id, 15999, 'api')
  expect(f.signals.every(signal => !signal.aborted)).toBe(true)
  expect(await f.store.get('turns', f.turn.id)).toMatchObject({ tokenEstimate: 15999, apiTokenEstimate: 15999 })
  await f.scheduler.recordOutputUsage(f.turn.id, 1, 'api')
  expect(f.signals[0].aborted).toBe(true)
  expect(f.signals[1].aborted).toBe(false)
  expect(await f.store.get('turns', f.turn.id)).toMatchObject({ reason: '达到本轮输出用量上限', tokenEstimate: 16000, apiTokenEstimate: 16000 })
})
