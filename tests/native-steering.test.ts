/*
 * [INPUT]: Real AppService/SQLite and isolated Codex stdio fixture.
 * [OUTPUT]: Current-turn steering, exact target, idempotence, loss and restart contracts; no model calls.
 * [POS]: Native input integration regression.
 * [PROTOCOL]: Changes update Header and .folder.md.
 */
import { afterEach, expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { nativeFixture } from './fixtures/native-product'
import type { Message } from '../packages/shared/src/domain'
import { ProductStore } from '../packages/runtime/src/adapters/storage/product-store'
const disposals: (() => Promise<void>)[] = []
afterEach(async () => { for (const dispose of disposals.splice(0).reverse()) await dispose() })
async function setup() {
  const f = await nativeFixture('codex', disposals)
  const original = await f.send('NATIVE_STEER_WAIT')
  const live = await f.waitForMessages(original, value => value.runs.some(run => run.backend?.canSteer))
  const run = live.runs.find(run => run.triggerMessageId === original.id)!
  const input = { conversationId: f.chat.id, requestId: crypto.randomUUID(), mentionIds: [], content: '把标题改成春季计划，保留原数字', steer: { runId: run.id, turnId: run.backend!.turnId! } }
  const cwd = join(f.root, 'agents', f.agent.id, 'workspace', 'sessions', f.chat.id, 'work')
  const calls = async () => (await readFile(join(cwd, 'native-steer-requests.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  return { ...f, get service() { return f.service }, original, run, input, calls, cwd }
}
it('delivers once into the original turn, preserves sources/session and never schedules a second run for steering', async () => {
  const f = await setup()
  const [first, duplicate] = await Promise.all([f.service.handle('sendMessage', f.input), f.service.handle('sendMessage', f.input)]) as Message[]
  expect(first.nativeSteering).toEqual({ ...f.input.steer, delivery: 'submitted' })
  expect(duplicate.id).toBe(first.id)
  const detail = await f.wait(f.original)
  expect(detail.runs).toHaveLength(1)
  expect(detail.runs[0].status, detail.runs[0].error).toBe('completed')
  expect(detail.messages.find(message => message.senderType === 'agent')?.content).toContain(f.input.content)
  expect(await f.calls()).toEqual([expect.objectContaining({ threadId: f.run.backend!.sessionId, expectedTurnId: f.input.steer.turnId, clientUserMessageId: first.id, input: [{ type: 'text', text: f.input.content, text_elements: [] }] })])
  expect(await f.service.handle('sendMessage', f.input)).toEqual(first)
  await expect(f.service.handle('sendMessage', { ...f.input, content: 'different' })).rejects.toThrow('requestId')
  const second = await f.wait(await f.send('只读继续'))
  expect(second.runs.at(-1)?.backend?.sessionId).toBe(f.run.backend!.sessionId)
  expect((await f.calls()).length).toBe(1)
  const sent = (await readFile(join(f.cwd, 'native-turn-requests.jsonl'), 'utf8')).trim().split('\n').map(line => JSON.parse(line))
  expect(JSON.parse(sent[1].input[0].text).messages.map((message: Message) => message.content)).not.toContain(f.input.content)
})
it('rejects stale turn, wrong room/recipient, and mixed input before creating a message or changing execution', async () => {
  const f = await setup()
  for (const patch of [
    { steer: { ...f.input.steer, turnId: 'stale' } },
    { mentionIds: ['someone-else'] },
    { stopPrevious: true },
    { composerReferences: [{ kind: 'skill', resourceId: 'not-bound' }] },
    { workingDirectory: '/tmp' },
  ]) await expect(f.service.handle('sendMessage', { ...f.input, ...patch, requestId: crypto.randomUUID() })).rejects.toThrow()
  const other = await f.service.handle('createConversation', { kind: 'group', title: 'other', agentIds: [f.agent.id] }) as { id: string }
  await expect(f.service.handle('sendMessage', { ...f.input, conversationId: other.id })).rejects.toThrow('原生轮次')
  expect((await f.detail()).messages.filter(message => message.senderType === 'user')).toHaveLength(1)
  await f.service.handle('sendMessage', f.input)
  await f.wait(f.original)
  await expect(f.service.handle('sendMessage', { ...f.input, requestId: crypto.randomUUID() })).rejects.toThrow('原生轮次')
  expect(await f.calls()).toHaveLength(1)
})
it.each(['DROP_STEER', 'REJECT_STEER'])('records %s as unconfirmed and never retries or turns it into a new task', async marker => {
  const f = await setup(), input = { ...f.input, content: marker }
  const message = await f.service.handle('sendMessage', input) as Message
  expect(message).toMatchObject({ status: 'failed', nativeSteering: { delivery: 'unknown' } })
  const detail = await f.wait(f.original)
  expect(detail.runs).toHaveLength(1)
  expect(await f.service.handle('sendMessage', input)).toEqual(message)
  expect(await f.calls()).toHaveLength(1)
  await f.restart()
  expect(await f.service.handle('sendMessage', input)).toEqual(message)
  expect(await f.calls()).toHaveLength(1)
})
it('recovers an accepted receipt as unknown without replay after host interruption', async () => {
  const f = await setup()
  const message = await f.service.handle('sendMessage', f.input) as Message
  await f.wait(f.original)
  await f.service.close()
  const store = new ProductStore(join(f.root, 'boai.sqlite')); await store.init()
  try { await store.write([{ collection: 'messages', id: message.id, value: { ...message, nativeSteering: { ...message.nativeSteering!, delivery: 'accepted' } } }]) } finally { await store.close() }
  await f.restart()
  const recovered = await f.service.handle('sendMessage', f.input) as Message
  expect(recovered).toMatchObject({ id: message.id, status: 'failed', nativeSteering: { delivery: 'unknown' } })
  expect(await f.calls()).toHaveLength(1)
})


it.each(['cancel', 'permission'] as const)('refuses the original steering target after %s changes', async mode => {
  const f = await setup()
  if (mode === 'cancel') await f.service.handle('cancelRunExecution', { conversationId: f.chat.id, runId: f.run.id })
  else {
    const { configVersion, workspaceRef: _workspace, memoryNamespace: _memory, policyVersion: _policy, ...input } = f.agent
    await f.service.handle('saveAgent', { ...input, expectedConfigVersion: configVersion, executionPermission: 'read-only' })
  }
  await expect(f.service.handle('sendMessage', f.input)).rejects.toThrow()
  expect((await f.detail()).messages.filter(message => message.senderType === 'user')).toHaveLength(1)
  await expect(f.calls()).rejects.toMatchObject({ code: 'ENOENT' })
})
it('keeps a pending native question on the original answer path instead of treating steering as an answer', async () => {
  const f = await nativeFixture('codex', disposals), original = await f.send('NATIVE_QUESTION')
  const detail = await f.waitForMessages(original, value => value.messages.some(message => message.senderType === 'agent' && message.content.includes('这个文档针对什么产品')))
  const run = detail.runs.find(value => value.triggerMessageId === original.id)!
  await expect(f.service.handle('sendMessage', { conversationId: f.chat.id, content: '不要偷答问题', mentionIds: [], requestId: crypto.randomUUID(), steer: { runId: run.id, turnId: run.backend!.turnId! } })).rejects.toThrow('批准或提问')
  expect((await f.detail()).messages.filter(message => message.senderType === 'user')).toHaveLength(1)
  await f.send('产品是BOAI')
  expect((await f.wait(original)).messages.some(message => message.content.includes('收到普通聊天回复：产品是BOAI'))).toBe(true)
})
