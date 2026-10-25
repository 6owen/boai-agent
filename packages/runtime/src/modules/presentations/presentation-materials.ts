/*
 * [INPUT]: Host-authorized source bytes and a current-source verifier; private cache root.
 * [OUTPUT]: Template inspection and content-addressed extraction, preserving full text, notes, data and image manifests.
 * [OUTPUT]: Cache hits require the original manifest digest; changed manifests and linked directories are rejected.
 * [POS]: Byte boundary for source materials; arbitrary employee paths never reach the parser.
 * [PROTOCOL]: Update Header and presentations/.folder.md when changed.
 */
import { createHash } from 'node:crypto'
import { mkdir, lstat, readFile, realpath, writeFile } from 'node:fs/promises'
import { extname, join, resolve } from 'node:path'
import { presentationWorker } from './worker-client'
import type { inspectTemplate } from './alma/template.mjs'

export interface PresentationSource { name: string; bytes: Uint8Array; verify(): Promise<void> }
export interface MaterialPage { number: number; text: string[]; speakerNotes: string[]; images: Array<{ extractedPath: string; sha256: string }>; tables: string[][][]; charts: Array<{ categories: string[]; series: Array<{ name: string; values: Array<number | string> }> }> }
export interface MaterialExtraction { manifest: { version: 1; sourcePath: string; sourceSha256: string; slideCount: number; slides: MaterialPage[] }; manifestPath: string; cacheHit: boolean }
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
export class PresentationMaterials {
  readonly root: string
  constructor(root: string) { this.root = resolve(root) }
  private async source(input: PresentationSource, signal?: AbortSignal) {
    signal?.throwIfAborted(); await input.verify()
    const extension = extname(input.name).toLowerCase()
    if (!['.pptx', '.docx', '.xlsx', '.pdf', '.txt', '.md', '.csv', '.json'].includes(extension)) throw new Error('Unsupported presentation source format')
    if (input.bytes.byteLength > 250 * 1024 * 1024) throw new Error('Presentation source exceeds 250 MiB')
    await mkdir(this.root, { recursive: true })
    if (await realpath(this.root) !== this.root || (await lstat(this.root)).isSymbolicLink()) throw new Error('Material cache must be an owned directory')
    const bytes = Buffer.from(input.bytes), hash = digest(bytes), filePath = join(this.root, `source-${hash}${extension}`)
    try { await writeFile(filePath, bytes, { flag: 'wx' }) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
    if ((await lstat(filePath)).isSymbolicLink() || digest(await readFile(filePath)) !== hash) throw new Error('Cached presentation source changed outside its checkpoint')
    signal?.throwIfAborted(); await input.verify()
    return { filePath, hash }
  }
  async inspect(input: PresentationSource, signal?: AbortSignal): Promise<Awaited<ReturnType<typeof inspectTemplate>>> {
    const source = await this.source(input, signal)
    const result = await presentationWorker('material', { input: { filePath: source.filePath, operation: 'inspect' } }, signal)
    await input.verify(); signal?.throwIfAborted()
    return result.result as Awaited<ReturnType<typeof inspectTemplate>>
  }
  async extract(input: PresentationSource, signal?: AbortSignal): Promise<MaterialExtraction> {
    const source = await this.source(input, signal)
    const result = await presentationWorker('material', { input: { filePath: source.filePath, outputRoot: this.root } }, signal)
    await input.verify(); signal?.throwIfAborted()
    const value = result.result as MaterialExtraction
    if (value.manifest.sourceSha256 !== source.hash || value.manifestPath !== join(this.root, source.hash, 'material.json')) throw new Error('Material extractor returned a mismatched source')
    const directory = join(this.root, source.hash)
    if (await realpath(directory) !== directory || (await lstat(value.manifestPath)).isSymbolicLink()) throw new Error('Material cache is not an owned regular path')
    const manifestBytes = await readFile(value.manifestPath), manifestHash = digest(manifestBytes), receipt = join(directory, 'manifest.sha256')
    if (!value.cacheHit) await writeFile(receipt, manifestHash, { flag: 'wx' })
    if ((await lstat(receipt)).isSymbolicLink() || await readFile(receipt, 'utf8') !== manifestHash) throw new Error('Material manifest changed outside its checkpoint')
    // Parser caches are private, but still reject externally changed asset paths/bytes.
    for (const page of value.manifest.slides) for (const image of page.images) {
      if (!/^[a-f0-9]{64}$/.test(image.sha256) || resolve(image.extractedPath) !== join(this.root, source.hash, 'assets', `${image.sha256}${extname(image.extractedPath)}`)) throw new Error('Material asset escaped its source cache')
      if (await realpath(join(directory, 'assets')) !== join(directory, 'assets')) throw new Error('Material assets cannot use linked directories')
      if ((await lstat(image.extractedPath)).isSymbolicLink() || digest(await readFile(image.extractedPath)) !== image.sha256) throw new Error('Material asset changed outside its checkpoint')
    }
    return value
  }
}
