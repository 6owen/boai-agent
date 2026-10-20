/*
 * [OUTPUT]: 2026-10-20全局字体与应用图标设置接入原外观持久化和宿主协议。
 * [INPUT]: Appearance patches from UI and application operations.
 * [OUTPUT]: One shared strict schema for existing appearance settings.
 * [POS]: Shared appearance validation; storage remains in the desktop host.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { z } from 'zod'
import { maxBackgroundBlur } from './index'
import { typographyControls } from './typography'
import { isAppIconId } from './app-icons'
const color = z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional()
const colors = z.object({ accent: color, background: color, foreground: color }).strict()
const size = (group: keyof typeof typographyControls) => z.number().int().min(typographyControls[group].min).max(typographyControls[group].max)
export const appearancePatchSchema = z.object({
 mode: z.enum(['light','dark','system']).optional(),
 themeIds: z.object({ light: z.string().max(100).optional(), dark: z.string().max(100).optional() }).strict().optional(),
 background: z.object({ imageOpacity: z.number().min(0).max(1).optional(), glassOpacity: z.number().min(0).max(1).nullable().optional(), overlayOpacity: z.number().min(0).max(1).optional(), blurRadius: z.number().int().min(0).max(maxBackgroundBlur).optional() }).strict().optional(),
 fontFamily: z.enum(['system','geist']).optional(),
 appIconId: z.string().refine(isAppIconId, '未知应用图标').optional(),
 typography: z.object({
  ui: z.object({ family: z.enum(['system', 'geist']).optional(), sizePx: size('ui').optional() }).strict().optional(),
  content: z.object({ family: z.enum(['ui', 'system', 'geist', 'serif']).optional(), sizePx: size('content').optional() }).strict().optional(),
  code: z.object({ family: z.enum(['system', 'menlo']).optional(), sizePx: size('code').optional() }).strict().optional(),
 }).strict().optional(),
 zoomFactor: z.number().min(0.75).max(1.5).optional(),
 customColors: z.object({ light: colors.optional(), dark: colors.optional() }).strict().optional(),
}).strict()
