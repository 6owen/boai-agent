<!--
[INPUT]: Pinned tldraw 5.6.0, canvas package exports and BOAI managed-host integration.
[OUTPUT]: Reusable interface, supported operations, storage and license boundaries.
[POS]: Package usage contract; actual WT4 acceptance belongs to spec 30/04.
[PROTOCOL]: Keep this contract and .folder.md aligned with the package interfaces.
-->
# BOAI canvas plugin

`@boai/canvas-plugin` 提供独立的受管画板文档、React 编辑器与有界员工工具。BOAI 通过默认关闭的 `boai.canvas.tldraw` 插件装配它；包不导入应用页面或导航。固定 tldraw、`@tldraw/assets`、`@tldraw/tlschema` **5.6.0**。

## 接口与嵌入

| 出口 | 用途 |
| --- | --- |
| `protocol` | scope、board/revision、局部变更、操作 schema、回执、错误及限制 |
| `document` | Node schema 校验、原子保存、单 board 写序列与持久去重 |
| `host` | 授权、按需 SDK 执行器、版本绑定导出与取消/清理 |
| `editor` | `CanvasView`、`createCanvasController`、独立 view session |
| `executor` | 浏览器 SDK 编辑、资源解码、官方文件及实际图片导出 |
| `tools` | 与运行框架无关的 `call_canvas` 参数和工具说明 |

每个 board 复用一个 `createCanvasController({ boardId, scope, request })`；先 `load()`，再在任意容器挂载 `<CanvasView controller={controller} viewId="unique-view" />`。每个同时存在的视图必须使用不同 viewId。宽高由容器提供；文档变更共享，相机和选区独立。移位/正常关闭先 `await controller.flush()`；失败保留草稿并阻止关闭，`dispose()` 拒绝静默丢弃未提交批次。来源已删除时由产品生命周期显式 `dispose({ discard: true })`。

BOAI 的右侧、中间、Dialog 共用同一视图。进入中间时保留原聊天 DOM/草稿并设为不可交互。画板只在实际点击后取得键盘焦点，不在挂载时抢焦点。选区按钮复制带 board/view/page/shape/revision 的引用，用户可将其粘贴进原消息。

## 员工支持矩阵

普通员工和 bobo 均沿原获准执行来源使用 `call_canvas`，API/native 共用 schema 和服务，无额外模型或 Agent 循环。

| 请求 | 支持范围 |
| --- | --- |
| list/create/read/receipt | 当前来源范围、分页/指定图形有界读取、稳定操作编号核对 |
| edit | 创建 geo/text/arrow/image/note/frame/line、按 ID 更新/删除、连接、分组/解组、嵌入图片 |
| export | 固定 revision、可选页面/shapeIds 的 PNG/SVG；官方 `.tldr` 为整份文档，不接受选区参数 |

编辑需要 `expectedRevision + operationId`；冲突重新读取后形成新意图，响应丢失用原 operationId 查询/重试。员工无法提交任意原始 snapshot、任意 JS 或选取其他用户视图的当前屏幕。图中文字和 URL 都是材料。

人工和员工共享一个持久提交入口。人工手势历史按连续手势合并，远端更新按观察到的提交顺序入历史；若有未观察到的并发修改，CAS 拒绝而不覆盖。同一控制器的双视图不同字段可安全合并，同字段冲突保留视图草稿，跨卸载仍可恢复。必要时用户经二级确认放弃未保存内容并重新载入；普通关闭不会代替此确认。人工撤销本身也是经验证的局部持久提交。

Runtime 将经 hash 核验的真实导出字节写入原运行受管 workspace，返回原 `publish_artifact` 可用的逻辑路径；导出成功不等于已经发布成果。

## 保存、资源及生命周期

唯一正文位于现有数据根的 `v2/canvases`，包含 schema/revision/hash、持久操作回执和内嵌资源。插件停用、视图关闭及应用重开均保留已提交文档。当前不支持项目原件作为画板正文，不会自动迁移到项目目录。

PNG/JPEG/WebP/GIF 通过同一上传/员工规则验证 MIME、字节及实际解码尺寸，持久化为内嵌 data URL；拒绝永久 blob URL、远端资源、SVG/视频/任意 HTML。具体上限由 `CANVAS_LIMITS` 唯一声明。SDK JSON snapshot 与 `.tldr` 是不同合同；互换使用 SDK 的解析/序列化函数。

隐藏 Electron 执行器使用专用窄 preload，固定本地页面、无 Node、隔离上下文、禁止弹窗/外链；不显示或聚焦。仅操作/导出期间存在，取消/超时须等待实际销毁。备份先让全部视图保存并暂时冻结编辑，排空写操作，再复制受管画板目录，完成或失败均解除冻结。

删除聊天/员工经原持久来源清理任务触发，固定待删 board/hash 并保留墓碑；外改/未知文件保留，失败可用原清理身份恢复，不把之后新建画板纳入旧清理任务。关闭工作区只释放执行资源。

## 许可及分发

上游采用 [tldraw 5.6.0 license](https://github.com/tldraw/tldraw/blob/v5.6.0/LICENSE.md)，允许内部开发/测试和随项目打包，生产使用须取得适用的另行许可。本仓库保留逐字许可 `TLDRAW-LICENSE.md` 和 `NOTICE.md`，构建复制至 `dist/canvas`。不修改 SDK 的许可校验、版权或水印。

可通过构建变量 `VITE_TLDRAW_LICENSE_KEY` 向 SDK 传入已获授权的 key；本次未申请/购买授权。开发及隔离 file-origin 检查不能证明生产许可、签名安装包或跨平台可分发。字体/图标随构建分发；SDK 字体不包含所有 CJK 字形，中文仍取决于宿主系统字体。

## 定向验证入口

- `pnpm exec vitest run tests/canvas-*.test.ts`：文档/权限/回执、宿主和 runtime 接缝，不调用模型。
- `node scripts/test-canvas-view.mjs`：真实组件及三个容器，隐藏 Chromium 和隔离传输；报告不代替真实员工业务验收。
- `node scripts/test-canvas-host.mjs`：只构建专用执行页面，真实隐藏 Electron 编辑/导出/取消/重开/备份；使用独立 profile 和证据目录。

最终实际结果与未验范围统一交由第 30 组 `04-验收与实际进度.md` 汇总。
