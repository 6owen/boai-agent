<!--
[INPUT]: 用户明确授权直接迁用 Craft 图片换肤；固定 v0.15.1 源码与 BOAI 已有外观存储。
[OUTPUT]: Scenic来源、明暗模式、图片下方玻璃/遮罩/模糊独立调节与零值清透、恢复边界及分批验收；替代固定8px模糊和固定区域染色。
[POS]: 第3组外观增量；替代14中旧背景叠加方案，不替代其他外观合同。
[PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
-->
# Craft 图片换肤迁入

初始迁入：2026-10-15。2026-10-16用户要求背景图片也支持浅色，现行行为以以下产品行为为准；原验收按日期保留。

## 来源与迁入范围

直接迁用 [Craft Agents v0.15.1](https://github.com/craft-ai-agents/craft-agents-oss/tree/2e3ba53ff80b229a07e9d1884dc58f6733f22e1f)，固定 commit `2e3ba53ff80b229a07e9d1884dc58f6733f22e1f`（2026-10-13）。

- `apps/electron/src/renderer/index.css`：Scenic 全窗居中 cover 图片、40% 黑色遮罩、8px backdrop blur、72% 卡片底色及渐变遮罩边框。
- `apps/electron/src/renderer/context/ThemeContext.tsx`：有图强制深色、`data-scenic` 和 `--background-image` 的启用/移除语义。
- `apps/electron/resources/docs/themes.md`：Scenic 合同核对。Craft 的主题 JSON 可以指定图片；BOAI 继续用现有原生选图入口。

迁入文件、源文件 SHA256 和差异固定在 `src/renderer/styles/craft-scenic/source-manifest.json`；Apache-2.0 原始许可与 NOTICE 随源码和构建产物分发。没有引入 Craft 的 Claude SDK 或新依赖。

## 产品行为

1. 设置 → 外观 → 背景图片 → 选择图片，即启用全窗图片和当前明暗模式的玻璃面板。可查看缩略图、更换、移除。
2. 图片属于整个应用，与员工、会话无关。主导航、设置、聊天与详情共用背景。
3. 图片不改变浅色/深色/跟随系统的选择，模式按钮始终可用；主题按所选模式展示，系统模式保留浅/深两组选项。图片保留时可切换，重启和系统变化遵循同一模式解析。纯色自定义背景/前景保留，移除图片后按当前模式恢复纯色。
4. 退役旧图片透明度UI；`imageOpacity`只兼容读取/备份，不叠乘图片。选图后在图片下方内嵌Card，含「毛玻璃不透明度」「遮罩浓度」「模糊度」三行Slider，实时预览并自动保存。前两项0–100%，模糊0–32px。`glassOpacity`默认null保留原深色55%/浅色72%面板与72%卡片；`overlayOpacity`默认40%，深色黑/浅色白；`blurRadius`默认8px，0时关闭外框和输入框滤镜。各区域原12%/15%染色与卡片高光按玻璃比例联动，三项归零后无玻璃底色、全窗遮罩、高光雾层或模糊，保留文字/图标、边缘及普通控件表面。三项独立，所有模式共用明确设置值；换图、移除再选图、重启/备份恢复保留，外观重置恢复原默认。
5. 继续把 PNG/JPEG/WebP 复制到受管图片目录；最大10 MiB、单边8192、3200万像素，魔数/尺寸/原生解码与专用协议不变。删除原图、关闭软件后，托管副本仍可用。
6. 取消或无效图片不改变当前图片；副本缺失回退原纯色主题并显示诊断。保存冲突、未保存关闭保护和新版配置只读沿现有流程。

## BOAI 适配

- Craft `.shell-card` 映射到 BOAI `.content-frame`，`.input-container` 映射聊天 composer。两者共用可调模糊，0时使用`none`；内层面板不重复模糊。
- 沿用 BOAI 组件、字体、间距、圆角与布局；卡片默认72%底色，设置后与面板共用玻璃不透明度；菜单/对话框保留不透明底色。
- 不复制 Craft 特定的标题栏 z-index 和直接子元素 position 规则，避免干扰 BOAI 拖拽区、分栏与浮层。边框装饰保持 `pointer-events:none`。
- 原生主题源、界面和启动背景统一使用实际解析的浅/深色；图片不强制深色。外层底色统一覆盖顶栏/导航和右下留白，内容框只保留一层圆角渐变边缘。外壳/列表/详情/输入框染色和卡片高光随玻璃不透明度按比例变化，零值不保留固定染色。
- 图片说明置于标题图标Tooltip，预览无分割线；外观标题右侧重置需Popover确认，浮层仅标题/取消/确认，无底部说明或操作区。

## 2026-10-15 实际验收（原深色合同）

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

## 2026-10-16 浅深色增量与本轮检查

用户要求图片模式也可选浅色，并移除重置确认浮层的说明句。源码已取消图片强制深色与模式按钮禁用，增加浅色遮罩/玻璃/输入框底色；保留托管图片和各模式主题/强调色，重置仍需确认。同期外框单层圆角、统一右下留白、图片说明Tooltip与标题右侧重置保持。

- `pnpm exec vitest run tests/appearance.test.ts tests/application-plugins.test.ts`：2文件21项通过，含图片浅色/深色/系统、显式模式不受系统变更覆盖、带图切换、托管原图删除后重启、移除恢复颜色和插件主题停用恢复。
- `pnpm typecheck`、外观页面/状态文件ESLint及`pnpm build`通过；构建保留既有大chunk提示。
- 原外观BDD步骤已同步新的模式切换和重置确认合同；按用户本轮要求未运行E2E，不将2026-10-15的深色桌面成绩视为本轮浅色视觉验收。未生成新安装包。

## 2026-10-16 玻璃不透明度增量

选图后新增共用Slider与百分比数值，支持键盘及拖动，复用原150ms合并预览/串行保存。独立`glassOpacity`控制玻璃面板和卡片底色，不修改图片或内容元素opacity；旧配置缺少该字段时使用null，保留原视觉默认。0与1均为有效值，新版只读配置禁止调整，保存失败沿原重试入口。

- `pnpm exec vitest run tests/appearance.test.ts tests/application-plugins.test.ts`：2文件23项通过，新增不透明度范围拒绝、换图/移除再导入、系统模式变化、重启/备份恢复/重置与旧配置兼容覆盖。
- `pnpm typecheck`、外观页面/状态文件ESLint、`pnpm build`通过；构建保留既有大chunk提示。
- 按用户要求未运行E2E，未做本轮桌面视觉验收或生成安装包。

## 2026-10-16 图片下方参数卡片与遮罩调节

用户要求把配置移到图片下面，采用卡片内嵌卡片的两行布局。已复用Card/Slider/soft-divide-y，宽栏为标签、滑杆、百分比三列，窄栏滑杆换行；保留玻璃不透明度，新增独立遮罩浓度0–100%，默认原40%。调低遮罩时原图更明显，深色用黑色、浅色用白色；两项均实时预览并沿原合并/保存/失败重试持久化。

- `pnpm exec vitest run tests/appearance.test.ts tests/application-plugins.test.ts`：2文件25项通过，覆盖缺少新字段和保留已有玻璃值的旧配置、两项独立合并、0/100%及非法输入、换图/重启/备份/重置。
- `pnpm typecheck`、外观页面/状态文件ESLint、`pnpm build`通过；构建保留既有大chunk提示。
- 未运行E2E或本轮桌面视觉验收，未生成安装包。开发宿主保存协议有增量，需重启`pnpm dev`载入。

## 2026-10-16 零值残留修复与独立模糊

用户截图显示玻璃/遮罩均0仍有毛玻璃感。源码确认固定8px滤镜、外壳/列表/详情12%与输入框15%染色，以及卡片高光渐变均未受两个滑杆控制；原两项检查未覆盖这些Renderer残留。先前解释轮仅定位，本轮已实施修复。

新增独立模糊度0–32px，旧配置默认8px；0时两个模糊位置使用`none`。原区域染色按玻璃值/模式默认值同比例联动，高光随之减弱至零；未调整配置保持原比例，边缘与普通控件保持。保留已有玻璃/遮罩设置，三项都设为0后无额外玻璃染色、图片遮罩或模糊。

- `pnpm exec vitest run tests/appearance.test.ts tests/appearance-renderer.test.ts tests/application-plugins.test.ts`：3文件28项通过。宿主模块覆盖8px兼容默认、范围校验和0值换图/重启/备份；隔离DOM Renderer模块覆盖明暗默认、区域token/高光变量/滤镜归零、独立预览保存与移图清理。
- `pnpm typecheck`、外观页面/状态文件ESLint、`pnpm build`通过；构建CSS保留共用滤镜变量，既有大chunk提示保持。
- 按用户要求未运行E2E，隔离DOM与构建检查不代替实际桌面像素验收。未生成安装包，开发宿主需重启`pnpm dev`载入新增配置字段。
