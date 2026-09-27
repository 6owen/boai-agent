# v0.2 员工系统文件与 Mastra 适配

> 归档说明（2026-09-27）：下文保留原制定时的设计与时间语境；“当前/下一版/尚未开发”不代表最新状态。实际交付请读 [当前功能与代码现状](../2.已实现功能与代码现状/README.md)。

实施状态：已按本文进入 v0.2 代码实现，实际行为、验证与边界见 [12 实现记录](../2.已实现功能与代码现状/12-v0.2实现记录.md)。下文保留规格提出时的设计说明。
日期：2026-09-26。状态：实现基线规格，交付结果见 12。

本文补充 08–10：参考 OpenClaw 的员工文件组织，把每位员工的身份、行为、记忆与技能明确放到自己的空间；执行层继续使用项目已安装的 Mastra。文中的 boai-agent 目录与加载规则是本产品设计，不宣称是 Mastra 强制标准或完整 OpenClaw 兼容实现。

## 1. 参考事实与采用范围

OpenClaw 将独立 Agent 的 workspace、运行状态与会话历史分开管理，适合作为本产品“一个员工是一套独立状态”的参考。[官方多 Agent 说明](https://docs.openclaw.ai/concepts/multi-agent)

其工作区约定包含 AGENTS.md、SOUL.md、IDENTITY.md、可选 USER.md、MEMORY.md 和按日期组织的记忆。官方还区分私有主会话与群环境的记忆加载；本产品沿用这种按用途分文件的思路，另增加员工×会话作用域。[官方工作区说明](https://docs.openclaw.ai/concepts/agent-workspace)

核对时发现官方当前已将 TOOLS.md 的用途并入 AGENTS.md 的 Tools 小节，并将 HEARTBEAT.md 列为退役文件。这里不照搬旧教程里的固定七文件模板，也不因为存在某个文件就启动心跳或定时任务。[TOOLS.md 说明](https://docs.openclaw.ai/reference/templates/TOOLS) · [HEARTBEAT.md 说明](https://docs.openclaw.ai/reference/templates/HEARTBEAT)

OpenClaw 的文件型记忆可供参考，但本产品已经要求条目来源、群隔离、撤权和删除版本，因此 v0.2 继续以产品 MemoryRepository 为记忆权威，Markdown 记忆文件作为有作用域的可读投影。[OpenClaw 记忆说明](https://docs.openclaw.ai/concepts/memory)

## 2. 建议文件架构

沿用 09 的新版数据根，与 v0.1 副本隔离：

```text
userData/v2/
  boai.sqlite                         员工配置、会话、事件、记忆条目与版本
  credentials.enc.json                主进程管理，模型不可直接读取
  agents/<agentId>/
    workspace/
      AGENTS.md                       职责、工作约定及 Tools 小节
      SOUL.md                         表达方式、性格、协作习惯
      IDENTITY.md                     身份展示投影
      USER.md                         本员工私聊范围的用户资料投影
      MEMORY.md                       本员工私有长期记忆投影
      memory/YYYY-MM-DD.md             私有记忆变更/摘要投影
      skills/<skillName>/
        SKILL.md                      员工专属技能源文件
        scripts/                      可选，任务执行时仍受权限约束
        references/                   可选，按需读取
        assets/                       可选
      private/                        员工私有工作资料
      sessions/<conversationId>/
        USER.md                       当前会话允许使用的用户偏好投影
        MEMORY.md                     此员工在当前会话内的记忆投影
        memory/YYYY-MM-DD.md           当前会话记忆日志投影
        work/                         当前会话内工作文件
        runs/<runId>/                 当前执行的临时文件与产物
    state/
      bootstrap-manifest.json          已验证文件版本/hash/来源，派生数据
  workspaces/<conversationId>/         会话共享文件与已发布产物
  skills/<resourceId>/<skillName>/     公共技能源，沿用受管资源结构
  knowledge/<resourceId>/<filename>    公共知识原件，按绑定与共享权限使用
```

以上是应用运行数据目录，不是开发仓库目录。这里的员工 AGENTS.md 只由员工装配器读取，不应被当作修改 boai-agent 源代码的开发指令。

不把整棵员工 workspace 暴露给群任务。宿主读取已授权的系统文件；模型文件工具仅获得当前执行允许的目录。群内 `self:/` 仍指向该员工在当前会话的空间，`shared:/` 指向群共享区。个人区内容进入群须通过明确的共享/发布操作。

## 3. 每个文件的职责及唯一事实来源

| 文件/数据 | 用途 | 权威来源与修改入口 |
| --- | --- | --- |
| AGENTS.md | 职责、工作方法、协作约定、工具使用说明 | 文件为权威；员工详情“工作规则”与源文件编辑写同一内容 |
| SOUL.md | 语气、风格、交流习惯 | 文件为权威；员工详情“风格”编辑同一内容 |
| IDENTITY.md | 名称、职责摘要、头像展示信息 | DigitalAgent 结构字段为权威；文件为生成视图 |
| USER.md | 已批准保留的用户偏好与关系资料 | MemoryRepository 为权威，严格限定员工与会话范围 |
| MEMORY.md | 当前范围有效的长期事实、决定和待办 | MemoryRepository 为权威，包含条目/版本/来源标记 |
| memory/日期.md | 当前范围的记忆事件与简短摘要 | 记忆事件为权威；不导出原始推理或全部聊天 transcript |
| skills/名称/SKILL.md | 技能声明与使用说明 | 对应资源源文件为权威；绑定关系和启用状态由产品库保存 |
| 模型/工具权限/资源绑定 | 实际可用能力 | 产品配置和宿主校验为权威，不由 Markdown 授权 |
| 会话/发言权/审批/运行状态 | 产品事实及恢复依据 | SQLite 为权威，不从 Markdown 日志重建未知副作用 |

文件头和界面需清楚标记“可编辑源文件”或“生成视图”。v0.2 不做不透明的双向同步：

1. 修改 AGENTS.md / SOUL.md，通过同一受控保存接口更新文件、内容 hash 和员工配置版本；数据库里的旧 instructions 仅作为兼容读模型，不继续独立编辑。
2. IDENTITY.md、USER.md 和记忆投影不参与自动反向同步。用户在界面修改其权威对象，再重新生成文件。
3. 外部编辑生成视图时标为“投影已被修改”，保留用户副本并提供重新生成/显式导入入口；不悄悄覆盖，也不把修改当成已经批准的新记忆。
4. 记忆导入是新 MemoryEntry 写入，保留目标作用域、来源与版本；删除条目增加 tombstone/epoch，旧投影或迟到写入不得将其复活。
5. 模型默认不能用普通 write_file 修改系统文件、技能源、凭据或 MemoryRepository；需要改记忆时使用受控维护接口。已批准的主机 shell 仍具有主机用户权限，不能把文件工具范围说成系统沙箱。

这种划分让系统文件可查看、可携带，同时保留现有群聊、备份与撤权语义。以后如改成“Markdown 记忆为唯一权威”，需要单独迁移，不能同时保留两个独立可写的记忆真源。

## 4. 文件装配如何接入 Mastra

当前内核使用 `@mastra/core/agent` 的普通 Agent。该 API 接收 instructions、model、tools、workspace 等参数；放置一组 OpenClaw 文件不等于当前运行代码已经读取它们。

安装版本核对得到以下边界：

| Mastra 能力 | 实际机制 | 本产品选择 |
| --- | --- | --- |
| 普通 Agent | 显式 instructions，支持字符串、系统消息与动态函数 | 继续使用，应用在运行时读取获准文件 |
| AgentsMDInjector | 显式配置处理器后，根据工具路径在祖先目录查找 AGENTS.md / CLAUDE.md / CONTEXT.md | 不是员工启动加载器；本版不启用无边界的祖先配置发现 |
| Beta 文件式 Agent | `src/mastra/agents/<name>/config.ts` 配合 instructions.md/ts 等，经 mastra dev/build 发现 | 不用于桌面用户动态员工；直接库调用不自动扫描，Markdown 指令在构建时内联 |
| createCodingAgent | Agent 工厂默认值，包含文件/LocalSandbox 等能力 | 不为读取人格文件而切换，保留现有逐次命令审批边界 |

文件式配置的装配函数最终仍创建 Agent，不存在本方案必须改用的“FileBasedAgent 人格文件读取类”。新建员工也不生成任意 config.ts 或 tools.ts 让用户目录中的代码自动被应用加载。

新增产品层 `AgentBootstrapLoader` 和 `AgentFactory`：

```text
DigitalAgent + 本次 AgentSession + 执行类型
    ↓ 权限和版本校验
已验证 AGENTS.md / SOUL.md + 结构化身份 + 当前范围记忆
    ↓ 有界、带来源的上下文装配
Mastra Agent({ id, name, instructions, model, tools, workspace })
    ↓
decideParticipation / respondChat / executeTask
```

这里的 Loader/Factory 是拟新增应用模块，不是 Mastra 导出的类。Agent 使用稳定员工身份；请求对应的会话、轮次、运行和记忆命名空间分别传递，不用一个 agentId 代替所有会话上下文。

加载内容与业务权限分开：

| 执行场景 | 加载的文件/状态 | 工具能力 |
| --- | --- | --- |
| 成员参与判断 | 当前员工规则/风格/身份摘要、当前会话获准记忆与公开消息 | 无业务工具，仅输出参与意愿 |
| 单聊普通回复 | 规则/风格/身份，以及该私聊允许的用户资料和记忆 | 默认无文件、搜索或命令工具 |
| 群聊普通回复 | 规则/风格/身份，以及当前群允许的会话记忆 | 不读取根 USER.md / MEMORY.md 或私有日志；无业务工具 |
| 工具任务 | 上述适用范围，加显式绑定的技能、知识和工作路径 | 按当前任务授权装配，而非按文件内容自行授予 |
| 记忆维护 | 当前员工已获准的完成事件、来源和目标 scope | 仅受控记忆写入；不生成公开聊天消息 |

系统文件由宿主预读，不需要让模型为回答“你好”先调用 read_file。也不要求每轮注入整本日记或所有 SKILL.md。模型声明的角色/风格不能覆盖应用的成员资格、文件范围、命令审批和发言预算。

### 装配顺序与预算

采用应用执行约束 → 员工身份/规则/风格 → 当前执行职责 → 带来源的获准记忆 → 有署名的公开消息。记忆和引用资料以背景数据呈现，不提升为可以授予权限的规则。群内注入的 AGENTS.md / SOUL.md 应只包含可跨会话使用的员工设定，私人事实写入对应 scope 的记忆。

首版建议系统源文件单文件读取上限 64 KiB，规则/风格合计注入预算 12,000 字符，另设记忆预算并计入模型上下文总量；这些是 boai-agent 的建议默认值，不是 Mastra 或 OpenClaw 限制。超限、缺失或校验失败提供明确诊断，不能静默丢掉半条工作规则后声称已加载完整配置。

运行保存所用文件 hash、configVersion、memoryVersion、policyVersion 与来源清单。源文件变更先解析校验再用于下一次运行；在途运行固定快照，撤权仍按 09 立即失效。源文件缺失时不自动覆盖已有文件：新员工显式初始化模板，已有员工报配置不完整并允许恢复。

## 5. Skills 遵循 Mastra 的实际能力

员工专属 skills 与公共技能绑定都通过资源注册表解析为允许的源路径。目录存在只表示可被发现/导入，不等于已授权员工使用，也不自动给同群其它员工授权。

运行装配时使用 Mastra Workspace 的 skills / skillSource 能力，并继续使用已实现的受控 SkillSource。每个技能有 SKILL.md，包含 name、description 等有效 frontmatter；当前安装版本的运行验证要求技能目录名与 name 一致，应在导入时标准化并明确报错。

同一员工绑定同名技能时要求显式选择来源，不静默覆盖；不同员工可以使用同名但不同来源的技能。公共资源不需要复制一份给每位员工，专属技能源保存在该员工自己的目录。

这是本产品比底层发现更明确的冲突规则。安装版 Mastra 区分直接定义与 filesystem skill，并对 filesystem 来源有优先级；最高优先级仍有多个匹配时可能报歧义，不能假设“后加载自动覆盖前加载”。资源注册表在进入引擎前消除歧义，固定本次源路径与版本。技能名遵守当前文档的长度/小写字符与连字符规则，不能仅因 OpenClaw 接受某个目录就跳过 Mastra 校验。

OpenClaw 的发现顺序、metadata.openclaw、环境变量注入或特定工具名称不自动成为 Mastra 行为。导入兼容性检查需列出无法映射的声明；v0.2 不承诺任意 OpenClaw Skill 无修改即可运行。[OpenClaw Skills 加载规则](https://docs.openclaw.ai/tools/skills)

## 6. 文件加载与安全边界

- 只加载明确登记的员工根目录和允许文件，不向上搜索任意项目中的 AGENTS.md，也不递归读取所有 Markdown。
- 系统配置文件、技能源和记忆投影与工具可写的任务目录分别授权；检查真实路径、符号链接和大小限制。
- 文件中的“启用命令”“访问其它员工目录”“不需要审批”等文字不能改变能力配置。TOOLS 说明是使用指引，不是权限表。
- 公开群输入、知识检索结果与工具输出均不得自动改写 AGENTS.md / SOUL.md。员工可以提出修改建议，由本地用户编辑/应用。
- API Key、模型凭据及可用密钥引用的解密内容不写入系统文件、生成投影、普通日志或导出包。
- 私有 USER.md / MEMORY.md / 日期日志不因同一个员工进入多个群而跨群注入；记忆检索也使用相同 scope 规则。
- 对系统文件路径的读取是宿主装配行为，不使模型获得同目录其他文件的读取权。

## 7. 初始化、编辑与迁移

创建员工时，用用户已填写的职责和风格初始化 AGENTS.md / SOUL.md，生成 IDENTITY.md，并创建空的 memory/skills/session 目录与 namespace。不会为新员工编造用户偏好、历史经验或记忆。

从 v0.1 升级时，将原 instructions 原样迁入 AGENTS.md 的工作规则区，保留来源版本；不使用模型擅自重写已有指令。name/role/color 继续由结构字段管理并生成身份视图。初始 SOUL.md 使用中性默认风格；原 instructions 已含风格描述时先保留原文，不自动拆错。

文件写入采用临时文件加原子替换；配置记录与文件之间使用可恢复的更新状态。应用重启后要能区分“待写入”“已写文件待确认”“已完成”，不能出现界面提示已保存但实际运行仍使用上一版的状态。未完成的文件更新不自动覆盖用户后来编辑的新版本。

员工右侧详情增加“系统文件”入口：列出用途、来源、当前版本与生效状态；AGENTS.md / SOUL.md 可编辑，其余生成视图跳转对应身份/记忆编辑入口。预览说明该文件在单聊或群聊中是否会被加载，避免用户以为所有文件都会进入每次请求。

备份包含员工系统源文件、专属技能、记忆权威记录、受管工作区和必要 manifest；投影可重建。恢复后验证文件版本与路径，记忆投影只从恢复后的有效条目重建。普通导出继续排除凭据。

BOOT.md / BOOTSTRAP.md 不作为自动执行入口；首次创建由确定性的初始化程序完成。定时任务仍只设计入口/列表/详情，不能因发现 HEARTBEAT.md 或其它文本就启动模型、网络或命令。

## 8. 验收增量

| 编号 | 验证内容 |
| --- | --- |
| FILE-01 | 创建两个员工，源文件/目录/namespace 独立；空记忆没有虚构条目 |
| FILE-02 | UI 编辑 AGENTS.md / SOUL.md 与文件预览一致，下一次运行使用正确 hash，版本冲突不会静默覆盖 |
| FILE-03 | 普通群问候可使用身份/风格，模型请求没有业务工具，也没有私有 USER.md / MEMORY.md 标记 |
| FILE-04 | 公开群声明或恶意资料无法修改系统文件、扩大工具范围或开启命令 |
| FILE-05 | 修改生成视图不会悄悄成为新的记忆；显式导入保留 scope/来源；删记忆不会被旧投影恢复 |
| FILE-06 | 原 instructions 迁移后内容保留，不与数据库兼容字段重复注入 |
| FILE-07 | 专属/公共技能均按员工绑定生效；同名冲突、目录名不匹配和 OpenClaw 专有声明有明确反馈 |
| FILE-08 | 文件缺失、超限、符号链接、原子写入中断、配置快照与备份恢复有可解释结果 |
| FILE-09 | 仓库开发 AGENTS.md、任意上级文件及其它员工目录不被误加载为当前员工配置 |
| FILE-10 | 存在 BOOT/BOOTSTRAP/HEARTBEAT/TOOLS 等旧文件时不自动执行或授予能力 |

## 9. Mastra 核对依据

基线为项目已安装 `@mastra/core@1.71.0`、`@mastra/memory@1.32.1`、`@mastra/libsql@1.23.3`。Agent 参数、Workspace/Skills 和 Memory 范围以各包 `dist/docs/references/` 与导出类型为准；不能仅因网上示例使用同名类就升级或替换现有运行方式。

Memory 还有两个容易误解的边界：原生 working memory 是存储适配器里的内容，不会自动读写 MEMORY.md；默认 resource scope 可以跨 thread 共享。`lastMessages: false` 会同时关闭历史加载与保存，不是“继续存储但仅停止回填”；`readOnly: true` 则允许读取而禁止新增消息和工作记忆更新。数字形式 lastMessages 在安装版本类型里已标弃用。当前继续采用 09 的产品记忆与显式上下文；未来接入原生 Memory 必须作为独立迁移验证。

已核对的本地参考文件位于安装包中：

- `@mastra/core/dist/agent/types.d.ts`：AgentConfig 与 instructions。
- `@mastra/core/dist/docs/references/reference-processors-agents-md-injector.md`：AGENTS 文件处理器。
- `reference-file-based-agents-config.md`、`reference-file-based-agents-instructions.md`、`reference-file-based-agents-workspace.md`：文件式发现、构建时行为与默认工作区。
- `@mastra/core/dist/agent/fs-routing/index.d.ts`：agentConfig / agentInstructions / assembleAgentFromFsEntry。
- `reference-coding-agent-create-coding-agent.md`：代码 Agent 工厂默认值。
- `docs-sandbox-skills.md` 与 `workspace/skills/skill-source.d.ts`：技能规范、来源解析及只读 SkillSource。
- `@mastra/core/dist/memory/types.d.ts`、`docs-memory-working-memory.md`、`docs-memory-message-history.md`：记忆范围、历史保存与重复输入边界。

上面省略目录前缀的 Markdown 均位于 `@mastra/core/dist/docs/references/`。这些是安装版本的依据，升级依赖时需要重新核对，不能假定文件式与直接库调用具有相同加载行为。

适配点与文件版本检查应在 10 的 P0/P2/P3 中实现，并纳入真实模型请求级测试。本文不提供未经安装版本验证的伪 API 示例，也不新增 OpenClaw 运行时依赖。
