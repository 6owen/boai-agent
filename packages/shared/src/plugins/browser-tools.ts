/*
 * [INPUT]: Independent community browser providers and owner configuration.
 * [OUTPUT]: Browser launch preferences, minimal foreground patches and per-field draft rebasing share one contract.
 * [POS]: Browser plugin protocol; BOAI's embedded browser and retrieval preferences stay separate.
 * [PROTOCOL]: Update Header and plugins/.folder.md on change.
 */
import { z } from 'zod'

export const browserPluginProviderSchema = z.enum(['agent-browser', 'browser-viewer'])
export type BrowserPluginProvider = z.infer<typeof browserPluginProviderSchema>
export const browserPluginNames: Record<BrowserPluginProvider, string> = { 'agent-browser': 'AgentBrowser', 'browser-viewer': 'BrowserViewer' }
export const browserPluginId = (provider: BrowserPluginProvider) => `boai.browser.${provider}`
export const browserPluginConfigSchema = z.object({
  headless: z.boolean().default(true),
  executablePath: z.string().trim().max(4096).default(''),
}).strict()
export type BrowserPluginConfig = z.infer<typeof browserPluginConfigSchema>
export const browserPluginConfigurationPatchSchema = z.object({ defaultForeground: z.boolean().optional() }).strict()
export const browserDefaultForeground = (config: BrowserPluginConfig) => !config.headless
export const applyBrowserConfigurationPatch = (config: BrowserPluginConfig, patch: z.infer<typeof browserPluginConfigurationPatchSchema>): BrowserPluginConfig => ({ ...config, ...(patch.defaultForeground === undefined ? {} : { headless: !patch.defaultForeground }) })
export class BrowserPluginSettingsError extends Error {
  constructor(readonly code: 'REVISION_CONFLICT' | 'CAPABILITY_UNAVAILABLE', message: string) { super(message) }
}
/** Only fields edited since the dialog baseline are applied to the latest saved values. */
export function mergeBrowserConfigurationDraft(base: BrowserPluginConfig, draft: BrowserPluginConfig, latest: BrowserPluginConfig) {
  const config = { ...latest }, conflicts: (keyof BrowserPluginConfig)[] = []
  for (const key of ['headless', 'executablePath'] as const) {
    if (draft[key] === base[key]) continue
    if (latest[key] !== base[key] && latest[key] !== draft[key]) conflicts.push(key)
    if (key === 'headless') config.headless = draft.headless
    else config.executablePath = draft.executablePath
  }
  return { config, conflicts }
}
/** External updates advance untouched baselines, without adopting a conflicting edit. */
export function refreshBrowserConfigurationDraft(base: BrowserPluginConfig, draft: BrowserPluginConfig, latest: BrowserPluginConfig) {
  const nextBase = { ...base }, nextDraft = { ...draft }
  for (const key of ['headless', 'executablePath'] as const) {
    if (draft[key] !== base[key] && draft[key] !== latest[key]) continue
    if (key === 'headless') { nextBase.headless = latest.headless; nextDraft.headless = latest.headless }
    else { nextBase.executablePath = latest.executablePath; nextDraft.executablePath = latest.executablePath }
  }
  return { base: nextBase, draft: nextDraft }
}
export interface BrowserPluginSettings { provider: BrowserPluginProvider; revision: number; config: BrowserPluginConfig }
export const saveBrowserPluginSettingsSchema = z.object({ provider: browserPluginProviderSchema, expectedRevision: z.number().int().nonnegative(), config: browserPluginConfigSchema }).strict()
export type SaveBrowserPluginSettings = z.infer<typeof saveBrowserPluginSettingsSchema>
export const browserPluginCallSchema = z.object({ provider: browserPluginProviderSchema, tool: z.string().min(1).max(100), arguments: z.record(z.string(), z.unknown()).default({}), foreground: z.boolean().optional().describe('Explicit mode for this run, selected before the first browser action. Omit to follow the browser configuration (background by default).') }).strict()
export type BrowserPluginCall = z.infer<typeof browserPluginCallSchema>
