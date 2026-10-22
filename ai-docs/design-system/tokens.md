<!--
[INPUT]: BOAI共享实现及受控示例。
[OUTPUT]: 公开组件使用、API入口与验证边界。
[POS]: ai-docs/design-system公开文档。
[PROTOCOL]: 修改时同步Header及所属.folder.md。
-->
# Tokens

全部默认值来自 `@boai/tokens` 的 foundationVariables。浏览器、下载 JSON、CSS 和 Agent Markdown 共同读取这份定义，不复制另一份色板。

## 使用语义变量

使用 `var(--foreground)` 表达正文，用 `var(--primary)` 表达主操作。Card 的表面边缘使用 `shadow-control`；普通结构边缘使用 `border`，分割线使用 `shadow-divider`。不要把所有 border 都替换成同一种粗描边。

## 默认值与预览值

这里公布的是包的默认明暗值。组件预览的 UI、正文、代码字号可以独立调整，但不改写此表；应用实际偏好由宿主管理。Alias 展示原引用和解析后的值。`calc()`、阴影和字体列表保留 CSS 表达式，不伪称为静态像素结果。

## 导出

- [tokens.json](/tokens.json)：完整变量、用途、类型、来源和引用。
- [foundation.css](/foundation.css)：由相同变量生成的明暗主题 CSS。
- [Token Markdown](/foundations/tokens.md)：包含完整数值表，供人和 Agent 阅读。
- [DESIGN.md](/DESIGN.md)：简明设计规则。

颜色对比度只对列明的默认前景/背景组合计算，不代替实际产品的完整无障碍检查。
