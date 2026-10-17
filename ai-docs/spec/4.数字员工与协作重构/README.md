<!--
[OUTPUT]: 2026-10-18统一知识资料管理并明确共享/验收；05/06修订为目录授权与批准接续，完全访问自动授权，当前仅文档。
[OUTPUT]: 2026-10-18目录授权现行合同归05、计划/进度归06；员工目录与cwd分开，群/本机共用员工许可。
[INPUT]: 数字员工与协作重构相关规格与当前模块实现。
[OUTPUT]: 数字员工与协作重构的说明和源码入口。
[POS]: ai-docs/spec/4.数字员工与协作重构/README.md。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->
# 数字员工与协作重构

2026-10-18修订：[员工知识资料设计与实施计划](./07-员工知识资料设计与实施计划.md)完善现有knowledge：文件管理、明确保留、跨交流检索和共享，配置保留简洁入口；不改记忆功能。LK0–LK4/验收/goal及第9节唯一进度归该文档，当前仅文档。

2026-10-18修订：[员工目录授权设计](./05-员工工作范围与目录权限设计.md)明确已授权目录正常读写、其他目录可申请、完全访问自动授权；目录与运行位置分开，群/本机按各员工执行。[实施计划](./06-工作范围实施计划与验收.md)维护WS及唯一进度。当前仅文档，以下B/E日期与成绩按历史范围阅读。

日期：2026-09-27  
状态：**B1、B2 已实施；B3、E1–E3 待实施。** [首批交付记录](../2.已实现功能与代码现状/15-B1-B2-S1-F1首批重构实现.md)。  
代码基线：v0.2.2。已交付行为与验证记录见 [v0.2.2 历史群聊与本轮边界](../2.已实现功能与代码现状/14-v0.2.2历史群聊与本轮边界.md)。

本组目标是让员工配置、Agent 装配、工作区授权、群聊调度和运行生命周期有清楚的维护边界。在现有可运行代码上逐步拆分，保留用户已经使用的单聊、自然群聊、文件、记忆和模型配置。B1–B3 不要求改用 Mastra Server、不改 IPC 名称和负载、不迁移 `userData/v2`，也不同时更换群聊算法。新增 E 阶段再明确修改配置契约，使员工可选择 Mastra BYOK、ACP、本地 SDK Agent 或可选 A2A 后端。

## 1. 阅读与任务编号

| 任务 | 设计 | 范围 |
| --- | --- | --- |
| B1 | [数字员工配置与 Agent 工厂](./01-数字员工配置与Agent工厂.md) | 持久定义、注册生命周期、阶段装配、版本和密钥边界 |
| B2 | [工作区与资源隔离](./02-工作区与资源隔离.md) | 员工与会话目录、系统文件、资源授权、共享产物、执行边界 |
| B3 | [群组协作与运行生命周期](./03-群组协作与运行生命周期.md) | 成员自决、发言权、运行与消息持久化、上下文、取消与恢复 |
| E1 → E2 → 可选 E3 | [员工执行后端与能力契约](./04-员工执行后端与能力契约.md) | 后端类型与兼容迁移、ACP / 本地 SDK、远程 A2A、各阶段能力协商 |
| WS0–WS5 | [目录授权设计](./05-员工工作范围与目录权限设计.md) / [实施验收](./06-工作范围实施计划与验收.md) | 员工目录许可、额外批准/接续、完全访问自动允许，群/本机归员工；仅文档待goal |
| LK0–LK4 | [员工知识资料](./07-员工知识资料设计与实施计划.md) | 会话明确保留/直接添加、文件管理/检索、版本来源/授权/清理及后续goal；仅文档 |

B 表示保持行为的后端重构，E 表示新执行后端，不能混为一次目录搬迁。Sandbox / Skills（S）、浏览器（BR）、MCP（C）、自动化（A）以及记忆/工作流（M/W）在第 5 组定义。这里出现的目标模块名都是建议，不表示已有实现；B 任务先整理接入边界。

## 2. 已有分层与当前集中点

