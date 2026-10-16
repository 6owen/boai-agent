<!--
[OUTPUT]: 07:41提交前复查全库类型通过，通讯录/定时历史/目录结果3文件18项通过；此前并行通讯录类型阻塞已解除，旧失败保留。
[OUTPUT]: source-authority批次178项与消息锚点最终3项通过，初次类型/lint通过；末次全库类型受并行通讯录导出变更阻塞；当前dev重启迁移1→0，无E2E。
[OUTPUT]: source-editor-compact记录数据源卡片局部尺寸收紧及类型/lint通过，保留贴边滚动，无E2E。
[OUTPUT]: 行内操作批次source-row-actions五项组件回归/类型/lint通过，真实状态与逐行操作、确认删除、原位刷新；无E2E。
[OUTPUT]: 编辑滚动批次source-editor-scroll类型/lint通过，卡片外层ScrollArea贴边、标题固定；HMR更新，无E2E。
[OUTPUT]: 删除Popover批次定向lint通过；全库类型检查有detail-tabs测试类型错误，未改其他并行工作，无E2E。
[OUTPUT]: 绑定入口收敛批次5项详情订阅回归及lint通过；全库类型检查被自动化/浏览器模块3处错误阻塞，未改相关并行工作，无E2E。
[OUTPUT]: 编辑表单布局批次直接复用模型连接组件，source-editor-layout类型/lint通过，HMR更新；无E2E或后端重启。
[OUTPUT]: AI管理入口话术删除，单资源仅填ID；catalog-entry静态检查通过，无E2E/后台重启。
[OUTPUT]: 凭据回填与显隐批次：18模块/类型/lint/构建通过，专用编辑读取及正常开发进程重载；未运行E2E或读取真实用户密钥。
[OUTPUT]: 结果入口与配置详情批次：公共IPC完整准入、技能同款数据源列表及右侧配置，50模块/类型/lint/构建通过，原源认证失败保留，无E2E。
[OUTPUT]: 资源库命名/共享会话标题增量仅类型与定向lint通过，无E2E，前端HMR生效。
[OUTPUT]: AI-only添加批次：移除手动新增，迁用固定Craft流程及API管理chat浏览器；171模块/类型/lint/构建，未跑E2E。
[OUTPUT]: 收藏展开改自然布局后，按收起末尾label卡顿反馈补分组外边距隔离；仅静态检查，不再运行E2E，原失败保持。
[OUTPUT]: 技能交互第二轮：会话真实折叠/常驻Tabs动画、固定宽度、商城左右对齐与共享详情，2+6场Electron通过。
[OUTPUT]: 追加用户截图后的目录布局纠正：类型分组、技能右侧面板、稳定Tabs/同行检索与空态；原首版记录保持。
[INPUT]: 用户授权后的数据源实现、源码模块及真实Electron检查。
[OUTPUT]: 首版实际完成范围、通过/失败批次和原件索引，不认证真实供应商或其他操作系统。
[POS]: 19组08 §9的本次验证账本。
[PROTOCOL]: 变化同步本目录.folder.md和设计状态。
-->
# 自定义与数据源首版验证

日期：2026-10-17。实现合同见[19组08 §9](../../spec/19.应用插件架构/08-Composer与技能数据源整合设计.md)。

已实现“自定义”统一导航：上方技能/数据源，下方混合已安装列表；右侧复用原技能管理和新增数据源目录/详情。API、MCP（HTTP/SSE/stdio）、本地文件夹具有真实保存、测试、启停删除、员工绑定和运行调用；Craft认证/API核心保留固定来源与许可。

## 检查结果

| 批次 | 实际结果 |
| --- | --- |
| `regression-88.log` | 9个文件、88项模块回归通过，覆盖数据源、材料、技能、Composer、核心会话 |
| `tools-read-write-final.log` | 收尾后数据源/宿主13项通过；实际HTTP、SSE、stdio、SQLite、本地文件及子进程退出；宿主执行两种工具桥，写入沿原Work |
| `desktop-03.log` | 当前最终构建8场Electron全部通过，40.8秒：Composer 4场、原技能 2场、新数据源 2场 |
| `typecheck.log`、`lint-ui.log`、`bddgen.log`、`build.log` | 均通过；build保留原有大chunk提示 |
| `verification.json`、`trace-archive.json` | 最终8场截图/元数据逐文件hash核对；最终trace原文件复制后核hash，未改写原manifest |

