/*
 * [INPUT]: Preset avatar identities and the JSON-typed icon manifest, loadable by Node 24 as well as the renderer build.
 * [OUTPUT]: Stable icon choices and explicit tray asset mapping; independent Dock/tray/installed status with monotonic sequence.
 * [POS]: Appearance app icon catalog; the binary assets live in resources/app-icons.
 * [PROTOCOL]: Update this Header and the owning .folder.md when this file changes.
 */
import { avatarPresets } from '../domain/avatars'
import manifest from './app-icon-manifest.json' with { type: 'json' }

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
export function appIconTrayAssets(id: AppIconId) {
  const icon = manifest.icons.find(icon => icon.id === id)
  if (!icon?.tray) throw new Error('未知托盘图标')
  return icon.tray
}
export interface TrayIconStatus {
  supported: boolean
  available: boolean
  state: 'waiting' | 'applied' | 'failed' | 'unavailable' | 'unsupported' | 'closed'
  appliedId: AppIconId | null
  fallback: 'default' | 'builtin' | null
  error: string | null
}
export interface AppIconStatus {
  sequence: number
  platform: 'macos' | 'unsupported'
  environment: 'development' | 'installed'
  requestedId: AppIconId
  pending: boolean
  dock: { appliedId: AppIconId | null; error: string | null }
  tray: TrayIconStatus
  installed: { appliedId: AppIconId | null; error: string | null; available: boolean }
}
