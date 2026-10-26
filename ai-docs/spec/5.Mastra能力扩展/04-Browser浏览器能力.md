<!--
[OUTPUT]: 2026-10-25源码链接随Workspace迁移更新，历史验证结论保持。
[INPUT]: Browser 浏览器能力相关规格与当前模块实现，以及第 11 组用户确认的原版浏览器迁移路线。
[OUTPUT]: Browser 的历史框架选型、通用边界和源码入口；当前实现路线明确转至第 11 组。
[POS]: ai-docs/spec/5.Mastra能力扩展/04-Browser浏览器能力.md。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->
# Browser 浏览器能力

日期：2026-09-27  
任务：BR1  
状态：**历史框架选型与通用边界；当前产品尚未接入浏览器。**

2026-10-02 用户确认尽量照搬旧 `boai-app`，当前实现入口转为 [第 11 组浏览器能力迁移](../11.浏览器能力迁移/README.md)：保留 Electron 窗口/工具栏/CDP/browser_tool，以 Mastra task 工具和宿主桥接入。下文独立 AgentBrowser provider 的首期建议保留为历史备选，不再是执行指令；授权、文件、取消与备份边界仍适用。新分期 BRM0–BRM4 唯一进度见第 11 组 05，全待实施。

首期采用本地 `@mastra/agent-browser` SDK，为员工提供可见的专用 Chromium 窗口，让用户可以登录、查看操作、接管和停止。浏览器租约与 profile 采用“员工 × 会话”作用域，沿用当前任务取消与授权规则，不默认接管用户日常浏览器或 Electron 产品窗口。

BR1 先交付网页读取、当前任务中的受控交互、人工登录与文件下载。它可以与 [S2 命令执行环境](./03-Sandbox文件系统与Skills.md) 分别推进；二者共享 run、授权、产物和取消规则，但不是同一个进程环境。首期无需云浏览器账号，也不要求接入 Mastra Studio。

## 1. 核验事实与边界

| 来源 | 已核验事实 | 对本项目的含义 |
| --- | --- | --- |
| 当前应用 | task 文件/命令工具已存在；没有 Browser provider、profile 管理或浏览器审批模型 | 不是开启一个配置项即可交付 |
| 已装 core 1.71.0 | 有 `MastraBrowser`、`BrowserConfig`、profile、scope、CDP、launch/close 等基础定义 | 有集成契约，不代表具体 provider 已安装或已通过桌面验证 |
| 官方 AgentBrowser | 独立包，以 Playwright 和 accessibility refs 操作页面，可本地启动 | 首期选择；还要准备匹配版本的 Chromium 并处理打包 |
| 现有开发依赖 | Playwright 用于测试 | 不等于生产安装中已包含可用浏览器、登录存储或许可管理 |

