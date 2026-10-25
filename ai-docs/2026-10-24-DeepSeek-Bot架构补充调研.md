<!--
[INPUT]: 用户要求继续研究 DS Bot 源码中的架构参考；明确不引入其产品能力或 UI，BOAI 现有员工、workspace、记忆及业务设计保持。
[OUTPUT]: 六项架构机制与BOAI边界；用户已启动第24组实现，当前候选/实际验证/剩余统一归第24组02。
[POS]: ai-docs/2026-10-24-DeepSeek-Bot架构补充调研.md；原跨项目研究的架构补充，不是新增产品功能或实施授权。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->

# DeepSeek-Bot 架构补充调研

调研日期：2026-10-24。

交付状态：文档git cp已完成，用户随后已明确启动第24组实施。容量相关结论已并入 [第24组设计 §9.1](./spec/24.Mastra上下文容量与连续会话/01-容量管理与上下文接续设计.md)及 [实施验收 C23–C26、唯一进度](./spec/24.Mastra上下文容量与连续会话/02-实施步骤与验收.md)；当前实现候选与受控结果统一见第24组02；配置收敛等条件参考仍保留其适用前提，不自动加入必做范围。

这轮只回答：DS Bot 及其 DSH 底座，有哪些实现机制能改善 BOAI 的内部正确性、可恢复性和维护成本？不追加产品功能、页面、面板、交互或样式方案。先前单独研究过的工作面板文档保留历史，本轮不扩展其范围。

BOAI 的数字员工持续身份、独立 workspace、跨私聊和群聊的员工记忆、现有自动化与独立浏览器设计均保持。涉及上下文维护时，范围仍是 Mastra/API；不扩展到 Codex、Pi 等其他后端。

## 1. 结论与证据范围

有参考价值，但主要是少量基础机制。BOAI 不需要为此改用 DSH、引入 Cordis，或者重新组织业务模块。

- 最值得吸收：派生状态记录明确的来源覆盖位置，摘要读取一致的上下文切面，Session 接续把输入转交和提交结果区分清楚。
- 有条件参考：配置装配按运行实例串行收敛、相同配置跳过重装、连续配置变更合并处理。
- 主要作为核对项：附加模型请求的归属与计量、资源释放顺序。BOAI 已有相应基础，应沿原路径补齐。
- 应继续沿用 BOAI：ProductStore 事务、来源撤销与失效校验、运行进程独占、未知执行与未知用量的处理。读取到的 DS Bot 实现不构成替换这些机制的理由。

固定版本与方法：

- DS Bot：[`1bebe826f74e9a72cabafd3b80602b05af867b38`][ds-commit]，0.2.1；本轮远端 HEAD 复核仍为该提交。
- DSH：[`687f282e8625c6b8d11ff58211a90524be2e4317`][dsh-commit]，对应 DS Bot 声明的 `dsh-v0.2.1-rc.2`。下文会区分 DS Bot 自己实现的部分与 DSH 底座能力。
- BOAI：本地 `6f2cbd631a4e3320c0ba2f129028169dc9a19527`，读取当前源码；工作区已有的研究和 spec 文档不当成已实现代码。
- 本轮为静态源码对照。没有运行 DS Bot、压测、真实模型请求、故障注入或产品验收；不能据此声称某套方案已在本机验证了性能或崩溃恢复。

原六项问题的完整背景见 [源码调研与 BOAI 对比](./2026-10-24-DeepSeek-Bot源码调研与BOAI对比.md)。以下建议分为“已有”“本期适用”“条件适用”，避免把参考项自动变成开发任务。

## 2. 权威记录与派生状态分离，并给派生结果标明覆盖位置

### 2.1 源码怎么做

DS Bot 的 `chat-index.js` 把 Session 日志作为原始依据，SQLite FTS5 只是可重建索引：

