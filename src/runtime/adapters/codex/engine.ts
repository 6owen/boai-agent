/*
 * [OUTPUT]: 2026-10-11 持续原生Codex生产驱动保留原生工具/会话及真实权限；旧分阶段协议仅用于兼容回归。
 * [INPUT]: 员工原生持续会话和已核对Codex程序。
 * [OUTPUT]: 单一原生turn入口，保留原生工具、配置、权限与完整执行事件。
 * [POS]: Codex员工生产引擎；旧turn.ts只用于兼容探测。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { EngineContext } from '../../contracts'
import type { ProductStore } from '../storage/product-store'
import { NativeConversationEngine, type NativeConversationInput } from '../native-conversation'
import { runCodexConversation } from './conversation'
export class CodexEmployeeEngine extends NativeConversationEngine {
  constructor(store: ProductStore) { super(store, 'codex') }
  protected conversation(context: EngineContext, input: NativeConversationInput) { return runCodexConversation(context, input) }
}
