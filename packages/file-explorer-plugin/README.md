<!--
[OUTPUT]: 2026-10-29 工作区界面暂时隐藏，恢复时统一打开renderer的WORKSPACE_UI_ENABLED。
[OUTPUT]: 2026-10-29 右侧详情面板内左预览右文件树，窄栏不再上下堆叠。
[OUTPUT]: 2026-10-29 文件浏览器目录边界及真实回归覆盖；验证结果归第19组18。
[INPUT]: Host-approved directory scope, bounded IPC and BOAI preview providers.
[OUTPUT]: Official file explorer package contract and pinned upstream attribution.
[POS]: Application plugin package; not an Agent execution framework.
[PROTOCOL]: Update Header and .folder.md when changed.
-->
# @boai/file-explorer-plugin

Official BOAI file explorer (`boai.file-explorer`). Its UI is temporarily hidden at the user's request through `WORKSPACE_UI_ENABLED` in the renderer plugin store. Workspace entry points, tabs and the plugin settings entry are hidden; saved plugin preferences, filesystem permissions and employee execution workspaces remain unchanged. The implementation is retained for later resumption.

- `./host`: bounded directory pagination and read-only file preview. BOAI supplies the current scope resolver, original path validator, external opener and enablement check. It accepts no arbitrary filesystem root from the renderer.
- `./explorer`: left content preview and right lazy virtual file tree inside BOAI's shared right detail panel. Narrow panels retain the horizontal arrangement; the tree width is bounded and filenames truncate. Keyboard navigation and hidden-file toggle remain available. Requests and document bytes stop/expire on hidden tabs, changed scopes or disablement. The host supplies existing Markdown/code/image/PDF/Office renderers.
- `./tree`: typed directory projection and extension-preserving filenames.

Employee configuration opens the employee's managed workspace. Conversation Start opens only the selected employee's saved directory grants. Grant removal never deletes files and does not change task cwd or artifact publication.

Tree/cache and filename presentation adapted from [Lanzgale/dsh-file-browser](https://github.com/Lanzgale/dsh-file-browser/tree/4c1fa36d479833e1df36f4cf2cfde98c47887858), MIT. See `LICENSE.txt` and `source-manifest.json`; both are included in desktop distribution. DSH's global DOM hooks, unrestricted server access and editing are replaced by BOAI's typed host callbacks.
