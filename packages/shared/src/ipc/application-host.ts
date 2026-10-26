/*
 * [INPUT]: Trusted same-profile runtime requests for desktop-owned settings.
 * [OUTPUT]: Explicit local workspace shutdown/OCR/appearance/plugin host port; no renderer, shell or credential passthrough.
 * [POS]: Private host contract used by the public business facade.
 * [PROTOCOL]: Changes must update this Header and the owning .folder.md.
 */
import type { Methods } from './index'

export const applicationHostMethods = ['closeUserWorkspace', 'captureDesktopActivity', 'getAppearance', 'updateAppearance', 'resetAppearance', 'removeAppearanceBackground', 'getPluginSettings', 'setPluginEnabled'] as const
export type ApplicationHostMethod = typeof applicationHostMethods[number]
export const isApplicationHostMethod = (value: string): value is ApplicationHostMethod => (applicationHostMethods as readonly string[]).includes(value)
export interface ApplicationHostPort {
  readonly available: boolean
  request<K extends ApplicationHostMethod>(method: K, input: Methods[K]['input']): Promise<Methods[K]['output']>
}
