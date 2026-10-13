<!--
[INPUT]: GitHub固定来源、原Electron宿主与用户后台运行授权。
[OUTPUT]: 第17组后台常驻选型与有界实施；实际通过/失败唯一归02。
[POS]: ai-docs/spec/17.桌面后台运行。
[PROTOCOL]: 变化同步Header并上浮.folder.md。
-->
# BOAI 桌面后台常驻：GitHub 选型与来源

调研日期：2026-10-13。调研事实与实现验证分开，实际代码和结果见02。范围为电脑在线时的 Electron 桌面常驻；不扩展云服务、员工会话归一、自动阻止系统休眠或进程崩溃后的业务重放。

## 结论与来源选择

推荐直接适配 **Electron 官方 Tray/Menu 示例**，在原主进程保持一个 Tray、一个主窗口和原 `utilityProcess`；macOS/Windows 登录启动使用 Electron 原生 API，暂不引入额外包。后台常驻不需要另造 Agent 服务或渠道消费者。

| 来源 | 固定版本 / commit | 可借鉴内容 | 许可证及取舍 |
| --- | --- | --- | --- |
| electron/electron | BOAI 所用 v39.2.7，`4d18062d0f0ca34c455bc7ec032dd7959a0365b6` | 官方示例：Tray 强引用、原生 Menu、窗口重开、显式退出、关闭所有窗口保留进程 | [MIT](https://github.com/electron/electron/blob/4d18062d0f0ca34c455bc7ec032dd7959a0365b6/LICENSE)；首选，零新依赖 |
| zulip/zulip-desktop | `1cc112def5cd4b0b3ffe15c0857258c527b4421a` | 已发布 IM 应用的关闭隐藏、退出标志、生产环境登录启动与平台分支 | [Apache-2.0](https://github.com/zulip/zulip-desktop/blob/1cc112def5cd4b0b3ffe15c0857258c527b4421a/LICENSE)；行为参考，不直接搬其 renderer/remote 架构 |
| max-mapper/menubar | `4f40e730e312f4820c839a67c0a191ee14bc2462` | 菜单栏弹出小窗口封装 | [BSD-2-Clause](https://github.com/max-mapper/menubar/blob/4f40e730e312f4820c839a67c0a191ee14bc2462/package.json)；拥有 BrowserWindow、Positioner、Dock 行为，超出原窗口需求 |
| Teamwork/node-auto-launch | `c332f546f5594262adcb17f909030c21890ee80d` | Linux autostart desktop entry，macOS AppleScript / LaunchAgent，Windows 注册表 | [MIT](https://github.com/Teamwork/node-auto-launch/blob/c332f546f5594262adcb17f909030c21890ee80d/LICENSE)；macOS/Windows 已有原生 API，本轮无需引入 |

上述 commit 经 GitHub API 实际解析，后续迁入若复制源码，应保留对应许可与来源说明；本草稿不宣称已迁入。

## 官方现成代码如何迁用

[固定版本官方 Tray 示例](https://github.com/electron/electron/blob/4d18062d0f0ca34c455bc7ec032dd7959a0365b6/docs/fiddles/menus/tray-menu/main.js)已经展示：`app.whenReady()` 后创建 Tray，保存全局引用避免回收，`Menu.buildFromTemplate` 提供打开应用/退出，监听 `window-all-closed` 而不退出。BOAI 只需把示例的 `createWindow` 替换为现有安全窗口创建/显示入口、把退出接回现有 `before-quit` 收尾。无需增加服务框架。[官方教程](https://www.electronjs.org/docs/latest/tutorial/tray)

[固定版本 Tray API](https://github.com/electron/electron/blob/4d18062d0f0ca34c455bc7ec032dd7959a0365b6/docs/api/tray.md)规定 macOS 使用 Template 图标及 @2x 图；Windows 推荐 ICO；Linux 托盘依赖桌面环境，激活动作可能是单击或双击，菜单状态改变后需重新 `setContextMenu`。不能把“构造 Tray 未抛错”提升为所有 Linux 桌面可见入口认证。[当前官方平台说明](https://www.electronjs.org/docs/latest/api/tray#platform-considerations)

[Zulip 主进程 L92–114](https://github.com/zulip/zulip-desktop/blob/1cc112def5cd4b0b3ffe15c0857258c527b4421a/app/main/index.ts#L92)在非退出状态 preventDefault 后隐藏；macOS 全屏先退出全屏，等待 `leave-full-screen` 再隐藏；`before-quit` 标记真正退出。可借其条件与全屏处理，但 BOAI 应继续由主进程拥有托盘，不能搬入 Zulip [renderer 的 `@electron/remote` 托盘实现](https://github.com/zulip/zulip-desktop/blob/1cc112def5cd4b0b3ffe15c0857258c527b4421a/app/renderer/js/tray.ts#L148)，否则破坏 BOAI 的 sandbox/contextIsolation 边界。

## 登录启动与隐藏启动

必须按 BOAI **Electron 39.2.7** 核对，不能仅套最新文档。[固定版本 app API](https://github.com/electron/electron/blob/4d18062d0f0ca34c455bc7ec032dd7959a0365b6/docs/api/app.md#appsetloginitemsettingssettings-macos-windows)支持 macOS/Windows 的 `openAtLogin`；macOS `openAsHidden` 已 deprecated，macOS 13+ 无效。建议保存 BOAI 自己的“登录后隐藏启动”偏好：macOS 结合 `getLoginItemSettings().wasOpenedAtLogin` 判断，Windows 登录项注册专用 argv 标记，查询时使用同一 path/args。普通手动启动仍展示窗口，不自动套用上次隐藏状态。

`getLoginItemSettings().status` 在 macOS 可返回 `requires-approval`、`not-found` 等；Windows `executableWillLaunchAtLogin` / startup approved 状态也不能仅用本地偏好代替。配置界面应体现操作系统实际状态。[固定版本查询 API](https://github.com/electron/electron/blob/4d18062d0f0ca34c455bc7ec032dd7959a0365b6/docs/api/app.md#appgetloginitemsettingsoptions-macos-windows)

[Zulip startup.ts](https://github.com/zulip/zulip-desktop/blob/1cc112def5cd4b0b3ffe15c0857258c527b4421a/app/main/startup.ts)提供很小的现成分支：开发环境不注册登录项，macOS/Windows 直接 `app.setLoginItemSettings`，Linux 才用 `auto-launch`。建议 BOAI 复用前两分支，Linux 登录启动本轮明确不支持，不增加跨平台库。[当前官方说明](https://www.electronjs.org/docs/latest/api/app#appsetloginitemsettingssettings-macos-windows)提示 macOS 未打包/未签名/未公证时登录启动可能无法可靠生效；当前 `pnpm dev` 只能验证关闭隐藏和后台收发，不足以认证真实系统登录启动。

`node-auto-launch` 的 [macOS 实现](https://github.com/Teamwork/node-auto-launch/blob/c332f546f5594262adcb17f909030c21890ee80d/src/library/autoLaunchAPI/autoLaunchAPIMac.js)通过 AppleScript 的 System Events 或用户 LaunchAgents plist 注册，增加额外实现、残留清理与系统授权面；[README](https://github.com/Teamwork/node-auto-launch/blob/c332f546f5594262adcb17f909030c21890ee80d/README.md)也说明 Linux desktop entry / LaunchAgent 残留与 MAS 限制。本轮 macOS/Windows 无收益。`menubar` 的 [Menubar.ts](https://github.com/max-mapper/menubar/blob/4f40e730e312f4820c839a67c0a191ee14bc2462/src/Menubar.ts)创建独立 BrowserWindow、改窗口位置和 Dock，且 [依赖 electron-positioner](https://github.com/max-mapper/menubar/blob/4f40e730e312f4820c839a67c0a191ee14bc2462/package.json)；BOAI 已有完整主窗口及浏览器，不适合整体引入。

## BOAI 只读核查与最小接线

以下是本仓库只读结论；文件可能继续被主代理修改，实施时按实际代码复核。

- `package.json` 固定 Electron 39.2.7。`src/main/main.ts` 用 `utilityProcess.fork` 创建独立 runtime，窗口只转发 UI 事件；渠道、自动化仍归原 runtime。后台隐藏无需修改业务协议、启动第二个 runtime 或重连渠道。
- 当前 macOS 最后窗口关闭会保留应用；Windows/Linux 会 `app.quit()`。现主窗口 close 主要是未保存确认，真实关闭会销毁 renderer。建议后台启用时隐藏主窗口而不销毁，以保留草稿与运行观察；关闭背景功能继续原关闭路径，未保存保护沿原合同。
- 当前 `ready-to-show` 总会 `window.show()`，隐藏启动须加门禁。必须先创建可用托盘再接受隐藏；托盘初始化失败时保留可见主窗口，不能留下用户无法操作的进程。
- 当前 `second-instance` 只有 restore/focus，`activate` 仅在所有窗口不存在时创建。新增统一 `showMainWindow`：存在则 restore/show/focus，不存在则沿原 `createWindow` 重建，串行避免托盘/通知/二次启动并发创建多个主窗口。不能把内置浏览器窗口误当主窗口。
- `before-quit` 已发送 runtime shutdown，等待 browsers/materialSources 退出；后台关闭不能走这一路径。托盘“退出”和 Cmd-Q/系统退出仍走原真正退出路径。当前 `stopped` 回执执行 `child.kill()` 后直接 resolve；若本轮验收实际退出，应以 utilityProcess 的 exit 事件完成，不能用收到 stopped 回执替代已退出。
- 运行选项宜为主进程-owned、仅固定布尔项的独立配置；外观对象 `AppearancePreferences` 当前仅主题/背景/缩放，不宜把 OS 登录注册塞入外观生命周期和清理恢复。IPC 保持 typed whitelist，不暴露任意命令/可执行文件路径或系统 plist 内容。
- runtime 意外退出当前只报错并等下一次操作重启。后台功能不顺带添加崩溃后重放，菜单应允许恢复主窗口查看状态；隐藏 UI 的错误仍须可见，不能显示“后台运行”便暗示渠道始终在线。

建议首版菜单为“打开 BoAI Agent / 关闭窗口后继续运行（勾选） / 开机启动（支持平台且正式包可操作） / 登录后隐藏启动 / 退出 BoAI Agent”。偏好默认值与设置入口由产品实现定；登录启动不默认注册。若需要状态行，只展示可证实的 runtime/渠道状态，不制造“全部在线”。

## 验收建议与证据边界

1. 关闭主窗口与最小化分别验证：主窗口不销毁、runtime PID 不变化；收到一条新渠道夹具消息并调用员工、保存回复且发送回平台一次。真实飞书在线收发作为另列人工/真实验证，不能用协议夹具替代。
2. 无 renderer 可见时运行一个本地时钟自动化夹具：原 occurrence、通知与持久结果保持，无第二次执行。重开窗口能查询新增历史。
3. 托盘打开、macOS Dock activate、二次启动、通知点击统一恢复同一主窗口；重复操作不新增 runtime、渠道接收者或窗口。
4. 关闭后台选项后，Windows/Linux 的关闭退出和 macOS 原习惯分别验证；有未保存业务/外观时按原合同核对，不能因后台功能丢草稿。
5. 隐藏启动在 `ready-to-show` 不闪出窗口；托盘失败回退可见；macOS 全屏关闭后仍可重新打开。
6. 显式退出期间新动作不受理，等待原 runtime、浏览器和材料资源实际退出；清除 Tray，结束父子进程，活动工作保留原取消/未知语义；重启零业务盲目重放。
7. macOS/Windows 登录启动的设置适配器用隔离假 OS 验证 path/args、失败状态与变更结果；`pnpm dev` 不修改真实登录项。正式包的系统登录启动需单独真实验收，未做则如实标未认证。
8. 不支持 Linux 登录启动、电脑休眠/关机不可接收、托盘的 Linux 环境差异应清楚说明；不默认加入 powerSaveBlocker，不作 24/7 可用性承诺。

本调研不代替产品验收；实际已运行、失败与未认证范围统一见02。
