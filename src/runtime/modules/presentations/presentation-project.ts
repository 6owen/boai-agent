/*
 * [INPUT]: Private host-owned project root, complete Alma schemas and actual compilation workers.
 * [OUTPUT]: Immutable revision directories and one atomic current pointer; failed compilation preserves the prior deck.
 * [POS]: Presentation kernel only. Not registered with employees, CLI or application protocol yet.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, rm, lstat, realpath } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { z } from 'zod'
import { p as specSchema, b as slideSchema, v as validate, type PresentationSpec } from './alma/model.mjs'
import { presentationWorker } from './worker-client'

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
    const spec = specSchema.parse({ ...z.record(z.string(), z.unknown()).parse(input), version: 1, revision: 0, id, author: 'BOAI', slides: [], outputPath: join(directory, 'pending.pptx'), assetBasePath: directory, createdAt: now, updatedAt: now })
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
      // Image import must later be wired to BOAI's authorized byte reader. Do not
      // hand an arbitrary source path to the compiler before that boundary exists.
      if (slide.elements.some(element => element.type === 'image')) throw new Error('Presentation image import is not connected to the authorized source reader yet')
      const slides = current.spec.slides.slice(), index = slides.findIndex(item => item.id === slide.id)
      if (index < 0) slides.push(slide); else slides[index] = slide
      return this.commit(specSchema.parse({ ...current.spec, revision: expectedRevision + 1, slides, updatedAt: new Date().toISOString() }), signal)
    })
  }
  private async commit(input: PresentationSpec, signal?: AbortSignal) {
    const validation = validate(input)
    if (!validation.valid) throw new Error(validation.errors.map(error => `${error.code}: ${error.message}`).join('; '))
    const directory = this.directory(input.id), suffix = randomUUID(), name = `r${input.revision}-${suffix}`
    const staging = join(directory, `.pending-${suffix}`), version = join(directory, name), tempPointer = join(directory, `.pointer-${suffix}`)
    const spec = specSchema.parse({ ...input, outputPath: join(version, 'presentation.pptx') })
    await mkdir(staging)
    try {
      await presentationWorker('compiler', { spec, targetPath: join(staging, 'presentation.pptx') }, signal)
      signal?.throwIfAborted()
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
    const outputDir = join(this.directory(id), `render-${current.spec.revision}-${randomUUID()}`)
    const result = await presentationWorker('renderer', { input: { rendererPath, presentationPath: current.filePath, outputDir, slideIds: current.spec.slides.map(slide => slide.id), width: 1600, height: 900, timeoutMs: 90_000 } }, signal, 95_000)
    if (!result.images || result.images.length !== current.spec.slides.length) throw new Error('Renderer did not return every slide')
    if ((await this.get(id)).fileHash !== current.fileHash) throw new Error('Presentation changed during rendering; images belong to an earlier revision')
    return { revision: current.spec.revision, fileHash: current.fileHash, images: result.images, reviewed: false as const }
  }
}
