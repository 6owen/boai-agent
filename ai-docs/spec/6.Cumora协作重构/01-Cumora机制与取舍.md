<!--
[INPUT]: Cumora 固定提交的协作实现，以及 Paperclip 对本地实施顺序的修订。
[OUTPUT]: Cumora 可借鉴机制、采用边界与修订后的阶段映射。
[POS]: ai-docs/spec/6.Cumora协作重构/01-Cumora机制与取舍.md。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->
# Cumora 机制与取舍

日期：2026-09-27。状态：**外部机制研究；BoAI 适配建议待实施。** 参考版本见[本组入口](./README.md)。

## 1. 将协作问题分开

建议分别处理：是否需要运行模型、员工是否愿意参与、执行是否重复、草稿是否过时、工作是否结束。不要把这些问题都塞进一份越来越长的提示词。

Cumora 的[协作说明](https://github.com/yetone/cumora/blob/43075f164f4145e96de4ffba3f5727d4d48ed744/docs/COORDINATION.md)区分并发碰撞与模型对正确状态的误判。这个划分适合 BoAI：传输、序号、幂等和预算由程序保证；内容价值、自然称呼和是否需要补充由员工判断。

## 2. 轻量唤醒过滤与员工自主判断

Cumora 的 [triage-core.ts](https://github.com/yetone/cumora/blob/43075f164f4145e96de4ffba3f5727d4d48ed744/server/src/agents/triage-core.ts) 是主模型前的过滤层。当前代码会让人类新消息直接通过；纯 agent 活动再结合工作状态、循环边界和轻量模型判断。通过过滤不等于必须发言。

BoAI 已有返回 `reply/pass/wait/ask/request_handoff` 的参与决定，它比 triage 承担更多责任。因此建议：

- 先复用现有 decision 阶段，评估更小的输入和可选判断模型；不默认再叠加一轮 LLM triage。
- 明确 @、停用成员、已处理事件等可靠元数据可由代码处理；不要用问候关键词或职位字符串做硬语义路由。
- 过滤故障与合法 `pass` 分开记录；人类请求不能因过滤异常被静默确认已处理。
- 全员都有首次判断机会，与全员必须发言是两件事。优化不能让快员工的回复抹掉其他员工的首次机会。

## 3. 观察序号与发布前更新

Cumora 的 [seen-boundary.ts](https://github.com/yetone/cumora/blob/43075f164f4145e96de4ffba3f5727d4d48ed744/server/src/agents/seen-boundary.ts) 将“模型已看到哪里”与收件箱读游标分开；[cli.ts](https://github.com/yetone/cumora/blob/43075f164f4145e96de4ffba3f5727d4d48ed744/server/src/agents/cli.ts) 在发送前发现新消息时返回 HELD，并在写事务中检查紧邻同伴正文的完全重复。

BoAI 应延续宿主提供的观察序号，并明确区分：

| 边界 | 意义 | 不可混用 |
| --- | --- | --- |
| 待处理投递 | 还有哪些输入没有处理 | 读取界面不能使其自动消失 |
| 已展示上下文 | 本次模型实际收到的消息 | 后台查询不能冒充模型已阅读 |
| 发布检查版本 | 草稿依据与当前会话是否相容 | 不能仅凭运行开始时间判断过期 |

发布检查需与本地权威状态变更串行协调。完全相同的投票、问候等可能合法，不能直接照搬“相同正文一律拒绝”；事件幂等与业务内容重复需要分开。

## 4. 普通发言与共享工作认领

Cumora 的 [glance-protocol.ts](https://github.com/yetone/cumora/blob/43075f164f4145e96de4ffba3f5727d4d48ed744/server/src/agents/glance-protocol.ts) 要求基于已发布状态行动；共享交付物可以认领，普通聊天不靠认领位置安排内容。

BoAI 建议保留发布许可，并另行增加共享工作所有权：同一份报告或同一项文件修改可以只有一个执行负责人；独立意见、评审和明确要求的多份方案可以并行。不要用员工在队列中的位置推断“别人应该已经做完哪一步”。

## 5. 合并唤醒与供应商限流

Cumora 的 [computer/daemon.ts](https://github.com/yetone/cumora/blob/43075f164f4145e96de4ffba3f5727d4d48ed744/server/src/agents/computer/daemon.ts) 合并短时间事件和运行中的后续唤醒，并分别约束并发与启动间隔。

BoAI 适配时采用两个层次：

- 同一员工、会话和兼容上下文的连续事件合并成待处理批次，保留所有输入引用。
- 同一模型连接的判断、执行和记忆请求共享容量约束，避免多个群分别限流后仍冲击同一个供应商。

不直接复制上游的秒数或并发参数；本项目没有 CLI 冷启动时，成本结构不同。限流退避必须保留待处理输入，不能无限立即重试，也不能将失败改成 `pass`。

## 6. 终止与主动跟进

停止接续应同时依靠业务完成判断和宿主硬预算。只有限速不能终止慢速循环；只有提示词也不能保证成本上界。BoAI 可用真实结果消息、产物版本、依赖状态判断是否有进展，不能把新增一条“好的”算成进展。

Cumora 的 [agenda.ts](https://github.com/yetone/cumora/blob/43075f164f4145e96de4ffba3f5727d4d48ed744/server/src/agents/agenda.ts) 提供停滞对话的受控唤醒机制。BoAI 先保留为 G4 参考：只有存在明确未完成工作、依赖或已授权跟进条件时才考虑唤醒；不因聊天安静就主动制造工作。

## 7. 采用顺序与不迁入范围

| 机制 | 建议 |
| --- | --- |
| 成员独立判断、可靠序号、有限接续 | 延续现有实现，优先增加行为评估 |
| 输入合并、判断成本、连接级容量 | G1 小步优化 |
| 执行与发布分离、草稿更新 | G2b，先完成 G2a 认领，再处理流式可见性和副作用边界 |
| 工作认领和完成证据 | G2a 提前建立最低约束；G3 扩展委派、依赖与业务终止 |
| 空闲跟进、跨轮次持久等待 | G4 按需，不能扩大用户任务范围 |
| Redis、PostgreSQL、SSE、云端部署 | 本地架构暂无迁入理由 |
| 长期 CLI 会话与所有上游提示词 | 不整体复制；通过 AgentEngine 能力边界按需适配 |

上游存在[真实模型协作 benchmarks](https://github.com/yetone/cumora/blob/43075f164f4145e96de4ffba3f5727d4d48ed744/benchmarks/README.md)。BoAI 借鉴可重复场景和结果判定方式；本组不宣称已复现其结果。

阶段映射已按 [Paperclip 研究](./05-Paperclip机制与方案修订.md)修订。上文 Cumora 事实仍以原固定提交为准；工作与运行分离、父子关系及跨 run 预算属于 BoAI 综合适配方案。
