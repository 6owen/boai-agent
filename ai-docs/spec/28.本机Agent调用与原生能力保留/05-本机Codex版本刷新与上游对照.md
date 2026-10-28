<!--
[INPUT]: 用户反馈Codex版本变化导致发消息失败、手动刷新连接后恢复，要求修复并参考Raft/Lody。
[OUTPUT]: 当前错误的源码/现场原因、固定上游接法、自动版本观察修复与验证边界。
[POS]: 第28组版本兼容专题；唯一实际进度归02第5节，不替代全量原生能力验收。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->
# 本机Codex版本刷新与上游对照

## 1. 当前问题

2026-10-28现场只读核对：BOAI连接保存的人工验证版本为`0.162.1`，验证日期为2026-10-15；实际本机Codex为`0.164.0`。保存的Node启动包装器路径及SHA-256仍一致，变化来自包装器后面的已安装Codex程序。个人数据库中保留了“Codex版本已变化，请重新测试连接”失败；用户随后手动刷新“本机agent连接”，发送恢复。

直接拒绝来自`adapters/codex/client.ts`：原生`initialize`已经成功并返回实际版本，但代码又要求它与上次`profile.verified.version`完全相等。该检查在2026-10-08的`3ef7f68da`已存在，早于本轮运行中补充指令，并非这次功能引入。手动验证以新握手更新旧记录，所以能暂时恢复；同类升级仍可能再次触发。

BOAI的Codex生产链路是`app-server` stdio JSON-RPC，Claude才使用双向`stream-json`。流传输不等于上层不会额外检查版本。仅版本号变化不能证明协议不兼容；无需每次Codex升级都同步发布BOAI，真正的方法/schema变化则仍需适配。

## 2. 上游源码对照

本次只读GitHub源码，没有运行Raft或Lody，也没有复制其产品实现。固定版本如下：

| 项目 | 固定提交 | 与当前问题相关的实现 |
| --- | --- | --- |
| Raft官方源码镜像 | `db5e399f017d584e49597e3a28757645d6807893` | Codex发现阶段探测`app-server`能力及`--version`，候选文件mtime/大小改变后失效重测；启动时核对真实initialize返回的userAgent结构，不要求与历史验证版本完全相等 |
| Lody | `9b0824ce839240aaa009601311e2611b46b2a187` | 内置Codex默认走受管运行时和ACP适配器；可通过runtimeOverrides.codexPath指定已有程序，向适配器传CODEX_PATH；能力缓存有来源版本，实际连接另行initialize |

