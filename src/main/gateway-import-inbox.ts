/*
 * [INPUT]: OS URL events before or after application initialization and a private runtime delivery function.
 * [OUTPUT]: Bounded coalesced startup queue; failed/unknown deliveries are reported without automatic replay.
 * [POS]: Desktop protocol transport only; connection confirmation remains in the product repository.
 * [PROTOCOL]: Update Header and main/.folder.md when lifecycle behavior changes.
 */
import { randomUUID } from 'node:crypto'
import { GATEWAY_IMPORT_LIMIT, gatewayImportUrl, parseGatewayImport } from '../shared/domain/gateway-import'

export class GatewayImportInbox {
  private entries = new Map<string, { eventId: string; url: string }>()
  private ready = false
  private draining?: Promise<void>
  constructor(private deliver: (input: { eventId: string; url: string }) => Promise<void>, private failed: (message: string) => void) {}
  receive(raw: string) {
    try {
      const url = gatewayImportUrl(parseGatewayImport(raw))
      if (this.entries.has(url)) return
      if (this.entries.size >= GATEWAY_IMPORT_LIMIT) throw new Error('待确认的模型导入过多，请先处理已有导入')
      this.entries.set(url, { eventId: randomUUID(), url })
      void this.drain()
    } catch (error) { this.failed(error instanceof Error ? error.message : '无法读取模型导入链接') }
  }
  start() { this.ready = true; return this.drain() }
  private drain(): Promise<void> {
    if (!this.ready) return Promise.resolve()
    if (this.draining) return this.draining
    this.draining = (async () => {
      for (const [url, entry] of this.entries) {
        try { await this.deliver(entry) }
        catch { this.failed('模型导入结果待核对。请查看已有导入；若没有草稿，请重新打开链接。') }
        finally { this.entries.delete(url) }
      }
    })().finally(() => { this.draining = undefined; if (this.entries.size) void this.drain() })
    return this.draining
  }
}
