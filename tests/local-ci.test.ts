/*
 * [INPUT]: 临时原件树及真实子进程gh协议夹具；不访问GitHub、不运行GUI。
 * [OUTPUT]: 原件改动可检出，精确SHA/最新尝试/未知写入不得回传假成功；只证明本地CI边界。
 * [POS]: 本地CI封存和GitHub状态适配合同测试。
 * [PROTOCOL]: 修改同步Header与tests/.folder.md。
 */
import { afterEach, expect, it } from 'vitest'
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error Node CLI helper has no declarations.
import { localCiFiles, verifyLocalCiSeal } from '../scripts/local-ci.mjs'
// @ts-expect-error Node CLI helper has no declarations.
import { beginLocalCiPublication } from '../scripts/local-ci-github.mjs'

const directories: string[] = [], originalPath = process.env.PATH
afterEach(async () => { process.env.PATH = originalPath; delete process.env.BOAI_CI_STATUS_TEST_CONFIG; for (const path of directories.splice(0)) await rm(path, { force: true, recursive: true }) })
async function directory() { const path = await mkdtemp(join(tmpdir(), 'boai-ci-contract-')); directories.push(path); return path }
it('本批全部原件参与封存，变动/额外文件/符号链接不能隐去', async () => {
  const root = await directory(); await mkdir(join(root, 'nested')); await writeFile(join(root, 'nested/original'), 'first')
  const first = await localCiFiles(root)
  await writeFile(join(root, 'nested/original'), 'other'); expect(await localCiFiles(root)).not.toEqual(first)
  await writeFile(join(root, 'extra'), 'extra'); expect(await localCiFiles(root)).toHaveLength(2)
  await symlink(join(root, 'extra'), join(root, 'linked')); await expect(localCiFiles(root)).rejects.toThrow('链接')
})
it('公开摘要锚定已核验的原清单字节，核验期间只改清单也必须拒绝', async () => {
  const root = await directory(); await writeFile(join(root, 'result.json'), '{}')
  const manifest = join(root, 'manifest.json'), bytes = Buffer.from(JSON.stringify({ version: 1, files: await localCiFiles(root) }))
  await writeFile(manifest, bytes)
  const checked = await verifyLocalCiSeal(root, async () => ({ checked: true }))
  const { createHash } = await import('node:crypto')
  expect(checked.manifestSha256).toBe(createHash('sha256').update(bytes).digest('hex'))
  await expect(verifyLocalCiSeal(root, async () => { await writeFile(manifest, Buffer.concat([bytes, Buffer.from('\n')])); return { checked: true } })).rejects.toThrow('清单字节变化')
})
const sha = 'a'.repeat(40), runId = '11111111-1111-1111-1111-111111111111'
async function fakeGithub(mode: string) {
  const root = await directory(), bin = join(root, 'bin'), config = join(root, 'config.json'); await mkdir(bin)
  await writeFile(config, JSON.stringify({ mode, sha, calls: [], statuses: [] }))
  await writeFile(join(bin, 'gh'), `#!/usr/bin/env node
import fs from 'node:fs';
const file=process.env.BOAI_CI_STATUS_TEST_CONFIG,data=JSON.parse(fs.readFileSync(file,'utf8')),args=process.argv.slice(2),path=args[1];
const base='repos/6owen/boai-agent/',post=args.includes('POST');
data.calls.push({path,post});
let response;
if(path===base+'git/ref/heads/infra/test')response={ref:'refs/heads/infra/test',object:{sha:data.mode==='new-head'&&data.calls.length>1?'b'.repeat(40):data.sha}};
else if(path===base+'statuses/'+data.sha&&post){
 const body=JSON.parse(fs.readFileSync(0,'utf8')); response={...body,id:data.statuses.length+1,creator:{id:123}}; data.statuses.unshift(response);
 if(data.mode==='unknown'){fs.writeFileSync(file,JSON.stringify(data));process.exit(1)}
}else if(path===base+'commits/'+data.sha+'/status?per_page=100'||path===base+'commits/'+data.sha+'/statuses?per_page=100'){
 const rows=structuredClone(data.statuses);
 if(data.mode==='new-attempt'&&data.calls.length>3)rows.unshift({...rows[0],id:99,description:'newer attempt'});
 response=path.includes('/statuses?')?rows:{sha:data.mode==='wrong-sha'?'b'.repeat(40):data.sha,statuses:rows.map(({creator,...status})=>status)};
}else {process.stderr.write('unexpected API path '+path);process.exit(2)}
fs.writeFileSync(file,JSON.stringify(data));process.stdout.write(JSON.stringify(response));
`, { mode: 0o700 })
  process.env.PATH = bin + ':' + originalPath; process.env.BOAI_CI_STATUS_TEST_CONFIG = config
  return { root, journal: join(root, 'journal'), state: async () => JSON.parse(await readFile(config, 'utf8')) }
}
it('真实gh子进程协议按pending→同SHA核对→成功回传原件hash，回执不虚构sha字段', async () => {
  const f = await fakeGithub('success'), finish = await beginLocalCiPublication({ branch: 'infra/test', sha, runId, journal: f.journal })
  const status = await finish({ passed: true, manifestSha256: 'c'.repeat(64) })
  expect(status.state).toBe('success'); expect(status.description).toContain('c'.repeat(64))
  expect((await f.state()).calls.filter((call: { post: boolean }) => call.post)).toHaveLength(2)
})
it('本机发布所有权覆盖读/POST窗口，新尝试零API拒绝且旧闭包不能覆盖后来pending', async () => {
  const f = await fakeGithub('success'), finish = await beginLocalCiPublication({ branch: 'infra/test', sha, runId, journal: f.journal })
  const before = (await f.state()).calls.length
  await expect(beginLocalCiPublication({ branch: 'infra/test', sha, runId: '22222222-2222-2222-2222-222222222222', journal: join(f.root, 'blocked') })).rejects.toThrow('资源锁')
  expect((await f.state()).calls).toHaveLength(before)
  await finish({ passed: false })
  const newer = await beginLocalCiPublication({ branch: 'infra/test', sha, runId: '22222222-2222-2222-2222-222222222222', journal: join(f.root, 'newer') })
  const pending = (await f.state()).calls.length
  await expect(finish({ passed: true, manifestSha256: 'c'.repeat(64) })).rejects.toThrow('所有权已结束')
  expect((await f.state()).calls).toHaveLength(pending)
  await newer({ passed: false })
})
it.each(['new-head', 'new-attempt', 'wrong-sha'])('%s发生后不能覆盖或回传成功', async mode => {
  const f = await fakeGithub(mode)
  try { const finish = await beginLocalCiPublication({ branch: 'infra/test', sha, runId, journal: f.journal }); await expect(finish({ passed: true, manifestSha256: 'c'.repeat(64) })).rejects.toThrow() }
  catch (error) { expect(String(error)).toContain('不对应') }
  expect((await f.state()).statuses.every((status: { state: string }) => status.state === 'pending')).toBe(true)
})
it('未知POST保留原意图且不自动重放，不将已提交pending当成功', async () => {
  const f = await fakeGithub('unknown')
  await expect(beginLocalCiPublication({ branch: 'infra/test', sha, runId, journal: f.journal })).rejects.toThrow()
  expect((await f.state()).calls.filter((call: { post: boolean }) => call.post)).toHaveLength(1)
  expect(JSON.parse(await readFile(join(f.journal, 'pending.intent.json'), 'utf8')).body.state).toBe('pending')
  await expect(readFile(join(f.journal, 'pending.receipt.json'))).rejects.toThrow()
})
