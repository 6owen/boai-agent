/*
 * [OUTPUT]: 2026-10-28 逐模型下载/取消/移除、独立进度、完整SHA校验及原子安装；沿用旧SenseVoice目录。
 * [INPUT]: Pinned model catalog and explicit model-scoped download/cancel/remove commands.
 * [OUTPUT]: Independent private, hash-verified installations; cancelled downloads never become ready.
 * [POS]: Voice model lifecycle, separate from business data and backups.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, rename, rm, stat, lstat, readdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { VoiceLanguage, VoiceModelId, VoiceModelSnapshot } from './protocol'
import { voiceModelCatalog } from './model-manifest'

type ModelDefinition = {
  id: VoiceModelId; name: string; languages: readonly VoiceLanguage[]; licenseUrl: string; revision: string
  assets: readonly { name: string; url: string; bytes: number; sha256: string }[]
}
class ModelInstallation {
  readonly directory: string
  readonly bytes: number
  progress?: { received: number; total: number }
  private operation?: Promise<void>
  private controller?: AbortController
  private removal?: Promise<void>
  private verified = new Map<string, string>()
  private checking = new Map<string, { fingerprint: string; promise: Promise<boolean> }>()
  constructor(private root: string, readonly definition: ModelDefinition) {
    // Keep the original SenseVoice revision path so an upgrade does not download it again.
    this.directory = join(root, definition.revision)
    this.bytes = definition.assets.reduce((total, asset) => total + asset.bytes, 0)
  }
  async ready(verify = false, signal?: AbortSignal) {
    if (this.removal) return false
    try {
      for (const asset of this.definition.assets) {
        signal?.throwIfAborted()
        const path = join(this.directory, asset.name), info = await lstat(path)
        if (!info.isFile() || info.isSymbolicLink() || info.size !== asset.bytes) { this.verified.delete(path); return false }
        const fingerprint = [info.dev, info.ino, info.size, info.mtimeMs, info.ctimeMs].join(':')
        if (verify || this.verified.get(path) !== fingerprint) {
          // A model is never Select-ready until its hashes are confirmed. Concurrent
          // snapshots share a check, then cheap file fingerprints avoid polling hashes.
          let check = this.checking.get(path)
          if (!check || check.fingerprint !== fingerprint) {
            const promise = (async () => {
              const digest = createHash('sha256')
              for await (const chunk of createReadStream(path)) digest.update(chunk)
              const after = await lstat(path)
              const unchanged = after.isFile() && !after.isSymbolicLink() && [after.dev, after.ino, after.size, after.mtimeMs, after.ctimeMs].join(':') === fingerprint
              if (!unchanged || digest.digest('hex') !== asset.sha256) { this.verified.delete(path); return false }
              this.verified.set(path, fingerprint); return true
            })()
            check = { fingerprint, promise }; this.checking.set(path, check)
            void promise.finally(() => { if (this.checking.get(path)?.promise === promise) this.checking.delete(path) }).catch(() => {})
          }
          if (!(await check.promise)) return false
        }
        signal?.throwIfAborted()
      }
      return !this.removal
    } catch { return false }
  }
  async cancel() { this.controller?.abort(); await this.operation?.catch(() => {}) }
  remove() {
    if (this.removal) return this.removal
    const removal = Promise.resolve().then(async () => { await this.cancel(); await rm(this.directory, { recursive: true, force: true }) }).finally(() => { if (this.removal === removal) this.removal = undefined })
    this.removal = removal
    return removal
  }
  download() {
    if (this.removal) return Promise.reject(new Error('模型正在移除，请稍后重试'))
    if (this.operation) return this.operation
    const controller = new AbortController(); this.controller = controller
    const operation = this.install(controller.signal).finally(() => { if (this.operation === operation) { this.operation = undefined; this.controller = undefined; this.progress = undefined } })
    this.operation = operation; return operation
  }
  private async install(signal: AbortSignal) {
    if (await this.ready(true, signal)) return
    signal.throwIfAborted()
    const temporary = join(this.root, `.download-${this.definition.id}-${randomUUID()}`)
    await mkdir(temporary, { recursive: true, mode: 0o700 })
    this.progress = { received: 0, total: this.bytes }
    try {
      for (const asset of this.definition.assets) {
        signal.throwIfAborted()
        const response = await fetch(asset.url, { signal })
        if (!response.ok || !response.body || new URL(response.url).protocol !== 'https:') throw new Error('语音模型下载失败')
        const handle = await open(join(temporary, asset.name), 'wx', 0o600), digest = createHash('sha256'); let bytes = 0
        try {
          for await (const part of response.body) {
            signal.throwIfAborted(); bytes += part.byteLength
            if (bytes > asset.bytes) throw new Error('语音模型字节数不符')
            digest.update(part); await handle.writeFile(part); this.progress!.received += part.byteLength
          }
        } finally { await handle.close() }
        if (bytes !== asset.bytes || digest.digest('hex') !== asset.sha256) throw new Error('语音模型完整性校验失败')
      }
      signal.throwIfAborted()
      // Only an invalid installation is replaced; all new files have already passed hashes.
      if (await stat(this.directory).catch(() => null)) await rm(this.directory, { recursive: true })
      await rename(temporary, this.directory)
    } finally { await rm(temporary, { recursive: true, force: true }) }
  }
}
export class VoiceModels {
  private installations: Map<VoiceModelId, ModelInstallation>
  constructor(private root: string, catalog: readonly ModelDefinition[] = voiceModelCatalog) {
    this.installations = new Map(catalog.map(model => [model.id, new ModelInstallation(root, model)]))
  }
  private model(id: VoiceModelId) {
    const model = this.installations.get(id)
    if (!model) throw new Error('未知的本地语音模型')
    return model
  }
  get directory() { return this.directoryFor('sensevoice-small') }
  get progress() { return this.progressFor('sensevoice-small') }
  directoryFor(id: VoiceModelId) { return this.model(id).directory }
  progressFor(id: VoiceModelId) { const progress = this.model(id).progress; return progress && { ...progress } }
  ready(verify = false, signal?: AbortSignal, id: VoiceModelId = 'sensevoice-small') { return this.model(id).ready(verify, signal) }
  async snapshot(): Promise<VoiceModelSnapshot[]> {
    return Promise.all([...this.installations.values()].map(async model => ({
      id: model.definition.id, name: model.definition.name, languages: model.definition.languages,
      licenseUrl: model.definition.licenseUrl, bytes: model.bytes, ready: await model.ready(),
      download: this.progressFor(model.definition.id),
    })))
  }
  async recover() {
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    for (const name of await readdir(this.root)) if (name.startsWith('.download-')) await rm(join(this.root, name), { recursive: true, force: true })
  }
  download(id: VoiceModelId = 'sensevoice-small') { return this.model(id).download() }
  async cancel(id?: VoiceModelId) {
    if (id) await this.model(id).cancel()
    else await Promise.all([...this.installations.values()].map(model => model.cancel()))
  }
  remove(id: VoiceModelId = 'sensevoice-small') { return this.model(id).remove() }
}
