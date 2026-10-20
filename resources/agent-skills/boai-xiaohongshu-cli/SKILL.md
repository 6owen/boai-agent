---
name: boai-xiaohongshu-cli
description: "Use Xiaohongshu/小红书/Rednote account workflows: search/read notes and comments, browse feed and notifications, login when requested, and explicitly requested posting, comments, reactions or follows."
license: Apache-2.0
---
<!--
[INPUT]: Alma xiaohongshu-cli skill and wrapper; pinned upstream 0.5.0; BOAI bound directory and original command permissions.
[OUTPUT]: Original account workflow through the supplied CLI wrapper; no automatic login, external action or claim of platform success.
[POS]: Bundled employee skill; upstream source and original hashes in source-manifest.json.
[PROTOCOL]: Update this Header, owning .folder.md and migration record when changed.
-->

# Xiaohongshu CLI Skill

This bundled skill wraps the upstream `xiaohongshu-cli` project by `jackwener`.
Source reviewed from `https://github.com/jackwener/xiaohongshu-cli` at commit `95b21d2062c72357fde4fd760c40f250de2d1551` (`2026-03-11`, version `0.5.0`).

## BOAI runtime

Read this bound skill with `read_skill`. Use its returned `directory` as `BOAI_SKILL_DIR`; the `files` manifest must include `scripts/xhs`. Never guess the working directory or use Alma's private installation. Run the script through the current `execute_command` tool (API employees) or native shell tool. A skill read alone uses ordinary chat; executing this CLI requires the original task/command permissions.

```bash
# Set this to the actual directory returned by read_skill, preserving shell quoting.
BOAI_SKILL_DIR='/actual/bound/skill/directory'
bash "$BOAI_SKILL_DIR/scripts/xhs" --version
bash "$BOAI_SKILL_DIR/scripts/xhs" --help
```

The wrapper uses a matching installed CLI or `uvx`/`uv tool run` with `xiaohongshu-cli==0.5.0`. The fallback downloads that pinned Python package into uv's cache on first use; it does not install uv or a global CLI. Without the dependency manager, report the concrete prerequisite. Do not substitute another executable or auto-upgrade during a task. Use Bash on macOS/Linux; other shells require an available Bash runtime.

Binding/reading this skill does not authenticate an account. For a request to inspect the integration, run only `--version`/`--help`; do not run `status`, extract cookies, log in or contact the social network. For an actual requested account workflow, use the authentication steps below and the user's selected account/browser. Keep credentials out of commands visible in chat and tool output.

Write actions operate on the real account. Perform only the specific action the user requested; research, drafting, skill installation and account setup do not authorize posting, reacting, following or deletion. Preserve the actual result ID. After an interrupted/unknown write, inspect the original result through reads before any retry; BOAI's command completion alone does not prove the platform accepted the action. Do not repeat a write under a new command to hide an uncertain outcome.

## Operating Rules

- Do not parallelize `xhs` requests. The upstream client adds jitter, captcha cooldowns, and retry logic for account safety.
- Prefer `--json` or `--yaml` when the result will be parsed. Non-TTY stdout already defaults to YAML.
- Prefer a full Xiaohongshu URL over a bare note ID when the user has one. `read` and `comments` can extract and cache the `xsec_token` from the URL.
- Treat cookies as secrets. Never ask the user to paste raw cookies into chat.

## Authentication Workflow

Always check auth before any write action, and before longer read workflows:

```bash
bash "$BOAI_SKILL_DIR/scripts/xhs" status --yaml
```

If authentication is missing or expired:

```bash
# Browser cookie extraction
bash "$BOAI_SKILL_DIR/scripts/xhs" login

# Optional: choose a browser explicitly
bash "$BOAI_SKILL_DIR/scripts/xhs" login --cookie-source arc

# QR login if browser cookie extraction is unavailable
bash "$BOAI_SKILL_DIR/scripts/xhs" login --qrcode
```

Verify after login:

```bash
bash "$BOAI_SKILL_DIR/scripts/xhs" whoami --yaml
```

Common recovery paths:

- `not_authenticated`: rerun `bash "$BOAI_SKILL_DIR/scripts/xhs" login`
- `verification_required`: ask the user to complete the captcha in a browser, then retry
- `ip_blocked`: suggest changing network, hotspot, or VPN

## Command Guide

### Read and Discover

