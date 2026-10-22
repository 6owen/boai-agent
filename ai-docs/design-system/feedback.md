<!--
[INPUT]: BOAI共享实现及受控示例。
[OUTPUT]: 公开组件使用、API入口与验证边界。
[POS]: ai-docs/design-system公开文档。
[PROTOCOL]: 修改时同步Header及所属.folder.md。
-->
# Alert 与旧版 Toast

静态提示与兼容展示。

## 组成与导入

- `@boai/ui/alert`
- `@boai/ui/toast`

BOAI 操作错误统一使用 Sonner。Alert 仅展示静态信息；旧 Base UI Toast 保留兼容子路径，不推荐新增业务依赖，也不从根入口导出与 Sonner 同名的 Toaster。

## 交互与状态

静态说明与单独的旧版 Toast 展示。

上方预览可切换窄屏和明暗对照，UI、正文、代码字号分别来自共享注册表。每个预览有独立的文档、Portal 和通知容器；需要完整窗口时使用“独立打开”。所有演示状态都在本地，刷新后恢复。

“查看源码”展示实际运行的示例文件；“导入与 API”列出真实导出，并可展开完整属性与实现。复合控件的触发器使用 `render={<Button />}` 组合，避免嵌套两个按钮（写法以可复制示例为准）。

## 接入约定

先加载 Tailwind v4，再加载 `@boai/ui/styles.css`。组件内的颜色、Soft 边缘、阴影和圆角来自共享包，禁止在文档站复制一套皮肤。禁用状态仍需真实 `disabled` / `isDisabled` 语义；图标按钮要提供可访问名称。使用 [Token 目录](/foundations/tokens) 查找颜色、排版和圆角。

预览覆盖上述展示与本地交互；真实持久化、权限、异步失败和业务回执由宿主负责。公开包当前仍为工作区内使用，源码迁移不表示已经完成 npm 发布。

## 页面组件索引

- [Alert](#api-alert)：`@boai/ui/alert`；Alert, AlertTitle, AlertDescription, AlertAction
- [Toaster](#api-toast)：`@boai/ui/toast`；Toaster, Toast, ToastAction, ToastClose, ToastContent, ToastDescription, ToastPortal, ToastProvider, ToastTitle, ToastViewport, createToastManager, toast, useToastManager
