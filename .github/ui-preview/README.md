<!-- [OUTPUT]: 单张 PR 截图与旧录像工具的使用边界。 -->
# PR 单张截图

CI 自动检测界面改动，检出 PR head，在 macOS 上构建 Electron。一个 `@pr-screenshot` 场景打开目标并截取 `preview.png`。发布端读回 PR head，只发布同一提交的 PNG。创建或更新界面 PR 即可触发，见[目标配置及 release 流程](../../UI_TEST_CI.md)。

`screenshot-target.mjs` 选择页面或解析 Agent 在 PR 正文声明的目标。`publish.mjs` 负责检测、保存图片和更新 PR。截图任务只有仓库读取权限；发布任务运行固定 workflow 提交的发布代码。截图无需 DeepSeek、Chromium 海报、ffmpeg 或上传视频的密钥。

本目录旧的 `record.mjs`、`run.mjs`、`app.ts` 和视频发布入口保留给本地诊断，来自 [Magpie](https://github.com/yetone/magpie/tree/396e0e463805dd5ded971ade37ded08a52512ae5/.github/ui-preview)，见 LICENSE。云端使用 `publish.mjs screenshot`。
