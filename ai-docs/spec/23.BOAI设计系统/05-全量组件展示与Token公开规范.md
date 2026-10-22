<!--
[INPUT]: 用户2026-10-22提出的全量组件、正文样式复用、DESIGN.md与Token公开要求；c38c629d源码、Raft固定参考及Fumadocs官方文档。
[OUTPUT]: 下一阶段完整展示范围、76个UI入口的覆盖归属、内容适配与样式隔离、Token发布合同和分批验收；用户后续已授权代码实施，当前进度与验证归03 §6。
[POS]: 第23组首版之后的增量实施合同；取代04中将其余组件无限期按需处理的范围，实际进度仍唯一归03 §6。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->
# 全量组件展示与Token公开规范

## 1. 本轮决定

BOAI Design应完整展示BOAI已经拥有的设计语言与可复用组件。共享实现继续放在`packages/tokens`、`packages/ui`，Fumadocs文档站继续放在`apps/design-docs`；不增加第二套组件实现或第二个展示框架。

初次规划按用户“继续定义要实现的内容”只完成分析、覆盖清单和设计指南。用户随后明确“执行修改代码”，已按本合同实施本地候选；验收状态唯一见03 §6。新增范围属于首版之后的DS2/DS3扩展，以下各批是实施顺序，不是删减范围；后续开发不能做到优先批就宣称全量完成。独立仓库、npm正式发布及官网部署仍沿02的单独交付边界。

| 用户要求 | 确定的交付 |
| --- | --- |
| 已有基础与自定义组件都能看见 | 全量目录、可运行状态示例、真实源码、使用与API说明；内部辅助模块明确归入所属组件 |
| 内容区使用BOAI Card、border等样式 | 同一共享组件和皮肤服务桌面与文档内容；Fumadocs继续承担导航、搜索、目录和文档语义 |
| 参考Vercel式设计指南 | [BOAI DESIGN.md](../../design-system/DESIGN.md)，以BOAI当前源码和产品规则为事实源 |
| 公开关键Token和颜色 | `/foundations/tokens`总表、颜色/排版/形状等分组、明暗值与预览、引用关系及同源下载 |

## 2. 当前事实与缺口

盘点基线：`main`提交`c38c629dd4ed2b2ed2ffa0e675e56d20dd9ea05c`，日期2026-10-22。这里是源码核对，未进行本轮浏览器视觉验证。

| 范围 | 当前事实 | 本期需要补齐 |
| --- | --- | --- |
| 组件源码 | `src/renderer/components/ui`有76个TSX入口，包含组件族、组合和内部辅助 | 逐项覆盖；不能将文件数当成独立组件数，也不能只展示新提取的少数组件 |
| 公共包 | 04登记10组公共导出，其中Field仍有宿主错误反馈适配 | 其余组件完成依赖/样式提取，原入口转发；宿主适配保持在桌面 |
| 网站目录 | `catalog.json`共12页，其中6个`components/*`页面、10条组件登记；部分组件合页 | 保留原URL，扩展独立可发现的组件入口、组合模式与覆盖状态 |
| 颜色 | `page.tsx`手写8个swatch名称，`color.md`只有简要用途表 | 从Token真源枚举全部公开变量，提供默认明暗值、语义和引用关系 |
| Token分发 | 构建从TS生成`foundation.css`与`{version,light,dark}`格式的`tokens.json` | 增加可浏览/检索/复制的文档表及站点下载；不手写第二份数值，不将现有JSON误称DTCG |
| 截图里的Card | `Overview → SettingsExample → @boai/ui/Card`；Card使用共享`soft-card`，不是Fumadocs Card | 查明实际级联/组合差异并修复；“换成@boai/ui导入”不足以解决，因为已经这样引用 |
| 首页外框 | `.overview-preview`、侧栏和工具栏由站点手写，存在单独的`1px solid var(--border)`及阴影组合 | 简化为真实BOAI模式示例，边界复用公共Card/Separator/表面语义；站点只负责排版 |
| 圆角映射 | 站点恢复Tailwind默认`--radius-sm`至`--radius-4xl`；共享Card及Header/Footer仍有`rounded-xl`等类；Soft皮肤位于components层 | 消除共享组件对通用圆角刻度的隐式依赖，核对最终CSS层顺序和computed style；不能仅因`--radius-card`未改就断言外观一致 |
| 特有组合 | Composer、Selection Actions、消息/附件、PanelResize、DragList等已有源码 | 展示可独立运行的呈现和交互，数据通过props/回调传入；不引入聊天服务、IPC或产品store |

