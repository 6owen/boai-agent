<!--
[INPUT]: 本轮渠道空态、标题与ScrollArea源码及真实开发Electron的官方JSON、原生截图和trace。
[OUTPUT]: 四项桌面通过、综合旧字段失败、两项并行流前提不满足及等待候选失败分批留证；57项模块、类型/renderer ESLint与源码构建通过。
[POS]: 2026-10-15渠道空态与滚动统一审阅入口；现行合同16组03 §13、实际进度02 §7.20。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->
# 渠道空态、标题与滚动统一

无渠道与空消息使用全局`IllustratedEmpty`，取消虚线说明框。空渠道和正常会话共用`ConversationHeaderLayout`；主聊天与渠道聊天共用`ScrollArea`，原阅读ref、分页和滚动事件仍指向真实viewport。顶部保留正文渐隐，列表Popover和主聊天草稿保持。

| 实际批次 | 结果 |
| --- | --- |
| [首批5场](first-report/index.html) | 4通过、1失败。渠道单层详情/草稿、无渠道与空消息、万条历史/旧消息/重启位置/清理、空更早页后长回复跟随通过。综合单聊场景在寻找旧字段“职责简介”时失败，当前实际字段为“员工职责”，未进入该场景的滚动步骤。 |
| [并行流2场](streaming-report/index.html) | 两场均在准备时未读到`READING_START_A/B`而失败，尚未执行完成次序、分页竞争及反向阅读断言。 |
| [只读等待候选复验2场](streaming-recheck-report/index.html) | 增加对实际会话正文的15秒轮询仍失败，两场均未越过准备。该测试候选已撤回，原失败与原件保留；未改后端行为。 |

并行流未就绪的代码依据：现行`service.ts`对普通本人聊天附加`manageAutomation`；Mastra引擎将`task || !!ctx.manageAutomation`的输出缓冲至最终步骤结束。这两项旧用例让SSE保持未结束，同时要求公开正文已经出现，与当前发布行为不符，不能靠等待修复。本次没有把该前提失败记为滚动通过，也没有扩大为自动化/消息发布行为修改。

新增空态检查实测：标题高度52px、字号14px，标题与正文重叠16px；插画中心与视口中心误差小于2px，mask渐隐存在；主区真实滚动时标题位置不变。已查看以下原生完整截图：

- [无渠道空态](first/scenarios/de9faf387df649ef32b5-2c9536f6d2bbd0b8dbf2-retry0-repeat0-NI3Zzn/008-渠道空态-共享插画与悬浮标题.native.png)
- [空消息与ScrollArea](first/scenarios/de9faf387df649ef32b5-2c9536f6d2bbd0b8dbf2-retry0-repeat0-NI3Zzn/010-渠道空消息-共享空态与ScrollArea.native.png)

工程检查：`pnpm typecheck`、4个变更renderer TSX的ESLint、`pnpm build`通过；阅读UI/阅读领域/服务阅读3文件57项模块测试通过。构建保留既有大chunk提示。首次编辑等待候选的脚本因匹配到3处而触发断言，写入前退出；随后只对两个所需步骤应用，复验后完整撤回。BDD生成与`git diff --check`通过。

隔离数据和模型协议均为本地夹具，未连接真实渠道或外部模型。报告缺运行前完整源码/build manifest，不补造；未运行全仓库、发行包或长期资源验收，技术检查不代替人工视觉认可。官方JSON、截图、trace和各原批次结果分别保留，不合并成一次全绿。
