<!--
[OUTPUT]: 2026-10-25源码链接随Workspace迁移更新，历史验证结论保持。
[INPUT]: DS Bot、DSH 固定源码、BOAI 当前源码及用户四张截图。
[OUTPUT]: 面板/文件/终端/Cookie的历史源码研究；当前仅供架构参考，不作为新增产品/UI的实施依据。
[POS]: ai-docs/spec/25.右侧工作面板与Cookie导入/01-DS-Bot源码机制与BOAI对比.md。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->

# DS Bot 右侧面板源码机制与 BOAI 对比

更新：2026-10-24。

现行范围以 [本组README](./README.md)为准：用户已收窄至架构研究。以下保留此前源码事实和候选背景，不进入当前产品/UI待执行清单。

## 1. 结论与证据范围

可以借鉴，而且 BOAI 不需要切换技术框架或重做界面。最有价值的部分是：

- 把面板壳、标签记录、内容状态和后台资源生命周期分开。
- “开始”页由可用面板能力生成入口。
- 文件树按目录加载并保留状态；外部应用由宿主探测并缓存。
- 终端使用真正的 PTY，结合服务端屏幕状态、增量输出、渲染确认和重连。
- Cookie 先在主进程准备并预览，确认后写入目标浏览器分区。

固定研究基线：

- DS Bot：0.2.1，提交 1bebe826f74e9a72cabafd3b80602b05af867b38。
- DeepSeek Harness：dsh-v0.2.1-rc.2，提交 687f282e8625c6b8d11ff58211a90524be2e4317。
- BOAI：main，提交 6f2cbd631a4e3320c0ba2f129028169dc9a19527；本地已有文档变更保留。
- 截图体现用户安装版本的可见行为，没有安装包构建标识，不能断言与上述源码逐字一致。

当前桌面组合是 dsh-base + dsh-web-app + ds-bot；旧 deepseek-bot-engine 已进入 retired bundles。因此，本研究沿现行插件链路，不以旧 app/ui 或旧引擎解释截图。见 [DS Bot profile 配置](https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/app/src/profile.mjs)。

## 2. 右侧不是一个巨大的聊天组件

### 2.1 实际分工

- DSH 的 ui-sidebar-right：标签注册、会话内布局、开始页、显示/收起/全屏及关闭。
- DSH 的 ui-dockkit：标签容器、切换、拖动、分栏和浮动几何。
- ui-sidebar-files：文件树内容。
- ui-sidebar-terminal + api-terminal-controller：终端 UI、连接与宿主终端服务。
- ui-open-in-app + host/open-in-app：外部应用菜单、可用应用探测及启动。
- DS Bot 自己的 right-panel.js：协调 Bot 抽屉和 DSH 右栏，避免两个右栏同时挤占聊天空间。
- DS Bot 自己的 browser-pane.js：Bot 浏览器与 Cookie 导入交互。

源码：[SidebarRight](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-sidebar-right/src/client/shell/SidebarRight.tsx)、[标签容器](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-dockkit/src/components/TabLayout.tsx)、[DS Bot 右栏协调](https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/client/right-panel.js)。

BOAI 已有统一 AppShell、DetailPanel、DetailTabSession 和标签 reducer，可以吸收这套分工；无须搬入 Cordis、DSH slots、整个 DockKit 或 DS Bot 的 DOM 属性协调方式。

### 2.2 “开始”实际是一个注册的标签类型

开始页读取注册表中的 guide entries。文件包贡献“工作区文件”，终端包贡献“新建终端”；终端还可以提供 shell 选择。

默认 guide 点击入口会请求在当前 guide 标签位置打开目标；注册项也能提供自己的入口实现。因此，“开始”是可以打开、替换的轻量入口页，不是要求所有文件/终端标签前永远固定一个开始页。截图同时存在多个标签，也不意味着每个标签都已分配后台资源。

见 [GuideBody](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-sidebar-right/src/client/tabs/guide/GuideBody.tsx)、[文件注册](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-sidebar-files/src/client/definition.tsx)、[终端注册与入口](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-sidebar-terminal/src/client/index.ts)。

### 2.3 流畅性：可以确认的机制

第一，壳与重内容生命周期分离。

- 右栏收起时，外壳通过位移和延迟 visibility 隐藏，内容树不会因为一次收起就整体销毁。
- DockKit 为标签保留稳定容器；正文按 visited、active、selected 和 keepMounted 判断是否存在。
- 需要保留的类型可以声明 keepMounted；会话视图只保留当前会话及存在保留标签的后台会话。
- 文件、终端的当前注册没有统一声明 keepMounted。切去另一标签时，正文可能卸载，状态或进程由外层服务保留。
- 不能把它概括成“所有标签永久挂载”，也不能把“卸载正文”误解成“杀掉终端”。