关键依据：[Card](../../../packages/ui/src/components/card.tsx)、[共享皮肤](../../../packages/ui/src/skin.css)、[公共样式入口](../../../packages/ui/src/styles.css)、[站点样式](../../../apps/design-docs/src/styles.css)、[页面组合](../../../apps/design-docs/src/page.tsx)、[设置示例](../../../apps/design-docs/src/examples/settings.tsx)、[公开清单](../../design-system/catalog.json)、[Token构建](../../../scripts/design-packages.mjs)。

## 3. 全量组件覆盖

### 3.1 清单与完成口径

“全量”指本期基线中实际存在、可复用或需要说明的BOAI UI，不承诺补齐shadcn生态中BOAI没有使用的所有组件。原04的“未进入首发；后续按实际需求审核”是首版历史边界，本期按下表全部登记处理。

实施时扩充既有`catalog.json`及其校验，记录：组件ID、公开路径、源入口、公共export、原桌面消费点、样式/图标/资源依赖、示例文件、状态和限制。`planned`、`preview`、`stable`、`deprecated`分别表达计划、可运行待稳定、已满足约定验收及兼容保留；当前10条均是`preview`，不得批量改成稳定。

页面与包的状态分开记录。内部实现文件可以不设独立页面，但必须归到有示例的组件族；兼容组件必须可查到替代方案。计划占位或“Coming soon”页不计入覆盖完成。公共组件进入真实预览后才进入可用组件索引；内部任务清单不混入可安装导出。

### 3.2 76个UI入口的展示归属

本表文件名均相对`src/renderer/components/ui/`。一行允许多个页面，合页时每个组件必须有独立标题锚点和搜索名称；表内19组覆盖76个TSX入口，数量只用于防漏项。已有10组公共组件仍属于全量验收对象。

| ID / 展示族 | 源入口 | 必须可见的内容 |
| --- | --- | --- |
| UI01 操作 | `button.tsx`、`button-group.tsx`、`toggle.tsx`、`toggle-group.tsx` | 实际变体/尺寸、图标按钮、分组、单选/多选、禁用与按下状态 |
| UI02 输入 | `input.tsx`、`textarea.tsx`、`input-group.tsx`、`input-otp.tsx`、`number-field.tsx` | 单/多行、前后缀、步进器、OTP、只读/错误语义、组合内层不重复画框 |
| UI03 字段 | `field.tsx`、`label.tsx`、`select-field.tsx` | 标签/说明/输入关联、分组布局、受控选择；FieldError宿主适配与Sonner关系 |
| UI04 选择 | `select.tsx`、`native-select.tsx`、`combobox.tsx`、`checkbox.tsx`、`radio-group.tsx`、`switch.tsx`、`slider.tsx` | 空值、选择/取消、键盘、禁用；支持的搜索/多选/中间态按真实API展示 |
| UI05 日期 | `calendar.tsx` | 实际支持的选择模式、不可选日期、跨月和键盘导航 |
| UI06 对话容器 | `dialog.tsx`、`alert-dialog.tsx`、`drawer.tsx`、`sheet.tsx` | 打开/关闭、标题说明、长内容、焦点返回、真实取消/确认，保持当前紧凑操作区 |
| UI07 小浮层 | `popover.tsx`、`hover-card.tsx`、`tooltip.tsx` | 点击/悬停/键盘、anchor、方向、边缘避让、嵌套和关闭后焦点 |
| UI08 菜单 | `dropdown-menu.tsx`、`context-menu.tsx`、`menubar.tsx`、`command.tsx`、`navigation-menu.tsx` | 子菜单、勾选项、禁用项、搜索、空结果、方向键/Escape |
| UI09 导航 | `tabs.tsx`、`tabs-indicator.tsx`、`breadcrumb.tsx`、`pagination.tsx`、`sidebar.tsx`、`direction.tsx` | Tabs实际变体及滑动层、溢出、路径/分页、侧栏折叠；indicator归Tabs，方向Provider归布局说明 |
| UI10 展开 | `accordion.tsx`、`collapsible.tsx` | 初始/受控展开、长内容、整行触发、键盘和减少动态效果 |
| UI11 容器与分栏 | `card.tsx`、`separator.tsx`、`item.tsx`、`aspect-ratio.tsx`、`resizable.tsx`、`scroll-area.tsx`、`scroll-fade.tsx` | Card真实边缘/页脚、横纵分割、普通行、比例容器、拖拽/键盘调整、局部滚动/渐隐 |
| UI12 展示与数据 | `avatar.tsx`、`badge.tsx`、`marker.tsx`、`chart.tsx`、`table.tsx`、`carousel.tsx`、`kbd.tsx` | 头像回退、状态/快捷键、窄屏表格、固定图表夹具与图例、轮播控制 |
| UI13 加载与进度 | `skeleton.tsx`、`spinner.tsx`、`progress.tsx`、`loading-state.tsx`、`thinking-state.tsx` | 骨架到内容、确定/不确定进度及已有执行状态；停止/完成由演示控件切换，不冒充真实模型运行 |
| UI14 空态 | `empty.tsx` | 有/无操作、长标题、尺寸变化；插画组合另见3.3 |
| UI15 反馈 | `sonner.tsx`、`alert.tsx`、`toast.tsx` | Sonner成功/失败/加载/关闭/操作；Alert中性说明与destructive转Toast合同；旧Toast列兼容页，隔离展示并标明现行推荐Sonner |
| UI16 聊天组合 | `chat-composer.tsx`、`message.tsx`、`bubble.tsx`、`message-scroller.tsx`、`attachment.tsx`、`tool-chips.tsx`、`questionnaire.tsx` | Composer、消息/回应、历史滚动、附件、工具折叠、问题表单；全部使用确定的演示数据 |
| UI17 阅读 | `code-block.tsx`、`typeset.tsx` | 代码语言/长行/复制、正文排版/列表/表格；先解除CodeBlock对产品文件预览限制的直接依赖 |
| UI18 选区操作 | `selection-actions.tsx`、`selection-actions-button.tsx`、`selection-actions-shimmer.tsx` | 展开快捷动作、输入、成员插槽、等待/禁用/结果；button和shimmer归该族并保留来源说明 |
| UI19 浮层作用域 | `floating-layer-scope.tsx` | 隐藏已挂载面板时关闭浮层，恢复时不重开；通过浮层/分栏页面演示，不伪造独立业务组件 |

