<!--
[INPUT]: 用户授权将 Mastra/API 执行迁移到官方 AgentController；当前 core 1.71.0、memory 1.32.1。
[OUTPUT]: 两阶段迁移：Session/Memory、官方审批及 Metrics/费用估算；实际验证和预览版本分别记录。
[POS]: AgentController 迁移的源码、验证和交付记录；不代表个人应用已切换。
[PROTOCOL]: 实施变化同步本记录、对应源码 Header 和 .folder.md。
-->
# Mastra AgentController 迁移

## 范围与当前结论

用户于 2026-11-24 授权将当前 Mastra/API 员工执行改用官方 AgentController，并核对改造规模。工作分支为 `refactor/mastra-agent-controller`。这是执行适配层与记忆生命周期的较大改造，产品界面、员工身份、业务权限和原生 Codex/Claude/Pi 运行方式保持其现有职责。

第一阶段源码迁移已完成，提交为`ec3f1009`：改动集中在9个后端执行/记忆文件（含新增`controller-session.ts`、删除`model-request-attempts.ts`），该阶段没有Renderer改动或依赖升级。用户在隔离预览中试用后，继续授权第二阶段原生审批与计量迁移。第二阶段在同一PR #187追加，新增官方DuckDB指标存储和个人资料中的费用估算；各阶段验证见下文。

官方Controller负责会话运行；现有工具捕获每次宿主授权快照，因此Controller/Session运行实例随宿主run创建并排空回收，持久thread按员工/会话复用。尚未将整个产品改成常驻共享Controller，也未接Durable Agents；不能据此宣称跨进程自动续跑。

## 已核实的官方能力

- 已安装 `@mastra/core@1.71.0` 导出 `AgentController`、`Session`、`createCodingAgent`，并非只能使用基础 Agent 自行搭建会话运行层。
- AgentController 管理 Session、运行、消息事件、停止、工具审批、模式与线程绑定；持久线程与活跃 Session 生命周期不同。
- `createCodingAgent` 提供工作区和流错误恢复默认值，但不自动提供 Memory、存储或产品业务工具。
- Memory OM 已包含逐步骤观察、反思和上下文替换；`readOnly: true` 分支只加载已有上下文，跳过逐步骤观察。
- Harness 是一组可组合能力。重启持久执行需要 Durable Agents，不能把 Session 的进程内状态描述成自动跨进程恢复。

资料以已安装包的 `dist/docs` 和实际实现为准：

- https://mastra.ai/docs/harness/agent-controller
- https://mastra.ai/reference/coding-agent/create-coding-agent
- https://mastra.ai/docs/memory/observational-memory

## 迁移前接入的偏离

1. `conversation-memory.ts` 在运行前导入产品历史、手工 `om.observe()`，主执行以 `readOnly: true` 使用 Memory；官方逐步骤记忆维护未取得主执行历史的所有权。
2. `context-maintenance.ts` 另行估算容量、选择工具结果、分批调用 `summarizeConversation` 并维护自身检查点。
3. 两条摘要路径共用 `memory-model.ts`，均标记为 `memory`，并被额外限制到最多 4000 输出 token；仅凭用量记录的 phase 无法区分 OM 与自定义上下文摘要。
4. 实际失败运行的自定义检查点记录 `basis=provider-prompt`、`windowSource=unknown-policy`，证明该运行进入了自定义压缩路径。估算值不是供应商实际 token 数。
5. `engine.ts` 自行消费 stream 并处理步骤、结束条件；迁移前没有使用 AgentController。

## 迁移边界

