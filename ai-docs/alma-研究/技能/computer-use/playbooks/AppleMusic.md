<!--
[INPUT]: 安装包 resources/bundled-skills/computer-use/playbooks/AppleMusic.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->

# Music.app Playbook

Bundle id: `com.apple.Music`.

## Searching

Click the Search row in the sidebar, then `set_value` on the search text
field. The search submits automatically. If results don't appear, re-run
`get_app_state` — they may still be loading.

If the search field isn't visible, scroll the sidebar to the top. The
`filterField` (a search field shown when clicking `filterBtn`) is for
filtering the current view, not the whole library or Apple Music catalog.

To find a playlist, either perform a search (with "Your Library" selected in
search results) or scroll the sidebar down.

## Navigation

Scroll elements with their `Scroll Up` / `Scroll Down` AX actions, or
`alma cu scroll <ref> down --pages=N`. For speed, dispatch multiple scroll
calls in parallel.

After selecting a sidebar item, you may be drilled into a sub-view. Use the
`backBtn` to return to the root.

## Playback

- **Play a track**: double-click it (`alma cu click <ref> --clicks=2`).
- **Queue ("Playing Next")**: click the `More` button, then `Play Next` or
  `Play Last`. If `More` isn't available, `perform_secondary_action` (right
  click) on the track.
- **Play/pause toggle**: `alma cu press_key space --pid <music-pid>` after a
  click on any track has established focus.
