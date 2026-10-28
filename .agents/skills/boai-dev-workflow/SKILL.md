---
name: boai-dev-workflow
description: BOAI 共享开发流程；沿 Magpie Test 和 DeepSeek UI preview 完成交付。
---
<!--
[INPUT]: 当前用户任务、独立worktree及Magpie Test/UI preview源码。
[OUTPUT]: 工程测试与自动界面预览；撤销固定截图基准更新作为PR前置。
[OUTPUT]: 任务worktree完成即回收；实际合并或最终提交archive存档二选一，编排会话负责子worktree。
[POS]: Codex、Claude、Pi共用开发技能。
[PROTOCOL]: 变化同步Header、所属.folder.md与第22组06现行合同。
-->
# BOAI 开发与交付

## 开始与范围

- 每次开始和交付前读取当前用户指令、AGENTS.md、本技能，并fetch/read origin/main的最新技能；当前用户指令优先。
- 核对分支、status、remote和worktrees，使用对应独立功能worktree。只修改、暂存本任务文件；保留其他任务改动和进程。main只同步实际已合并提交。

## Worktree 依赖与预览

- main 和所有功能 worktree 使用仓库锁定的 pnpm 版本及同一 pnpm store。各 worktree 保留独立 node_modules/虚拟依赖树，由 pnpm 通过硬链接或写时复制共享包内容；禁止把整个 node_modules 或虚拟依赖树软链接到 main/另一个 worktree。
- 需要运行的功能 worktree 首次安装：`pnpm install --frozen-lockfile --prefer-offline`。包已缓存时复用，仅补缺失内容；依赖输入未变化且安装有效时不重复安装。纯文档任务不必安装。新增依赖正常更新清单/锁文件。
- 发现旧的跨 worktree node_modules 软链接时，先检查本任务进程，再只解除本 worktree 的链接并正常安装；不得删除链接目标，也不得改其他任务的依赖。
- 用户要求看效果时，直接在功能 worktree 启动预览，不必先合 main：`BOAI_DATA_DIR="$PWD/.local/dev-profile" BOAI_DEV_PORT=0 pnpm dev`。数据目录独立于个人应用，端口0由系统分配；报告 worktree、分支/提交和实际启动结果。不要关闭或接管 main 的运行进程。
- `pnpm dev` 是按需预览，不是固定日常运行方式。预览启动会编译开发宿主，但不等于跑完整构建、GUI测试或业务验收。不得借预览自行启动本机自动CI、全量测试或模型调用。
- 清理时保留可能含用户录入的预览数据，不能仅因位于.local就视为可删除缓存。

## Test 与 UI preview

开发完成 → 提交功能分支/PR → Test 与 UI preview 自动运行 → 查看实际检查和PR预览 → 按本次授权交付。

- `Test` 沿 Magpie 的 PR/main/manual 触发与并发取消方式，用BOAI现有 typecheck、lint、build、Vitest 命令；CLI集成测试依赖dist/cli，因此先构建再测试。现阶段在已支持的macOS执行；Required checks只汇总工程测试结果，保持原分支保护名称。
- `UI preview` 沿上游 detect → record → publish：UI文件变更或ui-preview标签触发；DeepSeek读取diff及真实页面，规划操作、截图，交互时录屏，在PR描述固定区域更新预览。已有DeepSeek配置通过ui-preview environment提供。
- 执行PR代码的record任务没有仓库写权限；有写权限的publish任务不运行PR代码。预览是运行画面与规划说明，不冒充工程测试通过。
- 不要求用户先在本地确认效果；不运行基准candidate/accept/update，不以新旧PNG不同阻止正常UI开发。旧本地UI回归工具、测试源码及历史结果保留为按需工具，不属于PR门禁。
- 没有UI变化时，preview检测后跳过录制；Test正常执行。不为通过CI修改产品UI、删除产品行为测试或伪造模型调用。
- 用户明确要求执行试验时跟进本次实际结果；失败先定位再有针对性修复，不盲目重跑。

## PR、合并与回收

- 根据本次授权创建或更新同一PR。普通授权交付沿既有默认自动合并；用户明确只修改/测试或不合并时，不设置自动合并。
- 允许合并时核对仓库/main与当前head，使用 `gh pr merge --auto --merge --match-head-commit <SHA>`，读回一次回执。只有明确要求等到通过或处理失败才持续跟进。
- 不使用admin、强推或放宽分支保护。确认实际合并后才在干净main同步。
- 按AGENTS.md“worktree不遗留”收尾，包括subagent派生目录：最终提交实际合入main，或提交本任务改动并核对`archive/<worktree名>`归档标签后，移除worktree及本地任务分支，并清理经核实的专用cargo target。核对进程退出、CWD移出、未跟踪/ignored数据迁出及共享目录边界；编排会话负责子worktree。确需保留时，最终回复必须点名路径与原因。自动合并仍待检查时可先按归档路径回收本地worktree，不冒称已合并。

现行上游与必要适配见 `.github/ui-preview/README.md`。版本Tag、Release、安装包发布不属于日常交付；本地`archive/*`标签仅用于任务收尾存档。
