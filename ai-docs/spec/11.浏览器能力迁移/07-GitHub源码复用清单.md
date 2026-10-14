<!--
[INPUT]: 2026-10-14用户要求浏览器优先直接复用GitHub代码；Craft v0.15.1源文件/测试/许可、Ego Lite helper和OpenCLI架构资料、BOAI现有迁入版本。
[OUTPUT]: 固定上游版本、真实读取的文件hash、迁入目标/必要适配/测试映射及暂不采用范围；未复制到产品源码，未运行上游或BOAI测试。
[POS]: 第11组06的源码复用依据；实际实施与成绩唯一归05，不能把上游修复当成本地通过。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->

# GitHub源码复用清单

核对日期：2026-10-14。用途：为[员工浏览器操作计划](./06-数字员工浏览器操作设计与实施计划.md)提供可执行的直接迁入清单。状态：**第一方源码只读核对、内容hash已记录；产品迁入和运行验收未开始。**

## 1. 固定来源与选型

| 项目 | 固定版本 | 实际核对范围 | 采用位置 |
| --- | --- | --- | --- |
| [Craft Agents OSS](https://github.com/craft-ai-agents/craft-agents-oss/tree/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f) | `2e3ba53ff80b229a07e9d1884dc58f6733f22e1f`，v0.15.1，提交/发布2026-10-13 | GitHub树、发布说明、窗口/CDP/runtime/工具注册/脱敏源码、相关测试、LICENSE/NOTICE | **主要迁入来源**；已有BOAI浏览器与其同源，直接复用成熟实现并接本地边界 |
| [Ego Lite](https://github.com/citrolabs/ego-lite/tree/dca7003349c5f7132189ba00547cbbd7ff8e597e) | `dca7003349c5f7132189ba00547cbbd7ff8e597e`，提交2026-09-17 | README、helper README/browser-runtime、Page API与LICENSE | Page/ref/任务空间接口参考；不是现有Electron可直接安装的通用引擎 |
| [OpenCLI](https://github.com/jackwener/OpenCLI/tree/b9213a15d63df578612ddaedc4e3b5c3428d5305) | `b9213a15d63df578612ddaedc4e3b5c3428d5305`，提交2026-10-13 | README、架构/CDP接入文档、LICENSE及许可元信息 | 后续网站适配/结构化提取；不作为浏览器手动操作闭环的前置 |

Craft的[v0.15.1发布说明](https://github.com/craft-ai-agents/craft-agents-oss/releases/tag/v0.15.1)列出隐藏窗口输入、新截图帧、验证误判、输出缩减和密码脱敏等修复。本轮同时对照了BOAI现有CDP/manager/runtime，确认存在相应源码差异；尚未在BOAI复现这些缺陷，不把发布说明计为本地测试结果。

后续可检查更新，但实际迁入必须选一个固定commit；不能把当前main、旧boai-app和不同发布版本的文件拼成未记录来源的实现。源文件仍在GitHub固定地址可重新获取，临时研究目录不是构建依赖。

## 2. Craft直接迁入映射

下表链接均固定到同一commit。目标文件已存在时按模块/函数差异迁入，保留BOAI已增加的来源、取消、文件和敏感值修复；不直接覆盖整个文件。接口有必要变化时调整真实调用者，不用空返回或降级实现掩盖差异。

| 源模块 | BOAI目标/接点 | 优先直接采用的实现 | 必要适配 |
| --- | --- | --- | --- |
| [browser-cdp.ts](https://github.com/craft-ai-agents/craft-agents-oss/blob/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f/apps/electron/src/main/browser-cdp.ts) | [main/browser/browser-cdp.ts](../../../src/main/browser/browser-cdp.ts) | CDP输入、点击命中核对/明确回退、选项选择、字段输入/敏感标记 | Electron类型、原在途CDP跟踪、现有ref/密码字段保护；回退事实必须返回 |
| [browser-pane-manager.ts](https://github.com/craft-ai-agents/craft-agents-oss/blob/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f/apps/electron/src/main/browser-pane-manager.ts) | [main/browser/browser-pane-manager.ts](../../../src/main/browser/browser-pane-manager.ts) | 隐藏窗口绘制控制、新帧截图、popup/销毁、加载与验证相关处理 | 应用统一partition、BOAI下载策略和实际退出；不得恢复旧session所有权/输入遮罩/关闭即隐藏规则 |
| [browser-tool-runtime.ts](https://github.com/craft-ai-agents/craft-agents-oss/blob/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f/packages/shared/src/agent/browser-tool-runtime.ts) | [mastra/browser-tool-runtime.ts](../../../src/runtime/adapters/mastra/browser-tool-runtime.ts) | 命令解析、页面快照/目标/动作结果、验证判断、精简截图说明、敏感输入标记 | 继续经现有单动作parser与服务授权，不因复制内部批命令函数而开放模型批执行 |
| [browser-tools.ts](https://github.com/craft-ai-agents/craft-agents-oss/blob/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f/packages/shared/src/agent/browser-tools.ts) | [browser-tool-types.ts](../../../src/runtime/adapters/mastra/browser-tool-types.ts)、[browser-tool.ts](../../../src/runtime/adapters/mastra/browser-tool.ts)及native-products | BrowserPaneFns/结果类型、工具说明和图片结果格式 | 本版本类型在browser-tools.ts中；拆出所需类型，使用现有Mastra/Codex/Claude注册方式，不为复制工厂引入整套Claude Agent SDK |
| [browser-tool-redaction.ts](https://github.com/craft-ai-agents/craft-agents-oss/blob/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f/packages/shared/src/agent/browser-tool-redaction.ts) | 现有工具参数/结果、native执行事件与持久记录入口 | 密码输入识别、命令文本替换、结果标记保留 | 核对browser-tool-names/runtime常量依赖；迁入后在持久化之前脱敏，不能只处理最终输出 |
| [browser-tools.md](https://github.com/craft-ai-agents/craft-agents-oss/blob/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f/apps/electron/resources/docs/browser-tools.md) | BOAI现有工具帮助/员工可读说明 | snapshot→动作→再核对的操作说明与命令示例 | 帮助只列实际开放能力；去掉旧workspace/session/远程配置及未接通命令的可用承诺 |

重要依赖差异：当前上游`browser-tools.ts`直接引用Claude Agent SDK，`browser-tool-redaction.ts`引用工具命名和runtime常量。迁入应复用它们的实质行为并适配当前工具桥；不能因为依赖位置不同就重新写一个简化驱动，也不能把整个上游agent/server-core搬进BOAI。

## 3. 本次读取的源文件内容hash

以下SHA-256对实际获取的原始字节计算；它们是**源文件身份**，不是迁入后文件hash或构建证明。

| Craft源路径 | SHA-256 |
| --- | --- |
| `apps/electron/src/main/browser-cdp.ts` | `a5bf4f2bdd279bcc259bc5a1927b28e779a73a5521180a0ef1506467c5af8214` |
| `apps/electron/src/main/browser-pane-manager.ts` | `102803d1094dc435c3e71906099d3f7300ad1b7f305d3cfbe5cb702e7e68bb41` |
| `packages/shared/src/agent/browser-tool-runtime.ts` | `d56775546728720f6f937721e697263e0ae2dc41110e20fbd817770d250465b8` |
| `packages/shared/src/agent/browser-tools.ts` | `d4737fa23f19e0689d83c62b0d40cb41bbda6ccbe99879a51881701977af93ea` |
| `packages/shared/src/agent/browser-tool-redaction.ts` | `95e13c90c2dcc2fae8e75ca2754ef39a62962b5ddec1570f0769db1a87fc4a70` |
| `apps/electron/resources/docs/browser-tools.md` | `42e74557dd3a44d75049ee27183ae93300454859259e8ede863391a905c9a92b` |
| `apps/electron/src/main/__tests__/browser-cdp.test.ts` | `1502115d6d3094b505ffa9f2b0a7828eb1121ac04d651e7e364206f9a296d069` |
| `apps/electron/src/main/__tests__/browser-pane-manager.test.ts` | `ab5136ce193ae6d146ef091fd72d13bc8d86b61cf7ebed268c0383980d8722b8` |
| `packages/shared/src/agent/__tests__/browser-tools.test.ts` | `55102a1adfc34b3a7c90eb139523c41199f1be63b02c635687f423a95da88653` |
| `packages/shared/src/agent/__tests__/browser-tool-redaction.test.ts` | `396fd84a591d96bc185ed367b0b29913cadcad8138926f910615c56f33c61dab` |
| `packages/server-core/src/sessions/browser-password-redaction.test.ts` | `7605c286c9c5725157b3eebfee1b0353d600e9fa581cf8246a468d6e87e26920` |
| `LICENSE` | `9a75ace1224f0f880ddfdd8442d14d5a0d865152c61a2fd363d8e2c351f94d2c` |
| `NOTICE` | `caa334b760b4c7835957c91ac24c3d52e7abc7ac770050445027766b4ce4ce7f` |

真正迁入时追加：迁入前BOAI文件hash、复制范围/必要依赖、迁入后hash、实质差异、对应测试和结果。尚未记录的依赖要先读后搬，不能以本表代替完整依赖闭包检查。

## 4. 测试复用与行为差异

| 上游测试 | 可复用意图 | BOAI验证接点 |
| --- | --- | --- |
| [browser-cdp.test.ts](https://github.com/craft-ai-agents/craft-agents-oss/blob/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f/apps/electron/src/main/__tests__/browser-cdp.test.ts) | AX/ref稳定性、输入命中/回退、选择/填表 | 当前browser相关Vitest，加真实Electron后台输入；mock接到事件不证明网页实际响应 |
| [browser-pane-manager.test.ts](https://github.com/craft-ai-agents/craft-agents-oss/blob/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f/apps/electron/src/main/__tests__/browser-pane-manager.test.ts) | popup关闭、旧事件、截图和窗口资源 | [browser-pane-manager.test.ts](../../../tests/browser-pane-manager.test.ts)、[browser-host.test.ts](../../../tests/browser-host.test.ts)及Electron；workspace绑定相关断言改为BOAI应用归属 |
| [browser-tools.test.ts](https://github.com/craft-ai-agents/craft-agents-oss/blob/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f/packages/shared/src/agent/__tests__/browser-tools.test.ts) | 单工具命令、解析、截图、验证提示与结果 | [browser-runtime.test.ts](../../../tests/browser-runtime.test.ts)；不复制上游未在BOAI开放的批命令/任意脚本权限断言 |
| [browser-tool-redaction.test.ts](https://github.com/craft-ai-agents/craft-agents-oss/blob/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f/packages/shared/src/agent/__tests__/browser-tool-redaction.test.ts)、[browser-password-redaction.test.ts](https://github.com/craft-ai-agents/craft-agents-oss/blob/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f/packages/server-core/src/sessions/browser-password-redaction.test.ts) | 密码值不进入输出/会话记录，标记在转换后保持 | BOAI真实参数/事件/存储/导出链路；不能只移植字符串函数测试 |

上游使用`bun:test`，BOAI沿Vitest与Electron BDD迁用业务意图，不添加第二套测试runtime。浏览器运行测试和来源/取消回归一起执行；上游测试存在不代表本地通过。

BOAI必须保持的实际差异：应用统一持久登录；X真正关闭；无员工窗口所有权或控制权菜单；单一实际工具持有者；任务来源与代际核对；未完成下载隔离；已知失败和未知不自动重放；本机无BOAI预算；三引擎真实媒体接线。

## 5. Ego Lite与OpenCLI的采用边界

Ego Lite的[helper说明](https://github.com/citrolabs/ego-lite/blob/dca7003349c5f7132189ba00547cbbd7ff8e597e/package/ego-browser/README.md)和[browser-runtime.ts](https://github.com/citrolabs/ego-lite/blob/dca7003349c5f7132189ba00547cbbd7ff8e597e/package/ego-browser/src/browser-runtime.ts)显示其Page/TaskSpace依赖浏览器提供的`globalThis.ego`、CDP传输和snapshot能力。可借鉴稳定页面引用、任务隔离与元素失效处理；本轮没有证明其完整浏览器内核能直接嵌入Electron，也不把“Space隔离”推导成BOAI每员工独立Cookie。

OpenCLI的[固定架构文档](https://github.com/jackwener/OpenCLI/blob/b9213a15d63df578612ddaedc4e3b5c3428d5305/docs/developer/architecture.md)和[CDP接入](https://github.com/jackwener/OpenCLI/blob/b9213a15d63df578612ddaedc4e3b5c3428d5305/docs/advanced/cdp.md)描述扩展/daemon及外部CDP两条路径。它提供站点命令和提取能力；现有BOAI只使用Electron内部debugger，并没有已实现的OpenCLI桥。扩展接入前验证目标页面、登录身份、权限、取消和输出是否贯通，不能把本机另一Chrome中的结果冒充BOAI当前页。

不因本篇自动安装Ego Lite/OpenCLI、复制用户Chrome资料、启用远程调试端口或引入站点批脚本。未来若使用现成OpenCLI工具，优先调用其公开接口；只有确有缺口才迁必要adapter并记录来源。

## 6. 许可与来源保留

Craft本次固定[LICENSE](https://github.com/craft-ai-agents/craft-agents-oss/blob/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f/LICENSE)为Apache-2.0，另有[NOTICE](https://github.com/craft-ai-agents/craft-agents-oss/blob/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f/NOTICE)。迁入时保留适用版权、许可和NOTICE，源Header标明路径/版本及BOAI修改；检查依赖的单独许可，不把上游提到的Claude Agent SDK写成BOAI已经新增的依赖。

Ego Lite固定[LICENSE](https://github.com/citrolabs/ego-lite/blob/dca7003349c5f7132189ba00547cbbd7ff8e597e/LICENSE)为MIT；本次读取SHA-256为`325b6f26ca9452fcfb81cc6f52e3889573a7c141e9d07ab35f678b7d95d48e52`。OpenCLI固定[LICENSE](https://github.com/jackwener/OpenCLI/blob/b9213a15d63df578612ddaedc4e3b5c3428d5305/LICENSE)为Apache-2.0，SHA-256为`0210b8b66cf00358242cb921ba2be3a46dfe0190159b1b952388a3880ce1ff54`；后续实际采用依赖仍逐项核对。

## 7. 文档复核与剩余准备

已核对：固定版本和主要文件存在、原始字节hash、当前BOAI对应目标、上游依赖差异、测试框架与产品语义差异。修正了“类型仍在上游browser-tool-types.ts”“装Ego helper就能控制Electron”“内部debugger等于OpenCLI endpoint”等容易误导实现的假设。

待开工完成：完整调用依赖逐项审阅、具体迁入范围与本地差异补丁、许可随包路径、三后端真实媒体格式、实际输入/截图/资源测试。迁入、类型检查、模块、Electron、真实模型和安装包分别登记于[05](./05-实施步骤与验收清单.md)，本篇没有新增通过成绩。
