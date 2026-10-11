<!--
[INPUT]: 用户2026-10-11完整实施与评测授权、11现行合同、Rovai固定源码及实际改动。
[OUTPUT]: 逐模块来源、直接迁入/必要移植、保留行为、旧测试替代依据；实际验收唯一见06最新实施节。
[POS]: 第13组迁入审计，不另建实施进度。
[PROTOCOL]: 变化同步Header、.folder、README与06索引。
-->
# Rovai迁入实现对照

上游固定为 `murray17/rovai-ai@f9acc2395283d49f0ce247dc0af2207c155f6eb6`。许可随代码保留在 `src/shared/rovai/LICENSE`。BOAI改动基线为 `af601af47075ec526795540e3f24efd17afc00c0`。本次按[11](11-Rovai对齐与本机执行纠偏.md)实施；不把历史五阶段限制重新带回生产。实际批次、失败和证据统一登记[06](06-实施步骤与自动验收.md)。

## 1. 直接迁入与必要接线

下表的上游renderer路径前缀为 `apps/desktop/src/renderer/src/`；shared路径前缀为 `apps/desktop/src/shared/execution-presentation/`。

| 上游文件/实现 | BOAI目标 | 方式及具体差异 |
| --- | --- | --- |
| shared `index.ts`、`tool-grouping.ts`、`builtin-tools.ts`、`public-result.ts`、`safe-markdown-model.ts` | `src/shared/rovai/` 同名文件 | 直接迁入，调整导入位置和文件Header。保留活动归一、连续工具分组、实际状态、公开结果和Markdown解释语义 |
| `packages/contracts/src/index.ts` | `src/shared/rovai/contracts.ts` | 提取上述模块及执行窗口实际依赖的声明；未搬入Rovai整套联系人、渠道、数据库合同 |
| `ExecutionVirtualList.tsx`、`execution-content-cache.ts`、`execution-window.ts` | BOAI `components/detail-panel/` 同名文件 | 直接迁入虚拟列表、字节缓存、稳定游标、变化刷新、历史窗口/预取/淘汰。UI缓存限制不删除持久原文 |
| `useExecutionWindow.ts` | 同名文件与 `execution-window-client.ts` | 保留窗口、重试、阅读锚点、加载边界、最新跟随逻辑；transport注入BOAI typed IPC；去掉上游console计时；滚动目标换为BOAI该运行内容底部，避免滚到其他历史运行 |
| `ExecutionAvatarRail.tsx` | 同名文件 | 迁入横向头像轨道、键盘/边缘滚动、选中项揭示和reduced-motion行为；用BOAI Avatar/Button/Tooltip/图标与主题替换视觉壳 |
| `ExecutionNarration.tsx` | 同名文件 | 迁入按可见行读取、stamp缓存、失败重试。正文改接BOAI分块IPC及现有Markdown组件 |
| `ExecutionToolGroup.tsx` 的 `ToolCallDetail`、键盘处理、成员身份保存展开选择 | `ExecutionToolGroup.tsx`、`execution-feed.tsx` | 迁入详情状态、加载序列、重试、焦点恢复和可滚动结果键盘操作。分组本身用原 `tool-grouping.ts`；BOAI按钮、参数/结果/退出码/diff外壳接现有组件。没有宣称整份1032行组件原封迁入 |
| `crates/rovai-core/src/managed_process/macos.rs`、`linux.rs` | `src/runtime/adapters/process-guard/` | 直接保留 Rust 进程身份/后代追踪模块与 MIT 许可，仅添加本仓库 Header，模块正文逐字节保持。独立小型 Cargo 二进制作为父进程；macOS 保留 PID 生命周期、audit-token 信号、私有台账和崩溃恢复；Linux 保留 pidfd 语义，不引入 Rovai 数据库 |
| 上述窗口、工具分组、公开结果原测试 | `tests/rovai-*.test.ts` | 原用例调整导入直接运行；原测试分数不代替BOAI产品/真实模型验收 |

没有搬入Rovai全局CSS、另一套主题或页面外壳。BOAI的IM、联系人、员工资料、输入框工具栏保持本产品入口。

## 2. 原生驱动为何是协议移植

Rovai `crates/rovai-core/src/codex.rs`、`claude.rs` 依赖其 `rovai_core`、storage、runtime_adapter、managed_process、thread/agent运行状态和Rust消息类型；它们不是可独立链接的无状态CLI驱动。直接编译整个crate会同时引入第二套员工、任务和数据库权威。BOAI保留Electron宿主和既有业务仓库，将对应协议/生命周期语义移植到以下模块，不把旧受限引擎作为生产入口：

