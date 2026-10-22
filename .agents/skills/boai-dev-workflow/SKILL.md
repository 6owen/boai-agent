---
name: boai-dev-workflow
description: 在 BOAI 仓库开发功能、修复问题、提交或更新 PR、处理 GitHub Actions 失败及合并 main 时使用。统一分支/worktree、云端 CI 和 UI 基准审阅流程，供 Codex、Claude、Pi 等开发 Agent 读取。
---
<!--
[INPUT]: 用户任务和既有提交/合并授权、当前工作区、仓库工作流与测试合同。
[OUTPUT]: 按开发里程碑推送，文档轻量/Draft暂缓/Ready或ci:full完整云端验证；未验证草稿不能合并，PR取消过时运行而main保留验证。
[POS]: .agents/skills/boai-dev-workflow/SKILL.md，仓库开发侧共享流程，不是产品员工技能。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->
# BOAI 开发与云端 CI

按用户要求推进到本地改动、PR 或 main；只要求分析/落文档时交付对应成果。推送和合并沿用会话已有授权，技能加载本身不扩大任务范围，也不要求重复确认。所有 Agent 共用本文件；客户端不自动发现项目技能时，直接读取本路径。

## 开始开发

1. 读取仓库 [AGENTS.md](../../../AGENTS.md)、所属功能规格和目录地图，查看当前分支、`git status`、远端。以当前 [.github/workflows/tests.yml](../../../.github/workflows/tests.yml)、[T1 清单](../../../tests/e2e/test-tiers.json)、[UI 合同](../../../tests/e2e/baselines/contract.json)为准，不把历史运行的 SHA、数量或成绩当新任务资格。
2. 从最新 `origin/main` 创建功能分支。用户日常在主目录运行 `pnpm dev`，独立工作优先使用 worktree，保留主目录当前分支和未提交工作；已有合适功能分支可继续使用。`main` 用于同步已合并提交。
3. 按原功能补实现和必要测试。桌面流程复用 `tests/e2e/features/`、`steps/`、`support/` 的 playwright-bdd；文档归 `ai-docs/`，更新受影响 Header 和 `.folder.md`。新增功能补对应覆盖，原有核心场景、业务断言和历史专项失败保持可追踪。

本地用于编码和日常 `pnpm dev` 开发。自动产品验证默认交给 GitHub Actions：不要因完成开发而自动启动本机 CI、产品测试、构建或带 GUI 的 Electron/Playwright 验证；用户明确授权本机验证时才按其范围执行。本机自动 CI 服务保持停用，云端不可用时报告原因和未验证项，不自动恢复本机服务或改用 self-hosted runner。Skill元数据、文档链接和Git差异等轻量校验可在本地完成。

## 提交与 PR

- 按可验证的小目标集中推送：先完成这一批实现、必要测试和自查，再一次 push。中间步骤可以本地 commit；不为每次编辑、临时日志或单条断言反复 push/dispatch。用户明确要求中途同步时沿其要求执行。
- 在任务要求提交时，仅提交本任务文件并 push 功能分支，然后创建目标为 `main` 的 PR；未准备审阅时使用 Draft，已有 PR 继续更新原分支。只 push 尚无 PR 的普通功能分支不触发普通 CI。
- PR创建/更新、Ready与Draft切换、`ci:full`标签增删触发范围判断；无关标签不取消验证或覆盖`Required checks`。本地保存/commit和读取Actions状态、日志均不触发新测试。
- CI 先在 Ubuntu 按完整 Git 差异判断范围。仅根 `README.md`/`AGENTS.md`/`CLAUDE.md`、各级 `.folder.md`、`.agents/` 和 `ai-docs/` 内 Markdown 的改动走文档轻量检查：差异格式、Header、Skill 基本名称/描述；两个产品任务明确 skipped，始终运行的 `Required checks` 独立重算范围后核对结果，不生成桌面原件。文档资格仅说明这些文档检查通过。
- Draft产品改动默认只做Git差异格式检查，两个产品任务暂缓；`Required checks`明确失败并说明尚未验证，不授合并资格。转为Ready后自动完整验证；需要在Draft阶段提前验证时添加`ci:full`标签，该标签保留期间每次新提交都完整执行。文档PR加此标签也强制完整。移除标签恢复按实际范围分流。
- Ready产品PR、main产品push、手动执行或无法确定完整范围时，走完整产品 CI：macOS 执行依赖安装、类型、UI规则、构建、模块、评估数据、固定 T1 和全部 UI 比较，Ubuntu 汇总仍独立核验原始报告与逐场景证据。`.github/`、`scripts/ci-*`、`tests/ci-*`改动即使Draft也完整执行，确保分流机制验证自身。当前 T1 为 32 项、UI 为 18 项，后续随版本化清单调整；不用`paths-ignore`或skip-ci消息绕过必需工作流。
- 同一PR的新有效运行取消过时运行；main已启动的验证保留到结束，避免连续合并导致main长期没有完整结果。
- 离线核心 CI 的结果不代替真实模型业务评估、尚未纳入的专项或发布/升级验收；T2/T3 沿原分层执行，旧失败逐项迁移，不通过删除用例或跳过失败降低门禁。

