---
name: boai-agent-dev-skills
description: BOAI Agent 项目的开发与交付统一入口。处理 dev/build、验证、打包安装、bumpp 升版本、tag/GitHub Release、git cp/cpf、worktree 管理及相关命令解释时使用，按当前源码核对命令和执行范围。
---
<!--
[INPUT]: 本次用户请求、AGENTS.md、package.json、dev/build/release脚本和实际Git/运行进程状态。
[OUTPUT]: 开发命令、安装包默认版本/HEAD与dist分布及.local边界；发布细则按需读取。
[POS]: BOAI项目开发技能统一入口，不是BOAI产品内的数字员工技能。
[PROTOCOL]: 命令或执行行为变化时同步本技能、references/commands.md及所属.folder.md；不将计划写成已实现。
-->
# BOAI Agent 开发与交付

## 每次先确认什么

先读本次用户指令与根目录 `AGENTS.md`，再读本技能。用户要求优先；问“怎么做”先解释，要求实施时完成对应工作。创建技能、解释命令或普通开发不会自动授权升版本、发布Release或替换已安装应用。

核对当前仓库、分支、改动、remote、worktrees及相关进程；交付前fetch并读取 `origin/main` 的最新流程。按需读取：

- [命令与操作说明](references/commands.md)：环境、启动、构建、验证、打包、升版、源码发布和安装。
- [Git/CI与worktree细则](../boai-dev-workflow/SKILL.md)：分支、PR、Magpie Test、DeepSeek UI preview、`git cp` / `git cpf`及回收。
- [本机发布细则](../boai-release/SKILL.md)：候选、正式安装包、Sparkle及安装版更新。
- [业务评估](../boai-evals/SKILL.md)：用户要求真实业务eval时读取，普通开发不自动开展模型评估。

## 按用户目标选入口

以下均从对应检出的仓库根目录执行；详细参数及前提见命令说明。

| 目标 | 当前入口 | 实际结果 |
| --- | --- | --- |
| 开发预览 | `pnpm dev` / `pnpm dev:electron` | 构建宿主后启动Vite和Electron开发窗口 |
| 设计系统预览 | `pnpm dev:design` | 启动独立设计文档站 |
| CLI开发 | `pnpm dev:cli` / `pnpm dev:cli:client` | 构建对应CLI范围并执行；无参数显示帮助 |
| 编译应用 | `pnpm build` | 默认构建Electron应用闭包，生成dist等编译产物 |
| 自用安装包 | `pnpm release:build` | 生成本机arm64 DMG和ZIP候选 |
| 升应用版本 | `pnpm release:version` / `pnpm release:version patch` | bumpp更新应用version及buildVersion |
| 正式安装包发布 | `pnpm release:local --publish` | 校验main/Test、构建、产物冒烟、签名更新资产、tag和GitHub Release |
| 仅源码tag/Release | 按命令说明用Git与`gh` | 发布对应提交的源码，安装包另行处理 |
| 提交/推送/合并 | 按本次 `git cp` / `git cpf` 请求 | 采用Git/CI细则，不由本技能扩大授权 |

## 环境与构建约束

以 `package.json.packageManager` / `engines` 和实际脚本为准。目前pnpm锁定 `10.13.1`，普通开发Node要求 `>=22.13.0`；`scripts/release-build.mjs` **另行硬编码macOS arm64及Node `v24.16.0`**。不能用普通开发Node要求推断安装包构建也能运行。执行前核对当前源码和环境，避免把本次机器版本写成永久偏好。

新worktree需要运行代码时使用独立依赖树：

```sh
pnpm install --frozen-lockfile --prefer-offline
```

同一pnpm store可以复用包内容；整个 `node_modules` / 虚拟依赖树不能软链接到main或其他worktree。纯文档任务不必安装依赖。

`pnpm dev` 是按需预览入口，不是固定日常运行方式。需要独立预览时使用本worktree的数据目录及独立端口，先确认现有进程，不接管或关闭他人的窗口。renderer热更新、主进程重新编译、当前进程重启和安装版更新分别核对。

