# Memory 与 Working Memory

日期：2026-09-27。状态：**建议基线，未实施新记忆能力**。核对 `@mastra/core 1.71.0`、`@mastra/memory 1.32.1`、`@mastra/libsql 1.23.3`。当前已交付能力以 [v0.2.2 记录](../2.已实现功能与代码现状/14-v0.2.2历史群聊与本轮边界.md) 为准。

## 1. 当前记忆链路

```text
产品消息 + 当前员工/会话/资源授权
    ↓ AppService 校验、筛选
MemoryRepository 的 profile + 当前 conversation 有效条目
    ↓ AgentHomes 装配 bootstrap；MastraEngine 投影有界消息
普通 Mastra Agent 执行判断、聊天或任务
    ↓ 独立的当前轮增量记忆维护
模型提出候选 → 宿主验证来源、权限、epoch → MemoryRepository 写入
    ↓
USER.md / MEMORY.md / 日期文件生成视图
```

当前已实现的是**产品级记忆**：

- [MemoryRepository](../../../src/runtime/memory.ts) 管理 `profile` 与 `conversation` 范围、员工所有权、来源消息/资源、版本、epoch、删除标记和串行写入。
- [AppService](../../../src/runtime/service.ts) 根据当前成员资格、绑定资源、来源可见性和失效快照筛选记忆，校验模型候选后提交。
- [AgentHomes](../../../src/runtime/agent-homes.ts) 将获准记忆装入 bootstrap，并生成有范围的 Markdown 视图。生成文件不是第二份可独立写入的记忆权威。
- [MastraEngine](../../../src/runtime/mastra-engine.ts) 显式投影消息上下文，分别标注旧轮与当前轮；记忆维护只提取当前轮增量，保留旧事实用于去重。长度/格式错误最多进行一次计入预算的纠正，不保存截断结果。
- [ProductStore](../../../src/runtime/store.ts) 直接通过 `@libsql/client` 保存产品记录；没有实例化 Mastra 的 `LibSQLStore` 或 `LibSQLVector`。

当前普通 Agent 没有配置 `memory`，因此没有 Mastra 自动 message history、Working Memory、Semantic Recall 或 Observational Memory。包已安装只是依赖可用。

## 2. 概念及框架行为

| 概念 | 含义 | 该安装版本的关键行为 |
| --- | --- | --- |
| 产品记忆条目 | 用户可查看/编辑、带来源和版本的事实 | 本项目自建；不等于框架 Memory 实例 |
| Message history | thread 内最近消息和工具记录 | 配置 Memory 后自动保存/加载；`lastMessages` 默认 10，计数包含工具消息等，不是 10 个人类轮次 |
| Working Memory | 始终相关的小型偏好、目标、任务状态 | 可用 Markdown template 或 schema；默认关闭，启用后的 scope 默认 `resource` |
| Semantic Recall | 从已存历史消息中检索语义相关内容 | 默认关闭；需要 storage、vector 和 embedder；scope 默认 `resource` |
| Observational Memory（OM） | Observer/Reflector 将增长的旧历史压缩为 observations | 显式启用；默认 thread scope；resource scope 为 experimental；另有后台模型调用 |
| Workspace | 文件系统、工作目录、技能与执行资源 | 与 Working Memory 是不同 API、不同数据；目录名不会启用长期记忆 |

这些能力不能互相冒名：当前本地 Markdown/TXT 关键词知识搜索不是 Semantic Recall；当前来源校验后的事实提取不是 OM；生成 `MEMORY.md` 也不是创建了 Mastra Working Memory。

### Message history

安装类型已将 `lastMessages` 标为 deprecated，建议用 `messageHistory: { maxTokens, atMaxRemoveTokens? }` 限制上下文。后者保护系统内容和当前轮，移除最老的记忆消息；被移出上下文的消息仍在存储中。设置 token 预算且未另设数字 `lastMessages` 时，不再默认套 10 条上限。

`lastMessages: false` 关闭该历史能力的自动加载和保存；`readOnly: true` 用于读取而不保存新消息，并不提供 Working Memory 更新工具。它们不是同一设置。

