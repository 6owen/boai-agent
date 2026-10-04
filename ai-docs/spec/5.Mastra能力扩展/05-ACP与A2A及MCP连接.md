<!--
[INPUT]: 2026-09-27协议研究及当前受控本地ACP源码、后端契约和后续连接范围。
[OUTPUT]: 当前本地ACP接入与历史Mastra封装研究的明确区分；A2A/MCP和反向服务仍为后续设计。
[POS]: ai-docs/spec/5.Mastra能力扩展/05-ACP与A2A及MCP连接.md。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->
# ACP、A2A 与 MCP 连接

当前状态核对（2026-10-02）：项目已用 `@agentclientprotocol/sdk` 接入受控本地 ACP，见 [客户端](../../../src/runtime/adapters/acp/client.ts)、[启动项](../../../src/runtime/modules/backends/profiles.ts)和[实现记录](../2.已实现功能与代码现状/16-主题外部Agent与自动化实现.md)。它保持单聊显式任务、新 session、外部自有工具和未知用量边界，不等于采用下文研究的 `@mastra/acp` 包，也不支持自主群聊或自动化。A2A、MCP、SDK Agent adapter 和反向服务仍未接入。

以下为 **2026-09-27 官方能力核对与后续设计的历史记录**，其中“尚未接入/未安装”的产品状态以当日为准；框架 API 说明不冒充当前实际适配器行为。对应 E2 / E3 / C1；员工后端契约见 [执行后端与能力契约](../4.数字员工与协作重构/04-员工执行后端与能力契约.md)。

本轮已实际浏览用户指定的三个官方页面，并优先对照安装 `@mastra/core 1.71.0` 的 embedded docs/type。未安装新包、读取凭据、启动外部 Agent 或更改应用代码。

## 1. 协议方向与项目状态

| 协议/能力 | 入站：别人调用 BoAI/Mastra | 出站：BoAI/Mastra 调用别人 | 本项目状态 |
| --- | --- | --- | --- |
| ACP | 用户指定页面没有提供“自动把普通 Mastra Agent 暴露成 ACP server”的产品入口；另做 server/bridge 是独立需求 | `@mastra/acp` 启动 ACP stdio 程序；`AcpAgent` 或 `createACPTool` 包装外部 Agent | core 内有说明文档；ACP 包未安装，客户端尚未实现 |
| A2A | Mastra server 可暴露 Agent Card 和执行端点 | core 的 `A2AAgent` 包装远端 Agent；可选 client SDK 直接调用端点 | core 已有类型/实现；无产品适配或 A2A 服务；client-js 未安装 |
| MCP | `MCPServer` 暴露工具、资源、提示词以及包装后的 Agent/workflow | `MCPClient` 读取外部工具/资源等并交给员工执行 | core 有接口/说明；`@mastra/mcp` 未安装，产品未接入 |

