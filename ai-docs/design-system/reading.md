<!--
[INPUT]: BOAI共享实现及受控示例。
[OUTPUT]: 公开组件使用、API入口与验证边界。
[POS]: ai-docs/design-system公开文档。
[PROTOCOL]: 修改时同步Header及所属.folder.md。
-->
# CodeBlock 与 Typeset

统一正文层级、代码和只读输出。

## 组成与导入

- `@boai/ui/code-block`
- `@boai/ui/typeset`

Typeset 接收内容节点。CodeBlock 使用 code / language / lineNumbers / selectedLine / onLineSelect；Shiki 按需加载，失败保留原文。公共 maxLines 是展示阈值，桌面适配器继续使用 FILE_PREVIEW_LIMITS，不替代文件访问授权。

## 交互与状态

正文、列表、引用、代码高亮、行号定位和紧凑工具输出。

上方预览可切换窄屏和明暗对照，UI、正文、代码字号分别来自共享注册表。每个预览有独立的文档、Portal 和通知容器；需要完整窗口时使用“独立打开”。所有演示状态都在本地，刷新后恢复。

“查看源码”展示实际运行的示例文件；“导入与 API”列出真实导出，并可展开完整属性与实现。复合控件的触发器使用 `render={<Button />}` 组合，避免嵌套两个按钮（写法以可复制示例为准）。

## 接入约定

先加载 Tailwind v4，再加载 `@boai/ui/styles.css`。组件内的颜色、Soft 边缘、阴影和圆角来自共享包，禁止在文档站复制一套皮肤。禁用状态仍需真实 `disabled` / `isDisabled` 语义；图标按钮要提供可访问名称。使用 [Token 目录](/foundations/tokens) 查找颜色、排版和圆角。

预览覆盖上述展示与本地交互；真实持久化、权限、异步失败和业务回执由宿主负责。公开包当前仍为工作区内使用，源码迁移不表示已经完成 npm 发布。

## 页面组件索引

- [CodeBlock](#api-code-block)：`@boai/ui/code-block`；CodeBlock
- [Typeset](#api-typeset)：`@boai/ui/typeset`；Typeset, TypesetCode