- 公开 API 聊天/任务通过 AgentController Session 执行，事件转换保留 BOAI 现有展示、工具回执、用量和取消接口。
- 由官方 Memory 管理执行中的消息与 OM，上下文压缩不再由 BOAI 的并行摘要机制接管。
- 保留员工/resource 与会话/thread 映射、历史迁移、来源权限、遗忘失效屏障；产品发布记录与运行中的内部消息分开。
- 模型与工具继续来自用户实际连接和宿主授权；不因引入 Controller 开放额外文件目录或新增未经授权的工具。
- 单次结构化判断、连接探测等内部模型调用按官方用途使用 Agent；不为不需要会话的操作创建用户会话。
- 取消必须等待实际模型/工具退出，已完成工具不得因恢复被重新执行。
- 既有数据迁移不得删除个人历史；纯协议测试使用独立临时数据库与受控模型。

## 验证与进度

- [x] 检查已安装版本与官方导出。
- [x] 阅读官方 AgentController、Memory、stream retry 文档与实现。
- [x] 临时 SDK 对照：大工具结果后，普通 Memory 执行观察一次并继续完成；readOnly 执行观察零次，下一请求仍包含大工具结果。首次探针清理早于结束回调，出现临时数据库关闭日志，需以完整 drain 的回归替代该清理方式。
- [x] 建立隔离 worktree。
- [x] Session 执行与现有事件/取消/用量接口接入。
- [x] 官方记忆生命周期与既有数据/来源失效衔接。
- [x] 退役重复上下文摘要和不必要的输出硬限制。
- [x] SDK集成回归、变更选测、类型检查和构建；选测中的既有失败见下表，不称全绿。
- [x] 源码、目录地图、全局架构说明和dev skill同步。
- [x] 准备PR交付，源码和验证记录齐全；链接与当前状态以交付回执为准，未合并或安装。

本记录中的 SDK 探针不调用真实模型，不构成真实业务质量验收。

## 具体替换与保留

- `engine.run`统一调用`Session.sendMessage`，不再自行消费主Agent stream或维护工具循环。官方步骤/流回调用于宿主事件投影和计量；Controller承担运行和停止。
- Memory从主执行`readOnly`改为可写，OM由resource改为thread，开启官方默认异步缓冲。员工级WM和获准resource recall仍共享；旧resource OM管理视图和清空兼容保留。
- 删除BOAI手工`observe`、分批`summary`、自建工具上下文检查点写入及HTTP重试包装器。标准错误恢复采用官方`StreamErrorRetryProcessor`；重试仍逐次预约宿主预算，不重放已经完成的工具。
- 默认不再按重复工具轨迹触发宿主额外模型复核；明确顺序群发言的限字校验属于产品发布合同，仍保留。
- 移除主会话默认2500/8192输出限制和摘要4000限制。已选择模型声明了输出能力时使用其能力；未声明时用供应商默认值。官方OM自带的100000是其默认Gemini模型请求值，不传给能力未知的自定义连接。
- 真实截断、缺失结束帧、拒绝预算或失效来源仍不能发布为完成。官方Controller本身在本版本有1000步运行上限；本次没有修改SDK或承诺无限步骤。已验证超过原256工具调用边界。
- 产品历史迁移采用稳定输入ID；SDK生成的工具和助手历史不再从公开回复重复导入。来源失效停止活动运行，等待其退出后清理派生数据；SQL批次只限制单次绑定参数数量，不截断迁移历史。
- 第一阶段由既有工作区和业务工具处理真实文件/命令审批。第二阶段改为Controller原生审批等待与恢复，复用原业务授权策略和界面，避免同一操作重复询问；未注册额外通用执行工具。原生Codex/Claude/Pi不进入此链。

## 第一阶段本地验证记录

使用已安装的真实SDK、隔离SQLite、本地HTTP模拟模型和原产品工具；没有调用商业模型或打开Electron窗口。

