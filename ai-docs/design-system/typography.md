<!--
[INPUT]: BOAI共享组件与现行设计约定。
[OUTPUT]: typography公开设计指南；只包含开发者使用信息。
[POS]: ai-docs/design-system公开内容白名单。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->
## 三类文字，各自有归属

| 组 | 用途 | 字体变量 | 正文尺寸 |
| --- | --- | --- | --- |
| UI | 导航、标签、按钮与表单 | `--font-ui-family` | `--text-ui-body` |
| Content | 消息、说明与阅读正文 | `--font-content-family` | `--text-content-body` |
| Code | 代码、命令与技术标识 | `--font-code-family` | `--text-code-body` |

默认基准为 13px。各层级按 `@boai/tokens` 的比例计算，用户调整一组字号时，该组的标题、说明和行高共同变化。

## 使用角色

用 `--text-ui-caption` 表达注释，用 `--text-ui-body` 表达正文，用 `--text-ui-heading` 表达局部标题。组件与页面不另写一套固定字号。

```css
.description { font-size: var(--text-ui-caption); }
.title { font-size: var(--text-ui-heading); }
```

## 预览与保存

上方预览只修改当前示例的 UI 字号。桌面里的 UI、正文和代码偏好仍由应用保存，公共包只提供定义和解析，不接管用户设置。

## 行高与溢出

行高使用无单位比例，随字号增长。长文本应能换行或在明确的单行区域省略；窄屏和最大字号下，操作与内容不能互相遮挡。
