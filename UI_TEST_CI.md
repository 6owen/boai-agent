<!-- [OUTPUT]: 当前 PR 和 release 的命令、检查范围与截图。 -->
# BOAI 开发与 CI

| 事件 | Agent / GitHub 执行 | 等待条件 |
| --- | --- | --- |
| 本地开发 | 在独立 worktree 改动，按实际风险选择模块或组件测试。纯样式查看 diff 和必要效果 | 提交本次文件 |
| 创建或更新 PR | Agent push 后创建 PR，后续 push 更新同一 PR。Test 执行 diff 检查，代码 PR 加 typecheck 和 lint | 合并门禁为 Required checks |
| UI PR 预览 | GitHub 自动构建该 PR 的 Electron，在隔离数据中运行一个 Playwright-BDD 场景，向 PR 正文写入一张 PNG | 异步。若先合并，仍向同一提交的 PR 补图 |
| 合并 main | GitHub 按分支保护合并 | main push 不重复启动 Test |
| 正式 release | 版本提交合入后，Agent 运行 `gh workflow run test.yml --ref main`。macOS 执行类型/lint、构建、角色包和全量 Vitest；全局 BDD 打开应用、确认主导航可见并截一张图 | 完整 Test 成功，全局截图失败单独报告，不做像素比较 |
| 发布 | Agent 从同一远程 main 提交的干净 worktree 运行 `pnpm release:local --publish`，打包、冒烟、签名、上传并核对 Release | 详见[发布技能](.agents/skills/boai-release/SKILL.md) |

普通 PR 和合并 main 不运行全量 Vitest。`ci:full` 标签不会扩大 PR 范围。云端截图无需模型、视频、基准图更新或用户点击 Run。固定三项行为仍可在需要时本地用 `pnpm test:ui:behavior` 验证。

## PR 截图目标

CI 根据变动路径选取页面。已登记的执行记录弹窗会自动打开并等待弹窗出现。共享样式默认展示应用主界面。若需求涉及更具体的状态，Agent 在初次创建 PR 的正文内加入一行定位说明；后续正常推送也会重新读取。例：

```html
<!-- boai-screenshot {"clicks": ["role=button[name=\"定时任务\"]", "role=button[name=\"定时任务选项\"]", "role=menuitem[name=\"执行记录\"]"], "visible": "role=dialog >> role=textbox[name=\"搜索执行记录\"]"} -->
```

`clicks` 是 Playwright 定位器序列，`visible` 是截图时必须出现的元素。目标打不开会显示失败。Agent 递交截图时核对实际图片。仅编辑 PR 正文不会触发录制，需要重截时由 Agent 运行 `gh workflow run ui-preview.yml --ref main -f pr=<编号>`。保存正文时保留自动预览区块。

## Git交付与回收

按本次授权创建/更新同一PR，普通交付设置自动合并并读回状态后报告，不默认轮询等待；本次明确要求验收CI改造时应核对新的真实运行。自动合并已启用不等于实际合并。只有已合并提交可以同步main，不复制功能worktree改动回main。

### 需要立即合并：git cpf

只有本次明确要求 `git cpf` 或跳过CI直接合并时，才使用现有入口。显式暂存本任务文件后执行 `git cpf`，缺alias时用 `node scripts/git-cpf.mjs "提交说明"`。普通开发不使用管理员例外；恢复/核对临时管理员保护，异常沿 `git cpf --restore-protection` 恢复。合并不等于测试通过或安装生效。

任务worktree在实际合并或最终提交已archive存档后回收；先核对进程、未提交/ignored数据及共享依赖，迁出证据。保留其他会话及个人应用数据。详细规则见[开发技能](.agents/skills/boai-dev-workflow/SKILL.md)，命令见[统一入口](.agents/skills/boai-agent-dev-skills/SKILL.md)。