- 每个 Session 有 `marks`，记录 `through`、`keep`、`sealed`、`turn`。
- 同一 Session 的补齐任务在 `catchingUp` 中合并，防止同时重复写入。
- 读取固定的 `throughSeq`，补入上次标记后的事件；发现序号断口会报错，不跳过缺口推进标记。
- 新索引行和新的进度标记在同一 SQLite 事务提交。
- 索引版本变化可以重建；SQLite 不可用时回退到日志扫描。结束超过 60 秒的分段可封存，属于该实现的假设，不能直接变成 BOAI 的通用完成判据。[源码：chat-index.js][ds-chat-index]

DSH 又把这种做法抽成 Session projection：每个领域注册同步 `apply(state, event)`、状态 schema 与 `stateVersion`；一次 `snapshot()` 返回同一切面上的完整值和 `asOfSeq`。与本领域无关的事件返回原引用，避免无意义地继续发布变化。此处借鉴的是派生状态合同，不涉及采用它的客户端或界面。[源码：projection registry][dsh-projection]

DSH 的 projection cache 会核对状态版本、schema 和 Session 生命周期身份，恢复折叠还要核对继承前缀。活动 Session 写缓存前先 flush 日志；缓存写失败只造成下次多重算一段。缓存声称的进度超出原日志时不能用于恢复。[源码：projection cache][dsh-cache]、[恢复规则][dsh-projection]

### 2.2 BOAI 已有基础

BOAI 已经具备“原始业务记录为准、索引派生”的设计：

- ProductStore 在原始记录增删改时，同步推进相关查询时钟并使正文索引失效；事务提交成功后才调用后续消息通知回调。[product-store.ts](../src/runtime/adapters/storage/product-store.ts)
- `SearchBodyIndex.commit()` 在事务内重新核对原始来源内容、所属会话、隐藏/清理状态和版本，避免迟到的索引任务恢复已删除来源；重复提交相同结果不推进索引时钟。[search-body-index.ts](../src/runtime/modules/conversations/search-body-index.ts)
- 员工记忆也有来源消息、资料和会话的失效路径。[memory-repository.ts](../src/runtime/modules/memory/memory-repository.ts)

因此不建议重写 BOAI 的索引或改成全量事件溯源。真正可吸收的是：把来源覆盖信息继续用于第24组新增的上下文摘要和 checkpoint。

### 2.3 适用方式

本期适用，落实到既定 Mastra 容量专题：

- 一个 checkpoint 除了摘要文本，还应能回答：属于哪个员工和内部 Session，覆盖哪些消息、哪个已提交执行位置，使用哪版装配/摘要规则。
- 多来源输入使用各自的来源身份和版本；不同 conversation/run 的 sequence 不能直接比较大小。可用来源引用清单加内容版本，不能凭一个全局“最新 sequence”推断全部来源有效。
- 新消息到达后，已有摘要可作为已覆盖前缀继续使用，并补上后续原文；如果其来源被更正、撤销或删除，则按原失效机制处理。追加和改写不能混为同一种变化。
- 摘要缓存可以重算；当前 `activeSessionId`、工作归属、待执行输入和业务回执属于权威事实，不能当缓存随意丢弃重建。

建议核对场景：缓存缺失、版本升级、来源撤销、日志缺口、摘要完成时又有新消息、不同群/私聊来源序号重合。目标是可解释与可恢复，不新增业务实体给用户管理。

## 3. 摘要输入需要一致快照，工具调用必须保持闭合

### 3.1 源码怎么做

DS Bot 在 `btw.js` 的内部上下文读取中，同步取得 `requestHeader()`、`deriveMessages()`、工具历史、Session ID 与 `atSeq`。`trimToolBoundary()` 检查末尾 assistant tool-call 是否都有对应 tool-result；如果没有，就整组排除这个未完成尾部，而不是伪造结果。[源码：snapshotOf / trimToolBoundary][ds-snapshot]

这里仅研究快照与消息边界算法，不建议引入该文件承载的产品功能。该同步读取也不等于任意嵌套对象已被深度冻结，不能据此断言跨异步阶段绝无引用变化。

### 3.2 BOAI 的适用点

