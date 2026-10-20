/*
 * [INPUT]: Current employee/session workspace, authorized byte readers, original file queue and output writer.
 * [OUTPUT]: Alma presentation tools use durable revisions, source revalidation, dedicated review and approved-only export.
 * [POS]: Shared task tool adapter for API/native/CLI; private project/cache paths never become model file authority.
 * [PROTOCOL]: Update Header and mastra/.folder.md when changed.
 */
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile, rename, rm, lstat, realpath } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { z } from 'zod'
import { createTool } from '@mastra/core/tools'
import type { EngineContext } from '../../contracts'
import { PresentationProjects } from '../../modules/presentations/presentation-project'
import { PresentationMaterials, type PresentationSource } from '../../modules/presentations/presentation-materials'
import { a as theme, d as design, s as story, b as slide, f as layouts, c as icons } from '../../modules/presentations/alma/model.mjs'
import { listDesigns } from '../../modules/presentations/alma/designs.mjs'

const digest = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const id = z.string().uuid(), hash = z.string().regex(/^[a-f0-9]{64}$/)
const sourceSchema = z.object({ path: z.string().min(1), sha256: hash }).strict()
const metadataSchema = z.object({ agentId: z.string(), conversationId: z.string(), sources: z.array(sourceSchema), assets: z.record(z.string(), z.string()) }).strict()
type SourceRef = z.infer<typeof sourceSchema>
type Metadata = z.infer<typeof metadataSchema>
const queues = new Map<string, Promise<unknown>>()

/** Construction is pure. Native discovery borrows the same schemas; execution uses its lazily created task runtime. */
export function describePresentationTools(context: EngineContext) {
  const unavailable = async (): Promise<never> => { throw new Error('Presentation metadata has no execution authority') }
  return Object.entries(createPresentationTools(context, { root: context.workspace?.root ?? '.', serial: unavailable, source: unavailable, effect: unavailable, output: unavailable }))
    .map(([name, tool]) => ({ name, description: tool.description, schema: tool.inputSchema as z.ZodType }))
}

