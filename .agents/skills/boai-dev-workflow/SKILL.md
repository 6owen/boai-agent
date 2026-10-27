---
name: boai-dev-workflow
description: 在 BOAI 仓库开发功能、修复问题、提交或更新 PR、处理 GitHub Actions 失败及合并 main 时使用。统一分支/worktree、云端 CI、默认自动合并和 UI 基准审阅流程，供 Codex、Claude、Pi 等开发 Agent 读取。
---
<!--
[OUTPUT]: 2026-10-27实测机器人提交的PR检查需Agent批准；独立dispatch绿灯不能替代PR门禁，已移除重复派发。
[OUTPUT]: 2026-10-27本地dev仅确认效果；Agent接续官方构建/差异审阅，main受信工作流线上更新同分支基准并显式复验。当前人工确认是过渡，非永久人工测试流程。
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

## UI 效果先确认，后续由 Agent 完成

- 当前先由用户在功能 worktree 的 `pnpm dev` 中确认界面是否符合需求。这只是效果审阅，不是正式截图比较，不要求用户理解 case、操作测试或搬运图片。用户明确说本批效果可以后，Agent 负责后续完整流程；未来只有用户明确改为 Agent 判断，才替换这一审阅人。
- 根据实际 diff 和 `tests/e2e/baselines/contract.json` 判断受影响场景，补齐新页覆盖。向用户展示具体可运行效果，说明改了什么并询问是否符合预期；不能仅因用户要求开发、代码已提交或测试通过，就认定效果已被接受。
- 用户可以自行 commit/push；Git 操作不会执行 Skill，也不代表确认效果。尚未确认的 UI PR 保持 Draft、不设置自动合并；已存在的旧基准检查报红不等于新功能必须还原。确认前不接受新基准，正常分支保存不受限制。
- 同一批效果只确认一次。新增可见变化需要补充确认，后续官方候选和逐场景映射由 Agent 审阅，不再把技术操作交给用户。效果不满意就在原 worktree 调整，main 不动。
- 没有可见 UI 变化：说明依据，不采集/更新基准，直接提交 PR 并设置自动合并。

## 确认后必须执行到线上基准更新

功能 worktree 修改 → 本地 dev 确认效果 → 推功能分支 → GitHub build 并采集 → Agent 检查官方差异 → GitHub 更新受影响基准并提交同一分支 → 只读 CI 复验 → 通过后自动合并。

1. 确认并推送本批源码后，记录完整 SHA，用 `gh workflow run ui-baseline-candidate.yml --repo 6owen/boai-agent --ref <功能分支>` 启动正式构建/采集。无需本地完整 build，也不上传本地 dev 图片。
2. 候选必须全部行为/布局场景成功。Agent 查看官方 `ui-review` 的旧/新/diff，识别已确认改动对应的 case；必要时用 `ui-ci-baseline.mjs import` 下载原件只读审阅。发现超时/控件缺失等执行失败先修复，不靠换图解决。候选成功不是普通 CI 通过。
3. 沿 main 的 `ui-baseline-update.yml` 在线提交基准：`gh workflow run ui-baseline-update.yml --repo 6owen/boai-agent --ref main -f candidate_run=<成功run> -f approved_head=<已审阅完整SHA> -f cases=<明确ID逗号分隔> -f reason=<本批效果确认及差异审阅结论>`。Agent 执行该命令，无需用户再次批准技术步骤。禁止用本地 `accept` 改完基准再 push 代替本步骤。
4. 更新流程重新核验官方 artifact、来源/构建/环境/全部场景/差异材料，只写所选 PNG 和 manifest，提交回原功能分支；Agent按下一步接续该PR的只读检查。不会再次构建采集；首次构建已在候选流程完成。分支有新提交则拒绝覆盖，需检查新增变化并重新采集。普通 CI 始终只读。
5. 核对更新工作流成功及远端新 SHA，干净功能 worktree 可 `git pull --ff-only`。新分支由Agent创建PR触发检查；已有PR的机器人提交会产生 `action_required` 运行。Agent核对仓库、当前SHA及 `tests.yml` 后执行 `gh api --method POST repos/6owen/boai-agent/actions/runs/<当前PR运行ID>/approve`，这是已授权交付的技术接续，不再询问用户。确认当前PR检查已启动，再设置Ready及对新SHA自动合并。不能停在“本地已确认”“候选已采集”或旧图 CI 报错就交付；基准提交后的 Required checks 才授予合并资格。
6. 不再单独dispatch代替PR检查：实测独立dispatch全绿仍无法满足待批准PR的门禁。审批当前PR运行失败时如实处理，不强制合并；成功批准并启动检查后才完成自动合并交付设置。

保持零重试、原断言/阈值/mask、来源/hash与全场景校验。不得批量接受无关变化、强制合并或删测试绕过失败。云端 UI/Required 与本地 Vitest/BDD/评估范围保持。

## 自动合并、结束与回收

- 仅无UI变化或已完成上述用户确认与基准步骤的任务，才默认自动合并。`git cp` 不是绕过UI确认的例外。
- 核对目标仓库/main和当前head，执行 `gh pr merge <PR> --repo 6owen/boai-agent --auto --merge --match-head-commit <SHA>`，读回一次state/headRefOid/autoMergeRequest/mergedAt/mergeCommit。确认设置成功即结束；只有明确要求跟进失败/等到通过时才持续等待。
- 不使用 --admin、force push 或改分支保护。main只在实际合并且工作区干净后 `git pull --ff-only`，不得提前同步。
- 每次开始新任务或已确认PR合并时检查旧worktree：只回收已合入main、没有未提交/未合入提交、没有活动任务/预览进程、没有需保留数据的目录。先 `git worktree remove`，再删本地分支；不因PR已提交或远端分支已消失就删除。
- GitHub的合并后删除远端分支与本地worktree清理分别管理；远端自动合并无法直接删除本机文件。不要为回收常驻等待，不动其他Agent仍在使用的目录。

规则提交后用于该分支，合入main后供新/旧worktree每次开始时重新读取；尚未同步的Agent不能宣称已采用新规则。Tag、Release和安装包发布不在日常交付范围。
