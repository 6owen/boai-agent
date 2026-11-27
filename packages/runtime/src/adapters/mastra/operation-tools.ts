/*
 * [INPUT]: Authorized runtime operations and optional model-output conversion.
 * [OUTPUT]: Mastra tools keyed by the original operation names.
 * [POS]: SDK binding shared by stage, automation, source and task tools.
 * [PROTOCOL]: Update Header and parent .folder.md on change.
 */
import { createTool } from '@mastra/core/tools'
import type { RuntimeToolOperation } from '../../contracts'

export function bindMastraOperation(operation: RuntimeToolOperation, toModelOutput?: (value: unknown) => unknown) {
  return createTool({
    id: operation.name,
    description: operation.description,
    inputSchema: operation.schema,
    ...(toModelOutput && { toModelOutput }),
    execute: input => operation.execute(input),
  })
}

export function bindMastraOperations(operations: readonly RuntimeToolOperation[], toModelOutput?: (value: unknown) => unknown) {
  return Object.fromEntries(operations.map(operation => [operation.name, bindMastraOperation(operation, toModelOutput)] as const))
}
