<!--
[INPUT]: 用户对 DeepSeek-Bot 的架构、Agent/Bot 模式、会话记忆、自动化、连接器与 Codex 子智能体的调研要求；两项目及 DSH 固定版本源码。
[OUTPUT]: 源码事实与BOAI对照；撤回新增话题/UI建议，容量合同归spec第24组；最新增量仅研究架构，入口见同日架构补充调研。
[POS]: ai-docs/2026-10-24-DeepSeek-Bot源码调研与BOAI对比.md，跨项目研究与后续设计输入。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->

# DeepSeek-Bot 源码调研与 BOAI 对比

调研日期：2026-10-24。

最新研究范围：用户明确只继续研究设计架构，不增加 DS Bot 的产品能力或 UI 建议。新增结论见 [架构补充调研](./2026-10-24-DeepSeek-Bot架构补充调研.md)，对照派生状态、一致快照、交接恢复、配置装配、计量与持久化。本文早期功能候选保留为研究背景，不作为本轮开发清单。

用户后续确认：员工跨私聊/群聊记忆是预期设计，页面、独立 workspace 和自动化保持；本次后续只解决 Mastra/API 的上下文容量与连续身份。原新增话题/调整导航建议已撤回。现行规格见 [第24组 Mastra 上下文容量与连续会话](./spec/24.Mastra上下文容量与连续会话/README.md)。Codex 等后端的研究保留为比较资料，不纳入该专题实施或验收。

## 0. 阅读结论与证据范围

这次研究最关键的结论是：DS Bot 并没有让每个 Bot 都变成可随意新建多个话题的 ChatGPT。它仍然主要提供“一个 Bot，一个持续私聊入口”的产品体验；多个底层 Session 用于群成员上下文隔离和长对话分段。它另外保留 DSH 的普通多会话工作方式，二者可以在同一个运行时和界面中共存。

BOAI 已有 Conversation 模型、员工独立 workspace 和跨聊天长期记忆。用户确认这些都是需要保留的设计，普通员工固定主私聊也不需要调整。当前待解决的是 Mastra/API 工作上下文容量：在连续聊天内压缩或切换内部 Session，保留交接与历史定位，继续原工作。现有消息数/字符滑窗具备有限保护，但不等于完整的语义压缩和接续。

本次固定以下源码，后文“当前”均指这些版本：

- DeepSeek-Bot：版本 0.2.1，提交 [1bebe826f74e9a72cabafd3b80602b05af867b38][ds-commit]，提交时间 2026-10-23 23:22:41 +08:00。
- DSH：桌面应用声明依赖 0.2.1-rc.2；对应标签 dsh-v0.2.1-rc.2、提交 [687f282e8625c6b8d11ff58211a90524be2e4317][dsh-commit]。DSH 作为独立仓库读取，避免把最新上游能力误算进 DS Bot 当前版本。
- BOAI：本地 main 提交 6f2cbd631a4e3320c0ba2f129028169dc9a19527。定稿前核对工作区，以下比较以该可复现源码为准，不把其他工作中的未提交候选、历史进度说明或旧验收数量当作该版本实现事实。
- 调研方法：读取入口、领域结构、关键调用链、上游依赖实现及相关测试源码；核对 GitHub 官方 MCP 文档。未安装运行 DS Bot，未执行真实模型、GitHub 授权、定时任务或桌面交互；测试源码用于理解合同，不表示本轮运行了测试。
- 标注原则：“源码事实”是调用链可核对的行为；“推论”是由实现推导的边界；“建议”是 BOAI 的候选方向，尚未成为已批准实施的产品合同。

特别注意两个容易误判的地方：

- DS Bot 仓库还留着旧 app/engine 和 app/ui。当前桌面入口使用 DSH Web 加 Bot 插件，profile 明确移除了 deepseek-bot-engine；不能用旧桌面方案断言当前桌面不支持经典模式。[当前 Profile][ds-profile]
- 插件 README 中关于群聊不读取私聊的概括，不能当成强隐私隔离保证。实现中，首次创建群成员 Session 会附带最多 10 条近期私聊记录，群成员还可以主动调用 read_own_chat。详见第 4 节。[README 的原说明][ds-plugin-readme]、[群会话创建][ds-groups]、[私聊摘要][ds-chat-index]

## 1. 六个问题的直接回答

1. 它的核心是什么？
   DSH 提供模型执行、工具、Session、工作区、持久化、插件和原生子智能体等底座；ds-bot 插件叠加 Bot 身份、团队、群聊路由、记忆、自动分段及 IM 界面。它没有重新写一套完整模型执行循环。[插件入口][ds-index]
2. “经典 Agent”与“Bot”如何共存？
   全局切换主要是挂载或撤下 Bot 的界面替换；Bot 界面里还可以放一个 DSH Agent 入口，下面有多个普通 Session。这两个机制与 Bot 自己的自动分段是三件不同的事。[界面分组][ds-surface]、[普通 Agent 管理][ds-agents]
3. 群聊和私聊是否隔离？
   短期对话历史按个人 Session、群 × 成员 Session 分开；长期记忆分个人、群、团队三类。但个人记忆可进入群上下文，且存在私聊摘要和跨聊天查询。因此它隔离了执行会话，没有完全隔离信息。[群实现][ds-groups]、[记忆实现][ds-memory]
4. 自动化是什么？
   DS Bot 将定时指令投递进已有 Bot 或群 Session，调度回执主要确认消息投递。BOAI 还建模了每次发生、执行计划、Work、运行和交付，执行记录更完整，用户仍沿现有会话查看工作。[DS 适配][ds-schedules]、[DSH 调度][dsh-schedule-runtime]、[BOAI 自动化][bo-automation-service]
5. GitHub 连接器是什么？
   PAT 登录校验、Secret 保存、GitHub 官方远程 MCP 的动态挂载，加上连接状态界面。当前内置实现以 GitHub 为特例，不是已经具备完整 OAuth、多账号和同步索引的通用连接器平台。[连接器][ds-connectors]
6. Codex 子智能体走什么协议？
   DSH 官方可选插件启动 Codex app-server，以 JSON-RPC 完成一次临时线程委托，不是 ACP。BOAI 的 Codex 员工也走 app-server，但支持产品会话、原生线程恢复、流式过程和产品工具桥接，生命周期不同。[DSH Codex][dsh-codex-run]、[BOAI Codex][bo-codex]

## 2. 整体原理：DSH 上的一层 Bot 产品

### 2.1 当前桌面启动链

~~~mermaid
flowchart TD
  A[Electron 主进程] --> B[独立 DSH Home 与 ds-bot Profile]
  B --> C[DSH Host]
  C --> D[DSH Base 与 Web App]
  C --> E[ds-bot 插件]
  A --> F[BrowserWindow 加载 Host URL]
  F --> D
  E --> G[Bot 界面与团队管理]
  E --> H[群路由 记忆 分段 连接器]
  H --> I[DSH Session Controller 与 Agent]
  I --> J[模型 工具 MCP 原生子智能体]
