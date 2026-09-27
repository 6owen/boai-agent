<!--
[INPUT]: Paperclip 固定提交的任务、运行、唤醒和预算实现，以及现有 Cumora 协作方案。
[OUTPUT]: Paperclip 机制取舍、BoAI 协作设计修订和阶段调整依据。
[POS]: ai-docs/spec/6.Cumora协作重构/05-Paperclip机制与方案修订.md。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->
# Paperclip 机制与方案修订

日期：2026-09-27。状态：**已完成源码参考与文档修订，所有 G 阶段仍待实施。**

参考项目：[paperclipai/paperclip](https://github.com/paperclipai/paperclip)。本次固定提交为 [`0f14d261233c545aa6a8a38ec253c498a5130fff`](https://github.com/paperclipai/paperclip/tree/0f14d261233c545aa6a8a38ec253c498a5130fff)，不以之后的 master 变化反推本次结论。

## 1. 核心调整

Cumora 继续作为自主群聊参考；Paperclip 补充任务的持续责任、执行所有权和有依据的接续。BoAI 保留 Mastra 与本地产品存储，不迁入另一套运行框架。

原方案将共享任务认领放在并行执行之后。本次改为 **G2a 最小工作项与执行认领 → G2b 有限并行与发布一致性**。G3 承担父子委派、显式依赖和业务终止；G4 承担跨重启恢复与到期唤醒。G0/G1 与 B3 的范围不变。

这不是认定 Paperclip 整体优于 Cumora，而是修正 BoAI 的实施依赖：如果还不能辨认“是否同一项工作、当前谁在执行”，放开并行就很难可靠地区分独立工作与重复工作。

## 2. 参考机制与本地取舍

### 2.1 任务负责人和当前运行分开

Paperclip 的 [issues schema](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/packages/db/src/schema/issues.ts) 分别保存 assignee、checkout run 和 execution run。长期责任与一次运行不是同一个字段。

BoAI 建议用最小 WorkItem 概念承载工作责任，以现有 AgentRun 表达每次尝试，以 DiscussionTurn 表达用户请求引起的讨论。一次运行结束后负责人仍在；公开回复、退出进程或保存草稿都不能自动将工作标记完成。普通闲聊继续只需 turn/run，不强迫生成任务卡。

### 2.2 执行权绑定 run，释放时检查原持有者

Paperclip 的 [issues service](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/server/src/services/issues.ts) 在 checkout 时检查状态、负责人和执行锁，并用条件更新认领；终态锁清理仍比较原 run 标识。

BoAI 应在本地权威事务中认领工作，运行结束仅释放仍属于自己的执行权。旧 run 迟到的 finally 不能清除新 run 的锁。相同员工也可能同时存在重试与原运行，因此只校验 agentId 不够。

资源锁与任务认领也不同：两项不同任务可能修改同一文件。工作认领解决同一任务重复执行；共享路径等冲突仍需已有资源策略或单独串行执行，不能因为 workId 不同就认定安全并行。

### 2.3 父子关系和依赖关系分开

Paperclip 的[执行语义](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/doc/execution-semantics.md)将 parentId 用于工作分解，将 blockers 用于能否继续执行；子任务到达终态与依赖成功解除也分别处理。

BoAI 因而需要两个概念：`parentWorkId` 说明工作来源，`dependsOnWorkIds` 说明阻塞条件。调研失败、审核取消时可通知负责人处理，但不能作为成功输入唤醒写作。父任务完成由自身验收条件决定，不以子任务数量或“都已结束”代替。

### 2.4 唤醒是有来源的记录

Paperclip 的 [agent_wakeup_requests](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/packages/db/src/schema/agent_wakeup_requests.ts) 保存来源、原因、状态、合并次数、幂等标识和关联 run；[issue-comment-wakeup](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/server/src/services/issue-comment-wakeup.ts)明确限制当前运行自己的评论再次触发自己。

BoAI 不把所有聊天消息都转为新的工作运行。用户消息仍按原群聊规则投递；工作完成、依赖失败、用户补充和明确 handoff 等类型化事件，只通知有关员工。待处理、已送达、已处理分开，不能因查询过事件就确认完成。

仅有幂等字段不等于数据库已经对所有路径保证唯一。BoAI 必须自己定义原子入队、消费、合并与重试规则；可重复投递通过去重控制，不承诺外部操作天然 exactly-once。

### 2.5 依赖唤醒按“本次等待”去重

Paperclip 的 [issue-dependency-wakeups](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/server/src/services/issue-dependency-wakeups.ts) 将依赖集合与阻塞周期纳入就绪状态标识。同一就绪状态不重复唤醒，新一轮等待不会被上次完成记录吞掉。

BoAI 的对应建议是将 `workId + waitRevision + 依赖结果版本` 作为一次依赖就绪事件的依据。宿主从持久任务关系读取，不从聊天正文提取“已完成”三个字。G3 先支持当前应用运行期的定向接续；G4 再增加跨重启自动恢复。

### 2.6 运行成功与业务推进分开

Paperclip 的 [Heartbeat Protocol](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/docs/guides/agent-developer/heartbeat-protocol.md) 单独描述运行的 liveness 结果，并将有限继续执行与普通运行状态区分。

BoAI 应在 runtime 成功/失败之外记录业务 disposition：已交付、取得进展、等待输入、明确阻塞或没有进展。用户只要求制定计划时，交出计划就是有效结果；用户要求执行时，只说“准备开始”不能视为交付。无进展补跑、进程恢复和发布补判分别计数，同时受原始任务预算限制。

### 2.7 预算跨运行累计

Paperclip 的 [budgets service](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/server/src/services/budgets.ts)按范围累计用量，并提供警告和停止状态。BoAI 借鉴其“预算属于持续责任范围”的思路，不复制公司月度预算界面。

从 G2a 起保存原始工作预算归属，重试/换 run 不清零；G3 委派给子任务也不能绕过根工作剩余预算。已有轮次预算继续存在。金额只在有可信价格/供应商用量时计算，不能将未知 token 或固定订阅换算成虚假的零成本。

## 3. 修改对照

| 原方案 | 修订后 | 最早阶段 |
| --- | --- | --- |
| 先放开独立 task，再补工作认领 | 先有最小工作 ID、负责人、run 执行权和任务预算，再放开并行 | G2a → G2b |
| 工作负责人和执行占用未细分 | 员工负责工作，当前 run 持有可校验的执行权 | G2a |
| 任务完成证据统一留到 G3 | G2a 即定义最低交付依据；G3 扩展多阶段验收 | G2a/G3 |
| 依赖主要限定本轮 Contribution | 保留旧记录，新增父子工作与显式依赖两个关系 | G3 |
| 持久唤醒整体留到 G4 | G3 先记录定向接续与消费依据；G4 才启用跨重启恢复/定时 | G3/G4 |
| 主要关注单轮次数/token | 增加原始工作、重试链和子任务共享的预算边界 | G2a/G3 |
| 终止主要防空聊 | 还检查执行成功后是否有交付、有效等待或下一步负责人 | G3 |

## 4. 一个目标流程

用户要求“调研三个竞品，写一份建议报告”。负责人可以由用户指定或由员工在授权范围内认领，不要求系统默认存在 CEO。

1. 建立报告工作项，记录原始请求、验收标准和预算；普通参与判断仍由各员工独立完成。
2. 负责人创建调研子任务，写作步骤显式依赖相应调研结果。父子关系用于归属，依赖边用于等待。
3. 调研执行先认领当前 run 的执行权；独立任务可并行，冲突文件操作仍受资源限制。
4. 完成记录与待通知事件一起保存；多个重复回调合并成一次当前等待周期的接续输入。
5. 写作员工读取真实产物后继续。若调研失败，负责人获得明确阻塞信息，不把失败当结果完成。
6. 报告交付后任务结束；“收到”“谢谢”等消息不会再次启动这份已经结束的报告工作。

## 5. 不纳入本轮设计的内容

- 不引入强制 CEO/经理层级，不让任务负责人控制全群发言。
- 不把每条聊天转成 issue，也不要求新增完整看板才能运行任务。
- 不迁移到 PostgreSQL、服务器部署或另一套 agent runtime。
- 不启动周期性“所有员工找事情做”的模型调用；空闲检查优先查询已有任务状态。
- 不照搬 Paperclip 的自动恢复强度；BoAI 当前中断不重放语义保持到 G4 明确验证后。
- SDK session 只是可选执行上下文缓存，任务和授权真源仍是产品状态；参考 [execution-continuation](https://github.com/paperclipai/paperclip/blob/0f14d261233c545aa6a8a38ec253c498a5130fff/server/src/services/execution-continuation.ts) 的续跑前重新核对所有权，不能把旧 session 当授权凭据。

本次未部署 Paperclip、未执行其测试或 BoAI 应用回归。已核对上述独立源码及文档；大型 `heartbeat.ts` 的本地下载超时，未据此声称完整审计主调度器。方案属于适配判断，实际行为仍需按[验收计划](./04-实施阶段与验收.md)验证。
