<!--
[OUTPUT]: 2026-10-20按用户要求清理测试产物/独立记录及其附件链接；历史文字结果不代表原件仍然保留。
[OUTPUT]: 普通native通用截断已修及真实同run材料回答/四轮结果见06 §145；下方原分析留存，Work独立预算仍有限，不认证全长任务。
[OUTPUT]: 2026-10-13用户授权普通本机通用16000截断移除，实际实施/复测归06 §145；API及显式业务预算保持，较早仅分析按原日期阅读。
[INPUT]: 用户询问Codex能否完成长任务/其他指令，要求对照Rovai、Lody的Claude实现。
[OUTPUT]: 本轮通过口径、普通本机执行16000截断复现、固定上游原生stdio与SDK/ACP接法对照及修复候选；没有修改生产预算或新增真实模型成绩。
[POS]: 第13组10/11/14的运行边界分析；本轮实际观察唯一归06 §144，原修复/失败归§143。
[PROTOCOL]: 变化同步Header、本目录.folder.md与上级索引；上游实现阅读不算上游或BOAI真实验收。
-->
# Codex长任务边界与Claude上游接法分析

日期：2026-10-13。本文下方为最初源码/留存证据分析。**后续用户已授权取消普通native通用16000限制并复测；当前实施与实际成绩唯一见06 §145**，原分析和旧真实失败保持。

## 1. Codex的“通过”指什么

第06 §143的233通过/2跳过是跨模块工程回归；真实任务中Codex的CLI和BOAI分别完成四轮，核对MD/JSON/PNG实际原件、原生命令、文件正式交付、明确修订和实际重启后只读续聊。不能将单任务四轮写成所有Codex测试、长任务或全部原生功能已通过。

当前BOAI使用真实Codex app-server的thread/start或thread/resume、turn/start；本机Agent负责模型/命令/文件/原生工具循环，BOAI负责有身份的输入和公开回传。用户可以发送普通任务、明确路径和要求运行的脚本/命令；执行依据原生权限设置。并非只支持固定评估题，也没有按每条原生命令写BOAI替代执行器。专属终端UI、所有斜杠命令/插件/Skills/MCP/子Agent组合仍未逐项验证；公开目录被收到不等于每项已经调用。

长任务的传输/执行路径已具备，但仍有下述宿主边界。因此当前不能宣称各种长任务稳定完成。

## 2. 原分析确认的通用16000截断（后续已按§145修复）

[`group-scheduler.ts`](../../../src/runtime/group-scheduler.ts) `recordOutputUsage`保存累计输出，达到16000时中断活动轮次；[`service.ts`](../../../src/runtime/service.ts)的`onUsage`把run.outputTokens的变化量送入该方法，没有按原生/API或是否显式Work区分。该限制也作用于Codex；本轮Codex样例只是未触发。

原03批Claude失败run `0fea243a-efb9-4b6f-8c66-0b2086c96bbf`保存输出29653，所属turn `4af07d51-1d7c-4621-93aa-96aa9dd375fd`的tokenEstimate同为29653，turn为budget_exhausted且reason为“达到本轮输出用量上限”，run为cancelled；原生AskUserQuestion在取消前5毫秒成功登记。这足以定位实际取消路径。1M上下文容量与本轮输出额度是不同指标，容量修正不解除该限制。

诊断命令（零模型）：

```sh
node .local/native-runtime-comparison-20261013/replay-output-cap.cjs --expect-native-continues
```

以真实GroupScheduler和隔离SQLite重放计数、安装诊断活动状态，得到15999继续、16000中断、29653以原原因中断；“native继续”断言退出1，保留原红结果。是调度器边界复现，不是新的Codex/Claude实际任务。源码和回放登记见comparison-registration.json（测试记录已清理），实际值见output-cap-replay.json（测试记录已清理）。

已检视三条假设：

| 假设 | 当前证据及限度 |
| --- | --- |
| 通用输出规则主动取消 | 原终态、原错误、原计数及实际调度器重放一致，已确认取消机制 |
| 宿主重复累计用量 | 保存turn计数等于run计数；onUsage只提交差值，Claude按消息ID累计取最大值；没有发现该层重复相加。没有完整原第二轮result，不认证供应商每个计数本身无误 |
| 原生握手/提问无法处理 | 初始化、首轮交付及第二轮原生提问登记成功；取消原因不属于握手或协议收尾超时。原生附件回答仍未完成真实认证 |

因此“Claude接入整体不行”不符合目前证据；已确认的是BOAI宿主策略中断了本次原生执行，尚不能证明解除它后整个任务必然成功。

## 3. Rovai：直接调用本机Claude Code原生协议

固定来源为`murray17/rovai-ai@f9acc2395283d49f0ce247dc0af2207c155f6eb6`，使用原保留源码并对照GitHub固定版本，不称当前最新版本。