~~~

当前 app/src/profile.mjs 声明三个基础 Bundle：@deepseek-ai/dsh-base、@deepseek-ai/dsh-web-app、ds-bot。用户后装的 Bundle 保留在后面；旧 deepseek-bot-engine 从 Profile 列表移除。app/src/main.mjs 启动 HostProcess，再让 Electron 窗口加载 Host URL。[Profile][ds-profile]、[桌面入口][ds-app-main]

独立桌面有自己的 DSH_HOME/Profile，初次使用的数据路径与工作区由桌面流程管理，不直接覆盖用户原来的 ~/.dsh。作为现有 DSH 的插件使用时，Bot 状态则依附对应 Host 的目录。部署形态会影响数据位置，不能把两个入口的数据目录混为一谈。[桌面说明][ds-app-readme]

### 2.2 Bot 身份如何落到执行器

插件入口注入 DSH 的 llm、tools、systemPrompt、sessionController、sessions、sessionTitle、workspaceRegistry 和 connection 等服务。各功能模块共享 runtime 对象，注册工具、提示词、事件和前端端点。[入口][ds-index]

创建 Bot 时，roster 模块通过 sessionController.create 创建普通 DSH Session，设置工作区及标准 Agent preset，再 resolveAgent；Bot 的模型、权限和能力配置作用在该 Agent 上。由 DSH 负责模型与工具执行，Bot 模块负责决定“谁在什么身份、什么房间说话”。[身份与 Session][ds-roster]

Bot 之间的 message_bot 委托会携带发送方、目标、工作与回传来源等结构化信息。delivery 根据接收方是否在执行，选择 steer 当前轮或 followup 入队，并持久化 Session；结果可异步回到发起方。这属于身份与消息编排，底层仍使用同一 DSH Agent/Session 服务。[消息投递][ds-delivery]

“常驻 Bot”首先意味着持久身份、记录和可恢复会话，不意味着每个 Bot 都永久占一个独立操作系统进程。

其持久化有明确分层：

- state.json：团队、Bot、群、普通 Agent 入口、能力绑定、工作记录、界面偏好与版本等产品状态。
- DSH Session 存储：消息、工具过程、Session 生命周期和恢复所需状态。不是把全部聊天塞进 state.json。
- memory 目录：个人、群、团队的 Markdown 记忆及变更记录。
- 聊天搜索索引：可由原始聊天日志重建的 SQLite 索引。
- secrets.json：独立的凭据文件。

store 还有 Home 锁和只读模式，避免两个 Host 同时写同一团队。文件分层与单写者约束是它简化单机状态管理的关键。[状态存储][ds-store]、[记忆][ds-memory]、[聊天索引][ds-chat-index]

### 2.3 群聊的真实执行链

群的根 Session 主要是共享消息流和路由入口。groups 模块拦截该 Session 的 llm/stream，合成 group_relay 工具调用，再调用成员各自的 Agent；它不是让一个额外的大模型“群本体”先推理一次。[group_relay 与 llm/stream][ds-groups]

初始发言对象根据 @、管理员、全员等设置选择；成员的发言按群规则进入共享记录，其他成员拿到尚未看到的增量。默认轮数预算约为成员数的三倍，触达后需要用户继续。后台工作另有结果回传与唤醒逻辑，不应把轮数预算理解成所有后台任务的固定时限。

群系统维护发言顺序、已读位置、工作/问题来源和回传关系；Bot 的执行仍然交给 DSH。标题、记忆回顾、上下文管家等辅助调用仍可能使用模型，所以“群根不调用模型”不等于群协作没有额外模型成本。

BOAI 对应的分层是 DigitalAgent 产品身份、Conversation 消息空间、Work/AgentRun 执行、Mastra 或原生运行时适配。两者都能做 IM，多人协作的数据与交付合同则明显不同；不能把 ds-bot 当作替换 BOAI 整个 runtime 的现成模块。[BOAI 领域][bo-domain]

## 3. “经典 Agent 模式”和“Bot 模式”实际有三层

### 3.1 第一层：整个应用的显示模式

surface.js 的核心判定非常直接：

- mode = bot：挂载 Bot 的 shell 替换。
- mode = bot 且 plain = false：再挂载 Bot 的 conversation 替换。
- mode = agent：两组都卸载，显示 DSH 原生界面。

shell 包括侧栏等整体外观；conversation 包括对话区、输入、模型和权限相关的 Bot 展示。每组安装返回 disposer，卸载按反向顺序执行，安装失败会撤销已经安装的部分。模式保存在 localStorage。[surfaceGroups/groupsFor][ds-surface]

client/index.js 的 setSurface 清理浮层、保存模式并调和这些挂载；侧栏提供返回 Bot 的入口。切换逻辑本身没有把 Bot 数据转换成普通 Agent，也没有删除原会话或停止 Host 后台工作。[客户端入口][ds-client]、[侧栏][ds-sidebar]

这是界面组织方式，不是“一个用 API、另一个用 ACP”，也不是切换两套相互独立的数据库。

### 3.2 第二层：Bot 界面里的 DSH Agent 入口

state.agents 与 state.bots 分开管理。当前允许一个 DSH Agent 入口，入口内维护 sessions 数组，支持创建、接纳、改名、归档普通 Session。[agents 模块][ds-agents]

打开这些 Session 时使用 plain 视图：保留 Bot 侧栏，但撤下 Bot 专属对话替换，正文回到普通 DSH 会话。它不会被识别成 Bot，也不会注入该 Bot 的身份和个人记忆；团队管理等 TEAM_TOOLS 被限制。接纳外部会话有条件，并非打开任何历史 Session 都自动变成团队成员。[客户端][ds-client]、[工具集合][ds-constants]

因此，用户可以在同一产品里有“团队联系人”和“传统多任务会话”。它没有要求所有普通 Agent 都参加群聊、带 Bot 人格、读团队记忆。

### 3.3 第三层：同一个 Bot 的隐藏 Session 分段

Bot 私聊长了以后，系统可以压缩当前上下文，或者换一个新的 DSH Session，并更新 bot.sessionId，旧 Session 放进 bot.segments。用户仍然看见同一个联系人及连续聊天记录。[parts][ds-parts]

这解决的是上下文容量和连续身份问题，不是“项目 A 与项目 B 分开工作”的产品话题问题。自动分段会携带交接说明、近期消息和个人记忆，不会天然生成独立项目边界。

### 3.4 对 BOAI 的取舍：只借鉴内部上下文维护

用户已确认保留当前联系人和聊天设计，本次不引入全局模式切换或独立话题入口。可借鉴的是 Bot 身份、产品 Conversation、内部运行 Session 和历史分段分别管理。