相关非TSX依赖也进入迁移清单：`skin.css`、`tabs-motion.css`、`execution-state.css`、`selection-actions.css`、`shiki-highlighter.ts`、`react-aria@3.53.1.patch`。按实际使用方处理，不能为了组件可编译就丢掉动效/皮肤/原补丁；也不能将全部桌面CSS打进公共包。

### 3.3 BOAI特有组件和模式

| 模式 | 现有来源 | 本期展示与提取边界 |
| --- | --- | --- |
| Composer | `ui/chat-composer.tsx`、`ui/input-group.tsx`；`pages/conversations/-components/prompt-bar.tsx`、`composer-toolbar.tsx`、`composer-model-menu.tsx` | 先展示原ChatComposer受控输入与左右工具栏，再接附件、模型/权限选择、提及/命令及发送/停止的呈现组合；抽出可复用视图，桌面PromptBar仍负责会话、权限、发送和持久化 |
| Popconfirm | `components/employee/bound-skill-list.tsx`、`directory-grants.tsx`、`agent-activity-history.tsx` | 当前是Popover＋标题/说明＋取消/危险按钮，没有独立`popconfirm.tsx`；提供“确认浮层”模式页与真实例子。提取公共组合后让桌面同步消费；不得从普通关闭推断用户已确认 |
| 面板显隐与调整 | `components/common/panel-resize.tsx`、`panel-resize.css`、`use-panel-reveal.ts`及UI Resizable | 两者分别展示；关闭后的inert/焦点隔离、保留内容、拖动及减少动态效果保持 |
| 拖拽列表 | `components/common/drag-list.tsx` | 排序、落点、归组与Alt方向键，用本地数组/回调；不导入员工/会话的真实保存逻辑 |
| 检索字段 | `components/common/catalog-search.tsx` | 图标展开、输入聚焦、空值失焦/Escape收起，与原InputGroup表面一致 |
| 头像与插画空态 | `components/common/group-avatar.tsx`、`user-avatar.tsx`、`illustrated-empty.tsx` | 纯头像数据/资源插槽、1–9宫格、加载失败回退、空态操作；移除DigitalAgent/Profile依赖。需核对原素材再分发许可，未核定时用自有夹具展示同一组件 |
| 设置与编辑 | `components/common/index.tsx`、`use-editor-guard.tsx`及现有设置页 | 表单Card、紧凑列表、保存/还原、未保存退出确认、pending/失败后草稿；实例状态只存内存，不冒称写入BOAI |
| Markdown与内容 | `components/common/markdown.tsx`、UI Typeset/CodeBlock | 展示纯阅读层；产品refs解析、附件权限、成果版本和Office/PDF业务加载继续由宿主负责 |

