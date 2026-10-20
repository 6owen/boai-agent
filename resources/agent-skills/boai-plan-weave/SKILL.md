---
name: boai-plan-weave
description: "Run long multi-step work as a persistent task graph with dependencies, claim packets, implementation reports, review gates and prioritized rework. Recover the same plan across turns or restarts through BOAI plans.* operations."
---
<!--
[INPUT]: Alma bundled plan-weave/SKILL.md, readable implementation and BOAI application protocol.
[OUTPUT]: Persistent claim/execute/report/review/rework workflow using actual scoped plans operations.
[POS]: Bound product skill; a plan coordinates work, never creates permission or an automatic execution loop.
[PROTOCOL]: Update parent map and migration ledger when changed.
-->

# Plan Weave

Run long, multi-step work as a persistent task graph instead of an ad-hoc todo list. Keep the goal, dependency graph, reports and review feedback together so you can recover after a restart. The core loop is **claim → execute → submit → repeat**, with review gates that send work back through feedback and rework.

## When to use

- Work spanning many steps or turns, such as migrations, features or audits where losing progress matters.
- Work that benefits from explicit review gates before downstream steps begin.
- The user asks for a dependency plan, durable staged execution, review or recovery.

For a short checklist use boai-tasks or boai-todo. For discussing an approach without execution use boai-plan-mode. Do not force a heavy plan onto a simple question.

## BOAI protocol and scope

Discover `boai_catalog` domain `plans`, then the exact operation's schema. Use `boai_call`; every write has a stable `requestId`. An interrupted write is recovered with `boai_receipt` and a fresh read, never by changing the request ID to retry an unknown effect.

The plan belongs to one **employee and conversation**. There is one unarchived plan per such scope. Employee calls to `plans.list` and `plans.set` can omit agentId/conversationId: the host supplies the current identities. Owner CLI calls must supply both. Use actual returned plan `id` and `revision`, never guess identities. `itemId` identifies the claimed block or feedback; it is NOT the plan ID. All updates require `expectedRevision`. A claim returns a `token`; pass it as `claimToken` to submit/review/resolve.

This is the same application protocol used by API, authorized native employees and the CLI:

```text
boai app catalog plans --json
boai app call plans.list '{"agentId":"ACTUAL_EMPLOYEE_ID","conversationId":"ACTUAL_CONVERSATION_ID"}' --json
```

Use the CLI already supplied by the host; discover its actual syntax if needed. Do not use owner credentials to bypass an employee scope. The current Bobo host exposes these management operations. Merely installing this skill on another employee does not grant application management access; check actual tool availability.

## 1. Author the plan

Call `plans.list` before adding a plan; resume the existing one when it matches the request. `plans.set` validates the manifest and saves it without starting work. It never overwrites another active plan. Archive an existing plan only when the user's requested change calls for replacing or archiving it.

Example manifest (adapt the content to the actual goal):

```json
{
  "title": "Verify a change",
  "goal": "The requested behavior works and its evidence is reviewed",
  "tasks": [
    {
      "id": "T1",
      "title": "Implement and verify",
      "acceptance": ["The requested behavior runs through the actual consumer"],
      "blocks": [
        {"id":"B1","type":"implementation","title":"Implement","instructions":"Make the scoped change and verify the actual behavior."},
        {"id":"R1","type":"review","title":"Review","instructions":"Check acceptance and evidence; do not fix the work here.","deps":["B1"],"maxReviewCycles":3}
      ]
    },
    {
      "id": "T2",
      "title": "Deliver",
      "deps": ["T1"],
      "acceptance": ["Deliver the result and disclose any unapproved review"],
      "blocks": [{"id":"B1","type":"implementation","title":"Summarize","instructions":"Deliver the actual result with verification and remaining limitations."}]
    }
  ]
}
```

Pass that object as `manifest` in `plans.set`.

- **Tasks** are units of independently verifiable value. Task `deps` reference task IDs; every block of an upstream task must finish before its downstream task opens. Give each task concrete acceptance criteria.
- **Blocks** are claimable units within a task. Block `deps` reference block IDs in the SAME task. `implementation` does work and submits a report. `review` must depend on the implementation blocks it judges.
- Refs are `taskId:blockId`, such as `T1:B1`. IDs use letters, digits, hyphens and underscores. Cycles, duplicate/unknown dependencies and empty review gates are rejected.
- `maxReviewCycles` defaults to 3 and bounds rejected reviews. Any `agent` label is advisory context, not delegation, identity switching or authority.