桌面场景覆盖：只在当前连接内换模型/推理、权限入口隐藏、命令/技能文件引用；技能发现、扫描、原文、收藏、分组拖拽/键盘/重启；原生选择文件夹、实际目录测试、绑定研究员、与技能切换、重启保存、删除解除授权但保留原件；Bearer API真实HTTP测试、凭据不回显、停用，以及MCP配置保存。窄窗以实际Electron窗口尺寸检查，不伪造viewport。

## 保留的失败及修正

- 首次模块命令额外传入`--`，未形成有效定向成绩，主动取消；之后使用`pnpm exec vitest run <files> --maxWorkers=…`。原输出保留为`modules-invocation-cancelled.log`，不将其算作全量通过。
- 宿主夹具漏传Work结果必需的`summary`，修正夹具后通过，见`host-fixture-failure.log`。
- HTTP/SSE协议夹具在测试连接退出后复用一个已初始化服务实例，第二会话被SDK拒绝；改为每会话新建服务器后通过，见`protocol-fixture-failure.log`与`protocols-02.log`。
- `desktop-01`：1通过、1失败。文件夹测试期望`/var`，原生选择正确返回macOS规范路径`/private/var`；将夹具路径规范化后继续，未放宽产品路径边界。
- `desktop-02`：2通过、2失败。技能详情新增返回按钮继承标题栏`pointer-events:none`，无法点击，属于产品缺陷。已修复按钮接收点击，并在`desktop-03`完整复验8场通过。
- 前两批的截图/manifest/失败日志原样保留；对应trace仅原manifest索引，未在覆盖前长期归档。最终批次trace已逐个归档，不把前两批索引称作完整回放原件。

## 实际界面

- [数据源与混合已安装列表](./desktop-03/scenarios/a6acd9696f69cebc83f8-6a1ffd9bda1bb29a82b1-retry0-repeat0-9snYnI/003-MCP配置与混合已安装列表.native.png)
- [文件夹与员工绑定](./desktop-03/scenarios/a6acd9696f69cebc83f8-bdd75d3fa46a50bb2cda-retry0-repeat0-KVylUm/001-文件夹详情与员工绑定.native.png)
- [实际800×680窄窗](./desktop-03/scenarios/a6acd9696f69cebc83f8-bdd75d3fa46a50bb2cda-retry0-repeat0-KVylUm/004-自定义整合与窄窗.native.png)
- [原技能详情整合](./desktop-03/scenarios/97a43ace841f589730df-89cacb3f47dbaef418d2-retry0-repeat0-3p4E5w/001-技能整合详情.native.png)

代理已查看最终数据源、窄窗和技能详情原生截图，未发现裁切或遮挡；人工观感仍待用户审阅。测试使用本地协议服务器和确定性模型夹具，没有连接真实外部账号或调用付费模型。MCP stdio进程退出在macOS实测，未认证Windows/Linux。OAuth网页登录/自动刷新、预设服务市场、数据源插件注册和数据源composer @引用不属于本次已实现范围。


## 目录布局纠正（2026-10-17 后续）

最新界面合同见19组08第10节：左侧采用会话label分组（技能/MCP/API/本地文件夹）；技能详情进入系统右侧面板，目录继续可操作；本地/收藏/商城共用标题与标签搜索栏；技能和数据源标题不显示说明文字；数据源筛选改为共享Tabs，检索同行靠右，空态使用系统插画。

本轮原件独立保存于[customization-layout](../../../.local/2026-10-17-customization-layout)，不覆盖以上首版批次。

