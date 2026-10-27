/*
 * [INPUT]: 实际24项UI合同、两片摘要和工作流。
 * [OUTPUT]: 拒绝漏片/重复/旧合同/跨提交/不同环境及失败结果，保持全24项。
 * [POS]: 并行UI基础设施回归，不启动Electron。
 * [PROTOCOL]: 修改同步Header和tests/.folder.md。
 */
import { expect, it } from 'vitest'
import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'
// @ts-expect-error Shared Node protocol.
import { uiShardPlan, selectUiShard } from '../scripts/ui-shards.mjs'
// @ts-expect-error Shared Node gate.
import { validateUiShards } from '../scripts/ci-result.mjs'

const contract = JSON.parse(await readFile(new URL('e2e/baselines/contract.json', import.meta.url), 'utf8'))
const ids: string[] = contract.cases.map((item: { id: string }) => item.id)
const sha = 'a'.repeat(40), jobs = { ui: { result: 'success' } }
const summaries = () => [1, 2].map(index => {
  const shard = uiShardPlan(ids, index)
  return { shard, cases: shard.cases, status: 'passed', errors: [] as string[], source: { commit: sha, dirty: false, sourceHash: 'b'.repeat(64) }, built: { inputHash: 'c'.repeat(64), outputHash: String(index).repeat(64) }, profile: 'github-macos15-arm64', environment: { version: 3 }, node: 'v24.16.0' }
})
it('真实合同两片各12项，无重叠且覆盖原20项与新增定时任务4项，独立构建输出可不同', () => {
  const parts = summaries()
  expect(ids).toHaveLength(24)
  expect(parts.map(part => part.cases.length)).toEqual([12, 12])
  expect(parts.flatMap(part => part.cases).sort()).toEqual([...ids].sort())
  expect(new Set(parts.flatMap(part => part.cases)).size).toBe(24)
  expect(() => validateUiShards(jobs, parts, ids, sha)).not.toThrow()
})
it.each([0, 3, -1, 1.5, NaN])('拒绝非法编号%s', index => expect(() => uiShardPlan(ids, index)).toThrow())
it.each(['', '1/3', '3/2', '1', '01/2'])('拒绝任意分片参数%s', value => expect(() => selectUiShard(ids, value, 'check', 'github-macos15-arm64')).toThrow())
it('分片不能用于候选/本机或混用cases，未指定时保持原完整行为', () => {
  expect(selectUiShard(ids, undefined, 'check', 'github-macos15-arm64')).toBeUndefined()
  expect(selectUiShard(ids, '1/2', 'check', 'github-macos15-arm64')).toEqual(uiShardPlan(ids, 1))
  for (const command of ['candidate', 'candidate-ci', 'accept']) expect(() => selectUiShard(ids, '1/2', command, 'github-macos15-arm64')).toThrow()
  expect(() => selectUiShard(ids, '1/2', 'check', 'local')).toThrow()
  expect(() => selectUiShard(ids, '1/2', 'check', 'github-macos15-arm64', ids[0])).toThrow()
  expect(() => uiShardPlan([ids[0], ids[0]], 1)).toThrow()
})
it.each(['missing', 'duplicate', 'wrong-sha', 'dirty', 'missing-case', 'old-plan', 'swapped-cases', 'source', 'build', 'environment', 'profile', 'node', 'failure', 'errors'] as const)('%s不能取得完整资格', kind => {
  const parts = summaries(), second = parts[1]!
  if (kind === 'missing') parts.pop()
  if (kind === 'duplicate') second.shard = parts[0]!.shard
  if (kind === 'wrong-sha') second.source.commit = 'e'.repeat(40)
  if (kind === 'dirty') second.source.dirty = true
  if (kind === 'missing-case') second.cases = second.cases.slice(1)
  if (kind === 'old-plan') second.shard.planHash = 'e'.repeat(64)
  if (kind === 'swapped-cases') second.shard.cases = parts[0]!.shard.cases
  if (kind === 'source') second.source.sourceHash = 'e'.repeat(64)
  if (kind === 'build') second.built.inputHash = 'e'.repeat(64)
  if (kind === 'environment') second.environment.version = 2
  if (kind === 'profile') second.profile = 'local'
  if (kind === 'node') second.node = 'v22.0.0'
  if (kind === 'failure') second.status = 'failed'
  if (kind === 'errors') second.errors = ['failure']
  expect(() => validateUiShards(jobs, parts, ids, sha)).toThrow()
})
it.each(['failure', 'cancelled', 'skipped', undefined])('矩阵非成功%s保持阻断', result => expect(() => validateUiShards({ ui: { result } }, summaries(), ids, sha)).toThrow())
it('实际工作流同时执行两片，Required下载两份原件且使用分片门禁', async () => {
  const workflow = parse(await readFile(new URL('../.github/workflows/tests.yml', import.meta.url), 'utf8'))
  expect(workflow.jobs.ui.strategy).toEqual({ 'fail-fast': false, matrix: { shard: [1, 2] } })
  expect(workflow.jobs.ui.steps.find((step: { run?: string }) => step.run?.includes('ui-regression.mjs check')).run).toContain('--shard ${{ matrix.shard }}/2')
  expect(workflow.jobs.required.needs).toEqual(['ui'])
  expect(workflow.jobs.required.steps.filter((step: { uses?: string }) => step.uses?.startsWith('actions/download-artifact')).map((step: { with: { name: string } }) => step.with.name)).toEqual(['ui-1', 'ui-2'])
  expect(workflow.jobs.required.steps.some((step: { run?: string }) => step.run === 'node scripts/ci-result.mjs gate-shards')).toBe(true)
})
