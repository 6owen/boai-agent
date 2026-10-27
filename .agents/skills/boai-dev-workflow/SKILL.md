---
name: boai-dev-workflow
description: 在 BOAI 仓库开发功能、修复问题、提交或更新 PR、处理 GitHub Actions 失败及合并 main 时使用。统一分支/worktree、云端 CI、默认自动合并和 UI 基准审阅流程，供 Codex、Claude、Pi 等开发 Agent 读取。
---
<!--
[OUTPUT]: 2026-10-27有意UI改动先提供worktree预览并取得用户对具体效果/基准范围的确认；新PR在基准就绪后创建，无UI仍默认自动合并。共享pnpm store而非跨worktree node_modules。
[OUTPUT]: 2026-10-27按用户三条简化：依赖缓存；UI差异审阅和受影响基准；无UI直接自动合并。每次交付重读，设置回执后结束。
[OUTPUT]: 2026-10-27UI覆盖分为已有场景受影响/新页未覆盖/无视觉影响；Draft快照必须主动向用户说明待验，不只埋在PR正文。
[OUTPUT]: 2026-10-27有意UI变更在Ready前完成官方候选、差异审阅和受影响基线提交；当前完整CI通过后正常合并，不用force或放宽标准。
[OUTPUT]: 2026-10-27官方候选一次完整采集并离线生成差异，普通CI比较与独立审阅门禁保持。
[OUTPUT]: 2026-10-27普通UI两台macOS分片并行；完整合同、身份及逐片原件统一门禁。
[OUTPUT]: 2026-10-27仅PR打开/源码同步/重开触发；Draft/Ready不重复跑同SHA，main复验和原完整门禁保持。
[OUTPUT]: 2026-10-26UI功能交付前说明影响/覆盖并主动准备候选；ui-review轻量附件区分视觉待审阅与执行失败，原门禁及生效边界保持。
[OUTPUT]: 2026-10-24按用户要求移除日常固定使用pnpm dev的约束；运行方式不预设，独立worktree及main仅同步已合并提交的规则保持。
[OUTPUT]: 纠正测试范围：仅 GitHub CI 跑 UI，本地 Vitest/BDD/评估及依赖完整保留。
[INPUT]: 用户任务和既有提交/合并授权、当前工作区、仓库工作流与测试合同。
[OUTPUT]: 现行 Actions 只跑 UI；本地 Vitest/BDD/评估完整保留。日常PR交付按UI影响完成必要审阅后默认自动合并，核对回执后结束；仅明确持续跟进才等待，原门禁保持。
[POS]: .agents/skills/boai-dev-workflow/SKILL.md，仓库开发侧共享流程，不是产品员工技能。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->
# BOAI 开发、预览、UI 确认与交付

## 每次开始和交付前

- 读取当前用户指令、AGENTS.md 和本 Skill。先 fetch main，并检查 `git show origin/main:.agents/skills/boai-dev-workflow/SKILL.md` 的现行规则；旧 worktree 和旧 Session 不能沿用过期流程。本分支对规则的修改也要核对，最新用户指令优先。
- 核对分支、工作区改动、远端和 PR。使用独立 worktree/功能分支；已有对应分支可以继续。保留其他任务的改动和进程，main 只同步实际已合并的提交。
- 只修改、暂存本次文件，同步 Header、目录地图和相关规格。不得把功能文件复制回 main。

## Worktree 依赖与预览

- main 和所有功能 worktree 使用仓库锁定的 pnpm 版本及同一 pnpm store。各 worktree 保留独立 node_modules/虚拟依赖树，由 pnpm 通过硬链接或写时复制共享包内容；禁止把整个 node_modules 或虚拟依赖树软链接到 main/另一个 worktree。
- 需要运行的功能 worktree 首次安装：`pnpm install --frozen-lockfile --prefer-offline`。包已缓存时复用，仅补缺失内容；依赖输入未变化且安装有效时不重复安装。纯文档任务不必安装。新增依赖正常更新清单/锁文件。
- 发现旧的跨 worktree node_modules 软链接时，先检查本任务进程，再只解除本 worktree 的链接并正常安装；不得删除链接目标，也不得改其他任务的依赖。
- 用户要求看效果时，直接在功能 worktree 启动预览，不必先合 main：`BOAI_DATA_DIR="$PWD/.local/dev-profile" BOAI_DEV_PORT=0 pnpm dev`。数据目录独立于个人应用，端口0由系统分配；报告 worktree、分支/提交和实际启动结果。不要关闭或接管 main 的运行进程。
- `pnpm dev` 是按需预览，不是固定日常运行方式。预览启动会编译开发宿主，但不等于跑完整构建、GUI测试或业务验收。不得借预览自行启动本机自动CI、全量测试或模型调用。
- 清理时保留可能含用户录入的预览数据，不能仅因位于.local就视为可删除缓存。

