/*
 * [OUTPUT]: 画板命令的类型与输入校验沿插件公开协议，宿主和执行适配器直接使用。
 * [INPUT]: Host-bound canvas capability and the package's bounded structured operations.
 * [OUTPUT]: One canvas tool shared by API/native employees; no caller-selected employee or raw snapshot writes.
 * [POS]: Canvas employee tool factory; authoritative permission and persistence remain in the host service.
 * [PROTOCOL]: Update Header and mastra/.folder.md on change.
 */
import { canvasAgentRequestSchema, canvasToolDescription } from '@boai/canvas-plugin/tools'
import type { EngineContext } from '../../contracts'

export function createCanvasOperations(context: EngineContext) {
  if (!context.canvasEnabled || !context.callCanvas || context.work?.organization) return []
  return [{ name: 'call_canvas', schema: canvasAgentRequestSchema, description: canvasToolDescription, execute: (raw: unknown) => context.callCanvas!(canvasAgentRequestSchema.parse(raw)) }]
}
