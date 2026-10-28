<!--
[INPUT]: Magpie Test/UI preview at 396e0e463805dd5ded971ade37ded08a52512ae5.
[OUTPUT]: Source attribution, BOAI adaptations and runnable preview instructions.
[POS]: Development UI preview, separate from product employee skills.
[PROTOCOL]: Update this header and .folder.md when changed.
-->
# BOAI UI preview

Derived from [yetone/magpie](https://github.com/yetone/magpie/tree/396e0e463805dd5ded971ade37ded08a52512ae5/.github/ui-preview), MIT license preserved in LICENSE.

- `cursor.js`: upstream mouse trail/click/caption overlay.
- `record.mjs`: upstream DeepSeek planner, DOM outlines, actions, bounded operation repair, screenshots, conditional mp4 and leak detection. BOAI replaces page names, prompt context, TypeScript/TSX source discovery and Chromium app launch with real Electron. Chromium is only used to render the video poster.
- `publish.mjs`: upstream UI-path detection, PR-description block and ui-previews media publication; BOAI file paths and naming substituted; repositories without Pages link directly to the mp4.
- `app.ts`: BOAI Electron lifecycle/navigation; reuses existing isolated conversation and schedule fixtures. Demo model traffic uses the fixture, DeepSeek plans actions.
- `run.mjs`: builds the adapter, then invokes the recorder. Full application build remains an explicit preceding step.

`Test` uses BOAI's typecheck/lint/build/Vitest on its supported macOS runtime. CLI integration tests need the built dist/cli entry, so build precedes Vitest. It retains the existing Required checks name so branch protection need not change. `UI preview` retains detect/record/publish permission separation and PR event handling. Neither workflow compares or updates PNG baselines.

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

Regular UI PRs automatically get preview screenshots in their description and interactive changes get mp4. The `ui-previews` branch hosts media. If Pages is enabled, its video-player link is used; otherwise the poster links directly to the mp4. Screenshots use raw GitHub. Existing Pages configuration is kept.

The new pull_request_target workflow becomes automatic after it reaches main. Test can be exercised on the feature branch by workflow_dispatch; the recorder can be exercised locally using the command above. No automatic merge is performed by these workflows.
