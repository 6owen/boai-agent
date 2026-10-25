/*
 * [INPUT]: 实际私有来源副本、有界 File 字节、可控真实准备退出与系统文件格式。
 * [OUTPUT]: 旧path无name指纹、准备并行/失败/真实退出后清理；持久来源重启按hash回收、未知归属/外改保留；普通文本路径/网页URL不成为附件，平台URI与Unicode文件列表边界。
 * [POS]: tests 的附件宿主来源模块验收，不启动Electron/模型或读取真实剪贴板。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { MaterialSources } from '../packages/shared/src/node/material-sources'
import { readClipboardMaterialPaths } from '../apps/electron/src/main/clipboard-material-files'
import { MATERIAL_LIMITS } from '../packages/shared/src/domain/materials'

const roots: string[] = [], registries: MaterialSources[] = []
afterEach(async () => {
  await Promise.all(registries.splice(0).map(registry => registry.close()))
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })))
})
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-material-source-')))
  roots.push(root)
  const errors: unknown[] = []
  const sources = new MaterialSources(join(root, 'sources'), error => errors.push(error))
  registries.push(sources)
  return { root, sources, errors }
}
const deferred = () => {
  let release!: () => void
  const promise = new Promise<void>(resolve => { release = resolve })
  return { promise, release }
}

describe('private attachment source lifetime', () => {
  it('preserves native path requests without adding a name or deleting the external file', async () => {
    const { root, sources } = await setup(), path = join(root, 'original.md')
    await writeFile(path, 'external')
    const selected = await sources.selectPath(path)
    await sources.prepare(selected.id, async (input, temporary) => {
      expect(input).toEqual({ path }); expect(temporary).toBe(false)
    })
    expect(await readFile(path, 'utf8')).toBe('external')
    expect(sources.has(selected.id)).toBe(true)
  })

  it('keeps the private original until every actual importer exits and then removes only that source', async () => {
    const { sources, errors } = await setup(), first = deferred(), second = deferred()
    const selected = await sources.selectBytes('截屏.png', new Uint8Array([1, 2, 3]))
    let path = ''
    const one = sources.prepare(selected.id, async (input, temporary) => {
      path = input.path; expect(input.name).toBe('截屏.png'); expect(temporary).toBe(true)
      await first.promise
    })
    const two = sources.prepare(selected.id, async () => { await second.promise })
    first.release(); await one
    expect(await readFile(path)).toEqual(Buffer.from([1, 2, 3]))
    second.release(); await two
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
    expect(sources.has(selected.id)).toBe(false); expect(errors).toEqual([])
  })

  it('waits for the importer at shutdown and cleans a failed import after it exits', async () => {
    const { sources } = await setup(), held = deferred()
    const selected = await sources.selectBytes('data.bin', new Uint8Array([4]))
    let path = ''
    const prepared = sources.prepare(selected.id, async input => { path = input.path; await held.promise; throw new Error('failed') })
    const rejected = expect(prepared).rejects.toThrow('failed')
    let closed = false
    const closing = sources.close().then(() => { closed = true })
    await Promise.resolve()
    expect(closed).toBe(false); expect(await readFile(path)).toEqual(Buffer.from([4]))
    held.release(); await rejected; await closing
    await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('preserves an externally changed original and reports the cleanup conflict', async () => {
    const { sources, errors } = await setup()
    const selected = await sources.selectBytes('data.bin', new Uint8Array([1]))
    let path = ''
    await sources.prepare(selected.id, async input => { path = input.path; await writeFile(path, 'changed') })
    expect(await readFile(path, 'utf8')).toBe('changed')
    expect(errors).toHaveLength(1)
  })

  it('rejects over-limit File bytes before creating a source', async () => {
    const { sources } = await setup()
    await expect(sources.selectBytes('large.bin', new Uint8Array(MATERIAL_LIMITS.attachmentBytes + 1))).rejects.toThrow('20 MiB')
  })

  it('recovers a previous process source by persisted hash without restoring its import token', async () => {
    const { root, sources } = await setup()
    const selected = await sources.selectBytes('private.json', Buffer.from('private attachment'))
    const errors: unknown[] = [], restarted = new MaterialSources(join(root, 'sources'), error => errors.push(error)); registries.push(restarted)
    await restarted.recover()
    expect(restarted.has(selected.id)).toBe(false)
    await expect(readFile(join(root, 'sources', selected.id, 'source.json'))).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(restarted.prepare(selected.id, async () => undefined)).rejects.toThrow('过期')
    expect(errors).toEqual([])
  })

  it.each(['changed bytes', 'missing ownership'])('preserves and reports a previous source with %s while new imports remain usable', async conflict => {
    const { root, sources } = await setup(), selected = await sources.selectBytes('private.png', Buffer.from('private attachment'))
    const directory = join(root, 'sources', selected.id), path = join(directory, 'source.png')
    if (conflict === 'changed bytes') await writeFile(path, 'external edit')
    else await rm(join(directory, '.source.json'))
    const errors: unknown[] = [], restarted = new MaterialSources(join(root, 'sources'), error => errors.push(error)); registries.push(restarted)
    await restarted.recover()
    expect(await readFile(path, 'utf8')).toBe(conflict === 'changed bytes' ? 'external edit' : 'private attachment')
    expect(errors).toHaveLength(1)
    const fresh = await restarted.selectBytes('new.txt', Buffer.from('new attachment'))
    await restarted.prepare(fresh.id, async source => { expect(await readFile(source.path, 'utf8')).toBe('new attachment') })
    expect(await readFile(path, 'utf8')).toBe(conflict === 'changed bytes' ? 'external edit' : 'private attachment')
  })
})

const clipboard = (values: Record<string, Buffer>) => ({ availableFormats: () => Object.keys(values), readBuffer: vi.fn((format: string) => values[format]) })
describe('system clipboard file references', () => {
  it('never reads or interprets ordinary path text as file selection', async () => {
    const value = clipboard({ 'text/plain': Buffer.from('/private/file.txt') })
    expect(await readClipboardMaterialPaths(value, 'linux')).toEqual([])
    expect(value.readBuffer).not.toHaveBeenCalled()
  })

  it('reads standard file URI lists, preserves multiple files, and ignores webpage URLs', async () => {
    const first = pathToFileURL('/tmp/one file.txt').href, second = pathToFileURL('/tmp/two.pdf').href
    const value = clipboard({ 'text/uri-list': Buffer.from(`#comment\nhttps://example.com\n${first}\n${second}\n${first}`) })
    expect(await readClipboardMaterialPaths(value, 'linux')).toEqual(['/tmp/one file.txt', '/tmp/two.pdf'])
    expect(await readClipboardMaterialPaths(clipboard({ 'text/uri-list': Buffer.from('https://example.com') }), 'linux')).toEqual([])
  })

  it('uses GNOME file references and rejects remote file hosts', async () => {
    expect(await readClipboardMaterialPaths(clipboard({ 'x-special/gnome-copied-files': Buffer.from('copy\nfile:///tmp/one.txt\nfile:///tmp/two.txt') }), 'linux')).toEqual(['/tmp/one.txt', '/tmp/two.txt'])
    await expect(readClipboardMaterialPaths(clipboard({ 'text/uri-list': Buffer.from('file://remote/share/file') }), 'linux')).rejects.toThrow('本机')
  })

  it('decodes the documented Windows Unicode DROPFILES list without treating a plain path string as a file URL', async () => {
    const names = Buffer.from('C:\\资料\\a.txt\0D:\\b.pdf\0\0', 'utf16le'), header = Buffer.alloc(20)
    header.writeUInt32LE(20, 0); header.writeUInt32LE(1, 16)
    expect(await readClipboardMaterialPaths(clipboard({ CF_HDROP: Buffer.concat([header, names]) }), 'win32')).toEqual(['C:\\资料\\a.txt', 'D:\\b.pdf'])
  })
})