三者不是互换的模型 provider。ACP 和 A2A 接入的是拥有自己执行循环的 Agent；MCP 主要连接能力。即使把 Agent 包装成一个 MCP tool，产品层仍应按“调用外部任务能力”处理，而不是自动获得完整员工的私有判断、会话或工具控制能力。[官方 ACP](https://mastra.ai/docs/connections/acp) · [官方 A2A](https://mastra.ai/docs/connections/a2a) · [官方 MCP](https://mastra.ai/docs/connections/mcp)。

Mastra 还提供独立的 SDK Agent adapter 路线；这与 ACP/MCP 协议不是同一概念。`@mastra/claude` / `ClaudeSDKAgent`、`@mastra/cursor` / `CursorSDKAgent`、`@mastra/openai` / `OpenAISDKAgent` 可作为 E2 的候选，由提供方 SDK 保留原工具、权限和运行循环。本项目未安装这些 adapter，选型时需锁定 provider SDK/peer 版本、执行模式与模型设置。OpenAISDKAgent 包装 OpenAI Agents SDK，不表示已经接入 Codex CLI。详见 [安装 SDK agents 说明](../../../node_modules/@mastra/core/dist/docs/references/docs-connections-sdk-agents.md) 与 [官方 SDK agents](https://mastra.ai/docs/connections/sdk-agents)。

## 2. ACP：本产品作为客户端调用本地 Agent

### 核验事实

官方 ACP 路线使用 `@mastra/acp`，文档要求 core 至少 1.34.0。当前 core 版本高于这个最低值，但项目没有安装 ACP 包，因此**不等于已核验任何具体 ACP 包版本与本项目兼容**。

客户端启动指定 executable，通过 stdio 与对方初始化、创建 session、发送 prompt、接收 session updates。程序必须实际实现 ACP，或经受支持的 bridge 提供 ACP；不能把普通 CLI 换一个命令名就认为具备协议能力。具体命令和 flag 取决于该 Agent 版本。

安装文档中的两种封装：

| API | 用途 | 与本产品的关系 |
| --- | --- | --- |
| `AcpAgent` | 将外部 ACP Agent 包装为 Mastra SubAgent，提供 generate/stream 等方法 | 可由执行适配器直接使用，也可在 parent Agent 中委派；不自动成为产品 Employee |
| `createACPTool()` | 用 task 字符串调用外部 Agent，返回 output 字符串 | 适合已获准任务委派；父 Agent 仍需要自身运行方式，不能据此实现完全无 BYOK 的所有阶段 |

`AcpAgent` 默认复用进程/session；`persistSession: false` 在 prompt 后停止进程。`createACPTool` 每次工具执行创建连接，不应把其默认 persistSession 与显式复用 AcpAgent 实例混为一谈。安装参考还明确写出 AcpAgent 的 `resumeGenerate` / `resumeStream` 未支持并会抛错，不能从 A2A 同名 API 推断 ACP 的恢复能力。[安装 AcpAgent 参考](../../../node_modules/@mastra/core/dist/docs/references/reference-acp-acp-agent.md)、[安装 createACPTool 参考](../../../node_modules/@mastra/core/dist/docs/references/reference-acp-create-acp-tool.md)。

协议 `session/load` 等可选能力，与 Mastra wrapper 的 resume 方法不是一回事。ACP 初始化协商的是协议、内容、会话等能力，不会替本产品验证“工具关闭的 decision JSON”或“可撤权的员工记忆”。适配器仍要做产品能力核验。[ACP 初始化规范](https://agentclientprotocol.com/protocol/initialization)。

### 必须覆盖的默认行为

1. **审批不能默认通过。** 当前 ACP 参考说明默认 permission handler 选择对方提供的第一个选项，无选项才取消。实现时必须提供 `onPermissionRequest`，关联具体员工/run/操作，按本产品批准/拒绝结果选择明确的 option ID；不能用选项顺序或英文名字猜授权。
2. **env 不是干净环境。** 文档的 env 与当前进程环境合并。需要核验实际版本的进程创建 API，采用受控启动环境；不能只传 `{}` 就承诺其他凭据不会继承。
3. **workspace 不是沙箱。** 经 ACP 客户端发起的文件读写可走 Mastra Workspace；外部 Agent 还可能直接使用本机工具、网络和用户文件。未证明全部操作可约束前，不得宣称 `allowCommands=false` 或某个 cwd 已隔离整个进程。
4. **保持会话不是跨群共享。** 一个 AcpAgent 实例默认长期会话，不应在不同员工/群/阶段之间复用。重启进程也不保证对方用户配置或全局记忆被删除。
5. **文本增量不是最终结果保证。** wrapper 将 Agent message chunk 映射为 text delta；协议还可能报告计划、工具、思考等事件。实际可用的最终回复边界必须按目标程序核验。

前三项和生命周期来自已安装 [ACP 参考](../../../node_modules/@mastra/core/dist/docs/references/reference-acp-acp-agent.md)，并与实际浏览的 [官方 AcpAgent API](https://mastra.ai/reference/acp/acp-agent) 对照；权限回调与工具封装细节见 [官方 createACPTool](https://mastra.ai/reference/acp/create-acp-tool)。这里规定的是 BoAI 的接入策略，不声称新包已经做到了这些保证。

### 取消、用量与输出

ACP 的一个 prompt turn 可以包含多次内部模型与工具调用。协议有 `session/cancel`，但客户端必须等待对方对原 prompt 给出取消终态，不能将停止读取 stdout 等同于停止副作用。收到的思考事件不公开；取消后允许协议收尾事件，但这些事件不能绕过产品 generation/grant 检查。[ACP prompt turn 规范](https://agentclientprotocol.com/protocol/v1/prompt-turn)。

该规范的 `usage_update` 描述 session 上下文 used/size 和可选累计 cost，不等同于每次请求的 input/output token。不要把它填入现有 ModelUsage 后制造精确预算。目标程序/适配器如另有真实 token 报告，记录其单位、范围和累计语义；没有就保持未知。[ACP usage 说明](https://agentclientprotocol.com/protocol/v1/prompt-turn#session-usage-updates)。

E2 首选一个经过锁版核验的 ACP Agent 做明确任务调用；要作为完整自主员工，必须另验证 decision/chat/memory 无工具模式、身份/当前轮上下文、输出协议与会话隔离。若只支持 task，应显示能力限制；不能把格式错误当 pass，也不能偷偷增加另一个模型来判断。

### 反向暴露为 ACP Agent

让 IDE 或其他 ACP 客户端连接 BoAI 是反向服务能力。本次指定 Mastra 页面核验到的是出站客户端封装，不能据此承诺反向入口已存在。若将来需要，应另设计 ACP server/bridge 的初始化、session、prompt、取消、权限与身份映射，限制暴露的员工/会话，不顺便公开整个本地应用。

这不要求在当前 Electron 产品里立即增加网络服务；ACP 本地客户端方向可以先独立交付。

## 3. A2A：网络 Agent 委派，双向分开设计

### 当前安装版可确认的 API

`@mastra/core/a2a` 导出 `A2AAgent`，实现 SubAgent；有 generate/stream、resumeGenerate/resumeStream。安装 `A2AAgentOptions` 包含 URL、认证 headers、timeout/abort、重试和 `protocolVersion: '0.3' | '1.0'`，默认 0.3。因此 v1.0 支持在这份安装类型中可见，不是仅凭线上新增文档推断。[安装 A2A 类型](../../../node_modules/@mastra/core/dist/a2a/types.d.ts)、[A2AAgent 方法](../../../node_modules/@mastra/core/dist/a2a/a2a-agent.d.ts)。

出站时本产品是客户端，对方 Card 提供执行地址和声明能力；父 Mastra Agent 可以委派，也可由产品 adapter 直接调用。对方仍拥有自己的 prompt、工具、memory 与基础设施。流式声明不足时 wrapper 可返回缓冲结果；不能把“stream API 有返回”当作对方真的逐 token 推送。

入站时通过 Mastra server 另行暴露受选员工与认证端点，需要产品用户/会话/授权映射。普通 Electron 应用安装 core 不自动启动这个 server。A2A Agent Card 的 skills 是对外能力描述，不等同于挂载本产品的 `SKILL.md` 文件或取得资源权限。[安装 A2A 说明](../../../node_modules/@mastra/core/dist/docs/references/docs-connections-a2a.md)、[官方 A2A 页面](https://mastra.ai/docs/connections/a2a)。

### 不能跳过的产品适配

- **群调度仍在本地。** A2A 负责跨进程/网络任务交互，不负责本产品首轮投递、谁自主参与、发言 grant 或 Message 原子提交；不能直接代替 B3。
- **对方工具不属于宿主工具。** 接收一个远程 task 不代表 BoAI 能逐次拦截其内部 shell 或 API 调用。对方声明只读也不是本机沙箱保证；展示实际控制范围。
- **状态等待不同于成功。** `input-required` / `auth-required` 转为对应产品等待，恢复关联原 task/run；不把它们当空回复、失败 pass 或新用户消息。
- **取消要核验到 task 层。** A2AAgent 的 abortSignal 不能单凭类型就推断已发送远端 cancel。当前安装 wrapper 的公开方法没有独立 cancelTask；若要任务取消，需选择具体协议客户端/API 并核验 task 状态。HTTP abort 只是本地请求停止。
- **用量可能未知。** 当前 core wrapper 实现包含 input/output/total 都为 undefined 的 EMPTY_USAGE；不能假设 A2A 自带统一精确 token 计数，更不能记为零。
- **端点与身份要验证。** Card URL、Card 内执行 URL、重定向及 artifact URL 都须经过允许的地址/凭据策略；不把同一认证头自动发往任意新域名。服务能力变化后重新核验。

取消与 usage 的版本依据：[安装 A2AAgent 方法](../../../node_modules/@mastra/core/dist/a2a/a2a-agent.d.ts)、[安装 wrapper 实现](../../../node_modules/@mastra/core/dist/a2a/index.js)。上述产品约束是设计要求，不等于协议声明能自动强制对方执行。

### 恢复限制

安装和线上 A2A 文档明确提示：Mastra server 的 A2A task 记录仍保存在内存，暂停任务需要回到原 server 进程；重启或没有粘性路由的横向部署可能 task-not-found。即使 agent suspended run 使用持久 storage，也不能据此声称 A2A task 整体跨重启可靠恢复。[安装 A2A 恢复说明](../../../node_modules/@mastra/core/dist/docs/references/docs-connections-a2a.md)。

E3 必须把远端 contextId/taskId 与本地产品 run 绑定，区分重连查询/订阅与重发任务；状态未知先核实，不能重复启动潜在副作用。对方服务若提供更强持久保证，以该服务的独立能力核验为准。

## 4. MCP：能力连接，不替代执行后端

MCPClient 消费外部工具/资源，MCPServer 将本应用选择的能力暴露给外部客户端。可以包装 Agent/workflow，但工具调用外壳不等于统一 Agent 运行循环。[官方 MCP 页面](https://mastra.ai/docs/connections/mcp)。

当前官方与 core 附带的参考描述 `@mastra/mcp` 2.x、MCP `2026-07-28`、stdio/Streamable HTTP，以及与旧协议的协商。**本项目没有安装 @mastra/mcp，不能把附带文档当作已安装该客户端的类型证明。** 实施 C1 时锁定包和协议版本，读取其实际 types/peer dependencies，核验目标服务器支持；不得照抄 `@latest` 自动升级现有项目。

安装 core 的 MCPServerBase 只是框架基础接口，包含 1.x/2.x 兼容信息，不是本项目已有可直接配置的 MCPClient/MCPServer 产品实现。[Core MCP 基类](../../../node_modules/@mastra/core/dist/mcp/index.d.ts)、[附带 MCPClient 参考](../../../node_modules/@mastra/core/dist/docs/references/reference-tools-mcp-client.md)、[MCPServer 参考](../../../node_modules/@mastra/core/dist/docs/references/reference-tools-mcp-server.md)。

C1 初期建议只做出站能力连接：

1. 员工选择已配置 server 的部分工具，按员工×会话授权获得 tools/toolsets；不把全部 server 注册表给所有员工。
2. 动态凭据按请求隔离；远程地址/跳转策略与本地进程环境都明确配置。不要把文档中的 stdio 程序启动示例当作应用可自动安装任意依赖的授权。
3. server 工具描述、annotations、resources 和返回正文都作为外部数据；工具自报只读不替代产品审批。server instructions 不自动获得覆盖员工/宿主规则的权限。
4. task 阶段可获得工具；现有 decision/chat/memory 阶段的无工具规则不因连接 MCP 而改变。
5. 工具执行中的认证、补充输入、拒绝、超时和断线独立建模；重试有幂等与预算，不把工具错误格式化为成功。
6. 用户删除/撤销连接后，旧 run 不再使用其凭据和工具。需要发布产物的结果仍走宿主登记。

若 ACP Agent 能接受 MCP server 配置，可能用它桥接部分宿主能力，但这是两个协议的组合适配。它不自动禁用对方自带工具，也不证明能透传现有全部 Skills、知识库和 publish_artifact。把整套本地文件服务以 MCP 暴露给外部 Agent 之前，仍需最小授权、路径与来源检查。

## 5. 实施/验收清单

| 阶段 | 先交付什么 | 必须验收 |
| --- | --- | --- |
| E2（回链） | 一个锁版的 ACP 或受支持本地 Agent，明确 task 入口 | 程序不存在/握手不兼容/需登录可解释；默认许可被覆盖；跨员工/群隔离；阶段能力不夸大；取消和进程清理；私有工具边界；未知 usage 不记零 |
| E3（回链，可选） | 一个远程 A2A Agent 的显式任务调用 | 双 URL/版本/认证核验；input/auth 等待与恢复；取消 task 状态；远端重启失联；产物检查；无重复启动；不替代群调度 |
| C1 MCP | 受控的出站工具/资源连接 | 白名单和凭据隔离；请求审批/拒绝；不可信返回；断线/重试；撤销后迟到结果；chat/decision 无工具；包版本实测 |

E2/E3 的完整员工能力与阶段退出条件以 [后端契约](../4.数字员工与协作重构/04-员工执行后端与能力契约.md) 为准。C1 退出时需完成一个实际只读工具与一个需要批准的副作用工具的集成验证；上述表只是未来验收要求，不是本轮运行结果。

ACP/A2A/MCP 的入站发布能力均另行确定范围、认证、端点生命周期和外部访问规则，不作为出站连接的隐含交付物。S1/S2 的沙箱/技能主线仍负责执行隔离；连接协议不会替代这些工作。

## 6. 核对记录

| 来源 | 已确认范围 | 尚未验证 |
| --- | --- | --- |
| 已实际浏览的 [ACP](https://mastra.ai/docs/connections/acp)、[AcpAgent](https://mastra.ai/reference/acp/acp-agent)、[createACPTool](https://mastra.ai/reference/acp/create-acp-tool) | 客户端方向、包装 API、默认会话/权限行为 | 未安装 ACP 包；具体版本 types、环境/取消实现、目标程序能力 |
| 已实际浏览的 [A2A](https://mastra.ai/docs/connections/a2a) + core `a2a/*.d.ts` / 实现 | 双向角色、当前 0.3/1.0 类型、状态/恢复接口及限制 | 项目服务端/适配器、真实对端、取消与重启行为 |
| 已实际浏览的 [MCP](https://mastra.ai/docs/connections/mcp) + core embedded references | 客户端/服务端用途及新旧协议说明 | MCP 包版本、真实客户端/server type 和第三方 server 行为 |
| [package.json](../../../package.json) / 当前 src | core/libsql/memory 已装；这些连接没有产品集成 | 任何 E/C 阶段实现或通过验收的结论 |

若线上页面与锁定包不同，实施时以锁定包类型/源码及真实协议测试为准，并记录差异。不能因为 core 附带某个包的文档，就声称那个包已经安装或无需兼容验证。
