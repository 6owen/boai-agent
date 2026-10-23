/*
 * [OUTPUT]: --stream-stability沿现有BDD登记Claude三次独立四轮及长命令/停止/重启探针，共15用户消息；失败完整保留、零重试，生产协议不改。
 * [INPUT]: 用户明确启动真实本机接入对照、已选择CLI程序与新的留证目录。
 * [OUTPUT]: 冻结源码/题目、零模型审阅/开窗、原pnpm dev BDD登记路径；复用已完成CLI基线仍沿原16外部运行账本，跨批来源/失败/回放保留。
 * [POS]: 复用现有评估合同与Electron BDD，不更改产品能力或增加安装包。
 * [PROTOCOL]: 变化同步Header和scripts/.folder.md。
 */
import { spawn, execFileSync } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { mkdir, mkdtemp, readFile, writeFile, symlink, copyFile, readdir, open } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createHash } from 'node:crypto'
import { build } from 'esbuild'

const args = process.argv.slice(2), option = name => { const i = args.indexOf(name); return i < 0 ? undefined : args[i + 1] }, prepared = args.includes('--run-prepared')
if (args.includes('--help')) { process.stdout.write('node scripts/evaluate-native-parity.mjs --root NEW_DIR --codex FILE --claude FILE [--prepare-only] [--input-delivery] [--reuse-direct-root DIR --budget-file FILE] [--boai-only-recheck --reuse-direct-root DIR] [--stream-stability --reuse-direct-root DIR]\nUse --run-prepared to execute an existing prepared snapshot once. Freezes source and tasks; zero-model boot precheck, then paired BDD scenarios (four tasks or input-delivery four-round tasks for two runtimes). Up to 16 shared external native turns; no retries, model substitution or production edits.\n'); process.exit(0) }
const root = resolve(option('--root') ?? '.local/native-parity-' + Date.now()), source = process.cwd(), codex = resolve(option('--codex') ?? ''), claude = resolve(option('--claude') ?? '')
if (!option('--codex') || !option('--claude')) throw Error('Both explicitly selected native programs are required')
if (!prepared) await mkdir(root, { recursive: false })
const lock = await open(join(root, prepared ? '.run.lock' : '.execution.lock'), 'wx')
const toolsDir = await mkdtemp(join(root, 'tools-')), modulePath = join(toolsDir, 'contract.mjs')
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const save = (name, value) => writeFile(join(root, name), JSON.stringify(value, null, 2), { flag: 'wx' })
await build({ stdin: { contents: 'export {captureSource,materialize,verifyInputs} from "./tests/evaluation/repair"; export {parityCase,PARITY_VERSION,STREAM_STABILITY} from "./tests/evaluation/native-parity"', resolveDir: source }, outfile: modulePath, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22', logLevel: 'silent' })
const api = await import(pathToFileURL(modulePath).href)
let previousPlan = prepared ? JSON.parse(await readFile(join(root, 'plan.json'), 'utf8')) : undefined
const snapshot = join(root, 'source')
const files = prepared ? Object.fromEntries(await Promise.all(Object.entries(previousPlan.sourceHashes).map(async ([file, expected]) => { const bytes = await readFile(join(snapshot, file)); if (sha(bytes) !== expected) throw Error('Prepared snapshot changed: ' + file); return [file, bytes] }))) : await api.captureSource(source, { allowedFiles: [], tests: ['tests/e2e/features/native-parity.feature'], contextFiles: ['tailwind.config.ts'], typecheck: true })
if (!prepared) {
  await api.materialize(snapshot, files)
  await symlink(resolve('node_modules'), join(snapshot, 'node_modules'), 'dir')
  await mkdir(join(snapshot, 'dist/native'), { recursive: true })
  for (const file of ['boai-process-guard', 'source.sha256', 'LICENSE']) await copyFile(resolve('dist/native', file), join(snapshot, 'dist/native', file))
}
const program = async file => ({ executable: file, sha256: sha(await readFile(file)), version: execFileSync(file.endsWith('.js') ? process.execPath : file, [...(file.endsWith('.js') ? [file] : []), '--version'], { encoding: 'utf8' }).trim() })
const streamStability = previousPlan?.streamStability ?? args.includes('--stream-stability')
const repeats = streamStability ? 3 : 1
const inputDelivery = previousPlan?.inputDelivery ?? (streamStability || args.includes('--input-delivery'))
const boaiOnlyRecheck = previousPlan?.boaiOnlyRecheck ?? (streamStability || args.includes('--boai-only-recheck'))
if (boaiOnlyRecheck && (!inputDelivery || !previousPlan?.reuseDirectRoot && !option('--reuse-direct-root') || option('--budget-file'))) throw Error('New BOAI-only verification requires input-delivery and registered prior CLI evidence; it owns a new ledger, not a replacement for the original ledger')
const cases = previousPlan ? [...new Map(previousPlan.tasks.map(task => [task.task,task.scenario])).values()] : (inputDelivery ? ['inputs'] : ['orders', 'code']).map(id => api.parityCase(id, 'BOAI-PARITY-' + id.toUpperCase() + '-20261012'))
const tasks = previousPlan?.tasks ?? (streamStability ? ['claude'] : ['codex', 'claude']).flatMap(runtime => cases.map(scenario => ({ runtime, task: scenario.id, direct: true, boai: true, rounds: scenario.prompts.length, scenario })))
const plan = previousPlan ?? { version: api.PARITY_VERSION, recordedAt: new Date().toISOString(), commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceHashes: Object.fromEntries(Object.entries(files).map(([file, bytes]) => [file, sha(bytes)])), programs: { codex: await program(codex), claude: await program(claude) }, tasks, inputDelivery, streamStability, ...(streamStability ? { lifecycleProbe: api.STREAM_STABILITY } : {}), pairs: tasks.length * repeats, taskPaths: tasks.length * (repeats + 1), maxExternalTurns: boaiOnlyRecheck ? tasks.reduce((sum, task) => sum + task.rounds, 0) * repeats + (streamStability ? 3 : 0) : 16, boaiOnlyRecheck, repeats, retries: 0, providerInternalRequests: null, subjectiveQuality: 'pending human review; objective checks only', directEntry: 'native CLI exec/print, using CLI configuration and session resume', boaiEntry: 'real pnpm dev, native application protocol, identical task messages', nodeModules: 'shared installed directory; package and lockfile frozen', sharedCredentials: 'native CLI login remains in its own configuration; no credential copying', ...(option('--reuse-direct-root') ? { reuseDirectRoot: resolve(option('--reuse-direct-root')), budgetFile: boaiOnlyRecheck ? join(root, 'external-turn-budget.json') : resolve(option('--budget-file') ?? '') } : {}) }
if (plan.reuseDirectRoot) {
  if (!plan.budgetFile) throw Error('Reusing native baselines requires the original shared budget file')
  const original = JSON.parse(await readFile(join(plan.reuseDirectRoot, 'plan.json'), 'utf8'))
  if (!boaiOnlyRecheck && plan.budgetFile !== (original.budgetFile ?? join(plan.reuseDirectRoot, 'external-turn-budget.json'))) throw Error('Reused baseline must retain its original shared budget ledger; no reset permitted')
  if (original.version !== plan.version || plan.tasks.some(task => sha(JSON.stringify(original.tasks.find(item => item.runtime === task.runtime && item.task === task.task))) !== sha(JSON.stringify(task))) || ['codex','claude'].some(runtime => original.programs[runtime].sha256 !== plan.programs[runtime].sha256)) throw Error('Prior baseline task/program differs; cannot reuse')
  if (!prepared) plan.reuseDirectHashes = {}
  for (const task of tasks) {
    const name = `${task.runtime}-${task.task}-attempt0-retry0.json`, bytes = await readFile(join(plan.reuseDirectRoot, 'paired-results', name))
    if (JSON.parse(bytes).direct?.length !== task.scenario.prompts.length) throw Error('Prior CLI baseline is incomplete; no replay permitted')
    if (!prepared) plan.reuseDirectHashes[name] = sha(bytes)
    else if (plan.reuseDirectHashes && plan.reuseDirectHashes[name] !== sha(bytes)) throw Error('Prior CLI evidence changed: ' + name)
  }
}
if (prepared && [codex, claude].some((file, index) => file !== plan.programs[index ? 'claude' : 'codex'].executable)) throw Error('Prepared program path differs from registration')
if (prepared) for (const [runtime, file] of [['codex', codex], ['claude', claude]]) if (sha(await readFile(file)) !== plan.programs[runtime].sha256) throw Error('Prepared program bytes changed: ' + runtime)
if (!prepared) await save('plan.json', plan)
const escape = text => String(text ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
if (!prepared) {
  await writeFile(join(root, 'design-review.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>本机接入对照设计</title><style>body{font:15px system-ui;margin:32px;max-width:1100px}pre{white-space:pre-wrap;overflow-wrap:anywhere}section{border-top:1px solid #ccc;margin-top:24px}</style><h1>直接CLI与BOAI接入的同任务对照</h1><p>' + plan.pairs + '个配对、' + plan.taskPaths + '条任务路径，每条' + [...new Set(tasks.map(task => task.rounds))].join('/') + '轮，最多' + plan.maxExternalTurns + '个共享外部运行；' + repeats + '次独立BOAI执行；复用CLI仅一份历史基线，不认证总体稳定成功率。失败全部保留，不重试挑选成功。若复用前批CLI基线，记录跨批来源，不重复执行。</p>' + (streamStability ? '<section><h2>流生命周期探针：3条消息</h2><pre>' + escape(JSON.stringify(api.STREAM_STABILITY, null, 2)) + '</pre></section>' : '') + cases.map(s => '<section><h2>' + escape(s.id) + '</h2><h3>完整消息</h3><pre>' + escape(s.prompts.map((prompt, index) => `第${index + 1}轮：\n${prompt}`).join('\n\n')) + '</pre><h3>输入原件与校验规则</h3><pre>' + escape(JSON.stringify(s.files, null, 2)) + '</pre><p>检查真实JSON、公开标记/数值、冻结输入、命令产生的校验文件、修复字节、只读hash、BOAI附件和同session重启。</p></section>').join(''))
  await save('source-capture-verification.json', { changed: await api.verifyInputs(source, files, {}), files: Object.keys(files).length })
}
if (args.includes('--prepare-only')) { await lock.close(); console.log(JSON.stringify({ root, prepared: true, modelCalls: 0 })); process.exit(0) }
const results = join(root, 'paired-results'), run = join(root, 'run'); await mkdir(results); await mkdir(run)
const env = { ...process.env, BOAI_NATIVE_REAL: '1', BOAI_TEST_DEV_SERVER: '1', BOAI_NATIVE_CODEX: codex, BOAI_NATIVE_CLAUDE: claude, BOAI_PARITY_BUDGET_FILE: plan.budgetFile ?? join(root, 'external-turn-budget.json'), BOAI_PARITY_MAX_EXTERNAL_TURNS: String(plan.maxExternalTurns), BOAI_PARITY_REPEATS: String(repeats), ...(streamStability ? { BOAI_PARITY_RUNTIME: 'claude', BOAI_STREAM_STABILITY: '1' } : {}), BOAI_PARITY_RESULTS_DIR: results, BOAI_REVIEW_RUN_DIR: run, PLAYWRIGHT_JSON_OUTPUT_NAME: join(run, 'playwright-results.json'), ...(plan.reuseDirectRoot ? { BOAI_PARITY_REUSE_DIRECT_DIR: join(plan.reuseDirectRoot, 'paired-results') } : {}) }
delete env.BOAI_TEST_PACKAGED_PATH
async function command(argv, name, override = {}) {
  const log = createWriteStream(join(root, name), { flags: 'wx' }), child = spawn('pnpm', argv, { cwd: snapshot, env: { ...env, ...override }, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', data => { log.write(data); process.stdout.write(data) }); child.stderr.on('data', data => { log.write(data); process.stderr.write(data) })
  const cancel = () => { try { process.platform === 'win32' ? child.kill('SIGINT') : process.kill(-child.pid, 'SIGINT') } catch { /* Already exited. */ } }; process.once('SIGINT', cancel); process.once('SIGTERM', cancel)
  try { return await new Promise((done, reject) => { child.once('error', reject); child.once('close', code => done(code ?? 1)) }) }
  finally { process.off('SIGINT', cancel); process.off('SIGTERM', cancel); await new Promise(done => log.end(done)) }
}
async function retainTraces(directory) {
  const retained = [], issues = []
  try {
    for (const scenario of await readdir(join(directory, 'scenarios'))) {
      const folder = join(directory, 'scenarios', scenario), manifest = JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8'))
      for (const trace of manifest.traces) {
        try {
          const bytes = await readFile(trace.path)
          if (sha(bytes) !== trace.sha256 || bytes.length !== trace.bytes) throw Error('trace hash/length mismatch')
          const target = join(folder, `retained-trace-${trace.launch}.zip`); await copyFile(trace.path, target)
          retained.push({ originalPath: trace.path, retainedPath: target, sha256: trace.sha256, bytes: trace.bytes })
        } catch (error) { issues.push({ scenario, path: trace.path, error: String(error) }) }
      }
    }
  } catch (error) { issues.push({ error: String(error) }) }
  await writeFile(join(directory, 'retained-traces.json'), JSON.stringify({ retained, issues }, null, 2), { flag: 'wx' })
}
let exitCode = await command(['exec', 'bddgen'], 'bddgen.log')
if (!exitCode) {
  const boot = join(root, 'boot'); await mkdir(boot)
  exitCode = await command(['exec', 'playwright', 'test', '--grep', '@native_parity_boot', '--retries', '0', '--reporter=list,json'], 'boot.log', { BOAI_REVIEW_RUN_DIR: boot, PLAYWRIGHT_JSON_OUTPUT_NAME: join(boot, 'playwright-results.json') })
  await retainTraces(boot)
}
if (!exitCode) {
  await writeFile(join(run, 'registration.json'), JSON.stringify({ runId: plan.version, recordedAt: plan.recordedAt, desktopMode: 'development', desktopModelMode: 'real-provider', repeat: repeats, retries: 0, maxExternalTurns: plan.maxExternalTurns, boaiOnlyRecheck }, null, 2))
  await writeFile(join(run, 'build-manifest.json'), JSON.stringify({ files: plan.sourceHashes, sourceAndBuildDigest: sha(JSON.stringify(plan.sourceHashes)), note: 'pnpm dev builds each isolated launch; source snapshot is frozen, not a prebuilt application certification' }, null, 2))
  exitCode = await command(['exec', 'playwright', 'test', '--grep', inputDelivery ? '@native_input_delivery' : '@native_entry_parity', ...(!inputDelivery ? ['--grep-invert', '@native_input_delivery|@native_stream_stability'] : []), '--repeat-each', String(repeats), '--retries', '0', '--reporter=list,json'], 'run.log')
  await retainTraces(run)
  if (streamStability) {
    const probe = join(root, 'probe'); await mkdir(probe)
    const probeExit = await command(['exec','playwright','test','--grep','@native_stream_stability','--retries','0','--reporter=list,json'],'probe.log',{BOAI_REVIEW_RUN_DIR:probe,PLAYWRIGHT_JSON_OUTPUT_NAME:join(probe,'playwright-results.json')})
    await retainTraces(probe); exitCode ||= probeExit
  }
}
const rows = []
for (const task of tasks) for (let repeatIndex = 0; repeatIndex < repeats; repeatIndex++) {
  const name = `${task.runtime}-${task.task}-attempt${repeatIndex}-retry0.json`
  try { rows.push({ runtime: task.runtime, task: task.task, file: name, ...JSON.parse(await readFile(join(results, name), 'utf8')) }) }
  catch (error) { rows.push({ runtime: task.runtime, task: task.task, repeatIndex, status: 'not-run-or-missing', error: String(error), directPassed: false, boaiPassed: false }) }
}
const verify = { snapshotChanged: await api.verifyInputs(snapshot, files, {}), originalTreeChangedSinceCapture: await api.verifyInputs(source, files, {}), programHashesAfter: { codex: sha(await readFile(codex)), claude: sha(await readFile(claude)) } }
await save('verification.json', verify)
let lifecycleProbe
if(streamStability){try{lifecycleProbe=JSON.parse(await readFile(join(results,'claude-stream-probe.json'),'utf8'))}catch(error){lifecycleProbe={passed:false,status:'not-run-or-missing',error:String(error)}}}
const summary = { lifecycleProbe, historicalDirectCases: plan.reuseDirectRoot ? tasks.length : 0, baselineReuse: boaiOnlyRecheck ? { scope: 'new authorized BOAI verification only; historical CLI not charged or replayed', root: plan.reuseDirectRoot } : undefined, registeredPairs: plan.pairs, registeredTaskPaths: plan.taskPaths, directPassed: rows.filter(r => r.directPassed).length, boaiPassed: rows.filter(r => r.boaiPassed).length, bothPassed: rows.filter(r => r.directPassed && r.boaiPassed).length, exitCode, rows, repeats, semanticQuality: 'not-assessed; no judge/human label generated', sourceUnchanged: !verify.snapshotChanged.length }
await save('summary.json', summary)
await writeFile(join(root, 'index.html'), '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>本机接入真实对照结果</title><style>body{font:15px system-ui;margin:32px}td,th{border:1px solid #ccc;padding:12px}table{border-collapse:collapse}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>本机直跑与BOAI接入真实任务对照</h1><p>直接CLI ' + summary.directPassed + '/' + plan.pairs + '；BOAI ' + summary.boaiPassed + '/' + plan.pairs + '；双入口均通过 ' + summary.bothPassed + '/' + plan.pairs + '。BOAI每题' + repeats + '次；复用的直接CLI是历史基线，不是新执行。生命周期探针：' + (lifecycleProbe ? lifecycleProbe.passed ? '通过' : '失败/未完成' : '未登记') + '。不认证总体成功率；语义/人工校准未评。</p><p><a href="design-review.html">实际输入与规则</a> · <a href="summary.json">完整结果及所有失败</a> · <a href="run/playwright-results.json">原桌面报告</a> · <a href="run.log">原运行日志</a></p><table><tr><th>运行时/任务</th><th>本机直接执行</th><th>BOAI接入</th></tr>' + rows.map(row => '<tr><td>' + escape(row.runtime + '/' + row.task) + '</td><td>' + (row.directPassed ? '通过' : '失败/未完整执行') + '</td><td>' + (row.boaiPassed ? '通过' : '失败/未完整执行') + '</td></tr>').join('') + '</table>' + rows.map(row => '<details><summary>' + escape(row.runtime + '/' + row.task) + ' 原件与失败</summary><pre>' + escape(JSON.stringify(row, null, 2)) + '</pre></details>').join(''))
await lock.close()
console.log(JSON.stringify({ root, directPassed: summary.directPassed, boaiPassed: summary.boaiPassed, pairs: plan.pairs, exitCode, frozenSourceChanged: verify.snapshotChanged.length }))
process.exitCode = exitCode || (summary.bothPassed !== plan.pairs || lifecycleProbe && !lifecycleProbe.passed || verify.snapshotChanged.length ? 1 : 0)
