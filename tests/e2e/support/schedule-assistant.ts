/*
 * [OUTPUT]: 错误通过Sonner且业务区无报错DOM；草稿、布局与明确重试/核对保持。
 * [OUTPUT]: 隔离API员工明确开启命令权限，实际主区与bobo创建必须通过原产品服务。
 * [OUTPUT]: 专用bobo真实工具协议夹具覆盖澄清→单员工计划保存；旧草稿接口夹具保持。
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
    const body = JSON.parse(raw)
    calls++
    const system = body.messages.filter((m: { role: string }) => m.role === 'system').map((m: { content: string }) => m.content).join('\n')
    if (!system.includes('只提取可审阅的定时任务草稿')) {
      const emit = (delta: unknown, finish_reason: string | null = null) => res.write(`data: ${JSON.stringify({ id: `schedule-chat-${calls}`, object: 'chat.completion.chunk', model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      const text = (content: unknown) => { emit({ role: 'assistant', content: typeof content === 'string' ? content : JSON.stringify(content) }); emit({}, 'stop'); res.end('data: [DONE]\n\n') }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' })
      if (system.includes('Private participation decision')) { text({ action: 'reply', responseKind: 'chat' }); return }
      if (system.includes('Private memory maintenance')) { text({ candidates: [] }); return }
      if (!JSON.stringify(body.messages).includes('每月15日')) { text('请告诉我由哪位员工执行，以及任务内容和执行时间。'); return }
      if (body.messages.some((m: { role: string }) => m.role === 'tool')) { text('已创建「月度行业简报」，由研究员每月15日早上九点执行。'); return }
      if (!body.tools?.some((t: { function: { name: string } }) => t.function.name === 'manage_automation')) { text('未取得计划管理工具。'); return }
      const plan = { name: '月度行业简报', description: '每月行业动态', prompt: '整理行业进展并汇总重点', frequency: 'monthly', dayOfMonth: 15, startsOn: '2027-01-01', time: '09:00', weekday: 1, timezone: 'Asia/Singapore', enabled: true, notify: false, notificationPolicy: 'muted' }
      emit({ role: 'assistant' }); emit({ tool_calls: [{ index: 0, id: `schedule-save-${calls}`, type: 'function', function: { name: 'manage_automation', arguments: JSON.stringify({ action: 'save', key: 'monthly-briefing', employeeId: 'researcher', plan }) } }] }); emit({}, 'tool_calls'); res.end('data: [DONE]\n\n'); return
    }
    const user = JSON.parse(body.messages.at(-1).content)
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
    await window.boai.request('saveAgent', { ...agent, connectionId: connection.id, allowCommands: true })
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

/** Reject only the first save before handing the retry to the actual runtime. */
export async function rejectFirstScheduleSave(runtime: Desktop) {
  await runtime.app.evaluate(({ ipcMain }) => {
    const handlers = (ipcMain as unknown as { _invokeHandlers: Map<string, (...args: any[]) => Promise<unknown>> })._invokeHandlers
    const original = handlers.get('boai:request')!
    let first = true
    ipcMain.removeHandler('boai:request')
    ipcMain.handle('boai:request', async (event, payload) => {
      if (payload.method === 'saveAutomation' && first) { first = false; throw new Error('验收：保存暂不可用') }
      return original(event, payload)
    })
  })
}
