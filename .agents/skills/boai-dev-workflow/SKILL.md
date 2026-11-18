---
name: boai-dev-workflow
description: BOAI 日常开发、样式调整、Bug 修复和 PR 交付。按实际改动选择最小有效验证，使用分范围 CI，避免小改动触发本地全量测试或阻塞等待。
---
<!--
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
| 后端、IPC/共享协议、依赖、构建/CI、发布 | 相关模块测试及必要构建；按具体风险扩展 | checks：类型和lint；只有显式完整验证才full |

这是按影响选择范围，不是按文件数量或PR标题判断。修改测试时保留未变化的行为断言；需求变化须说明旧新期望及依据，产品和测试在同一PR验证。不得用删断言、跳过失败场景或伪造结果换绿灯。

## 开发与本地效果

- 开始时核对用户要求、分支、status、remote、worktree；在独立功能worktree修改。main只同步实际合并提交，保留其他任务及未提交数据。
- 需要运行代码才初始化子模块并安装独立依赖树：`git submodule update --init --recursive`、`pnpm install --frozen-lockfile --prefer-offline`。有效依赖直接复用；不把整个node_modules链接到另一worktree。纯文档不安装。
- 组件/模块回归用 `pnpm exec vitest run <相关测试文件>`。先核对构建前提：依赖dist的测试须先构建；不能因为某条CLI需要build就把所有小改动都升级为完整应用构建。
- 需要确认页面效果时，复用本任务已有预览或定向组件预览，截取受影响状态并实际看图。动画/连续交互按需短录屏；不为一个间距变化启动完整桌面流程、调用真实模型或反复录制无关页面。没有实际截图就不要声称看过效果。
- BDD沿 `tests/e2e/features/`、`steps/`、`support/`，先生成再按标签/场景名选场，`--list`核对范围；不手改 `.features-gen/` 或新增平行 `.spec.ts`。不默认运行覆盖整个桌面的 `pnpm test:electron`。
- 确需启动独立应用时用 `BOAI_DATA_DIR="$PWD/.local/dev-profile" BOAI_DEV_PORT=0 pnpm dev`，不接管个人应用或其他会话进程；`pnpm dev`是按需工具。

## 提交前审查

读需求、产品/测试diff和实际检查结果；有视觉证据时一起核对。简短记录改了什么、检查了什么及未验范围，不生成与任务无关的长审查报告，不为可逆样式调整新增形式化测试。

明确缺陷直接修复并重跑受影响检查；质量审查失败后的自动修复最多两轮。同一问题不能靠新push或重启会话重置次数。仍失败或确实需要用户决定时，展示具体问题、证据和选择。正常通过不追加例行人工确认。

## PR 和 CI

- 按本次授权创建/更新同一PR，标题和正文围绕最终问题与结果，列出实际验证及未验范围。CI尚未结束就写“运行中”，不能用上次提交的结果冒充当前结果。
- 当前 `Test` 随PR事件或Agent命令触发。普通PR在Linux上做类型/lint（文档仅差异检查），不运行应用build、Vitest或Electron。main合并后不再重复Test；后端/依赖/CI改动也不自动升级为全量。相关Vitest/BDD由本地Agent按本次影响选择，不机械复制到云端重复执行。
- `Required checks`名称及分支保护保持，绿色表示所选工程检查通过，不能写成全量产品测试通过。**UI PR创建、重新打开或推送新提交后，`UI preview`自动按diff构建真实界面、截图，交互需要时录屏，并更新PR正文。无需用户点Run或加标签。** 纯文档/后端改动跳过录制。此预览构建独立于Test，不运行整套Vitest或固定BDD。
- Agent创建/更新PR后核对预览是否已启动；已启动就由CI异步接续。路径检测遗漏但确有可见改动时，Agent用 `gh workflow run ui-preview.yml --ref main -f pr=<编号>` 补触发，不交给用户操作。`ui-preview`标签只是强制预览的可选入口，不是普通UI PR的前置条件。
- 预览按当前head核对源码与媒体；即使PR先自动合并，也继续补发同一head的结果，已有PR媒体继续保留。正文更新保留 `<!-- boai-ui-preview:begin -->` 与 `<!-- boai-ui-preview:end -->` 自动区块。运行中如实说明截图待生成；失败写回原因，不能把触发成功称为已有截图或视觉质量通过。
- **普通交付：提交/推送、按授权设置自动合并、读回一次PR状态，然后报告并结束本轮；不轮询二十分钟，不等main复跑或UI preview。** 这不等于取消CI或已经合并。只有用户要求“等到通过/合并”“处理CI失败”时才持续跟进；此时先读失败日志，再定向修复同一PR。
- 本次需求需要完整验证、正式发布或用户指定时，由Agent执行 `gh workflow run test.yml --ref <分支>`（macOS构建、固定UI及全量Vitest），无需用户操作Actions页面。`ci:full`标签让下一次PR push走完整检查，添加标签本身不启动Test。不得为了小样式改动自动加这些标签或调用完整入口。
- 已获授权的正式发布由Agent先执行 `gh workflow run test.yml --ref main` 并核对当前main同SHA最新命令触发的完整Test成功；旧push/PR绿色不授予发布资格。日常开发不触发发布验证。

## Git、回收与发布边界

只暂存本任务路径，使用 `git add -- <路径>`。普通授权交付沿既有自动合并规则；明确只修改/测试或不合并时不自动合并。允许时按确切head运行 `gh pr merge --auto --merge --match-head-commit <SHA>` 并读回；不借优化CI关闭保护、强推或使用admin。

只有用户明确 `git cpf` 或跳过CI直接合并，才按 [快速合并说明](../../../UI_TEST_CI.md#需要立即合并git-cpf) 使用现有脚本并核对管理员保护恢复。普通改动不自动采用此例外。

任务worktree在已合并或最终提交已archive存档后回收；删除前核对进程、dirty/untracked/ignored数据及共享依赖，保留用户数据和必要证据。不额外等CI才清理已归档的本地副本；实际合并以GitHub回执为准。确需保留时写明路径和原因。

只有发布请求才转 [boai-release](../boai-release/SKILL.md)。日常开发和PR不自动升版、发布、重启个人应用或安装更新。本技能在当前Agent会话执行，不是常驻worker。
