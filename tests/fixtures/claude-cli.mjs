#!/usr/bin/env node
/*
 * [OUTPUT]: 隔离两流UTF8字节/原8MiB门禁与固定类型白名单场景；私有类型/签名/参数仅作输入哨兵，原协议场景与实际退出保持。
 * [OUTPUT]: 同会话API重试事件带固定HTTP状态和私有错误文本；认证拒绝后仍试图继续写标记，用于核对宿主立即停止、脱敏和其他状态不误拦截。
 * [OUTPUT]: 宿主退出场景保存父子PID并创建关闭输出的同组静默后代，不能用管道结束代替整组退出。
 * [OUTPUT]: 新增已开始但不再返回事件的可控故障，用于区别宿主回调阻塞；不模拟供应商推理原因。
 * [INPUT]: Claude适配器的实际参数、合成环境与stdin场景。
 * [OUTPUT]: 可控协议/进程故障、逐消息累计用量及终态冲突、媒体接收hash；不保存图片正文，真实CLI能力另由probe验证。
 * [POS]: Claude模块协议进程夹具。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
if (process.argv.includes('--version')) { console.log('2.1.214 (Claude Code)'); process.exit(0) }
const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk)
const stdin = Buffer.concat(chunks).toString()
const input = process.argv[process.argv.indexOf('--input-format') + 1] === 'stream-json' ? JSON.parse(stdin) : undefined
const mode = input ? input.message.content.find(block => block.type === 'text').text : stdin
const images = input?.message.content.filter(block => block.type === 'image').map(block => ({ mime: block.source.media_type, hash: createHash('sha256').update(Buffer.from(block.source.data, 'base64')).digest('hex') })) ?? []
const session = '4a00ef4b-1676-4ce0-8f9f-c6238fe45ba5'
const emit = message => process.stdout.write(JSON.stringify({ session_id: session, ...message }) + '\n')
writeFileSync('launched.json', JSON.stringify({ pid: process.pid, parentPid: process.ppid, args: process.argv.slice(2), images, inheritedSecret: !!process.env.BOAI_SECRET_SENTINEL || !!process.env.ANTHROPIC_AUTH_TOKEN }))
if (mode.startsWith('transport-bytes:')) {
  const stdout = Buffer.from('本机😀\n'), stderr = Buffer.from('私有🔒\n')
  await new Promise(resolve => process.stdout.write(stdout.subarray(0, 7), resolve))
  await new Promise(resolve => process.stdout.write(stdout.subarray(7), resolve))
  await new Promise(resolve => process.stderr.write(stderr, resolve))
  process.exit(0)
}
if (mode === 'transport-empty') process.exit(0)
if (mode === 'transport-output-limit') {
  const stdout = Buffer.alloc(4 * 1024 * 1024, 97)
  for (let end = 1024 * 1024 - 1; end < stdout.length; end += 1024 * 1024) stdout[end] = 10
  await new Promise(resolve => process.stdout.write(stdout, resolve))
  await new Promise(resolve => process.stderr.write(Buffer.alloc(4 * 1024 * 1024 + 1, 115), resolve))
  setInterval(() => {}, 1000); await new Promise(() => {})
}
if (mode === 'stderr') process.stderr.write('sk-synthetic-private-error\n')
emit({ type: 'system', subtype: 'init', claude_code_version: '2.1.214', model: 'fixture-model', apiKeySource: 'ANTHROPIC_API_KEY', permissionMode: 'dontAsk',
  tools: mode === 'tools' ? ['Bash'] : [], mcp_servers: [], plugins: [], skills: [], slash_commands: [] })
if (mode.startsWith('api-auth-') || mode === 'api-transient') {
  const status = mode === 'api-transient' ? 429 : Number(mode.split('-').at(-1))
  emit({ type: 'system', subtype: 'api_retry', error_status: status, error: 'sk-private-provider-error', attempt: 1, max_retries: 10, retry_delay_ms: 500.5 })
  await new Promise(resolve => setTimeout(resolve, 250))
  writeFileSync('continued-after-api-rejection.txt', 'continued')
}
if (mode === 'foreign') emit({ type: 'system', subtype: 'status', session_id: 'b00ef4b0-1676-4ce0-8f9f-c6238fe45ba5' })
if (mode === 'truncated') { process.stdout.write('{"type":'); process.exit(0) }
if (mode === 'oversize') {
  await new Promise(resolve => process.stdout.write('x'.repeat(2 * 1024 * 1024 + 1), resolve)); process.exit(0)
}
if (mode === 'tool-event') emit({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', content_block: { type: 'tool_use', name: 'Bash' } } })
if (mode === 'diagnostic-tool_use' || mode === 'diagnostic-server_tool_use') {
  emit({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', content_block: { type: mode.slice('diagnostic-'.length), name: 'sk-private-tool-name', input: { secret: 'sk-private-tool-arguments' } } } })
  setInterval(() => {}, 1000); await new Promise(() => {})
}
if (mode === 'diagnostic-categories') {
  const stream = event => emit({ type: 'stream_event', parent_tool_use_id: null, event })
  for (const content_block of [
    { type: 'text', text: 'sk-private-block-text' },
    { type: 'thinking', thinking: 'sk-private-reasoning', signature: 'sk-private-signature' },
    { type: 'sk-private-start-type', name: 'sk-private-tool-name', input: { secret: 'sk-private-arguments' } },
    { text: 'sk-private-missing-type' }, { type: { secret: 'sk-private-non-string-type' } }, { type: '__proto__' },
  ]) stream({ type: 'content_block_start', content_block })
  for (const delta of [
    { type: 'text_delta', text: '额外公开文字' },
    { type: 'thinking_delta', thinking: 'sk-private-reasoning' },
    { type: 'input_json_delta', partial_json: 'sk-private-arguments' },
    { type: 'signature_delta', signature: 'sk-private-signature' },
    { partial_json: 'sk-private-missing-type' }, { type: 17, text: 'sk-private-non-string-type' }, { type: '__proto__' },
  ]) stream({ type: 'content_block_delta', delta })
  stream({ type: 'sk-private-event-type', text: 'sk-private-event-body' })
}
if (mode === 'owner-death-tree') {
  spawn(process.execPath, ['-e', "require('node:fs').writeFileSync('silent-child.pid', String(process.pid));setInterval(()=>{},1000)"], { stdio: 'ignore' })
}
if (mode === 'stream-then-hang' || mode === 'owner-death-tree') {
  emit({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'message_start', message: { id: 'held-model', usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 0 } } } })
  setInterval(() => {}, 1000); await new Promise(() => {})
}
if (mode.startsWith('usage-stream')) {
  const stream = event => emit({ type: 'stream_event', parent_tool_use_id: null, event })
  stream({ type: 'message_start', message: { id: 'model-1', usage: { input_tokens: 10, cache_creation_input_tokens: 3, cache_read_input_tokens: 5, output_tokens: 0 } } })
  stream({ type: 'message_delta', usage: { output_tokens: 7 } })
  stream({ type: 'message_delta', usage: { output_tokens: 7 } })
  stream({ type: 'message_stop' })
  // Repeated IDs and cumulative deltas are not another model request.
  stream({ type: 'message_start', message: { id: 'model-1', usage: { input_tokens: 10, cache_creation_input_tokens: 3, cache_read_input_tokens: 5, output_tokens: 7 } } })
  stream({ type: 'message_stop' })
  if (mode === 'usage-stream-cancel') { setInterval(() => {}, 1000); await new Promise(() => {}) }
  stream({ type: 'message_start', message: { id: 'model-2', usage: { input_tokens: 4, cache_creation_input_tokens: 0, cache_read_input_tokens: 1, output_tokens: 0 } } })
  stream({ type: 'message_delta', usage: { output_tokens: 2 } })
  stream({ type: 'message_stop' })
  if (mode === 'usage-stream-missing') process.exit(0)
}
if (mode.endsWith('child')) {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' })
  writeFileSync('child.pid', String(child.pid))
  if (mode === 'hang-child') { setInterval(() => {}, 1000); await new Promise(() => {}) }
}
emit({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'thinking_delta', thinking: 'private reasoning' } } })
emit({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_delta', delta: { type: 'text_delta', text: '公开答复' } } })
if (mode === 'diagnostic-queued-categories') emit({ type: 'stream_event', parent_tool_use_id: null, event: { type: 'content_block_start', content_block: { type: 'thinking', thinking: 'sk-private-queued-reasoning' } } })
emit({ type: 'assistant', parent_tool_use_id: null, message: { content: [{type:'text',text:'公开答复'}] } })
if (mode === 'missing') process.exit(0)
const result = {type:'result',subtype:'success',is_error:false,terminal_reason:'completed',permission_denials:[],result:'公开答复',usage:{input_tokens:10,cache_creation_input_tokens:3,cache_read_input_tokens:5,output_tokens:2}}
if (mode.startsWith('usage-stream')) result.usage = {input_tokens:14,cache_creation_input_tokens:3,cache_read_input_tokens:6,output_tokens:9}
if (mode === 'usage-stream-inconsistent') result.usage.output_tokens = 8
if (mode === 'usage-stream-unknown') delete result.usage.cache_read_input_tokens
if (mode === 'usage-stream-failed') { result.is_error=true;result.terminal_reason='api_error' }
if (mode === 'failed' || mode === 'stderr') {result.subtype='error_during_execution';result.is_error=true;result.result='sk-synthetic-private-error'}
if (mode === 'unknown-usage') delete result.usage.cache_read_input_tokens
emit(result)
if (mode === 'duplicate') emit(result)
if (mode === 'nonzero') process.exit(7)
process.exit(0)
