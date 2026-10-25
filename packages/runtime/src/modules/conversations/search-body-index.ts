/*
 * [INPUT]: 已提交来源的固定 SQLite 队列、宿主同一次 hash 核读字节所得文本与有界批次。
 * [OUTPUT]: 可重建的固定来源/版本正文、失败/超限记录、原事务二次核对和索引 revision；迟到核读无法复活清理/撤权对象，重启继续确定性核读，不调用模型或 Work。
 * [POS]: R1 个人正文派生索引；只读取来源 hooks，不自行遍历路径，不取得发布或授权权力。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { Artifact, Conversation } from '@boai/shared/domain'
import { MATERIAL_LIMITS, type ConversationMaterial } from '@boai/shared/domain/materials'
import { SEARCH_INDEX_LIMITS, type ConversationSearchQuery } from '@boai/shared/domain/reading'
import { ProductStore } from '../../adapters/storage/product-store'
import { SEARCH_INDEX_CLOCK_COLLECTION, SEARCH_INDEX_CLOCK_ID, SEARCH_INDEX_COLLECTION, type SearchBodyCandidate, type SearchBodyRecord } from './search-index-sql'

export interface SearchBodyHooks {
  readMaterialText?(material: ConversationMaterial, conversation: Conversation): Promise<string>
  readArtifactText?(artifact: Artifact & { id: string; conversationId: string }, conversation: Conversation): Promise<string>
  beforeBodyCommit?(sourceId: string): Promise<void>
}
const collectionOf = (kind: SearchBodyCandidate['kind']) => kind === 'material' ? 'materials' : 'artifacts'
const errorOf = (error: unknown) => error instanceof Error && !/[/\\]/.test(error.message) ? error.message.slice(0, 500) : '正文核读失败，请核对受管来源'
export class SearchBodyIndex {
  constructor(private readonly store: ProductStore, private readonly hooks: SearchBodyHooks) {}

  private async commit(candidate: SearchBodyCandidate, value: Pick<SearchBodyRecord, 'status' | 'text' | 'reason'>) {
    return this.store.transaction(async tx => {
      const source = await tx.get<{ id: string; conversationId: string; messageId?: string; registrationSource?: string }>(collectionOf(candidate.kind), candidate.id), conversation = await tx.get<Conversation>('conversations', candidate.conversationId)
      if (!source || JSON.stringify(source) !== candidate.source || !conversation || conversation.list?.hidden || await tx.get('conversationCleanup', candidate.conversationId) || source.conversationId !== candidate.conversationId || (candidate.kind === 'material' ? !source.messageId : !source.registrationSource)) return false
      const id = `${candidate.kind}:${candidate.id}`, previous = await tx.get<SearchBodyRecord>(SEARCH_INDEX_COLLECTION, id)
      // Another bounded reader may already have committed the exact source; do not perturb its cursor.
      if (previous?.sourceValue === candidate.source && previous.formatVersion === SEARCH_INDEX_LIMITS.formatVersion && previous.status === value.status && previous.text === value.text && previous.reason === value.reason) return true
      await tx.put({ collection: SEARCH_INDEX_COLLECTION, id, value: { id, sourceId: candidate.id, kind: candidate.kind, conversationId: candidate.conversationId, sourceValue: candidate.source, formatVersion: SEARCH_INDEX_LIMITS.formatVersion, ...value, checkedAt: new Date().toISOString() } satisfies SearchBodyRecord })
      const clock = await tx.get<{ revision: number }>(SEARCH_INDEX_CLOCK_COLLECTION, SEARCH_INDEX_CLOCK_ID)
      await tx.put({ collection: SEARCH_INDEX_CLOCK_COLLECTION, id: SEARCH_INDEX_CLOCK_ID, value: { id: SEARCH_INDEX_CLOCK_ID, revision: (clock?.revision ?? 0) + 1 } })
      return true
    })
  }

  async invalidate(candidate: SearchBodyCandidate, error: unknown) { await this.commit(candidate, { status: 'failed', reason: errorOf(error) }) }

  async backfill(query: ConversationSearchQuery): Promise<number> {
    const candidates = await this.store.searchBodyCandidates(query, SEARCH_INDEX_LIMITS.filesPerBatch), started = performance.now()
    let bytes = 0, processed = 0
    for (const candidate of candidates) {
      if (processed && performance.now() - started >= SEARCH_INDEX_LIMITS.batchMilliseconds) break
      const source = JSON.parse(candidate.source) as ConversationMaterial & Artifact & { id: string; conversationId: string }, conversation = JSON.parse(candidate.conversation) as Conversation
      const readBound = candidate.kind === 'material' ? MATERIAL_LIMITS.bytes : SEARCH_INDEX_LIMITS.bytesPerFile
      if (source.size <= SEARCH_INDEX_LIMITS.bytesPerFile && bytes + readBound > SEARCH_INDEX_LIMITS.bytesPerBatch) break
      let value: Pick<SearchBodyRecord, 'status' | 'text' | 'reason'>
      if (!/\.(txt|md|markdown)$/i.test(source.name) && !(candidate.kind === 'material' && ['txt', 'markdown'].includes(source.format))) value = { status: 'skipped', reason: '首批正文索引仅支持 TXT 和 Markdown' }
      else if (source.size > SEARCH_INDEX_LIMITS.bytesPerFile) value = { status: 'skipped', reason: '正文索引每份文件最多 1 MiB' }
      else {
        try {
          if (!source.contentHash || !/^[a-f0-9]{64}$/.test(source.contentHash)) throw new Error('正文来源缺少可信内容身份')
          const read = candidate.kind === 'material' ? this.hooks.readMaterialText : this.hooks.readArtifactText
          if (!read) throw new Error('正文受控读取尚未接入')
          const text = candidate.kind === 'material' ? await this.hooks.readMaterialText!(source, conversation) : await this.hooks.readArtifactText!(source, conversation)
          bytes += Buffer.byteLength(text, 'utf8')
          if (Buffer.byteLength(text, 'utf8') > SEARCH_INDEX_LIMITS.bytesPerFile || text.length > SEARCH_INDEX_LIMITS.charactersPerFile) value = { status: 'skipped', reason: '正文索引最多 1 MiB 或 200000 个字符' }
          else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(text)) throw new Error('正文包含二进制或不支持的控制字符')
          else value = { status: 'indexed', text }
        } catch (error) { bytes += readBound; value = { status: 'failed', reason: errorOf(error) } }
      }
      await this.hooks.beforeBodyCommit?.(candidate.id)
      await this.commit(candidate, value); processed++
    }
    return processed
  }
}