## 产物与本地文件

`pnpm build`保持只编译，应用产物位于`dist/`。`pnpm package`、`pnpm dist:mac`的默认输出改为`dist/releases/`；`release:build`的DMG、ZIP、展开应用和打包暂存位于`dist/releases/candidates/<候选ID>/`，正式更新资产位于其`updates/`。安装包目录从应用打包清单和构建身份哈希排除，避免旧安装包进入新包体；实际应用字节仍完整核验。`dist/`已在`.gitignore`中，旧`release/`忽略项保留。

`.local/release-candidates/<候选ID>/`继续保存`candidate.json`、进程监督器、账本和日志，`release:smoke --candidate`仍传这个控制目录；新记录通过`artifactDirectory`定位dist安装包，旧候选沿原路径读取。`.local`还可能包含开发profile、研究原件及worktree归档，不能整目录当缓存删除。只清理已确认无进程使用、可重建且无需保留的具体产物；不要自动迁移或删除旧候选。清理`dist/releases`会删除对应新安装包，候选控制记录本身不能重建这些资产。

## 版本、tag、Release与安装包

版本源为根 `package.json.version` 与 `build.buildVersion`。项目已使用bumpp；内部workspace包保留各自版本。当前 `release:version` 封装明确关闭bumpp的commit/tag/push，只负责升版。版本提交合入main后，发布阶段再对最终提交创建tag和GitHub Release。

Git tag、GitHub Release和DMG/ZIP是不同产物。bumpp支持Git提交/tag/推送；本项目GitHub Release及安装包上传由现有Git/`gh`发布脚本处理。源码Release中的源码ZIP/tar.gz不能当作应用安装包。

`pnpm release:build`默认读取`package.json.version`和当前HEAD，无需手传参数；可用`--version X.Y.Z`、`--sha 完整SHA`单独或同时覆盖。自动取值后仍核对干净源码、版本/buildVersion及同一提交，显式错误值不会被默认值覆盖。构建不调用bumpp，不升版、提交、创建tag或发布。需要升版先用`release:version`，提交该版本后再构建。`release:local`会执行完整发布准备流程。

个人候选可从干净功能提交构建；正式发布要求当前远程main同SHA最新一次push触发的Test成功。PR成功、旧main成功和 `git cpf` 已合并都不能代替。已有同名tag/Release时先核对身份及资产，不移动tag、覆盖Release或盲目重发。

安装版更新依赖已发布且签名有效的更新资产；本地Git提交、`pnpm build`、源码tag或源码Release不会直接升级 `/Applications` 中的应用。

## 验证、交付与回收

用户明确“不检查测试”“不跑E2E”或“不抢焦点”时遵守本次范围；不要因为本技能列出了验证命令就自动执行。其他情况按修改选择对应检查；界面预览、工程检查、真实业务验收和个人安装使用分别报告。当前CI实际定义见 `.github/workflows/test.yml` 与 `ui-preview.yml`；保留的本机CI和旧截图基准工具不是默认启动项。

普通交付按Git/CI细则走PR；只有本次授权包含 `git cpf` 或跳过CI直接合并时，才使用其管理员例外并核对保护恢复。只暂存任务文件，使用 `git add -- <路径>`。

main只同步已实际合并的提交。任务结束按根规约回收worktree及本地任务分支：先核对提交可达、dirty/untracked/ignored文件、运行进程/CWD和共享依赖，迁出用户数据及原始证据。已合并或已提交并archive存档后再删除；不因“已合并”直接删除活跃目录。确需保留时报告具体路径和原因。

交付时明确改动、实际检查、PR/合并、包/Release/安装状态与worktree处理结果；没有执行的步骤不借历史成绩称为通过。

## 维护规则

命令真源为根 `package.json` 及其实际指向的 `scripts/`，配置真源为现行workflow和构建配置。讨论过的方案只有合入对应实现后才更新为可执行命令。改变dev/build/release行为时，在同一任务同步命令说明及涉及的专门技能；根 `AGENTS.md` 与README应继续指向本入口，让后续会话能够发现。
