---
name: thread-management
description: Manage chat threads — create, list, rename, switch, delete, and search conversations. Use when users want to organize their chats.
allowed-tools:
  - Bash
---

<!--
[INPUT]: 安装包 resources/bundled-skills/thread-management/SKILL.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->


# Thread Management Skill

Manage Alma chat threads via the `alma` CLI.

## Commands

```bash
# List recent threads (default 20)
alma threads [limit]

# Show thread details
alma thread info <thread-id>

# Create a new thread
alma thread create <title> [--model providerId:modelName]

# Rename a thread (defaults to the current one, $ALMA_THREAD_ID)
alma thread rename <new title>
alma thread rename --thread <thread-id> <new title>

# Delete a thread
alma thread delete <thread-id>

# Read thread messages
alma thread messages <thread-id> [--limit 20]

# Switch current chat to a different thread
alma thread switch <thread-id>

# Search across threads (via API)
curl -s "http://localhost:23001/api/search/threads?q=QUERY&limit=10"
```

## Tips

- Use `alma threads` for a quick overview
- When the user asks to rename / retitle this conversation, run `alma thread rename <title>` — it updates the sidebar and phone at once
- Use `alma thread switch <id>` to switch the current Telegram/Discord chat to a different thread (the ALMA_THREAD_ID env is automatically set)
- When creating threads for the user, give them descriptive titles
- Always confirm before deleting threads
