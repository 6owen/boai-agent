<!--
[INPUT]: 2026-11-18用户要求减少日常Vitest/UI开销及实际Actions审计。
[OUTPUT]: 普通PR仅类型/lint，main不复跑；完整测试、UI预览和发布验证显式按需。
[POS]: BOAI日常开发CI说明，执行规范归boai-dev-workflow。
[PROTOCOL]: 与test.yml、ui-preview.yml、test-ci-plan、release-check及共享技能同步。
-->
# BOAI 开发与 CI

日常开发的默认路径：独立worktree修改 → 按影响本地检查/审查 → PR类型和lint → 正常合并。main合并后不再启动重复Test。测试源码保留，完整验证不会在每个小改动上自动执行。

| 场景 | 实际执行 |
| --- | --- |
| 文档/Skill PR | 完整Git差异的格式检查，不安装产品依赖 |
| 普通代码PR，包括前后端、依赖、CI修改 | Linux安装依赖、typecheck、lint；不跑应用build、Vitest、Electron UI或录屏 |
| 本地开发验证 | Agent按修改选择相关组件/模块测试；真实交互变化才按需执行对应BDD；样式调整不默认新写形式化测试或整套E2E |
| main合并 | 不自动复跑Test |
| 明确要求完整检查 | 手动Test，或PR显式带ci:full；macOS上构建、固定三项UI、角色包及全量Vitest |
| 请求界面预览 | 添加ui-preview标签，或手动指定PR；生成截图和适用录屏并更新PR |
| 正式发布 | 显式运行当前main同SHA的手动完整Test，发布脚本核对最新结果 |

`Required checks`继续汇总Test，失败/取消不会放行。普通PR绿色只表示类型/lint通过，不表示产品或UI全量通过。相关本地检查及未验范围写入PR；重要行为变化在本地验证，不能用轻量CI替代。

## 本地检查和审查

按实际diff选范围，已有相关测试直接复用，例如 `pnpm exec vitest run tests/目标.test.ts`。依赖dist的测试先准备对应构建。不要为了几个间距改动默认完整build、全量Vitest、桌面E2E或真实模型调用。

需要视觉核对时看受影响状态并实际查看截图；动画/连续交互再按需录屏。没有图就不声称看过效果。BDD沿现有features/steps/support，先列场景再定向执行，不手改生成文件或另建平行桌面测试入口。本次“不测试”“不跑E2E”“不抢焦点”要求优先。

明确缺陷直接修复，质量审查失败最多自动修复两轮，仍失败或需求不清才交人工裁决。正常通过不追加例行人工批准。

## 显式完整检查

```sh
gh workflow run test.yml --ref main
# 也可指定需要完整检查的功能分支
```

手动Test始终完整，没有轻量输入。PR加 `ci:full` 后，下一次push运行完整检查；添加标签本身不启动Test。普通小改动不自动加标签或手动运行完整检查。

正式发布只接受远程main当前SHA、最新一次 `workflow_dispatch` Test成功，仍需干净源码和版本一致。PR成功、旧push成功、旧main成功均不替代；失败/在途/重新尝试按最新状态核验。日常开发不触发这一流程。

## 按需截图和录屏

```sh
gh pr edit <PR编号> --add-label ui-preview
# 或手动运行，无需先添加标签
gh workflow run ui-preview.yml --ref main -f pr=<PR编号>
```

标签保留时新提交继续更新预览；移除标签停止后续录制，有旧预览时轻量检测清除过期结果。没有标签、没有旧预览的普通PR不启动录制job。手动请求可以预览非UI路径改动。

录制仍沿DeepSeek规划/真实Electron/截图和适用录屏。报告核对source SHA和当前PR，明确完整/部分/失败；录制完成不证明视觉质量。编辑PR正文保留自动区块。预览不是合并门禁。

## 耗时依据与验证边界

2026-11-18审计确认：[#158前端PR](https://github.com/6owen/boai-agent/actions/runs/44054923109)实际Test 5分45秒，相关Vitest步骤25秒，但启动前等了5分05秒；[合并main](https://github.com/6owen/boai-agent/actions/runs/44056599121)又跑19分58秒，其中434文件的全量Vitest15分25秒。旧规则非PR一律full，因此前次只优化PR仍留下20分钟的main运行。

本次移除main触发及日常应用构建/Vitest/UI，日常PR使用Linux；完整检查继续macOS。GitHub排队仍取决于实际资源，不能承诺所有提交固定耗时。云端新结果以对应PR和SHA为准。

## Git交付与回收

按本次授权创建/更新同一PR，普通交付设置自动合并并读回状态后报告，不默认轮询等待；本次明确要求验收CI改造时应核对新的真实运行。自动合并已启用不等于实际合并。只有已合并提交可以同步main，不复制功能worktree改动回main。

### 需要立即合并：git cpf

只有本次明确要求 `git cpf` 或跳过CI直接合并时，才使用现有入口。显式暂存本任务文件后执行 `git cpf`，缺alias时用 `node scripts/git-cpf.mjs "提交说明"`。普通开发不使用管理员例外；恢复/核对临时管理员保护，异常沿 `git cpf --restore-protection` 恢复。合并不等于测试通过或安装生效。

任务worktree在实际合并或最终提交已archive存档后回收；先核对进程、未提交/ignored数据及共享依赖，迁出证据。保留其他会话及个人应用数据。详细规则见[开发技能](.agents/skills/boai-dev-workflow/SKILL.md)，命令见[统一入口](.agents/skills/boai-agent-dev-skills/SKILL.md)。
