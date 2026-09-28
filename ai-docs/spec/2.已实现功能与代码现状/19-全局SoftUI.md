<!--
[INPUT]: 本地 6owen-ui Soft Button / Chat Composer、shadcn 基础组件与现有桌面页面。
[OUTPUT]: 全局 Soft 风格的变量、组件职责、页面迁移、紧凑会话密度、composer 菜单、紧凑创建弹窗、员工 SVG/上传头像、手动侧栏、顶栏多窗口标签/悬停、共享 Tabs、小型成员移除角标和固定页脚、永久记录清理、独立折叠会话分组/群拼图头像、通讯录与原生窗口铺满验证记录。
[POS]: 当前全局控件风格的维护入口。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->
# 全局 Soft UI

参考本地 `6owen-ui/components/ui/soft-button.css`、`soft-button.tsx` 和 `chat-composer.css`，并在浏览器实际查看以下页面：

- http://127.0.0.1:4173/detail.html?t=soft-button
- http://127.0.0.1:4173/detail.html?t=chat-composer

提取连续圆角、按钮顶部高光、细边缘、轻微渐变和分层浮动阴影。保留 BoAI 的桌面框架、字体偏好和已有配色；不复制参考项目的 assistant-ui 运行时，也不新增网络字体、图标依赖或配色函数。

## 维护入口

| 文件 | 负责内容 |
| --- | --- |
| `src/renderer/styles/colors.css` | `--radius-control/card/composer`、`--soft-*` 高光/边缘/阴影颜色、`--shadow-*`，以及浅色/深色切换 |
| `src/renderer/styles/tailwind.css` | Tailwind 字号、圆角、阴影工具类映射到共用变量 |
| `src/renderer/styles/global.css` | 统一加载顺序：布局、页面、UI 皮肤，最后由工具类处理组件布局 |
| `src/renderer/components/ui/skin.css` | Soft 按钮、输入框、卡片、浮层、选择控件的共用外观 |
| `src/renderer/components/ui/button.tsx` | default / secondary / outline / ghost / destructive / link / ink / surface 变体、尺寸和 `round` |
| `src/renderer/components/ui/chat-composer.tsx` | InputGroup 上的聊天输入表面、输入框、分侧操作栏与菜单控件样式 |
| `src/shared/appearance/index.ts` | 主操作颜色跟随主题强调色；按钮前景按对比度选择 |

默认按钮、输入框与原生选择器高 32px、字号 13px；小按钮高 28px。按钮连续圆角 16px，卡片 20px，聊天输入框 32px。聊天输入文字 13px，默认两行、最小输入高度 44px，内边距 12px、上下间距 8px；会话操作按钮 28px，整个 composer 高 104px。保留根字号 13px 与原生缩放偏好，消息正文为 14px。

支持 `corner-shape: squircle` 的 Chromium 使用连续圆角；不支持时按钮与聊天输入框使用较小的常规圆角回退。纯图标圆形按钮显式使用 `round`，不受连续圆角影响。

## 接入范围

- 业务页面的动作、图标、导航、列表和卡片按钮全部直接使用 Button；`size="content"` 保留内容布局、字号和字重，`variant="surface"` 提供卡片表面。
- Input / Textarea / InputGroup / Select / NativeSelect / Combobox 使用柔和输入表面。
- Card / Dialog / AlertDialog / Popover / HoverCard / DropdownMenu / ContextMenu / Menubar / Sheet / Drawer / Toast 使用统一表面与浮层阴影；Portal 从根节点继承主题。
- Checkbox / Radio / Switch / Slider 复用强调色与高光；其他基础组件继续使用同一份字号、圆角、配色及阴影映射，导航和列表保持轻量层级。
- 设置、员工、任务与资料库的输入、下拉框和复选框直接使用基础组件；common/Field 组合 FieldLabel/FieldDescription，保留控件 ID、标签与提示关联。原生颜色选择和图片不透明度滑杆保留浏览器交互。
- 外观设置、连接、工作区、记忆、运行记录和命令审批复用 Card；员工浏览归通讯录，新建、设置、帮助和任务筛选使用 DropdownMenu；会话右键使用 ContextMenu。
- 未保存切换使用 AlertDialog；必填未通过时返回表单，保存成功后继续原导航；继续编辑、放弃和 Escape 保留原有意图。
- 会话输入框、工作目录、提及、停止和发送操作已使用共用 UI 组件。引用、草稿、中文输入法、Enter / Shift+Enter、取消和外部任务行为保持原有业务处理。

