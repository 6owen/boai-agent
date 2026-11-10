/*
 * [INPUT]: Real curl, loopback HTTP interruption/range responses and temporary cache files.
 * [OUTPUT]: Resume within/across invocations, range fallback, checksum rejection and cancellation.
 * [POS]: Release download transport regressions; no external downloads, build or GUI.
 * [PROTOCOL]: Update Header and tests/.folder.md when changed.
 */
import { afterEach, it } from 'vitest'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer, type RequestListener } from 'node:http'
import type { AddressInfo } from 'node:net'
import { mkdtemp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
// @ts-expect-error Plain Node release transport has no declaration file.
import { downloadReleaseArtifact } from '../scripts/release-download.mjs'

const body = Buffer.from('pinned Electron ZIP fixture\n'.repeat(6000))
const sha256 = createHash('sha256').update(body).digest('hex')
const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const finish of cleanup.splice(0).reverse()) await finish() })

async function fixture(handler: RequestListener) {
  const root = await mkdtemp(join(tmpdir(), 'boai-release-download-')), server = createServer(handler)
  await new Promise<void>(accept => server.listen(0, '127.0.0.1', accept))
  cleanup.push(async () => {
    server.closeAllConnections()
    await new Promise<void>((accept, reject) => server.close(error => error ? reject(error) : accept()))
    await rm(root, { recursive: true, force: true })
  })
  return { root, url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/electron.zip`, target: join(root, 'download.zip'), options: { cacheRoot: join(root, 'cache'), sha256, retryDelayMs: 0, log: () => {} } }
}

function interruptedServer(ranges: (string | undefined)[], supportsRanges = true): RequestListener {
  return (request, response) => {
    ranges.push(request.headers.range)
    const offset = supportsRanges ? Number(request.headers.range?.match(/^bytes=(\d+)-$/)?.[1] ?? 0) : 0
    response.writeHead(offset ? 206 : 200, { 'Content-Length': body.length - offset, ...(offset ? { 'Content-Range': `bytes ${offset}-${body.length - 1}/${body.length}` } : {}) })
    if (ranges.length === 1) { response.write(body.subarray(0, 4096)); setTimeout(() => response.destroy(), 25) }
    else response.end(body.subarray(offset))
  }
}

it('retries an interrupted transfer from the bytes already received', async () => {
  const ranges: (string | undefined)[] = [], f = await fixture(interruptedServer(ranges))
  await downloadReleaseArtifact(f.url, f.target, f.options)
  assert.deepEqual(await readFile(f.target), body)
  assert.deepEqual(ranges, [undefined, 'bytes=4096-'])
  assert.deepEqual(await readdir(join(f.options.cacheRoot, 'partial')), [])
})

it('preserves partial bytes after failure and resumes on the next invocation', async () => {
  const ranges: (string | undefined)[] = [], f = await fixture(interruptedServer(ranges))
  await assert.rejects(downloadReleaseArtifact(f.url, f.target, { ...f.options, attempts: 1 }))
  const partialRoot = join(f.options.cacheRoot, 'partial'), [partial] = await readdir(partialRoot)
  assert.equal((await stat(join(partialRoot, partial!))).size, 4096)
  const nextTarget = join(f.root, 'next-temporary-target.zip')
  await downloadReleaseArtifact(f.url, nextTarget, f.options)
  assert.deepEqual(await readFile(nextTarget), body)
  assert.deepEqual(ranges, [undefined, 'bytes=4096-'])
})

it('starts a fresh request when the server does not support ranges', async () => {
  const ranges: (string | undefined)[] = [], f = await fixture(interruptedServer(ranges, false))
  await downloadReleaseArtifact(f.url, f.target, f.options)
  assert.deepEqual(await readFile(f.target), body)
  assert.deepEqual(ranges, [undefined, 'bytes=4096-', undefined])
})

it('never returns a corrupt download and discards invalid completed partials', async () => {
  let requests = 0
  const f = await fixture((_request, response) => { requests++; response.end('corrupt zip') })
  await assert.rejects(downloadReleaseArtifact(f.url, f.target, { ...f.options, attempts: 2 }), /SHA256/)
  assert.equal(requests, 2)
  await assert.rejects(readFile(f.target), { code: 'ENOENT' })
  assert.deepEqual(await readdir(join(f.options.cacheRoot, 'partial')), [])
})

it('reuses an already complete partial only after verifying its checksum', async () => {
  let requests = 0
  const f = await fixture((_request, response) => { requests++; response.end('unexpected network') })
  await mkdir(join(f.options.cacheRoot, 'partial'), { recursive: true })
  await writeFile(join(f.options.cacheRoot, 'partial', `${sha256}.part`), body)
  await downloadReleaseArtifact(f.url, f.target, f.options)
  assert.deepEqual(await readFile(f.target), body)
  assert.equal(requests, 0)
})

it('cancels the actual curl child without retrying and retains received bytes', async () => {
  let requests = 0
  const controller = new AbortController()
  const f = await fixture((_request, response) => {
    requests++; response.writeHead(200, { 'Content-Length': body.length }); response.write(body.subarray(0, 4096))
    setTimeout(() => controller.abort(), 50)
  })
  await assert.rejects(downloadReleaseArtifact(f.url, f.target, { ...f.options, signal: controller.signal }), { name: 'AbortError' })
  assert.equal(requests, 1)
  assert.equal((await readdir(join(f.options.cacheRoot, 'partial'))).length, 1)
  await assert.rejects(readFile(f.target), { code: 'ENOENT' })
})
