<!--
[INPUT]: 项目能力、运行环境、构建和维护约定。
[OUTPUT]: 模型连接中的本地配置扫描、Codex 登录/ACP 接入与使用边界；离线CI/版本化评估入口与使用与开发入口、会话清理与面板交互、Electron BDD 验证命令、独立成员并行流式、父子工作与定向接续验收/限制及协作规格导航。
[POS]: 仓库说明入口，规约真源为 AGENTS.md。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->
# BoAI Agent

基于 Electron + React + Mastra 的本地数字员工桌面应用。每名员工拥有自己的系统文件、工作区、模型、Skills 和有作用域的持久记忆，可单聊，也能在群内自主决定是否参与。

## 开始使用

环境：Node.js 22.13 或以上、pnpm 10。当前验证平台为 macOS Apple Silicon。

```sh
pnpm install
pnpm dev
```

开发模式支持界面热更新；修改主进程或运行服务后需要重新启动。生产构建和运行：

```sh
pnpm build
pnpm start
```

1. 在左下角「设置」添加模型连接。支持 OpenAI、Anthropic 和 OpenAI Chat Completions / Responses 兼容服务；兼容服务填写完整 API 基础地址，可不填 Key。也可点击「扫描本地 Agent」，预览 Codex / Claude Code 的 API 配置并逐项导入，或选择其他配置目录（JSON、TOML、YAML、dotenv）。缺少模型名时先补填；已导入来源不会重复创建或覆盖已有编辑。扫描不会联网、改写来源或将密钥带入扫描结果；Codex 现有登录可接入为本地 ACP Agent，登录仍由 Codex 管理。
2. 在「通讯录」选择联系人，通过「编辑配置」设置研究员、写手、审核员的模型；也可从会话页新建员工。员工模型 ID 留空时使用连接默认模型。
3. 通讯录按群聊、联系人展示资料；点击「发消息」进入对应会话，也可在会话页新建群聊。每位成员使用自己的模型判断是否参与；`@` 和引用是可选的明确收件人。普通聊天不挂载工作工具。
4. 在「资料库」导入 Skill 目录和 Markdown/TXT，再到员工详情绑定；群知识还须在群设置中明确共享。导入不代表自动授权。
5. 会话右键可“清空聊天记录”或“删除会话”。确认后永久清理聊天/任务记录、会话记忆与专属文件；删除还会移出列表，员工和群配置保留在通讯录。执行中的会话需先停止并等待结束。
6. 员工详情的「工作区」「记忆」「系统文件」对应真实本地数据。工作规则和表达风格可编辑；记忆按员工及会话分开保存、编辑和删除。
6. 任务文件先写入员工在本会话的独立空间，再通过发布操作进入群共享产物。聊天中的任务入口可查看过程、审批和成果。

Codex 登录接入：在「模型连接 → 扫描本地 Agent」中确认已找到 `codex-acp`，接入后在本页「本地 Agent」测试启动与登录，再为员工选择 ACP 执行方式及该启动项。缺少程序时先安装 `@agentclientprotocol/codex-acp` 或手动配置启动项。扫描仅发现程序；测试会创建会话但不发送模型提示词。自选登录目录会保存为 `CODEX_HOME`，OAuth token 不复制到 BoAI。ACP 当前用于单聊显式任务，不作为 Mastra 的普通模型连接；A2A 尚未接入。

应用首次启动只创建三个可编辑员工，不配置模型凭据，也不生成示例对话。需要你自己的模型服务才能得到实际回复。本地保存数据不代表模型推理离线。

## v0.2.2 功能