已移除旧 `.button`、手写菜单与浮层、旧搜索框的视觉兼容规则。页面 CSS 保留业务布局；控件表面由 `components/ui` 统一负责。表单提交按钮显式声明 submit，复选框通过 onCheckedChange 更新业务状态；Textarea 显式 rows 保留文件编辑区高度。

## 会话密度

按 100% 原生缩放收紧会话页：列表行 64→52px、列表标题 18→16px、聊天页标题 16→14px、空状态标题 26→20px、composer 152→104px。列表名称/预览为 12/11px，头像 30px，聊天辅助提示 11px。保持既有分栏宽度、拖拽和缩放偏好。

业务图标统一使用离线 Carbon；默认 16px，不再内联固定尺寸覆盖基础组件。Button 使用 12/14/16px 图标，content 变体不强制字号与字重，避免聊天提示被全局按钮样式放大。

## Composer 工具栏

输入框底部左侧为 Carbon 加号与权限胶囊，右侧为模型名称、下拉箭头和圆形发送按钮；沿用 13px 输入文字和 104px 默认高度。窄窗口下操作栏可以换行，长模型名称截断，菜单文字可以折行。所有表面和菜单控件样式由 `components/ui` 提供。输入框下方不再显示发送快捷键提示或「本轮记录」，同时移除对应提示栏间距；记录继续从顶部「任务与产物」进入。

- 加号收纳「打开会话工作目录」，群聊另外提供「提及成员」。保留现有引用、草稿、输入法和停止/发送处理。
- 权限菜单连接真实 `allowCommands` 配置：请求批准表示每次命令都由用户确认；禁止命令保留已有文件与知识访问。当前运行时没有自动批准或完全访问模式，界面不展示没有实现的权限策略。
- 模型菜单列出已配置连接的默认模型，以及员工已使用的模型覆盖值；缺少连接时显示配置入口。「更多员工设置」可修改模型 ID，「管理模型连接」进入连接设置。
- 选择后关闭菜单并保存到员工设置，影响该员工之后的任务；群聊按员工分别选择。保存沿用配置版本校验、错误提示与快照刷新，不发送对话内容。
- 正在执行任务（包括其他会话）、员工已停用、正在保存或存在未保存编辑时，配置选项锁定。外部 Agent 显示由外部程序管理模型，权限继续逐请求批准。
- `composer-toolbar.tsx` 负责会话菜单内容，AppShell 负责调用已有保存接口；`ChatComposerActions` / `ChatComposerSelect` / `ChatComposerOption` 负责共用样式。

新增 Electron 验收覆盖权限/模型保存与重载、草稿保留、选择后收起、群聊成员隔离、其他会话运行期间锁定和 760px 原生窗口中的菜单边界；验证通过。真实桌面预览见 `composer-permission.png` 与 `composer-model.png`。

## 创建与侧栏交互

- 新建员工使用居中 Dialog，显示可更换头像、名称、角色、Prompt，保留模板预填；移除介绍同事的额外说明。创建时保存规则并打开该员工的单聊。模型、后端、技能和权限在创建后的右侧员工设置中调整。
- 新建群聊使用双栏选人 Dialog：左侧搜索并勾选员工，右侧显示已选成员和移除按钮。支持 1–12 位已启用的模型员工，沿用运行时的成员数量约束；外部 ACP 员工不参与群聊。
- 点击完成后按成员名称生成群名，保存真实会话并清空列表搜索、进入新会话。群名、成员及共享知识仍通过右侧群聊详情修改。创建表单保留必填校验、重复提交保护与未保存取消确认。
- 左侧会话栏只由 header 开关控制，选中会话、打开详情、创建以及调整窗口都不自动改变显示状态；保留用户拖拽宽度。小于 1100px 时详情面板浮在右侧；小于 900px 且左栏展开时覆盖完整聊天区，避免截断的聊天内容露出，不再通过隐藏左栏让位。
- header 中左右侧栏开关用相反方向的 Carbon 开合图标表示状态，没有持续的选中底色。
- `global.css` 全局禁用 outline 和 Tailwind ring shadow（包括 Portal 中的控件），保留 Soft 表面阴影；输入框聚焦不出现蓝色边框，校验错误仍可显示原有错误边框。键盘焦点、Tab 导航和弹窗焦点归还继续有效。
- `creation-dialogs.tsx` 负责创建，AppShell 管理新会话路由；Dialog 标题统一为 16px / 24px 行高，plain footer 与选人列表样式统一在 `components/ui` 定义。群选人行与会话行共用 52px 最小高度、8px padding/gap、30px 头像、12/11px 名称/预览与 hover 背景。
- 未保存提醒的操作明确为「继续编辑」「放弃并退出」「保存并退出」；仍沿用真实保存校验和导航守卫。

