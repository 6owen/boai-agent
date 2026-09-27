# 主题、外部 Agent 与自动化实现

日期：2026-09-27。承接 [首批 B1/B2/S1/F1](./15-B1-B2-S1-F1首批重构实现.md)，按用户本轮顺序实施外观、外部任务和本地定时执行。下列是本轮实际交付；第 3/4/5 组的设计文档仍包含后续扩展目标。

## 已交付入口

| 入口 | 实际行为 |
| --- | --- |
| 设置 → 外观 | 浅色、深色、跟随系统；分别记住两套配色；BoAI 默认、Nord、Catppuccin Mocha/Latte；背景导入、更换、移除及不透明度 |
| 设置 → 外部 Agent | 保存 ACP v1 启动项，显式测试启动与握手，查看外部程序名称与版本 |
| 员工 → 编辑 → 执行后端 | 模型 API 或外部 ACP 任务；原员工迁移为模型 API，保留 ID、连接、模型与历史 |
| 外部员工单聊 | 点击“执行外部任务”；回车仅换行；一次性协议审批、停止、运行报告、选择文件发布到会话 |
| 定时任务 | 创建、编辑、启用、暂停、删除、立即执行、停止本次、查看执行记录与结果会话；每日/每周和 IANA 时区 |

没有创建用户真实的自动化、使用真实模型密钥、自动安装外部 CLI 或替用户登录。测试使用独立临时数据、测试 ACP 进程和本地模型协议服务。

## 外观实现

主进程 `AppearanceStore` 是唯一持久化权威。配置位于 `v2/appearance/settings.json`，图片位于其 `assets/` 目录。Zustand 只保存界面镜像、即时预览和待保存补丁；不使用 localStorage 保存主题配置。

- 配置修订号负责并发写，独立事件序号负责系统外观变化。写入经过串行队列、临时文件和原子替换；冲突读取新版本后只重新合并待提交字段。
- preload 带启动快照；在 React 首次渲染前设置 HTML 的主题、颜色变量与 color-scheme。窗口底色同步使用主进程解析结果。
- 全局语义变量覆盖页面、表单、弹层、Markdown、状态、边框和焦点；Tailwind/shadcn 使用同一套语义名称。现有 React 业务控件继续复用。
- Base46 是静态转换，来源修订为 `7df2bd89295db00b649cbc49bdf6fe5a1cc5df3b`。原始 base_30/base_16、来源与许可证保存在 `src/shared/appearance/`。未执行 Lua。文字颜色有对比度校正，主题常规正文与次要文字的基础表面对比度测试 ≥ 4.5。
- PNG/JPEG/WebP 先核对内容签名和尺寸，再实际解码；10 MiB、边长 8192、3200 万像素上限。Electron nativeImage 不解码 WebP，因此 WebP 使用临时隔离的 Chromium renderer 解码，随后关闭。
- 图片由 `boai-asset://appearance/<assetId>` 受控提供；拒绝路径穿越、非普通文件和符号链接。源图片删除后仍可显示。图片透明度与文字、控件透明度分离，面板保留遮罩。
- business 与 appearance 各自登记未保存状态，切页刷新待保存补丁，关闭时先请求保存外观；失败才保留离开提示。
- 未来版本配置只读并保留原文件。图片丢失或未知主题回退到默认外观并显示说明。

## 外部 Agent 实现及边界

固定适配器是 ACP v1 stdio，依赖 `@agentclientprotocol/sdk 1.5.0`。使用 SDK 消息解析和协议握手，不解析任意 CLI 的自然语言 stdout。用户保存绝对可执行路径与参数数组，宿主记录可执行文件摘要；任务前检查摘要与握手名称/版本。保存配置不启动进程；测试只启动、握手并退出，不发送任务。

旧员工补上 `mastra-model` 标识并递增配置版本，首次迁移前生成 `boai.sqlite.before-backends-<timestamp>` 快照。外部任务不要求 BYOK，不偷偷借用其他员工模型；仅开放显式 task 阶段，decision/chat/memory、群参与和定时自动化均不开放。切换后端须先解除不支持的 BoAI Skills/知识/命令配置和群成员关系。

外部任务每次使用新进程、新 ACP session 和独立的 `external-workspaces/<employee>/<conversation>/runs/<run>/` 目录。程序自有 HOME 默认放在 `external-runtime/`，也可由用户显式选择现有登录与用户配置。只传入必要环境项，不传整个宿主环境或模型 API Key。BoAI 的私有记忆、历史和资料不会由适配器自动拼入外部任务。

外部程序具有主机权限，**不是操作系统沙箱**。启动配置明确要求用户确认这个范围；宿主只审批协议发送的请求，不能拦截程序直接使用的原生工具、网络或文件访问。没有宣称 `cwd`、独立 HOME 或禁用客户端 filesystem/terminal 桥就构成安全隔离。现阶段支持 POSIX 受管进程组取消，Windows 外部任务未开放。

