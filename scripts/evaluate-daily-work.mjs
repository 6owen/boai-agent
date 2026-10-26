/*
 * [OUTPUT]: Workspace源码路径迁至apps/packages，保留既有输出与业务合同。
 * [INPUT]: Explicit saved connection/data path, reviewed Mock-v1 files and original evaluation host.
 * [OUTPUT]: Zero-call frozen preparation and at most two isolated actual attempts, sharing 60 requests/20 minutes; no daily data mutation.
 * [POS]: Daily-work-v1 manual acceptance controller; no automatic hillclimb or human/judge pass labels.
 * [PROTOCOL]: Update Header and scripts/.folder.md on change.
 */
import { buildWorkspace as build } from './workspace-packages.mjs'
import { spawn, execFileSync } from 'node:child_process'
import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import electron from 'electron'
import { buildInputHash } from './build-identity.mjs'

const [mode, rootArg, connectionId, dataPath] = process.argv.slice(2), root = resolve(rootArg ?? '')
const sha = v => createHash('sha256').update(v).digest('hex')
const save = (file, value, exclusive = false) => writeFile(file, JSON.stringify(value, null, 2), { mode: 0o600, ...(exclusive ? { flag: 'wx' } : {}) })
if (!['prepare', 'baseline', 'followup', 'continue-followup'].includes(mode) || !rootArg || mode === 'prepare' && (!connectionId || !dataPath) || mode !== 'prepare' && (connectionId || dataPath)) throw Error('Usage: evaluate-daily-work.mjs prepare NEW_ROOT CONNECTION_ID DATA_PATH | baseline ROOT | followup ROOT | continue-followup ROOT')
const packet = resolve('ai-docs/spec/23.个人日常稳定化/mock-daily-work-v1')
if (mode === 'prepare') {
  await mkdir(root, { mode: 0o700 })
  const snapshot = join(root, 'stored-profile.mjs')
  await build({ entryPoints: ['tests/evaluation/stored-profile.ts'], outfile: snapshot, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
  const currentConfiguration = await (await import(pathToFileURL(snapshot).href)).snapshotStoredProfile(resolve(dataPath), connectionId)
  const db = new DatabaseSync(join(resolve(dataPath), 'boai.sqlite'), { readOnly: true })
  let connection
  try { const row = db.prepare("SELECT value FROM records WHERE collection='connections' AND id=?").get(connectionId); if (!row) throw Error('Selected connection missing'); connection = JSON.parse(String(row.value)) } finally { db.close() }
  const materials = await Promise.all(['项目简报.md', '会议纪要.md', '试用记录.md'].map(async name => { const content = await readFile(join(packet, name), 'utf8'); return { name, content, sha256: sha(content) } }))
  const taskCard = await readFile(join(packet, '任务卡.md'), 'utf8'), prompts = [...taskCard.matchAll(/```text\n([\s\S]*?)\n```/g)].map(m => m[1])
  if (prompts.length !== 4) throw Error('Reviewed task card must have exactly four prompts')
  const expectedConnection = { id: connection.id, provider: connection.provider, baseUrl: connection.baseUrl, defaultModel: connection.defaultModel, ...(connection.api ? { api: connection.api } : {}) }
  const plan = { protocol: 'daily-work-v1', preparedAt: new Date().toISOString(), authorization: 'User requested to continue testing the reviewed Mock packet and implement stability', connectionId, dataPath: resolve(dataPath), expectedConnection, currentConfiguration, materials, prompts, taskCardSha256: sha(taskCard), maxRequests: 60, attemptRequests: 40, deadlineMs: 1200000, maxAttempts: 2, quality: 'needs_review', automaticBehaviorsPausedInCopy: true }
  await save(join(root, 'plan.json'), plan, true)
  await writeFile(join(root, 'design-review.md'), '# Daily-work-v1\n\nReviewed Mock-v1: three frozen inputs, four original task-card turns. Two actual attempts share at most 60 requests and 20 minutes. Each attempt is at most 40 requests. Isolated AppService; no GUI, external publication or original profile mutation. Deterministic checks do not establish human quality approval.\n\n' + taskCard, { flag: 'wx' })
  console.log(JSON.stringify({ root, prepared: true, providerRequests: 0, turns: prompts.length, maxRequests: 60, deadlineMs: 1200000 })); process.exit(0)
}
const plan = JSON.parse(await readFile(join(root, 'plan.json'), 'utf8'))
if (plan.protocol !== 'daily-work-v1' || plan.maxRequests !== 60 || plan.deadlineMs !== 1200000 || plan.maxAttempts !== 2) throw Error('Frozen plan changed')
for (const file of plan.materials) if (sha(file.content) !== file.sha256 || sha(await readFile(join(packet, file.name))) !== file.sha256) throw Error('Reviewed inputs changed')
if (sha(await readFile(join(packet, '任务卡.md'))) !== plan.taskCardSha256) throw Error('Reviewed task card changed')
if (mode === 'followup') await access(join(root, 'baseline', 'result.json'))
let resume
if (mode === 'continue-followup') {
  const previous = JSON.parse(await readFile(join(root, 'followup', 'settings.json'), 'utf8'))
  if (previous.productInputHash !== await buildInputHash()) throw Error('Continuation cannot change the candidate product source')
  resume = { resultFile: join(root, 'followup', 'result.json'), dataPath: join(root, 'followup', 'data') }
}
let started
try { started = JSON.parse(await readFile(join(root, 'started.json'), 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error; started = { startedAt: Date.now(), deadlineAt: Date.now() + plan.deadlineMs }; await save(join(root, 'started.json'), started, true) }
if (Date.now() >= started.deadlineAt) throw Error('Original shared experiment window expired; no automatic budget reset')
const output = join(root, mode); await mkdir(output, { mode: 0o700 })
const hashes = {}
for (const directory of ['packages/runtime/src', 'packages/shared/src', 'packages/transport/src', 'packages/runtime-plugin-sdk/src', 'packages/runtime-plugins/src', 'tests/evaluation']) for (const member of (await readdir(directory, { recursive: true })).filter(f => /\.(ts|tsx)$/.test(f)).sort()) { const path = join(directory, member); hashes[path] = sha(await readFile(path)) }
for (const path of ['pnpm-lock.yaml', 'scripts/evaluate-daily-work.mjs']) hashes[path] = sha(await readFile(path))
const worker = join(output, 'worker.mjs'), host = join(output, 'host.cjs')
await build({ stdin: { contents: "import {runDailyWorkEvaluation} from './tests/evaluation/daily-work.ts';process.once('disconnect',()=>process.exit(1));process.once('message',input=>runDailyWorkEvaluation(input).then(()=>process.exit(process.exitCode??0),error=>{process.stderr.write(String(error.message)+'\\n');process.exit(1)}));", resolveDir: process.cwd() }, outfile: worker, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
await build({ entryPoints: ['tests/evaluation/host.ts'], outfile: host, bundle: true, platform: 'node', format: 'cjs', packages: 'external', target: 'node22' })
for (const [path, hash] of Object.entries(hashes)) if (sha(await readFile(path)) !== hash) throw Error('Source changed during freeze')
const settings = { ...plan, ...(resume ? { resume } : {}), output, deadlineAt: started.deadlineAt, budgetFile: join(root, 'request-budget.json'), hashes, sourceHead: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), productInputHash: await buildInputHash(), workerHash: sha(await readFile(worker)) }
await save(join(output, 'settings.json'), settings, true)
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [host, join(output, 'settings.json'), worker], { env, detached: true, stdio: 'inherit' })
console.log('Evidence: ' + output)
const stop = () => { try { process.kill(-child.pid, 'SIGTERM') } catch {} }
const timer = setTimeout(stop, Math.max(1, started.deadlineAt - Date.now())); process.once('SIGINT', stop)
process.exitCode = await new Promise(done => child.once('exit', code => done(code ?? 1)))
clearTimeout(timer); process.removeListener('SIGINT', stop)
