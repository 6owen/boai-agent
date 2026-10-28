---
name: boai-dev-workflow
description: BOAI 开发、git cp、PR/CI 和合并的共享流程。独立 worktree 开发，自动官方 UI 采集，Agent 按需求审阅基准，最新提交只读复验后交付。
---
<!--
[INPUT]: 用户任务、现有授权、当前worktree和官方PR运行。
[OUTPUT]: 2026-10-28用可接续ui:deliver落地采集/审阅/基准/复验；取代强制用户本地dev确认的前置条件。
[POS]: Codex/Claude/Pi共用开发技能，不属于产品员工运行时。
[PROTOCOL]: 修改同步AGENTS.md、目录地图和第22组06当前合同。
-->
# BOAI 开发与 UI 交付

## 开始与修改

- 开始和交付前读取当前用户指令、AGENTS.md、本 Skill；fetch main 并核对 `git show origin/main:.agents/skills/boai-dev-workflow/SKILL.md`，同时尊重本分支流程修订和最新用户指令。2026-10-28规则替代此前“用户先在本地确认，才能采集/更新”的要求。
- 检查状态、分支、远端、worktree、对应 PR。独立功能 worktree 开发，保留他人文件和进程，main 只同步实际已合并提交。只暂存本次明确文件，禁止 `git add .`。
- 根据需求和 diff 判断已有 UI 场景受影响范围；新页/交互补覆盖。保持完整合同、原断言、阈值、mask、零重试；不得换图掩盖控件缺失、布局断言失败或功能错误。
- 本地执行与改动相关的模块/类型/lint 检查；GitHub 运行 UI。不要在本地启动 UI 自动测试或恢复已暂停的本机 CI。
- 各 worktree 使用独立 node_modules，复用 pnpm store；首次 `pnpm install --frozen-lockfile --prefer-offline`，禁止跨 worktree 软链接整个依赖树。
- `pnpm dev` 是可选预览，不是交付前置：需要时在功能 worktree 用 `BOAI_DATA_DIR="$PWD/.local/dev-profile" BOAI_DEV_PORT=0 pnpm dev`。保护其他进程和预览数据。

## 实际交付入口

源码提交/推送 → Draft PR 自动完整采集 → Agent 审阅官方差异 → main 受信流程提交受影响基准 → 当前 PR 最新提交只读复验 → Ready/正常自动合并。

1. 按授权提交推送。首次 `pnpm ui:deliver start --title "..." --body-file /绝对路径/pr.md` 创建本分支 Draft；已有 PR 用 `pnpm ui:deliver`。入口不会替你暂存或推送。用户禁止合并时传 `--no-auto-merge`，该选择写入本 worktree 接续记录。
2. 普通 PR 源码 push 自动采集全部登记场景，不需先通过旧截图比较。所有行为/布局断言仍执行；有执行失败则正常失败，先修功能/测试真实错误。纯视觉变化使 `Required checks` 保持 **in_progress（待 Agent 审阅）**，不授予合并资格，也不占用 runner 等用户。
3. Agent 在采集与汇总任务完成后接续 `pnpm ui:deliver`。它只选择当前分支、当前 head 的 PR 运行；按当前attempt核验采集/汇总成功后下载并核验官方 artifact（整体run可能因Required待审阅仍为in_progress，不能等它先变绿），输出每个变化场景及本地 `review/` 的 old/new/diff 路径。查看这些图片，逐项对应用户需求；默认由 Agent 判断预期变化，用户不必再操作 dev 或理解 case。出现需求不明确、预期外设计变化或整套环境迁移时，再具体说明疑点并询问用户；等待期间可以继续独立工作。
4. 审阅全部实际变化后执行 `pnpm ui:deliver review --cases id1,id2 --reason "逐项需求与视觉审阅结论"`。cases 必须精确覆盖本批实际变化，不能批量接受无关场景。入口派发 main 上的 `ui-baseline-update.yml`；受信 main 代码重新下载官方材料并校验当前 SHA、环境、构建、原件和选择，只提交所选 PNG/manifest 到原功能分支。普通检查从不写基准。
5. 更新结束继续 `pnpm ui:deliver`：仅将已登记的基准提交快进到干净 worktree；核对并批准机器人提交所触发的当前 PR `action_required` 运行。不能单独 dispatch 一次 UI 检查来替代该 PR 门禁。源码变化、run attempt 变化会使旧审阅失效，重新采集/审阅；不覆盖并发源码提交。
6. 基准提交直接进入两片完整只读复验；无视觉变化的候选也在同一工作流自动进入只读复验。`Required checks` 只有原 `ci-result gate-shards` 核对当前 merge SHA、全部场景与原件成功才绿。候选成功、更新成功和调度 job 的绿灯均不等于合并资格。
7. Agent 接续到当前只读复验成功，再运行入口设置 Ready/普通自动合并并读回一次回执。默认交付不止于“提交了/旧图红了/待用户手动测试”。若用户明确只要提交或不跟踪 CI，遵守边界并准确报告当前阶段、下一条接续命令，不能宣称完成 UI 交付。

运行中按阶段等待并更新用户，不盲目 rerun；失败保留原件，诊断后修复新提交。`pnpm ui:deliver status` 只看状态。接续记录在 `.local/ui-delivery/state.json`，含精确 head/run/attempt/审阅范围；网络提交回执未知时保留记录、查既有更新运行，不重复派发。更新失败先核实没有写入，归档旧记录后才可显式重新审阅。证据过期需要新官方候选，不用本地图片替代。

## 合并、清理与生效

- 不使用 `--admin`、force push 或放宽保护。自动合并配置不等于实际合并；明确要求等待合并时核对 `state/mergedAt/mergeCommit`。
- main 干净且确认实际合并后才 `git pull --ff-only`，不复制功能文件回 main。
- 只清理已合入 main、无未提交/未合入内容、无活动任务/进程、无需保留数据的 worktree；先 `git worktree remove`，再删本地分支。不为回收常驻等待，不动其他任务。
- 本流程代码合入 main 后，新的分支/会话读取当前 Skill 生效。已有旧分支须同步新流程；旧失败记录保持，不自动重跑或合并旧 PR。上线验证记录在第22组06 §21，未实际验证的环节必须明确说明。
