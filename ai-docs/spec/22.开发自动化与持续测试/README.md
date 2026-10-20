<!--
[INPUT]: 用户要求参考Magpie开发/Actions，并明确Excalidraw用于Codex开发BOAI的仓库设计，先落实文档。
[OUTPUT]: 六步开发/测试/个人发布计划；05为Codex开发画板，06明确UI回归基线、PR前后检查、预期更新与破坏报错，当前仅文档。
[POS]: 第22组开发自动化与持续测试总览。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->

# 开发自动化与持续测试

日期：2026-10-20。用户已确认方向：参考Magpie的开发和测试机制，适配BOAI仓库；参考ZCode画板协作流程，用Excalidraw辅助Codex开发BOAI。用户随后明确画板属于开发工具，先前写成BOAI产品功能的范围已撤销。**本轮仅落实文档，代码、工作流、定时执行和真实测试留待后续统一修改。**

## 1. 已确认的决定

- BOAI的设计、迁入说明、验收和进度统一归`ai-docs/`；上游`docs/`链接、Agent指引、脚本路径随实际迁入一起适配。
- 开发顺序为：固定参考与方案 → 当前版本测试基线 → 自动开发流程 → 开发画板接入 → 设计到代码协作 → 持续回归与更新检查。
- 采用Excalidraw辅助开发设计：Codex创建/修改画板，用户在画板界面编辑，再由Codex按设计实现BOAI功能。设计文件归仓库`ai-docs`，画板不成为BOAI软件功能。
- ZCode UI Plugin原版依赖其页面宿主；当前Codex能否原样承接尚未核实。05先定义文件往返，再验证开发侧MCP/选区联动；无需预设单独桌面App，不修改现有tldraw文件。
- UI test按[06](./06-UI回归基准与PR门禁.md)建立BOAI实际界面的交互、布局和视觉基线：PR合并前对比，合并后复验；新增功能补场景与基线，预期改版审阅后更新，意外破坏旧UI时报错并阻止放行。CI不能在失败后自动覆盖基线。
- 开发自动化独立于BOAI员工运行时；产品内的员工定时任务仍归第5组，不拿产品自动化替代仓库开发控制器。
- 原生员工沿自身配置和能力，不因开发测试计划增加BOAI产品用量/时长限制。开发实验的登记和限额只约束开发侧运行。
- 用户补充macOS无Apple开发者签名、本机开发自用；Tag/Release与桌面升级先按[04](./04-macOS本机发布与升级方案.md)落实文档。推荐自动发布产物加本机独立升级入口，`pnpm dev`沿源码更新；尚未启用签名/公证或标准自动更新。

## 2. 阅读入口与职责

| 文档 | 负责内容 |
| --- | --- |
| [01 Magpie参考与开发自动化设计](./01-Magpie参考与开发自动化设计.md) | 需求到PR、独立开发、审查与返工 |
| [02 持续测试与基准设计](./02-持续测试与基准设计.md) | PR、定期、交付前测试及版本比较 |
| [03 实施步骤与验收](./03-实施步骤与验收.md) | 六阶段、逐项完成条件和整体唯一进度 |
| [04 macOS本机发布与升级方案](./04-macOS本机发布与升级方案.md) | 无Developer ID构建、Tag/Release门槛、本机升级、数据与回滚 |
| [05 Codex与Excalidraw开发设计流程](./05-Codex与Excalidraw开发设计流程.md) | 开发画板、仓库文件、Codex协作与ZCode兼容边界；实际进度统一归03 |
| [06 UI回归基准与PR门禁](./06-UI回归基准与PR门禁.md) | BOAI实际界面的行为/布局/视觉比较、PR及合并后门槛、基线扩充和差异审阅 |
| [第15组11 业务评估主线](../15.Agent评估与持续优化/11-业务评估与Codex优化主线.md) | 真实runner、评分校准、开发/验证集及候选选优 |

整体阶段只引用所属专题结果，不另算一套业务分数。第20组的Magpie模型网关接入成绩不代表本组开发框架已完成；第19组10保留范围纠正入口，原BOAI内嵌画板与UP/EX计划已撤销。

