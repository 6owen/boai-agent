---
name: boai-dev-workflow
description: BOAI 日常开发、样式调整、Bug 修复和 PR 交付。按实际改动选择最小有效验证，使用分范围 CI，避免小改动触发本地全量测试或阻塞等待。
---
<!--
[OUTPUT]: 开发交付默认提交 PR 并开启自动合并；用户要求先看截图时，交付实际图片的绝对路径并等待确认。
[OUTPUT]: 本地 Vitest 按 Git 变更选测；UI PR 由开发 Agent 写入实际截图目标，支持悬停状态。
[OUTPUT]: 2026-11-18 UI PR创建/更新自动截图与适用录屏，合并后同SHA继续补发；Agent接续，无需用户点Run。
[OUTPUT]: 2026-11-17按改动分层验证；前端PR运行相关测试，main保留全量；普通交付不阻塞等CI。
[OUTPUT]: 2026-11-13 Test固定三项UI行为；预览按实际完成度和当前SHA发布，部分结果保持失败。
[OUTPUT]: 2026-11-10新增boai-agent-dev-skills统一入口，梳理实际dev/build/验证/打包/bumpp/tag/Release/Git/worktree命令；release:build现默认读取package版本与当前HEAD，显式参数仍可覆盖。
[OUTPUT]: 2026-10-29新增boai-release共享技能，覆盖bumpp、本机候选/Release、下载与自动更新；普通开发转入发布须符合本次请求。
[OUTPUT]: 2026-10-29用户明确调用git cpf时允许临时管理员检查例外，恢复记录和实际合并核验必需；普通交付保持。
[OUTPUT]: 2026-10-29 PR录屏采用原生视频附件，独立发布凭据、缺配置及失败不得称在线播放。
[INPUT]: 当前用户任务、独立worktree及Magpie Test/UI preview源码。
[OUTPUT]: 工程测试与自动界面预览；撤销固定截图基准更新作为PR前置。
[OUTPUT]: 任务worktree完成即回收；实际合并或最终提交archive存档二选一，编排会话负责子worktree。
[OUTPUT]: 面向使用者的UI_TEST_CI.md与本技能及实际workflow保持一致。
[POS]: Codex、Claude、Pi共用开发技能。
[PROTOCOL]: 变化同步Header、所属.folder.md与第22组06现行合同。
-->
# BOAI 开发与交付

按实际 diff 选择验证，完成本次需求后继续交付。**小样式修改不默认跑本地全量 Vitest、完整 build、Electron E2E 或整套录屏；普通 PR 交付不默认等待 CI。** 本次明确的“不测试”“不跑 E2E”“不抢焦点”或“等 CI 通过”优先。

命令和环境说明按需读 [开发统一入口](../boai-agent-dev-skills/SKILL.md)；CI 的真实分流见 [UI_TEST_CI.md](../../../UI_TEST_CI.md)。不要为了简单任务预先加载所有发布、评估或历史验收规范。

## 按改动选择验证

| 改动 | 本地验证 | PR 的 Test |
| --- | --- | --- |
| 文档、Skill、目录说明 | diff/格式/链接；修改Skill时校验frontmatter | documentation：差异检查，不装产品依赖 |
| 页面样式、间距、颜色、图标、文案 | 查看diff；相关lint，涉及类型/组件接口时typecheck；已有相关组件测试按需运行 | checks：类型和lint |
| 页面交互或前端状态 | 相关组件/状态测试；改变真实桌面交互时补对应BDD并定向执行 | checks：类型和lint |
| 后端、IPC/共享协议、依赖、构建/CI、发布 | 相关模块测试及必要构建；按具体风险扩展 | checks：类型和lint；全量只在 release 的 main 运行 |

这是按影响选择范围，不是按文件数量或PR标题判断。修改测试时保留未变化的行为断言；需求变化须说明旧新期望及依据，产品和测试在同一PR验证。不得用删断言、跳过失败场景或伪造结果换绿灯。

## 开发与本地效果

- 开始时核对用户要求、分支、status、remote、worktree；在独立功能worktree修改。main只同步实际合并提交，保留其他任务及未提交数据。
- 需要运行代码才初始化子模块并安装独立依赖树：`git submodule update --init --recursive`、`pnpm install --frozen-lockfile --prefer-offline`。有效依赖直接复用；不把整个node_modules链接到另一worktree。纯文档不安装。
- 产品代码需要 Vitest 时，先运行 `pnpm test:changed --list` 确认选中的文件，再运行 `pnpm test:changed`。默认对比与 `origin/main` 的共同祖先，计入已提交、暂存和未暂存的改动，包括新文件。PR 目标分支不同则传对应基准引用。纯文档按上表检查。
- 测试通过静态依赖关联。若样式、字符串读源码、动态加载或共享配置的测试漏选，用 `pnpm exec vitest run <相关测试文件>` 补跑并记录。选测为空要写清楚实际未执行；依赖 dist 的用例按对应构建前提准备。
- 需要确认页面效果时，复用本任务已有预览或定向组件预览，截取受影响状态并实际看图。动画/连续交互按需短录屏；不为一个间距变化启动完整桌面流程、调用真实模型或反复录制无关页面。没有实际截图就不要声称看过效果。
- BDD沿 `tests/e2e/features/`、`steps/`、`support/`，先生成再按标签/场景名选场，`--list`核对范围；不手改 `.features-gen/` 或新增平行 `.spec.ts`。不默认运行覆盖整个桌面的 `pnpm test:electron`。
- 确需启动独立应用时用 `BOAI_DATA_DIR="$PWD/.local/dev-profile" BOAI_DEV_PORT=0 pnpm dev`，不接管个人应用或其他会话进程；`pnpm dev`是按需工具。

