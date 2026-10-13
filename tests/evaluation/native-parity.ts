/*
 * [OUTPUT]: v2四轮重复及Claude原生长命令/停止/重启探针；真实任务与传输生命周期探针分开，协议和产品架构保持。
 * [INPUT]: 相同真实任务、实际CLI与BOAI原生会话、明确权限和共享外部调用预算。
 * [OUTPUT]: 两种入口的独立原件/公开输出/检查；每次失败和未执行保留，不把CLI文件冒充BOAI成果。
 * [POS]: 本机接入对照评估合同；Electron流程在既有BDD，直接CLI不经过生产协议解析器。
 * [PROTOCOL]: 变化同步Header和tests/evaluation/.folder.md。
 */
import { randomUUID, createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { StringDecoder } from 'node:string_decoder'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { nativeProcessGuard } from '../../src/runtime/adapters/native-process-guard'
import { EvaluationBudget } from './budget'
import type { NativeAction } from '../../src/shared/domain/execution'

/** Durable action records include requests too short-lived for the UI polling interval. */
export function nativeInputCoverage(actions: NativeAction[]) {
  const inputs = actions.filter(action => action.kind === 'input')
  return {
    ids: inputs.map(action => action.id),
    pending: inputs.filter(action => action.status === 'pending').length,
    interrupted: inputs.filter(action => action.status === 'interrupted').length,
    accepted: inputs.filter(action => action.status === 'answered' && action.delivery === 'accepted').length,
    submitted: inputs.filter(action => action.status === 'answered' && action.delivery === 'submitted').length,
    unknown: inputs.filter(action => action.status === 'answered' && action.delivery !== 'accepted' && action.delivery !== 'submitted').length,
    coverage: inputs.length ? 'triggered; see durable action status and delivery' : 'not triggered; ordinary clarification only',
  }
}

export type ParityRuntime = 'codex' | 'claude'
export type ParityTask = 'orders' | 'code' | 'inputs'
export const PARITY_VERSION = 'native-entry-parity-v2'
/** A transport/lifecycle probe, deliberately separate from task quality scoring. */
export const STREAM_STABILITY = {
  version: 'claude-stream-stability-v1',
  durationMs: 310_000,
  scriptName: 'stream-stability.mjs',
  script: `import {openSync,writeSync,closeSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';
const mode=process.argv[2];if(!['complete','interrupt'].includes(mode))throw Error('invalid mode');
const duration=mode==='complete'?310000:90000,startedAt=Date.now(),fd=openSync(mode+'.jsonl','wx');
const record=kind=>{const row={kind,mode,pid:process.pid,startedAt,elapsedMs:Date.now()-startedAt};writeSync(fd,JSON.stringify(row)+'\\n');console.log(JSON.stringify(row))};
record('started');while(Date.now()-startedAt<duration){await delay(Math.min(1000,duration-(Date.now()-startedAt)));record('tick')}
record('completed');closeSync(fd);
`,
  prompts: [
    '这是原生命令持续执行检查。当前工作目录已有 stream-stability.mjs。请用原生 Bash 工具精确执行 node stream-stability.mjs complete，只执行一次，不修改脚本。此命令约310秒，请等待实际退出；如果工具返回后台任务，继续用原生任务等待工具等待。完成后读取 complete.jsonl，回复 STREAM_COMPLETE、实际 elapsedMs 和记录行数。不调用 publish_artifact 或其他 BOAI 业务工具，不发布文件。只操作当前工作目录，不读配置凭据，不访问网络。',
    '继续检查用户停止。精确执行 node stream-stability.mjs interrupt，只执行一次，不修改脚本。正常需90秒，期间持续等待，我会从BOAI停止此次运行。不要提前宣称完成，不发布文件，不操作其他目录或网络。',
    '应用已重启，刚才的命令由我停止。只用原生 Read 工具读取已有 complete.jsonl 和 interrupt.jsonl，回复 STREAM_READ_ONLY，并分别说明是否有 completed 记录。不执行命令、不修改脚本或日志、不继续或重新运行原任务、不发布文件。',
  ],
} as const
export const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
export interface ParityCheck { name: string; passed: boolean; actual?: unknown }
export interface ParityCase {
  id: ParityTask; marker: string; files: Record<string, string>; binaryFiles?: Record<string, string>; inputFiles?: string[]; attachments?: string[][]; prompts: string[]
  outputs: string[]; frozen: string[]
}
export interface DirectTurn {
  invocationId: string; startedAt: string; elapsedMs: number; exitCode: number | null; signal: string | null
  sessionId?: string; output: string; events: unknown[]; usage: unknown[]; error?: string
}

/** Tool facts come from execution records, never agent text containing a command. */
export function nativeToolChecks(events: any[], round: number): ParityCheck[] {
  const commands: { command: string; succeeded: boolean }[] = [], writes: string[] = [], calls = new Map<string, any>()
  for (const event of events) {
    const item = event.payload?.item ?? event.item
    if (item && (item.type === 'commandExecution' || item.type === 'command_execution' || item.name === 'Bash')) commands.push({ command: String(item.command ?? item.input?.command ?? item.arguments?.command ?? ''), succeeded: event.canonical?.outcome === 'succeeded' || item.exit_code === 0 })
    if (item && (item.type === 'fileChange' || ['Write','Edit','NotebookEdit'].includes(item.name))) writes.push(item.name ?? item.type)
    for (const block of event.message?.content ?? []) {
      if (block.type === 'tool_use') { calls.set(block.id, block); if (['Write','Edit','NotebookEdit'].includes(block.name)) writes.push(block.name) }
      if (block.type === 'tool_result') { const call = calls.get(block.tool_use_id); if (call?.name === 'Bash') commands.push({ command: String(call.input?.command ?? ''), succeeded: block.is_error !== true && event.tool_use_result?.is_error !== true }) }
    }
  }
  const verifier = commands.filter(call => /\bnode\s+verify\.mjs\b/.test(call.command))
  return [1,3].includes(round) ? [{ name: 'actual-native-verifier-execution', passed: verifier.some(call => call.succeeded), actual: verifier }] : [{ name: 'no-native-write-or-verifier-rerun', passed: !writes.length && !verifier.length, actual: { writes, verifier } }]
}

export function parityCase(id: ParityTask, marker: string): ParityCase {
  if (id === 'inputs') return {
    id, marker,
    files: {
      'project.md': `# 输入交付任务\nmarker=${marker}\nfactor=7\nproject=云杉资料\n`,
      'payload.json': JSON.stringify({ values: [19, 23, 31], read_token: 'INITIAL_SOURCE_731' }),
      'correction.json': JSON.stringify({ values: [17, 29, 41], read_token: 'CORRECTED_SOURCE_913' }),
      'one.png': '',
      'verify.mjs': `import {readFileSync,writeFileSync} from 'node:fs';\nimport {createHash} from 'node:crypto';\nconst input=JSON.parse(readFileSync('input-paths.json','utf8'));\nconst md=readFileSync(input.markdown,'utf8'),data=JSON.parse(readFileSync(input.json,'utf8')),image=readFileSync(input.image);\nconst marker=md.match(/^marker=(.+)$/m)[1],factor=input.factor??Number(md.match(/^factor=(.+)$/m)[1]);\nif(marker!==${JSON.stringify(marker)}||!Number.isSafeInteger(factor)||factor<1||!Array.isArray(data.values))throw Error('invalid inputs');\nconst result={marker,project:md.match(/^project=(.+)$/m)[1],factor,net_cents:data.values.reduce((a,b)=>a+b,0)*factor,read_token:data.read_token,image_sha256:createHash('sha256').update(image).digest('hex')};\nwriteFileSync('delivery.json',JSON.stringify(result));console.log('VERIFIED '+JSON.stringify(result));\n`,
    },
    binaryFiles: { 'one.png': 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNwmHAAAAKkAZGL4t77AAAAAElFTkSuQmCC' },
    inputFiles: ['project.md', 'payload.json', 'correction.json', 'one.png'], attachments: [['project.md','payload.json','one.png'],[],['correction.json'],[]],
    prompts: [
      '处理提供的 project.md、payload.json 和 one.png。聊天附件直接使用所提供的 nativePath，不另写文件代替输入；没有聊天附件时读取当前目录同名文件。将实际输入路径写入 input-paths.json，字段 markdown、json、image；用原生命令实际运行 node verify.mjs，不改校验脚本或输入原件。脚本实际读取三份文件并生成 delivery.json；回复 marker、net_cents、read_token 和图片字节hash。如果有 publish_artifact，将 delivery.json 发布为真实附件。只操作当前工作目录和本次明确提供的输入文件，不读配置/凭据、无关目录，不调用网络。图片只核验字节交付，不宣称视觉理解。',
      '接着这个任务，需要我提供新的倍率。请问“新的倍率是多少？”。当前模式有原生用户提问工具时可以使用；没有就普通回复提问并结束本轮。在收到下一条回答前只提问、不运行命令或修改/发布文件；收到回答后按新倍率和那条消息提供的新JSON更新 delivery.json。',
      '新的倍率是9。使用本条提供的 correction.json 替换JSON输入；没有聊天附件时读取当前目录同名文件。原 Markdown、PNG 和所有原件保持不变。更新 input-paths.json 的 json 路径和 factor=9，再实际运行 node verify.mjs，更新 delivery.json，回复 marker、net_cents、read_token 和图片字节hash。如果有 publish_artifact，将新文件发布为原 delivery.json 的下一版本。只操作当前目录及明确输入路径。',
      '应用已重启。只读已有 delivery.json，回复 marker、net_cents、read_token 和图片字节hash；不重跑校验、不修改、不重新发布任何文件。明确这是读取已有结果。',
    ], outputs: ['delivery.json','input-paths.json'], frozen: ['project.md','payload.json','correction.json','one.png','verify.mjs'],
  }
  const delivery = '如果当前环境提供 publish_artifact，请把 result.json 发布为真实附件；没有此工具则保留实际文件。只操作当前工作目录，不读取其他目录、配置或凭据，不调用网络或无关MCP工具。'
  if (id === 'orders') return {
    id, marker,
    files: {
      'orders.csv': 'id,status,amount_cents\nA,paid,10000\nB,refunded,2500\nC,pending,3000\nD,paid,5000\n',
      'verify.mjs': `import {readFileSync,writeFileSync} from 'node:fs';\nconst value=JSON.parse(readFileSync('result.json','utf8'));\nconst expected=process.argv[2]==='corrected'?12000:12500;\nif(value.net_cents!==expected||value.paid_cents!==15000||value.marker!==${JSON.stringify(marker)})throw Error('wrong result');\nwriteFileSync('verification.json',JSON.stringify({ok:true,net_cents:value.net_cents,marker:value.marker}));\nconsole.log('VERIFIED '+value.marker+' '+value.net_cents);\n`,
    },
    prompts: [
      `读取当前目录 orders.csv，按 paid 收入减 refunded 支出计算净额，pending 排除；金额均为整数分。创建 result.json，包含 paid_cents、net_cents、marker（${marker}）。用原生命令工具实际运行 node verify.mjs，不修改CSV或校验脚本；最后回复验证标记和净额。${delivery}`,
      `接着上一轮，将B退款金额按用户更正改为3000分，原 orders.csv 保持不变。更新 result.json，用原生命令工具实际运行 node verify.mjs corrected；回复验证标记和更正后的净额。${delivery}`,
    ], outputs: ['result.json', 'verification.json'], frozen: ['orders.csv', 'verify.mjs'],
  }
  return {
    id, marker,
    files: {
      'settlement.mjs': `export function settle(rows){return rows.filter(row=>row.status==='paid'||row.status==='refunded').reduce((sum,row)=>sum+row.amount_cents,0)}\n`,
      'verify.mjs': `import {settle} from './settlement.mjs';\nimport {writeFileSync} from 'node:fs';\nconst rows=[{status:'paid',amount_cents:10000},{status:'paid',amount_cents:2500},{status:'refunded',amount_cents:1000},{status:'pending',amount_cents:7000}];\nconst net=settle(rows);if(net!==11500||settle([])!==0)throw Error('wrong settlement '+net);\nconst value={ok:true,net_cents:net,marker:${JSON.stringify(marker)}};\nwriteFileSync('result.json',JSON.stringify(value));console.log('VERIFIED '+value.marker+' '+net);\n`,
    },
    prompts: [
      `修复当前目录 settlement.mjs：paid计收入、refunded计负值、pending忽略、空数组返回0。不得修改 verify.mjs，用原生命令工具实际运行 node verify.mjs，只有实际测试通过才报告通过，回复验证标记 ${marker} 和结果。${delivery}`,
      `只读上一轮的 settlement.mjs 和 result.json，不修改或重新发布任何文件，不重新执行测试。回复验证标记 ${marker}、净额以及退款如何计算，区分读取已有测试结果与重新测试。只操作当前目录。`,
    ], outputs: ['result.json', 'settlement.mjs'], frozen: ['verify.mjs'],
  }
}

export async function seedParity(directory: string, scenario: ParityCase) {
  await mkdir(directory, { recursive: true })
  for (const [name, content] of Object.entries(scenario.files)) await writeFile(join(directory, name), scenario.binaryFiles?.[name] ? Buffer.from(scenario.binaryFiles[name],'base64') : content, { flag: 'wx' })
}
export async function captureParity(directory: string, scenario: ParityCase, inputRoot = directory) {
  const files: Record<string, { sha256?: string; content?: string; error?: string }> = {}
  for (const name of new Set([...scenario.outputs, ...scenario.frozen])) {
    try { const bytes = await readFile(join(scenario.inputFiles?.includes(name) ? inputRoot : directory, name)); files[name] = { sha256: sha(bytes), content: scenario.binaryFiles?.[name] ? undefined : bytes.toString('utf8') } }
    catch (error) { files[name] = { error: String(error) } }
  }
  return files
}
export function checkParity(scenario: ParityCase, round: number, files: Awaited<ReturnType<typeof captureParity>>, output: string, previous?: Awaited<ReturnType<typeof captureParity>>): ParityCheck[] {
  if (scenario.id === 'inputs') {
    let result: any; try { result=JSON.parse(files['delivery.json']?.content??'') } catch { /* Missing real result fails. */ }
    const expected=round<3?511:783,token=round<3?'INITIAL_SOURCE_731':'CORRECTED_SOURCE_913'
    return [
      {name:'actual-delivery-from-input-bytes',passed:result?.marker===scenario.marker&&result?.net_cents===expected&&result?.read_token===token&&result?.image_sha256===sha(Buffer.from(scenario.binaryFiles!['one.png'],'base64')),actual:result},
      {name:'public-response',passed:round===2?output.includes('倍率'):output.includes(scenario.marker)&&output.includes(String(expected))&&output.includes(token),actual:output},
      ...scenario.frozen.map(name=>({name:'frozen:'+name,passed:files[name]?.sha256===sha(scenario.binaryFiles?.[name]?Buffer.from(scenario.binaryFiles[name],'base64'):scenario.files[name])})),
      ...([2,4].includes(round)?scenario.outputs.map(name=>({name:'readonly:'+name,passed:!!previous?.[name]?.sha256&&files[name]?.sha256===previous[name].sha256})):[]),
    ]
  }
  const result = (() => { try { return JSON.parse(files['result.json']?.content ?? '') } catch { return undefined } })()
  const expected = scenario.id === 'code' ? 11500 : round === 1 ? 12500 : 12000
  const checks: ParityCheck[] = [
    { name: 'actual-result-json', passed: !!result && result.net_cents === expected && result.marker === scenario.marker, actual: result },
    { name: 'public-output-marker-and-value', passed: output.includes(scenario.marker) && output.includes(String(expected)), actual: output },
    ...scenario.frozen.map(name => ({ name: 'frozen:' + name, passed: files[name]?.sha256 === sha(scenario.files[name]) })),
  ]
  if (scenario.id === 'orders') {
    let verified: any; try { verified = JSON.parse(files['verification.json']?.content ?? '') } catch { /* Missing evidence fails below. */ }
    checks.push({ name: 'native-command-witness', passed: verified?.ok === true && verified.net_cents === expected && verified.marker === scenario.marker, actual: verified })
  } else {
    checks.push({ name: 'code-actually-changed', passed: !!files['settlement.mjs']?.sha256 && files['settlement.mjs'].sha256 !== sha(scenario.files['settlement.mjs']) })
    if (round === 2) checks.push(...scenario.outputs.map(name => ({ name: 'readonly:' + name, passed: !!previous?.[name]?.sha256 && files[name]?.sha256 === previous[name].sha256 })))
  }
  return checks
}

/** Drop private reasoning before retaining direct CLI frames; preserve public tool arguments/results. */
export function publicCliFrame(value: any): unknown | undefined {
  if (value?.item?.type === 'reasoning') return undefined
  if (value?.type === 'stream_event' && /thinking|signature/.test(String(value.event?.delta?.type ?? value.event?.content_block?.type))) return undefined
  if (value?.message?.content && Array.isArray(value.message.content)) return { ...value, message: { ...value.message, content: value.message.content.filter((block: any) => !['thinking', 'redacted_thinking'].includes(block.type)) } }
  return value
}
export async function directCliTurn(input: {
  runtime: ParityRuntime; executable: string; model?: string; cwd: string; prompt: string; sessionId?: string; budgetFile: string; maxTurns: number; timeoutMs: number
}): Promise<DirectTurn> {
  await new EvaluationBudget(input.budgetFile, input.maxTurns).reserve('direct-' + input.runtime)
  const invocationId = randomUUID(), startedAt = new Date().toISOString(), events: any[] = [], usage: unknown[] = []
  let output = '', sessionId = input.sessionId, fault: string | undefined, buffer = '', stderr = ''
  const env = { ...process.env }; delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT
  const args = input.runtime === 'codex'
    ? ['--no-daemon', '-a', 'on-request', '-c', 'sandbox_mode="workspace-write"', '-c', 'features.respect_system_proxy=true', 'exec', ...(sessionId ? ['resume', sessionId] : []), '--json', '--skip-git-repo-check', ...(input.model ? ['--model', input.model] : []), '-']
    : ['--print', '--input-format', 'text', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--allowedTools', 'Bash(node verify.mjs)', 'Bash(node verify.mjs corrected)', ...(sessionId ? ['--resume', sessionId] : []), ...(input.model ? ['--model', input.model] : [])]
  const cli = input.executable.endsWith('.js') ? process.execPath : input.executable
  const cliArgs = input.executable.endsWith('.js') ? [input.executable, ...args] : args
  const child = spawn(nativeProcessGuard(), ['--ledger', join(input.cwd, '.parity-owned'), cli, ...cliArgs], { cwd: input.cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
  const secrets = Object.entries(env).filter(([key, value]) => /API_KEY|AUTH_TOKEN/.test(key) && value && value.length > 8).map(([, value]) => value!)
  const redact = (text: string) => secrets.reduce((text, secret) => text.replaceAll(secret, '[REDACTED]'), text)
  const line = (text: string) => {
    if (!text.trim()) return
    try {
      const raw = JSON.parse(redact(text)), frame: any = publicCliFrame(raw)
      if (!frame) return
      events.push(frame)
      if (input.runtime === 'codex') {
        if (frame.type === 'thread.started') sessionId = frame.thread_id
        if (frame.type === 'item.completed' && frame.item?.type === 'agent_message') output = frame.item.text ?? ''
        if (frame.type === 'turn.completed') usage.push(frame.usage)
        if (frame.type === 'turn.failed' || frame.type === 'error') fault = frame.error?.message ?? frame.message ?? 'Native CLI failure'
      } else {
        if (frame.type === 'system' && frame.subtype === 'init') sessionId = frame.session_id
        if (frame.type === 'result') { output = frame.result ?? ''; usage.push({ usage: frame.usage, modelUsage: frame.modelUsage, total_cost_usd: frame.total_cost_usd }); if (frame.is_error) fault = frame.errors?.join('\n') ?? String(frame.subtype) }
      }
    } catch { fault ??= 'Native CLI returned a non-JSON stdout frame'; events.push({ unparsedPublicLine: redact(text) }) }
  }
  const decoder = new StringDecoder('utf8')
  child.stdout.on('data', chunk => { buffer += decoder.write(chunk); let index: number; while ((index = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0, index)); buffer = buffer.slice(index + 1) } })
  child.stderr.on('data', chunk => { if (stderr.length < 100000) stderr += chunk.toString() })
  child.stdin.on('error', error => { fault ??= String(error) })
  child.stdin.end(input.prompt)
  const timeout = setTimeout(() => { fault = 'Native CLI observation timeout'; child.kill('SIGTERM') }, input.timeoutMs)
  let exitCode: number | null = null, signal: string | null = null
  try {
    await new Promise<void>((done, reject) => { child.once('error', reject); child.once('exit', (code, killed) => { exitCode = code; signal = killed; done() }) })
    // The guard has waited for owned descendants; drain its public pipes as well.
    if (child.stdout.readable || child.stderr.readable) await new Promise<void>(done => { if (child.stdout.destroyed && child.stderr.destroyed) done(); else { child.once('close', done); setTimeout(done, 1000).unref() } })
  } catch (error) { fault = String(error) } finally { clearTimeout(timeout) }
  buffer += decoder.end()
  if (buffer.trim()) line(buffer)
  if (exitCode !== 0) fault ??= 'Native CLI exit ' + exitCode + ': ' + redact(stderr).slice(-3000)
  return { invocationId, startedAt, elapsedMs: Date.now() - Date.parse(startedAt), exitCode, signal, sessionId, output, events, usage, ...(fault ? { error: fault } : {}) }
}
