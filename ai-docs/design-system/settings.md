<!--
[INPUT]: BOAI共享组件与现行设计约定。
[OUTPUT]: settings公开设计指南；说明共享守卫的同步/异步宿主保存与放弃回执合同。
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

## 宿主自动保存与离开确认

`useEditorGuard`的`beforeNavigate`可以返回Promise：宿主完成自动保存后再判断是否离开。`hasPendingChanges`提供宿主未决修改状态；`beforeDiscard`可异步核对放弃，只有返回true才执行重置和导航，false或异常保留原确认框。两次导航、明确保存或卸载会使较早的回执失效，避免迟到动作打开旧页面。没有宿主回调时，继续使用原同步草稿守卫。

BOAI桌面适配器通过这些回调接入快捷键自动保存和回执核对；公共包不读取快捷键、外观配置或IPC。
