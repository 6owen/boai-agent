/*
 * [OUTPUT]: 显示器尺寸/工作区/缩放变化拒绝复用旧截图；本机CI显式只读，GitHub上下文仍拒绝本机档案。
 * [INPUT]: 实际独立目录/冻结PNG字节及GitHub运行上下文负例。
 * [OUTPUT]: 本地CLI不能写CI档案；逐case/旧整体官方来源绑定和字节核验，普通CI或PR不能生成候选。
 * [POS]: 环境档案门槛验收；不启动GUI、不证明实际像素通过。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
// @ts-expect-error Plain Node policy has no declaration file.
import { uiProfile, assertCaptureMode, readUiBaseline, manualCiCapture, LOCAL_PROFILE, CI_PROFILE } from '../scripts/ui-profiles.mjs'
let root: string
const environment = { version: 2, font: 'fixed' }, bytes = Buffer.from('accepted bytes'), sha256 = createHash('sha256').update(bytes).digest('hex')
beforeEach(async () => { root = await mkdtemp(join(tmpdir(), 'boai-ui-profiles-')) })
afterEach(async () => { await rm(root, { recursive: true, force: true }) })
const manual = { CI: 'true', GITHUB_ACTIONS: 'true', GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: '6owen/boai-agent', GITHUB_WORKFLOW_REF: '6owen/boai-agent/.github/workflows/ui-baseline-candidate.yml@refs/heads/infra/ui-environment-profiles', GITHUB_RUN_ID: '1', GITHUB_RUN_ATTEMPT: '1', GITHUB_SHA: 'a'.repeat(40), RUNNER_OS: 'macOS', RUNNER_ARCH: 'ARM64' }
it('CI必须显式指定独立档案，未知名称/本机默认不能回退', () => {
  for (const id of [undefined, LOCAL_PROFILE, '../local', 'unknown']) expect(() => uiProfile(root, id, { CI: 'true' })).toThrow()
  expect(uiProfile(root, CI_PROFILE, { CI: 'true' }).directory).toBe(join(root, 'tests/e2e/baselines', CI_PROFILE))
})
it('本机CI明确档案只读，不能作为GitHub或基线写入旁路', () => {
  const local = { CI: '1', BOAI_UI_EXECUTION: 'local-ci' }
  expect(uiProfile(root, LOCAL_PROFILE, local).id).toBe(LOCAL_PROFILE)
  for (const id of [undefined, CI_PROFILE]) expect(() => uiProfile(root, id, local)).toThrow()
  for (const patch of [{ GITHUB_ACTIONS: 'true' }, { GITHUB_REPOSITORY: '6owen/boai-agent' }, { GITHUB_RUN_ID: '1' }]) expect(() => uiProfile(root, LOCAL_PROFILE, { ...local, ...patch })).toThrow()
  for (const command of ['candidate', 'accept', 'candidate-ci']) expect(() => assertCaptureMode(command, local)).toThrow()
  expect(() => assertCaptureMode('check', { ...local, BOAI_UI_CANDIDATE_DIR: '/tmp/candidate' })).toThrow()
})
it('独立手动采集可以写隔离候选，普通CI和PR均拒绝', () => {
  expect(manualCiCapture(manual)).toBe(true); expect(() => assertCaptureMode('candidate-ci', manual)).not.toThrow()
  for (const command of ['candidate', 'accept']) expect(() => assertCaptureMode(command, manual)).toThrow()
  for (const patch of [{ GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_WORKFLOW_REF: '6owen/boai-agent/.github/workflows/tests.yml@refs/heads/main' }, { GITHUB_REPOSITORY: 'fork/boai-agent' }, { GITHUB_SHA: '' }, { RUNNER_ARCH: 'X64' }]) {
    const env = { ...manual, ...patch, BOAI_UI_CAPTURE_MODE: 'manual-github', BOAI_UI_CANDIDATE_DIR: '/tmp/candidate' }
    expect(() => assertCaptureMode('candidate-ci', env)).toThrow(); expect(() => assertCaptureMode('check', env)).toThrow()
  }
  expect(() => assertCaptureMode('candidate-ci', { ...manual, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/infra/ui-environment-profiles' })).not.toThrow()
  expect(() => assertCaptureMode('candidate-ci', { ...manual, GITHUB_EVENT_NAME: 'push', GITHUB_REF: 'refs/heads/main' })).toThrow()
})
it.each(['candidate', 'accept'])('本地%s不能旁路官方artifact向CI档案写基线', command => {
  const child = spawnSync(process.execPath, ['scripts/ui-regression.mjs', command, '--profile', CI_PROFILE], { encoding: 'utf8', env: { ...process.env, CI: '' } })
  expect(child.status).toBe(1); expect(child.stderr).toContain('本地候选/接受只能使用本机档案')
})
async function baseline(id = LOCAL_PROFILE, patch = {}) {
  const profile = uiProfile(root, id, {}); await mkdir(profile.directory, { recursive: true })
  await writeFile(join(profile.directory, 'case.png'), bytes)
  await writeFile(join(profile.directory, 'manifest.json'), JSON.stringify({ profile: id, environment, provenance: { version: 1, runId: '1', attempt: 1, artifactId: 2, commit: 'a'.repeat(40), digest: 'sha256:' + 'b'.repeat(64) }, cases: { case: { sha256, contract: 'fixed-contract', source: { commit: 'a'.repeat(40) } } }, ...patch }))
  return profile
}
it('即使本机基线存在，缺失CI档案仍失败', async () => {
  await baseline(); await expect(readUiBaseline(uiProfile(root, CI_PROFILE, { CI: 'true' }), environment, 'case', 'fixed-contract')).rejects.toMatchObject({ code: 'ENOENT' })
})
it.each(['profile', 'environment', 'case', 'contract', 'bytes'])('%s错误不能通过或复用其他环境', async fault => {
  const profile = await baseline(CI_PROFILE, fault === 'profile' ? { profile: LOCAL_PROFILE } : fault === 'environment' ? { environment: { font: 'different' } } : {})
  if (fault === 'bytes') await writeFile(join(profile.directory, 'case.png'), 'changed')
  await expect(readUiBaseline(profile, environment, fault === 'case' ? 'missing' : 'case', fault === 'contract' ? 'changed' : 'fixed-contract')).rejects.toThrow()
})
it('只返回本档案的已核验字节', async () => {
  const profile = await baseline(CI_PROFILE); expect(await readUiBaseline(profile, environment, 'case', 'fixed-contract')).toEqual(bytes)
})
it.each([{ scaleFactor: 2 }, { width: 1512 }, { workHeight: 859 }])('显示器变化不能复用相同系统和字体的旧截图：%j', async change => {
  const display = { width: 1920, height: 1080, workWidth: 1920, workHeight: 971, scaleFactor: 1, primary: true }
  const original = { ...environment, version: 3, displays: [display] }
  const profile = await baseline(LOCAL_PROFILE, { environment: original })
  expect(await readUiBaseline(profile, original, 'case', 'fixed-contract')).toEqual(bytes)
  await expect(readUiBaseline(profile, { ...original, displays: [{ ...display, ...change }] }, 'case', 'fixed-contract')).rejects.toThrow('环境不匹配')
})
it('逐case来源覆盖旧整体来源且绑定本case提交，其他旧case仍可沿原来源读取', async () => {
  const original = { sha256, contract: 'fixed-contract', source: { commit: 'a'.repeat(40) } }
  const row = { ...original, source: { commit: 'c'.repeat(40) }, provenance: { version: 1, runId: '2', attempt: 1, artifactId: 3, commit: 'c'.repeat(40), digest: 'sha256:' + 'd'.repeat(64) } }
  const profile = await baseline(CI_PROFILE, { cases: { case: original, updated: row } })
  await writeFile(join(profile.directory, 'updated.png'), bytes)
  expect(await readUiBaseline(profile, environment, 'case', 'fixed-contract')).toEqual(bytes)
  expect(await readUiBaseline(profile, environment, 'updated', 'fixed-contract')).toEqual(bytes)
  await baseline(CI_PROFILE, { cases: { case: { ...row, provenance: { ...row.provenance, commit: 'f'.repeat(40) } } } })
  await expect(readUiBaseline(profile, environment, 'case', 'fixed-contract')).rejects.toThrow('官方artifact记录')
})
it.each([undefined, { version: 1 }, { version: 1, runId: '1', attempt: 1, artifactId: 2, commit: 'f'.repeat(40), digest: 'sha256:' + 'b'.repeat(64) }])('CI档案缺失/不完整/错来源的provenance不能作为期望图', async provenance => {
  const profile = await baseline(CI_PROFILE, { provenance })
  await expect(readUiBaseline(profile, environment, 'case', 'fixed-contract')).rejects.toThrow('官方artifact记录')
})
