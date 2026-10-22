<!--
[INPUT]: BOAI共享组件与现行设计约定。
[OUTPUT]: sonner公开设计指南；只包含开发者使用信息。
[POS]: ai-docs/design-system公开内容白名单。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->
## 根部挂载一次

公共 Toaster 包装 Sonner 的 Soft 表面。宿主把当前浅色或深色模式传入 `theme`，可以通过 `icons` 提供本地图标。

```tsx
import { Toaster } from '@boai/ui/sonner'
import { toast } from 'sonner'

<Toaster theme="light" />

toast.success('已保存')
toast.error('保存失败，请重试。')
```

## 反馈与恢复

BOAI 的操作、请求、加载、保存与表单校验错误统一使用 Sonner。原位置继续保留草稿、提交锁与重试/核对入口。

打开历史失败记录不应重新为每条记录弹提示。相同错误要避免重复出现，组件重渲染也不应刷屏。

## 浏览器边界

此版 Toaster 将浮层挂到 `document.body`，只在浏览器中渲染。整个页面主题应覆盖 body。主题隔离的局部预览不在子容器内挂第二个 Toaster；预览中的动作仍由页面根部提示。

## 页面组件索引

- [ErrorToast](#api-error-feedback)：`@boai/ui/error-feedback`；showErrorToast, ErrorToast
- [Toaster](#api-sonner)：`@boai/ui/sonner`；Toaster
