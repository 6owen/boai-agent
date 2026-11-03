<!--
[INPUT]: 上游agent-desktop v1.1.0与BOAI可选应用插件合同。
[OUTPUT]: 电脑操作正式提供方、旧MCP退役、使用与验证边界。
[POS]: Agent Desktop可选工具插件说明。
[PROTOCOL]: 变化同步Header与所属.folder.md。
-->
# Agent Desktop plugin

Uses the published `agent-desktop@1.1.0` package directly (Apache-2.0, upstream tag `d3dc190afbf34cd2377252398ddd5c30efbd093a`). BOAI copies the matching packaged native CLI and helper to its private versioned tools directory. It does not run npm install scripts, download binaries at runtime, fork upstream code, or add an agent loop.

The application plugin is enabled by default; an explicitly saved disabled setting is respected. Manage **Agent Desktop** under Settings → Plugins. The configuration dialog checks the connection without inspecting apps or prompting for OS permissions. Foreground input is a separate default-off option. Desktop requests use Agent Desktop; `inspect_desktop_plugin` and `call_desktop_plugin` are available to API and native employees through their existing tool bridges.

BOAI maintains enablement, employee approval, serialized desktop access, per-employee/conversation ref namespaces, cancellation, and image transport. CLI arguments remain arrays and never pass through a shell. Desktop input arguments are omitted from persistent observations. Screenshot bytes go to the configured vision model as image content, not text/base64 logs.

Upstream v1.1.0 executes each CLI call in its own process. Cancellation stops the owned process group and waits for actual exit; it cannot undo input already delivered to an app. Unknown delivery is never automatically retried or passed to the old MCP as a fallback. The plugin does not launch cursor overlays, debug captures or session tracing. Clipboard data and snapshots remain sensitive desktop content.

macOS needs Accessibility permission for the actual launching BOAI process; screenshot commands additionally need Screen Recording. A check launched from a developer terminal cannot certify the installed BOAI app's grants. Windows/Linux support is inherited from upstream and has not been accepted in BOAI here.

The old `computer-use-mcp` installer, bundled source metadata and `boai-computer-use` skill are retired. Startup removes the exact old installer registration and unchanged bound skill copies through the existing removal services. Custom registrations are preserved; modified skill copies are preserved with a runtime notice. Existing global skill sources and executable directories require explicit cleanup; they are not silently removed during startup. The enabled plugin supplies `boai-agent-desktop` through the shared `list_skills` / `read_skill` tools, including for existing employees with no bound skills. It is identified as a plugin-owned guide, disappears on disablement, and creates no installation or employee copy. Its Markdown is embedded at build time. This BOAI entry selects the desktop workflow and loads the installed upstream version’s own `desktop` and `platform` skills; OS command syntax remains upstream-owned. Real employee/model acceptance remains separate from engineering checks.

Source: https://github.com/vercel-labs/agent-desktop/tree/v1.1.0