- 最多两个外部任务并发，每会话一次；15 分钟期限、2 MiB 总协议/错误输出上限。
- 只接受 `allow_once` 权限选项；拒绝/取消不继续授权。取消发送协议请求并终止本次受管进程组，迟到结果不提交。
- 私有 thought 不公开；工具进展写入活动记录。ACP `end_turn` 才提交“外部运行报告”，不会把流中的所有说明冒称为最终答案。
- 记录 profile 修订、程序摘要/版本、session、外部调用次数；模型 token usage 未知时不填 0。
- 任务完成后，用户选择文件，经已有受控发布逻辑验证和复制后登记到会话。不会自动发布任意外部路径。
- 外部程序自己的登录、历史、记忆和工具策略由它自身管理。清除 BoAI 记忆不代表清除了外部记录。

协议测试进程已验证真实启动、握手、任务、审批拒绝、取消、新 session、环境过滤、文件发布和重启不重放。**尚未使用用户真实登录态验证某一家 Codex/Claude/Cursor/OpenCode 程序**；普通 CLI 只有实际支持 ACP 或使用对应 ACP 适配程序时才能配置。专用 SDK、A2A 与 MCP 不是这次实现的一部分。

## 自动化实现及边界

唯一循环时钟使用现有 `@mastra/core 1.71.0` 原生 schedules。固定 evented workflow `boai-automation-dispatch-v1` 只把触发交给产品准入层。使用独立 `automation-mastra.sqlite` 持久化框架数据；不会直接调 `agent.generate()` 绕过员工和会话调度。

定义、修订、同步状态、触发记录、关联消息/turn/run、结果 ID 和用量摘要保存在产品 SQLite。保存先提交 pending 定义，再同步 native schedule；失败显示“尚未启用/同步失败”。启动检查绑定和旧触发记录。

- 每日/每周、指定时区，显示未来五次；Croner 仅用于无计时器的时间预览。真实到期触发由 Mastra scheduler 测试验证。
- 每次先持久化 occurrence，再经原有 `sendMessage`/GroupScheduler 进入单聊或群。界面显示“定时任务 · 名称”，不会伪装成用户发送。
- 成员配置、连接和会话权限摘要在保存及执行准入/阶段边界核对。变更后需重新编辑保存；当前只支持模型 API 员工且命令权限必须关闭。
- 同一计划一次运行、全局最多两次；会话已有用户任务或达到并发限制时记录 skipped，不抢占当前用户任务。当前策略是**跳过，不排队**。
- 10 分钟以内最多补一次；超过窗口记录跳过。春季不存在的本地时刻跳过，秋季重复时刻以本地日历键去重。手动请求 ID 跨修订去重，不改变下次计划时间。
- 复用群轮次原有调用、输出与五分钟轮次预算，另有十分钟 occurrence 期限。暂停计划不停止当前执行；“停止本次”仅针对仍属于该 occurrence 的轮次。
- 结束状态、结果和用量在轮次与维护阶段结束后更新。失败保留已完成部分，不自动重试模型。
- 重启时未完成 occurrence 标为 interrupted，不重发原任务。原生有触发而产品无执行记录时标为 needs_review，不盲目重放。
- 可选系统通知不含任务正文或结果，点击打开原会话。当前采用持久去重的最佳努力通知，不能保证系统通知恰好送达一次。

这次完成 A1 和 A2 的本地群接入、基本恢复、备份和结果记录。没有实现效果账本、可重试投递 outbox、应用外常驻服务、业务多步骤模板或外部 Agent 自动执行。应用真正退出、休眠、关机时不运行，也不唤醒设备。

## 备份与恢复

导出期间冻结外观写入，并暂停 native workers；正在运行的任务/外部测试会阻止备份。备份包含产品库、native 调度库（如存在）、员工/资料/产物、external-workspaces 以及当前外观配置与被引用图片。外部运行时 HOME、登录凭据及模型密钥不复制。任何子步骤失败则删除本次不完整导出，不返回成功。

备份中的产品元数据写入 restorePending。恢复后暂停所有计划，再同步原生调度，避免副本启动后重复执行。RESTORE.txt 说明目录清单、旧备份外观处理和凭据重新配置。恢复仍是关闭应用后复制完整备份，没有新增一键恢复界面。

## 验证证据

- 类型检查与构建通过。
- 120 项 Vitest 测试：原 109 项回归、外观版本/图片/回退/对比度、ACP 进程与权限、实际原生定时触发、手动幂等、遗漏/过期/并发/撤权、群成员决策、备份恢复暂停。
- 5 条真实打包 Electron 流程：原群聊、历史、升级、S1 文件环境，以及新增主题/PNG-WebP/系统事件/窄窗/200% 缩放/外部文件/自动化/备份/重启链路。
- 测试使用独立临时目录及协议测试服务。系统明暗变化通过 nativeTheme 事件模拟，没有改用户系统外观设置。
- 本地产物 `release/mac-arm64/BoAI Agent.app`；未获得有效 Developer ID 证书，因此属于本地未签名测试包。
- 截图：[深色外观](../../images/theme-external-automation/appearance-dark.png)、[窄窗外观](../../images/theme-external-automation/appearance-narrow.png)、[200% 缩放](../../images/theme-external-automation/appearance-zoom.png)、[自动化结果](../../images/theme-external-automation/automation-results.png)。

依据：[Mastra schedules](https://mastra.ai/reference/schedules/overview)、[ACP v1 初始化](https://agentclientprotocol.com/protocol/v1/initialization)、已安装包的类型及源码、[Base46 固定修订](https://github.com/NvChad/base46/tree/7df2bd89295db00b649cbc49bdf6fe5a1cc5df3b)。
