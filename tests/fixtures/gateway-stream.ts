/*
 * [INPUT]: Protocol, explicit text/tool payload and terminal/EOF/hold mode for local HTTP fixtures.
 * [OUTPUT]: Three-protocol SSE frames with controlled completion/lifetime, optional route headers and distinct multi-step tool identities.
 * [POS]: Shared production-adapter and AppService fault-injection transport; never forwards to suppliers.
 * [PROTOCOL]: Update Header and fixtures/.folder.md when changing this fixture.
 */
import type { ServerResponse } from 'node:http'
import type { ModelProtocol } from '../../packages/shared/src/domain/model-gateway'

const syntheticRoute = { 'X-Magpie-Model': 'provider/actual', 'X-Magpie-Provider': 'provider' }
function begin(response: ServerResponse, route: Record<string, string> = syntheticRoute) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream', ...route })
  return (type: string, data: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`)
}
function chatChunk(response: ServerResponse, delta: object, finish_reason: string | null = null) {
  response.write(`data: ${JSON.stringify({ id: 'r', object: 'chat.completion.chunk', created: 1, model: 'provider/actual', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
}
export function streamText(response: ServerResponse, protocol: ModelProtocol, text: string, mode: 'complete' | 'eof' | 'hold', route?: Record<string, string>) {
  const event = begin(response, route)
  if (protocol === 'chat') {
    chatChunk(response, { role: 'assistant', content: text })
    if (mode === 'complete') { chatChunk(response, {}, 'stop'); response.write('data: [DONE]\n\n') }
  } else if (protocol === 'responses') {
    const item = { id: 'm', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] }
    event('response.created', { response: { id: 'r', created_at: 1, model: 'provider/actual' } })
    event('response.output_item.added', { output_index: 0, item: { ...item, status: 'in_progress', content: [] } })
    event('response.content_part.added', { item_id: 'm', output_index: 0, content_index: 0, part: { type: 'output_text', text: '', annotations: [] } })
    event('response.output_text.delta', { item_id: 'm', output_index: 0, content_index: 0, delta: text })
    if (mode === 'complete') {
      event('response.output_text.done', { item_id: 'm', output_index: 0, content_index: 0, text }); event('response.output_item.done', { output_index: 0, item })
      event('response.completed', { response: { id: 'r', created_at: 1, model: 'provider/actual', status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } })
    }
  } else {
    event('message_start', { message: { id: 'r', type: 'message', role: 'assistant', model: 'provider/actual', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } })
    event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } }); event('content_block_delta', { index: 0, delta: { type: 'text_delta', text } })
    if (mode === 'complete') { event('content_block_stop', { index: 0 }); event('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 1 } }); event('message_stop', {}) }
  }
  if (mode !== 'hold') response.end()
}
export function streamTool(response: ServerResponse, protocol: ModelProtocol, name: string, input: object, complete = true, route?: Record<string, string>, toolCallId = 'write-once') {
  const event = begin(response, route), args = JSON.stringify(input)
  if (protocol === 'chat') {
    chatChunk(response, { role: 'assistant', tool_calls: [{ index: 0, id: toolCallId, type: 'function', function: { name, arguments: args } }] })
    if (complete) { chatChunk(response, {}, 'tool_calls'); response.write('data: [DONE]\n\n') }
  } else if (protocol === 'messages') {
    event('message_start', { message: { id: 'r', type: 'message', role: 'assistant', model: 'provider/actual', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1, output_tokens: 0 } } })
    event('content_block_start', { index: 0, content_block: { type: 'tool_use', id: toolCallId, name, input: {} } })
    event('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: args } }); event('content_block_stop', { index: 0 })
    if (complete) { event('message_delta', { delta: { stop_reason: 'tool_use', stop_sequence: null }, usage: { output_tokens: 1 } }); event('message_stop', {}) }
  } else {
    const item = { type: 'function_call', id: 'f', call_id: toolCallId, name, arguments: args, status: 'completed' }
    event('response.created', { response: { id: 'r', created_at: 1, model: 'provider/actual' } })
    event('response.output_item.added', { output_index: 0, item: { ...item, arguments: '', status: 'in_progress' } })
    event('response.function_call_arguments.delta', { item_id: 'f', output_index: 0, delta: args })
    event('response.function_call_arguments.done', { item_id: 'f', output_index: 0, arguments: args }); event('response.output_item.done', { output_index: 0, item })
    if (complete) event('response.completed', { response: { id: 'r', created_at: 1, model: 'provider/actual', status: 'completed', output: [item], usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 } } })
  }
  response.end()
}