依据：[当前引擎](../../../packages/runtime/src/adapters/mastra/engine.ts)、[依赖清单](../../../package.json)、[已装 Browser 类型](../../../node_modules/@mastra/core/dist/browser/browser.d.ts)、[AgentBrowser 官方集成](https://mastra.ai/integrations/browsers/agent-browser)。本文没有安装 provider 或下载浏览器。

### SDK、CLI 与远程浏览器要分开

| 方案 | 实际运行关系 | 首期建议 |
| --- | --- | --- |
| AgentBrowser SDK | provider 启动/连接浏览器，通过工具操作 | **采用本地专用 Chromium**；浏览器通常在宿主运行，不能声称受 LocalSandbox 或可选容器的命令策略保护 |
| BrowserViewer + agent-browser 等 CLI | BrowserViewer 启动 Chrome，向 CLI 注入 CDP 连接；CLI 可由执行环境运行 | 后续选择；CLI 在 sandbox 内不代表被连接的 Chrome 也在里面 |
| SDK 连接远程 CDP | 本地工具控制已存在的远端浏览器 | 后续明确连接场景；远端 scope、数据和登录归属需独立管理 |
| Stagehand / Firecrawl 等 provider | 有各自的自动化或托管服务能力 | 首期不增加账号、费用和另一套运行路径 |

官网给 Agent 配置 `browser` 后会自动注入 provider 工具。产品不能原样开放工具后期待提示词承担权限控制；应通过受管 provider/工具包装保留宿主检查。[官方 Browser 概览](https://mastra.ai/docs/browser)

浏览器发起网页请求所用的网络属于 Chrome 所在环境。命令环境禁网（例如 LocalSandbox 原生模式 `allowNetwork: false`）不会关闭独立启动的宿主 Chrome 网络；反过来，CLI 如要连接宿主/远端 CDP，需要明确的控制通道，不能为此开放整个宿主网络。若未来要求 Chrome 也在可选容器/VM 内，另做可视化、人工登录和进程生命周期适配，不能仅改变 CLI cwd。

## 2. 每位员工的浏览器与登录资料

员工可配置是否允许浏览器及默认行为，但运行实例、标签页和登录状态默认按 `agentId + conversationId` 分开。群中两个员工不会互相继承 Cookie；同一员工在私聊和群聊也不共享登录状态。基础 Chromium 安装可共用，profile 和活跃实例不可因此共用。

建议由 BrowserService 持有浏览器租约，维护 scope、run、权限版本、profile 引用和活跃状态；Mastra adapter 消费租约，不让模型选择任意 profile、可执行文件或 CDP 地址。一个 profile 同时只允许一个执行租约，用户人工接管时暂停自动操作。

已装 core 类型提供 `profile`、`headless`、`executablePath`、`scope`。配置类型中本地 scope 的默认说明与基类 fallback 描述并不完全相同，因此应**显式指定作用域并测试 provider 行为**；不能依赖未核验的默认值。首期建议按员工×会话分配 provider 实例，使用明确 thread key，避免多个员工共用一个可变的全局 currentThread。

CDP 与 `scope: 'thread'` 在已装类型中不能组合。使用一个共享 CDP 端点，不会凭产品传入不同 threadId 就变成独立浏览器。[BrowserConfig 与生命周期类型](../../../node_modules/@mastra/core/dist/browser/browser.d.ts)、[ThreadManager 类型](../../../node_modules/@mastra/core/dist/browser/thread-manager.d.ts)

### profile 存储建议

新增宿主管理目录 `data/browser-profiles/<agentId>/<conversationId>/`，数据库只保存受管引用与状态。这是将来 BR1 的新增目录，不是当前已存在的结构，也不改变 `v2` 数据根。

- 当前会话期间可保持登录；用户明确选择记住登录后，允许该作用域 profile 跨应用重启复用。否则关闭租约后清理临时 profile。
- 首期通过可见浏览器让用户自己输入密码、验证码或完成扫码；不把这些内容送给模型或写进普通日志。模型连接密钥与 Cookie 是不同种类的秘密，不能复用聊天消息存储。
- 不复制用户 Chrome 默认 profile，不让 Agent 读取 Cookie 数据库、导出 storageState 或取得任意浏览器文件路径。
- 专用 profile 内可能含 Cookie、localStorage 等敏感资料；它不是已经加密的产品备份。目录采用宿主最小文件权限，不挂给命令环境和其他员工。
- 现有备份会复制整个 `agents/`，所以 profile **不能未经备份改造就放进 `agents/<id>/state`**。新目录明确排除普通业务备份；恢复后保留配置但重新登录。
- 清除登录资料先关闭对应租约，再删除受管 profile。其他员工与会话保持不变。遇到 profile 锁冲突显示占用状态，不自动删除可能属于活进程的锁文件。

持久 profile 是否支持指定路径、多个 scope 如何落目录，需在锁定的 AgentBrowser provider 中核验并做真实启动/关闭/重启测试；core 有字段不代表所有 provider 的实现相同。若首个接入版本暂不能稳定复用，先交付当前会话登录并明确显示“退出后需重新登录”，不宣称已记住登录。

## 3. 能力开关、任务授权与单次动作授权

权限分三层，不用一个“允许浏览器”开关代表全部授权：

1. 员工能力：是否允许浏览器。chat、decision、memory 阶段依然不挂 browser 工具；只有 task 可以申请租约。
2. 当前任务：可访问的站点/目的、只读或允许交互、所需登录资料和租约期限。已授权范围内的重复浏览与快照无需每一步打断用户。
3. 明确副作用：发送、提交、购买、删除、上传文件或修改账户等动作必须有匹配当前目标与内容的授权。用户已明确授权的动作由宿主绑定到具体任务；没有匹配授权时展示可审阅动作再等待。

建议扩展持久 Approval 为区分命令与 browser action 的结构，保留旧命令兼容字段。浏览器授权至少绑定 employee/conversation/run、操作类别、目标 origin/对象、待提交内容摘要及 hash、权限版本、有效期和消费状态；一次授权仅消费一次，目标/内容变化后失效。当前审批模型只有命令/cwd，不能把浏览器提交塞成伪 shell 命令。这里是后续契约设计要求，本轮不修改 IPC。

工具包装在调用前检查 scope、run 有效性、域名/动作和授权；调用后再次检查取消与归属，才把结果写回。不能同时暴露一套已包装工具和一套原始 browser 工具。任意脚本执行、CDP 任意命令、Cookie 导出等旁路不进入首期工具集；遇到无法可靠约束的动作转人工接管。

初期开放网页读取、快照和受限交互。导航默认拒绝 `file:`、本地调试端口和未授权的内网站点；授权站点的登录跳转、跨域身份提供方及子资源需要明确策略。只检查最初 URL 不能称为完整网络隔离，重定向、新标签页和实际请求也要测试。若 provider 不能实施请求边界，就缩小开放能力或增加宿主拦截，不在界面展示不存在的站点隔离。

网页内容是外部数据，不能自行申请 profile、扩展域名、开放 shell、改变群成员权限。浏览器访问权限也不意味着网页内容自动公开到群或自动成为长期记忆；分享、提取及来源校验继续经过现有产品路径。

## 4. 文件、凭据与产物

下载先进入当前 run 的受管目录，校验归属、普通文件和大小后交给任务使用；出现在下载文件夹不等于已向群发布。群可见文件仍通过 `publish_artifact` 登记。上传仅允许当前任务明确选中的授权文件，不能让页面文件选择器浏览整个员工或宿主目录。

下载监听、文件路径及取消应由 adapter 管理，不能依赖模型从页面猜路径。失败/取消后清理未登记临时文件；已公开产物按现有规则保留。上传或提交一旦发生，关闭浏览器不能撤销外部副作用，不能在不确定结果时自动重试。

截图与页面快照可能包含个人信息，默认只用于当前 run 的模型输入和有限调试；不记录密码框值，不默认录制整场浏览器。页面证据需要成为产物时显式保存与发布。provider 的 Beta 录制能力不属于 BR1 必需项。[AgentBrowser 截图与录制说明](https://mastra.ai/integrations/browsers/agent-browser)

## 5. 生命周期与桌面体验

按需启动浏览器，提供打开窗口、当前站点、正在操作/等待人工/等待批准、接管与停止状态。首期直接展示专用 Chromium 窗口即可；官网 Studio screencast 不能直接当作 Electron 已有预览功能，不为了预览先引入服务器和 WebSocket 体系。

用户人工接管时停止新的自动操作，已有动作完成或取消后交出控制；用户确认继续时重新读取页面快照，旧 accessibility ref 不继续复用。标签页和浏览器租约归属于当前 scope，不能靠所有线程共享的 activeTab 推断归属。

停止任务、撤销浏览器能力、移除员工或退出时：撤销租约 → 终止等待审批和新工具调用 → 中止当前操作 → 有限等待关闭本 scope 的浏览器/子进程 → 按设置保留或清理 profile。其他 scope 继续工作；迟到页面结果不能发布消息、下载产物或提出新审批。

异常重启后将旧租约标为 interrupted，清理本应用能确认归属的进程。持久 profile 可以在下次明确任务中重新打开，**不恢复旧提交动作、不自动点击、不重复上传**。发生点击成功但回执丢失时保留“结果待核实”，先读页面或由用户核实，不能仅因工具超时就重试有副作用的动作。

## 6. 实施顺序与依赖

BR1 不依赖替换群聊调度算法。共享 [B1 Agent 工厂](../4.数字员工与协作重构/01-数字员工配置与Agent工厂.md) 的 task 装配边界以及 S1 的文件/授权计划即可；B1 尚未抽出时也可以通过当前 engine 的 task 分支接入，避免等待全量重构。

建议逐步完成：

1. 锁定 AgentBrowser provider 与 Chromium 版本，核验本地可见启动、profile、线程、关闭、工具列表及 Electron 打包路径。先用专用临时资料，禁止复用日常浏览器。
2. 增加 BrowserService 租约与 provider adapter，显式区分员工×会话，绑定当前 run/取消信号，只给 task 装配包装后的工具。
3. 接入任务站点范围、持久单次授权和人工接管，先读网页，再开放能明确检查的交互动作。
4. 完成下载/上传、profile 登录复用、退出清理、备份排除和恢复；把浏览器状态接到桌面任务界面。

不先建立通用远程浏览器管理平台。未来远程 CDP、托管 provider 或 sandbox 内 CLI 通过相同租约/审批边界接入；凭据另由 Main 安全存储，不能放 URL 日志或群消息。远程方式的数据去向和持久性重新核验，不继承本地承诺。

## 7. BR1 验收

| 场景 | 必须观察到的结果 |
| --- | --- |
| 基础真实任务 | 打包应用中的员工打开指定测试站点、读取内容、完成获准交互并生成一个明确产物；无需云账号 |
| 普通问候 | chat/decision/memory 不启动 Chrome、不暴露 browser 工具；任务模式转换由现有产品语义决定 |
| 会话隔离 | 两员工登录不同测试账号；同员工两个群也拥有独立 Cookie/标签页；任一方不能看到另一方页面或 profile |
| 登录与重启 | 人工登录可接管，自动操作暂停；选择记住登录后仅相同 scope 恢复登录，否则退出清理；恢复不会重做旧任务 |
| 精确授权 | 已授权只读浏览连续执行；未获准提交等待审批；审批一次消费，改目标/内容/版本即失效，重复回调不重复提交 |
| 导航边界 | 重定向、弹出新窗口、登录域、下载、file URL 与本地调试端口行为符合声明，不能只测初始 URL |
| 文件边界 | 上传只能选获准文件；下载进入当前 run；群里只有明确发布的产物；profile 和密码不进入产物、日志、备份或命令挂载 |
| 取消与失败 | 慢页面、等待人工、等待审批及下载时可停止；关闭一个 scope 不关闭其他员工；超时不盲重试副作用，无迟到发布 |
| 系统退出 | 正常退出/强制结束后归属清楚、profile 锁可诊断；重启不自动执行旧动作；不可确认归属的浏览器不被误杀 |
| 打包与缺失依赖 | Chromium 缺失、版本不匹配、profile 占用能清楚报错；开发机已有 Playwright 不能掩盖干净机器缺浏览器的问题 |

首个发布只宣称实际验证的平台、浏览器动作和登录复用方式。浏览器运行在宿主时，准确描述为“专用浏览器会话与受控工具”，不宣称它受到 LocalSandbox 的命令限制或已在可选容器模式中隔离。自动录制、远程 CDP、复用日常浏览器和 sandbox 内 CLI 均为后续独立选择。

## 8. 核对入口

- 官网：[Browser](https://mastra.ai/docs/browser)、[AgentBrowser](https://mastra.ai/integrations/browsers/agent-browser)、[Filesystem](https://mastra.ai/docs/sandbox/filesystem)、[Skills](https://mastra.ai/docs/skills)。
- 安装版：[Browser embedded docs](../../../node_modules/@mastra/core/dist/docs/references/docs-browser.md)、[MastraBrowser 参考](../../../node_modules/@mastra/core/dist/docs/references/reference-browser-mastra-browser.md)、[Browser 类型](../../../node_modules/@mastra/core/dist/browser/browser.d.ts)。
- 当前应用：[引擎](../../../packages/runtime/src/adapters/mastra/engine.ts)、[运行和审批](../../../packages/runtime/src/service.ts)、[共享契约](../../../packages/shared/src/domain/index.ts)。官网演示表达框架能力，这些源码才表示本项目已实现的行为。
