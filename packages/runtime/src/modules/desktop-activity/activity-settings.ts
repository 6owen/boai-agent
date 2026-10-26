/*
 * [INPUT]: Existing recorder settings and explicitly submitted configuration.
 * [OUTPUT]: Backward-compatible defaults, independent opt-ins and validated capture controls.
 * [POS]: Desktop activity configuration shared by persistence and application operations.
 * [PROTOCOL]: Update Header and owning .folder.md when changed.
 */
import { z } from 'zod'
import type { ActivitySettings } from '@boai/shared/domain/desktop-activity'

export const activityDefaults: ActivitySettings = {
  revision: 0, enabled: false, intervalSeconds: 60, retentionDays: 14,
  excludedApps: ['com.1password.1password', 'com.agilebits.onepassword7', 'org.bitwarden.desktop', 'com.bitwarden.desktop', 'com.apple.keychainaccess', 'com.apple.Passwords', 'com.lastpass.LastPass'],
  saveScreenshots: false, enableInputMonitor: false, enableOcr: true,
  ocrLanguages: ['zh-Hans', 'en-US'], ocrEveryN: 1,
  snapshotDebounceMs: 4000, idleThresholdMs: 30000, typingPauseMs: 1200, visualCheckIntervalMs: 12000,
  jpegQuality: 55, maxStorageMB: 10240,
}
export const activityPatch = z.object({
  expectedRevision: z.number().int().nonnegative(), enabled: z.boolean().optional(),
  intervalSeconds: z.number().int().min(10).max(3600).optional(), retentionDays: z.number().int().min(1).max(365).optional(),
  excludedApps: z.array(z.string().trim().min(1).max(200)).max(100).optional(),
  saveScreenshots: z.boolean().optional(), enableInputMonitor: z.boolean().optional(), enableOcr: z.boolean().optional(),
  ocrLanguages: z.array(z.string().regex(/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/)).min(1).max(16).optional(), ocrEveryN: z.number().int().min(1).max(100).optional(),
  snapshotDebounceMs: z.number().int().min(1000).max(60000).optional(), idleThresholdMs: z.number().int().min(10000).max(3600000).optional(),
  typingPauseMs: z.number().int().min(200).max(10000).optional(), visualCheckIntervalMs: z.union([z.literal(0), z.number().int().min(5000).max(300000)]).optional(),
  jpegQuality: z.number().int().min(10).max(100).optional(), maxStorageMB: z.number().int().min(10).max(102400).optional(),
}).strict()
export type ActivityPatch = z.infer<typeof activityPatch>
export function restoreActivitySettings(value?: Partial<ActivitySettings> | null): ActivitySettings {
  return { ...structuredClone(activityDefaults), ...value }
}