export function createPresentationTools(ctx: EngineContext, host: {
  root: string
  serial<T>(action: () => Promise<T>): Promise<T>
  source(path: string): Promise<PresentationSource>
  effect(description: string): Promise<void>
  output(path: string, bytes: Uint8Array, verify: () => Promise<void>): Promise<unknown>
}) {
  if (!ctx.presentations) return {}
  const capability = ctx.presentations, root = join(host.root, '.presentations')
  const projects = new PresentationProjects(join(root, 'projects')), materials = new PresentationMaterials(join(root, 'materials'))
  const seen = new Map<string, SourceRef>()
  const verify = async () => { ctx.signal.throwIfAborted(); await capability.verify() }
  const scope = { agentId: ctx.agent.id, conversationId: ctx.conversation.id }
  async function directory() { await mkdir(root, { recursive: true }); if (await realpath(root) !== root || !(await lstat(root)).isDirectory()) throw new Error('PPT workspace is not an owned directory') }
  async function readJson(file: string) {
    const stat = await lstat(file)
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > 2 * 1024 * 1024) throw new Error('PPT metadata is not an owned regular file')
    return JSON.parse(await readFile(file, 'utf8'))
  }
  async function writeJson(file: string, value: unknown) {
    const temporary = `${file}.${randomUUID()}.tmp`
    try { await writeFile(temporary, JSON.stringify(value), { flag: 'wx' }); await verify(); await rename(temporary, file) }
    finally { await rm(temporary, { force: true }) }
  }
  async function source(ref: SourceRef) {
    const value = await host.source(ref.path)
    if (digest(value.bytes) !== ref.sha256) throw new Error('PPT source changed; inspect the current source and create a new project instead of reusing stale content')
    return value
  }
  async function remember(path: string) {
    const value = await host.source(path), ref = { path: value.name, sha256: digest(value.bytes) }
    const sourceId = digest(JSON.stringify(ref))
    await directory(); await writeJson(join(root, `source-${sourceId}.json`), ref)
    seen.set(sourceId, ref); return { value, ref, sourceId }
  }
  const metadataPath = (projectId: string) => join(root, `project-${id.parse(projectId)}.json`)
  async function metadata(projectId: string) {
    await verify(); await directory()
    const value = metadataSchema.parse(await readJson(metadataPath(projectId)))
    if (value.agentId !== scope.agentId || value.conversationId !== scope.conversationId) throw new Error('PPT project belongs to another employee or conversation')
    for (const ref of value.sources) await source(ref)
    return value
  }
  async function attach(projectId: string, meta: Metadata) {
    for (const ref of seen.values()) if (!meta.sources.some(value => value.path === ref.path && value.sha256 === ref.sha256)) meta.sources.push(ref)
    for (const ref of meta.sources) await source(ref)
    await writeJson(metadataPath(projectId), meta)
  }
  async function deck(projectId: string) {
    const meta = await metadata(projectId), current = await projects.get(projectId)
    const { outputPath: _output, assetBasePath: _assets, ...spec } = current.spec
    return { ...spec, slides: spec.slides.map(item => ({ ...item, elements: item.elements.map(element => element.type === 'image' ? { ...element, path: meta.assets[basename(element.path!)] ?? (() => { throw new Error('PPT image has no authorized source') })() } : element) })), fileHash: current.fileHash, validation: current.validation }
  }
  async function importedImage(projectId: string, path: string) {
    const match = /^material:([a-f0-9]{64})\/([a-f0-9]{64}\.(?:png|jpe?g|webp|gif))$/.exec(path)
    if (!match) { const input = await remember(path); return projects.importImage(projectId, input.value, ctx.signal) }
    const ref = sourceSchema.parse(await readJson(join(root, `source-${match[1]}.json`)))
    if (digest(JSON.stringify(ref)) !== match[1]) throw new Error('PPT material identity changed')
    const value = await source(ref), extracted = await materials.extract(value, ctx.signal)
    const asset = extracted.manifest.slides.flatMap(page => page.images).find(image => basename(image.extractedPath) === match[2])
    if (!asset) throw new Error('PPT material image is not in this source')
    const bytes = await readFile(asset.extractedPath)
    if (digest(bytes) !== asset.sha256) throw new Error('PPT extracted image changed')
    seen.set(match[1], ref)
    return projects.importImage(projectId, { name: match[2], bytes, verify: async () => { await source(ref) } }, ctx.signal)
  }
  function tool<T extends z.ZodType>(name: string, description: string, inputSchema: T, action: (input: z.infer<T>) => Promise<unknown>) {
    return createTool({ id: name, description, inputSchema, execute: input => host.serial(async () => {
      const pending = (queues.get(root) ?? Promise.resolve()).catch(() => {}).then(async () => { await verify(); const result = await action(inputSchema.parse(input)); await verify(); return result })
      queues.set(root, pending)
      try { return await pending } finally { if (queues.get(root) === pending) queues.delete(root) }
    }) })
  }
  const project = z.object({ presentationId: id }).strict()
  return Object.fromEntries(Object.entries({
    presentation_settings: tool('presentation_settings', 'Inspect dedicated PPT renderer and vision settings; never substitutes the chat model or performs a remote test.', z.object({}).strict(), () => capability.settings()),
    presentation_list_designs: tool('presentation_list_designs', 'Original Alma design directions. Choose an explicit theme/design contract matching audience and purpose.', z.object({ query: z.string().optional(), limit: z.number().int().min(1).max(20).default(4) }).strict(), async input => listDesigns(input.query, input.limit)),
    presentation_list_layouts: tool('presentation_list_layouts', 'Original slide layouts and exact geometry. Use the returned id as layoutKey; vary adjacent page structures.', z.object({ query: z.string().optional(), role: z.string().optional(), limit: z.number().int().min(1).max(20).default(6), canvas: z.enum(['wide', 'standard']).default('wide') }).strict(), async input => layouts(input)),
    presentation_list_icons: tool('presentation_list_icons', 'Find original editable icon names by meaning.', z.object({ query: z.string(), limit: z.number().int().min(1).max(50).default(12) }).strict(), async input => icons(input.query, input.limit)),
    presentation_inspect_template: tool('presentation_inspect_template', 'Inspect a user-supplied PPTX from an authorized logical/business path. Returns original theme and layout metadata, without executing macros.', z.object({ path: z.string().min(1) }).strict(), async input => materials.inspect((await remember(input.path)).value, ctx.signal)),
    presentation_extract_material: tool('presentation_extract_material', 'Extract PPTX/DOCX/XLSX/PDF/TXT/MD/CSV/JSON once, then page through the cached text/notes/tables/charts/images. Every call revalidates the original source. Image paths are material handles for presentation_upsert_slide, not filesystem paths.', z.object({ path: z.string().min(1), offset: z.number().int().nonnegative().default(0), limit: z.number().int().min(1).max(20).default(8) }).strict(), async input => {
      const { value, sourceId } = await remember(input.path), result = await materials.extract(value, ctx.signal), pages = result.manifest.slides
      return { sourceId, sourceHash: result.manifest.sourceSha256, total: pages.length, offset: input.offset, nextOffset: input.offset + input.limit < pages.length ? input.offset + input.limit : null, cacheHit: result.cacheHit, pages: pages.slice(input.offset, input.offset + input.limit).map(page => ({ ...page, images: page.images.map(image => ({ sha256: image.sha256, path: `material:${sourceId}/${basename(image.extractedPath)}` })) })) }
    }),
    presentation_create: tool('presentation_create', 'Create one durable editable PPT project with STORY and DESIGN contracts. Returns a project ID and revision, never a deliverable path. Prior inspected sources stay attached and must remain authorized.', z.object({ title: z.string().min(1), author: z.string().optional(), layout: z.enum(['wide', 'standard']).default('wide'), theme, story, design }).strict(), async input => {
      await host.effect('创建演示文稿'); const current = await projects.create(input, ctx.signal)
      await directory(); await attach(current.spec.id, { ...scope, sources: [], assets: {} }); await ctx.afterEffect?.()
      return deck(current.spec.id)
    }),
    presentation_get: tool('presentation_get', 'Read the current presentation specification/revision for this employee in this conversation. Private project paths are not exposed.', project, input => deck(input.presentationId)),
    presentation_upsert_slide: tool('presentation_upsert_slide', 'Atomically add/replace one complete editable slide using expectedRevision. Images accept authorized logical/business paths or returned material handles and are imported automatically. Re-read before changing a stale revision.', z.object({ presentationId: id, expectedRevision: z.number().int().nonnegative(), slide }).strict(), async input => {
      const meta = await metadata(input.presentationId), current = await projects.get(input.presentationId)
      if (current.spec.revision !== input.expectedRevision) throw new Error('Presentation revision conflict; read the current deck before editing')
      await host.effect('修改演示文稿页面')
      const next = structuredClone(input.slide)
      for (const element of next.elements) if (element.type === 'image') {
        const original = element.path!, imported = await importedImage(input.presentationId, original)
        element.path = imported.path; meta.assets[basename(imported.path)] = original
      }
      await attach(input.presentationId, meta)
      await projects.upsert(input.presentationId, input.expectedRevision, next, ctx.signal); await ctx.afterEffect?.()
      return deck(input.presentationId)
    }),
    presentation_validate: tool('presentation_validate', 'Validate the actual current deck. Resolve every error and readability warning before dedicated visual review.', project, async input => { const current = await deck(input.presentationId); return { presentationId: input.presentationId, revision: current.revision, fileHash: current.fileHash, ...current.validation } }),
    presentation_render: tool('presentation_render', 'Render the actual current PPTX with the configured renderer. Optionally save PNG previews in an explicitly requested NEW authorized outputDirectory for the user/external reviewer; publish_artifact delivers each saved preview. Returns hashes/dimensions and only authorized saved paths, never approval or chat-image injection. Dedicated presentation_review is still required before PPTX delivery.', project.extend({ outputDirectory: z.string().min(1).optional() }), async input => {
      await metadata(input.presentationId); const lease = await capability.renderer(); await host.effect('渲染演示文稿')
      const result = await projects.render(input.presentationId, lease.path, ctx.signal)
      await lease.verify(); await metadata(input.presentationId); await ctx.afterEffect?.()
      const images: { slide: number; sha256: string; width: number; height: number; path?: string }[] = []
      for (const [index, file] of result.images.entries()) {
        const bytes = await readFile(file), sha256 = digest(bytes)
        const path = input.outputDirectory ? `${input.outputDirectory.replace(/\/$/, '')}/slide-${String(index + 1).padStart(2, '0')}.png` : undefined
        if (path) await host.output(path, bytes, async () => {
          await lease.verify(); await metadata(input.presentationId)
          if ((await projects.get(input.presentationId)).fileHash !== result.fileHash || digest(await readFile(file)) !== sha256) throw new Error('PPT revision or rendered preview changed before export')
        })
        images.push({ slide: index + 1, sha256, width: 1600, height: 900, ...(path ? { path } : {}) })
      }
      return { presentationId: input.presentationId, revision: result.revision, fileHash: result.fileHash, reviewed: false, images }
    }),
    presentation_review: tool('presentation_review', 'Render and review the actual revision using the dedicated vision model and original Alma QA prompt/batching. Repair blocker/major issues and review again. No chat-model fallback, retries or claims of approval after a failed call.', project, async input => {
      await metadata(input.presentationId); const lease = await capability.lease(); await host.effect('审阅演示文稿')
      const result = await projects.review(input.presentationId, lease.rendererPath, { ...lease.reviewer, verify: async () => { await lease.reviewer.verify(); await metadata(input.presentationId) } }, ctx.signal)
      await metadata(input.presentationId); await ctx.afterEffect?.(); return result.report
    }),
    presentation_export: tool('presentation_export', 'Export only the current revision that passed validation and dedicated visual review into a NEW authorized .pptx file. This does not publish; call publish_artifact afterward. Stale/missing/failed review or revoked source refuses export.', z.object({ presentationId: id, path: z.string().regex(/\.pptx$/i) }).strict(), async input => {
      await metadata(input.presentationId); const lease = await capability.lease(), approved = await projects.approvedBytes(input.presentationId)
      if (approved.review.selectionId !== lease.reviewer.selectionId) throw new Error('PPT review used an earlier renderer/model setting; review with the current selection before export')
      const verifyExport = async () => { await lease.reviewer.verify(); await metadata(input.presentationId); if ((await projects.approvedBytes(input.presentationId)).fileHash !== approved.fileHash) throw new Error('PPT revision changed before export') }
      const result = await host.output(input.path, approved.bytes, verifyExport)
      return { ...result as object, presentationId: input.presentationId, revision: approved.revision, fileHash: approved.fileHash, passed: true, published: false }
    }),
  }))
}
