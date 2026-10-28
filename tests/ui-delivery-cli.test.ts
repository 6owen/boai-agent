/*
 * [INPUT]: Isolated real git worktree and a local fake gh protocol endpoint.
 * [OUTPUT]: CLI approves only current PR runs and persists unknown dispatch receipts without replay.
 * [POS]: Process-level delivery regression; no GitHub writes or Electron.
 * [PROTOCOL]: Update tests/.folder.md with scope changes.
 */
import { afterEach, beforeEach, expect, it } from 'vitest'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
let temporary: string, root: string, binary: string, sha: string
const cli = resolve('scripts/ui-delivery.mjs'), repo = '6owen/boai-agent'
const git = (...args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const save = async (file: string, data: unknown) => writeFile(file, JSON.stringify(data))
beforeEach(async () => {
  temporary = await mkdtemp(join(tmpdir(), 'boai-delivery-cli-')); root = join(temporary, 'worktree'); binary = join(temporary, 'bin')
  await mkdir(root); await mkdir(binary); await mkdir(join(root, '.local/ui-delivery'), { recursive: true })
  git('init', '-b', 'fix/ui'); await writeFile(join(root, '.gitignore'), '.local/\n'); await writeFile(join(root, 'source.txt'), 'fixture\n')
  git('add', '.gitignore', 'source.txt'); git('-c', 'core.hooksPath=/dev/null', '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', 'commit', '-m', 'fixture'); sha = git('rev-parse', 'HEAD')
  const pr = { number: 99, html_url: 'https://example.test/pr/99', head: { sha, ref: 'fix/ui', repo: { id: 123, full_name: repo } }, base: { repo: { id: 123, full_name: repo } }, merge_commit_sha: 'b'.repeat(40), draft: true }
  await save(join(root, '.local/fake.json'), { pr, run: { id: 456, html_url: 'https://example.test/run/456', path: '.github/workflows/tests.yml', event: 'pull_request', head_sha: sha, head_branch: 'fix/ui', repository: { id: 123, full_name: repo }, head_repository: { full_name: repo }, pull_requests: [pr], run_attempt: 1, status: 'completed', conclusion: 'action_required' } })
  await writeFile(join(binary, 'gh'), `#!${process.execPath}
const fs = require('node:fs'); const args = process.argv.slice(2); const path = '.local/fake.json'; const data = JSON.parse(fs.readFileSync(path));
fs.appendFileSync('.local/calls.jsonl', JSON.stringify(args) + '\\n');
const respond = value => process.stdout.write(JSON.stringify(value)); const route = args.find(arg => arg.startsWith('repos/')) || '';
if (args[0] === 'repo') respond({ nameWithOwner: '${repo}' });
else if (route.includes('pulls?')) respond([data.pr]);
else if (route.endsWith('pulls/99')) respond(data.pr);
else if (route.includes('actions/workflows/tests.yml/runs')) respond({ workflow_runs: [data.run] });
else if (route.endsWith('/approve')) { data.run.status = 'in_progress'; data.run.conclusion = null; fs.writeFileSync(path, JSON.stringify(data)); }
else if (route.includes('/artifacts?')) respond({ artifacts: [{ name: 'ui-candidate-github-macos15-arm64' }] });
else if (args[0] === 'workflow') { process.stderr.write('fixture: dispatch receipt lost'); process.exit(1); }
else if (route.includes('ui-baseline-update.yml/runs')) respond({ workflow_runs: [] });
else { process.stderr.write('Unexpected gh call: ' + JSON.stringify(args)); process.exit(2); }
`, { mode: 0o755 })
})
afterEach(async () => { await rm(temporary, { recursive: true, force: true }) })
const runCli = (...args: string[]) => spawnSync(process.execPath, [cli, ...args], { cwd: root, env: { ...process.env, CI: '', PATH: `${binary}:${process.env.PATH}` }, encoding: 'utf8', timeout: 15000 })
const calls = async () => (await readFile(join(root, '.local/calls.jsonl'), 'utf8')).trim().split('\n').map(row => JSON.parse(row) as string[])
it('真实CLI批准当前PR的action_required；接续看到运行中，不重复批准/dispatch', async () => {
  const first = runCli('resume', '--no-auto-merge'); expect(first.status, first.stderr).toBe(0); expect(first.stdout).toContain('已批准当前PR')
  const second = runCli('resume'); expect(second.status, second.stderr).toBe(0); expect(second.stdout).toContain('检查运行中')
  expect((await calls()).filter(args => args.some(arg => arg.endsWith('/approve')))).toHaveLength(1)
  expect((await calls()).some(args => args[0] === 'workflow')).toBe(false)
  expect(JSON.parse(await readFile(join(root, '.local/ui-delivery/state.json'), 'utf8'))).toMatchObject({ head: sha, noAutoMerge: true })
})
it('实际CLI对旧head的action_required不批准', async () => {
  const path = join(root, '.local/fake.json'), fake = JSON.parse(await readFile(path, 'utf8')); fake.run.head_sha = 'f'.repeat(40); await save(path, fake)
  const result = runCli(); expect(result.status, result.stderr).toBe(0); expect(result.stdout).toContain('尚未出现')
  expect((await calls()).some(args => args.some(arg => arg.endsWith('/approve')))).toBe(false)
})
it('dispatch回执丢失前已保存精确审阅；下一进程查已有运行，不重放写请求', async () => {
  const path = join(root, '.local/fake.json'), fake = JSON.parse(await readFile(path, 'utf8')); fake.run.conclusion = 'success'; await save(path, fake)
  await save(join(root, '.local/ui-delivery/state.json'), { branch: 'fix/ui', head: sha, run: 456, attempt: 1, evidence: '.local/reviewed-fixture', changed: ['a'], noAutoMerge: true })
  const first = runCli('review', '--cases', 'a', '--reason', 'fixture explicit review'); expect(first.status).toBe(1)
  const saved = JSON.parse(await readFile(join(root, '.local/ui-delivery/state.json'), 'utf8'))
  expect(saved.submission).toMatchObject({ status: 'dispatching', cases: ['a'], reason: 'fixture explicit review' })
  const second = runCli(); expect(second.status, second.stderr).toBe(0); expect(second.stdout).toContain('不重复派发')
  expect((await calls()).filter(args => args[0] === 'workflow')).toHaveLength(1)
  expect(git('status', '--porcelain')).toBe('')
})
