/*
 * [INPUT]: 明确标为协议fixture的版本、主分支、GitHub验证及必需汇总身份。
 * [OUTPUT]: 跨SHA/脏树/版本分歧、候选/PR成功冒充发布、完整数组中的重复/缺失必需汇总均拒绝。
 * [POS]: 发布前检确定性负例；不调用GitHub、不创建Tag或运行安装包。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, it } from 'vitest'
// @ts-expect-error Plain Node release CLI has no declaration file.
import { verifyReleaseIdentity } from '../scripts/release-check.mjs'
const sha = 'a'.repeat(40), repo = '6owen/boai-agent'
const proof = { version: '0.2.4', sha, current: { sha, dirty: false }, metadata: { version: '0.2.4', build: { buildVersion: '0.2.4', appId: 'com.boai.agent', productName: 'BoAI Agent' } }, mainSha: sha, run: { id: 1, run_attempt: 2, repository: { full_name: repo }, head_repository: { full_name: repo }, event: 'push', head_branch: 'main', path: '.github/workflows/tests.yml', head_sha: sha, status: 'completed', conclusion: 'success' }, jobs: [{ id: 3, name: 'Required checks', status: 'completed', conclusion: 'success', completed_at: '2026-10-20T16:00:00Z' }] }
it('同一干净main提交、稳定版本及完整验证才可形成只读身份', () => expect(verifyReleaseIdentity(proof)).toMatchObject({ version: '0.2.4', tag: 'v0.2.4', sha, validation: { runId: 1, attempt: 2, requiredJobId: 3 } }))
it.each([
  { version: 'v0.2.4' }, { version: '01.2.4' }, { version: '0.2.4-beta.1' }, { version: '99999999999999999.2.4' }, { sha: 'short' },
  { mainSha: 'b'.repeat(40) }, { current: { sha, dirty: true } }, { current: { sha: 'b'.repeat(40), dirty: false } },
  { metadata: { ...proof.metadata, version: '0.2.3' } }, { metadata: { ...proof.metadata, build: { ...proof.metadata.build, buildVersion: '0.2.3' } } }, { metadata: { ...proof.metadata, build: { ...proof.metadata.build, appId: 'other' } } },
])('拒绝不明确或不一致版本/源码身份：%j', patch => expect(() => verifyReleaseIdentity({ ...proof, ...patch })).toThrow())
it.each([
  { event: 'pull_request' }, { path: '.github/workflows/ui-baseline-candidate.yml' }, { head_branch: 'feature' }, { head_sha: 'b'.repeat(40) }, { repository: { full_name: 'fork/boai-agent' } }, { head_repository: { full_name: 'fork/boai-agent' } }, { status: 'in_progress' }, { conclusion: 'cancelled' }, { run_attempt: 0 },
])('拒绝其他运行或未完成/失败验证：%j', patch => expect(() => verifyReleaseIdentity({ ...proof, run: { ...proof.run, ...patch } })).toThrow())
it.each([[], [...proof.jobs, ...proof.jobs], [{ ...proof.jobs[0], id: undefined }], [{ ...proof.jobs[0], conclusion: 'failure' }], [{ ...proof.jobs[0], completed_at: undefined }]].map(jobs => ({ jobs })))('缺失/重复/未成功的Required checks不能发布：%j', ({ jobs }) => expect(() => verifyReleaseIdentity({ ...proof, jobs })).toThrow('必需汇总缺失、重复或未通过'))
