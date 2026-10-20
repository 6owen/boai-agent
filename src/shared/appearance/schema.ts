/*
 * [INPUT]: Appearance patches from UI and application operations.
 * [OUTPUT]: One shared strict schema for existing appearance settings.
 * [POS]: Shared appearance validation; storage remains in the desktop host.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import { z } from 'zod'
import { maxBackgroundBlur } from './index'
const color = z.string().regex(/^#[0-9a-f]{6}$/i).nullable().optional()
const colors = z.object({ accent: color, background: color, foreground: color }).strict()
export const appearancePatchSchema = z.object({
 mode: z.enum(['light','dark','system']).optional(),
 themeIds: z.object({ light: z.string().max(100).optional(), dark: z.string().max(100).optional() }).strict().optional(),
 background: z.object({ imageOpacity: z.number().min(0).max(1).optional(), glassOpacity: z.number().min(0).max(1).nullable().optional(), overlayOpacity: z.number().min(0).max(1).optional(), blurRadius: z.number().int().min(0).max(maxBackgroundBlur).optional() }).strict().optional(),
 fontFamily: z.enum(['system','geist']).optional(),
 zoomFactor: z.number().min(0.75).max(1.5).optional(),
 customColors: z.object({ light: colors.optional(), dark: colors.optional() }).strict().optional(),
}).strict()
