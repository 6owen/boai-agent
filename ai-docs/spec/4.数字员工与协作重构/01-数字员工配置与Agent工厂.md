<!--
[OUTPUT]: 2026-10-25源码链接随Workspace迁移更新，历史验证结论保持。
[INPUT]: 数字员工配置与 Agent 工厂相关规格与当前模块实现。
[OUTPUT]: 数字员工配置与 Agent 工厂的说明和源码入口。
[POS]: ai-docs/spec/4.数字员工与协作重构/01-数字员工配置与Agent工厂.md。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->
# 数字员工配置与 Agent 工厂

日期：2026-09-27  
任务：B1  
状态：**B1 已实施**。唯一员工注册状态由 EmployeeService 拥有；阶段实例由 createStageAgent 工厂装配。[实现与验证](../2.已实现功能与代码现状/15-B1-B2-S1-F1首批重构实现.md)。

本设计延续 [独立员工与自然群聊](../1.产品与架构基线/09-独立员工与自然群聊.md) 和 [员工系统文件与 Mastra 适配](../1.产品与架构基线/11-员工系统文件与Mastra适配.md)。一个数字员工拥有长期身份、配置、工作区和记忆；这不要求长期保留同一个 SDK 对象，也不要求每员工运行一个进程。

最新扩展见 [员工执行后端与能力契约](./04-员工执行后端与能力契约.md)：B1 先整理现有 Mastra BYOK 工厂，E1/E2 再引入后端类型与 ACP / 本地 SDK Agent。本文“每阶段创建 Agent”只描述当前 Mastra 分支；外部进程和外部 session 有各自生命周期，不能照搬 `new Agent` 的实现。

## 1. 重构前的 v0.2.2 基线

| 概念 | 当前事实 | 依据 |
| --- | --- | --- |
| 员工持久定义 | `DigitalAgent` 保存 ID、角色、连接/模型、skill/knowledge 绑定、命令开关、启用状态及配置版本 | [contracts.ts](../../../packages/shared/src/domain/index.ts) |
| 注册状态 | `AppService.agents` 在启动时从 SQLite 加载，空库创建 3 个定义；配置保存后更新该 Map | [service.ts](../../../packages/runtime/src/service.ts) |
| 系统文件 | `AGENTS.md`、`SOUL.md` 为源文件；定义中的 instructions 同步为工作规则投影 | [agent-homes.ts](../../../packages/runtime/src/modules/workspaces/workspace-service.ts) |
| 运行快照 | 每阶段装配员工、连接、资源、记忆来源及 bootstrap 版本；模型取得的是副本 | [service.ts](../../../packages/runtime/src/service.ts) |
| Mastra 实例 | run/decide/extractMemory 各自 `new Agent`；task 阶段另创建临时 Workspace，结束销毁 SDK Workspace 对象 | [mastra-engine.ts](../../../packages/runtime/src/adapters/mastra/engine.ts) |
| 引擎接口 | `AgentEngine` 隔离产品层与 Mastra；一个 adapter 实例处理多个员工/会话 | [worker.ts](../../../apps/electron/src/worker/index.ts) |

重构前没有独立 Agent 工厂，员工用例集中在 AppService。现已提取 `modules/employees/employee-service.ts` 与 `adapters/mastra/agent-factory.ts`；仍不缓存带会话状态的实例，不创建永久 Mastra 注册表。下文保留职责及验收依据。

## 2. 三个生命周期

### 2.1 持久定义生命周期

由 `runtime/modules/employees` 负责创建、读取、更新、启用/停用与资源绑定校验。继续使用原员工 ID 和 `configVersion`；原 `saveAgent` 是入口，不为了模块化新增一组 IPC。

持久定义不保存 API Key、Mastra Agent、Workspace 实例、AbortController、活跃 Promise 或运行中的消息列表。连接只保存引用；员工编辑也不隐式发起连接测试或模型请求。

### 2.2 注册生命周期

建议把 AppService 的员工 Map 与定义用例收进一个 EmployeeRegistry 或同职责模块。命名可以收敛为 `EmployeeService`，只保留一个状态所有者，不同时维护 service Map、registry Map 和 factory cache。

注册的含义是“这个持久员工可被查询并按当前配置准备运行”，不是向 Mastra Server 注册，也不是把所有员工一次性构造成常驻 Agent。

1. 启动：加载已有定义，按现有规则初始化/恢复系统文件，注册可查询的员工。
2. 保存：严格校验、检查预期版本、写入定义/源文件事务恢复记录，再更新注册视图。
3. 运行：取得指定版本的不可变配置副本，并在上下文装配时再次检查启用状态和会话成员资格。
4. 配置变化：使相关正在运行的快照失效并取消旧执行；下一次运行重新装配。历史 run 保留旧版本事实。
5. 退出/重启：丢弃内存运行对象，从持久记录恢复定义；未结束任务按现有规则标记中断，不自动继续工具操作。

当前没有员工删除 RPC。B1 不顺便加入物理删除、回收站或删除工作区；停用沿用现有 active 字段。

### 2.3 单阶段实例生命周期

`runtime/adapters/mastra` 内部提供一个工厂入口，按阶段装配 SDK Agent。它接收产品层已准备的运行上下文；不自己查产品数据库、重排会话消息、决定群发言者或从环境变量获取密钥。

阶段参数是 adapter 内部类型，不新增 IPC 字段。可以采用一个带判别字段的工厂函数和几个私有构建函数，不必拆成四个工厂类。

