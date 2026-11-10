<!--
[INPUT]: 根package.json、scripts/dev*.mjs、build*.mjs、release*.mjs、Git脚本及现行workflow。
[OUTPUT]: 当前命令、默认参数与dist/.local分布；Node沿engines，下载失败可续传/重试。
[POS]: boai-agent-dev-skills的命令参考；仅供开发Agent，不随应用绑定给员工。
[PROTOCOL]: 实现变化时同步本文、SKILL.md及涉及的开发/发布技能和.folder.md。
-->
# BOAI命令与流程

本文从对应worktree的仓库根目录使用。先判断用户要解释、开发、验证、自用包、源码发布、正式发包还是安装，不把一种请求扩大成另一种动作。

## 1. 环境和依赖

| 内容 | 当前实现与核对位置 |
| --- | --- |
| 包管理器 | `package.json.packageManager`：`pnpm@10.13.1` |
| 普通Node要求 | `package.json.engines.node`：`>=22.13.0`；当前GitHub Test使用Node 22 |
| 自用安装包要求 | macOS arm64；Node沿`package.json.engines`（`>=22.13.0`），不另锁版本 |
| 原生编译 | Mac宿主助手用 `swiftc`，进程guard用Cargo；见 `scripts/build-app-icon.mjs`、`build-desktop-activity.mjs`、`build-process-guard.mjs` |
| 依赖安装 | `pnpm install --frozen-lockfile --prefer-offline`；独立node_modules，共用pnpm store |

用 `node --version`、`pnpm --version` 及当前Node的 `process.platform` / `process.arch` 核对实际环境。需要切换Node时使用机器已有的版本管理方式，不假定nvm/fnm一定安装。不要为解释命令执行依赖升级、全局Node切换或原生编译。

## 2. 开发和运行

| 命令 | 行为 |
| --- | --- |
| `pnpm dev` / `pnpm dev:electron` | `scripts/dev.mjs`先buildHost，再启动Vite和Electron；不生成安装包 |
| `pnpm dev:design` | 构建设计基础包并启动独立设计文档站，不启动Electron |
| `pnpm dev:cli` | 构建完整CLI范围后执行CLI；无参数显示帮助 |
| `pnpm dev:cli:client` | 只构建CLI客户端后执行；参数继续传入原CLI |
| `pnpm cli --help` | 运行已有 `dist/cli/index.mjs`，本命令本身不构建 |
| `pnpm start` | Electron加载已有编译应用；本命令本身不构建或启动Vite |

用户要求独立预览时，先确认没有占用目标worktree的进程，再运行：

```sh
BOAI_DATA_DIR="$PWD/.local/dev-profile" BOAI_DEV_PORT=0 pnpm dev
```

`BOAI_DEV_PORT=0`由系统分配端口；未设置时默认开发端口5187。记录控制台实际URL和数据目录。不要抢占已有端口、关闭别的预览或把 `.local` 中的用户数据当缓存删除。

renderer由Vite处理热更新；`dev.mjs`在启动时构建宿主，没有主进程源码watch重编译循环。main/preload/worker及原生助手修改需要重新构建并重启对应开发进程。主进程重启、页面刷新、编译身份和已安装版本的实际生效分别核对，不为小改动自动重启个人应用。

## 3. 编译产物

| 命令 | 范围与产物 |
| --- | --- |
| `pnpm build` / `pnpm build:electron` | 默认Electron应用闭包，含宿主、renderer及运行所需分发文件；主要产物在dist |
| `pnpm build:cli` | CLI客户端及运行时闭包 |
| `pnpm build:cli:client` | CLI客户端闭包 |
| `pnpm build:design-packages` | 设计基础包分发 |
| `pnpm build:design` | 独立设计文档站 |
| `pnpm package` | 普通electron-builder目录包，输出dist/releases；不是现行带更新源的发布入口 |
| `pnpm dist:mac` | 普通electron-builder DMG，输出dist/releases目录；不注入现行Sparkle更新源 |

编译不会生成应用安装动作，也不自动替换 `/Applications/BoAI Agent.app`。需要自用DMG/ZIP时走下一节的release候选入口；普通dist:mac不能代替含更新器的候选/发布合同。

## 4. 验证和CI