| 检查 | 实际结果 |
| --- | --- |
| `pnpm test:changed --list` / `pnpm test:changed` | 131文件：101通过、4失败、26跳过；2028项通过、10项失败、133项跳过；剩余失败均在未修改的main `bf66c575`复现 |
| 最后3处适配收尾后的定向复验 | `mastra-engine`、`mastra-context-continuity`、`bobo-conversation-memory`共247项通过 |
| 记忆/DeepSeek补验 | 52项通过；在上述收尾前完成，相关记忆再由247项覆盖 |
| 两版本材料交付 | 原文件/修订/采用/重启5项通过；模拟模型按当前轮识别回执，原业务断言保持 |
| `pnpm typecheck` | 通过，含workspace边界及TypeScript |
| `pnpm build:cli`、`pnpm build` | 通过；既有bundle大小提示保留，不是打包/发版 |
| diff检查 | 通过 |

最后3处收尾为：未知模型不继承OM的Gemini 100000输出请求、已恢复成功的Session不被早期错误事件重新标失败、迁移查询按SQL参数批次读取。其后再次执行247项及类型/构建。未将两轮通过项相加冒充不同用例数。

变更选测中剩余10项与main对照完全相同：`bobo-collaboration-service`5项旧组织工具夹具、`cli-service`1项新会话字段期望、`service`2项会话字段期望、`model-gateway`2项替换凭据期望。此批未修改这些业务或断言。初轮还因缺CLI构建产物导致原生协议失败，补`build:cli`后第二轮通过。初轮迁移相关红例涉及流式文本、Trace、SDK重试原因、历史工具跨轮保留和旧阈值夹具；保留失败日志，修正接线/夹具后上述相关场景通过。

260步骤用例保持真实步骤数及工具次数断言；官方持久化和OM增加实际执行时间，原30秒测试进程期限不够，单例改60秒，未改变产品执行预算。跨运行/重启用例核对每条原始问题、助手答复和工具回执只出现一次。取消/撤权用例等待实际运行和记忆退出，不把中止请求发送当作已退出。

原始日志保存到主检出`.local/review-artifacts/agent-controller-20261124/`。本地协议/受控业务通过不代表真实DeepSeek任务耗时、模型决策或记忆语义质量通过；当前个人应用未重启、未安装、未合并。CI、PR状态以交付回执为准。

## 第二阶段：原生审批与用量

用户在试用第一阶段后授权“全部按Mastra官方推荐的来做，开始迁移”。本阶段继续使用core 1.71.0、memory 1.32.1、observability 1.18.1，新增与当前core兼容的`@mastra/duckdb@1.15.0`，没有同时升级执行框架。

### 审批归属

- 工具使用官方`requireApproval`，Session通过`tool_approval_required`暂停，宿主将原审批卡结果交回`respondToToolApproval`。只读/询问/完全访问沿员工保存的设置，拒绝不会执行工具，取消后迟到批准不会恢复执行。
- 文件与命令先执行已有路径/命令授权预检。批准后仅当前run、当前工具调用、当前操作种类取得临时凭据，工具返回即失效；工具仍重验来源、路径、员工配置及取消信号。后台脱离工具的异步工作不能复用批准。
- 业务目录授权、来源失效、永久命令/目录许可和本轮同类批准仍是BOAI的产品政策。原生Session负责等待和恢复，不替代这些业务规则，也不把批准解释为额外目录授权。
- SDK技能读取、工具发现及产品只读工具直接放行。混合工具按实际参数和数据源目录的readOnly声明判断；浏览器和桌面插件复用宿主读写判定。既有Codex/Claude/Pi审批保持原生。

### 指标与费用

