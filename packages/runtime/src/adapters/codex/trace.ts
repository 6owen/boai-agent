/*
 * [INPUT]: 当前员工运行归属与真实Codex阶段诊断。
 * [OUTPUT]: 保留Codex诊断结构，经共同观测边界保存；失败不改变或重发业务。
 * [POS]: 原Codex观测入口，Trace身份与既有用户入口保持。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import type { EngineContext } from '../../contracts'
import type { CodexPhaseDiagnostic } from './turn'
import { observeNativePhase } from '../native-trace'
export async function observeCodexPhase(context: Pick<EngineContext, 'runId' | 'onTrace' | 'onTraceError'>, phase: string) {
  const finish = await observeNativePhase(context, phase, 'Codex', 'codex-app-server')
  return async (diagnostic: CodexPhaseDiagnostic) => finish(diagnostic)
}
