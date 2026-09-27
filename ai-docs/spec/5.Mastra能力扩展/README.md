# Mastra 能力扩展

日期：2026-09-27。状态：**S1 已实施，其余能力待实施**；[首批交付记录](../2.已实现功能与代码现状/15-B1-B2-S1-F1首批重构实现.md)。当前优先员工 Sandbox / Skills、执行后端、浏览器与自动化。本文不触发依赖升级，不替换现有记忆库或群聊调度器。

核对版本为本项目安装的 `@mastra/core 1.71.0`、`@mastra/memory 1.32.1`、`@mastra/libsql 1.23.3`。优先依据安装包 embedded docs、类型和实现；官方线上文档可能先于或晚于这些版本。当前交付事实见 [v0.2.2 实现记录](../2.已实现功能与代码现状/14-v0.2.2历史群聊与本轮边界.md)。

## 1. 阅读顺序

1. [Sandbox 文件系统与 Skills](./03-Sandbox文件系统与Skills.md)：员工持久主目录与执行环境、授权挂载、工具与命令边界，S1/S2 实施路线。
2. [员工执行后端与能力契约](../4.数字员工与协作重构/04-员工执行后端与能力契约.md)：BYOK、ACP、本地 SDK Agent 和 A2A 员工分别如何接入，E1–E3 的兼容与能力边界。
3. [Browser 浏览器能力](./04-Browser浏览器能力.md)：本地浏览器、独立会话和登录状态、下载、权限及打包。
4. [ACP 与 A2A 及 MCP 连接](./05-ACP与A2A及MCP连接.md)：连接的方向、身份和工具职责，不能用一个连接字段混装三种协议。
5. [自动化与定时执行](./06-自动化与定时执行.md)：Mastra 原生 schedules 的本地接入、任务投递、审批、重启与补偿，不复用 Pi 自动化。
6. [Memory 与 Working Memory](./01-Memory与WorkingMemory.md)：已有产品记忆与框架记忆的职责、作用域、数据权威、渐进接入和退出条件。
7. [动态工作流与执行编排](./02-动态工作流与执行编排.md)：成员自决、代码工作流、JSON 动态工作流、模型计划之间的区别及实施顺序。

编号保留先前两份文档，不代表开发优先级；实际顺序以 [总计划](../00-重构总计划.md) 为准。

沿用 [独立员工与自然群聊](../1.产品与架构基线/09-独立员工与自然群聊.md) 和 [员工系统文件与 Mastra 适配](../1.产品与架构基线/11-员工系统文件与Mastra适配.md)。扩展能力不能改变员工私有空间、会话边界、命令审批、公开消息提交或来源撤权的含义。

## 2. 已具备什么

| 能力 | 当前实现 | 不应据此宣称已实现的能力 |
| --- | --- | --- |
| Mastra Agent 执行 | 每次按员工配置构造普通 Agent；使用显式模型、bootstrap、获准 tools/workspace | 已启用 Mastra Memory 或工作流 |
| 产品对话历史 | ProductStore 保存消息；引擎按员工身份、当前轮/旧轮和有界窗口投影 | Mastra 自动 message history 回放 |
| 产品长期记忆 | MemoryRepository 保存来源、版本、epoch、删除标记；模型提出当前轮增量候选，服务验证后写入 | Mastra Working Memory、Semantic Recall、Observational Memory |
| 员工系统文件 | 宿主装配 AGENTS.md / SOUL.md；记忆 Markdown 是生成视图 | 普通 Agent 自动发现或写入所有系统文件 |
| 群聊协作 | GroupScheduler 分发事件、维护发言授权、依赖、预算、取消；每位员工自主决定参与 | Mastra workflow 图、可持久动态计划或流程恢复 |
| 本地持久化 | 使用 `@libsql/client` 的 ProductStore，本地 SQLite | 已实例化 `@mastra/libsql` 的 LibSQLStore / LibSQLVector |
| 本地执行 | task 才获得当前员工×会话工具与工作区；命令经审批 | 操作系统级安全沙箱 |
| 文件与技能 | S1 授权环境计划、内容 hash、受限 SkillSource 与技能状态；task 仅加载绑定技能 | 已接入 LocalSandbox、默认自动挂载所有资源或自动安装技能依赖 |
| 定时任务页面 | 已有入口、列表和详情设计 | 已接入 Mastra schedules、后台运行或系统唤醒 |
| 外部连接与浏览器 | 当前无 ACP / A2A / MCP / Browser 集成 | core 存在相关类型就等于员工已经能使用 |