Composer不能仅展示一个长得相似的textarea就算完成。基础组件页说明它的组合API；模式页展示有内容、空值、禁用、附件、菜单、发送中和停止后的完整视觉状态，明确使用演示回调。输入法组合、Enter/Shift+Enter和多行输入须遵循现有产品规则。复杂编辑器相关视图可以分批抽离，但不能通过导入整个PromptBar和应用服务来取得假独立性。

### 3.4 每个组件页的最低内容

用途和适用场景 → 实际运行预览 → 同一示例TSX源码 → 已导出的import与API → 变体/状态 → 键盘和可访问性 → 依赖/限制/来源。类型说明从公共类型或受校验的元信息得到，不虚构props。

预览至少覆盖浅/深色、实际变体和尺寸、禁用/只读/加载等适用状态、中文/英文长文本、窄屏与字号上限。不存在的状态标为不适用并说明，不机械添加假loading按钮。交互通过可见控件推进，可还原；导航/展示用例必须有真实响应，不能只有截图。

## 4. Fumadocs内容与BOAI样式复用

### 4.1 明确各层职责

| 层 | 继续复用 | 调整范围 |
| --- | --- | --- |
| Fumadocs外壳 | DocsLayout/DocsPage、面包屑、侧栏、目录、搜索、响应式导航、主题入口 | 维持用户选择的默认圆角；颜色映射到BOAI语义变量，不重新制作导航壳 |
| 文档正文 | Fumadocs MDX、标题锚点、目录、代码高亮、链接与阅读语义 | 建立站点内MDX适配表；表格、分隔、内容卡片等使用BOAI呈现；保留原组件必要属性/ref/ARIA |
| 组件和模式示例 | `@boai/ui`真实导出、`@boai/tokens` | 与桌面共用皮肤；预览容器负责主题/字号和布局，不手绘内部控件 |
| 桌面宿主 | 原主题插件、偏好、业务服务及数据协议 | 保持所有权；只替换为共享视图调用，不将宿主依赖带入站点 |

当前`DesignPage`直接传`defaultMdxComponents`。后续在站点单独建立适配模块，按已锁定Fumadocs版本合并默认映射；不用全局CSS覆盖所有`div`、`button`或`[data-slot]`。官方支持主题变量和自定义正文呈现，但具体API以安装版本核对，不能照搬最新版未支持的参数。

### 4.2 内容映射

| 内容 | 目标规则 |
| --- | --- |
| 首页设置演示与原则卡片 | 真实Card/Header/Content/Footer；删除重复的示例外观CSS；虚构工作区导航如只是装饰则移除，必要的列表/详情构图改为可操作的模式示例 |
| MDX内容卡片/相关链接 | 非交互内容用BOAI Card；整卡链接保留单个链接语义、键盘焦点和描述，不能嵌套多个交互目标 |
| 文本表格与Token表 | BOAI Table及共享分割线；列头语义和窄屏局部滚动保持；不把整个文档放进Card |
| `hr`和组合分组边界 | 语义分隔与BOAI Separator/soft-divider皮肤；同一边界只画一次 |
| Tabs、展开与示例工具栏 | 展示控件用BOAI Tabs/Collapsible/Button；文档布局专属控制仍归Fumadocs |
| 代码块 | 保留Fumadocs编译/高亮和锚点能力，容器/复制按钮接BOAI表面；CodeBlock组件本身另设独立示例 |
| 说明/Callout | 文档说明可以保留语义说明块，使用BOAI中性色/状态变量；操作失败走Sonner，不增加页面错误Banner |

### 4.3 圆角、边缘和级联合同