启用 Memory 后应按其协议传新消息，不能原样叠加当前完整产品历史。`retainFullInput: true` 只是关闭输入过滤，**底层历史仍会加载**，不是“替我禁用重复回放”的选项。当前有界投影策略与框架自动回放之间必须明确选择。

### Working Memory

Working Memory 可以由主 Agent 通过 `updateWorkingMemory` 工具更新；schema 模式对象字段深合并，数组整体替换。它适合少量持续相关数据，不适合不断追加全部聊天或无限增长的工作日志。

当前产品事实库已经覆盖一部分相同用途。直接启用可写 Working Memory 会出现两个写入入口，并可能给原本严格无工具的 chat/decide 增加框架工具。即使只开放记忆工具，这也属于产品边界改变，不能作为无感配置调整。

若后续采用只读 Working Memory 投影，内容仍从产品条目生成；投影缺少条目来源/删除版本的能力由适配层承担。仅设置框架 `readOnly` 不会自动接入本项目 MemoryRepository。

### Semantic Recall

Mastra 原生 Semantic Recall 检索的是**其保存的消息历史**，不是自动索引本项目 `MemoryEntry` 或磁盘知识文件。若要检索产品事实，应明确建立事实索引；若要使用原生历史 recall，则要建立经过授权的消息投影与稳定 ID 映射。

LibSQLVector 可保存本地向量；embedding 仍需显式选定模型和调用方式，不能因向量库存本地就宣称推理/嵌入离线。索引维度与模型必须匹配；更换 embedder 要重新建索引。

安装文档说明，recall 的 thread metadata filter 使用消息索引时的 metadata，后续修改 thread metadata 不会自动更新旧 embedding。它不能独自承担动态成员资格与资源撤权；取回后必须再次校验来源权限。

### Observational Memory

OM 维护的 observations 是长上下文压缩结果，不能直接等同于本项目用户可编辑、逐条来源可追踪的事实库。启用后由它管理旧历史压缩，不应再把同一完整 transcript、另一份无界摘要和 observations 同时塞进上下文。

该版本支持 LibSQL 存储，thread scope 默认；resource scope 会共同处理该 resource 的多个线程，仍属 experimental，文档明确提示并发线程任务延续串扰。第一轮试点应限定员工×会话 thread。

OM 有独立模型、Observer/Reflector 和异步 buffering。必须显式使用获准模型连接，不能依赖 `observationalMemory: true` 的框架默认模型或环境凭据。后台调用的预算、取消、错误和退出生命周期需要单独适配；`Memory.settled()` 是等待其后台工作/向量清理结束的接口，不应被误当成“取消后台工作”。

## 3. 数据权威与作用域建议

### 保留一个事实写入权威

| 数据 | 建议权威 | 框架接入后的关系 |
| --- | --- | --- |
| 公开消息、当前轮、员工配置、权限 | 产品数据库 | 不从框架历史反向创造公开发言或授权 |
| 用户保留/模型验证后的事实 | M1/M2 仍由 MemoryRepository 管理 | Working Memory 只读投影、向量索引可重建 |
| 模型请求所需历史 | 由授权的产品消息导出 | 若放入 Mastra Memory，标为派生 thread，稳定 ID、范围与版本 |
| OM observations | 框架派生压缩状态 | 不自动回写为用户事实；来源变化须使压缩状态失效或重建 |
| Markdown 记忆文件 | 生成视图 | 不与数据库双向自动同步 |

“数据库在同一个 SQLite 文件中”不等于“只有一个权威”。两个表或两个对象都能独立改同一事实时，仍然是双写系统。

### 员工、群、thread 与 resource

框架 thread 表示会话，resource 是拥有 thread 的实体；thread 的所有者不能随意更换。**Agent ID 本身不是 Memory 的隔离键。** 直接调用不同 Agent，若 resource/thread 相同，就可能读写同一份框架记忆。

建议的首次试点映射如下，属于待实现设计：

