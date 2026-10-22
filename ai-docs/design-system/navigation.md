<!--
[INPUT]: BOAI共享实现及受控示例。
[OUTPUT]: 公开组件使用、API入口与验证边界。
[POS]: ai-docs/design-system公开文档。
[PROTOCOL]: 修改时同步Header及所属.folder.md。
-->
# Tabs、Breadcrumb、Pagination

切换视图与定位层级。

## 组成与导入

- `@boai/ui/tabs`
- `@boai/ui/tabs-indicator`
- `@boai/ui/breadcrumb`
- `@boai/ui/pagination`
- `@boai/ui/direction`

TabsList 支持 default、line、window；TabsSlidingIndicator 是内部装饰层，不持有选中状态。Tabs 的 value / onValueChange 属于调用方。DirectionProvider 提供 RTL 方向；Pagination 只展示分页，数据请求由宿主处理。

## 交互与状态

三种 Tabs、滑动选中层、禁用标签、RTL、面包屑和受控分页。

上方预览可切换窄屏和明暗对照，UI、正文、代码字号分别来自共享注册表。每个预览有独立的文档、Portal 和通知容器；需要完整窗口时使用“独立打开”。所有演示状态都在本地，刷新后恢复。

“查看源码”展示实际运行的示例文件；“导入与 API”列出真实导出，并可展开完整属性与实现。复合控件的触发器使用 `render={<Button />}` 组合，避免嵌套两个按钮（写法以可复制示例为准）。

## 接入约定

先加载 Tailwind v4，再加载 `@boai/ui/styles.css`。组件内的颜色、Soft 边缘、阴影和圆角来自共享包，禁止在文档站复制一套皮肤。禁用状态仍需真实 `disabled` / `isDisabled` 语义；图标按钮要提供可访问名称。使用 [Token 目录](/foundations/tokens) 查找颜色、排版和圆角。

预览覆盖上述展示与本地交互；真实持久化、权限、异步失败和业务回执由宿主负责。公开包当前仍为工作区内使用，源码迁移不表示已经完成 npm 发布。

## 页面组件索引

- [Breadcrumb](#api-breadcrumb)：`@boai/ui/breadcrumb`；Breadcrumb, BreadcrumbList, BreadcrumbItem, BreadcrumbLink, BreadcrumbPage, BreadcrumbSeparator, BreadcrumbEllipsis
- [DirectionProvider](#api-direction)：`@boai/ui/direction`；DirectionProvider, useDirection
- [Pagination](#api-pagination)：`@boai/ui/pagination`；Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious
- [TabsSlidingIndicator](#api-tabs-indicator)：`@boai/ui/tabs-indicator`；TabsSlidingIndicator
- [Tabs](#api-tabs)：`@boai/ui/tabs`；Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants
