/*
 * [INPUT]: 实际SQLite事务中的原生回答受理、传输提交与工作终态。
 * [OUTPUT]: 受理后未投递/提交后未完成在恢复时保持未知；原回答不可重放，已完成历史保持。
 * [POS]: 原生交互持久回执合同测试，零模型；不认证真实进程或完整故障矩阵。
 * [PROTOCOL]: 变化同步Header和tests/.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ProductStore } from '../src/runtime/adapters/storage/product-store'
import { ExecutionRepository } from '../src/runtime/modules/conversations/execution'
import type { AgentRun } from '../src/shared/domain'
import type { NativeAction } from '../src/shared/domain/execution'
const fixtures: { root: string; store: ProductStore }[] = []
afterEach(async () => { for (const f of fixtures.splice(0)) { await f.store.close(); await rm(f.root, { recursive: true, force: true }) } })
it.each(['accepted', 'submitted', 'completed'] as const)('audits %s answer on reopening without resubmitting it', async phase => {
  const root = await mkdtemp(join(tmpdir(), 'boai-native-action-')), path = join(root, 'product.sqlite'), store = new ProductStore(path)
  await store.init(); const f = { root, store }; fixtures.push(f)
  const run: AgentRun = { id: 'run', conversationId: 'chat', agentId: 'employee', agentName: '员工', triggerMessageId: 'question', messageId: 'reply', status: 'running', createdAt: new Date().toISOString(), toolEvents: [] }
  await store.write([{ collection: 'runs', id: run.id, value: run }])
  const repository = new ExecutionRepository(store, () => {}), abort = new AbortController()
  let ready!: () => void; const prepared = new Promise<void>(resolve => { ready = resolve })
  const response = repository.request(run, { id: 'native-question', kind: 'input', method: 'AskUserQuestion', title: '倍率', detail: {}, options: [], questions: [{ id: 'factor', question: '倍率是多少？' }] }, abort.signal, async () => { ready() })
  const responseSettled = response.then(value => ({ value }), error => ({ error }))
  await prepared
  const [action] = await store.load<NativeAction>('nativeActions')
  const deliver = await store.transaction(tx => repository.respondInTransaction(tx, action.id, { answers: { factor: ['9'] } }, 'message-answer'))
  expect((await store.load<NativeAction>('nativeActions'))[0]).toMatchObject({ status: 'answered', delivery: 'accepted', responseMessageId: 'message-answer' })
  if (phase === 'accepted') {
    abort.abort(new Error('simulated loss before transport submission'))
    expect(await responseSettled).toHaveProperty('error')
  } else {
    await deliver()
    expect(await responseSettled).toEqual({ value: { answers: { factor: ['9'] } } })
    await repository.submitted(run.id, 'native-question')
    if (phase === 'completed') await store.write([{ collection: 'runs', id: run.id, value: { ...run, status: 'completed' } }])
  }
  await store.close(); f.store = new ProductStore(path); await f.store.init()
  const restarted = new ExecutionRepository(f.store, () => {})
  await restarted.recover()
  const [saved] = await f.store.load<NativeAction>('nativeActions')
  expect(saved).toMatchObject({ status: 'answered', response: { answers: { factor: ['9'] } }, delivery: phase === 'completed' ? 'submitted' : 'unknown' })
  await expect(restarted.respond(saved.id, { answers: { factor: ['9'] } })).rejects.toThrow('此请求已结束')
  await expect(restarted.request(run, { ...action, id: 'native-question' }, new AbortController().signal)).rejects.toThrow('原生请求身份已使用')
  expect(await f.store.load<NativeAction>('nativeActions')).toHaveLength(1)
})
