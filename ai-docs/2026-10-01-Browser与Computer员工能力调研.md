<!--
[INPUT]: Mastra 当前 Browser 官方文档、已安装 core 的 Computer/Browser 文档与工具类型、Daytona 与 E2B 官方集成/API/计费资料，以及 BoAI task 工厂/工作区与按员工授权和真实 Work 的既有边界；后续旧 boai-app 浏览器分析入口。
[OUTPUT]: Browser 先行/Computer 独立沙箱接入与 MCP 后续插件的建议、能力范围、运行对象、BYOK、产品内置/员工授权/启动的默认取舍及当前源码缺口；后续复用旧 Electron/CDP 底座的选型更新；不代表已实现或通过运行验收。
[POS]: ai-docs 中的功能选型调研；供后续规格拆解，尚不是实现完成或运行验收记录。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->

# Browser 与 Computer 员工能力调研

调研日期：2026-10-01。只核对官方文档和本地已安装文档，没有启动浏览器、创建沙箱或调用付费服务。产品路线采用用户本次选择：先内置 Browser / Computer，MCP 后续作为插件扩展；上一份调研的“MCP 先行”是备选建议，不再是当前前置步骤。

后续用户明确先接 Browser，并提供旧 `boai-app` 实现。最新 [源码与迁移分析](./2026-10-01-boai-app浏览器实现与迁移分析.md)建议先复用 Electron/CDP 浏览器底座，通过 Mastra 受控工具接入；本篇独立 AgentBrowser 的首批选型建议据此调整，Computer/MCP 留到后续。授权、作用域、预算、来源与取消边界继续适用；尚未实施。

## 先把三件事分开

**内置能力、员工获授权、启动实际资源是三个不同动作。** 建议 BoAI 内置 Browser 接入，把它做成员工可选择的能力；普通任务按需启动独立会话。Computer 首批默认关闭，用户完成桌面沙箱连接并明确给员工启用后，再在需要 GUI 操作的任务中启动。

| 问题 | Browser | Computer |
| --- | --- | --- |
| 操作对象 | 浏览器页面，通常使用网页结构或 accessibility 信息 | 沙箱中的桌面窗口、鼠标、键盘和截图 |
| 首批推荐 | 本机独立 AgentBrowser 会话 | 选定一个支持 GUI 的沙箱 provider 后单独接入 |
| 普通聊天自动获得工具 | 建议不自动获得 | 不自动获得 |
| 应用启动即创建实例 | 不需要，任务首次使用时启动 | 不需要，任务首次使用时启动 |
| 是否等于搜索引擎 | 否；搜索服务或搜索页面入口仍需明确 | 否 |
| 是否直接控制用户的 macOS 桌面 | 普通独立浏览器不代表桌面控制 | 本次核对的 Mastra 原生接入控制虚拟沙箱桌面 |

此表中的默认行为是 BoAI 产品建议，不是 Mastra 自动提供的权限策略。

建议新员工的 Browser 和 Computer 授权都默认关闭；能力项在产品中常驻可见。用户在员工详情明确启用一次后，获准范围内的常规读取和导航不逐步重复询问；超出原授权目标的外部写动作才需要补充授权。未来如增加新员工默认规则，须由用户明确设置，不能让模型根据“研究员”角色名自动放权。团队创建弹窗继续保持名称/需求两字段。

## 官方 Computer 当前提供什么