| 场景 | 建议映射 | 说明 |
| --- | --- | --- |
| 员工 A 在群 G 的派生上下文 | resource = `employee:A:conversation:G`；thread = `employee:A:conversation:G:main` | 显式 thread scope；不与员工 B 或其他会话复用 |
| 员工 A 在私聊 D | 使用包含 D 的另一组 resource/thread | 与群 G 隔离；相同用户不是共享授权 |
| 同一会话的新 turn | thread 保持会话稳定；turnId 作为产品元数据 | 不把每次发言当新 thread，也不丢失本轮边界 |
| 员工基础资料/profile | 继续由产品库筛选注入 | 不把私聊全文或私聊记忆升级成 profile |
| 群共同事实 | 如确有需求，新增独立共享对象与发布规则 | 不通过让全部成员使用同一私有 resource 实现 |

未来若确实要跨会话记忆，可改用员工级 resource 并显式设计 thread/resource scope，但这是授权与数据迁移决策。Working Memory 与 Semantic Recall 默认 resource scope，因此不可只传同一个 `userId` 就认为私聊、群和员工已经隔离。

群消息本身可共享，不代表员工私有工具结果、个人 workspace、内部判断或私聊事实也可共享。框架上下文只接收本次获准材料；`decide` 的内部 JSON、失败修复输入、记忆候选不得作为群公开历史自动保存。

## 4. M1：统一记忆治理与适配

目标：保留现有权威，把未来框架接入点明确化，不先开启第二套自动记忆。

拟增加记忆上下文适配职责：输入员工、会话、turn、授权资源、memory epoch 和上下文预算；输出用于模型的近期消息、事实、检索结果及来源清单。事实、历史背景与本轮证据保持不同用途，不让过去任务或自我介绍替代当前请求。

Working Memory 的试点只接受从产品事实生成的只读投影；如果它相对当前 bootstrap 没有明确收益，可保留现有实现，不为使用 API 而迁移。

退出条件：

- 明确每类数据的唯一写入入口；公开聊天和内部判断没有因适配获得额外工具。
- A/B 员工、私聊/群、群 G/H 的交叉样例证明范围隔离；profile 仅含明确允许跨会话的数据。
- 上下文能说明使用哪些条目、来源、版本和裁剪策略；无重复历史、重复事实注入。
- 用户修改/删除、资源撤销、成员移除、取消和旧维护结果迟到均不会绕过 epoch/授权检查。
- 既有 v0.2.2 历史群聊和记忆维护场景继续成立；扩展接口可关闭而不影响已有数据。

## 5. M2：按需历史检索

目标：回答“较早讨论过什么”时补充少量相关证据，而非扩大所有请求的默认上下文。

先确定检索对象是产品事实、产品历史还是知识文件，分别建立索引和来源类型。可以从本地全文检索开始；只有固定样例证明语义检索有收益时再加入 LibSQLVector 与显式 embedder。若选择 Mastra Semantic Recall，先导入当前员工×会话可见消息，显式 `scope: 'thread'`，避免默认 resource 扩散。

检索返回来源 ID、时间/轮次和范围；授权筛选必须发生在索引入口与结果使用前。索引标记 embedder/维度、源版本与访问版本；删除或撤权后旧索引结果不再进入提示词，重建任务也不能恢复旧授权。

退出条件：

- 固定多轮、跨话题样例相对当前近期窗口有可记录的相关性/答复收益，记录延迟和费用。
- 私聊、其他员工和其他群的未授权内容零进入上下文；包含“索引建立后再撤权”的情况。
- 删除来源、修改事实、换 embedding 模型、缺失/损坏索引可检测并重建或降级，不影响权威数据。
- 内部错误/判断/思考文本不混入公开历史检索；检索失败不能伪造“没有这件事”。

## 6. M3：长任务的 OM 试点

目标：在长运行或长对话里控制上下文成本，不替代用户可编辑的事实治理。