- 顶部工具栏、窄导航、会话列表、独立通讯录、聊天与可调右侧详情；Carbon/Solar 本地图标，会话支持置顶分组及手动排序，右侧窗口标签可拖拽排序；群成员通过头像网格添加/移除。
- 员工头像内置 12 款可爱 SVG；在新建或编辑员工时点击头像即可更换，支持本地 PNG/JPG/WebP 上传（最大 5 MB），保存后在会话与通讯录中统一显示。
- 成员自主判断、顺序发言、看到新消息后继续交流、依赖工作项与接续；没有中央模型预先挑选发言者，也不固定要求全员回复。
- 每条新用户消息启动新的轮次，历史问候不能算作本轮已答。活动面板默认仅展示本轮；历史错误按轮次折叠保留，成员已回复后不再补充会显示“已回复，暂无补充”。
- 同一群单个公开回复流；成员判断最多并发 3 个，配合时间、代数和调用预算结束讨论。
- 普通交流与工具任务分开。任务的中间步骤记录在活动中，最终回复不拼接工具前言。
- 员工工作规则 / 表达风格文件、按员工及会话隔离的记忆、来源记录、删除版本和外部文件冲突检测。
- 命令逐次审批、停止、失败重试、重启中断、请求去重、SQLite 与系统加密凭据。
- 定时任务仅提供入口、列表和详情设计，**尚无定时执行能力**。

## Skills 与知识

Skill 目录必须包含 `SKILL.md`，其 YAML frontmatter 需要 `name` 和 `description`。导入时复制到应用受管目录；不会直接执行原目录中的内容。可导入 [示例技能](examples/skills/brief-writer/SKILL.md) 所在的 `brief-writer` 目录，以及 [示例资料](examples/knowledge/product-notes.md)。

知识格式目前支持 `.md`、`.markdown`、`.txt`，采用本地文本检索；PDF、Office 解析和向量检索尚未接入。群聊知识访问取「员工已绑定」与「群已共享」的交集。

文件工具的 `self:/` 只对应当前员工在当前会话的空间，`shared:/` 对应会话共享区；系统文件和其他员工目录不可通过普通文件工具读写，技能与知识原件只读。命令执行默认关闭；开启后，每次执行仍需确认完整命令。命令使用当前用户的主机权限，**没有操作系统沙箱**；工作目录、超时和文件工具的路径限制不约束获得批准后的任意 shell 命令。脚本依赖需要在本机准备，当前不提供自动安装依赖。

## 数据与备份

macOS 新版数据位于 `~/Library/Application Support/BoAI Agent/v2/`，可在设置中打开；开发/测试的 `BOAI_DATA_DIR` 指定父目录，新版同样使用其 `v2/` 子目录。首次启动从 v0.1 复制一致副本，校验后启用；原数据保留。旧版后续写入会形成另一份数据，不会自动覆盖或合并到新版。

```text
v2/
  data-version.json                  新版数据版本标记
  boai.sqlite                        配置、消息、轮次、记忆及运行快照
  credentials.enc.json               主进程加密凭据，不进入普通备份
  agents/<id>/workspace/
    AGENTS.md / SOUL.md               工作规则、表达风格源文件
    IDENTITY.md / USER.md / MEMORY.md 身份和记忆生成视图
    skills/                          已登记的员工专属技能
    sessions/<conversation>/         会话记忆投影、work/ 和 runs/
  workspaces/<conversation>/         共享文件和已发布产物
  skills/<id>/<name>/                 公共技能原件
  knowledge/<id>/<filename>          受管知识资料
```

正在执行或等待审批时不能导出备份，请先完成或停止任务。备份包含数据库、员工系统文件与独立空间、记忆、Skills、知识原件和共享工作区，**不包含 API Key**。恢复方法见备份中的 `RESTORE.txt`：退出应用，保留原数据副本，将备份内容放入目标应用的 `v2/` 数据目录，再启动并重新配置 Key。启动时会重定位受管文件路径。

退出应用会停止执行；重新启动后，未完成任务标记为中断，不自动重放命令。macOS 关闭窗口会保留应用进程，使用「退出」或 Command-Q 才会停止应用。