BOAI 的落点只在 Mastra/API：当前工作上下文需要腾出容量时原地压缩，或生成交接并换内部 Session；员工、workspace、消息历史和长期记忆持续存在。具体方案归 [第24组01](./spec/24.Mastra上下文容量与连续会话/01-容量管理与上下文接续设计.md)。

## 4. DS Bot 的群聊、私聊与记忆

### 4.1 会话与身份的数据关系

~~~mermaid
flowchart LR
  B[Bot A 稳定身份] --> P[私聊当前 Session]
  P --> PH[私聊历史 segments]
  B --> G1[群 G1 的 A Session]
  B --> G2[群 G2 的 A Session]
  R1[群 G1 共享消息流] --> G1
  R1 --> GB[群 G1 的 B Session]
  G1 --> GH[该成员在 G1 的历史 segments]
  B --> M[个人记忆]
  G1 --> GM[群 G1 共享记忆]
  P --> T[团队记忆]
  G1 --> T
~~~

具体字段是：

- bot.id：稳定 Bot 身份；创建时可能与首个 Session id 相关，但后续不能当成“永远等于当前 Session”。
- bot.sessionId、bot.segments：当前个人执行上下文及历史分段。
- room.id：群根 Session 与共享群记录入口。
- room.sessions[botId]：这个 Bot 在这个群的专用 Session。
- room.segments[botId]：该成员群上下文的旧分段。
- room.seen[botId]：该成员已经读到的群消息位置。

因此，A 在私聊、G1、G2 的短期历史不是同一份模型上下文。成员接收公共群记录的增量，再在自己的 Session 内继续推理。[groups][ds-groups]、[parts][ds-parts]

### 4.2 它仍然会把私聊内容带进群模型上下文

这里必须把三个事实放在一起：

1. 群成员的完整 Session 与私聊 Session 分开。
2. groupSessionFor 首次创建成员群 Session 后，调用 ownChatBrief(member)，在首轮群提示前拼入私聊近期摘要；常量 OWN_CHAT_BRIEF 为 10，单条文字有长度上限。这里是最近记录的文本摘取，不应误称为完全独立的模型总结。
3. 群成员还能调用 read_own_chat 搜索或读取自己的私聊记录。群里会出现查询提示，但该工具没有每次先向用户申请批准的产品流程。

ownChatBrief 会提示模型“只分享群需要的信息”，但这只是对输出的行为要求。信息已经进入群成员此次模型请求，并不是“私聊根本不可访问”。[groups.js 的 groupSessionFor/read_own_chat][ds-groups]、[chat-index.js 的 ownChatBrief][ds-chat-index]、[常量][ds-constants]

反向也存在 read_group_chat：成员可从自己的聊天中查看其有权访问的群记录，Main Bot 的访问范围更广。跨房间理解是设计能力之一，不能同时把它描述成默认的强隔离。

这不意味着私聊原文自动显示在群 UI，也不证明已经发生对其他人的实际泄露；它说明模型可见范围大于群消息本身，公开表达是否克制依赖提示词和模型行为。

### 4.3 三类长期记忆

以下描述针对默认开启的记忆功能；配置 memory = false 可以整体关闭，memoryReview = false 则保留显式记忆工具而关闭自动回顾。

memory.js 实现三类目录：

- memory/bots/<botId>：个人记忆，随 Bot 身份保留。
- memory/groups/<roomId>：群共享记忆，不是每个成员各自存一份相同群笔记。
- memory/team：团队公共记忆。

每类以 MEMORY.md 为主，配 topic 文件；有增删改日志、快照、回顾游标和删除时归档。当前条目上限约 300 字符，主文件约 4,000 字符，专题文件约 16,000 字符，最多 40 个专题。这是字符配额，不等于精确 token 预算。[memory.js][ds-memory]

提示词装配通常是：

- 私聊：个人记忆 + 团队记忆。
- 群成员会话：个人记忆 + 团队记忆 + 当前群记忆。
- 记忆前缀在 Session 内保持快照，便于缓存；检查点或新分段刷新。需要立即看到新记忆时可调用 recall。

工具写入默认范围与当前聊天有关：

- 私聊 remember/forget 默认写个人。
- 群内默认写当前群。
- 群内可以明确指定 own，仍然写个人；具备 Main/管理员权限的 Bot 可按规则写团队。
- Main Bot 还有管理其他 Bot 记忆的权限；普通成员不能任意指定别的群读写。

所以“群记忆独立”主要是有独立存储对象和默认写入目标，不能推出所有群信息都永远不会进入个人/团队记忆。

### 4.4 自动记忆回顾

除显式 remember 外，还会对新聊天记录做模型回顾：

- 私聊按 Bot 回顾，个人记忆为主要归档位置，具备权限时可涉及团队。
- 群以群为单位选择管理员或可用成员作为记忆维护者，统一回顾一次，避免每个成员重复提取同一段群记录。
- reviewGroup 明确禁用 teamWrites，自动群回顾的写入目标是群记忆。
- 处理后保存游标，记录来源定位和变更；输入、输出有数量与格式约束。

“自动群回顾只写群”与“模型在群里显式写 own/team”是两条路径，不能只检查前者就断言不存在记忆跨范围流动。[reviewChat/reviewGroup/applyReview][ds-memory]

### 4.5 长对话续接与历史找回

steward 根据上下文窗口和剩余空间决定继续、压缩还是换 Session。默认检查点比例约为 80%，硬边界约为可用上下文的 95%；实际还扣除预留空间，因此不能把它简单等同于模型标称窗口的固定百分比。[上下文管家][ds-steward]

Bot 拥有的 Session 由 parts 接管维护，并关闭 DSH 对这些会话的默认自动压缩，避免两个机制争抢；普通 DSH 会话及其他子智能体仍走原有策略。压缩保留检查点和部分原始用户信息；换 Session 则生成交接说明、保留近期消息、保存旧分段。[parts][ds-parts]

旧内容通过 read_own_chat 找回。chat-index 使用 SQLite FTS5/trigram 与 BM25，短查询有 LIKE 路径；索引不可用时退回日志扫描，原始聊天记录是权威来源。查询支持分段与消息位置锚点，但有分页、数量和时间限制。[聊天索引][ds-chat-index]

这是“持久原文 + 有限工作上下文 + 可检索历史”，不是把所有历史无损常驻模型，也不是依赖向量数据库实现无限记忆。是否能及时找回正确事实仍需要真实任务评估。

## 5. BOAI 现在到底如何处理这些问题

### 5.1 普通员工一个主私聊，是明确的产品约束

BOAI 的 Conversation 已有 id、kind、purpose、mainPrivate、channel、memoryScope 和 memoryContextRef。purpose 区分 personal、automation、core、channel、channel-internal 等用途；Work 与 AgentRun 独立存在。[领域类型][bo-domain]

