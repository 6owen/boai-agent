<!--
[OUTPUT]: 2026-11-17按PR差异分documentation/frontend/full，前端采用相关Vitest，main保留全量；普通交付不等待CI。
[OUTPUT]: 2026-11-13 Test接固定三项UI行为；录制完成度、源码SHA和当前PR核对，部分媒体保持失败。
[OUTPUT]: 2026-11-10新增boai-agent-dev-skills统一入口，梳理实际dev/build/验证/打包/bumpp/tag/Release/Git/worktree命令；无参数release:build仍属未实现方案。
[OUTPUT]: 2026-10-29提供git cpf显式快速合并、暂存范围、管理员保护恢复与中断恢复说明。
[INPUT]: BOAI共享开发skill、GitHub Test/UI preview工作流及任务worktree收尾规则。
[OUTPUT]: 日常开发、PR检查、原生视频附件配置、合并与清理的使用说明。
[POS]: 仓库根目录面向使用者的CI说明；执行依据为AGENTS、开发skill及实际workflow。
[PROTOCOL]: 流程变化时同步开发skill、第22组06、本文件与根目录.folder.md。
-->
# UI 测试与 CI 用法

BOAI 沿 Magpie 使用两条 GitHub Actions：**Test 检查工程和固定 UI 行为，UI preview 展示本次界面改动及录制完成度**。开发 Agent 先读 [开发与构建统一技能](.agents/skills/boai-agent-dev-skills/SKILL.md)，Git/CI细则见 [开发交付技能](.agents/skills/boai-dev-workflow/SKILL.md)，这里说明日常怎么用。

## 日常开发怎么走

1. **独立worktree开发，按实际改动验证。** 小样式修改做相关lint、必要类型检查/组件回归和定向效果核对，不默认在本地完整build、跑全量Vitest或Electron E2E。交互变化再补对应BDD；后端/协议变化按风险扩大。
2. **审查通过后创建或更新同一PR。** 结合需求、diff和实际结果；需要视觉核对时查看受影响状态，不新建无关录屏任务。产品与相应测试一起提交。失败后的自动修复最多两轮，仍有问题或需求不明才由用户裁决；无例行人工批准门槛。
3. **GitHub自动选择Test范围。** 文档仅做差异检查；纯前端执行工程检查、固定三项UI行为和相关Vitest；后端、共享协议、依赖、构建/CI等混合改动执行全量。UI preview继续独立异步录制。
4. **普通交付不等待CI。** 按本次授权推送、设置自动合并并读回一次PR状态，报告链接、已做检查和当前状态；随后可以继续开发。只有用户要求等通过/等合并或处理失败时，Agent才持续跟进。自动合并已启用不等于实际已合并。
5. **实际合并后同步main。** main继续完整Test，普通开发无需等待这次后台复跑。发布安装包仍须核对同SHA main push的完整结果。worktree按已合并或最终提交已归档的规则回收。

## 为什么之前要等二十分钟

2026-11-17读取的实际Actions步骤如下，时间为 `Test (macOS)` job，不含额外排队：

