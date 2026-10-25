/*
 * [INPUT]: Explicit isolated CLI validation and its unique expected file bytes.
 * [OUTPUT]: Loopback-only controlled Chat SSE provider, bounded requests and actual tool receipts.
 * [POS]: Product self-test fixture; never replaces the regular runtime or a real provider.
 * [PROTOCOL]: Changes update Header and apps/cli/src/.folder.md.
 */
import { createServer, type ServerResponse } from 'node:http'

export async function openValidationFixture(content: string) {
  let requests = 0
  const receipts: { name: string; result: unknown }[] = []
  const emit = (response: ServerResponse, output: unknown, tool?: { name: string; input: unknown }) => {
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    const chunk = (delta: unknown, finish: string | null = null) => response.write(`data: ${JSON.stringify({ id: 'boai-validation', object: 'chat.completion.chunk', model: 'boai-validation', choices: [{ index: 0, delta, finish_reason: finish }] })}\n\n`)
    chunk({ role: 'assistant' })
    if (tool) chunk({ tool_calls: [{ index: 0, id: `validation-tool-${requests}`, type: 'function', function: { name: tool.name, arguments: JSON.stringify(tool.input) } }] })
    else chunk({ content: typeof output === 'string' ? output : JSON.stringify(output) })
    chunk({}, tool ? 'tool_calls' : 'stop')
    response.write(`data: ${JSON.stringify({ id: 'boai-validation', object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 100, completion_tokens: 100, total_tokens: 200 } })}\n\n`)
    response.end('data: [DONE]\n\n')
  }
  const server = createServer(async (request, response) => {
    if (request.method !== 'POST' || request.url !== '/v1/chat/completions' || ++requests > 24) { response.writeHead(400); response.end(); return }
    try {
      let bytes = 0, raw = ''
      for await (const chunk of request) { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) throw new Error('large request'); raw += chunk }
      const body = JSON.parse(raw) as { messages: { role: string; content: string; tool_call_id?: string; tool_calls?: { id: string; function: { name: string } }[] }[] }
      const system = body.messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
      if (system.includes('Private participation decision')) { emit(response, { action: 'reply', responseKind: 'task', work: { key: 'cli-validation', scope: '执行明确的CLI验证文件任务', deliverable: '验证文件与实际读取回执' } }); return }
      if (system.includes('Private memory maintenance')) { emit(response, { candidates: [] }); return }
      if (system.includes('Read the actual new conversation facts. Publish a relevant, updated report')) { emit(response, { action: 'publish', text: content }); return }
      const calls = body.messages.flatMap(message => message.tool_calls ?? [])
      for (const message of body.messages.filter(message => message.role === 'tool')) {
        const name = calls.find(call => call.id === message.tool_call_id)?.function.name
        if (name) receipts.push({ name, result: JSON.parse(message.content) })
      }
      const called = new Set(calls.map(call => call.function.name))
      const next = !called.has('write_file') ? { name: 'write_file', input: { path: 'self:/work/boai-validation.txt', content } } : !called.has('read_file') ? { name: 'read_file', input: { path: 'self:/work/boai-validation.txt' } } : !called.has('report_work') ? { name: 'report_work', input: { disposition: 'delivered', summary: content, evidence: [{ kind: 'answer', reference: content }] } } : undefined
      emit(response, content, next)
    } catch { if (!response.headersSent) response.writeHead(400); response.end() }
  })
  server.requestTimeout = 10000; server.headersTimeout = 10000
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, get requests() { return requests }, get receipts() { return receipts }, async close() { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } }
}
