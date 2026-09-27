# Sandbox、文件系统与 Skills

日期：2026-09-27  
任务：S1 / S2  
状态：**S1 已实施，S2 尚未接入**。已增加内部授权环境计划、资源内容版本和技能可用性展示；[实现记录](../2.已实现功能与代码现状/15-B1-B2-S1-F1首批重构实现.md)。命令仍为显式审批的宿主执行，运行时及依赖就绪检查留在 S2。

目标是让每位数字员工拥有可持续使用的工作文件、技能和执行环境，在单聊与群聊中完成真实任务。员工身份长期存在，运行环境按“员工 × 会话”隔离；群共享通过明确发布的产物完成。沿用 `userData/v2` 数据根，文件留在本地，不要求开通云沙箱账号。

建议先完成 **S1：授权文件/技能计划适配**，随后以 **S2：Mastra LocalSandbox 可信本地执行**交付脚本能力。S2 接入可验证的原生写入/网络限制，保留逐次命令审批，准确显示实际保护范围；不承诺员工之间的 shell 读取隔离。命令默认不开启，由用户明确启用可信本地模式。更强的隔离作为 S2 后续验证方向，采用受管容器/VM 或经过验证的自定义原生策略；Docker 只是候选，不作为 Electron 首版必装依赖。

[B2 工作区重构](../4.数字员工与协作重构/02-工作区与资源隔离.md) 只整理已有职责，不等于完成 S1/S2。本篇中的环境计划、后端选择、挂载、依赖检查和生命周期管理均为新增工作。

## 1. 五个概念各自解决什么

| 概念 | 职责 | 不能由它推导的能力 |
| --- | --- | --- |
| Workspace | 将文件系统、技能、搜索、可选执行环境及工具配置装配给 Agent | 不是一台虚拟机，也不自动获得操作系统隔离 |
| Filesystem | 提供读写、列目录等文件接口；本地目录与远程对象存储是不同 provider | 文件 API 的路径边界不限制 shell 进程 |
| Sandbox | 启动命令、管理进程和执行环境；隔离强度由具体后端和策略决定 | 名字含 sandbox 不代表容器、离线或只读 |
| Skills | 按需加载任务说明、参考资料、脚本和附件 | 不是软件包管理器，不会自动准备 Python/npm/系统库 |
| Browser | 操作网页和浏览器会话，拥有自己的网络、登录与生命周期 | 不会因 Workspace 配了 Sandbox 就自动运行在其中 |

