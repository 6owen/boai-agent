---
name: browser
description: Browser automation for AI agents. Use when the user needs to interact with websites or test/verify a web app — navigating, filling forms, clicking buttons, extracting data, taking screenshots, responsive/mobile testing, or automating any browser task. The In-App Browser (iab) — Alma's sidebar browser the user watches — is the default for every page, public or local; PinchTab and Chrome Relay (the user's real Chrome) are fallbacks for when the sidebar browser cannot do the job.
allowed-tools:
  - Bash
  - Read
---

<!--
[INPUT]: 安装包 resources/bundled-skills/browser/SKILL.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->


# Browser Skill

Three engines, in priority order:

| Engine | When to Use | How |
|--------|-------------|-----|
| **In-App Browser (iab)** — **default** | Opening and operating ANY web page: public sites, logins, forms, scraping, localhost/private-LAN apps, generated HTML. It is Alma's sidebar browser, so the user watches you work without leaving Alma. | `alma iab` CLI (or the `BrowserOpen`/`Browser*` tools) |
| **PinchTab** — fallback | Only when the sidebar browser can't do the job: parallel isolated sessions, stealth against bot detection that blocks the sidebar browser, or no Alma window to show a sidebar | `pinchtab` CLI |
| **Chrome Relay** — last resort | Only for tabs the user already has open in Chrome, an explicit request to use their Chrome, or a login the sidebar browser lacks and cannot get | `alma browser` CLI |

**Always start with the In-App Browser.** When the user says "open X in the browser", or you decide a page needs a browser, use it — whether or not Chrome Relay is connected. Chrome Relay takes over the user's own Chrome: tabs appear in the window they are working in, and they are interrupted. PinchTab's Chrome runs outside Alma, where the user can't watch. Before falling back, tell the user in one sentence why the sidebar browser was not enough (e.g. "the sidebar browser isn't logged into Jira, so I'll use your Chrome").

**A login the sidebar browser doesn't have is not by itself a reason to switch.** First check whether the page is already logged in (the sidebar browser keeps its cookies across sessions). If not, the user can import their Chrome/Edge/Arc cookies with the key button in the Preview toolbar (see "Reuse a browser login" below), or log in right there in the sidebar. Fall back to Chrome Relay only if that is not possible or the user prefers it.

## In-App Browser (iab — Preview panel)

The in-app browser is the Electron `<webview>` in Alma's artifact Preview panel, driven directly via the Chrome DevTools Protocol. The user can watch (and take over) the same page. There is normally one Preview panel open; if more than one, pass `--workspace <id>` (get ids from `alma iab status`).

You don't need the panel open first: `alma iab goto <url>` (or the `BrowserOpen` tool) opens the sidebar browser with a tab of your own and loads the page there. If the user already has their own page open in the sidebar, you get a separate tab beside it; never load over the page they are reading. When the sidebar is closed, the page floats over the chat as a small picture-in-picture (desktop and phone alike) and a tap on it expands the sidebar browser — so opening a page is never disruptive, and it is the right way to put something in front of the user.

**Show your work.** When you build or change something the user can only judge in a browser — a web app on a dev server, an HTML page, a static or docs site, a Storybook, a chart — open the result with `alma iab goto <url>` as the last step (`alma preview start` from the artifact-sidebar skill serves a project or a plain HTML file and prints the URL). Do not hand the user a URL or tell them to open a tab, and never use the OS browser (`open …`) for it.

### Core workflow: Navigate → inspect → interact → re-check

```bash
alma iab status                       # Is an in-app browser open? what URL?
alma iab goto http://localhost:3000   # Navigate the Preview panel
alma iab read-dom                     # Snapshot interactive elements (role/name/box)
alma iab read                         # Visible text (url/title/text)
alma iab screenshot                   # Save viewport PNG to OS temp, print its path
```

Prefer `read-dom` and `read`; they are compact and work with text-only models. Take a screenshot only when visual layout or canvas content is necessary. The command saves a real PNG to the OS temporary directory by default. **Never redirect screenshot Base64 into the project and never create `.b64` screenshot files.** Use `--out <path>` only when the user explicitly needs a saved artifact; `--base64` is an advanced interoperability escape hatch and must not be used in an agent turn.

Only pass the resulting PNG to `Read` when the active model supports image input or Alma has a configured vision fallback. If image understanding is unavailable, do not screenshot/retry in a loop: continue through DOM/text inspection and state the visual limitation plainly. A navigation timeout or unreachable private host is a terminal observation for that attempt—report it instead of repeatedly reopening, screenshotting, or guessing what the page shows.

