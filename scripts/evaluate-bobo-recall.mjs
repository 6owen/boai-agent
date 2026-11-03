/*
 * [INPUT]: Current Bobo connection, frozen HEAD baseline, candidate sources and existing read-only credential host.
 * [OUTPUT]: One or two real-model repetitions of cross-session recall and ordinary questions; continuation shares the original bounded budget.
 * [POS]: Manual verification entry; no personal chats, credentials or OM thresholds are changed.
 * [PROTOCOL]: Update Header and scripts/.folder.md on change.
 */
import { buildWorkspace as build } from './workspace-packages.mjs'
import { execFileSync, spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { homedir } from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { createHash } from 'node:crypto'
import electron from 'electron'

const dataPath = join(homedir(), 'Library/Application Support/BoAI Agent/v2')
const db = new DatabaseSync(join(dataPath, 'boai.sqlite'), { readOnly: true })
let actor
try { actor = JSON.parse(db.prepare("SELECT value FROM records WHERE collection='agents' AND id='bobo'").get().value) } finally { db.close() }
if (actor.executionBackend?.kind !== 'mastra-model') throw new Error('Comparison requires the current API Bobo')
const previousArg = process.argv.indexOf('--continue-from')
const previous = previousArg >= 0 ? resolve(process.argv[previousArg + 1]) : undefined
const priorResults = [], visited = new Set()
for (let directory = previous; directory; ) {
  if (visited.has(directory)) throw new Error('Comparison history has a cycle')
  visited.add(directory)
  for (const variant of ['baseline', 'candidate']) {
    try { priorResults.push(JSON.parse(await readFile(join(directory, variant, 'result.json'), 'utf8'))) }
    catch (error) { if (error.code !== 'ENOENT') throw error }
  }
  directory = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8')).previous
}
if (priorResults.some(result => result.unknownUsage)) throw new Error('Previous comparison has unknown usage; stopped')
const spent = priorResults.reduce((n, result) => n + result.actualRequests, 0)
const remaining = 32 - spent
if (previous && remaining <= 0) throw new Error('Original comparison request budget exhausted')
const repetitionsArg = process.argv.indexOf('--repetitions')
const repetitions = repetitionsArg >= 0 ? Number(process.argv[repetitionsArg + 1]) : 2
if (![1, 2].includes(repetitions)) throw new Error('Repetitions must be 1 or 2 within the original budget')
const output = resolve(`.local/recall-comparison/${Date.now()}`); await mkdir(output, { recursive: true })
const target = resolve('packages/runtime/src/adapters/mastra/conversation-memory.ts')
const baseline = execFileSync('git', ['show', 'HEAD:packages/runtime/src/adapters/mastra/conversation-memory.ts'], { encoding: 'utf8' })
const baselineCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
await writeFile(join(output, 'manifest.json'), JSON.stringify({ baselineCommit, connectionId: actor.connectionId, modelId: actor.modelId, repetitions, maxRequestsTotal: 32, maxOutputTokensTotal: 16000, ...(previous ? { previous, priorRequests: spent, remainingRequests: remaining } : {}), deadlineMsPerVariant: 180000, observationMessageTokens: 6000, reflectionObservationTokens: 12000, baselineHash: createHash('sha256').update(baseline).digest('hex'), candidateHash: createHash('sha256').update(await readFile(target)).digest('hex') }, null, 2))
console.log(`Evidence: ${output}`)
for (const variant of previous ? ['candidate'] : ['baseline', 'candidate']) {
  const directory = join(output, variant); await mkdir(directory)
  const settings = { variant, output: directory, dataPath, connectionId: actor.connectionId, modelId: actor.modelId, thinkingLevel: actor.thinkingLevel, repetitions, maxRequests: previous ? remaining : 16, maxOutputTokens: previous ? 16000 - priorResults.flatMap(result => result.calls).reduce((n, call) => n + (call.usage?.outputTokens ?? 0), 0) : 8000, deadlineMs: 180000 }
  await writeFile(join(directory, 'settings.json'), JSON.stringify(settings, null, 2))
  const worker = join(directory, 'worker.mjs'), host = join(directory, 'host.cjs')
  await build({ stdin: { contents: `import { runBoboRecallEvaluation } from './tests/evaluation/bobo-recall.ts';process.once('message',input=>runBoboRecallEvaluation(input).then(()=>process.exit(0),e=>{process.stderr.write(e.message+'\\n');process.exit(1)}));`, resolveDir: process.cwd() }, outfile: worker, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22', plugins: variant === 'baseline' ? [{ name: 'frozen-memory-baseline', setup(builder) { builder.onLoad({ filter: /conversation-memory\.ts$/ }, args => args.path === target ? { contents: baseline, loader: 'ts', resolveDir: dirname(target) } : undefined) } }] : [] })
  await build({ entryPoints: ['tests/evaluation/host.ts'], outfile: host, bundle: true, platform: 'node', format: 'cjs', packages: 'external', target: 'node22' })
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(electron, [host, join(directory, 'settings.json'), worker], { stdio: 'inherit', env })
  const timer = setTimeout(() => child.kill('SIGKILL'), settings.deadlineMs + 30000)
  const code = await new Promise(resolve => child.once('exit', code => resolve(code ?? 1))); clearTimeout(timer)
  if (code) { process.exitCode = code; break }
  console.log(`${variant}: completed`)
}