| PR | Test job | 其中全量Vitest | 固定UI行为 |
| --- | --- | --- | --- |
| [#156 弹窗样式](https://github.com/6owen/boai-agent/actions/runs/44037234615) | 17分05秒 | 13分24秒 | 1分22秒 |
| [#153 工具栏样式](https://github.com/6owen/boai-agent/actions/runs/44007840679) | 18分40秒 | 14分50秒 | 1分18秒 |
| [#152 语音/侧栏](https://github.com/6owen/boai-agent/actions/runs/43998943743) | 21分48秒 | 15分47秒 | 1分18秒 |

#156全量执行433个Vitest文件，5700项通过、142项原跳过；安装依赖约24秒、构建39秒。主要等待来自无条件全库回归。新方案减少前端PR的无关测试；不承诺未经云端实测的固定分钟数，也不通过关闭分支保护缩短等待。

本次本地核对：用#156的base和源码，Vitest依赖图选出`automation-dialog`与`automation-history-refresh`两个测试文件。分流/预览/这两个组件、原CI和发布资格共6个文件143项定向回归通过；类型/工作区检查、Skill校验和diff检查通过。原CI合同初次因写死旧命令序列失败，已同步新分流入口及文档模式的产物条件，工程/UI顺序和失败门禁断言保持。未启动本地Electron，尚无新路径的云端耗时成绩。

## Test如何自动分流

[`scripts/test-ci-plan.mjs`](scripts/test-ci-plan.mjs)在安装依赖前读取PR base与当前合并检出的完整Git差异，不使用会截断路径的API列表。后端文件移入前端目录的rename按删除加新增处理，仍识别后端影响。

| 范围 | 条件 | 实际检查 |
| --- | --- | --- |
| documentation | 只有开发Markdown、目录说明、指定文档入口或ai-docs图表/图片 | `git diff --check`；不安装产品依赖、不构建或运行产品测试 |
| frontend | 只改renderer、共享UI/tokens源码、explorer UI，以及配套文档/已识别前端测试 | typecheck、lint、build、固定三项BDD、相关Vitest；没有改动的角色包协议测试由full覆盖 |
| full | 混入后端、共享协议、依赖、构建、CI/测试选择器、未知路径，或强制完整 | 原完整工程、固定三项BDD、角色包协议及全量Vitest |

main push和手动Test始终full；PR带 `ci:full` 标签时在下一次PR触发执行full，单独添加标签不会立即启动Test，需要push或手动运行。无有效范围或选择器失败不能作为轻量成功。

前端Vitest先用官方 `vitest list --changed <base> --filesOnly --json` 取得静态依赖关联，再补选读取受影响源码的合同测试和本次修改的测试。全局CSS或共享UI扩大到已识别的前端回归集合。无关联时回退前端集合，仍为空就失败，不使用 `--passWithNoTests` 放行。未改变的后端全量回归在main/full执行；前端绿色不能称作全产品验证。

选场和源码身份保存在 `.local/test-ci/plan.json`，上传为 `test-scope` artifact。相关测试失败仍使 `Test` 和 `Required checks` 失败，保护名称与严格模式保持。UI preview不加入这个门禁。

## 需要立即合并：git cpf

本机每个clone安装一次，安装在该仓库的Git配置/公共Git目录，所有worktree共用，不修改全局alias：

```bash
node scripts/git-cpf.mjs --install
git add -- path/to/file1 path/to/file2
git cpf "fix: 修复说明"
```

已经commit的内容直接执行 `git cpf`。命令提交已暂存文件，推送当前功能分支（在main上则推到`cpf/<提交号>`），创建或复用PR，并按精确head立即合并到main。它不等待CI，也不先同步main到PR来触发一轮重复检查；未暂存文件保持原样。普通`git cp`及默认自动合并流程保持。

需要`git`、Node和已登录的`gh`，账号须有仓库管理员权限。若GitHub对管理员也强制检查，命令只临时关闭`enforce_admins`，合并成功、失败或可捕获中断后恢复并核对；其他保护不变。真实合并冲突、GitHub Ruleset等额外限制仍可拒绝合并，不通过删规则或改写main历史绕过。

网络故障、断电或`kill -9`可能让自动恢复未完成，恢复记录保留在Git公共目录的`boai/cpf-protection.json`。恢复时执行：

```bash
git cpf --restore-protection
```

恢复失败会明确报错并阻止下一次合并。命令不会关闭Actions或伪造绿色检查；PR/main仍可能后台跑检查。直接合并不代表测试通过，也不自动发布、重启应用或部署。

```mermaid
flowchart LR
  A[worktree 开发与定向验证] --> B[提交或更新 PR]
  B --> C[Test 按文档 前端 完整范围检查]
  B --> D[UI preview 检测改动]
  D -->|涉及 UI| E[截图与录屏更新到 PR]
  D -->|没有 UI 改动| F[跳过录制]
  C -->|通过| G[Required checks 通过]
  G --> H[满足保护与授权后合并]
  H --> I[main 再跑 Test]
```

## GitHub 上会跑什么

| 流程 | 执行内容 | 触发与合并关系 |
| --- | --- | --- |
| **Test** | 先分范围；frontend/full运行类型、lint、构建、固定UI行为；frontend运行相关Vitest，full运行完整Vitest及角色包测试 | PR自动分流；main push/手动始终完整。所选检查失败使 `Required checks` 失败 |
| **UI preview** | `detect` 检测 → `record` 构建真实 Electron 应用并截图录屏 → `publish` 更新 PR 描述中的预览区域 | PR 打开、更新、重开或添加 `ui-preview` 标签时触发，也可手动指定 PR；当前不属于必须通过的合并检查 |

纯文档PR走documentation，后端PR走full；未命中UI路径时，UI preview的 `record`、`publish` 显示 `skipped` 属于正常结果。UI 路径检测覆盖 renderer、共享 UI/tokens、官方文件浏览器组件/样式、图标及相关构建配置；必要时用 `ui-preview` 标签强制录制。

同一 PR 的新提交会取消尚未结束的旧 Test/UI preview，改跑最新提交。main 的 Test 不因后续 main 提交自动取消。

## 固定 UI 行为验证

`Test` 通过原 Electron BDD 验证三项真实行为：会话草稿在页面/会话往返后保持隔离、明暗设置经 UI 保存并在重启后保持、工具开始页切换任务/知识资料且原聊天草稿保留。使用隔离数据和原离线夹具，零外部模型调用。

`pnpm build` 后可执行 `pnpm test:ui:behavior`；这条命令会启动 Electron。Agent 本机检查仍遵守本次 E2E/焦点约束。只需检查选场时运行 `pnpm test:bddgen` 和 `pnpm exec playwright test --grep @ui-behavior --list`，不会启动窗口。

`.local/ui-behavior/` 保存原始 `playwright.json`、`summary.json`、截图和 trace；云端上传为 `ui-behavior` artifact。固定三项缺失、重复、跳过、重试、全局错误和进程非零退出均失败。截图仅留证，不进行 PNG 比较。新功能的专门验收继续按修改补充，不把这三项当作全产品覆盖。

## PR 录制结果

预览固定区块显示源码提交及“完整／部分完成／失败／无需录制”和实际完成场景数。只有全部计划场景和步骤成功、截图存在，才标录制完整；任何未完成操作会使录制失败，已有媒体保留供定位。录制完整不代表需求全部通过，功能断言仍看 Test。

发布前核对报告的完整 source SHA，并在写 PR 前再次核对当前 head 和开放状态。旧提交或已关闭 PR 不再更新正文；当前提交不再含 UI 改动时清除旧预览。媒体按开放 PR 的提交保留，避免旧发布覆盖新正文或删掉新正文引用的图片；关闭 PR 的媒体在后续发布清理。

## 修改 UI 时要更新基准吗

**日常 PR 不需要更新截图基准。** 正常修改界面后提交，UI preview 直接生成该 PR 当前界面的截图和视频；旧的 candidate、accept、update 与固定 PNG 差异门禁已经退出自动 CI。

旧本地 UI 测试源码、PNG 和辅助工具仍可按需使用。它们的存在不表示 PR 还需要走旧基准更新流程，也不要为了通过 CI 把有意修改的界面改回旧图。

## DeepSeek 在这里做什么

- 读取 PR 的 diff、标题、描述、相关源码和真实页面的 DOM 文本，规划打开哪些页面、执行哪些操作、在哪里截图。
- 操作失败时根据现场信息尝试修正，并把操作错误保留在预览记录中。
- 对 PR 描述与代码不一致的情况给出提示；提示会出现在预览说明中。

**当前没有“DeepSeek 判断界面好看、没有多改，才允许合并”的门禁。** 它没有读取截图进行审美评分；描述与代码不符的提示也不阻止合并。效果核对由开发Agent结合实际改动及必要截图完成，测试通过本身不能证明界面质量。自动合并目前也不等待 UI preview 完成或成功。

预览脚本另有已知密钥的文本泄漏检查；命中后拒绝发布本次媒体。这是脚本检查，与 DeepSeek 的页面操作规划分开。

## 哪里看结果，失败时怎么处理

打开 [仓库 Actions](https://github.com/6owen/boai-agent/actions)，或在 PR 的 Checks 看当前提交的运行；截图、视频和操作说明看 PR 描述中的 UI preview 区域。

| 看到的状态 | 应该怎么理解、怎么处理 |
| --- | --- |
| Test / Required checks 失败 | 打开第一处失败步骤，按错误定位并修复，再提交同一 PR；先看原因，不盲目重跑 |
| UI preview 检测通过、录制跳过 | 通常是没有 UI 改动；按需加 `ui-preview` 标签 |
| UI preview 部分完成、录制或发布失败 | 查看完成场景数、错误及原件；已有媒体保留供定位，录制/发布返回失败；该工作流仍不单独阻止合并 |
| 旧运行 cancelled，新运行进行中 | 同一 PR 的新提交已接替旧运行，查看最新 SHA 对应结果 |
| 自动合并已启用 | 表示等待条件满足，尚不等于已合并；以 PR 的 `MERGED` 和合并提交为准 |
| PR 通过后 main 又出现 Test | 合并后的主分支复跑；不能用 PR 的绿色替代这次运行的结果 |

`setup-node` 的步骤耗时包含 pnpm 缓存恢复，不全是安装 Node。总耗时还包括依赖安装、构建和全量测试，应按 Actions 的各步骤计时定位。

## DeepSeek 配置放哪里

云端读取 GitHub 仓库的 **`ui-preview` environment**：

| 类型 | 名称 | 用途 |
| --- | --- | --- |
| Secret | `DEEPSEEK_API_KEY` | 模型调用密钥 |
| Variable | `DEEPSEEK_BASE_URL` | API 地址；未设置时使用 workflow 中的默认值 |
| Variable | `PLAN_MODEL` | 规划模型；当前默认 `deepseek-flash` |

本机 `.env.ui-preview` 用于本地配置，保持 Git 忽略，不能提交密钥。GitHub 不会自动读取本机文件；需要使用云端 environment 中的配置。录制任务运行 PR 代码并使用模型密钥；发布任务拥有写权限，但不运行 PR 代码，沿 Magpie 分离。

## PR 视频在线播放

录屏以 GitHub 视频附件独立显示在 PR 描述中，可直接播放、暂停和拖动；原始 mp4 下载仍保留。截图继续由 `ui-previews` 分支提供，不需要启用 Pages。

在单独的 **`ui-preview-publish` environment** 配置 **`UI_PREVIEW_UPLOAD_TOKEN`**，使用能向本仓库上传附件的专用 OAuth/PAT 凭据。GitHub 当前不允许 Actions 默认令牌上传视频附件；不要把上传凭据放进运行 PR 代码的 `ui-preview` 环境或仓库级 secret。发布任务固定 GitHub CLI 版本并核对下载校验和。

凭据缺失、视频超出 GitHub 附件大小限制或上传失败时，发布步骤失败，PR 显示警告、已有截图与下载链接，不会显示假的播放入口。只有截图时不需要上传令牌。新流程合入 main 后才用于自动 PR 预览；配置完成与实际云端上传通过分开核验。

## 任务完成后的 worktree 收尾

按 [AGENTS.md](AGENTS.md) 的“worktree 不遗留”规则，包含 subagent 派生的 `.claude/worktrees/agent-*`：

- 已实际合并：确认最终提交已合入 main，再删除任务 worktree 和本地任务分支。
- 尚未合并或不合并：先提交本任务需要保留的改动，打 `archive/<worktree名>` 标签并核对最终提交，再删除 worktree 和本地分支。同名归档加唯一后缀，不覆盖旧档；等待自动合并的 PR 可保留远程分支继续检查。
- 已核实专用的 cargo target 一并删除；共享 target、pnpm store 和共享符号链接目标保留。tag 不保存未提交或 ignored 数据，需要保留的数据先迁出，密钥不入 Git。
- 删除前确认本任务进程已退出、工作目录已移出；编排会话负责子 worktree。待裁决、有冲突等确需保留的目录，最终回复必须写明路径和原因。

## 维护入口

- [开发 skill](.agents/skills/boai-dev-workflow/SKILL.md)：所有开发 Agent 共用的执行规则。
- [Test workflow](.github/workflows/test.yml) / [UI preview workflow](.github/workflows/ui-preview.yml)：实际触发和执行配置。
- [UI preview 源码说明](.github/ui-preview/README.md)：Magpie 来源、必要适配与本地命令。
- [第22组06](ai-docs/spec/22.开发自动化与持续测试/06-UI回归基准与PR门禁.md)：现行流程合同；[第22组03](ai-docs/spec/22.开发自动化与持续测试/03-实施步骤与验收.md)记录历史执行、失败与验证结果。
