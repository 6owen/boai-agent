/*
 * [INPUT]: Real isolated staging files and bounded client chunk requests.
 * [OUTPUT]: Byte/hash/identity checks, retirement admission, capacity held through active preparation and actual importer cleanup.
 * [POS]: Material upload transport tests; no external model calls.
 * [PROTOCOL]: Changes update Header and tests/.folder.md.
 */
import { afterEach, expect, it, vi } from 'vitest'
import { createHash, randomUUID } from 'node:crypto'
import { mkdtemp, readFile, readdir, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MaterialUploads } from '../src/runtime/modules/materials/material-upload'
import { MATERIAL_CHUNK_BYTES } from '../src/shared/domain/material-upload'
import { MATERIAL_LIMITS } from '../src/shared/domain/materials'
const cleanups: (() => Promise<unknown> | void)[] = []
afterEach(async () => { for (const clean of cleanups.splice(0).reverse()) await clean() })
async function setup() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'boai-upload-')))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const errors: unknown[] = [], uploads = new MaterialUploads(join(root, 'staging'), error => errors.push(error))
  cleanups.push(() => uploads.close()); await uploads.init()
  return { root, uploads, errors }
}
const descriptor = (bytes: Buffer, name = '附件.bin') => ({ action: 'begin' as const, uploadId: randomUUID(), name, size: bytes.length, contentHash: createHash('sha256').update(bytes).digest('hex') })
async function transfer(uploads: MaterialUploads, bytes: Buffer) {
  const input = descriptor(bytes); await uploads.transfer(input)
  for (let offset = 0; offset < bytes.length; offset += MATERIAL_CHUNK_BYTES) await uploads.transfer({ action: 'chunk', uploadId: input.uploadId, offset, base64: bytes.subarray(offset, offset + MATERIAL_CHUNK_BYTES).toString('base64') })
  return { ...await uploads.transfer({ action: 'finish', uploadId: input.uploadId }), input }
}
it('transfers more than one RPC frame, verifies exact bytes and cleans the original private selection', async () => {
  const { root, uploads, errors } = await setup(), bytes = Buffer.alloc(3 * 1024 * 1024 + 5, 37)
  const result = await transfer(uploads, bytes)
  expect(result.offset).toBe(bytes.length); expect(uploads.busy).toBe(true)
  expect(await uploads.transfer({ action: 'finish', uploadId: result.uploadId })).toMatchObject(result.selectionId ? { selectionId: result.selectionId } : {})
  await uploads.prepare(result.selectionId!, async source => { expect(source.name).toBe('附件.bin'); expect(await readFile(source.path)).toEqual(bytes) })
  expect(uploads.busy).toBe(false); expect(await readdir(join(root, 'staging'))).toEqual([]); expect(errors).toEqual([])
})
it('accepts exact duplicate chunks but rejects changed identities, gaps, changed bytes and malformed base64', async () => {
  const { uploads } = await setup(), input = descriptor(Buffer.from('abcdef'))
  await uploads.transfer(input)
  await expect(uploads.transfer({ ...input, name: 'changed.bin' })).rejects.toThrow('不同文件')
  await expect(uploads.transfer({ action: 'chunk', uploadId: input.uploadId, offset: 2, base64: 'YWJj' })).rejects.toThrow('位置')
  expect(await uploads.transfer({ action: 'chunk', uploadId: input.uploadId, offset: 0, base64: 'YWJj' })).toMatchObject({ offset: 3 })
  expect(await uploads.transfer({ action: 'chunk', uploadId: input.uploadId, offset: 0, base64: 'YWJj' })).toMatchObject({ offset: 3 })
  await expect(uploads.transfer({ action: 'chunk', uploadId: input.uploadId, offset: 0, base64: 'ZGVm' })).rejects.toThrow('位置')
  await expect(uploads.transfer({ action: 'chunk', uploadId: input.uploadId, offset: 3, base64: 'AB==' })).rejects.toThrow('编码')
  await expect(uploads.transfer({ action: 'finish', uploadId: input.uploadId })).rejects.toThrow('完整')
})
it('rejects wrong hashes, paths and limits without creating a material selection', async () => {
  const { uploads, root } = await setup(), input = descriptor(Buffer.from('a'))
  await expect(uploads.transfer({ ...input, path: '/some/server/private/file' })).rejects.toThrow()
  await expect(uploads.transfer({ ...input, name: '../file' })).rejects.toThrow()
  await expect(uploads.transfer({ ...input, size: MATERIAL_LIMITS.attachmentBytes + 1 })).rejects.toThrow()
  await uploads.transfer(input)
  await uploads.transfer({ action: 'chunk', uploadId: input.uploadId, offset: 0, base64: 'Yg==' })
  await expect(uploads.transfer({ action: 'finish', uploadId: input.uploadId })).rejects.toThrow('校验')
  expect(await readdir(join(root, 'staging'))).toEqual([])
})
it('caps unfinished uploads and releases the reservation explicitly', async () => {
  const { uploads } = await setup(), ids = [descriptor(Buffer.alloc(0)), descriptor(Buffer.alloc(0)), descriptor(Buffer.alloc(0)), descriptor(Buffer.alloc(0))]
  for (const input of ids.slice(0, 3)) await uploads.transfer(input)
  await expect(uploads.transfer(ids[3])).rejects.toThrow('最多')
  await uploads.transfer({ action: 'abort', uploadId: ids[0].uploadId })
  expect(await uploads.transfer(ids[3])).toMatchObject({ offset: 0 })
})
it('shutdown waits for the actual importer and keeps its bytes until it exits', async () => {
  const { uploads, errors } = await setup(), result = await transfer(uploads, Buffer.from('held'))
  let release!: () => void, path = '', done = false
  const held = new Promise<void>(resolve => { release = resolve }); cleanups.push(release)
  const prepared = uploads.prepare(result.selectionId!, async source => { path = source.path; await held; expect(await readFile(path, 'utf8')).toBe('held') })
  await vi.waitFor(() => expect(path).toBeTruthy())
  const closing = uploads.close().then(() => { done = true })
  await Promise.resolve(); expect(done).toBe(false)
  release(); await prepared; await closing
  await expect(readFile(path)).rejects.toMatchObject({ code: 'ENOENT' }); expect(errors).toEqual([])
})
it.each(['abort', 'expire', 'close'] as const)('%s retires an upload immediately but keeps its reservation and bytes until active preparation exits', async action => {
  const { uploads, root, errors } = await setup(), bytes = Buffer.from('active original')
  if (action === 'expire') { vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); cleanups.push(() => { vi.useRealTimers() }) }
  const result = await transfer(uploads, bytes)
  let exit!: () => void, entered!: () => void, sourcePath = '', released = false
  const gate = new Promise<void>(resolve => { exit = resolve }), ready = new Promise<void>(resolve => { entered = resolve })
  const prepared = uploads.prepare(result.selectionId!, async source => { sourcePath = source.path; entered(); await gate; expect(await readFile(source.path)).toEqual(bytes) })
  cleanups.push(async () => { exit(); await prepared })
  await ready
  let release: Promise<unknown> | undefined, duplicate: Promise<unknown> | undefined
  if (action === 'expire') await vi.advanceTimersByTimeAsync(10 * 60_000)
  else release = (action === 'close' ? uploads.close() : uploads.transfer({ action: 'abort', uploadId: result.uploadId })).then(() => { released = true })
  if (action === 'abort') duplicate = uploads.transfer({ action: 'abort', uploadId: result.uploadId })
  await Promise.resolve(); await Promise.resolve()
  expect(uploads.busy).toBe(true); expect(released).toBe(false); expect(uploads.has(result.selectionId!)).toBe(false)
  if (action !== 'close') {
    await expect(uploads.transfer(result.input)).rejects.toThrow('清理')
    await expect(uploads.transfer({ action: 'finish', uploadId: result.uploadId })).rejects.toThrow('清理')
    await expect(uploads.prepare(result.selectionId!, async () => { throw new Error('retired selection used') })).rejects.toThrow('清理')
    await uploads.transfer(descriptor(Buffer.alloc(0))); await uploads.transfer(descriptor(Buffer.alloc(0)))
    await expect(uploads.transfer(descriptor(Buffer.alloc(0)))).rejects.toThrow('最多')
  }
  expect(await readFile(sourcePath)).toEqual(bytes)
  exit(); await prepared; await release; await duplicate
  await expect(readFile(sourcePath)).rejects.toMatchObject({ code: 'ENOENT' }); expect(await readdir(join(root, 'staging'))).toEqual([]); expect(errors).toEqual([])
  if (action !== 'close') {
    // A later intentional reuse cannot be deleted by the old duplicate abort.
    const original = await uploads.transfer(result.input); expect(original.offset).toBe(0)
    expect(await uploads.transfer({ action: 'chunk', uploadId: result.uploadId, offset: 0, base64: bytes.toString('base64') })).toMatchObject({ offset: bytes.length })
  }
})
