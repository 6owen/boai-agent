<!--
[INPUT]: DeepSeek 公开文章与原型文档、用户架构图和产品定位、BOAI 定向源码核对。
[OUTPUT]: 外部架构研究与 BOAI 现状分析的阅读入口、顺序与证据边界。
[POS]: 外部架构研究资料，不作为 BOAI 实施授权或当前能力声明。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->

# DeepSeek Super-agent 调研

调研日期：2026-11-02。主题：持续工作的 Personal Agent，以及 Router、Worker、事件订阅、持久任务和 Watchdog 的职责。

建议按以下顺序阅读：

1. [Super-agent 架构分析与 BOAI 参考](01-Super-agent架构分析与BOAI参考.md)：文章与官方原型文档的研究。
2. [BOAI 现状与演进建议](02-BOAI现状与演进建议.md)：数字员工优先定位下的现有能力、Router / Watchdog 缺口、执行接续优化与建议顺序。

文档包含：

- 用户原图与补充后的 Mermaid 架构图。
- Router、Worker、任务、会话与执行之间的边界。
- 事件直通、上下文召回、异步交互、执行环境分离和独立监控。
- 跨飞书、GitHub、CI 的任务续接示例。
- BOAI 的设计映射、人工委派与内部进度边界，以及后续验证场景。
- 原文、官方原型文档与研究建议各自的证据范围。
- BOAI 的定向源码依据、当前行为与建议行为的区别，以及首组待验证场景。

原始材料：[用户架构示意图](用户架构示意图.png)、[DeepSeek 团队文章](https://mp.weixin.qq.com/s/zoS7GlReWPhfCjENGxXCdg)、[官方原型仓库](https://github.com/deepseek-ai/dsh-superagent-prototype)。

01 完成公开材料研究；后续 02 对 BOAI `58b562f2` 的相关调度、执行和恢复链路进行了定向源码核对，不是全仓审计。未安装原型、未进行新的运行实验、未核实个人应用实际版本。演进建议尚未实施，当前产品规则仍以仓库 AGENTS.md 和所属规格为准。
