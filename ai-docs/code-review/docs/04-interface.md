<!--
[INPUT]: 05909997 的 Renderer、设计站、共享 UI、Token 及仓库锁定的角色子模块。
[OUTPUT]: 界面模块代码质量、异步刷新问题与可复查的受控验证。
[POS]: BOAI 模块代码审查，桌面界面与设计基础。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->

# 桌面界面、共享组件与设计站

界面已有几种值得保留的实现：任务导航固定员工及聊天身份，提交状态保留原始请求标识，设置查询在后台刷新时可以显示此前已确认的值。问题主要出在对所有业务变更共用的 `changed` 事件。多个列表收到与自己无关的消息也会发出整批读取，有的还会丢弃即将完成的有效回执。

## 发现

<a id="view-01"></a>

### VIEW-01 · P2 · 其他聊天的更新可以让员工知识资料长期停在加载状态

- **调用链**　[employee-knowledge.tsx 第 43 行](../../../apps/electron/src/renderer/components/work-views/employee-knowledge.tsx#L43) 按员工读资料，调用 `usePagedQuery` 时没有会话 ID。后者在 [use-paged-query.ts 第 31 行](../../../apps/electron/src/renderer/components/work-views/use-paged-query.ts#L31) 对任何 `changed` 先增加序号、设为 loading，再安排重读。序号变化之后，即将返回的成功结果在第 30 行被丢弃。业务层发送消息等操作确实会发出带其他会话 ID 的 `changed`（[service.ts 第 3504 行](../../../packages/runtime/src/service.ts#L3504)）。旧列表上的资料操作也会因加载标记被禁用（`employee-knowledge.tsx:50`）。
- **已验证**　用当前的 `usePagedQuery`、真实 React 和 jsdom 挂载一个知识资料查询，使用可手动完成的 IPC 替身。在每次成功回执之前注入另一会话的变更，等待 120 毫秒合并定时器后进入下一轮。五次无关变更后累计发起六次读取，界面仍为 `loading=true`、无首页。停止发事件后，同样的数据在第六次读取完成时立即显示。仅错误文案格式化函数使用替身，全程未打开 Electron。
- **修复与验收**　分别处理对象删除、员工切换与普通背景变更。前两者仍即时拒绝旧回执。普通变更使用脏标记合并，允许当前有效读完成后至多补读一次。优先给知识资料变更加上明确的员工或资源身份。将上述事件顺序固化为 Hook 回归，连同已有的切范围和删除旧对象用例保留。

<a id="view-02"></a>

### VIEW-02 · P2 · 已完成的技能更新页仍持续发起三路查询

- **调用链**　[index.tsx 第 1351 行](../../../apps/electron/src/renderer/components/app-shell/index.tsx#L1351) 打开更新详情。[skill-update-batch.tsx 第 31 行](../../../apps/electron/src/renderer/pages/library/skill-update-batch.tsx#L31) 一次 reload 读取批次、操作列表和检查列表。第 42–44 行订阅所有 `changed` 并每 1.5 秒再调用一次，无论批次是否终结、前一个请求是否结束。generation 保护了结果顺序，不能减少已发出的请求。
- **影响**　保持结果标签可见时，即使没有用户操作或其他事件，稳定一分钟约有 40 轮、120 次读取。后台聊天会在此基础上继续增加查询。慢响应跨过一个或多个刷新周期时还可能持续被后发读取覆盖。这里的频率由定时器推算，未测量真实设备的 CPU 或耗电。
- **修复与验收**　只给运行中的批次设置保底轮询，终态停止计时。把手动刷新、相关事件、定时器合并到同一在途请求，必要时标记补读。用假时钟覆盖批次完成后保持标签打开一分钟、无关聊天活跃及慢查询三种情况，核对 IPC 次数与最终显示状态。

<a id="view-03"></a>

### VIEW-03 · P3 · 设计站的示例源码下载失败后一直显示加载中

- **调用链**　[examples.tsx 第 11 行](../../../apps/design-docs/src/examples.tsx#L11) 将原始示例作为按需加载的模块。[preview.tsx 第 36 行](../../../apps/design-docs/src/preview.tsx#L36) 展开“查看源码”时只处理成功回调。若原始源码 chunk 请求失败（例如页面载入后掉线），Promise 拒绝没有被处理，空字符串继续进入下一行的“加载源码…”分支。
- **影响和修复**　读者无法分辨仍在等待还是已经失败。分别维护加载、成功和失败状态，提供重试并保留卸载保护。让测试 loader 首次拒绝、重试成功，核对错误提示消失且能复制正确源码。证据来自静态源码。

<a id="view-04"></a>

### VIEW-04 · P3 · 帮助页描述的员工记忆分类与现行产品不符

- **调用链**　[index.tsx 第 1306 行](../../../apps/electron/src/renderer/components/app-shell/index.tsx#L1306) 渲染帮助路由。[index.tsx 第 14 行](../../../apps/electron/src/renderer/pages/help/index.tsx#L14) 统一描述“长期、经历和临时信息”。实际管理页在 [memory-pane.tsx 第 145 行](../../../apps/electron/src/renderer/components/employee/memory-pane.tsx#L145) 将本机 Agent 记忆交给原生后端，对 API 员工显示 Working Memory 和 Observational Memory，并提供范围和检索配置。
- **影响和修复**　读者会在配置页寻找不存在的管理分类，也无法从说明判断本机员工由谁管理记忆。按界面现有的两种执行方式改写帮助段落。走读两类员工的帮助和配置文字即可验收。证据来自静态源码。

## 模块覆盖

下表记录实际阅读的代表入口。Renderer 行中的路径省略前缀 `apps/electron/src/renderer/`。这部分有 466 个受版本管理的 TS、TSX、JS、CSS 或 HTML 文件；覆盖粒度是模块、入口与关键分支。

| 模块 | 核读入口 | 质量判断 |
| --- | --- | --- |
| 应用壳、导航与全局事件 | `main.tsx`、`components/app-shell/index.tsx`、`employee-task-navigation.ts`、`employee-task-notifications.ts` | 任务导航在异步步骤后复核原身份。Shell 集合聊天发送、导航守卫与右栏组合，达 1,385 行。后续修改单个流程时可沿现有导航函数逐步提取纯逻辑。 |
| 聊天、草稿、成果消息 | `pages/conversations/message-send-state.ts`、`live-message-buffer.ts`、`use-chat-artifacts.ts` | 保存的提交载荷需通过字段校验；消息缓冲按会话和查询寿命释放。采用成果、申请验收等回执核对包含原请求身份，适合单独测试。 |
| 任务、执行过程与文件详情 | `components/detail-panel/employee-tasks-panel.tsx`、`execution-content-cache.ts` | 执行内容缓存有容量和清理策略。五个状态列用同一个 Promise.all 刷新，任一列读取失败，全板显示重试；任意 changed 都会触发整板读取。这里值得跟踪每次任务活动的 IPC 数量。 |
| 工作、会话文件、员工资料 | `components/work-views/use-paged-query.ts`、`pagination.ts`、`conversation-files.tsx`、`employee-knowledge.tsx` | 有重复游标保护、切换身份后的结果隔离。普通变更也使用强制失效导致 VIEW-01。 |
| 通讯录与员工配置 | `pages/contacts/use-contact-list.ts`、`components/employee/agent-model-selection.ts`、`memory-pane.tsx` | 写入携带 revision，冲突后重读。模型选择区分 API、原生与插件；终态信息显示依赖实际后端。 |
| 定时任务 | `pages/schedules/use-schedule-list.ts`、`automation-history.tsx` | 列表偏好有互斥与冲突恢复；历史详情校验 occurrence ID，停止操作固定该 ID。打开历史时仍会监听所有 changed。 |
| 资源库及技能 | `pages/library/use-local-skills.ts`、`use-prompt-collections.ts`、`skill-update-batch.tsx` | 本地目录用 API 级 WeakMap 去重，提示词集合使用 revision 抵御旧响应。更新页的并发读取另见 VIEW-02。 |
| 数据源 | `pages/sources/source-detail-state.ts`、`source-oauth-dialog.tsx` | 详情去抖，关闭后解除订阅。OAuth 固定 sourceId 与 authorizationId，未确认的写入沿原 requestId 核对；状态查询出错后提供手动核对。 |
| 设置、状态库、API 入口 | `services/request`、`stores/settings-query.ts`、`hooks/use-web-search.ts`、`pages/settings/app-updates.tsx`、`local-connections.tsx` | 设置查询合并读取，允许软失效后先展示读到的值；搜索设置和更新卡使用 revision 防倒退。本机连接页触发的主线程工作见桌面报告。 |
| 帮助 | `pages/help/index.tsx` | 静态说明易于读懂，执行内核演进后需同步事实，见 VIEW-04。 |
| 文件预览、通用交互、图标和样式 | `components/common/file-preview/plugins/registry.ts`、`use-preview-registry.ts`、`components/common/index.tsx`、`components/icons/index.tsx`、`styles/global.css` | 预览按文件能力与已启用插件筛选，注册表按设置复用。通用 mutation 同步设置在途锁。图标再导出共享包，基础样式和页面样式的级联层由统一入口安排。 |
| 原版动效与差异显示 | `components/common/lody/code-collab-diff-metadata-bounds.ts`、`pages/settings/generation/ui-generation.js` | diff 为主线程渲染提供复杂度限制；动效显式取消帧和计时器，恢复元素样式。视觉效果与长时资源占用留待实际渲染测量。 |
| 浏览器与画板视图 | `components/browser/utils.ts`、`components/canvas/bridge.ts`、`host-barrier.ts` | 画板读写固定 scope，备份按 hold ID 聚合各视图 flush 回执。浏览器工具函数自行解析主机名及颜色。 |
| 共享 UI | `packages/ui/src/components/use-editor-guard.tsx`、`tabs-indicator.tsx`、`shiki-highlighter.ts`、`carousel.tsx` | 守卫校验导航代次，Tab 指示器卸载时断开观察器，高亮加载失败可重新初始化。Carousel 注册 reInit 和 select，但清理回调只移除 select，可在维护时对称解除，影响随 Embla 实例寿命而异。 |
| Token 与设计文档 | `packages/tokens/src/typography.ts`、`catalog.ts`，`apps/design-docs/src/app.tsx`、`search.ts`、`preview.tsx` | 字体角色、字号比例和文档目录均读取共享数据。预览 iframe 校验消息来源和窗口。源码加载失败缺口见 VIEW-03。 |
| 角色动画 | `packages/avatar-motion/src/index.js`、`characters.js`、`test/characters.test.mjs` | 父仓库固定子模块 0d756e3。播放器校验枚举与数值范围，构造失败释放 stage，dispose 为幂等。已运行角色协议和行为测试，WebGL 与桌面宿主的实际帧率仍需独立测量。 |

## 验证记录

- 当前提交为 `05909997ef87fe7e9c2d58ea6faf6bfc6ab9d495`。VIEW-01 使用该工作区实际的 Hook 和分页逻辑，受控 IPC 实验的六次读取计数及最终界面状态已核对。
- `node --test packages/avatar-motion/test/characters.test.mjs` 运行 1,095 项，全部通过。它们包括三个角色的协议校验以及状态、活动和用户活动组合，不能外推到实际 WebGL、GUI 或业务流程。
- 本批后台运行的 `tests/employee-task-navigation.test.ts` 和 `tests/settings-query.test.ts` 均通过，分别覆盖任务导航和设置查询生命周期。VIEW-01 使用工作视图的另一套查询实现。