第二，动画有清晰边界。

- 右侧 dock 内容使用 transform 位移；框架同时调整聊天与右栏的布局轨道。
- 全屏复用同一棵内容树，不另建一个终端或文件视图。
- 隐藏区域隔离焦点和输入；减少动态效果的系统偏好会关闭过渡。
- 仍然存在布局轨道变化、测量及真实内容成本，不能声称“全程只有 GPU、完全不重排”。

第三，状态订阅和后台工作按对象收敛。

- 文件树状态按 session + tab 存储，目录懒加载。
- 文件滚动只更新 ref，卸载时才保存位置，避免滚动驱动整树状态更新。
- xterm 通过动态 import 延迟加载；输出与模型聊天状态分开。
- 终端可见且尺寸有效时才做 fit；后台终端进程不依赖 DOM。

源码：[右栏 CSS](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-sidebar-right/src/client/shell/SidebarRight.module.css)、[会话保留策略](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-sidebar-right/src/client/session-views.ts)、[FilesBody](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-sidebar-files/src/client/FilesBody.tsx)、[延迟终端加载](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-sidebar-terminal/src/client/LazyTerminalBody.tsx)。

这些机制有利于降低切换成本，是源码层面的判断。本轮没有 FPS、主线程长任务、内存或输入延迟的实测数据。

### 2.4 BOAI 已有的基础与待查点

BOAI 的 [DetailTabSession](../../../apps/electron/src/renderer/components/detail-panel/tab-session.tsx) 已使用 keepMounted 和 hidden，保留各标签编辑状态与退出守卫。[PanelResize](../../../packages/ui/src/components/panel-resize.tsx) 收起时仍保留子树，并设置 inert / aria-hidden。不能建议再造一套同样的缓存。

差异和后续检查点：

- BOAI 共用 [panel-resize.css](../../../packages/ui/src/panel-resize.css) 使用 width/height 过渡；拖宽度会更新布局状态。应测量复杂内容下的 layout/paint 成本，再决定是否增加固定宽度内层与 transform。
- [详情头部](../../../apps/electron/src/renderer/components/detail-panel/index.tsx) 已用 ResizeObserver + requestAnimationFrame 只滚动标签栏，避免 scrollIntoView 带动整个壳。
- [AppShell](../../../apps/electron/src/renderer/components/app-shell/index.tsx) 集中装配详情正文；应测量消息流更新是否让无关面板重复 render，再决定拆订阅或 memo。当前研究不把它判为已经证实的性能问题。
- 已有 active 参数负责停读；保留挂载不应让隐藏文件列表、预览、终端持续做高频 UI 工作。

## 3. 文件面板及“外部打开”

### 3.1 文件树怎样工作

文件根路径来自 DSH Session 的 cwd。顶部显示 PathLabel、刷新，以及独立注册的文件动作；树只请求当前目录一级，展开子目录后再请求子级。

目录状态按 tab 存储，收起目录保留已加载内容。目录观察以非递归 watcher 为基础；刷新合并进行中的读取，通过取消信号结束过期读和子树观察。读取失败可以保留已展示内容，不必整树退回空白。

当前 FilesBody 使用普通递归列表，并没有证明它对任意巨大目录都使用虚拟列表。服务返回 truncated 时显示截断提示，不能把它说成“百万文件也不卡”。

源码：[文件状态](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-sidebar-files/src/client/store.ts)、[目录生命周期](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-sidebar-files/src/client/directory-node.ts)、[文件注入与观察](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-sidebar-files/src/client/face.ts)。

### 3.2 右侧菜单确实会探测本机软件，但有预置目录

它先定义受支持应用及各系统定位/启动规则，再探测哪些存在：

- macOS：应用包目录、CLI 路径等；可探测 /Applications、用户 Applications 及相应应用定位规则。
- Windows：安装路径、环境变量、注册表等。
- Linux：CLI、桌面入口等。
- 目录涵盖系统文件管理器、编辑器、IDE、Git 客户端和终端软件，不是只支持截图中的七项。
- 图标有独立提取与缓存；不要求前端手工画每款软件图标。

所以准确说法是“预置应用适配目录 + 本机可用性探测”，不是扫描全部软件后自动理解任意程序该如何打开文件夹。

宿主缓存已解析的启动器；菜单读取和点击不会反复探测。若点击时可执行文件已不存在，仅重新探测这一项并有限重试。前端保存选择并共享启动中状态，主按钮使用所选应用，箭头打开菜单。

