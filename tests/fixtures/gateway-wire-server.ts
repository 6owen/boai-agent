/*
 * [INPUT]: Actual native CLI HTTP requests to an isolated loopback fixture.
 * [OUTPUT]: Three protocol text responses and credential-free request metadata; no supplier forwarding.
 * [POS]: Shared installed-binary native-source test server.
 * [PROTOCOL]: Update fixtures/.folder.md when changing recorded protocol evidence.
 */
import { createServer } from 'node:http'
export async function gatewayWireServer(phase: () => string, source: string, records: { phase: string; source: string; path: string; model: string; keyMatches: boolean; tools: string[]; purpose: 'task' | 'native-title' | 'unknown' }[]) {
  const server = createServer((request, response) => { void (async () => {
    let raw = ''; for await (const part of request) { raw += part; if (raw.length > 4_000_000) throw Error('Fixture request limit') }
    const body = raw ? JSON.parse(raw) : {}, path = request.url?.split('?')[0] ?? ''
    if (path.endsWith('/count_tokens')) { response.setHeader('content-type', 'application/json'); response.end('{"input_tokens":10}'); return }
    const protocol = path === '/relay/v1/chat/completions' ? 'chat' : path === '/relay/v1/responses' ? 'responses' : path === '/relay/v1/messages' ? 'messages' : undefined
    if (!protocol || request.method !== 'POST') { response.writeHead(404); response.end('{}'); return }
    const names = (tools: any[]): string[] => tools.flatMap(tool => [tool.name ?? tool.function?.name ?? tool.type ?? '', ...names(tool.tools ?? [])])
    const tools = names(body.tools ?? []), title = (body.messages ?? []).some((message: any) => message.role === 'user' && (typeof message.content === 'string' ? [message.content] : (message.content ?? []).map((part: any) => part.text ?? '')).some((text: string) => text.startsWith('Generate a title for this conversation:')))
    records.push({ phase: phase(), source, path, model: body.model, keyMatches: request.headers.authorization === 'Bearer magpie-boai' || request.headers['x-api-key'] === 'magpie-boai', tools, purpose: tools.length ? 'task' : title ? 'native-title' : 'unknown' })
    if (records.length > 30) { response.writeHead(429); response.end('Fixture call cap'); return }
    const text = 'BOAI_NATIVE_SOURCE_OK', message = { id: 'message', type: 'message', role: 'assistant', model: body.model, content: [{ type: 'text', text }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } }
    if (!body.stream) { response.setHeader('content-type', 'application/json'); response.end(JSON.stringify(protocol === 'chat' ? { id: 'r', object: 'chat.completion', created: 1, model: body.model, choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } } : message)); return }
    response.writeHead(200, { 'content-type': 'text/event-stream' })
    let sequence = 0
    const event = (type: string, value: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, sequence_number: sequence++, ...value })}\n\n`)
    if (protocol === 'chat') {
      for (const [delta, finish_reason] of [[{ role: 'assistant', content: text }, null], [{}, 'stop']]) response.write(`data: ${JSON.stringify({ id: 'r', object: 'chat.completion.chunk', created: 1, model: body.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      response.end('data: [DONE]\n\n')
    } else if (protocol === 'messages') {
      event('message_start', { message: { ...message, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } })
      event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }); event('content_block_delta', { index: 0, delta: { type: 'text_delta', text } })
      event('content_block_stop', { index: 0 }); event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 5 } }); event('message_stop', {}); response.end()
    } else {
      const item = { id: 'm', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }, base = { id: 'r', object: 'response', created_at: 1, model: body.model, output: [], status: 'in_progress' }
      event('response.created', { response: base }); event('response.output_item.added', { output_index: 0, item: { ...item, status: 'in_progress', content: [] } })
      event('response.content_part.added', { item_id: item.id, output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } }); event('response.output_text.delta', { item_id: item.id, output_index: 0, content_index: 0, delta: text })
      event('response.output_text.done', { item_id: item.id, output_index: 0, content_index: 0, text }); event('response.output_item.done', { output_index: 0, item })
      event('response.completed', { response: { ...base, status: 'completed', output: [item], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } }); response.end()
    }
  })().catch(() => { if (!response.headersSent) response.writeHead(500); response.end('Fixture error') }) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { url: `http://127.0.0.1:${(server.address() as { port: number }).port}/relay`, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } }
}
