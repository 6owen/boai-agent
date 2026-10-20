/*
 * [INPUT]: 明确标为协议fixture的版本、主分支、GitHub验证及必需汇总身份。
 * [OUTPUT]: 身份负例及真实CLI有序查询；旧绿不能遮盖最新失败/待决，新attempt拒绝成功记录。
 * [POS]: 发布前检确定性负例；不调用GitHub、不创建Tag或运行安装包。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, mkdir, readdir, chmod, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
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

it.each(['unchanged', 'rerun-started', 'rerun-already-completed', 'latest-failed', 'latest-pending'])('真实CLI最新记录及最后一次列表查询：%s', async mode => {
  const directory = await mkdtemp(join(tmpdir(), 'boai-release-check-')), root = join(directory, 'repo'), bin = join(directory, 'bin')
  try {
    await mkdir(join(root, 'scripts'), { recursive: true }); await mkdir(join(root, '.local')); await mkdir(bin)
    await writeFile(join(root, '.gitignore'), '.local/\n')
    await writeFile(join(root, 'package.json'), JSON.stringify(proof.metadata))
    await writeFile(join(root, 'scripts/release-check.mjs'), await readFile(new URL('../scripts/release-check.mjs', import.meta.url)))
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    git('init', '-b', 'main'); git('add', '.'); git('-c', 'user.name=Release protocol fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'release identity fixture')
    const head = git('rev-parse', 'HEAD'), run = { ...proof.run, id: 20, head_sha: head }, olderGreen = { ...run, id: 19 }
    const initial = mode.startsWith('latest-') ? { ...run, id: 21, status: mode === 'latest-pending' ? 'in_progress' : 'completed', conclusion: mode === 'latest-pending' ? null : 'failure' } : run
    const latest = mode === 'unchanged' || mode.startsWith('latest-') ? initial : { ...run, run_attempt: run.run_attempt + 1, status: mode === 'rerun-started' ? 'in_progress' : 'completed', conclusion: mode === 'rerun-started' ? null : 'success' }
    const replies = [{ object: { sha: head } }, { workflow_runs: [olderGreen, initial] }, initial, { total_count: 1, jobs: proof.jobs }, initial, { workflow_runs: [olderGreen, latest] }, { object: { sha: head } }]
    const list = `actions/workflows/tests.yml/runs?event=push&branch=main&head_sha=${head}&per_page=100`
    const paths = ['git/ref/heads/main', list, `actions/runs/${initial.id}`, `actions/runs/${initial.id}/attempts/${initial.run_attempt}/jobs?per_page=100`, `actions/runs/${initial.id}`, list, 'git/ref/heads/main'].map(value => `repos/${repo}/${value}`)
    await writeFile(join(root, '.local/replies.json'), JSON.stringify(replies))
    await writeFile(join(root, '.local/paths.json'), JSON.stringify(paths))
    await writeFile(join(bin, 'gh'), `#!${process.execPath}\nconst fs=require('node:fs');const path=require('node:path');const root=process.cwd();const file=path.join(root,'.local/api-count');let count=fs.existsSync(file)?Number(fs.readFileSync(file,'utf8')):0;const replies=JSON.parse(fs.readFileSync(path.join(root,'.local/replies.json'),'utf8'));const paths=JSON.parse(fs.readFileSync(path.join(root,'.local/paths.json'),'utf8'));fs.writeFileSync(file,String(count+1));if(process.argv[2]!=='api'||process.argv[3]!==paths[count]||count>=replies.length)process.exit(91);process.stdout.write(JSON.stringify(replies[count]));\n`)
    await chmod(join(bin, 'gh'), 0o700)
    const result = spawnSync(process.execPath, ['scripts/release-check.mjs', '--version', '0.2.4', '--sha', head], { cwd: root, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CI: '' }, encoding: 'utf8', timeout: 15_000 })
    expect(result.error).toBeUndefined()
    if (mode === 'unchanged') {
      expect(result.status, result.stderr).toBe(0)
      const entries = await readdir(join(root, '.local/release-checks'))
      expect(entries).toHaveLength(1)
      expect(JSON.parse(await readFile(join(root, '.local/release-checks', entries[0]!, 'identity.json'), 'utf8'))).toMatchObject({ sha: head, validation: { runId: run.id, attempt: run.run_attempt, requiredJobId: 3 } })
    } else {
      expect(result.status, result.stdout).toBe(1)
      expect(result.stderr).toContain(mode.startsWith('latest-') ? '没有同SHA的main完整成功验证' : '前检期间版本、main或测试尝试已变化')
      await expect(readdir(join(root, '.local/release-checks'))).rejects.toMatchObject({ code: 'ENOENT' })
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
