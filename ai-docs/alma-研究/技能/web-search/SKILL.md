---
name: web-search
description: Search the web for information using the built-in WebSearch tool. Use when users ask questions requiring up-to-date information, research, or fact-checking.
allowed-tools:
  - Bash
  - WebSearch
  - WebFetch
---

<!--
[INPUT]: 安装包 resources/bundled-skills/web-search/SKILL.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->


# Web Search Skill

Search the web using the **built-in WebSearch tool**. It uses Electron's BrowserWindow to perform searches, handling JavaScript-rendered search results and bypassing basic anti-bot measures. This is NOT a simple HTTP request — it opens the page in a real browser window, performs the search, and extracts results from the rendered page.

## WebSearch Tool (Primary)

```
WebSearch(query="your search query", max_results=5)
```

- Supports multiple search engines (Google, Bing, DuckDuckGo, etc.)
- Handles JavaScript-rendered pages
- Returns structured results with title, URL, snippet, and markdown content
- Automatic CAPTCHA detection and user notification

## Fetching Page Content

After finding URLs from search, use the **WebFetch** tool to get the actual page content:

```
WebFetch(url="https://example.com/article", prompt="Extract the main content")
```

- Renders pages in a real browser with full JavaScript execution
- Handles SPAs, dynamic content, and anti-bot protections
- Returns clean markdown

## Browser Skill (Fallback)

If WebSearch or WebFetch fail (e.g., page requires login, CAPTCHA, or multi-step navigation), fall back to the Browser Skill:

```bash
# Open the URL in Alma's sidebar browser (the user watches; keeps its logins)
alma iab goto "https://example.com"

# Read the page content
alma iab read
```

The sidebar browser is the default. Only if it can't get in (e.g. a login it lacks and the user can't provide) fall back to Chrome Relay (`alma browser open` / `alma browser read <tabId>`), which drives the user's real Chrome and interrupts them.

## Tips

- For complex queries, try multiple search approaches
- Always summarize findings for the user rather than dumping raw results
- For freshness queries (`today`, `latest`, `今天`, `最新`), use the **current year** from runtime context instead of hardcoding a fixed year
- Use `max_results` to control the number of search results returned

## Examples

**"Latest AI news":**
```
WebSearch(query="latest AI news <current_year>", max_results=5)
```

**"Python 3.13 new features":**
```
WebSearch(query="python 3.13 new features", max_results=5)
```

**Fetch a specific article after search:**
```
WebFetch(url="https://docs.python.org/3.13/whatsnew/3.13.html", prompt="Summarize the new features")
```