## 右侧详情的顶栏多窗口标签

- 右侧员工、群聊、资源、任务与产物、任务详情都可同时打开为独立窗口标签。标签保序、按目标身份去重，点击已有目标直接激活；每个标签有关闭按钮，关闭选中项后选择相邻项，关闭后台干净标签不改变当前项。标签目前只保留在当前应用会话，不跨应用重启恢复。
- 窗口标签悬停及键盘聚焦使用 `--selection` 和 `--foreground`，与顶栏底色形成清晰区分；选中标签仍保留边框，鼠标离开后恢复原表面。
- 顶栏复用全局 `Tabs` 的 `window` 变体；32px 高、按内容宽度排列、最长 180px，显示 Carbon 图标、对象名称、未保存圆点和关闭按钮。标签多时横向滚动，选中项随激活/窗口调整自动完整露出；方向键和 Enter 可切换；原生拖拽或 Alt + 左右方向键可调整顺序，有插入指示且保持选中、草稿和滚动位置。顶栏空白保持窗口拖拽，交互标签使用 `no-drag`。
- `tabs-state.ts` 负责去重、选择、排序、关闭和显隐；`DetailTabSession` 常驻已打开内容，各自保存表单、分类和滚动位置。内容 DOM 使用稳定顺序，标签移动不会重挂载内容或重置滚动。切换主页面/会话或收起右侧面板均保留标签；Escape 只关闭当前标签，全部关闭后焦点回到入口。
- `useEditorGuard` 是主页面和各标签共用的未保存保护；只有关闭/离开该编辑器时确认，切换窗口标签不要求丢弃草稿。确认保存只查找所属区域表单，员工/群编辑器使用独立 form ID，避免多实例误提交；主进程汇总所有标签与主页面脏状态，窗口退出保护不会漏掉后台草稿。
- 员工标签记录打开时的会话范围，不随主会话切换漂移；同一员工在不同范围可分别打开。任务与产物绑定固定会话 ID，活跃时独立读取并订阅刷新，停止/重试指向所属会话；多个同类标签以会话名称区分。
- 标题栏和面板共用宽度变量，顶栏额外计入 1px 拖拽线，使上下分割线准确对齐；header 分割线使用 16px 居中短线。760–1280px 原生窗口及 90%/125%/150% 缩放保持对齐，标题不会跟随内容滚走。
- `tests/detail-tabs.test.ts` 覆盖状态不变量；`tests/e2e/features/detail-tabs.feature` 覆盖同时打开/去重、双草稿、独立保存关闭、收起恢复、跨会话和深色窄窗口；`detail-panel.feature` 继续约束分割线坐标、滚动、关闭保护及焦点。最新预览为 `detail-tabs-light.png`、`detail-tabs-dark.png`。

## 会话列表管理与群头像

- 会话及通讯录标题右侧均只有一个加号，共用「新建员工」「新建群聊」菜单。原员工选择弹窗由通讯录替代。
- 会话行支持原生拖拽，使用主题强调色的插入线和圆点指示位置；也可按 Alt + 上下方向键移动。搜索结果的排序按目标会话调整，不丢失未匹配项。置顶和普通会话各自排序，置顶始终在前；置顶使用可折叠分组标题，不显示行内钉子图标。
- “置顶”和“会话”标题均可独立折叠，展开状态不添加背景色，箭头只在悬停/键盘聚焦时显示。搜索时自动展开匹配项，清空搜索恢复原折叠状态；没有置顶时隐藏分组标题并展开普通会话。
- 右键菜单使用 Soft ContextMenu，提供置顶/取消置顶、清空聊天记录和删除会话。后两者须确认，会永久清理消息、运行/工作/轮次/授权/请求记录、会话记忆及专属文件；删除会话还会隐藏列表入口。员工、群配置、共享知识、员工基础资料保留；从通讯录发消息打开同一空会话。删除当前会话时切换到其他可见项，并清理导航历史和聊天缓存。
- `Conversation.list` 为兼容旧记录的可选展示偏好，宿主通过 `updateConversationList` 校验并在已有串行服务内批量写入 SQLite；不改变群配置版本或更新时间。未手动排序的旧列表沿用近期消息排序；调整后保留手动顺序，新的会话位于普通列表前方。重启保留排序、置顶和隐藏状态。
- `GroupAvatar` 共用真实员工头像及加载失败回退，按群成员顺序取前九人。布局依次为 1、2、1+2、2+2、1+2+2、3+3、1+3+3、2+3+3、3+3+3；同步用于会话行、通讯录群列表及群资料头部。
- 模块测试约束排序稳定性和隐藏语义；`conversation-list.feature` 验证鼠标拖动、右键菜单、重启后的删除结果、两个添加入口和各人数拼图。

