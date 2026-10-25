/*
 * [INPUT]: Original message request fields, temporary API key and uploaded file descriptors.
 * [OUTPUT]: Stable request identity excluding secrets and expiring upload tokens.
 * [POS]: Shared ordinary/core submission fingerprint; does not accept or replay requests.
 * [PROTOCOL]: Changes update Header and .folder.md.
 */
import type { ApiModelOverride } from '@boai/shared/domain/model-source'
import type { SubmittedMaterial } from '@boai/shared/domain/material-upload'
import { modelRequestIdentity } from '../../request-model'

export function submissionIdentity<T extends { apiModel?: ApiModelOverride; materialUploads?: SubmittedMaterial[] }>(input: T): T {
  const identity = modelRequestIdentity(input)
  return identity.materialUploads ? { ...identity, materialUploads: identity.materialUploads.map(({ selectionId: _temporary, ...file }) => file) } : identity
}
