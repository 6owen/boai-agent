---
name: artifact-sidebar
description: Drive Alma's Artifact Sidebar (the right-hand panel showing the current thread's workspace) as an agent. Use when you need to run/read the sidebar Terminal, bring up the live Preview of a web app you're building, open what you built in the sidebar browser so the user can review it, or inspect/operate that Preview browser. The sidebar mirrors the thread's working directory, so the user watches everything you do live. Commands route to the current thread automatically via $ALMA_THREAD_ID.
allowed-tools:
  - Bash
  - Read
---

<!--
[INPUT]: 安装包 resources/bundled-skills/artifact-sidebar/SKILL.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->


# Artifact Sidebar Skill

The Artifact Sidebar (right side of the app) is a live view of **this thread's workspace** — the same directory you write files into. It has tabs: **Files, Changes, Commit, Terminal, Preview, Tools**. It is fully drivable from the CLI, so you can operate it the way the user would, and they see it happen live.

All commands below target the current thread's workspace automatically via `$ALMA_THREAD_ID` (already set in your shell). Override with `--thread <id>`, `--workspace <id>`, or `--session <id>` when needed.

## Terminal — run & read the shared shell

`alma terminal` runs in (and reads) the sidebar's Terminal — the **same** terminal session the user sees, in the workspace directory. Use it when you want a command's effect to be visible to the user, to share shell state (cwd, env, a running dev server) across commands, or to read what's currently on screen.

```bash
alma terminal exec "npm install"          # run a command, wait, print its output; exits with the command's code
alma terminal exec "npm run build"        # compound commands work: exec "a && b || c"
alma terminal read                        # print the terminal scrollback (what the user is looking at)
alma terminal write $'\n'                 # send raw keystrokes (answer a prompt, send Enter/Ctrl-C)
alma terminal list                        # list sessions
alma terminal create --name agent         # make a new session (optional; exec auto-creates/reuses one)
```

- `exec` brackets your command so it returns **clean output + the real exit code** — check `$?` after it like any shell command.
- `exec` blocks until the command finishes (default 2-min cap; `--timeout <ms>` to change). For long-running/interactive processes (a dev server, a REPL), start them with `alma terminal write` and poll with `alma terminal read` instead.
- It's a real interactive shell: `cd`, exported vars, and background jobs persist between `exec` calls in the same session.

For one-off, non-visible commands, just use the normal `Bash` tool. Reach for `alma terminal` when the user benefits from seeing it, or when you need the sidebar shell's persistent state.

### Remote hosts (SSH) — which surface is which

To log into an `@host` for the user, create/reuse a sidebar Terminal and type the ssh command into it (`alma terminal create` then `alma terminal write 'ssh <target>\n'`, or just `alma terminal exec`). The dock switches to the Terminal tab automatically so the user SEES the session.

**Report the surface you actually used, and only that.** Creating a sidebar Terminal with an SSH session is NOT the same as opening Settings → Remote Hosts (the host management page) — never claim one when you did the other. If the user asked to *view or configure* the host rather than log in, point them at the host's `@` page (write `[hostname](alma://host/<id>)` in your reply) — it has buttons for both surfaces — or open Settings → Remote Hosts. Distinguish "the action ran" from "the goal surface the user asked for is open".

## Preview — bring up the live web preview

`alma preview` controls the Preview server for a web app/site in the workspace; `alma iab` then drives the rendered page.

```bash
alma preview detect                       # what kind of project is this? (vite / static / …)
alma preview start                        # start the dev/static server; prints the URL + status
alma preview status                       # status + URL
alma preview stop
```

After `alma preview start`, the Preview tab shows the app. **Open it for the user yourself** with `alma iab goto <url>` (the URL `alma preview start`/`status` printed) once it is ready to look at — don't just tell them to go and find the Preview tab. If their sidebar is closed, Alma floats the page as a small picture-in-picture over the chat (on the desktop and on the phone alike) and a tap on it expands the sidebar browser; if the sidebar is open, the Browser tab shows it. Then inspect/operate the page with the browser skill's in-app browser:

```bash
alma iab read-dom                         # interactive elements in the preview
alma iab read                             # visible text
alma iab eval "document.title"            # read data out of the running app
alma iab click <selector> / type ...      # operate the preview browser
alma iab screenshot                       # save visible viewport PNG to OS temp, print path
```

See the **browser** skill for the full `alma iab` reference (it's the same Preview `<webview>`, driven over CDP).

## Typical loop: build → preview → verify

```bash
# (write files into the workspace with Write/Edit as usual)
alma terminal exec "npm install && npm run build"   # build, see it in the sidebar terminal
alma preview start                                   # bring the app up; prints the URL
alma iab goto http://localhost:<port>                # open it for the user (sidebar, or a floating PIP when the sidebar is closed)
alma iab read-dom                                    # verify the UI rendered
alma iab eval "window.__APP_STATE__"                 # read runtime state to confirm behavior
```

This keeps everything inside the sidebar the user is already looking at — terminal output, the running preview, and your interactions with it — instead of happening invisibly.

## Show the result — anything the user can only judge in a browser

Whenever the thing you built or changed can only be reviewed in a browser — a web app on a dev server, an `index.html`, a static site, a docs site, a Storybook, a chart or dashboard page — open it in the sidebar browser as the last step, so the user reviews the result where they are instead of hunting for a URL:

```bash
alma preview start                        # for a project or a plain HTML file (serves it, prints the URL)
alma iab goto http://localhost:<port>/    # open the running page for the user
alma iab goto http://localhost:5173/      # or a dev server you started in the sidebar terminal
```

Rules: open it once it actually renders (check with `alma iab read-dom`), reopen/`alma iab reload` after a change the user asked to see, and never use the OS browser (`open …`, `xdg-open`) for this — the page belongs in Alma's sidebar, where the picture-in-picture rule above applies when the sidebar is closed. Mention in one line that it is open in the sidebar (or floating as a PIP).