## 验证与打包

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm test:electron
pnpm package
```

`pnpm package` 在 `release/` 生成当前平台的应用目录；`pnpm dist:mac` 生成 macOS DMG。打包使用本项目安装的 Electron。正式分发还需要应用图标、签名、公证及目标系统验收。

引擎测试使用真实 Mastra SDK 和本地模型协议服务，覆盖 OpenAI 兼容与 Anthropic 请求、流式输出、技能、知识、产物、命令审批和取消；服务测试使用实际 SQLite。桌面测试启动真实 Electron，验证跨进程调用、群聊、隔离、取消和重启。测试服务只用于自动化测试，应用没有模拟回复模式。

桌面验收使用 `playwright-bdd`：`tests/e2e/features` 保存中文业务场景，`steps` 保存类型化操作与断言，`support` 管理独立数据、Electron 重启和资源清理。原有 13 组桌面流程全部由 BDD 执行，另有五人并行流式、慢判断隔离、委派/定向接续和停止工作树等场景；`tests/*.test.ts` 继续由 Vitest 执行。生成的 `.features-gen` 不提交、不手工编辑。Playwright 报告位于 `playwright-report/index.html`，按业务步骤展示的 Cucumber 报告位于 `cucumber-report/index.html`；二者分目录，避免报告器清理目录时互相覆盖。真实供应商评估单独使用 `pnpm eval:collaboration`，不在默认测试中调用付费模型；场景、预算和门槛见[评估协议](ai-docs/spec/6.Cumora协作重构/06-真实模型评估协议.md)。

评估体系现有38题（10回归、12业务开发、16冻结留出），32项覆盖映射。`pnpm eval:dataset`检查清单与冻结合同，`pnpm eval:score --input 原始目录 --output 新目录`离线生成HTML/JSON报告；不重复调用模型。真实评估支持途中事件、完整产物hash、单人对照和跨批次共享预算；运行结束、任务通过与待评审分别显示。人工校准和正式留出实验尚未完成，见[测试体系实施状态](ai-docs/spec/6.Cumora协作重构/09-多Agent测试体系与评估集方案.md)。`.github/workflows/tests.yml`提供离线类型、UI规则、模块、冻结合同与Electron BDD工作流，真实模型仍手动执行。

协作重构当前能力：连接共享模型容量，同轮事件合并保留来源；任务已有版本化工作记录、事务认领和跨运行预算。业务结果通过独立声明和证据记录，运行成功不自动等于工作完成。员工可同时判断、流式回复与整理各自记忆；普通同伴消息不作废对原始请求的独立聊天意图。默认同连接六项模型调用、六项独立工作区任务并行；任务结果先保存为草稿，过期时仅重新汇报，命令任务和相同员工会话文件保持互斥。新增父子工作、显式结果版本依赖和负责人定向接续；子工作共享原始预算，依赖失败阻塞，支持单独停止工作树。重启中断且不重放；此前固定验收版本的真实模型样本为 44/45，达到预登记门槛，仍存在内容质量限制且整体 token 开销增加；详见[实施记录](ai-docs/spec/2.已实现功能与代码现状/20-Electron-BDD与协作重构.md)。

```sh
pnpm test:electron                     # 构建、生成 BDD 并执行全部桌面场景
pnpm test:electron --grep @creation     # 按功能标签筛选；其他标签见 feature 文件
pnpm test:electron --grep @smoke        # 创建流程冒烟验收
pnpm test:electron:list                # 仅生成与列出场景
pnpm test:electron:report              # 打开最近的 Playwright HTML 报告
```

每个场景使用临时 `BOAI_DATA_DIR`；场景内重启沿用数据，结束后清理。失败报告包含窗口截图和各次启动的 trace；Cucumber 报告位于 `playwright-report/cucumber.html`。设置 `BOAI_TEST_PACKAGED_PATH` 可验证指定打包应用，开发专用的 `@ui` 组件页会跳过。打包验收不会重建指定安装包，应先用 `pnpm package` 生成当前版本。

首批 B1/B2/S1/F1 已实施，详情见 [实现记录](ai-docs/spec/2.已实现功能与代码现状/15-B1-B2-S1-F1首批重构实现.md)。员工工作区会显示技能说明与执行状态；执行依赖未验证时不会显示为就绪。

## 代码结构

```text
src/main/        Electron 窗口、受控 IPC、凭据、运行进程生命周期
src/renderer/    React 中文桌面界面
src/runtime/     Mastra 引擎、产品服务、SQLite、资源管理
src/shared/      跨进程数据与事件契约
tests/           Vitest 引擎与服务回归、Electron BDD 场景
ai-docs/spec/    产品规格与实际实现记录
```

当前直接使用 `@mastra/core` 的 Agent/Workspace 执行能力。用户可见消息由产品数据库管理，按成员和会话筛选后显式投影进模型输入；未同时开启框架 Memory 自动回放，避免历史重复。长期记忆由产品 MemoryRepository 管理并显式注入获准范围，Markdown 记忆文件是生成视图。MCP 连接器、定时执行、多设备同步与系统级执行隔离另行实现。

v0.1 历史交付见 [07](ai-docs/spec/2.已实现功能与代码现状/07-实现记录.md)，v0.2 基线见 [12](ai-docs/spec/2.已实现功能与代码现状/12-v0.2实现记录.md)，v0.2.1 修复历史见 [13](ai-docs/spec/2.已实现功能与代码现状/13-v0.2.1群聊修复与图标.md)，当前 v0.2.2 交付与验证见 [14 历史群聊与本轮边界](ai-docs/spec/2.已实现功能与代码现状/14-v0.2.2历史群聊与本轮边界.md)。

v0.2.2 最终交付已通过 102 项引擎、服务和文件测试，以及 3 项打包 Electron 流程。使用原群完整副本保留 8 条消息、17 条运行记录后，再发送同样的“你们好啊”：修复前没有新回复，修复后 3 位员工各自简短回复，14 次模型阶段调用计数、0 个失败运行、0 次工具调用。原数据未修改；这次结果不代表每条消息都必须全员回应。

后续外观设计（F2/F3 尚未实现）：[外观设置与主题系统](ai-docs/spec/3.前端重构与功能/14-外观设置与主题系统.md) 定义浅色/深色/跟随设备、Base46 及背景图；[前端目录架构与迁移计划](ai-docs/spec/3.前端重构与功能/15-前端目录架构与迁移计划.md) 定义参考 landing-page 的组件、状态和样式分层，其中 F1 已实施。

后续开发已分为六组文档：[规格目录](ai-docs/spec/README.md) · [现有功能与代码现状](ai-docs/spec/2.已实现功能与代码现状/README.md) · [重构总计划](ai-docs/spec/00-重构总计划.md)。前端重构、员工与协作模块重构、Mastra 新能力分别维护方案；B1/B2/S1/F1 已交付，其他阶段仍为规划。[Cumora 协作重构参考](ai-docs/spec/6.Cumora协作重构/README.md) 已结合 Paperclip 任务机制，记录自主群聊、执行认领、并行发布与任务接续的目标和实施进展，独立于 B3 保持行为的结构重构。

最新计划优先完善 [员工 Sandbox / 文件系统 / Skills](ai-docs/spec/5.Mastra能力扩展/03-Sandbox文件系统与Skills.md)，ACP 本地任务已接入，后续扩展参考 [ACP / 本地 SDK 等执行后端](ai-docs/spec/4.数字员工与协作重构/04-员工执行后端与能力契约.md)；浏览器和连接按需引入。[自动化](ai-docs/spec/5.Mastra能力扩展/06-自动化与定时执行.md) 采用 Mastra 原生持久 schedules 的本地接入方案，不复用 Pi 调度器。

## 基础 UI 组件

`src/renderer/components/ui` 已安装完整的 shadcn Base UI / base-nova 基础组件。组件结构与变体在各自源码中定制，`ui/skin.css` 统一 6owen Soft 风格，共用全局颜色、字号、圆角、高光与阴影；现有页面控件和聊天输入框已接入。完整入口见 [基础组件接入记录](ai-docs/spec/2.已实现功能与代码现状/18-shadcn基础组件.md)。

`pnpm lint:ui` 检查本地图标导入约束；`pnpm test:electron --grep @ui` 验证实际弹层、控件与主题。会话、通讯录、任务、资料库、设置与员工详情已直接使用该组件层；页面交互回归见 `tests/e2e/features/pages.feature`。

Soft 风格变量与验证记录见 [全局 Soft UI](ai-docs/spec/2.已实现功能与代码现状/19-全局SoftUI.md)。
