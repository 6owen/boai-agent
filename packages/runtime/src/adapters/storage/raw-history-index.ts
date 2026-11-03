/*
 * [INPUT]: Existing product records and host-selected authorized message IDs.
 * [OUTPUT]: Rebuildable FTS5 external-content index with stable IDs across VACUUM/backup, transactional updates and short-query fallback.
 * [POS]: Raw-message search cache only; no second transcript store, model calls or business authority.
 * [PROTOCOL]: Update Header and storage/.folder.md on change.
 */
import type { Client } from '@libsql/client'
import type { HistorySearchQuery, HistorySearchMatch, HistorySearchResult } from '../../modules/conversations/history-search'

export class RawHistoryIndex {
  private ready?: Promise<void>
  constructor(private client: Client) {}
  private ensure() {
    return this.ready ??= this.initialize().catch(error => { this.ready = undefined; throw error })
  }
  private async initialize() {
    const tx = await this.client.transaction('write')
    try {
      const exists = (await tx.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='message_history_fts_v1'")).rows.length > 0
      // records uses a composite key: its implicit rowid may change on VACUUM.
      // Keep a stable INTEGER PRIMARY KEY mapping without duplicating the text.
      await tx.execute('CREATE TABLE IF NOT EXISTS message_history_rows_v1(rowid INTEGER PRIMARY KEY,message_id TEXT NOT NULL UNIQUE)')
      await tx.execute("CREATE VIEW IF NOT EXISTS message_history_content_v1 AS SELECT h.rowid,coalesce(json_extract(m.value,'$.content'),'') AS content FROM message_history_rows_v1 h JOIN records m ON m.collection='messages' AND m.id=h.message_id WHERE json_extract(m.value,'$.status')='completed'")
      await tx.execute("CREATE VIRTUAL TABLE IF NOT EXISTS message_history_fts_v1 USING fts5(content,content='message_history_content_v1',content_rowid='rowid',tokenize='trigram')")
      await tx.execute("CREATE TRIGGER IF NOT EXISTS message_history_insert_v1 AFTER INSERT ON records WHEN new.collection='messages' AND json_extract(new.value,'$.status')='completed' BEGIN INSERT OR IGNORE INTO message_history_rows_v1(message_id) VALUES(new.id); INSERT INTO message_history_fts_v1(rowid,content) SELECT rowid,coalesce(json_extract(new.value,'$.content'),'') FROM message_history_rows_v1 WHERE message_id=new.id; END")
      await tx.execute("CREATE TRIGGER IF NOT EXISTS message_history_delete_v1 AFTER DELETE ON records WHEN old.collection='messages' AND json_extract(old.value,'$.status')='completed' BEGIN INSERT INTO message_history_fts_v1(message_history_fts_v1,rowid,content) SELECT 'delete',rowid,coalesce(json_extract(old.value,'$.content'),'') FROM message_history_rows_v1 WHERE message_id=old.id; DELETE FROM message_history_rows_v1 WHERE message_id=old.id; END")
      await tx.execute("CREATE TRIGGER IF NOT EXISTS message_history_update_v1 AFTER UPDATE ON records WHEN old.collection='messages' OR new.collection='messages' BEGIN INSERT INTO message_history_fts_v1(message_history_fts_v1,rowid,content) SELECT 'delete',rowid,coalesce(json_extract(old.value,'$.content'),'') FROM message_history_rows_v1 WHERE message_id=old.id AND old.collection='messages' AND json_extract(old.value,'$.status')='completed'; DELETE FROM message_history_rows_v1 WHERE message_id=old.id AND old.collection='messages'; INSERT OR IGNORE INTO message_history_rows_v1(message_id) SELECT new.id WHERE new.collection='messages' AND json_extract(new.value,'$.status')='completed'; INSERT INTO message_history_fts_v1(rowid,content) SELECT rowid,coalesce(json_extract(new.value,'$.content'),'') FROM message_history_rows_v1 WHERE message_id=new.id AND new.collection='messages' AND json_extract(new.value,'$.status')='completed'; END")
      if (!exists) {
        await tx.execute("INSERT OR IGNORE INTO message_history_rows_v1(message_id) SELECT id FROM records WHERE collection='messages' AND json_extract(value,'$.status')='completed'")
        await tx.execute("INSERT INTO message_history_fts_v1(message_history_fts_v1) VALUES('rebuild')")
      }
      await tx.commit()
    } catch (error) { await tx.rollback(); throw error } finally { tx.close() }
  }
  async search(query: HistorySearchQuery, ids: string[]): Promise<{ matches: HistorySearchMatch[]; matching: HistorySearchResult['matching']; hasMore: boolean }> {
    const text = query.query.trim(), limit = query.limit ?? 3
    const matching = [...text].length >= 3 ? 'fts5-trigram' : 'literal'
    if (!ids.length) return { matches: [], matching, hasMore: false }
    await this.ensure()
    const args: (string | number)[] = [JSON.stringify(ids)], where = ["m.collection='messages'", "m.id IN (SELECT value FROM json_each(?))", "json_extract(m.value,'$.status')='completed'"]
    if (matching === 'fts5-trigram') { where.push('message_history_fts_v1 MATCH ?'); args.push('"' + text.replaceAll('"', '""') + '"') }
    else { where.push("instr(lower(json_extract(m.value,'$.content')),lower(?))>0"); args.push(text) }
    for (const [key, op] of [['from', '>='], ['to', '<=']] as const) if (query[key]) { where.push(`julianday(json_extract(m.value,'$.createdAt'))${op}julianday(?)`); args.push(query[key]!) }
    args.push(limit + 1)
    const joined = matching === 'fts5-trigram' ? 'JOIN message_history_rows_v1 h ON h.message_id=m.id JOIN message_history_fts_v1 ON message_history_fts_v1.rowid=h.rowid' : ''
    const result = await this.client.execute({ sql: `SELECT m.id,json_extract(m.value,'$.content') AS content FROM records m ${joined} WHERE ${where.join(' AND ')} ORDER BY ${matching === 'fts5-trigram' ? 'message_history_fts_v1.rank,' : ''}json_extract(m.value,'$.createdAt') DESC,m.id LIMIT ?`, args })
    return { matches: result.rows.slice(0, limit).map(row => ({ id: String(row.id), content: String(row.content) })), matching, hasMore: result.rows.length > limit }
  }
}
