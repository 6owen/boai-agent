<!--
[INPUT]: BOAI共享组件与现行设计约定。
[OUTPUT]: badge公开设计指南；只包含开发者使用信息。
[POS]: ai-docs/design-system公开内容白名单。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->
## Badge

轻量说明某个对象的状态、类别或数量。文字必须能独立解释含义，不能只靠颜色判断结果。

| variant | 用途 |
| --- | --- |
| `default` | 强调标记 |
| `secondary` | 中性状态 |
| `outline` | 更轻的分类说明 |
| `destructive` | 已发生的失败或危险状态 |

Badge 不触发业务状态迁移，不把“运行结束”解释为“成果已验收”。

## Separator

用于相关内容间的细分割。`orientation="vertical"` 切换为纵向；默认水平。与 Card 页脚共享细线和高光，避免页面自行画出另一套边缘。