service.ts 的 saveConversation 在创建普通 direct 时主动寻找该员工现有主私聊，找到就返回原 Conversation。普通员工新私聊会标成 mainPrivate；核心助手走首条非空消息建会话的独立入口。[saveConversation][bo-service]

所以观察到“只有 Bobo 可以多个会话”是成立的产品体验；但“所有员工、群聊实际上都在一个 Conversation”不符合数据实现。普通员工也有各自独立的群、自动化和渠道会话。[消息接收与主私聊恢复][bo-message-reception]

现行设计可追溯到 [员工主私聊与群聊领域设计](./spec/16.数字员工渠道绑定/03-员工主私聊与群聊领域设计.md)。用户明确保留这一规则，本次容量维护不修改主私聊去重、联系人或 Conversation 创建方式。

### 5.2 API 员工的上下文来源

普通 API 员工主要从产品存储投影当前 Conversation 的消息，再创建本轮/阶段所需的 Mastra Agent。message-projection 选择同一 Conversation 中符合条件的消息，控制数量和文本预算，并保留当前触发信息。这里并不会自动把该员工所有群的聊天原文无上限拼起来。[消息投影][bo-message-projection]、[Mastra 执行][bo-mastra-engine]

Bobo 有额外的 BoboConversationMemory：非任务、核心助手、purpose 为 core 且不是渠道会话时，使用 bobo:<conversationId> 的 Mastra thread，working memory 也按 thread。它解决核心讨论的连续工作记忆，不意味着普通员工没有 Conversation 或完全没有记忆。[Bobo 会话记忆][bo-conversation-memory]

因此，本次为普通 Mastra/API 员工补容量管理，应复用现有消息投影和员工装配，不需要创建新的产品 Conversation，也不需要复制 Bobo 的核心身份。Bobo 的 Mastra Memory 路径只做必要的容量兼容。

### 5.3 本机员工已经按“员工 × 会话”隔离原生线程

native-sessions 的键包含 agentId、conversationId、chat 以及运行时信息。继续旧原生会话还要校验完成回执、配置/来源/材料指纹、协议版本等；Codex 还要求可确认的 turnId。[本机会话复用][bo-native-sessions]

同一个 Codex 员工 A：

- 主私聊对应一个原生线程关系。
- 群 G1 中 A 的执行对应另一个关系。
- 群 G2 中 A 的执行再对应另一个关系。

产品群消息可共享，原生执行上下文按成员和群独立。原生线程持久可恢复不等于 app-server 进程永久驻留。

### 5.4 员工长期记忆贯通不同聊天

BOAI 的员工长期记忆首先按 ownerAgentId 归属，召回还区分 useScope：employee、conversation 或指定 context。employeeMemoryAccess 检查来源会话成员资格、来源消息状态、资源授权、材料范围与运行快照有效性。[记忆策略][bo-memory-policy]、[来源校验][bo-service]

默认行为需要特别明确：

- 一般聊天的提取/观察沿 conversation.memoryScope，未设置时默认 employee。
- 因此同一员工的长期记忆可以跨主私聊和多个群使用，并不是一换 Conversation 就全部清空。
- 私聊来源的 disclosure = private 会加上不要主动公开私人原文/细节的提示；这个标签本身不等于召回前硬阻断。
- 将来源聊天设置为“仅此聊天”（memoryScope = conversation），会在召回前限制跨会话使用；更改范围还有既有记忆收紧路径。
- 渠道会话创建时明确设为 conversation 范围。普通群的创建逻辑没有一律强制设置此范围。
- 另一员工不能仅凭同处一个群，直接召回 owner 为你的这名员工的所有私人笔记。

tests/memory-recall.test.ts 的 UM01/05 明确覆盖“本人的私有背景跨聊天”；UM04 覆盖限制先于相关性/置顶生效。这是测试源码表达的合同，本轮没有重新运行测试。[召回实现][bo-memory-recall]、[合同测试源码][bo-memory-tests]

原始观察记录也不是绕过限制的第二通道：召回会检查已存记忆的来源、删除/过期/归档/替代等状态。应继续保留这些失效规则，不能为了新建话题再接一个不受控的摘要缓存。

### 5.5 用一个例子区分“上下文隔离”与“信息隔离”

假设用户先在 A 的私聊提到“周五需要照顾家人”，之后在 G1 讨论排期，在 G2 讨论项目需求：

- DS Bot：A 的三个 Session 分开；第一次进群时可能直接拿到近期私聊摘取，个人记忆也会进入群提示，且能查询自己的私聊。它可以理解跨场景安排，也可能让私人信息进入群模型上下文。
- BOAI：G1 的常规消息投影只取 G1，但 A 可能通过 employee 范围长期记忆召回这条私人背景。若该私聊设为“仅此聊天”，来源范围检查应阻止它跨入 G1/G2。
- 两者都不能仅靠“数据库分了会话”来证明私人信息不会进入群。需要检查实际模型请求可见内容及工具查询权限。

用户已经选择“同一个员工在不同聊天里记得自己的经历”作为默认行为，这符合独立员工的产品设计。本次保持默认跨聊天召回以及已有显式来源限制，不新增记忆隔离政策；上述比较只说明短期上下文与长期记忆不是同一个概念。

### 5.6 DS Bot 有、BOAI 尚不等价具备的群记忆对象

DS Bot 的群记忆有独立 owner：群本身。成员共享同一份群笔记，自动回顾由一个维护者完成。

BOAI 当前主要是员工拥有记忆，在各自可访问的 Conversation 中提取、召回；群共享消息和知识资料不等于一个独立的群长期记忆库。“仅此聊天”限制的是该员工记忆的使用范围，也不自动变成所有成员共同维护的一份记忆。

如果需要统一的“这个项目已经确定什么”，可考虑增加群/项目共同记忆对象；仍需保留原始来源、版本、删除与撤权传播。不要拿实验性的全局 user-memory-provider 替代它；该模块与员工记忆不同，且对缺少来源级联撤销的外部保存方式已有暂停处理。[外部用户记忆适配][bo-user-memory]

## 6. 自动化任务：定时发消息与产品任务执行

### 6.1 DS Bot 的自动化入口

ds-bot/src/host/schedules.js 是 DSH schedule 服务的产品适配层：读取当前团队拥有的计划、创建计划、删除计划。创建时把目标设为 Bot 当前私聊 Session，或群的 room.id；定时内容就是给目标会话的指令。[DS Bot 调度适配][ds-schedules]

客户端提供一次、每天、每周、每隔一段时间等方式；上游 DSH 还支持 after/at/every/daily/weekly/cron 等选择器。界面选项与底层服务支持范围不同，不能仅凭 DSH 支持 cron 就说 DS Bot 当前 UI 暴露了完整 cron 编辑器。[任务界面][ds-schedules-ui]、[DSH Schedule 类型][dsh-schedule-types]

