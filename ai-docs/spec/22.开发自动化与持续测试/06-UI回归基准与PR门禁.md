<!--
[OUTPUT]: 2026-10-29 PR视频使用原生附件，独立发布环境、固定CLI及上传失败边界与源码同步。
[INPUT]: 2026-10-28用户要求完整迁用Magpie Test与UI preview。
[OUTPUT]: 工程Test与DeepSeek自动预览；固定PNG基准及候选晋升退出PR流程。
[OUTPUT]: worktree交付后按AGENTS合并或归档再回收，不以自动合并已启用冒称实际合并。
[OUTPUT]: 根目录UI_TEST_CI.md提供现行流程的日常使用说明。
[POS]: 第22组现行CI合同；旧流程与证据归10，实际运行归03。
[PROTOCOL]: 变化同步Header、.folder.md、开发skill及Actions。
-->
# Test 与 UI preview

日常使用、常见状态与配置入口见 [UI_TEST_CI.md](../../../UI_TEST_CI.md)，与开发skill和本合同同步维护。

2026-10-28用户明确要求照搬Magpie两条工作流，只作BOAI技术栈适配。本文替代旧截图基准更新、用户本地效果确认和独立晋升门禁；历史保留在[10](./10-旧截图基准流程历史.md)。

1. `Test`：PR/main/manual触发。PR新提交取消旧运行，main已启动运行完成。BOAI在macOS执行类型、lint、构建和全部Vitest；先构建CLI产物再执行集成测试；Required checks沿原名称汇总工程检查，不读取PNG或候选来源。
2. `UI preview`：自动检测UI文件或ui-preview标签；DeepSeek按diff和实际页面规划操作，运行真实Electron并截图，交互时录mp4；截图及原始mp4保存在ui-previews分支，录屏通过GitHub CLI上传为原生视频附件并更新PR描述固定块。使用原独立测试数据，用户数据不参与。
3. `detect/record/publish`职责和权限按上游分开，record无仓库写权限，publish不运行PR源码。附件上传凭据UI_PREVIEW_UPLOAD_TOKEN仅存独立ui-preview-publish环境，默认Actions令牌不能上传；缺配置或上传失败显式失败并保留截图与下载，不能把raw链接称在线播放。预览流程成功不代表人工审美评价或业务验收。
4. 不再创建/晋升截图基准，不再要求用户先本地确认效果。已有本地BDD、截图工具、测试源码和历史结果保留；不恢复全量桌面BDD到工程Test。

固定上游、文件映射、配置与本地命令见[预览说明](../../../.github/ui-preview/README.md)。只改BOAI启动/fixture/页面/工程命令，以及保留现有Required checks名称；不加AI评分或基准批准系统。

任务收尾遵守AGENTS.md“worktree不遗留”：实际合并，或最终提交以`archive/*`标签存档后，删除本地任务worktree及分支，专用cargo target一并回收；编排会话负责subagent派生目录，保留例外须在最终回复点名路径与原因。归档不授予CI或合并资格，也不删除共享缓存与需保留数据。