1. BOAI组件采用明确语义圆角，如Card使用`--radius-card`，输入/按钮使用`--radius-control`；Card图片、Header和Footer的内外角同步。实现时检查并替换内部通用`rounded-*`别名，或消除等价的覆盖冲突。不得用全局恢复BOAI的`--radius-lg`来再次把Fumadocs搜索/侧栏变成胶囊。
2. Card按当前`soft-card`使用透明结构边框与`--shadow-control`，表面高光来自Soft变量；浮层按`soft-surface soft-elevated`，不将所有容器都加浮层阴影。普通布局边界可以用`--border`，Card与分割线不能额外叠加一条实边框。
3. 正文prose样式不能侵入交互预览；示例使用排除prose的容器。统一梳理Preflight、theme、components、utilities及站点规则的顺序，避免仅靠追加`!important`掩盖冲突。
4. 明暗并排预览必须为Portal、Tooltip、Dialog、Popover、Select和Sonner提供归属明确的主题/字体环境；可以通过公共可选Portal容器或统一主题桥实现。浮层不被预览`overflow:hidden`裁切，也不能在深色页中让浅色预览继承错误的`dark:`分支。先验证主题岛和body Portal，再推广到全部浮层。
5. 先将截图中的Card与同SHA桌面Card放在相同主题、字号、缩放和浏览器能力下比较，再记录必要设计改动。代码引用相同不等于视觉已一致；本轮不将静态分析写成视觉验收通过。

## 5. Token与颜色公开

### 5.1 单一事实来源

| 来源 | 拥有的定义 | 网站如何使用 |
| --- | --- | --- |
| `packages/tokens/src/theme.ts` | 默认明暗色板、语义颜色及派生计算 | 读取`baseThemes`和`themeTokens`，不能复制配色公式 |
| `packages/tokens/src/surfaces.ts` | Soft边缘/阴影/圆角、已有控件尺寸与别名 | 枚举`softTokens`及dark覆盖，显示表达式及解析值 |
| `packages/tokens/src/typography.ts` | UI/Content/Code的字体、范围、默认值、层级和行高 | 使用同一解析器生成样本；原`src/shared/appearance/typography.ts`只是兼容转发 |
| `packages/tokens/src/foundation.ts` | 聚合后的默认CSS变量和CSS输出 | 页面、JSON、下载文件来自同一生成结果 |
| `packages/ui/src/theme.css`及组件样式 | Tailwind映射，以及尚未提取的组件局部常量 | 单列映射和待整理项；重复通用语义再提取，不能把现有所有间距/动效谎称已集中管理 |

需要补充类型、分组、用途、状态、关联组件和来源定位等**元信息**时可增设Token描述注册表，但不在元信息中再写一份颜色/尺寸值。CSS变量集合与描述集合要能检查遗漏、未知键和失效引用；辅助/历史别名也需有明确归属。

### 5.2 基础页面与分类

保留`/foundations/color`、`typography`、`shape`现有路径，新增`/foundations/tokens`作为总入口；补充设计原则、间距/布局、动效、图标、状态与可访问性说明。分组依据实际源码，不为了仿照Raft造一套BOAI未使用的品牌色阶。

| 分组 | 应公开的内容 |
| --- | --- |
| 语义颜色 | 背景/内容/列表/详情/卡片/浮层/Composer/消息表面、正文/次级文字、操作/hover/selection/focus、边界、代码和sidebar |
| 状态颜色 | success/warning/destructive、已有info/status背景及相应前景；解释危险操作、提示和真实状态的差别 |
| 原始色板与派生 | 默认ThemePalette的输入值、blend/contrast派生关系；标清`ThemePalette.accent`映射主操作色，CSS `--accent`实际是hover底色，避免同名误读 |
| 形状与层次 | radius-frame/control/card/composer/pill，Soft细边缘/高光/明暗覆盖、所有shadow角色和横纵分割 |
| 排版 | 三组字体、默认字号/允许范围、每个role的比例和当前计算值、行高；动态调节与默认值分开标识 |
| 尺寸与布局 | 已有control-height、toolbar-height、rail-width、content-width；间距刻度与组件局部尺寸另注明来源和稳定性 |
| 动效与状态 | 既有Tabs/Panel/Selection动作及减少动态效果；尚未统一的时长/曲线标为局部定义，提取后再登记公共Token |
| 兼容映射 | `legacy-*`、app/list/content等现存别名及Tailwind映射；说明推荐角色和引用链，不默默隐藏仍导出的变量 |

### 5.3 Token浏览器合同

