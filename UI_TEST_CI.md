<!--
[INPUT]: 2026-11-18用户要求减少日常Vitest/UI开销及实际Actions审计。
[OUTPUT]: 普通PR轻量Test；UI PR自动截图/适用录屏写回正文，合并后继续补发；main不复跑全量。
[POS]: BOAI日常开发CI说明，执行规范归boai-dev-workflow。
[PROTOCOL]: 与test.yml、ui-preview.yml、test-ci-plan、release-check及共享技能同步。
-->
# BOAI 开发与 CI

日常开发的默认路径：独立worktree修改 → 按影响本地检查/审查 → Agent创建PR → **轻量Test与自动UI预览并行** → 截图及适用录屏写回PR正文。main合并后不再启动重复Test。整个流程不需要用户点击Run或添加标签。

| 场景 | 实际执行 |
| --- | --- |
| 文档/Skill PR | 完整Git差异的格式检查，不安装产品依赖 |
| 普通代码PR的Test，包括前后端、依赖、CI修改 | Linux安装依赖、typecheck、lint；此job不跑应用build、Vitest或Electron UI |
| UI PR创建、重新打开、推送新提交 | 自动启动独立UI preview，构建界面并截图；交互需要时录屏，结果自动更新PR |
| 纯后端/文档PR的UI preview | 轻量检测后跳过录制；不构建预览 |
| 本地开发验证 | Agent按修改选择相关组件/模块测试；真实交互变化才按需执行对应BDD；样式调整不默认新写形式化测试或整套E2E |
| main合并 | 不自动复跑Test |
| 需求需要完整检查 | Agent命令触发Test，或PR显式带ci:full；macOS上构建、固定三项UI、角色包及全量Vitest |
| 正式发布 | Agent命令触发当前main同SHA的完整Test，发布脚本核对最新结果 |

`Required checks`继续汇总Test，失败/取消不会放行。普通PR绿色只表示类型/lint通过，不表示产品或UI全量通过。相关本地检查及未验范围写入PR；重要行为变化在本地验证，不能用轻量CI替代。

## 本地检查和审查

按实际diff选范围，已有相关测试直接复用，例如 `pnpm exec vitest run tests/目标.test.ts`。依赖dist的测试先准备对应构建。不要为了几个间距改动默认完整build、全量Vitest、桌面E2E或真实模型调用。

需要视觉核对时看受影响状态并实际查看截图；动画/连续交互再按需录屏。没有图就不声称看过效果。BDD沿现有features/steps/support，先列场景再定向执行，不手改生成文件或另建平行桌面测试入口。本次“不测试”“不跑E2E”“不抢焦点”要求优先。

明确缺陷直接修复，质量审查失败最多自动修复两轮，仍失败或需求不清才交人工裁决。正常通过不追加例行人工批准。

## 按需完整检查，由Agent执行

这不是要求用户去Actions页面点击Run。需要完整验证时，Agent执行：

```sh
gh workflow run test.yml --ref main
# 也可指定需要完整检查的功能分支
```

命令触发的Test（事件名 `workflow_dispatch`）始终完整，没有轻量输入。PR加 `ci:full` 后，下一次push运行完整检查；添加标签本身不启动Test。普通小改动不调用完整入口。

正式发布只接受远程main当前SHA、最新一次 `workflow_dispatch` Test成功，仍需干净源码和版本一致。PR成功、旧push成功、旧main成功均不替代；失败/在途/重新尝试按最新状态核验。日常开发不触发这一流程。

## PR自动截图和录屏

创建或更新UI PR就自动运行 `detect → record → publish`，不依赖标签。录制沿DeepSeek规划、真实Electron和隔离数据，截图必需，连续交互才生成录屏。为了运行界面，预览job仍需一次应用构建，但不跑全量Vitest或固定BDD。纯后端/文档改动跳过录制。

PR刚创建时先显示“正在录制”，完成后自动替换为实际图片和视频；云端生成需要时间，并非创建瞬间已有图片。预览与快速Test并行，PR若先合并，同一head的预览仍会补到正文，后续PR也不会自动删除已有媒体。

Agent负责核对自动触发。若文件路径检测遗漏了可见改动，Agent用以下命令补触发，无需用户操作：

```sh
gh workflow run ui-preview.yml --ref main -f pr=<PR编号>
```

`ui-preview`标签仍可强制预览非UI路径，它不是日常流程的必要步骤。移除标签不会停止UI diff的自动录制。当前diff不再涉及UI时会替换旧预览，避免把上次图片当成当前结果。

报告核对source SHA和当前PR，明确完整/部分/失败；失败会写回PR，录制完成不证明视觉质量。编辑PR正文保留自动区块。预览不是合并门禁，也不比较旧PNG基准。

## 耗时依据与验证边界

2026-11-18审计确认：[#158前端PR](https://github.com/6owen/boai-agent/actions/runs/44054923109)实际Test 5分45秒，相关Vitest步骤25秒，但启动前等了5分05秒；[合并main](https://github.com/6owen/boai-agent/actions/runs/44056599121)又跑19分58秒，其中434文件的全量Vitest15分25秒。旧规则非PR一律full，因此前次只优化PR仍留下20分钟的main运行。

Test移除main触发及日常应用构建/Vitest/固定UI，日常PR使用Linux；完整检查继续macOS。UI预览保留独立构建与录制。GitHub排队仍取决于实际资源，不能承诺所有提交固定耗时。云端新结果以对应PR和SHA为准。

## Git交付与回收

按本次授权创建/更新同一PR，普通交付设置自动合并并读回状态后报告，不默认轮询等待；本次明确要求验收CI改造时应核对新的真实运行。自动合并已启用不等于实际合并。只有已合并提交可以同步main，不复制功能worktree改动回main。

### 需要立即合并：git cpf

只有本次明确要求 `git cpf` 或跳过CI直接合并时，才使用现有入口。显式暂存本任务文件后执行 `git cpf`，缺alias时用 `node scripts/git-cpf.mjs "提交说明"`。普通开发不使用管理员例外；恢复/核对临时管理员保护，异常沿 `git cpf --restore-protection` 恢复。合并不等于测试通过或安装生效。

任务worktree在实际合并或最终提交已archive存档后回收；先核对进程、未提交/ignored数据及共享依赖，迁出证据。保留其他会话及个人应用数据。详细规则见[开发技能](.agents/skills/boai-dev-workflow/SKILL.md)，命令见[统一入口](.agents/skills/boai-agent-dev-skills/SKILL.md)。