```bash
bash "$BOAI_SKILL_DIR/scripts/xhs" search "美食" --sort popular --type video --json
bash "$BOAI_SKILL_DIR/scripts/xhs" read "<note_url_or_id>" --json
bash "$BOAI_SKILL_DIR/scripts/xhs" comments "<note_url_or_id>" --all --json
bash "$BOAI_SKILL_DIR/scripts/xhs" sub-comments <note_id> <comment_id> --json
bash "$BOAI_SKILL_DIR/scripts/xhs" user <user_id> --json
bash "$BOAI_SKILL_DIR/scripts/xhs" user-posts <user_id> --json
bash "$BOAI_SKILL_DIR/scripts/xhs" topics "旅行" --json
bash "$BOAI_SKILL_DIR/scripts/xhs" search-user "摄影" --json
bash "$BOAI_SKILL_DIR/scripts/xhs" feed --json
bash "$BOAI_SKILL_DIR/scripts/xhs" hot -c food --json
```

`hot` categories: `fashion`, `food`, `cosmetics`, `movie`, `career`, `love`, `home`, `gaming`, `travel`, `fitness`

### Interactions and Social

```bash
bash "$BOAI_SKILL_DIR/scripts/xhs" like <note_id_or_url>
bash "$BOAI_SKILL_DIR/scripts/xhs" like <note_id_or_url> --undo
bash "$BOAI_SKILL_DIR/scripts/xhs" favorite <note_id_or_url>
bash "$BOAI_SKILL_DIR/scripts/xhs" unfavorite <note_id_or_url>
bash "$BOAI_SKILL_DIR/scripts/xhs" comment <note_id_or_url> -c "好看"
bash "$BOAI_SKILL_DIR/scripts/xhs" reply <note_id_or_url> --comment-id <comment_id> -c "谢谢"
bash "$BOAI_SKILL_DIR/scripts/xhs" delete-comment <note_id> <comment_id>
bash "$BOAI_SKILL_DIR/scripts/xhs" follow <user_id>
bash "$BOAI_SKILL_DIR/scripts/xhs" unfollow <user_id>
bash "$BOAI_SKILL_DIR/scripts/xhs" favorites --json
bash "$BOAI_SKILL_DIR/scripts/xhs" favorites <user_id> --json
```

### Creator and Inbox

```bash
bash "$BOAI_SKILL_DIR/scripts/xhs" my-notes --json
bash "$BOAI_SKILL_DIR/scripts/xhs" post --title "标题" --body "正文" --images /path/to/a.jpg /path/to/b.jpg
bash "$BOAI_SKILL_DIR/scripts/xhs" delete <note_id> -y
```

**Newlines in post body**: Bash single-quoted strings do NOT interpret `\n`.
Use `printf` to produce real newlines:

```bash
BODY=$(printf '第一段落\n\n第二段落\n\n第三段落')
bash "$BOAI_SKILL_DIR/scripts/xhs" post --title "标题" --body "$BODY" --images /path/to/img.jpg
bash "$BOAI_SKILL_DIR/scripts/xhs" unread --json
bash "$BOAI_SKILL_DIR/scripts/xhs" notifications --type mentions --json
bash "$BOAI_SKILL_DIR/scripts/xhs" notifications --type likes --json
bash "$BOAI_SKILL_DIR/scripts/xhs" notifications --type connections --json
```

## Structured Output

Machine-readable output uses this envelope:

```yaml
ok: true
schema_version: "1"
data: ...
```

Errors use:

```yaml
ok: false
schema_version: "1"
error:
  code: not_authenticated
  message: ...
```

Common `error.code` values:

- `not_authenticated`
- `verification_required`
- `ip_blocked`
- `signature_error`
- `unsupported_operation`
- `api_error`

## Recommended Flows

Search and inspect; act only when separately requested:

```bash
NOTE_ID=$(bash "$BOAI_SKILL_DIR/scripts/xhs" search "露营" --json | jq -r '.data.items[0].id')
bash "$BOAI_SKILL_DIR/scripts/xhs" read "$NOTE_ID" --json
# Only if the user explicitly asked to like this note:
bash "$BOAI_SKILL_DIR/scripts/xhs" like "$NOTE_ID"
```

Use pasted URLs for richer analysis:

```bash
bash "$BOAI_SKILL_DIR/scripts/xhs" read "https://www.xiaohongshu.com/explore/xxx?xsec_token=yyy" --json
bash "$BOAI_SKILL_DIR/scripts/xhs" comments "https://www.xiaohongshu.com/explore/xxx?xsec_token=yyy" --all --json
```

## Limitations

- No DM support
- No live-stream features
- No following/followers list API
- No media download support in the upstream CLI
- One account session at a time
- Posting support is centered on image notes
