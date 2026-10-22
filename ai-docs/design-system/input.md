<!--
[INPUT]: BOAI共享组件与现行设计约定。
[OUTPUT]: input公开设计指南；只包含开发者使用信息。
[POS]: ai-docs/design-system公开内容白名单。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->
## 单行与多行

Input 接受原生 input 属性，Textarea 接受原生 textarea 属性。所有文本输入共享中性表面、细边缘与圆角；Textarea 可通过 `rows` 保持明确的编辑高度。

## 字段结构

相关字段放入 `FieldGroup`。每项由 `Field`、`FieldLabel`、输入与可选 `FieldDescription` 组成。标签通过 `htmlFor` 关联唯一 ID，说明通过 `aria-describedby` 关联，不能只依靠占位文字解释用途。

| 部件 | 职责 |
| --- | --- |
| `FieldGroup` | 组织一组字段 |
| `Field` | 字段布局与状态 |
| `FieldLabel` | 可访问标签 |
| `FieldDescription` | 持续可见的用途说明 |
| `FieldSet` / `FieldLegend` | 一组相关选择的语义分组 |

## 校验与禁用

校验失败在输入上设置 `aria-invalid`，操作提示统一使用 [Sonner](/components/sonner)。保留草稿与重试入口，不让一条会消失的提示承担全部恢复流程。

禁用使用 `disabled`，只读使用 `readOnly`。两者含义不同，不用仅改变透明度模拟不可用。

宿主保存数据，公共控件只呈现输入与状态。BOAI 的 `FieldError` 继续是宿主错误反馈适配，不随通用 Field 布局导出。
