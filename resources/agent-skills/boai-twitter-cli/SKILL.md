---
name: boai-twitter-cli
description: "Use Twitter/X with the user’s logged-in account: search, read posts/profiles/timelines/bookmarks, and explicitly requested post/reply/quote/like/follow/delete actions. For one public post URL without login, prefer boai-twitter-media."
license: Apache-2.0
---
<!--
[INPUT]: Alma twitter-cli skill and wrapper; pinned upstream 0.8.5; BOAI bound directory and original command permissions.
[OUTPUT]: Original account workflow through the supplied CLI wrapper; no automatic login, external action or claim of platform success.
[POS]: Bundled employee skill; upstream source and original hashes in source-manifest.json.
[PROTOCOL]: Update this Header, owning .folder.md and migration record when changed.
-->

# Twitter / X CLI Skill

This bundled skill wraps the upstream `twitter-cli` project by `jackwener` (same author as the bundled `xiaohongshu-cli`).
Source reviewed from `https://github.com/jackwener/twitter-cli` at commit `7c634e0d396b1e7af9f63315b414925fe4f29ae7` (`2026-05-07`, version `0.8.5`).

## BOAI runtime

Read this bound skill with `read_skill`. Use its returned `directory` as `BOAI_SKILL_DIR`; the `files` manifest must include `scripts/twitter`. Never guess the working directory or use Alma's private installation. Run the script through the current `execute_command` tool (API employees) or native shell tool. A skill read alone uses ordinary chat; executing this CLI requires the original task/command permissions.

```bash
# Set this to the actual directory returned by read_skill, preserving shell quoting.
BOAI_SKILL_DIR='/actual/bound/skill/directory'
bash "$BOAI_SKILL_DIR/scripts/twitter" --version
bash "$BOAI_SKILL_DIR/scripts/twitter" --help
```

The wrapper uses a matching installed CLI or `uvx`/`uv tool run` with `twitter-cli==0.8.5`. The fallback downloads that pinned Python package into uv's cache on first use; it does not install uv or a global CLI. Without the dependency manager, report the concrete prerequisite. Do not substitute another executable or auto-upgrade during a task. Use Bash on macOS/Linux; other shells require an available Bash runtime.

Binding/reading this skill does not authenticate an account. For a request to inspect the integration, run only `--version`/`--help`; do not run `status`, extract cookies, log in or contact the social network. For an actual requested account workflow, use the authentication steps below and the user's selected account/browser. Keep credentials out of commands visible in chat and tool output.

Write actions operate on the real account. Perform only the specific action the user requested; research, drafting, skill installation and account setup do not authorize posting, reacting, following or deletion. Preserve the actual result ID. After an interrupted/unknown write, inspect the original result through reads before any retry; BOAI's command completion alone does not prove the platform accepted the action. Do not repeat a write under a new command to hide an uncertain outcome.

## Operating Rules

- Do not parallelize requests. The upstream client adds request jitter and rate-limit backoff for account safety; bursts get the account rate-limited.
- Always pass `--max` to bound list commands (default comes from `fetch.count`, up to 200).
- Prefer `--yaml` (or `--json` when a strict parser is needed). Non-TTY stdout already defaults to YAML.
- Prefer a full `x.com/.../status/<id>` URL or numeric id for `tweet`; `user-posts` / `user` take the handle without `@`.
- Treat cookies as secrets. Never ask the user to paste `auth_token` / `ct0` into chat.
- Write actions (post, reply, quote, delete, like, retweet, follow, bookmark) act on the user's real account: only run them when the user explicitly asked for that exact action.

## Authentication

X has no anonymous search, so this CLI uses the user's own logged-in browser session. Auth priority:

1. Environment variables `TWITTER_AUTH_TOKEN` + `TWITTER_CT0`
2. Browser cookies, auto-extracted from Arc / Chrome / Edge / Firefox / Brave

Check before longer workflows:

```bash
bash "$BOAI_SKILL_DIR/scripts/twitter" status --yaml
```

Notes:

- The user must be logged in to x.com in one of those browsers.
- On macOS the first extraction from a Chromium browser may show a Keychain prompt ("Chrome Safe Storage"). Tell the user to expect it and allow it; do not retry in a loop while it is pending.
- Pick a browser or profile explicitly when needed:

```bash
TWITTER_BROWSER=chrome bash "$BOAI_SKILL_DIR/scripts/twitter" status --yaml
TWITTER_CHROME_PROFILE="Profile 2" bash "$BOAI_SKILL_DIR/scripts/twitter" status --yaml
```

