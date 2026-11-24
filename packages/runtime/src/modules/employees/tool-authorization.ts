/*
 * [INPUT]: SDK-approved tool identity and the current host run.
 * [OUTPUT]: An async-scoped approval receipt for the exact tool execution; never grants directories.
 * [POS]: Shared host permission boundary, independent of the selected agent SDK.
 * [PROTOCOL]: Changes update this Header and employees/.folder.md.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { ExecutionOperation } from '@boai/shared/domain/execution'

type Receipt = { runId: string; toolCallId: string; kind: ExecutionOperation['kind'] }
const receipts = new AsyncLocalStorage<Receipt & { active: boolean }>()
export async function withToolAuthorization<T>(receipt: Receipt, execute: () => Promise<T>): Promise<T> {
  const lease = { ...receipt, active: true }
  try { return await receipts.run(lease, execute) }
  finally { lease.active = false }
}
export function hasToolAuthorization(runId: string, kind: ExecutionOperation['kind']) {
  const receipt = receipts.getStore()
  return receipt?.active === true && receipt.runId === runId && receipt.kind === kind
}
