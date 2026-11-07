/*
 * [INPUT]: Validated appearance commands and saved preference snapshots.
 * [OUTPUT]: Version-two write semantics, structured known rejections and conflict checks; loading remains a plain merge.
 * [POS]: Shared appearance command rules used by Main and optimistic Renderer edits.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { appearanceDefaults, mergeAppearancePatch, type AppearancePatch, type AppearanceSnapshot } from './index'

export type AppearanceErrorCode = 'INVALID_ARGUMENT' | 'REVISION_CONFLICT' | 'READ_ONLY'
export class AppearanceError extends Error {
  constructor(readonly code: AppearanceErrorCode, message: string) { super(message); this.name = 'AppearanceError' }
}

/** Apply command side effects only here, never when loading or merging saved preferences. */
export function normalizeAppearanceCommand(patch: AppearancePatch): AppearancePatch {
  let normalized = structuredClone(patch)
  for (const mode of ['light', 'dark'] as const) {
    if (patch.themeIds?.[mode] !== undefined) normalized = mergeAppearancePatch(normalized, {
      customColors: { [mode]: { ...appearanceDefaults.customColors[mode], ...patch.customColors?.[mode] } },
    })
  }
  if (patch.typography?.ui?.sizePx !== undefined && patch.typography.content?.sizePx === undefined) {
    normalized = mergeAppearancePatch(normalized, { typography: { content: { sizePx: patch.typography.ui.sizePx } } })
  }
  return normalized
}

/** Theme/color and UI/content size fields form one edit intent even when only one leaf is supplied. */
export function appearanceCommandConflicts(patch: AppearancePatch, baseline: AppearanceSnapshot, current: AppearanceSnapshot): boolean {
  if ((current.resetRevision ?? 0) > baseline.revision) return true
  const before = baseline.preferences, after = current.preferences
  const command = normalizeAppearanceCommand(patch)
  if (command.mode !== undefined && before.mode !== after.mode) return true
  if (command.zoomFactor !== undefined && before.zoomFactor !== after.zoomFactor) return true
  if (command.appIconId !== undefined && before.appIconId !== after.appIconId) return true
  for (const mode of ['light', 'dark'] as const) {
    if (command.themeIds?.[mode] !== undefined || Object.keys(command.customColors?.[mode] ?? {}).length) {
      if (before.themeIds[mode] !== after.themeIds[mode]) return true
      // A concurrent color edit cannot be silently cleared by choosing a theme.
      if (command.themeIds?.[mode] !== undefined && JSON.stringify(before.customColors[mode]) !== JSON.stringify(after.customColors[mode])) return true
      for (const key of ['accent', 'background', 'foreground'] as const) {
        if (command.customColors?.[mode]?.[key] !== undefined && before.customColors[mode][key] !== after.customColors[mode][key]) return true
      }
    }
  }
  for (const group of ['ui', 'content', 'code'] as const) {
    for (const key of ['family', 'sizePx'] as const) {
      if (command.typography?.[group]?.[key] !== undefined && before.typography[group][key] !== after.typography[group][key]) return true
    }
  }
  if (command.fontFamily !== undefined && before.typography.ui.family !== after.typography.ui.family) return true
  if (command.typography?.ui?.sizePx !== undefined || command.typography?.content?.sizePx !== undefined) {
    if (before.typography.ui.sizePx !== after.typography.ui.sizePx || before.typography.content.sizePx !== after.typography.content.sizePx) return true
  }
  for (const key of ['imageOpacity', 'glassOpacity', 'overlayOpacity', 'blurRadius'] as const) {
    if (command.background?.[key] !== undefined && before.background[key] !== after.background[key]) return true
  }
  return false
}
