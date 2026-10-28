<!--
[OUTPUT]: 2026-10-29 文件浏览器目录边界及真实回归覆盖；验证结果归第19组18。
[INPUT]: Host-approved directory scope, bounded IPC and BOAI preview providers.
[OUTPUT]: Official file explorer package contract and pinned upstream attribution.
[POS]: Application plugin package; not an Agent execution framework.
[PROTOCOL]: Update Header and .folder.md when changed.
-->
# @boai/file-explorer-plugin

Official BOAI file explorer (`boai.file-explorer`). Enabled by default in the application plugin catalog; users can disable it in plugin settings.

- `./host`: bounded directory pagination and read-only file preview. BOAI supplies the current scope resolver, original path validator, external opener and enablement check. It accepts no arbitrary filesystem root from the renderer.
- `./explorer`: lazy virtual file tree, keyboard navigation, hidden-file toggle and inline preview slot. Requests and document bytes stop/expire on hidden tabs, changed scopes or disablement. The host supplies existing Markdown/code/image/PDF/Office renderers.
- `./tree`: typed directory projection and extension-preserving filenames.

Employee configuration opens the employee's managed workspace. Conversation Start opens only the selected employee's saved directory grants. Grant removal never deletes files and does not change task cwd or artifact publication.

Tree/cache and filename presentation adapted from [Lanzgale/dsh-file-browser](https://github.com/Lanzgale/dsh-file-browser/tree/4c1fa36d479833e1df36f4cf2cfde98c47887858), MIT. See `LICENSE.txt` and `source-manifest.json`; both are included in desktop distribution. DSH's global DOM hooks, unrestricted server access and editing are replaced by BOAI's typed host callbacks.