| 层 | 当前责任 | 本组处理方式 |
| --- | --- | --- |
| `main` | 窗口、IPC 来源/方法校验、凭据代理、系统对话框、数据根迁移、运行进程启停 | 保留宿主职责，不接入员工业务或 Mastra 实例 |
| `preload` | 向 renderer 暴露受控 `request/subscribe` | 保留接口 |
| `runtime/worker.ts` | 装配本地服务、引擎和凭据代理 | 保留进程入口，逐步集中依赖装配 |
| `runtime/service.ts` | RPC 校验、员工/会话/资源用例、上下文、运行、审批、备份 | 保留 `AppService` facade，按责任移出内部实现 |
| `runtime/group-scheduler.ts` | 群事件、投递、成员判断、依赖、发言权和预算 | 保留算法，移入 collaboration 模块后再分离纯规则 |
| `runtime/mastra-engine.ts` | 模型装配、上下文投影、技能/工具、流式处理和结构化协议 | 保留 `AgentEngine` 适配边界，提取有实际用途的模块 |
| `shared/contracts.ts` | 产品类型、IPC 合同、引擎内部合同混合 | 拆分所有权，旧文件过渡重导出，保持现有 import 可用 |
| `renderer` | UI、请求、快照与增量事件合并、轮次展示 | 由前端任务处理；不得绕过 IPC 导入 runtime |

依据：[Main](../../../src/main/main.ts)、[Worker](../../../src/runtime/worker.ts)、[AppService](../../../src/runtime/service.ts)、[GroupScheduler](../../../src/runtime/group-scheduler.ts)、[MastraEngine](../../../src/runtime/adapters/mastra/engine.ts)。

## 3. 建议目标目录

下面展示完整目标职责归属；当前已落地 employees、workspaces、resources、memory、Mastra 和 storage 边界，其余按阶段推进。不是要求一次创建全部空目录或文件。小模块可以先保留一个入口和一个实现文件；同一状态不因分目录复制出第二套管理器。

```text
src/
  main/                             Electron 宿主、凭据、文件选择与迁移
  shared/
    contracts.ts                    兼容旧出口，逐步改为重导出
    domain/                         跨进程产品 DTO 与纯类型
    ipc/                            Methods、事件、RPC 与公共输入校验
  runtime/
    worker.ts                       进程入口与依赖装配
    service.ts                      AppService facade / 串行用例入口
    modules/
      employees/                    员工定义、版本、注册与配置用例
      conversations/                会话、消息、发送幂等与查询投影
      collaboration/                事件投递、参与决定、发言权、工作项与预算
      runs/                         阶段运行、上下文装配、审批、取消和用量
      memory/                       员工记忆权威、来源、epoch 与失效
      workspaces/                   员工主目录、会话目录、系统文件和产物策略
      resources/                    导入副本、绑定、来源元数据与撤权
    adapters/
      mastra/                       Agent 工厂、SDK 流、协议、工具适配
      storage/                      ProductStore / SQLite 实现
  renderer/                         前端结构由 F 任务维护
```

备份/恢复在初期仍由 facade 组合现有 storage、workspace、resource 能力，待真正影响维护时再拆出维护用例。无需先为每个实体建一个 Repository 接口、每个函数建一个 service 类，或引入依赖注入容器、消息总线框架、Web 后端和 monorepo。

## 4. 依赖与状态所有权

```text
renderer → preload → main → worker → AppService
                                   ├─ employees / conversations / resources
                                   ├─ collaboration → runs → AgentEngine
                                   ├─ memory / workspaces
                                   └─ storage

Mastra adapter implements AgentEngine
shared 不依赖 main、runtime、renderer、Node 或 Electron
```

- `DigitalAgent` 是长期产品身份。Mastra `Agent` 是某阶段的执行对象，不是第二份员工数据库。
- B1 的 Mastra 工厂是现有 BYOK 路径的装配器；E1 在其外增加后端解析与能力合同，不把 ACP 进程或远程 Agent 硬塞进模型连接字段。新增 adapter 在确有实现时才建立目录。
- 产品消息由 conversations/runs 持久化，collaboration 维护投递和发言关系；两者的最终发布仍共享一个原子写入边界。
- memory 的 SQLite 条目是记忆真源；`MEMORY.md` 等是可检查的生成视图。B 任务不启用另一套框架 Memory 回放。
- 工作区路径与资源授权由宿主产品层决定，adapter 只能消费授权快照并再次检查实际操作。
- 外部 Agent 的原生工具、Skills、浏览器与私有状态不能默认受 BoAI 的工具策略控制；接入前声明能力和执行位置，不能把后端失败或不支持判断协议当作成员自主沉默。
- `AgentEngine`、`EngineContext`、`SecretStore` 属于 runtime 内部合同。迁出 shared 后旧出口可以暂时重导出类型；renderer 不得使用它们，包含 `apiKey` 的内部上下文不得成为 IPC 返回值。
- 先依赖既有 `AgentEngine`、scheduler hooks、`ProductStore` 和少量明确能力；只有确有多实现、隔离测试或稳定边界需要时才增加接口。

## 5. 分阶段迁移

### B1：员工定义与阶段装配