### Interact — prefer the Playwright-facade locators

`alma iab locator '<json>'` runs a Playwright-style locator chain + a terminal action against the real DOM. Shape: `{ "steps": [ {"m":"<locator>","args":[...]} ... ], "action": {"m":"<action>","args":[...]} }`.

Locators: `locator(css)`, `getByRole(role,{name,exact})`, `getByText(text,{exact})`, `getByLabel`, `getByPlaceholder`, `getByTestId`, plus refiners `first`, `last`, `nth(i)`, `filter({hasText})`, `visible`.
Actions: `click`, `dblclick`, `fill(text)`, `type(text)`, `press(key)`, `check`, `uncheck`, `selectOption(value)`, `textContent`, `innerText`, `getAttribute(name)`, `count`, `isVisible`, `isEnabled`, `boundingBox`, `waitFor({state,timeoutMs})`.

```bash
# Click the "Sign in" button
alma iab locator '{"steps":[{"m":"getByRole","args":["button",{"name":"Sign in"}]}],"action":{"m":"click"}}'

# Fill the email field by label, then submit
alma iab locator '{"steps":[{"m":"getByLabel","args":["Email"]}],"action":{"m":"fill","args":["a@b.com"]}}'
alma iab locator '{"steps":[{"m":"getByRole","args":["textbox",{"name":"Email"}]}],"action":{"m":"press","args":["Enter"]}}'

# Wait for a result, then read its text
alma iab locator '{"steps":[{"m":"getByText","args":["Welcome"]}],"action":{"m":"waitFor","args":[{"state":"visible","timeoutMs":8000}]}}'
alma iab locator '{"steps":[{"m":"locator","args":[".toast"]},{"m":"first"}],"action":{"m":"textContent"}}'
```

Quick convenience commands (CSS selector) when a full locator is overkill:

```bash
alma iab click "#submit"
alma iab type "input[name=q]" "hello" --enter
alma iab eval "document.title"
alma iab scroll down 600
```

### Responsive / mobile emulation

```bash
alma iab viewport 390 844 --mobile     # iPhone-ish: device metrics + touch
alma iab viewport 768 1024             # tablet (no touch)
alma iab viewport reset                # back to normal 1280x720
```

### Verify-after-change loop

When the user changes code for a local app without hot reload, reload before verifying:

```bash
alma iab reload
alma iab read-dom        # or screenshot — confirm the change rendered
```

### Files: upload, download, export

```bash
# Upload — set a file input's files directly (no OS file dialog)
alma iab upload 'input[type=file]' /abs/path/photo.png            # one or many files
alma iab upload '#avatar' /abs/a.png /abs/b.png

# Download a URL using the page's own (logged-in) cookies
alma iab download https://example.com/report.csv --out ~/Downloads/report.csv
alma iab download-media 'video'                                   # download an element's media (img/video/audio/a[href])

# Export the current page to a file
alma iab export pdf --out ~/Downloads/page.pdf                    # pdf | html | mhtml | md
alma iab export md                                                # -> ~/Downloads/<title>.md

# Export a Google Workspace doc (must be on a docs.google.com tab, logged in)
alma iab export-gsuite pdf                                        # docs: pdf|docx|odt|rtf|txt|html|epub|md
alma iab export-gsuite xlsx                                       # sheets: xlsx|ods|csv|tsv|pdf ; slides: pptx|odp|pdf|txt
```

Upload uses `DOM.setFileInputFiles`, so it works even when clicking the input would pop a native OS dialog we can't drive. File paths must be absolute.

### Background fetch (logged-in) — read pages without touching the Preview panel

`alma iab fetch` loads URLs in hidden windows on the **same logged-in session** as the Preview browser (so it carries cookies imported via the profile picker), extracts title + visible text, and prints JSON. Great for pulling several pages behind a login without disturbing what the user sees.

```bash
alma iab fetch https://app.example.com/orders https://app.example.com/invoices
alma iab fetch https://example.com/article --html            # include raw HTML too
```

### Browser environments (separate logins)

The user can create **environments** in the browser (like Firefox containers): each has its own cookies and storage, so the same site can be signed in to different accounts side by side. Tabs show their environment's color. Without `--env` you use the default environment (or, for `goto`, the environment of the tab you are driving).

```bash
alma iab envs                                          # list environments
alma iab goto https://github.com --env "Work"          # open in that environment (new tab if needed)
alma iab fetch https://app.example.com/me --env "Work" # background fetch with that environment's login
```

