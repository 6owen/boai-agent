---
name: boai-agent-desktop
description: "操作电脑、原生桌面应用和窗口：通过 Agent Desktop 观察界面、点击控件、输入文本、操作菜单、滚动和截图。Use for computer use and desktop app interaction; check plugin availability and current permissions first."
---
<!--
[INPUT]: BOAI desktop plugin bridge and the pinned agent-desktop package's own desktop/platform skills.
[OUTPUT]: Desktop task selection, progressive upstream documentation loading and verified actions.
[POS]: Plugin-owned BOAI workflow, available while Agent Desktop is enabled; no employee binding copy.
[PROTOCOL]: Update Header, parent .folder.md and the plugin integration specification on change.
-->

# BOAI Agent Desktop

Use this skill when the user asks to operate desktop applications, windows, menus, controls or desktop screenshots. For website content, forms and page navigation, use the actual BOAI browser tools and their relevant skill. Use Agent Desktop for a browser application's native window or system dialog when the task requires it.

## Discover and prepare

1. Call `inspect_desktop_plugin` to discover the current BOAI bridge, settings and input schema.
2. Read the installed version's own documentation through `call_desktop_plugin`:
   - `{ "command": "skills", "args": ["get", "desktop"] }`
   - `{ "command": "skills", "args": ["get", "platform"] }`
3. Call `{ "command": "status" }` through the same bridge. Report actual unavailable permissions or dependencies. Do not claim desktop control based only on reading this skill or a successful status check.

Read upstream command help as needed. BOAI passes each command and its arguments as an array, never a shell command. This skill deliberately leaves OS-specific command syntax to the matching upstream documentation.

## Observe, act, verify

Find the requested application/window and take a fresh snapshot before interaction. Use actual qualified refs from this employee conversation. Follow the upstream skill to perform the requested action, then take a fresh snapshot or inspect the resulting state. An action returning successfully does not prove the user's intended result appeared.

Prefer background accessibility actions. Physical input and foreground operation require the owner's separate headed setting and the existing employee permission/approval flow. This skill grants no tool, filesystem or OS permission. Do not change those permissions to work around a refusal. Multiple employees still share the same physical desktop.

Screenshots returned by the bridge are real image parts. Inspect them with available visual input; text-only output is not evidence of seeing the screen. Use the existing artifact delivery tools if the user requested an image file attachment.

## Interrupted or unavailable calls

Read the actual error disposition. An unknown result may already have taken effect: observe the current app before deciding what to do next. Do not automatically replay a cancelled or uncertain action, switch providers to repeat it, or revive the retired computer-use MCP.

If the plugin is disabled or unavailable, report that state. This guide is supplied by the enabled plugin and does not need to be installed or permanently bound to an employee.
