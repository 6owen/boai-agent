/*
 * [INPUT]: GitHub真实事件/提交、完整Git差异、PR草稿/ci:full标签及各job结果。
 * [OUTPUT]: 文档轻量、草稿暂缓和完整验证分流；独立核身份/范围并列明异常任务及预期/实际状态，草稿未测拒绝合并，CI配置/手动保持完整门禁。
 * [POS]: 云端CI范围与开发文档合同，不执行产品、安装依赖或修改基线。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { execFileSync } from 'node:child_process'
import { appendFile, readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { basename, dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const shaPattern = /^[a-f0-9]{40}$/
const git = (root, args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
export function developmentMarkdown(path) {
  if (typeof path !== 'string' || path.split('/').some(part => !part || part === '.' || part === '..') || /[\\\x00-\x1f\x7f]/.test(path)) return false
  return ['README.md', 'AGENTS.md', 'CLAUDE.md'].includes(path) || basename(path) === '.folder.md' || /^(?:\.agents|ai-docs)\/.+\.md$/.test(path)
}
export function ciMode(eventName, paths, pullRequest = {}) {
  if (!['pull_request', 'push'].includes(eventName) || !paths.length) return 'full'
  const forceFull = eventName === 'pull_request' && pullRequest.labels?.some(label => label.name === 'ci:full')
  if (forceFull) return 'full'
  if (paths.every(developmentMarkdown)) return 'documentation'
  // Changes to the mechanism that selects/executes CI must validate themselves,
  // even in a draft. Other draft product changes remain explicitly unqualified.
  const changesCI = paths.some(path => /^(?:\.github\/|scripts\/ci-|tests\/ci-)/.test(path))
  return eventName === 'pull_request' && pullRequest.draft === true && !changesCI ? 'deferred' : 'full'
}
export function scopeForEvent(root, eventName, event, sha) {
  if (!shaPattern.test(sha ?? '') || git(root, ['rev-parse', 'HEAD']).trim() !== sha) throw Error('CI checkout不是事件确切提交')
  let base = null, head = sha, range = null
  if (eventName === 'pull_request') {
    base = event.pull_request?.base?.sha; head = event.pull_request?.head?.sha
    if (!shaPattern.test(base ?? '') || !shaPattern.test(head ?? '')) throw Error('PR缺少确切base/head')
    range = `${base}...${head}`
  } else if (eventName === 'push') {
    if (event.after !== sha) throw Error('push事件与实际提交不匹配')
    if (shaPattern.test(event.before ?? '') && !/^0+$/.test(event.before)) { base = event.before; range = `${base}..${head}` }
  }
  // --no-renames retains both the deleted source and added destination. Git's
  // complete NUL-delimited diff avoids the API/path-filter 300-file cutoff.
  const paths = range ? git(root, ['diff', '--name-only', '--no-renames', '-z', range, '--']).split('\0').filter(Boolean) : []
  return { version: 1, sha, base, head, range, paths, mode: ciMode(eventName, paths, event.pull_request) }
}
export function validateDevelopmentMarkdown(path, content) {
  if (!['[INPUT]:', '[OUTPUT]:', '[POS]:', '[PROTOCOL]:'].every(field => content.includes(field))) throw Error(`开发文档缺少Header字段：${path}`)
  if (basename(path) !== 'SKILL.md') return
  const front = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)?.[1]
  const require = createRequire(process.env.BOAI_CI_YAML_PACKAGE || new URL('../package.json', import.meta.url))
  const metadata = front && require('yaml').parse(front)
  if (!metadata || Array.isArray(metadata) || typeof metadata !== 'object' || typeof metadata.name !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(metadata.name) || metadata.name.length > 64 || metadata.name !== basename(dirname(path)) || typeof metadata.description !== 'string' || !metadata.description.trim()) throw Error(`Skill基础name/description或目录名不合格：${path}`)
}
export async function validateDocumentation(root, scope) {
  if (scope.mode !== 'documentation' || !scope.range || !scope.paths.length || !scope.paths.every(developmentMarkdown)) throw Error('不是完整开发文档差异')
  git(root, ['diff', '--check', scope.range, '--'])
  for (const path of scope.paths) {
    const entry = git(root, ['ls-tree', '-z', scope.head, '--', path])
    if (!entry) continue // A deleted Markdown file has no current content.
    if (!entry.startsWith('100644 blob ')) throw Error(`开发文档须为非可执行普通文件：${path}`)
    validateDevelopmentMarkdown(path, git(root, ['show', `${scope.head}:${path}`]))
  }
}
export function validateScopeJobs(scope, jobs) {
  if (!['documentation', 'deferred', 'full'].includes(scope.mode)) throw Error('未知CI范围')
  const expected = { full: String(scope.mode === 'full'), mode: scope.mode, sha: scope.sha, base: scope.base ?? '', head: scope.head }
  if (jobs.changes?.result !== 'success' || Object.entries(expected).some(([key, value]) => (jobs.changes.outputs?.[key] ?? '') !== value)) throw Error('范围任务失败或提交/范围输出不匹配')
  const status = scope.mode === 'full' ? 'success' : 'skipped'
  const mismatches = Object.entries({ desktop: 'Engineering and desktop', ui: 'UI regression' })
    .filter(([id]) => jobs[id]?.result !== status)
    .map(([id, name]) => `${name} (${id})=${jobs[id]?.result ?? 'missing'}，预期 ${status}`)
  if (mismatches.length) throw Error(`产品任务未满足 CI 范围 ${scope.mode}：${mismatches.join('；')}。请查看对应任务日志中的首个失败步骤或未执行原因。`)
  if (scope.mode === 'deferred') throw Error('Draft产品改动尚未验证，不能合并。转为Ready for review或添加ci:full标签以执行完整CI。')
}
async function main() {
  const command = process.argv[2], root = process.cwd()
  if (!['detect', 'gate'].includes(command)) throw Error('用法：ci-scope.mjs detect|gate')
  const event = JSON.parse(await readFile(process.env.GITHUB_EVENT_PATH, 'utf8'))
  const scope = scopeForEvent(root, process.env.GITHUB_EVENT_NAME, event, process.env.GITHUB_SHA)
  if (scope.mode === 'documentation') await validateDocumentation(root, scope)
  if (scope.mode === 'deferred') git(root, ['diff', '--check', scope.range, '--'])
  const outputs = { full: String(scope.mode === 'full'), mode: scope.mode, sha: scope.sha, base: scope.base ?? '', head: scope.head }
  await appendFile(process.env.GITHUB_OUTPUT, Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join(''))
  const message = scope.mode === 'documentation' ? 'Development documentation checks passed; product tests were not run.'
    : scope.mode === 'deferred' ? 'Draft iteration checks only; product tests were NOT run. Not merge eligible. Mark ready for review or add ci:full to run full CI.'
      : 'Full product CI required; engineering/T1/UI originals remain mandatory.'
  console.log(JSON.stringify({ ...scope, message }))
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `### CI scope: ${scope.mode}\n\n${message}\n\nCommit: \`${scope.sha}\`; changed paths: ${scope.paths.length}.\n`)
  if (command === 'gate') validateScopeJobs(scope, JSON.parse(process.env.CI_JOB_RESULTS ?? '{}'))
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(error => { console.error(String(error)); process.exitCode = 1 })
