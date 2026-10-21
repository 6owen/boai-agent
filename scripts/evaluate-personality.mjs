/*
 * [OUTPUT]: 真实探路允许显式缩小请求上限，复测沿原批次剩余额度。
 * [OUTPUT]: 真实评估冻结完整随包技能目录并沿内置绑定加载脚本/参考文件，不再只复制正文。
 * [OUTPUT]: PPT真实技能评估冻结原模型/编译/素材worker与hash，实际草稿可运行原版编译；不注入视觉配置。
 * [OUTPUT]: 可显式冻结当前检索服务与偏好，独立凭据只经内存桥传递；搜索请求与模型请求分账。
 * [OUTPUT]: 脚本技能评估冻结实际员工工具库并在隔离AppService开放原员工RPC，不读取本人CLI配置。
 * [OUTPUT]: 情绪更新保留实际时间与来源，反思沿原记忆权限读取及失效；独立候选评估不修改预设。
 * [OUTPUT]: 可显式冻结独立反思候选文件，评估不改产品预设或当前员工配置。
 * [OUTPUT]: 反思较早漏日/当日笔记与来源失效、十技能绑定；实际与撤回候选归架构§11.22。
 * [OUTPUT]: 2026-10-20 Alma技能接线：普通聊天按需读绑定技能/有来源记忆，独立任务协议与MCP媒体保持实际授权；本轮证据归独立Agent架构§11.21。
 * [INPUT]: Explicit connection/data path and live or read-only stored Bobo snapshot; source freezes before calls.
 * [OUTPUT]: Zero-call sample preparation or isolated real AppService/Mastra evidence, at most 40 requests and 12 minutes; pending human review.
 * [POS]: Personality migration probe reusing tests/evaluation/host.ts; does not launch a product window or modify daily data.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { build } from 'esbuild'
import { spawn, fork, execFileSync } from 'node:child_process'
import { cp, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import electron from 'electron'
const [connectionId, dataPath, label, ...options] = process.argv.slice(2)
const requestLimit = options.find(value => value.startsWith('--max-requests='))?.slice('--max-requests='.length)
if (requestLimit !== undefined && (!/^\d+$/.test(requestLimit) || Number(requestLimit) < 1 || Number(requestLimit) > 40)) throw new Error('max-requests must be 1..40')
const reflectionFile = options.find(value => value.startsWith('--reflection-file='))?.slice('--reflection-file='.length)
const includeSkills = options.includes('--skills'), includeWebSearch = options.includes('--web-search'), currentProfile = options.includes('--current-profile'), candidateReflection = options.includes('--candidate-reflection'), caseSelection = options.find(value => !value.startsWith('--'))
const storedProfile = options.includes('--stored-profile'), prepareOnly = options.includes('--prepare-only')
const flagNames = options.filter(value => value.startsWith('--')).map(value => value.split('=')[0])
if (new Set(flagNames).size !== flagNames.length) throw new Error('Duplicate evaluation flag')
if (!connectionId || !dataPath || !/^[a-z0-9-]+$/.test(label ?? '') || options.length > 7 || options.filter(value => !value.startsWith('--')).length > 1 || options.some(value => value.startsWith('--') && !['--current-profile', '--stored-profile', '--prepare-only', '--skills', '--web-search', '--candidate-reflection'].includes(value) && !value.startsWith('--reflection-file=') && !value.startsWith('--max-requests=')) || (candidateReflection || reflectionFile) && !currentProfile && !storedProfile || includeWebSearch && !currentProfile || candidateReflection && reflectionFile || currentProfile && storedProfile || storedProfile && (includeSkills || includeWebSearch)) throw new Error('Usage: node scripts/evaluate-personality.mjs CONNECTION_ID DATA_PATH LABEL [CASE_IDS] [--current-profile | --stored-profile] [--prepare-only] [--max-requests=1..40] [--skills] [--web-search] [--candidate-reflection | --reflection-file=PATH]; stored snapshots do not include live skills/search capabilities')
const output = resolve(`.local/personality-evaluation/${label}-${Date.now()}`); await mkdir(output, { recursive: true, mode: 0o700 })
const settings = { output, connectionId, dataPath: resolve(dataPath), label, caseIds: caseSelection?.split(','), candidateReflection, maxRequests: requestLimit ? Number(requestLimit) : 40, deadlineMs: 720000, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone, hashes: {} }
if (reflectionFile) {
  settings.candidateReflectionText = await readFile(resolve(reflectionFile), 'utf8')
  if (!settings.candidateReflectionText.trim()) throw new Error('Empty reflection candidate')
  settings.candidateReflectionSource = { path: resolve(reflectionFile), sha256: createHash('sha256').update(settings.candidateReflectionText).digest('hex') }
}
if (currentProfile) {
  const call = (operation, input) => {
    const result = JSON.parse(execFileSync(process.execPath, ['dist/cli/index.mjs', 'app', 'call', operation, JSON.stringify(input), '--json'], { encoding: 'utf8' }))
    if (result.status !== 'succeeded') throw new Error('Cannot snapshot current Bobo configuration: ' + operation)
    return result.data
  }
  const agent = call('employees.get', { id: 'bobo' }), profile = call('employees.profile', { agentId: 'bobo' })
  if (agent.connectionId !== connectionId || agent.executionBackend && agent.executionBackend.kind !== 'mastra-model') throw new Error('The selected connection is not the current API Bobo connection')
  const home = call('employees.files', { agentId: 'bobo' })
  const files = home.files.filter(file => file.kind === 'source').map(file => call('employees.readFile', { agentId: 'bobo', name: file.name }))
  if (files.some(file => !['current', 'modified'].includes(file.status) || createHash('sha256').update(file.content).digest('hex') !== file.hash)) throw new Error('Current Bobo source cannot be frozen')
  const after = call('employees.get', { id: 'bobo' }), nextProfile = call('employees.profile', { agentId: 'bobo' })
  if (after.configVersion !== agent.configVersion || nextProfile.revision !== profile.revision) throw new Error('Current Bobo configuration changed while snapshotting; no model call made')
  settings.currentConfiguration = { capturedAt: new Date().toISOString(), agent: { configVersion: agent.configVersion, connectionId, modelId: agent.modelId }, profile, files: files.map(({ name, hash, content }) => ({ name, hash, content })) }
  if (includeWebSearch) {
    const web = call('webSearch.get', {})
    const preference = agent.webSearch && agent.webSearch.mode !== 'auto' ? agent.webSearch : web.default
    if (preference.mode !== 'service') throw new Error('This probe requires an explicitly selected search service; browser selection is not silently replaced')
    const selected = web.services.find(item => item.id === preference.serviceId)
    if (!selected?.enabled || !selected.pluginEnabled) throw new Error('Selected search service is unavailable')
    if (agent.webSearch?.allowedServiceIds && !agent.webSearch.allowedServiceIds.includes(selected.id)) throw new Error('Selected search service is outside employee scope')
    settings.webSearch = { service: selected, preference: agent.webSearch ?? { mode: 'auto' }, default: web.default, revision: web.revision }
    if (JSON.stringify(call('webSearch.get', {})) !== JSON.stringify(web) || call('employees.get', { id: 'bobo' }).configVersion !== agent.configVersion) throw new Error('Search configuration changed while snapshotting')
  }
}
if (storedProfile) {
  const helper = join(output, 'stored-profile.mjs')
  await build({ entryPoints: ['tests/evaluation/stored-profile.ts'], outfile: helper, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
  settings.currentConfiguration = await (await import(pathToFileURL(helper).href)).snapshotStoredProfile(settings.dataPath, connectionId)
}
if (includeSkills) {
  settings.skillSourceRoot = join(output, 'bundled-skills')
  await mkdir(settings.skillSourceRoot, { recursive: true })
  const manifest = JSON.parse(await readFile('resources/agent-skills/manifest.json', 'utf8'))
  settings.skills = []
  for (const name of manifest.skills) {
    const source = join('resources/agent-skills', name), destination = join(settings.skillSourceRoot, name)
    const members = (await readdir(source, { recursive: true })).filter(file => !file.split(/[\\/]/).includes('.folder.md')).sort()
    const files = []
    for (const file of members) {
      const info = await lstat(join(source, file))
      if (info.isSymbolicLink() || !info.isDirectory() && !info.isFile()) throw new Error('Skill source contains a non-regular file')
      if (info.isFile()) files.push(file)
    }
    await cp(source, destination, { recursive: true, filter: path => !path.endsWith('/.folder.md') })
    for (const file of files) {
      const path = join(source, file), bytes = await readFile(path)
      settings.hashes[path] = createHash('sha256').update(bytes).digest('hex')
      if (!bytes.equals(await readFile(join(destination, file)))) throw new Error('Frozen skill companion differs from source')
    }
    const content = await readFile(join(destination, 'SKILL.md'), 'utf8')
    settings.skills.push({ name, content, hash: createHash('sha256').update(content).digest('hex') })
  }
  const response = JSON.parse(execFileSync(process.execPath, ['dist/cli/index.mjs', 'app', 'call', 'sources.list', '{}', '--json'], { encoding: 'utf8' }))
  settings.computerSource = response.data?.find(source => source.name === 'BOAI Computer Use')
}
for (const directory of ['src/runtime', 'src/shared', 'src/cli']) for (const file of (await readdir(directory, { recursive: true })).sort().filter(file => /\.(ts|tsx)$/.test(file))) {
  const path = join(directory, file); settings.hashes[path] = createHash('sha256').update(await readFile(path)).digest('hex')
}
for (const path of ['pnpm-lock.yaml', 'tests/evaluation/personality.ts', 'tests/evaluation/stored-profile.ts', 'tests/evaluation/host.ts', 'scripts/evaluate-personality.mjs']) settings.hashes[path] = createHash('sha256').update(await readFile(path)).digest('hex')
const worker = join(output, 'worker.mjs'), host = join(output, 'host.cjs')
if (settings.caseIds?.some(id => id.startsWith('skill-presentations-'))) {
  const source = 'src/runtime/modules/presentations/alma'
  await cp(source, join(output, 'alma'), { recursive: true, filter: path => !path.endsWith('/.folder.md') })
  for (const entry of await readdir(source, { withFileTypes: true })) if (entry.isFile() && entry.name !== '.folder.md') {
    const path = join(source, entry.name), bytes = await readFile(path)
    settings.hashes[path] = createHash('sha256').update(bytes).digest('hex')
    if (!bytes.equals(await readFile(join(output, 'alma', entry.name)))) throw new Error('PPT评估worker分发内容不一致')
  }
}
if (settings.caseIds?.some(id => id.startsWith('skill-programmatic-'))) {
  settings.toolClientPath = join(output, 'employee-tools.mjs')
  await build({ entryPoints: ['src/cli/employee-tools.ts'], outfile: settings.toolClientPath, bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['bufferutil', 'utf-8-validate'], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" } })
  settings.toolClientHash = createHash('sha256').update(await readFile(settings.toolClientPath)).digest('hex')
}
await build({ stdin: { contents: `import { runPersonalityEvaluation, preparePersonalityEvaluation } from './tests/evaluation/personality.ts'; process.once('disconnect',()=>process.exit(1)); process.once('message',input=>(input.prepareOnly ? preparePersonalityEvaluation(input.settings) : runPersonalityEvaluation(input)).then(()=>process.exit(0),error=>{process.stderr.write(String(error.message)+'\\n');process.exit(1)}));`, resolveDir: process.cwd() }, outfile: worker, bundle: true, platform: 'node', format: 'esm', packages: 'external', target: 'node22' })
await build({ entryPoints: ['tests/evaluation/host.ts'], outfile: host, bundle: true, platform: 'node', format: 'cjs', packages: 'external', target: 'node22' })
for (const [path, hash] of Object.entries(settings.hashes)) if (createHash('sha256').update(await readFile(path)).digest('hex') !== hash) throw new Error('冻结期间源码变化；未启动模型调用')
settings.workerHash = createHash('sha256').update(await readFile(worker)).digest('hex')
await writeFile(join(output, 'settings.json'), JSON.stringify(settings, null, 2), { mode: 0o600 })
if (prepareOnly) {
  process.stdout.write(`Design review (zero provider requests): ${join(output, 'design-review.md')}\n`)
  const child = fork(worker, [], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
  child.send({ settings, prepareOnly: true })
  process.exitCode = await new Promise(resolveExit => child.once('exit', code => resolveExit(code ?? 1)))
  process.exit(process.exitCode)
}
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
process.stdout.write(`Evidence: ${output}\n`)
const child = spawn(electron, [host, join(output, 'settings.json'), worker], { stdio: 'inherit', env }); process.on('SIGINT', () => child.kill('SIGINT'))
process.exitCode = await new Promise(resolveExit => child.once('exit', code => resolveExit(code ?? 1)))
