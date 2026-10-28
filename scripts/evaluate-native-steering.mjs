/*
 * [INPUT]: Explicit Codex executable, fresh evidence directory and optional --real authorization.
 * [OUTPUT]: One direct app-server/BOAI pair, four external input submissions maximum, zero retries.
 * [POS]: NP10 deterministic current-turn steering probe; no GUI or model-quality claim.
 * [PROTOCOL]: Changes update scripts/.folder.md and spec/28 actual progress.
 */
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { buildWorkspace } from './workspace-packages.mjs'
import buildProcessGuard from './build-process-guard.mjs'

const args = process.argv.slice(2), option = name => args[args.indexOf(name) + 1]
if (args.includes('--help')) {
  console.log('node scripts/evaluate-native-steering.mjs --root NEW_DIR --codex FILE [--real]\nPrepare only by default. --real runs one direct app-server and one BOAI AppService turn with one steer each; 150s per entry, zero retries. Inherited native login/model/config, explicit full-access for isolated files. Counts external input submissions, not internal native model requests. No renderer or Claude coverage.')
  process.exit(0)
}
if (!args.includes('--root') || !args.includes('--codex')) throw Error('Explicit root and Codex executable required')
const root = resolve(option('--root')), source = process.cwd(), executable = await realpath(resolve(option('--codex')))
const hash = value => createHash('sha256').update(value).digest('hex')
await mkdir(root, { recursive: false })
const save = (file, value) => writeFile(join(root, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' })
const prompt = '只操作当前隔离目录，不读配置或凭据，不访问远程网络。先用原生命令运行 node wait.mjs 并等待结束，不要后台脱离或提前终止。结束后写 result.txt，内容严格为 ORIGINAL。不要修改脚本或其他输入。'
const steer = '补充当前执行：等正在运行的 wait.mjs 结束后，result.txt 改为严格写入 UPDATED-42，不要写 ORIGINAL。只写该文件，不重新执行 wait.mjs。'
const fixture = {
  'AGENTS.md': 'Only operate in this isolated fixture. Preserve inputs. Follow the latest user instruction. Do not delegate or use network.\n',
  'wait.mjs': "import{writeFileSync,appendFileSync}from'node:fs';appendFileSync('starts.txt','start\\n');writeFileSync('started.json',JSON.stringify({pid:process.pid}));await new Promise(done=>setTimeout(done,12000));console.log('WAIT_COMPLETE');\n",
}
const plan = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), runnerHash: hash(await readFile(new URL(import.meta.url))), executable, executableHash: hash(await readFile(executable)), version: execFileSync(executable, ['--version'], { encoding: 'utf8' }).trim(), prompt, steer, timeoutMs: 150000, maxExternalInputSubmissions: 4, retries: 0, permissions: 'explicit full-access; inherited native login/model/config', untested: ['Claude', 'GUI', 'images', 'all native interactions', 'statistical reliability'] }
for (const entry of ['direct', 'boai']) {
  await mkdir(join(root, entry))
  for (const [name, value] of Object.entries(fixture)) await writeFile(join(root, entry, name), value, { flag: 'wx' })
}
await save('plan.json', { ...plan, inputs: Object.fromEntries(Object.entries(fixture).map(([name, value]) => [name, hash(value)])) })
if (!args.includes('--real')) { console.log(JSON.stringify({ root, prepared: true, externalInputSubmissions: 0 })); process.exit(0) }
await buildProcessGuard()
const compiled = join(root, 'adapter.mjs')
await buildWorkspace({ stdin: { contents: "export {AppService} from './packages/runtime/src/service';export {inspectProgram} from './packages/runtime/src/modules/backends/program';export {EvaluationBudget} from './tests/evaluation/budget';", resolveDir: source }, outfile: compiled, platform: 'node', format: 'esm', bundle: true, packages: 'external', target: 'node22', logLevel: 'silent' })
const api = await import(pathToFileURL(compiled).href), budget = new api.EvaluationBudget(join(root, 'budget.json'), 4)
await save('build.json', { bundleHash: hash(await readFile(compiled)), diffHash: hash(execFileSync('git', ['diff', 'HEAD', '--', 'packages'], { encoding: 'utf8' })), commit: plan.commit })
const pause = ms => new Promise(done => setTimeout(done, ms))
async function exists(path) { try { await readFile(path); return true } catch (error) { if (error.code === 'ENOENT') return false; throw error } }
async function until(check, signal) { while (true) { signal.throwIfAborted(); const value = await check(); if (value) return value; await pause(100) } }
async function direct(cwd, record, signal) {
  const node = api.inspectProgram(executable, 500 * 1024 * 1024).runtime === 'node'
  const child = spawn(join(source, 'dist/native/boai-process-guard'), ['--ledger', join(cwd, '.owned'), node ? process.execPath : executable, ...(node ? [executable] : []), 'app-server', '--listen', 'stdio://', '-c', 'features.respect_system_proxy=true'], { cwd, env: { ...process.env, TMPDIR: cwd, TMP: cwd, TEMP: cwd }, stdio: ['pipe', 'pipe', 'pipe'] })
  const closed = new Promise(done => child.once('close', done)), pending = new Map()
  let id = 0, fault, completed
  const fail = error => { fault = error; for (const p of pending.values()) p.reject(error); pending.clear() }
  child.once('error', fail); child.once('exit', code => fail(Error('Native process exited: ' + code)))
  child.stdin.on('error', fail); child.stderr.on('data', () => {})
  const lines = createInterface({ input: child.stdout })
  lines.on('line', line => {
    try {
      const frame = JSON.parse(line)
      if (frame.method && frame.id !== undefined) { fail(Error('Unexpected native request: ' + frame.method)); return }
      if (frame.id !== undefined) { const p = pending.get(frame.id); if (p) { pending.delete(frame.id); frame.error ? p.reject(Error(JSON.stringify(frame.error))) : p.resolve(frame.result) } }
      if (frame.method === 'turn/completed') completed = frame.params.turn
      if (frame.method === 'item/completed' && frame.params.item.type === 'agentMessage') record.text = frame.params.item.text
      if (['turn/started', 'turn/completed'].includes(frame.method)) record.events.push(frame)
    } catch (error) { fail(error) }
  })
  const request = (method, params) => new Promise((resolve, reject) => {
    if (fault || signal.aborted) { reject(fault ?? signal.reason); return }
    const requestId = ++id; pending.set(requestId, { resolve, reject }); child.stdin.write(JSON.stringify({ id: requestId, method, params }) + '\n')
  })
  const abort = () => { fail(signal.reason); child.kill('SIGTERM') }
  signal.addEventListener('abort', abort, { once: true })
  try {
    await request('initialize', { clientInfo: { name: 'boai_steering_probe', version: '1' }, capabilities: { experimentalApi: true } })
    child.stdin.write(JSON.stringify({ method: 'initialized', params: {} }) + '\n')
    const thread = await request('thread/start', { cwd, sandbox: 'danger-full-access', approvalPolicy: 'never' })
    record.threadId = thread.thread.id; record.model = thread.model
    await budget.reserve('direct:start')
    const started = await request('turn/start', { threadId: record.threadId, clientUserMessageId: randomUUID(), input: [{ type: 'text', text: prompt, text_elements: [] }] })
    record.turnId = started.turn.id
    await until(async () => { if (fault) throw fault; if (completed) throw Error('Turn ended before steering'); return exists(join(cwd, 'started.json')) }, signal)
    await budget.reserve('direct:steer')
    record.receipt = await request('turn/steer', { threadId: record.threadId, expectedTurnId: record.turnId, clientUserMessageId: randomUUID(), input: [{ type: 'text', text: steer, text_elements: [] }] })
    if (record.receipt.turnId !== record.turnId) throw Error('Steer receipt changed turn')
    await until(() => { if (fault) throw fault; return completed }, signal)
    if (completed.id !== record.turnId || completed.status !== 'completed') throw Error('Original turn did not complete')
  } finally { signal.removeEventListener('abort', abort); child.kill('SIGTERM'); await closed; lines.close() }
}
async function boai(cwd, record, signal) {
  const service = new api.AppService({ dataPath: join(root, 'app-data'), engine: { run: async () => { throw Error('API engine must not be used') }, test: async () => '' }, secrets: { get: async () => undefined, set: async () => {}, delete: async () => {} }, emit: () => {} })
  const requestId = randomUUID()
  const abort = () => { void service.handle('cancelMessageExecution', { requestId }).catch(() => {}) }
  try {
    await service.init()
    const draft = { name: 'Steering probe', executable, args: [], protocol: 'codex-app-server', useExistingLogin: true, hostAccessAcknowledged: true }
    await service.handle('testLaunchProfileDraft', draft)
    const profile = await service.handle('saveLaunchProfile', draft)
    const agent = await service.handle('saveAgent', { name: 'Steering probe', role: '验收', instructions: '按用户消息使用原生命令执行，只操作用户指定的隔离目录。', color: '#00AABB', connectionId: '', modelId: '', executionBackend: { kind: 'codex-local', profileId: profile.id }, executionPermission: 'full-access', skillIds: [], knowledgeIds: [], allowCommands: true, active: true })
    const chat = await service.handle('createConversation', { kind: 'direct', title: 'Steering probe', agentIds: [agent.id] })
    signal.addEventListener('abort', abort, { once: true }); signal.throwIfAborted()
    await budget.reserve('boai:start')
    const message = await service.handle('sendMessage', { conversationId: chat.id, content: prompt, mentionIds: [], requestId, workingDirectory: cwd })
    const detail = () => service.handle('getConversation', { id: chat.id })
    const terminal = run => ['completed', 'failed', 'cancelled', 'interrupted'].includes(run.status)
    const run = await until(async () => {
      const current = (await detail()).runs.find(value => value.triggerMessageId === message.id)
      if (current && terminal(current)) throw Error('BOAI ended before steering: ' + (current.error ?? current.status))
      return current?.backend?.canSteer && await exists(join(cwd, 'started.json')) ? current : undefined
    }, signal)
    record.threadId = run.backend.sessionId; record.turnId = run.backend.turnId; record.model = run.backend.modelId
    await budget.reserve('boai:steer')
    record.receipt = await service.handle('sendMessage', { conversationId: chat.id, content: steer, mentionIds: [], requestId: randomUUID(), steer: { runId: run.id, turnId: record.turnId } })
    const final = await until(async () => { const d = await detail(); return d.runs.length && d.runs.every(terminal) ? d : undefined }, signal)
    record.runs = final.runs; record.messages = final.messages
    if (record.receipt.nativeSteering?.delivery !== 'submitted' || final.runs.length !== 1 || final.runs[0].id !== run.id || final.runs[0].status !== 'completed') throw Error('BOAI did not complete the original steered run')
  } finally { signal.removeEventListener('abort', abort); await service.close() }
}
const results = []
for (const entry of ['direct', 'boai']) {
  const cwd = join(root, entry), record = { entry, events: [] }, controller = new AbortController()
  const timer = setTimeout(() => controller.abort(Error('Entry exceeded 150s; no retry')), plan.timeoutMs)
  try {
    await (entry === 'direct' ? direct : boai)(cwd, record, controller.signal)
    record.output = await readFile(join(cwd, 'result.txt'), 'utf8')
    record.starts = await readFile(join(cwd, 'starts.txt'), 'utf8')
    for (const [name, value] of Object.entries(fixture)) if (await readFile(join(cwd, name), 'utf8') !== value) throw Error('Input modified: ' + name)
    record.passed = record.output === 'UPDATED-42' && record.starts === 'start\n'
    if (!record.passed) record.error = 'Output or execution cardinality differs from fixed contract'
  } catch (error) { record.passed = false; record.error = String(error) } finally { clearTimeout(timer) }
  results.push(record); await save(entry + '.json', record)
  console.log(JSON.stringify({ entry, passed: record.passed, error: record.error, turnId: record.turnId }))
}
await save('summary.json', { passed: results.every(value => value.passed) && results[0].model === results[1].model, results: results.map(({ entry, passed, error, threadId, turnId, model }) => ({ entry, passed, error, threadId, turnId, model })), budget: JSON.parse(await readFile(join(root, 'budget.json'), 'utf8')), untested: plan.untested })
if (results.some(value => !value.passed) || results[0].model !== results[1].model) process.exitCode = 1
