/*
 * [INPUT]: 公开网络边界、受控响应流和合法/恶意 ZIP 字节。
 * [OUTPUT]: 下载取消/限额/重定向、DNS 地址检查及解包路径/链接/校验和失败清理的回归。
 * [POS]: Skills 来源适配离线测试，不访问真实网络或用户技能。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, expect, test, vi } from 'vitest'
import { Readable } from 'node:stream'
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zipSync, strToU8 } from 'fflate'
import { archivePath, extractSkillArchive } from '../src/runtime/adapters/skills/archive'
import { downloadBytes, downloadUrl, isPublicAddress, resolvePublicEndpoint, type DownloadTransport } from '../src/runtime/adapters/skills/download'

const roots: string[] = []
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }) })
async function staging() { const root = await mkdtemp(join(tmpdir(), 'boai-archive-')); roots.push(root); return root }
const archive = (files: Record<string, Uint8Array>) => Buffer.from(zipSync(files, { level: 1 }))
const bytes = strToU8('---\nname: report-helper\ndescription: demo\n---\n# Instructions')

test('only ordinary public HTTPS endpoints are admitted, including IPv6 and mapped-address cases', async () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.31.1.1', '192.168.0.1', '100.64.1.1', '0.0.0.0', '224.0.0.1', '::1', '::ffff:127.0.0.1', 'fe80::1', 'fc00::1', '2001:db8::1', '2002:7f00:1::']) expect(isPublicAddress(address), address).toBe(false)
  for (const address of ['1.1.1.1', '8.8.8.8', '2606:4700:4700::1111']) expect(isPublicAddress(address), address).toBe(true)
  for (const url of ['file:///tmp/secret', 'http://example.com', 'https://user:secret@example.com', 'https://localhost/path', 'https://host.local/path', 'https://127.1/path', 'https://[::1]/path', 'https://example.com:8443/path']) expect(() => downloadUrl(url)).toThrow()
  const resolver = vi.fn().mockResolvedValue([{ address: '8.8.8.8', family: 4 }, { address: '127.0.0.1', family: 4 }])
  await expect(resolvePublicEndpoint(new URL('https://example.com'), resolver)).rejects.toThrow('非公开网络')
})

test('redirects to private networks never make a second request', async () => {
  const transport = vi.fn<DownloadTransport>().mockResolvedValue({ status: 302, location: 'https://169.254.169.254/latest', body: Readable.from([]) })
  await expect(downloadBytes('https://example.com/a.zip', { transport })).rejects.toThrow('公开 HTTPS')
  expect(transport).toHaveBeenCalledTimes(1)
})

test('actual response bytes are bounded even without a content length', async () => {
  const transport: DownloadTransport = async () => ({ status: 200, body: Readable.from([Buffer.alloc(4), Buffer.alloc(4)]) })
  await expect(downloadBytes('https://example.com/a.zip', { transport, maxBytes: 5 })).rejects.toThrow('大小限制')
  expect((await downloadBytes('https://example.com/a.zip', { transport, maxBytes: 8 })).bytes.length).toBe(8)
})

test('cancellation and the whole-request timeout close a stalled response body', async () => {
  const controller = new AbortController(), stream = new Readable({ read() {} })
  const transport: DownloadTransport = async () => ({ status: 200, body: stream })
  const pending = downloadBytes('https://example.com/a.zip', { transport, signal: controller.signal })
  const assertion = expect(pending).rejects.toThrow()
  controller.abort(); await assertion
  expect(stream.destroyed).toBe(true)
  const stalled = new Readable({ read() {} })
  await expect(downloadBytes('https://example.com/a.zip', { timeoutMs: 10, transport: async () => ({ status: 200, body: stalled }) })).rejects.toThrow('超时')
  expect(stalled.destroyed).toBe(true)
})

test('full ZIP content is restored without executing repository scripts', async () => {
  const root = await staging()
  const zipped = archive({ 'skills/report-helper/SKILL.md': bytes, 'skills/report-helper/assets/data.bin': Uint8Array.from([0, 255]), 'meta.ts': strToU8('throw new Error("NEVER EXECUTE")'), 'package.json': strToU8('{"scripts":{"postinstall":"exit 1"}}') })
  const result = await extractSkillArchive(zipped, root)
  expect(result.files).toBe(4)
  expect(await readFile(join(result.directory, 'skills/report-helper/SKILL.md'))).toEqual(Buffer.from(bytes))
  expect(await readFile(join(result.directory, 'skills/report-helper/assets/data.bin'))).toEqual(Buffer.from([0, 255]))
})

test('archive paths reject traversal, absolute/drive paths, devices and ambiguous separators', () => {
  for (const name of ['../escape', '/outside', 'C:/outside', '\\\\server\\share', 'a\\b', 'a//b', 'a/./b', 'a/../b', 'nul.txt', 'a/con', 'a/ends.', 'a/ends ', 'a/\0']) expect(() => archivePath(name), name).toThrow()
  expect(archivePath('references/文档.md')).toBe('references/文档.md')
})

test('unsafe archives leave no partially extracted folder', async () => {
  const root = await staging()
  const cases = [archive({ '../escape': bytes }), archive({ '/absolute': bytes }), archive({ 'C:/escape': bytes }), archive({ 'A.md': bytes, 'a.md': bytes }), archive({ 'folder/file.md': bytes, folder: bytes }), Buffer.from(zipSync({ link: [strToU8('outside'), { os: 3, attrs: 0o120777 << 16 }] }))]
  for (const zipped of cases) {
    await expect(extractSkillArchive(zipped, root)).rejects.toThrow()
    expect(await readdir(root)).toEqual([])
  }
})

test('duplicate paths and corrupted file CRC fail before returning a usable package', async () => {
  const root = await staging()
  const duplicate = archive({ 'first.txt': bytes, 'other.txt': bytes })
  for (let index = duplicate.indexOf('other.txt'); index >= 0; index = duplicate.indexOf('other.txt')) duplicate.write('first.txt', index)
  await expect(extractSkillArchive(duplicate, root)).rejects.toThrow('重复路径')
  const corrupt = archive({ 'SKILL.md': bytes }), central = corrupt.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  corrupt.writeUInt32LE(0, central + 16)
  await expect(extractSkillArchive(corrupt, root)).rejects.toThrow('校验失败')
  expect(await readdir(root)).toEqual([])
})

test('declared expansion limits and cancellation leave no staged files', async () => {
  const root = await staging(), oversized = archive({ 'SKILL.md': bytes })
  const central = oversized.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]))
  oversized.writeUInt32LE(101 * 1024 * 1024, central + 24)
  await expect(extractSkillArchive(oversized, root)).rejects.toThrow('100 MB')
  const controller = new AbortController(); controller.abort(new Error('stop'))
  await expect(extractSkillArchive(archive({ 'SKILL.md': bytes }), root, controller.signal)).rejects.toThrow('stop')
  expect(await readdir(root)).toEqual([])
})