源码：[应用目录](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/host/open-in-app/src/catalog.ts)、[平台探测与启动](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/host/open-in-app/src/resolver.ts)、[宿主缓存/路由](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/host/open-in-app/src/index.ts)、[按钮控制器](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-open-in-app/src/client/controller.ts)。

### 3.3 外部打开不只是拼一条 shell 命令

前端提交 app id 和捕获的目标 path；宿主选择已验证启动器，以参数数组启动，或使用 OS 打开能力。后台启动与应用退出解耦，短观察窗口只判定启动阶段失败，不等待 IDE 关闭。

给 BOAI 的可复制部分是 catalog、locator、argv adapter、缓存与失效策略。DSH 的 HTTP 路由和 slots 应改成 BOAI 现有 IPC 与菜单组件。

BOAI [openResource](../../../apps/electron/src/main/main.ts) 已执行 realpath、工作区/资源范围校验，并区分 open 和 reveal；部分扩展名默认定位文件而非执行。外部应用选择要扩展这一宿主路径，不能绕开它在 renderer 中直接 spawn。

### 3.4 BOAI 的“文件”与 DSH 文件树业务不同

[ConversationFiles](../../../apps/electron/src/renderer/components/work-views/conversation-files.tsx) 是附件、成果及知识资料入口；支持员工跨会话筛选、分页、预览和原消息定位。它不是单一磁盘目录的镜像。

因此：

- 可以加工作区路径栏和外部打开按钮。
- 不能把现有文件列表换成裸磁盘树，丢失原消息、成果和知识资料语义。
- 员工工作区路径与列表中文件的真实存放路径不一定相同；路径栏要标清“员工工作区”或“会话工作区”。
- 某个文件的“在外部应用中打开”仍应解析该文件自己的原件位置。
- 在群聊中打开某位员工的工作区，必须携带明确员工身份，不能把所有员工映射到同一全局 cwd。

## 4. 终端的完整实现

### 4.1 它是真正的 PTY

链路如下：

用户键盘 → xterm.onData → TerminalView 输入队列 → typed Remote → TerminalController → subprocess.spawnTerminal → 本机 node-pty → shell。

shell 输出沿反向链路返回；终端尺寸通过 resize 送到 PTY，支持交互程序的终端尺寸语义。DSH 也有其他 subprocess provider；这里描述本机桌面常见链路。

源码：[UI 与 FitAddon](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/client/ui-sidebar-terminal/src/client/terminal.tsx)、[控制器](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/terminal-controller/src/index.ts)、[本机 PTY provider](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/subprocess/subprocess-local/src/terminal.ts)。

### 4.2 最值得抄的是屏幕恢复与有界流

- 每个终端进程归属 Session，拥有独立 terminal id；多个终端可以并存。
- 宿主用 @xterm/headless 维护当前屏幕和有限滚动历史，@xterm/addon-serialize 输出屏幕快照。
- 新视图 attach 先接收 snapshot，然后接收顺序输出，避免每次重开重放无限原始输出。
- renderer 在 xterm.write 的完成回调里确认 revision，模型再推进待渲染帧。
- 输入带序号与确认；输入和 follower 缓冲有上限。
- 输出 follower 断开与 PTY 终止是两件事；卸载视图只 detach。
- 打开的标签通过独立 retain 流保留进程；关闭标签走终端 close handler。
- 最新 attach 获得输入控制；旧 attach 可继续看输出，但不能同时控制输入。

默认配置包含每 Session 最多 8 个终端、1000 行 scrollback、2 MiB follower 缓冲、64 KiB 单次输入上限。它们是固定源码的默认值，不是 BOAI 必须照搬的产品上限。

源码：[BrowserTerminal](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/terminal-controller/src/terminal.ts)、[输出队列](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/terminal-controller/src/stream.ts)、[客户端 model](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/terminal-controller/src/client/model.ts)、[保留策略](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/terminal-controller/src/retention.ts)。

该机制恢复的是仍存在的进程的屏幕。不能据此宣称宿主重启后能还原同一个 shell 进程。当前终端包中的部分恢复入口和清理失败 overlay 注册是注释状态，存在对应文件不等于 UI 已启用。

### 4.3 BOAI 不是完全没有 PTY

BOAI 当前已移除公开交互终端入口和 xterm 前端，但内部 [TerminalService](../../../packages/runtime/src/modules/workspace-tools/terminal-service.ts) 仍服务于预览进程。

它已有：

