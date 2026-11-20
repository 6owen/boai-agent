<!--
[INPUT]: 05909997 的 packages/runtime/src/modules、宿主调用点与相关测试。
[OUTPUT]: 25 个运行时业务域的代码质量判断和抽查入口。
[POS]: BOAI 项目代码审查中的运行时业务模块分册。
[PROTOCOL]: 本文件变化时同步更新 Header，并检查所属目录 .folder.md。
-->

# 运行时的 25 个业务模块

审查基线为 `05909997`。逐项核对了 `packages/runtime/src/modules/` 下全部 25 个一级业务域。下表路径均相对该目录，列出实际审阅的入口和判断依据。该层共有 210 个受 Git 管理的 `.ts` 文件，另有演示文稿 worker 等 JavaScript 实现。每个域抽查关键路径，表格没有逐文件、逐分支覆盖的含义。

整体上，任务、交接、知识、团队等核心域普遍使用版本和持久回执保护重复调用。更容易出问题的是一个动作需要多个模块收尾的地方。例如，通讯录认为员工已删除，渠道模块却仍保留可参与唯一性检查的绑定。另一个值得优先处理的边界是业务读取持有 SQLite 写事务的成本。具体影响与验收条件见[运行时问题清单](02-runtime-flows.md)。

| 业务域 | 实际审查入口 | 源码质量判断 |
| --- | --- | --- |
| agent-state · 员工状态 | `agent-state/lifecycle.ts:14`，`agent-state/state-service.ts:59` | 清历史会按来源清理情绪、成长及旅行记录，读旅行时也会核对材料版本。清理需要遍历多个完整集合，大库耗时还需测量。 |
| application · 应用操作 | `application/application-service.ts:128`，`application/task-operations.ts:85` | 外部操作统一检查版本、请求指纹、调用身份。内部进度的删除分支可以触及人工委派，详见 RT-02。 |
| automations · 定时与员工任务 | `automations/schedule-policy.ts:59`，`automations/employee-task-service.ts:222`，`automations/history-deletion.ts:19` | 时区预览与触发共用日历匹配。常规删除有版本、在途检查、删除记录与交接清理，可作为 RT-02 修复参照。 |
| backends · 本机后端配置 | `backends/profiles.ts:35`、同文件第 45–60 行 | 文件指纹、草稿验证容量和保存版本可追踪。输入校验、路径解析、插件一致性和修订计算压在 `prepare` 一行，后续新增协议时难以逐条核对规则。 |
| bobo-collaboration · 组织协作 | `bobo-collaboration/service.ts:68`、第 78–91 行，`bobo-collaboration/receipt.ts:8` | 有请求指纹，成员核对版本和清理状态，回执按来源清理状态隐藏正文。静态证据支持这些边界，实际多人协作质量需真实任务评估。 |
| browser · 浏览器租约 | `browser/session.ts:40`、第 75–107、191–199 行 | 已提交动作失联后查询原动作，保留未知结果。首次获取租约与退出的时间窗口见 RT-04。 |
| canvas · 画板运行时 | `canvas/service.ts:61`、第 100–107、131–149 行 | 调用、取消与导出核对作用域、版本、大小和内容哈希。保留外部修改的画板是正确行为，该回执向上层传播时会放大失败范围，见 RT-01。 |
| channels · 渠道绑定 | `channels/channel-service.ts:93`、第 118–180、235–265、350–356 行 | 发送状态可恢复为未知，按平台事件去重。员工删除和机器人解绑采用两套生命周期，详见 RT-03。 |
| collaboration · 协作调度 | `collaboration/task-admission.ts:16`、第 42–52 行 | 对独占命令设置排队屏障，共享工作区按 key 互斥；离队取消时会继续推进其他任务。实际多员工吞吐未测。 |
| contexts · 上下文交接 | `contexts/context-handoff-service.ts:99`、第 144–178 行，`contexts/context-handoff.ts:131` | 准备、投递和确认分别核对来源与目标，未确认的交接有明确状态；写事务内复核目标可防两个准备请求同时通过。 |
| conversations · 对话与队列 | `conversations/message-queue.ts:18`、第 32–44 行 | 队列动作绑定请求指纹和既定目标。取一个任务会话的队列仍先读取全部执行记录，再按会话和任务筛选，历史数据大时值得测量。 |
| desktop-activity · 桌面活动 | `desktop-activity/activity-service.ts:74`、第 183–210、359–374 行，`desktop-activity/activity-storage.ts:19` | 截图有私有文件、原子改名和启动核对。清理中断后缺少同一进程内可重试的文件列表，详见 RT-05。 |
| desktop-plugin · 电脑操作 | `desktop-plugin/service.ts:51`、第 96–132 行 | 调用使用独立取消控制器，释放执行锁，并在停用或退出时等待已登记调用。这里覆盖宿主生命周期，外部工具进程的具体行为另属插件包。 |
| employees · 员工生命周期 | `employees/contact-deletion.ts:73`、第 146–173 行 | 删除前核对身份、目录和关联记录，提交后单独做物理清理。恢复路径对一条记录的失败处理影响整个服务，见 RT-01。 |
| inbox · 待回复问题 | `inbox/user-question.ts:13`、第 33–48、69–84 行 | 回复前核对原消息、负责人、轮次与问题版本，定时来源单独复核。同一轮多问题完成状态需要联合判断，适合保留集成用例。 |
| materials · 材料上传 | `materials/material-upload.ts:21`、第 55–88 行 | 分块顺序、重复字节、大小和总哈希都有核对。回收先阻止新增使用，再等待已受理的准备过程，期间继续计入容量。 |
| media · 生图 | `media/image-service.ts:83`、第 105–124 行 | 输入从实际字节检查格式，输出按流限制，并复查生成期间配置是否变化。断线保留未知结果，可减少重复计费。未调用真实提供方。 |
| memory · 记忆提供方 | `memory/user-memory-provider.ts:45`、第 84–124、126–150 行 | 上次发送中断会标记未知；外部提供方的旧配置在启动时暂停，避免在来源撤回能力不足时静默恢复。这里只评价提供方开关和同步账本，回忆效果需要独立评估。 |
| presentations · 演示文稿 | `presentations/presentation-project.ts:70`，`presentations/worker-client.ts:12`，`presentations/alma/renderer.worker.mjs:125` | 读取版本时比较指针、项目状态、成品文件哈希。渲染有截止时间和子进程结束确认。未调用办公软件检查输出。 |
| profile · 个人资料与活动统计 | `profile/profile-repository.ts:78`，`profile/profile-activity.ts:22`、第 77–96 行 | 对缺失用量和不完整区间有专门表达。整库读取、逐消息日期格式化和重复遍历发生在写事务内，见 RT-06。 |
| resources · 技能与知识 | `resources/knowledge-management.ts:63`、第 76–114、273–284 行，`resources/resource-cleanups.ts:30` | 复制前后两次核对数据源，区分提交前失败与提交后投影失败，受管副本可登记清理。此次深入知识写入与清理，第三方市场没有在线联调。 |
| sources · 数据源与检索 | `sources/source-oauth.ts:105`，`sources/source-oauth-operations.ts:12`，`sources/web-search-service.ts:93`、第 128–160 行 | OAuth 回调检查路径和 state，搜索服务调用前后检查插件可用性。草稿连接测试仅接受 DeepSeek；其他提供方走已保存服务的测试入口。 |
| teams · 团队创建 | `teams/team-files.ts:49`、第 82–125 行 | 使用暂存目录、所有权文件和持久检查点。恢复只接受匹配的已写内容，清理前先检查全部目标，能保护用户自行修改的文件。 |
| workspace-tools · 预览和终端 | `workspace-tools/operations.ts:18`，`workspace-tools/preview-service.ts:56`，`workspace-tools/terminal-service.ts:164` | 静态预览与命令预览有不同的就绪条件。终端停止等待守护进程清理确认；工作区协议会把历史员工终端命令标为不可用。未启动真实终端。 |
| workspaces · 项目与工作区 | `workspaces/project-directory-service.ts:26`、第 55–74、76–119 行 | 切换前检查任务、版本与待决交接，已创建任务保留目录快照。旧会话无快照时会读取所有消息再寻找本会话最后输入，旧大库这个分支值得单独测量。 |