文件工具可以独立于 Sandbox 使用；把文件提供给工具和把目录挂给命令是两种操作。`filesystem` 与 `mounts` 是 Workspace 的两种配置方式，不能同时设置；手工组合文件系统也不等于已完成命令侧挂载。[官方文件系统说明](https://mastra.ai/docs/sandbox/filesystem)

## 2. 官网、已装包、项目现状

| 层次 | 已核验事实 | 本项目的判断 |
| --- | --- | --- |
| 当前代码 | `LocalFilesystem({ contained: true })`、Workspace、受限 SkillSource 和自定义文件工具；命令由宿主 `spawn` 执行 | 已有员工会话文件边界与命令审批，尚无 Mastra Sandbox |
| 已装 `@mastra/core 1.71.0` | 包含 LocalFilesystem、Workspace、LocalSandbox、原生隔离配置及 skills API | 可以直接做 S1；不能把 LocalSandbox 默认配置当隔离产品交付 |
| 官网其他后端 | Docker、Apple Container、本地/远程浏览器及远程沙箱有独立集成 | 当前未安装对应 provider；后续接入必须锁定版本、再读其类型并实测 |

代码依据：[任务工具和命令执行](../../../src/runtime/mastra-engine.ts)、[员工目录](../../../src/runtime/agent-homes.ts)、[资源导入](../../../src/runtime/resources.ts)、[授权与生命周期](../../../src/runtime/service.ts)。当前 `@mastra/` 依赖只有 core、memory、libsql；开发测试使用 Playwright 也不代表已经提供生产浏览器或容器环境。

### LocalSandbox 的真实边界

已装类型支持 `isolation: 'none' | 'seatbelt' | 'bwrap'`，默认是 `none`。这是宿主命令执行，不是容器。macOS seatbelt 和 Linux bubblewrap 需要分别验证；这个枚举没有 Windows 原生隔离后端。

特别注意已装实现的两个行为：

- macOS 自动生成的 seatbelt 策略允许所有文件读取，主要限制写入与网络。额外填写 `readOnlyPaths` 不会把它变成“只能读这些路径”；因此不能防止命令读取另一员工资料或宿主密钥文件。
- LocalSandbox 将 LocalFilesystem 挂载成工作目录内的符号链接，并把挂载目标加入可写路径。`LocalFilesystem.readOnly` 约束文件 API，不足以证明命令对同一目录只读。

依据：[LocalSandbox 类型](../../../node_modules/@mastra/core/dist/workspace/sandbox/local-sandbox.d.ts)、[原生策略类型](../../../node_modules/@mastra/core/dist/workspace/sandbox/native-sandbox/types.d.ts)、[seatbelt 生成约定](../../../node_modules/@mastra/core/dist/workspace/sandbox/native-sandbox/seatbelt.d.ts)、[官方 LocalSandbox 参考](https://mastra.ai/reference/workspace/local-sandbox)。`cwd`、Electron renderer sandbox、utility process 分离都不能替代这些边界。

若后续提供更强的原生隔离模式，由应用生成和维护自定义 Sandbox 策略，明确允许运行时系统文件、当前 session 与授权输入，阻止其他员工、其他会话和宿主敏感目录。自定义 seatbelt profile 会替代自动策略；自定义 `bwrapArgs` 在已装类型中也会替代默认参数。必须按平台验证读、写、进程与网络，而不是只检测命令能启动。无法可靠满足时转向本地容器/VM 技术验证，不宣称原生模式已达到同等隔离。

## 3. 本地优先的后端选择

| 方式 | 建议位置 | 必须知道的限制 |
| --- | --- | --- |
| LocalFilesystem + 无命令工具 | S1 默认；读取技能、处理文本、维护工作文件 | 文件工具受控，但没有新增脚本执行环境 |
| LocalSandbox + 已验证原生策略 | **S2 首期可信本地模式**；用户显式启用命令，仍逐次审批 | macOS 默认策略不满足私有读取隔离；Linux/Windows 不能套用 macOS 结论 |
| 现有宿主命令 / LocalSandbox `none` | 明确标识的兼容模式；无原生限制时不得静默切入 | 使用宿主用户权限，不能称为员工私有安全环境 |
| 本地 DockerSandbox + 受管策略适配 | S2 后续强隔离候选，先做技术验证 | 要有本地 Docker Engine；桌面系统通常还有本地 VM 与镜像成本，不作为首版强制前置 |
| AppleContainerSandbox | 后续条件适配 | 官方要求 Apple silicon、macOS 26+、container CLI/service，不适合作为所有用户的共同前置 |
| E2B / Daytona 等远程执行，S3 等远程文件 | 后续确有云端需求时接入 | 需要服务连接、费用及数据传出策略，不属于本地首期必需项 |

Docker 官方集成提供容器执行与资源/网络配置；并非所有加固选项默认开启。若验证并采用，应固定镜像、显式限制资源、不使用 privileged、不挂 Docker socket 或宿主主目录。官方 `volumes` 示例仅证明宿主路径到容器路径的映射，不能据此编造只读挂载参数；锁定 provider 后验证真实 API，必要时由受管 adapter 构建并校验底层容器配置。[Docker 集成](https://mastra.ai/integrations/sandboxes/docker)、[Apple Container 集成](https://mastra.ai/integrations/sandboxes/apple-container)

S2 首期可交付范围是：检测宿主运行时和原生限制后，在用户已启用的可信本地模式执行受支持技能；没有 Node/Python 等必要运行时的机器继续使用文件与纯说明技能，并明确显示缺少的依赖。应用提供准备指引，不能要求用户自行猜依赖。检测出原生限制不可用时清楚报告，不把此前标成受限的运行悄悄切到 `none`。兼容宿主模式必须单独显式选择且始终准确标识。

## 4. 员工环境、会话挂载和共享

员工保留长期的环境配置，例如执行后端、运行时版本和依赖检查结果。文件工具可见数据、工作目录及活跃执行实例采用 `agentId + conversationId + policyVersion` 作用域。同一员工在两个群中可以复用受管依赖，不复用对方的工作目录；不同员工也不会因为使用同一个 Mastra Agent 类型而共享执行实例。**首期这种实例与目录分离不意味着可信 shell 无法读取其他宿主目录。**

以下是**环境计划的逻辑映射**，不是已实现路径，也不是 Mastra 固定 API。LocalSandbox 首期将其转换成 session 下的实际路径表，保留宿主绝对路径边界的准确说明；后续容器适配才能把它作为容器根路径：

| 执行环境内 | 宿主来源 | 权限与用途 |
| --- | --- | --- |
| `/work` | `agents/<agentId>/workspace/sessions/<conversationId>/work` | 当前员工当前会话持续工作，可写 |
| `/runs/<runId>` | 同一 session 的 `runs/<runId>` | 本次临时文件、命令 cwd、待发布文件，可写 |
| `/skills/<skillName>` | 当前绑定技能的固定版本副本 | 文件工具只读；命令侧先使用本次受管副本，避免污染导入原件，同名冲突提前拒绝 |
| `/inputs/<resourceId>/...` | 当前授权知识、选中的共享产物或用户文件的受管副本 | 文件工具只读、带来源和版本；命令可写性由实际策略决定，不直接挂整个群目录 |
| `/tmp` | 当前执行实例的临时空间 | 可写、停止后可清理；首版监测占用并限制工具输出，不把 LocalSandbox 描述为已有磁盘配额 |

环境计划不主动提供整个 `data/`、整个员工 home、其他 session、SQLite、模型密钥、浏览器 profile。系统规则与有效记忆由宿主形成 bootstrap。员工 `private/` 也不是隐式跨群输入，如任务需要其中某个文件，应经过明确选择与授权投影。可信本地 shell 的宿主读取权限仍然存在，不能把“不主动提供路径”宣传成“无法访问”；后续强隔离模式要在 OS/容器层实际阻止这些访问。

当前物理数据继续保留在 [B2 路径规范](../4.数字员工与协作重构/02-工作区与资源隔离.md) 中，后续也不把容器内部盘当唯一存储。群知识继续执行“员工绑定 ∩ 群共享”；技能继续检查绑定和所有者。撤权后取消受影响任务并废弃其环境租约/输入快照，不能仅从文件工具列表隐藏资源而让旧进程继续读取。

共享由 `publish_artifact` 完成：宿主校验当前 run、来源路径、普通文件与权限，将明确文件复制到 `workspaces/<conversationId>/artifacts` 并登记。首期原生策略应禁止对群共享目录的直接写入；没有实际写限制的宿主兼容模式只能声明这是一条产品工具约束。取消、登记失败或权限变化时不得发布迟到文件；历史已公开产物按现有产品规则保留。

不要把容器绝对路径照搬到 LocalSandbox。其挂载是宿主 cwd 下的链接；同一 `/workspace` 映射在本地命令里通常应使用相对 `workspace`。环境 adapter 应提供实际可用路径表，并检测挂载成功，不能因为文件工具读得到就判断脚本也读得到。[文件系统与挂载](https://mastra.ai/docs/sandbox/filesystem)

## 5. Skills 与依赖准备

保留受管导入、绑定、目录名校验和逐资源撤权。普通聊天、参与判断、记忆整理继续没有技能工具；task 才能按权限加载。已有 workspace skills 路径足够完成首期，不必同时改成 Agent-level skills。

渐进加载分为：先提供名称/说明等目录信息，选中后读取 SKILL.md，再按需读取参考文件、脚本或附件。读取脚本不等于获准执行脚本。框架支持 Agent-level skills 与 workspace skills，前者还能按请求解析；两者合并时存在同名覆盖规则，因此产品仍应提前拒绝绑定冲突，不能依赖覆盖顺序。[官方 Skills](https://mastra.ai/docs/skills)、[已装 workspace skills 说明](../../../node_modules/@mastra/core/dist/docs/references/docs-sandbox-skills.md)

为员工显示每个技能的两种状态：**说明可用**与**执行就绪**。导入成功只证明资源可读取，不证明脚本可运行。建议宿主保存独立的执行需求记录：所需运行时与版本、系统依赖、网络需求、适用平台、环境版本及检查结果；容器模式另加镜像版本。这是产品元数据，不是声称 Mastra 已提供自动依赖安装。

S2 首期检查已安装 Node/Python 的路径与版本，针对明确列出的技能建立员工独立的依赖目录或 Python 虚拟环境，技能测试通过后才标为执行就绪；首个版本不要求内置所有运行时。依赖可放在新增的受管缓存 `data/environments/<agentId>/<environmentVersion>/`，由宿主准备并记录清单，任务不负责修改；该目录可重建，不混入员工业务文件备份。依赖缺失时指出缺少什么和可采取的准备动作。安装/升级依赖属于独立的环境准备操作，不能在每次模型调用时自动从互联网安装任意软件，也不修改用户系统 Python/npm。后续容器模式改由固定基础镜像承载同一需求记录。无外部依赖的说明技能和文件工具无需等待这一步。

输入副本与技能内容记录 hash；授权计划在 S1 已记录版本与资源内容 hash；运行时、依赖版本在 S2 实施，后续使用镜像时再记录镜像版本。只有环境仍符合这些版本才可复用，否则重新准备。模型输出的路径、SKILL.md 内容和网页文字都不能改变挂载或提升网络权限。

## 6. 产品层与 Mastra adapter 的边界

沿用 B2 的 WorkspaceService，但增加一个明确的**运行环境计划**输出：员工、会话、run、资源版本、可读输入、可写目录、执行后端、依赖状态、网络与限制。先作为内部类型实现，不预建一套通用云平台接口。

产品层负责授权、版本、审批、租约归属、备份和产物登记；Mastra adapter 负责把计划转成该版本支持的 Workspace/Filesystem/Sandbox，以及执行/终止的实际调用。底层进程执行前再次检查 run 是否有效。命令工具继续接入现有持久审批，SDK 自动生成的 command/process 工具不得绕过审批或开放后台逃逸入口。

不同时维护两套任意命令执行路径。S2 可保留现有 `execute_command` 工具协议，将其执行部分委托受管 sandbox；Workspace 的通用工具默认关闭，再显式开放经过包装的能力。审批绑定 run、命令、cwd、环境/策略版本，一次消费，配置变化后失效。模型 key 由现有 SecretStore 使用，不注入命令环境。

## 7. 持久化、取消、退出

员工 session 的 work/run 文件仍是本地持久事实；执行实例可销毁并重建。环境租约记录归属、后端、策略 hash 与状态，不能把 sandbox ID 等同于永久文件保证。首次按需启动，空闲后停止；仅在同一作用域、同一策略下复用。

取消、移除成员、撤销资源或退出时，先撤销运行权限，再终止命令及子进程，等待有限时间后关闭本应用持有的执行实例；迟到回调不发布消息或产物。应用异常退出后，仅清理带有本应用归属记录的遗留进程/环境，不碰其他用户进程或容器；原讨论轮仍按现有规则 interrupted，不自动重跑脚本。

Mastra 的 resolver 返回实例由应用拥有；不能假定 `workspace.destroy()` 会销毁所有解析出来的 sandbox 或浏览器。生命周期必须由应用统一登记和释放，不能依赖 Mastra Server 的退出处理。[官方 Sandbox 生命周期](https://mastra.ai/docs/sandbox/overview)

备份沿用“有活跃/等待工作时拒绝，空闲时一致快照”的行为，包含员工工作文件、技能、输入来源记录及环境配置；不打包整个容器镜像、活跃进程、模型密钥或浏览器登录资料。恢复重新定位本地路径并准备环境，恢复文件不等于恢复执行许可。若输入缓存可从现有资源重建，应明确标为缓存并可丢弃。

## 8. 分阶段交付与验收

### S1：文件和技能计划适配

已交付：统一当前路径/授权快照，提供执行环境计划；保持受限文件工具与渐进技能加载，展示“说明可用/不可用”和“命令未启用/执行依赖未验证”。说明可读取不表示执行就绪；实际运行时与依赖检测属于 S2。S1 不接新的命令后端，不宣称 OS 隔离。

验收：

1. 一个员工在单聊中读取获准技能、生成文件、显式发布；重启后工作文件与产物仍在且可继续使用。
2. 两员工、同员工两群产生同名文件时互不覆盖；群共享只通过明确产物可见。
3. 未绑定技能、同名技能、路径穿越、符号链接和系统文件写入均有明确结果；沿用既有来源撤权回归。
4. 说明技能无需脚本环境可用；含脚本但缺依赖的技能准确显示未就绪，不能假装执行成功。
5. 问候、decision 和 memory 阶段不因引入 skills API 获得文件、命令或浏览器工具；群成员自决与发言预算不变。

### S2：可工作的可信本地执行环境

实施顺序：基于已装 LocalSandbox 核验执行与终止 API → 检测宿主运行时和原生策略 → 准备员工依赖和 session 输入副本 → 将现有命令工具接到 sandbox → 接入取消、回收、备份与桌面展示。先支持已验证的 macOS 可信执行路径，再按实际结果声明其他平台能力，不等待容器集成或所有语言支持。

验收：

1. 真实 Electron 打包应用在用户启用命令后能启动 LocalSandbox；一个受支持脚本技能读取输入、产生文件并发布，退出重启后成果仍可继续使用。无需安装 Docker；缺运行时或依赖时给出具体状态。
2. 文件工具维持员工/会话授权边界；实际探测并记录 shell 的读取、写入和网络范围。macOS 默认 seatbelt 的全盘可读必须作为已知限制展示，不能用文件工具测试掩盖它。受限模式测试禁止写入其他会话/共享目录，兼容模式准确标识无该保证。
3. 已验证原生模式默认禁用命令网络；明确任务开放网络后只属于该环境和授权范围。限制不可用时不静默切为不受限模式；后端若只能整体开关，不能显示未实现的域名级限制。
4. 超时、输出上限和子进程取消真实生效；停止长命令及孙进程后无继续写入和迟到发布，其他员工运行不受影响。资源上限按后端实际支持展示，不承诺 LocalSandbox 已有容器级 CPU/内存/磁盘配额。
5. 资源撤权、配置变更或策略版本变化使旧租约失效；旧快照不能重新挂载被撤销内容。重启不自动重放命令。
6. 当前命令审批、产物归属、备份恢复、源路径重定位和群聊调度全部保留；一致备份期间没有后台执行实例继续修改待备份文件。

通过后可以称“每位员工拥有持续的工作目录和可信本地执行环境”，同时标明 shell 的宿主读取权限、实际写入/网络限制及支持的技能依赖。不能称为任意不可信代码的强隔离，也不宣称所有平台保护相同。

### S2 后续：强隔离技术验证

强隔离不阻塞上述首期交付。选择一个实际后端先完成小规模验证：受管 Docker/本地 VM，或确实能限制宿主读取的自定义原生策略。未确定运行依赖前保留为候选，不写成默认已就绪。

额外验收包括命令不能读取其他员工/会话和宿主凭据，技能/输入真正只读，绝对路径和符号链接不能绕过边界，网络与进程限制及声明的资源配额生效。容器路径还要验证镜像准备、读写挂载、重建后持久文件与清理；原生路径需逐平台验证完整策略。通过后才提供明确的强隔离模式标签，并且不可静默降级到可信宿主模式。

## 9. 核对入口

- 已装包：[Workspace 文档](../../../node_modules/@mastra/core/dist/docs/references/docs-sandbox-overview.md)、[Filesystem 文档](../../../node_modules/@mastra/core/dist/docs/references/docs-sandbox-filesystem.md)、[LocalFilesystem 类型](../../../node_modules/@mastra/core/dist/workspace/filesystem/local-filesystem.d.ts)、[Agent-level skills 文档](../../../node_modules/@mastra/core/dist/docs/references/docs-skills.md)。
- 在线核对：[Filesystem](https://mastra.ai/docs/sandbox/filesystem)、[Skills](https://mastra.ai/docs/skills)、[Browser](https://mastra.ai/docs/browser)。官网用于核对可选方向，具体实现仍以锁定版本的类型、实现和打包验证为准。
- 浏览器另见 [BR1 浏览器能力](./04-Browser浏览器能力.md)，不把 Browser provider 的可用性算作命令执行环境的隔离能力。
