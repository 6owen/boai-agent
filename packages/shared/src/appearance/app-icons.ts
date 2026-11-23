/*
 * [INPUT]: Preset avatar identities and the JSON manifest with named brand logos.
 * [OUTPUT]: Manifest-ordered icon choices, the default ID and explicit tray assets; independent Dock/tray/installed status.
 * [POS]: Appearance app icon catalog; the binary assets live in resources/app-icons.
 * [PROTOCOL]: Update this Header and the owning .folder.md when this file changes.
 */
import { avatarPresets } from '../domain/avatars'
import manifest from './app-icon-manifest.json' with { type: 'json' }

const available = new Set(manifest.icons.map(icon => icon.id))
const avatarPresentation = new Map<string, { avatarId: string; name: string }>(
  avatarPresets.map(avatar => [`avatar-${avatar.id}`, { avatarId: avatar.id, name: avatar.name }]),
)
export const defaultAppIconId = manifest.defaultId
export const appIconPresets = manifest.icons.flatMap(icon => {
  const presentation = icon.name === undefined ? avatarPresentation.get(icon.id) : { name: icon.name }
  return presentation ? [{ id: icon.id, ...presentation }] : []
})
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