选择一个隔离的长任务 thread 做试点，显式模型和 thread scope；先测同步行为，再评估异步 buffering。保留产品 transcript 权威，框架存储仅接收授权投影；raw history 与 observations 由一条上下文策略装配。不要把决定群成员发言的内部轮次状态交给历史压缩结果推断。

必须补足：每次 Observer/Reflector 调用预算预留、实际 usage、超时和取消；后台错误归属；关闭前等待后台结束；来源删除后观察记录的失效/重建。生命周期 telemetry hook 提供 usage 不等于已有“调用前授权”能力，需要在接入阶段核验全部路径，无法拦住未授权额外调用就不启用该模式。

退出条件：

- 与未压缩基线比较长上下文成本、任务连续性和关键信息保持率，保留具体样例。
- 工具调用链、待审批动作、当前 turn 边界与已取消任务不因压缩而被重新执行。
- 删除来源/移除成员/撤销资源后，旧 observations 不再提供已失效信息；后台迟到提交被隔离。
- 重启、断网、存储失败和关闭过程可恢复或明确失败；不能仅等待 `settled()` 就声称取消已生效。
- 回退到现有产品上下文路径时，权威事实、公开历史和审批记录保持完整。

## 7. 若将来更换事实权威：单写者迁移

这不是上述阶段的默认动作。只有确认框架存储能承载所需来源、版本、删除和编辑语义后，才单独立项。

1. 定义字段/范围/ID 映射与迁移版本，确认框架原生字段不够时由哪一层保存来源和 tombstone。
2. 做一致性备份；暂停该范围内记忆写入和后台维护，记录 epoch 与迁移检查点。
3. 从原权威导入目标；核对数量、内容 hash、范围、来源与删除状态。可以影子读取比较，不能双向写入。
4. 原子切换写入路由；旧路径只读或禁用。新输入、用户编辑和模型维护都经同一权威接口。
5. 重建 Markdown、向量和上下文投影；明示新版本；在恢复并发前检查授权。
6. 回退时先停止新写入，迁移切换后的增量再切回。不能简单恢复旧备份而丢掉用户后续修改。

删除和撤权需要定义所有派生副本的处理：Working Memory、embedding、observations、缓存、后台任务、Markdown 与备份策略。删除“当前事实条目”、删除“原始消息”和要求“忘记某类信息”是不同产品操作；已有 tombstone/epoch 主要阻止旧写入复活，不自动保证仍存在的原始历史永不被重新提取。若产品承诺后者，需要持久排除/删除来源规则并纳入重建流程。

## 8. 已核验依据

- [Message history](../../../node_modules/@mastra/core/dist/docs/references/docs-memory-message-history.md)、[Memory 类型](../../../node_modules/@mastra/core/dist/memory/types.d.ts)：默认值、token 窗口、scope、readOnly、retainFullInput。
- [Working Memory](../../../node_modules/@mastra/core/dist/docs/references/docs-memory-working-memory.md)：template/schema、更新工具、scope 与合并语义。[官方页面](https://mastra.ai/docs/memory/working-memory)。
- [Semantic Recall](../../../node_modules/@mastra/core/dist/docs/references/docs-memory-semantic-recall.md)：vector/embedder、metadata filter、索引更新限制。[官方页面](https://mastra.ai/docs/memory/semantic-recall)。
- [Observational Memory](../../../node_modules/@mastra/core/dist/docs/references/docs-memory-observational-memory.md)、[Memory API](../../../node_modules/@mastra/memory/dist/index.d.ts)：thread/resource、后台工作和 `settled()`。[官方页面](https://mastra.ai/docs/memory/observational-memory)。
- [LibSQLStore](../../../node_modules/@mastra/libsql/dist/storage/index.d.ts)、[LibSQLVector](../../../node_modules/@mastra/libsql/dist/vector/index.d.ts)：本地适配器与独立存储职责。

安装包的 `reference-memory-memory-class.md` 有一条 storage 默认值描述与其自身“需要配置 storage”说明不一致；本方案按 Memory 类型说明和可运行配置要求**显式配置 storage**，不依赖隐式默认数据库。
