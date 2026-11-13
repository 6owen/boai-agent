<!--
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

`Test` (`.github/workflows/test.yml`) uses BOAI's typecheck/lint/build, three fixed Electron BDD behaviors, and Vitest on its supported macOS runtime. Run `pnpm test:ui:behavior` after building; it records screenshots and traces in `.local/ui-behavior/` and rejects missing, duplicate, skipped, retried or failed scenarios. The fixed cases cover conversation draft isolation, appearance persistence and workspace tool navigation; they do not replace feature-specific tests. CLI integration tests need dist/cli, so build precedes all runtime checks. Required checks retains its existing name. Neither workflow compares or updates PNG baselines.

The recorder uses DeepSeek without thinking, records the source checkout SHA and actual planned/completed/failed steps, and exits nonzero for incomplete recording. A partial recording is still published with an explicit warning and completed scene count. Invalid or empty UI plans cannot silently succeed with an unrelated fallback screenshot. Publishing requires matching artifact/current PR SHAs and an open PR, and checks the head again just before editing its generated block. Source summaries and previews leave the author's other text intact. Media for other commits of open PRs remain available so overlapping publishers cannot remove newer links; closed PR media are reclaimed on subsequent publications.

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

Regular UI PRs automatically get screenshots and interactive changes get an inline video player in their description. `ui-previews` still hosts screenshots and the original mp4 download. The recorder already produces H.264/yuv420p with faststart. Videos upload once per publication, using GitHub CLI 2.103.3 pinned with its release SHA256; no Pages configuration is needed or changed.

Create a **separate `ui-preview-publish` environment** and put `UI_PREVIEW_UPLOAD_TOKEN` there. Use a dedicated GitHub OAuth/PAT credential that can write to this repository and upload attachments; the Actions `GITHUB_TOKEN` cannot upload them ([upstream limitation](https://github.com/cli/cli/issues/14309)). Do not put the credential in the `ui-preview` recording environment or expose it as a repository-wide secret: that job runs PR code. The privileged publisher checks out trusted workflow code and only uploads the artifact's regular `preview.mp4`, refusing paths and symlinks.

GitHub's attachment limits still apply (10 MB video on Free plans, 100 MB on paid plans). Missing credentials or upload failure mark publication failed and leave a warning with screenshots and the original download, never a misleading “play” poster. Screenshot-only previews need no upload credential. The attachment URL stands alone in its paragraph, so GitHub renders its native player ([official CLI guide](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli)).

The new pull_request_target workflow becomes automatic after it reaches main. Test can be exercised on the feature branch by workflow_dispatch; the recorder can be exercised locally using the command above. No automatic merge is performed by these workflows.
