---
name: boai-plan-mode
description: "Enter and exit persistent structured planning mode for this employee conversation before outlining a complex solution. Use for an explicit planning request; planning does not execute the task."
---
<!--
[INPUT]: Alma plan-mode skill and original enter/exit implementation; BOAI planning protocol.
[OUTPUT]: Scoped real mode transitions and structured planning using current runtime context.
[POS]: Employee workflow via the original application authority, distinct from task graphs and permissions.
[PROTOCOL]: Update Header, parent .folder.md and migration ledger on change.
-->

# Plan Mode

Use before outlining a complex multi-step solution, or when the user asks to plan or think through an approach. Simple questions and casual conversation do not need a mode switch.

## Enter

Use the supplied `boai_catalog` to discover domain `planning`, then the exact `planning.get` and `planning.enter` schemas. For your model tool call, read `planning.get` with an empty input object `{}`: the host resolves your current employee and conversation. Use the actual IDs in that result; never guess them or search unrelated chats for a substitute. A human using the owner CLI must instead supply explicit agentId and conversationId. Enter with the returned IDs, the returned `revision` as `expectedRevision`, and a stable write `requestId`. Do not choose a different conversation or employee to work around a rejected request.

A successful result has `active: true`, an actual `since` timestamp, and `revision`. Re-entering an active mode keeps its original start time. On an uncertain result, query the original receipt and current state before any new intent. Do not claim to enter just because you wrote the words "planning mode".

BOAI stores this mode per employee and conversation. It survives an app restart and appears in the next turn's runtime context. It is not Alma's process-global flag, a scheduled task, a dependency graph, or a filesystem permission setting. If application tools are unavailable, you can still discuss a plan, but do not claim the persistent mode changed.

## Outline

Keep the user's entire objective. Identify the actual outcome, constraints, dependencies and concrete verification. Split the work into useful, independently checkable steps. Make genuine unknowns explicit; do not pad a straightforward answer into a formal document or create files unless the task calls for them.

A plan request alone does not authorize carrying out the proposed business steps. Asking for a plan and asking to implement it are different intentions. Use normal conversational language; the mode's internal IDs and counters are not the answer.

## Exit and continue

When the plan is finalized, read `planning.get` and call `planning.exit` with the current revision and stable request ID. The result is `active: false` and `since: null`. Exit does not execute or mark any proposed step complete.

If the user wants to keep planning across turns, leave the mode active and continue the same conversation. If the user has authorized implementation, exit once the plan is ready and proceed through the actual execution tools within that authorization; do not add an unnecessary approval ritual. Use `boai-tasks` for durable task progress or `boai-todo` for an explicitly useful Markdown checklist. Those records are separate from mode state.
