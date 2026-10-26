<!--
[OUTPUT]: 2026-10-26终端跟随应用主题并复用Base46/VS Code Plus ANSI，撤销独立配置；关闭前停流修复与验证边界归§11。
[OUTPUT]: 2026-10-26随PR23/25整合更新BOAI源码路径，保留原功能范围及验证记录。
[OUTPUT]: 2026-10-25源码链接随Workspace迁移更新，历史验证结论保持。
[OUTPUT]: 本轮修复最终19文件342项、类型/lint/build、Rust3项及两条分批Electron场景通过；开发版已重启，个人窗口CUA超时与真实登录/跨平台未验边界保持。
[OUTPUT]: 2026-10-25用户追加直接修复：终端传输/实例/主题与本机浏览器profile导入纳入当前范围，实际结果仍归第9节。
[OUTPUT]: 终端体验与浏览器profile导入补充研究归01第7节；本轮无产品优化、真实账号读取或性能验收。
[OUTPUT]: 2026-10-25现场打开错误修复：补私有getWorkspaceRoot分发，43项回归/类型检查通过，重启后真实目录与终端prompt已验。
[INPUT]: 用户保留 BOAI 业务/样式/独立浏览器的要求，以及 01 的固定源码结论。
[OUTPUT]: 用户2026-10-25明确启动独立worktree实现；当前范围及唯一进度归第9节。
[POS]: ai-docs/spec/25.右侧工作面板与Cookie导入/02-BOAI适配方案与验收.md。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->

# BOAI 适配方案与验收

更新：2026-10-25。用户已启动本组实现，并追加修复终端体验和本机浏览器账户选择。现行范围为工作区真实目录浏览、用户交互终端、独立浏览器 Cookie 文件与本机 profile 导入。旧研究阶段和首期范围记录保留在第9节。

## 1. 目标和范围

用户看见的仍然是 BOAI：原联系人、群、任务、文件业务、视觉组件和独立浏览器。参考 DS Bot 的右侧入口组织及后台机制，改善切换体验，增加指定应用打开、可交互终端与 Cookie 导入。

本次面板工作不修改员工人格、装配、workspace、跨聊天记忆或自动化会话语义。终端是用户操作的桌面工具，不是新增 Codex/ACP 后端；[第24组](../24.Mastra上下文容量与连续会话/README.md)仍只处理 Mastra/API 上下文容量。

## 2. 右侧“开始”与标签生命周期

### 2.1 最小产品映射

- 沿用 DetailPanelHeader、现有 Tabs 和关闭/拖动行为。
- 打开右侧工作面板且当前没有可展示标签时，显示轻量“开始”页。
- 开始页提供“文件”和“新建终端”入口；已有网页预览按原业务入口保留。
- 原直接打开文件、预览、成果、配置的操作仍直达目标，不强制经过开始页。
- “文件”打开或聚焦当前所属范围的文件标签；“新建终端”明确创建一个新终端标签。
- 同一范围不重复创建无意义的开始页/文件页；终端允许多个独立实例。
- 最后一个标签关闭后，可在仍展开的工作面板中回到开始页；用户主动收起面板仍收起，不自动弹开。
- 不追加浏览器标签，不引入 DSH 的浮动窗或左右分栏功能。用户本轮要参考的开始/文件/终端结构已能在现有 BOAI 右栏内表达。

开始页使用现有空态、Button/Card、图标、间距与字体 Token，不复制截图的配色、胶囊外观或整套布局。

### 2.2 身份不绑定短期模型 Session

面板所属范围使用现有产品 employeeId / conversationId / 页面 scope。标签另外拥有稳定 tabKey，终端拥有 terminalId。

Mastra 的执行上下文压缩或更换内部 Session，不应销毁面板、切换工作区、重开 shell，或清掉原文件筛选。后台自动化切换 Run 也不能接管用户手动终端。

群聊中的员工工作区/终端必须明确 employeeId；仅有群 conversationId 时不能静默选第一个员工。可沿现有员工选择上下文打开；尚未明确时显示就近选择，不创建新员工或新会话。

### 2.3 生命周期合同

- 关闭面板：停止可见性相关读取/测量，保留业务标签状态。
- 切换标签：保留文件筛选、列表滚动、编辑草稿；终端进程仍运行，输出消费可 detach。
- 切换员工/群：遵守原详情 scope，迟到请求不得写入新对象。
- 关闭文件标签：先走原未保存守卫，再释放该标签资源。
- 关闭终端标签：明确终止该用户终端，待宿主回执；停止失败不得只删 UI 后宣称成功，应有原位重试/可找回状态。
- 删除所属对象、清空涉及范围、应用退出：沿现有真实资源排空语义处理，不依靠 React unmount 恰好完成。
- renderer 重载：仍存活的宿主进程可按其真实身份重连。宿主进程已经死亡时，显示已结束/新建，不伪造恢复原进程。

可按内容类型选择“保留正文”或“保留模型后重建正文”，而非新增一个无限 keep-alive 池。BOAI 当前全部 DetailTabSession 保持挂载的行为，应先保留并测量；终端等重组件可有自己的 attach 策略。

### 2.4 流畅性改动前先建立基线

先记录三个独立耗时：首次加载重组件、已打开标签切换、外部文件/进程数据返回。不要用“加载中动画变快”代替数据准备变快。

候选优化顺序：

