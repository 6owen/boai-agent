<!--
[OUTPUT]: 2026-10-25源码链接随Workspace迁移更新，历史验证结论保持。
[INPUT]: 用户要求全量安装组件、既有前端规范和 shadcn 官方 Base UI registry。
[OUTPUT]: 基础组件清单、样式入口、使用与维护约定、验证范围。
[POS]: 基础 UI 接入实现记录；业务页面迁移和个性化样式另行推进。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->
# shadcn 基础组件

日期：2026-09-27。使用 shadcn CLI 4.21.0 的官方 `@shadcn` registry、`base-nova` 风格和 Base UI 1.8.0。

## 安装范围

执行官方 `add --all`，得到 **61个UI源码文件**和 `hooks/use-mobile.ts`。完整成员及职责见 [ui/.folder.md](../../../apps/electron/src/renderer/components/ui/.folder.md)。这次交付为后续统一定制提供基础；现有业务页面中的旧控件还没有批量替换。

| 类别 | 组件 |
| --- | --- |
| 弹层与提示 | Dialog、AlertDialog、Popover、Sheet、Drawer、HoverCard、Tooltip、Toast |
| 按钮与表单 | Button、ButtonGroup、Input、InputGroup、InputOTP、Textarea、Field、Label、Select、NativeSelect、Combobox、Checkbox、RadioGroup、Switch、Slider、Toggle、ToggleGroup |
| 菜单与导航 | DropdownMenu、ContextMenu、Menubar、NavigationMenu、Breadcrumb、Pagination、Sidebar、Tabs |
| 展示与布局 | Accordion、Collapsible、AspectRatio、Avatar、Badge、Card、Carousel、Chart、Calendar、Item、Table、ScrollArea、Resizable、Separator、Empty、Skeleton、Alert、Progress、Spinner、Kbd、Direction |
| 聊天与交互 | Message、MessageScroller、Bubble、Attachment、Marker、Questionnaire、Command |

当前 Base UI registry 的 `form` 条目不含文件，表单使用 Field / FieldGroup。Data Table、Date Picker、Typography 属于官方文档中的组合方式，没有捏造同名基础组件文件。Base UI 的通知入口为 `toast.tsx`，不混入 Radix 的 Sonner 模板。

## 样式维护入口

- **组件结构、尺寸、状态与变体**：直接编辑 `src/renderer/components/ui/<name>.tsx`，这是系统基础组件样式的源码入口。
- **全局颜色、字体、圆角**：复用 `styles/colors.css` 和 `shared/appearance`；Tailwind、图表、侧栏和Portal使用相同语义变量。新组件没有独立 ThemeProvider。
- **构建与动画映射**：`styles/tailwind.css` 加载一次 Tailwind、tw-animate-css、shadcn状态/动画工具类和 Iconify 配置。旧原生控件的 Preflight `revert` 排除带 `data-slot` 的新组件。
- **图标**：统一 `components/icons` 的 Solar/Carbon 本地CSS图标。新适配传递 DOM/ref/ARIA，尺寸由 UI slot 控制；组件选择器同时兼容外部SVG与本地图标。`components.json.iconLibrary=lucide`仅为生成元数据，Renderer没有Lucide依赖或导入。
- **应用上下文**：`main.tsx` 接入 TooltipProvider 和 Toaster；通过 `toast.add(...)` 调用通知，沿用既有外观初始化和持久化。

基础组件不读取 Electron 接口、业务快照或外观 store。使用者通过 props 和组合提供数据；颜色由 documentElement 的变量继承。按具体文件直接导入，不增加全量聚合 export 文件。

## 使用示例

```tsx
import { Button } from '@/components/ui/button'
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

<Dialog>
  <DialogTrigger render={<Button />}>编辑</DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>编辑信息</DialogTitle>
      <DialogDescription>填写需要修改的内容。</DialogDescription>
    </DialogHeader>
  </DialogContent>
</Dialog>
```

Base UI 的自定义触发器使用 `render`，参考 [官方 Dialog 文档](https://ui.shadcn.com/docs/components/base/dialog)。对话框/Sheet/Drawer保留标题，Select/Menu项目置于对应Group内，表单使用FieldGroup与Field。

## 生成源码适配

- 将默认图标导入转换为本地Iconify，补齐项目文件Header和目录地图。
- 将模板显式 `color-mix/oklch` 色值替换为现有语义色，浅深颜色统一由主题控制；原有显示/开关/动画行为保留。
- 补齐CalendarDayButton的ref传递，使日期焦点逻辑能够访问真实按钮。
- 通过ESLint `no-restricted-imports`防止新安装组件带入另一套图标。ESLint 9与Babel 7采用兼容版本组合，Babel只负责TS/TSX语法解析，类型检查仍使用项目TypeScript 7，避免typescript-eslint对TS7尚不支持的限制。

## 后续安装与升级

`components.json` 固定ui别名为 `@/components/ui`、CSS入口为 `src/renderer/styles/tailwind.css`。官方新版模板直接使用 `cn` 包，不创建只做转发的 utils 文件。

```sh
pnpm dlx shadcn@latest add dialog --dry-run
pnpm dlx shadcn@latest add dialog --diff dialog.tsx
pnpm lint:ui
pnpm typecheck
pnpm build
pnpm exec playwright test tests/e2e/ui.spec.ts
```

修改过的组件逐文件比较合并，保留自定义样式、Header及Iconify适配。不要对整个目录直接覆盖更新。

## 验证范围

独立 `tests/fixtures/ui` 页面通过Vite导入全部组件，并在Electron内使用实际全局样式和外观初始化。测试覆盖Dialog打开/关闭/焦点返回、嵌套Popover、Select、DropdownMenu、Toast、Tooltip、Switch、Accordion、本地CSS图标以及Portal浅深主题继承。该测试页不进入生产导航或构建入口。

验证结果：`pnpm lint:ui`、类型检查、生产构建和7项Electron测试全部通过。全部61个模块在测试页实际加载；未逐一穷举每个组件的所有变体。构建保持已有大块体积提示，按需导入的基础组件源码不会全部进入业务JavaScript包。