## 群成员与编辑页脚

- 群编辑器共用 `GroupMembers`，使用 40px 真实头像、60px 单元格和 8px 横向间距；成员末尾为加号，打开搜索选人弹窗。已加入、停用与外部执行员工不出现在可添加列表中，最多 12 人。
- 头像悬停或键盘聚焦时显示右上角红色移除按钮，确认后修改草稿；至少保留 1 人。添加与移除均随“保存设置”持久化，取消/关闭仍使用原有未保存保护。原来重复的成员勾选列表已移除。
- 移除角标使用共享 Button 的 `icon-2xs`，按钮 16px、图标 10px，避免工具类覆盖自定义尺寸。群编辑器直接展示成员与设置字段，不再重复“群聊设置”和介绍段落。
- 右侧编辑框架的正文独立滚动，页脚固定为 58 CSS px，始终贴在面板底部；员工资料/分类导航留在顶部。通讯录编辑页脚使用普通文档流，不设置 sticky/fixed。

## 清理记录的存储边界

- `clearConversationHistory` 仅为桌面 IPC，不向模型提供。执行中、等待审批或已取消但适配器尚未退出时拒绝清理；待续工作计时器一并回收。
- `runtime/modules/conversations/history.ts` 先校验受管路径，再写清理日志，移除群工作区、所有员工该会话的 session、外部运行目录和会话投影备份，最后用 SQLite 事务删除关联记录并清除日志。重启时先继续未完成的清理，再加载运行服务，避免重放旧任务。
- 文件路径按数据根和已校验 ID 构造，不追随产物记录中的任意路径或符号链接；共享资源、源文件和其他会话目录保留。清理后回收 SQLite/WAL 空间。
- 自动化保留原生触发身份以避免重复执行，但清除被删除的消息/任务引用。会话记忆 epoch 前移，旧编辑或迟到结果不能重新写回已删除内容；显式保存的员工基础资料与其他会话不受影响。
- Renderer 清除消息/预览/时间/草稿缓存并刷新当前聊天、任务与产物及该范围记忆视图。没有在用户实际数据上执行清空操作，验收数据全部隔离。

## 通讯录

- 左侧导航新增 Carbon「通讯录」图标，列表按「群聊」「联系人」分组，支持搜索名称/职责、折叠、计数与当前项高亮。列表宽度沿用手动拖拽值，窗口变窄不会自动隐藏或收缩，顶部开关控制显示。
- 通讯录选中项与当前会话独立。右侧主区域展示员工名称、职责、状态、模型、命令权限、技能、知识和 Prompt，或群名、成员与共享知识；浏览及搜索不创建会话、不挂载聊天组件。
- 「编辑配置」在同一主区域复用 EmployeeDetail / GroupEditor；配置、系统文件、工作区和记忆沿用原有 API 与版本校验。切换对象、离开页面、返回资料和发消息均接入未保存提醒；保存后回到资料，群名同步到列表。
- 「发消息」切换到「会话」并选中目标，清空会话搜索；员工优先复用已有单聊，无单聊时才创建，群聊直接复用原群。保留草稿，不自动发送内容。
- 页面位于 `src/renderer/pages/contacts/`，Shell 只持有选中项和导航；通讯录使用 Button / InputGroup / Collapsible / Badge / Separator / Empty，共用 Soft 皮肤和语义颜色。
- `tests/e2e/contacts.spec.ts` 覆盖浏览无副作用、搜索/折叠、员工与群配置持久化、继续编辑/保存并退出/放弃并退出、群成员资料跳转、单聊去重与草稿保留、群聊跳转及 760/1247px 原生宽度。

## 员工头像

