---
name: boai-dev-workflow
description: 在 BOAI 仓库开发功能、修复问题、提交或更新 PR、处理 GitHub Actions 失败及合并 main 时使用。统一分支/worktree、云端 CI 和 UI 基准审阅流程，供 Codex、Claude、Pi 等开发 Agent 读取。
---
<!--
[INPUT]: 用户任务和既有提交/合并授权、当前工作区、仓库工作流与测试合同。
[OUTPUT]: 功能分支改动、按完整差异分流的文档/产品CI及严格合并；文档检查不冒充产品验证，本地/PR/main分别报告。
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

- 在任务要求提交时，仅提交本任务文件并 push 功能分支，然后创建目标为 `main` 的 PR；已有 PR 则继续更新原分支。只 push 尚无 PR 的普通功能分支，目前不会触发普通 CI。
- 创建 PR（包括 draft）和向该 PR 分支 push 新提交，触发云端 CI；同一 PR 的旧运行可能被新运行取消，以最新提交的完整运行结果为准。
- CI 先在 Ubuntu 按完整 Git 差异判断范围。仅根 `README.md`/`AGENTS.md`/`CLAUDE.md`、各级 `.folder.md`、`.agents/` 和 `ai-docs/` 内 Markdown 的改动走文档轻量检查：差异格式、Header、Skill 基本名称/描述；两个产品任务明确 skipped，始终运行的 `Required checks` 独立重算范围后核对结果，不生成桌面原件。文档资格仅说明这些文档检查通过。
- 混入任意代码、测试、依赖、CI配置、非文档资源或未知路径，及手动执行、无法确定完整差异时，走完整产品 CI：macOS 执行依赖安装、类型、UI规则、构建、模块、评估数据、固定 T1 和全部 UI 比较，Ubuntu 汇总仍独立核验原始报告与逐场景证据。当前 T1 为 32 项、UI 为 18 项，后续数量随版本化清单和实际覆盖调整。CI配置变更本身必须完整验证；不用 `paths-ignore` 或提交消息跳过整个必需工作流。
- 离线核心 CI 的结果不代替真实模型业务评估、尚未纳入的专项或发布/升级验收；T2/T3 沿原分层执行，旧失败逐项迁移，不通过删除用例或跳过失败降低门禁。

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
