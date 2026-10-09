<!--
[INPUT]: 用户要求继续查看GitHub实际多Agent测试、建立本地用例集并多轮测试修改；已有BDD、SDK模块和冻结评估合同。
[OUTPUT]: group-collaboration-suite-v1测试合同、上游固定commit与本地映射、独立重复/预算/留证方法；实际成绩唯一归05。
[POS]: 第14组可运行的协作用例集，不是新增框架或第二套评估系统。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header和所属.folder.md；不通过改输入/断言覆写旧失败。
-->
# GitHub参考与多轮测试用例集

检索日期：2026-10-09。只读实际测试源码，记录固定commit；不执行第三方仓库代码，不引入新的Agent框架。以下是测试方法的借鉴，不是对上游产品效果的背书。

## 1. GitHub实际测试提供的借鉴

| 来源和固定版本 | 实际测试 | 对BoAI的应用 |
| --- | --- | --- |
| [AutoGen group chat](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/python/packages/autogen-agentchat/tests/test_group_chat.py)，`027ecf0a` | `test_round_robin_group_chat`、`test_round_robin_group_chat_state`、`test_round_robin_group_chat_max_turn`、`test_round_robin_group_chat_cancellation` | 核对完整发言顺序、前置消息、游标/状态、停止原因、流式终态；本地报数/接龙增加实际前文hash和提交先于启动的因果检查 |
| [AutoGen pause/resume](https://github.com/microsoft/autogen/blob/027ecf0a379bcc1d09956d46d12d44a3ad9cee14/python/packages/autogen-agentchat/tests/test_group_chat_pause_resume.py) | pause/resume测试及调用前后状态 | 借鉴状态快照比较；BoAI沿原合同重启不自动重放，只在明确新消息后继续 |
| [CrewAI crew tests](https://github.com/crewAIInc/crewAI/blob/42ae4bf2c05f8080663984da1af4776a3a56ef25/lib/crewai/tests/test_crew.py)，`42ae4bf2` | `test_context_no_future_tasks`、`test_manager_agent_delegating_to_all_agents`、`test_crew_with_delegating_agents_should_not_override_agent_tools` | 依赖结果必须已存在；委派后身份、工具权限和预算不能混为一个“超级员工” |
| [CrewAI guardrails](https://github.com/crewAIInc/crewAI/blob/42ae4bf2c05f8080663984da1af4776a3a56ef25/lib/crewai/tests/test_task_guardrails.py) | `test_task_with_failing_guardrail`、`test_multiple_guardrails_with_max_retries_exceeded`、`test_guardrail_error_in_context` | 验证失败应有明确原因与有界修复；本地限字一次压缩、汇报补报均沿原预算，耗尽/错误不得计为成功 |
| [LangGraph supervisor tests](https://github.com/langchain-ai/langgraph-supervisor-py/blob/88859b34017ac3569bbd4a3092c7e77593a0a960/tests/test_supervisor.py)，`88859b34` | `test_supervisor_basic_workflow`、`test_worker_hide_handoffs`、`test_supervisor_message_forwarding` | 核对实际交接记录、消息归属与原文转发，不以最后一条“完成”判断整链成功。该仓库已归档，仅参考测试，不采用其架构或依赖 |

原始下载文件、完整commit、URL与SHA-256保存在`.local/research/multi-agent-20261009/sources.json`。上游大量使用回放或Fake模型；这能验证协议，不证明真实模型遵守业务约束，因此本地明确分离离线协议和真实API桌面验证。

## 2. 本地固定用例集v1

共有17个独立BDD场景：14个可在离线协议模式运行，5个可在真实API模式运行，其中报数和未知内容接龙两项同时支持两种模式。不是19个独立场景。实际输入以三个feature及其steps为准；测试代码与运行源码每批记录hash，模型失败后修改代码以新批次比较，不改旧批证据。

| ID | 场景/模式 | 可检查的成功条件 |
| --- | --- | --- |
| GC-S01 | 五人同时流式回复/离线 | 独立并行、完整正文、无Work、引用与样式/重启保持 |
| GC-S02 | 慢判断不阻塞其他成员/离线 | 其他成员在慢者未完成前可以判断和回复，无Work |
| GC-S03 | 子任务交付后仅唤醒负责人/离线 | 真实父子依赖、共享原始预算、可见交付、重启零重放 |
| GC-S04 | 停止等待中的工作树/离线 | 父子停止与重启状态保持，不补执行 |
| GC-S05 | 五人报数/离线+真实 | 实际1–5、每位读取完整前置回复、提交先于下一位启动、重启零重放 |
| GC-S06 | 指定倒序未知内容接龙/离线+真实 | 首位实际生成内容逐位传递，不能预造后续答案，固定倒序与hash链 |
| GC-S07 | bobo只讨论/离线 | 只保存讨论，不创建联系人、群或工作 |
| GC-S08 | bobo用已有员工建群/离线 | 身份复用、真实群入口、公开目标但不提前开工 |
| GC-S09 | 缺员补齐并依赖交付/离线 | 只补缺员、两个独立员工真实成果、同一预算与来源 |
| GC-S10 | 只创建员工/离线 | 联系人真实、无群/群任务 |
| GC-S11 | 组织后重启/离线 | 原身份与回执保留，无模型/工具重放 |
| GC-S12 | 组织回执未知后恢复/离线 | 保留未知，恢复只核读，不重复创建 |
| GC-S13 | 删除讨论/解散群/离线 | 员工、其他交流、原预算边界保留 |
| GC-S14 | 停止后迟到结果/离线 | 不发布员工/群/目标，重启不重放 |
| GC-S15 | 三人编辑部五轮/真实 | 立意→写稿与依赖审稿→固定版修订→复核/发布文案→重启续聊；6个Work、4份文件、实际读取正确版本、原件不变、120/80字对话约束和发布摘要80–120字分别按实际文字核对 |
| GC-S16 | 编辑部三轮限字/真实 | 首轮120、重启后80、明确取消后无历史上限；只聊天、实际前置内容，无文件工作 |
| GC-S17 | 公告三轮事实更正/真实 | 首轮5项事实；重启后反序接力只使用更正的时间/地点/名额；最后明确无需回复则三人沉默、不创建Work/文件 |

位置：`tests/e2e/features/collaboration.feature`（S01–06）、`bobo-collaboration.feature`（S07–14）、`editorial-collaboration.feature`（S15–17）。使用已有Desktop、原成果/模型/Trace支撑，保持`playwright-bdd`单一入口。

此外`tests/mastra-engine.test.ts`和`tests/service.test.ts`约束真实SDK协议和持久不变量：实际前置依赖、重复事件、当前限字、有界修复与用量、汇报必须有当前证据、组织/等待不能通过正文证据宣称完成。API新子工作不得依赖正在委派它的父工作：先受理前置任务，取得真实ID，再建立同事依赖；拒绝发生在创建之前。模块通过不代替上面的真实桌面场景。读写文件回执的textMetrics由代码计算实际非空白Unicode字符和分段计数；模型仍负责根据当前需求选择检查正文范围，测试独立核算成果字数，不能把计数功能本身当作所有文件约束的自动门禁。

## 3. 运行方式

无需安装包。默认复用`pnpm dev`启动实际Electron和Vite；测试准备使用现有源码宿主构建。每次数据隔离，场内重启沿用原目录。

```sh
# 只查看选中的场景
pnpm test:collaboration --mode offline --list
pnpm test:collaboration --mode real --list

# 14个离线桌面场景
pnpm test:collaboration --mode offline --repeat 1

# 5个真实API场景，必须明确使用哪个已有API配置；不在命令中放密钥
BOAI_TEST_API_DATA_DIR='/已有应用数据目录' \
BOAI_TEST_API_CONNECTION_ID='已保存API连接ID' \
pnpm test:collaboration --mode real --repeat 2
```

`--grep 标题正则`可定向复验，例如`--grep 三位独立员工`仍执行完整五轮文章流程，不能跳过失败步骤；过滤始终与suite/模式选择取交集，实际选择记录到registration。`--repeat`仅接受1–3。使用Playwright独立`repeat-each`样本，关闭失败重试；同一输入的失败和成功都保留。脚本不会安装依赖、不改模型配置、不扩大产品预算、不运行本机兼容测试。可以用`--output 新目录`固定留证路径，该目录必须不存在、父目录自动准备。

## 4. 迭代与证据规则

1. 先登记固定输入、源码hash、模型来源和样本数；一次失败先定位原输入/响应/工具/状态，不盲目增加重试次数。
2. 修复后以新目录运行相同用例；不得把不同轮次的局部成功拼成一次完整成功。诊断期间不修改正在运行的源码/测试；脚本在结束时检查输入hash未变。
3. 每次原产品限制保持：正常群接续原24次请求/成员边界；Work沿原请求账本、期限和输出限制，父子共账，真实用量未知单列。重复数是样本数，不给一个失败工作续预算。
4. 所有成功/失败的输入、状态、消息、文件原件/hash、实际模型阶段、账本和适用截图在清理前导出。脚本核对每份资源bytes/hash，并把Playwright trace从临时结果复制到持久批次目录。
5. 从最终结果生成独立HTML审阅报告；模型字段“完成”不等于交付、原件存在不等于读过、自己宣称100字不等于实际100字。技术/语义/证据/成本/人工评价分开。
6. 当前套件不是冻结留出题：不改`tests/evaluation/holdout-manifest.json`或旧评分合同。多轮同题通过只能说明这些样本通过，不能宣称跨模型稳定成功率。

实际迭代、失败根因、修复和剩余缺口统一记录在[05实施步骤与进度](./05-实施步骤与进度.md)，本文件不维护另一份成绩表。
