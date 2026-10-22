<!--
[INPUT]: Raft Design固定提交、官网实读，以及BOAI origin/main的包、组件、外观和构建源码。
[OUTPUT]: 可追溯的参考事实、现有资产与耦合清单；支持后续拆包而不宣称已经实现。
[POS]: 第23组调研依据；架构建议归02，实际进度归03 §6。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->
# Raft参考与BOAI现状分析

## 1. 调研范围与版本

2026-10-22读取以下来源；版本与状态仅代表此次快照：

- [Raft仓库](https://github.com/botiverse/raft-design)固定HEAD为[`58d965b0997d763569a18ceba3eb6fe42237a762`](https://github.com/botiverse/raft-design/tree/58d965b0997d763569a18ceba3eb6fe42237a762)，UI包清单为`0.18.0`。
- [Raft网站首页](https://raft-design.botiverse.build/)与[组件目录](https://raft-design.botiverse.build/components)已在浏览器读取，查看了首页视觉、分组导航、示例控制和状态标记。网站也显示`0.18.0`，但未核验其部署commit，因此不声称网站与上述源码字节一致。
- BOAI分析基线为最新获取的`origin/main`：`fbe95154edfeaf304b06258e539c162f9c6fa018`。本轮分支`docs/boai-design-system`由该提交建立。
- 主工作区当时位于`ci/development-docs-gate`；本轮读取用户指定的`boai-dev-workflow`，工作放在独立worktree，不混入该分支尚未合入main的改动。

网页文本工具不能直接打开Raft官网，本轮改用浏览器查看及HTTP读取其公开Markdown/索引；没有把失败的网页抓取视为已查看。未安装、构建或执行上游项目。

## 2. Raft实际如何组织

### 2.1 三种交付物处于不同层

| Raft路径 | 核对到的职责 | 对BOAI的启发 |
| --- | --- | --- |
| `design/` | 原则、视觉基础、模式、产品说明与决策 | 设计系统需要解释使用规则，不能只有组件画廊 |
| `packages/ui` | 发布`@botiverse/raft-ui`，同时提供React、CSS基础和tokens数据 | 可安装的包是产品与官网共同使用的实现 |
| `apps/doc` | 文档站，依赖`@botiverse/raft-ui: workspace:*` | 文档站是包的消费者，包不能反向导入网站 |

依据：[固定README](https://github.com/botiverse/raft-design/blob/58d965b0997d763569a18ceba3eb6fe42237a762/README.md)、[UI包清单](https://github.com/botiverse/raft-design/blob/58d965b0997d763569a18ceba3eb6fe42237a762/packages/ui/package.json)、[网站包清单](https://github.com/botiverse/raft-design/blob/58d965b0997d763569a18ceba3eb6fe42237a762/apps/doc/package.json)。

Raft使用pnpm workspace与Vite+，UI基于React 19、Base UI、Tailwind CSS v4。网站还采用TanStack Start/Router及Cloudflare相关工具。这些是其当前选型，BOAI不需要为了采用目录结构一并迁用全部工具。

### 2.2 一个设计定义可以有多个消费入口

Raft的`tokens.json`为基础数据源，构建脚本生成`foundation.css`并支持检查漂移；包另提供Tailwind集成的`styles.css`、可选`fonts.css`与React导出。普通HTML可以只加载CSS基础。组件文档靠近代码，例如`packages/ui/src/components/button/button.md`。

依据：[包使用说明](https://github.com/botiverse/raft-design/blob/58d965b0997d763569a18ceba3eb6fe42237a762/packages/ui/README.md)、[tokens生成脚本](https://github.com/botiverse/raft-design/blob/58d965b0997d763569a18ceba3eb6fe42237a762/packages/ui/scripts/build-tokens.mjs)、[构建配置](https://github.com/botiverse/raft-design/blob/58d965b0997d763569a18ceba3eb6fe42237a762/packages/ui/vite.config.ts)。

BOAI应借鉴“单一来源、多种产物”，不能同时手工维护桌面一份字号、网站一份字号和npm包第三份字号。是否采用DTCG作为编辑源是后续选择；初期沿用现有TypeScript排版定义更利于保持行为。

### 2.3 官网的重点是使用决策与真实示例

首页提供安装入口、原则和组件导航。正文按原则、人与Agent、基础、文案、模式、组件、产品及决策组织；组件区分Core与Collaboration，并显示实验状态。示例提供浅色、深色、双模式、手机宽度及源码显示控件。这里描述实际可见入口，未逐项测试全部组件。

网站还暴露[llms.txt](https://raft-design.botiverse.build/llms.txt)、Markdown页面及[components.json](https://raft-design.botiverse.build/components.json)。固定源码中的[build-llms](https://github.com/botiverse/raft-design/blob/58d965b0997d763569a18ceba3eb6fe42237a762/apps/doc/scripts/build-llms.mjs)生成这些公开入口。BOAI可以采用同样的“人读页面＋Agent可检索文本”交付方式。

### 2.4 借鉴结构，不直接迁入产品规则或品牌

- Raft页面采用醒目的黄色、黑色描边和贴纸感。BOAI现有中性Soft表面、细边缘、高光、圆角与字体设置应作为本项目基线。
- Raft组件目录包含行内错误/PanelNotice等规则；BOAI明确统一使用Sonner，并保留原位置的恢复操作。不能把上游指南当作BOAI现行交互合同。
- Raft协作层包含线程、任务状态与审批卡片；这些概念不能自动覆盖BOAI的员工主私聊、原Run、消息交付和执行面板规则。
- 上游[NOTICE](https://github.com/botiverse/raft-design/blob/58d965b0997d763569a18ceba3eb6fe42237a762/NOTICE.md)区分代码/文档MIT、字体OFL和不在该MIT授权范围内的品牌素材。本轮只分析结构，不迁入其logo、头像或插画；若以后直接复用代码，应按具体文件保留来源与许可说明。

## 3. BOAI当前已经具备的基础

下列链接指向本仓库实际文件，不是拟建目录：

| 当前资产 | 实际情况 | 提取方向 |
| --- | --- | --- |
| [package.json](../../../package.json)、[pnpm-workspace.yaml](../../../pnpm-workspace.yaml) | 单应用workspace，只列`.`；React 19、Base UI、Tailwind 4、Vite、Sonner已有 | 增补workspace成员，保留依赖补丁与原生构建白名单 |
| [components.json](../../../components.json)、[Button](../../../src/renderer/components/ui/button.tsx) | shadcn base-nova与BOAI定制变体；Button不读业务store | 基础组件可渐进迁入公共包，不需要换一套原语 |
| [colors.css](../../../src/renderer/styles/colors.css)、[skin.css](../../../src/renderer/components/ui/skin.css) | Soft颜色、尺寸、阴影和皮肤；皮肤文件同时混有应用选择器 | 分清token、组件样式、业务覆盖，不整文件机械搬运 |
| [typography.ts](../../../src/shared/appearance/typography.ts) | 字体、范围、默认值、语义比例和行高已有单一注册表 | 优先迁纯定义与计算；兼容旧入口，不能建立第二份真源 |
| [appearance/index.ts](../../../src/shared/appearance/index.ts) | 包含插件目录、主题启停、背景asset、应用图标与偏好结构 | 只提取通用定义，产品配置留在应用 |
| [Renderer外观store](../../../src/renderer/stores/appearance.ts)、[Main外观服务](../../../src/main/appearance.ts) | 宿主持久化，Renderer预览并写CSS变量；含IPC、插件引用和资产协议 | 公共包不保存BOAI偏好、不访问`boai-asset://`或桌面客户端 |
| [global.css](../../../src/renderer/styles/global.css) | 聚合页面/聊天/Scenic样式，并全局清除outline/ring | 不能成为公共包的默认全局入口 |
| [Vite配置](../../../vite.config.ts)、[构建脚本](../../../scripts/build.mjs) | renderer三HTML入口、主进程/运行时/CLI产物和许可证复制均以现有路径组织 | 初期保留根应用，降低目录迁移对运行与分发的影响 |

GitHub查询显示`6owen/boai-agent`当前是**公开仓库**；根`package.json`的`private: true`约束npm发布，不等同于GitHub私有。因此单独开源的价值主要是清晰的包、仓库、贡献与版本边界，而不是将某个目录“变公开”。本轮未确认BOAI设计系统最终许可证，也未改变仓库可见性。

## 4. 需要先处理的真实耦合

1. **路径别名。** Dialog、Sonner等从`@/components/icons`、`@/components/ui`导入；外部消费者没有BOAI的`@`配置，包内必须改成内部相对引用或公开子入口。
2. **业务参数。** [CodeBlock](../../../src/renderer/components/ui/code-block.tsx)及[Shiki初始化](../../../src/renderer/components/ui/shiki-highlighter.ts)读取`@shared/domain/file-preview`的限制。提取时通过通用参数或包内合理默认值表达，BOAI业务限制继续由调用者传入。
3. **浏览器副作用。** [Sidebar](../../../src/renderer/components/ui/sidebar.tsx)写cookie并注册全局快捷键；[Sonner](../../../src/renderer/components/ui/sonner.tsx)将Portal挂到`document.body`。公共组件必须明确副作用归属、清理和非浏览器渲染边界，不能默认包可用于SSR。
4. **CSS发现与图标。** [Tailwind配置](../../../tailwind.config.ts)当前面向`src/renderer`且包含Iconify插件；包移动后必须补类名扫描与本地图标分发。仅改import不代表外部项目获得了完整样式。
5. **默认token与主题覆盖。** 现有字号由Renderer初始化，主题还受插件影响。独立网页需要完整默认值及纯浏览器入口；不能靠加载BOAI store才使按钮正常显示。
6. **全局污染与焦点。** `global.css`有全局`outline:none !important`。公开包不得无条件携带这类重置；键盘可见焦点应作为提取验收项。桌面如需调整表现，按原UI候选审阅流程处理。
7. **资源来源。** 已有Base46、Geist、Craft Scenic、Lody以及其他迁入组件的来源/许可各有归属。首发只纳入来源与分发条件明确的文件，未审查的素材不能因位于`ui`目录就随包公开分发。

## 5. 分析结论

BOAI具备成熟的视觉资产，缺的是可独立消费的工程边界、公开文档和发布合同。首轮工作的核心是保留现有样式与行为、移除对应用宿主的隐式依赖，并让BOAI与网站真正使用同一份代码。目录命名本身解决不了这些问题。

具体推荐与备选见[02](./02-包结构与独立开源方案.md)，完整执行顺序与验收见[03](./03-实施计划与验收.md)。
