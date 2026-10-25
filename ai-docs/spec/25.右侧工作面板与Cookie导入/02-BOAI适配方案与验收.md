<!--
[OUTPUT]: 2026-10-25源码链接随Workspace迁移更新，历史验证结论保持。
[INPUT]: 用户保留 BOAI 业务/样式/独立浏览器的要求，以及 01 的固定源码结论。
[OUTPUT]: 早期适配方案及历史进度保留；用户最新仅要架构参考，本组不在当前执行范围，未实施。
[POS]: ai-docs/spec/25.右侧工作面板与Cookie导入/02-BOAI适配方案与验收.md。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->

# BOAI 适配方案与验收

更新：2026-10-24。本文保留早期适配候选和验收设计；按用户最新范围，不作为当前产品/UI实施依据。现行工作归 [架构补充调研](../../2026-10-24-DeepSeek-Bot架构补充调研.md)及第24组Mastra容量专题。

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

保留 ConversationFiles 的聚合业务，在顶部补工作区工具栏：

- 员工文件页：显示该员工 workspace，明确标注“员工工作区”。
- 单个会话范围：宿主确有该 conversation 工作区时显示其真实路径，并标注“会话工作区”。
- 群里明确打开某位员工：显示该员工 workspace，保留群上下文及员工身份。
- 当前对象没有单一有效工作区时，不伪造路径；保留文件列表，路径相关动作不可用。
- 路径支持省略显示和完整值查看/复制，主内容滚动不带走工具栏。
- 列表刷新沿原查询，不为了刷新附件/成果而递归扫描磁盘。
- 具体文件的外部打开/定位沿该文件原件路径，与顶部工作区打开分开。

路径栏描述工作区，不声称下方聚合列表是该目录的文件树。现有“会话文件 / 知识资料”、筛选、分页和“查看原消息”保持。

裸磁盘树不是本轮默认替换方案。若以后确实增加工作区目录浏览，可复用 DSH 的目录状态/取消模型，并沿 BOAI 原目录授权读取；这是附加视图，不能吞并已交付文件业务。

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

优先复用 src/main/main.ts 的 openResource 路径解析，将共用校验抽成宿主函数再增加指定应用 adapter；不要复制一套宽松校验绕开原入口。

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

## 5. 独立浏览器的 Cookie 导入

### 5.1 用户流程

入口位于现有独立浏览器工具栏菜单，保持窗口和页面视图架构。

来源选择 → 文件/浏览器 profile 准备 → 显示来源、站点与数量及跳过原因 → 确认导入到 BOAI 浏览器 → 部分/全部写入结果 → 用户选择刷新当前页。

预览文案说明导入的是应用级浏览器登录状态；相同 Cookie 可能覆盖已有记录。站点列表初期可以是信息预览，不能画出勾选 UI 却让后台仍导入全部。

文件导入优先实现；本机 profile 读取随后复用同一 pending/apply 流程。两条路径共享规范化与验证，不各写一套 cookies.set。

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

本轮没有运行上述提取动作。

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

最新范围确认：用户明确只要架构参考，本组产品/UI候选不列入当前待执行清单。本次获授权的是文档git cp，保留此前研究事实，不启动产品实现。以下为先前研究阶段记录。

2026-10-24：

- 已完成：固定 DS Bot / DSH / BOAI 源码研究；对照四张截图；形成机制、适配、代码落点与验收文档；更新文档索引。
- 已明确：保留 BOAI 业务/样式/独立浏览器；文件聚合不变；优先复用既有 PTY；Cookie 导入需修正分区、目标绑定和读回验证。
- 校验：本轮仅进行文档链接、引用源文件存在性和 diff 空白检查。
- 未实施：开始页、文件工具栏、应用探测、交互终端、Cookie 文件/本机导入。
- 未验证：性能、真实 shell、外部软件启动、真实 Cookie 提取/站点登录、跨平台和打包行为。
- 未执行：模型请求、Cookie 读取/导入、浏览器关闭、产品测试、构建、提交或推送。
- [终端退役记录](../3.前端重构与功能/24-会话终端移除范围与实施计划.md)保持历史事实；本组是用户新要求下的研究与重新引入候选，不追溯修改原通过/失败记录。