- 独立 terminal id，employeeId + conversationId 范围。
- process guard 管理及旧残留回收。
- create / write / resize / read(cursor) / exec / kill。
- 1,000,000 字符尾部缓冲和截断标记。
- 通过 Rust guard 的 [terminal.rs](../../../packages/runtime/src/adapters/process-guard/terminal.rs) 使用 openpty、setsid、TIOCSCTTY，启动交互 shell；Node 与 guard 的 pipes 是传输层，不能据此误判为没有 PTY。

和 DSH 的主要差异是：

- BOAI 当前没有可交互终端 UI，旧公开请求处于退役状态。
- 现有尾部文本缓冲不等于可恢复的 VT 屏幕快照；从任意截断点重放 ANSI 可能恢复错误。
- 缺少 DSH 这套屏幕 snapshot、渲染确认和 attachment 控制模型。
- 当前内部服务用提示符 hook 支撑命令结果收集；用户手动 shell 应与预览执行隔离，避免输入、输出或停止对象混用。

后续优先复用 BOAI 原有 PTY/进程生命周期，补终端视图与屏幕/传输层；是否换 node-pty 要由跨平台需求和实测决定，不因参考项目使用它就整体替换 guard。

### 4.4 截图中的 shell 报错要单独看待

图 3 的 brew、starship、pyenv、zoxide 和 /nvm.sh 报错说明 shell 初始化环境或配置依赖没有满足。截图不足以确定是 PATH、初始化次序还是具体安装问题，不能直接归因于 xterm。

BOAI 当前 guard 使用 shell -i，继承一组受控环境变量。后续要验证 pnpm dev 和打包版启动后的实际 shell/PATH、用户配置加载与 cwd。不要自动修改用户 .zshrc 来让演示通过。

## 5. Cookie 导入：可借鉴流程，不能无差别复制

### 5.1 两条来源路径

文件导入：

- 通过系统文件选择器读文件。
- 解析 Netscape cookies.txt、Cookie 导出 JSON、Playwright storageState 等形状。
- 规范化 domain、path、Secure、HttpOnly、SameSite、过期时间及 session cookie。
- 对过期、重复、无法识别的条目生成结果说明。
- storageState 中的 localStorage 只记录未导入提示，不写入浏览器。

本机浏览器导入：

- 识别 Chrome、Edge、Brave、Chromium、Firefox 的安装位置及 profile。
- Chromium 复制 Local State 与 Cookie 数据库及存在的相关 sidecar 到临时目录。
- 启动源浏览器自己的可执行程序，使用临时 user-data-dir 和 remote-debugging-pipe。
- 通过 CDP Storage.getCookies 让源浏览器解密后返回 Cookie，最后退出临时进程、删除目录。
- Firefox 读取复制的 SQLite；非默认容器 Cookie 被跳过。
- Windows 遇锁定时先返回 running，用户选择“关闭并导入”后才尝试关闭源浏览器，并在 finally 尝试重开。

这不是 renderer 的 document.cookie，也不是直接把用户 Chrome 的整个资料目录改成 BOAI 浏览器目录。

源码：[文件解析器](https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/app/src/cookie-parse.mjs)、[本机来源与副本读取](https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/app/src/browser-sources.mjs)、[桌面 IPC 接入](https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/app/src/main.mjs)。

### 5.2 prepare / preview / apply

解析得到的 Cookie 值存于主进程 CookieImports：

- 最多 16 个 pending，10 分钟有效期。
- 前端只得到 pending id、来源、站点计数、警告和跳过说明。
- 确认后消费 pending，一条条 cookies.set 写入目标 Session。
- 写入后 cookies.get 读回，最后 flushStore，报告 stored / dropped / failed / flushed。
- 取消或过期会让 pending 失效；不是一选来源就立刻覆盖目标登录。

图 4 展示的是来源菜单。后续界面还有预览、错误/结果和刷新页面流程，不应仅照着截图做一个点击即导入的菜单。

源码：[CookieImports 与写入](https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/app/src/cookie-import.mjs)、[导入界面](https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/ds-bot/src/client/browser-pane.js)。

### 5.3 当前源码中需要补强的点

以下是固定版本代码事实或明确标注的待验证推断：