- `desktop-01`：6场Electron通过（36.5秒）。覆盖本机技能原文/外部编辑扫描、收藏分组和拖拽重启、商城迟到响应隔离、文件夹绑定/删除和窄窗、API测试/停用/MCP保存，以及新增目录布局场景。
- `desktop-02`：复用会话透明label后的定向场景通过（6.6秒）。核对四种分组/折叠、标签筛选、检索同行、切换商城前后标题及Tabs几何稳定、技能右侧正文与主目录搜索保留、系统插画空态及900px窗口。截图等待标签选中层到达实际选中项后采集。
- 23项现有详情标签模块测试通过；最终typecheck、修改renderer文件eslint、BDD生成、源码构建和diff空白检查通过。最初typecheck曾发现新回调未接测试夹具、图标导出名及类型声明不匹配，修正后通过，原日志保留。
- 未重跑商城分页失败场景；本轮商城验证包含页面切换布局和受控提供方迟到响应隔离，不把它宣称为完整商城验收。没有新真实模型调用。

最终技能并列详情、空态和类型分组原生截图已查看；两批截图/数据按manifest核hash，trace在下一批运行前分别归档。用户视觉评价仍独立。


## 技能交互与详情一致性（2026-10-17 第二轮）

用户指出上轮最终位置检查没有覆盖真实过渡：左侧数组立即删行没有内容动画，商城分支重建Tabs没有滑动；窄窗可裁切主标签，商城详情仍是独立布局。本轮按19组08 §11修正这些产品缺口。

- 左侧改用会话同一Collapsible/Trigger/Content，组内保留有界虚拟列表及焦点项。关闭时不直接删除行，前组动画时重新测量后组偏移。
- 主Tabs/滑动选中层持续挂载，搜索与动作通过插槽切换；主标签不收缩，搜索在不足宽度时换行。商城来源左对齐主标签、排序同行靠右，删除旧说明图标。
- 新增共享`SkillDetailPanel`和`SkillDetailBody`，本地与商城共用标题/操作、渐隐滚动、图标名称、元数据及说明卡片。商城安装/刷新在标题栏，来源/作者/版本/统计在元数据；隐藏详情暂停读取。

原件：[skills-polish](../../../.local/2026-10-17-skills-polish)。

| 批次 | 实际结果 |
| --- | --- |
| `desktop-01` | 2场通过，20.5秒。采样关闭分组的中间高度与终态0；切换本地/收藏/商城检查同一Tabs节点及滑动中间帧；来源与排序同行对齐、移除说明图标、共享详情结构、实际800×680窗口标签不裁切。 |
| `desktop-02` | 6场通过，37.5秒。本地扫描/外部编辑/收藏分组、拖拽与重启；商城分页失败重试/去重、快速搜索/跨提供方迟到结果；文件夹绑定/保留原件删除、API测试/密钥不回显/停用与MCP保存。 |
| 类型/构建/检查 | typecheck、renderer定向eslint、BDD生成、源码build和diff空白检查通过。构建保留原有大chunk提示。 |

共8个不同Electron场景通过，使用隔离目录/受控供应商和真实本地IPC，没有新外部账号/付费模型调用。两批截图/元数据按manifest逐项校验，trace在下一次运行前独立复制并核hash，见各批`verified.json`。已查看首批商城对齐/详情/窄窗与第二批本地完整详情截图；首批本地详情截在面板进入过渡中，不能拿该张中途裁切作为静止布局证据。

本轮没有生产回归失败。第一次eslint命令包含未配置的测试文件，产生3个ignored警告；随后仅对实际renderer文件运行，零错误/警告。商城旧断言已同步当前Sonner和独立详情面板，夹具补全全局Toaster，重新验收原分页错误展示；不将过期测试失败静默忽略。

## 添加交互与目录过渡（第三轮）

按19组08 §12实现详情最右安装、最右侧32px到240px检索、内容和商城结果过渡、侧栏贴边滚动，以及技能/数据源标题和二级标签对齐。添加数据源使用至少176px的手动/API/MCP/文件夹子菜单和专用bobo创建会话；复用定时任务发送/回执机制和来源schema，实际保存与创建回执同事务，凭据仍进入SecretStore。

原件和日志：[sources-chat](../../../.local/2026-10-17-sources-chat)。以下均是用户要求停止E2E之前的实际批次：