源码入口：[ProductStore](../../../src/runtime/store.ts)、[MemoryRepository](../../../src/runtime/memory.ts)、[AgentHomes](../../../src/runtime/agent-homes.ts)、[MastraEngine](../../../src/runtime/mastra-engine.ts)、[AppService](../../../src/runtime/service.ts)、[GroupScheduler](../../../src/runtime/group-scheduler.ts)。

**安装 `@mastra/memory` 不等于已经启用它。Working Memory 是模型可用的持久上下文，不是 workspace 文件目录。** 当前引擎没有给 Agent 配置 `memory: new Memory(...)`，也没有使用 `createWorkflow()`、`addDynamicWorkflow()` 或 `new Mastra(...)` 组织工作流。

## 3. 框架已提供但项目尚未接入

| 框架能力 | 已核验的作用 | 接入前必须解决 |
| --- | --- | --- |
| Workspace / Filesystem / Sandbox / Skills | 组合文件、执行与技能能力；LocalSandbox 支持可选原生隔离 | 目录归属、只读/可写映射、技能来源、依赖与审批；默认非强隔离 |
| Browser | browser provider 可向 Agent 暴露浏览器工具 | 独立 profile、工具授权、下载路径、进程生命周期；本地 provider 依赖尚未安装 |
| ACP / SDK Agents | 调用外部本地 Agent；其自身可能拥有工具与运行循环 | 阶段能力、会话隔离、认证和真实取消；不能默认继承 Mastra tools / Skills |
| A2A | 与远程 Agent 交互或由服务暴露 Agent | 出站与入站分开；远端状态、用量与取消能力须明确验证 |
| MCP | 连接工具/资源服务，或另行暴露服务端 | 员工绑定、工具清单、每次操作审批与连接生命周期 |
| Schedules | 安装版原生持久调度，目标可为 agent / workflow | Electron 显式 worker 生命周期、storage、产品授权入口、补偿与幂等；进程退出不执行 |
| Message history | 自动保存和加载 thread 内消息；支持条数或 token 预算 | 谁拥有消息权威；避免与产品历史重复回填；内部判断不能进入公开历史 |
| Working Memory | 小型、持续相关的 Markdown/结构化状态；可通过工具更新 | 与产品事实库重叠；读写入口、scope 和 chat 无工具约束 |
| Semantic Recall | 对历史消息做 embedding 和向量检索 | 另配 embedder/vector；按授权范围检索；删除同步；模型与索引版本 |
| Observational Memory | Observer/Reflector 压缩旧历史为 observations | 后台调用成本/取消、压缩来源撤权、恢复、scope；不是打开选项就完成接入 |
| 代码工作流 | 类型化步骤、顺序、并发、条件、循环、暂停/恢复 | 复用宿主授权与预算；副作用幂等；产品任务状态映射 |
| Dynamic workflows | Beta：JSON 定义经验证后注册，可通过受支持存储持久化 | 计划权限、受控组件注册、图版本、循环预算、计划确认和恢复 |

框架定义和产品规则分属不同层。框架验证某个 `agentId` / `toolId` 存在，不代表它在当前群、当前员工、当前任务中获准使用。动态 Agent 配置也不等于动态工作流。

## 4. 建议路线及优先级

| 阶段 | 目标 | 优先级与前置 | 退出条件摘要 |
| --- | --- | --- | --- |
| S1 → S2 | 授权文件/技能装配，再接命令 Sandbox | 当前核心优先级；基于 B1/B2 | 现有文件可用，当前员工/会话范围和显式发布不变；执行模式如实标注并经过验证 |
| E1 → E2；可选 E3 | 后端契约、ACP / 本地 SDK、远程 A2A | 详见第 4 组；先跑通一种外部后端 | 旧 BYOK 不回退；阶段能力不伪造，群内发布由产品调度控制 |
| C1 | 员工可绑定的 MCP 工具连接 | 基于运行授权；本地进程结合 S2 | 连接、工具调用、取消/撤权与密钥边界闭环 |
| BR1 | 本地浏览器与独立登录状态 | 基于 S1 和后端工具能力；可与 C1 并行 | 专用浏览器生命周期和产物路径可验，不能混入用户主浏览器会话 |
| A1 → A2；可选 A3 | 原生 schedules、本地任务闭环与恢复；后续应用外执行宿主 | A1 从现有 BYOK 单员工开始，不等待 M/W 或 ACP | 无重复时钟，产品运行入口、补偿/去重与结果投递闭环，退出/休眠行为可解释 |
| M1 | 保持产品事实库，统一记忆上下文、来源和读写适配；评估 Working Memory 只读投影 | 在核心环境边界稳定后；不要求替换存储 | 单写者、scope、删除/撤权和重启不复活可验证；现有群聊无回归 |
| M2 | 增加按需、有来源的历史检索，先限定员工×会话 | 在 M1 后，只有有界近期历史确实不足时 | 检索提升在固定样例中可测；越权命中为零；索引可失效/重建 |
| M3 | 对长任务试点 thread-scoped Observational Memory | 在 M1 后；不是所有会话的默认开关，M2 不是硬依赖 | 压缩成本、后台取消、删除撤权重建、恢复及降级通过专项验收 |
| W1 | 为明确重复任务建立可恢复的代码工作流 | 可与 M1 并行；先选一个确有多步骤的任务 | 暂停、重启恢复、取消和幂等通过；群聊自主参与仍由产品调度 |
| W2 | 开放白名单组件组成的动态计划/JSON 工作流 | W1 稳定后，确有动态组合需求 | 计划可检查/拒绝/版本固定；图约束、权限、预算和恢复有效 |