## UI 改动必须先让用户确认

用户明确要求：主动修改页面后，Agent 必须询问是否接受具体界面变化并更新对应基准。**“请改这个页面”是开发授权，不等于接受实现后的画面；Agent 自行审图、CI通过或默认自动合并规则都不能替代用户确认。**

1. 根据真实 diff 判断可见影响：布局、样式、图标、文案、主题、控件状态、导航及影响它们的数据变化都算 UI。检查当前 `tests/e2e/baselines/contract.json` 的覆盖，指出受影响已有场景和新页缺口，不写死场景总数。
2. 完成实现并准备可运行的功能 worktree；提供预览路径/命令或实际截图，简述具体变化和拟更新的 case。主动询问：这些效果是否符合预期，是否接受这些变化并更新列出的基准？用户只需针对这批明确变化确认一次。
3. 在收到明确回答前，保留本地修改或分支快照，暂停基准采集/接受、Ready 和自动合并。新任务此时不创建 PR，避免自动CI提前拿旧基准比较；用户明确要求先保存PR时只能Draft，并直接说明其旧基准检查尚不代表验收失败。已有PR先保持/转回Draft并关闭其自动合并，确认前不推送新的UI修改。
4. 只有同一批实际效果及基准范围已被用户明确确认，才不重复询问。确认后新增可见变化要补充展示并确认，不能扩大原授权。确认不足时保持待审阅，不把沉默视为同意。
5. 用户要求修改效果时继续在原 worktree 调整，不先合 main 再返工。用户明确要求不要合并/仅本地/保留草稿时遵从。

没有可见 UI 变化：说明判断依据，不采集或更新截图基准，集中提交后直接 Ready 并设置自动合并。

## 确认后的 UI 基准流程

功能实现与预览 → 用户确认效果和基准范围 → 推分支 → 同SHA官方候选 → Agent审阅旧/新/diff → 只晋升受影响基准 → 创建/更新Ready PR → 必需CI通过后自动合并。

- 候选通过已有 `ui-baseline-candidate.yml` 的 workflow_dispatch 指定功能分支运行，不需要先创建PR。不要先跑旧图比较来决定是不是有意UI改版。
- 用 `scripts/ui-ci-baseline.mjs import` 导入官方原件，核对行为/布局和旧图、新图、原始diff。新场景也需审图；候选成功不等于普通CI通过。
- 仅在用户确认范围内，沿 `ui-ci-baseline.mjs accept` 明确run、candidate、case和reason。发现意外变化先修实现；没有像素变化则无需替换PNG。不得批量接受无关变化或手工改来源/图片。
- 保持零重试、原断言、阈值、mask、来源/hash和独立校验；不以强制合并、删测试或放宽门槛消除真实失败。普通CI始终只读比较。
- 新PR在受影响基准就绪后创建；已有PR在确认后可为候选推分支，自动普通CI可能暂时显示旧基准差异，应明确说明，基准提交后由新运行复验，不重跑旧run。
- 云端只执行版本化UI合同与Required checks；本地Vitest/BDD/T1/T3/评估完整保留，不因云端范围缩减删除。

## 自动合并、结束与回收

- 仅无UI变化或已完成上述用户确认与基准步骤的任务，才默认自动合并。`git cp` 不是绕过UI确认的例外。
- 核对目标仓库/main和当前head，执行 `gh pr merge <PR> --repo 6owen/boai-agent --auto --merge --match-head-commit <SHA>`，读回一次state/headRefOid/autoMergeRequest/mergedAt/mergeCommit。确认设置成功即结束；只有明确要求跟进失败/等到通过时才持续等待。
- 不使用 --admin、force push 或改分支保护。main只在实际合并且工作区干净后 `git pull --ff-only`，不得提前同步。
- 每次开始新任务或已确认PR合并时检查旧worktree：只回收已合入main、没有未提交/未合入提交、没有活动任务/预览进程、没有需保留数据的目录。先 `git worktree remove`，再删本地分支；不因PR已提交或远端分支已消失就删除。
- GitHub的合并后删除远端分支与本地worktree清理分别管理；远端自动合并无法直接删除本机文件。不要为回收常驻等待，不动其他Agent仍在使用的目录。

规则提交后用于该分支，合入main后供新/旧worktree每次开始时重新读取；尚未同步的Agent不能宣称已采用新规则。Tag、Release和安装包发布不在日常交付范围。