### 6.2 DSH 如何真正触发

~~~mermaid
sequenceDiagram
  participant UI as DS Bot 界面
  participant S as DSH Schedule
  participant DB as Task 存储
  participant A as 目标 Session
  participant M as 模型执行
  UI->>S: 创建目标 Session 的定时指令
  S->>DB: 保存 active 计划
  S->>S: 为最近到期时间设置 timer
  S->>A: 到期后 resolveAgent 与 followup
  S->>A: flush 消息持久化
  S->>DB: 保存投递回执与下一时间
  A->>M: 收件箱指令进入执行
  Note over S,M: 执行可与回执更新交叠 调度不等待模型完成
~~~

实现要点：

- task 经 storage-domain 持久化，记录 sessionId、状态、调度参数和投递历史；具体存储后端由 DSH 配置决定。
- Host 启动读取 active 任务，只维护最近到期的定时器；管理修改与投递串行处理。
- 冷 Session 会通过 sessionController 恢复，恢复后再次采样时间，处理时钟回拨。
- 到期使用 followup 入队，不抢占或取消当前正在执行的一轮；消息 flush 后更新任务投递回执。
- 一次任务转 inactive；周期任务计算下一次。离线错过多个周期时有合并处理，不是每个历史周期无限补跑。
- 需要 Host 进程运行；不是托管在 GitHub 或其他云平台的常驻任务。

源码入口见 [runtime][dsh-schedule-runtime]、[storage][dsh-schedule-storage]；精确回执合同见 [上游 Schedule 文档][dsh-schedule-doc]。

### 6.3 三个可靠性边界

第一，投递成功不等于工作成功。消息持久化以后，模型仍可能失败、权限不足、等待用户或产物未交付；schedule 本身不提供模型结果确认、执行取消和外部通知通道。

第二，Session inbox 持久化与 task 回执更新不是跨存储事务。DSH 文档明确说明：如果在前者成功、后者写入前崩溃，恢复可能重复投递；不能把这套机制称为 exactly-once。投递失败通常保留任务并记录警告，后续管理变更或 Host 重启会重试，不是无限快速重试。[上游 Host delivery 合同][dsh-schedule-doc]

第三，Bot 换 Session 分段时，moveSchedules 先在新 Session 创建，再删除旧计划。推论：两步之间失败可能留下重复计划；every 类计划重建还需要关注相对节奏是否移动。这是由源码操作顺序得出的风险点，本轮没有复现故障。[moveSchedules][ds-schedules]

此外，ds-bot 的 resume.js 另用 inflight.json 记录进行中的轮次与待消费消息，重启后尝试接续一次，并提示模型先检查已完成动作；再次中断不会无限自动续接。这是 Bot 恢复策略，不是 scheduler 的事务保证，也不能保证外部写操作不重复。[中断恢复][ds-resume]

### 6.4 BOAI 的完整执行记录与连续聊天呈现

BOAI 已用 Mastra 原生 schedules/workflow 与 LibSQLStore 做时钟和触发存储；工作流主要负责把触发交给产品受理，retryConfig.attempts 为 0，不让调度器直接重试业务。员工人格行为与用户自动化使用不同 workflow，不能混成同一种计划。[原生调度适配][bo-native-schedules]

产品层还包括：

- AutomationDefinition：员工/群归属、执行方案、通知策略、会话策略，以及 revision、executionRevision、scheduleGeneration。
- AutomationOccurrence：本次触发的稳定身份、时间、受理状态、执行版本、Conversation、runIds、resultMessageIds、交付状态。
- claim：按自动化、调度代际、时区、逻辑时间槽等识别同一次触发；手工触发也有请求身份。
- 准入检查：过期/暂停/配置变化、错过触发窗口、员工忙碌、同计划已执行、并发容量等情况有显式跳过记录。
- 执行计划：群自动化可包含员工分工和依赖，验证依赖环与最终贡献关系，落实到真实 Work。
- 会话策略：可为一次执行创建独立 Conversation；旧数据仍有 existing-conversation 兼容路径。
- 交付与通知：执行过程、最终结果、交付状态分别记录；需要在主私聊/群呈现的消息通过有来源的投影回流。

对应实现见 [仓库与 claim][bo-automation-repository]、[自动化服务][bo-automation-service]、[分工计划][bo-automation-plan]、[消息投影回主会话][bo-message-reception]。

重启恢复时，BOAI 对没有完整产品证据的触发或执行保留 needs_review、interrupted、unknown 等状态，不自动重放未知外部效果。这个选择比“让模型再检查后继续”更保守，但也要求产品提供明确继续与核对入口。

同样不能据此宣称 BOAI 已实现所有外部系统 exactly-once。受理幂等、产品存储事务与 GitHub/文件/浏览器等外部副作用仍是不同层；当前材料只是源码结构比较，没有本轮运行证明。

### 6.5 BOAI 保留现有自动化设计

用户确认 BOAI 自动化的产品呈现已经简洁：用户仍在员工或群的同一个会话里查看工作，内部执行可以使用不同 Session。当前 occurrence → Work/Run → delivery 记录和现有 UI 均保持。

容量维护发生在 Mastra 执行上下文内部；不能因换 Session 再次触发自动化、重建业务任务、重复通知或交付，也不让用户管理执行分段。现有领域合同见 [员工与群聊自动化](./spec/5.Mastra能力扩展/11-员工与群聊自动化设计与实施计划.md)。

## 7. 连接器：GitHub 是怎样接入的

### 7.1 当前是一个薄的产品封装

DS Bot 连接器的核心不复杂：

1. 用户在连接器界面输入 GitHub PAT。当前不是 OAuth 浏览器回调流程。
2. signIn 携带 Bearer token 请求 GitHub /user，读取 login，确认凭据对应账号。
3. token 通过 Secret 服务以 GITHUB_TOKEN 保存；产品状态只保存 login、connectedAt 等账号信息。
4. 动态导入 @deepseek-ai/dsh-mcp-client，挂载 Streamable HTTP MCP client。
5. 默认连接 https://api.githubcopilot.com/mcp/，请求头包含 Authorization 与 X-MCP-Toolsets；默认工具组为 context、repos、issues、pull_requests。
6. MCP 工具通过 mcp__github__<tool> 命名暴露；产品提供 off、connecting、ready、error 状态及重试、断开。

token 更新会串行重新挂载；断开删除 Secret、移除账号状态并 dispose 原 MCP 插件。源码将 signIn 分成独立函数，便于未来换认证方式，但不能把这种预留扩展点写成已经实现 OAuth。[host/connectors.js][ds-connectors]、[client/connectors.js][ds-connectors-ui]

