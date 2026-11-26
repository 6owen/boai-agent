<!--
[INPUT]: OpenBot 的更新交互与 BOAI 的本机 Agent、任务结果及应用更新入口。
[OUTPUT]: 右上角 Sonner 通知分发、本机 Agent 启动检查及受管升级。
[POS]: ai-docs/implementation。
[PROTOCOL]: 变化同步本 Header、所属 .folder.md 与根 README 索引。
-->
# 通知中心与本机 Agent 更新

会话删除和清空、员工任务结果、定时提醒、BoAI 应用更新及本机 Agent 更新统一显示在应用右上角的 Sonner。桌面操作与宿主事件共用 `@boai/ui/sonner` 的 `notify`。宿主保留最近 200 条通知记录，仅投递当前进程产生的新通知，并按记录 ID 去重。点击「查看」进入原任务、定时结果或更新设置。定时任务已配置的系统通知仍由主进程按原策略提交。

「设置 → 模型连接 → 本机 Agent」显示检测到的当前版本和可用版本。每次应用进程启动且运行服务就绪后自动检查一次。发现新版本后，可从通知进入设置，在本机 Agent 的连接行确认安装。连接变化仅撤下失效的版本提示。保存本机 Agent 配置后静默刷新列表。当前版本取自通过连接测试或原生握手的程序，检查会核对保存的文件身份。未知程序和自定义 ACP 或第三方插件继续使用原维护渠道。

macOS 使用本机 npm，将 Codex、Claude Code、Pi 和 OpenCode 的稳定 npm 版本安装到 BoAI 的数据目录。更新请求绑定用户选择的连接和版本。安装关闭 npm 生命周期脚本，随后在独立目录核对程序版本及已有原生协议。应用保留原有程序与登录配置。连接版本在核对与数据库提交成功后切换，员工仍引用同一个连接。已运行或等待处理的任务会按现有保护阻止切换。

已有原生会话和自动化授权按原运行配置指纹判断，升级后续聊可能走已有历史交接，定时任务可能要求重新确认授权。连接至网关且依赖固定版本的 Pi、OpenCode 会显示可用版本及兼容提示。系统 CLI 和 BOAI 应用的 Sparkle 更新各自按原渠道管理。受管程序目录和通知文件属于本机配置；将业务备份迁到另一台机器时需要重新选择本机程序。

交互参考 OpenBot 的更新提示和重试路径，BoAI 使用现有工具栏、Sonner 和设置组件。 [OpenBot 更新展示](https://github.com/nightly-labs/openbot/blob/ac2738d04c84cac9fe3cb984ea14f359e71de301/packages/ui/src/features/provider-updates/provider-update.ts)