- Proxy: `bash "$BOAI_SKILL_DIR/scripts/twitter"` sets `TWITTER_PROXY` automatically when unset, from `HTTPS_PROXY` / `ALL_PROXY` / `HTTP_PROXY`, else from the enabled macOS system proxy (`scutil --proxy`, HTTPS then SOCKS). If x.com is still unreachable (DNS timeout, connection reset), ask the user for their proxy and pass it explicitly: `TWITTER_PROXY=http://127.0.0.1:7890 bash "$BOAI_SKILL_DIR/scripts/twitter" ...` (or `socks5://...`).

Common recovery paths:

- `not_authenticated`: ask the user to log in to x.com in their browser, then retry `status`
- `rate_limited`: wait a few minutes or lower `--max`
- `not_found`: wrong handle / id, or the tweet was deleted or is protected

## Command Guide

### Search

```bash
bash "$BOAI_SKILL_DIR/scripts/twitter" search "AI agent" --max 30 --yaml
bash "$BOAI_SKILL_DIR/scripts/twitter" search "AI agent" -t latest --max 50 --yaml       # top | latest | photos | videos
bash "$BOAI_SKILL_DIR/scripts/twitter" search "python" --from elonmusk --lang en --since 2026-01-01 --yaml
bash "$BOAI_SKILL_DIR/scripts/twitter" search "rust" --has links --min-likes 100 --yaml
bash "$BOAI_SKILL_DIR/scripts/twitter" search --from bbc --exclude retweets --exclude replies --yaml
bash "$BOAI_SKILL_DIR/scripts/twitter" search "机器学习" --until 2026-06-30 --min-retweets 20 --yaml
```

`--has`: `links | images | videos | media` (repeatable). `--exclude`: `retweets | replies | links` (repeatable).

### Read

```bash
bash "$BOAI_SKILL_DIR/scripts/twitter" tweet https://x.com/user/status/1234567890 --max 20 --yaml   # tweet + replies
bash "$BOAI_SKILL_DIR/scripts/twitter" show 2 --yaml                 # item #2 from the last feed/search output
bash "$BOAI_SKILL_DIR/scripts/twitter" article 1234567890 --markdown # X Article as Markdown
bash "$BOAI_SKILL_DIR/scripts/twitter" user elonmusk --yaml
bash "$BOAI_SKILL_DIR/scripts/twitter" user-posts elonmusk --max 20 --yaml
bash "$BOAI_SKILL_DIR/scripts/twitter" followers elonmusk --max 50 --yaml
bash "$BOAI_SKILL_DIR/scripts/twitter" following elonmusk --max 50 --yaml
bash "$BOAI_SKILL_DIR/scripts/twitter" feed -t following --max 30 --yaml   # for-you | following
bash "$BOAI_SKILL_DIR/scripts/twitter" bookmarks --max 30 --yaml
bash "$BOAI_SKILL_DIR/scripts/twitter" list 1539453138322673664 --yaml
```

### Write (only on explicit request)

```bash
bash "$BOAI_SKILL_DIR/scripts/twitter" post "Hello" --yaml
bash "$BOAI_SKILL_DIR/scripts/twitter" post "Gallery" -i a.png -i b.jpg
bash "$BOAI_SKILL_DIR/scripts/twitter" reply 1234567890 "Nice!"
bash "$BOAI_SKILL_DIR/scripts/twitter" quote 1234567890 "Look"
bash "$BOAI_SKILL_DIR/scripts/twitter" like 1234567890
bash "$BOAI_SKILL_DIR/scripts/twitter" retweet 1234567890
bash "$BOAI_SKILL_DIR/scripts/twitter" bookmark 1234567890
bash "$BOAI_SKILL_DIR/scripts/twitter" follow somehandle
bash "$BOAI_SKILL_DIR/scripts/twitter" delete 1234567890
```

Newlines in post text: use `printf`, e.g. `bash "$BOAI_SKILL_DIR/scripts/twitter" post "$(printf 'line one\n\nline two')"`.

## Structured Output

```yaml
ok: true
schema_version: "1"
data: ...
pagination:
  nextCursor: "optional-cursor"
```

Errors:

```yaml
ok: false
schema_version: "1"
error:
  code: not_authenticated
  message: ...
```

Error codes: `not_authenticated`, `not_found`, `invalid_input`, `rate_limited`, `api_error`.

## Recommended Flow

Search, then drill into the interesting tweets:

```bash
bash "$BOAI_SKILL_DIR/scripts/twitter" search "Alma app" -t latest --max 20 --json > /tmp/x-search.json
jq -r '.data[] | "\(.id)\t\(.author.screenName)\t\(.text[0:80])"' /tmp/x-search.json
bash "$BOAI_SKILL_DIR/scripts/twitter" tweet <id> --max 30 --yaml
```

When summarizing results, cite each tweet with its `https://x.com/<screenName>/status/<id>` link.

## Limitations

- No DM support
- `likes` only works for the logged-in account's own likes (X made likes private)
- One account session at a time
- Subject to X rate limits; large crawls are not appropriate
