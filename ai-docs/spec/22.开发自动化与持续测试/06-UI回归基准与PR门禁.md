<!--
[OUTPUT]: 2026-11-13 Test接固定三项UI行为与原件；预览完成度/source SHA/当前PR核对，部分媒体保持失败。
[OUTPUT]: 2026-10-29用户要求git cpf显式快速合并入口，必要时临时解除并恢复管理员检查，不修改普通门禁。
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

2026-10-29用户明确要求 `git cpf` 作为紧急合并命令。`scripts/git-cpf.mjs`提交已暂存改动（或使用已有提交），通过分支/PR和精确head合并，不等待CI。当前clone安装local alias，main调用时生成专用远程分支；不强推、不自动暂存、不复制未提交内容。普通开发仍遵循下述Test/UI preview合同，不因CI失败自动调用此入口。

该命令在GitHub拒绝管理员直接合并且classic保护启用了enforce_admins时，记录原配置，仅临时关闭该标志，并在结束时恢复读回。失败或可捕获中断沿finally恢复；无法恢复及不可捕获中断留下Git公共目录中的持久恢复记录，用 `git cpf --restore-protection` 处理。原检查结果保留，Ruleset/冲突/权限错误不通过删除其他规则绕过。合并与上线、测试通过分别报告。

本次命令验证：真实隔离Git仓库配合受控GitHub传输的10项测试通过，覆盖暂存范围/字面提交说明、已有提交、失败/中断后恢复、恢复失败后的持久补救、head漂移/冲突、权限不足和子目录alias；类型检查、Node语法检查与diff格式检查通过。初轮两处测试问题为Git状态输出trim与Git自身拦截`--help`，已改为核实际未暂存文件并使用`-h`；缺少脚本类型声明也已补齐。未用该新命令在真实GitHub上执行试验性合并；此前PR64的临时管理员例外与恢复成功是人工命令证据，不能替代本脚本的云端端到端验证。

2026-10-28用户明确要求照搬Magpie两条工作流，只作BOAI技术栈适配。本文替代旧截图基准更新、用户本地效果确认和独立晋升门禁；历史保留在[10](./10-旧截图基准流程历史.md)。

1. `Test`：PR/main/manual触发。PR新提交取消旧运行，main已启动运行完成。BOAI在macOS执行类型、lint、构建、固定三项UI行为和全部Vitest；先构建再执行运行时检查；Required checks沿原名称汇总，不读取PNG或候选来源。
2. `UI preview`：自动检测UI文件或ui-preview标签；DeepSeek按diff和实际页面规划操作，运行真实Electron并截图，交互时录mp4；截图及原始mp4保存在ui-previews分支，录屏通过GitHub CLI上传为原生视频附件并更新PR描述固定块。使用原独立测试数据，用户数据不参与。
3. `detect/record/publish`职责和权限按上游分开，record无仓库写权限，publish不运行PR源码。附件上传凭据UI_PREVIEW_UPLOAD_TOKEN仅存独立ui-preview-publish环境，默认Actions令牌不能上传；缺配置或上传失败显式失败并保留截图与下载，不能把raw链接称在线播放。预览流程成功不代表人工审美评价或业务验收。
4. 不再创建/晋升截图基准，不再要求用户先本地确认效果。已有本地BDD、截图工具、测试源码和历史结果保留；不恢复全量桌面BDD到工程Test。

固定上游、文件映射、配置与本地命令见[预览说明](../../../.github/ui-preview/README.md)。只改BOAI启动/fixture/页面/工程命令，以及保留现有Required checks名称；不加AI评分或基准批准系统。

## 2026-11-13 最小 UI 验证增量

用户要求保持本机Codex开发，优先完善已有UI验证。采用原Playwright BDD、Desktop和离线夹具，不接入新的开发运行器。`pnpm test:ui:behavior`在构建后仅选择`@ui-behavior`三项生产UI场景：会话草稿跨页面/会话往返的隔离、明暗设置经UI保存并在重启后保持、工具开始页切换任务和知识资料且草稿保留。

脚本核对原始Playwright报告，三项必须各实际成功一次；缺场、额外/重复、跳过、重试、全局错误、缺报告及进程非零均失败。`.local/ui-behavior/`保存报告、汇总、截图和trace，Test上传`ui-behavior`附件。截图只作为证据；这三项不冒充所有UI/真实模型或新功能专门验收。本地不默认启动GUI，选场可用`pnpm test:bddgen`及`pnpm exec playwright test --grep @ui-behavior --list`。

UI preview沿原detect/record/publish和权限隔离。DeepSeek关闭思考作录制规划，UI计划须有有效页面、步骤和截图；无效/空UI计划不能用无关截图兜底并称成功。报告记录完整source SHA、计划/完成/失败的场景与步骤；未完成、操作错误或产物缺失保持失败，已有媒体可供定位并显示部分完成。录制完整只代表计划执行完成，功能正确性看Test，主观效果由人审阅。

发布时核对报告SHA、当前开放PR及写入前head；旧提交不覆盖新正文，当前不再有UI变化时清除旧预览。开放PR按提交保留媒体，避免旧发布删除新正文引用的产物；关闭PR在后续发布清理。保留作者正文及原视频附件路径，部分/失败与完整结果分别报告。UI preview仍不是独立required context，固定行为已纳入Test；不改变分支保护名称或启用管理员例外。

detect/record/publish的可信脚本统一checkout本次workflow的`github.sha`，PR应用另按检测head读取；main推进不会让同次运行混用不同版本的录制/发布规则。

源码及本批实际验证统一见[03末节](./03-实施步骤与验收.md)。

任务收尾遵守AGENTS.md“worktree不遗留”：实际合并，或最终提交以`archive/*`标签存档后，删除本地任务worktree及分支，专用cargo target一并回收；编排会话负责subagent派生目录，保留例外须在最终回复点名路径与原因。归档不授予CI或合并资格，也不删除共享缓存与需保留数据。
