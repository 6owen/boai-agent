/*
 * [INPUT]: Original settings store, selected connection/vault, explicit renderer and host request accounting.
 * [OUTPUT]: Revisioned presentation settings and revocable renderer/vision leases; no implicit chat-model fallback.
 * [POS]: Presentation capability service; employee tools must supply their own live authorization and request ledger.
 * [PROTOCOL]: Update Header and presentations/.folder.md when changed.
 */
import { createHash } from 'node:crypto'
import { access, lstat, readFile, realpath } from 'node:fs/promises'
import { constants } from 'node:fs'
import { isAbsolute } from 'node:path'
import { z } from 'zod'
import type { Connection, ModelUsage } from '@boai/shared/domain'
import type { GatewayRouteEvidence, ModelProtocol } from '@boai/shared/domain/model-gateway'
import type { ProductStore } from '../../adapters/storage/product-store'
import { ApplicationValidationError, type ApplicationOperation } from '../application/application-service'
import type { RenderedSlide, VisionReviewer } from './visual-review'

const visionSchema = z.object({ connectionId: z.string().min(1).max(200), connectionRevision: z.number().int().positive(), model: z.string().trim().min(1).max(1000).regex(/^[^\x00-\x1f\x7f]+$/), maxOutputTokens: z.number().int().min(1).max(65536).optional() }).strict()
const updateSchema = z.object({ expectedRevision: z.number().int().nonnegative(), rendererPath: z.string().min(1).nullable().optional(), vision: visionSchema.nullable().optional() }).strict().refine(value => value.rendererPath !== undefined || value.vision !== undefined, 'Choose a renderer or vision setting to update')
export interface PresentationSettings { revision: number; renderer: { path: string; sha256: string } | null; vision: z.infer<typeof visionSchema> | null }
export interface PresentationReviewSource { settingsRevision: number; connectionId: string; connectionRevision: number; model: string; protocol: ModelProtocol }
export interface PresentationReviewObserver {
  /** Must authorize and reserve this exact additional request before the provider is called. */
  begin(source: PresentationReviewSource): Promise<string>
  /** Missing usage remains unknown; completed only confirms the model transport finished normally. */
  settle(requestId: string, usage: ModelUsage, completed: boolean): Promise<void>
  route?(requestId: string, evidence: GatewayRouteEvidence): Promise<void>
}
export interface PresentationModelInput {
  connection: Connection; apiKey: string; model: string; maxOutputTokens?: number
  prompt: string; images: RenderedSlide[]; signal: AbortSignal
  usage(value: ModelUsage): Promise<void>
  route(value: GatewayRouteEvidence): Promise<void>
}
export interface PresentationCapability {
  verify(): Promise<void>
  settings(): ReturnType<PresentationService['settings']>
  renderer(): ReturnType<PresentationService['rendererLease']>
  lease(): ReturnType<PresentationService['lease']>
}
const collection = 'presentationSettings', key = 'default'
const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex')
const invalid = (message: string): never => { throw new ApplicationValidationError('INVALID_INPUT', message) }

/** The executable is selected through configuration, never as a generation-tool argument. */
async function rendererIdentity(path: string) {
  if (!isAbsolute(path)) return invalid('PPT 渲染器需要明确的绝对路径')
  try {
    const canonical = await realpath(path), stat = await lstat(canonical)
    if (!stat.isFile() || stat.size > 200 * 1024 * 1024) return invalid('PPT 渲染器不是有效的可执行文件')
    await access(canonical, constants.X_OK)
    return { path: canonical, sha256: hash(await readFile(canonical)) }
  } catch (error) {
    if (error instanceof ApplicationValidationError) throw error
    return invalid('PPT 渲染器文件不存在或不可执行，请重新选择')
  }
}