每行显示：变量名、分组/用途、类型、默认浅色值、默认深色值、原表达式/别名、当前解析值、实物预览、来源与相关组件。颜色提供色块/HEX或原色彩格式，透明色交代叠加底色；阴影、圆角、尺寸、字体使用对应形状/文本预览，不能全部画成色块。

支持按名称/用途检索、分类过滤、复制变量名/`var(--name)`/某模式值。明暗对照在同页可见；修改预览偏好时明确标为“当前预览”，不得覆盖“默认值”列。搜索和复制的反馈沿原文档站和Sonner。

颜色页提供有意义的文字/背景配对及对比度结果：主要正文、次级说明、主按钮、状态背景、焦点/边界按各自用途评估。结果必须来自实际值/实际背景的计算与检查；不能因主操作前景自动选择就声称整个主题都符合无障碍要求。自定义主题是宿主配置，默认Token表不代表每个桌面主题插件的全部配色。

### 5.4 导出、版本与Agent消费

- 包继续提供`@boai/tokens/foundation.css`和`@boai/tokens/tokens.json`。站点新增对应下载入口，文件由同一版本构建复制/生成，不手抄CSS/JSON；路径作为新增合同在实施时登记到静态产物。
- 默认值、文档、预览、下载及组件索引均带可追溯版本。发布JSON现有`version: 1`是结构版本，和包版本/源码SHA分开表达，不改写为另一含义。
- Token页面内容同时进入可搜索文本、Markdown、`llms.txt`/`llms-full.txt`；纯交互表不能导致Agent看到空页面。构建期从同一数据生成文本，保留别名关系和明暗值。
- [DESIGN.md](../../design-system/DESIGN.md)本轮先落正文。后续将其登记为公开设计指南并提供稳定Markdown下载，再纳入Agent索引；本轮未改变catalog，不声称网站已出现该页。
- DTCG可以作为后续工具交换格式。本期先公开当前完整数据，不为对齐Raft改写整个Token系统；如增加DTCG导出，只能从同一真源生成，并另行验证格式。

## 6. 参考资料与采用边界

