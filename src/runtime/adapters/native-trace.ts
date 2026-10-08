/*
 * [OUTPUT]: Claude与Codex分别传递实际外部诊断；只观察运行，不以外部结束或协议计数代替业务交付或内部模型步骤。
 * [INPUT]: 当前员工运行归属和具名原生阶段回执。
 * [OUTPUT]: 单次外部阶段Trace及可选私有格式器协议计数；观测失败独立记录、不改变或重发业务，不保存模型正文或凭据、不推算内部模型调用。
 * [POS]: 本机运行时共同观测边界，不推算内部模型调用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { randomUUID } from 'node:crypto'
import type { EngineContext } from '../contracts'
import type { TraceSpan } from '../../shared/domain/traces'

export async function observeNativePhase(context: Pick<EngineContext, 'runId' | 'onTrace' | 'onTraceError'>, phase: string, name: 'Codex' | 'Claude', runtime: 'codex-app-server' | 'claude-cli') {
  const spanId = randomUUID(), traceId = context.runId
  const span: TraceSpan = { id: `${traceId}:${spanId}`, traceId, spanId, name: `${name} · ${phase}`, spanType: 'external_agent', startedAt: new Date().toISOString(),
    attributes: { runtime, phase, accounting: 'external-turn', internalModelSteps: 'unknown' } }
  const save = async (value: TraceSpan) => {
    try { await context.onTrace?.(value) }
    catch { try { await context.onTraceError?.(`本机 ${name} 执行诊断未能保存`) } catch { /* Observation cannot change or retry execution. */ } }
  }
  await save(span)
  return async (diagnostic: { outcome: 'completed' | 'failed' | 'cancelled'; stage: string; protocolCounts?: { formatterCalls: number; formatterRejections: number; formatReminders: number } }) => save({ ...span, endedAt: new Date().toISOString(), output: diagnostic,
    ...(diagnostic.outcome === 'completed' ? {} : { error: { outcome: diagnostic.outcome, stage: diagnostic.stage } }) })
}
