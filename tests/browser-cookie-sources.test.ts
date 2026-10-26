/*
 * [INPUT]: 虚构本机profile、SQLite Cookie与管道浏览器进程。
 * [OUTPUT]: 来源ID隔离/所选profile/失效/超时取消/清理与Firefox容器回归，不读取个人资料。
 * [POS]: Cookie本机来源合同；真实Chrome验证另见browser-cookie-chromium-fixture.ts。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { chmod, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { BrowserCookieSources, type CookieBrowserInstallation } from '../apps/electron/src/main/browser/cookie-sources'
import { CookieImports } from '../apps/electron/src/main/browser/cookie-import'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'boai-cookie-source-test-')); roots.push(root)
  const scratch = join(root, 'scratch'); await mkdir(scratch)
  const executable = join(root, 'browser')
  await writeFile(executable, `#!/usr/bin/env node
const fs = require('node:fs'), path = require('node:path');
const root = process.argv.find(v => v.startsWith('--user-data-dir=')).slice(16);
const profile = process.argv.find(v => v.startsWith('--profile-directory='))?.slice(20) ?? 'Default';
const reader=fs.createReadStream(null,{fd:3}), writer=fs.createWriteStream(null,{fd:4});
let input='';reader.on('data', bytes => {input+=bytes;for(;;){const end=input.indexOf('\\0');if(end<0)break;const msg=JSON.parse(input.slice(0,end));input=input.slice(end+1);
 if(msg.method==='Browser.close'){process.exit(0)}
 if(msg.method==='Storage.getCookies') {const state=JSON.parse(fs.readFileSync(path.join(root,'Local State'),'utf8'));const data=JSON.parse(fs.readFileSync(path.join(root,profile,...(state.fixtureLegacy?['Cookies']:['Network','Cookies'])),'utf8'));
 if(data.mode==='hang')continue;if(data.mode==='overflow'){writer.write(Buffer.alloc(10*1024*1024,65));continue}
 writer.write(JSON.stringify({id:msg.id,result:{cookies:data}})+'\\0')}
}});
`)
  await chmod(executable, 0o700)
  const installation = async (directory: string, profiles: Record<string, unknown>, kind: CookieBrowserInstallation['kind'] = 'chrome') => {
    const browserRoot = join(root, directory); await mkdir(browserRoot)
    await writeFile(join(browserRoot, 'Local State'), JSON.stringify({ profile: { last_used: 'Default', info_cache: Object.fromEntries(Object.keys(profiles).map((name, i) => [name, { name: `账户 ${i + 1}` }])) } }))
    for (const [name, cookies] of Object.entries(profiles)) { await mkdir(join(browserRoot, name, 'Network'), { recursive: true }); await writeFile(join(browserRoot, name, 'Network', 'Cookies'), JSON.stringify(cookies)) }
    return { kind, root: browserRoot, executable }
  }
  return { root, scratch, executable, installation }
}
const cookie = (value: string) => [{ name: 'test_sid', value, domain: 'fixture.invalid', path: '/', secure: true, httpOnly: true, session: true }]

describe('本机Cookie来源', () => {
  it('相同Default名称在不同root不冲突，只返回opaque元数据；刷新保持相同身份ID', async () => {
    const f = await fixture(), a = await f.installation('stable', { Default: cookie('A') }), b = await f.installation('beta', { Default: cookie('B') })
    const sources = new BrowserCookieSources({ installations: async () => [a, b], temporaryDirectory: f.scratch })
    const listed = (await sources.list()).sources; expect(listed).toHaveLength(2); expect(new Set(listed.map(item => item.id)).size).toBe(2)
    expect(listed[0]).toEqual({ id: expect.any(String), kind: 'chrome', label: 'Chrome — 账户 1', profileName: '账户 1' })
    expect(JSON.stringify(listed)).not.toContain(f.root)
    expect((await sources.list(true)).sources).toEqual(listed)
    expect(JSON.parse((await sources.read(listed[1]!.id)).text)[0].value).toBe('B')
    expect(await readdir(f.scratch)).toEqual([])
  })
  it('显式读取Profile 2，Local State默认仍为Default也不串资料；副本退出后删除', async () => {
    const f = await fixture(), install = await f.installation('chrome', { Default: cookie('A'), 'Profile 2': cookie('B') })
    const sources = new BrowserCookieSources({ installations: async () => [install], temporaryDirectory: f.scratch })
    const listed = (await sources.list()).sources, target = listed.find(value => value.profileName === '账户 2')!
    expect(JSON.parse((await sources.read(target.id)).text)[0].value).toBe('B')
    expect(JSON.parse((await sources.read(listed.find(value => value.id !== target.id)!.id)).text)[0].value).toBe('A')
    expect(await readdir(f.scratch)).toEqual([])
  })
  it('保留macOS旧Cookies相对布局，不能统一移动到Network导致空库', async () => {
    const f = await fixture(), install = await f.installation('chrome', { Default: cookie('legacy') })
    await rename(join(install.root, 'Default', 'Network', 'Cookies'), join(install.root, 'Default', 'Cookies'))
    const state = JSON.parse(await readFile(join(install.root, 'Local State'), 'utf8')); state.fixtureLegacy = true; await writeFile(join(install.root, 'Local State'), JSON.stringify(state))
    const sources = new BrowserCookieSources({ installations: async () => [install], temporaryDirectory: f.scratch }), selected = (await sources.list()).sources[0]!
    expect(JSON.parse((await sources.read(selected.id)).text)[0].value).toBe('legacy'); expect(await readdir(f.scratch)).toEqual([])
  })
  it('来源被替换或移除时失效，不接受任意路径或fallback', async () => {
    const f = await fixture(), install = await f.installation('chrome', { Default: cookie('A') })
    const sources = new BrowserCookieSources({ installations: async () => [install], temporaryDirectory: f.scratch }), first = (await sources.list()).sources[0]!
    await expect(sources.read(install.root)).rejects.toThrow('来源已失效')
    await rename(join(install.root, 'Default'), join(install.root, 'retired'))
    await mkdir(join(install.root, 'Default', 'Network'), { recursive: true }); await writeFile(join(install.root, 'Default', 'Network', 'Cookies'), JSON.stringify(cookie('B')))
    await expect(sources.read(first.id)).rejects.toThrow('来源已变化')
    expect((await sources.list(true)).sources.find(value => value.profileName === '账户 1')!.id).not.toBe(first.id)
    await expect(sources.read(first.id)).rejects.toThrow('来源已失效')
  })
  it('不跟随Cookie数据库符号链接，也不枚举Guest/System资料', async () => {
    const f = await fixture(), install = await f.installation('chrome', { Default: cookie('A'), 'Guest Profile': cookie('B'), 'System Profile': cookie('C') })
    const file = join(install.root, 'Default', 'Network', 'Cookies'); await rename(file, file + '.actual'); await symlink(file + '.actual', file)
    const sources = new BrowserCookieSources({ installations: async () => [install] })
    expect((await sources.list()).sources).toEqual([])
  })
  it('单个损坏资料不阻断其他浏览器，返回无路径的警告', async () => {
    const f = await fixture(), install = await f.installation('chrome', { Default: cookie('A') }), firefox = join(f.root, 'bad-firefox')
    await mkdir(firefox); await writeFile(join(firefox, 'profiles.ini'), 'x'.repeat(256 * 1024 + 1))
    const sources = new BrowserCookieSources({ installations: async () => [install, { kind: 'firefox', root: firefox }] })
    const result = await sources.list(); expect(result.sources).toHaveLength(1); expect(result.warning).toContain('1 个'); expect(JSON.stringify(result)).not.toContain(f.root)
  })
  it('读取超时结束自己的临时进程并清理，保持原数据库；并发受限', async () => {
    const f = await fixture(), install = await f.installation('chrome', { Default: { mode: 'hang' } })
    const sources = new BrowserCookieSources({ installations: async () => [install], temporaryDirectory: f.scratch, timeoutMs: 150 }), item = (await sources.list()).sources[0]!
    const pending = sources.read(item.id), rejected = expect(pending).rejects.toThrow('超时')
    await expect(sources.read(item.id)).rejects.toThrow('正在处理')
    await rejected; expect(await readdir(f.scratch)).toEqual([]); expect((await stat(join(install.root, 'Default', 'Network', 'Cookies'))).isFile()).toBe(true)
  })
  it('取消和异常过量输出都实际清理临时目录', async () => {
    const f = await fixture(), install = await f.installation('chrome', { Default: { mode: 'hang' }, 'Profile 2': { mode: 'overflow' } })
    const sources = new BrowserCookieSources({ installations: async () => [install], temporaryDirectory: f.scratch, timeoutMs: 3000 }), listed = (await sources.list()).sources
    const controller = new AbortController(), pending = sources.read(listed.find(value => value.profileName === '账户 1')!.id, controller.signal), rejected = expect(pending).rejects.toThrow('取消')
    controller.abort(); await rejected; expect(await readdir(f.scratch)).toEqual([])
    await expect(sources.read(listed.find(value => value.profileName === '账户 2')!.id)).rejects.toThrow('数据过大')
    expect(await readdir(f.scratch)).toEqual([])
  })
  it('Firefox按profiles.ini只读取选中数据库；容器与过期Cookie在原解析器中明确跳过', async () => {
    const f = await fixture(), root = join(f.root, 'firefox'); await mkdir(root)
    await writeFile(join(root, 'profiles.ini'), '[Profile0]\nName=Personal\nIsRelative=1\nPath=a\n[Profile1]\nName=Work\nIsRelative=1\nPath=b\n')
    for (const profile of ['a', 'b']) {
      await mkdir(join(root, profile)); const db = new DatabaseSync(join(root, profile, 'cookies.sqlite'))
      db.exec('CREATE TABLE moz_cookies(host TEXT,name TEXT,value TEXT,path TEXT,isHttpOnly INTEGER,isSecure INTEGER,expiry INTEGER,sameSite INTEGER,originAttributes TEXT)')
      const insert = db.prepare('INSERT INTO moz_cookies VALUES (?,?,?,?,?,?,?,?,?)'), expiry = Math.floor(Date.now() / 1000) + 3600
      insert.run('fixture.invalid', 'sid', profile, '/', 1, 1, expiry, 2, ''); insert.run('fixture.invalid', 'container', 'isolated', '/', 1, 1, expiry, 2, '^userContextId=2'); insert.run('fixture.invalid', 'expired', 'old', '/', 1, 1, 1, 2, ''); db.close()
    }
    const sources = new BrowserCookieSources({ installations: async () => [{ kind: 'firefox', root }], temporaryDirectory: f.scratch }), listed = (await sources.list()).sources
    const selected = listed.find(value => value.profileName === 'Work')!, payload = await sources.read(selected.id)
    expect(JSON.parse(payload.text)[0].value).toBe('b')
    const imports = new CookieImports(), preview = imports.prepare(payload.text, payload.source, { instanceId: 'fixture', partition: 'fixture' })
    expect(preview).toMatchObject({ ready: 1, total: 3, skipped: [{ reason: '分区 Cookie 暂不支持', count: 1 }, { reason: '已过期', count: 1 }] }); imports.cancel('fixture')
    expect(await readdir(f.scratch)).toEqual([])
  })
  it.each([14, 16])('Firefox schema %i保留None/Unset，按旧秒或新毫秒转换expiry', async version => {
    const f = await fixture(), root = join(f.root, 'firefox'), profile = join(root, 'a'); await mkdir(profile, { recursive: true })
    await writeFile(join(root, 'profiles.ini'), '[Profile0]\nName=Test\nIsRelative=1\nPath=a\n')
    const db = new DatabaseSync(join(profile, 'cookies.sqlite')), expiry = Math.floor(Date.now() / 1000) + 3600
    db.exec(`PRAGMA user_version=${version}; CREATE TABLE moz_cookies(host TEXT,name TEXT,value TEXT,path TEXT,isHttpOnly INTEGER,isSecure INTEGER,expiry INTEGER,sameSite INTEGER,originAttributes TEXT, isPartitionedAttributeSet INTEGER${version < 15 ? ',rawSameSite INTEGER' : ''})`)
    const insert = db.prepare(`INSERT INTO moz_cookies VALUES (${Array(version < 15 ? 11 : 10).fill('?').join(',')})`)
    insert.run('fixture.invalid', 'none', 'a', '/', 1, 1, expiry * (version >= 16 ? 1000 : 1), 0, '', 0, ...(version < 15 ? [0] : []))
    insert.run('fixture.invalid', 'unset', 'b', '/', 1, 1, expiry * (version >= 16 ? 1000 : 1), version < 15 ? 1 : 256, '', 0, ...(version < 15 ? [0] : []))
    insert.run('fixture.invalid', 'partitioned', 'c', '/', 1, 1, expiry * (version >= 16 ? 1000 : 1), 0, '', 1, ...(version < 15 ? [0] : [])); db.close()
    const sources = new BrowserCookieSources({ installations: async () => [{ kind: 'firefox', root }], temporaryDirectory: f.scratch }), selected = (await sources.list()).sources[0]!
    const cookies = JSON.parse((await sources.read(selected.id)).text)
    expect(cookies[0]).toMatchObject({ sameSite: 'none', expires: expiry }); expect(cookies[1]).toMatchObject({ sameSite: 'unspecified', expires: expiry }); expect(cookies[2].partitioned).toBe(true)
  })
})