1. 从 AppShell 的聊天流更新中分离面板无关订阅；只有 profiler 证实重复 render 后再拆分。
2. 目录/文件数据按稳定身份缓存，隐藏时停读；请求返回前先核对 scope 和 generation。
3. xterm 代码按需加载，终端输出不通过聊天消息状态转发。
4. resize 的高频位置可按帧合并；尺寸相同不重复向 PTY 发送，零尺寸不 fit。
5. 若 width 动画导致重内容多次布局，再比较固定内层宽度、transform 和轨道联动的候选；保留 BOAI 已有时长与样式 Token。
6. 保持 inert、焦点恢复、键盘导航、减弱动态效果和未保存保护。

实施不能承诺“改成 transform 就不卡”。最终选择以相同数据、窗口大小、硬件及开发启动方式下的对照为准。

## 3. 文件路径栏与外部打开

### 3.1 路径栏对应真实对象

保留 ConversationFiles 的聚合业务，新增独立“工作区文件”视图和顶部工具栏：

- 员工文件页：显示该员工 workspace，明确标注“员工工作区”。
- 本轮会话入口也展示所选员工的稳定 workspace；conversationId用于核验成员关系，内部Session轮换不改变文件根。
- 群里明确打开某位员工：显示该员工 workspace，保留群上下文及员工身份。
- 当前对象没有单一有效工作区时，不伪造路径；保留文件列表，路径相关动作不可用。
- 路径支持省略显示和完整值查看/复制，主内容滚动不带走工具栏。
- 列表刷新沿原查询，不为了刷新附件/成果而递归扫描磁盘。
- 具体文件的外部打开/定位沿该文件原件路径，与顶部工作区打开分开。

本轮工作区列表确实读取该员工目录，支持进入目录、上级、分页、刷新、打开与定位。现有聚合“会话文件 / 知识资料”、筛选、分页和“查看原消息”保持原入口，不被目录树替代。宿主核对从受管 dataPath 到员工根的完整父链及目标路径；符号链接仅显示，不遍历。

### 3.2 外部应用服务

宿主负责“检测应用 → 缓存启动器 → 对已验证路径执行指定打开”：

- 先支持本机常见目录打开场景：Finder/系统默认、VS Code、已安装 IDE、终端软件。
- renderer 只持有 appId、显示名、图标引用、是否可用和目标能力；不传任意可执行路径或 shell 字符串。
- 区分打开目录、打开文件、定位文件等能力；没有合适参数的应用不显示为该目标的可用选择。
- catalog 与平台 resolver 可参考 DSH；复制时保留固定提交及 notice。
- 扫描异步化并缓存，菜单可立即显示缓存/加载状态。图标生成不阻塞菜单出现。
- 启动后软件缺失时仅刷新该项，有限重试；手动刷新应用列表可发现新安装软件。
- 选择可记忆为应用偏好，目标对象仍在点击时核对；切换员工期间不能沿用旧路径请求。
- 使用 argv 和系统打开 API，不把文件名拼成 shell 命令。
- 已有默认 open/reveal 的范围、扩展名行为和错误回执保持；指定编辑器支持哪些源代码文件，须明确声明，不能顺带扩大所有默认打开行为。

优先复用 apps/electron/src/main/main.ts 的 openResource 路径解析，将共用校验抽成宿主函数再增加指定应用 adapter；不要复制一套宽松校验绕开原入口。

拟新增接口可以是 applications.list、path.openWith，名称实施时按项目 IPC 约定定稿；这里未定义或恢复产品 Agent 工具。

## 4. 用户交互终端

### 4.1 复用原 PTY，补完整视图协议

优先从现有 TerminalService / Rust guard 抽出可复用的进程能力，分别服务于预览和用户终端。保留不同 purpose，禁止用户终端直接 attach 到预览服务使用的终端 id。

建议分成四层：

- Process：原 guard 负责真实 PTY、尺寸、进程树退出与残留回收。
- Screen：按 terminalId 维护 headless 终端屏幕与有限 scrollback。
- Transport：订阅、snapshot、顺序增量、输入确认、关闭回执和有界缓冲。
- View：延迟加载 xterm + FitAddon，按 BOAI Token 取色，处理焦点、尺寸与关闭状态。

原内部提示符 hook 与 exec 的命令收据属于预览执行需求。用户交互 shell 的原始输出不应被这套 hook 过滤掉；创建时应区分用途，而非复用预览实例后开放键盘输入。

### 4.2 视图协议的必要语义

拟定语义而非直接照搬 DSH Remote：

- create：携带已核定 owner、cwd、shell；同一创建请求幂等，返回真实 terminalId。
- attach：返回 attachmentId、generation、屏幕基线 sequence 和终端状态，然后开始顺序增量。
- write / resize：携带输入 sequence；宿主校验有效 attachment 和尺寸/输入上限，回确认。
- renderAck：仅在 xterm 完成写入后推进相应输出序号；renderer 慢时不能无限堆积输出。
- detach：释放订阅和输入控制，保持 PTY。
- close：幂等停止该终端进程树并确认实际退出，不能只停止读取。
- reconnect：发现序号缺口、过旧游标或缓存截断时取新屏幕基线，不能从任意 ANSI 片段假装完整续播。

宿主维护屏幕时同样需要消费队列上限/背压，不能只限制 renderer 一侧而让原始 PTY 数据无限排队。输出过载时保留实际进程状态和可重连信息。

一次传输异常不自动重发未知 shell 输入，避免命令执行两次。宿主重启后新 shell 必须新建 terminalId，不能复用旧 id 暗示工作仍在原进程中。

### 4.3 环境与界面

