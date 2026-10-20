/*
 * [INPUT]: 明确标为协议fixture的GitHub run/artifact与冻结源码/构建摘要。
 * [OUTPUT]: 拒绝错误官方身份/ZIP；同环境按case保留旧来源，初始/迁移或缺失/合同变化须完整接受。
 * [POS]: CI基线进口边界验收，实际下载/逐图审阅另验。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, readFile, mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error Plain Node CLI has no declaration file.
import { verifyCandidateRun, verifyCandidateIdentity, unpackCandidateArchive, planCiBaselineManifest } from '../scripts/ui-ci-baseline.mjs'
const repo = '6owen/boai-agent', sha = 'a'.repeat(40), inputHash = 'b'.repeat(64)
const current = { commit: sha, sourceHash: 'c'.repeat(64), dirty: false }
const run = { id: 1, repository: { full_name: repo }, head_repository: { full_name: repo }, path: '.github/workflows/ui-baseline-candidate.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success', head_sha: sha, head_branch: 'infra/ui-environment-profiles', run_attempt: 1 }
const artifact = { id: 2, name: 'ui-candidate-github-macos15-arm64', expired: false, digest: 'sha256:' + 'd'.repeat(64), workflow_run: { head_sha: sha }, size_in_bytes: 1000 }
const candidate = { profile: 'github-macos15-arm64', source: current, ci: { repository: repo, runId: '1', attempt: '1', sha, workflow: `${repo}/.github/workflows/ui-baseline-candidate.yml@refs/heads/infra/ui-environment-profiles` }, environment: { version: 2, platform: 'darwin', arch: 'arm64', osVersion: '15.7.2' }, built: { version: 1, inputHash, outputHash: 'e'.repeat(64) }, selected: ['case'], cases: { case: {} } }
it('仅接受当前干净SHA的独立采集run与唯一有摘要artifact', () => {
  expect(verifyCandidateRun(run, [artifact], current, '1')).toEqual(artifact)
  for (const patch of [{ event: 'pull_request' }, { head_sha: 'f'.repeat(40) }, { conclusion: 'failure' }, { path: '.github/workflows/tests.yml' }, { head_repository: { full_name: 'fork/boai-agent' } }, { id: 5 }]) expect(() => verifyCandidateRun({ ...run, ...patch }, [artifact], current, '1')).toThrow()
  expect(() => verifyCandidateRun(run, [artifact], { ...current, dirty: true }, '1')).toThrow()
  for (const artifacts of [[], [artifact, artifact], [{ ...artifact, expired: true }], [{ ...artifact, digest: undefined }], [{ ...artifact, workflow_run: { head_sha: 'f'.repeat(40) } }]]) expect(() => verifyCandidateRun(run, artifacts, current, '1')).toThrow()
})
it('引导push只允许明确开发分支，不能伪装普通main push', () => {
  expect(() => verifyCandidateRun({ ...run, event: 'push' }, [artifact], current, '1')).not.toThrow()
  expect(() => verifyCandidateRun({ ...run, event: 'push', head_branch: 'main' }, [artifact], current, '1')).toThrow()
})
it('原始候选必须绑定同一run尝试/源码/构建及全部场景', () => {
  expect(() => verifyCandidateIdentity(candidate, run, current, ['case'], inputHash)).not.toThrow()
  for (const patch of [{ profile: 'local-macos-arm64' }, { ci: { ...candidate.ci, attempt: '2' } }, { source: { ...current, sourceHash: 'f'.repeat(64) } }, { built: { ...candidate.built, inputHash: 'f'.repeat(64) } }, { environment: { ...candidate.environment, arch: 'x64' } }, { selected: [] }, { cases: {} }]) expect(() => verifyCandidateIdentity({ ...candidate, ...patch }, run, current, ['case'], inputHash)).toThrow()
})
it('同环境只接受相关case，未选中记录及旧官方来源保持原字节语义', () => {
  const provenance = { version: 1, runId: '2', attempt: 1, artifactId: 3, commit: sha, digest: artifact.digest }
  const oldRow = { sha256: 'old bytes hash', contract: 'old contract', source: { commit: 'f'.repeat(40) }, reason: 'old review', acceptedAt: 'old timestamp' }
  const previous = { version: 1, profile: candidate.profile, environment: candidate.environment, provenance: { ...provenance, runId: '1', commit: 'f'.repeat(40) }, cases: { unchanged: oldRow, changed: { ...oldRow } } }
  const before = JSON.stringify(previous)
  const nextCandidate = { ...candidate, cases: { unchanged: { sha256: 'new unaccepted bytes', contract: oldRow.contract }, changed: { sha256: 'new accepted bytes', contract: 'new contract' } } }
  const next = planCiBaselineManifest(nextCandidate, ['unchanged', 'changed'], ['changed'], previous, provenance, 'requested change')
  expect(JSON.stringify(previous)).toBe(before)
  expect(next.cases.unchanged).toEqual(oldRow)
  expect(next.provenance).toEqual(previous.provenance)
  expect(next.cases.changed).toMatchObject({ ...nextCandidate.cases.changed, provenance, source: candidate.source, reason: 'requested change' })
})
it('初始/环境迁移必须全场，未选中缺失/合同变化及错误选择不能被部分接受遮盖', () => {
  const nextCandidate = { ...candidate, cases: { case: { contract: 'fixed' }, second: { contract: 'fixed' } } }
  const ids = ['case', 'second'], provenance = { runId: '1' }
  const previous = { version: 1, profile: candidate.profile, environment: candidate.environment, cases: { case: { contract: 'fixed' }, second: { contract: 'fixed' } } }
  for (const old of [null, { ...previous, environment: { different: true } }]) {
    expect(() => planCiBaselineManifest(nextCandidate, ids, ['case'], old, provenance, 'reason')).toThrow('全部')
    expect(planCiBaselineManifest(nextCandidate, ids, ids, old, provenance, 'reason').cases.second).toMatchObject({ contract: 'fixed', provenance })
  }
  for (const selected of [[], ['case', 'case'], ['missing']]) expect(() => planCiBaselineManifest(nextCandidate, ids, selected, previous, provenance, 'reason')).toThrow()
  for (const cases of [{ case: previous.cases.case }, { ...previous.cases, second: { contract: 'stale' } }]) expect(() => planCiBaselineManifest(nextCandidate, ids, ['case'], { ...previous, cases }, provenance, 'reason')).toThrow('未接受的场景')
  expect(() => planCiBaselineManifest(nextCandidate, ids, ids, { ...previous, profile: 'local-macos-arm64' }, provenance, 'reason')).toThrow('身份')
})
it.each(['valid', 'traversal', 'symlink', 'duplicate'])('真实ZIP的%s条目在解压前核对，不越界写入', async kind => {
  const root = await mkdtemp(join(tmpdir(), 'boai-ui-archive-')), archive = join(root, 'candidate.zip'), output = join(root, 'output'); await mkdir(output)
  try {
    execFileSync('python3', ['-c', `import zipfile,sys,stat
archive,kind=sys.argv[1:]
with zipfile.ZipFile(archive,'w') as z:
 if kind=='symlink':
  entry=zipfile.ZipInfo('link');entry.create_system=3;entry.external_attr=(stat.S_IFLNK|0o777)<<16;z.writestr(entry,'../escape')
 else:
  z.writestr('../escape' if kind=='traversal' else 'snapshots/case.png','bytes')
  if kind=='duplicate':z.writestr('snapshots/case.png','other')
`, archive, kind], { stdio: 'pipe' })
    if (kind === 'valid') { unpackCandidateArchive(archive, output); expect(await readFile(join(output, 'snapshots/case.png'), 'utf8')).toBe('bytes') }
    else { expect(() => unpackCandidateArchive(archive, output)).toThrow(); await expect(readFile(join(output, 'snapshots/case.png'))).rejects.toMatchObject({ code: 'ENOENT' }) }
    await expect(readFile(join(root, 'escape'))).rejects.toMatchObject({ code: 'ENOENT' })
  } finally { await rm(root, { recursive: true, force: true }) }
})
