/*
 * [OUTPUT]: Workspace源码路径迁至apps/packages，保留既有输出与业务合同。
 * [OUTPUT]: 实际CLI十五组核对终态/取消、白名单事件与收取/处理计数、格式回执和已知用量；观测只描述外部协议。
 * [INPUT]: 实际本机Claude、生产阶段适配器与隔离的合成模型协议服务。
 * [OUTPUT]: 三类私有阶段直接格式化、提醒/有界纠正及计量触发取消；实际CLI部分用量与终态总额一致，私有文本不公开；本地协议端不代表供应商或产品Work/UI。
 * [POS]: 第13组Claude结构化私有阶段的实际CLI验收入口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildWorkspace as build } from './workspace-packages.mjs'

if (!process.env.BOAI_CLAUDE_PROGRAM || !process.env.BOAI_CLAUDE_EVIDENCE) throw new Error('需要明确的程序路径和新证据文件')
const out = resolve(process.env.BOAI_CLAUDE_EVIDENCE)
await mkdir(dirname(out), { recursive: true })
const root = await mkdtemp(join(tmpdir(), 'boai-claude-format-'))
const bundle = join(root, 'adapter.cjs')
const built = await build({ stdin: { contents: `export { verifyClaudeProgram, runClaudePhase } from './packages/runtime/src/adapters/claude/turn';
import { z } from 'zod';
import { decisionPromptSchema, memorySchema } from './packages/runtime/src/modules/employees/phase-protocol';
import { modelWorkReportSchema } from './packages/runtime/src/modules/collaboration/work-protocol';
export const phaseSchemas = [decisionPromptSchema, memorySchema, modelWorkReportSchema({organization:false, artifactIds:[]})].map(schema => z.toJSONSchema(schema, {target:'draft-07'}));`, resolveDir: process.cwd(), loader: 'ts' },
  outfile: bundle, bundle: true, platform: 'node', format: 'cjs', target: 'node22', logLevel: 'silent', metafile: true })
const { verifyClaudeProgram, runClaudePhase, phaseSchemas } = await import(pathToFileURL(bundle).href)
const sources = [...Object.keys(built.metafile.inputs).filter(path => path !== '<stdin>' && !path.startsWith('node_modules/')), 'scripts/probe-claude-structured.mjs', 'package.json', 'pnpm-lock.yaml']
const hash = async path => createHash('sha256').update(await readFile(path)).digest('hex')
const evidence = { kind: 'actual-claude-cli-structured-local-protocol', createdAt: new Date().toISOString(), platform: process.platform,
  uiVerified: false, workVerified: false, realProvider: false, requests: [], steps: [],
  sourceHashes: Object.fromEntries(await Promise.all(sources.map(async path => [path, await hash(path)]))), bundleHash: await hash(bundle) }
const phases = [
  { phase: 'decision', expected: { action: 'reply', responseKind: 'chat' } },
  { phase: 'memory', expected: { candidates: [] } },
  { phase: 'report', expected: { action: 'publish', text: '已核对', outcome: { disposition: 'progress', summary: '已核对' } } }
]
const cases = [...[{reminder:false,rejections:0},{reminder:true,rejections:0},{reminder:false,rejections:1},{reminder:false,rejections:2}].flatMap(mode => phases.map((phase, schemaIndex) => ({ ...phase, schemaIndex, ...mode, effort: phase.phase === 'report' ? undefined : 'low' }))),
  ...phases.map((phase, schemaIndex) => ({ ...phase, schemaIndex, reminder:false, rejections:0, cancel:true, effort:phase.phase === 'report' ? undefined : 'low' }))]
let stage = 0
let stageRequests = 0
const prefix = 'PRIVATE FORMATTER PREFIX'
const server = createServer(async (req, res) => {
  const chunks = []; for await (const chunk of req) chunks.push(chunk)
  if (!req.url.includes('/messages') || req.url.includes('count_tokens')) { res.writeHead(404).end('{}'); return }
  const body = JSON.parse(Buffer.concat(chunks).toString())
  const current = cases[stage], requestIndex = stageRequests++, firstText = current.reminder && requestIndex === 0, rejected = requestIndex < current.rejections
  evidence.requests.push({ phase: current.phase, reminder: current.reminder, rejections: current.rejections, rejected, firstText, model: body.model, tools: body.tools, stream: body.stream, formatterContractPresent: JSON.stringify(body.system).includes('Submit the private JSON result through StructuredOutput'), thinking: body.thinking, outputConfig: body.output_config,
    priorRejected: body.messages.flatMap(message => Array.isArray(message.content) ? message.content : []).filter(block => block.type === 'tool_result' && block.is_error === true).length,
    enforcementPresent: JSON.stringify(body.messages).includes('[structured-output-enforce] You MUST call the StructuredOutput tool to complete this request. Call this tool now.') })
  res.setHeader('content-type', 'text/event-stream')
  for (const event of [
    { type: 'message_start', message: { id: `msg_private_format_${stage}_${requestIndex}`, type: 'message', role: 'assistant', content: [], model: body.model, stop_reason: null, stop_sequence: null,
      usage: { input_tokens: 10, cache_creation_input_tokens: 3, cache_read_input_tokens: 5, output_tokens: 0 } } },
    { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
    { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: firstText ? JSON.stringify(current.expected) : prefix } },
    { type: 'content_block_stop', index: 0 },
    ...(firstText ? [] : [{ type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: `toolu_private_format_${requestIndex}`, name: 'StructuredOutput', input: {} } },
    { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: JSON.stringify(rejected ? {unrecognized_field:true} : cases[stage].expected) } },
    { type: 'content_block_stop', index: 1 }]),
    { type: 'message_delta', delta: { stop_reason: firstText ? 'end_turn' : 'tool_use', stop_sequence: null }, usage: { output_tokens: 7 } },
    { type: 'message_stop' }
  ]) res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
  res.end()
})
await new Promise(done => server.listen(0, '127.0.0.1', done))
try {
  const cwd = join(root, 'work'), configDirectory = join(root, 'config'), signal = AbortSignal.timeout(120_000)
  const program = await verifyClaudeProgram({ executable: process.env.BOAI_CLAUDE_PROGRAM, cwd, configDirectory, signal })
  evidence.program = program
  for (stage = 0; stage < cases.length; stage++) {
    const deltas = [], partialUsage = [], diagnostics = [], schema = phaseSchemas[cases[stage].schemaIndex], start = evidence.requests.length
    const controller = new AbortController(), cancelled = new Error('Synthetic original budget exhausted')
    stageRequests = 0
    const result = await runClaudePhase({ program, cwd, configDirectory, signal: AbortSignal.any([signal, controller.signal]), timeoutMs: 20_000, ephemeral: true, outputSchema: schema, effort: cases[stage].effort,
      baseUrl: `http://127.0.0.1:${server.address().port}`, apiKey: `synthetic-${randomUUID()}`, model: 'deepseek-v4-pro',
      instructions: 'Return the specified structured result.', prompt: 'Return the requested structured data.', onDiagnostic: value => { diagnostics.push(value) }, onDelta: text => { deltas.push(text) }, onUsage: usage => {
        partialUsage.push(usage); if (cases[stage].cancel && usage.outputTokens === 7) controller.abort(cancelled)
      } }).catch(error => { if (cases[stage].cancel) return error; throw error })
    assert.equal(diagnostics.length, 1)
    assert.equal(diagnostics[0].transport.processGroupExited, true)
    assert.ok(!JSON.stringify(diagnostics).includes(prefix))
    if (cases[stage].cancel) {
      assert.equal(result, cancelled); assert.deepEqual(deltas, [])
      assert.deepEqual(partialUsage.at(-1), { inputTokens: 18, outputTokens: 7, totalTokens: 25 })
      assert.equal(evidence.requests.length - start, 1)
      assert.equal(diagnostics[0].outcome, 'cancelled')
      assert.equal(diagnostics[0].transport.stoppedBecause, 'cancelled')
      evidence.steps.push({ kind: `${cases[stage].phase}-budget-cancel`, passed:true, partialUsage, deltas, diagnostics, noCompletedResult:true })
      continue
    }
    assert.deepEqual(JSON.parse(result.text), cases[stage].expected)
    assert.deepEqual(deltas, [])
    const count = cases[stage].reminder ? 2 : 1 + cases[stage].rejections, requests = evidence.requests.slice(start)
    assert.deepEqual(result.usage, { inputTokens: 18 * count, outputTokens: 7 * count, totalTokens: 25 * count })
    assert.deepEqual(partialUsage.at(-1), result.usage)
    assert.equal(partialUsage.length, 2 * count)
    assert.deepEqual(result.protocolCounts, { formatterCalls: 1 + cases[stage].rejections, formatterRejections: cases[stage].rejections, formatReminders: cases[stage].reminder ? 1 : 0 })
    assert.equal(diagnostics[0].outcome, 'completed')
    assert.equal(diagnostics[0].stage, 'returned')
    assert.equal(diagnostics[0].lastEvent.type, 'result')
    assert.equal(diagnostics[0].eventCounts.result, 1)
    assert.deepEqual(diagnostics[0].protocolCounts, result.protocolCounts)
    assert.equal(diagnostics[0].transport.receivedLines, diagnostics[0].transport.handledLines)
    assert.equal(requests.length, count)
    for (const request of requests) {
      assert.equal(request.formatterContractPresent, true)
      assert.deepEqual(request.tools.map(tool => tool.name), ['StructuredOutput'])
      assert.deepEqual(request.tools[0].input_schema, schema)
      assert.deepEqual(request.thinking, { type: 'adaptive' })
      assert.deepEqual(request.outputConfig, { effort: cases[stage].effort ?? 'high' })
    }
    if (cases[stage].reminder) assert.equal(requests[1].enforcementPresent, true)
    if (cases[stage].rejections) assert.equal(requests.at(-1).priorRejected, cases[stage].rejections)
    evidence.steps.push({ kind: cases[stage].phase, rejections: cases[stage].rejections, reminder: cases[stage].reminder, modelRequests: count, passed: true, result, partialUsage, deltas, diagnostics, onlyFormatter: true })
  }
  for (const [path, expectedHash] of Object.entries(evidence.sourceHashes)) assert.equal(await hash(path), expectedHash, `Source changed: ${path}`)
  evidence.sourceUnchanged = true
  evidence.passed = true
} catch (error) {
  evidence.passed = false
  evidence.error = error instanceof Error ? error.message : 'Unknown probe error'
  process.exitCode = 1
} finally {
  server.closeAllConnections(); await new Promise(done => server.close(done))
  await writeFile(out, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' })
  await rm(root, { recursive: true, force: true })
  console.log(JSON.stringify({ passed: evidence.passed, steps: evidence.steps, error: evidence.error, evidence: out }))
}
