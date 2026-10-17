---
name: scheduler
description: Create, manage, and delete scheduled tasks (cron jobs) and configure heartbeat. Use when users ask for reminders, recurring tasks, daily summaries, periodic checks, or anything time-based. Also manages HEARTBEAT.md for periodic awareness checks.
allowed-tools:
  - Bash
  - Read
  - Write
---

<!--
[INPUT]: 安装包 resources/bundled-skills/scheduler/SKILL.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->


# Scheduler Skill

You can schedule tasks and manage periodic heartbeat checks.

## Cron Jobs (Scheduled Tasks)

Use the `alma cron` CLI to manage scheduled tasks.

```bash
# List all jobs
alma cron list

# Add a one-shot reminder (fires once, then remains disabled with run receipts)
# Format: alma cron add <name> <at|every|cron> <schedule> [--mode main|isolated] [--prompt "..."] [--deliver-to CHAT_ID]
alma cron add "Meeting reminder" at "20m" --mode main --prompt "Time for the meeting!"

# Add a recurring task with cron expression (defaults to your local IANA timezone)
alma cron add "AI news digest" cron "0 9 * * *" --mode isolated --prompt "Search and summarize today's most important AI news, concise and clear" --deliver-to CHAT_ID

# Override timezone explicitly when needed
alma cron add "NY close" cron "0 16 * * 1-5" --mode isolated --prompt "Summarize market close" --deliver-to CHAT_ID --timezone "America/New_York"

# Add an interval-based task
alma cron add "Check emails" every "2h" --mode isolated --prompt "Check for important emails" --deliver-to CHAT_ID

# Update an existing job (change prompt, schedule, deliver-to, timezone, etc.)
alma cron update <job-id> [--prompt "new prompt"] [--schedule "new schedule"] [--deliver-to CHAT_ID] [--name "new name"] [--timezone "Area/City"]

# Run a job immediately
alma cron run <job-id>

# View run history
alma cron history <job-id>

# Enable/disable
alma cron enable <job-id>
alma cron disable <job-id>

# Remove
alma cron remove <job-id>
```

### Command Format
`alma cron add <name> <type> <schedule> [options]`
- `<type>`: `at` (one-shot), `every` (interval), `cron` (cron expression)
- `<schedule>`: depends on type — "20m"/"2026-02-11T09:00:00+08:00" for at, "30m"/"2h" for every, "0 9 * * *" for cron
- `--mode main|isolated`: main injects into existing thread, isolated creates temp thread (default: isolated)
- `--prompt "..."`: the message/task for the AI to execute
- `--deliver-to CHAT_ID`: send the result to a Telegram chat. CHAT_ID is the Telegram chat/group id (numeric, groups are negative) — the value Alma passes as `ALMA_CHAT_ID` when a Telegram message triggered this turn. It is NOT an Alma thread id; `alma cron add` refuses a value that names an existing thread.
- `--delivery-platform telegram|discord`: the explicitly authorized external delivery channel. Existing jobs and omitted flags retain Telegram behavior. For an authorized Discord reminder, use `--delivery-platform discord --deliver-to CHANNEL_ID`; never infer the platform from a numeric ID or the availability of a bot. Changing platforms on an existing job requires checking its target too. A bot must acknowledge every result chunk before delivery is reported as successful.
- `--thread-id ID`: Alma thread to inject into (main mode only) — the `ALMA_THREAD_ID` of the current conversation
- `--model MODEL`: model override for this job
- `--timezone "Area/City"`: override the timezone for cron jobs; defaults to the local system timezone

## Heartbeat (Periodic Awareness)

Heartbeat is a periodic check-in where you "wake up" and look for things that need attention.

### Managing Heartbeat Config
```bash
alma heartbeat status           # Check if enabled and current config
alma heartbeat config           # Show current heartbeat config
alma heartbeat enable           # Enable heartbeat
alma heartbeat disable          # Disable heartbeat
alma heartbeat interval 30      # Set interval to 30 minutes
alma heartbeat patrol enable    # Enable group patrol
alma heartbeat patrol disable   # Disable group patrol
alma heartbeat patrol config    # Show patrol config
```

### Managing HEARTBEAT.md
The heartbeat reads `HEARTBEAT.md` from the workspace as your checklist. Edit it to change what you check on each heartbeat.

**File location:** `HEARTBEAT.md` in the active workspace root.

Example:
```markdown
# Heartbeat Checklist

- Check for unhandled important messages
- If the user hasn't interacted for over 4 hours, say hello
- Check the weather once every morning
```

If nothing needs attention, respond with `HEARTBEAT_OK` (this is suppressed, user won't see it).

## When to Use What

| User says | Action |
|-----------|--------|
| "Remind me about the meeting in 20 minutes" | `alma cron add "Meeting reminder" at "20m" --prompt "Time for the meeting!" --deliver-to CHAT_ID` |
| "Summarize AI news for me every morning at 9am" | `alma cron add "AI news" cron "0 9 * * *" --mode isolated --prompt "Search and summarize today's AI news" --deliver-to CHAT_ID` (defaults to local timezone; add `--timezone "Area/City"` to override) |
| "Check emails every hour" | `alma cron add "Check emails" every "1h" --mode isolated --prompt "Check emails" --deliver-to CHAT_ID` |
| "Stop sending me heartbeats" | `alma heartbeat disable` |
| "Also check the weather during heartbeats" | Edit HEARTBEAT.md, add weather check item |
| "Cancel that daily news task" | `alma cron list` → `alma cron remove <id>` |
| "Also @ me for update reminders" | `alma cron list` → `alma cron update <id> --prompt "new prompt with @user"` |
| "Change the reminder to once per hour" | `alma cron update <id> --schedule "1h"` |

## Important — deliver-to Target Selection (CRITICAL)
- `--deliver-to` determines WHERE the cron job result gets sent. Choose the RIGHT target:
  - If the task is about reminding/notifying a GROUP → use the GROUP's chatId (negative number like -1001886218691)
  - If the task is about reminding/notifying the USER personally → use the user's chatId
  - If the user says "remind in the group" / "send to the group" → deliver-to MUST be the group chatId, NOT the user's private chatId
  - If the user says "remind me" / "tell me" → deliver-to is the user's chatId
- Use `alma group list` to find group chatIds if needed
- For isolated tasks that should send results somewhere, ALWAYS include `--deliver-to`
- Cron expressions default to the local system timezone; use `--timezone "Area/City"` to override explicitly
- One-shot `at` jobs consume their schedule once, remain disabled, and retain actual run receipts. Do not remove a job after dispatch: removal cancels its running generation. Use `alma cron history <job-id>` to verify a new result or failure; runCount alone does not prove successful delivery or completion of the user's underlying work.

## Date References and Explicit Authorization

- An `@date` / `@本周` / `@下周一` reference is context, not authorization to create a reminder, calendar event, or external message. Only create after an explicit request.
- Use the reference's frozen absolute date range and IANA timezone, not the current date at a later turn. Ask for a time if none was supplied. For `at`, pass an absolute ISO instant including `Z` or the numeric offset, e.g. `2026-09-14T09:00:00+08:00`; `--timezone` does not convert a timezone-less ISO timestamp.
- For a reminder in the current Alma conversation, use `--mode main --thread-id "$ALMA_THREAD_ID"` and no `--deliver-to`. External delivery requires an explicitly authorized channel target.
- Report the actual created job ID, absolute due instant and target returned by the CLI. Do not claim creation from a suggested command, or claim an executed reminder proves the underlying task completed.
