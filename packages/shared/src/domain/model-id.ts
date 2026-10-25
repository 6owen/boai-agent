/*
 * [INPUT]: Raw selected/catalog/native model identifiers, including provider prefixes and routing groups.
 * [OUTPUT]: One bounded model-ID contract across persistence, UI and runtime adapters; no truncation or prefix removal.
 * [POS]: Shared model-source identity validation, independent of any provider registry.
 * [PROTOCOL]: Update Header and domain/.folder.md when changing this contract.
 */
export const MODEL_ID_MAX_LENGTH = 1000
export function validModelId(value: string, allowEmpty = false): boolean {
  return value.length <= MODEL_ID_MAX_LENGTH && (allowEmpty || value.trim().length > 0) && !/[\u0000-\u001f\u007f]/.test(value)
}