## 提交前审查

读需求、产品/测试diff和实际检查结果；有视觉证据时一起核对。简短记录改了什么、检查了什么及未验范围，不生成与任务无关的长审查报告，不为可逆样式调整新增形式化测试。

明确缺陷直接修复并重跑受影响检查；质量审查失败后的自动修复最多两轮。同一问题不能靠新push或重启会话重置次数。仍失败或确实需要用户决定时，展示具体问题、证据和选择。正常通过不追加例行人工确认。

## 用户要求先看截图

用户说「改好后截图给我看」或「先看截图」时，完成修改和相关验证后，用当前改动的隔离预览打开实际受影响的状态并截图。核实图片内容和文件存在，把 PNG 保存在不会随任务 worktree 回收而删除的位置，例如主检出目录下的 `.local/review-screenshots/<任务>/`，然后在回复中给出每张图片的完整绝对路径。

截图交付后等待用户确认。暂停本次变更的远端推送和 PR 创建或更新。必要的本地提交与归档可继续，回收前确认截图已迁出。用户确认继续后，再用已审阅的源码创建或更新 PR 并按普通交付开启自动合并。普通 UI PR 的自动 CI 截图沿下节执行。

## PR 和 CI

- 实施改动并完成相关验证后，默认只暂存本任务文件，提交、推送、创建或更新同一 PR，并为当前提交开启自动合并。用户指定先看截图、只修改、暂缓提交或暂不合并时，按本次范围交付。标题和正文围绕最终问题与结果，列出实际验证及未验范围。CI尚未结束就写“运行中”，不能用上次提交的结果冒充当前结果。
- 当前 `Test` 随PR事件或Agent命令触发。普通PR在Linux上做类型/lint（文档仅差异检查），不运行应用build、Vitest或Electron。main合并后不再重复Test；后端/依赖/CI改动也不自动升级为全量。相关Vitest/BDD由本地Agent按本次影响选择，不机械复制到云端重复执行。
- `Required checks` 汇总工程 Test。UI PR 创建、重开或推送后共用一次构建，自动将改动页面和全局主界面两张 PNG 写回当前提交的 PR 正文。全局截图和 PR 截图均不做像素比较。
- 开发 Agent 根据本次 PR 的完整 diff 确定 UI 截图目标，并在创建 PR 时写入 `boai-screenshot`。更新 UI PR 时先核对并更新该定位，再推送新提交。用页面源码或已有 BDD 核实定位器。在共享 CSS、弹窗、抽屉、二级页或悬停状态，指定实际影响的组件或内容，并给出让它可见的点击与悬停步骤。多个区域改动时选最能说明本次改动的状态。见 [截图目标说明](../../../UI_TEST_CI.md#pr-截图目标)。
- UI 文件自动触发截图。只修改正文定位或路径漏检时，由 Agent 执行 `gh workflow run ui-preview.yml --ref main -f pr=<编号>` 补拍。若目标未拍到，依据日志和源码校正定位；已有隔离夹具无法呈现目标时，在 PR 记录具体限制。
- 预览按当前head核对源码与媒体；即使PR先自动合并，也继续补发同一head的结果，已有PR媒体继续保留。正文更新保留 `<!-- boai-ui-preview:begin -->` 与 `<!-- boai-ui-preview:end -->` 自动区块。运行中如实说明截图待生成；失败写回原因，不能把触发成功称为已有截图或视觉质量通过。
- 普通交付读回并报告 PR 链接，区分已启用自动合并、仍被门禁阻塞和已合入 main。用户要求“等到通过/合并”或“处理CI失败”时持续跟进；先读失败日志，再定向修复同一 PR。
- 云端全量 Vitest 只随正式 release 的 main 验证运行，PR 标签不会升级测试范围。新场景按实际业务风险本地定向验证。
- 已获授权的正式发布由Agent先执行 `gh workflow run test.yml --ref main` 并核对当前main同SHA最新命令触发的完整Test成功；旧push/PR绿色不授予发布资格。日常开发不触发发布验证。

## Git、回收与发布边界

只暂存本任务路径，使用 `git add -- <路径>`。普通开发交付和 `git cp` 默认包含开启自动合并，按 GitHub 的分支保护等待所需检查。创建或更新 PR 后读取远端当前 head，运行 `gh pr merge <PR> --auto --merge --match-head-commit <SHA>`，再用 `gh pr view <PR> --json state,headRefOid,autoMergeRequest,mergeStateStatus,mergeCommit` 核对结果。用户明确要求先审阅、只开 PR 或暂不合并时，按该范围交付。

PR 落后于 main 时，先安全更新分支。有冲突时保留双方意图并验证受影响范围。更新后读取新 head，再核对或重新开启自动合并。

只有用户明确 `git cpf` 或跳过CI直接合并，才按 [快速合并说明](../../../UI_TEST_CI.md#需要立即合并git-cpf) 使用现有脚本并核对管理员保护恢复。普通改动不自动采用此例外。

任务worktree在已合并或最终提交已archive存档后回收；删除前核对进程、dirty/untracked/ignored数据及共享依赖，保留用户数据和必要证据。不额外等CI才清理已归档的本地副本；实际合并以GitHub回执为准。确需保留时写明路径和原因。

只有发布请求才转 [boai-release](../boai-release/SKILL.md)。日常开发和PR不自动升版、发布、重启个人应用或安装更新。本技能在当前Agent会话执行，不是常驻worker。
