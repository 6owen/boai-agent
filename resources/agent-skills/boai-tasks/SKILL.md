---
name: boai-tasks
description: "Track multi-step work durably across Bobo conversations using actual tasks protocol operations. Record steps, progress, blockers and completion without starting duplicate work or automation."
---
<!--
[INPUT]: Alma bundled tasks/SKILL.md and current BOAI capability contracts.
[OUTPUT]: Five task states, existing assignment reuse, employee delivery and human acceptance; no run-lifecycle inference.
[POS]: Bound product employee skill, not a developer tool or permission grant.
[PROTOCOL]: Update parent .folder.md and migration ledger on change.
-->

# Tasks

Track complex work that spans several steps or turns, and recover its progress after a restart. The tracking record is separate from a BOAI execution Work and from scheduled automation. It does not run by itself.

## When to use

- Starting an authorized task with three or more meaningful steps.
- Continuing work across multiple turns or after a restart.
- The user asks what remains, what is blocked, or to update a tracked plan.

Do not create task records for greetings, simple answers or every tool call. Check existing records before adding a duplicate.

## Actual BOAI protocol

Read `boai_catalog` for domain `tasks`, then the exact operation's schema. Call with `boai_call`; writes require a stable requestId. Use `boai_receipt` for uncertain outcomes.

| Intent | Operation |
| --- | --- |
| List current work | `tasks.list` with the current employee ID; defaults to unfinished |
| Include finished work | `tasks.list` with includeDone true |
| Create tracking record | `tasks.create` with employee ID, concise title and ordered steps |
| Read current state | `tasks.get` with actual returned ID |
| Update progress | `tasks.update` with actual expectedRevision; each step has title and done |
| Submit delivery | `tasks.update` status in_review with the observed revision and an honest note |
| Record a blocker | Keep in_progress and update note with what is missing and the remaining work |
| Delete tracking record | `tasks.delete` with ID and expectedRevision, when requested |

Status values are exactly pending, in_progress, in_review, done, closed. blocked is not a valid status.

When the host supplies a current task ID, read it with tasks.get and update that same task. Never create a second progress record for an existing assignment. Requirements, later corrections and results stay in the task's conversation. Read the current revision before every write; after a conflict, reread and respect the user's latest state.

When advancing the task's own deliverable, set in_progress before doing the work. Submit the actual result in the conversation, then set in_review when the requested deliverable is ready for acceptance. Partial delivery, waiting for user input, waiting for approval and blockers stay in_progress; record the reason and remaining work in note and ask the needed question in the conversation. A progress question, discussion or acknowledgement that produces none of the task deliverable does not change status.

For assigned employee tasks, done and closed are user decisions: submit in_review for acceptance and let the user complete, close or reopen the task. A model run ending or a successful tracking update proves no external effect and is not task acceptance. Status changes do not start or stop execution. A failed or stopped execution may return unfinished work to pending; inspect its actual execution record before continuing.

## Persistence and boundaries

Tasks are stored in BOAI's SQLite through the application protocol. They remain available after restart, but restart does not launch execution or retry an unknown tool action. Query active tasks when resuming; do not tell the user you continued working in the background without an actual run.

Records belong to an employee. Restricted conversation sources remain restricted, and group-origin records do not become global personal context. Deleting a tracking record does not cancel a Work, remove artifacts or delete an automation plan. Use the corresponding real operation for those separate requests. Do not create `~/.config/alma/tasks.json` or another shadow task list.