| 批次 | 实际结果与纠正 |
| --- | --- |
| 模块/静态 | 3个文件21项通过；最终typecheck、lint、BDD生成、build通过，保留原大chunk提示。覆盖三类创建、幂等/冲突/删除不复活、专用会话门禁与本机产品桥。 |
| desktop-01 | 2场失败：检索被InputGroup工具类覆盖宽度；数据源夹具漏导航。改为外层宽度过渡并修正导航。 |
| desktop-02 | 1通过1失败；新建会话按钮继承标题栏pointer-events，补回原chat-header-actions。 |
| desktop-03 | 9通过1失败；会话夹具误将历史API名当成本轮文件夹指令，改为只识别最后一条用户消息。 |
| desktop-04 | 2通过1失败；min-w-44受13px根字号影响不足176px，改为显式像素宽度，测量等待进入动画结束。 |
| desktop-05 | 会话场景断言通过，但BDD报告出现Pickle not found；修正生成文件后复验，不计为完整通过批次。 |
| desktop-06 | 3场通过，25.3秒：目录过渡/检索/窄窗、标题和二级栏对齐、两级菜单及会话创建三类来源/编辑/重启。 |

修正后累计10个不同桌面场景通过，不称作全部场景在最终源码单批次复验。01–05批回放按独立目录保留；06批截图、元数据和manifest保留，trace未在共享输出覆盖前独立归档。没有新外部账号或付费模型调用；会话使用确定性模型夹具和真实Mastra/IPC/SQLite，不认证真实本机SDK。

## 收藏分组展开抖动纠正

首版收藏使用共享Collapsible，但内部仍有虚拟高度测量、偏移观察及展开时自动滚到选中项。用户明确反馈展开颤抖，说明已有过渡中间高度断言不能证明视觉顺滑；原结论不能替代本次反馈。

现改为会话页相同的`CollapsibleContent > div[role=group] > 普通列表行`。删除收藏组内虚拟化和ResizeObserver、展开自动定位及分组最小高度；只在明确上下键导航时定位行。拖拽、跨组Alt方向键、收藏和菜单继续共用原逻辑，本地完整目录保留虚拟化。

用户明确“不需要e2e”后没有再启动桌面测试。此前已启动的两场记录为1通过1失败：分组拖拽/动画断言通过；本地导入场景因页面/浏览器已关闭而失败，原日志保留，不推断关闭原因。当前自然布局修正仅完成typecheck、定向eslint和diff空白检查，均通过；没有将旧桌面成绩归到这次修正。记录位于[favorite-animation](../../../.local/2026-10-17-favorite-animation)，最新静态日志为`typecheck-natural-list.log`和`lint-natural-list.log`。

用户继续反馈收起最后两帧下一分组label卡顿。源码检查发现标题含上下margin，而分组为普通块：面板收至0并卸载后，上组底部与下组顶部外边距可重新折叠。局部给`.skills-list-group`设置`display:flow-root`，使标题间距始终包含于各自分组。Base UI源码会等待全部高度/透明度过渡完成才卸载，未修改共享时长或添加延迟。此次仅CSS及文档修改，diff空白检查通过，未跑E2E，也未声称完成逐帧视觉验收。


## 普通 bobo 全局管理（2026-10-17）

现行合同见19组08 §13。技能/数据源的AI管理和会话添加改为正常会话页bobo首发草稿；普通bobo私聊可管理全局目录，API与本机共用管理命令、原配置/安装/绑定服务。删除内嵌source-assistant；bobo设置统一跳通讯录。

本轮原日志归 `.local/2026-10-17-catalog-management/`：

| 检查 | 实际结果 |
| --- | --- |
| `modules-final-02.log` | 5个文件、173项通过：实际AppService/SQLite和临时文件的技能/数据源CRUD、稳定创建回执、版本冲突、绑定/解绑、只读来源/链接拒绝、结束运行拒绝与聊天清理；原生产品桥与实际Mastra SDK的本地HTTP工具协议接续；原数据源与历史回归 |
| `typecheck-final-02.log` | TypeScript通过 |
| `lint-final.log` | 本轮6个renderer入口/组件ESLint通过 |
| `build-final.log` | 源码构建通过，保留既有大chunk提示 |