- [claude.rs](https://github.com/murray17/rovai-ai/blob/f9acc2395283d49f0ce247dc0af2207c155f6eb6/crates/rovai-core/src/claude.rs)：实际Claude程序、print与双向stream-json、stdio权限请求、原生session新建/续用、工具与公开事件。
- [claude_control.rs](https://github.com/murray17/rovai-ai/blob/f9acc2395283d49f0ce247dc0af2207c155f6eb6/crates/rovai-core/src/claude_control.rs)：等待result、当前turn结束、原生idle、子任务和待决请求清空，才关闭stdin；初始化60秒/确认收尾600秒/退出10秒是具体协议阶段门限，不能当作所有任务只能运行600秒。
- [execution_budget.rs](https://github.com/murray17/rovai-ai/blob/f9acc2395283d49f0ce247dc0af2207c155f6eb6/crates/rovai-core/src/execution_budget.rs)：未指定时间预算时deadline为空，但仍限制根执行责任数和A2A数量；single_chat使用freeze(None, ...)。已读这些路径未出现BOAI通用16000输出截断。不能概括为整个Rovai没有任何预算或权限边界。

BOAI本次Claude生产适配已经移植该原生通信和收尾方向，原生process也没有隐式任务总期限/累计8MiB截断；普通轮含本机员工时已取消API五分钟轮次计时。遗留输出规则在上层scheduler，换同类stdio驱动无法自行消除。

## 4. Lody：Claude Agent SDK经ACP接入宿主

主仓库固定为`LodyAI/Lody@52e6eebe908641ea53d5a9aa3530499932f3064f`；`.gitmodules`及冻结Git tree明确指向`acp-extension-claude@5e7805800d792b8b036728d13948b7be352d8c69`。本轮从该子模块提交补读源码，三文件Git blob均匹配，避免把主仓库空子模块当完整接入代码。

- [claude-acp-entry.ts](https://github.com/LodyAI/Lody/blob/52e6eebe908641ea53d5a9aa3530499932f3064f/apps/cli/src/claude-acp-entry.ts)：读取SDK设置，运行acp-extension-claude，关闭连接/信号时dispose。
- [acp-agent.ts](https://github.com/LodyAI/acp-extension-claude/blob/5e7805800d792b8b036728d13948b7be352d8c69/src/acp-agent.ts)：SDK query调用实际Claude可执行程序，prompt采用持续输入，保留resume/session；工具许可走canUseTool，公开输出转ACP更新，子任务/空闲和取消有独立状态。SDK的maxTurns/maxBudgetUsd等作为设置传递，不是BOAI这一通用16000规则。
- [claude-task-lifecycle.ts](https://github.com/LodyAI/Lody/blob/52e6eebe908641ea53d5a9aa3530499932f3064f/apps/cli/src/agent/claude-task-lifecycle.ts)：接task_started/progress/updated/notification，以真实状态、父工具身份、公开进度/usage显示后台或子Agent任务。

固定Lody运行时清单是SDK0.3.284/Claude2.1.284；本次BOAI测试的是用户已安装Claude2.1.140。这不是已经证明可直接替换的同版本组合；没有安装/启动Lody、运行上游真实测试或更换用户程序。其SDK/ACP路线可参考为可选适配路径，也需核对原登录/配置、原生功能、附件、审批、成本和生命周期。只换通信包装仍会经过BOAI现有scheduler。

## 5. 原建议顺序（当前实际结果见§145）

1. 先核对原生普通聊天与显式Work/自动化/群共享预算的作用域。原生用量仍真实记账；普通原生执行是否适用16000上限应由明确执行配置决定，不让旧API讨论默认规则隐式裁剪本机能力。API及已接受业务Work预算不能顺带删除或放宽。
2. 保留用户停止、来源撤权、实际进程退出、异常/未知不重放，以及初始化/关闭的具体协议检查；它们与简单总输出token限额不同。
3. 对原生长执行、工具多轮、后台任务、待决追问分别做工程红绿与有界真实复测。原§143失败/14/16账本不改，不重复CLI或重置预算；真实新批应另登记，未到验证不称长任务已通过。
4. 只有后续出现明确的协议兼容缺口时，再比较迁入Rovai补丁或Lody SDK适配的因果收益；不因这一次宿主预算取消就重写Claude引擎。

这些是接续分析，未更改生产预算，也未新增模型/judge/优化调用或提交/推送。当前实际观察与剩余统一归06 §144；§143实际任务失败继续保持。


## 6. 后续实施授权

用户明确“是否可以不限制，然后测试”，按06 §145移除普通native通用输出截断，API与本机输出分记；独立Work/组织/自动化预算保持。本文较早“尚未实施”仅说明当时分析状态，不能阻止已授权修改；真实结果在新批运行后登记，原§143不改。


后续实际收口：06 §145登记普通native截断修复与真实双后端四轮/Claude同run附件回答通过。正式交付Work原预算仍有限；真实Claude本轮15578未越旧门限，超门限工程29653与实际任务分口径，不改写本文原分析和旧失败。
