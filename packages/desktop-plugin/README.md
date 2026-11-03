<!--
[INPUT]: 上游agent-desktop v1.1.0与BOAI可选应用插件合同。
[OUTPUT]: 插件接入、使用步骤、权限和真实验证边界。
[POS]: Agent Desktop可选工具插件说明。
[PROTOCOL]: 变化同步Header与所属.folder.md。
-->
# Agent Desktop plugin

Uses the published `agent-desktop@1.1.0` package directly (Apache-2.0, upstream tag `d3dc190afbf34cd2377252398ddd5c30efbd093a`). BOAI copies the matching packaged native CLI and helper to its private versioned tools directory. It does not run npm install scripts, download binaries at runtime, fork upstream code, or add an agent loop.

The application plugin is disabled by default. Enable **Agent Desktop** under Settings → Plugins. The configuration dialog checks the connection without inspecting apps or prompting for OS permissions. Foreground input is a separate default-off option. Ask an employee to use Agent Desktop explicitly; `inspect_desktop_plugin` and `call_desktop_plugin` are available to API and native employees through their existing tool bridges.

BOAI maintains enablement, employee approval, serialized desktop access, per-employee/conversation ref namespaces, cancellation, and image transport. CLI arguments remain arrays and never pass through a shell. Desktop input arguments are omitted from persistent observations. Screenshot bytes go to the configured vision model as image content, not text/base64 logs.

Upstream v1.1.0 executes each CLI call in its own process. Cancellation stops the owned process group and waits for actual exit; it cannot undo input already delivered to an app. Unknown delivery is never automatically retried or passed to the old MCP as a fallback. The plugin does not launch cursor overlays, debug captures or session tracing. Clipboard data and snapshots remain sensitive desktop content.

macOS needs Accessibility permission for the actual launching BOAI process; screenshot commands additionally need Screen Recording. A check launched from a developer terminal cannot certify the installed BOAI app's grants. Windows/Linux support is inherited from upstream and has not been accepted in BOAI here.

The existing `BOAI Computer Use` MCP, its configuration and bound skill are retained for comparison. Before retiring it, compare native and Electron apps, Chinese input, menus, screenshots, background focus, denied permissions, stale refs and cancellation using a real employee/model. Engineering tests alone do not certify that comparison.

Source: https://github.com/vercel-labs/agent-desktop/tree/v1.1.0
