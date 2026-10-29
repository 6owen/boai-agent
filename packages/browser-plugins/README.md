<!--
[INPUT]: Official community browser packages and the BOAI plugin host.
[OUTPUT]: Integration boundaries and runtime prerequisites.
[POS]: Independent browser plugin package guide.
[PROTOCOL]: Update with package/source map.
-->
# BOAI community browser plugins

Uses published packages directly: `@mastra/agent-browser@0.5.5`, `@mastra/browser-viewer@0.2.6`, `agent-browser@0.19.0` and BOAI's existing `@mastra/core@1.71.0`. Upstream implementation and licenses remain in the npm dependencies; no fork or copied browser automation code is maintained here.

- AgentBrowser exposes the original upstream tools and image results.
- BrowserViewer owns a separate Chromium connection. Its tools entry runs the original agent-browser CLI through BOAI's host command executor. It does not embed Mastra Studio's live-view interface.
- Each plugin is opt-in, each run has its own browser, and completion, cancellation, disablement and shutdown close that run's session. No BOAI cookies, user browser profiles or existing windows are imported.
- Default launch uses installed Chrome/Edge on macOS or Chrome/Chromium on Linux; an executable path can be configured. Otherwise the upstream Playwright browser installation must exist. These packages do not bundle a Chromium download into BOAI.
- BrowserViewer also requires employee command execution and the upstream CLI's Node runtime on PATH. Its temporary socket directory is short and owned by this session (macOS UNIX socket path limit).
- The Electron package unpacks agent-browser and playwright-core for native process execution. Installed release and Windows/Linux acceptance remain separate from source-tree validation.

BOAI maintains enablement, launch configuration, approvals, result transport and cleanup. Community package upgrades still require compatibility checks. Stagehand is deliberately excluded from this increment.

Sources: [AgentBrowser](https://mastra.ai/integrations/browsers/agent-browser), [BrowserViewer](https://mastra.ai/integrations/browsers/browser-viewer).
