/*
 * [OUTPUT]: 第14组API群请求解释与持久顺序接续；保留独立并行、原Work和本机旧路径，实际验收归第14组05。
 * [INPUT]: 每场景独立 Desktop 与已结束的历史消息。
 * [OUTPUT]: 首次snapshot可控延迟且记录真实资料写入； 本人/自动化/人工补充/外部单聊、员工引用与 senderId=user 的非本人历史、可控离线模型与大历史。
 * [POS]: 个人资料 BDD 数据和模型协议支撑，不接触用户目录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createServer } from 'node:http'
import { join } from 'node:path'
import { ProductStore } from '../../../src/runtime/adapters/storage/product-store'
import type { Message } from '../../../src/shared/domain'
import type { Desktop } from './desktop'

export async function prepareProfile(runtime: Desktop, large = false) {
  const model = { calls: 0, release: () => {}, started: false, hold: false }
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk
    const input = JSON.parse(body) as { messages: { role: string; content: string }[] }, system = input.messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
    model.calls++
    const content = system.includes('Private group request interpretation') ? '{"mode":"independent"}' : system.includes('Private participation decision') ? '{"action":"reply","responseKind":"chat"}' : system.includes('Private memory maintenance') ? '{"candidates":[]}' : '个人资料更新后，当前运行继续完成。'
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `profile-${model.calls}`, object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    emit({ role: 'assistant' })
    if (!system.includes('Private ')) {
      model.started = true; emit({ content: content.slice(0, 8) })
      if (model.hold) await new Promise<void>(resolve => { model.release = resolve; response.once('close', resolve) })
      emit({ content: content.slice(8) })
    } else emit({ content })
    emit({}, 'stop')
    response.write(`data: ${JSON.stringify({ id: 'usage', object: 'chat.completion.chunk', created: 1, model: 'fixture', choices: [], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } })}\n\n`)
    response.end('data: [DONE]\n\n')
  })
  runtime.trackServer(server); runtime.defer(async () => model.release())
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  await runtime.start()
  const port = (server.address() as { port: number }).port
  const chats = await runtime.page.evaluate(async port => {
    const connection = await window.boai.request('saveConnection', { name: '个人资料离线模型', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${port}/v1`, defaultModel: 'fixture' })
    for (const agent of (await window.boai.request('snapshot', undefined)).agents) { const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...fields } = agent; await window.boai.request('saveAgent', { ...fields, connectionId: connection.id, expectedConfigVersion: configVersion }) }
    const ids = ['researcher', 'writer', 'reviewer']
    const direct = await window.boai.request('createConversation', { kind: 'direct', title: '个人单聊', agentIds: [ids[0]] })
    const group = await window.boai.request('createConversation', { kind: 'group', title: '个人资料群聊', agentIds: ids })
    const external = await window.boai.request('createConversation', { kind: 'direct', title: '外部历史', agentIds: [ids[1]] })
    return { direct, group, external }
  }, port)
  const dataPath = await runtime.page.evaluate(async () => (await window.boai.request('snapshot', undefined)).dataPath)
  await runtime.close()
  const db = new ProductStore(join(dataPath, 'boai.sqlite')); await db.init()
  try {
    const messages: Message[] = []
    for (const [kind, conversation] of Object.entries(chats)) {
      const base = { conversationId: conversation.id, turnId: `profile-history-${kind}`, senderType: 'user' as const, senderId: 'user', senderName: '旧名称', content: '保留的本人消息', status: 'completed' as const, createdAt: new Date().toISOString() }
      if (large && kind === 'direct') for (let i = 0; i < 2500; i++) messages.push({ ...base, id: `history-${i}`, sequence: i + 1, content: `历史消息 ${i}` })
      messages.push({ ...base, id: `${kind}-human`, sequence: 3001 })
      if (kind === 'group') {
        messages.push({ ...base, id: 'group-continued', content: '本人连续发言', sequence: 3002 })
        const origin = { kind: 'automation' as const, authorizedFingerprint: 'fixture', automationId: 'a', occurrenceId: 'o', name: '资料检查', scheduledFor: new Date().toISOString() }
        messages.push({ ...base, id: 'group-auto', senderId: 'automation:a', senderName: '定时任务 · 资料检查', content: '自动触发消息', origin, sequence: 3003 })
        messages.push({ ...base, id: 'group-supplement', content: '我补充的信息', origin, sequence: 3004 })
        messages.push({ ...base, id: 'group-agent', senderType: 'agent', senderId: 'researcher', senderName: '研究员', content: '员工引用历史本人消息', replyToMessageId: 'group-human', sequence: 3005 })
        messages.push({ ...base, id: 'group-foreign', senderType: 'agent', senderId: 'user', senderName: '同 ID 员工', content: '员工身份不能冒认本人', sequence: 3006 })
      }
    }
    await db.write(messages.map(message => ({ collection: 'messages', id: message.id, value: message })))
    const writer = (await db.load<import('../../../src/shared/domain').DigitalAgent>('agents')).find(agent => agent.id === 'writer')!
    await db.write([{ collection: 'agents', id: writer.id, value: { ...writer, executionBackend: { kind: 'acp-local', profileId: 'historical-external' } } }])
    if (large) {
      const calls = Array.from({ length: 90 }, (_, i) => { const startedAt = new Date(Date.now() - i * 4 * 86400000).toISOString(); return { id: `activity-${i}`, runId: 'profile-history-run', conversationId: chats.direct.id, phase: 'chat', budgetOwned: false, startedAt, ...(i % 17 ? { usage: { totalTokens: i * 103 } } : {}) } })
      await db.write([{ collection: 'runs', id: 'profile-history-run', value: { id: 'profile-history-run', conversationId: chats.direct.id, agentId: 'researcher', agentName: '研究员', triggerMessageId: 'direct-human', messageId: 'historical-reply', status: 'completed', phase: 'execution', responseKind: 'chat', toolEvents: [], createdAt: calls.at(-1)!.startedAt, finishedAt: new Date().toISOString() } }, ...calls.map(value => ({ collection: 'profileModelCalls', id: value.id, value }))])
    }

    // A damaged legacy image must fall back in the renderer without remote access.
    await db.write([{ collection: 'userProfiles', id: 'user', value: { schemaVersion: 1, id: 'user', revision: 1, displayName: '旧资料', username: null, avatar: { kind: 'image', dataUrl: 'data:image/png;base64,aW52YWxpZA==' }, updatedAt: new Date().toISOString() } }])
  } finally { await db.close() }
  await runtime.start()
  return { chats, model }
}

export async function cancelProfileWindowClose(runtime: Desktop) {
  await runtime.app.evaluate(({ dialog, BrowserWindow }) => {
    const root = globalThis as typeof globalThis & { profileClosePrompt?: string }
    const original = dialog.showMessageBox
    dialog.showMessageBox = (async (...args: unknown[]) => {
      root.profileClosePrompt = String((args.at(-1) as { title: string }).title)
      dialog.showMessageBox = original
      return { response: 0, checkboxChecked: false }
    }) as typeof original
    BrowserWindow.getAllWindows()[0].close()
  })
  return runtime.app.evaluate(() => (globalThis as typeof globalThis & { profileClosePrompt?: string }).profileClosePrompt)
}

/** Hold only initial snapshots after reload; profile mutations still use production IPC. */
export async function holdProfileSnapshot(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:request')!
    const state = { waiting: 0, writes: 0, released: false, release: () => {} }
    const gate = new Promise<void>(resolve => { state.release = () => { state.released = true; resolve() } })
    Object.assign(globalThis, { profileSnapshotGate: state })
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === 'snapshot' && !state.released) { state.waiting++; await gate }
      if (payload.method === 'updateUserProfile') state.writes++
      return original(event, payload)
    })
  })
  return {
    inspect: () => runtime.app.evaluate(() => { const state = (globalThis as typeof globalThis & { profileSnapshotGate: { waiting: number; writes: number } }).profileSnapshotGate; return { waiting: state.waiting, writes: state.writes } }),
    release: () => runtime.app.evaluate(() => (globalThis as typeof globalThis & { profileSnapshotGate: { release(): void } }).profileSnapshotGate.release()),
  }
}