Only use `--env` when the user names an account/environment or the task needs a specific login. Never create or delete environments yourself; the user manages them from the browser's key menu.

### JavaScript dialogs (alert / confirm / prompt / beforeunload)

By default a page's `alert()`/`confirm()`/`prompt()` are not automatically answered. Arm dialog handling before an action that triggers one:

```bash
alma iab dialog watch --auto accept       # auto-accept every dialog (or --auto dismiss)
alma iab dialog watch                      # capture but hold each dialog for manual handling
alma iab dialog get                        # inspect the pending dialog {type,message,defaultPrompt}
alma iab dialog accept "prompt answer"     # accept (optionally supply prompt text)
alma iab dialog dismiss                    # cancel
alma iab dialog stop                       # stop capturing (dialogs behave natively again)
```

While watching without `--auto`, an unhandled dialog blocks the page until you `accept`/`dismiss` it.

### Clipboard

```bash
alma iab clipboard read                    # {text, hasImage, image_base64?}
alma iab clipboard write "text to paste"
```

### Coordinate (CUA) + dom_cua input — when CSS/locators aren't enough

Pixel-precise input via CDP, plus a node-id modality that clicks the center of a snapshotted element. Coordinates are viewport CSS pixels (match a `screenshot`).

```bash
# CUA: raw coordinate mouse/keyboard
alma iab cua click 320 210
alma iab cua double-click 320 210
alma iab cua move 100 100
alma iab cua scroll 400 300 0 600           # x y deltaX deltaY
alma iab cua type "hello"                    # types at the current focus
alma iab cua keypress Enter
alma iab cua keypress Control+c              # modifiers: control/ctrl/alt/shift/meta/cmd

# dom_cua: snapshot refs, then act by ref (clicks the element's box center)
alma iab get-visible-dom                     # -> [{ref:"e1", role, name, box:{x,y,w,h}}, ...]
alma iab dom-click e5
alma iab dom-type e3 "user@example.com"
```

Prefer the Playwright-facade locators for normal DOM work; reach for `cua`/`dom_cua` for canvas apps, drag interactions, or elements the locator engine can't target.

### Reuse a browser login (profiles) + browsing history

The Preview browser runs in a persistent session you can pre-load with a real browser's cookies (also available as a key button in the Preview toolbar). List profiles and read history:

```bash
alma iab profiles                            # Chrome/Edge/Brave/Arc… profiles on disk
alma iab history --limit 50                   # recent history from the default profile
alma iab history --source chrome --query github
```

Importing a profile's cookies is done from the Preview toolbar's key button (macOS asks for Keychain access once). After importing, `alma iab reload` so logins take effect.

### Picture-in-Picture — float the preview on top

Pop the in-app browser into a small always-on-top window (visible across Spaces and over full-screen apps) so the user can watch you drive the page while working in another app — no switching back to Alma. Same idea as Codex's Computer Use "Picture in Picture". Alma shows this PIP on its own whenever you open a page while the sidebar is closed (the phone app does the same over the chat); the commands below are for forcing it on or off.

```bash
alma iab pip show       # float an always-on-top mirror of the preview
alma iab pip hide
alma iab pip toggle
alma iab pip status
```

Also toggleable from the Preview toolbar (the picture-in-picture button). The mirror is view-only (it reflects navigations/clicks you drive via the other iab commands). It keeps updating even when Alma is in the background.

### Raw CDP (escape hatch)

```bash
alma iab cdp Page.getLayoutMetrics
alma iab cdp Emulation.setEmulatedMedia '{"media":"screen","features":[{"name":"prefers-color-scheme","value":"dark"}]}'
```

### Safety

The In-App Browser drives real pages, so follow the same confirmation rules as any browser action: confirm before submitting forms with external side effects, purchases, deletions, sending messages, or transmitting sensitive data. Local dev pages and read-only navigation do not need confirmation.

## PinchTab (Fallback Engine)

Use only when the In-App Browser can't do the job (see the table at the top).

PinchTab is a standalone HTTP server that controls Chrome via accessibility tree refs. 12MB Go binary, zero dependencies, token-efficient.

### Installation

```bash
# macOS / Linux
curl -fsSL https://pinchtab.com/install.sh | bash

# Or via npm
npm install -g pinchtab
```

### Setup

PinchTab server must be running. Start it in the background if needed:

```bash
# Check if already running, install if missing
which pinchtab || curl -fsSL https://pinchtab.com/install.sh | bash
curl -s http://localhost:9867/health 2>/dev/null || pinchtab &
```

