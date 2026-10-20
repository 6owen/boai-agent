---
name: boai-todo
description: "Maintain a conversation-specific Markdown todo file in the authorized workspace. Use for requested checklist files or concrete multi-step file work; track one in-progress step and preserve the full list."
---
<!--
[INPUT]: Alma todo file workflow and BOAI employee-session workspace file tools.
[OUTPUT]: Persistent Markdown checklist with real read/write verification and exact conversation identity.
[POS]: File-based task notes; distinct from tasks protocol records, execution Work and automation.
[PROTOCOL]: Update Header, parent .folder.md and migration ledger on change.
-->

# Todo

Use a Markdown checklist for complex work with three or more steps, or when the user explicitly asks for such a file. Do not create one for casual chat, a simple question or an ordinary two-step action. If the request is to register a task in BOAI's task tracking system, use `boai-tasks`; don't silently create both records.

## File location

API file tools: `self:/work/.boai/todos-<CONVERSATION_ID>.md`, using the actual current conversation ID supplied by the host. `self:/work/` persists across runs within this employee conversation. Do not use a per-run output directory for the continuing list, and do not write `shared:/` (it is read-only).

For native tools, use the actual session `workPath` supplied by the runtime and the same `.boai/todos-<CONVERSATION_ID>.md` suffix. Do not invent a thread ID, scan another employee's home, or use a global `.alma/todos.md`. Different employee sessions and conversations keep different lists. If the user explicitly chose another authorized project filename, use that exact file instead.

## Format

```markdown
# Todos

- [x] Inspect current configuration
- [ ] ~Implement the agreed change~ *(in progress)*
- [ ] Verify the resulting behavior
- [ ] Update documentation
```

- `- [ ]`: pending.
- `- [ ] ~Step~ *(in progress)*`: currently working; at most one at a time.
- `- [x]`: actually completed, or explicitly reported completed by the user.

## Read, change, verify

1. Find and read the actual file before a change. Create it if absent; preserve existing content when it exists. Use the supplied `list_files`, `read_file`, `edit_file`, `write_file` or native equivalents and their real schemas. Parent creation follows the existing file tool, not a separate unrestricted shell authority.
2. Preserve the full list. Update only the intended steps, retain already completed items and append newly requested tasks at the bottom. Mark a completed step promptly after its evidence exists. Do not mark a step done just because a model run ended, another step finished, or a reminder fired.
3. For replacement, complete the current read and use the host's stale-write protection. If the file changed, read it again; do not overwrite a newer version. For a unique local change, prefer the existing precise edit tool.
4. Read back the result, check the one-in-progress rule and intended changes. For a user-requested file deliverable, publish the real file through `boai-send-file`; changing the source alone is not a delivered attachment.

The file is a progress record. It does not run tasks, create schedules, cancel Work or prove external completion. Report a blocked step honestly, retain the unfinished work, and do not add a background process just to keep the list moving. Clearing a chat follows BOAI's normal workspace lifecycle; this file is not a private memory database.
