<!--
[INPUT]: 安装包 resources/bundled-skills/computer-use/playbooks/Spotify.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->

# Spotify Playbook

Bundle id: `com.spotify.client`.

## Playback

Spotify doesn't immediately update UI state after a playback click. Rather
than re-dispatching the action, re-run `get_app_state` first — it often took
effect already. Don't sleep; just re-check on the next turn.

## Searching

Make sure the search field is focused before `press_key Return`. Pressing
Return without the search field focused may toggle playback instead.

## General navigation

Spotify is not fully local. After a search or navigation, the "no results"
state may flash momentarily while the network resolves. Re-run
`get_app_state` before changing course.

Spotify is Electron — the first `get_app_state` call enables
`AXEnhancedUserInterface` / `AXManualAccessibility`; the second call usually
returns a fuller tree.

## Link rewrites

Use canonical `open.spotify.com/...` URLs, not `xpui.app.spotify.com/...`.
Only use links verbatim from the UI. IDs are valid only with their type —
don't turn an "album" URL into a "track" URL.
