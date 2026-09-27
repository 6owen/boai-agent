# Electron 外层参考与迁移边界

> 归档说明（2026-09-27）：下文保留原制定时的设计与时间语境；“当前/下一版/尚未开发”不代表最新状态。实际交付请读 [当前功能与代码现状](../2.已实现功能与代码现状/README.md)。

版本：v0.1（草案）  
日期：2026-09-26

## 1. 目的

参考同级 boai-app 的桌面结构，减少窗口、通信、本地执行与打包上的重复探索。boai-agent 是独立产品，使用 Mastra 和新的数字员工 / 群聊领域。

本文件记录参考路径及建议，不表示已复制代码或完成兼容性验证。

## 2. 可参考的实现

以下链接指向同级参考项目，路径以 boai-app 为根。

| 模块 | 参考文件 | 借鉴内容 |
| --- | --- | --- |
| 应用启动 | [apps/electron/src/main/index.ts](../../../../boai-app/apps/electron/src/main/index.ts) | 初始化顺序、窗口与本地服务生命周期 |
| 窗口管理 | [apps/electron/src/main/window-manager.ts](../../../../boai-app/apps/electron/src/main/window-manager.ts) | 集中管理窗口及桌面行为 |
| preload | [apps/electron/src/preload/bootstrap.ts](../../../../boai-app/apps/electron/src/preload/bootstrap.ts) | 为 Renderer 暴露受控能力 |
| 请求与事件封装 | [apps/electron/src/transport/build-api.ts](../../../../boai-app/apps/electron/src/transport/build-api.ts) | 隔离页面与底层传输 |
| 执行进程边界 | [packages/shared/src/agent/pi-agent.ts](../../../../boai-app/packages/shared/src/agent/pi-agent.ts) | 显式传入目录、模型与会话标识，返回运行事件 |
| Skills 来源管理 | [packages/shared/src/skills/storage.ts](../../../../boai-app/packages/shared/src/skills/storage.ts) | 资源发现、来源与目录规则 |
| 桌面构建入口 | [apps/electron/package.json](../../../../boai-app/apps/electron/package.json) | 主进程、preload、renderer 和子进程分别构建 |
| 分发配置 | [apps/electron/electron-builder.yml](../../../../boai-app/apps/electron/electron-builder.yml) | 资源打包与平台分发，按新产品裁剪 |

## 3. 已核实的参考拓扑

boai-app 采用 React 页面、preload、本地 WS/RPC 服务、SessionManager 与 Pi 子进程的分层，表明 Node 服务逻辑可以随桌面应用在本机运行。

执行进程通过消息接收 cwd、workspace、session 路径和模型等配置。产品会话与 Pi 的可恢复上下文分别保存。这些边界值得借鉴。

新项目可使用直接的本地 IPC，无需因参考项目有 WebSocket 就保留相同传输；执行消息应转换为 boai-agent 的产品协议。

## 4. 不整体迁入的部分

- packages/pi-agent-server 和 Pi 专属协议、SDK 适配及恢复逻辑。
- 整个 SessionManager 及其积累的产品耦合。
- 一个产品 session 对应一个 Agent 实例的身份假设。
- 远程会话转移、外部 IM 网关、DAG 看板和首版无关的云端功能。
- 全量 provider 特例、历史迁移和未被首版使用的插件机制。
- 旧产品名称、应用标识、发布地址、凭据配置与自动更新端点。

可按需提取独立 UI 组件或小模块；提取前检查依赖，不将绑定 Pi 类型或旧会话模型的组件直接接到新运行层。

## 5. 外层参考与内层重建

| 借鉴桌面实现 | 新产品自行定义 |
| --- | --- |
| 窗口与导航容器 | 联系人与群聊的信息结构 |
| 消息列表、Markdown 展示 | 发言者身份、引用关系和每位员工的流式状态 |
| 文件选择与产物打开体验 | 工作目录授权及文件归属 |
| 运行状态的展示形式 | Run、工具调用、取消与恢复语义 |
| preload 与通信结构 | Mastra 适配后的请求/事件协议 |

当前只确认参考方向，不锁定最终视觉设计。页面复制范围在桌面骨架阶段逐个决定。

## 6. 构建与打包

boai-app 使用 Vite 构建 Renderer，esbuild 构建部分宿主产物，以 electron-builder 分发，开发脚本使用 Bun。新项目参考分层，分别选择开发工具和发行版运行环境。

参考项目的主进程构建为 CJS，而 Mastra 运行层需要按其版本要求保持 ESM。运行层应独立打包并验证实际入口和依赖加载。

用户安装后不应先配置开发仓库、Bun 或全局 Node 才能运行核心应用。工具脚本的额外依赖按资源执行方案管理。

## 7. 提取顺序建议

1. 建立新的 Electron / React 空壳与应用标识。
2. 提取最少的窗口、preload 和受控请求能力。
3. 启动独立 Mastra 进程，验证事件、取消和退出。
4. 加入联系人与单聊，再接入群聊领域。
5. 按页面需求提取附件、工具状态及产物展示组件。
6. 尽早生成安装包验证，随后完善主题、设置等桌面体验。

## 8. 通过标准

- 无需启动 boai-app，新项目即可独立运行。
- 核心执行路径不依赖 Pi 包或 Pi 会话协议。
- Renderer 不直接访问数据库、命令执行或原始凭据。
- 运行进程退出可识别，未完成任务不会持续显示为正常执行。
- 安装版可以找到运行入口，并将数据写入可写用户目录。
- 复制模块保留必要许可信息，不带入旧产品发布配置。