- 初始目录沿员工独立 workspace 或明确选择的获准目录，不新建一个全局 DS Bot 工作区。
- shell 初期沿 BOAI 当前平台能力；要增加 shell 选择时，只展示宿主确认可用的 shell。
- 明确交互/登录 shell 启动参数与 PATH 来源，验证常用工具是否可用；不静默修改用户启动配置。
- xterm 负责字符流、颜色、输入法、选择复制、光标和交互程序；外层工具栏继续 BOAI 样式。
- 切标签、收起、放大和拖宽度不重启 shell；隐藏时不抢焦点、不进行零尺寸 resize。
- 全部用户终端、预览进程和员工执行命令拥有可区分身份；关闭其中一个不得停止另两个。
- 不恢复旧 terminal.* 员工工具/CLI 能力作为 UI 的隐含副作用。需要的宿主终端接口与旧退役协议分清楚，现有兼容拒绝仍按原合同保留，除非后续明确调整对应产品能力。

### 4.4 体验修复合同（2026-10-25）

- 可见终端通过挂起读取等待实际输出；输出到达即唤醒，不再固定等待80ms。隐藏取消当前读取，已退出终端完成最后一帧后停止读取。
- xterm实例归terminalId所有；同一标签隐藏和显示保留实例、滚动及选择，不因active变化销毁后重建。真正关闭或终端身份变化时释放。
- Main按有界块合并同轮小段输出，再交给headless解析；保留渲染确认、截断后的屏幕基线、背压和错误状态。
- create/attach保持工作区路径核验；已有attachment的输出读取不重复遍历文件系统，输入仍核验业务scope。清空、删员工、群移除成员和renderer重载沿真实宿主撤销attachment并唤醒挂起读取。
- 输入允许有界流水发送，确认必须保持原序号与顺序；未知写入结果停止输入并提示核对，不能自动重放命令。
- 使用现有BOAI终端字体角色、字号、行高、详情背景、明暗ANSI颜色、选区和光标；shell通过OSC设置颜色时保留其有效覆写，重置后回到当前主题。
- 修复detail-session到终端屏幕的高度链。隐藏时不fit，尺寸未变化不重复resize；切回可见时重新测量并恢复输入焦点。

## 5. 独立浏览器的 Cookie 导入

### 5.1 用户流程

入口位于现有独立浏览器工具栏菜单，保持窗口和页面视图架构。

工具栏“导入 Cookie” → 菜单选择“从文件导入”或本机浏览器profile → 原生确认框展示来源、站点与数量及跳过原因 → 确认写入 BOAI 浏览器 → 原生结果框报告写入/读回/落盘 → 用户选择刷新。文件来源继续通过原生选择器读取Netscape cookies.txt / JSON。保持独立浏览器布局。

预览文案说明导入的是应用级浏览器登录状态；相同 Cookie 可能覆盖已有记录。站点列表初期可以是信息预览，不能画出勾选 UI 却让后台仍导入全部。

菜单中的账户是本机profile显示名，不是调用浏览器云账户服务。列出Chrome、Edge、Brave、Chromium和Firefox已存在的可用profile；点击来源后才提取其Cookie，继续复用同一pending/apply流程。扫描只读取profile元数据与文件存在性，不预先读取各账户Cookie值。

工具栏为独立固定高度View。菜单展开时临时扩大工具栏View的覆盖高度，网页原有bounds保持；关闭菜单、导航、失焦和销毁时恢复，透明区域不能留下阻挡网页操作的覆盖层。

### 5.2 主进程边界

- file picker、文件读取、临时目录、CDP 提取、Cookie 值和 Electron session 写入均在主进程服务中；较重解析/数据库操作可放受控 worker。
- toolbar preload 暴露最小类型接口；网页内容进程拿不到导入能力。
- 文件读取在分配大缓冲前检查大小，并有实际读取字节/条目上限；原 DS Bot 是读完后再检查大小，不能照搬为唯一限制。
- pending 绑定请求窗口、目标 application partition、profile generation、来源及过期时间；应用清理、目标变化和取消都使其失效。
- renderer 只获得无值预览/结果，Cookie 不进入聊天、日志、运行 Trace 或模型上下文。
- 既有 browser IPC 不携带凭据的合同继续成立；不要把导入做成向 Agent 返回明文 Cookie 的工具。
- IPC 不接受 renderer 自报任意 partition，也不把 Cookie 写进工具栏 UI 分区。
- apply 与浏览器控制/清理在 BrowserService 的现有串行边界内协调。若 Agent 正在操作，沿原用户接管或就近等待流程，避免半批 Cookie 写入期间继续操作旧账号页面。
- 导入改变账号状态后，更新浏览器状态/证据版本，使旧页面证据不能在新登录状态下直接复用。

这些是实现中必须补齐的时序语义，当前没有修改 BOAI 浏览器权限或新增普遍审批。

### 5.3 正确性约束

- host-only / domain、SameSite、Secure、HttpOnly、expiry、session cookie 按规范化规则保留。
- partitionKey 必须在解析、身份键、写入和读回整个链路贯通；所用 Electron 不支持时明确跳过并说明。
- Cookie 身份使用结构化字段，不用无分隔字符串拼接。
- 主进程比较读回值和关键属性；考虑 Chromium 的合法规范化/寿命截断，必要时报告调整，不能仅凭同名记录存在宣告成功。
- 结果分别报告成功、跳过、失败、读回不一致及落盘状态；批次中途失败不声称回滚。
- pending 一次消费；如重试，需要明确已经写入哪些，不能把不确定结果自动重复应用。
- session cookie 不擅自改成永久 Cookie；应用退出后的保持语义单独验证。
- localStorage、IndexedDB 不在首期 Cookie 导入范围，结果明确说明登录可能仍需站点验证。

