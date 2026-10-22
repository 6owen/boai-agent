<!--
[INPUT]: BOAI共享组件与现行设计约定。
[OUTPUT]: Fumadocs设计站与公共包的开发入口、样式和独立构建指南。
[POS]: ai-docs/design-system公开内容白名单。
[PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
-->
## 当前开发入口

当前版本在 BOAI 仓库中开发。`@boai/tokens` 与 `@boai/ui` 是工作区包，尚未在 npm 发布；先在仓库根目录安装锁定依赖，再运行下方命令。

`pnpm dev:design` 启动设计站，默认地址为 `http://127.0.0.1:5190`。`pnpm dev` 继续启动桌面应用。设计站使用示例数据，不需要模型或桌面配置。

文档站使用 Fumadocs UI 与 MDX 渲染，提供响应式侧栏、搜索弹窗、页面目录、标题锚点和代码高亮。交互预览直接使用 BOAI 共享组件；文档框架仅属于网站应用，安装组件包不需要引入 Fumadocs。

## 工作区依赖

React 应用声明以下依赖，然后从公开包入口导入组件。React 与 React DOM 使用同一个 React 19 实例。

```json
{
  "dependencies": {
    "@boai/tokens": "workspace:*",
    "@boai/ui": "workspace:*"
  }
}
```

```tsx
import { Button } from '@boai/ui/button'

export function Save() {
  return <Button>保存更改</Button>
}
```

## 样式

应用加载一次 Tailwind CSS 4，再加载共享样式。共享样式包含完整默认变量、Soft 皮肤和 Tailwind 语义映射，并登记包内源码供类名扫描。

```css
@import 'tailwindcss';
@import '@boai/ui/styles.css';

:root {
  font-family: var(--font-ui-family);
  font-size: var(--text-ui-body);
  color: var(--foreground);
  background: var(--background);
}
```

普通 HTML 可以单独加载 `@boai/tokens/foundation.css` 获得变量；它不会为页面加载 reset、字体文件或布局。

## 主题与排版

在根节点使用 `light` 或 `dark` class。局部示例可以设置自己的模式，两种模式可并排出现。

```tsx
import { typographyVariables, typographyDefaults } from '@boai/tokens'

const style = typographyVariables(typographyDefaults)
// 将返回的 CSS 自定义属性应用到主题容器。
```

字体默认使用 Geist 与系统字体回退。此版公共包没有内置字体文件，宿主可独立加载具有相应分发许可的字体。

## 构建

`pnpm build:design` 生成共享包和静态文档站，站点产物在 `apps/design-docs/dist`。文档子路径均生成 HTML，部署到域名根路径即可直接访问和刷新。包仍标记为私有开发包，正式分发与许可证另行确定。
