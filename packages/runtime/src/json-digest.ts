/*
 * [INPUT]: A JSON-serializable value in the property order selected by its owner.
 * [OUTPUT]: The SHA-256 hex digest of the UTF-8 bytes produced by native JSON.stringify.
 * [POS]: Runtime persistence encoding used by existing receipts, identities and frozen versions.
 * [PROTOCOL]: Update this header and src/.folder.md on change.
 */
import { createHash } from 'node:crypto'

export function jsonSha256(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}
