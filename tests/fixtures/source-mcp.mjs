/* [INPUT]: Isolated MCP stdio requests and test-only env. [OUTPUT]: Actual JSON-RPC tools and a supervised descendant. [POS]: sources.test fixture. [PROTOCOL]: Update fixtures/.folder.md. */
import { createInterface } from 'node:readline'
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
if (process.env.SOURCE_PID_FILE) {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { detached: true, stdio: 'ignore' })
  writeFileSync(process.env.SOURCE_PID_FILE, String(child.pid))
}
const lines = createInterface({ input: process.stdin })
lines.on('line', line => {
  const request = JSON.parse(line)
  if (request.id === undefined) return
  let result
  if (request.method === 'initialize') result = { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'local-source-fixture', version: '1' } }
  else if (request.method === 'tools/list') result = { tools: [{ name: 'echo', description: 'Fixture echo', inputSchema: { type: 'object', properties: { value: { type: 'string' } }, required: ['value'] }, annotations: { readOnlyHint: true } }, { name: 'write', inputSchema: { type: 'object' } }] }
  else if (request.method === 'tools/call') result = { content: [{ type: 'text', text: JSON.stringify({ value: request.params.arguments, token: process.env.SOURCE_TOKEN ?? '' }) }] }
  else if (request.method === 'ping') result = {}
  else { process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: -32601, message: 'Unknown method' } }) + '\n'); return }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n')
})
lines.on('close', () => process.exit(0))