再次review的目标总结与实施交接见[03第6节](./03-实施步骤与验收.md#6-目标复核与统一实施交接2026-10-20)：四项交付为自动开发到PR、持续测试与基准、Codex与Excalidraw开发设计、macOS个人发布与升级。六阶段是推进顺序，测试从S2持续贯穿，发布可在具备产物验证条件后独立推进。

## 3. 当前基础与实际缺口

| 范围 | 本次静态核对已有 | 本轮没有完成的部分 |
| --- | --- | --- |
| CI | `.github/workflows/tests.yml`配置PR、main/master push及手动触发，执行类型、UI规则、Vitest、用例清单与Electron BDD | 分层任务、运行基线、真实业务周期执行及更新比较 |
| 工程修复 | `scripts/iterate-agent.mjs`、`tests/evaluation/repair.ts`提供固定输入、隔离副本、Codex修复及补丁 | 通用新功能开发、任务领取、独立审查、PR及合并接线 |
| 业务评估 | `eval:build`、`eval:experiment`、`eval:hillclimb`及原生对照入口 | 本轮基准清单、人工校准及持续运行；历史未完成项仍归第15组 |
| 数据集命令 | `eval:dataset`实际为`score-collaboration.mjs --list` | 该命令只列题目，不执行真实业务任务 |
| 桌面测试 | `playwright.config.ts`、`tests/e2e/`，已有串行Electron BDD | 适合各CI层的明确选择、运行环境与完整报告判定 |
| UI回归基线 | 已检查的BDD目录中存在行为断言与截图留证 | 尚未发现视觉基线断言/更新配置；06定义待实施门槛，截图留证不等于像素比较 |
| 开发画板 | 本地ZCode包含原版宿主源码与UI_PLUGIN说明，可研究其编辑/选区/保存流程 | Codex端MCP/页面兼容、仓库文件往返和完整开发设计任务尚未验证；不迁入BOAI产品宿主 |
| 发布升级 | electron-builder v26已有DMG构建；本机arm64、无Developer ID证书 | 无Tag发布workflow、ZIP升级入口或桌面更新器；04仅文档 |

以上是源码/配置存在性核对，不是本轮运行通过结论。

## 4. 固定参考

| 来源 | 本次固定版本与获取依据 | 用法 |
| --- | --- | --- |
| [Magpie](https://github.com/yetone/magpie/tree/d9c6a60d8a0b023f77bdf16d4d896316c67ec7c6) | `d9c6a60d8a0b023f77bdf16d4d896316c67ec7c6`，本次`git ls-remote`确认main | 读取AGENTS、LESSONS、开发规范、Test和UI preview；逐文件迁入前复核该版本 |
| [ZCode](https://github.com/zai-org/ZCode/tree/0a1fc56d279fd1001f78387bd81aec1c26767411) | `0a1fc56d279fd1001f78387bd81aec1c26767411`，本地`git rev-parse HEAD`且工作树无改动 | `/Users/wangwenbo/Desktop/demo/ZCode`为上游参考副本 |
| [zcode-plugins](https://github.com/zai-org/zcode-plugins/tree/4acdd7ffc325fbdd9c8d934dc3ce03c7c62cb7f6) | `4acdd7ffc325fbdd9c8d934dc3ce03c7c62cb7f6`，本次`git ls-remote`确认main | 按开发侧接入需要准备插件源码并验证Codex兼容；前批仅固定来源，未下载/构建 |
| [既有Magpie调研](../../2026-10-13-Magpie-AI开发自动化调研.md) | 历史固定`2d721f7f3db9759e295da1aae8735ac538b993b4` | 保留当时事实和局限，不能当作当前main的逐文件审计 |

本次固定的是参考起点，尚未生成逐文件内容hash、迁入补丁或兼容认证。正式迁入时记录来源路径、原hash、目标路径、修改原因、依赖/资产版本及许可声明；更新参考版本须明确登记变化。

## 5. 下一次实施入口

从[03的S1](./03-实施步骤与验收.md#2-阶段任务)开始：冻结BOAI实际工作树，补逐文件来源清单和兼容核对，再建立同一源码上的测试基线。开工时重新读取工作树；若有未提交修改或新增文件，须显式纳入快照或使用独立工作目录，不能以HEAD代替真实输入。此前文档批次观察到的工作树状态不作为未来开工事实。
