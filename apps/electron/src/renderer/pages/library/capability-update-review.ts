/*
 * [INPUT]: Fixed installed and inspected package definitions.
 * [OUTPUT]: Explicit changed/added/removed review and only unchanged default grants.
 * [POS]: Capability-package update UI policy; new permissions require a separate user choice.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import type { CapabilityDefinition } from '@boai/shared/domain/capability-packages'
export function capabilityUpdateReview(previous: readonly CapabilityDefinition[], next: readonly CapabilityDefinition[]) {
  const rows = next.map(value => {
    const old = previous.find(item => item.key === value.key)
    return { key: value.key, kind: value.kind, change: !old ? 'added' as const : JSON.stringify(old) === JSON.stringify(value) ? 'unchanged' as const : 'changed' as const }
  })
  return { rows, removed: previous.filter(item => !next.some(value => value.key === item.key)).map(item => item.key), approved: rows.filter(item => item.change === 'unchanged').map(item => item.key) }
}
