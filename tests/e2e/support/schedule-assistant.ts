/*
 * [INPUT]: 隔离桌面生命周期与本地 HTTP 协议端点。
 * [OUTPUT]: 可暂停草稿响应、缺失字段/不支持/错误响应；持久提交后丢失回执的故障注入；生产保存与模型适配器原样运行。
 * [POS]: 定时任务 BDD 模型支撑，仅替代远端模型服务。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createServer } from 'node:http'
import type { Desktop } from './desktop'
export async function scheduleAssistant(runtime: Desktop) {
  let calls = 0, release: (() => void) | undefined
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk
    const body = JSON.parse(raw), user = JSON.parse(body.messages.at(-1).content)
    calls++
    if (user.instruction.includes('延迟')) await new Promise<void>(resolve => { release = resolve })
    if (user.instruction.includes('失败')) { res.writeHead(503); res.end('fixture unavailable'); return }
    const candidate = { name: '项目进展日报', prompt: '整理项目进展', target: user.instruction.includes('研究员') ? { kind: 'employee', name: '研究员' } : null, frequency: 'workdays', daysOfWeek: [1,2,3,4,5], time: user.instruction.includes('晚上') ? null : '09:00', timezone: null, notificationPolicy: 'important_only', unsupported: user.instruction.includes('每月') ? ['暂不支持每月规则，请手动选择已支持的周期。'] : [] }
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const chunk = (delta: unknown, finish_reason: string | null) => `data: ${JSON.stringify({ id: 'draft-fixture', object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`
    res.end(chunk({ role: 'assistant', content: JSON.stringify(candidate) }, null) + chunk({}, 'stop') + 'data: [DONE]\n\n')
  })
  runtime.trackServer(server); runtime.defer(async () => { release?.() })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await runtime.start()
  const setup = await runtime.page.evaluate(async port => {
    const connection = await window.boai.request('saveConnection', { name: '草稿验收模型', provider: 'openai-compatible', baseUrl: `http://127.0.0.1:${port}/v1`, defaultModel: 'fixture' })
    const { configVersion, workspaceRef, memoryNamespace, policyVersion, ...agent } = (await window.boai.request('snapshot', undefined)).agents.find(a => a.id === 'researcher')!
    await window.boai.request('saveAgent', { ...agent, connectionId: connection.id })
    const chat = await window.boai.request('createConversation', { kind: 'direct', title: '已有项目聊天', agentIds: ['researcher'] })
    const paused = await window.boai.request('saveAutomation', { name: '暂停的旧日报', prompt: '保留旧规则', conversationId: chat.id, frequency: 'daily', time: '13:15', weekday: 1, timezone: 'UTC', enabled: false, notify: true })
    return { connectionId: connection.id, conversationId: chat.id, pausedId: paused.id }
  }, port)
  return { ...setup, calls: () => calls, release: () => { release?.(); release = undefined } }
}

/** Fault only the reply after the production handler commits; preserve the actual product operation. */
export async function loseCreationReceipt(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:request')!
    let loseSave = true, loseLookup = true
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === 'getAutomationCreation' && loseLookup) { loseLookup = false; throw new Error('验收：创建回执暂不可读') }
      const result = await original(event, payload)
      if (payload.method === 'saveAutomation' && loseSave) { loseSave = false; throw new Error('验收：已提交后的响应丢失') }
      return result
    })
  })
}
