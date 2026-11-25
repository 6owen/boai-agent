<!--
[INPUT]: 用户提供的 OpenBot「Local → 服务商」及 Claude 详情截图、OpenBot 固定源码和 BOAI 当前模型连接、运行时插件、通知实现。
[OUTPUT]: 服务商目录、驱动、账号、受管版本和缓存的源码追踪，以及 BOAI 设置首页与详情的实施规格。
[POS]: 第19组第21篇。运行时插件接口与实际验证分别沿用本组05和06。
[PROTOCOL]: 源码引用固定提交。修改时同步文档头与目录导航，计划与实施证据分别登记。
-->

# OpenBot 服务商源码与 BOAI 设置设计

2026-11-25 源码审读。上游固定在 [OpenBot `83a79ce`][openbot]，BOAI 对照 [`9f5d1da`][boai]。通知栏去掉手动检查入口及页面反馈占位的改动位于 [BOAI PR #191][pr191]，审读时尚未合入对照提交。本文确定设置页设计范围，运行时、实装版本和桌面界面尚未验收。

## 1. 服务商首页如何生成

`Local` 设置窗口把服务商数据交给 `HostProviderSettingsPanel`，组件生成 `ProviderPickerOption`，再交给共用的 `ProviderSettingsPage`。列表从静态目录取服务商 ID，拼接所在主机回报的运行时状态、版本、登录账号、密钥状态和助手引用。远程主机可复用页面，主机参数决定哪些目录项和操作可用。[设置入口][host-shell] · [目录投影][general-store]

| 截图中的行为 | 源码和语义 |
| --- | --- |
| 默认服务商 | 本机用 `WorkspaceOverlays` 提供的 setup 状态及 `saveSetup`，写入首选 provider/model，创建助手时在显式选择之外沿用首选值。远程主机另走主机管理接口。[本机配置入口][local-pref-ui] · [持久化][local-pref-main] · [助手创建][creation] · [远程入口][remote-pref] |
| 已连接 / 其他服务商 | `isConnected` 将启用且 `available` 或 `connecting` 的选项归入已连接。列表的副标题可取账号名、邮箱、数量、主机可用性或占位状态。因此“已连接”分组本身不足以证明 OAuth 登录或真实模型调用成功。[分组及状态][list] |
| 搜索服务商 | 在展示名和副标题之外匹配账号名等可见数据。已保存的自定义 API 端点有单独入口。默认选择器按可用项过滤，并保留当前值的展示。[列表][list] · [默认选项][choice] |
| 进入某家详情 | 列表与详情共享容器，当前 provider ID 决定详情；`onDetailChange` 把标题和返回动作交给设置窗口。可按提供商能力显示不同区块。[详情导航][detail-nav] · [详情区块][detail] |

## 2. 多家 Agent 的接入方式

在固定提交有 **18 个 provider ID**，普通内置选择器过滤通用 `acp`，目录内含 **13 个受管运行时**。Hermes 还有独立安装器。每个目录条目不必拥有新的协议、安装器或账号体系。[服务商枚举][catalog] · [选择器与受管运行时][managed-catalog]

| 接入方式 | 代表项 | 实现 |
| --- | --- | --- |
| 专用驱动 | ChatGPT（`codex`）、Claude、Pi、Muse | Codex App Server、Claude Agent SDK、Pi RPC、Muse MSP 分别处理启动、会话、取消和协议事件；目录提供名称、模型和能力元数据。[驱动注册][drivers] |
| 共用 ACP 客户端 | OpenCode、Gemini（`antigravity`）、Cursor、Cline、Kimi、Devin、GitHub Copilot、Mistral、Hermes；Grok 也基于 ACP | 品牌差异落在 CLI 命令、参数、环境、认证以及边缘协议处理；ACP 客户端处理初始化、会话、流式消息及权限。Grok 用 ACP 客户端的子类。[驱动注册][drivers] · [OpenCode / ACP 说明][opencode-acp] · [Grok 客户端][grok] |
| 已有运行时承载 API | Inception、DeepSeek、OpenRouter | 将端点、模型及认证接入 Pi。自定义 OpenAI 兼容端点支持由 Pi 或 OpenCode 承载，并有独立于自定义 ACP 的设置入口。[运行时映射][api-drivers] · [Pi 及 API 服务][api-via-pi] · [设置与 ACP 注册表][acp-registry] |
| 自定义 Agent | 本机自定义 ACP、ACP 注册表条目 | 主机保存自定义 Agent 的启动配置，再交共用客户端；注册表负责查找和安装，能够安装和能够为助手完整执行仍要分别验证。[自定义 Agent][custom-acp] · [注册表入口][registry-ui] |

运行时根据 provider ID 选驱动，解析命令并启动客户端，握手后读取账号和能力。要接新 ACP Agent，可复用会话传输，仍要逐个接官方 CLI 的分发、版本读取、登录、模型及权限能力。OpenBot 的新增流程从共享描述与驱动着手，再补主机探测、安装、界面和翻译。[客户端接口][agent-client] · [启动与读取账号][runtime-startup] · [新增服务商清单][add-provider]

“由 OpenBot 下载”表示保存到用户机器的受管副本。OpenBot 从设置等入口按需获取官方发布。各 CLI 使用自己的发行源，如 Codex 和 Pi 取 GitHub Release，Claude 和 OpenCode 取 npm。首次安装允许回退到锁定版本。macOS 打包验收明确检查 Codex、Claude、Grok 未作为根级可执行文件预装。[运行时安装说明][upstream-setup] · [发行源][upstream-update] · [打包检查][package-check]

## 3. Claude 详情页如何工作

| 区块 | OpenBot 的实现 | BOAI 设计取舍 |
| --- | --- | --- |
| 标题与使用情况 | 名称、图标、状态及已绑定助手汇总来自列表投影。[详情][detail] | 使用 BOAI 现有设置标题，显示已绑定员工，员工数按实际绑定去重。 |
| 账号 | 有独立 `providerAccountId`，记录主机内账号元数据和隔离配置目录。Claude 登录时指定对应的 `CLAUDE_CONFIG_DIR`，助手选择账号。OpenBot 的 20 个账号是自己的上限。[账号 UI][accounts-ui] · [账号存储][account-store] · [账号绑定合同][account-contract] · [Claude 驱动][claude-driver] | 首版展示已选配置及其认证来源，例如“使用本机登录”，并沿用现有设置。多账号需要主机侧存储、隔离登录和员工显式选账号后再开放。 |
| API 密钥 | 按 provider 能力显示保存状态和相关动作，由主机管理。详情支持单独呈现 API key；账号流程也支持密钥认证。[页面][keys-ui] · [账号处理][account-host] | 复用现有模型连接编辑与凭据存储。Claude CLI 用已有登录或显式 API 连接，员工的选择决定用途。列表和详情只读取脱敏摘要。 |
| 运行时版本 | 主机可同时持有受管版和系统版，探测选择实际候选，返回当前版本、来源和另一个版本。对允许优先系统版的驱动，同版或更新且完整的系统 CLI 可成为当前版本；用户也可保存选择并在空闲后切换。显式重启另有操作。[版本 UI][runtime-ui] · [CLI 选择][cli-selection] · [空闲重启及切换][restart] | 先展示当前实际版本、来源、路径以及已知可更新版本。受管版与系统版分别持久化之后，再开放切换。只在驱动确有长期进程且有安全重启能力时显示“重启”。 |
| 版本检查 | 本机受管运行时启动时检查并按小时重复检查。部分只有受管版本的场景会自动下载。详情也有检查入口。[检查与下载][upstream-update] · [调度实现][update-timer] · [自动下载条件][update-policy] | BOAI 随应用进程启动查一次。打开页面、切换路由、通知弹层和窗口重新激活都复用结果。已发现的新版本通过通知中心提示，点击“更新”后安装。详情和设置列表不提供“检查更新”。 |
| 提示缓存 | 详情按能力显示设置，Claude 和 Pi 支持默认/1h。主机设置进入各驱动环境，达到 20 万 token、至少 1 小时缓存且处于空闲等条件时，独立机制可在过期前发起压缩。[缓存 UI][cache-ui] · [主机设置][cache-store] · [环境变量][cache-driver] · [压缩计时][cache-expiry] · [空闲校验][cache-idle] | 缓存 TTL 需要驱动、模型和真实请求证据。以后按能力开放。BOAI 会话历史、工作记忆和原生线程续接各沿当前职责。 |

## 4. BOAI 设置结构与落点

### 服务商列表与详情

- 现有“模型连接”路由可以挂上“服务商”视图，旧设置入口、跳转和编辑链接继续可达。首页用 BOAI 的设置布局呈现默认服务商、搜索、已配置与其他支持的服务商。API 连接和本机运行时的行用简短类型、连接名称或版本区分，同品牌的多个连接或启动配置从详情里进入。
- 默认值建议存为创建员工时可解析的具体绑定。API 选择由 `connectionId + modelId` 定位，本机由现有 `ExecutionBackend`（含 `profileId`，插件另含 `pluginId/providerId`）及模型选择定位。新建员工未显式指定时填入默认值，已存在员工不随默认值变化。绑定删除或校验失效时，在创建流程要求改选可用配置。
- 详情采用现有设置页的返回导航，保留返回后列表的搜索和焦点。标题和员工使用情况后，依能力呈现认证、模型连接、运行时版本和本机配置。API 行可进连接编辑器，本机行可打开现有扫描、启动路径配置及测试。保存成功后静默刷新，必要的保存、测试及扫描反馈用 Sonner，版本更新及进度走全局通知中心。业务页面不为临时状态占位。
- 首版目录来自现有 API provider、本机 Codex、Claude、Pi、OpenCode 及已登记的外部运行时插件。“已配置”以保存的连接或启动配置为准；检测到程序可以走“配置”流程；只有收到对应握手或验证结果才显示实际验证状态。页面所需数据可投影为服务商摘要、候选绑定、认证来源、员工引用、运行时版本及操作能力。

| 首页信息顺序 | Claude 详情首版信息顺序 |
| --- | --- |
| 设置标题与搜索 | 返回「服务商」、Claude、使用此配置的员工 |
| 默认服务商（新建员工的初始选择） | 认证来源（本机登录或已选 API 连接） |
| 已配置项（名称、类型、连接或版本） | 运行时（使用中的版本、来源、路径，存在通知时显示可用更新） |
| 其他支持项（添加连接或配置本机 Agent） | 本机配置（编辑、测试；多个配置各自列出） |

| BOAI 现有对象 | 负责的事实 | 设置接线 |
| --- | --- | --- |
| `Connection` 和现有连接编辑器 | 协议、端点、模型及密钥引用 | 复用连接保存、编辑与测试，通过具体连接 ID 区分同品牌配置。[连接编辑入口][boai-connections] |
| `LaunchProfile` | CLI 路径、参数、哈希、版本探测及验证、修订号 | 配置、扫描与校验沿已有主进程和运行时接口。升级后仍使用原 profile ID，路径/版本变化用已有修订机制提交。[后端对象][boai-backends] · [扫描][boai-discovery] · [配置与验证][boai-profiles] |
| `ExecutionBackend` | 数字员工采用的实际执行后端及其身份 | 保留 Mastra API、Codex/Claude 原生与运行时插件的绑定。Claude 认证复用运行时对连接与本机登录的校验。[后端对象][boai-backends] · [运行时配置][boai-config] |
| `RuntimeProvider` 与插件清单 | 探测、会话、提交、输入、取消、状态及能力 | Pi 沿 RPC，OpenCode 沿共享 ACP。后续 ACP 数字员工走运行时插件的对话合同；旧 `acp-local` 对应外部任务合同。[插件接口][boai-sdk] · [Pi/OpenCode 清单][boai-catalog] · [共享 ACP][boai-acp] |
| Agent 更新服务与通知中心 | 启动查版本、用户确认、下载、验证、忙碌拦截及安装提交 | 复用官方包来源的既有白名单、目标版本和验证，并呈现安装反馈。Pi/OpenCode 的受管版本还要服从适配器支持范围。[启动接线][boai-start] · [官方来源][boai-updates] · [安装守卫][boai-install] |

### 运行时来源与账号

BOAI 现有升级会验证候选程序，并把同一 `LaunchProfile` 更新为通过验证的新路径。要实现截图里的“使用已安装的版本”，需给配置保留**系统版与 BOAI 受管版两份各自可验证的候选**，以及当前选择。保存或切换前核对程序路径、协议、版本、哈希、profile revision 和占用，确认新来源后提交。安装失败、占用中或来源漂移时保留原绑定，终态反馈进通知中心。切换后下一次任务读取真实选择。原生会话沿用当前身份比对及交接逻辑，自动化沿用现有授权指纹校验。[升级提交][boai-install] · [原生会话衔接][boai-session] · [自动化绑定][boai-automation]

多账号由主机为支持的驱动提供独立认证目录和账号引用。员工、执行和会话在同一账号身份内工作；新增账号先验证登录或密钥再供选择；删除账号需能找到现用员工并提供显式改绑。首版采用一个已选认证来源和现有连接。切换账号与切换 CLI 版本分别校验和记录。

### 实施顺序与验收

1. **列表与详情。** 用现有数据完成入口、搜索、员工引用、版本和认证信息，复用扫描及编辑。验证旧连接、多个同品牌连接、多个本机配置、禁用或丢失配置、返回焦点和窗口窄宽两种布局。
2. **默认绑定与版本来源。** 验证显式选择优先、默认值只用于新建时填充。安装前显示目标版本，点击后执行，忙碌、探测失败、安装失败和重试时原绑定可用。验证应用启动只检查一次，窗口重开和进入设置不重新请求，状态反馈走通知或 Sonner。支持切换来源后要验证会话续接或现有交接处理，以及自动化授权结果。
3. **更多 Agent 与高级配置。** 每次只接入有官方 CLI、分发来源及认证路径的 Agent。新插件按实际能力覆盖探测、真实会话、停止、重新打开及工具/权限回执，相应能力才能在详情出现。多账号优先验证 Claude 的同机双账号隔离和员工改绑。缓存需要核实实际请求是否采用选定 TTL，再决定是否提供过期前压缩。

上游根许可为 PolyForm Noncommercial 1.0.0。BOAI 根据源码厘清管理能力和协议边界，用自己的设置布局、组件及运行时接口实现。[OpenBot 许可][license]

[openbot]: https://github.com/nightly-labs/openbot/tree/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a
[boai]: https://github.com/6owen/boai-agent/tree/9f5d1da8576841c30f7eb6434b1054b1e653b1b4
[pr191]: https://github.com/6owen/boai-agent/pull/191
[host-shell]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/renderer/src/features/servers/ServerSettingsModal.tsx#L884-L895
[local-pref-ui]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/renderer/src/WorkspaceOverlays.tsx#L663-L683
[local-pref-main]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/main/ipc/app-handlers.ts#L272-L278
[remote-pref]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/main/ipc/provider-admin-handlers.ts#L513-L524
[creation]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/backend/agent-service.ts#L3525-L3587
[general-store]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/renderer/src/features/settings/stores/general-store.ts#L29-L105
[list]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/packages/ui/src/features/settings/ProviderSettingsPage.tsx#L235-L379
[choice]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/packages/ui/src/features/settings/ProviderSettingsPage.tsx#L481-L520
[detail-nav]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/packages/ui/src/features/settings/ProviderSettingsPage.tsx#L198-L232
[detail]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/packages/ui/src/features/settings/ProviderSettingsPage.tsx#L543-L647
[catalog]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/packages/contracts/src/agent-providers.ts#L7-L27
[managed-catalog]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/packages/contracts/src/agent-providers.ts#L550-L641
[drivers]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/backend/provider-drivers.ts#L611-L1478
[api-drivers]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/backend/provider-drivers.ts#L623-L649
[grok]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/backend/grok-client.ts#L21
[opencode-acp]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/docs/architecture/providers.md#L646-L678
[api-via-pi]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/docs/architecture/providers.md#L1825-L1886
[acp-registry]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/docs/architecture/providers.md#L1803-L1823
[custom-acp]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/docs/architecture/providers.md#L1516-L1563
[registry-ui]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/renderer/src/WorkspaceOverlays.tsx#L645-L661
[agent-client]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/backend/agent-client.ts#L22-L78
[runtime-startup]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/backend/agent/provider-runtime.ts#L3683-L3731
[add-provider]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/docs/architecture/integrations.md#L298-L347
[upstream-setup]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/README.md#L174-L183
[package-check]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/scripts/verify-macos-package.ts#L109-L113
[accounts-ui]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/packages/ui/src/features/settings/ProviderSettingsPage.tsx#L743-L821
[account-store]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/backend/agent/provider-account-store.ts#L116-L176
[account-contract]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/packages/contracts/src/ipc-agents.ts#L118-L151
[account-host]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/main/provider-accounts-host.ts#L96-L179
[claude-driver]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/backend/provider-drivers.ts#L701-L775
[keys-ui]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/packages/ui/src/features/settings/ProviderSettingsPage.tsx#L1538-L1584
[runtime-ui]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/packages/ui/src/features/settings/ProviderSettingsPage.tsx#L1588-L1744
[cli-selection]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/backend/cli.ts#L848-L879
[restart]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/backend/agent/provider-runtime.ts#L2778-L2888
[upstream-update]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/docs/architecture/providers.md#L396-L421
[update-timer]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/main/provider-runtime-manager.ts#L389-L399
[update-policy]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/main/provider-runtime-manager.ts#L436-L475
[cache-ui]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/packages/ui/src/features/settings/ProviderSettingsPage.tsx#L1782-L1868
[cache-store]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/renderer/src/features/settings/provider-prompt-cache.ts#L24-L74
[cache-driver]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/backend/provider-drivers.ts#L464-L590
[cache-expiry]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/backend/agent/cache-expiry-compaction.ts#L1-L62
[cache-idle]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/src/backend/agent-service.ts#L4867-L4927
[license]: https://github.com/nightly-labs/openbot/blob/83a79ce9f7b69b4583a42ceb31ea866fcdfa905a/LICENSE#L1-L37
[boai-connections]: https://github.com/6owen/boai-agent/blob/9f5d1da8576841c30f7eb6434b1054b1e653b1b4/apps/electron/src/renderer/pages/settings/connections.tsx#L55-L111
[boai-backends]: https://github.com/6owen/boai-agent/blob/9f5d1da8576841c30f7eb6434b1054b1e653b1b4/packages/shared/src/domain/backends.ts#L18-L55
[boai-discovery]: https://github.com/6owen/boai-agent/blob/9f5d1da8576841c30f7eb6434b1054b1e653b1b4/apps/electron/src/main/local-configs/discovery.ts#L28-L69
[boai-profiles]: https://github.com/6owen/boai-agent/blob/9f5d1da8576841c30f7eb6434b1054b1e653b1b4/packages/runtime/src/modules/backends/profiles.ts#L30-L67
[boai-config]: https://github.com/6owen/boai-agent/blob/9f5d1da8576841c30f7eb6434b1054b1e653b1b4/packages/runtime/src/modules/backends/runtime-config.ts#L38-L79
[boai-sdk]: https://github.com/6owen/boai-agent/blob/9f5d1da8576841c30f7eb6434b1054b1e653b1b4/packages/runtime-plugin-sdk/src/runtime-api.ts#L17-L55
[boai-catalog]: https://github.com/6owen/boai-agent/blob/9f5d1da8576841c30f7eb6434b1054b1e653b1b4/packages/shared/src/plugins/runtime-catalog.ts#L16-L19
[boai-acp]: https://github.com/6owen/boai-agent/blob/9f5d1da8576841c30f7eb6434b1054b1e653b1b4/packages/runtime-plugins/src/acp.ts
[boai-start]: https://github.com/6owen/boai-agent/blob/9f5d1da8576841c30f7eb6434b1054b1e653b1b4/apps/electron/src/main/main.ts#L1069-L1077
[boai-updates]: https://github.com/6owen/boai-agent/blob/9f5d1da8576841c30f7eb6434b1054b1e653b1b4/packages/runtime/src/modules/backends/agent-updates.ts#L16-L105
[boai-install]: https://github.com/6owen/boai-agent/blob/9f5d1da8576841c30f7eb6434b1054b1e653b1b4/packages/runtime/src/service.ts#L1052-L1139
[boai-session]: https://github.com/6owen/boai-agent/blob/9f5d1da8576841c30f7eb6434b1054b1e653b1b4/packages/runtime/src/adapters/native-sessions.ts#L104-L149
[boai-automation]: https://github.com/6owen/boai-agent/blob/9f5d1da8576841c30f7eb6434b1054b1e653b1b4/packages/runtime/src/service.ts#L3870-L3923
