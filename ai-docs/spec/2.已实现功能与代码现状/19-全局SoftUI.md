<!--
[INPUT]: 本地 6owen-ui Soft Button / Chat Composer、shadcn 基础组件与现有桌面页面。
[OUTPUT]: 全局 Soft 风格的变量、组件职责、页面迁移范围与验证记录。
[POS]: 当前全局控件风格的维护入口。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->
# 全局 Soft UI

参考本地 `6owen-ui/components/ui/soft-button.css`、`soft-button.tsx` 和 `chat-composer.css`，并在浏览器实际查看以下页面：

- http://127.0.0.1:4173/detail.html?t=soft-button
- http://127.0.0.1:4173/detail.html?t=chat-composer

提取连续圆角、按钮顶部高光、细边缘、轻微渐变和分层浮动阴影。保留 BoAI 的桌面框架、字体偏好和已有配色；不复制参考项目的 assistant-ui 运行时，也不新增网络字体、图标依赖或配色函数。

## 维护入口

| 文件 | 负责内容 |
| --- | --- |
| `src/renderer/styles/colors.css` | `--radius-control/card/composer`、`--soft-*` 高光/边缘/阴影颜色、`--shadow-*`，以及浅色/深色切换 |
| `src/renderer/styles/tailwind.css` | Tailwind 字号、圆角、阴影工具类映射到共用变量 |
| `src/renderer/styles/global.css` | 统一加载顺序：布局、页面、UI 皮肤，最后由工具类处理组件布局 |
| `src/renderer/components/ui/skin.css` | Soft 按钮、输入框、卡片、浮层、选择控件的共用外观 |
| `src/renderer/components/ui/button.tsx` | default / secondary / outline / ghost / destructive / link / ink / surface 变体、尺寸和 `round` |
| `src/renderer/components/ui/chat-composer.tsx` | InputGroup 上的聊天输入表面、输入框与操作栏组合 |
| `src/shared/appearance/index.ts` | 主操作颜色跟随主题强调色；按钮前景按对比度选择 |

默认按钮、输入框与原生选择器高 32px、字号 13px；小按钮高 28px。按钮连续圆角 16px，卡片 20px，聊天输入框 48px。聊天输入文字 14px，最小输入高度 80px。没有更改根字号 13px、消息字号 15px 或原生缩放偏好。

支持 `corner-shape: squircle` 的 Chromium 使用连续圆角；不支持时按钮与聊天输入框使用较小的常规圆角回退。纯图标圆形按钮显式使用 `round`，不受连续圆角影响。

## 接入范围

- 业务页面的动作、图标、导航、列表和卡片按钮全部直接使用 Button；`size="content"` 保留内容布局，`variant="surface"` 提供卡片表面。
- Input / Textarea / InputGroup / Select / NativeSelect / Combobox 使用柔和输入表面。
- Card / Dialog / AlertDialog / Popover / HoverCard / DropdownMenu / ContextMenu / Menubar / Sheet / Drawer / Toast 使用统一表面与浮层阴影；Portal 从根节点继承主题。
- Checkbox / Radio / Switch / Slider 复用强调色与高光；其他基础组件继续使用同一份字号、圆角、配色及阴影映射，导航和列表保持轻量层级。
- 设置、员工、任务与资料库的输入、下拉框和复选框直接使用基础组件；common/Field 组合 FieldLabel/FieldDescription，保留控件 ID、标签与提示关联。原生颜色选择和图片不透明度滑杆保留浏览器交互。
- 外观设置、连接、工作区、记忆、运行记录和命令审批复用 Card；员工选择使用 Popover，新建、设置、帮助和任务筛选使用 DropdownMenu。
- 未保存切换使用 AlertDialog；必填未通过时返回表单，保存成功后继续原导航；继续编辑、放弃和 Escape 保留原有意图。
- 会话输入框、工作目录、提及、停止和发送操作已使用共用 UI 组件。引用、草稿、中文输入法、Enter / Shift+Enter、取消和外部任务行为保持原有业务处理。

已移除旧 `.button`、手写菜单与浮层、旧搜索框的视觉兼容规则。页面 CSS 保留业务布局；控件表面由 `components/ui` 统一负责。表单提交按钮显式声明 submit，复选框通过 onCheckedChange 更新业务状态；Textarea 显式 rows 保留文件编辑区高度。

## 验证

- `pnpm build`、`pnpm typecheck`、`pnpm lint:ui` 通过。
- 外观单元测试 7 项通过，覆盖持久化与所有内置主题的正文/按钮前景对比度。
- Electron 回归 8 项通过，包含外观、桌面会话、基础组件、外部任务/自动化、环境、历史、升级，以及页面迁移交互。
- CDP 检查常规按钮与输入框采用 13px / 32px / 16px 连续圆角；聊天输入框为 48px 连续圆角，输入文字 14px。
- 页面迁移回归另验证：缺少必填信息时保持编辑、复选框切换一次只更新一次、取消后保留值、保存并继续完成导航、Enter 提交连接表单、菜单 Escape 归还焦点、任务筛选自动收起。
- 真实 Electron 浅色、深色、浮层与窄窗口预览保存在 `ai-docs/images/soft-ui/`。预览使用独立临时数据，未修改用户的会话或外观偏好。
- 构建仍提示主包大于 500 kB，为已有体积提醒；未增加运行时依赖。