GitHub 官方文档也支持该远程 MCP 端点、工具组选择以及只读等服务端选项。实际可用工具仍受 token、账号、组织和仓库权限约束。[GitHub 官方远程 MCP 文档](https://github.com/github/github-mcp-server/blob/main/docs/remote-server.md)

### 7.2 授权范围与凭据保存

DS Bot 的 GitHub MCP 挂在插件公共 context，因此对使用该全局工具上下文的 Bots/Sessions 可见；它没有在该连接器实现里逐个检查 Bot 绑定名单。与此不同，capabilities.js 的技能/MCP/packs 能力有独立的 Bot 绑定机制，不能混淆。[连接器][ds-connectors]、[能力绑定][ds-capabilities]

凭据方面有一个值得借鉴的细节：新建 GITHUB_TOKEN 时 scope 为空数组，默认不把原始 token 注入任何 Bot shell；MCP 由 Host 在内存中构造 Authorization 头，工具调用不需要模型知道 token。若 Secret 原来存在，更新时保留其旧 scope。[连接器 Secret 写入][ds-connectors]

不过 secrets.json 的保护是本地文件权限 0600、替换写入和文本脱敏；它仍是保存 Secret 值的 JSON 文件，不是操作系统钥匙串加密。脱敏覆盖若干字面、JSON 和 URL 编码形式，也不能据此声称能够阻止任意编码外传。[Secret 实现][ds-secrets]

有三个状态不能等同：

- /user 成功：token 可识别账号。
- MCP ready：连接及工具初始化成功。
- 某个仓库某个操作成功：还需要对应的资源权限与实际调用回执。

在本次固定版本的连接器代码里，没有看到 GitHub 仓库全量同步、webhook 订阅、知识索引或自动轮询。这里“连接 GitHub”主要指 Agent 可以按需调用远程工具，并不等于“GitHub 内容已同步到本地知识库”。

### 7.3 BOAI 已有哪些底座

BOAI 目前缺的是更清楚的“连接器”产品层，而不是从零缺少外部工具接入：

- DataSource/SourceService 已抽象 API、MCP 等来源；员工用 sourceIds 绑定，核心 Bobo 有可访问全部启用来源的现有规则。
- source-provider 使用 MCP SDK，支持 Streamable HTTP、SSE、stdio；会枚举工具、处理目录变化、限制目录规模和调用时间。
- 运行时通过版本化来源引用和按 run/source 的租约使用工具；删除、停用、换配置有失效、取消与排空路径。
- API 员工与原生员工都能通过产品能力调用来源；原生侧有 inspect_data_source/call_data_source 桥接。
- 凭据经主进程 Vault 保存，Electron safeStorage 可用才加密，拒绝 basic_text 回退；公开配置与秘密分开。

对应源码见 [来源领域][bo-sources-domain]、[SourceService][bo-source-service]、[MCP 传输][bo-source-provider]、[Vault][bo-vault]、[原生产品工具][bo-native-products]。

当前 HTTP MCP 公共配置主要是 URL 与 none/bearer 认证。通用额外请求头、OAuth 登录回调、token 刷新、连接器账号目录不是上述 transport 已经自动具备的产品能力，不能把“支持 MCP”表述为这些全部完成。

### 7.4 建议的 GitHub 连接器第一版

建议将连接器定义为“品牌/账号/认证/状态/员工授权”产品入口，底层继续复用 DataSource、Vault 和 SourceService：

- ConnectorDefinition：GitHub 的名称、图标、固定端点、支持的认证方式、可用能力说明。它是模板，不包含用户 token。
- ConnectorAccount：用户连上的账号、关联 sourceId、非秘密账号信息和认证状态。Secret 仍归 Vault，避免复制存储。
- SourceService：实际连接、目录、调用、取消、来源版本与执行快照，继续作为执行权威。
- 员工授权：复用 sourceIds/原权限体系，不因在设置里连了 GitHub 就隐式授权所有普通员工。Bobo 既有默认范围要在产品说明中明确。

首版使用 PAT 就能完成真正可用的闭环，但文案应叫“使用访问令牌连接”，不能伪装成 OAuth。连接后展示账号、能力目录、授权员工和可核对的状态，首次验收使用用户指定仓库及明确动作。

需要补的具体缺口：

1. GitHub 品牌预设和账号信息探测，将认证错误与 MCP 服务错误分开。
2. 工具组选择。可使用官方支持的服务端 URL 方案，或给现有 MCP 配置补受约束的非秘密头；不要把 token 复制进通用配置字段。
3. 凭据更新/断开与正在运行的来源租约、模型上下文、工具目录缓存联动，沿现有失效语义处理。
4. 若将来增加 OAuth，再单独实现回调身份校验、刷新、失效、账号切换与撤销；不是在 PAT 输入框外加一层按钮就完成。
5. 若将来需要知识同步，将同步任务和数据索引另行建模，不把查询工具连接成功当成同步完成。

连接器不宜再引入一套与现有员工权限重叠的任意限制开关。具体操作权限继续由远端授权范围、现有工具分类/审批和员工配置共同约束；服务端只读能力可以作为明确的预设选择，但必须与实际远端能力一致。

## 8. Codex 子智能体与 BOAI 原生员工

### 8.1 DS Bot 实际使用 DSH 官方扩展

“Codex 子智能体”来自可选 Bundle @deepseek-ai/dsh-subagent-codex。启用后注册 codex provider 和全局 subagent_codex 工具；并非 ds-bot 自己实现 Codex 协议，也不是每个新 Bot 默认变成 Codex 员工。启用只注册能力，真正收到委托才启动进程。[Bundle][dsh-codex-bundle]、[Provider 注册][dsh-codex-index]

本次固定包依赖 @openai/codex 0.153.4，使用包携带的兼容 CLI 启动 app-server --stdio，不在失败时静默退回系统 PATH 上另一版本的 codex。原生登录与配置仍由 HOME/CODEX_HOME 等环境确定；继承环境中的凭据型变量会清理，再叠加显式 env。[包版本][dsh-codex-package]、[运行实现][dsh-codex-run]

### 8.2 一次委托的协议过程

~~~mermaid
sequenceDiagram
  participant P as DSH 父 Agent
  participant S as DSH Subagent 服务
  participant C as Codex app-server 子进程
  P->>S: subagent_codex 独立文本任务
  S->>C: 启动进程与 initialize
  S->>C: initialized
  S->>C: thread/start ephemeral=true
  S-->>P: 已接收与 child id
  S->>C: turn/start 文本输入
  C-->>S: 指定 thread/turn 的完成事件
  S->>S: 选择答案
  S->>C: 清理进程及其子进程
  S->>S: 汇总执行与清理结果 保存终态
  S-->>P: 异步完成通知
~~~

其关键特征是一次性：

- 一次委托对应一个新进程、一个临时 thread、一个 turn。
- 接收自包含文本任务，不自动复制父 Agent 的完整上下文；provider 声明不继承父上下文。
- 不提供该 child 的 follow-up、resume 或进程池，也不创建对应的本地 DSH 子 Session。
- 工作目录来自选定的 child cwd，可与父任务工作区一致；“新线程”不等于“独立文件系统沙箱”。
- 以准确 thread/turn 的 turn/completed 为完成依据。
- 选择最后的 final_answer；无此阶段则依次考虑 partial_answer、无阶段消息；不拿 commentary 充当最终答案。
- 父会话收到 child id 和最终结果/安全诊断，通常不接收原始推理、工具日志、stderr、使用量或完整过程。

实现见 [run.ts][dsh-codex-run]、[JSON-RPC wire][dsh-codex-wire]；产品合同见 [该 Bundle 的 README][dsh-codex-readme]。

### 8.3 权限模式也是无人值守设计的一部分

Provider 有三种固定配置：

- never：approvalPolicy 为 never，不覆盖 sandbox，沿原生沙箱配置。它不是“默认只读”的同义词。
- approve-for-me：on-request + auto_review + workspace-write，由 Codex 自动审核，不走宿主人工确认。
- dangerously-bypass-approvals-and-sandbox：显式选择后使用 danger-full-access 和 never。

交互式审批/补充输入请求由 provider 按非交互规则回答、拒绝或报错，不能像普通聊天一样随时把问题转给用户再继续。它更适合一次说清边界的后台编码委托。[权限与限制][dsh-codex-readme]

### 8.4 BOAI 并不是“统一用 ACP”

当前实际协议分别是：

- Codex：codex-app-server，thread/start 或 thread/resume，再 turn/start；不是 ACP。[Codex conversation][bo-codex]
- Claude：原生 CLI 的 stream-json 输入/输出及权限处理，带 session/resume 身份；通过 BOAI 工具桥接进入产品能力。[Claude conversation][bo-claude]
- Pi：运行时插件的原生 RPC 接法。[运行时目录][bo-runtime-catalog]
- OpenCode：运行时插件的 ACP 接法。[运行时目录][bo-runtime-catalog]
- 旧 acp-local：仍有兼容边界，例如当前 saveConversation 不允许它直接进入自主群聊；不能用这个遗留分支概括所有本机员工。[创建群校验][bo-service]

MCP 是工具连接，ACP/app-server/stream-json/RPC 是驱动不同原生 Agent 的协议路径，产品层员工和群聊是再上一层。不能因为都能启动外部程序就把它们算同一种接法。

### 8.5 BOAI Codex 与 DSH Codex 的核心差异

两者都使用 app-server；主要差异是产品生命周期：

- DSH：父 Agent 把一次独立任务交给临时 Codex child，完成后收一个结果；child 本身不是团队联系人。
- BOAI：Codex 可以是有名字、能力、主私聊、群成员资格和长期产品记忆的数字员工；原生 thread 随员工 × Conversation 恢复使用。
- DSH：委托结果经过精简，父上下文不承载完整过程。
- BOAI：原生流式事件、审批/问题、工具调用、协作子进程事件、材料与交付映射进入产品执行记录。
- DSH：没有把 BOAI 的产品工具、员工来源权限、材料和 Work 合同自动带进 child。
- BOAI：dynamicTools/boai 工具桥将原生员工接回产品能力，产物沿原交付事务处理。[Codex 工具与事件桥][bo-codex]、[原生产品工具][bo-native-products]

原生 Codex 自己产生的子智能体，是本轮执行资源；BOAI 的 delegate_work 则是委派给产品里的另一员工。二者也不应共用一个“员工数量”概念。

### 8.6 是否需要给 BOAI 再加一次性子智能体

可以作为单独能力评估，但不必替换当前 Codex 员工。适用场景是“让当前员工临时调用编码专家，只拿回答案或产物，不建立长期联系人”。

可借鉴的工程细节包括：固定可复现的原生版本、明确 child 身份、准确终态判断、严格区分 commentary 与答案、取消后等待进程清理、把失败分成启动/权限/协议/执行阶段。

如果 BOAI 增加这种委托，仍应绑定父 Run/Work、授权材料、工作目录、原审批策略、取消和交付回执。不能因为是临时 child 就绕过来源权限、默认全权限，或将“进程退出”直接当成工作成功。

## 9. 用户确认后的 BOAI 方向

早期建议把问题扩展为新增话题和调整导航，偏离了用户实际需求，现已撤回。当前决定如下：

- 员工是独立、持续的数字员工，保留自己的 workspace、人格、技能、配置与装配方式。
- 私聊和群中的经历可以进入同一个员工的记忆，默认跨聊天召回保持。
- 当前页面、联系人、连续聊天和自动化设计保持。
- 只为 Mastra/API 员工补齐容量检测、压缩或内部 Session 轮换、交接、历史定位与原工作接续。
- 群共同记忆可以作为补充单独添加，不是容量管理的前置依赖。
- Codex、Pi 等原生后端不属于本次后续实施或验收范围；第8节只保留前期协议比较。

Mastra/API 的内部 contextSessionId 是 BOAI 管理的工作上下文身份，不假定供应商有可恢复的服务端 Session。产品 conversationId、员工 identity/workspace 和 Work/Run 都沿原合同。

## 10. 现行规格与后续边界

本轮后续仅新增 [架构补充调研](./2026-10-24-DeepSeek-Bot架构补充调研.md)，不扩展产品/UI 范围；其中容量相关机制继续归下列既有规格，其他机制只是对照与条件参考。

现行设计与验收统一归 [第24组 Mastra 上下文容量与连续会话](./spec/24.Mastra上下文容量与连续会话/README.md)：

- [01 容量管理与上下文接续设计](./spec/24.Mastra上下文容量与连续会话/01-容量管理与上下文接续设计.md)：现有滑窗、Mastra处理器/摘要能力、容量预算、内部Session与segments、来源锚点、故障恢复及代码落点。
- [02 实施步骤与验收](./spec/24.Mastra上下文容量与连续会话/02-实施步骤与验收.md)：MC0–MC4、固定验收场景与唯一实际进度。

连接器、群共同记忆与临时原生委托仍是独立议题，不能混入这次容量实现。研究中有价值的原理和源码事实保留，但此前P0–P4的“新增话题/界面改动”路线不再作为开发依据。

当前仅文档，未修改产品代码、调用模型、连接GitHub账号或运行产品验收；后续实施按用户新的具体指令执行。

## 11. 源码导航与资料

外部源码链接固定到本次提交，便于后续复核。BOAI 链接指向本仓库文件，应结合本次基线 6f2cbd6 阅读；文件随开发变化时，以函数名和领域合同定位。

### DeepSeek-Bot

- [提交与版本][ds-commit]；[插件入口][ds-index]；[当前桌面 Profile][ds-profile]；[桌面主进程][ds-app-main]；[桌面说明][ds-app-readme]。
- [状态存储][ds-store]；[Bot 与 Session 创建][ds-roster]；[普通 Agent 入口][ds-agents]。
- [模式挂载][ds-surface]；[客户端装配][ds-client]；[侧栏导航][ds-sidebar]。
- [群路由与跨聊天工具][ds-groups]；[记忆存储、注入、回顾][ds-memory]；[私聊搜索与首轮摘取][ds-chat-index]；[常量][ds-constants]。
- [上下文分段][ds-parts]；[上下文决策][ds-steward]；[中断接续][ds-resume]。
- [自动化服务适配][ds-schedules]；[自动化界面][ds-schedules-ui]。
- [GitHub 连接器][ds-connectors]；[连接器界面][ds-connectors-ui]；[Secret 存储与脱敏][ds-secrets]；[逐 Bot 能力绑定][ds-capabilities]。

### DSH

- [对应上游提交][dsh-commit]。
- [Schedule 的投递合同][dsh-schedule-doc]；[调度运行][dsh-schedule-runtime]；[存储][dsh-schedule-storage]；[类型][dsh-schedule-types]。
- [Codex Bundle 合同][dsh-codex-readme]；[依赖版本][dsh-codex-package]；[Bundle 配置][dsh-codex-bundle]；[注册][dsh-codex-index]；[执行][dsh-codex-run]；[协议线][dsh-codex-wire]。

### BOAI

- [领域对象][bo-domain]；[服务编排][bo-service]：saveConversation、employeeMemoryAccess、渠道会话创建与记忆观察。
- [消息接收][bo-message-reception]；[API 消息投影][bo-message-projection]；[Mastra 引擎][bo-mastra-engine]；[Bobo working memory][bo-conversation-memory]。
- [员工记忆策略][bo-memory-policy]；[召回][bo-memory-recall]；[召回合同测试源码][bo-memory-tests]；[外部 user-memory 适配][bo-user-memory]。
- [原生 Session][bo-native-sessions]；[Codex][bo-codex]；[Claude][bo-claude]；[插件协议目录][bo-runtime-catalog]；[产品工具桥][bo-native-products]。
- [原生日程][bo-native-schedules]；[自动化受理仓库][bo-automation-repository]；[自动化执行][bo-automation-service]；[群分工计划][bo-automation-plan]。
- [数据源结构][bo-sources-domain]；[来源服务][bo-source-service]；[MCP/API Provider][bo-source-provider]；[加密 Vault][bo-vault]。
- 相关现行设计：[主私聊与群聊](./spec/16.数字员工渠道绑定/03-员工主私聊与群聊领域设计.md)、[员工自动化](./spec/5.Mastra能力扩展/11-员工与群聊自动化设计与实施计划.md)、[记忆实施交接](./spec/5.Mastra能力扩展/15-Memory代码复用清单与实施交接.md)、[本机员工](./spec/13.本机Agent员工运行时/10-员工一等公民与执行能力设计.md)。

[ds-commit]: https://github.com/Fei2411/DeepSeek-Bot/commit/1bebe826f74e9a72cabafd3b80602b05af867b38
[ds-index]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/index.js
[ds-plugin-readme]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/README.md
[ds-delivery]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/delivery.js
[ds-profile]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/app/src/profile.mjs
[ds-app-main]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/app/src/main.mjs
[ds-app-readme]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/app/README.md
[ds-store]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/store.js
[ds-roster]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/roster.js
[ds-agents]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/agents.js
[ds-surface]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/client/surface.js
[ds-client]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/client/index.js
[ds-sidebar]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/client/sidebar.js
[ds-groups]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/groups.js
[ds-memory]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/memory.js
[ds-chat-index]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/chat-index.js
[ds-constants]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/constants.js
[ds-parts]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/parts.js
[ds-steward]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/steward.js
[ds-resume]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/resume.js
[ds-schedules]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/schedules.js
[ds-schedules-ui]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/client/schedules.js
[ds-connectors]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/connectors.js
[ds-connectors-ui]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/client/connectors.js
[ds-secrets]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/secrets.js
[ds-capabilities]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/capabilities.js
[dsh-commit]: https://github.com/deepseek-ai/deepseek-harness/commit/687f282e8625c6b8d11ff58211a90524be2e4317
[dsh-schedule-doc]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/docs/subsystems/schedule.md
[dsh-schedule-runtime]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/schedule/schedule/src/runtime.ts
[dsh-schedule-storage]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/schedule/schedule/src/storage.ts
[dsh-schedule-types]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/schedule/schedule/src/types.ts
[dsh-codex-readme]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent-codex/README.md
[dsh-codex-package]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent-codex/package.json
[dsh-codex-bundle]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent-codex/cordis.patch.yml
[dsh-codex-index]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent-codex/src/index.ts
[dsh-codex-run]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent-codex/src/run.ts
[dsh-codex-wire]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subagent/subagent-codex/src/wire.ts
[bo-domain]: ../src/shared/domain/index.ts
[bo-service]: ../src/runtime/service.ts
[bo-message-reception]: ../src/runtime/modules/conversations/message-reception.ts
[bo-message-projection]: ../src/runtime/adapters/mastra/message-projection.ts
[bo-mastra-engine]: ../src/runtime/adapters/mastra/engine.ts
[bo-conversation-memory]: ../src/runtime/adapters/mastra/conversation-memory.ts
[bo-memory-policy]: ../src/runtime/modules/memory/memory-policy.ts
[bo-memory-recall]: ../src/runtime/modules/memory/memory-recall.ts
[bo-memory-tests]: ../tests/memory-recall.test.ts
[bo-user-memory]: ../src/runtime/modules/memory/user-memory-provider.ts
[bo-native-sessions]: ../src/runtime/adapters/native-sessions.ts
[bo-codex]: ../src/runtime/adapters/codex/conversation.ts
[bo-claude]: ../src/runtime/adapters/claude/conversation.ts
[bo-runtime-catalog]: ../src/shared/plugins/runtime-catalog.ts
[bo-native-products]: ../src/runtime/adapters/native-products.ts
[bo-native-schedules]: ../src/runtime/modules/automations/native-schedules.ts
[bo-automation-repository]: ../src/runtime/modules/automations/automation-repository.ts
[bo-automation-service]: ../src/runtime/modules/automations/automation-service.ts
[bo-automation-plan]: ../src/runtime/modules/automations/automation-plan.ts
[bo-sources-domain]: ../src/shared/domain/sources.ts
[bo-source-service]: ../src/runtime/modules/sources/source-service.ts
[bo-source-provider]: ../src/runtime/modules/sources/source-provider.ts
[bo-vault]: ../src/main/vault.ts
