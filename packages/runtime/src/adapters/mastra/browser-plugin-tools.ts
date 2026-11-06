/*
 * [OUTPUT]: 2026-11-06 明确首次调用模式覆盖、后续沿本轮模式，未指定遵循浏览器配置及默认后台。
 * [INPUT]: Host-authorized independent browser plugins.
 * [OUTPUT]: Upstream tool discovery and unchanged argument forwarding for API and native agents.
 * [POS]: Browser plugin tool bridge; embedded browser_tool and search selection remain separate.
 * [PROTOCOL]: Update Header and mastra/.folder.md on change.
 */
import { z } from 'zod'
import { browserPluginProviderSchema, browserPluginCallSchema } from '@boai/shared/plugins/browser-tools'
import type { EngineContext } from '../../contracts'

export function createBrowserPluginOperations(context: EngineContext) {
  if (!context.browserPluginProviders?.length || !context.inspectBrowserPlugin || !context.callBrowserPlugin || context.work?.organization) return []
  return [
    { name: 'inspect_browser_plugin', schema: z.object({ provider: browserPluginProviderSchema }).strict(), description: `Inspect original tools and input schemas for an independent browser plugin before calling it. Enabled providers: ${context.browserPluginProviders.join(', ')}. These use their own browser windows and login states; a user-referenced BOAI browser page must still use browser_tool. BrowserViewer uses the agent-browser CLI and requires command permission.`, execute: (raw: unknown) => context.inspectBrowserPlugin!(z.object({ provider: browserPluginProviderSchema }).parse(raw).provider) },
    { name: 'call_browser_plugin', schema: browserPluginCallSchema, description: 'Call an original tool returned by inspect_browser_plugin, preserving its arguments schema. Set foreground only when the user explicitly requests foreground/background for this run, on the first call_browser_plugin action (discovery does not launch a browser). Otherwise omit it: saved browser preference applies, falling back to background. The selected launch mode stays for the run; do not switch mode or restart a live browser to discard its page state. Use a fresh page snapshot for element refs. Cite actual returned URLs. Browser plugins do not share BOAI browser logins. An unknown or cancelled result is not permission to replay the action. Files require publish_artifact for chat delivery.', execute: (raw: unknown) => context.callBrowserPlugin!(browserPluginCallSchema.parse(raw)) },
  ]
}