1. 分区 Cookie 语义没有贯通。解析器和 CDP 转换可保留 partitionKey，但 toSetDetails 没传给 Electron；去重/读回身份也未完整包含分区键。直接复制可能把不同分区记录混淆或按普通 Cookie 写入。BOAI 必须针对所用 Electron 验证支持；无法正确保留时明确跳过，不静默降级。
2. 写后验证只检查 name/domain/path 对应记录存在，未比较值和属性。已有旧记录可能造成“存在”的表象。BOAI 应在主进程核对最终值和规范化属性，只向 UI 返回计数/原因。
3. 当前 keyOf 直接连接字段并去掉 domain 前导点，不能作为 BOAI 的完整 Cookie 身份协议。应使用结构化键，区分 host-only、域、路径与可用分区维度。
4. pending 没有绑定创建时的目标 Bot；apply 时再传 bot key。BOAI 应把来源、目标分区、目标版本和请求所有者绑定到 pending，目标清理或更换后失效。
5. 单条写入允许部分成功，不是整个批次原子回滚；写入成功与 flush 成功也分开。BOAI 结果不能简化为一个“全部成功”。
6. Chromium 提取命令没有显式传 --profile-directory。复制了所选 profile 和 Local State 后会如何选择 profile，需要多账号夹具验证，不能用“菜单列到了 Profile 1”证明取到 Profile 1 的 Cookie。
7. 浏览器副本解密受版本、OS 密钥服务和运行状态影响；独立复制数据库及 sidecar 也需要一致性验证。来源存在不等于可成功导入。
8. 临时目录清理异常被忽略，重开源浏览器是尝试而非恢复原窗口的证明。BOAI 应可诊断清理失败，不承诺一定还原全部标签。
9. 导入 Cookie 不等于登录完整迁移；站点还可能依赖 localStorage、IndexedDB、设备状态或新的验证。本轮没有实际网站登录测试。

第 6、7 项是根据链路提出的验证要求，不是已复现故障。

### 5.4 BOAI 的目标必须是现有独立浏览器

DS Bot 的分区 key 是 bot:<id>，经哈希变成持久分区，所以它的 UI 可以说“登录属于此 Bot”。见 [bot-browser](https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/app/src/bot-browser.mjs)。

BOAI 使用 [APPLICATION_BROWSER_SCOPE](../../../packages/shared/src/ipc/browser.ts)，[BrowserService](../../../apps/electron/src/main/browser/browser-service.ts) 为应用级浏览器创建持久分区；员工/会话/run 的 lease 是任务操作身份，不决定登录资料归属。[BrowserPaneManager](../../../apps/electron/src/main/browser/browser-pane-manager.ts) 管理独立 BrowserWindow 和页面视图。

适配结论：

- 把导入入口放进 BOAI 独立浏览器工具栏或其已有菜单。
- 导入现有页面使用的应用级 partition，不写 UI_SESSION_PARTITION，也不新建按员工命名的分区。
- 保留当前手动/Agent 控制权和清理生命周期；导入时序要与正在运行的浏览器操作协调。
- UI 表述为“导入到 BOAI 浏览器”，不能照搬“仅这个员工可见”。
- 当前核对的 browser IPC、service 和 toolbar 没有上述 Cookie 导入闭环；需要新增主进程能力及类型，不能只加菜单。

## 6. 复用优先级与来源标记

可直接移植后适配的逻辑：

- DS Bot cookie-parse 的多格式归一化和无值预览模型，但补分区语义、校验与资源限制。
- DSH 外部应用 catalog / resolver / argv 规则，改接 BOAI IPC 与原路径校验。
- xterm UI 的延迟加载、fit、输出完成确认和完整 dispose。
- 终端 snapshot + 增量流 + retain/detach/close 分层模型。

保留 BOAI 实现、借鉴机制：

- AppShell / DetailTabSession / PanelResize。
- 原文件聚合、附件、成果、知识、来源权限。
- Rust PTY guard 和预览进程回收。
- 独立浏览器窗口、应用级登录分区与任务 lease。

不建议整块移入：

- DSH 全量插件/Remote/布局框架。
- DS Bot 用 DOM 属性协调两套右栏的适配胶水。
- DS Bot 浏览器右栏和每 Bot 登录隔离规则。
- 不完善的分区 Cookie 写入、存在即成功的读回判断，以及仅凭源码文件存在就启用的恢复 UI。

DS Bot 根目录为 [Apache-2.0](https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/LICENSE)，[NOTICE](https://github.com/Fei2411/DeepSeek-Bot/blob/1bebe826f74e9a72cabafd3b80602b05af867b38/NOTICE)还标注了第三方来源；本次涉及 DSH 包声明 MIT，例如 [terminal-controller package](https://github.com/deepseek-ai/deepseek-harness/blob/687f282e8625c6b8d11ff58211a90524be2e4317/packages/api/terminal-controller/package.json)。实际移植时保存具体文件、提交、许可证与修改说明，沿用仓库第三方 notice 方式。这里没有复制上游实现代码。
