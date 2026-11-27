<!-- [OUTPUT]: 本地按 Git 变更选测、默认 PR 交付与自动合并、优先截图确认和完整发布检查。 -->
# BOAI 开发与 CI

| 事件 | Agent / GitHub 执行 | 等待条件 |
| --- | --- | --- |
| 本地开发 | 在独立 worktree 改动。需要 Vitest 时用 `pnpm test:changed` 跑改动关联的测试，按实际影响补测 | 提交本次文件 |
| 创建或更新 PR | Agent push 后创建或更新同一 PR，并对当前 head 开启自动合并。Test 执行 diff 检查，代码 PR 加 typecheck 和 lint | 合并门禁为 Required checks |
| UI PR 预览 | GitHub 自动构建该 PR 的 Electron，在同一 macOS job 运行两个隔离的 Playwright-BDD 场景。PR 正文展示改动页面和全局主界面各一张 PNG | 异步。若先合并，仍向同一提交的 PR 补图 |
| 合并 main | GitHub 按分支保护合并 | main push 不重复启动 Test |
| 正式 release | 版本提交合入后，Agent 运行 `gh workflow run test.yml --ref main`。macOS 执行类型/lint、构建、角色包和全量 Vitest；全局 BDD 打开应用、确认主导航可见并截一张图 | 完整 Test 成功，全局截图失败单独报告，不做像素比较 |
| 发布 | Agent 从同一远程 main 提交的干净 worktree 运行 `pnpm release:local --publish`，打包、冒烟、签名、上传并核对 Release | 详见[发布技能](.agents/skills/boai-release/SKILL.md) |

普通 PR 和合并 main 不运行全量 Vitest。`ci:full` 标签不会扩大 PR 范围。云端截图无需模型、视频、基准图更新或用户点击 Run。固定三项行为仍可在需要时本地用 `pnpm test:ui:behavior` 验证。

## 本地按变更选测

本地开发先用 `pnpm test:changed --list` 看测试范围，再用 `pnpm test:changed` 执行。默认 Git 基准是与 `origin/main` 的共同提交，计入分支提交、已暂存及工作区改动。可传目标引用覆盖默认值。静态依赖图查不到的 CSS、字符串源码合同和动态引用测试由开发 Agent 定向补选，空选测不计为测试通过。

## PR 截图目标

CI 从 PR 获取改动文件。资源库目录自动打开资源库，已识别的提示词、数据源、应用和助手文件会再进入对应分类，分类显示菜单文件会打开菜单。共享样式等没有页面归属的文件默认拍主界面。

开发 Agent 根据 PR diff 核实控件和界面状态，在 PR 正文加入 `boai-screenshot` 定位。入口、弹窗、抽屉或悬停样式需要定位到实际受影响的控件。在更新已有 UI PR 时应先更新定位再推送。下面的定位会打开资源库分类菜单并等「技能」选项出现。

```html
<!-- boai-screenshot {"clicks":["role=button[name=\"资源库\"]","role=button[name=\"显示资源库分类\"]"],"visible":"role=menuitemcheckbox[name=\"技能\"]"} -->
```

`clicks` 是打开目标的点击序列，`hover` 可指定点击之后需要悬停的元素，`visible` 指定截图时必须出现在窗口里的元素。截图覆盖应用窗口，每个 UI PR 各拍一张目标状态和全局主界面。目标无法打开或没有出现在窗口内时，预览报告失败。Agent 递交截图时核对实际图片。仅编辑 PR 正文不会触发截图，需要补拍时由 Agent 运行 `gh workflow run ui-preview.yml --ref main -f pr=<编号>`。保存正文时保留自动预览区块。

## Git交付与回收

完成开发和相关验证后，默认提交、推送、创建或更新 PR，并对当前 head 执行 `gh pr merge <PR> --auto --merge --match-head-commit <SHA>`。读回是否启用或已合并。用户明确要求先审阅、只开 PR 或暂不合并时，按本次范围交付。明确要求验收 CI 改造时，核对新的真实运行。

用户要求先看截图时，先截取当前改动的实际界面状态。将 PNG 保存到任务 worktree 外，核实图片并返回绝对路径，等用户确认后再推送或更新 PR。普通 UI PR 的云端截图随 PR 自动回填。

### 需要立即合并：git cpf

只有本次明确要求 `git cpf` 或跳过CI直接合并时，才使用现有入口。显式暂存本任务文件后执行 `git cpf`，缺alias时用 `node scripts/git-cpf.mjs "提交说明"`。普通开发不使用管理员例外；恢复/核对临时管理员保护，异常沿 `git cpf --restore-protection` 恢复。合并不等于测试通过或安装生效。

任务worktree在实际合并或最终提交已archive存档后回收；先核对进程、未提交/ignored数据及共享依赖，迁出证据。保留其他会话及个人应用数据。详细规则见[开发技能](.agents/skills/boai-dev-workflow/SKILL.md)，命令见[统一入口](.agents/skills/boai-agent-dev-skills/SKILL.md)。
