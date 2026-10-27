/*
 * [INPUT]: Explicit native programs, inherited native login/config and a fresh evidence root.
 * [OUTPUT]: Bounded real CLI/production-adapter capability pairs; public events, files, failures and untested UI boundaries.
 * [POS]: NP01-NP09 diagnostic companion to evaluate-native-parity.mjs; no mock provider or second execution loop.
 * [PROTOCOL]: Update scripts/.folder.md and spec/28 actual progress when changing this probe.
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, open, realpath } from 'node:fs/promises'
import { resolve, join, dirname } from 'node:path'
import { randomUUID, createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { StringDecoder } from 'node:string_decoder'
import { buildWorkspace } from './workspace-packages.mjs'
import buildProcessGuard from './build-process-guard.mjs'

const args = process.argv.slice(2), option = name => args[args.indexOf(name) + 1]
if (args.includes('--help')) {
  console.log('node scripts/evaluate-native-capabilities.mjs --root NEW_DIR --codex FILE --claude FILE [--real] [--runtime codex|claude] [--reuse-direct-root OLD_DIR]\nWithout --real: prepare fixtures/plan only. With --real: at most 16 external user turns, zero retries; real AppService/SQLite and native CLI. UI is not tested. Reuse validates native programs and identical prompts, retains the original summary hash and never reruns direct baselines. Both entries explicitly select full-access for isolated fixture tools; native config/login/model otherwise inherited.')
  process.exit(0)
}
if (!args.includes('--root') || !args.includes('--codex') || !args.includes('--claude')) throw Error('Explicit root and both native program paths required')
const root = resolve(option('--root')), source = process.cwd(), sha = value => createHash('sha256').update(value).digest('hex')
const reuseRoot = args.includes('--reuse-direct-root') ? resolve(option('--reuse-direct-root')) : undefined
const reused = reuseRoot ? JSON.parse(await readFile(join(reuseRoot, 'plan.json'), 'utf8')) : undefined
await mkdir(root, { recursive: false })
const save = (file, value) => writeFile(join(root, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
const programs = {}
for (const runtime of ['codex', 'claude']) {
  const executable = await realpath(resolve(option('--' + runtime)))
  programs[runtime] = { executable, sha256: sha(await readFile(executable)), version: execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim() }
}
const runtimes = args.includes('--runtime') ? [option('--runtime')] : ['codex', 'claude']
if (runtimes.some(runtime => !programs[runtime])) throw Error('Unknown runtime')
if (reused && (runtimes.some(runtime => !reused.runtimes.includes(runtime)) || runtimes.some(runtime => programs[runtime].sha256 !== reused.programs[runtime].sha256))) throw Error('Reused direct baseline has different programs/runtime')
const marker = reused ? reused.prompts[0].match(/SESSION-([a-f0-9-]{36})/)[1] : randomUUID(), seed = { project: 'PROJECT-' + marker, skill: 'SKILL-' + marker, mcp: 'MCP-' + marker, child: 'CHILD-' + marker }
const first = '这是隔离的原生能力对照。只操作当前目录，不读取配置或凭据，不访问远程网络。依次完成：1 读取 AGENTS.md 或 CLAUDE.md 和 project.txt，保留项目标记。2 显式加载 parity-native 技能（Codex: $parity-native；Claude: Skill parity-native），按技能运行脚本。3 调用原生 MCP parity_probe 的 probe 工具，参数 value=17，不用 shell 模拟 MCP；保存返回值到 mcp.json。4 启动恰好一个原生子 Agent，让它只读 child-input.txt 并把原文写入 child.json，然后等待它完成；主 Agent 不代读，不用 BOAI 员工或普通 shell 假装子 Agent。原生子 Agent 工具不可用时明确说明并跳过。5 用原生命令运行 node verify.mjs，将输出原样包含在最终回复中。记住会话暗号 SESSION-' + marker + '。不修改任何输入、配置或校验脚本。'
const prompts = [first,
  '只读上一轮的 result.json，回复完整结果和上一条消息中的会话暗号；不修改文件，不重跑任何校验，不再次调用 MCP 或子 Agent。',
  '用原生命令实际执行 node long.mjs，不用后台脱离方式运行。它会持续运行等待我取消；请勿自行终止或修改脚本。',
  '上一轮已被用户取消。只读 long-started.json 和已有 result.json，回复这些已有结果及最初的会话暗号。不重启 long.mjs，不修改文件、不重新执行任务。']
if (reused && JSON.stringify(prompts) !== JSON.stringify(reused.prompts)) throw Error('Reused direct task changed')
const plan = { version: 2, commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), runnerSha256: sha(await readFile(new URL(import.meta.url))), createdAt: new Date().toISOString(), programs, runtimes, prompts, maxExternalTurns: runtimes.length * (reused ? 4 : 8), retries: 0, timeoutMs: 150000, ...(reuseRoot ? { reuseDirectRoot: reuseRoot, reuseSummarySha256: sha(await readFile(join(reuseRoot, 'summary.json'))) } : {}), permissions: 'explicit full-access on both entries; inherited native login/model/config; project MCP/skill fixtures', boaiEntry: 'real AppService, native employee, SQLite session/execution persistence; renderer not tested', untested: ['native interactive approvals/questions', 'image understanding', 'mid-turn steer', 'desktop rendering', 'all installed plugin behavior', 'statistical reliability'] }
const fixtures = []
for (const runtime of runtimes) for (const entry of reused ? ['boai'] : ['direct', 'boai']) {
  const cwd = join(root, runtime, entry)
  const files = {
    'project.txt': seed.project,
    'AGENTS.md': '# Native parity fixture\nOnly operate on this fixture. Preserve inputs. Use the requested native capabilities; do not simulate them.\n',
    'CLAUDE.md': '# Native parity fixture\nOnly operate on this fixture. Preserve inputs. Use the requested native capabilities; do not simulate them.\n',
    'child-input.txt': seed.child,
    'skill.mjs': `import{writeFileSync}from'node:fs';writeFileSync('skill.json',JSON.stringify({marker:${JSON.stringify(seed.skill)},value:42}));console.log('SKILL_EXECUTED');`,
    'long.mjs': `import{writeFileSync}from'node:fs';writeFileSync('long-started.json',JSON.stringify({pid:process.pid,marker:${JSON.stringify(seed.project)}}));setInterval(()=>writeFileSync('heartbeat.txt',String(Date.now())),100);`,
    'verify.mjs': `import{readFileSync,writeFileSync}from'node:fs';const read=p=>readFileSync(p,'utf8');const result={project:read('project.txt'),skill:JSON.parse(read('skill.json')),mcp:JSON.parse(read('mcp.json')),child:read('child.json').trim()};writeFileSync('result.json',JSON.stringify(result));console.log('VERIFIED '+JSON.stringify(result));`,
    '.native/mcp.mjs': `import{createInterface}from'node:readline';import{appendFileSync}from'node:fs';const token=${JSON.stringify(seed.mcp)};for await(const line of createInterface({input:process.stdin})){const r=JSON.parse(line);if(r.id===undefined)continue;let result={};if(r.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'parity_probe',version:'1'}};if(r.method==='tools/list')result={tools:[{name:'probe',description:'Return the native parity token and double the integer value.',inputSchema:{type:'object',properties:{value:{type:'integer'}},required:['value'],additionalProperties:false}}]};if(r.method==='tools/call'){appendFileSync(new URL('./mcp-calls.jsonl',import.meta.url),JSON.stringify({name:r.params.name,arguments:r.params.arguments})+'\\n');result={content:[{type:'text',text:JSON.stringify({marker:token,value:r.params.arguments.value*2})}]}}process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n')}`,
  }
  const skill = `---\nname: parity-native\ndescription: Native parity fixture, invoked explicitly for capability verification.\n---\nRun node skill.mjs in the fixture working directory. It creates skill.json with the native skill receipt. Do not create the receipt yourself.\n`
  files['.agents/skills/parity-native/SKILL.md'] = skill
  files['.claude/skills/parity-native/SKILL.md'] = skill
  const command = process.execPath, mcp = join(cwd, '.native/mcp.mjs')
  files['.codex/config.toml'] = `[mcp_servers.parity_probe]\ncommand = ${JSON.stringify(command)}\nargs = [${JSON.stringify(mcp)}]\n`
  files['.mcp.json'] = JSON.stringify({ mcpServers: { parity_probe: { command, args: [mcp] } } })
  files['.claude/settings.local.json'] = JSON.stringify({ enableAllProjectMcpServers: true, hooks: { SessionStart: [{ hooks: [{ type: 'command', command: 'node -e \'require("fs").appendFileSync("hook-runs.txt","SessionStart\\n")\'' }] }] } })
  for (const [name, bytes] of Object.entries(files)) { await mkdir(dirname(join(cwd, name)), { recursive: true }); await writeFile(join(cwd, name), bytes, { flag: 'wx' }) }
  fixtures.push({ runtime, entry, cwd, inputHashes: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, sha(bytes)])) })
}
await save('plan.json', { ...plan, fixtures })
if (!args.includes('--real')) { console.log(JSON.stringify({ root, prepared: true, modelCalls: 0 })); process.exit(0) }
await open(join(root, '.run.lock'), 'wx').then(handle => handle.close())
await buildProcessGuard()
const compiled = join(root, 'adapter.mjs')
await buildWorkspace({ stdin: { contents: `export {AppService} from './packages/runtime/src/service';export {inspectProgram} from './packages/runtime/src/modules/backends/program';export {publicCliFrame} from './tests/evaluation/native-parity';export {EvaluationBudget} from './tests/evaluation/budget';`, resolveDir: source }, outfile: compiled, platform: 'node', format: 'esm', bundle: true, packages: 'external', target: 'node22', logLevel: 'silent' })
const api = await import(pathToFileURL(compiled).href), budget = new api.EvaluationBudget(join(root, 'budget.json'), plan.maxExternalTurns)
await save('build.json', { bundleSha256: sha(await readFile(compiled)), sourceCommit: plan.commit, sourceDiffSha256: sha(execFileSync('git', ['diff', 'HEAD', '--', 'packages'], { encoding: 'utf8' })), rendererTested: false })
const pause = ms => new Promise(done => setTimeout(done, ms))
async function bytes(path) { try { return await readFile(path, 'utf8') } catch (error) { if (error.code === 'ENOENT') return undefined; throw error } }
async function direct(f, prompt, sessionId, signal, record) {
  const executable = programs[f.runtime].executable, node = api.inspectProgram(executable, 500 * 1024 * 1024).runtime === 'node'
  const argv = f.runtime === 'codex'
    ? ['--no-daemon', '-c', 'features.respect_system_proxy=true', 'exec', ...(sessionId ? ['resume', sessionId] : []), '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox', '-']
    : ['--print', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'bypassPermissions', '--dangerously-skip-permissions', ...(sessionId ? ['--resume', sessionId] : [])]
  const env = { ...process.env }; delete env.CLAUDECODE; delete env.CLAUDE_CODE_ENTRYPOINT
  const child = spawn(join(source, 'dist/native/boai-process-guard'), ['--ledger', join(f.cwd, '.owned'), node ? process.execPath : executable, ...(node ? [executable] : []), ...argv], { cwd: f.cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
  const decoder = new StringDecoder('utf8'); let buffer = '', stderr = ''
  const line = value => {
    if (!value.trim()) return
    try {
      const frame = api.publicCliFrame(JSON.parse(value)); if (!frame) return
      record.events.push(frame)
      if (frame.type === 'thread.started') record.sessionId = frame.thread_id
      if (frame.session_id) record.sessionId = frame.session_id
      if (frame.type === 'item.completed' && frame.item?.type === 'agent_message') record.text = frame.item.text
      if (frame.type === 'result') { record.text = frame.result ?? ''; if (frame.is_error) record.error = frame.errors?.join('\n') ?? frame.subtype }
      if (frame.type === 'turn.failed' || frame.type === 'error') record.error = frame.error?.message ?? frame.message
    } catch { record.parseError = true }
  }
  child.stdout.on('data', chunk => { buffer += decoder.write(chunk); let index; while ((index = buffer.indexOf('\n')) >= 0) { line(buffer.slice(0, index)); buffer = buffer.slice(index + 1) } })
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000) })
  child.stdin.on('error', () => {})
  const abort = () => child.kill('SIGTERM'); signal.addEventListener('abort', abort, { once: true })
  try {
    child.stdin.end(prompt)
    record.exitCode = await new Promise((done, reject) => { child.once('error', reject); child.once('close', done) })
    buffer += decoder.end(); if (buffer.trim()) line(buffer)
    if (signal.aborted) throw signal.reason
    if (record.exitCode !== 0 || record.error) throw Error(record.error ?? 'CLI exit ' + record.exitCode + ': ' + stderr)
  } finally { signal.removeEventListener('abort', abort) }
}
const services = new Map()
async function boai(f, prompt, _sessionId, signal, record) {
  let state = services.get(f.cwd)
  if (!state) {
    const options = { dataPath: join(root, f.runtime, 'app-data'), engine: { run: async () => { throw Error('API engine must not be used') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} }
    const service = new api.AppService(options); await service.init()
    state = { service, options }; services.set(f.cwd, state)
    const draft = { name: 'Native parity', executable: programs[f.runtime].executable, args: [], protocol: f.runtime === 'codex' ? 'codex-app-server' : 'claude-cli', useExistingLogin: true, hostAccessAcknowledged: true }
    await service.handle('testLaunchProfileDraft', draft)
    const profile = await service.handle('saveLaunchProfile', draft)
    const agent = await service.handle('saveAgent', { name: '原生对照', role: '验收', instructions: '按用户消息使用原生能力执行，只操作用户指定的隔离目录。', color: '#00AABB', connectionId: '', modelId: '', executionBackend: { kind: f.runtime + '-local', profileId: profile.id }, executionPermission: 'full-access', skillIds: [], knowledgeIds: [], allowCommands: true, active: true })
    state.chat = await service.handle('createConversation', { kind: 'direct', title: 'Native parity', agentIds: [agent.id] })
  }
  const { service, chat } = state, requestId = randomUUID()
  const message = await service.handle('sendMessage', { conversationId: chat.id, content: prompt, mentionIds: [], requestId, workingDirectory: f.cwd })
  let cancel, cancelSent = false, detail, run
  const abort = () => { if (!cancelSent) { cancelSent = true; cancel = service.handle('cancelMessageExecution', { requestId }) } }
  signal.addEventListener('abort', abort, { once: true }); if (signal.aborted) abort()
  try {
    const deadline = Date.now() + plan.timeoutMs + 15000
    while (Date.now() < deadline) {
      detail = await service.handle('getConversation', { id: chat.id })
      const runs = detail.runs.filter(value => value.triggerMessageId === message.id)
      run = runs.at(-1)
      if (runs.length && runs.every(value => ['completed', 'failed', 'cancelled', 'interrupted'].includes(value.status))) break
      await pause(100)
    }
    if (!run || !['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)) throw Error('AppService did not reach a terminal state; no replay')
    record.run = run; record.sessionId = run.backend?.sessionId; record.receipts = [run.backend]
    record.text = detail.messages.filter(value => value.senderType === 'agent' && value.triggerMessageId === message.id || value.id === run.messageId).map(value => value.content).join('\n')
    let after
    do {
      const page = await service.handle('listExecutionEvidence', { conversationId: chat.id, runId: run.id, ...(after === undefined ? {} : { after }) })
      for (const event of page.items) if (event.eventType !== 'agent.reasoning.block') {
        if (event.deferred) {
          let offset = 0, text = ''
          do { const part = await service.handle('getExecutionContent', { conversationId: chat.id, runId: run.id, evidenceId: event.id, offset }); text += part.content; offset = part.next } while (offset !== undefined)
          Object.assign(event, JSON.parse(text))
        }
        record.events.push(event)
      }
      after = page.next
    } while (after !== undefined)
    if (signal.aborted) throw signal.reason
    if (run.status !== 'completed') throw Error(run.error ?? 'AppService ' + run.status)
  } finally { signal.removeEventListener('abort', abort); await cancel }
  if (record.round === 2) { await service.close(); state.service = new api.AppService(state.options); await state.service.init(); record.serviceRestarted = true }
}
const rows = reused ? (JSON.parse(await readFile(join(reuseRoot, 'summary.json'), 'utf8')).rows.filter(row => row.entry === 'direct' && runtimes.includes(row.runtime)).map(row => ({ ...row, reusedFrom: reuseRoot }))) : []
for (const f of fixtures) {
  const row = { runtime: f.runtime, entry: f.entry, turns: [], checks: {}, uiVerified: false }; rows.push(row)
  let sessionId
  for (const [index, prompt] of prompts.entries()) {
    if (index > 0 && (!sessionId || row.turns[0].error)) break
    await budget.reserve(f.runtime + '-' + f.entry + '-' + index)
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(Error('Observation timeout; no replay')), plan.timeoutMs)
    let poll, cancelled = false
    const record = { round: index + 1, events: [], receipts: [], text: '', startedAt: new Date().toISOString() }; row.turns.push(record)
    const previous = await bytes(join(f.cwd, 'result.json'))
    if (index === 2) poll = setInterval(() => { void bytes(join(f.cwd, 'long-started.json')).then(value => { if (value && !cancelled) { cancelled = true; controller.abort(Error('Fixture user cancellation')) } }).catch(error => controller.abort(error)) }, 100)
    try { await (f.entry === 'direct' ? direct : boai)(f, prompt, sessionId, controller.signal, record) }
    catch (error) { record.error = error.message }
    finally { clearTimeout(timeout); clearInterval(poll) }
    record.elapsedMs = Date.now() - Date.parse(record.startedAt)
    record.cancelledAfterCommandStarted = cancelled
    sessionId = record.sessionId ?? sessionId
    if (index === 0) {
      row.result = await bytes(join(f.cwd, 'result.json'))
      row.mcpCalls = await bytes(join(f.cwd, '.native/mcp-calls.jsonl'))
      row.hookRuns = await bytes(join(f.cwd, 'hook-runs.txt'))
      let result; try { result = JSON.parse(row.result) } catch { /* Missing/invalid files fail checks. */ }
      const nativeChildren = record.events.filter(event => ['collab_tool_call', 'collabAgentToolCall', 'subAgentActivity'].includes((event.item ?? event.payload?.item)?.type) || (event.message?.content ?? []).some(block => block.type === 'tool_use' && ['Agent', 'Task'].includes(block.name)) || ['Agent', 'Task'].includes(event.canonical?.toolName))
      row.checks.project = result?.project === seed.project
      row.checks.skill = result?.skill?.marker === seed.skill && result?.skill?.value === 42
      row.checks.mcp = result?.mcp?.marker === seed.mcp && result?.mcp?.value === 34 && row.mcpCalls?.includes('"value":17') === true
      row.checks.child = nativeChildren.length > 0 && typeof result?.child === 'string' && result.child.includes(seed.child)
      row.checks.childBytesExact = result?.child === seed.child
      row.nativeChildEvidence = nativeChildren.length
      row.checks.publicResult = record.text.includes('VERIFIED') && record.text.includes(seed.project)
    }
    if (index === 1 || index === 3) row.checks[index === 1 ? 'resume' : 'resumeAfterCancel'] = !record.error && record.sessionId === row.turns[0].sessionId && record.text.includes('SESSION-' + marker) && previous !== undefined && previous === await bytes(join(f.cwd, 'result.json'))
    if (index === 2) {
      const heartbeat = await bytes(join(f.cwd, 'heartbeat.txt')); await pause(600)
      let exited = false
      try { const pid = JSON.parse(await bytes(join(f.cwd, 'long-started.json'))).pid; try { process.kill(pid, 0) } catch (error) { if (error.code === 'ESRCH') exited = true } } catch { /* Missing process identity fails cancellation. */ }
      row.checks.cancel = cancelled && record.error === 'Fixture user cancellation' && exited && heartbeat === await bytes(join(f.cwd, 'heartbeat.txt'))
    }
    await save(`${f.runtime}-${f.entry}-${index + 1}.json`, record)
    console.log(JSON.stringify({ runtime: f.runtime, entry: f.entry, round: index + 1, elapsedMs: record.elapsedMs, error: record.error, checks: row.checks }))
  }
  row.changedInputs = []
  for (const [name, expected] of Object.entries(f.inputHashes)) if (sha(await readFile(join(f.cwd, name))) !== expected) row.changedInputs.push(name)
}
for (const { service } of services.values()) await service.close()
await save('summary.json', { rows, budget: JSON.parse(await readFile(join(root, 'budget.json'), 'utf8')), untested: plan.untested })
console.log(JSON.stringify({ root, rows: rows.map(({ runtime, entry, checks, changedInputs }) => ({ runtime, entry, checks, changedInputs })) }))
process.exitCode = rows.some(row => row.changedInputs.length || Object.values(row.checks).some(value => !value) || row.turns.length !== 4) ? 1 : 0
