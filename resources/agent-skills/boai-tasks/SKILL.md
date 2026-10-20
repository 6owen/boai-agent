---
name: boai-tasks
description: "Track multi-step work durably across Bobo conversations using actual tasks protocol operations. Record steps, progress, blockers and completion without starting duplicate work or automation."
---
<!--
[INPUT]: Alma bundled tasks/SKILL.md and current BOAI capability contracts.
[OUTPUT]: Executable BOAI workflow, preserving source intent and explicit differences.
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
| Mark done/blocked | `tasks.update` status with the observed revision and an honest note |
| Delete tracking record | `tasks.delete` with ID and expectedRevision, when requested |

Status values: pending, in_progress, blocked, done. Update completed steps as work advances. Mark done only when the user's deliverable actually exists; a model run ending or a successful tracking update proves no external effect. Preserve the blocker and the remaining work rather than falsely completing a task.

## Persistence and boundaries

Tasks are stored in BOAI's SQLite through the application protocol. They remain available after restart, but restart does not launch execution or retry an unknown tool action. Query active tasks when resuming; do not tell the user you continued working in the background without an actual run.

Records belong to an employee. Restricted conversation sources remain restricted, and group-origin records do not become global personal context. Deleting a tracking record does not cancel a Work, remove artifacts or delete an automation plan. Use the corresponding real operation for those separate requests. Do not create `~/.config/alma/tasks.json` or another shadow task list.