BOAI 当前 `contextWindow()` 以完整公开消息、100 条和 48,000 字符做有界选择，并保护触发输入和最新消息。这是公开消息层的窗口；Mastra 工具循环中的实际输入还包括系统指令、记忆、工具 schema、工具返回和媒体，不能用公开消息快照替代最终模型输入快照。[message-projection.ts](../src/runtime/adapters/mastra/message-projection.ts)、[agent-factory.ts](../src/runtime/adapters/mastra/agent-factory.ts)

[第24组设计](./spec/24.Mastra上下文容量与连续会话/01-容量管理与上下文接续设计.md)已要求安全边界、闭合工具步骤和来源校验。这次源码研究补充的实现细节是：

1. 在选定的安全边界一次取得上下文与其身份/版本，形成不会被后续异步修改的摘要输入。
2. 摘要生成期间允许原系统接收新输入，但候选只声明覆盖快照中的来源范围。
3. 提交前再核对 Session revision、来源版本与取消状态；把新增尾部留给后续装配，不悄悄算进旧摘要。
4. 用“覆盖前缀 + 尚未覆盖的完整尾部”重建模型输入，保留原始 messageId、runId 和工具回执定位。

这里有一个关键适配差异：DS Bot 的只读旁路可以忽略未完成尾部；BOAI 的执行接续不能丢掉仍在执行的工具。若当前存在进行中的调用、待批操作或未知写结果，应等待原执行机制给出确定边界，或保留该状态阻断接续。不能把删除尾部的辅助函数直接用作工作恢复算法。

优先级：本期适用，属于第24组现有合同的细化，不需要新的聊天模式或 Session 页面。

## 4. Session 轮换应当是可恢复的交接协议

### 4.1 DS Bot 的交接链路

`parts.js` 并非只执行 `bot.sessionId = freshId`，它还有：

- `switches` 防止同一旧 Session 并发切换，`state.switching` 持久化待恢复标记。
- 等待空闲后进入 `runMaintenance()`；切换期间的新输入留在旧 inbox。
- 新 Session 创建和模型/权限准备经过异步等待后，再检查员工是否还存在、群成员关系是否有效、旧 Session 是否仍为当前值。
- 转交输入时保留 `source`；按待接收队列中的 `exchangeId` 去重。
- 新 Session 写入并 flush 交接和输入后，才移除旧 inbox 中的对应输入；失败时保留或放回旧输入，供恢复路径继续处理。[源码：parts.js][ds-parts]

需要准确理解它的边界：当前实现先保存新 `sessionId` 与旧 segment，再装配、写入交接包和转发输入；调度迁移是 `void rt.moveSchedules(...)`。团队状态 JSON、Session 日志与调度不是一笔跨存储事务。它通过切换标记和补偿路径处理故障，不能描述成“原子完成全部切换”。待接收队列里的 `exchangeId` 去重也不等于跨崩溃、跨已执行记录的 exactly-once 保证。[同一调用链][ds-parts]

### 4.2 BOAI 应吸收什么

BOAI 第24组已经规定：新记录、旧记录封存与活动指针 revision 在 ProductStore 内一次提交，不能先切指针再补交接。保留这个更严格的合同。[第24组状态与提交设计](./spec/24.Mastra上下文容量与连续会话/01-容量管理与上下文接续设计.md)

DS Bot 对切换中到达输入的处理，可以转成 BOAI 的验收细节：

- 压缩/轮换候选、交接完成、活动指针切换、输入已接收、输入已执行是不同事实；不能用一个 `done` 概括。
- pending 输入保留原始 messageId、来源与顺序。转交重试使用原身份，不生成一个看起来全新的用户请求。
- 若只是更换 Mastra 请求投影，优先让输入继续归属原 Conversation/Work，由新的内部上下文接续消费，避免为了模仿 DS Bot 额外搬动产品消息。
- 恢复时根据持久化阶段和已有回执判断缺哪一步。未知外部写结果仍走 BOAI 原恢复约束，不能靠“再执行一次”补齐。
- 若需要跨 ProductStore 和 Mastra Memory 存储准备内容，应先准备可校验的候选，再由 ProductStore 提交有效引用；中断后可清理未被引用的候选。SQLite 事务不能替外部存储或模型请求提供原子性。

