<!--
[INPUT]: 用户明确授权直接迁用 Craft 图片换肤；固定 v0.15.1 源码与 BOAI 已有外观存储。
[OUTPUT]: Scenic 来源、适配、恢复边界与唯一实际验收记录。
[POS]: 第3组外观增量；替代14中旧背景叠加方案，不替代其他外观合同。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->
# Craft 图片换肤迁入

日期：2026-10-15。用户授权实施，不要求另建一套换肤框架。

## 来源与迁入范围

直接迁用 [Craft Agents v0.15.1](https://github.com/craft-ai-agents/craft-agents-oss/tree/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f)，固定 commit `2e3ba53ff80b229a07e9d1884dc58f6733f22e1f`（2026-10-13）。

- `apps/electron/src/renderer/index.css`：Scenic 全窗居中 cover 图片、40% 黑色遮罩、8px backdrop blur、72% 卡片底色及渐变遮罩边框。
- `apps/electron/src/renderer/context/ThemeContext.tsx`：有图强制深色、`data-scenic` 和 `--background-image` 的启用/移除语义。
- `apps/electron/resources/docs/themes.md`：Scenic 合同核对。Craft 的主题 JSON 可以指定图片；BOAI 继续用现有原生选图入口。

迁入文件、源文件 SHA256 和差异固定在 `src/renderer/styles/craft-scenic/source-manifest.json`；Apache-2.0 原始许可与 NOTICE 随源码和构建产物分发。没有引入 Craft 的 Claude SDK 或新依赖。

## 产品行为

1. 设置 → 外观 → 背景图片 → 选择图片，即启用全窗图片和深色玻璃面板。可查看缩略图、更换、移除。
2. 图片属于整个应用，与员工、会话无关。主导航、设置、聊天与详情共用背景。
3. 使用选定的深色主题和强调色。纯色模式的浅/深/系统偏好、自定义背景和前景不覆盖；图片期间停用模式切换，移除后恢复。
4. 退役旧图片透明度 UI。旧 `imageOpacity` 字段保留读取/备份兼容，Scenic 不再叠乘该值；图片完整显示，遮罩与玻璃按上游固定值生效。替代旧默认20%图片与94%–98%不透明面板叠加。
5. 继续把 PNG/JPEG/WebP 复制到受管图片目录；最大10 MiB、单边8192、3200万像素，魔数/尺寸/原生解码与专用协议不变。删除原图、关闭软件后，托管副本仍可用。
6. 取消或无效图片不改变当前图片；副本缺失回退原纯色主题并显示诊断。保存冲突、未保存关闭保护和新版配置只读沿现有流程。

## BOAI 适配

- Craft `.shell-card` 映射到 BOAI `.content-frame`，`.input-container` 映射聊天 composer。只在外框和输入框使用模糊，内层面板不重复模糊。
- 沿用 BOAI 组件、字体、间距、圆角与布局；卡片72%底色，菜单/对话框保留不透明底色。
- 不复制 Craft 特定的标题栏 z-index 和直接子元素 position 规则，避免干扰 BOAI 拖拽区、分栏与浮层。边框装饰保持 `pointer-events:none`。
- 原生主题源继续记住用户偏好，界面与启动背景使用实际解析深色；移除后按原系统/用户模式恢复。

## 实际验收

已完成源码实施与 macOS Electron 构建产物定向验证。

| 检查 | 实际结果 |
| --- | --- |
| `pnpm exec vitest run tests/appearance.test.ts` | 9通过：原合同、Scenic深色/恢复、托管图片重启、缺失文件回退 |
| `pnpm typecheck` / `pnpm lint:ui` | 通过 |
| `pnpm build` / `pnpm test:bddgen` | 通过；构建保留既有大chunk提醒，Craft三份许可/来源文件随Renderer分发 |
| 原外观BDD（attempt-1） | 1场通过，原生窗口尺寸、字体/颜色、缩放、重启和重置 |
| Scenic BDD（attempt-3） | 1场通过，两次真实桌面启动；选图/菜单/聊天输入/取消/损坏图片/删除源图后恢复/移除恢复原配色 |
| 原生整幅截图 | 最终5个关键画面及两次关闭画面/trace；代理查看设置菜单与聊天效果，图片/玻璃可见、菜单实色、输入可读 |

失败与修复不覆盖：attempt-1 的 Scenic 背景已显示，但构建后只保留 WebKit backdrop-filter 声明，Electron 实际无磨砂；调整为标准声明最后，构建 CSS 和实际8px属性复测通过。attempt-2 因新数据尚无会话而误等待输入框失败；改为点击现有“与 bobo 新建会话”入口，未改生产聊天逻辑。菜单截图先等待动画结束，避免把过渡帧当作实色结果。

[本轮可视报告与原件](../../reviews/2026-10-15-craft-scenic/README.md)保留三次批次、原生尺寸/hash、实际退出和最终源码hash。未触碰用户当前外观配置；图片仅存在隔离验收数据目录。未生成新安装包，本轮不声明全仓回归或长期GPU/内存认证；用户视觉评价未代填。