| 命令 | 用途 |
| --- | --- |
| `pnpm typecheck` | workspace边界、设计包准备和TypeScript检查 |
| `pnpm lint:ui` | 现有UI ESLint范围及typography检查 |
| `pnpm test tests/<目标文件>.test.ts` | 先准备设计包，再让Vitest过滤对应测试文件 |
| `pnpm test` | 完整Vitest，不默认用于每次小修改 |
| `pnpm check:workspace` | workspace依赖边界检查 |
| `pnpm test:electron` | 构建、生成BDD、运行Playwright桌面场景；按用户明确范围执行 |
| `pnpm test:electron:list` | 生成并列出桌面场景；不代表场景已运行 |
| `pnpm test:ui` / `pnpm test:ui:candidate` / `pnpm test:ui:accept` | 保留的本地截图检查/候选/接受工具，不是当前PR基准门禁；不自行晋升基准 |
| `pnpm ci:local` / `pnpm ci:watch` | 保留的本机CI工具，当前不作为默认执行或常驻流程 |

遵守本次用户对检查、测试、E2E和焦点的要求。只写文档不启动应用、真实模型或完整产品测试。当前云端 `Test` 会安装依赖并依次typecheck、lint、build、test；CLI相关测试依赖dist，所以构建顺序必须保持。`UI preview`按路径决定是否录制，不是业务验收或审美门禁。完整规则见 [UI_TEST_CI.md](../../../../UI_TEST_CI.md)。

## 5. 自用安装包

构建器要求干净检出、稳定版本X.Y.Z、与HEAD一致的完整40位SHA；根version/buildVersion必须一致。默认自动读取`package.json.version`与当前HEAD，直接执行：

```sh
pnpm release:build
```

需要明确声明候选身份时仍支持可选参数，可单独或同时传入：

```sh
pnpm release:build --version X.Y.Z --sha 完整提交SHA
```

省略的参数使用当前版本/HEAD；显式传入的参数仍必须与当前检出一致，不会静默纠正。构建不会调用bumpp、升版本或切换Git提交。要升版先运行`pnpm release:version patch`（或minor/major/明确版本），提交版本修改后再构建；未提交的升版仍会因源码不干净被拒绝。

首次构建机需要 `pnpm release:setup` 准备Sparkle配置；已有配置复用。配置位于 `~/Library/Application Support/BoAI Release/settings.json`，签名私钥在macOS钥匙串，不输出或复制进仓库。收到钥匙串授权提示时由用户处理，不能把超时当成功。

成功会同时输出安装包位置和候选控制目录；现有命令及参数保持：

```text
dist/releases/candidates/<候选ID>/
  assets/BoAI-Agent-X.Y.Z-macos-arm64.dmg
  assets/BoAI-Agent-X.Y.Z-macos-arm64.zip
  assets/mac-arm64/BoAI Agent.app
  electron-dist/              # 打包暂存
  updates/                    # release:local准备的签名更新资产
  previous/                   # 正式流程下载的上一版ZIP
.local/release-candidates/<候选ID>/
  candidate.json              # artifactDirectory记录上面的产物位置
  process-guard               # 进程监督器、账本与日志继续留在.local
```

`dist/`（含安装包）已加入`.gitignore`；旧`release/`忽略规则继续保留。新Electron下载缓存位于`dist/releases/cache/electron/`。`pnpm build`仍只编译，不生成DMG/ZIP；安装包由原打包命令生成。构建身份与打包文件清单均排除顶层`dist/releases/`，其余应用文件保持校验。旧候选缺少`artifactDirectory`时继续使用原`.local/.../assets`及`updates`，不自动搬移旧文件。

Electron完整ZIP按依赖自带SHA256核验后进入缓存；下载失败的`.part`保存在`dist/releases/cache/electron/partial/<SHA256>.part`，同次重试及再次运行`release:build`均可断点续传。没有原先300秒整段下载上限；连接超时或连续60秒低于1KB/s时重试，最多三次。服务端不支持Range时重新下载，校验失败的完整数据丢弃；取消会停止curl并保留断点。删除这个缓存会使下次构建重新下载。

`.local`不能整目录删除：可能有用户开发profile、研究原件、worktree归档和仍需恢复的进程账本。只按实际内容清理已确认可再生成、无活跃进程且不需保留的文件。删除`dist/releases`会使依赖这些资产的新候选无法继续冒烟或发布；`.local`里的记录并不是安装包备份。

候选构建包含源码/架构/签名及文件身份核对，不等同真实桌面使用。用户授权产物冒烟时执行 `pnpm release:smoke --candidate .local/release-candidates/<候选ID>`；它会运行固定ZIP8/DMG2隔离桌面场景，不能在用户“不跑E2E”的范围内静默启动。