建议检查切点：摘要生成后、候选保存后、指针提交前后、输入领取后，以及切换期间的新输入/取消/删除。必须能说明每个切点恢复后继续什么、不会重复什么。

优先级：本期适用，继续沿第24组实施；不照搬 DS Bot 的 JSON 状态存储和先指针后补种子的顺序。

## 5. 配置装配按运行实例收敛，资源由明确的所有者释放

### 5.1 DS Bot / DSH 的做法

`capabilities.js` 是一个小型配置协调器：

- 对有效配置计算 hash，已装配 key 相同就跳过重装。
- 每个 Agent 各有一条 reconcile 队列；同一 Agent 串行，不同 Agent 分开。
- 正在执行时最多再排一次，下一次执行读取最新配置，合并连续变更。
- 装配等待返回时校验插件是否已停止、Session 当前绑定是否仍是原 Agent；旧实例的迟到结果不更新新实例状态。
- MCP/skill 注册由对应 fiber 持有 disposer；移除或卸载时走 dispose。[源码：capabilities.js][ds-capabilities]

这里值得借鉴的是“期望配置与已装配资源收敛”和“实例身份校验”，不是另造一套连接器或插件产品。

两个限制也应保留在判断中：它更换资源时先 dispose 旧实例再挂新实例，不是无缝热替换；准备超时只停止等待并继续运行，原装配 Promise 仍然存在，不能把超时写成已取消或已成功。

### 5.2 BOAI 已有的设计

`SourceService` 已按 `runId:sourceId` 持有 lease，同时记录 source revision、目录授权身份、AbortController、活动调用和 close/detach 行为；调用前后均重新核对版本与取消状态。关闭运行时先 abort，等待活动调用结束，再关闭连接和移除 lease。[source-service.ts](../src/runtime/modules/sources/source-service.ts)

因此不应把 DS Bot 的长驻 Session Agent 连接缓存直接移入 BOAI，尤其不能为了省一次装配而让不同 Run 共用可变权限和凭据上下文。

条件适用的部分：

- 如果后续发现同一运行实例因连续配置通知而反复做相同装配，可以复用“每个 owner 一条队列、最多保留一次待执行更新”的协调方式。
- 先分清不可变描述与有状态资源：解析后的 schema/静态说明可以按明确版本缓存；连接、取消器、临时目录权限和调用状态仍按当前 lease 生命周期管理。
- 缓存身份必须覆盖实际影响装配的字段。凭据轮换、授权变化、工作目录和配置 revision 都要能使旧装配失效，不能只比较显示名称或服务 URL。
- 所有迟到结果在提交时再核对 owner、run、revision/epoch；`await` 前检查过不代表返回后仍有效。

当前没有重复装配开销的测量证据，不建议先建一个全局配置协调框架。只在具体模块出现这种问题时局部采用。

## 6. 附加模型调用应有独立身份，同时归属原工作

### 6.1 DS Bot 的实现提示

DS Bot 给 Session 外的摘要、交接等模型请求打归属标签。`usage.js` 通过 messages 对象上的 WeakMap 关联 Session/用途；中间件重建 messages 数组时用 `carryUsageTag()` 传递标签。它也用 WeakSet 防止同一个 usage chunk 对象穿过重写链路时重复计数。[源码：usage.js][ds-usage]

这揭示了一个很具体的架构问题：请求内容经过重写后，计量归属不应丢失；仅有同一个 Session ID，仍不足以区分主执行与附加维护请求。

但 WeakMap/WeakSet 只适用于当前进程中的对象身份，不是持久化幂等键。该实现的计数函数还将缺失/无效数值折成 0，且只有收到 usage 才写这条附加调用用量；不能把它当作 BOAI 完整预算与未知调用账本的替代方案。

### 6.2 BOAI 直接沿用现有能力