Think before registering:

- Split by data flow, contract or independently verifiable acceptance; merge tiny steps that cannot be verified on their own.
- Map every key requirement to a task, block or acceptance item.
- Make instructions scoped and verifiable. Preserve important constraints.
- Put reviews after changes where plausible-but-wrong results are likely.
- Model actual dependencies. Do not fake parallelism between coupled work.
- Reject fake completion: a schema with no runtime consumer, an API with no caller, unused configuration or fixture-only evidence.

## 2. Execute the loop

Call `plans.claim` with the plan ID and observed revision. It returns ONE packet containing goal, task, acceptance, instructions, upstream report excerpts, token and `nextOperation`. When an item is already claimed, a fresh claim returns that same item without advancing the plan. Use the new revision returned by each write.

**Implementation:** do the authorized work through actual available tools. Verify it, then `plans.submit` with id, expectedRevision, claimToken, ref and report. Report what changed, observed verification, failures, skipped checks and remaining risks. A report does not publish a file, mark a BOAI Work delivered or prove an external effect; use those existing tools where required.

**Review:** read the report AND actual outputs/changes. Use `plans.show` for full reports when packet excerpts are marked truncated. Check acceptance, producer/consumer contracts and live behavior. Judge without quietly fixing. Call `plans.review` with id, expectedRevision, claimToken, ref, verdict (`passed` or `needs_changes`) and evidence in `notes`.

`needs_changes` opens a feedback item that takes priority over other work. The next `plans.claim` returns a feedback packet. Fix the scoped problems, verify, then `plans.resolve` with id, expectedRevision, claimToken and report. The review gate reopens; claim it and review again. The feedback report stays linked to that review.

After `maxReviewCycles` rejections the gate closes as **max_cycles**, and downstream steps can proceed as in Alma. This is NOT a pass. A finished plan containing these gates has status `completed_with_unapproved_reviews`; disclose the actual rejected criteria in the result. Never convert exhaustion into a successful verification claim.

Continue until no claimable item remains, the task requires user input, or the user asks to pause. Follow the current request; creating a plan alone does not authorize executing it. A claim does not start a model, schedule or background worker.

## 3. Inspect and recover

| Intent | Operation |
| --- | --- |
| Current/archived plans | `plans.list`, optionally includeArchived |
| Graph, revisions, current claim and progress | `plans.get` |
| Full implementation/review/rework reports | `plans.show` with plan ID and ref |
| External blocker | `plans.block` with revision, ref and concrete reason |
| Remove resolved blocker | `plans.unblock`; old claim tokens stay invalid |
| Restart from same manifest | `plans.reset`, only when requested; clears reports and claims |
| Retain a read-only finished/abandoned plan | `plans.archive` |
| Delete a requested plan and reports | `plans.delete` |

After interruption or restart, read the existing plan and receipt, then resume its claim. Check actual files/tool receipts before repeating any business side effect that may already have happened. `plans.claim` idempotency concerns the claim only, not the external work.

## Rules and adaptation

- One claimed item at a time. Never submit for an unclaimed, different or stale item.
- Reports are the durable record; keep failures and skipped validation. Review verdicts are submitted judgments, not automatically independent judgments.
- Reviews judge; implementation and feedback do repairs. Use real supported delegation only if explicitly available and authorized; a suggested agent string spawns nothing.
- Keep the user informed after several blocks or a rejection, using a concise progress update instead of printing internal tokens or the whole manifest.
- BOAI stores this in its existing SQLite and cleans it with the source employee/conversation. Do not write `.alma/plan`, edit SQLite or create a shadow planner. Reset/delete also clear old report bodies in plan receipts while preserving deduplication.
- Compared with Alma, this scope is employee/conversation rather than a shared cwd, and there is currently no dedicated live plan card or file-backed report directory. `plans.get/show` are the actual inspection surfaces. Native execution, work delivery, filesystem access and automation retain their own real contracts.