## 专项诊断与 Hooks

- 新增专项云端诊断默认使用`workflow_dispatch`，复用现有入口并明确用例/源码范围；工作流须已存在默认分支才能手动派发，尚未接入时可用`ci:full`复用正式验证。不要为逐次试错反复新增`push`诊断工作流。确有持续自动诊断需求时，在方案中写清分支/路径和并发取消策略；临时诊断不提供正式合并资格。
- 派发前确认同一源码和范围没有仍在运行的同类任务；读取已有日志后形成下一批修复，再集中推送。产品失败先定位原因；仅有明确基础设施暂态证据时有限重跑，原失败保留，未知回执先查询，不能靠重复执行碰绿色。
- 约束的共享入口是`AGENTS.md`、本Skill和服务端workflow。客户端或Git hooks可做轻量提醒，不承担必需门禁；不在提交/推送hook中安装依赖、构建、启动产品测试、自动push或派发Actions。无需配置用户全局hooks或绑定Codex/Claude/Pi某一客户端。

## 跟进云端进度与失败

在仓库目录使用 `gh`；缺少该客户端时使用同一仓库的 GitHub PR/Actions 页面，无需某个特定 Agent 的专属工具。

```bash
gh pr view <PR号> --json url,headRefOid,baseRefOid,mergeStateStatus,statusCheckRollup
gh pr checks <PR号>
gh run view <运行ID> --json headSha,status,conclusion,jobs,url
gh run view <运行ID> --log-failed
```

- 向用户报告实际文档/产品范围、当前阶段和 PR/运行链接；区分 queued、in_progress、cancelled、failure 和 success。日志暂不可读时只报告已知步骤，不能推测场景已通过。
- 失败时读取实际失败步骤、原始报告和适用的截图/trace，定位后修复同一分支，再 push 新提交。基础设施暂态失败有证据时可在原授权内有界重跑，保留原失败；不要循环重跑直到碰巧变绿。
- 原有断言、超时、重试、像素阈值和 mask 继续按合同执行；不能靠新增 skip、削减断言、放宽比较或关闭保护让 PR 通过。报告实际通过、跳过、失败和未执行数量，轻量文档结果不能写成32/18产品测试通过。

## UI 基准变更

UI 不符先判断是实际回归还是预期设计变更。回归修产品；新增功能补场景和必要的新基准；预期界面改版从独立候选流程生成原件，查看旧图/新图/diff，确认符合需求后显式接受相应 case，再随 PR 审阅。环境迁移按合同完成全量迁移，不混用本机与云端档案。

普通 CI 只读比较，不能自动更新或接受基准。具体候选、审阅和接受步骤在需要时读取 [06-UI回归基准与PR门禁](../../../ai-docs/spec/22.开发自动化与持续测试/06-UI回归基准与PR门禁.md)，复用现有入口，不另写覆盖 PNG 的捷径。

## 合并与本地同步

1. 合并前重新读取 PR 当前 head、base 和检查状态，确认原定审阅完成、分支满足 main 的最新严格保护，且当前 head 的 `Required checks` 实际成功。当前保护绑定 GitHub Actions app 15368；主分支或 PR 有新提交时重新取得对应检查资格。候选采集成功、单项测试或旧 SHA 的绿灯不代替它。
2. 在已有合并授权内完成普通 merge，保留提交历史，并绑定已核验的 head：

   ```bash
   gh pr merge <PR号> --merge --match-head-commit <已通过检查的head-SHA>
   ```

   不用 `--admin`、force push 或修改保护绕过检查。回执不明时先查询 PR 是否已合并及实际 merge commit。
3. 确认远端 main 已包含实际合并提交。需要同步本地主目录时，先确认该工作区在 `main` 且干净，再 `git fetch origin`、`git merge --ff-only origin/main`。有用户修改或分叉时保留现场，处理实际差异，不覆盖或重置用户工作。
4. 合并到 main 的 push 会自动触发另一轮云端 CI。最终分别报告 PR 检查结果、合并提交、本地同步/待 push 状态以及 main 复跑链接和实际状态；main 仍运行时明确标为进行中。

完成标准取决于用户要求的阶段：本地任务交付改动及验证边界；PR 交付给出链接和当前检查状态；合并任务确认远端真实合并及约定的本地同步。创建 Tag、发布 Release 和桌面升级属于独立任务。
