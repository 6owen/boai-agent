---
name: boai-release
description: BOAI macOS本机发版与安装版更新流程。用于升版本、准备安装包、发布GitHub Release，或查询下载和自动更新方式；复用bumpp与现有Sparkle发布脚本。
---
<!--
[OUTPUT]: Electron下载取消300秒总时限，按固定SHA缓存/断点续传，三次重试及取消；真实本地HTTP回归不运行E2E。
[OUTPUT]: 2026-11-10候选构建/冒烟取消Node24.16.0登记限制，统一沿package.engines。
[OUTPUT]: 2026-11-10安装包统一到dist/releases，命令保持；.local保留候选控制/恢复记录，兼容旧资产，安装包不进入应用身份或包体。
[OUTPUT]: 2026-11-10新增boai-agent-dev-skills统一入口，梳理实际dev/build/验证/打包/bumpp/tag/Release/Git/worktree命令；release:build现默认读取package版本与当前HEAD，显式参数仍可覆盖。
[INPUT]: 用户本次发布范围、干净源码、main Test及本机更新配置。
[OUTPUT]: 按授权完成版本准备、候选或正式Release，并准确报告下载及安装状态。
[POS]: 开发Agent共享发布技能；本机macOS arm64打包，GitHub托管更新资产。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->
# BOAI 本机发布

开发与构建命令先读 [boai-agent-dev-skills](../boai-agent-dev-skills/SKILL.md)；本篇负责本机候选、正式发布和安装版更新细则。

