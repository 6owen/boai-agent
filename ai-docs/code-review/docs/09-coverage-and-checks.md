<!--
[INPUT]: 父仓库和角色子模块的 Git 树、实际运行的工程检查及定向测试。
[OUTPUT]: 包级覆盖矩阵、检查命令、已知失败与未验证范围。
[POS]: ai-docs/code-review/docs/09-coverage-and-checks.md。
[PROTOCOL]: 一旦本文件变化，请同步更新 Header，并检查所属目录 .folder.md。
-->

# 覆盖清单与验证记录

审查对象是 2026-11-20 当前检出的 `main`，提交为 `05909997ef87fe7e9c2d58ea6faf6bfc6ab9d495`。角色包按父仓库固定的 gitlink `0d756e3123984e077b159f78db0e856c66c6519d` 核对。按该版本划分模块，跟踪公开入口到实际实现及失败、取消、恢复分支，并检查相邻测试。现有未跟踪设计资料、图片、历史审阅样本、动效参考文档、第三方依赖和本地缓存不属于本次产品模块。

## 包级覆盖

下表计数取自两个 Git 树，扩展名为 TS、TSX、JS、JSX、MJS、CJS、Rust、Swift、Python，含符合条件的声明、测试与工具文件。数量用于核对审查范围；人工阅读的实际入口见各分册。根工作区负责构建和分发，详见[工程审查](08-engineering.md)。

| 应用或包 | 已跟踪代码文件 | 审查分册 |
| --- | ---: | --- |
| [apps/cli](../../../apps/cli) | 12 | [06](06-contracts-cli.md) |
| [apps/design-docs](../../../apps/design-docs) | 45 | [04](04-interface.md) |
| [apps/electron](../../../apps/electron) | 492 | [03](03-desktop.md)、[04](04-interface.md) |
| [packages/avatar-motion](../../../packages/avatar-motion) | 6 | [04](04-interface.md) |
| [packages/browser-plugins](../../../packages/browser-plugins) | 1 | [07](07-plugins.md) |
| [packages/canvas-plugin](../../../packages/canvas-plugin) | 8 | [07](07-plugins.md) |
| [packages/desktop-plugin](../../../packages/desktop-plugin) | 2 | [07](07-plugins.md) |
| [packages/file-explorer-plugin](../../../packages/file-explorer-plugin) | 3 | [07](07-plugins.md) |
| [packages/runtime](../../../packages/runtime) | 331 | [01](01-runtime-domains.md)、[02](02-runtime-flows.md)、[05](05-engine.md) |
| [packages/runtime-plugin-sdk](../../../packages/runtime-plugin-sdk) | 2 | [07](07-plugins.md) |
| [packages/runtime-plugins](../../../packages/runtime-plugins) | 7 | [07](07-plugins.md) |
| [packages/shared](../../../packages/shared) | 111 | [06](06-contracts-cli.md) |
| [packages/tokens](../../../packages/tokens) | 6 | [04](04-interface.md) |
| [packages/transport](../../../packages/transport) | 7 | [06](06-contracts-cli.md) |
| [packages/ui](../../../packages/ui) | 90 | [04](04-interface.md) |
| [packages/voice-input-plugin](../../../packages/voice-input-plugin) | 12 | [07](07-plugins.md) |

工程范围还包括 `scripts/`、`.github/`、`tests/`、`resources/`、`examples/` 及根配置。测试和脚本按用途审查代表实现，包括 CI 分流、截图证据、构建身份、开发控制器、发布、评估、性能数据及资源分发。Rust/Swift 和上游适配代码按与 Node/Electron 的调用边界抽查。产品业务域单独列出[全部 25 项](01-runtime-domains.md)。

## 本轮实际执行

| 检查 | 结果 | 能说明什么 |
| --- | --- | --- |
| `pnpm check:workspace` | 通过，16 个项目、1,124 个 JS/TS 源文件 | 静态 import、导出和依赖方向符合仓库检查器的规则。 |
| `pnpm exec tsc --noEmit --incremental false` | 通过 | 当前 tsconfig 纳入的 TypeScript 在现有依赖和声明下可通过类型检查。 |
| `pnpm lint:ui` | 通过 | renderer、共享 UI、文件浏览器、设计站 ESLint 和字体角色检查通过。 |
| 四批定向 Vitest | 25 个文件，377 项通过、1 项失败、1 项条件跳过 | 包含实际 AppService/临时 SQLite、RPC、受控宿主及纯函数用例。 |
| `node --test packages/avatar-motion/test/characters.test.mjs` | 1,095 项通过 | 子模块的角色协议和状态组合。 |
| 隔离或纯函数检查 | 见 [RT-06](02-runtime-flows.md)、[VIEW-01](04-interface.md)、[ENG-02](05-engine.md)、[RPC-02](06-contracts-cli.md)、[PLUG-04](07-plugins.md)、[BUILD-03/04](08-engineering.md) | 分别覆盖个人活动聚合、知识列表刷新、群聊历史扫描、编解码、插件配置、截图定位和 TTS 安装状态。 |

Vitest 在仓库根目录运行，命令为 `pnpm exec vitest run --maxWorkers=2` 加下表文件。各名称均位于 `tests/`，扩展名为 `.test.ts`。环境为 Node 22.23.4、pnpm 10.13.1。

| 批次 | 用例文件名 | 结果 |
| --- | --- | --- |
| 1 | test-ci-plan、file-explorer-tree、canvas-host、voice-input-plugin、browser-plugin-host、release-check、build-identity | 85 通过 |
| 2 | cli-rpc、product-store-readonly、cli-service、desktop-plugin-host、ui-preview | 119 通过，1 失败 |
| 3 | cli-desktop-host、runtime-shutdown、employee-task-navigation、task-pages、profile、channels、bundled-skills、core-conversations | 131 通过，1 条件跳过 |
| 4 | contact-deletion、group-chat、channels-dingtalk-source、settings-query、capability-backup | 42 通过 |

失败项位于 `cli-service.test.ts:857`。固定主聊天返回标题 `bobo`，测试仍要求首次附件文件名 `首次资料.md`；该用例在这里停止，后续附件原件与重复请求断言没有执行到。单独的员工附件发送用例已通过。跳过项是渠道测试中由 `BOAI_CLI_CHANNEL_PROCESS_TEST=1` 显式启用的 standalone 变体。[失败断言](../../../tests/cli-service.test.ts#L857) · [跳过条件](../../../tests/channels.test.ts#L880)

本轮未运行全量 Vitest、Electron GUI/E2E、真实模型或渠道账号、个人数据重启、安装包或线上 CI。复核建议写在对应条目，尤其要把跨进程恢复和实际文件写入结束作为验收条件。受控计时只描述该输入规模与环境，不能用于估计个人数据或发布版的实际时延。