- 内置 12 个原创 SVG 小伙伴（猫头鹰、狐狸、猫、兔子、熊、熊猫、狗、考拉、青蛙、企鹅、仓鼠、机器人），资源位于 `src/renderer/assets/avatars/`，随应用离线打包。旧员工按稳定 ID 分配默认头像，不改写原数据；研究员/写手/审核员分别使用猫头鹰/狐狸/猫。
- 新建员工弹窗和员工配置共用 `AvatarPicker`。点击头像可选内置图片或上传本地 PNG/JPG/WebP（最大 5 MB），自动居中裁剪为 256×256 PNG。解码失败保留原头像、提示错误并恢复上传按钮焦点；Esc 只关闭当前头像浮层。
- `DigitalAgent.avatar` 为可选的预设 ID 或 PNG data URL，随员工配置写入产品数据库，重启后仍显示；运行时校验预设、PNG 来源和长度。未带头像字段的既有保存调用保留原头像，composer 的模型/权限保存也显式保留头像。
- 会话列表、聊天空态与消息、通讯录、群成员、新建/编辑员工和资料绑定统一使用 `common/Avatar`；自定义图片加载失败时回退到稳定 SVG。选择头像只修改表单，保存/取消沿用未保存守卫。
- `tests/avatars.test.ts` 覆盖数据边界、兼容与持久化；`tests/e2e/avatars.spec.ts` 覆盖真实文件选择、上传失败、12 款预设、跨页面显示、配置保存和重启。预览见 `avatar-picker.png`、`create-agent.png`、`create-group.png`、`creation-unsaved.png`。

## 原生窗口验收

Electron 调整窗口时必须用 `BrowserWindow.setContentSize` 验证；CDP 的 `set viewport` 是固定设备模拟，会让页面停留在截图尺寸，原生窗口放大后出现右侧/底部留白。完成截图后必须解除设备模拟，不能仅将模拟尺寸改回较大值。这个调试状态不需要用页面 CSS 补偿。

外观回归同时比较原生窗口内容尺寸、缩放因子、CSS 视口、Shell 与内容框边界；覆盖 760×640、1124×688、1247×839、1340×900 和 75% / 90% / 100% / 150% 界面缩放，并检查重启后仍铺满。

本次外观回归与类型检查通过。解除固定视口后的截图为 `ai-docs/images/soft-ui/window-resize.png`；内容框右侧和底部保留正常的 4px 边距。

## 统一标签页

- `components/ui/tabs.tsx` 提供唯一的 Tabs / TabsList / TabsTrigger / TabsContent；默认标签条高 32px、文字 13px、按内容宽度排列。`skin.css` 复用 `--muted`、`--card`、`--radius-control` 和 `--shadow-control`，统一 Soft 底槽和选中表面；保留线形与垂直变体，不添加 ring/outline。
- 会话右侧员工详情和通讯录员工配置共用 EmployeeDetail 的四个标签；资料库的“公共资源 / 员工已绑定”也使用同款组件。移除原 `.detail-tabs` / `.tab-row` 普通按钮样式，页面仅处理外围留白。设置页侧边导航仍保留页面导航语义。
- 标签支持方向键聚焦、Enter/Space 激活，仅挂载当前面板。编辑中切换保留继续编辑/放弃/保存保护；局部切换放弃时卸载旧表单而不重建整个详情，避免目标标签或通讯录编辑页面丢失。
- `tests/e2e/features/employee-tabs.feature` 验证员工配置与文件草稿保护、保存后切换、键盘行为、资料库筛选保留、跨页面皮肤一致以及 760px 深色窗口；预览见 `employee-tabs-light.png` 和 `employee-tabs-dark.png`。

## 验证

- 标签悬停、两组折叠与小型移除角标打磨通过构建、类型检查、UI lint 和 4 项相关 Electron BDD 回归。验证分组无展开底色、悬停显示箭头、搜索临时展开后恢复折叠、浅深色标签悬停恢复，以及 16px 按钮/10px 图标的实际渲染尺寸和移除确认。预览见 `group-member-remove.png`、`detail-tabs-light.png`、`detail-tabs-dark.png`。