需要安装时，确认目标DMG及当前应用已正常退出，将包中的 `BoAI Agent.app` 安装到应用程序目录，再启动并核对实际运行路径和版本。打包成功、签名核验、安装和安装后使用分开报告。

## 6. bumpp、tag与Release

当前 `scripts/release-version.mjs` 已调用bumpp；只同步根应用version/buildVersion，不递归改内部workspace包，也不自动commit/tag/push。

```sh
pnpm release:version          # bumpp交互选择版本
pnpm release:version patch    # 也支持minor、major、明确稳定X.Y.Z
```

升版后是未提交改动，应先按开发流程提交并合入main；不要紧接着对dirty源码运行候选构建。版本变化不等于依赖更新。bumpp支持Git提交/tag/推送，但本项目封装当前禁用这些动作，让发布阶段以实际最终main提交创建tag。现有GitHub Release和资产上传由 `gh` / `scripts/release-publish.mjs` 处理。

源码发布和安装包发布分别按用户范围选择：

- **只要源码tag/Release**：先确认待发版本、远程main、对应Test及同名tag/Release状态。用Git对准确提交创建并推送tag，再用 `gh release create <tag> --verify-tag --title <标题> --notes-file <说明文件>` 创建源码Release。GitHub生成的源码ZIP/tar.gz不含可安装应用，不运行release:local来冒充源码发布。
- **完整安装包发布**：版本已递增并合入main，当前main同SHA最新push Test成功、发布配置有效后，执行 `pnpm release:local --publish`。它自动读取版本/HEAD，构建、固定产物冒烟、准备差分/appcast及签名清单，创建tag/draft Release，上传校验后发布Latest。这个入口会运行桌面冒烟；与用户测试约束冲突时先把具体冲突说清，不能跳过门槛或静默扩大范围。
- **准备完整发布但先不公开**：`pnpm release:local` 同样要求main/Test并运行构建和冒烟。它不会创建远程Release，最后输出 `pnpm release:publish <更新目录> <冒烟目录>` 的实际命令。
- **只构建自用包**：使用上一节 `release:build`，无需把它误写成必须先公开Release；它也不自动安装应用。

已有同版本的源码Release时，`release:local`会因为版本未递增/Release已存在拒绝。先核对tag的准确SHA与已有资产，再按本次要求选择新版本或明确的补资产工作；不自动移动旧tag、覆盖Release或盲目重跑发布。源码Release本身不建立Sparkle自动更新资格。

发布细节、失败恢复和安装版更新见 [boai-release](../../boai-release/SKILL.md) 与 [个人应用更新与发布](../../../../ai-docs/spec/22.开发自动化与持续测试/11-个人应用更新与发布.md)。

## 7. Git交付和worktree回收

| 用户请求 | 行为 |
| --- | --- |
| 只修改、只解释或只验证 | 完成对应范围，不推导发布或安装授权 |
| `git cp` | 检查status/branch/remote/worktrees，显式暂存任务路径、commit/push并创建或更新PR；按本次合并范围处理 |
| 普通允许合并的交付 | 使用正常PR自动合并及精确head核对，不使用管理员例外 |
| `git cpf` / 明确跳过CI直接合并 | 使用 `scripts/git-cpf.mjs`，只提交已暂存内容；精确head合并并恢复/读回临时管理员保护，不等待CI |
| 同步main | 仅实际合并后在干净main中fetch并ff-only同步 |
| 清理worktree | 确认提交已合入main或完成最终提交/archive标签存档，迁出数据/证据并核对进程、CWD、ignored文件及共享依赖后回收 |

`git cp`是用户交付意图，不保证机器存在同名alias；先检查，缺alias时用正常Git/`gh`流程。`git cpf`的仓库实现可直接调用：

```sh
git add -- <本任务路径>
node scripts/git-cpf.mjs "提交说明"
```

需要修复中断留下的临时保护状态时，沿原记录运行 `node scripts/git-cpf.mjs --restore-protection`。普通开发不能把该例外当默认策略。

实际合并、CI、部署、Release和应用重启分别报告。回收前保留原成功/失败日志、截图及需要的本地数据，记录迁移路径和哈希；删除后复核main、worktrees、归档及可用空间。不要把空闲终端的当前目录、活跃开发依赖或用户profile留在将删除的路径下，也不要为清理关闭无关终端或个人应用。细则见 [boai-dev-workflow](../../boai-dev-workflow/SKILL.md)。
