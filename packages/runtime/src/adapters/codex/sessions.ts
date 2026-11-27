/*
 * [OUTPUT]: 持久标识的 JSON 字节摘要使用共用编码，字段及顺序由本业务传入。
 * [INPUT]: SQLite与原Codex会话调用者。
 * [OUTPUT]: 保持codexSessions/codexRuntime和原native-turn续用合同，具体来源事务共用NativeSessions。
 * [POS]: Codex会话兼容入口，不迁移旧记录。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { ProductStore } from '../storage/product-store'
import { NativeSessions } from '../native-sessions'
export { jsonSha256 as digest } from '../../json-digest'
export class CodexSessions extends NativeSessions {
  constructor(store: ProductStore) { super(store, 'codex') }
}
