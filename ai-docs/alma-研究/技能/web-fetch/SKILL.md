---
name: web-fetch
description: Fetch and read web pages, APIs, and online content. Use when users share URLs or ask about web content.
allowed-tools:
  - Bash
  - WebFetch
  - ChromeRelayNavigate
  - ChromeRelayRead
  - ChromeRelayReadDom
  - ChromeRelayListTabs
  - ChromeRelayClick
  - ChromeRelayScreenshot
  - ChromeRelayScroll
  - ChromeRelayEval
---

<!--
[INPUT]: 安装包 resources/bundled-skills/web-fetch/SKILL.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->


# Web Fetch Skill

Fetch web content using the best available method, in priority order:

## 1. WebFetch Tool (Primary — public pages)

```
WebFetch(url="https://example.com/article", prompt="Extract the main content")
```

- Renders pages in a hidden Electron window with JavaScript
- Good for public articles, docs, APIs, SPAs
- No login of its own

## 2. Sidebar browser (logged-in pages)

For pages behind a login (Twitter/X, GitHub, email, internal tools), read them through Alma's sidebar browser session, which keeps its cookies (and any the user imported from Chrome/Edge/Arc via the Preview toolbar's key button):

```bash
alma iab fetch "https://x.com/notifications"          # hidden, same logged-in session; doesn't disturb the user
alma iab goto "https://x.com/notifications"           # or open it visibly in the sidebar
alma iab read                                          # then read the visible page
```

If the page shows a login wall, ask the user to log in inside the sidebar browser or import their browser cookies — see the browser skill.

## 3. Chrome Relay (Last resort — the user's real Chrome)

Only when the sidebar browser can't get in (no login and the user can't import one), when the page is a tab the user already has open in Chrome, or when the user asks for their Chrome. It opens tabs in the user's own Chrome window, which interrupts them, so tell them why first.

```
# List open tabs
ChromeRelayListTabs()

# Navigate to a URL (opens in existing or new tab)
ChromeRelayNavigate(url="https://x.com/notifications", tabId=<id>)

# Read page content as clean text
ChromeRelayRead(tabId=<id>)

# Read page DOM structure
ChromeRelayReadDom(tabId=<id>)

# Take a screenshot
ChromeRelayScreenshot(tabId=<id>)

# Click elements
ChromeRelayClick(tabId=<id>, selector="button.load-more")

# Scroll the page
ChromeRelayScroll(tabId=<id>, direction="down")
```


## Tips

- **WebFetch first** for public pages; **sidebar browser** (`alma iab fetch` / `alma iab goto`) for logged-in pages.
- **Chrome Relay last.** It takes over the user's own Chrome; use it only when the sidebar browser can't get in or the user asks for it.
- For Twitter/X: WebFetch can't see authenticated content — use `alma iab fetch` (sidebar session) and fall back to Chrome Relay only if the sidebar isn't logged in and can't be.