保留检查过程：首轮typecheck暴露本轮员工集合属性误用，修正后通过；下一轮仅并行日程修改中的automationPublication类型尚未同步，保留原失败日志，不改写其实现；后续最终全仓类型检查通过。最初19项、随后169项和加入历史清理后的173项分批记录，不重复计为不同场景。

未运行E2E、外部供应商模型、真实用户数据的管理命令，也没有新增桌面测试实例。模块结果不代表自然语言模型对所有管理意图的准确性或桌面视觉认证。开发应用只作正常进程更新，没有发送管理消息、创建测试会话或改变真实目录。文件同盘移出与数据库元数据清理不构成跨介质原子事务，失败显性返回；插件/其他Agent来源仍只读。

结果卡最终按真实创建时间排序；该变更后 `result-order.log` 的4项管理集成回归通过，未重复计算为新场景。正常开发应用确认无活动运行后通过原退出流程重启，最终 `pnpm dev` 重新构建并载入宿主/runtime。


## AI-only 添加（2026-10-17）

现行19组08 §14：数据源目录只保留AI管理，手动新增菜单和SourceEditor新增分支退役；已有源编辑/测试/员工绑定保持。bobo仍是普通会话。

参考并适配Craft固定提交 `22c9f0414ab63e0a22814c9a2ada740206e09091` 的add-source上下文和sources.md设置流程，新增 `craft/source-setup.ts`，通过 `manage_data_sources guide` 供API/本机读取。原内置浏览器接入API普通管理chat，用于查官方文档；工具结束实际drain，普通无管理授权chat未扩大能力。

原件归 `.local/2026-10-17-source-ai-only/`：`upstream.json`记录原文件hash；`modules.log`四文件171项通过，含真实AppService/原生桥指南读取→保存→本地目录测试回执、实际Mastra SDK的管理工具/浏览器文档接续及权限隔离；`typecheck.log`、`lint.log`（两个数据源UI文件）、`build.log`均通过，保留已有大chunk提示。未运行E2E、真实外部服务接入或用户数据的管理操作；没有将前一批173项归为本批成绩。

仅迁用并适配设置流程，原存储/vault/权限保持。OAuth与其他不支持配置明确告知模型，不能假装已接入；实际连接成功只以原test结果为准，用户只要求保存不连接时标记未测试。原手动新增桌面场景属于此前版本，不代表本轮UI行为。

正常开发应用经原退出流程关闭后，以pnpm dev重新构建并启动；最终单主进程和单runtime worker已核对，PID与构建hash见本批dev-process.json。未发送模型测试消息。


## 资源库标题（2026-10-17）

按19组08 §15将主导航/tooltip、全局标题及左侧标题统一为资源库；直接复用会话的list-heading和外层响应式缩进，移除独立20px字号/padding。当前技能/数据源分类保持，指令、Hooks、RTK为后续方向，没有新增占位。

本轮仅前端修改。`.local/2026-10-17-resource-library-title/typecheck.log`与`lint.log`（3个修改的renderer文件）均通过，diff空白检查通过；没有新增测试、运行E2E或重启后台服务。


## 结果入口与配置详情（2026-10-17）

现行19组08 §16。截图中的“当前运行版本尚未加载此功能”由聊天结果组件请求`listCatalogResults`时，被Electron主进程漏接的白名单拒绝；runtime内部的AI创建路径已提交数据源，因此列表仍然出现。同期`saveLocalSkill`和`removeLocalSkill`也漏接。抽出实际入口`public-methods.ts`，使用`Record<Method,true>`覆盖202个公开方法；未知和runtime私有方法仍拒绝。此前模块测试直接调用AppService，未覆盖主进程准入，旧“重启即生效”的结论不覆盖此缺口；本次显式补齐。

数据源目录和技能共用列表行/图标/文字样式；目录、已安装侧栏及聊天结果统一打开全局右侧source标签。配置详情复用技能标题/元数据/说明布局，MCP传输、地址或命令参数、认证状态、工具清单和员工绑定可读；原编辑、测试、启停、删除和版本化绑定保持。隐藏停止读取及订阅，变更合并刷新，旧响应不会覆盖当前数据。

