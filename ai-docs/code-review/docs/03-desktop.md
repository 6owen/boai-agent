<!--
[INPUT]: 05909997 桌面宿主、Preload、Worker 与调用方源码。
[OUTPUT]: 桌面进程审查发现、代码证据、修复和验证建议。
[POS]: BOAI 模块代码审查，桌面进程。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->

# Electron 桌面宿主

桌面把凭据保管、系统文件选择、浏览器窗口、终端和业务 Worker 分开，单个服务普遍具备版本校验、范围校验或清理机制。风险集中在跨服务的生命周期。主进程对「正在运行」「已经超时」「已实际退出」三种状态的处理，在备份、运行时重启和退出恢复这几条路径上存在具体缺口。

## 发现

<a id="desk-01"></a>

### DESK-01 · P1 · 慢备份会在 Worker 仍写入时删除导出目录

- **触发与影响**　用户从设置导出大型工作区时，备份可能要复制数据库、材料、员工目录和工作区。如果 Worker 处理超过 120 秒，导出会向用户报错，主进程随即递归删除正在写入的备份目录。Worker 收不到取消通知，迟到回执也无法改变本次结果。根据当时复制阶段，用户可能拿不到备份，或看到后来产生的部分目录。风险作用于正在生成的副本。
- **代码链**　设置按钮在 [data.tsx 第 37 行](../../../apps/electron/src/renderer/pages/settings/data.tsx#L37) 调用 `exportBackup`。主进程在 [main.ts 第 813 行](../../../apps/electron/src/main/main.ts#L813) 调用 `requestRuntime('__backup', { destination })`，使用默认限时。第 520 行定时器仅删除 `pending` 并拒绝 Promise，第 815 行捕获所有失败后删除目录。实际复制位于 [service.ts 第 6322 行](../../../packages/runtime/src/service.ts#L6322) 的 `backup`。同一主进程在第 693 行已为需要保持输入文件存活的操作提供等待完成能力。
- **修复与验收**　为备份使用等待实际完成的请求，明确区分超出等待期限、Worker 已退出及明确备份失败。仅在写入者结束后清理未完成副本。以虚拟时钟让写入跨过 120 秒，分别验证成功、明确失败、Worker 退出和迟到回执，核对文件和 manifest 的实际状态。
- **证据**　源码调用链。既有 `tests/capability-backup.test.ts` 直接调用 Runtime 的备份方法，无法覆盖外面的 Electron IPC 时限。本轮未在个人数据上执行慢备份。

<a id="desk-02"></a>

### DESK-02 · P2 · Worker 重启后员工 CLI 仍绑定已经退出的 Worker

- **触发与影响**　桌面自带 Worker 意外退出后，下一次普通桌面请求可以启动新 Worker。此时员工进程获取 CLI 端点或用短期身份认证的路径仍失效，用户级 CLI 的 ping 则可能显示连接正常。
- **代码链**　[main.ts 第 403 行](../../../apps/electron/src/main/main.ts#L403) 仅在 `!cli` 时开服务，`runAccess` 捕获首次启动的 `child`。端点只在 [cli-service.ts 第 40 行](../../../apps/electron/src/main/cli-service.ts#L40) 开服务时发给该 Worker。退出回调 [main.ts 第 461 行](../../../apps/electron/src/main/main.ts#L461) 清空 `runtime` 和 `ready`，保留 `cli`。新 Worker 跳过开户；旧闭包在第 515 行必然遇到 `runtime !== child`。状态查询只做握手和 ping（`cli-service.ts:29`）。
- **修复与验收**　CLI 端点随 Worker 代次关闭并重新登记，或显式把稳定的端点重新绑定给已就绪的新 Worker。保留旧代次租约撤销。补一条两代 Worker 用例，检查新员工能拿到新租约、旧租约被拒绝，并区分用户 CLI 与员工 CLI 的可用状态。
- **证据**　源码生命周期分析。没有人为终止使用中的 Worker。

<a id="desk-03"></a>

### DESK-03 · P2 · 退出失败恢复窗口后，画板和数据备份持续不可用

- **触发与影响**　应用已开始退出清理，某项清理失败，或更新安装交接超过 15 秒，应用会恢复窗口。此后画板请求被拒绝；即使平时未启用画板，设置里的导出备份也要经过同一 `coordinatedBackup`，会立即被拒绝，直到重启进程。
- **代码链**　宿主是单例（[main.ts 第 289 行](../../../apps/electron/src/main/main.ts#L289)）。第 1036 行与其他清理并发调用 `canvas.close()`。该方法同步设置 `closed = true` 并最终注销 IPC（[canvas-host.ts 第 175 行](../../../apps/electron/src/main/canvas-host.ts#L175)）。第 159 行按此标记直接拒绝备份。失败恢复（`main.ts:1042`）恢复终端、图标及窗口，未重建画板单例或重新注册其 IPC。
- **修复与验收**　给宿主区分可撤销的停止接单阶段与最终销毁阶段，或待旧宿主实际关闭后重建实例。模拟另一项收尾失败，恢复窗口后验证画板启用状态和备份两条入口，包括关闭画板插件的情况。
- **证据**　源码生命周期分析。现有 `tests/runtime-shutdown.test.ts` 覆盖实际退出判定，`tests/canvas-host.test.ts` 覆盖局部宿主，两者之间的恢复需专门验证。

<a id="desk-04"></a>

### DESK-04 · P2 · CLI 发布失败会阻断已经就绪的桌面 Worker

- **触发与影响**　Worker 已报告 ready，CLI 服务随后绑定失败或私有连接描述写入失败。后续普通聊天、快照等请求重复收到同一次启动错误。即使外部条件恢复，用户再次点击也不能恢复该进程内的正常调用。
- **代码链**　[main.ts 第 400 行](../../../apps/electron/src/main/main.ts#L400) 确认 Worker 就绪并清掉启动计时器，随后 await `openDesktopCli`。第 413 行只拒绝 ready。第 375 行仅在 `!runtime` 时清除失败 Promise，此处 Worker 仍在。第 365 行后续无条件返回缓存的 ready。端点发布出错时 [cli-service.ts 第 43 行](../../../apps/electron/src/main/cli-service.ts#L43) 关闭了 CLI server，没有停止 Worker。
- **修复与验收**　分别记录桌面业务就绪和 CLI 端点就绪，允许显式重试 CLI 初始化。如果两者必须共同就绪，应在失败后使该代实际退出，解除已拒绝的 ready。故障注入让首次发布失败、第二次成功，检查快照与 CLI 的恢复以及单写入者约束。
- **证据**　源码错误分支分析。未更改个人 CLI 目录或模拟真实故障。

<a id="desk-05"></a>

### DESK-05 · P2 · 打开本机 Agent 选择器会在 Electron 主线程整文件读取并计算哈希

- **触发与影响**　新增本机 Agent 的选择器挂载就发起扫描（[local-connections.tsx 第 63 行](../../../apps/electron/src/renderer/pages/settings/local-connections.tsx#L63)）。安装了大型本机程序时，主线程在扫描期间无法及时处理窗口事件、IPC 等工作，单文件还会占用与程序大小相当的 Buffer。
- **代码链**　[main.ts 第 696 行](../../../apps/electron/src/main/main.ts#L696) 在 Main 直接调用 `localConfigs.scan`，经 `local-configs/discovery.ts:28` 和 `local-configs/agent-programs.ts:18` 顺序检查候选。实际 [program.ts 第 25 行](../../../packages/runtime/src/modules/backends/program.ts#L25) 使用 `readFileSync` 及同步 SHA-256。默认单文件上限 200 MiB，Claude 的上限是 512 MiB（[policy.ts 第 10 行](../../../packages/runtime/src/adapters/claude/policy.ts#L10)）。
- **修复与验收**　把读取和校验移到后台线程，使用有界分块并保留导入前身份复核。用本地临时大文件测扫描期主进程定时器延迟及内存峰值，比对改造前后的哈希、命令发现顺序和取消行为。
- **证据**　源码确认同步执行位置与文件上限，实际时延取决于本机程序大小与 I/O。本轮未测个人机器的卡顿时间。

## 模块覆盖

下表路径在 `apps/electron/src/` 下。每行记录本次实际阅读的代表入口和判断。

| 模块 | 核读入口 | 判断 |
| --- | --- | --- |
| 窗口、路由、更新、托盘 | `main/main.ts`、`app-updates.ts`、`runtime-shutdown.ts`、`app-icon.ts`（后三项在 main 下） | 运行时停止以实际 exit 为准，更新安装等待宿主排空。跨服务恢复缺口见 DESK-02 至 04。 |
| 业务 Worker 与 CLI 附着 | `worker/index.ts`、`worker/application-host.ts`、`main/attached-runtime.ts`、`main/cli-service.ts` | 反向凭据和浏览器调用使用独立回执 ID；服务附着验证版本。CLI 的 worker 寿命与端点寿命不一致。 |
| 三个 Preload | `preload/index.ts`、`browser-toolbar.ts`、`canvas-renderer.ts` | 三个窗口使用各自接口，订阅提供解除函数。主应用通用 request 仍依赖 Main 逐项检查，新增方法需跨这两层核对。 |
| 浏览器 | `main/browser/browser-pane-manager.ts` 的 `destroyAll`、`registerToolbarIpc`，`main/main.ts` 的 `handleBrowserHostRequest` | 浏览器代次和实际窗口退出有显式协调。窗口、工具栏 IPC、弹窗和主题提取共存于 2,832 行的 PaneManager，修改某项监听时需复核窗口销毁路径。 |
| 本机程序与配置发现 | `main/local-configs/discovery.ts`、`agent-programs.ts`、`read-config-file.ts` | 扫描和选中后复核分开，配置文件读取检查类型及大小。程序整体哈希应移出主事件循环。 |
| 工作区终端、文件、系统应用 | `main/workspace-terminal/service.ts`、`main/file-opening.ts` | 终端按范围停止，释放 attachment 和屏幕对象。外部打开重新核对原件身份，清理前校验临时副本，保留用户编辑过的文件。 |
| 凭据、迁移、桌面配置、通知与协议导入 | `main/vault.ts`、`migration.ts`、`desktop-settings.ts`、`automation-notifications.ts`、`gateway-import-inbox.ts` | 写凭据有串行队列，迁移有 staging 和完整性检查。系统通知区分提交与确认失败，导入队列有容量和去重。 |
| 画板及外观备份 | `main/canvas-host.ts`、`main/appearance.ts` 的 `coordinatedBackup` | 两者都设置保存屏障；外层超时和退出回滚涉及多进程状态，见 DESK-01、03。 |
| 桌面采集、诊断与语音接口 | `main/desktop-activity.ts`、`diagnostics.ts`、`voice-input.ts` | 采集有输出尺寸、事件条数和监控租期限制，诊断限制内存记录数和日志容量。语音宿主检查 helper 回执；项目已暂停产品入口，本轮未启动采集或识别。 |

## 定向测试

本批后台运行的 `tests/cli-desktop-host.test.ts`、`tests/runtime-shutdown.test.ts`、`tests/canvas-host.test.ts` 和 `tests/capability-backup.test.ts` 均通过。它们覆盖单个宿主、进程退出或业务备份的既有合同。上文列出的跨组件故障路径按各项记录的证据判断。