export class PresentationService {
  private pending = new Map<AbortController, string>()
  constructor(private store: ProductStore, private host: {
    connection(id: string): Promise<Connection | undefined>
    credential(connection: Connection): Promise<string>
    critical<T>(action: () => Promise<T>): Promise<T>
    changed(): void
    generate(input: PresentationModelInput): Promise<string>
  }) {}
  private async read(): Promise<PresentationSettings> { return await this.store.get<PresentationSettings>(collection, key) ?? { revision: 0, renderer: null, vision: null } }
  private async connection(settings: PresentationSettings) {
    const selected = settings.vision
    if (!selected) return invalid('尚未选择 PPT 专用视觉模型；不会自动使用聊天模型')
    const connection = await this.host.connection(selected.connectionId)
    if (!connection || (connection.revision ?? 1) !== selected.connectionRevision) return invalid('PPT 视觉连接已改变或删除，请重新选择当前版本')
    return connection
  }
  private async renderer(settings: PresentationSettings) {
    if (!settings.renderer) return invalid('尚未配置 PPT 渲染器')
    const current = await rendererIdentity(settings.renderer.path)
    if (current.path !== settings.renderer.path || current.sha256 !== settings.renderer.sha256) return invalid('PPT 渲染器已改变，请重新确认配置')
    return current.path
  }
  async settings() {
    const settings = await this.read(), reasons: string[] = []
    for (const validate of [() => this.renderer(settings), () => this.connection(settings)]) {
      try { await validate() } catch (error) { reasons.push(error instanceof ApplicationValidationError ? error.message : 'PPT 渲染器文件不可用，请重新选择') }
    }
    return { ...settings, configured: !reasons.length, reasons, verified: false as const }
  }
  operations(): ApplicationOperation[] {
    return [
      { name: 'presentations.settings', description: '读取 PPT 渲染器及专用视觉模型设置。configured 仅表示配置来源仍匹配；不会启动程序或请求模型，不证明渲染和视觉能力已验证。', effect: 'read', input: z.object({}).strict(), resultType: 'PresentationSettings & { configured: boolean; reasons: string[]; verified: false }', execute: () => this.settings() },
      { name: 'presentations.configure', description: '按 revision 保存用户明确选择的本机渲染器路径或专用视觉连接/模型；null 清除该项。省略字段保持原值。仅保存和核对文件，不启动渲染器、不请求模型，不回退聊天模型。', effect: 'write', input: updateSchema, resultType: 'PresentationSettings', execute: input => this.host.critical(async () => {
        const value = updateSchema.parse(input), current = await this.read()
        if (current.revision !== value.expectedRevision) throw new ApplicationValidationError('REVISION_CONFLICT', 'PPT 设置已改变，请先读取当前版本')
        const renderer = value.rendererPath === undefined ? current.renderer : value.rendererPath === null ? null : await rendererIdentity(value.rendererPath)
        const next: PresentationSettings = { revision: current.revision + 1, renderer, vision: value.vision === undefined ? current.vision : value.vision }
        if (value.vision) await this.connection(next)
        await this.store.write([{ collection, id: key, value: next }])
        for (const controller of this.pending.keys()) controller.abort(new Error('PPT 设置已改变'))
        this.host.changed(); return next
      }) },
    ]
  }
  cancelConnection(id: string) { for (const [controller, connectionId] of this.pending) if (connectionId === id) controller.abort(new Error('PPT 视觉连接已改变')) }
  async rendererLease(signal: AbortSignal, validate: () => Promise<void>) {
    signal.throwIfAborted(); await validate()
    const settings = await this.read(), path = await this.renderer(settings)
    const verify = async () => {
      signal.throwIfAborted(); await validate()
      if ((await this.read()).revision !== settings.revision) throw new Error('PPT 设置已改变，原渲染租约失效')
      await this.renderer(settings)
    }
    await verify(); return { path, verify }
  }
  async lease(signal: AbortSignal, validate: () => Promise<void>, observer: PresentationReviewObserver) {
    signal.throwIfAborted(); await validate()
    const settings = await this.read(), rendererPath = await this.renderer(settings), connection = await this.connection(settings), selected = settings.vision!
    const source: PresentationReviewSource = { settingsRevision: settings.revision, connectionId: connection.id, connectionRevision: connection.revision ?? 1, model: selected.model, protocol: connection.gateway?.protocol ?? (connection.provider === 'anthropic' ? 'messages' : connection.api ?? 'chat') }
    const verify = async () => {
      signal.throwIfAborted(); await validate()
      if ((await this.read()).revision !== settings.revision) throw new Error('PPT 设置已改变，原审阅租约失效')
      await this.connection(settings); await this.renderer(settings)
    }
    const reviewer: VisionReviewer = {
      model: selected.model, selectionId: hash(JSON.stringify({ source, renderer: settings.renderer })), verify,
      generate: async input => {
        const controller = new AbortController(), effective = AbortSignal.any([signal, controller.signal, ...(input.signal ? [input.signal] : [])])
        this.pending.set(controller, connection.id)
        let requestId: string | undefined, usage: ModelUsage = {}, completed = false
        try {
          await verify(); effective.throwIfAborted()
          const apiKey = await this.host.credential(connection)
          await verify(); effective.throwIfAborted()
          requestId = await observer.begin(source)
          if (!requestId) throw new Error('PPT 审阅没有取得原任务的模型调用回执')
          await verify(); effective.throwIfAborted()
          const text = await this.host.generate({ ...input, connection, apiKey, model: selected.model, maxOutputTokens: selected.maxOutputTokens, signal: effective,
            usage: async value => { usage = value }, route: async evidence => { if (observer.route) await observer.route(requestId!, evidence) },
          })
          completed = true
          await verify(); effective.throwIfAborted()
          return { text, requestId }
        } finally {
          try { if (requestId) await observer.settle(requestId, usage, completed) }
          finally { this.pending.delete(controller) }
        }
      },
    }
    await verify()
    return { rendererPath, reviewer, source }
  }
}