### Core Workflow

Every PinchTab automation follows: Navigate → Snapshot → Interact → Re-snapshot

```bash
# 1. Navigate
pinchtab nav https://example.com

# 2. Get interactive elements (refs like e1, e2...)
pinchtab snap -i -c

# 3. Interact using refs
pinchtab click e5
pinchtab fill e3 "user@example.com"
pinchtab press e7 Enter

# 4. Re-snapshot after any page change
pinchtab snap -i
```

### Essential Commands

```bash
# Navigation
pinchtab nav <url>                    # Navigate to URL
pinchtab nav <url> --new              # Open in new tab

# Snapshot (get element refs)
pinchtab snap -i                      # Interactive elements only (recommended)
pinchtab snap -i -c                   # Include cursor-interactive elements
pinchtab snap                         # Full accessibility tree

# Interaction (use refs from snap)
pinchtab click e1                     # Click element
pinchtab fill e2 "text"               # Clear field and type
pinchtab type e2 "text"               # Type without clearing
pinchtab press e1 Enter               # Press key
pinchtab select e3 "option"           # Select dropdown option

# Text extraction (token-efficient ~800 tokens/page)
pinchtab text                         # Extract readable text

# Screenshots
pinchtab screenshot                   # Take screenshot (JPEG)
pinchtab screenshot --full            # Full page screenshot

# JavaScript
pinchtab eval 'document.title'        # Run JS in page context

# Tab management
pinchtab tabs                         # List tabs
pinchtab tab close <tabId>            # Close tab

# Multi-instance (parallel browsing)
pinchtab instances                    # List instances
pinchtab instances create --profile=work  # Create isolated instance
```

### Ref Lifecycle

Refs (e1, e2...) are invalidated when the page changes. ALWAYS re-snapshot after:
- Clicking links/buttons that navigate
- Form submissions
- Dynamic content loading (modals, dropdowns)

```bash
pinchtab click e5              # Navigates to new page
pinchtab snap -i               # MUST re-snapshot
pinchtab click e1              # Now use new refs
```

### Profile Persistence (Login Once, Reuse)

```bash
# Start with a named profile — cookies/sessions persist
pinchtab --profile myapp nav https://app.example.com/login
pinchtab snap -i
pinchtab fill e1 "user@example.com"
pinchtab fill e2 "password123"
pinchtab click e3

# Next time, the profile remembers the login
pinchtab --profile myapp nav https://app.example.com/dashboard
```

### Stealth Mode

PinchTab patches navigator.webdriver, spoofs UA, hides automation flags:

```bash
# Stealth is on by default, check status
pinchtab stealth-status
```

### Batch Actions

```bash
# Multiple actions in one call
pinchtab action --batch '[{"kind":"fill","ref":"e1","value":"user@example.com"},{"kind":"fill","ref":"e2","value":"pass123"},{"kind":"click","ref":"e3"}]'
```

## Chrome Relay (Last Resort — User's Real Browser)

Use only for tabs the user already has open in Chrome, an explicit request to use their Chrome, or a login the In-App Browser lacks and cannot get. It drives the user's own Chrome window, which interrupts them, so say why before you switch.

```bash
# Check connection
alma browser status

# List user's open tabs
alma browser tabs

# Read content from an existing tab
alma browser read <tabId>

# Interact with existing tabs
alma browser click <tabId> <cssSelector>
alma browser type <tabId> <cssSelector> "text" [--enter]
alma browser eval <tabId> "javascript code"
alma browser screenshot [tabId]
alma browser read-dom <tabId>          # List interactive elements
alma browser scroll <tabId> <up|down> [amount]
alma browser goto <tabId> <url>
alma browser open [url]                # New tab
alma browser back <tabId>
alma browser forward <tabId>
```

## Decision Guide

- Open a page, fill a form, click through a site, scrape, test an app? → In-App Browser (`alma iab`)
- Built or changed a web app / HTML page / site the user should look at? → `alma iab goto <url>` so it is in front of them (sidebar, or a floating PIP when the sidebar is closed)
- Need a page behind a login? → In-App Browser first (it may already be logged in; otherwise import cookies or log in in the sidebar) → Chrome Relay if that fails
- Need several logged-in pages read without disturbing the view? → `alma iab fetch`
- Need to read a tab the user already has open in Chrome, or the user says "use my Chrome"? → Chrome Relay
- Blocked by bot detection in the sidebar browser, or need parallel isolated sessions? → PinchTab
- Need token efficiency? → `alma iab read` / `read-dom` (text), not screenshots
