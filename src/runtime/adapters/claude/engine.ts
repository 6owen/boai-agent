/*
 * [OUTPUT]: 2026-10-11 持续原生Claude生产驱动支持本机登录/显式API、原生工具与公开过程；旧私有阶段仅作兼容回归。
 * [INPUT]: 已核对Claude CLI、员工原生持续会话。
 * [OUTPUT]: 本机登录或显式API来源，原生工具与真实交互；不注入阶段能力限制。
 * [POS]: Claude员工生产引擎。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { EngineContext } from '../../contracts'
import type { ProductStore } from '../storage/product-store'
import { NativeConversationEngine, type NativeConversationInput } from '../native-conversation'
import { runClaudeConversation } from './conversation'
export const CLAUDE_EMPLOYEE_POLICY_VERSION = 12
export class ClaudeEmployeeEngine extends NativeConversationEngine {
  constructor(store: ProductStore) { super(store, 'claude') }
  protected conversation(context: EngineContext, input: NativeConversationInput) { return runClaudeConversation(context, input) }
}