- 使用官方Observability、`MODEL_GENERATION`指标、`MastraStorageExporter`和DuckDB Observability domain；通过`MastraCompositeStore`与原LibSQL Memory组合。统计不另建token价格表，也不把估算值作为供应商账单。
- 主会话/任务、OM观察/反思、embedding、标题、参与判断、群解释、内部报告、行为/反思审阅、连接测试、自动化草稿、团队草稿和PPT模型审阅接入同一指标库。直接embedding传输补官方模型span；标题沿官方生成API的tracingContext。独立辅助调用标记utility，有真实run的调用关联原身份。
- 只相加官方input/output总成本，不再叠加缓存和推理明细；供应商query-total按官方carrier计入。缺usage或缺价格保留未知，部分价格明确不完整。SDK一次generation可能覆盖多个工具步骤，不把它称为精确HTTP请求数。
- 个人资料以官方指标替换同run的旧展示回执，避免双计；旧历史无指标时保留原用量、不回填虚构费用。本机Agent自有用量仍不计入。图片生成供应商独立计费不冒充模型token费用。
- 指标文件为原memoryPath追加`.metrics.duckdb`，例如`memory/bobo-mastra.db.metrics.duckdb`。仅存原生指标，脱敏Trace仍用原存储；不在第二个库复制完整提示词。查询遍历全部分页，删除会话使用官方`batchDeleteTraces`同步清理指标，关闭时排空并关闭数据库。
- 原显式执行预算回执保留，用于用户已配置的约束；不启用默认TokenCostControl或额外默认金额上限。观测失败记录错误，不因指标写入失败重放业务。

### 第二阶段验证与发现

使用真实SDK、独立数据库、本地HTTP受控模型，不启动Electron或调用商业模型。新增回归覆盖原生批准/拒绝/只读/取消、批准失效、真实DuckDB重启与删除、官方价格、缓存/推理费用去重、缺价、151条指标分页、辅助调用身份和跨轮OM计量。

初轮发现仅需指标时仍采集全部步骤span，260步骤用例超过原60秒期限。已使用官方span类型过滤，在无Trace消费者时仅保留MODEL_GENERATION；相同步数、工具次数和60秒期限下复验约4秒通过。另发现SDK技能读取误入审批，补齐官方只读工具类别后原技能交付用例通过。两项均修复接线，未放宽业务断言。

最终变更选测为211文件（179通过、6失败、26跳过），2873项通过、17项失败、134项跳过。11项为已在未修改main `bf66c575`复现的失败：第一阶段的10项，以及本阶段扩展范围发现的canvas-source-cleanup旧删除期望1项；后者与gateway-product-faults、skills-delivery在main对照为79通过/1失败。另6项为gateway-product-faults在并发选测中的5000ms等待超时（阶段结束及第5次请求）；保持原期限、业务断言和源码，单worker定向复验该文件72项及metrics5项共77项全部通过。这证明独立复验通过，不能据此称并发选测全绿。

最后文件/命令预检及插件读写接线包含在上述211文件选测中，新的原生审批、计量、分页、辅助模型身份、跨轮OM和技能交付场景通过。`pnpm typecheck`、`pnpm lint:ui`、`pnpm build:cli`、`pnpm build`通过，保留原bundle大小提示。Electron 39.2.7使用`ELECTRON_RUN_AS_NODE=1`加载真实DuckDB原生模块、初始化指标域、查询并关闭成功，无窗口；这不是安装包或GUI验证。Skill frontmatter和PR截图目标解析通过。未删除断言或调大本阶段测试期限。

第二阶段日志以`phase2-`前缀保存在主检出`.local/review-artifacts/agent-controller-20261124/`，保留初轮失败及最终复验。没有把重复通过次数相加为独立测试数量。

当前个人预览仍来自第一阶段`ec3f1009`，目录为`/Users/wangwenbo/Desktop/demo/boai/boai-agent-agent-controller`；本阶段未重启该窗口、未安装或合并。PR截图目标为“个人资料 → 模型估算费用”，由现有CI生成目标页及全局主界面两张图；截图尚未运行时不称已验视觉。

官方依据（并核对已安装版本的声明及实现）：

- https://mastra.ai/reference/agent-controller/session
- https://mastra.ai/docs/observability/metrics/overview
- https://mastra.ai/reference/observability/metrics/automatic-metrics
- https://mastra.ai/reference/processors/token-cost-control
