/*
 * [INPUT]: Isolated existing product data, explicit continuation identity and inherited synthetic native configuration.
 * [OUTPUT]: Actual fresh BOAI process initializes without replay, then sends only the parent's explicit new message.
 * [POS]: Installed-Codex first-use recovery fixture; local HTTP only, no supplier inference.
 * [PROTOCOL]: Update Header and fixtures/.folder.md when this process contract changes.
 */
import { AppService } from '../../packages/runtime/src/service'
import type { ConversationDetail, Message } from '../../packages/shared/src/domain'

const [dataPath, conversationId, requestId] = process.argv.slice(2)
let parentCalls = 0
const service = new AppService({ dataPath, engine: { run: async () => { parentCalls++; throw Error('No API parent') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
const send = (value: unknown) => new Promise<void>((resolve, reject) => process.send!(value, error => error ? reject(error) : resolve()))
try {
  await service.init()
  const detail = await service.handle('getConversation', { id: conversationId }) as ConversationDetail
  const command = new Promise(resolve => process.once('message', resolve))
  await send({ type: 'ready', pid: process.pid, runs: detail.runs, parentCalls })
  if (await command !== 'continue') throw Error('An explicit continuation is required')
  const message = await service.handle('sendMessage', { conversationId, content: '只回答 BOAI_NATIVE_SOURCE_OK。', mentionIds: [], requestId }) as Message
  const deadline = Date.now() + 60000
  let run: ConversationDetail['runs'][number] | undefined
  while (Date.now() < deadline) {
    const current = await service.handle('getConversation', { id: conversationId }) as ConversationDetail
    run = current.runs.find(item => item.triggerMessageId === message.id)
    if (run && ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) break
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  await service.close()
  await send({ type: 'completed', pid: process.pid, run, parentCalls })
} finally { await service.close(); process.disconnect?.() }
