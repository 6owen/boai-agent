/*
 * [INPUT]: Untrusted native capability RPC fields and canonical skill roots from the current sample.
 * [OUTPUT]: Stable in-memory inventory fingerprints, validated scalar fields and bounded skill tree evidence across one inventory.
 * [POS]: Shared evidence rules for Codex and Claude. Protocol admission and ownership decisions stay with their callers.
 * [PROTOCOL]: Update this header and the adapters directory map on changes.
 */
import { createHash } from 'node:crypto'
import { inspectResourceTree, RESOURCE_LIMITS } from '../modules/resources/local-resources'

export const MAX_NATIVE_INVENTORY_ITEMS = 2000

export function inventoryRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

export function isInventoryLabel(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= 4000 && !/[\u0000-\u001f\u007f]/.test(value)
}

export function serializeInventory(value: object): string {
  return JSON.stringify(value, (_, item: unknown) => {
    const record = inventoryRecord(item)
    return record ? Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b))) : item
  })
}

export function inventoryFingerprint(value: object): string {
  return createHash('sha256').update(serializeInventory(value)).digest('hex')
}

export class NativeSkillTrees {
  private bytes = 0
  private entries = 0

  get overBudget(): boolean {
    return this.bytes > RESOURCE_LIMITS.bytes || this.entries > RESOURCE_LIMITS.entries
  }

  async contentHash(root: string, signal?: AbortSignal): Promise<string | undefined> {
    const tree = await inspectResourceTree(root, signal)
    this.bytes += tree.bytes
    this.entries += tree.entries
    if (!this.overBudget && tree.files.some(file => file.path === 'SKILL.md')) return tree.hash
  }
}