Raft证据：[Codex探测及握手](https://github.com/botiverse/raft-source/blob/db5e399f017d584e49597e3a28757645d6807893/packages/daemon/src/drivers/codex.ts#L485-L525)、[版本变化记录](https://github.com/botiverse/raft-source/blob/db5e399f017d584e49597e3a28757645d6807893/packages/daemon/src/runtimeCliVersionTracker.ts)。其[通用启动版本策略](https://github.com/botiverse/raft-source/blob/db5e399f017d584e49597e3a28757645d6807893/packages/daemon/src/runtimeLaunchVersion.ts)区分已知坏版本和未验证版本：前者拦截，后者警告后继续；这是一套可选driver策略，不把它描述成Codex驱动必然启用的版本黑名单。

Lody证据：[启动路径与覆盖项](https://github.com/LodyAI/Lody/blob/9b0824ce839240aaa009601311e2611b46b2a187/apps/cli/src/agent/setting.ts#L640-L668)、[受管运行时版本及缓存](https://github.com/LodyAI/Lody/blob/9b0824ce839240aaa009601311e2611b46b2a187/apps/cli/src/agent/managed-agent-runtime.ts#L327-L337)、[真实ACP初始化](https://github.com/LodyAI/Lody/blob/9b0824ce839240aaa009601311e2611b46b2a187/apps/cli/src/agent/agent-client.ts#L1949-L2010)。受管启动会优先当前安装、可用旧缓存，再按需安装；它并非一律自动追踪用户全局Codex。`codex-refresh-startup.ts`处理凭据刷新冲突，不是此处的CLI版本刷新，不借用其重试策略。

适配选择：BOAI保持用户所选本机程序和原生配置，借鉴“实际握手/能力为准、版本观察与配置分开”的边界，不引入另一套Codex安装管理。

## 3. 本次实现

1. 原生`CodexClient.start`取消与历史版本的精确相等检查。旧受限阶段继续使用其原版本合同，程序路径/hash与真实协议检查保持。
2. 复用本轮已有`initialize`和`thread/start`或`thread/resume`。成功后、`turn/start`之前，回传实际程序版本；不另发测试任务、不多开模型轮次。
3. `observedProgram`独立保存本次程序观察。写入时复核原配置revision及程序身份，较旧观察不覆盖较新记录，人工`verified`与配置revision不改。
4. 原生会话和Codex运行配置指纹排除观察字段，保持自动化配置核验及原会话连续性；原配置/权限/来源变更仍会使原会话失效。
5. 当前运行记录显示实际程序版本，版本目录优先较新的握手观察；`lastVerification`仍指真实人工验证，失败人工验证清除观察。
6. 原生网关在握手后按实际版本检查最低能力要求。已有运行配置前检的网关最低版本门槛保持，本次不扩大到从不支持网关的旧版本自动迁移。

适用边界：本次解决“同一已核准启动入口、实际版本变化”的误拦截。程序路径或入口文件hash改变仍走原重新核对流程，不把所有文件替换一律视为升级。真实初始化/线程错误原样保留；不自动重发失败消息。没有UI布局变更，也没有更改个人配置或重启个人应用。

## 4. 实际验证与证据

初始基线`628b6782`，后同步已经实际合并NP10的`3d547736`，不引入未合并功能。独立worktree `boai-codex-version-refresh`，分支`fix/codex-version-refresh`。

- 新增4条真实AppService/SQLite+stdio合成进程回归：版本从`0.161.0`升至`0.164.0`、原session与重启续聊/配置指纹保持；初始化失败、线程失败均无用户turn/无重放；入口文件变化仍拒绝。初次4条通过。它们是离线协议夹具，不是真实模型结果。
- 相关6文件批次首次为163通过、1失败、3跳过。失败为旧受限阶段“waits for an outstanding host tool to really exit when the external phase times out”：300ms期限内未进入宿主工具，`entered`为false。该批同时有typecheck/build在运行，启动争用是可能解释，未以此当作确证。保持原阈值与断言，单独复核一次为1通过/27因过滤未运行；原失败日志保留，不宣称首批全绿。
- `pnpm typecheck`及`pnpm build`初次通过；构建保留现有大chunk提示。
- 一次真实本机Codex零模型探针：输入旧验证版本`0.162.1`和实际相同程序hash，收到`0.164.0`握手并成功`thread/start`，用户输入0、模型请求0、重试0。受检bundle SHA-256为`64a7b67a642696008fa4f7d30cbe69d2bf732a1cb225447b0748cc19ea3ce81e`。这是实际协议启动验证，不等于真实任务/个人GUI验收。
- 同步已合并NP10后：`codex-version-refresh`、`native-steering`、`codex-app-server`、`runtime-versions`四文件47条全部通过；`pnpm typecheck`和`pnpm build`再次通过，构建仍有原大chunk提示。原首次计时失败仍保留，未放宽断言。

本地证据交付目录为主仓库`.local/codex-version-refresh-20261028/`：`version-tests.log`、`version-regression.log`、`version-timeout-recheck.log`、typecheck/build日志、`version-real-probe/receipt.json`和固定上游源码/身份。证据随任务收尾迁出worktree，不提交个人数据库或凭据。

尚未验证：个人应用加载候选后的真实聊天、完整GUI、跨平台、未来协议变更和长期可靠性。用户手动刷新恢复属于当前个人连接的反馈，不视作候选已经生效。PR、Test、自动合并和安装/进程重载分别判断。
