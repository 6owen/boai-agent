/*
 * [INPUT]: 协议fixture：官方候选、分支SHA、线上上下文及Git API回执。
 * [OUTPUT]: 拒绝旧SHA/失败/普通CI/main；只提交指定基准，竞态不覆盖，写入后显式复验。
 * [POS]: 线上更新入口的权限/提交/触发回归，不冒充真实云端验收。
 * [PROTOCOL]: 修改同步Header及tests/.folder.md。
 */
import { expect, it, vi } from 'vitest'
// @ts-expect-error Plain Node CLI has no declaration file.
import { verifyOnlineUpdate, publishBaselineUpdate } from '../scripts/ui-baseline-update.mjs'

const repo = '6owen/boai-agent', sha = 'a'.repeat(40), next = 'b'.repeat(40)
const env = { GITHUB_REPOSITORY: repo, GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REF: 'refs/heads/main', GITHUB_WORKFLOW_REF: `${repo}/.github/workflows/ui-baseline-update.yml@refs/heads/main` }
const run = { head_sha: sha, head_branch: 'feat/reviewed-ui', repository: { full_name: repo }, head_repository: { full_name: repo }, path: '.github/workflows/ui-baseline-candidate.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success' }
const prefix = 'tests/e2e/baselines/github-macos15-arm64/'
const files = [{ path: prefix + 'manifest.json', content: Buffer.from('{}\n') }, { path: prefix + 'voice-settings-dark.png', content: Buffer.from('official fixture bytes') }]
const update = { branch: run.head_branch, expectedHead: sha, runId: '123', files }

it('只允许main受信更新入口处理已确认的当前SHA和成功候选', () => {
  expect(verifyOnlineUpdate(run, sha, sha, env)).toBe(run.head_branch)
  for (const patch of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REF: 'refs/heads/feature' }, { GITHUB_WORKFLOW_REF: `${repo}/.github/workflows/tests.yml@refs/heads/main` }, { GITHUB_REPOSITORY: 'fork/repo' }]) expect(() => verifyOnlineUpdate(run, sha, sha, { ...env, ...patch })).toThrow()
  for (const patch of [{ head_branch: 'main' }, { head_sha: next }, { conclusion: 'failure' }, { status: 'in_progress' }, { event: 'push' }, { head_repository: { full_name: 'fork/repo' } }, { path: '.github/workflows/tests.yml' }]) expect(() => verifyOnlineUpdate({ ...run, ...patch }, sha, sha, env)).toThrow()
  expect(() => verifyOnlineUpdate(run, next, sha, env)).toThrow('分支已变化')
  expect(() => verifyOnlineUpdate(run, sha, 'main', env)).toThrow()
})

function mockApi(options: { race?: boolean; pushFailure?: boolean; dispatchFailure?: boolean } = {}) {
  let reads = 0
  return vi.fn((path: string, body?: Record<string, unknown>) => {
    if (path.startsWith('git/ref/')) return { object: { sha: options.race && ++reads === 2 ? next : sha } }
    if (path === `git/commits/${sha}`) return { tree: { sha: 'old-tree' } }
    if (path === 'git/blobs') return { sha: 'blob' }
    if (path === 'git/trees') return { sha: 'new-tree' }
    if (path === 'git/commits') return { sha: next }
    if (path.startsWith('git/refs/')) { if (options.pushFailure) throw new Error('non-fast-forward'); return { object: { sha: body?.sha } } }
    if (path.endsWith('/dispatches')) { if (options.dispatchFailure) throw new Error('dispatch failed'); return null }
    throw new Error(`Unexpected API call: ${path}`)
  })
}

it('只把指定PNG和manifest加入原tree，正常提交后派发同分支只读CI', () => {
  const api = mockApi()
  expect(publishBaselineUpdate(update, api)).toBe(next)
  expect(api).toHaveBeenCalledWith('git/trees', { base_tree: 'old-tree', tree: files.map(file => ({ path: file.path, mode: '100644', type: 'blob', sha: 'blob' })) })
  expect(api).toHaveBeenCalledWith('git/commits', { message: 'test(ui): accept reviewed CI baselines from run 123', tree: 'new-tree', parents: [sha] })
  expect(api.mock.calls.slice(-2)).toEqual([[`git/refs/heads/${run.head_branch}`, { sha: next, force: false }], ['actions/workflows/tests.yml/dispatches', { ref: run.head_branch }]])
})

it('主分支和基准目录外文件在任何远程调用前拒绝', () => {
  const api = mockApi()
  for (const patch of [{ branch: 'main' }, { files: [] }, { files: [files[0], { ...files[1], path: 'apps/electron/src/main.ts' }] }, { files: [files[0], { ...files[1], path: prefix + '../other.png' }] }, { files: [files[0], files[0]] }]) expect(() => publishBaselineUpdate({ ...update, ...patch }, api)).toThrow()
  expect(api).not.toHaveBeenCalled()
})

it.each([{ race: true }, { pushFailure: true }])('并发源码推送或非快进拒绝时不派发成功复验：%j', options => {
  const api = mockApi(options)
  expect(() => publishBaselineUpdate(update, api)).toThrow()
  expect(api.mock.calls.some(([path]) => path.endsWith('/dispatches'))).toBe(false)
  if (options.race) expect(api.mock.calls.some(([path]) => path.startsWith('git/refs/'))).toBe(false)
})

it('基准已提交但派发失败时报告失败，不伪报CI已启动', () => {
  expect(() => publishBaselineUpdate(update, mockApi({ dispatchFailure: true }))).toThrow('dispatch failed')
})