本次只读核对用户已有`LegalDataHunter`记录：配置revision为1；原连接测试回执是`failed`、`Authentication required`，并非连接已认证成功。没有修改认证、重跑真实MCP测试、再次创建数据源或发送模型消息。此服务认证失败与主进程未知请求提示是两个独立事实。

Craft的`EditContextKey/EDIT_CONFIGS`是入口到目标路径、提示和校验步骤的上下文预设；BOAI已有管理工具action/对象ID/版本核对，不另建Craft存储或执行通道。未来更多资源类别可沿统一类型化上下文映射扩展。

本批原件位于[2026-10-17-source-details](../../../.local/2026-10-17-source-details)：

| 检查 | 实际结果 |
| --- | --- |
| `modules.log` | 6个文件、50项通过：公开入口/私有拒绝，详情读取/绑定筛选/全局事件合并/旧响应与隐藏隔离/失败恢复，右侧标签复用与页面隔离，原目录管理及数据源服务回归 |
| `typecheck-final.log` | TypeScript通过，含公共方法完整性静态核对 |
| `lint-final.log` | 数据源目录及此次修改的renderer组件ESLint通过 |
| `build.log` | 源码构建通过，保留原大chunk提示 |
| `dev-process.json` | 原开发主进程和runtime正常退出后，pnpm dev重新构建；最终单主进程/单runtime、构建hash与三个公开入口确认；已有源ID/revision/test状态及运行记录数量保持 |

未运行E2E、桌面自动化场景或真实外部模型/服务测试；模块检查不构成视觉验收。过程中的一次只读TypeScript AST探针因当前包未提供ScriptTarget导出而失败，改用静态合同枚举核对出199个旧入口/202个公共方法，不改变业务或上述测试成绩。正常开发重启前没有活动运行，沿应用自身退出流程，不强杀进程。


## 凭据回填与显隐（2026-10-17）

按用户明确要求与19组08 §17：点击“编辑配置”先按固定ID/版本读取已保存凭据，再以初始值填入输入框。默认password掩码；复用模型连接现有InputGroup、Eye/EyeOff按钮切换明文，切换不提交、不改变表单dirty。删除密钥下方说明及独立清除勾选，保存提交实际输入值，清空即删除。

新增`getDataSourceCredential`，主进程完整准入表与AppService到SourceService接线；getter串行核对版本并读vault。目录与普通详情DTO、模型工具、备份不添加密钥。隐藏/关闭后的迟到读取不重新打开编辑器。没有读取、展示到工具日志或修改真实用户密钥。

本批原日志归[2026-10-17-source-credential](../../../.local/2026-10-17-source-credential)：`modules.log`3文件18项通过，新增实际AppService/测试vault读取、替换后重新读取、空值清除、过期版本/非法vault参数/删除和缺失记录拒绝，普通目录DTO排除密钥；`typecheck.log`、`lint.log`及`build.log`通过，保留原大chunk提示。最初模块命令因并行日志目录尚未建立而未启动，随后在目录建好后完整运行，不记为测试失败或额外批次。

正常开发应用在无活动运行后沿原退出流程关闭，以pnpm dev重建启动；`dev-process.json`记录单主进程/单runtime、当前构建hash、主进程准入与运行时处理器已包含新增接口。未运行E2E或真实外部服务测试，未新增桌面测试实例；没有声称视觉自动化验收。


## AI 管理入口文案（2026-10-17）

按19组08 §18删除自动填入的“帮我管理数据源/技能”等文本。目录入口不改草稿；单资源仅追加一个ID，已有相同ID不重复，保留原正文、提及和附件。不自动发送或创建会话。

`.local/2026-10-17-catalog-entry/typecheck.log`与`lint.log`通过，diff空白检查通过。此次为可逆前端入口调整，没有增加实现镜像测试、运行E2E或重启后台；正常开发前端通过原HMR更新。

## 编辑表单布局（2026-10-17）

