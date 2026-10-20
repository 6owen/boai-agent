---
name: boai-scheduler
description: "Create and manage actual BOAI employee or group automation tasks, reminders and schedules. Preview the next trigger, preserve timezone, and verify durable receipts."
---
<!--
[INPUT]: Alma bundled scheduler/SKILL.md and current BOAI capability contracts.
[OUTPUT]: Executable BOAI workflow, preserving source intent and explicit differences.
[POS]: Bound product employee skill, not a developer tool or permission grant.
[PROTOCOL]: Update parent .folder.md and migration ledger on change.
-->

# Scheduler

Use for reminders, scheduled employee work and recurring tasks. BOAI business automation is separate from personality heartbeats, proactive contact, fatigue and travel.

## Workflow

1. Use `boai_catalog` for `automations`, then the exact operation to read its schema. Alternatively use `manage_automation` if that is the supplied tool; its live schema governs.
2. Discover the actual employee/group ID. Read existing plans before creating a likely duplicate. Resolve the date and IANA timezone from the runtime and the user's request; ask only for materially ambiguous details.
3. Use `automations.preview` to check the real next trigger. Read the actual schedule schema: BOAI supports the frequencies it returns, not Alma's arbitrary cron/every flags.
4. Create with `automations.create`, one stable requestId. A saved plan is not an executed task. Report its actual name, owner and next scheduled time.
5. For uncertain results use `boai_receipt` with the same request identity. Do not submit a replacement request to bypass unknown status.

## Operations

- `automations.list/get`: current saved plans and versions.
- `automations.update`: edit using the observed revision and preserve unrelated fields.
- `automations.pause/resume/delete`: change exactly the requested plan.
- `automations.run`: run now only if that is part of the user's instruction.
- `automations.history/occurrence`: inspect real executions and failures.
- `automations.stop`: stop the specific active occurrence; a plan ID is not an occurrence ID.

For an employee task, use the requested employee and conversation policy. For a group task, preserve actual members and dependency workflow. Do not invent a channel destination or imply external delivery from a BOAI-only plan. Existing CLI clients can use the same operations via `boai app describe/call/receipt`; discover the actual CLI invocation before shell use.

## Personality settings

A request to allow proactive conversation changes `employees.profile/configure` and its frequency/quiet hours. It does not create an employee automation task. Similarly, turning on emotion/growth/travel does not justify a duplicate cron plan. Use the corresponding self-management or travel skill.
