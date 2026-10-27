/*
 * [OUTPUT]: 2026-10-27 显式模型下载/取消/移除、完整SHA校验及原子安装。
 * [INPUT]: Fixed asset manifest and explicit download/cancel/remove commands.
 * [OUTPUT]: Private, hash-verified atomic model installation; interrupted downloads never become ready.
 * [POS]: Voice model lifecycle, separate from business data and backups.
 * [PROTOCOL]: Update Header and .folder.md when changed.
 */
import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { mkdir, open, rename, rm, stat, lstat } from 'node:fs/promises'
import { join } from 'node:path'
import { voiceModelAssets, voiceModelBytes, voiceModelRevision } from './model-manifest'
export class VoiceModels {
  readonly directory: string
  progress?: { received: number; total: number }
  private operation?: Promise<void>
  private controller?: AbortController
  constructor(private root: string) { this.directory = join(root, voiceModelRevision) }
  async ready(verify = false, signal?: AbortSignal) {
    try {
      for (const asset of voiceModelAssets) {
        signal?.throwIfAborted()
        const path = join(this.directory, asset.name), info = await lstat(path)
        if (!info.isFile() || info.isSymbolicLink() || info.size !== asset.bytes) return false
        if (verify) { const digest = createHash('sha256'); for await (const chunk of createReadStream(path, { signal })) digest.update(chunk); if (digest.digest('hex') !== asset.sha256) return false }
      }
      return true
    } catch { return false }
  }
  async cancel() { this.controller?.abort(); await this.operation?.catch(() => {}) }
  async remove() { await this.cancel(); await rm(this.directory, { recursive: true, force: true }) }
  async recover() {
    const { readdir } = await import('node:fs/promises')
    await mkdir(this.root, { recursive: true, mode: 0o700 })
    for (const name of await readdir(this.root)) if (name.startsWith('.download-')) await rm(join(this.root, name), { recursive: true, force: true })
  }
  download() {
    if (this.operation) return this.operation
    const controller = new AbortController(); this.controller = controller
    const operation = this.install(controller.signal).finally(() => { if (this.operation === operation) { this.operation = undefined; this.controller = undefined; this.progress = undefined } })
    this.operation = operation; return operation
  }
  private async install(signal: AbortSignal) {
    if (await this.ready(true)) return
    const temporary = join(this.root, `.download-${randomUUID()}`)
    await mkdir(temporary, { recursive: true, mode: 0o700 })
    this.progress = { received: 0, total: voiceModelBytes }
    try {
      for (const asset of voiceModelAssets) {
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