### 5.4 本机 profile 提取不能跳过的验证

- 扫描与提取分离：列出来源不读取所有站点的 Cookie 值。
- 点击一个来源后才复制该 profile；同时存在多个同名 profile 时用稳定内部身份区分。
- Chromium 明确选择目标 profile，验证 profile A 的标记不会从 B 返回。
- 使用源浏览器自身可执行程序与临时副本；验证 OS 密钥服务、Chrome 系版本和权限提示等真实行为。
- 源浏览器正在写数据库时验证副本一致性，不把“copyFile 没报错”当成快照成功。
- 如需关闭源浏览器，必须有产品内明确“关闭并导入”操作；取消不得关浏览器。不能后台自动 taskkill 用户浏览器。
- 临时进程和副本在成功、失败、取消、超时均可回收；清理失败有无凭据诊断。
- Firefox 容器与不支持的分区语义不能拍平导入默认上下文。
- 本机优先在用户使用的 macOS 开发环境验证；Windows/Linux 各有自己的提取和退出证据后再声称支持。

真实平台验证结果以第9节为准；源码具备候选路径不代表所有平台的浏览器版本和密钥环境都已验证。

## 6. 代码落点与复用边界

已有位置：

- [detail-panel/tabs-state.ts](../../../apps/electron/src/renderer/components/detail-panel/tabs-state.ts)：开始/文件/终端标签记录、scope、去重和关闭语义；旧 terminal 输入当前被忽略。
- [detail-panel/index.tsx](../../../apps/electron/src/renderer/components/detail-panel/index.tsx)、[tab-session.tsx](../../../apps/electron/src/renderer/components/detail-panel/tab-session.tsx)：标签栏、布局、生命周期和未保存守卫。
- [app-shell/index.tsx](../../../apps/electron/src/renderer/components/app-shell/index.tsx)：新面板入口和 active 传递。
- [ConversationFiles](../../../apps/electron/src/renderer/components/work-views/conversation-files.tsx)：原聚合列表上方工作区工具栏，保留全部业务。
- [main.ts](../../../apps/electron/src/main/main.ts)、[IPC 类型](../../../packages/shared/src/ipc/index.ts)：复用 openResource 校验，加入应用列表与指定打开。
- [TerminalService](../../../packages/runtime/src/modules/workspace-tools/terminal-service.ts)、[Rust PTY](../../../packages/runtime/src/adapters/process-guard/terminal.rs)：进程层复用，补用途隔离；不破坏预览。
- [BrowserService](../../../apps/electron/src/main/browser/browser-service.ts)、[BrowserPaneManager](../../../apps/electron/src/main/browser/browser-pane-manager.ts)：目标分区、导入与控制时序。
- [browser-toolbar.tsx](../../../apps/electron/src/renderer/browser-toolbar.tsx)、[toolbar preload](../../../apps/electron/src/preload/browser-toolbar.ts)、[browser IPC](../../../packages/shared/src/ipc/browser.ts)：独立窗口导入入口及无凭据 DTO。

拟新增模块：

- 主进程 application-catalog / application-resolver：从 DSH 适配应用探测和启动规则。
- 主进程 cookie-parser / cookie-import-service / browser-profile-source：从 DS Bot 适配，但修正 01 第 5.3 节。
- runtime user-terminal screen/transport 层与 renderer TerminalTab：借鉴 DSH 协议，复用 BOAI PTY。
- 简单 DetailStart 内容组件：沿 BOAI 原组件体系。

这些名称只是职责建议，尚未创建实现文件。实际复用记录应包含 upstream path + commit + license + 本地修改说明；不因模块有同名文件就把上游测试结果算作 BOAI 通过。

## 7. 实施顺序

- RP0：完成本文研究和源码基线。当前完成的是文档，不是产品能力。
- RP1：性能基线、开始页与生命周期检查。先保持原组件，按测量决定布局优化。
- RP2：文件工作区工具栏、应用探测/缓存与外部打开；复用原文件业务。
- RP3：用户终端视图、屏幕恢复和传输；优先保留原 guard，验证预览与员工命令互不影响。
- RP4：文件 Cookie 导入及无值预览/确认/读回；保持独立窗口和应用级登录分区。
- RP5：本机浏览器 profile 导入，补跨 profile、密钥服务、取消/清理和锁定情形。

RP2 与 Cookie 核心可独立交付，但完整终端和本机导入不能因为第一阶段菜单能展示就标记完成。代码实施遵循仓库共享工作流；本文件不自动启动其他暂停目标或提交推送。

## 8. 固定验收场景

### 8.1 功能与原业务

- 无标签进入开始，打开文件、重复打开文件、新建两个终端、切换、关闭最后一个、收起重开，顺序与焦点正确。
- 员工私聊、群内明确员工、群文件、渠道文件各验证真实路径；不同员工不串 cwd。
- 文件筛选、分页、知识资料、附件/成果预览、原消息定位及未保存退出全部保持。
- 软件存在/缺失/运行中/卸载后/新安装后，菜单与启动结果匹配；含空格和非 ASCII 的路径正确。
- 未获准路径、符号链接实际落点、无原件文件仍沿原校验，不因指定应用而放宽。

### 8.2 终端

