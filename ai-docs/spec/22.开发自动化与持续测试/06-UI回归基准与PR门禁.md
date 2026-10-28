<!--
[INPUT]: 2026-10-28用户要求完整迁用Magpie Test与UI preview。
[OUTPUT]: 工程Test与DeepSeek自动预览；固定PNG基准及候选晋升退出PR流程。
[POS]: 第22组现行CI合同；旧流程与证据归10，实际运行归03。
[PROTOCOL]: 变化同步Header、.folder.md、开发skill及Actions。
-->
# Test 与 UI preview

2026-10-28用户明确要求照搬Magpie两条工作流，只作BOAI技术栈适配。本文替代旧截图基准更新、用户本地效果确认和独立晋升门禁；历史保留在[10](./10-旧截图基准流程历史.md)。

1. `Test`：PR/main/manual触发。PR新提交取消旧运行，main已启动运行完成。BOAI在macOS执行类型、lint、全部Vitest和构建；Required checks沿原名称汇总工程检查，不读取PNG或候选来源。
2. `UI preview`：自动检测UI文件或ui-preview标签；DeepSeek按diff和实际页面规划操作，运行真实Electron并截图，交互时录mp4；发布到ui-previews分支并更新PR描述固定块。使用原独立测试数据，用户数据不参与。
3. `detect/record/publish`职责和权限按上游分开，record无仓库写权限，publish不运行PR源码。预览流程成功不代表人工审美评价或业务验收。
4. 不再创建/晋升截图基准，不再要求用户先本地确认效果。已有本地BDD、截图工具、测试源码和历史结果保留；不恢复全量桌面BDD到工程Test。

固定上游、文件映射、配置与本地命令见[预览说明](../../../.github/ui-preview/README.md)。只改BOAI启动/fixture/页面/工程命令，以及保留现有Required checks名称；不加AI评分或基准批准系统。
