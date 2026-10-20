<!--
[INPUT]: 用户要求参考Magpie开发/Actions、采用ZCode UI Plugin与Excalidraw，并先落实文档。
[OUTPUT]: 六步后续实施及macOS个人发布升级总入口；固定参考、现有基础、无Developer ID路线与实施边界明确。
[POS]: 第22组开发自动化与持续测试总览。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->

# 开发自动化与持续测试

日期：2026-10-20。用户已确认方向：参考Magpie的开发和测试机制，适配BOAI仓库；UI Plugin及Excalidraw完整工作流参考ZCode。**本轮仅落实文档，代码、工作流、定时执行和真实测试留待后续统一修改。**

## 1. 已确认的决定

- BOAI的设计、迁入说明、验收和进度统一归`ai-docs/`；上游`docs/`链接、Agent指引、脚本路径随实际迁入一起适配。
- 开发顺序为：固定参考与方案 → 当前版本测试基线 → 自动开发流程 → UI Plugin宿主 → Excalidraw完整接入 → 持续回归与更新检查。
- 采用Excalidraw作为BOAI首个完整UI插件项目，覆盖创建、手工编辑、保存、选区引用、Agent局部修改、撤销重做、重开恢复及导入导出。
- 画板编辑器随插件嵌入BOAI，无需另装Excalidraw桌面App。已有tldraw文件的自动转换没有得到验证，不作为本次完成条件或既有能力。
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
| [第19组10 UI Plugin与Excalidraw](../19.应用插件架构/10-ZCode-UIPlugin与Excalidraw接入设计.md) | UI宿主、页面/工具/文档协议、迁入映射及功能唯一进度 |
| [第15组11 业务评估主线](../15.Agent评估与持续优化/11-业务评估与Codex优化主线.md) | 真实runner、评分校准、开发/验证集及候选选优 |

整体阶段只引用所属专题结果，不另算一套业务分数。第20组的Magpie模型网关接入成绩不代表本组开发框架已完成；第19组原预览/主题/运行时插件成绩不代表已支持MCP Apps UI。

## 3. 当前基础与实际缺口

| 范围 | 本次静态核对已有 | 本轮没有完成的部分 |
| --- | --- | --- |
| CI | `.github/workflows/tests.yml`配置PR、main/master push及手动触发，执行类型、UI规则、Vitest、用例清单与Electron BDD | 分层任务、运行基线、真实业务周期执行及更新比较 |
| 工程修复 | `scripts/iterate-agent.mjs`、`tests/evaluation/repair.ts`提供固定输入、隔离副本、Codex修复及补丁 | 通用新功能开发、任务领取、独立审查、PR及合并接线 |
| 业务评估 | `eval:build`、`eval:experiment`、`eval:hillclimb`及原生对照入口 | 本轮基准清单、人工校准及持续运行；历史未完成项仍归第15组 |
| 数据集命令 | `eval:dataset`实际为`score-collaboration.mjs --list` | 该命令只列题目，不执行真实业务任务 |
| 桌面测试 | `playwright.config.ts`、`tests/e2e/`，已有串行Electron BDD | 适合各CI层的明确选择、运行环境与完整报告判定 |
| UI Plugin | 本地ZCode有`plugin-ui`、`plugin-ui-bridge`、`pluginSandbox`及共享MCP Apps协议 | 尚未迁入BOAI；示例插件需从独立仓库准备 |
| 发布升级 | electron-builder v26已有DMG构建；本机arm64、无Developer ID证书 | 无Tag发布workflow、ZIP升级入口或桌面更新器；04仅文档 |

以上是源码/配置存在性核对，不是本轮运行通过结论。

## 4. 固定参考

| 来源 | 本次固定版本与获取依据 | 用法 |
| --- | --- | --- |
| [Magpie](https://github.com/yetone/magpie/tree/d9c6a60d8a0b023f77bdf16d4d896316c67ec7c6) | `d9c6a60d8a0b023f77bdf16d4d896316c67ec7c6`，本次`git ls-remote`确认main | 读取AGENTS、LESSONS、开发规范、Test和UI preview；逐文件迁入前复核该版本 |
| [ZCode](https://github.com/zai-org/ZCode/tree/0a1fc56d279fd1001f78387bd81aec1c26767411) | `0a1fc56d279fd1001f78387bd81aec1c26767411`，本地`git rev-parse HEAD`且工作树无改动 | `/Users/wangwenbo/Desktop/demo/ZCode`为上游参考副本 |
| [zcode-plugins](https://github.com/zai-org/zcode-plugins/tree/4acdd7ffc325fbdd9c8d934dc3ce03c7c62cb7f6) | `4acdd7ffc325fbdd9c8d934dc3ce03c7c62cb7f6`，本次`git ls-remote`确认main | 后续准备插件源码、构建产物及兼容验证；本轮未下载/构建 |
| [既有Magpie调研](../../2026-10-13-Magpie-AI开发自动化调研.md) | 历史固定`2d721f7f3db9759e295da1aae8735ac538b993b4` | 保留当时事实和局限，不能当作当前main的逐文件审计 |

本次固定的是参考起点，尚未生成逐文件内容hash、迁入补丁或兼容认证。正式迁入时记录来源路径、原hash、目标路径、修改原因、依赖/资产版本及许可声明；更新参考版本须明确登记变化。

## 5. 下一次实施入口

从[03的S1](./03-实施步骤与验收.md#2-阶段任务)开始：冻结BOAI实际工作树，补逐文件来源清单和兼容核对，再建立同一源码上的测试基线。当前仓库另有既有未提交工作，后续实施须显式纳入快照或使用独立工作目录，不能以HEAD代替真实输入。
