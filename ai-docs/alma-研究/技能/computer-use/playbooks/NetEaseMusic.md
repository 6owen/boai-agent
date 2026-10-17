<!--
[INPUT]: 安装包 resources/bundled-skills/computer-use/playbooks/NetEaseMusic.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->

# 网易云音乐 Playbook

Bundle id: `com.netease.163music` (may vary by version — check
`alma cu list_apps | grep -i netease`).

## Why this playbook exists

NetEase Cloud Music is a Qt-based app that exposes **no usable AX tree**.
`alma cu get_app_state com.netease.163music` returns `elements: []` but
still captures a window screenshot and the window's pixel bounds. Drive the
app entirely via pixel-coordinate clicks and keyboard shortcuts.

## Start-of-turn

```bash
alma cu get_app_state com.netease.163music
# Read the screenshot at the `screenshot.path` location.
```

The screenshot is your only visual anchor — it will include the exact
layout the user sees. All clicks should be pixel coordinates derived from
that image.

## Key pixel landmarks (approximate, default window size)

The app's layout:
- **Left sidebar**: `发现`, `私人FM`, `视频`, `朋友`, `直播` etc.
- **Top of sidebar, "推荐"** submenu: includes `个性化推荐`, `每日推荐`,
  `歌单`, `排行榜`, `歌手`, `最新音乐`.
- **Main content area**: playlist cards, featured albums.
- **Bottom bar**: play/pause, next, previous, lyric toggle, volume.

Always verify from the screenshot — positions shift with window resize and
theme / version updates.

## Play "今日推荐" / "每日推荐"

1. `alma cu get_app_state com.netease.163music`
2. Read the screenshot. Locate "每日推荐" in the sidebar.
3. `alma cu click --pixel <x> <y> --pid <netease-pid>` on it.
4. Re-`get_app_state`. The main area now shows the daily recommendation
   list.
5. Locate the play-all button (usually top-left of the track list) and
   click it by pixel. Or double-click the first track:
   `alma cu click --pixel <x> <y> --pid <pid> --clicks=2`.

## Play/pause, next, previous

These are in the bottom bar of the window. Once focus is on the app (click
anywhere neutral first), the media keys also work:
- `alma cu press_key space --pid <pid>` — play/pause
- `alma cu press_key right --pid <pid>` — next track (varies by version;
  may need the bottom-bar next button instead)

## Search

1. Locate the search field at the top of the window (usually a magnifier
   icon + text box).
2. `click --pixel` to focus it.
3. `type_text "<query>" --pid <pid>`.
4. `press_key Return --pid <pid>`.
5. Re-`get_app_state`; pick a result from the screenshot.

## Tips

- Some NetEase versions wrap a web view. If so, the `browser` skill may
  reach more — but only inside the embedded view, not the native chrome.
  Stick with pixel clicks for the native window.
- After a resize, re-take `get_app_state` — all cached pixel positions are
  invalid.
- Coords passed to `click --pixel` are interpreted as **screenshot
  pixels** (not raw screen points), and the daemon translates them via
  the mapping from the latest `get_app_state` for the same pid. Always
  snap right before clicking. The screenshot is downsampled to 1280px
  wide by default, so on Retina + wide displays "screenshot pixel" and
  "display point" are not interchangeable — read coords from the
  returned image and trust the daemon to translate.
