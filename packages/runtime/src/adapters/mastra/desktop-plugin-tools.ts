/*
 * [INPUT]: Host-authorized Agent Desktop plugin callbacks.
 * [OUTPUT]: Shared API/native discovery and original CLI argument calls with real image results.
 * [POS]: Desktop plugin tool bridge, independent of browser plugins and legacy MCP sources.
 * [PROTOCOL]: Update Header and mastra/.folder.md on change.
 */
import { z } from 'zod'
import { desktopPluginCallSchema } from '@boai/shared/plugins/desktop-tools'
import type { EngineContext } from '../../contracts'

export function createDesktopPluginOperations(context: EngineContext) {
  if (!context.desktopPluginEnabled || !context.inspectDesktopPlugin || !context.callDesktopPlugin || context.work?.organization) return []
  return [
    { name: 'inspect_desktop_plugin', schema: z.object({}).strict(), description: 'Inspect the enabled Agent Desktop computer-use plugin before desktop interaction. When the user requests agent-desktop, use this plugin rather than a legacy computer-use MCP. The plugin uses the local desktop and the current employee permissions.', execute: () => context.inspectDesktopPlugin!() },
    { name: 'call_desktop_plugin', schema: desktopPluginCallSchema, description: 'Call agent-desktop using command and original CLI args after inspect_desktop_plugin. First load skills get desktop and skills get platform, then status. Use --help for command syntax. Ref actions default to background accessibility; headed:true requires the saved owner setting. Observe after actions; only disposition.retry=safe permits retry. The host isolates refs by employee/conversation and returns screenshot image parts. Never replay an unknown action through another provider.', execute: (raw: unknown) => context.callDesktopPlugin!(desktopPluginCallSchema.parse(raw)) },
  ]
}
