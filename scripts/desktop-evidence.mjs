/*
 * [INPUT]: 本批原始报告/冻结选择、完整留证目录及原执行目录身份。
 * [OUTPUT]: 唯一对应清单、零缺口/错误和每次启动trace逐字节核验；支持原件完整搬移后复核。
 * [POS]: 桌面runner及本地/远程CI汇总共用原件门槛，不启动GUI。
 * [PROTOCOL]: 修改同步Header与scripts/.folder.md。
 */
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { lstat, readFile, readdir } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { assertDesktopReport, desktopReportRows } from './desktop-plan.mjs'

const within = (root, file) => { const part = relative(root, file); return part && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part) }
async function regular(root, file, limit) {
  if (!within(root, file)) throw new Error('原件越出本批目录')
  let path = root
  if (!(await lstat(root)).isDirectory() || (await lstat(root)).isSymbolicLink()) throw new Error('原件根目录不是普通目录')
  for (const part of relative(root, file).split(sep)) { path = join(path, part); if ((await lstat(path)).isSymbolicLink()) throw new Error('原件不能使用符号链接') }
  const info = await lstat(file)
  if (!info.isFile() || info.size > limit) throw new Error('原件不是普通文件或超过上限')
  return info
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')
export async function verifyDesktopEvidence(directory, report, selected, originalDirectory = directory) {
  directory = resolve(directory)
  if (!isAbsolute(originalDirectory)) throw new Error('缺少原执行目录身份')
  assertDesktopReport(report, selected)
  const scenarios = join(directory, 'review/scenarios'), entries = await readdir(scenarios, { withFileTypes: true })
  if (entries.length !== selected.length || entries.some(entry => !entry.isDirectory() || entry.isSymbolicLink())) throw new Error('场景留证清单缺失、重复或包含额外目录')
  const manifests = await Promise.all(entries.map(async entry => {
    const path = join(scenarios, entry.name, 'manifest.json'); await regular(directory, path, 16 * 1024 * 1024)
    const bytes = await readFile(path); return { path, bytes, value: JSON.parse(bytes.toString()) }
  }))
  const rows = desktopReportRows(report), proof = []
  for (const expected of selected) {
    const matches = manifests.filter(entry => entry.value.testId === expected.playwrightId)
    if (matches.length !== 1) throw new Error(`缺少唯一对应原件清单：${expected.id}`)
    const { path, bytes, value: manifest } = matches[0], row = rows.find(row => row.playwrightId === expected.playwrightId), test = row.tests[0], result = test.results[0]
    const started = Date.parse(manifest.startedAt), completed = Date.parse(manifest.completedAt), actualStart = Date.parse(result.startTime)
    if (manifest.schemaVersion !== 1 || manifest.project !== test.projectName || manifest.title !== expected.titles.at(-1) || JSON.stringify(manifest.titlePath) !== JSON.stringify([expected.file + '.spec.js', ...expected.titles]) || basename(manifest.location?.file ?? '') !== expected.file + '.spec.js' || manifest.location.line !== expected.line || manifest.retry !== 0 || manifest.repeatEachIndex !== 0 || manifest.status !== 'passed' || manifest.expectedStatus !== 'passed' || manifest.modelMode !== 'offline-protocol-or-fixture' || ![started, completed, actualStart].every(Number.isFinite) || started < actualStart || completed < started || completed > actualStart + result.duration + 1) throw new Error(`原件清单身份、时间或来源不对应：${expected.id}`)
    if (!['gaps', 'cleanupErrors', 'testErrors'].every(key => Array.isArray(manifest[key]) && !manifest[key].length) || !Number.isInteger(manifest.launchCount) || manifest.launchCount < 1 || !Array.isArray(manifest.evidence) || !manifest.evidence.some(item => item.kind === 'screenshot') || !Array.isArray(manifest.traces) || manifest.traces.length !== manifest.launchCount || new Set(manifest.traces.map(item => item.launch)).size !== manifest.launchCount || manifest.traces.some(item => !Number.isInteger(item.launch) || item.launch < 1 || item.launch > manifest.launchCount)) throw new Error(`原件有缺口、清理错误或缺少启动回放：${expected.id}`)
    const resources = []
    for (const item of [...manifest.evidence, ...manifest.traces]) {
      if (typeof item.path !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256 ?? '') || !Number.isSafeInteger(item.bytes) || item.bytes < 0 || !item.bytes && (item.kind === 'screenshot' || manifest.traces.includes(item))) throw new Error('原件登记不完整')
      let file
      if (isAbsolute(item.path)) { if (!within(originalDirectory, item.path)) throw new Error('原回放路径越出本批目录'); file = resolve(directory, relative(originalDirectory, item.path)) }
      else { file = resolve(dirname(path), item.path); if (!within(dirname(path), file)) throw new Error('场景相对原件越界') }
      const info = await regular(directory, file, 128 * 1024 * 1024), hash = createHash('sha256')
      for await (const chunk of createReadStream(file)) hash.update(chunk)
      if (info.size !== item.bytes || hash.digest('hex') !== item.sha256) throw new Error(`原件大小或hash不一致：${item.path}`)
      resources.push({ path: relative(directory, file), bytes: item.bytes, sha256: item.sha256 })
    }
    proof.push({ id: expected.id, manifest: relative(directory, path), sha256: sha256(bytes), resources })
  }
  return proof
}
