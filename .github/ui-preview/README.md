<!-- [OUTPUT]: PR 双图、路径选页及 Agent 指定截图状态。 -->
# PR 改动页面与全局主界面截图

CI 自动检测界面改动，检出 PR head，在 macOS 上构建 Electron。两个 BDD 场景共用一次构建，`@pr-screenshot` 打开目标并截取 `preview.png`，`@global-screenshot` 在独立干净环境启动桌面并截取 `global.png`。缺图时在对应位置显示失败并保留有效图片。发布端读回 PR head，只发布同一提交的 PNG。创建或更新界面 PR 即可触发，见[目标配置及 release 流程](../../UI_TEST_CI.md)。

`screenshot-target.mjs` 按改动路径选择页面或资源库分类。PR 正文的 Agent 定位优先，支持点击、悬停和等待目标进入视口。`publish.mjs` 负责检测、保存图片和更新 PR。截图任务只有仓库读取权限；发布任务运行固定 workflow 提交的发布代码。

本目录旧的 `record.mjs`、`run.mjs`、`app.ts` 和视频发布入口保留给本地诊断，来自 [Magpie](https://github.com/yetone/magpie/tree/396e0e463805dd5ded971ade37ded08a52512ae5/.github/ui-preview)，见 LICENSE。云端使用 `publish.mjs screenshot`。