BOAI `RunModelUsage` 已区分主 SDK 累计量与按原 request ID 记录的附加调用，用 Map 更新同一回执，串行发布合计；活动统计另有 `unknownCalls`、`unrecordedRuns` 和不完整性字段。[run-model-usage.ts](../src/runtime/modules/profile/run-model-usage.ts)、[profile.ts](../src/shared/domain/profile.ts)

本期的动作应是把 Mastra 压缩/交接请求接入这些已有机制：

- 每个实际请求有可追踪 ID，归属原员工、Work/Run 和内部上下文；主执行与维护用途可区分。
- 请求转换与重试传递原归属，实际新增的模型尝试仍单独记账；不能为了幂等把真实重试消耗吞掉。
- 摘要失败、取消或迟到，也保留真实调用事实；未收到用量继续按未知处理。
- 轮换内部 Session 不重置原工作预算，不创建一个无归属的“后台免费摘要”通道。

优先级：已有底座的接线核对，不新建用量中心，也不把 DS Bot 的统计存储整体迁入。

## 7. 单写者与持久化：BOAI 应保留现有实现

DS Bot `home-lock.js` 用排他创建的锁文件、随机 token、PID 与心跳判断团队状态写入者；`store.js` 串行写临时 JSON 并替换原文件，写前核对持锁身份。锁设施异常时存在 `lockBroken` 分支，允许继续保存。这是适配团队 JSON 状态的本地协调方案，不能视为数据库事务级别的写入权威。[home-lock.js][ds-lock]、[store.js][ds-store]

BOAI 的区别：

- runtime owner 使用 SQLite 写事务作为独占依据；进程信息 JSON 只是身份说明，不靠心跳过期就接管，也不删除权威锁 inode。[owner.ts](../src/runtime/owner.ts)
- profile 的应用访问与维护操作另有访问协调，不能仅凭“前一个调用超时了”推断资源已退出。[profile-access.ts](../src/runtime/profile-access.ts)
- ProductStore 的读/检查/写处在同一事务；只重试取得 BEGIN，不重放已经进入的业务回调和 commit。[product-store.ts](../src/runtime/adapters/storage/product-store.ts)

这部分的比较结论是保留 BOAI。尤其不能把内部 Session 更新、自动化触发或工作领取改成“内存先改完，再异步保存整个 JSON”。

## 8. 对 BOAI 的最小落点

不新建一组产品功能。本轮参考集中到已有专题和服务：

1. 第24组 Mastra 容量维护：把“来源覆盖范围 + 输入快照身份 + 提交前复核”落实成 checkpoint 合同；区分新消息追加和旧来源失效。
2. 同一专题的接续与恢复：补切换中输入、跨存储准备、半途崩溃和取消的验收；指针与业务权威仍在 ProductStore。
3. 同一专题的计量：附加摘要请求复用 RunModelUsage 和原预算/未知回执处理。
4. SourceService 等已有装配模块：仅在发现重复装配或配置通知积压时，局部参考 per-owner reconcile；不提前替换现行 lease。
5. 现有存储、记忆、执行与自动化体系：保留，引用本研究作为后续 review 核对依据。

研究能支持“这些机制值得审视”，不能支持“BOAI 全部缺少这些能力”或“迁入后必然更快”。本次没有修改产品代码，没有执行测试或部署，也没有恢复此前暂停的个人稳定化工作。

[ds-commit]: https://github.com/Fei2411/DeepSeek-Bot/commit/1bebe826f74e9a72cabafd3b80602b05af867b38
[dsh-commit]: https://github.com/deepseek-ai/deepseek-harness/commit/687f282e8625c6b8d11ff58211a90524be2e4317
[ds-chat-index]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/chat-index.js#L103-L178
[dsh-projection]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/session/session-projection/src/index.ts
[dsh-cache]: https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/session/session-projection-cache/src/index.ts#L256-L285
[ds-snapshot]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/btw.js#L103-L160
[ds-parts]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/parts.js#L720-L1020
[ds-capabilities]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/capabilities.js#L273-L429
[ds-usage]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/usage.js#L521-L601
[ds-lock]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/home-lock.js
[ds-store]: https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/host/store.js#L280-L338
