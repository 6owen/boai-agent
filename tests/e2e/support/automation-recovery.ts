/*
 * [INPUT]: 独立 Desktop、生产运行时与本地模型协议。
 * [OUTPUT]: 实际写文件后挂起的模型响应、精确结束本场景 utility process 的故障注入。
 * [POS]: 自动化中断恢复的隔离支撑；不修改产品调度、存储或工具实现。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createServer, type ServerResponse } from 'node:http'
import type { Desktop } from './desktop'

export async function startInterruptedAutomation(runtime: Desktop) {
  let calls = 0
  const held = new Set<ServerResponse>(), errors: string[] = []
  const server = createServer(async (request, response) => {
    try {
      let raw = ''
      for await (const chunk of request) raw += chunk
      const input = JSON.parse(raw), system = input.messages.filter((m: { role: string }) => m.role === 'system').map((m: { content: string }) => m.content).join('\n')
      calls++
      let content: string | undefined, tool: { name: string; arguments: string } | undefined
      if (system.includes('Private participation decision')) content = JSON.stringify({ action: 'reply', responseKind: 'task', work: { key: 'interrupted-file', scope: '写出文件后报告结果', deliverable: '文件及可检查结果' } })
      else if (system.includes('Private memory maintenance')) content = '{"candidates":[]}'
      else if (input.messages.some((m: { role: string }) => m.role === 'tool')) {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' }); response.flushHeaders()
        held.add(response); response.once('close', () => held.delete(response)); return
      } else {
        if (!input.tools?.some((t: { function: { name: string } }) => t.function.name === 'write_file')) throw new Error('The authorized task must have the real write_file tool')
        tool = { name: 'write_file', arguments: JSON.stringify({ path: 'self:/work/interrupted.txt', content: '实际工具已写入；运行中断后不得自动重做。' }) }
      }
      if (!input.stream) {
        response.setHeader('Content-Type', 'application/json')
        response.end(JSON.stringify({ id: `fixture-${calls}`, object: 'chat.completion', model: input.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] })); return
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `fixture-${calls}`, object: 'chat.completion.chunk', model: input.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      emit({ role: 'assistant' })
      if (tool) { emit({ tool_calls: [{ index: 0, id: `tool-${calls}`, type: 'function', function: tool }] }); emit({}, 'tool_calls') }
      else { emit({ content }); emit({}, 'stop') }
      response.end('data: [DONE]\n\n')
    } catch (error) { errors.push(String(error)); response.destroy() }
  })
  runtime.trackServer(server)
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done))
  await runtime.start()
  return { port: (server.address() as { port: number }).port, calls: () => calls, held: () => held.size, errors }
}

export async function crashAutomationRuntime(runtime: Desktop) {
  await runtime.app.evaluate(({ app }) => {
    const worker = app.getAppMetrics().find(process => process.name === 'BoAI Agent Runtime')
    if (!worker || worker.type !== 'Utility') throw new Error('The current desktop runtime was not found')
    process.kill(worker.pid, 'SIGKILL')
  })
}
