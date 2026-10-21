/*
 * [INPUT]: 稳定版本、本地资格与GitHub提交状态；真实CLI使用明确假gh/本地核验协议。
 * [OUTPUT]: main/原件/nonce/hash/最新尝试绑定；新pending/成功尝试、原件或主分支变化拒绝。
 * [POS]: 本地发布前检负例；不访问GitHub、不创建Tag或运行GUI。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, mkdir, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
// @ts-expect-error Node CLI has no declaration file.
import { verifyReleaseIdentity } from '../scripts/release-check.mjs'
const sha = 'a'.repeat(40), repo = '6owen/boai-agent', runId = '11111111-1111-4111-8111-111111111111', hash = 'c'.repeat(64)
const qualification = { sha, sourceHash: 'b'.repeat(64), manifestSha256: hash, t1: 28, ui: 18, trigger: { repository: repo, branch: 'main', runId } }
const status = { id: 3, state: 'success', context: 'BOAI local CI', creator: { id: 123, login: '6owen' }, description: `local-ci ${runId} ${hash}` }
const proof = { version: '0.2.4', sha, current: { sha, dirty: false }, metadata: { version: '0.2.4', build: { buildVersion: '0.2.4', appId: 'com.boai.agent', productName: 'BoAI Agent' } }, mainSha: sha, qualification, status }
it('同一干净main、稳定版本及完整本地原件才形成只读身份', () => expect(verifyReleaseIdentity(proof)).toMatchObject({ version: '0.2.4', tag: 'v0.2.4', sha, validation: { source: 'local-ci', runId, statusId: 3, manifestSha256: hash, t1: 28, ui: 18 } }))
it.each([
  { version: 'v0.2.4' }, { version: '01.2.4' }, { version: '0.2.4-beta.1' }, { version: '99999999999999999.2.4' }, { sha: 'short' },
  { mainSha: 'b'.repeat(40) }, { current: { sha, dirty: true } }, { current: { sha: 'b'.repeat(40), dirty: false } },
  { metadata: { ...proof.metadata, version: '0.2.3' } }, { metadata: { ...proof.metadata, build: { ...proof.metadata.build, buildVersion: '0.2.3' } } },
  { metadata: { ...proof.metadata, build: { ...proof.metadata.build, appId: 'other' } } }, { metadata: { ...proof.metadata, build: { ...proof.metadata.build, productName: 'other' } } },
])('拒绝不明确或不一致版本/源码身份：%j', patch => expect(() => verifyReleaseIdentity({ ...proof, ...patch })).toThrow())
it.each([
  null, { ...qualification, sha: 'd'.repeat(40) }, { ...qualification, manifestSha256: 'short' }, { ...qualification, sourceHash: 'short' },
  { ...qualification, t1: 0 }, { ...qualification, ui: 0 }, { ...qualification, trigger: null },
  { ...qualification, trigger: { ...qualification.trigger, branch: 'infra/test' } }, { ...qualification, trigger: { ...qualification.trigger, repository: 'fork/boai-agent' } },
  { ...qualification, trigger: { ...qualification.trigger, runId: 'short' } },
])('PR/旧档案/不完整本地资格拒绝发布：%j', local => expect(() => verifyReleaseIdentity({ ...proof, qualification: local })).toThrow('没有同SHA的main完整本地原件'))
it.each([
  null, { ...status, state: 'pending' }, { ...status, state: 'failure' }, { ...status, context: 'other' }, { ...status, id: 0 },
  { ...status, creator: { ...status.creator, id: 0 } }, { ...status, creator: { ...status.creator, login: 'other' } },
  { ...status, description: `local-ci ${runId} ${'d'.repeat(64)}` }, { ...status, description: `local-ci 22222222-2222-4222-8222-222222222222 ${hash}` },
])('最新状态须为本人同nonce/hash的成功，不能选择旧绿：%j', remote => expect(() => verifyReleaseIdentity({ ...proof, status: remote })).toThrow('最新本地CI状态'))

it.each(['unchanged', 'latest-failed', 'latest-pending', 'new-pending', 'new-success', 'main-moved', 'archive-changed', 'metadata-changed', 'status-query-race'])('真实CLI本地资格与最新状态查询：%s', async mode => {
  const directory = await mkdtemp(join(tmpdir(), 'boai-release-local-')), root = join(directory, 'repo'), bin = join(directory, 'bin')
  try {
    await mkdir(join(root, 'scripts'), { recursive: true }); await mkdir(join(root, '.local')); await mkdir(bin)
    await writeFile(join(root, '.gitignore'), '.local/\n'); await writeFile(join(root, 'package.json'), JSON.stringify(proof.metadata))
    for (const file of ['release-check.mjs', 'local-ci-github.mjs', 'resource-lock.mjs']) await writeFile(join(root, 'scripts', file), await readFile(new URL('../scripts/' + file, import.meta.url)))
    // This is an explicit verifier protocol stub; actual seal/hash/desktop/UI
    // integrity remains covered by local-ci/desktop-evidence contracts.
    await writeFile(join(root, 'scripts/local-ci.mjs'), `import fs from'node:fs';import path from'node:path';export async function verifyLocalCi(){const root=path.resolve(import.meta.dirname,'..'),file=path.join(root,'.local/verify-count');let n=fs.existsSync(file)?Number(fs.readFileSync(file,'utf8')):0;fs.writeFileSync(file,String(++n));const q=JSON.parse(fs.readFileSync(path.join(root,'.local/qualification.json'),'utf8'));if(n===2&&${JSON.stringify(mode)}==='archive-changed')q.manifestSha256='d'.repeat(64);if(n===2&&${JSON.stringify(mode)}==='metadata-changed')fs.appendFileSync(path.join(root,'package.json'),'\\n');return q;}\n`)
    const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
    git('init', '-b', 'main'); git('add', '.'); git('-c', 'user.name=Release protocol fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'local release identity fixture')
    const head = git('rev-parse', 'HEAD'), initial = mode.startsWith('latest-') ? { ...status, id: 4, state: mode === 'latest-pending' ? 'pending' : 'failure' } : status
    const final = mode.startsWith('new-') || mode === 'status-query-race' ? { ...status, id: 4, state: mode === 'new-pending' ? 'pending' : 'success' } : status
    const compact = (value: typeof status) => { const { creator, ...rest } = value; return rest }
    const replies = [{ object: { sha: head } }, { sha: head, statuses: [compact(initial)] }, [initial, { ...status, id: 1 }], { sha: head, statuses: [compact(final)] }, mode === 'status-query-race' ? [status] : [final, status], { object: { sha: mode === 'main-moved' ? 'd'.repeat(40) : head } }]
    const paths = ['git/ref/heads/main', `commits/${head}/status?per_page=100`, `commits/${head}/statuses?per_page=100`, `commits/${head}/status?per_page=100`, `commits/${head}/statuses?per_page=100`, 'git/ref/heads/main'].map(path => `repos/${repo}/${path}`)
    await writeFile(join(root, '.local/qualification.json'), JSON.stringify({ ...qualification, sha: head }))
    await writeFile(join(root, '.local/replies.json'), JSON.stringify(replies)); await writeFile(join(root, '.local/paths.json'), JSON.stringify(paths))
    await writeFile(join(bin, 'gh'), `#!${process.execPath}\nconst fs=require('node:fs'),path=require('node:path'),root=process.cwd(),file=path.join(root,'.local/api-count');let n=fs.existsSync(file)?Number(fs.readFileSync(file,'utf8')):0;const replies=JSON.parse(fs.readFileSync(path.join(root,'.local/replies.json'),'utf8')),paths=JSON.parse(fs.readFileSync(path.join(root,'.local/paths.json'),'utf8'));fs.writeFileSync(file,String(n+1));if(process.argv[2]!=='api'||process.argv[3]!==paths[n]||n>=replies.length)process.exit(91);process.stdout.write(JSON.stringify(replies[n]));\n`, { mode: 0o700 })
    const result = spawnSync(process.execPath, ['scripts/release-check.mjs', '--version', '0.2.4', '--sha', head, '--local-ci', '.local/protocol-only'], { cwd: root, env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, CI: '' }, encoding: 'utf8', timeout: 15_000 })
    expect(result.error).toBeUndefined()
    if (mode === 'unchanged') {
      expect(result.status, result.stderr).toBe(0)
      const entries = await readdir(join(root, '.local/release-checks')); expect(entries).toHaveLength(1)
      expect(JSON.parse(await readFile(join(root, '.local/release-checks', entries[0]!, 'identity.json'), 'utf8'))).toMatchObject({ sha: head, validation: { source: 'local-ci', runId, statusId: 3, manifestSha256: hash } })
      expect(await readFile(join(root, '.local/api-count'), 'utf8')).toBe('6'); expect(await readFile(join(root, '.local/verify-count'), 'utf8')).toBe('2')
    } else {
      expect(result.status, result.stdout).toBe(1)
      expect(result.stderr).toContain(mode.startsWith('latest-') ? '最新本地CI状态' : mode === 'status-query-race' ? '最新提交状态身份不匹配' : '前检期间版本、main、本地原件或测试尝试已变化')
      await expect(readdir(join(root, '.local/release-checks'))).rejects.toMatchObject({ code: 'ENOENT' })
    }
  } finally { await rm(directory, { recursive: true, force: true }) }
})