| 资料 | 本次核对与采用 |
| --- | --- |
| [用户给出的Vercel DESIGN.md](https://github.com/educlopez/design-bites/blob/754ddd2934531744e841bf1fd95194b16dc28d21/design-mds/vercel.com/DESIGN.md) | 固定`design-bites`提交`754ddd2934531744e841bf1fd95194b16dc28d21`。其[README](https://github.com/educlopez/design-bites/blob/754ddd2934531744e841bf1fd95194b16dc28d21/README.md)说明文件来自网页自动提取与AI分析，不能标成Vercel官方开源规范。参考“原则、色彩、排版、组件、布局、层次、约束、响应式、Agent指南”的组织；数值和规则从BOAI重写 |
| [Vercel官方Geist](https://vercel.com/geist/introduction) | 作为官方设计系统导航参考，帮助区分基础、组件和使用说明；不将Geist的风格和品牌规则替换BOAI Soft |
| [Raft Token页](https://raft-design.botiverse.build/foundations/tokens)与[对应Markdown源码](https://github.com/botiverse/raft-design/blob/001dcd8f16c3eff6384a1a86b01cce0bf2a2bd85/design/foundations/tokens.md) | 本轮站点抓取403，未声称浏览器已审阅；改读固定提交`001dcd8f16c3eff6384a1a86b01cce0bf2a2bd85`的源码。采用按组说明、明暗值、别名及同源生成的结构 |
| [Raft Token表实现](https://github.com/botiverse/raft-design/blob/001dcd8f16c3eff6384a1a86b01cce0bf2a2bd85/apps/doc/src/components/site/tokens-block.tsx)与[数据读取](https://github.com/botiverse/raft-design/blob/001dcd8f16c3eff6384a1a86b01cce0bf2a2bd85/apps/doc/src/lib/tokens/tokens.ts) | 核对表格直接消费其Token数据并用自身UI Table渲染。借鉴同源关系；BOAI保留TS真源和现有语义名称，不复制Raft的DTCG源结构、色板或UI实现 |
| [Fumadocs官方主题文档](https://www.fumadocs.dev/docs/ui/theme) | 核对主题变量及prose/MDX职责，具体接入沿当前锁定依赖；不因文档最新版变动而顺带升级整个站点 |

## 7. 实施批次与退出条件

| 批次 | 工作范围 | 完成依据 |
| --- | --- | --- |
| EX0 清单与展示基座 | 将3.2/3.3落实到目录元信息；查明Card级联、统一语义圆角/分割；建立MDX适配和主题/Portal策略；登记DESIGN指南 | 所有入口有归属；截图对应设置Card和桌面同源对照；Fumadocs默认圆角保持 |
| EX1 高频控件与Composer | Tabs、Dialog/AlertDialog、Popover/Popconfirm、Card/Separator、Resizable、Switch、Sonner优先；补InputGroup/Select等依赖，完成Composer基础及模式 | 每项有实际交互、源码、状态/键盘和浅深色；桌面同步用共享实现 |
| EX2 其余全量与自定义 | 完成3.2余项及3.3模式；处理图标、动效、重型依赖、素材与兼容入口 | 覆盖表无无理由漏项；内部辅助均有宿主页，兼容项可查；不存在为展示而复制的一套组件 |
| EX3 Token公开 | 同源元信息/总表/颜色/排版等页面、检索复制、下载和静态文本索引 | 所有公开变量与元信息对应，默认明暗值/别名正确；页面与导出来自同一版本 |
| EX4 集成与交付 | 外部消费、原桌面回归、站点路由/搜索/阅读/交互、来源说明 | 当前提交通过相应云端门禁，实际验证边界和剩余项写入03；正式发布仍单独安排 |

Token数据整理可以在EX1/EX2期间并行推进，但不引入需要手工同步的第二份数据。未来每批只迁所需组件及依赖，完成一批再集中提交；不以整目录移动代替依赖审核。

## 8. 验收清单

沿03的DS-A01–DS-A12增加下表，不替代原桌面、分发、权限和外观持久化合同。

| ID | 验收事实 | 失败条件 |
| --- | --- | --- |
| EX-A01 全量可追踪 | UI01–UI19及3.3每个入口映射到页面/组件族/兼容说明，记录公共导出和桌面调用方 | 仅做到原10项、仅目录占位、遗漏内部依赖或把待办列为已支持 |
| EX-A02 实际同源 | 文档预览与桌面引用同一个公共实现和皮肤，示例源码就是运行源码 | 站点手写仿制Card/Composer、复制业务组件、import仍依赖BOAI alias或IPC |
| EX-A03 样式一致 | Card、分割、Tabs、输入/浮层在相同主题/字号下逐项核对radius、border、shadow、背景和文字 | Card被Fumadocs通用圆角覆盖、叠加边框、恢复导航胶囊或prose污染预览 |
| EX-A04 组合交互 | Popconfirm取消/确认、Composer输入与演示回调、菜单/分栏/选区操作可完整走通 | 无操作响应、未确认便提交、IME误发送、用真实业务请求代替示例 |
| EX-A05 浮层隔离 | 明暗并排、Portal、关闭焦点、嵌套/隐藏作用域和Sonner归属正确 | 浮层串主题、被裁切、焦点落到隐藏区域、页面关闭后残留浮层 |
| EX-A06 状态与排版 | 适用的禁用/只读/加载、中文长文本、窄屏、三组字号及reduced-motion均有代表检查 | 只降低opacity却仍可操作、字号脱离注册表、长文或键盘操作被遮挡 |
| EX-A07 Token完整性 | 公共变量都有分类/用途，别名可追踪，无循环/失效引用，浅深表等于生成结果 | 手写色表漂移、将派生值当独立真源、缺失变量或把所有色值都称默认 |
| EX-A08 Token实用性 | 搜索/复制/预览/下载、有效颜色配对的对比度展示可用 | 默认与当前混淆、透明色未说明底色、未实测就宣称无障碍达标 |
| EX-A09 文档同源 | 新旧直达路径/锚点、搜索、Markdown/llms、组件索引和版本正确；DESIGN实际登记 | 图表/Token只存在客户端、Agent文本为空、旧链接断裂或公开内部规格 |
| EX-A10 分发与回归 | tarball独立消费者能用新增入口，Button不连带加载图表/高亮；原桌面门禁保持 | 缺CSS/图标/补丁/资源声明、需要桌面环境、绕过原Required checks |

本轮只执行文档Header、覆盖清单、链接和Git差异检查。后续实现沿`boai-dev-workflow`在云端完成必要的组件交互、设计站和原桌面验证；复用现有入口，新增检查针对以上真实风险，不为每段说明文字新增测试。原失败保留，结果绑定实际提交；本轮没有新产品验证成绩。