- 真实 PTY：交互 shell、方向键、中文输入、Ctrl-C、颜色、全屏交互程序、尺寸变化。
- 大量输出时切换文件/聊天，输出队列与内存有界；慢 renderer 能恢复，不无限塞 IPC。
- 输出跨 UTF-8/ANSI 边界、缓冲截断、序号缺口、重连后屏幕与真实进程一致。
- 切换/收起不杀进程；关终端准确回收子进程树；取消/退出/崩溃恢复无误认 PID。
- 两个终端、网页预览和员工执行同时存在，输入和停止对象互不混用。
- renderer 重载与宿主重启分开验：前者连接仍存进程，后者不得谎报原进程恢复。
- pnpm dev 真实启动环境验证 shell 初始化；打包版支持由其独立证据证明。

### 8.3 Cookie

- Netscape、扩展 JSON、storageState、空/坏格式/超大文件、过期/重复/会话 Cookie。
- host-only/域 Cookie、SameSite、HttpOnly、Secure、分区键保留或明确跳过；旧同名不同值不能被误判为新值成功。
- pending 取消、过期、重复 apply、目标清理/重开、主进程中断及部分写入都给出真实结果。
- 写入目标确为现有 BOAI 浏览器页面分区，工具栏分区没有 Cookie，前端/日志/Trace 无值。
- 导入改变登录时，原 Agent lease/页面证据按现有控制语义失效或更新，不在错误账号下接续旧动作。
- 本机 profile A/B 含不同测试标记，选择谁就提取谁；来源浏览器副本、临时子进程可核对回收。
- 锁定时取消不关闭源浏览器；明确关闭后，报告实际重开结果，不承诺还原未验证的窗口。
- 使用受控站点验证刷新后的登录结果；“cookies.set 成功”与“站点登录成功”分开记录。

### 8.4 流畅性与资源

建立相同窗口、相同材料、相同开发进程版本下的前后对照：

- 首次打开文件/终端耗时，与已打开标签切换的 click-to-next-paint 分开。
- 连续 100 次切换/收起重开，记录 p50/p95、主线程长任务、React commit、layout/paint 和 DOM/监听器/堆趋势。
- 常规文件列表及有界大列表、持续终端输出、聊天流输出同时进行时，各入口可操作。
- 拖宽度、窗口缩放、减少动态效果、键盘切换与焦点恢复。
- 隐藏时停读/停测量，关闭后监听器及订阅释放；缓存增长有归属和回收条件。
- 对比先使用现有 BOAI 基线；出现退化必须解释或修正。具体毫秒门槛在基线记录后固定，不用截图或主观“一点不卡”代替数值。

本地机制检查和真实 UI 性能证据分开；UI 自动化沿仓库 GitHub CI 约定，现场 pnpm dev 的体验结论必须来自实际应用，不由源码或 curl 推导。

## 9. 唯一实际进度

2026-10-24 阶段范围：当时用户仅授权架构参考与文档 git cp，以下研究事实保留；2026-10-25 新授权与实现记录见本节后半。

2026-10-24：

- 已完成：固定 DS Bot / DSH / BOAI 源码研究；对照四张截图；形成机制、适配、代码落点与验收文档；更新文档索引。
- 已明确：保留 BOAI 业务/样式/独立浏览器；文件聚合不变；优先复用既有 PTY；Cookie 导入需修正分区、目标绑定和读回验证。
- 校验：本轮仅进行文档链接、引用源文件存在性和 diff 空白检查。
- 未实施：开始页、文件工具栏、应用探测、交互终端、Cookie 文件/本机导入。
- 未验证：性能、真实 shell、外部软件启动、真实 Cookie 提取/站点登录、跨平台和打包行为。
- 未执行：模型请求、Cookie 读取/导入、浏览器关闭、产品测试、构建、提交或推送。
- [终端退役记录](../3.前端重构与功能/24-会话终端移除范围与实施计划.md)保持历史事实；本组是用户新要求下的研究与重新引入候选，不追溯修改原通过/失败记录。


### 2026-10-25：独立工作区实施

- 用户明确要求新建 worktree 实现工作区文件浏览、终端，并在现有独立浏览器增加 Cookie 导入小功能。
- 工作区：`/Users/wangwenbo/Desktop/demo/boai/boai-workspace-files-terminal-cookie`，分支 `feat/workspace-files-terminal-cookie`，基线 `origin/main@a4f6a3b1`。未切换主目录或重启本人现有应用。
- 文件：现有详情标签新增工作区开始/目录视图；群聊先明确选择员工。宿主从当前员工/会话核定稳定员工工作区，逐层拒绝符号链接，目录每页100项、单目录最多20000项、游标核对目录身份；前端复用TanStack虚拟行，隐藏停读、同目录重开保留已加载页和滚动。原会话附件/成果/知识入口保持。macOS扫描固定常见已安装应用，缓存5分钟并支持手动刷新；Linux探测已知编辑器命令，其他平台使用系统默认。
- 终端：桌面专用 `workspaceTerminal`，独立交互ledger，复用Rust PTY并显式登录shell；预览PTY及员工工具保持各自身份。headless屏幕/有界历史、pull帧与渲染确认、输入序号、附着代际、隐藏detach保活、明确关闭确认退出。xterm按需加载，非零尺寸按帧合并；原 terminal.* 员工/CLI操作继续退役。
- 清理：新增私有 `closeUserWorkspace` 宿主回调，原会话清空和员工删除先排空用户终端。运行服务在整个清理期间阻断新工作区访问；根核验可在原串行事务等待期间读取，避免创建/清理互等。应用退出失败后只在旧owner真实排空后恢复新owner。
- Cookie：独立浏览器工具栏新增文件导入，原生文件选择/无值确认/部分结果与可选刷新；只写现有应用partition。2MiB/5000项上限、5分钟一次性候选、host-only/域/SameSite/Secure/HttpOnly/会话有效期、重复与过期处理、明确跳过分区Cookie；写后逐项读回并flush。员工控制互斥、关闭/清登录资料等待在途写入退出，原页面证据失效。Cookie值不通过renderer或模型。
- 未实施：本机浏览器profile提取；未新增右侧浏览器、DS Bot样式或员工执行后端。
- 代码与机制检查在本轮持续进行，下方记录实际最终结果。GUI场景已补入原BDD体系；尚未执行实际Electron桌面、真实Cookie登录站点、外部应用启动、跨平台与100次切换性能验收，不宣称达到DS Bot流畅度。


