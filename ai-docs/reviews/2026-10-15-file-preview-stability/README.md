<!--
[INPUT]: 用户自动切版选择、VS Code/GitHub官方资料和BOAI固定文件预览。
[OUTPUT]: 来源有据的设计适配与本次实际验证记录；不复用旧供应商或安装包成绩。
[POS]: 2026-10-15文件预览稳定性审阅。
[PROTOCOL]: 修改时同步Header并上浮检查所属.folder.md。
-->
# 文件预览稳定阅读与交付自动切版

## 参考对象

2026-10-15读取官方文档并检查VS Code源码。

- [VS Code Inline chat](https://code.visualstudio.com/docs/chat/inline-chat)：选区约束当前编辑器上下文，局部修改通过inline diff及Keep/Undo审阅；复杂任务进入完整Chat。
- [VS Code Review and revert agent changes](https://code.visualstudio.com/docs/agents/run/review-code-edits)：按执行方式提供Changes、文件diff和checkpoint/Git回退。新agent harness会直接保存变更；不能笼统描述成“接受前不落盘”。
- [VS Code固定源码：文档身份](https://github.com/microsoft/vscode/blob/50be8d6e50987c11bf6a016ef554b96730094cbc/src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingModifiedDocumentEntry.ts#L124)：复用现有textEditorModel，并建立originalModel快照。
- [VS Code固定源码：应用增量](https://github.com/microsoft/vscode/blob/50be8d6e50987c11bf6a016ef554b96730094cbc/src/vs/workbench/contrib/chat/browser/chatEditing/chatEditingTextModelChangeService.ts#L287)：通过modifiedModel.pushEditOperations应用编辑；原版用于diff。仅研究设计，没有复制这些实现代码。
- [GitHub PR分析](https://docs.github.com/en/copilot/tutorials/explore-pull-requests)：选择diff行并Ask about this diff，在旁边的会话中分析，文件变更单独审阅。

## BOAI适配

聊天进度不再清空并挂载文件查看器。固定版本在后台核源后仍复用同一正文/字节；真实失效才撤下。文本选区/滚动/源码模式、PDF/Office内部状态和diff不随普通changed事件重建。

本次浮层请求完成交付后自动查看新版本一次；只看已受理请求的真实Work/Run及产物。执行中发布的文件不提前切换，失败/取消/未知和无文件分析不切换。附件原件保持；旧版和文本diff仍可查看；查看不等于采用。用户回看旧版、普通聊天产生其他新版本和重启恢复历史请求都不触发抢回。多个独立产物需明确选取。

## 实际验证

桌面使用隔离Electron、离线模型协议及真实工具/文件/事务；本轮不调用真实供应商、不制作安装包。后台事件探针只发送changed通知、延迟真实IPC读取，不替代宿主业务或内容。


| 检查 | 实际结果 |
| --- | --- |
| 相关模块 | 4文件67项通过：固定来源/回执、执行中或失败不切版、多产物选择、最新家族版本与无文件分析 |
| 类型 / 变更renderer ESLint / 源码构建 / BDD生成 / diff空白 | 通过；构建既有chunk大小提示保持 |
| 首批Electron | 11项中8通过3失败，185秒；长文滚动/选区/源码模式、PDF/DOCX/XLSX/PPTX节点保持、代码/附件自动切版与回看不抢回、未知重启恢复通过 |
| 定向补充Electron | 3项全部通过，20秒；其他入口新版保持旧阅读、关闭浮层后的自动切版与同家族diff后台复核、清理后的迟到回复隔离 |
| 构建身份 | 两批运行前后各核对465份dist文件hash，均无变化 |
| 原证据 | 首批89份、补充批20份资源由报告生成器逐字节核验；每批原件/全窗口原生PNG/Trace保留，实际数量以生成报告为准 |

首批3个失败均在旧场景准备阶段寻找2026-10-10已退役的聊天卡片“要求修改”按钮，未到达diff/清理目标；没有修改生产来恢复旧按钮。两项Lody场景改用当前文件浮层准备真实第二版；其他入口独立发布以原宿主reviseArtifact请求准备并验证旧版保持。旧“新版发布…采用重启”整条历史场景仍记录失败，本次不宣称退役采用UI的完整流程通过。

初次类型检查有两个测试夹具声明错误（最小Work夹具断言和不存在的missing状态），修正为显式unknown夹具/真实unavailable枚举后最终通过。首批失败和原图不覆盖。技术通过不等于用户视觉认可，也不构成真实供应商或发行包认证。

- [首批完整报告，含3个失败](desktop-report/index.html)
- [定向补充完整报告](rechecked-report/index.html)
- [交付后实际自动显示第2版](desktop/scenarios/986cd38f4e206af421fb-2253ccce2baad4a15ceb-retry0-repeat0-iO18aB/017-本次修改交付后自动预览新版.native.png)
- [后台核源后长文选区与滚动保持](desktop/scenarios/986cd38f4e206af421fb-0a8d801a6b563554c04c-retry0-repeat0-arqSWm/004-后台复核保留长文源码选区与滚动.native.png)