- 置顶分组、标签排序、群成员网格、两类页脚与会话永久清理通过类型检查、UI lint、构建、209 项 Vitest 测试和 9 项 Electron BDD 回归。验证标签移动后草稿及滚动位置保留、取消与确认移除、58px 页脚在原生窗口缩放时贴底、通讯录按钮自然滚动、清空后重新发送、删除后从通讯录恢复空会话及清理期间取消适配器的退出边界。预览见 `group-settings-light.png`、`group-settings-dark.png` 和 `detail-tabs-light.png`。以下条目保留此前迭代的验证记录。

- 顶栏详情标签通过构建、类型检查、UI lint，以及 detail-panel / contacts / creation / desktop / appearance 共 5 项桌面流程。上下分割线坐标在窗口断点与 90%/125%/150% 原生缩放下误差不超过 0.1 CSS px，短标签保留右侧空白，窄栏无横向溢出。

- 员工头像与紧凑弹窗通过构建、类型检查、UI lint、头像/员工服务/工作区共 58 项测试，以及 avatars / contacts / creation / pages / composer / desktop / ui 共 7 项 Electron 流程。真实文件选择验证坏图保留与焦点恢复、PNG 保存和重启保留；另在 760px 原生深色窗口确认头像浮层边界和无水平溢出，见 `avatar-picker-dark-narrow.png`。

- 通讯录通过构建、类型检查、UI lint，以及 contacts / creation / desktop / pages 共 4 项 Electron 回归；真实临时工作区预览见 `contacts-profile.png`、`contacts-group.png`、`contacts-edit-narrow.png`。

- 创建/侧栏调整通过构建、类型检查、UI lint 及 6 项 Electron 回归（creation / pages / desktop / composer / appearance / ui）。验证名称/角色/Prompt 真实保存、选人/移除/取消、自动群名与右侧编辑、760–1247px 窗口中的手动侧栏状态，以及取消/保存保护和无描边焦点。
- 创建交互截图为 `create-agent.png`、`create-group.png`、`group-detail-narrow.png`。

- 本轮 composer 改动通过构建、类型检查、UI lint，以及 composer / desktop / pages / ui / appearance 共 5 项 Electron 回归。

- 本轮密度调整通过构建、类型检查、UI lint 与 4 项 Electron 回归（desktop / pages / ui / appearance）；Carbon 映射 42 项均来自已安装的本地图标集。
- CDP 在 1124×688、100% 缩放与原有 312px 分栏下确认 composer 高 104px、输入区 44px、辅助文字 11px、操作图标 14px；浅/深色及 760px 窄窗口无横向溢出，多行草稿在输入区滚动且发送按钮可见。
- 以下为此前全局 Soft UI 迁移的验证记录，尺寸条目已同步到当前样式。
- `pnpm build`、`pnpm typecheck`、`pnpm lint:ui` 通过。
- 外观单元测试 7 项通过，覆盖持久化与所有内置主题的正文/按钮前景对比度。
- Electron 回归 8 项通过，包含外观、桌面会话、基础组件、外部任务/自动化、环境、历史、升级，以及页面迁移交互。
- CDP 检查常规按钮与输入框采用 13px / 32px / 16px 连续圆角；聊天输入框为 32px 连续圆角，输入文字 13px。
- 页面迁移回归另验证：缺少必填信息时保持编辑、复选框切换一次只更新一次、取消后保留值、保存并继续完成导航、Enter 提交连接表单、菜单 Escape 归还焦点、任务筛选自动收起。
- 真实 Electron 浅色、深色、浮层与窄窗口预览保存在 `ai-docs/images/soft-ui/`。预览使用独立临时数据，未修改用户的会话或外观偏好。
- 构建仍提示主包大于 500 kB，为已有体积提醒；未增加运行时依赖。

- 会话列表管理通过构建、类型检查、UI lint、200 项 Vitest 回归；最终规则调整后重跑 3 项排序模块测试。6 个相关 Electron BDD 场景通过，覆盖通讯录、拖拽/置顶/隐藏与恢复、头像及双添加入口、创建流程、详情面板和页面焦点。最终截图见 `conversation-list-drag.png`、`conversation-list-menu.png`、`conversation-list-dark.png`、`group-avatar-mosaics.png`。

- 共享 Tabs 通过构建、类型检查、UI lint 和 5 个相关 Electron BDD 场景（employee-tabs / contacts / detail-panel / desktop / environment）；资料库接入后重跑 employee-tabs 场景通过。

- 多窗口标签通过构建、类型检查、UI lint、3 项标签状态模块测试与 6 个相关 Electron BDD 场景（detail-tabs / detail-panel / employee-tabs / desktop / contacts / creation）。
