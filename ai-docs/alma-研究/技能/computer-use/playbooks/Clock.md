<!--
[INPUT]: 安装包 resources/bundled-skills/computer-use/playbooks/Clock.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->

# Clock Playbook

Bundle id: `com.apple.clock`.

Four tabs: **World Clock**, **Alarm**, **Stopwatch**, **Timer**. Switch by
clicking the toolbar tab.

## World Clock — add a city

1. Click the toolbar tab `World Clock`.
2. Determine the existing clocks by reading the IDs of container elements
   with a single text child. **Ignore** the locations under the heading
   "world map" — that list is stale after removals.
3. If the desired city isn't listed, click the toolbar button described
   `Add a clock`.
4. In the sheet that appears:
   - `set_value` on the search text field.
   - Click the city row to add and close the sheet.

## Timer — start one

1. Click the toolbar tab `Timer`.
2. Read the current timer state from the Start/Stop button.
   - If **Running** or **Paused**: ask the user whether to cancel the
     existing timer first.
   - If **Stopped**: continue.
3. Convert the requested duration into three integers:
   - hours: 0–23
   - minutes: 0–59
   - seconds: 0–59
   Reject durations longer than 23:59:59 — Clock.app can't express them.
   Examples:
   - `90 seconds` → 0h 1m 30s
   - `3600 seconds` → 1h 0m 0s
4. Find the container with identifier `TimePicker`. It has three slider
   children: hour, minute, second. For **each**:
   - `click` to focus.
   - `type_text <2-digit value>`. **Do not** use `set_value` directly — the
     UI requires keystrokes. Max 2 digits; hour ≤ 23, others ≤ 59.
5. Click the button described `Start`.

## Stopwatch

1. Click the toolbar tab `Stopwatch`.
2. Read state from the Start/Stop button text.
   - `Stop`: stopwatch is **Running** — offer to stop or restart.
   - `Start`: stopwatch is **Stopped** — click Start.

## Alarm — create one

1. Click the toolbar tab `Alarm`.
2. Click the toolbar button described `Add an alarm`.
3. In the sheet:
   - `set_value` on the date-time area using the same format as its current
     value. Ignore the AM/PM radio — setting the date-time updates it.
   - Repeat days: seven toggle buttons labelled S M T W T F S. Click to
     enable/disable each day.
   - Other elements: label, sound, snooze toggle.
4. Click the `Save` button.