本次复核与最终验证：

- 静态review发现并修复：renderer重载期间在途创建/附着/输入缺少client代际核验；应用退出其他步骤失败后已关闭终端owner不能恢复；工作区根祖先目录符号链接可绕过原目标范围。对应加入故障回归，旧进程未确认排空时不重置owner。主窗在终端恢复/初始化等待前后也核对页面代际。
- 原Rust PTY在连续输出时可能长期停留在读循环，本轮限制单轮最多32×8KiB读取，再处理输入/resize。实际yes输出下发送Ctrl-C、恢复prompt、读回stty尺寸与进程退出均通过。
- 最终14个定向Vitest文件共284项全部通过。其中工作区文件7、宿主根/清理4、终端宿主15、标签新增5、Cookie核心10/宿主5；原PTY共10项（含新增真实交互3项）、原服务125项、原浏览器与标签/协议回归保持。数量均来自同一最终批次，不叠加此前65/134/158批次。
- tsc --noEmit、改动前端ESLint、Rust guard编译、Renderer Vite构建、Main与专用browser preload打包、BDD生成、frozen/offline lockfile校验及Git差异/文档链接检查通过。Vite仍报告现有大型chunk警告，未调整警告阈值或把构建结果称作性能验收。
- 中途类型检查暴露标签Action窄化与新增测试缺少observedThroughSequence，均修正后通过；首次新worktree完整依赖下载等待未完成，已停止该安装，使用独立依赖副本和固定xterm包完成检查。完整冷安装仍未另行验证，主目录依赖和运行进程未修改。
- 新增2条BDD场景源码沿原browser-migration/terminal-lifecycle：工具栏Cookie选择后取消及无值传递、工作区目录/群员工选择/实际终端输入/切换保活/关闭。BDD生成通过，未执行Electron GUI场景。
- 以上没有读取个人真实Cookie、关闭外部浏览器、运行模型、验证真实站点登录或启动用户安装的外部编辑器。跨平台、发行包和100次切换性能尚未验收，不据本地测试宣称界面完全不卡。
- 实现仍在独立worktree，未提交、推送、合并、部署或切换本人现用主进程；后续Git交付沿新的明确指令。

### 2026-10-25：现场启动与私有请求分发修复

- 用户要求在本worktree执行 `pnpm i` 和 `pnpm dev`；安装成功，应用按现有个人数据路径启动。此为已有依赖下的安装，不等同完整冷安装验证。
- 人工打开工作区时报 `Error invoking remote method 'boai:request': Error: 未知或未公开的桌面请求`。根因是Main已调用内部 `getWorkspaceRoot`，但worker和附着桌面共用的 `dispatchRuntime` 缺少私有分支，导致请求落入公共准入检查；底层service虽已实现却无法到达。
- 修复仅在原dispatcher增加明确私有分支，继续复用service的严格输入、员工/会话归属、关闭屏障与路径检查；renderer公开表中的 `getWorkspaceRoot`、`closeUserWorkspace` 仍为false。
- 原宿主根测试绕过dispatcher，无法捕获该故障；现已改为经过实际dispatch，并增加文件列表/终端列表完整服务链路及公共入口拒绝断言。修复前定向用例稳定复现同一错误，修复后5文件43项全部通过，`tsc --noEmit`通过。该43项是本次修复批次，不与此前284项累加。
- 已重新执行本worktree的 `pnpm dev` 加载新Main/worker。实际Electron中，DS工作区显示目录、路径及文件；新建终端显示真实zsh登录提示符，原未知请求错误未再出现。应用保持运行交由用户继续查看。
- 本次只验证文件/终端打开路径；未扩展为完整GUI、Cookie登录、外部应用或性能验收，未调用模型、提交或推送。

### 2026-10-25：体验反馈补充研究

