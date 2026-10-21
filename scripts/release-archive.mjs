/*
 * [INPUT]: 明确的个人macOS ZIP及不存在的隔离输出目录；Node24/yauzl锁定版本。
 * [OUTPUT]: 显式/隐式路径统一拼写与总节点有界，CRC/字节核验后文件先写、链接后建并核实际边界；不授安装资格。
 * [POS]: 产物冒烟与后续升级共用ZIP阶段；任何失败保留独立现场，不覆盖已有目录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查scripts/.folder.md。
 */
import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { mkdir, chmod, lchmod, symlink, statfs, lstat } from 'node:fs/promises'
import { dirname, join, posix, resolve } from 'node:path'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { crc32 } from 'node:zlib'
import yauzl from 'yauzl'
import { bundleInventory, releaseFile } from './release-build.mjs'

export const personalAppName = 'BoAI Agent.app'
export const releaseArchiveLimits = Object.freeze({ entries: 50000, archiveBytes: 4 * 1024 ** 3, bytes: 4 * 1024 ** 3, linkBytes: 4096, reserveBytes: 256 * 1024 ** 2 })
const key = path => path.normalize('NFD').toLowerCase()
const inside = path => path === '/' + personalAppName || path.startsWith('/' + personalAppName + '/')
async function catalog(zip, signal) {
  const rows = [], seen = new Map(), paths = new Map(); let bytes = 0
  for await (const entry of zip.eachEntry()) {
    signal.throwIfAborted()
    const mode = entry.externalFileAttributes >>> 16, type = mode & 0o170000, name = entry.fileName
    const directory = type === 0o040000, path = directory ? name.slice(0, -1) : name, parts = path.split('/')
    if (!name || Buffer.byteLength(name) > 4096 || /[\u0000-\u001f\u007f\\]/.test(name) || directory !== name.endsWith('/') || parts[0] !== personalAppName || parts.some(part => !part || part === '.' || part === '..') || seen.has(key(path))) throw Error('个人ZIP路径越界、重复或归一化冲突')
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join('/'), normalized = key(prefix)
      if (paths.has(normalized) && paths.get(normalized) !== prefix) throw Error('个人ZIP父路径归一化冲突')
      paths.set(normalized, prefix)
      if (paths.size > releaseArchiveLimits.entries) throw Error('个人ZIP超过显式与隐式总节点上限')
    }
    if (![0o040000, 0o100000, 0o120000].includes(type) || mode & 0o7000 || entry.generalPurposeBitFlag & 1 || ![0, 8].includes(entry.compressionMethod)) throw Error('个人ZIP包含特殊文件、特殊权限或不支持的内容')
    if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || directory && entry.uncompressedSize !== 0 || type === 0o120000 && entry.uncompressedSize > releaseArchiveLimits.linkBytes) throw Error('个人ZIP条目大小不合法')
    bytes += entry.uncompressedSize
    if (rows.length >= releaseArchiveLimits.entries || bytes > releaseArchiveLimits.bytes) throw Error('个人ZIP超过展开大小或条目上限')
    const row = { path, type: directory ? 'directory' : type === 0o120000 ? 'link' : 'file', mode: mode & 0o777, bytes: entry.uncompressedSize, crc32: entry.crc32, entry }
    if (row.type === 'link') {
      const stream = await zip.openReadStreamPromise(entry), chunks = []; let size = 0
      for await (const chunk of stream) { signal.throwIfAborted(); size += chunk.length; if (size > releaseArchiveLimits.linkBytes) { stream.destroy(); throw Error('个人ZIP链接过长') }; chunks.push(chunk) }
      const value = Buffer.concat(chunks)
      if (value.length !== row.bytes || crc32(value) !== row.crc32) throw Error('个人ZIP链接CRC或长度不符')
      row.target = new TextDecoder('utf8', { fatal: true }).decode(value)
      if (!row.target || /[\u0000-\u001f\u007f\\]/.test(row.target) || posix.isAbsolute(row.target) || !inside(posix.resolve('/', posix.dirname(path), row.target))) throw Error('个人ZIP链接越出应用目录')
    }
    seen.set(key(path), row); rows.push(row)
  }
  if (!rows.length || seen.get(key(personalAppName))?.type !== 'directory') throw Error('个人ZIP缺少唯一应用根目录')
  for (const row of rows) {
    const parts = row.path.split('/')
    for (let i = 1; i < parts.length; i++) { const parent = seen.get(key(parts.slice(0, i).join('/'))); if (parent && parent.type !== 'directory') throw Error('个人ZIP条目不能位于文件或链接之下') }
  }
  return { rows, bytes }
}
const publicRows = rows => rows.map(({ entry, ...row }) => row)
async function openArchive(archive, signal) {
  signal.throwIfAborted()
  if ((await lstat(archive)).size > releaseArchiveLimits.archiveBytes) throw Error('个人ZIP超过压缩包上限')
  const before = await releaseFile(archive, { signal })
  const zip = await yauzl.openPromise(archive, { autoClose: false, strictFileNames: true, validateEntrySizes: true })
  return { zip, before }
}
export async function inspectPersonalArchive(archive, { signal = new AbortController().signal } = {}) {
  archive = resolve(archive)
  const { zip, before } = await openArchive(archive, signal)
  try {
    const { rows, bytes } = await catalog(zip, signal)
    if (JSON.stringify(await releaseFile(archive, { signal })) !== JSON.stringify(before)) throw Error('核验期间ZIP字节变化')
    return { version: 1, archive: before, bytes, entries: publicRows(rows), authority: 'catalog only; actual links/files still require isolated extraction' }
  } finally { zip.close() }
}
export async function unpackPersonalArchive(archive, output, { signal = new AbortController().signal } = {}) {
  if (process.platform !== 'darwin') throw Error('个人应用ZIP展开目前仅支持macOS')
  archive = resolve(archive); output = resolve(output)
  const { zip, before } = await openArchive(archive, signal)
  try {
    const { rows, bytes } = await catalog(zip, signal), space = await statfs(dirname(output))
    if (space.bavail * space.bsize < bytes + releaseArchiveLimits.reserveBytes) throw Error('ZIP展开空间不足，尚未创建输出目录')
    signal.throwIfAborted(); await mkdir(output, { mode: 0o700 })
    for (const row of rows.filter(row => row.type !== 'link')) {
      signal.throwIfAborted()
      const target = join(output, row.path)
      if (row.type === 'directory') { await mkdir(target, { recursive: true, mode: 0o700 }); continue }
      await mkdir(dirname(target), { recursive: true, mode: 0o700 })
      let size = 0, checksum = 0; const hash = createHash('sha256')
      const meter = new Transform({ transform(chunk, _, done) {
        size += chunk.length
        if (size > row.bytes) { done(Error('个人ZIP文件超过登记大小')); return }
        checksum = crc32(chunk, checksum); hash.update(chunk); done(null, chunk)
      } })
      await pipeline(await zip.openReadStreamPromise(row.entry), meter, createWriteStream(target, { flags: 'wx', mode: 0o600 }), { signal })
      if (size !== row.bytes || checksum !== row.crc32) throw Error('个人ZIP文件CRC或长度不符')
      row.sha256 = hash.digest('hex'); await chmod(target, row.mode)
    }
    for (const row of rows.filter(row => row.type === 'link')) {
      signal.throwIfAborted()
      const target = join(output, row.path); await mkdir(dirname(target), { recursive: true, mode: 0o700 })
      await symlink(row.target, target); await lchmod(target, row.mode)
    }
    // No writes follow symlinks. The real filesystem walk also rejects chained
    // escapes, loops and dangling links before any executable can be selected.
    const app = join(output, personalAppName), files = await bundleInventory(app)
    for (const row of rows.filter(row => row.type === 'directory').sort((a, b) => b.path.length - a.path.length)) await chmod(join(output, row.path), row.mode)
    if (JSON.stringify(await releaseFile(archive, { signal })) !== JSON.stringify(before)) throw Error('展开期间ZIP字节变化')
    signal.throwIfAborted()
    return { version: 1, archive: before, bytes, app, entries: publicRows(rows), files, authority: 'isolated extraction only; identity/signature/smoke/install qualification separate' }
  } finally { zip.close() }
}
