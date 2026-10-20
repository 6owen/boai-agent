/*
 * [INPUT]: 明确GitHub手动采集run、官方artifact摘要、当前干净源码及逐项审阅后的接受命令。
 * [OUTPUT]: 官方原件重新下载核验；共锁接受仅选中CI条目并保留其他来源，初始/环境迁移须全量。
 * [POS]: 开发侧CI基线进口；无远程写入、无自动晋升或Required checks资格。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream, openSync, closeSync } from 'node:fs'
import { mkdir, readFile, writeFile, readdir, copyFile, lstat } from 'node:fs/promises'
import { join, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceIdentity, baselineContractHash, validateReport } from './ui-regression.mjs'
import { buildInputHash } from './build-identity.mjs'
import { verifyBaselineReview } from './ui-baseline-review.mjs'
import { CI_PROFILE, uiProfile, readUiBaseline } from './ui-profiles.mjs'
import { acquireResourceLock } from './resource-lock.mjs'

const repository = '6owen/boai-agent'
const json = async path => JSON.parse(await readFile(path, 'utf8'))
const hash = bytes => createHash('sha256').update(bytes).digest('hex')
const api = path => JSON.parse(execFileSync('gh', ['api', `repos/${repository}/${path}`], { encoding: 'utf8', timeout: 30_000, maxBuffer: 2 * 1024 * 1024 }))
export function verifyCandidateRun(run, artifacts, current, runId) {
  const trigger = run.event === 'workflow_dispatch' || run.event === 'push' && run.head_branch === 'infra/ui-environment-profiles'
  if (String(run.id) !== String(runId) || run.repository?.full_name !== repository || run.head_repository?.full_name !== repository || run.path !== '.github/workflows/ui-baseline-candidate.yml' || !trigger || run.status !== 'completed' || run.conclusion !== 'success' || run.head_sha !== current.commit || current.dirty) throw new Error('采集run不是当前干净SHA的受信独立采集结果')
  const found = artifacts.filter(item => item.name === `ui-candidate-${CI_PROFILE}`)
  if (found.length !== 1) throw new Error('缺少唯一CI候选artifact')
  const artifact = found[0]
  if (artifact.expired || !/^sha256:[a-f0-9]{64}$/.test(artifact.digest ?? '') || artifact.workflow_run?.head_sha !== run.head_sha || artifact.size_in_bytes <= 0 || artifact.size_in_bytes > 600 * 1024 * 1024) throw new Error('候选artifact过期、摘要/来源或大小不合法')
  return artifact
}
export function verifyCandidateIdentity(candidate, run, current, ids, inputHash) {
  if (candidate.profile !== CI_PROFILE || candidate.source?.commit !== current.commit || candidate.source?.sourceHash !== current.sourceHash || candidate.source?.dirty !== false || candidate.ci?.repository !== repository || candidate.ci?.runId !== String(run.id) || candidate.ci?.attempt !== String(run.run_attempt) || candidate.ci?.sha !== run.head_sha || candidate.ci?.workflow !== `${repository}/.github/workflows/ui-baseline-candidate.yml@refs/heads/${run.head_branch}`) throw new Error('候选身份与官方run/源码不匹配')
  if (candidate.environment?.version !== 2 || candidate.environment.platform !== 'darwin' || candidate.environment.arch !== 'arm64' || candidate.environment.osVersion?.split('.')[0] !== '15' || candidate.built?.version !== 1 || candidate.built.inputHash !== inputHash || !/^[a-f0-9]{64}$/.test(candidate.built.outputHash ?? '')) throw new Error('候选构建或环境不完整')
  if (JSON.stringify(candidate.selected) !== JSON.stringify(ids) || Object.keys(candidate.cases ?? {}).sort().join() !== [...ids].sort().join()) throw new Error('候选没有覆盖全部登记UI场景')
}
export function planCiBaselineManifest(candidate, ids, selected, previous, provenance, reason) {
  if (!selected.length || new Set(selected).size !== selected.length || selected.some(id => !ids.includes(id))) throw new Error('接受场景为空、重复或未登记')
  if (previous && (previous.version !== 1 || previous.profile !== CI_PROFILE)) throw new Error('原CI档案身份不合法')
  const migration = !previous || JSON.stringify(previous.environment) !== JSON.stringify(candidate.environment)
  if (migration && selected.length !== ids.length) throw new Error('初始CI基线或环境迁移必须接受全部登记场景')
  for (const id of ids.filter(id => !selected.includes(id))) {
    if (!previous.cases?.[id] || previous.cases[id].contract !== candidate.cases[id].contract) throw new Error(`未接受的场景缺基线或合同变化：${id}`)
  }
  const manifest = migration ? { version: 1, profile: CI_PROFILE, environment: candidate.environment, provenance, cases: {} } : { ...previous, cases: { ...previous.cases } }
  for (const id of selected) manifest.cases[id] = { ...candidate.cases[id], source: candidate.source, built: candidate.built, provenance, reason, candidate: candidate.id, acceptedAt: new Date().toISOString() }
  return manifest
}
async function tree(directory, base = directory) {
  const rows = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name), key = relative(base, path)
    if (key === 'github-provenance.json') continue
    if (entry.isDirectory()) rows.push(...await tree(path, base))
    else { if (!entry.isFile()) throw new Error('候选不能含链接/特殊文件'); rows.push([key, hash(await readFile(path))]) }
  }
  return rows.sort((a, b) => a[0].localeCompare(b[0]))
}
export function unpackCandidateArchive(archive, output) {
  const unpack = `import zipfile,sys,stat,pathlib,shutil
archive,output=sys.argv[1:];root=pathlib.Path(output)
with zipfile.ZipFile(archive) as z:
 entries=z.infolist();seen=set()
 if len(entries)>10000 or sum(e.file_size for e in entries)>2*1024**3:raise ValueError('archive too large')
 for e in entries:
  path=pathlib.PurePosixPath(e.filename)
  if not e.filename or path.is_absolute() or '..' in path.parts or '\\\\' in e.filename or e.filename in seen or stat.S_ISLNK(e.external_attr>>16):raise ValueError('unsafe archive entry')
  seen.add(e.filename)
 for e in entries:
  target=root/e.filename
  if e.is_dir():target.mkdir(parents=True,exist_ok=True)
  else:
   target.parent.mkdir(parents=True,exist_ok=True)
   with z.open(e) as source,target.open('xb') as dest:shutil.copyfileobj(source,dest)
`
  execFileSync('python3', ['-c', unpack, archive, output], { timeout: 120_000 })
}
async function download(root, runId, output) {
  const current = await sourceIdentity(root), run = api(`actions/runs/${runId}`)
  const artifact = verifyCandidateRun(run, api(`actions/runs/${runId}/artifacts?per_page=100`).artifacts, current, runId)
  await mkdir(output) // Must be new; never merge a fresh artifact into old evidence.
  const archive = `${output}.zip`, fd = openSync(archive, 'wx', 0o600)
  try { execFileSync('gh', ['api', `repos/${repository}/actions/artifacts/${artifact.id}/zip`], { stdio: ['ignore', fd, 'pipe'], timeout: 180_000 }) } finally { closeSync(fd) }
  const digest = createHash('sha256'); for await (const chunk of createReadStream(archive)) digest.update(chunk)
  if (`sha256:${digest.digest('hex')}` !== artifact.digest) throw new Error('下载archive与GitHub摘要不符')
  unpackCandidateArchive(archive, output)
  const candidate = await json(join(output, 'candidate.json')), contract = await json(join(root, 'tests/e2e/baselines/contract.json')), ids = contract.cases.map(item => item.id)
  verifyCandidateIdentity(candidate, run, current, ids, await buildInputHash(root))
  if (validateReport(await json(join(output, 'capture/playwright.json')), ids).status !== 'passed' || (await json(join(output, 'capture/summary.json'))).status !== 'passed') throw new Error('候选真实场景未全部一次通过')
  for (const id of ids) if (candidate.cases[id].contract !== baselineContractHash(contract, id) || hash(await readFile(join(output, 'snapshots', `${id}.png`))) !== candidate.cases[id].sha256) throw new Error(`候选字节/合同错误：${id}`)
  const provenance = { version: 1, runId: String(run.id), attempt: run.run_attempt, commit: run.head_sha, artifactId: artifact.id, digest: artifact.digest }
  await writeFile(join(output, 'github-provenance.json'), JSON.stringify(provenance, null, 2) + '\n', { flag: 'wx' })
  return { candidate, ids, provenance, source: current }
}
async function main() {
  if (process.env.CI) throw new Error('CI不允许进口/接受基线')
  const root = resolve(fileURLToPath(new URL('..', import.meta.url))), [command, ...args] = process.argv.slice(2), options = {}
  for (let i = 0; i < args.length; i += 2) { if (!['--run', '--output', '--candidate', '--cases', '--reason'].includes(args[i]) || !args[i + 1] || options[args[i]]) throw new Error('参数缺失/重复/未知'); options[args[i]] = args[i + 1] }
  if (!['import', 'accept'].includes(command) || !/^\d+$/.test(options['--run'] ?? '')) throw new Error('用法：ui-ci-baseline.mjs import --run ID --output 新目录 | accept --run ID --candidate 已审阅目录 --cases 明确ID --reason 原因')
  if (command === 'import') { if (!options['--output']) throw new Error('缺少output'); const result = await download(root, options['--run'], resolve(options['--output'])); console.log(JSON.stringify(result.provenance)); return }
  if (!options['--candidate'] || !options['--cases'] || !options['--reason']) throw new Error('接受需明确已审阅候选、逐项ID及原因')
  await mkdir(join(root, '.local'), { recursive: true })
  const release = acquireResourceLock(join(root, '.local/ui-regression-lock.sqlite'))
  try {
  const reviewed = resolve(options['--candidate'])
  if (!(await lstat(reviewed)).isDirectory() || (await lstat(reviewed)).isSymbolicLink()) throw new Error('候选须为普通目录')
  const fresh = join(root, '.local', `ui-ci-verify-${randomUUID()}`)
  const result = await download(root, options['--run'], fresh), { candidate, ids } = result
  if (JSON.stringify(await json(join(reviewed, 'github-provenance.json'))) !== JSON.stringify(result.provenance) || JSON.stringify(await tree(reviewed)) !== JSON.stringify(await tree(fresh))) throw new Error('已审阅原件与重新下载的官方artifact不符')
  const selected = options['--cases'].split(',')
  const baseline = uiProfile(root, CI_PROFILE, {}).directory
  const previous = await json(join(baseline, 'manifest.json')).catch(error => { if (error.code === 'ENOENT') return null; throw error })
  const manifest = planCiBaselineManifest(candidate, ids, selected, previous, result.provenance, options['--reason'])
  for (const id of ids.filter(id => !selected.includes(id))) await readUiBaseline({ id: CI_PROFILE, directory: baseline }, candidate.environment, id, candidate.cases[id].contract)
  await verifyBaselineReview(fresh, selected, baseline, candidate)
  if (JSON.stringify(await sourceIdentity(root)) !== JSON.stringify(result.source)) throw new Error('接受期间源码变化')
  await mkdir(baseline, { recursive: true })
  for (const id of selected) await copyFile(join(fresh, 'snapshots', `${id}.png`), join(baseline, `${id}.png`))
  await writeFile(join(baseline, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  console.log('已接受明确审阅的CI候选；仍需提交后再次只读比较，Required checks未由此通过。')
  } finally { release() }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(error => { console.error(String(error)); process.exitCode = 1 })