- `codex/conversation.ts`：真实 `app-server --listen stdio://`，原生thread start/resume、turn、动态产品工具、权限请求、取消、公开事件与用量。
- `claude/conversation.ts`：真实双向stream-json、initialize、session-id/resume、stdio权限与普通问题、partial messages、任务终态和idle退出。本机登录为首要路线，显式API凭据为可选配置；保留CLI自己的MCP/Skills/插件配置。
- `native-events.ts`：对应上游公开事件的BOAI字段接线；保留输入、输出、计划、文件差异、扩展事件及已有父子身份。补入上游 `public_claude_tool_result_text`、文件操作候选、双错误标记及路径一致的 update 核验：仅实际文本块用于公开结果，原结果完整保存；Claude 的 create 回执不据此猜测新增。原生子Agent属于员工执行树，不创建BOAI联系人。运行时没有公开的子事件不能伪造。
- `process-guard/`：保留可独立复用的 Rovai Rust 进程树模块，薄 CLI 封装透明转发原生 stdio。`native-process-supervisor.ts` 只负责宿主 IPC 与 guard 生命周期；guard 在确认捕获的后代进程退出后才退出。macOS 重启调用原台账恢复，不发送新 Agent 请求。旧阶段传输仍保留原进程组行为。
- `native-process-guard.ts`：查找构建产物与已保存会话下的私有进程台账；不扫描或终止无归属的用户 CLI。开发/构建/Vitest 通过 `scripts/build-process-guard.mjs` 构建当前平台二进制，需可用 Cargo/Rust（edition 2024）。应用包配置将 guard 放在 asarUnpack，路径由主进程传给 worker；本轮不以配置接线冒充安装包验证。

单条协议帧的资源上限会明确报错；原生会话没有旧阶段的累计8MiB、固定48个宿主调用或120秒模型阶段限制。任务已明确配置的期限/额度仍由产品管理；一次外部turn不等于一次模型内部调用。

## 3. 产品接线

`NativeConversationEngine` 是持续原生turn入口；API员工继续走Mastra。共同保存员工、消息、群、工作、委派、文件版本和回执，不要求本机额外运行decision/report/memory模型。

`NativeSessions` 按运行时、员工和产品会话隔离，保存实际session/turn和已投递消息身份；原生会话管理自己的上下文压缩。重启仅核对映射，未知运行不重放。更换执行来源/撤销输入/恢复备份会撤销旧会话续用资格；明确新消息重新建立获准上下文。

`native-products.ts` 只追加BOAI产品操作：普通消息发送、获准聊天快照分页读取、文件发布、委派/等待/工作结果、核心组织及具名团队。公开消息按实际调用身份去重；后续相同最终回复不再重复发布，运行失败也保留已发布消息。普通原生工具无需先建Work。使用产品工作工具时惰性认领真实Work，成果仍经原复制/登记/不可变版本事务。绝对路径支持 macOS `/var` 与 `/private/var` 的工作区根别名，只规范化根、不解析候选文件后放行；每一组件的符号链接与归属核验仍由原发布边界完成。

负责人接续获得同事已交付文件的真实 `nativePath`；核对后可以在 `report_work` 引用明确依赖的成果 ID。结果事务重新检查依赖版本、成员归属和文件 hash，引用不改变成果所有权，也不把同事成果复制成负责人自己的交付。

实际模型、原生权限/思考强度、用量及供应商提供的上下文窗口/成本随运行保存。Codex 计量对应上游 `monitoring.rs` 的累计与最近请求语义，Claude 对应消息 usage、result modelUsage/contextWindow 与 total_cost_usd；没有返回的值保持未知，不反推内部调用次数。

`ExecutionRepository` 保存完整公开证据，started/delta/completed更新同一身份及递增revision。`ProductStore`提供历史页、内容块和Rovai窗口/变化合同。右侧依靠这些事实展示；旧Trace保留历史用途，不能冒充原生步骤。私有thinking、reasoning_summary不当作公开过程。

## 4. 旧测试如何处理

旧测试仍可从基线提交完整读取；原第一次全量失败日志保留，未删改失败记录。此次不是把旧阶段断言改成任意成功。

| 旧意图或断言 | 当前替代 |
| --- | --- |
| 创建员工、连续两轮、重启/清理、无API父模型 | `native-conversation` 双后端测试，要求每条普通消息恰好一个实际原生调用、同一session |
| 文件真实登记、重复工具调用去重、明确修订与原件 | 同套生产测试，真实stdio/MCP和文件副作用，固定family/version/hash |
| 问题卡、固定“补充”专用入口、额外私有决策 | 按11退役；改验普通聊天回答原生问题、相同turn继续、陈旧批准拒绝 |
| 同事/组织/具名团队、原预算、父子定向唤醒 | `native-conversation`及`native-mixed-collaboration`；双本机及API混合，实际Work/成果/预算核验 |
| 自动化沿旧五阶段、命令必须禁用 | 阶段/命令限制退役；原计划/occurrence/文件/重启保留；使用所选原生权限 |
| active换绑、来源撤销、备份不导出私有配置 | 新生产合同、既有`codex-sessions`/后端配置/员工保存/材料与存储测试 |
| 认证失败、未知副作用、停止实际退出 | `native-lifecycle`与既有进程/工具桥低层测试；不重放、不伪造完成 |
| 每次交付强制额外私有记忆调用、宿主替代所有原生工具 | 按11退役；正常本机会话不额外抽取，产品记忆仍沿自己的来源规则 |
| 只准少数版本号 | 改成真实程序身份和必需协议探测；未知版本不单因版本字符串拒绝 |
| 旧Codex阶段传输/Trace与Claude私有格式器历史解析 | 仍保留低层回归；`LegacyClaudeEmployeeEngine`明确为兼容测试，不是生产引擎证据 |
| 长输出、扩展/插件/子执行、分页/窗口/展开 | 新原生生产夹具及直接迁入的Rovai窗口测试；完整持久内容与窗口缓存分开验证 |

离线协议夹具只能证明接线与边界；真实Codex/Claude、真实桌面、业务原件和独立内容评分分别报告。人工校准未完成时，模型建议不升级成已认证质量。