按19组08 §19，MCP编辑直接复用“连接OpenAI兼容接口”的布局组件：620px弹窗、配置插画、横向字段、图标、分组卡片和底部操作栏。连接方式及其地址/本机程序参数放在同组，说明使用原Tooltip。API和本地文件夹沿同一编辑器适配；删除原独立纵向表单CSS。保存按钮居右，凭据回填/掩码/眼睛显隐、版本化提交和未保存保护保持。

`.local/2026-10-17-source-editor-layout/typecheck.log`及`lint.log`（3个相关renderer文件）通过。正常开发日志记录source-editor与共用布局/插画HMR更新，未重启后台。此次为可逆前端布局调整，未新增测试、运行E2E、读取真实用户密钥或连接外部服务；静态检查不等同于人工视觉验收。

## 绑定入口统一归员工（2026-10-17）

按19组08 §20移除数据源详情的绑定按钮、菜单项、员工名单与SourceBindings弹窗；对应名单CSS及为名单读取员工snapshot的请求一并删除。MCP、API、本地文件夹共用详情；通讯录员工配置的SourcePicker及原保存不改，不写入或清除任何已有绑定。

原日志位于 `.local/2026-10-17-source-binding-entry/`：`modules.log`为原详情订阅5项回归通过，核对只读目标配置、合并刷新、旧响应/隐藏隔离与错误恢复；`lint.log`两个修改的renderer文件通过。`typecheck.log`全库检查失败，错误为未修改的 `history-deletion.ts:44` 缺少 `usageIncomplete`，以及 `service.ts:1547` 两处 `BrowserTaskAuthorization.runId` 类型不匹配；未扩大范围修改其他并行工作。与本批源详情相关文件没有类型诊断，但不将全库检查记为通过。

正常开发日志已记录source-detail HMR。未运行E2E、新增桌面实例、修改后台或真实用户数据；原批次类型通过仅代表其运行时刻。

## 删除确认 Popover（2026-10-17）

按19组08 §21将数据源删除Dialog改为更多按钮旁的Popover确认，沿定时任务的确认标题和取消/危险色确认按钮布局。菜单与Popover交接焦点遵循已有技能操作菜单模式，浮层锚点使用常驻按钮；隐藏关闭确认，取消不提交，原删除中锁定及失败保留入口保持。没有删除真实用户数据。

本批 `.local/2026-10-17-source-delete-popover/lint.log`通过；`typecheck.log`全库失败仅报 `tests/detail-tabs.test.ts:26` 对含schedule分支的DetailTarget直接读取id，未改该并行测试文件。数据源详情未报类型错误，不将全库结果记为通过。正常开发日志已记录source-detail HMR；未新增测试、运行E2E或重启后台。

## 编辑表单贴边滚动（2026-10-17）

按19组08 §22，ConnectionDialogLayout新增默认关闭的scrollBody模式，由数据源编辑启用。顶部标题/关闭/插画固定，原ConnectionForm整张卡片及操作行放入共用ScrollArea；容器通过共享padding变量延伸到弹窗边缘，留白在ScrollArea内容内部。沿原自然高度及视口上限，其他调用默认布局保持。

本批 `.local/2026-10-17-source-editor-scroll/typecheck.log` 和 `lint.log`（两个修改的renderer文件）通过，diff空白检查通过。正常开发日志记录布局和编辑器HMR；没有新增测试、运行E2E、启动额外桌面实例或重启后台，未声称人工视觉验收。此前批次类型失败按原运行时刻保留，本批没有修改那些文件。

## 列表状态与行内操作（2026-10-17）

按19组08 §23，数据源名称后显示实际未测试/测试中/成功/失败/停用状态，右侧常驻测试和更多图标；菜单直接启停和Popover确认删除。操作控件与打开详情的行按钮分离，每行独立锁定，停用不可测试。回执原位更新，删除同步移除侧栏/目录并按ID关闭当前资源库对应详情。启停使用原版本化配置接口且不写入凭据。

