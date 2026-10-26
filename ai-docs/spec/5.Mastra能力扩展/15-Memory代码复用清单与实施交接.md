<!--
[OUTPUT]: 2026-10-25源码链接随Workspace迁移更新，历史验证结论保持。
[OUTPUT]: 2026-10-24按用户要求移除日常固定使用pnpm dev的约束；运行方式不预设，独立worktree及main仅同步已合并提交的规则保持。
[OUTPUT]: §10.11当前Bobo冻结9轮真实29请求完成，偏好纠正/临时边界已观察；通知补造事实保留，质量仍needs_review。
[OUTPUT]: §10.10补个人日常稳定化当前配置零调用准备和统一记忆管理原BDD入口红例/候选，未新增真实模型质量成绩。
[INPUT]: 2026-10-20用户明确先落实文档、以后实现Memory，并要求Mastra/Alma/Memmy/Hy-Memory能直接复用的代码直接复用；13/14研究、固定上游与当前BOAI源码。
[OUTPUT]: 开发合同、源码复用清单、迁移与验收矩阵，以及§10实际实施进度和本次全量CI失败范围；Mastra/Alma内置链路与受控Memmy客户端已接。
[POS]: 第5组Memory后续开发主入口；13提供现状/Alma依据，14提供组件选型依据，本文落实代码从哪里来、如何接、如何证明完成。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->

# Memory 代码复用清单与实施交接

日期：2026-10-20。状态：**内置Memory路径已实现并验证；外部Memmy仍暂停，真实屏幕授权与视觉体验未认证**。以§10为实际进度。

## 1. 开发目标与复用原则

本专题交付三个能力：bobo 持续对话记忆、用户跨会话长期记忆、桌面活动与日报的可检索记忆。按[14 选型](./14-记忆方案选型-Mastra与Memmy及Hy-Memory.md)实施，现状与 Alma 来源查[13 研究](./13-全局记忆与桌面活动-Alma对照研究.md)。

**开发时优先使用原包、原服务和可独立迁入的源码。已有实现可解决的问题，直接复用；新增代码集中在 BOAI 的身份、事件、来源、配置和 UI 接线。**

复用顺序固定为：

1. **直接调用依赖**：Mastra 已有 Memory/Working Memory/OM/存储能力，直接使用官方包。
2. **连接现成服务**：Memmy 的提炼、存储、检索、整理由原服务运行，BOAI 复制必要客户端/类型后适配。
3. **直接迁用源码**：Alma 的活动分析提示词、片段合并、主题归组等独立部分，保留算法结构，只改类型和宿主接口。
4. **已有实现确实不适用时再新增**：记录哪段原实现不能使用、实际原因和最小替换范围，不凭个人风格重写。

用户说的“能抄直接抄”落实到下文 R 编号。每项开发结果应能指回具体来源；不能只说“参考了 Alma”，然后重新设计一套同类算法。

### 首期组合

| 部分 | 首期方案 | 切换条件 |
| --- | --- | --- |
| bobo 对话记忆 | Mastra Memory + 本地 LibSQL；先公开历史，再按需启用压缩 | 不因外部长期 provider 切换而更换聊天引擎 |
| 内置用户长期记忆 | 原有来源/纠正/忘记事务库继续作权威；获准事实投影到Mastra Working Memory | 现有库已承担来源级生命周期，避免为了替换存储丢掉纠正与删除合同 |
| 外部用户长期记忆 | Memmy本地服务插件为条件扩展，当前暂停 | 固定2.1.6缺来源轮次级联撤销；未证明安全删除前不开放设置切换 |
| 活动片段与日报组织 | BOAI 现有采集 + Alma 可迁用代码 | 按真实来源补齐字段和状态 |
| 活动记忆处理 | 当前内置模式使用Alma活动分析与本地来源检索 | 将来启用外部模式才评估Memmy evidence管线；同一片段不重复跑两套等价提炼 |
| Hy-Memory | 保留同一 provider 接口下的替换实现方案 | 仅当 Memmy 不满足画像/纠正效果或部署需求时接入验证 |

首期不同时建设 Memmy、Hy、Mem0 三个生产适配器。Mem0 保留14中的备选结论，本篇无默认实施任务。

## 2. 固定来源与复制记录