1. 以现有测试固定员工定义、配置版本、系统文件与模型选择行为。
2. 提取 employees 的配置用例和唯一注册状态；保留 `saveAgent` 等现有 IPC。
3. 把 Mastra 模型配置和 `decision/chat/task/memory` 装配收进 adapter 工厂。每次按运行快照创建实例，初期不缓存 Agent。
4. 按实际迁移范围拆合同，旧 `contracts.ts` 保留重导出；不得让旧调用方同时切换协议。

完成标志：保存员工不触发模型请求；同员工多会话使用正确快照且互不串上下文；配置更改、密钥处理和取消行为不变。详细验收见 B1 文档。

### B2：工作区与资源边界

依赖 B1 的员工 ID、配置版本和运行快照。路径检查、资源导入等无交叉部分可并行提取；运行上下文接线须与 B1 协调。

1. 用 WorkspaceService 统一现有路径规划、系统文件装配和产物授权入口。
2. 迁入现有 AgentHomes、资源导入、记忆投影协作代码；保留数据目录、文件名和恢复日志。
3. Mastra 文件/技能工具改为使用同一授权计划，不扩大挂载目录。
4. 保留宿主命令审批和现有执行限制，明确其没有操作系统沙箱。后续 [S1/S2](../5.Mastra能力扩展/03-Sandbox文件系统与Skills.md) 再接入文件/技能授权装配与 Sandbox 执行模式。

完成标志：原数据和备份直接可读；跨员工/跨会话文件约束、显式发布、资源撤权和记忆来源验证均通过。不要为了源码移动重新搬一次用户工作区。

### B3：协作与运行职责

在 B1/B2 的上下文装配与文件边界稳定后实施。

1. 先按当前行为搬移 group-scheduler，保留 hooks 与持久记录形状。
2. 提取 runs 的阶段生命周期、审批、流式写入、取消与用量；提取 conversations 的发送幂等与查询投影。
3. 把协作规则中的纯判断提成小函数，逐项复用现有回归；不同时重写调度循环。
4. 检查最终消息、run、grant、event、contribution 和 artifact 关联仍在同一发布事务中完成。

完成标志：每成员自决、首轮机会、单发言权、用户插话、预算、失败恢复、重启不重放与历史轮次展示保持一致。

## 6. 与其他组并行的约定

- F 任务继续消费现有 Methods / AppEvent / Snapshot / ConversationDetail；后端源码迁移不要求 UI 同步改请求名称或字段。
- S/E/C/BR/A/M/W 能力任务在相应稳定边界上接入，不能借 B 任务直接扩大工具权限、改记忆真源或引入新的任务调度。新增连接、后端与自动化页面随对应能力交付，不等待主题系统全部完成。
- 不随目录调整升级 Electron/Mastra/SQLite，或自动移除暂未使用的依赖。依赖清理单独验证打包结果。
- 若确实需要改变持久记录、IPC 或行为，先追加明确变更设计与迁移验收；不包装成“纯重构”。

## 7. 验收与回退

每个 B 任务应是可单独评审的增量：记录移动前后责任映射、入口兼容性、相关回归结果。迁移期可用旧路径重导出新实现，但不能让新旧实现各写一份状态。

| 验收层 | 必须保留的证据 |
| --- | --- |
| 静态边界 | renderer 无 Node/Electron/runtime/Mastra 导入；内部密钥上下文不进入 IPC；现有入口可构建 |
| 服务 | 真实临时 SQLite 下的持久化、幂等、配置版本、审批、取消、权限撤回、备份恢复 |
| 引擎 | 本地协议端点验证 chat 无工具、task 工具与技能、当前轮投影、协议修复预算、用量和取消 |
| 协作 | 6/12 成员首轮机会、并行上限、单公开发言、依赖/接续、失败恢复与历史轮次隔离 |
| 桌面 | 现有完整桌面流程、历史群聊、v0.1 升级流程；基于构建后的应用验证 |

现有回归位于 [service tests](../../../tests/service.test.ts)、[engine tests](../../../tests/mastra-engine.test.ts)、[homes/memory/migration tests](../../../tests/agent-homes.test.ts) 和 [Electron tests](../../../tests/e2e)。文件迁移后可以调整测试 import；不得删掉失败场景来让结构调整通过。

验证强度按改动递进：先类型检查和受影响测试，阶段完成后完整测试与生产构建，接线/打包阶段再做 Electron 验证。只读文档规划不声称这些检查已重新执行。

B1–B3 的回退以代码提交为单位；这三个结构重构阶段不改数据格式，因此无需数据降级脚本。E 阶段会增加执行后端配置，应按其规格单独设计迁移和数据回退。现有 v2 原数据、配置、生成视图和用户文件都应保留。涉及真实数据的升级验证使用隔离副本，不能靠清空已有群历史获得通过。
