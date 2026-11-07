/*
 * [INPUT]: Trusted same-profile runtime requests for desktop-owned settings.
 * [OUTPUT]: Explicit appearance/icon/diagnosis host methods and safe pre-commit error codes across owned/attached transports.
 * [POS]: Private host contract used by the public business facade.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import type { Methods } from './index'
import { z } from 'zod'

export const applicationHostMethods = ['canvasHost', 'closeUserWorkspace', 'captureDesktopActivity', 'getAppearance', 'updateAppearance', 'resetAppearance', 'removeAppearanceBackground', 'getAppIconStatus', 'getDiagnosticsSnapshot', 'getPluginSettings', 'setPluginEnabled'] as const
export type ApplicationHostMethod = typeof applicationHostMethods[number]
export const isApplicationHostMethod = (value: string): value is ApplicationHostMethod => (applicationHostMethods as readonly string[]).includes(value)
export interface ApplicationHostPort {
  readonly available: boolean
  request<K extends ApplicationHostMethod>(method: K, input: Methods[K]['input']): Promise<Methods[K]['output']>
}

/** Only known rejections before a configuration commit may carry these codes. */
export const applicationHostErrorCodeSchema = z.enum(['INVALID_INPUT', 'REVISION_CONFLICT', 'FORBIDDEN', 'CAPABILITY_UNAVAILABLE'])
export class ApplicationHostError extends Error {
  constructor(readonly code: z.infer<typeof applicationHostErrorCodeSchema>, message: string) { super(message) }
}
export function decodeApplicationHostError(message: string, code?: unknown): Error {
  const parsed = applicationHostErrorCodeSchema.safeParse(code)
  return parsed.success ? new ApplicationHostError(parsed.data, message) : new Error(message)
}
