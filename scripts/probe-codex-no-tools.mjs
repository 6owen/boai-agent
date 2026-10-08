/*
 * [INPUT]: 已安装Codex、当前生产适配器、隔离HOME和只在127.0.0.1接收的假模型端点。
 * [OUTPUT]: 真实Codex实际提交的工具目录与无工具门禁证据；不使用登录或真实模型。
 * [POS]: 第13组LR0能力实测；配合真实供应商续聊证据，二者不合并为同一运行。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { build } from 'esbuild'
import { createServer } from 'node:http'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
const directory = await mkdtemp(join(tmpdir(), 'boai-codex-no-tools-')), home = join(directory, 'home')
await mkdir(home)
await writeFile(join(home, 'models_cache.json'), await readFile(resolve('tests/fixtures/codex-model-catalog.json')))
const sourceHashes = Object.fromEntries(await Promise.all(['client.ts', 'policy.ts', 'turn.ts', 'catalog.ts'].map(async name => [name, createHash('sha256').update(await readFile(resolve('src/runtime/adapters/codex', name))).digest('hex')])))
const evidence = { sourceHashes, createdAt: new Date().toISOString(), platform: process.platform, kind: 'actual-cli-local-inference-fixture', realModel: false, requests: [] }
const server = createServer(async (request, response) => {
  let text = ''
  for await (const chunk of request) text += chunk
  const body = JSON.parse(text)
  evidence.requests.push({ model: body.model, tools: [...(body.tools ?? []), ...(body.input ?? []).filter(item => item.type === 'additional_tools').flatMap(item => item.tools ?? [])], toolChoice: body.tool_choice })
  response.writeHead(400, { 'content-type': 'application/json' })
  response.end(JSON.stringify({ error: { message: 'Intentional probe rejection after recording tool declarations; no inference.' } }))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
await writeFile(join(home, 'config.toml'), `model_provider = "boai_probe"\nmodel = "gpt-6.1-sol"\n[model_providers.boai_probe]\nname = "BoAI local capability probe"\nbase_url = "http://127.0.0.1:${server.address().port}/v1"\nwire_api = "responses"\nrequires_openai_auth = false\nrequest_max_retries = 0\nstream_max_retries = 0\nsupports_websockets = false\n`)
const entry = join(directory, 'adapter.mjs')
await build({ stdin: { contents: "export { runCodexPhase, testCodexConnection } from './src/runtime/adapters/codex/turn'; export { resolveProgram } from './src/runtime/modules/backends/program'", resolveDir: process.cwd(), loader: 'ts' }, outfile: entry, platform: 'node', format: 'esm', bundle: true, target: 'node22', logLevel: 'silent' })
const { runCodexPhase, testCodexConnection, resolveProgram } = await import(pathToFileURL(entry).href)
const file = resolveProgram(process.env.BOAI_CODEX_PROGRAM ?? 'codex')
const profile = { id: 'no-tools-probe', name: 'Codex', protocol: 'codex-app-server', executable: file.path, executableHash: file.hash, runtime: file.runtime, args: [], revision: 1, useExistingLogin: false, hostAccessAcknowledged: true }
try {
  const input = { profile, cwd: join(directory, 'work'), privateHome: home, signal: AbortSignal.timeout(30_000) }
  profile.verified = await testCodexConnection(input)
  evidence.program = profile.verified
  await runCodexPhase({ ...input, ephemeral: true, instructions: 'Text assistant; this phase has no tools.', prompt: 'Reply OK.' })
  evidence.unexpectedCompletion = true
} catch (error) {
  evidence.expectedFailure = error instanceof Error ? error.message : 'Probe stopped'
} finally {
  server.closeAllConnections()
  await new Promise(resolve => server.close(resolve))
  evidence.passed = evidence.requests.length === 1 && evidence.requests[0].tools.length === 0 && !evidence.unexpectedCompletion
  const out = resolve(process.env.BOAI_CODEX_EVIDENCE ?? join(directory, 'result.json'))
  await mkdir(dirname(out), { recursive: true })
  await writeFile(out, JSON.stringify(evidence, null, 2) + '\n')
  console.log(JSON.stringify({ passed: evidence.passed, requests: evidence.requests.length, toolCount: evidence.requests[0]?.tools.length, evidence: out, error: evidence.passed ? undefined : evidence.expectedFailure }))
  if (!evidence.passed) process.exitCode = 1
}