| 阶段 | 输入目的 | 能力集合 | 输出处理 |
| --- | --- | --- | --- |
| decision | 当前轮原始用户请求、署名历史、本轮参与状态、授权能力摘要 | 无文件/知识检索/技能/命令工具；能力摘要不是能力授权 | 私有参与决定，严格校验后交 collaboration |
| chat | 当前用户请求和获准背景，普通公开回应 | 无工具、不挂载 SDK Workspace | 公开自然语言；不声称完成工具任务 |
| task | 已验证的 reply/task 意图和运行快照 | 仅授权技能与工具；命令还需逐次审批 | 工具活动与最终公开正文分离，产物显式发布 |
| memory | 当前轮已完成消息、已有记忆去重背景、来源标识 | 无工具、不公开发言 | 有来源的候选增量；产品层检查 epoch/授权后保存 |

ask / request_handoff 即使误带 task 值，也只产生公开澄清/邀请，不获得任务工具。连接测试可共用模型连接构建函数，但不装配员工工作区或记忆。

“无工具”指模型没有该能力，不要求宿主完全不创建目录：当前 AgentHomes 在准备 bootstrap 时就会建立 session/run 路径；B1 不改变这一文件生命周期。

## 3. 工厂责任边界

**工厂负责：** 将快照映射为 model 配置、阶段系统说明、tools、Workspace 及 SDK 实例；返回执行所需对象及明确的清理责任。task Workspace 在成功、异常和取消时都清理 SDK 资源，不删除用户持久工作文件。

**工厂不负责：** 保存员工、管理会话历史、查找其他员工资料、分发群事件、生成公开消息 ID、批准命令、重试原用户请求、写入记忆数据库或决定备份时机。

初期不缓存 Agent 或 task Workspace。同员工在两个群并发运行时，必须获得不同的消息投影、会话记忆、session 路径和取消信号。将来只有性能证据证明需要缓存，才讨论模型客户端等无会话状态对象；不能以员工 ID 为唯一键缓存带运行上下文的 Agent。

建议先从现有代码提取 `modelConfig`、阶段说明装配与 `taskRuntime`，保持 `MastraEngine` 的 public 方法不变。流式消费、结构化协议解析和修复仍由 engine 执行路径负责，工厂不添加隐藏的模型调用。

## 4. 配置版本、文件与快照

- 保存接口继续支持 `expectedConfigVersion`；冲突返回清楚错误，不覆盖另一窗口/外部编辑产生的新版本。
- `AGENTS.md` 和 `SOUL.md` 使用现有 hash、pending-update 与 manifest 恢复机制。不能把源码移动变成“启动时用数据库覆盖用户文件”。
- 外部源文件变更经 reconcile 提升配置版本；同员工两个群同时启动阶段时，此操作须保持串行，避免重复升版或文件/数据库交错。
- `RunSnapshot` / `BootstrapSnapshot` 保存运行时使用的配置、文件 hash、资源和记忆版本。历史快照不跟着注册表对象变更；仅使用既有失效标记表示后来撤权。
- 模型开始前与事件发布时都检查取消/当前授权。实例创建成功不等于获得永久权限。
- 同一份 bootstrap 只注入一次，不再同时拼接数据库 instructions、完整 AGENTS.md 和生成 MEMORY.md 三套重复来源。

文件同步先保留现有日志协议，再提取模块。不要在 B1 把文件写入与 SQLite 更新拆到互不知情的两个服务，失去崩溃恢复路径。

## 5. 密钥与修复预算

Main 的 CredentialVault 和 runtime 的 SecretStore 代理继续拥有密钥读取边界。只有执行所需的内部上下文携带短期明文；快照、员工定义、运行记录、消息、日志、备份和 renderer 返回值不得携带它。

工厂只使用显式传入的连接与密钥，不从宿主环境回退读取 provider key。官方 provider 缺 key 明确报错；兼容本地端点继续允许空 key。模型请求错误保持脱敏。

E 阶段增加的外部 Agent 认证不必是 BYOK 模型密钥；进程配置、登录引用和模型连接应分开管理。外部后端不得未经声明就继承全部宿主环境、主浏览器登录态或其他员工的工作目录；具体策略由执行后端文档管理。

decision/memory 协议最多一次受控修复。首调用由宿主预留，额外尝试必须先等待 `onAdditionalModelCall` 并在其前后检查 abort；所有尝试共享累计 usage。工厂不得因新统一入口启用 SDK 默认重试，绕过这些预算。

## 6. B1 实施与验收

实施顺序：提取纯模型配置 → 提取阶段工厂 → 员工注册/配置用例 → 内部合同位置整理。每步保留原出口和 fake engine 注入能力；不要求先建立所有目标文件。

必须通过：

1. 创建/编辑员工只写定义和必要文件，不调用模型；空库仍只有三个员工定义，没有假消息或密钥。
2. 重启保留 ID、绑定、版本、源文件；缺失或非法源文件只影响相应员工，不自动覆写用户资料。
3. 同员工在两个群运行使用独立 session 和获准记忆；模型、连接、署名与快照正确。
4. chat/decision/memory 没有 task 工具；ask/handoff 不可升级为命令执行。
5. 修改配置、停用、移出群或撤销资料后，旧运行取消，迟到内容不发布；保存冲突可解释。
6. 模型选择、密钥脱敏、取消、协议修复调用计数与累计 usage 与 v0.2.2 一致。

沿用 [服务测试](../../../tests/service.test.ts)、[引擎测试](../../../tests/mastra-engine.test.ts) 和 [文件/记忆测试](../../../tests/agent-homes.test.ts)。仅在新模块边界引入真实风险时补回归，不为一对一转发函数添加实现镜像测试。