| 来源代号 | 固定版本/身份 | 原件 |
| --- | --- | --- |
| M | `@mastra/core 1.71.0`、`@mastra/memory 1.32.1`、`@mastra/libsql 1.23.3` | [安装版 Memory API](../../../node_modules/@mastra/memory/dist/index.d.ts)、[安装文档](../../../node_modules/@mastra/memory/dist/docs/references/docs-memory-overview.md)；版本由项目锁文件约束 |
| A | Alma `0.4.196` 本仓库归档 | [可读 main.txt](../../alma-研究/原始文件/可读源码/main.txt)、[记忆与反思提示词](../../alma-研究/提示词/分类原文/05-记忆与反思.md) |
| E | Memmy commit `8cd095c7f67300b6582a912bdd7fd33163d5e5b4` | [固定源码树](https://github.com/MemTensor/memmy-agent/tree/8cd095c7f67300b6582a912bdd7fd33163d5e5b4)，Memory工作区 `2.1.6`；App发布 `v1.2.3` |
| H | Hy-Memory commit `8f1c4045e913566a6f40eb4451d68218b2307773` | [固定源码树](https://github.com/Tencent-Hunyuan/Hy-Memory/tree/8f1c4045e913566a6f40eb4451d68218b2307773)，SDK源码 `2.0.4` |

Alma 原件 SHA-256，供后续定位确认；行号仅适用于这一份归档：

| 文件 | SHA-256 |
| --- | --- |
| `原始文件/可读源码/main.txt` | `b94c2deb1fdc71fb58abdd86b7f0d16aebe3dba7406fa30132ccceed8d762a10` |
| `提示词/分类原文/05-记忆与反思.md` | `a573e33b2a0c6cd8de9f3ef236365b83b9c0da04a65bef6ba33141f9ea267810` |
| `技能/memory-management/SKILL.md` | `de7d537364d277f978f9101cc88e9a4cbeba5227bf83b19563f497249ab8a224` |
| `技能/daily-report/SKILL.md` | `eedba98094725213d3623be8d62f2c96fbd3809b5933013a427ac5fb29b39ec9` |

复制时在目标文件 Header 和本篇进度中记录：R 编号、原文件/函数、固定版本、原文件 hash、迁入位置、依赖、必要改动、验证结果。保留来源的许可证/版权声明，按仓库第三方代码方式登记；Alma 沿现有研究来源记录实际授权范围，不把研究归档标成新获授权的开源包。

升级上游时更新固定基线和差异记录，不把已核对的 commit 链接换成浮动 `main`。原始归档只读；运行代码放到对应源码模块，不能让产品直接执行 `ai-docs` 中的文件。

## 3. 逐项代码复用清单

### 3.1 Mastra：直接用包

| 编号 | 直接复用 | BOAI 最小接线 | 不另行实现 |
| --- | --- | --- | --- |
| R-M1 | `Memory`、`LibSQLStore`、Agent 的 `memory` 配置 | 稳定存储、thread/resource映射、实例生命周期 | 新的对话历史引擎 |
| R-M2 | `saveThread / saveMessages / recall / deleteMessages / deleteThread` | 公开消息提交后的投影、ID映射、来源失效 | 第二套历史分页/自动重放逻辑 |
| R-M3 | Working Memory schema、`getWorkingMemory / updateWorkingMemory` | 用户画像字段、来源关联、串行提交及模式切换 | 自建用户画像数据库和通用合并引擎 |
| R-M4 | thread OM、retrieval、`settled()`及相应存储接口 | 模型连接、计量/取消、删除重建、后台处理状态 | 自写 Observer/Reflector |

API 以[安装类型](../../../node_modules/@mastra/memory/dist/index.d.ts)、[Working Memory](../../../node_modules/@mastra/memory/dist/docs/references/docs-memory-working-memory.md)、[OM](../../../node_modules/@mastra/memory/dist/docs/references/docs-memory-observational-memory.md)为准；实际开工如版本变化先核对差异。

`readOnly: true` 会阻止框架自动写入，不能同时期待模型通过 Working Memory 工具更新画像。`lastMessages: false` 关闭历史能力，不是单纯减少回放条数。`settled()` 用于等待已启动工作，不等于取消。上述开关必须在相应阶段分别使用。

### 3.2 Memmy：复用客户端，算法由原服务执行

以下路径均相对于固定 E 源码：

| 编号 | 原路径/符号 | 复用方式 | 必要适配 |
| --- | --- | --- | --- |
| R-E1 | [`Memory/src/client/rest-client.ts`](https://github.com/MemTensor/memmy-agent/blob/8cd095c7f67300b6582a912bdd7fd33163d5e5b4/Memory/src/client/rest-client.ts) 的 `MemoryRestClient` | 直接迁用需要的请求、认证、时区和错误处理方法 | 使用BOAI凭据读取、AbortSignal/超时；只保留本期接口，保留协议字段 |
| R-E2 | [`Memory/src/types.ts`](https://github.com/MemTensor/memmy-agent/blob/8cd095c7f67300b6582a912bdd7fd33163d5e5b4/Memory/src/types.ts) 的 namespace/envelope、session/turn、search/add、evidence类型 | 直接迁用所需类型及依赖；运行时响应校验沿原合同 | 稳定用户/员工/项目/会话映射；缺失能力显式报告 |
| R-E3 | [`Memory/src/server/http.ts`](https://github.com/MemTensor/memmy-agent/blob/8cd095c7f67300b6582a912bdd7fd33163d5e5b4/Memory/src/server/http.ts) 的实际路由 | 服务直接运行；作为客户端合同依据 | 以实际版本核对session/turn、memory与evidence路径 |
| R-E4 | [`memory-service.ts`](https://github.com/MemTensor/memmy-agent/blob/8cd095c7f67300b6582a912bdd7fd33163d5e5b4/Memory/src/service/memory-service.ts) 的 `syncExternalEvidence / externalEvidenceStatus` 及派生失效 | 直接调用服务能力 | 活动ID、ISO revision、父来源、同步回执及本地待同步事件 |
| R-E5 | [`service/evidence/observation-memory-pipeline.ts`](https://github.com/MemTensor/memmy-agent/blob/8cd095c7f67300b6582a912bdd7fd33163d5e5b4/Memory/src/service/evidence/observation-memory-pipeline.ts) | 默认由原服务运行整条活动提炼管线 | 读取真实处理状态，引用其输出与来源 |
| R-E6 | [`service/user-memory/user-memory.ts`](https://github.com/MemTensor/memmy-agent/blob/8cd095c7f67300b6582a912bdd7fd33163d5e5b4/Memory/src/service/user-memory/user-memory.ts)、[`service/retrieval/retrieval-service.ts`](https://github.com/MemTensor/memmy-agent/blob/8cd095c7f67300b6582a912bdd7fd33163d5e5b4/Memory/src/service/retrieval/retrieval-service.ts) | 默认直接使用上游用户记忆/检索 | 真实轮次、纠正和范围映射；效果用中文案例核对 |

R-E1 原文件依赖 types、contracts 和 time 工具。迁入前列出需要方法的实际依赖，优先一起迁用必要部分；不要把与本期无关的 World Model/技能演化接口及整套 Agent Runtime 拉进来。

若以后明确选择内置 Memmy 引擎，可以把 R-E4–R-E6 连同所需 repository、worker、schema/migrations 和模型接口成组迁入。当前首选外部服务，**不为“抄代码”而拆掉已经可直接运行的完整能力**。内置迁用必须额外记录原依赖和实际维护成本，再替换服务路线。

### 3.3 Alma：可独立片段直接迁用

来源为 A 的 `main.txt` 及提示词归档，目标为 BOAI 现有桌面活动模块：

| 编号 | 原始位置 | 直接迁用内容 | 必要适配 |
| --- | --- | --- | --- |
| R-A1 | `05-记忆与反思.md` 中 `T-c5cf8f2e0c8c9e`；`processSession`约66136行起 | 活动结构化分析提示词、字段/输出协议、无价值活动跳过规则 | 对齐现有样本/片段来源；真实模型连接、输出校验和计量 |
| R-A2 | `mergePendingAdjacent`，66122–66135行 | 相邻已结束片段按间隔/应用关联合并的原逻辑 | 将store调用替换为BOAI存储；记录合并前样本及ID映射 |
| R-A3 | `gX / yX / bX / vX / EX / kX / TX / _X`，约67042–67128行；`AX`内归组，67219行起 | 项目/主题/实体特征、实体去重合并、主题命名与归组 | 抽取完整纯函数依赖，解开压缩命名；使用BOAI片段类型 |
| R-A4 | `AX`，67133行起；[daily-report技能](../../alma-研究/技能/daily-report/SKILL.md) | 主题日报组织、原文读取和缓存使用规则 | 接原`activity.report/save`、覆盖声明、深挖证据并集与来源hash |
| R-A5 | [memory-management技能](../../alma-研究/技能/memory-management/SKILL.md)及记忆回查提示词 | 先检索相关事实，再读取原聊天/日期材料的原操作说明 | 将`alma`命令映射为BOAI已有工具/当前provider，不保留无效CLI命令 |

R-A3 解开压缩命名属于可读性适配，不改变归组算法；用同一输入比较原片段与迁入代码输出。复制范围须包含实际调用的相似度、集合及格式化辅助函数。

BOAI 当前没有 Alma 的全部事件类型。缺少键鼠、浏览访问等字段时传空或明确缺失，不为兼容输入生成伪事件。原代码中的活动时长不能直接展示为用户连续工作时长。

R-A1 与 R-E5 按角色分工：内置模式需要Alma活动事实提炼；外部模式以Memmy为活动记忆提炼者，Alma代码用于片段组织/主题日报。已有Memmy结果足够时不重复调用同类模型；若日报还需要特定字段，仅提取所缺内容并记录实际调用。

Alma 的向量仓库、LLM去重、sleep整理调度和 bobo 现有人格反思不在首期重复搬入：这些职责已由选定provider或当前产品模块承担。13记录的丢来源容错、异步推送静默失败等问题不能随复制带入。

### 3.4 Hy-Memory：替换时直接使用原 SDK/服务

| 编号 | 原路径 | 复用方式 | 接入范围 |
| --- | --- | --- | --- |
| R-H1 | [`hy_memory/client.py`](https://github.com/Tencent-Hunyuan/Hy-Memory/blob/8f1c4045e913566a6f40eb4451d68218b2307773/hy_memory/client.py) 的 `HyMemoryClient` | 原SDK直接调用；先用`pro` | `add/search/get/update/delete/get_user_profile`，按当前版本支持面映射 |
| R-H2 | [`hy_memory/server.py`](https://github.com/Tencent-Hunyuan/Hy-Memory/blob/8f1c4045e913566a6f40eb4451d68218b2307773/hy_memory/server.py) | 原HTTP服务作为独立进程运行 | BOAI只做连接、状态、参数映射和退出 |
| R-H3 | [`plugins/openclaw/`](https://github.com/Tencent-Hunyuan/Hy-Memory/tree/8f1c4045e913566a6f40eb4451d68218b2307773/plugins/openclaw) | 若需要宿主启动封装，迁用其中实际可用的服务连接/生命周期代码 | 替换OpenClaw宿主接口；不移植整个OpenClaw插件平台 |

无需先把Python算法翻译成TypeScript。需要保存并读回的业务来源放在`meta`，不混用处理选项`metadata`；图能力与`ultra`不作为默认前置。桌面证据使用真实观察输入，不能伪造工具轨迹走working/coding路径。详见[固定使用指南](https://github.com/Tencent-Hunyuan/Hy-Memory/blob/8f1c4045e913566a6f40eb4451d68218b2307773/docs/usage.md)。

## 4. BOAI 接入文件与职责

下表中的“新增”是建议落点，**当前尚不存在**；开工时遇到已有同职责文件则合并，避免平行模块。

| 现有位置/拟新增文件 | 实施职责 | 复用编号 |
| --- | --- | --- |
| [agent-factory.ts](../../../packages/runtime/src/adapters/mastra/agent-factory.ts)、[engine.ts](../../../packages/runtime/src/adapters/mastra/engine.ts) | 公开阶段使用Memory；稳定thread/resource，消除重复历史装配 | R-M1–M4 |
| `src/runtime/adapters/mastra/memory-adapter.ts`（新增） | Memory实例、已提交消息投影、Working Memory读写、失效/关闭 | R-M1–M4 |
| [contracts.ts](../../../packages/runtime/src/contracts.ts)、[service.ts](../../../packages/runtime/src/service.ts) | 提供实际身份/来源/提交事件；原回执、取消、调用计量 | 原有产品链路 |
| [memory.ts](../../../packages/shared/src/domain/memory.ts) | provider选择、能力、来源及迁移状态；复用已有领域类型 | R-E2 |
| `src/runtime/modules/memory/memory-provider.ts`（新增） | 小型provider合同及选择；统一现有工具入口 | R-M3、R-E1/E2 |
| `src/runtime/modules/memory/providers/memmy-client.ts`（新增） | 迁入客户端与必要类型，连接原服务 | R-E1/E2 |
| `src/runtime/modules/memory/memory-sync.ts`（新增） | 稳定事件ID、待同步状态、来源映射、核对/删除 | 原事务及provider回执 |
| [memory-tools.ts](../../../packages/runtime/src/modules/memory/memory-tools.ts)、[memory-recall.ts](../../../packages/runtime/src/modules/memory/memory-recall.ts) | 接当前provider；保留有界召回/真实来源，不增加同名平行工具 | R-M2、R-E1 |
| [memory-repository.ts](../../../packages/runtime/src/modules/memory/memory-repository.ts) | 保留未迁移范围；旧数据读取/迁移和已有来源屏障 | 原实现 |
| [plugins/types.ts](../../../packages/shared/src/plugins/types.ts)、[catalog.ts](../../../packages/shared/src/plugins/catalog.ts) | 增加memory贡献及启停/兼容声明；复用现有设置持久化 | 既有插件平台 |
| [activity-service.ts](../../../packages/runtime/src/modules/desktop-activity/activity-service.ts)与同目录拟新增`activity-analysis.ts / activity-report.ts` | 片段、Alma归组/协议、Memmy evidence接入、清除传播 | R-A1–A4、R-E4/E5 |
| [desktop-activity.ts](../../../packages/shared/src/domain/desktop-activity.ts) | 片段、分析状态、实际来源集合和报告版本 | 现有活动领域 |
| [employee/memory-pane.tsx](../../../apps/electron/src/renderer/components/employee/memory-pane.tsx)、[设置入口](../../../apps/electron/src/renderer/pages/settings/index.tsx)、[桌面活动设置](../../../apps/electron/src/renderer/pages/settings/desktop-activity.tsx) | 复用管理页，增加provider/状态/来源与必要操作 | 原UI与provider能力 |
| [boai-daily-report技能](../../../resources/agent-skills/boai-daily-report/SKILL.md) | 迁用Alma报告规则、明确活动来源及深挖后保存 | R-A4/A5 |

插件首版是受控连接型能力：连接Memmy不自动安装另一套Agent、扫描所有软件或改动本机Hook。原生Agent已有Hook与BOAI事件可能重复时按真实会话/轮次映射处理，不修改本机原生权限。

## 5. 关键接线约定

### 5.1 bobo / Mastra：先落实已提交消息

首期采用明确提交后投影：

1. ProductStore继续保存公开聊天原件。
2. 用户消息受理、助手消息完成发布后，以稳定消息ID写入Mastra thread；受理中的当前请求在生成输入中只出现一次。
3. 公开生成读取该thread，使用`readOnly`防止未提交回复被框架提前写入。私有判断/内部报告/失败候选不进入公开thread。
4. 适配层同步有延迟时先补齐本次所需已提交消息，或明确使用原产品上下文降级；不能把缺历史的调用标记为连续记忆成功。
5. Working Memory更新单独提交。首期复用现有候选提取和来源校验，将通过的画像内容交给官方`updateWorkingMemory`；不让`readOnly`调用承担自动写画像。
6. 选择Memmy后，用户长期事实由Memmy维护，停用该用户范围内被替代的旧提炼/画像写入。bobo自身经历与其他员工的旧记忆按各自范围保留。

这种接法直接复用框架历史与Working Memory，现有提取阶段只是迁移接线，不新增提取算法。后续如果改用原生Working Memory工具，必须仍经过明确写入阶段和来源校验，不同时保留两条自动画像写入。

OM作为后续独立步骤：`readOnly`读取本身不证明Observer已运行；必须核对安装版实际触发方式、模型连接、取消和失效重建。只在压缩真实长会话有收益时开启，首先限定thread；resource检索范围另外校验。

### 5.2 Memmy：最小连接合同

第一版围绕状态、查询/读取、真实轮次、明确保存/纠正/忘记、活动同步六类操作实现。复用原session/turn请求，记录provider返回的真实ID；不得从显示名称、相似文本推测身份。

配置包括启用状态、endpoint、凭据引用、provider版本/能力和范围映射。模型及embedding由所选模式管理：使用外部服务时读取其实际就绪状态；不要默认为它配置了模型，更不要在BOAI和外部服务各启动一遍相同提炼。

外部调用超时不等于未写入。适配层保存稳定请求ID、请求版本和待核对状态，优先通过回执/状态查询核对；服务没有提供可靠核对方式时保留“未知”，不无限重发。

插件停用后停止新写入/召回并保留原数据；切换为内置模式需要明确迁移状态，不能静默让两套画像继续分叉。

### 5.3 活动与日报：保留证据，复用分析

样本→片段→主题日报→长期候选分别有ID、时间与状态。R-A2只负责相邻片段合并，不把切换应用解释成任务完成。R-A3直接使用原归组逻辑；缺实体字段保留空值。

外部模式将片段送入R-E4，使用R-E5的处理结果。日报仍保留真实样本来源；深挖取得的新样本加入最终证据快照，由宿主生成hash，不能只保存最初抽样集合。

上游`evidence/sync`使用ISO时间形式revision，内容hash单独保留。按其内容/父来源上限分组；父来源缺失、更新、删除时按原协议处理并核对状态。原始OCR、处理后的活动事实、日报不能被当成三份独立证明。

### 5.4 删除、纠正与跨会话

来源失效沿原产品屏障传播到provider、Mastra投影/OM、活动分析及报告。执行中读取的旧版本在提交前再次检查。对不支持细粒度清理的压缩记录，失效并从仍有效原文重建，不能继续注入旧摘要。

同一用户画像可以跨bobo本人会话；普通员工、群聊、渠道按实际可用范围读取。Mastra resource和外部namespace是存储身份，不替代原成员/来源规则。

“普通保留期到期”和“用户明确忘记”沿13中分开的产品语义。来自已清除活动的聊天报告副本可以继续作为原聊天记录存在，但不能再次成为自动长期提炼来源。

## 6. 迁移与回退

迁移按用户范围/provider批次进行：枚举有效旧条目→校验来源→写入候选后端→记录真实目标ID/版本→读取核对→停止该范围旧自动写入→切换召回。保留旧库及迁移清单，避免直接删除个人历史。

先用合成数据验证，再迁移明确选择的个人范围。旧条目中的临时、已删除、过期、限制会话及来源失效状态原样处理，不能全部升成用户长期画像。

回退不是把所有后端自动合并：恢复上一provider及已知同步位置，对切换后新增/纠正的数据逐项核对。跨库没有原子事务，失败批次保留状态，不能只凭“请求返回”标记全量迁移完成。

## 7. 分阶段实施

| 阶段 | 必做内容 | 完成条件 |
| --- | --- | --- |
| M0：固定来源与合同 | 核对当前版本、记录R项依赖/原件hash，明确身份/来源/事件映射和后端选择 | 每项有原实现与目标落点；没有无理由的新记忆算法 |
| M1：bobo原生Memory | R-M1–M3、公开历史投影、既有来源库画像、旧提取接线与来源失效 | 同一bobo跨新会话/重启连续；内部阶段不污染；纠正/删除真实生效 |
| M2：Memmy插件（条件扩展） | R-E1–E4/R-E6、设置/状态、真实轮次、管理与停用、稳定请求核对；当前仅有封闭客户端与状态 | 上游或本地补足来源轮次级联撤销并证明后，才可完成外部模式读写闭环；当前内置交付不依赖它 |
| M3：活动与日报 | R-A1–A5按模式接入、R-E5、真实样本/片段/报告来源和删除 | 非空活动到报告再到检索可追踪；无虚构完成/时长；深挖来源完整 |
| M4：迁移及完整验证 | 内置路径保留原长期库而不迁移事实；Mastra历史投影可重建。验证UI、备份恢复与打包运行；按需R-M4长会话试点 | 内置路径必验项完成，实际失败与未认证项保留；外部切换迁移随M2延后 |
| H：条件替换 | R-H1–H3，复用同一provider合同 | 仅在明确缺口触发后实施；相同资料集证明替换收益 |

每个阶段立即验证自己引入的删除、取消和故障行为，不把它们推迟到M4。M4负责跨模块完整闭环。调试时核对目标应用实际加载的构建；发行包验证另列，不能用源码运行代替。

## 8. 验收清单

| 编号 | 场景 | 通过证据 |
| --- | --- | --- |
| V01 | 同一bobo三个新会话延续偏好，改名/切模型/重启 | 实际召回来源及回答一致；身份不随显示名变化 |
| V02 | 本次格式要求、长期偏好、临时事项 | 正确层级/范围；临时要求不会影响无关新任务 |
| V03 | 用户纠正A为B，再明确忘记 | 读取与回答采用B；忘记后原文/报告/OM不复活 |
| V04 | 多员工、群聊、渠道、同名主体 | 只在获准范围召回，不把他人或屏幕文字归用户 |
| V05 | 取消、内部判断、未发布回复、重复提交 | 公开历史与provider记录均无伪完成和重复轮次 |
| V06 | 服务离线/超时/重启、同请求不同载荷 | 已写入/未知/失败状态真实；稳定回执核对，不盲目重放 |
| V07 | 复制Alma片段归组代码 | 固定输入下原片段与迁入实现等价；差异有原因和记录 |
| V08 | 真实非空活动、跨午夜/时区、OCR缺失/截断 | 观察时间与覆盖正确，浏览/计划/完成不混写 |
| V09 | 日报深挖、聚合证据、样本更新/删除 | 最终实际证据集合完整；派生内容和在途提交正确失效 |
| V10 | 旧库迁移与切回 | 有目标ID/版本/核对结果，无状态丢失和双重写入 |
| V11 | 长会话OM（启用时） | 确有压缩/连续性收益，删除重建、调用用量和取消实际可核对 |
| V12 | 管理UI与实际运行环境 | provider状态/来源/纠正/忘记可用，源码运行与发行包分别记录 |

中文质量测试使用同一组输入比较当前基线、内置模式和Memmy，分别统计错误长期写入、有效事实召回、来源支持、纠正采用及实际成本。提示词存在、接口200、类型检查通过不能代替真实记忆效果。

优先复用上游相关测试与项目已有测试，仅补本项目特有的发布/来源/双后端/活动集成场景。复制代码需有行为对照，不能只写复制实现本身的镜像断言。测试数据和产物按当次用户要求处理。

## 9. 开工时的执行约定

后续要求实现Memory时，从本篇M0开始，依次推进M1–M4；先阅读目标目录`.folder.md`及实际代码，再按R编号取原实现。13/14仅作为依据，不重复开展无边界选型。

遇到原代码依赖缺失，先取完整相关依赖或直接使用原服务；只有确有不兼容才写最小适配，并在下节说明。Hy替换阶段是条件项，不以“研究了四个项目”推导“必须全部实现”。

应用错误沿Sonner，界面字体沿[统一字体与字号](../3.前端重构与功能/20-全局字体与字号设置.md)。设置、员工记忆页、桌面活动页复用现有组件，新增状态就近展示。

## 10. 当前状态与后续唯一实施进度

### 10.1 2026-10-20：实施文档已落实（历史起点）

- 完成13现状/Alma研究、14选型及本篇R编号源码复用清单、接入文件和M0–M4/H交接。
- 本轮核对安装版Memory API与Alma指定源码位置/原件hash，更新目录索引并检查文档链接。
- 当时M0–M4/H均未开工；下节记录随后获得授权的实际实施，不能把本条当成当前状态。

### 10.2 2026-10-20：M0/M1与M2首批接线，完整目标未完成

- 直接调用安装版`@mastra/memory`和`@mastra/libsql`：普通bobo API聊天按稳定thread/resource投影仍有效的公开历史、刷新thread Working Memory，模型读取模式避免同轮重复写入；清除本人会话删除Mastra thread。`tests/bobo-conversation-memory.test.ts`覆盖投影、重启、来源失效与清除；`mastra-engine.test.ts`已用真实Mastra SDK和本地受控HTTP证明历史/Working Memory进入模型请求、当前轮次仅一次及失效原文剔除。尚未完成跨新会话的真实模型人格/长期纠正验收，OM未启用。
- 复制并缩窄固定Memmy REST客户端，保留MIT许可证；本机Memmy 2.1.6只做健康读取，存储与模型状态就绪，**没有把真实个人资料同步到该服务**。新增内部版本化配置与凭据库、owner-only状态读取、固定namespace的有界召回。实验路径中bobo公开回复经原发布事务写`userMemoryTurns`待同步记录，后台按固定来源身份调用`source-turns/complete`；识别`stored/existing/rejected`和`pending/conflict`，未确认保留unknown，不凭HTTP 200假报成功。mock服务测试已通过，尚无真实服务写入/模型效果认证。
- 活动日报新增`activity.report.prepare`：将深挖后实际读取的样本ID交宿主核验并生成最终sourceHash，保存时再核验；深挖/过期回归通过。R-A2迁用Alma相邻已结束片段的间隔/应用重合规则，在BOAI按有序OCR样本产生观察片段预览，只给实际观察时间与来源ID，不推算连续时长；聚合/完整片段持久化仍待后续。
- 备份会先等待在途Memory同步，副本中外部provider改为local，未确认轮次保留unknown，不导出Memmy数据；Mastra投影在有效历史基础上重建。退出先等同步再关ProductStore。
- 尚缺：Memmy写后读取与删除/纠正的可信闭环、provider UI和切换迁移、Alma活动片段/主题代码迁入、活动证据同步/清理、真实bobo与桌面运行质量及发行包验收。**M1–M4均未宣告完成**。Memmy轮次删除API无按来源轮次级联撤销的直接接口；清会话时不可假称派生记忆都已删除，必须在启用该模式前解决或保持内置模式。

后续每个实施批次在本节追加：阶段/R编号、实际代码来源与差异、改动文件、实际验证/失败、数据迁移状态、剩余事项。历史成绩仍归原文档，不重复计入本专题。

### 10.3 2026-10-20：活动/日报本地检索与外部模式启用门槛

- `activity-fragments.ts`按Alma R-A2的间隔/应用重合规则投影观察片段；`activity.memory.search`在既有保留期内统一检索原始观察和来源仍有效的日报，报告返回原样本ID/hash且不算第二份证明。来源版本变化或清除后，跨日搜索、`activity.reports`列表和`activity.report`缓存均不再返回旧报告；R-A5的默认记忆/日报技能改用该入口再核读原样本。定向回归及真实bobo会话中应用目录/授权调用测试通过；尚未验证真实模型是否正确利用来源。
- 核对固定Memmy 2.1.6的实际HTTP路由：`source-turns/complete`与按ID `memory.delete`存在，**没有按来源轮次级联撤销的接口**；已产生的长期派生条目无法仅凭首次回执中的L1 ID证明全部删除。因此不把该版本当成满足BOAI忘记语义的现成插件，移除公开`memory.provider.configure`操作，默认沿已有本地记忆仓库。内部连接/回执代码仅作为后续适配实验，不向用户自动发送真实记忆；曾保存的实验Memmy配置在重启后显示为暂停并停止外部召回/同步，本地记忆照常使用，待同步记录不自动重发。若后续上游提供可信级联删除或采用单独隔离实例并完成来源核对，再以测试证据开放选择。
- 这不表示完整M3完成：活动结构化分析、Alma主题归组、长期候选/来源级生命周期、跨范围权限和真实桌面质量仍待实现。M1跨会话真实模型验证、设置/管理UI和备份恢复验收也未完成。

### 10.4 2026-10-20：来源读取补强与隔离开发版启动

- 日报的跨日检索、`activity.reports`列表、`activity.report`短时缓存共用当前样本ID/hash核验；样本内容版本变化时旧报告从三处同时消失。真实bobo会话调用`boai_catalog`/`boai_call`读到有来源的观察；非法输入及其他员工调用被拒。夹具没有真实OCR权限或真实活动分析质量结论。
- 实际Mastra SDK配本地受控HTTP模型端点验证bobo公开请求：已提交历史与Working Memory进入模型输入，当前用户提问只出现一次，来源失效后旧原文不再进入后续请求。真实AppService和可控模型还验证本地长期偏好在bobo新会话/重启的上下文装配、纠正后采用新文本及明确忘记后不再出现；完成轮次自动提取的偏好能进入另一新会话，清理原来源会话后不再出现。此结果不证明真实模型在跨新会话中正确理解或遵守长期偏好。
- 隔离`BOAI_DATA_DIR`运行`pnpm dev`成功启动Electron/worker；该运行态CLI `ping`成功，`activity.memory.search`出现在应用目录，`memory.provider.status`为`local`、无待同步。隔离目录已清理，未碰用户当前开发数据。最新10个记忆/活动测试文件69项通过，类型与源码构建通过；Mastra引擎新增的真实SDK用例定向通过。发行包及真实模型仍待验。
- 明确修改/忘记bobo本地长期记忆或清理bobo来源会话时，宿主调用Mastra适配器删除该用户全部派生thread；下一轮从仍获准的ProductStore消息与本地记忆重建。测试既核对真实LibSQL两个thread被清除，也核对宿主在三种人工操作及来源清理时调用清除。其他会话的公开历史仍由ProductStore保留；这一步只清除可重建投影。

### 10.5 2026-10-20：Alma结构化活动与主题归组首批接入

- R-A3从固定Alma源码的项目/主题/仓库/标识符/人/URL host特征、Jaccard `0.18`门槛和实体去重规则迁为纯函数`activity-analysis.ts`。BOAI当前仅有离散OCR观察，没有Alma键鼠事件或可信的连续会话时长，因此不迁入按时长合并“其他零碎”及“活跃分钟”文案；不会把采样间隔写成工作时长。
- `activity.analysis.prepare/save`让真实样本ID/hash与结构化分析同事务绑定，支持批量`worth/title/description/project/topics/highlights/entities/memoryCandidates`；仓库、标识符、版本、URL、人handle及PR/Issue/Commit引用须能在窗口或OCR文本中找到，标题和描述仍需真实模型质量检查。`memoryCandidates`仅作为未晋升建议保存，不自动写入用户长期记忆。保存后`activity.analyses`分页返回来源仍有效的分析与本页主题，`activity.report`最多附40条并标明分析总数/截断状态，`activity.memory.search`可跨日检索；样本版本变化、到期或清除会使派生分析失效/删除。日报技能借鉴R-A1的字段与稀疏候选规则，在现有bobo模型工具流程中调用结构化保存，R-A4仍沿原报告保存与来源核验。
- 设置页展示来源仍有效的活动主题、逐项分析和未晋升的长期候选；打开分析时通过`activity.analysis.sources`按需分页读取原始OCR，来源版本变化立即拒绝旧分析。纯函数行为对照及实际ProductStore/应用协议测试包括bobo授权会话中准备、保存、检索，拒绝伪造实体、旧hash及不自动晋升；超过40条分析时日报标记截断，下一页由协议可读。另用隔离`pnpm dev`/Electron运行态CLI核对新目录与`activity.analysis.save`实际JSON Schema可发现，隔离目录已清理。这里还没有真实模型生成的分析质量结论，也没有把候选安全晋升到长期库的生命周期；M3和全目标仍未完成。

### 10.6 2026-10-20：bobo跨会话真实模型探路与忘记措辞修正

- 新增[隔离探路执行器](../../../tests/evaluation/bobo-memory.ts)与[手动入口](../../../scripts/evaluate-bobo-memory.mjs)，显式选当前本机`deepseek-v4-pro`连接，仅经原Electron只读凭据桥传给内存中的隔离AppService；固定合成偏好、跨新核心会话、明确手工纠正和忘记四轮，12请求/10000输出token/6分钟硬上限。它使用真实Mastra引擎、产品消息/记忆事务和本地Mastra LibSQL，而不是固定模型回执。测试数据只在独立目录，日常用户库未写入。
- 第一批8个已开始调用中有2个因**评估器自身并发写`result.pending.json`**导致公开回复失败/用量未知；不能算产品成功或失败。修复执行器串行保存后，第二批10个有已知用量的调用完成四轮：自动提取将“白桦”偏好连到真实用户消息，新会话采用白桦，手工纠正后采用银杏，忘记后长期记忆空且未泄露旧称呼。但忘记后的文本说“你没跟我说过”，把当前不可访问误说成历史上从未发生，是实际质量缺陷。
- 在共享公开回复规则中增加“无可访问记忆只说目前不知道，不断言用户从未告知”的通用来源边界。第三批同样10个已知用量调用，4轮全部正常：自动提取有来源、跨会话白桦、纠正后银杏、忘记后回答“目前没有关于你想让我怎么称呼你的记忆”，没有再误说从未告知；本批合计输入120814/output1070 token。第二、三批是同一固定合成样例的开发复验，不是独立验证集、人工人格评价或普遍成功率。类型、11个记忆/活动测试文件72项、界面lint和源码构建通过；原始隔离测试产物按用户清理要求删除，仅保留这些文字结论与测试源码。
- 仍需M2可信外部服务删除/切换闭环、M3真实桌面样本到分析/日报的模型质量与候选生命周期、M4旧库迁移/备份恢复/发行包检查。Memmy 2.1.6未证明来源轮次级联撤销前保持暂停，不因内置探路通过而开启。

### 10.7 2026-10-20：合成桌面来源的真实模型日报闭环

- 新增[隔离桌面探路](../../../tests/evaluation/bobo-activity-memory.ts)及[手动入口](../../../scripts/evaluate-bobo-activity-memory.mjs)。在独立ProductStore放入三条明确标成草稿/待审核/明日计划的合成OCR观察，以产品设置页相同的bobo提示走真实`deepseek-v4-pro`与应用工具，预设14请求/12000输出token/6分钟上限；只读凭据在原Electron桥内存传递，未改用户日常数据库。
- 实际11个已知用量调用（输入280678、输出3403 token）后，bobo保存三条各有1个原始样本来源的结构化分析、一份绑定全部3条样本的主题日报；跨记录`activity.memory.search`找到原观察、分析和报告。公开日报明确写出测试尚未运行、PR尚未合并、明日评审未完成，没有将草稿或计划写成完成；`memory`长期库保持空，活动候选也为空。上述是这组三条**合成**窗口内容的实际模型结果，不是macOS真实截屏/OCR质量或所有日常任务的普遍质量证明。测试产物按用户清理要求删除，仅保留文字结论和执行器源码。
- 设置页可逐页查看超过20条的结构化分析，每条按需翻页复核原始OCR与未晋升候选；服务报告仍使用Alma式跨分析主题归组。这批11次模型调用处理3条观察，成本较高。当前相关11个测试文件73项、类型/界面lint/源码构建通过。后续需要实测真实桌面采集、跨午夜/时区、OCR缺失、分页深挖和打包版路径，并比较技能步骤能否减少工具往返而不牺牲来源；M3/M4仍不宣告完成。
- 增补真实SQLite `VACUUM INTO`备份→新ProductStore恢复的来源闭环检查：分析与日报在重开后保留样本ID/hash与检索结果，按日期清除原样本后两种派生内容均消失。此项证明本地数据库恢复路径，尚不能代替跨机器应用发行包恢复。
- 最新隔离`pnpm dev`/Electron运行态CLI `ping`通过，`app describe activity.analysis.sources`返回实际可用的分页来源JSON Schema；退出后隔离数据已清理。此项证明源码运行中的应用协议，仍不代替发行包验收。

### 10.8 2026-10-20：本机打包版只读启动核对

- `pnpm package`成功生成macOS arm64目录包。未找到有效Developer ID签名，因此该目录包没有签名，不宣称可对外分发或完成跨机器安装。直接用独立`BOAI_DATA_DIR`启动目录包后，CLI `ping`成功，实际应用目录可读取`activity.analysis.sources`和`activity.memory.search`合同；asar内含新版运行worker、`bobo-mastra.db`路径及更新后的`boai-daily-report/SKILL.md`。未安装/覆盖日常应用，退出后隔离数据和本批目录包已清理。
- 到此只覆盖本机打包进程启动和应用协议，尚未做设置页人工视觉、真实系统屏幕录制授权/OCR、旧数据跨机器恢复或Memmy外部提供方安全切换。它们分别按M3/M4/M2保留，不能由目录包启动推定完成。

### 10.9 2026-10-20：本期内置路径交付边界

- 本期选定14 §1所述**内置路径**：bobo公开会话使用Mastra Memory/LibSQL与Working Memory输入；长期用户事实沿现有带来源、纠正和忘记事务的本地库，按授权投影给bobo；桌面观察、Alma式分析和日报保留独立有期限的来源检索。桌面分析中的`memoryCandidates`是待核建议，**不自动晋升为用户画像**。因此清除桌面活动可连带清理其派生分析/日报，不存在已自动复制到长期库却无法撤销的活动事实。外部Memmy/Hy是条件扩展，不是本期已启用能力。
- 本期内置代码的主要闭环已验：合成真实模型偏好提取→跨会话→纠正→忘记；合成OCR的分析→主题日报保存→跨记录检索；原来源版本/删除/保留期、跨本地午夜与OCR空值、SQLite备份恢复；隔离`pnpm dev`及未签名目录包的CLI协议可用。相关11个测试文件现有74项通过，类型、界面lint、源码构建和目录包构建通过。第一批真实探路的评估器并发写失败、基线忘记措辞错误及修正后结果均在§10.6保留，没有用后批覆盖原失败。所有本批隔离测试数据和目录包已清理，测试源码及文字结论保留。

- 2026-10-20复核：上述记忆效果仍为§10.6–10.8的**既有实际记录**，本次没有新增真实模型样例。GitHub PR #3 的全量 `desktop` CI在Vitest阶段失败46项，未进入Playwright；其中旧组织恢复夹具仍硬性要求只提供3个工具，而当前普通bobo实际提供更多工具，本机复现该夹具失败。因此不能以定向74项与合成探路宣称全仓回归通过，也不能把该夹具失败直接算作“忘记”行为本身失败。真实macOS屏幕授权/OCR与日常长期效果仍未验收。
- 后续可选/人工项：用户实际开启屏幕录制后的OCR质量、设置页人工视觉、长会话OM的收益、跨机器签名/安装恢复、以及外部Memmy在来源轮次级联撤销后接入。这些未获验证，不能当作已通过；若将来选择外部provider，必须另起M2迁移与删除验收，不能复用本期内置成绩。


### 10.10 2026-10-22：个人日常稳定化记忆准备与管理UI复验

第23组原评估入口已可只读冻结当前Bobo档案和10个源文件，并生成实际多轮题目/标准供审阅；日常库不初始化、不导入本人历史。当前4类9轮样本为偏好纠正、单次格式、自然稳定偏好与临时角色，冻结档案revision16；准备零请求，用户样本反馈尚待取得。该批拟定deepseek-flash、30请求/12分钟，尚未调用，不能继承§10.6的历史模型成绩。快照与零调用准备9项、原完整备份（补来源记忆/员工源文件/配置及两次恢复启动零重放）1项分别在[39647534063](https://github.com/6owen/boai-agent/actions/runs/39647534063)通过，service其余117项在该定向批次未运行。

原统一管理BDD在[39647942995](https://github.com/6owen/boai-agent/actions/runs/39647942995)以开发版真实Electron失败1场：30秒内找不到“编辑配置”，尚未进入记忆业务步骤。原PNG显示正确研究员与现行“高级配置”按钮，实际组件也已采用高级配置/独立记忆编辑Dialog和Sonner。这是退役入口定位导致的测试失败，尚不据此宣称所有管理业务通过。

候选更新同一原场景的入口、添加记忆名称、Portal Dialog作用域、语义article和Sonner定位；原添加/固定/重启/忘记、保存冲突保留草稿、未保存退出确认、旧范围显式升级及来源收紧跨重启断言全部保持，期限/重试不变，并追加实际关键帧与最终记忆记录。产品记忆语义、外部Memmy暂停和权限未改。等待该候选真实云端复验；跨阶段唯一进度仍归第23组02。


候选首批[39648914978](https://github.com/6owen/boai-agent/actions/runs/39648914978)仍failure，原90秒期限保持：添加/固定/第一次重启/忘记及真实保存冲突草稿已进入并留关键帧，第三次启动（注入旧格式记忆后）超时，原截图为通讯录空列表，尚未执行旧范围升级和来源收紧。当前不判定为纯慢启动或产品数据丢失；独立39650202627在同一夹具逐段核对关闭前后、ProductStore初始化/旧记录写入后、重启RPC的员工ID，区分错路径、写入影响和启动/读取未完成。该探针仅在独立分支，不混入产品逻辑，原失败保持。


分段[39650202627](https://github.com/6owen/boai-agent/actions/runs/39650202627)在1b4db5b6实际1场success，未改90秒、原业务断言或产品记忆逻辑。独立SQLite记录在桌面关闭后、ProductStore初始化后、旧记录写入关闭后均为原4名员工；第三启动实际snapshot也为同4名、errors为空。随后旧范围显式升级、来源收紧及第四启动持久化全部通过。报告总时长89.1秒，接近全场期限；此前39648914978的超时仍保留，单次通过不能关闭开发版重复冷构建/整体时限问题，也不能倒推原失败中持久记录已丢失。

最终测试保留这些真实边界断言、改用snapshot报告的数据路径并与隔离v2实际文件核对，临时DEBUG标签移除；接下来在原编译版BDD模式核验最终代码。开发版一次全场成功与原一次超时分别报告，不循环重跑选最好成绩。当前仍没有本批真实模型结果。


最终管理候选在39651502528的原编译模式实际1场通过（报告总56.4秒，原90秒/全部断言保持），临时标签已清理，实际dataPath/旧记录写前后和重启员工身份校验保留。同run当前备份暂停档案测试也1项通过；run整体因未获取固定旧提交的基础设施准备失败，不称整轮通过。后续39652336198已显式取得固定fbe源码及相同依赖，用旧数据入口/运行时恢复候选隔离备份并再次打开，原来源记忆及暂停人格状态等全部原断言通过；实际范围和未覆盖项见第23组02。没有本批真实模型成绩，也未开启外部Memmy。


### 10.11 2026-10-22：当前个人配置的真实记忆基线

用户实际回复“继续”后，沿已展示的4类9轮样本/30请求/720秒范围执行，未扩题或修改评分标准。只读重核原Bobo configVersion 78/profile revision 16及10个源文件hash未变化；实际以当前e6源码重新编译评估worker，并逐字核对原冻结9条输入。凭据由原Electron只读桥经内存传递；原个人库和人格源文件未写入。未加载真实个人聊天/记忆到评估库，也未调用judge或自动优化器。

首次准备因缺少本机进程监督程序而在首次模型请求前停止，真实请求/模型调用均0，失败原件保留。仅构建原监督程序后沿相同冻结worker和配置继续，新隔离库完成9个独立会话/9轮，29/30真实请求，全部HTTP 200、Run/Turn完成，41.123秒，未扩额度或重试未知调用。实际模型为api.deepseek.com的deepseek-flash；已知input/output/total tokens为294267/2766/297033，29次用量均有回执；账单金额和本轮Codex会话用量未知。

可核对事实：自然陈述保存周报偏好；纠正产生新active记忆并将旧记录置为superseded，新会话回复使用新偏好。一次通知的“不列条目/不署名”未成为长期规则；学习与语言偏好各有原消息来源；临时采购角色为temporary/context，后续未断言为真实职业。以上记录/回答原件支持本批观察，不是独立人工评分或未见认证，quality保持needs_review。

真实失败也保留：延期通知额外写出同一时间/地点、议题议程不变等输入未提供的事实，没有满足“只说周二改周三”。不能把全部Run完成记成9轮业务全过；该问题进入事实约束队列，本轮没有凭空声明已修复。最后一轮还保存了一条“不要将模拟角色当职业”的长期规则，是否值得保留仍待真实审阅。完整忘记/来源撤权、重复稳定性与实际日常任务仍未通过本批认证。

原件保留在本机personality-evaluation/daily-stability-memory-authorized-ready-1792631303775，包括冻结设置/输入、逐请求结果、原持久记忆、用量与预算账本；此前零调用准备失败另存。个人配置原文与凭据不提交公开仓库。第23组阶段进度见02 §7.13。
