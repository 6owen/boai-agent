/*
 * [INPUT]: Host-bound canvas capability and the package's bounded structured operations.
 * [OUTPUT]: One canvas tool shared by API/native employees; no caller-selected employee or raw snapshot writes.
 * [POS]: Canvas employee tool factory; authoritative permission and persistence remain in the host service.
 * [PROTOCOL]: Update Header and mastra/.folder.md on change.
 */
import { canvasAgentRequestSchema, canvasToolDescription } from '@boai/canvas-plugin/tools'
import type { EngineContext } from '../../contracts'
export { canvasAgentRequestSchema, canvasToolNames, type CanvasAgentRequest } from '@boai/canvas-plugin/tools'

export function createCanvasOperations(context: EngineContext) {
  if (!context.canvasEnabled || !context.callCanvas || context.work?.organization) return []
  return [{ name: 'call_canvas', schema: canvasAgentRequestSchema, description: canvasToolDescription, execute: (raw: unknown) => context.callCanvas!(canvasAgentRequestSchema.parse(raw)) }]
}