已安装 `@mastra/core` 的 `docs-sandbox-computer.md` 明确：Computer 是运行桌面环境的 sandbox 的可选 capability；当前点名支持 `DaytonaSandbox` 与 `E2BDesktopSandbox`。Workspace 根据**静态配置的 sandbox** 注册 Computer 工具；resolver 动态返回的 sandbox 不会在创建工具列表时注册这些工具，其他未支持该 capability 的后端也不会注册。[Mastra Computer](https://mastra.ai/docs/sandbox/computer)、[Sandbox API](https://mastra.ai/reference/workspace/sandbox)。

工具包括截图、点击/双击/右键、移动/拖拽、输入/快捷键、滚动、屏幕信息和等待。动作默认随后截图，PNG 以原生图片消息返回模型。每个工具可设 `enabled` / `requireApproval`，动作还可配置截图开关和延迟；这可以帮助 BoAI 做能力裁剪，但批准交互和持久回执仍需接入 BoAI 的实际执行链。[Mastra Computer](https://mastra.ai/docs/sandbox/computer)、[Workspace tool configuration](https://mastra.ai/reference/workspace/workspace-class)。

本次 Computer 正文与 E2B 集成网页通过网页读取工具访问失败，因此上述正文以仓库当前安装的[官方内嵌文档](../node_modules/@mastra/core/dist/docs/references/docs-sandbox-computer.md)为据；不能假定远端最新版和本地安装版完全相同。

### 操作的是虚拟桌面

Daytona 官方称其 Computer Use 操作 sandbox 内的桌面。Mastra 的 Daytona 集成以 Xvfb、xfce4、x11vnc、noVNC 启动桌面流程，`computerUse` 默认 `false`，设为 `true` 后可懒启动，提供桌面 stream URL。[Daytona Computer Use](https://www.daytona.io/docs/en/computer-use/)、[Mastra Daytona Computer Use](https://mastra.ai/integrations/sandboxes/daytona#computer-use-desktop)。

E2B Desktop 官方仓库明确它是隔离的虚拟桌面，目前模板基于 Linux + Xfce，支持启动 Chrome、Firefox、VSCode 等应用、截图和屏幕流。[E2B Desktop README](https://github.com/e2b-dev/desktop/blob/main/README.md#under-the-hood)。

因此，不能把接上 `workspace.computer` 描述为“员工现在可以操作你的 Mac”。要控制用户本机桌面，需要另一套本机 provider、系统权限及宿主接入；**本次没有核实 Mastra 存在可直接接入当前用户 macOS 桌面的现成 Computer provider**。Docker/本地命令 sandbox 能执行命令也不证明它支持 GUI Computer。

### BYOK 与额外费用

| 层 | 用户配置 | 官方依据 |
| --- | --- | --- |
| 推理模型 | 继续用 BoAI 已配置模型连接 | 模型连接与沙箱连接各自独立；不能用模型 key 替代沙箱 key |
| Daytona 托管沙箱 | `DAYTONA_API_KEY` 或构造参数 `apiKey`；可选 `apiUrl` / region | [Mastra Daytona](https://mastra.ai/integrations/sandboxes/daytona#installation)、[Daytona Authentication](https://www.daytona.io/docs/api-keys) |
| E2B 托管桌面 | E2B 账号和 `E2B_API_KEY` | [E2B Desktop Getting started](https://github.com/e2b-dev/desktop/blob/main/README.md#-getting-started) |
| 沙箱资源 | 独立资源费用和供应商额度 | [Daytona Pricing](https://www.daytona.io/pricing)、[E2B Pricing](https://e2b.dev/pricing) |

Daytona 按 CPU / RAM / 存储等资源计费；E2B 页面列出计划及运行沙箱按秒计费。优惠额度不等于长期免费，模型的图片输入和后续工具调用也仍消耗模型用量。第一版设置中应叫“桌面沙箱连接”，明确供应商和资源限额，不混进“模型 API key”。

E2B 官网另有 BYOC / Embed 部署选择，但这不能证明 BoAI 当前安装的 Mastra E2B provider 已支持无 key 的本机一键桌面；这条接线、桌面模板和认证方式本次未核实。[E2B 官方部署说明](https://e2b.dev/)。

### 模型条件

Mastra Computer 本身提供通用工具，并未在本次正文中限定只能用某一家模型。由于截图作为图片送回模型，按截图识别按钮并判断坐标的工作模式应要求所选模型连接支持**图片输入 + 工具调用**；纯文本模型不能据此被标记为“已支持视觉桌面操作”。这是由工具返回形式推导的接入条件，仍需用目标模型连接做真实兼容验收，不能只按模型名称猜测。

## Browser 的已核官方边界

Mastra Browser 页面列出 SDK providers：`AgentBrowser`、`StagehandBrowser`、`FirecrawlBrowser`，另有 CLI 用的 `BrowserViewer`。AgentBrowser 使用 Playwright；Stagehand 可接 Browserbase；Firecrawl 是托管 Browser Sandbox；AgentBrowser 还可连接 CDP 浏览器。把 `browser` 直接附到 Agent 时会把浏览器工具加入 Agent，包含交互操作，不能把这一步直接等同于“只读联网”。[Mastra Browser](https://mastra.ai/docs/browser)。

托管方式需要独立服务配置，例如 Firecrawl key、Browserbase key/project ID；本机独立 AgentBrowser 不因使用 Mastra 而必然需要这些托管服务 key。Browser 也不自动返回完整的搜索引擎服务或可靠引用格式。来源应由 BoAI 保存实际访问 URL、标题、提取文本/截图和时间，再让成果引用这些真实来源。

### 当前源码接线与首批 Browser 选择

当前 [package.json](../package.json) 有 `@mastra/core 1.71.0`，没有声明 AgentBrowser、Stagehand、Daytona 或 E2B Desktop provider；[Agent 工厂](../src/runtime/adapters/mastra/agent-factory.ts)尚未传 `browser`，[task-runtime](../src/runtime/adapters/mastra/task-runtime.ts)的 Workspace 原生工具整体禁用。框架定义存在不等于产品可用。

安装版 [Browser 文档](../node_modules/@mastra/core/dist/docs/references/docs-browser.md)及 [Agent 类型](../node_modules/@mastra/core/dist/agent/types.d.ts)证实 `Agent.browser` 原生入口。直接挂 `browser` 会自动合并 provider 全部工具；仅给普通 `tools` 配白名单或关闭 workspace tools 不能裁剪它。AgentBrowser 有 `excludeTools`，安装版 [ToolHooks](../node_modules/@mastra/core/dist/tools/types.d.ts)也有 `beforeToolCall` / `afterToolCall`；应接 BoAI 宿主检查，保留单一受控工具路径。[AgentBrowser API](https://mastra.ai/reference/browser/agent-browser)

首批建议本地 AgentBrowser：用确定性页面快照/ref，由员工已有模型决定动作，较容易接现有 Work 预算。Stagehand 的 AI act/extract/observe 另有内部 model/key，需额外用量、取消与预算接线，不默认继承外层模型账本。[Stagehand API](https://mastra.ai/reference/browser/stagehand-browser)。需要截图理解时仍须检查图像输入；纯文本网页提取不能自动证明视觉能力。

Browser 的租约/登录范围固定员工×会话，第一片可先每个 run 使用临时独占实例，再增加用户明确保留的登录 profile。现有 StageInstance.dispose 只销毁 workspace，需扩展真实 browser.close / 退出后释放容量；浏览器动作、审批与回执另接 [EngineContext](../src/runtime/contracts.ts) 和既有原 Work，而不是把网页操作伪装成 shell 审批。现有[第 5 组 BR1 规格](./spec/5.Mastra能力扩展/04-Browser浏览器能力.md)可继续作为范围基础，最终 provider 类型、Chromium 打包和真实取消待锁版验收。

## 给 BoAI 的最小接入方式

1. **能力配置**：员工详情提供“浏览器”和“虚拟桌面”能力项，显示未配置、未授权、可用或兼容失败。默认团队成员不因创建成功自动获得外部账号、全部工具或用户浏览器登录态。Browser 可在系统中内置可用；Computer 默认关，配置后给具体员工开通。
2. **按需执行**：只在明确任务中把当前授权工具注入 Mastra Agent；不在普通群聊讨论时随消息启动浏览器或云桌面。一次 Work 记录员工、会话、provider、资源身份和允许范围，沿原工作预算运行。
3. **会话归属**：Browser 首批使用独立 `employee × conversation` profile，避免默认复用用户日常 Chrome 或多个员工共享登录状态。Computer 每个授权范围绑定明确 sandbox；同一桌面的 GUI 动作串行，避免两个员工争抢鼠标与焦点。
4. **操作边界**：先提供打开/读取/截图和必要导航；登录由用户在专用环境中完成。提交、发送、删除等外部动作核对是否已有匹配目标/内容的明确授权，没有时补充授权并保存操作回执；`click` / `type` 本身不能按名称保证只读，网页跳转和执行入口还需宿主范围校验。不要仅依赖提示词禁止提交，也不要求已获准的常规步骤反复确认。
5. **可见过程与交付**：详情显示当前页面或虚拟桌面、实际步骤及停止入口。Browser screencast 和 Computer stream URL 是集成材料，不会自动成为 BoAI UI；产物仍需明确下载/转移到受管 workspace，登记真实文件与 hash 后才算交付。
6. **生命周期**：按需创建、退出后释放资源；停止等待实际动作/执行器退出。重启只核对原操作和资源身份，不自动重放页面提交或桌面点击；unknown 保留待核对。云资源时长与模型预算分开显示。
7. **MCP 后续插件**：未来 MCP 只补 provider/工具发现适配层，共用员工授权、执行、预算、来源和回执；不另造一套插件自动放权逻辑。Browser / Computer 首批可以通过 Mastra 原生接口实现，不需要先做 MCP。

## 首批可验收结果

Browser：一个员工在明确任务中打开公开网页，提取真实信息并附来源；另一个未授权员工没有同一工具和登录态；用户能观察并停止任务，重启不重放。

Computer：用户配置一个已支持 provider 和图像模型后，员工能在**虚拟桌面**完成一个不依赖私人账号的 GUI 任务，把产物登记到原 Work；界面明确虚拟桌面位置、资源费用归属和停止结果。不配置沙箱 key 的用户仍可正常使用普通聊天和 Browser。

下一份实现规格应固定首批 provider、工具允许集合、凭据存储、会话/资源生命周期、停止与 unknown 处理、产物传输和验收场景，再安排正式开发。

建议顺序：BR1 本地 Browser → 一个 provider 的虚拟桌面 Computer → MCP 插件扩展。三者复用现有员工授权与 task 执行链；无需先建设插件市场、动态安装系统或第三套 Work。Computer 首批仅传输明确选中的任务材料与产物，不把员工完整 workspace、记忆或登录目录自动同步到远端沙箱。
