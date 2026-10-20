/*
 * [INPUT]: 标准库生成的真实ZIP、隔离目录/链接、CRC损坏和取消；仅空间状态使用显式局部夹具。
 * [OUTPUT]: 保留执行模式的成功解包及越界/别名/链接链/损坏/已有目录负例，个人数据始终保持。
 * [POS]: 个人产物共用ZIP阶段合同；不启动GUI、模型或安装器。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查tests/.folder.md。
 */
import { afterEach, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile, readFile, rm, lstat, readlink, mkdir, truncate } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
// @ts-expect-error Shared Node archive module has no declaration.
import { inspectPersonalArchive, unpackPersonalArchive, releaseArchiveLimits } from '../scripts/release-archive.mjs'

const directories: string[] = []
afterEach(async () => { vi.doUnmock('node:fs/promises'); vi.resetModules(); for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })
const app = 'BoAI Agent.app', safe = [
  { path: app + '/', type: 'directory', data: '', mode: 0o755 },
  { path: app + '/Contents/', type: 'directory', data: '', mode: 0o755 },
  { path: app + '/Contents/run', type: 'file', data: 'actual executable bytes', mode: 0o755 },
  { path: app + '/Contents/current', type: 'link', data: 'run', mode: 0o755 },
]
async function fixture(entries = safe) {
  const directory = await mkdtemp(join(tmpdir(), 'boai-release-archive-')); directories.push(directory)
  const archive = join(directory, 'app.zip'), output = join(directory, 'staging'), sentinel = join(directory, 'outside')
  await writeFile(sentinel, 'personal bytes stay')
  const input = join(directory, 'entries.json'); await writeFile(input, JSON.stringify(entries))
  execFileSync('python3', ['-c', `import zipfile,json,stat,sys
with open(sys.argv[1]) as f:entries=json.load(f)
with zipfile.ZipFile(sys.argv[2],'w') as z:
 for e in entries:
  i=zipfile.ZipInfo(e['path']);i.create_system=3;i.compress_type=zipfile.ZIP_DEFLATED
  kind={'directory':stat.S_IFDIR,'file':stat.S_IFREG,'link':stat.S_IFLNK,'fifo':stat.S_IFIFO}[e['type']]
  i.external_attr=(kind|e['mode'])<<16;z.writestr(i,e['data'])
`, input, archive], { timeout: 10000 })
  return { directory, archive, output, sentinel }
}
it('真实ZIP展开保留文件字节、可执行权限与合法内部链接，归档原字节保持', async () => {
  const f = await fixture(), before = await readFile(f.archive), info = await inspectPersonalArchive(f.archive)
  expect(info.entries).toHaveLength(4)
  expect(info.entries.find((row: { type: string }) => row.type === 'link')).toMatchObject({ target: 'run' })
  const result = await unpackPersonalArchive(f.archive, f.output)
  expect(result.archive).toEqual(info.archive); expect(await readFile(join(result.app, 'Contents/current'), 'utf8')).toBe('actual executable bytes')
  expect((await lstat(join(result.app, 'Contents/run'))).mode & 0o777).toBe(0o755)
  expect((await lstat(join(result.app, 'Contents/current'))).mode & 0o777).toBe(0o755)
  expect(await readlink(join(result.app, 'Contents/current'))).toBe('run')
  expect(await readFile(f.archive)).toEqual(before); expect(await readFile(f.sentinel, 'utf8')).toBe('personal bytes stay')
})
it.each([
  { name: 'parent', row: { path: '../outside', type: 'file', data: 'bad', mode: 0o644 } },
  { name: 'absolute', row: { path: '/outside', type: 'file', data: 'bad', mode: 0o644 } },
  { name: 'wrong-root', row: { path: 'Other.app/file', type: 'file', data: 'bad', mode: 0o644 } },
  { name: 'backslash', row: { path: app + '/bad\\path', type: 'file', data: 'bad', mode: 0o644 } },
  { name: 'duplicate', row: safe[2]! },
  { name: 'case-alias', row: { path: app + '/Contents/RUN', type: 'file', data: 'bad', mode: 0o644 } },
  { name: 'special', row: { path: app + '/fifo', type: 'fifo', data: '', mode: 0o644 } },
  { name: 'privileged', row: { path: app + '/privileged', type: 'file', data: 'bad', mode: 0o4755 } },
  { name: 'link-escape', row: { path: app + '/Contents/escape', type: 'link', data: '../../../outside', mode: 0o755 } },
  { name: 'link-absolute', row: { path: app + '/Contents/escape', type: 'link', data: '/outside', mode: 0o755 } },
  { name: 'link-parent', row: { path: app + '/Contents/current/nested', type: 'file', data: 'bad', mode: 0o644 } },
  { name: 'file-parent', row: { path: app + '/Contents/run/nested', type: 'file', data: 'bad', mode: 0o644 } },
])('$name拒绝且零输出目录、外部原件不变', async ({ row }) => {
  const f = await fixture([...safe, row])
  await expect(unpackPersonalArchive(f.archive, f.output)).rejects.toThrow()
  await expect(lstat(f.output)).rejects.toMatchObject({ code: 'ENOENT' }); expect(await readFile(f.sentinel, 'utf8')).toBe('personal bytes stay')
})
it('Unicode归一化别名在任何写入前拒绝', async () => {
  const f = await fixture([...safe, { path: app + '/é', type: 'file', data: 'one', mode: 0o644 }, { path: app + '/e\u0301', type: 'file', data: 'two', mode: 0o644 }])
  await expect(unpackPersonalArchive(f.archive, f.output)).rejects.toThrow('冲突')
  await expect(lstat(f.output)).rejects.toMatchObject({ code: 'ENOENT' })
})
it('链接链词法在内但实际越界时不产生可用应用，也不写外部文件', async () => {
  const f = await fixture([...safe, { path: app + '/B', type: 'link', data: '.', mode: 0o755 }, { path: app + '/C/', type: 'directory', data: '', mode: 0o755 }, { path: app + '/C/link', type: 'link', data: '../B/..', mode: 0o755 }])
  // The target exists at the extraction root, proving a real escape rather than
  // accepting an unrelated missing-target error as the tested boundary.
  await expect(unpackPersonalArchive(f.archive, f.output)).rejects.toThrow('越出应用目录')
  expect(await readFile(f.sentinel, 'utf8')).toBe('personal bytes stay')
})
it('损坏中央目录CRC不能靠成功解压取得字节资格', async () => {
  const f = await fixture(), bytes = await readFile(f.archive)
  for (let i = 0; i < bytes.length - 46; i++) if (bytes.readUInt32LE(i) === 0x02014b50) {
    const name = bytes.subarray(i + 46, i + 46 + bytes.readUInt16LE(i + 28)).toString()
    if (name.endsWith('/run')) { bytes.writeUInt32LE((bytes.readUInt32LE(i + 16) ^ 1) >>> 0, i + 16); break }
  }
  await writeFile(f.archive, bytes)
  await expect(unpackPersonalArchive(f.archive, f.output)).rejects.toThrow('CRC')
  expect(await readFile(f.sentinel, 'utf8')).toBe('personal bytes stay')
})
it('已有目录和取消均不能覆盖原有材料或开始下一步', async () => {
  const f = await fixture(); await mkdir(f.output); await writeFile(join(f.output, 'keep'), 'keep')
  await expect(unpackPersonalArchive(f.archive, f.output)).rejects.toMatchObject({ code: 'EEXIST' })
  expect(await readFile(join(f.output, 'keep'), 'utf8')).toBe('keep')
  const controller = new AbortController(); controller.abort()
  await expect(unpackPersonalArchive(f.archive, join(f.directory, 'cancelled'), { signal: controller.signal })).rejects.toThrow()
  await expect(lstat(join(f.directory, 'cancelled'))).rejects.toMatchObject({ code: 'ENOENT' })
})
it('截断ZIP不能创建解包目录', async () => {
  const f = await fixture(), bytes = await readFile(f.archive); await writeFile(f.archive, bytes.subarray(0, bytes.length - 22))
  await expect(unpackPersonalArchive(f.archive, f.output)).rejects.toThrow(); await expect(lstat(f.output)).rejects.toMatchObject({ code: 'ENOENT' })
})
it('稀疏超大归档在哈希或解压前拒绝，零输出且不分配巨量内容', async () => {
  const f = await fixture(); await truncate(f.archive, releaseArchiveLimits.archiveBytes + 1)
  await expect(unpackPersonalArchive(f.archive, f.output)).rejects.toThrow('压缩包上限')
  await expect(lstat(f.output)).rejects.toMatchObject({ code: 'ENOENT' })
})
it('显式零可用空间夹具在写入前拒绝，生产空间查询无替换', async () => {
  const f = await fixture()
  vi.doMock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof import('node:fs/promises')>(), statfs: async () => ({ bsize: 4096, bavail: 0 }) }))
  vi.resetModules()
  // @ts-expect-error Shared Node archive module has no declaration.
  const isolated = await import('../scripts/release-archive.mjs')
  await expect(isolated.unpackPersonalArchive(f.archive, f.output)).rejects.toThrow('空间不足')
  await expect(lstat(f.output)).rejects.toMatchObject({ code: 'ENOENT' })
})