使用仓库根目录的`release:*`命令；完整合同见[个人应用更新与发布](../../../ai-docs/spec/22.开发自动化与持续测试/11-个人应用更新与发布.md)，实际验证归[03第5节](../../../ai-docs/spec/22.开发自动化与持续测试/03-实施步骤与验收.md#5-唯一实际进度)。脚本变化时核对当前源码，不照搬历史候选的SHA或测试成绩。

## 识别请求

- “怎么发布/从哪里下载”：说明流程，实时查询需要报告的Release状态，不执行升版、打包或发布。
- “打包/准备候选，先不发布”：完成本机候选及适用验证，不创建远程版本Tag或Release。
- “发布一个新版本”：已有明确发布授权即可完成下面的流程，无需重复确认；开发、提交PR、`git cp`/`git cpf`或创建本技能本身不隐含正式发版。
- 发布和安装分别报告。首次替换本人应用须在用户要求安装的范围内执行；不能把上传成功当作本机已升级。

## 开始与一次性配置

1. 核对当前仓库、分支、status、remote、worktrees及最新Release。源码改动和PR交付沿[boai-dev-workflow](../boai-dev-workflow/SKILL.md)，不把未提交开发改动带入候选。确认`package.json`已有本技能列出的命令；缺失时先核对实现分支是否已合并，不使用旧`dist:mac`替代。
2. 当前支持macOS Apple Silicon本机打包；Node统一沿package.json.engines（目前`>=22.13.0`），候选构建与冒烟不另锁某个Node版本。按仓库锁定的pnpm安装依赖；发布需要GitHub CLI登录并具备`6owen/boai-agent`发布权限。现行更新源使用公开Release，不把GitHub凭据放入应用。
3. 发布机首次执行`pnpm release:setup`。它重编译Sparkle组件，将私钥保存在钥匙串账号`com.boai.agent.updates`，公钥/feed配置存于`~/Library/Application Support/BoAI Release/settings.json`。已有配置复用；不输出/导出私钥，不静默轮换密钥。

应用沿用ad-hoc签名，无需付费Developer ID或公证；更新包仍使用独立Ed25519签名校验。正式发布使用生产feed和原公钥，不能使用loopback测试配置或临时密钥候选。

## 升版与源码交付

开发改动先提交，在干净的版本worktree运行：

```sh
pnpm release:version patch
# 也支持 minor、major、明确的X.Y.Z；不带参数为bumpp交互选择
```

遵从用户给定的版本或升版幅度；未给定时核对当前版本、已发布版本及本次改动，说明选用的递增稳定版本。有交互提示时用终端交互完成。若当前已有待发布的更高版本，先确认它是否就是本次版本，避免重复升号。

bumpp只同步根`package.json.version`与`build.buildVersion`，内部workspace包保持独立版本，不自动commit/tag/push。提交本次版本变更并随正常PR合入main。发布资格要求**当前远程main同SHA最新一次push触发的Test成功**；PR检查、旧main成绩、手动检查或`git cpf`直接合并均不能替代。

用户要求完成发版时，检查仍在运行就跟进到结果；失败则报告具体原因并按授权范围处理。共享开发技能中普通交付“不等待CI”的默认不等于可以跳过发版所需的main Test。

## 本机构建与发布

在对应远程main的干净检出中执行；可以使用独立worktree，不要求改动正在使用的开发进程或切换其目录。

```sh
pnpm release:local --publish
```

该命令自动执行：main/Test核对 → 本机ad-hoc arm64 DMG与ZIP → ZIP8/DMG2产物冒烟 → 校验上一版ZIP并生成可用差分 → 签名appcast及校验清单 → 同SHA `vX.Y.Z` Tag → draft Release上传与资产回读 → 重核main/Test → 发布为Latest。首版或差分不适用时使用完整包。不再手工重复创建Tag或上传同一资产。

只准备正式发布候选时运行`pnpm release:local`，它同样要求当前main/Test，但不写远程Release。之后沿命令输出的实际目录发布：

```sh
pnpm release:publish "更新目录" "冒烟目录"
```

只需要本机安装包时，可从干净的main或功能提交构建。`release:build`默认读取`package.json.version`和当前HEAD，可选`--version`/`--sha`覆盖声明；仍核对源码干净且版本/提交一致，不自动升版。详见[统一命令说明](../boai-agent-dev-skills/references/commands.md#5-自用安装包)：

```sh
pnpm release:build
pnpm release:smoke --candidate .local/release-candidates/实际候选ID
```

新安装包在`dist/releases/candidates/<候选ID>/assets/`，更新资产在同一候选根目录的`updates/`，Electron暂存和上一版ZIP也归此候选产物目录。候选`candidate.json`、监督器、账本和日志仍在`.local/release-candidates/<候选ID>/`，上述冒烟参数保持；新记录通过`artifactDirectory`定位安装包，旧候选沿原路径兼容读取。`dist/`已被Git忽略，安装包不参与应用身份校验或包体；不要批量删除`.local`中的profile、归档和恢复记录。

候选构建/冒烟不自动授予main发布资格。普通`pnpm dist:mac`不注入更新源，不能代替这条自动更新发布流程。

Electron运行时下载优先命中校验过的缓存；未完成字节保存在`dist/releases/cache/electron/partial/`，重试/重新构建自动续传，不再受原300秒整段下载上限限制。下载有连接/持续低速检测、最多三次尝试和取消，SHA256不符的文件不进入打包。网络失败时保留断点，不删除整个缓存要求从零开始。

## 失败与交付

- 任一步失败先读取该次日志和原件，不跳过冒烟、包字节或main/Test校验。main已前移、源码变化时，旧包不能借新SHA资格发布。
- 上传或发布中断先只读查询同名Tag、Release/draft和资产；当前脚本拒绝已有Release，不靠删除draft、覆盖资产、移动Tag或盲目重跑处理未知结果。报告已完成阶段与具体阻塞，再按用户范围处理；保留原失败记录。
- 成功后核对实际Release已公开、版本/Tag及资产符合本次产物，返回Release链接和DMG下载链接。未找到Release时明确尚未发布，不编造下载地址。
- 报告区分“候选已构建”“冒烟通过”“Release已发布”“本人应用已安装/实际版本”；任务worktree回收沿共享开发技能，先保留必要产物及记录。

## 下载与自动更新说明

下载入口：[全部Releases](https://github.com/6owen/boai-agent/releases)，有正式发布后可用[Latest](https://github.com/6owen/boai-agent/releases/latest)。首次下载实际Release的`BoAI-Agent-X.Y.Z-macos-arm64.dmg`并手动安装包含更新器的版本；旧包没有更新器，不能自动获得第一版。

之后已安装版本在启动及定时检查时后台下载、校验更新，正常退出并完成宿主清理后安装，下次启动生效；也可在设置的“运行选项 → 应用更新”中检查或“重启并更新”。不会自行强制重启，关窗后留在托盘不算退出。匹配基包时优先差分，基包不匹配、差分不适用或失败时回退完整ZIP；完整包校验失败不安装。桌面附着独立CLI服务时更新暂停，需退出该服务并重开桌面。

自动更新以已发布的Release为准，本机代码提交/编译不会直接更新已安装应用。安装替换应用bundle；本流程没有实现数据库schema降级或自动数据回滚。
