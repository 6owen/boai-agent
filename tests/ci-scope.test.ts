/*
 * [INPUT]: 真实临时Git提交/事件、开发Markdown白名单及job结果协议。
 * [OUTPUT]: 文档/完整/草稿暂缓按实际事件分流，未测试草稿和伪造范围不能合并；CI变更/手动/未知及真实Git全量差异不降级。
 * [POS]: CI范围与严格汇总的回归合同；只在授权云端执行，不开产品窗口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
// @ts-expect-error Shared plain Node CI module has no declaration file.
import { ciMode, scopeForEvent, validateDevelopmentMarkdown, validateDocumentation, validateScopeJobs } from '../scripts/ci-scope.mjs'

it.each(['README.md', 'AGENTS.md', 'CLAUDE.md', '.agents/skills/shared/SKILL.md', 'ai-docs/spec/新规范.md', 'src/runtime/.folder.md'])('仅开发Markdown允许轻量：%s', path => {
  expect(ciMode('pull_request', [path])).toBe('documentation')
  expect(ciMode('push', [path])).toBe('documentation')
})
it.each(['src/main/main.ts', 'package.json', 'pnpm-lock.yaml', '.github/workflows/tests.yml', 'tests/e2e/baselines/chat.png', 'tests/ci-scope.test.ts', '.agents/skills/shared/scripts/run.mjs', 'ai-docs/contract.json', 'src/runtime/prompt.md', '../README.md', '.agents/../package.json', 'README.md\nignored'])('任意混入程序/未知路径均完整执行：%s', path => expect(ciMode('pull_request', ['README.md', path])).toBe('full'))
it('手动、未知事件和空差异保留完整验证', () => {
  for (const event of ['workflow_dispatch', 'merge_group', undefined]) expect(ciMode(event, ['README.md'])).toBe('full')
  expect(ciMode('push', [])).toBe('full')
})

const sha = 'a'.repeat(40), head = 'b'.repeat(40), base = 'c'.repeat(40)
const scope = { sha, head, base, mode: 'documentation' }
const jobs = { changes: { result: 'success', outputs: { sha, head, base, full: 'false', mode: 'documentation' } }, desktop: { result: 'skipped' }, ui: { result: 'skipped' } }
it('实际文档范围及两产品任务明确skipped才取得文档资格', () => expect(() => validateScopeJobs(scope, jobs)).not.toThrow())
it.each([
  { ...jobs, changes: { ...jobs.changes, result: 'failure' } },
  { ...jobs, changes: { ...jobs.changes, outputs: { ...jobs.changes.outputs, sha: head } } },
  { ...jobs, changes: { ...jobs.changes, outputs: { ...jobs.changes.outputs, head: sha } } },
  { ...jobs, changes: { ...jobs.changes, outputs: { ...jobs.changes.outputs, base: sha } } },
  { ...jobs, changes: { ...jobs.changes, outputs: { ...jobs.changes.outputs, full: 'true' } } },
  { ...jobs, changes: { ...jobs.changes, outputs: { ...jobs.changes.outputs, mode: 'deferred' } } },
  { ...jobs, desktop: { result: 'failure' } },
  { ...jobs, ui: { result: 'cancelled' } },
  { ...jobs, ui: undefined },
])('错误/缺失原范围及任务结果不能授文档资格', actual => expect(() => validateScopeJobs(scope, actual)).toThrow())
it('源码范围不能凭产品任务skipped放行，仍要求两路success', () => {
  const full = { ...scope, mode: 'full' }, changed = { ...jobs.changes, outputs: { ...jobs.changes.outputs, full: 'true', mode: 'full' } }
  expect(() => validateScopeJobs(full, { ...jobs, changes: changed })).toThrow('产品任务')
  expect(() => validateScopeJobs(full, { changes: changed, desktop: { result: 'success' }, ui: { result: 'success' } })).not.toThrow()
})

it('草稿产品改动暂缓，Ready和明确标签恢复完整；文档仍按实际范围检查', () => {
  const paths = ['src/main/main.ts']
  expect(ciMode('pull_request', paths, { draft: true })).toBe('deferred')
  expect(ciMode('pull_request', paths, { draft: false })).toBe('full')
  expect(ciMode('pull_request', paths, { draft: true, labels: [{ name: 'ci:full' }] })).toBe('full')
  expect(ciMode('pull_request', paths, { draft: true, labels: [{ name: 'ui-preview' }] })).toBe('deferred')
  expect(ciMode('pull_request', ['README.md'], { draft: true })).toBe('documentation')
  expect(ciMode('pull_request', ['README.md'], { draft: true, labels: [{ name: 'ci:full' }] })).toBe('full')
  for (const event of ['push', 'workflow_dispatch']) expect(ciMode(event, paths, { draft: true })).toBe('full')
  expect(ciMode('pull_request', [], { draft: true })).toBe('full')
})
it.each(['.github/workflows/tests.yml', '.github/workflows/diagnostic.yml', 'scripts/ci-scope.mjs', 'scripts/ci-result.mjs', 'tests/ci-scope.test.ts'])('草稿也不能跳过CI机制本身的完整验证：%s', path => {
  expect(ciMode('pull_request', [path], { draft: true })).toBe('full')
})
it('草稿暂缓即使范围成功、产品明确skipped也不给合并资格', () => {
  const deferred = { ...scope, mode: 'deferred' }
  const actual = { ...jobs, changes: { ...jobs.changes, outputs: { ...jobs.changes.outputs, mode: 'deferred' } } }
  expect(() => validateScopeJobs(deferred, actual)).toThrow('尚未验证')
  expect(() => validateScopeJobs({ ...deferred, mode: 'full' }, actual)).toThrow('范围任务')
  expect(() => validateScopeJobs({ ...deferred, mode: 'documentation' }, actual)).toThrow('范围任务')
})

const header = '<!--\n[INPUT]: development\n[OUTPUT]: documentation\n[POS]: fixture\n[PROTOCOL]: update map\n-->\n'
const skillPath = '.agents/skills/shared/SKILL.md'
it('Skill基本元数据接受标准及引用名称，拒绝空描述、错误名及漏Header', () => {
  for (const name of ['shared', '"shared"', "'shared'"]) expect(() => validateDevelopmentMarkdown(skillPath, `---\nname: ${name}\ndescription: shared development\n---\n${header}`)).not.toThrow()
  for (const text of [`---\nname: other\ndescription: development\n---\n${header}`, `---\nname: shared\ndescription:\nlicense: MIT\n---\n${header}`, `---\nname: shared\ndescription: ''\n---\n${header}`, '---\nname: shared\ndescription: development\n---\n']) expect(() => validateDevelopmentMarkdown(skillPath, text)).toThrow()
})
it.each(['null', '~', '# comment', '[]', '{}', 'true', '12', '"   "'])('Skill实际描述必须是非空字符串而不是YAML值：%s', description => expect(() => validateDevelopmentMarkdown(skillPath, `---\nname: shared\ndescription: ${description}\n---\n${header}`)).toThrow('Skill基础'))
it('实际字符串允许引用保留字和YAML折叠描述，重复key或非法YAML拒绝', () => {
  for (const description of ['"null"', "'[]'", '>\n  shared\n  workflow']) expect(() => validateDevelopmentMarkdown(skillPath, `---\nname: shared\ndescription: ${description}\n---\n${header}`)).not.toThrow()
  for (const front of ['name: shared\ndescription: one\ndescription: two', 'name: shared\ndescription: [']) expect(() => validateDevelopmentMarkdown(skillPath, `---\n${front}\n---\n${header}`)).toThrow()
})

async function repository() {
  const root = await mkdtemp(join(tmpdir(), 'boai-ci-scope-'))
  const git = (args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git(['init', '--initial-branch=main'])
  const commit = async (files: Record<string, string>) => {
    for (const [path, content] of Object.entries(files)) { await mkdir(dirname(join(root, path)), { recursive: true }); await writeFile(join(root, path), content) }
    git(['add', '--all']); git(['-c', 'user.name=CI fixture', '-c', 'user.email=ci-fixture@example.invalid', 'commit', '-m', 'scope fixture'])
    return git(['rev-parse', 'HEAD'])
  }
  return { root, git, commit, close: () => rm(root, { recursive: true, force: true }) }
}
it('真实Git文档事件、初始push强制完整及错误checkout身份', async () => {
  const f = await repository()
  try {
    const before = await f.commit({ 'README.md': header }), after = await f.commit({ 'AGENTS.md': header })
    const event = { before, after }, actual = scopeForEvent(f.root, 'push', event, after)
    expect(actual.mode).toBe('documentation'); expect(actual.paths).toEqual(['AGENTS.md'])
    await expect(validateDocumentation(f.root, actual)).resolves.toBeUndefined()
    expect(scopeForEvent(f.root, 'push', { ...event, before: '0'.repeat(40) }, after).mode).toBe('full')
    expect(() => scopeForEvent(f.root, 'push', event, before)).toThrow('确切提交')
    expect(() => scopeForEvent(f.root, 'push', { ...event, after: before }, after)).toThrow('不匹配')
  } finally { await f.close() }
})
it('真实源文件移动到文档路径仍保留删除来源并要求完整CI', async () => {
  const f = await repository()
  try {
    const before = await f.commit({ 'src/worker.ts': 'export const alive = true\n' })
    await mkdir(join(f.root, 'ai-docs')); await rename(join(f.root, 'src/worker.ts'), join(f.root, 'ai-docs/worker.md'))
    const after = await f.commit({}), actual = scopeForEvent(f.root, 'pull_request', { pull_request: { base: { sha: before }, head: { sha: after } } }, after)
    expect(actual.paths).toContain('src/worker.ts'); expect(actual.paths).toContain('ai-docs/worker.md'); expect(actual.mode).toBe('full')
  } finally { await f.close() }
})
it('真实PR完整差异按草稿/标签/Ready切换，末次仅文档提交不能掩盖已有代码', async () => {
  const f = await repository()
  try {
    const before = await f.commit({ 'README.md': header })
    await f.commit({ 'src/worker.ts': 'export const alive = true\n' })
    const after = await f.commit({ 'AGENTS.md': header })
    const pr = { base: { sha: before }, head: { sha: after }, draft: true, labels: [] as { name: string }[] }
    const detect = () => scopeForEvent(f.root, 'pull_request', { pull_request: pr }, after)
    expect(detect().paths).toContain('src/worker.ts')
    expect(detect().mode).toBe('deferred')
    pr.labels = [{ name: 'ci:full' }]; expect(detect().mode).toBe('full')
    pr.labels = []; expect(detect().mode).toBe('deferred')
    pr.draft = false; expect(detect().mode).toBe('full')
  } finally { await f.close() }
})
it('真实CLI草稿检查成功但必需汇总非零，输出保留未测事实且不产生产品资格', async () => {
  const f = await repository()
  try {
    const before = await f.commit({ 'README.md': header })
    const after = await f.commit({ 'src/worker.ts': 'export const alive = true\n' })
    const eventPath = join(f.root, 'event.json'), outputPath = join(f.root, 'outputs'), summaryPath = join(f.root, 'summary.md')
    await writeFile(eventPath, JSON.stringify({ pull_request: { base: { sha: before }, head: { sha: after }, draft: true } }))
    const env = { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_EVENT_NAME: 'pull_request', GITHUB_SHA: after, GITHUB_OUTPUT: outputPath, GITHUB_STEP_SUMMARY: summaryPath }
    const script = fileURLToPath(new URL('../scripts/ci-scope.mjs', import.meta.url))
    const detect = spawnSync(process.execPath, [script, 'detect'], { cwd: f.root, env, encoding: 'utf8' })
    expect(detect.status, detect.stderr).toBe(0)
    const outputs = Object.fromEntries((await readFile(outputPath, 'utf8')).trim().split('\n').map(line => line.split('=')))
    expect(outputs).toMatchObject({ full: 'false', mode: 'deferred', sha: after, head: after, base: before })
    const actual = { changes: { result: 'success', outputs }, desktop: { result: 'skipped' }, ui: { result: 'skipped' } }
    const gate = spawnSync(process.execPath, [script, 'gate'], { cwd: f.root, env: { ...env, CI_JOB_RESULTS: JSON.stringify(actual) }, encoding: 'utf8' })
    expect(gate.status).toBe(1)
    expect(gate.stderr).toContain('尚未验证')
    expect(await readFile(summaryPath, 'utf8')).toContain('Not merge eligible')
    expect(await readFile(summaryPath, 'utf8')).toContain('product tests were NOT run')
  } finally { await f.close() }
})
it('真实超过300项文档差异的末端代码仍会强制完整CI', async () => {
  const f = await repository()
  try {
    const before = await f.commit({ 'README.md': header })
    const files = Object.fromEntries(Array.from({ length: 301 }, (_, i) => [`ai-docs/${i}.md`, header])); files['src/last.ts'] = 'export const included = true\n'
    const after = await f.commit(files), actual = scopeForEvent(f.root, 'push', { before, after }, after)
    expect(actual.paths).toHaveLength(302); expect(actual.paths).toContain('src/last.ts'); expect(actual.mode).toBe('full')
  } finally { await f.close() }
})