`.local/2026-10-17-source-row-actions/modules.log`：生产SourcesView五项React组件测试通过，覆盖持久状态与停用优先、逐行测试/重复点击/真实失败、启停版本及只提交配置、删除取消零请求/确认删除目标行、版本冲突失败保持确认入口，并核对操作未触发详情导航。使用可控IPC，没有访问真实外部源或删除用户数据。

`typecheck.log`、`lint.log`（三个修改的renderer文件）及diff空白检查通过。正常开发日志记录源码HMR，sources-view混合函数导出触发上级模块刷新后正常传播到详情/工作区。未运行E2E、重启后台或新增桌面实例；不声称人工视觉验收。

## 编辑卡片紧凑尺寸（2026-10-17）

按19组08 §24，数据源编辑卡片增加局部data-source-editor样式，输入/下拉32px、标签12px/图标14px、行留白10px、标签列128px，sm操作按钮；多行输入缩小字距/内边距。共享模型连接其他调用、表单字段、外层ScrollArea和最右侧滚动条保持。

本批 `.local/2026-10-17-source-editor-compact/typecheck-final.log` 与 `lint-final.log` 通过，diff空白检查通过。下拉尺寸使用显式32px工具类，覆盖原lg高度；多行输入显式字号避免Tailwind层级覆盖局部样式。正常开发前端HMR更新，没有新增测试、运行E2E或重启后台。

## source-authority：核心资源权限与结果卡片（2026-10-17）

按19组08 §25实施。bobo固定核心身份可读写所有启用的数据源，初始空目录也可同轮创建并调用；普通员工依然按绑定、阶段、当前配置/来源和获准Work执行。资源API/local权限字段从schema/向导/表单/详情移除，已有记录保留身份/revision/凭据/回执，只迁移退休键。

目录回执按用户消息/类型/目标合并，新创建和测试更新同一条记录；旧记录在查询时合并。前端不再放在会话底部，以独立员工消息行跟随该轮回复，保留不同轮次、不同资源及不可用状态。

实际验证：`sources`、`service-sources`、`catalog-management`、`catalog-results`、`mastra-engine`五个测试文件178项通过；临时目录真实文件读写、SQLite旧字段迁移/凭据保留、本地HTTP/MCP协议、实际SDK普通chat工具接续及组件导航都在隔离夹具中完成。`pnpm typecheck`和6个修改前端文件的eslint通过。初次类型检查暴露ES2022不支持findLast，改为兼容实现后通过；原失败不代表后续检查未执行。没有运行E2E、真实模型或真实外部数据源测试。

运行状态：重启前只读核对当前数据库运行中任务为0，旧资源权限键计数为1；通过应用正常退出，原Electron/worker/dev进程均退出。重新启动`pnpm dev`保持127.0.0.1:5187，新worker构建于07:24:52，实际目录旧权限键计数变为0，运行中任务仍为0。证明当前用户进程完成了新迁移，不把前端HMR当作后台更新；未修改用户文件夹正文或触发资源业务工具。开发进程继续运行。

本地检查日志位于`.local/2026-10-17-source-authority/`；没有用户凭据/文件正文。桌面视觉效果和真实模型行为未作本轮认证，按用户要求未跑E2E。

最终增量：结果消息锚点改为索引查找后，`catalog-results`三项再次通过，定向lint通过。随后全库类型复查遇到并行通讯录改动：`tests/contact-execution-ui.test.ts:15`仍导入已移出的`EmployeeExecutionDisclosure`，TS2305；本轮未改他人重构。此前类型通过和本次失败分开保留，日志为`typecheck-final.log`。

并行通讯录测试随后移除了旧导入，但末次复查`typecheck-settled.log`仍在该文件45/55行报告TS2769（组件props）与TS2304（render未定义），尚未收口。资源权限与消息卡片的178项相关检查、3项最终组件检查及lint保持通过；不将全库类型结果描述为最终通过。

提交前复查（07:41）：并行通讯录改动完成后，`pnpm typecheck`通过；`contact-execution-ui`、`automation-history-refresh`、`catalog-results`三个测试文件18项通过。之前的全库类型阻塞已解除，旧失败日志保留，新日志为`commit-typecheck.log`及`commit-tests.log`。未运行E2E。
