/*
 * [INPUT]: 真实临时Git提交/事件、开发Markdown白名单及job结果协议。
 * [OUTPUT]: 混入产品/配置、重命名、超过300文件、范围失败/旧SHA/错误跳过均不授轻量资格；真实YAML空值/集合/布尔描述直接拒绝。
 * [POS]: CI范围与严格汇总的回归合同；只在授权云端执行，不开产品窗口。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
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
const jobs = { changes: { result: 'success', outputs: { sha, head, base, full: 'false' } }, desktop: { result: 'skipped' }, ui: { result: 'skipped' } }
it('实际文档范围及两产品任务明确skipped才取得文档资格', () => expect(() => validateScopeJobs(scope, jobs)).not.toThrow())
it.each([
  { ...jobs, changes: { ...jobs.changes, result: 'failure' } },
  { ...jobs, changes: { ...jobs.changes, outputs: { ...jobs.changes.outputs, sha: head } } },
  { ...jobs, changes: { ...jobs.changes, outputs: { ...jobs.changes.outputs, head: sha } } },
  { ...jobs, changes: { ...jobs.changes, outputs: { ...jobs.changes.outputs, base: sha } } },
  { ...jobs, changes: { ...jobs.changes, outputs: { ...jobs.changes.outputs, full: 'true' } } },
  { ...jobs, desktop: { result: 'failure' } },
  { ...jobs, ui: { result: 'cancelled' } },
  { ...jobs, ui: undefined },
])('错误/缺失原范围及任务结果不能授文档资格', actual => expect(() => validateScopeJobs(scope, actual)).toThrow())
it('源码范围不能凭产品任务skipped放行，仍要求两路success', () => {
  const full = { ...scope, mode: 'full' }, changed = { ...jobs.changes, outputs: { ...jobs.changes.outputs, full: 'true' } }
  expect(() => validateScopeJobs(full, { ...jobs, changes: changed })).toThrow('产品任务')
  expect(() => validateScopeJobs(full, { changes: changed, desktop: { result: 'success' }, ui: { result: 'success' } })).not.toThrow()
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
it('真实超过300项文档差异的末端代码仍会强制完整CI', async () => {
  const f = await repository()
  try {
    const before = await f.commit({ 'README.md': header })
    const files = Object.fromEntries(Array.from({ length: 301 }, (_, i) => [`ai-docs/${i}.md`, header])); files['src/last.ts'] = 'export const included = true\n'
    const after = await f.commit(files), actual = scopeForEvent(f.root, 'push', { before, after }, after)
    expect(actual.paths).toHaveLength(302); expect(actual.paths).toContain('src/last.ts'); expect(actual.mode).toBe('full')
  } finally { await f.close() }
})
