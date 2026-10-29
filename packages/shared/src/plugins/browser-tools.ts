/*
 * [INPUT]: Independent community browser providers and owner configuration.
 * [OUTPUT]: Two optional browser plugins, versioned launch settings and original-tool calls.
 * [POS]: Browser plugin protocol; BOAI's embedded browser and retrieval preferences stay separate.
 * [PROTOCOL]: Update Header and plugins/.folder.md on change.
 */
import { z } from 'zod'

export const browserPluginProviderSchema = z.enum(['agent-browser', 'browser-viewer'])
export type BrowserPluginProvider = z.infer<typeof browserPluginProviderSchema>
export const browserPluginNames: Record<BrowserPluginProvider, string> = { 'agent-browser': 'AgentBrowser', 'browser-viewer': 'BrowserViewer' }
export const browserPluginId = (provider: BrowserPluginProvider) => `boai.browser.${provider}`
export const browserPluginConfigSchema = z.object({
  headless: z.boolean().default(false),
  executablePath: z.string().trim().max(4096).default(''),
}).strict()
export type BrowserPluginConfig = z.infer<typeof browserPluginConfigSchema>
export interface BrowserPluginSettings { provider: BrowserPluginProvider; revision: number; config: BrowserPluginConfig }
export const saveBrowserPluginSettingsSchema = z.object({ provider: browserPluginProviderSchema, expectedRevision: z.number().int().nonnegative(), config: browserPluginConfigSchema }).strict()
export type SaveBrowserPluginSettings = z.infer<typeof saveBrowserPluginSettingsSchema>
export const browserPluginCallSchema = z.object({ provider: browserPluginProviderSchema, tool: z.string().min(1).max(100), arguments: z.record(z.string(), z.unknown()).default({}) }).strict()
export type BrowserPluginCall = z.infer<typeof browserPluginCallSchema>
