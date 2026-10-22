<!--
[INPUT]: BOAI共享组件与现行设计约定。
[OUTPUT]: settings公开设计指南；只包含开发者使用信息。
[POS]: ai-docs/design-system公开内容白名单。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->
## 信息与操作就近

用 Card 聚合同一个主题，标题区显示用途和状态，字段说明靠近输入，操作留在这一组的页脚。长页面使用正常文档滚动，避免每张卡片内部再造滚动区域。

## 草稿与保存

编辑先成为草稿。明确保存后才能更新“已保存”状态；失败保留用户输入和恢复操作。切换页面或关闭容器时，宿主按实际需要保护未保存内容。

上方是独立的内存示例：可编辑名称、保存或还原。实际产品的保存事务、版本冲突、持久化与离开确认由宿主负责，公共组件不自动执行这些操作。

## 加载与反馈

已知结构先出现，数据逐项补齐。保存期间锁定重复提交，失败沿 Sonner 提示，恢复操作仍在原位置。

## 复用已有结构

字段沿 [Input 与 Field](/components/input)，标题与页脚沿 [Card](/components/card)，动作沿 [Button](/components/button)。相同用途使用相同尺寸和层级，页面只组合已有部件。

## 页面组件索引

- [useEditorGuard](#api-use-editor-guard)：`@boai/ui/use-editor-guard`；useEditorGuard
