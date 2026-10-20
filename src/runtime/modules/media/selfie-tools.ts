/*
 * [INPUT]: Host-bound employee selfie capability and original execution permissions.
 * [OUTPUT]: Shared private album metadata/removal tools for chat, tasks and native conversations.
 * [POS]: Thin self-identity tool adapter; host owns private-chat authorization and actual bytes.
 * [PROTOCOL]: Update Header and media/.folder.md on change.
 */
import { z } from 'zod'
import type { EngineContext } from '../../contracts'
import { authorizeExecution } from '../employees/execution-permissions'
import { selfieRemoveSchema } from './selfie-service'

export function createSelfieOperations(context: EngineContext) {
  if (!context.selfies) return []
  const access = context.selfies
  return [
    { name: 'list_selfies', description: 'Read your own saved appearance-reference album metadata, count/latest ID and revision. Owner private chat only; no file paths or pixels. An empty album is not an appearance description. Does not create Work.', schema: z.object({}).strict(), execute: async () => { context.signal.throwIfAborted(); return access.list() } },
    { name: 'delete_selfie', description: 'Remove one explicitly selected saved appearance reference using the observed album revision. Owner private chat only. Does not delete past delivered files. cleanup pending means metadata is removed but disk cleanup needs attention.', schema: selfieRemoveSchema, execute: async (input: unknown) => { const value = selfieRemoveSchema.parse(input); await authorizeExecution(context, { kind: 'configuration', description: '删除形象参考' }); return access.remove(value) } },
  ]
}