不以“启用全部 Mastra 功能”为目标。M1 可以保留现有 MemoryRepository；M2 可以先使用产品检索接口；M3 只有长上下文收益成立才推进。W1 的模板足以覆盖目标时，可以不做 W2。

**定时调度与动态工作流是两件事。** 自动化可以只把一次任务交给现有员工，不需要先实现模型动态生成图。需要多步恢复时再接 W1；W2 不是自动化的前置条件。`sleep` / `sleepUntil` 也不能代替持久调度或操作系统唤醒。

## 5. 始终保留的约束

1. 产品数据库是公开会话、员工、授权和任务状态的权威；框架内部 thread/run 不能直接替代产品会话或发言权。
2. 私聊中的事实不会因同一用户、同一员工或相同 `resourceId` 自动进入群聊。跨群使用需要明确产品语义和授权。
3. 同一种事实只设一个写入权威。框架上下文、向量索引、Markdown 投影都必须能说明自己的来源和版本。
4. 决策、记忆维护、检索/embedding、Observer/Reflector、规划、修复、步骤重试分别计入对应预算；不能因框架内部调用而变成免费或不可取消的调用。
5. 恢复任务必须重新检查授权。持久快照不是永久执行许可，重启也不是重复产生外部副作用的许可。
6. 任何新能力先在隔离数据和真实 SDK 协议中验证，再做明确迁移。本文没有执行迁移、启用能力或运行新测试。
7. ACP / SDK / A2A 的内部工具循环不自动受 BoAI 的 Mastra Workspace 控制；无法可靠限制某阶段时明确不支持，不把错误或能力未知写成成员自主 pass。
8. 自动化触发也必须经过员工/群用例，重新检查配置、授权、预算和公开发言许可；schedule 到期不是对所有操作的预先授权。

## 6. 核对依据

主要安装文档：

- [Memory overview](../../../node_modules/@mastra/core/dist/docs/references/docs-memory-overview.md)、[Memory 类型](../../../node_modules/@mastra/core/dist/memory/types.d.ts)、[Memory 实现导出](../../../node_modules/@mastra/memory/dist/index.d.ts)。
- [Dynamic workflows](../../../node_modules/@mastra/core/dist/docs/references/docs-workflows-dynamic-workflows.md)、[动态定义格式](../../../node_modules/@mastra/core/dist/docs/references/reference-workflows-dynamic-workflow-definition.md)、[Mastra 类方法](../../../node_modules/@mastra/core/dist/mastra/index.d.ts)。
- [LibSQLStore](../../../node_modules/@mastra/libsql/dist/storage/index.d.ts)、[LibSQLVector](../../../node_modules/@mastra/libsql/dist/vector/index.d.ts)。

官方阅读入口：[Working Memory](https://mastra.ai/docs/memory/working-memory)、[Observational Memory](https://mastra.ai/docs/memory/observational-memory)、[Workflows](https://mastra.ai/docs/workflows/overview)、[Dynamic workflows](https://mastra.ai/docs/workflows/dynamic-workflows)。具体 API 与行为仍以本项目安装版本为准。

本次新增核对：[Filesystem](https://mastra.ai/docs/sandbox/filesystem)、[Skills](https://mastra.ai/docs/skills)、[Browser](https://mastra.ai/docs/browser)、[ACP](https://mastra.ai/docs/connections/acp)、[A2A](https://mastra.ai/docs/connections/a2a)、[MCP](https://mastra.ai/docs/connections/mcp)、[SDK Agents](https://mastra.ai/docs/connections/sdk-agents)、[Scheduled workflows](https://mastra.ai/docs/workflows/scheduled-workflows)。各专题记录对应安装包依据和未安装的可选依赖，避免用线上示例冒充当前运行代码。
