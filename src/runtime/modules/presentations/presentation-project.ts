/*
 * [INPUT]: Private host-owned project root, complete Alma schemas and actual compilation workers.
 * [OUTPUT]: Immutable revision directories and one atomic current pointer; failed compilation preserves the prior deck.
 * [OUTPUT]: Actual renderer preflight and revision-bound dedicated visual review; approved-byte export rejects changed or unreviewed files.
 * [OUTPUT]: Explicit authorized image-byte import; compilation accepts only matching private content-addressed assets.
 * [POS]: Presentation kernel only. Not registered with employees, CLI or application protocol yet.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, rm, lstat, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { p as specSchema, b as slideSchema, v as validate, type PresentationSpec } from './alma/model.mjs'
import { presentationWorker } from './worker-client'
import { probePresentationRenderer } from './renderer-probe'
import { reviewSlides, type VisionReviewer } from './visual-review'
import type { PresentationSource } from './presentation-materials'
import { materialImageMimeType } from '../materials/material-files'

const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const identity = z.string().uuid()
const pointerSchema = z.object({ revision: z.number().int().nonnegative(), directory: z.string().regex(/^r\d+-[a-f0-9-]{36}$/), stateHash: z.string().regex(/^[a-f0-9]{64}$/), fileHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
const queues = new Map<string, Promise<unknown>>()
async function serialized<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve()
  const next = previous.catch(() => undefined).then(operation)
  queues.set(key, next)
  try { return await next } finally { if (queues.get(key) === next) queues.delete(key) }
}

/** The BOAI single-owner host must own this root; never accept it from model input. */
export class PresentationProjects {
  readonly root: string
  constructor(root: string) { this.root = resolve(root) }
  private directory(id: string) { return join(this.root, identity.parse(id)) }
  private async checkDirectory(directory: string) {
    const stat = await lstat(directory)
    if (!stat.isDirectory() || stat.isSymbolicLink() || await realpath(directory) !== directory) throw new Error('Presentation directory is not an owned regular directory')
  }
  private async checkAssets(spec: PresentationSpec) {
    for (const slide of spec.slides) for (const element of slide.elements) if (element.type === 'image') {
      const file = element.path
      if (typeof file !== 'string' || !/^[a-f0-9]{64}\.(png|jpg|webp|gif)$/.test(file.split('/').at(-1) ?? '') || resolve(file) !== join(this.directory(spec.id), 'assets', file.split('/').at(-1)!)) throw new Error('Presentation image is not connected to an authorized imported asset')
      await this.checkDirectory(join(this.directory(spec.id), 'assets'))
      const stat = await lstat(file)
      if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || digest(await readFile(file)) !== file.split('/').at(-1)!.slice(0, 64)) throw new Error('Presentation image changed outside its checkpoint')
    }
  }
  async importImage(id: string, source: PresentationSource, signal?: AbortSignal) {
    return serialized(this.directory(id), async () => {
      signal?.throwIfAborted(); await source.verify(); await this.get(id)
      const bytes = Buffer.from(source.bytes), mime = materialImageMimeType(bytes)
      const extension = mime === 'image/png' ? '.png' : mime === 'image/jpeg' ? '.jpg' : mime === 'image/webp' ? '.webp' : mime === 'image/gif' ? '.gif' : undefined
      if (!extension || bytes.length > 20 * 1024 * 1024) throw new Error('Presentation image import requires PNG/JPEG/WebP/GIF bytes, at most 20 MiB')
      const directory = join(this.directory(id), 'assets'), hash = digest(bytes), file = join(directory, `${hash}${extension}`)
      await mkdir(directory, { recursive: true }); await this.checkDirectory(directory)
      let created = false
      try {
        try { await writeFile(file, bytes, { flag: 'wx' }); created = true }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error }
        if ((await lstat(file)).isSymbolicLink() || digest(await readFile(file)) !== hash) throw new Error('Presentation image changed outside its checkpoint')
        signal?.throwIfAborted(); await source.verify()
        return { path: file, sha256: hash, mimeType: mime!, bytes: bytes.length }
      } catch (error) {
        if (created && !(await lstat(file)).isSymbolicLink() && digest(await readFile(file)) === hash) await rm(file)
        throw error
      }
    })
  }
  async get(id: string) {
    const directory = this.directory(id)
    await this.checkDirectory(directory)
    const pointerPath = join(directory, 'current.json')
    if ((await lstat(pointerPath)).isSymbolicLink()) throw new Error('Presentation pointer is a symbolic link')
    const pointer = pointerSchema.parse(JSON.parse(await readFile(pointerPath, 'utf8')))
    const version = join(directory, pointer.directory)
    await this.checkDirectory(version)
    const statePath = join(version, 'state.json'), filePath = join(version, 'presentation.pptx')
    for (const file of [statePath, filePath]) if (!(await lstat(file)).isFile() || (await lstat(file)).isSymbolicLink()) throw new Error('Presentation revision is not a regular file')
    const [state, bytes] = await Promise.all([readFile(statePath, 'utf8'), readFile(filePath)])
    if (digest(state) !== pointer.stateHash || digest(bytes) !== pointer.fileHash) throw new Error('Presentation revision changed outside its checkpoint')
    const spec = specSchema.parse(JSON.parse(state))
    if (spec.id !== id || spec.revision !== pointer.revision || spec.outputPath !== filePath || spec.assetBasePath !== directory) throw new Error('Presentation revision identity mismatch')
    return { spec, filePath, fileHash: pointer.fileHash, validation: validate(spec) }
  }
  async create(input: unknown, signal?: AbortSignal) {
    signal?.throwIfAborted()
    const id = randomUUID(), directory = this.directory(id), now = new Date().toISOString()
    const fields = z.record(z.string(), z.unknown()).parse(input)
    const spec = specSchema.parse({ ...fields, version: 1, revision: 0, id, author: fields.author ?? 'BOAI', slides: [], outputPath: join(directory, 'pending.pptx'), assetBasePath: directory, createdAt: now, updatedAt: now })
    await mkdir(this.root, { recursive: true }); await this.checkDirectory(this.root)
    await mkdir(directory)
    // An uncertain pointer commit is preserved for inspection, never auto-replayed.
    return this.commit(spec, signal)
  }
  async upsert(id: string, expectedRevision: number, input: unknown, signal?: AbortSignal) {
    const directory = this.directory(id)
    return serialized(directory, async () => {
      signal?.throwIfAborted()
      const current = await this.get(id)
      if (current.spec.revision !== expectedRevision) throw new Error('Presentation revision conflict; read the current deck before editing')
      const slide = slideSchema.parse(input)
      const slides = current.spec.slides.slice(), index = slides.findIndex(item => item.id === slide.id)
      if (index < 0) slides.push(slide); else slides[index] = slide
      return this.commit(specSchema.parse({ ...current.spec, revision: expectedRevision + 1, slides, updatedAt: new Date().toISOString() }), signal)
    })
  }
  private async commit(input: PresentationSpec, signal?: AbortSignal) {
    const validation = validate(input)
    if (!validation.valid) throw new Error(validation.errors.map(error => `${error.code}: ${error.message}`).join('; '))
    await this.checkAssets(input)
    const directory = this.directory(input.id), suffix = randomUUID(), name = `r${input.revision}-${suffix}`
    const staging = join(directory, `.pending-${suffix}`), version = join(directory, name), tempPointer = join(directory, `.pointer-${suffix}`)
    const spec = specSchema.parse({ ...input, outputPath: join(version, 'presentation.pptx') })
    await mkdir(staging)
    try {
      await presentationWorker('compiler', { spec, targetPath: join(staging, 'presentation.pptx') }, signal)
      signal?.throwIfAborted()
      await this.checkAssets(spec)
      const bytes = await readFile(join(staging, 'presentation.pptx')), state = JSON.stringify(spec, null, 2) + '\n'
      await writeFile(join(staging, 'state.json'), state, { flag: 'wx' })
      const pointer = { revision: spec.revision, directory: name, stateHash: digest(state), fileHash: digest(bytes) }
      await rename(staging, version)
      await writeFile(tempPointer, JSON.stringify(pointer) + '\n', { flag: 'wx' })
      signal?.throwIfAborted()
      await rename(tempPointer, join(directory, 'current.json'))
      return { spec, filePath: spec.outputPath, fileHash: pointer.fileHash, validation }
    } finally {
      await rm(staging, { recursive: true, force: true }); await rm(tempPointer, { force: true })
    }
  }
  async render(id: string, rendererPath: string, signal?: AbortSignal) {
    const current = await this.get(id)
    if (!current.spec.slides.length) throw new Error('Cannot render an empty presentation')
    const renderer = await probePresentationRenderer(rendererPath, signal)
    const outputDir = join(this.directory(id), `render-${current.spec.revision}-${randomUUID()}`)
    const result = await presentationWorker('renderer', { input: { rendererPath, presentationPath: current.filePath, outputDir, slideIds: current.spec.slides.map(slide => slide.id), width: 1600, height: 900, timeoutMs: 90_000 } }, signal, 95_000)
    if (!result.images || result.images.length !== current.spec.slides.length) throw new Error('Renderer did not return every slide')
    if ((await this.get(id)).fileHash !== current.fileHash) throw new Error('Presentation changed during rendering; images belong to an earlier revision')
    return { revision: current.spec.revision, fileHash: current.fileHash, images: result.images, renderer, reviewed: false as const }
  }
  async review(id: string, rendererPath: string, reviewer: VisionReviewer | undefined, signal?: AbortSignal) {
    if (!reviewer) throw new Error('Presentation review requires a configured dedicated vision model; no chat-model fallback')
    signal?.throwIfAborted(); await reviewer.verify()
    const current = await this.get(id), rendered = await this.render(id, rendererPath, signal)
    if (rendered.fileHash !== current.fileHash) throw new Error('Presentation changed before visual review')
    const images = await Promise.all(rendered.images.map(async (file, index) => {
      if ((await lstat(file)).isSymbolicLink()) throw new Error('Rendered slide cannot be a symbolic link')
      const bytes = await readFile(file)
      return { slideId: current.spec.slides[index].id, bytes, sha256: digest(bytes) }
    }))
    const report = await reviewSlides(current.spec, current.fileHash, images, reviewer, signal)
    const directory = this.directory(id), name = `review-${randomUUID()}.json`, reportPath = join(directory, name), text = JSON.stringify(report, null, 2) + '\n'
    return serialized(directory, async () => {
      signal?.throwIfAborted(); await reviewer.verify()
      if ((await this.get(id)).fileHash !== current.fileHash) throw new Error('Presentation changed during visual review; review cannot authorize delivery')
      await writeFile(reportPath, text, { flag: 'wx' })
      const temporary = join(directory, `.review-${randomUUID()}`)
      try {
        await writeFile(temporary, JSON.stringify({ name, sha256: digest(text) }) + '\n', { flag: 'wx' })
        signal?.throwIfAborted(); await reviewer.verify()
        await rename(temporary, join(directory, 'latest-review.json'))
      } finally { await rm(temporary, { force: true }) }
      return { report, reportPath, rendered }
    })
  }
  async approvedBytes(id: string) {
    return serialized(this.directory(id), async () => {
      const current = await this.get(id), pointerPath = join(this.directory(id), 'latest-review.json')
      if ((await lstat(pointerPath)).isSymbolicLink()) throw new Error('Presentation review pointer cannot be a symbolic link')
      const pointer = z.object({ name: z.string().regex(/^review-[a-f0-9-]{36}\.json$/), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(JSON.parse(await readFile(pointerPath, 'utf8')))
      const reportPath = join(this.directory(id), pointer.name)
      if ((await lstat(reportPath)).isSymbolicLink()) throw new Error('Presentation review report cannot be a symbolic link')
      const text = await readFile(reportPath, 'utf8')
      if (digest(text) !== pointer.sha256) throw new Error('Presentation review changed outside its checkpoint')
      const report = JSON.parse(text) as Awaited<ReturnType<typeof reviewSlides>>
      if (!report.passed || report.fileHash !== current.fileHash || report.reviewedRevision !== current.spec.revision || !current.validation.valid) throw new Error('The current presentation revision has not passed visual review')
      const bytes = await readFile(current.filePath)
      if (digest(bytes) !== current.fileHash) throw new Error('Presentation changed before export')
      return { bytes, fileHash: current.fileHash, revision: current.spec.revision, review: report }
    })
  }
}
