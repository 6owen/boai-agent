/*
 * [INPUT]: Preset avatar identities and the JSON-typed icon manifest, loadable by Node 24 as well as the renderer build.
 * [OUTPUT]: Stable validated application icon choices shared by settings and host; native test import carries JSON type.
 * [POS]: Appearance app icon catalog; the binary assets live in resources/app-icons.
 * [PROTOCOL]: Update this Header and the owning .folder.md when this file changes.
 */
import { avatarPresets } from '../domain/avatars'
import manifest from '../../../resources/app-icons/manifest.json' with { type: 'json' }

const available = new Set(manifest.icons.map(icon => icon.id))
export const defaultAppIconId = manifest.defaultId
export const appIconPresets = avatarPresets.map(avatar => ({
  id: `avatar-${avatar.id}`,
  avatarId: avatar.id,
  name: avatar.name,
})).filter(icon => available.has(icon.id))
export type AppIconId = string
export function isAppIconId(value: unknown): value is AppIconId {
  return typeof value === 'string' && available.has(value)
}
export interface AppIconStatus {
  platform: 'macos' | 'unsupported'
  environment: 'development' | 'installed'
  requestedId: AppIconId
  pending: boolean
  dock: { appliedId: AppIconId | null; error: string | null }
  installed: { appliedId: AppIconId | null; error: string | null; available: boolean }
}
