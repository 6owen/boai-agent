<!--
[OUTPUT]: 2026-10-25源码链接随Workspace迁移更新，历史验证结论保持。
[INPUT]: 当前 BoAI 源码、boai-app 删除前历史、Craft 上游固定提交、Mastra 安装包与官方文档、针对性测试结果。
[OUTPUT]: 可复核的版本基准、代码事实、框架能力、差距、方案比较与研究限制。
[POS]: 自动化设计的事实与取舍依据；07 为目标方案，本文不将框架能力或计划冒充产品交付。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->
# Craft 与 Mastra 自动化调研

调研日期：2026-09-28。对应设计：[07-自动化产品与运行时设计](./07-自动化产品与运行时设计.md)。

## 1. 证据基准与范围

| 对象 | 本次核对基准 | 证据含义 |
| --- | --- | --- |
| boai-agent | HEAD `739b406e01a828198d43864e38eb2a06eaabfde4`，加当前工作区 | 多个运行时、UI、测试文件已有未提交修改；以下“当前代码”指实际读取内容，不等同纯 HEAD |
| Mastra | core `1.71.0`、libsql `1.23.3`、memory `1.32.1`、observability `1.18.1` | 读取已安装 package、embedded docs、类型及必要实现；没有升级依赖 |
| Croner | `9.1.0` | 当前用于产品 cron/预览，框架调度仍由 Mastra 驱动 |
| 本地 boai-app | HEAD `5c023b98` | 当前自动化已经退役；不能按历史 UI 文档认定仍能运行 |
| 本地删除前版本 | `3e23b73683cdd6a293aef8547d2d0593257bd567`，即 `c16a68ec^` | 用 `git show` 读取，没有切换分支或恢复旧代码 |
| Craft 上游 | [`3eac37be5eeee00d312239f21ce3b7c7db92502b`](https://github.com/craft-ai-agents/craft-agents-oss/tree/3eac37be5eeee00d312239f21ce3b7c7db92502b)，提交时间 2026-09-28 00:57:57 UTC | 与本地 fork 历史分开比较，使用固定提交避免 main 漂移 |
| 用户截图 | 本次提供的定时任务三栏界面 | 交互参考；没有据图推断其后端实现 |

研究依据优先级：当前源码和针对性测试 → 安装包类型/实现 → 安装包文档 → 官方在线文档 → 参考项目。旧规划中的“尚未实现”不覆盖当前源码。按仓库 Memmy skill 尝试查询历史记忆时服务返回 `fetch failed`，没有据此补造历史决策。

## 2. 当前 BoAI 自动化并非从零开始

### 2.1 文件与调用关系

| 文件/符号 | 已核对事实 |
| --- | --- |
| [automations.ts](../../../packages/shared/src/domain/automations.ts) | Definition、Input、Occurrence、Origin；目前频率 daily/weekly，固定 conversationId，notify 布尔值 |
| [automation-service.ts](../../../packages/runtime/src/modules/automations/automation-service.ts) | schema、cron、calendarSlot、定义/历史持久化、版本校验、并发/忙碌跳过、10 分钟窗口、恢复/备份 |
| [native-schedules.ts](../../../packages/runtime/src/modules/automations/native-schedules.ts) | `boai-automation-dispatch-v1` 固定 workflow；`schedule: []`；独立 LibSQLStore；startWorkers/stopWorkers/shutdown |
| [service.ts](../../../packages/runtime/src/service.ts)：构造 hooks、sendMessage、automationFingerprint、inspectAutomation | 自动化通过原有聊天调度；保存来源；检查模型员工、会话/员工配置，拒绝命令与 ACP；按 turn 聚合结果 |
| [group-scheduler.ts](../../../packages/runtime/src/group-scheduler.ts) | 成员独立判断、chat/task 分开、单轮结束与持久工作不同；定向接续有新 turn |
| [work-repository.ts](../../../packages/runtime/src/modules/collaboration/work-repository.ts) | 工作身份、SQLite 事务认领、根预算、父子/依赖、证据与停止树；重启中断 |
| [product-store.ts](../../../packages/runtime/src/adapters/storage/product-store.ts) | JSON records + 复合主键，提供读/比较/写一体事务；外层 write 是 upsert，不是条件认领 |
| [schedules/index.tsx](../../../apps/electron/src/renderer/pages/schedules/index.tsx) | 已有列表、搜索/筛选、新建编辑、立即运行、暂停删除、预览、历史、通知开关 |
| [main.ts](../../../apps/electron/src/main/main.ts) | 单实例锁、utility process 生命周期、系统通知、点击打开目标聊天 |
| [history.ts](../../../packages/runtime/src/modules/conversations/history.ts) | 清理会话内容时更新 occurrence 引用，保留触发身份 |

原生 workflow 的输出是 `dispatched: true`；它没有等待任务交付。因此“Mastra workflow 成功”和“自动化任务交付”本来就是两个阶段，后续 UI 与存储应显式区分。

### 2.2 本次实际运行的验证

在项目根目录执行现有 Vitest 测试的自动化子集：

```sh
pnpm exec vitest run tests/extensions.test.ts \
  -t 'native Mastra|automation claims|calendar keys|records missed|group automation'
```

结果：**1 个测试文件通过；5 项通过；2 项外部 Agent 测试因筛选跳过；耗时约 11.2 秒。** 未发起真实用户计划，测试使用临时数据、原生框架与 fixture engine。

| 用例 | 实际验证的意图 |
| --- | --- |
| native Mastra workflow schedules | 原生手动 fire 与真实到期扫描都进入产品 wrapper；输入的计划时刻和 runId 可关联 |
| automation claims once | 同一个手动 requestId 不重复投递，保留来源与结果；恢复备份的计划暂停 |
| calendar keys | 秋季回拨两个物理时刻得到相同本地分钟键；weekly cron 转换 |
| missed/stale/overlapping/revoked | 过期、旧版本、重叠、授权变化均留下跳过原因 |
| group automation | 两个员工独立判断，结果归入同一 occurrence |

另阅读已有 [extensions.feature](../../../tests/e2e/features/extensions.feature) 和 [extensions.steps.ts](../../../tests/e2e/steps/extensions.steps.ts)：场景涵盖手动运行、备份和重启后的记录。**本次没有重跑 Electron BDD，也没有据此声称真实 OS 定时/睡眠或新增设计已经验收。**

### 2.3 源码推导的重点缺口

下表是静态分析结论；除上面的既有测试外，尚未为这些缺口新增故障注入复现。应作为实施前的测试目标，而不是伪造的失败日志。

| 优先级 | 观察 | 产品影响与建议 |
| --- | --- | --- |
| 高 | `inspectAutomation` 使用初始 turnId 过滤 run/message | 后续委派/依赖接续产生新 turn 时可能漏归属；贯穿 occurrence 来源并按 Work 汇总 |
| 高 | `completed` 主要来自 turn.status | turn 可在没有业务交付时自然结束；以 WorkOutcome 与证据判断任务交付 |
| 高 | AutomationService 串行队列 + 内存 map 判断重复，再 `store.write` | 对当前单进程有保护，但不是持久条件认领；多实例或提交断点需要 SQLite 事务与稳定来源 |
| 高 | occurrence 持久化、sendMessage 事务、回填 message/turn 是分段的 | 崩溃后可能有消息但 occurrence 关联缺失；需要明确投递意图和对账，不能直接重跑 |
| 高 | cancel hook 可能调用 `cancelConversation` | 取消范围按聊天可能覆盖后来的独立工作；应按本次拥有的 work/run 取消 |
| 中 | active 集合不含 waiting_user，observe 不再持续追踪它 | 用户补充后缺乏明确的同次归属协议；需要带 occurrence 的继续操作和预算延续 |
| 中 | notify 为 boolean，且先持久化 notificationDelivered 再发事件 | 中途退出/系统不支持时可能没有真正提交通知；用应用内记录与 delivery 状态，不把布尔值当送达凭据 |
| 中 | 入场即 skipped/failed 的路径不都经过观察终结通知 | “失败也会通知”不能仅凭界面开关推断；应统一终结/待处理投递 |
| 中 | usage 只累加有值项 | 部分未知时展示的数字可能只是已知下界；沿用工作预算的 usageIncomplete 语义 |
| 中 | 同时存在自动化 10 分钟、Work 默认 5 分钟等上限 | 实际以更严格限制结束；界面应展示有效预算而非单一外层超时 |
| 中 | 单一 revision 进入日历去重键；指纹包含完整 connection 等对象 | 展示字段变更和执行授权耦合；细分编辑/执行/日程版本，授权只比必要配置 |
| 中 | 原生触发查询只取 100/1000 条，部分兜底解析 runId | 历史覆盖和版本依赖有限；分页、水位、记录不明状态及升级契约测试 |
| 中 | sync 失败主要靠保存或下次初始化再处理 | 定义持久化成功不代表定时能力健康；增加显式同步健康与有界配置重试 |
| 产品 | 普通 direct 会话按员工唯一复用 | 截图“每次新聊天”需要会话用途和新建用例，不能只加下拉框 |
| 文档 | 第 5 组 README 仍曾写“仅页面、未实例化 LibSQLStore” | 与源码冲突；本次仅修正相关导航/自动化事实，保留旧规划历史语境 |

## 3. Mastra 核验结果

### 3.1 安装版提供的组件

| 能力 | 核验依据 | 对 BoAI 的取舍 |
| --- | --- | --- |
| `mastra.schedules` | [安装 API 文档](../../../node_modules/@mastra/core/dist/docs/references/reference-schedules-overview.md)、[类型](../../../node_modules/@mastra/core/dist/schedules/schedules.d.ts) | 支持 agent/workflow 的 CRUD、pause/resume/run；使用 workflow 目标 |
| workflow schedule | [安装说明](../../../node_modules/@mastra/core/dist/docs/references/docs-workflows-scheduled-workflows.md) | 声明 schedule 使用 evented engine；需要支持并发更新的 storage |
| worker 生命周期 | [Mastra 类型](../../../node_modules/@mastra/core/dist/mastra/index.d.ts) | Electron library 模式继续显式 startWorkers/stopWorkers；不依赖 Studio 自动启动 |
| LibSQLStore | [安装类型](../../../node_modules/@mastra/libsql/dist/storage/index.d.ts) 和真实原生测试 | 已适用于现行薄 workflow；保留独立框架库 |
| suspend/resume | [安装说明](../../../node_modules/@mastra/core/dist/docs/references/docs-workflows-suspend-and-resume.md) | 可用于未来固定流程暂停；不是自动获得产品授权或安全恢复 |
| sleep/sleepUntil | [sleep 参考](../../../node_modules/@mastra/core/dist/docs/references/reference-workflows-workflow-methods-sleep.md) | 流程内部等待，不当周期计划注册/操作系统唤醒 |

官方在线 API 仍将 schedules 标为 Beta，升级不保证只在大版本变化。应锁定当前版本、把兼容依赖放在适配器里，并跑当前 native schedule 测试。[API 参考](https://mastra.ai/reference/schedules/overview)

官方也区分直接运行 agent、向 thread 发 signal、启动 workflow 三种路径。框架 threadId 不自动等于 BoAI conversationId，更不具备员工/群的授权含义。[Schedules 概念](https://mastra.ai/docs/harness/schedules)

### 3.2 已安装 scheduler 的实际顺序

读取 `@mastra/core/dist/scheduler-BDzlYR_I.js.map` 内 `src/workflows/scheduler/scheduler.ts`，与 [scheduler 类型](../../../node_modules/@mastra/core/dist/workflows/scheduler/scheduler.d.ts) 对照：

1. 默认每 10 秒扫描，启动时先扫一次；单批默认 100 条。
2. 读取 `nextFireAt <= now` 的计划。
3. 按实际当前时间计算下一次时间。
4. 用比较并交换推进 nextFireAt，并记录本次确定性的 runId。
5. 发布 workflow 开始事件。
6. 记录 trigger 的 published/failed；触发记录写失败会记录错误。

由此得到三个重要边界：

- 持久化了日程，不代表发布事件与产品受理处于同一事务；CAS 成功之后仍存在故障窗口。
- 多进程对同一 schedule 的竞争认领能力，不等于员工工具副作用 exactly-once。
- 停机后处理的是保存的旧 nextFireAt，再推进到现在之后；不是枚举全部错过时间，也不自动选最近一次。产品 10 分钟过滤可能跳过这条旧记录。

当前 wrapper 使用 `schedule: []` 选择 evented 路径，实际用户计划通过 schedules CRUD 创建；已有测试验证其在此安装版可用。解析 `sched_<scheduleId>_<timestamp>` 是版本相关兼容行为，即使官方 API 文档描述了 id 格式，也应集中封装，并优先使用原生 trigger 记录。

### 3.3 部署与持久执行不能混为一谈

Mastra 文档说明内置调度依赖持续存活的宿主与进程内事件分发；普通短生命周期 serverless 请求不能保有这个时钟。[Scheduled workflows](https://mastra.ai/docs/workflows/scheduled-workflows)

独立 worker 是一种部署拓扑，不会自动使用户电脑关机后的任务继续执行。若以后拆到服务端，还需设计持久事件传输、授权资源、凭据和调度所有权。[Workers](https://mastra.ai/docs/deployment/workers)

工作流暂停快照可供 resume 使用，但恢复会执行程序逻辑；副作用幂等、重新授权和用户审批仍是产品职责。当前仓库 G4 前不自动恢复工具的规则优先，不能因 SDK 支持 resume 就自动开启。[Suspend and resume](https://mastra.ai/docs/workflows/suspend-and-resume)

## 4. 本地 boai-app：历史可研究，当前引擎已删除

### 4.1 退役证据

本地 Git 历史有明确的分阶段删除：

| 提交 | 内容 |
| --- | --- |
| `c16a68ec` | decommission automation execution |
| `2ce115fe` | remove automation renderer |
| `78a3d8e7` | remove automation rpc contract |
| `964f1561` | detach automation from sessions and agents |
| `86110608` | remove automation resource support |
| `06ffbf0d` | delete automation engine |

当前仍有 [automation-runtime-decommissioned.test.ts](../../../../boai-app/packages/server-core/src/sessions/automation-runtime-decommissioned.test.ts)，意图是：即使工作区存在旧 automations.json，也不创建 scheduler、执行历史或重试队列。旧资源与路由的兼容测试不表示自动化运行功能仍在。

复核可使用下面的只读命令，不需要 checkout：

```sh
git -C ../boai-app show 3e23b73683cdd6a293aef8547d2d0593257bd567:packages/shared/src/automations/types.ts
git -C ../boai-app show 3e23b73683cdd6a293aef8547d2d0593257bd567:packages/shared/src/scheduler/scheduler-service.ts
git -C ../boai-app show 3e23b73683cdd6a293aef8547d2d0593257bd567:packages/shared/src/automations/handlers/prompt-handler.ts
```

### 4.2 删除前的机制

| 部件 | 本地历史实现 | 可以学习的部分 |
| --- | --- | --- |
| 配置 | 工作区 automations.json，按事件保存 matcher/action | 触发、条件、动作分开建模；可读配置 |
| 事件 | 应用事件与 Agent/SDK 事件两类，独立 EventBus | 把事件来源和含义区分清楚 |
| 定时器 | SchedulerService 对齐分钟后 setInterval，防同进程 tick 重入 | 简单时钟设计；但 BoAI 已有 Mastra，不复制第二份 |
| 条件 | 时间、状态 from/to、集合包含、and/or/not | 确定性条件先过滤，减少模型调用 |
| prompt action | PromptHandler 收集匹配项、展开允许变量/引用，回调交给会话层 | 动作匹配与会话执行分开；不把生成 prompt 当交付 |
| 动作类型 | 该历史 types 为 PromptAction 与 WebhookAction | 具体动作语义分开，不把网络请求伪装为聊天 |
| 重试 | Webhook 持久 retry queue 与延迟重试 | 外发结果单独重试；不套到完整 Agent 任务 |
| 历史 | event/history 日志和测试 UI | 每次触发有记录；配置检查和实际执行可分辨 |

Craft 的 SessionManager 回调、权限模式、sources、SDK hooks 和消息网关属于其架构。BoAI 的员工、Work、授权和公开消息已有不同权威，直接拷贝会产生两套运行机制。

## 5. Craft 上游当前状态与本地历史的差别

本次固定上游提交仍包含完整自动化系统，不能把本地 fork 的退役判断套给上游。

核验入口：

- [types.ts](https://github.com/craft-ai-agents/craft-agents-oss/blob/3eac37be5eeee00d312239f21ce3b7c7db92502b/packages/shared/src/automations/types.ts)：当前 action union 为 prompt、webhook、script。
- [automation-system.ts](https://github.com/craft-ai-agents/craft-agents-oss/blob/3eac37be5eeee00d312239f21ce3b7c7db92502b/packages/shared/src/automations/automation-system.ts)：配置、handler 和事件集成。
- [scheduler-service.ts](https://github.com/craft-ai-agents/craft-agents-oss/blob/3eac37be5eeee00d312239f21ce3b7c7db92502b/packages/shared/src/scheduler/scheduler-service.ts)：仍以分钟 tick 产生 SchedulerTick。
- [prompt-handler.ts](https://github.com/craft-ai-agents/craft-agents-oss/blob/3eac37be5eeee00d312239f21ce3b7c7db92502b/packages/shared/src/automations/handlers/prompt-handler.ts)：匹配后产生待执行 prompt，由调用者处理。
- [retry-scheduler.ts](https://github.com/craft-ai-agents/craft-agents-oss/blob/3eac37be5eeee00d312239f21ce3b7c7db92502b/packages/shared/src/automations/retry-scheduler.ts)：Webhook 延迟队列，定义了 5 分钟、30 分钟、1 小时的后续尝试。

这里有一处资料冲突：本次读取的 [Craft 官方自动化页面](https://thecraftagents.com/docs/automations/overview/) 仍包含 command action 示例，而固定上游 types 已定义 script action。说明线上介绍、上游最新代码和本地 fork 不是同一个版本合同。设计以固定代码证据为准，不混拼三套 API。

当前上游的 script 类型注释描述工作区相对路径、argv 执行、环境过滤和同 matcher 互斥。这里只核验了类型契约，没有运行脚本路径/权限安全测试，不能把注释当成已验证的隔离保证，更不能直接绕过 BoAI 当前命令禁用边界。

### 借鉴与拒绝移植清单

| 借鉴 | 在 BoAI 中的表达 | 不直接移植 |
| --- | --- | --- |
| Trigger → Condition → Action | 统一 trigger envelope，确定性条件，受控产品执行入口 | 分钟 setInterval 与 Mastra 同时计时 |
| 新建 session 承接任务 | occurrence 绑定独立用途的 Conversation | Craft SessionManager 与 sources 全套 |
| 稳定 matcher id、执行历史 | Definition id、逻辑时刻键、Work/结果证据 | JSONL 作为第二份任务权威 |
| 可读条件和配置校验 | 有限表单、时间预览、后续自然语言草稿 | 默认允许任意配置热更新扩大授权 |
| 外发失败独立重试 | delivery outbox、接收方幂等 key | 网络超时后重跑整段 Agent 或命令 |
| 分步骤 UI 与测试面板 | 配置预览、明确的“立即运行一次”、执行详情 | 测试按钮暗中执行生产副作用 |

## 6. 方案比较与推荐

| 方案 | 优点 | 当前项目代价 | 判断 |
| --- | --- | --- | --- |
| 现有 Mastra schedules + BoAI 工作链路 | 已接入、具备存储与框架触发、保留员工权限/预算 | 需补产品受理、交付和通知合同 | **推荐，最小增量** |
| 直接使用 Mastra agent schedules | 简单单 Agent 原型所需代码少 | 跳过当前员工装配、群调度、Work 与产品消息入口 | 不作为现有产品主路径 |
| 复制 Craft 自动化引擎 | 现成的事件/条件/UI 参考较丰富 | 双时钟、双状态权威、SDK/权限语义迁移 | 只借鉴产品与分层思想 |
| 自建 Croner 常驻 loop | 完全控制触发逻辑 | 重新实现认领、持久化、触发历史和生命周期 | 暂无替换现有 Mastra 的理由 |
| 先上 Inngest/远程任务服务 | 可适合后续独立常驻/持久执行方案 | 增加部署、消息、凭据、资源和计费边界 | 有退出应用仍执行的明确需求再评估 |
| 先做通用动态工作流编辑器 | 表达能力广 | 放大计划验证、权限、迁移和恢复复杂度 | 不是截图需求的最短路径 |

推荐顺序：先修正“触发—工作—结果”归属和持久边界，再提供新任务聊天与通知策略，然后以一个真实数据源验证监控；固定多步骤流程和远程执行按实际需求进入。

## 7. 本次没有验证或实施的内容

- 未修改运行时代码、UI、依赖、用户计划、用户数据库或旧项目分支；测试仅使用临时数据库。
- 未执行完整测试套件、Electron BDD、真实系统休眠/唤醒、跨设备运行或外部付费模型。
- 未承诺 Mastra Beta 调度未来版本兼容，也未验证上游 Craft 所有安全/恢复实现。
- 未实现新任务聊天、重要性判断、通知 outbox、持久触发认领或本文设计的迁移。
- 未把本地历史退役等同上游功能消失，也未把代码静态分析标为运行失败复现。

源文件存在既有缺失 Header 与部分目录清单滞后的情况；本次只修改文档链路，源码修复应随对应实现进行。设计与证据分成两篇，方便后续逐项更新验收状态，而不改写旧交付记录。
