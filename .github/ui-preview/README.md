<!--
[OUTPUT]: 2026-11-18 UI PR自动截图/适用录屏并写回正文；同SHA合并后继续发布，Agent接续，无需点击Run。
[OUTPUT]: 设置导航说明支持其他配置二级菜单；初始化public子模块后再安装与构建预览。
[OUTPUT]: Fixed UI behavior checks, actual recording completion and current-head publication; partial media remain failed.
[INPUT]: Magpie Test/UI preview at 396e0e463805dd5ded971ade37ded08a52512ae5.
[OUTPUT]: Source attribution, explorer UI detection, native attachment configuration and runnable preview instructions.
[POS]: Development UI preview, separate from product employee skills.
[PROTOCOL]: Update this header and .folder.md when changed.
-->
# BOAI UI preview

Derived from [yetone/magpie](https://github.com/yetone/magpie/tree/396e0e463805dd5ded971ade37ded08a52512ae5/.github/ui-preview), MIT license preserved in LICENSE.

- `cursor.js`: upstream mouse trail/click/caption overlay.
- `record.mjs`: upstream DeepSeek planner, DOM outlines, actions, bounded operation repair, screenshots, conditional mp4 and leak detection. BOAI replaces page names, prompt context, TypeScript/TSX source discovery and Chromium app launch with real Electron. Chromium is only used to render the video poster.
- `publish.mjs`: UI-path detection (including the file explorer component/CSS), media branch and fixed PR-description block. Recordings upload as native GitHub video attachments with `gh pr edit --attach`; a poster linking to raw mp4 is not a player.
- `app.ts`: BOAI Electron lifecycle/navigation; reuses existing isolated conversation and schedule fixtures. Demo model traffic uses the fixture, DeepSeek plans actions.
- `run.mjs`: builds the adapter, then invokes the recorder. Full application build remains an explicit preceding step.
- `result.mjs`: validates recording plans and derives complete/partial/failed/skipped from actual scene/step results.

Ordinary PR `Test` runs only typecheck/lint on Linux; main push does not rerun it. Agent-dispatched Test or an explicit `ci:full` PR runs the full macOS build, three fixed UI behaviors and Vitest. UI recording automatically runs for UI-changing PRs on creation, reopening and pushes. No user click or label is required. Its application build is needed to capture the UI; it does not run full Vitest or fixed BDD tests. Tests and local recording commands remain available. Required checks keeps its name; neither workflow compares PNG baselines.

The recorder uses DeepSeek without thinking, records the source checkout SHA and actual planned/completed/failed steps, and exits nonzero for incomplete recording. A partial recording is still published with an explicit warning and completed scene count. Invalid or empty UI plans cannot silently succeed with an unrelated fallback screenshot. Publishing requires matching artifact/current PR SHAs and an open or merged PR, and checks the head again just before editing its generated block. Source summaries and previews leave the author's other text intact. Fast checks may merge a PR before recording finishes; its same-head preview is still published. Media for other PRs and commits remain available after merge so later publications do not break existing links. Closed-unmerged PRs and stale heads are skipped.

All three trusted script checkouts use the workflow's immutable `github.sha`, keeping recorder and publisher versions together while main advances. For `pull_request_target` this is the event's default-branch commit; PR application code is checked out separately at the detected head ([GitHub event reference](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#pull_request_target)).

## Configuration

GitHub environment `ui-preview`: secret `DEEPSEEK_API_KEY`; optional variables `DEEPSEEK_BASE_URL` (default https://api.deepseek.com/v1) and `PLAN_MODEL` (default deepseek-flash). The record job executes PR code with this key and read-only repository access, as upstream does; publish has repository write access and never executes PR code.

Local ignored `.env.ui-preview` contains the same variable names. Do not commit it or copy credentials into logs/artifacts. Install workspace dependencies and ffmpeg, then:

```sh
pnpm build
pnpm exec playwright install chromium ffmpeg
git diff <base> <head> -- apps/electron/src/renderer packages/ui packages/tokens > .local/preview.diff
DIFF_FILE="$PWD/.local/preview.diff" PR_TITLE="UI change" node --env-file=/absolute/path/.env.ui-preview .github/ui-preview/run.mjs . .local/ui-preview-out
```

No plan supplied means a real DeepSeek planning request. `PLAN_FILE` is upstream's optional deterministic diagnostic input and does not prove DeepSeek works.

UI-changing PRs automatically get screenshots and applicable inline video. Backend/documentation-only PRs skip recording. The `ui-preview` label and `gh workflow run ui-preview.yml --ref main -f pr=<number>` remain optional Agent overrides for paths the detector misses; they are not prerequisites for ordinary UI PRs. Removing the label does not disable UI-diff detection. Old preview blocks are replaced when a diff no longer touches UI. `ui-previews` still hosts screenshots and the original mp4 download. The recorder already produces H.264/yuv420p with faststart. Videos upload once per publication, using GitHub CLI 2.103.3 pinned with its release SHA256; no Pages configuration is needed or changed.

Create a **separate `ui-preview-publish` environment** and put `UI_PREVIEW_UPLOAD_TOKEN` there. Use a dedicated GitHub OAuth/PAT credential that can write to this repository and upload attachments; the Actions `GITHUB_TOKEN` cannot upload them ([upstream limitation](https://github.com/cli/cli/issues/14309)). Do not put the credential in the `ui-preview` recording environment or expose it as a repository-wide secret: that job runs PR code. The privileged publisher checks out trusted workflow code and only uploads the artifact's regular `preview.mp4`, refusing paths and symlinks.

GitHub's attachment limits still apply (10 MB video on Free plans, 100 MB on paid plans). Missing credentials or upload failure mark publication failed and leave a warning with screenshots and the original download, never a misleading “play” poster. Screenshot-only previews need no upload credential. The attachment URL stands alone in its paragraph, so GitHub renders its native player ([official CLI guide](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli)).

The new pull_request_target workflow becomes automatic after it reaches main. The Agent can exercise Test or UI preview on the feature branch using `gh workflow run` (workflow_dispatch); the recorder can be exercised locally using the command above. No automatic merge is performed by these workflows.

设置导航沿“我的菜单 → 其他配置 → 模型连接”二级菜单，外观等个人设置可走同名快捷入口。PR源码检出须初始化 `packages/avatar-motion` 固定子模块；修改此检出配置的首次PR可由Agent从该分支命令触发 workflow_dispatch，仍核对当前PR的真实head SHA；已合并且head相同也可补发。

角色动画预览在隔离录制profile中给研究员使用首批支持的小牛（fox）预设；共享行为测试和实际产品默认头像不变。未支持的其他预设保持静态头像，不能把它们缺少动画入口视作已支持。
