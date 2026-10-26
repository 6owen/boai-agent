/*
 * [OUTPUT]: Workspace源码路径迁至apps/packages，保留既有输出与业务合同。
 * [INPUT]: 已安装Codex、生产适配器、隔离HOME和本地Responses协议夹具。
 * [OUTPUT]: 实际CLI的宿主动态工具目录、调用回执和多步骤用量；没有真实供应商推理。
 * [POS]: 第13组LR2协议能力实测，与真实产品交付分别留证。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { buildWorkspace as build } from './workspace-packages.mjs'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
const directory = await mkdtemp(join(tmpdir(), 'boai-codex-tools-')), home = join(directory, 'home')
await mkdir(home)
await writeFile(join(home, 'models_cache.json'), await readFile(resolve('tests/fixtures/codex-model-catalog.json')))
const files = ['client.ts', 'policy.ts', 'turn.ts', 'catalog.ts']
const evidence = { createdAt: new Date().toISOString(), platform: process.platform, kind: 'actual-cli-local-inference-fixture', realModel: false,
  sourceHashes: Object.fromEntries(await Promise.all(files.map(async name => [name, createHash('sha256').update(await readFile(resolve('packages/runtime/src/adapters/codex', name))).digest('hex')]))), requests: [], toolCalls: [], usage: [] }
const server = createServer(async (request, response) => {
  let text = ''; for await (const chunk of request) text += chunk
  const body = JSON.parse(text), n = evidence.requests.length + 1
  await writeFile(join(directory, `request-${n}.json`), JSON.stringify(body, null, 2))
  evidence.requests.push({ tools: [...(body.tools ?? []), ...(body.input ?? []).filter(item => item.type === 'additional_tools').flatMap(item => item.tools ?? [])], toolOutputs: (body.input ?? []).filter(item => item.type === 'function_call_output') })
  if (n > 2) { response.writeHead(400); response.end('Unexpected request'); return }
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  const emit = value => response.write(`event: ${value.type}\ndata: ${JSON.stringify(value)}\n\n`)
  const item = n === 1 ? { type: 'function_call', id: 'fc_probe', call_id: 'probe-call', name: 'host_write', namespace: 'boai', arguments: '{"text":"native-bridge-proof"}', status: 'completed' }
    : { type: 'message', id: 'msg_probe', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text: '已完成', annotations: [] }] }
  emit({ type: 'response.created', response: { id: `resp_${n}`, object: 'response', status: 'in_progress', output: [] } })
  emit({ type: 'response.output_item.added', output_index: 0, item })
  if (n === 1) emit({ type: 'response.function_call_arguments.done', item_id: item.id, output_index: 0, arguments: item.arguments })
  else emit({ type: 'response.output_text.delta', item_id: item.id, output_index: 0, content_index: 0, delta: '已完成' })
  emit({ type: 'response.output_item.done', output_index: 0, item })
  emit({ type: 'response.completed', response: { id: `resp_${n}`, status: 'completed', output: [item], usage: { input_tokens: n * 100, output_tokens: n * 10, total_tokens: n * 110, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } })
  response.end()
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
await writeFile(join(home, 'config.toml'), `model_provider = "boai_probe"\nmodel = "gpt-6.1-sol"\n[model_providers.boai_probe]\nname = "BoAI local tool probe"\nbase_url = "http://127.0.0.1:${server.address().port}/v1"\nwire_api = "responses"\nrequires_openai_auth = false\nrequest_max_retries = 0\nstream_max_retries = 0\nsupports_websockets = false\n`)
const entry = join(directory, 'adapter.mjs')
await build({ stdin: { contents: "export { runCodexPhase, testCodexConnection } from './packages/runtime/src/adapters/codex/turn'; export { resolveProgram } from './packages/runtime/src/modules/backends/program'", resolveDir: process.cwd(), loader: 'ts' }, outfile: entry, platform: 'node', format: 'esm', bundle: true, target: 'node22', logLevel: 'silent' })
const { runCodexPhase, testCodexConnection, resolveProgram } = await import(pathToFileURL(entry).href)
const file = resolveProgram(process.env.BOAI_CODEX_PROGRAM ?? 'codex')
const profile = { id: 'tools-probe', name: 'Codex', protocol: 'codex-app-server', executable: file.path, executableHash: file.hash, runtime: file.runtime, args: [], revision: 1, useExistingLogin: false, hostAccessAcknowledged: true }
try {
  const input = { profile, cwd: join(directory, 'work'), privateHome: home, signal: AbortSignal.timeout(30_000) }
  profile.verified = await testCodexConnection(input); evidence.program = profile.verified
  evidence.result = await runCodexPhase({ ...input, ephemeral: true, instructions: 'Use the authorized host tool.', prompt: 'Write the proof file.',
    tools: [{ name: 'host_write', description: 'Write an isolated proof file', inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false },
      execute: async (args, callId) => { evidence.toolCalls.push({ args, callId }); await writeFile(join(directory, 'proof.txt'), args.text); return { written: true } } }],
    onUsage: async usage => { evidence.usage.push(usage) } })
  evidence.proof = await readFile(join(directory, 'proof.txt'), 'utf8')
} catch (error) { evidence.error = error instanceof Error ? error.message : 'Probe failed' }
finally {
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve))
  evidence.passed = !evidence.error && evidence.requests.length === 2 && evidence.toolCalls.length === 1 && evidence.proof === 'native-bridge-proof'
    && evidence.result?.usage.totalTokens === 330 && evidence.requests.every(request => request.tools.length === 1 && request.tools[0].name === 'boai' && request.tools[0].tools?.length === 1 && request.tools[0].tools[0].name === 'host_write')
  const out = resolve(process.env.BOAI_CODEX_EVIDENCE ?? join(directory, 'result.json'))
  await mkdir(dirname(out), { recursive: true }); await writeFile(out, JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify({ passed: evidence.passed, evidence: out, directory, requests: evidence.requests.length, usage: evidence.usage, error: evidence.error }))
  if (!evidence.passed) process.exitCode = 1
}