- 用户反馈终端主题与流畅度不足，并要求重新核对DS Bot自动列出浏览器账户的Cookie导入。当前源码、上游固定版本、隔离服务微基准、缺口与实施顺序已记录于[01第7节](./01-DS-Bot源码机制与BOAI对比.md#7-2026-10-25终端体验与本机-cookie-来源复核)。
- 确认80ms轮询、细块逐个等待解析、active切换重建及重复根查询的开销；主题未接终端字号/完整选区。服务微基准不代表现场按键/绘制延迟，也未完成两款软件的性能对照。
- 确认DS Bot列的是本机profile，BOAI目前缺少listSources/prepareSource；后续沿当前独立浏览器和原Cookie目标绑定实现，不迁移DS Bot产品布局。
- 本轮只更新研究文档与进行隔离测量；没有修改产品代码或读取真实浏览器Cookie。现场尺寸诊断未取得数值，布局高度仍标为待验，原实际打开通过不升级为完整性能通过。

### 2026-10-25：终端体验和本机浏览器来源修复

- 用户明确要求“这几个问题修复一下，直接完全修复”，继续使用原worktree，现行范围扩展为本节和4.4/5节。未改变员工、会话、独立workspace或独立浏览器布局。
- 终端宿主改为数据到达唤醒的挂起读取；支持取消等待，清理/退出/重载均能结束挂起请求。小块输出合并后送入headless；read/ack不再逐次做路径遍历，write沿新的私有轻量归属核验。成员移除先排空精确员工×会话范围，其他成员和其他会话保持。
- renderer按terminalId保留xterm实例，隐藏停读/停测量，显示继续增量；输入最多32KiB和4笔在途，按确认顺序推进，未知写入不自动重放。退出必须消费最后一帧；192KiB跨三帧尾输出已有回归。
- 终端字体、字号、行高、详情背景、光标、选区与明暗ANSI沿BOAI配置；程序OSC调色板在主题变化、重连、历史溢出后保留，reset返回当前主题。补齐详情高度链，过小尺寸不发送非法resize，恢复可见后测量，必要快照保留阅读位置。
- Cookie菜单自动列出Chrome/Edge/Brave/Chromium/Firefox本机profile，支持刷新与部分来源失败反馈。只展示名称和opaque id；点击来源后才复制其数据库/sidecars/Local State，在临时目录调用对应浏览器pipe CDP解密。明确指定所选profile、保留旧Cookies及Network/Cookies原布局，身份变化拒绝继续且要求刷新，不回退到其他账户。
- Firefox依据实际schema区分新旧SameSite与秒/毫秒expiry，跳过容器和分区Cookie。源提取限时、限量、单并发；关闭BOAI浏览器会取消并等待临时进程/副本清理，不关闭日常浏览器。继续复用原应用partition、无值确认、逐条写后读回与落盘核验。
- Cookie菜单在原48px工具栏View内按打开状态临时扩大覆盖范围，页面bounds保持；关闭、失焦、导航、崩溃及导入对话框前均恢复。沿BOAI Dropdown与Sonner，错误/过程不另加页面状态文案。
- 真实官方Chrome测试使用独立临时user-data-dir，建立A/B两个profile和虚构fixture.invalid Cookie。实际加密落盘后按B→A顺序提取，值与所选profile一致，临时副本全部删除；没有读取个人Cookie。首次实际测试因旧Cookies位置被错误移到Network而返回空库，修复并复验通过。此结果不代替真实网站登录、其他浏览器/平台和钥匙串权限环境验证。
- 同一隔离服务微基准（真实headless、模拟PTY，不含Electron IPC/真实shell/GUI）：128KiB拆成128B×1024由1184.024ms降至14.307ms；192KiB连续三帧由32.553ms降至7.213ms；250次read由30.182ms/250次根解析降至0.766ms/0次根解析。另行模拟轻量身份核验配置的250次write无路径解析；该时间不能当真实按键延迟。
- 第一轮统一18文件337项为336通过、1失败：真实PTY关闭后后台sleep子进程仍可被kill(pid,0)观察到。原断言与期限保留，退出竞态继续修复，不能把这批结果写成全通过。全项目TypeScript、定向renderer ESLint与完整build通过，Vite仍保留现有大chunk提示。
- 第一轮真实Electron两场为Cookie通过、终端失败。Cookie实际打开来源菜单、进入文件项、分别取消选择/确认，菜单展开不裁切、收起恢复48px且登录库没有写入；终端在运行列表的`starting`状态未更新处失败，尚未走完后续切换/关闭。原件保存在`/tmp/boai-workspace-bdd-first`，后续修复沿原断言复验。
- 已修复上述两项：屏幕信息从原生owner同步ready状态，退出仍按最后输出序号交付；PTY结束只signal外层guard，避免先关stdin切断子进程祖先。新增仅PTY使用的清理完成回执，macOS按原unique/uid身份等待实际PID回收，缺回执时close明确失败；普通Agent/recover/watch-desktop的原语义保持。
- 退出故障补验：原即时PID消失断言固定60次复验全部通过，缺完成回执负例拒绝成功；Rust的确定性zombie、原audit-token和ledger隔离3项通过。原60次诊断中第58次失败的事实与日志保留，不用延长等待或放宽断言隐藏竞态。Linux/Windows未实测，不能据macOS结果授予跨平台资格。
- 最终修复、桌面验证与未验范围在本节后续记录；当前未提交、推送、合并或打包发布。

本轮最终结果：

- 最终统一19个Vitest文件342项全部通过；TypeScript、定向前端ESLint、完整build、BDD生成、Git差异与本专题链接/Header检查通过。Rust3项与固定60次PID回收专项按上方分别记录，不重复累加到342项。
- 终端第二批Electron已走完真实输出、满高布局和十次标签切换，但末尾测试错误要求已关闭对象仍留在活跃列表，得到undefined而失败。修正测试后，关闭成功必须同时满足活跃列表不含原终端、实际shell PID已消失、owner账本已排空，未补发close来代替用户点击；原失败留在`/tmp/boai-workspace-bdd-second`。
- 最终终端Electron完整场景通过；组件回归另外验证100次active切换只有1次xterm创建/attach。稳定帧截图已检查，终端填满右侧可用高度，字体、普通前景、背景和ANSI颜色清晰；保留原BOAI面板样式。真实桌面是10次切换，100次属于组件层，不混称现场性能结果。
- 两条Electron场景为分批通过：Cookie来源菜单/文件取消链路通过，终端输入/切换/关闭最终复验通过。没有运行全量18项UI视觉回归，没有修改既有视觉基准。
- 最终源码再次运行原微基准：128KiB/128B小块12.559ms，192KiB连续三帧9.113ms，250次read为0.731ms且无路径解析。原阶段14.307/7.213/0.766ms记录保留，单次计时存在波动；未把模拟PTY数据称作真实按键或整机帧时。
- 已在本worktree重新运行`pnpm dev`，实际Main/worker从新构建启动，服务使用5187端口，保留开发版运行供本人查看。个人窗口的CUA读取分别在30/60秒超时，未取得其目视验收；上述桌面证据来自隔离Electron窗口，不冒充个人窗口或账号登录结果。
- 未读取个人Cookie、修改shell配置、关闭日常Chrome或调用模型。真实网站登录、其他来源浏览器实机、Windows/Linux、发行包和长时间资源曲线未验；本轮已修复已确认问题，不宣称达到所有环境“完全不卡”。主worktree保持未修改，当前改动尚未提交、推送或合并。

## 10. PR23新目录整合

2026-10-26用户要求保留最新apps/packages结构和本PR全部功能。原fdbef412提交完整合入PR23整合候选，Electron宿主/UI、运行核心/PTY与共享IPC迁至对应包；原实现和验证/失败记录保留。合成版本的185项定向、完整构建、3条桌面检查及剩余边界统一见[第26组02 §10](../26.Workspace工程结构重构/02-实施步骤与验收.md#10-2026-10-26-main与pr25目录整合)。最终从PR23统一合入main，本分支保留为原功能来源。


## 11. 2026-10-26：终端复用应用主题与关闭误报

本轮按用户要求在当前main目录续改，保留同轮设置页与Cookie菜单修复，不运行E2E。用户随后明确终端直接复用现有应用主题，因此撤销本轮新增的独立终端主题选择及保存字段。

- 终端跟随现有外观的实际应用主题ID、明暗模式、全局背景/前景/光标/选区，以及代码字体/字号。Base46主题使用同一份`base46.json`；自定义颜色仍从当前CSS语义变量解析，停用主题插件后跟随应用的实际回退主题。非Base46主题保留原有明暗ANSI色板。
- ANSI 16色映射采用固定版本`7df2bd89295db00b649cbc49bdf6fe5a1cc5df3b`的[上游term.lua](https://github.com/NvChad/base46/blob/7df2bd89295db00b649cbc49bdf6fe5a1cc5df3b/lua/base46/term.lua)，沿现有MIT许可。不修改用户shell配置；程序OSC覆写跨主题变化保留，reset恢复当前主题。
- 设置页不再增加终端分区，偏好、patch/schema及Main加载均移除独立`terminalThemeId`；已有配置中的该字段被忽略，下一次正常保存不再写入，其他偏好和版本保持。不再需要为新增保存字段重启主进程。
- 关闭误报来自原先直接结束PTY而页面仍在挂起读取：宿主关闭唤醒读取后抛出“终端正在关闭”。保留前一轮修复：先同步停止已挂载视图的输入/测量/读取，等待解除附着及迟到attach清理，再调用原关闭请求。宿主确认exited后才移除标签；关闭失败仍报真实错误，并重新连接保留的终端。没有按错误文本吞错，也不将未知输入重发。
- 此前独立配置候选的5文件43项及类型/定向lint通过属于旧批次；当前复用主题候选的检查结果另行登记，不把旧结果移作本次证明。
- 当前候选4个定向Vitest文件38项全部通过，覆盖应用主题切换、Base46 ANSI映射、原明暗回退、旧字段清理和关闭顺序/失败恢复；全项目TypeScript、相关前端ESLint及Git差异检查通过。Main、外观store/schema和终端CSS已撤回本轮独立主题增量，生产代码无独立终端主题字段残留。
- 未运行E2E、真实PTY关闭、截图/视觉基线或个人窗口验收，未重新构建或重启当前开发版。

### 同日反馈：VS Code Plus 的文字颜色未变化

- 当前外观文件选择`vscode-plus-dark`，前一版仅映射Base46，其他主题共享旧ANSI色板；因此VS Code Plus仅背景等语义颜色跟随，标准彩色文字仍是旧色。这是适配遗漏。
- 只读确认本机zsh使用Starship；单独输出directory/character模块并仅提取SGR，分别为`1;36`与`1;32`，确认为标准青色/绿色，而非固定RGB；没有执行完整prompt或读取云账号凭据。终端快照序列化也保留ANSI索引。
- 在原终端适配中补VS Code Plus明暗16色，来源为[VS Code固定提交的terminalColorRegistry](https://github.com/microsoft/vscode/blob/af3b54ddd0c4f81765fc218856e2e73491051092/src/vs/workbench/contrib/terminal/common/terminalColorRegistry.ts)，并核对Dark+/Light+及继承主题未覆写ANSI色板。应用主题ID仍是唯一选择；BoAI回退、Base46和程序OSC覆写保持。
- 程序显式输出的RGB、扩展256色或自行设置的OSC颜色不强制重染；标准ANSI 16色随应用主题改变。没有修改用户Starship/zsh或外观配置。
- 本批2个终端定向文件17项、全项目TypeScript、相关renderer ESLint与Git差异检查通过；主题切换回归核对VS Code Plus明暗的青/绿/蓝色，同时保持同一终端实例/附着。未运行E2E、真实窗口视觉验收、构建或应用重启。
