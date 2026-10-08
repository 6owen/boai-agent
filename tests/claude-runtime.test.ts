/*
 * [OUTPUT]: 两流真实UTF8字节与每轮重置、原合计/单行门禁及整组退出；进入内容分支仅计固定桶，私有哨兵不进入诊断、排队行不计桶，旧缺省仍未知。
 * [OUTPUT]: API重试401/403必须在下一外部动作前停止实际进程且只显示固定错误；429等瞬时状态保持原流程，不传播私有错误正文。
 * [OUTPUT]: 私有disabled沿实际合成上游核对原模型/来源/格式器、未完成格式器精确tool_choice和单次请求，公开/媒体/其他模型/混合effort在启动前拒绝；不以CLI关闭设置替代实际报文。
 * [OUTPUT]: SIGKILL真实拥有者后核对监督进程、静默CLI与已关闭输出管道的后代全部退出。
 * [OUTPUT]: 静默事件超时、宿主回调失败/阻塞和观测失败分开验收；已收未处理终态不冒充外部没有返回，实际退出后才释放。
 * [OUTPUT]: 流式已知用量按实际消息ID去重累计，故障/取消保留已知部分，终态矛盾不作成功；不将部分计量当完整外部请求。
 * [OUTPUT]: 明确低档只接受私有结果或独立宿主工具阶段，普通聊天和未知强度在启动前拒绝。
 * [INPUT]: 真实隔离协议进程、故障/取消和父子进程退出屏障。
 * [OUTPUT]: 私有强度拒绝越界阶段；图片原生传输/编码及容量、无工具/会话/终态/公开文本/未知用量与真实退出；非真实CLI或UI验收。
 * [POS]: Claude底层适配模块验收。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { chmod, copyFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { join, resolve } from 'node:path'
import { runClaudeNoTools, verifyClaudeProgram, type ClaudePhaseDiagnostic } from '../src/runtime/adapters/claude/turn'
import { runClaudeProcess, type ClaudeProcessReceipt } from '../src/runtime/adapters/claude/process'
import { claudeInput } from '../src/runtime/adapters/claude/input'
import { MATERIAL_LIMITS } from '../src/shared/domain/materials'
import type { ModelUsage } from '../src/shared/domain'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => { vi.unstubAllEnvs(); vi.restoreAllMocks(); for (const clean of cleanups.splice(0).reverse()) await clean() })
async function setup() {
  const cwd = await mkdtemp(join(tmpdir(), 'boai-claude-unit-'))
  cleanups.push(() => rm(cwd, { recursive: true, force: true }))
  const executable = join(cwd, 'claude.mjs'), configDirectory = join(cwd, 'config')
  await copyFile(resolve('tests/fixtures/claude-cli.mjs'), executable); await chmod(executable, 0o700)
  const controller = new AbortController()
  const program = await verifyClaudeProgram({ executable, cwd, configDirectory, signal: controller.signal })
  const input = { program, cwd, configDirectory, baseUrl: 'http://127.0.0.1:9', apiKey: 'synthetic-key', model: 'fixture-model',
    instructions: 'fixture only', signal: controller.signal, timeoutMs: 5000 }
  return { input, controller }
}
const alive = (pid: number) => { try { process.kill(pid, 0); return true } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ESRCH') return false; throw e } }
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6GNAAAAAASUVORK5CYII='

it('counts actual UTF8 stdout and stderr independently of input, resets each invocation and survives receipt observer failure', async () => {
  const { input } = await setup(), receipts: ClaudeProcessReceipt[] = [], lines: string[] = []
  const processInput = { executable: input.program.executable, runtime: 'node' as const, args: [], env: { PATH: process.env.PATH },
    cwd: input.cwd, signal: input.signal, timeoutMs: 5000, onLine: (line: string) => { lines.push(line) } }
  const first = await runClaudeProcess({ ...processInput, stdin: 'transport-bytes:' + '合成输入😀'.repeat(512),
    onReceipt: value => { receipts.push(value); throw new Error('sk-private-receipt-observer') } })
  const stdoutBytes = Buffer.byteLength('本机😀\n'), stderrBytes = Buffer.byteLength('私有🔒\n')
  expect(first).toEqual({ exitCode: 0, bytesReceived: stdoutBytes + stderrBytes })
  expect(lines).toEqual(['本机😀'])
  expect(receipts[0]).toMatchObject({ stdoutBytes, stderrBytes, receivedLines: 1, handledLines: 1, processGroupExited: true, exitCode: 0 })
  const second = await runClaudeProcess({ ...processInput, stdin: 'transport-empty', onReceipt: value => { receipts.push(value) } })
  expect(second).toEqual({ exitCode: 0, bytesReceived: 0 })
  expect(receipts[1]).toMatchObject({ stdoutBytes: 0, stderrBytes: 0, receivedLines: 0, handledLines: 0, processGroupExited: true, exitCode: 0 })
  expect(receipts[0].stdoutBytes).toBe(stdoutBytes); expect(receipts[0].stderrBytes).toBe(stderrBytes)
  expect(JSON.stringify(receipts)).not.toMatch(/合成输入|本机|私有|sk-private/)
  const launched = JSON.parse(await readFile(join(input.cwd, 'launched.json'), 'utf8'))
  expect([launched.pid, launched.parentPid, -launched.parentPid].map(alive)).toEqual([false, false, false])
})

it('retains the byte that exceeds the original combined 8MiB guard and waits for actual group exit', async () => {
  const { input } = await setup(), receipts: ClaudeProcessReceipt[] = []
  await expect(runClaudeProcess({ executable: input.program.executable, runtime: 'node', args: [], env: { PATH: process.env.PATH },
    cwd: input.cwd, signal: input.signal, timeoutMs: 5000, stdin: 'transport-output-limit', onLine: () => {},
    onReceipt: value => { receipts.push(value); throw new Error('sk-private-receipt-observer') } })).rejects.toThrow('Claude输出超过8MiB限制')
  expect(receipts).toHaveLength(1)
  expect(receipts[0]).toMatchObject({ stdoutBytes: 4 * 1024 * 1024, stderrBytes: 4 * 1024 * 1024 + 1, stoppedBecause: 'output-limit', processGroupExited: true })
  const launched = JSON.parse(await readFile(join(input.cwd, 'launched.json'), 'utf8'))
  expect([launched.pid, launched.parentPid, -launched.parentPid].map(alive)).toEqual([false, false, false])
})

it('counts only fixed stream block categories without retaining private type, content, signature or tool arguments', async () => {
  const { input } = await setup(), observations: ClaudePhaseDiagnostic[] = [], deltas: string[] = []
  const result = await runClaudeNoTools({ ...input, prompt: 'diagnostic-categories', onDelta: value => { deltas.push(value) }, onDiagnostic: value => { observations.push(value) } })
  expect(result.text).toBe('公开答复'); expect(deltas).toEqual(['额外公开文字', '公开答复'])
  expect(observations).toHaveLength(1)
  const diagnostic = observations[0]
  expect(diagnostic.contentBlockStartCounts).toEqual({ text: 1, thinking: 1, tool_use: 0, server_tool_use: 0, other: 4 })
  expect(diagnostic.contentBlockDeltaCounts).toEqual({ text_delta: 2, thinking_delta: 2, input_json_delta: 1, other: 4 })
  expect(diagnostic.eventCounts).toEqual({ init: 1, content_block_start: 6, content_block_delta: 9, other: 1, assistant: 1, result: 1 })
  expect(Object.values(diagnostic.contentBlockStartCounts!).every(value => Number.isSafeInteger(value) && value >= 0)).toBe(true)
  expect(Object.values(diagnostic.contentBlockDeltaCounts!).every(value => Number.isSafeInteger(value) && value >= 0)).toBe(true)
  expect(JSON.stringify(diagnostic)).not.toMatch(/sk-private|__proto__|signature_delta|公开答复|额外公开文字|synthetic-key/)
  const fresh: ClaudePhaseDiagnostic[] = []
  await runClaudeNoTools({ ...input, prompt: 'valid', onDiagnostic: value => { fresh.push(value) } })
  expect(fresh[0].contentBlockStartCounts).toEqual({ text: 0, thinking: 0, tool_use: 0, server_tool_use: 0, other: 0 })
  expect(fresh[0].contentBlockDeltaCounts).toEqual({ text_delta: 1, thinking_delta: 1, input_json_delta: 0, other: 0 })
})

it.each(['tool_use', 'server_tool_use'] as const)('counts rejected %s in its fixed bucket without granting a tool or preserving its name', async type => {
  const { input } = await setup(), observations: ClaudePhaseDiagnostic[] = []
  await expect(runClaudeNoTools({ ...input, prompt: `diagnostic-${type}`, onDiagnostic: value => { observations.push(value) } })).rejects.toThrow('未授权的工具请求')
  expect(observations[0].contentBlockStartCounts).toEqual({ text: 0, thinking: 0, tool_use: type === 'tool_use' ? 1 : 0, server_tool_use: type === 'server_tool_use' ? 1 : 0, other: 0 })
  expect(observations[0].transport).toMatchObject({ stoppedBecause: 'callback', processGroupExited: true, receivedLines: 2, handledLines: 1 })
  expect(JSON.stringify(observations)).not.toMatch(/sk-private|synthetic-key/)
  const launched = JSON.parse(await readFile(join(input.cwd, 'launched.json'), 'utf8'))
  expect([launched.pid, launched.parentPid, -launched.parentPid].map(alive)).toEqual([false, false, false])
})

it('keeps absent historical byte and block counters unknown instead of manufacturing zero observations', () => {
  const receipt: ClaudeProcessReceipt = { receivedLines: 1, handledLines: 1, processGroupExited: true, exitCode: 0 }
  const historical: ClaudePhaseDiagnostic = { outcome: 'completed', stage: 'returned', eventCounts: { result: 1 }, transport: receipt }
  const retained = JSON.parse(JSON.stringify(historical)) as ClaudePhaseDiagnostic
  expect(retained.transport?.stdoutBytes).toBeUndefined(); expect(retained.transport?.stderrBytes).toBeUndefined()
  expect(retained.contentBlockStartCounts).toBeUndefined(); expect(retained.contentBlockDeltaCounts).toBeUndefined()
})

it.each([401, 403])('stops actual Claude process on current-session API rejection %s before the CLI retries or continues', async status => {
  const { input } = await setup(), diagnostics: ClaudePhaseDiagnostic[] = []
  await expect(runClaudeNoTools({ ...input, prompt: `api-auth-${status}`, onDiagnostic: value => { diagnostics.push(value) } })).rejects.toThrow(status === 401 ? '认证失败（401）' : '拒绝访问（403）')
  await expect(readFile(join(input.cwd, 'continued-after-api-rejection.txt'))).rejects.toMatchObject({ code: 'ENOENT' })
  expect(diagnostics.at(-1)?.transport).toMatchObject({ processGroupExited: true, stoppedBecause: 'callback' })
  expect(JSON.stringify(diagnostics)).not.toContain('sk-private-provider-error')
})

it('does not treat a transient retry status as credential rejection or change its successful result', async () => {
  const { input } = await setup()
  const result = await runClaudeNoTools({ ...input, prompt: 'api-transient' })
  expect(result.text).toBeTruthy()
  expect(await readFile(join(input.cwd, 'continued-after-api-rejection.txt'), 'utf8')).toBe('continued')
})

it.each(['public-chat', 'other-model', 'media', 'effort'] as const)('rejects explicit off for %s before spawning a model phase', async variant => {
  const { input } = await setup()
  const privatePhase = { ...input, model: 'deepseek-v4-pro', prompt: 'valid', ephemeral: true, outputSchema: { type: 'object' }, thinking: 'disabled' as const }
  const config = variant === 'public-chat' ? { ...privatePhase, outputSchema: undefined }
    : variant === 'other-model' ? { ...privatePhase, model: 'another-model' }
    : variant === 'media' ? { ...privatePhase, images: [png] }
    : { ...privatePhase, effort: 'low' as const }
  await expect(runClaudeNoTools(config)).rejects.toThrow('显式关闭')
  await expect(readFile(join(input.cwd, 'launched.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('sends explicit disabled to the actual upstream private request without changing model, source messages or formatter',async()=>{
 const {input,controller}=await setup(),requests:{body:any;key:unknown}[]=[]
 const server=createServer(async(req,res)=>{
  const parts:Buffer[]=[];for await(const chunk of req)parts.push(Buffer.from(chunk))
  requests.push({body:JSON.parse(Buffer.concat(parts).toString()),key:req.headers['x-api-key']});res.writeHead(200,{'content-type':'application/json'}).end('{"ok":true}')
 })
 await new Promise<void>(done=>server.listen(0,'127.0.0.1',done));cleanups.push(async()=>{server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()))})
 await copyFile(resolve('tests/fixtures/claude-employee.mjs'),input.program.executable)
 await chmod(input.program.executable,0o700)
 const program=await verifyClaudeProgram({executable:input.program.executable,cwd:input.cwd,configDirectory:input.configDirectory,signal:controller.signal})
 const schema={$schema:'http://json-schema.org/draft-07/schema#',type:'object',properties:{action:{const:'discard'}},required:['action'],additionalProperties:false}
 const prompt=JSON.stringify({protocol:'private-work-report',draft:{text:'CLAUDE_PROVIDER_WIRE CLAUDE_WITHHOLD_WAIT'},sourceMessageId:'original-message'})
 const config={...input,program,baseUrl:`http://127.0.0.1:${(server.address()as any).port}`,model:'deepseek-v4-pro',prompt,ephemeral:true,outputSchema:schema,thinking:'disabled' as const}
 const result=await runClaudeNoTools(config)
 expect(JSON.parse(result.text)).toEqual({action:'discard'});expect(requests).toHaveLength(1)
 expect(requests[0].body.thinking).toEqual({type:'disabled'});expect(requests[0].body.output_config).toBeUndefined()
 expect(requests[0].body.tool_choice).toEqual({type:'tool',name:'StructuredOutput'})
 expect(requests[0].body.model).toBe('deepseek-v4-pro');expect(requests[0].body.messages).toEqual([{role:'user',content:prompt}]);expect(requests[0].body.tools).toEqual([{name:'StructuredOutput',input_schema:schema}])
 expect(requests[0].key).toBe('synthetic-key')
})

it('terminates a silent CLI and its closed-pipe descendant when the owning host is killed', async () => {
  const { input } = await setup(), bundle = join(input.cwd, 'owner.mjs')
  await build({ entryPoints: [resolve('tests/fixtures/claude-owner.ts')], outfile: bundle, bundle: true, platform: 'node', format: 'esm', target: 'node22' })
  const owner = spawn(process.execPath, [bundle, input.program.executable, input.cwd], { stdio: 'ignore' })
  let descendants: number[] = []
  cleanups.push(async () => {
    if (owner.exitCode === null && owner.signalCode === null) { owner.kill('SIGKILL'); await once(owner, 'close') }
    for (const pid of descendants) if (alive(pid)) process.kill(pid, 'SIGKILL')
  })
  await expect.poll(async () => readFile(join(input.cwd, 'silent-child.pid'), 'utf8').catch(() => ''), { timeout: 5000 }).not.toBe('')
  const launched = JSON.parse(await readFile(join(input.cwd, 'launched.json'), 'utf8'))
  descendants = [launched.parentPid, launched.pid, Number(await readFile(join(input.cwd, 'silent-child.pid'), 'utf8'))]
  expect(new Set(descendants).size).toBe(3); expect(descendants.every(alive)).toBe(true)
  const stopped = once(owner, 'close'); owner.kill('SIGKILL'); await stopped
  await expect.poll(() => descendants.filter(alive), { timeout: 3000 }).toEqual([])
})

it('distinguishes a silent external stream timeout from a host callback failure without retaining private data', async () => {
  const { input } = await setup(), observations: ClaudePhaseDiagnostic[] = []
  await expect(runClaudeNoTools({ ...input, prompt: 'stream-then-hang', timeoutMs: 500,
    onDiagnostic: value => { observations.push(value) } })).rejects.toThrow('超时')
  expect(observations).toHaveLength(1)
  expect(observations[0]).toMatchObject({ outcome: 'failed', stage: 'event_wait', lastEvent: { type: 'message_start' },
    eventCounts: { init: 1, message_start: 1 }, transport: { receivedLines: 2, handledLines: 2, stoppedBecause: 'timeout', callbackActiveAtStop: false, pendingAtStop: 0, processGroupExited: true } })
  expect(observations[0].lastEvent!.afterMs).toBeLessThan(500)
  const reason = new Error('private-secret-callback'), failures: ClaudePhaseDiagnostic[] = []
  await expect(runClaudeNoTools({ ...input, prompt: 'valid', onDelta: async () => { throw reason },
    onDiagnostic: value => { failures.push(value) } })).rejects.toBe(reason)
  expect(failures[0]).toMatchObject({ outcome: 'failed', transport: { stoppedBecause: 'callback', callbackActiveAtStop: true, processGroupExited: true } })
  expect(JSON.stringify([...observations, ...failures])).not.toMatch(/private-secret|synthetic-key|private reasoning|公开答复|held-model/)
})

it('does not change or retry a completed phase when the diagnostic observer fails', async () => {
  const { input } = await setup(), observed = vi.fn(async (_value: ClaudePhaseDiagnostic) => { throw new Error('private-observer') })
  expect((await runClaudeNoTools({ ...input, prompt: 'valid', onDiagnostic: observed })).text).toBe('公开答复')
  expect(observed).toHaveBeenCalledTimes(1)
  expect(observed.mock.calls[0][0]).toMatchObject({ outcome: 'completed', stage: 'returned',
    eventCounts: { init: 1, content_block_delta: 2, assistant: 1, result: 1 }, transport: { receivedLines: 5, handledLines: 5, processGroupExited: true, exitCode: 0 } })
  expect(observed.mock.calls[0][0].contentBlockDeltaCounts).toEqual({ text_delta: 1, thinking_delta: 1, input_json_delta: 0, other: 0 })
})

it('records queued but unhandled terminal events when timeout occurs inside a host callback', async () => {
  const { input } = await setup(), observations: ClaudePhaseDiagnostic[] = []
  await expect(runClaudeNoTools({ ...input, prompt: 'valid', timeoutMs: 500,
    onDelta: () => new Promise<void>(done => setTimeout(done, 800)), onDiagnostic: value => { observations.push(value) } })).rejects.toThrow('超时')
  expect(observations[0]).toMatchObject({ outcome: 'failed', stage: 'event_wait',
    transport: { receivedLines: 5, handledLines: 3, stoppedBecause: 'timeout', callbackActiveAtStop: true, pendingAtStop: 3, processGroupExited: true } })
  expect(observations[0].eventCounts.result).toBeUndefined()
  expect(alive(JSON.parse(await readFile(join(input.cwd, 'launched.json'), 'utf8')).pid)).toBe(false)
})

it('does not classify a queued block start or terminal event while an earlier callback owns the original deadline', async () => {
  const { input } = await setup(), observations: ClaudePhaseDiagnostic[] = []
  await expect(runClaudeNoTools({ ...input, prompt: 'diagnostic-queued-categories', timeoutMs: 500,
    onDelta: () => new Promise<void>(done => setTimeout(done, 800)), onDiagnostic: value => { observations.push(value) } })).rejects.toThrow('超时')
  expect(observations).toHaveLength(1)
  expect(observations[0]).toMatchObject({ outcome: 'failed', stage: 'event_wait',
    transport: { receivedLines: 6, handledLines: 3, stoppedBecause: 'timeout', callbackActiveAtStop: true, pendingAtStop: 4, processGroupExited: true } })
  expect(observations[0].contentBlockStartCounts).toEqual({ text: 0, thinking: 0, tool_use: 0, server_tool_use: 0, other: 0 })
  expect(observations[0].contentBlockDeltaCounts).toEqual({ text_delta: 1, thinking_delta: 1, input_json_delta: 0, other: 0 })
  expect(observations[0].eventCounts).toEqual({ init: 1, content_block_delta: 2 })
  expect(JSON.stringify(observations)).not.toContain('sk-private-queued-reasoning')
  const launched = JSON.parse(await readFile(join(input.cwd, 'launched.json'), 'utf8'))
  expect([launched.pid, launched.parentPid, -launched.parentPid].map(alive)).toEqual([false, false, false])
})

it.each(['valid', 'failed', 'missing', 'unknown', 'inconsistent'])('retains cumulative per-message usage on %s without accepting incomplete or contradictory completion', async mode => {
  const { input } = await setup(), receipts: ModelUsage[] = []
  const result = await runClaudeNoTools({ ...input, prompt: `usage-stream${mode === 'valid' ? '' : '-' + mode}`, onUsage: value => { receipts.push(value) } }).catch(error => error)
  expect(receipts).toEqual([
    { inputTokens: 18, outputTokens: 0, totalTokens: 18 },
    { inputTokens: 18, outputTokens: 7, totalTokens: 25 },
    { inputTokens: 23, outputTokens: 7, totalTokens: 30 },
    { inputTokens: 23, outputTokens: 9, totalTokens: 32 },
  ])
  if (mode === 'valid') expect(result.usage).toEqual(receipts.at(-1))
  else if (mode === 'unknown') expect(result.usage).toBeUndefined()
  else expect(result).toBeInstanceOf(Error)
  expect(alive(JSON.parse(await readFile(join(input.cwd, 'launched.json'), 'utf8')).pid)).toBe(false)
})

it('lets the original budget stop a live phase on known usage and waits for actual exit', async () => {
  const { input, controller } = await setup(), receipts: ModelUsage[] = [], reason = new Error('原预算已耗尽')
  await expect(runClaudeNoTools({ ...input, prompt: 'usage-stream-cancel', onUsage: value => {
    receipts.push(value); if (value.outputTokens === 7) controller.abort(reason)
  } })).rejects.toBe(reason)
  expect(receipts.at(-1)).toEqual({ inputTokens: 18, outputTokens: 7, totalTokens: 25 })
  expect(alive(JSON.parse(await readFile(join(input.cwd, 'launched.json'), 'utf8')).pid)).toBe(false)
})

it('rejects unverified effort and keeps low effort out of ordinary public chat', async () => {
  const { input } = await setup()
  await expect(runClaudeNoTools({ ...input, prompt: 'valid', effort: 'low' })).rejects.toThrow('低档配置')
  await expect(runClaudeNoTools({ ...input, prompt: 'valid', ephemeral: true, effort: 'low' })).rejects.toThrow('低档配置')
  await expect(runClaudeNoTools({ ...input, prompt: 'valid', ephemeral: true, outputSchema: {}, effort: 'high' as 'low' })).rejects.toThrow('低档配置')
  await expect(readFile(join(input.cwd, 'launched.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('sends image bytes as native content separately from text without echoing or persisting the image in launch evidence', async () => {
  const { input } = await setup(), deltas: string[] = []
  const result = await runClaudeNoTools({ ...input, prompt: 'valid', images: [`data:image/png;base64,${png}`], onDelta: text => { deltas.push(text) } })
  const launched = JSON.parse(await readFile(join(input.cwd, 'launched.json'), 'utf8'))
  expect(launched.args).toContain('stream-json')
  expect(launched.images).toEqual([{ mime: 'image/png', hash: createHash('sha256').update(Buffer.from(png, 'base64')).digest('hex') }])
  expect(JSON.stringify(launched)).not.toContain(png)
  expect(result.text).toBe('公开答复'); expect(deltas).toEqual(['公开答复'])
})

it.each([
  'https://example.com/image.png', '/private/image.png', 'data:image/svg+xml;base64,PHN2Zz4=',
  `data:image/jpeg;base64,${png}`, `data:image/png;base64,${png}\n`, 'data:image/png;base64,aGVsbG8=',
  'data:image/png;base64,', `data:image/bmp;base64,${png}`,
])('rejects invalid or unverified image input before launching: %s', async image => {
  const { input } = await setup()
  await expect(runClaudeNoTools({ ...input, prompt: 'valid', images: [image] })).rejects.toThrow('Claude')
  await expect(readFile(join(input.cwd, 'launched.json'))).rejects.toMatchObject({ code: 'ENOENT' })
})

it('keeps original attachment capacity while bounding aggregate historical images and text independently of output events', () => {
  const bytes = Buffer.alloc(MATERIAL_LIMITS.attachmentBytes); Buffer.from(png, 'base64').copy(bytes)
  const full = `data:image/png;base64,${bytes.toString('base64')}`
  expect(claudeInput('original request', [full, full, full]).format).toBe('stream-json')
  expect(() => claudeInput('original request', [full, full, full, full])).toThrow(/总量/)
  expect(() => claudeInput('original request', [`data:image/png;base64,${Buffer.concat([bytes, Buffer.from([0])]).toString('base64')}`])).toThrow('20MiB')
  expect(() => claudeInput('x'.repeat(2 * 1024 * 1024 + 1))).toThrow('2MiB')
  expect(() => claudeInput('x'.repeat(2 * 1024 * 1024 + 1), [`data:image/png;base64,${png}`])).toThrow('2MiB')
  expect(claudeInput('verbatim\nrequest')).toEqual({ format: 'text', stdin: 'verbatim\nrequest' })
})

it('returns only public text and final per-request usage, with explicit provider credentials and no inherited secrets', async () => {
  vi.stubEnv('BOAI_SECRET_SENTINEL', 'private'); vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'private-subscription')
  const {input} = await setup(), deltas: string[] = []
  const result = await runClaudeNoTools({...input,prompt:'valid',onDelta: text => { deltas.push(text) }})
  expect(deltas).toEqual(['公开答复'])
  expect(result).toMatchObject({text:'公开答复',usage:{inputTokens:18,outputTokens:2,totalTokens:20}})
  const launched=JSON.parse(await readFile(join(input.cwd,'launched.json'),'utf8'))
  expect(launched.inheritedSecret).toBe(false)
  expect(launched.args.join(' ')).not.toContain(input.apiKey)
  expect(alive(launched.pid)).toBe(false)
})

it.each(['tools','foreign','tool-event','truncated','oversize','missing','failed','duplicate','nonzero'])('rejects %s without treating process exit or partial output as completion', async mode => {
  const {input} = await setup(), observations: ClaudePhaseDiagnostic[] = []
  await expect(runClaudeNoTools({...input,prompt:mode,onDiagnostic:value=>{observations.push(value)}})).rejects.toThrow(mode==='oversize'?'2MiB':/Claude/)
  const {pid}=JSON.parse(await readFile(join(input.cwd,'launched.json'),'utf8'))
  expect(alive(pid)).toBe(false)
  if (mode === 'oversize') {
    expect(observations[0].transport).toMatchObject({ stoppedBecause: 'line-limit', stderrBytes: 0, processGroupExited: true })
    expect(observations[0].transport!.stdoutBytes).toBeGreaterThan(2 * 1024 * 1024)
  }
})

it('does not forward provider error text or raw stderr into host errors', async () => {
  const {input}=await setup()
  const error = await runClaudeNoTools({...input,prompt:'stderr'}).catch(e=>e)
  expect(error).toBeInstanceOf(Error); expect(error.message).not.toContain('sk-synthetic-private-error')
})
it('preserves missing usage as unknown', async () => {
  const {input}=await setup()
  expect((await runClaudeNoTools({...input,prompt:'unknown-usage'})).usage).toBeUndefined()
})
it('rejects changed binaries before sending input and does not silently create a fresh session for an invalid resume', async () => {
  const {input}=await setup()
  await expect(runClaudeNoTools({...input,prompt:'valid',sessionId:'invalid'})).rejects.toThrow('续用参数')
  await writeFile(input.program.executable, '\n', {flag:'a'})
  await expect(runClaudeNoTools({...input,prompt:'valid'})).rejects.toThrow('程序已变化')
  await expect(readFile(join(input.cwd,'launched.json'))).rejects.toMatchObject({code:'ENOENT'})
})
it('waits for host event callbacks and preserves the original callback failure', async () => {
  const {input}=await setup(), reason=new Error('原消息事务失败')
  await expect(runClaudeNoTools({...input,prompt:'valid',onDelta: async()=>{throw reason}})).rejects.toBe(reason)
})
it.skipIf(process.platform==='win32').each(['cancel','timeout'] as const)('retains execution until parent and child have exited on %s',async mode=>{
  const {input,controller}=await setup(), reason=new Error('原轮次已停止')
  const running=runClaudeNoTools({...input,prompt:'hang-child',timeoutMs:mode==='timeout'?500:5000}).catch(e=>e)
  await expect.poll(()=>readFile(join(input.cwd,'child.pid'),'utf8').catch(()=>''),{timeout:3000}).toMatch(/^\d+$/)
  const childPid=Number(await readFile(join(input.cwd,'child.pid'),'utf8'))
  const {pid}=JSON.parse(await readFile(join(input.cwd,'launched.json'),'utf8'))
  if(mode==='cancel') controller.abort(reason)
  const error=await running
  if(mode==='cancel') expect(error).toBe(reason); else expect(error.message).toContain('超时')
  expect(alive(pid)).toBe(false);expect(alive(childPid)).toBe(false);expect(alive(-pid)).toBe(false)
})
it.skipIf(process.platform==='win32')('does not release a successful phase while a pipe-free descendant is still alive',async()=>{
  const {input}=await setup(), realKill=process.kill.bind(process)
  let hold=true, requestedGroup:number|undefined, settled=false
  vi.spyOn(process,'kill').mockImplementation((pid,signal)=>{
    if(pid<0 && signal==='SIGKILL' && hold){requestedGroup=pid;return true}
    return realKill(pid,signal)
  })
  const running=runClaudeNoTools({...input,prompt:'success-child'}).finally(()=>{settled=true})
  try {
    await expect.poll(()=>requestedGroup).toBeDefined()
    const childPid=Number(await readFile(join(input.cwd,'child.pid'),'utf8'))
    expect(alive(childPid)).toBe(true);expect(settled).toBe(false)
    hold=false;realKill(requestedGroup!,'SIGKILL')
    expect((await running).text).toBe('公开答复');expect(alive(childPid)).toBe(false)
  } finally {hold=false;if(requestedGroup&&alive(requestedGroup))realKill(requestedGroup,'SIGKILL');await running.catch(()=>undefined)}
})
