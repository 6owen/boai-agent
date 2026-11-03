---
name: boai-scheduler
description: "Create and manage actual BOAI employee or group automation tasks, reminders and schedules. Preview the next trigger, preserve timezone, and verify durable receipts."
---
<!--
[INPUT]: Alma bundled scheduler/SKILL.md and current BOAI capability contracts.
[OUTPUT]: Executable BOAI workflow, preserving source intent and explicit differences.
[OUTPUT]: Public trigger contract, one-time reminders, trusted actor/time defaults and bounded original-receipt recovery.
[POS]: Bound product employee skill, not a developer tool or permission grant.
[PROTOCOL]: Update parent .folder.md and migration ledger on change.
-->

# Scheduler

Use for reminders, scheduled employee work and recurring tasks. BOAI business automation is separate from personality heartbeats, proactive contact, fatigue and travel.

## Workflow

1. Use `boai_catalog` for `automations`, then the exact operation to read its schema. Alternatively use `manage_automation` if that is the supplied tool; its live schema governs.
2. Use the trusted date/timezone and current employee in catalog context. employeeId defaults to this employee, including bobo; timezone defaults to the user's actual IANA timezone. Discover another employee only when the user requests one. Do not run shell date or list all employees merely to create an ordinary reminder.
3. Public create input uses instruction and trigger. One-time reminders use `{kind: "once", date: "YYYY-MM-DD", time: "HH:mm"}`. Ask for the time if it was not specified and no explicit prior default applies. Never guess a time, use manual as a future reminder, or emulate once by recurring daily/weekly and asking an Agent to delete the plan. Do not pass internal purpose, owner, conversationPolicy, employeeIds or cron fields.
4. Create with one stable requestId. An unambiguous request normally needs one write; `automations.preview` is optional. The returned normalized trigger, nextTriggerAt and activation are the evidence. succeeded means saved, activation=ready means activated; pending/failed must be reported honestly. Creating does not execute the task now.
5. For unknown/running or UNRESOLVED_WRITE, read the original boai_receipt by its receiptId. Do not submit replacement IDs, employees or times. If checks keep returning no new information, report the blocker and finish instead of repeatedly rediscovering schemas. Correct input only after a definite rejection.

## Operations

- `automations.list/get`: current saved plans and versions.
- `automations.update`: edit using the observed revision and preserve unrelated fields.
- `automations.pause/resume/delete`: change exactly the requested plan.
- `automations.run`: run now only if that is part of the user's instruction.
- `automations.history/occurrence`: inspect real executions and failures.
- `automations.stop`: stop the specific active occurrence; a plan ID is not an occurrence ID.

Use only the current catalog schema. Old group/monitor/fixed-conversation plans remain managed through their existing UI compatibility path; do not recreate or convert them merely to fit the new create shape. Do not invent a channel destination or imply external delivery from a BOAI-only plan. Existing CLI clients can discover and use the public operations through `boai app describe/call/receipt`.

## Personality settings

A request to allow proactive conversation changes `employees.profile/configure` and its frequency/quiet hours. It does not create an employee automation task. Similarly, turning on emotion/growth/travel does not justify a duplicate cron plan. Use the corresponding self-management or travel skill.
