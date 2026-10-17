---
name: plan-weave
description: File-backed task-graph planner for long-running, multi-step work. Turn a big goal into a persistent plan of tasks and blocks with dependencies and review gates, then execute it block by block via the alma plan CLI — progress survives restarts and is visible in the chat UI.
allowed-tools:
  - Bash
  - Read
  - Write
  - Task
---

<!--
[INPUT]: 安装包 resources/bundled-skills/plan-weave/SKILL.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->


# Plan Weave Skill

Run long, multi-step work as a **persistent task graph** instead of an ad-hoc todo list. A plan lives in `<workspace>/.alma/plan/` as plain files (manifest, state, per-block reports), so it survives restarts, is auditable, and its progress renders live in the chat UI.

The core loop: **claim → execute → submit → repeat**, with review gates that can send work back through a feedback/rework cycle.

## When to Use

- Work spanning many steps or sessions (migrations, big features, audits) where losing track midway is a real risk
- Work that benefits from explicit review gates before moving on
- Work you want to delegate block-by-block to subagents while keeping durable coordination state

For simple short task lists, use the `todo` skill instead. This is heavier machinery — one plan per workspace.

## 1. Author the Plan

Get the format, then write your plan JSON and register it:

```bash
alma plan template            # prints an annotated example plan.json
alma plan set --file plan.json   # validates (DAG, ids, review gates) and installs it
```

Plan format essentials:

- **Tasks** (`tasks[]`): units of independently verifiable value. `deps` gates a task on other tasks. Give every task concrete `acceptance` criteria.
- **Blocks** (`tasks[].blocks[]`): the claimable work units inside a task.
  - `type: "implementation"` — does the work, ends with a report
  - `type: "review"` — judges the work against acceptance; `deps` names the implementation block(s) it reviews; `maxReviewCycles` (default 3) bounds the rework loop
- Refs are `taskId:blockId` (e.g. `T1:B1`).

Authoring quality gate (think before `plan set`):
- Split tasks by data flow, contract boundary, or independently verifiable acceptance — merge tiny tasks that can't be claimed or verified on their own
- Every key requirement of the goal must map to a task, block, or acceptance item
- Block `instructions` must be scoped and verifiable; state what NOT to touch when it matters
- Put a review block after any work where "plausible but wrong" is likely (schema changes, contracts, security-sensitive paths)
- Model the real execution order with `deps`; don't fake parallelism between coupled tasks
- Reject fake completion: schema with no runtime use, API with no caller, config never read, fixture-only testing

## 2. Execute the Loop

```bash
alma plan claim
```

This claims exactly one work item and prints a **work packet** — plan goal, task context, acceptance criteria, block instructions, upstream reports (for reviews), and the exact submit command. Claiming is idempotent: re-running `claim` re-prints the current item.

Then, per item kind:

**Implementation block** — do the work (yourself, or hand the packet verbatim to a `Task` subagent; if the packet suggests an agent, use that subagent type). Verify it, then submit a short report (summary, changed files, verification, remaining risks):

```bash
alma plan submit T1:B1 --report report.md      # or pipe:  echo "..." | alma plan submit T1:B1 --report -
```

**Review block** — judge, don't fix. Read the inlined implementation reports and the actual changes, check acceptance criteria, contracts between producers and consumers, and that live behavior (not mocks) exists. Then:

```bash
alma plan review T1:R1 --verdict passed --notes "evidence: ..."
alma plan review T1:R1 --verdict needs_changes --notes "concrete, scoped change requests"
```

`needs_changes` opens a **feedback item** that outranks all other work: the next `claim` returns the rework packet. Fix exactly what the feedback asks, then:

```bash
alma plan resolve --report rework-report.md
```

…which automatically re-opens the review gate for re-review. After `maxReviewCycles` rejections the gate closes as `max_cycles` (recorded, plan proceeds) — mention this to the user in your summary.

Repeat `alma plan claim` until it prints "plan is complete".

## 3. Inspect & Recover

```bash
alma plan status             # task graph with per-block statuses (add --json for machines)
alma plan show T1:B1         # one block: status, instructions, artifact file paths
alma plan block T2:B1 --reason "waiting on user's API key"    # external blocker
alma plan unblock T2:B1
alma plan reset              # clear state + results, keep the manifest (start over)
alma plan archive            # move the finished plan to .alma/plan-archive/
```

All state is plain files under `.alma/plan/` — when the CLI can't express a repair, Read them (`plan.json`, `state.json`, `results/<taskId>/*.md`), but prefer CLI commands over hand-editing state.

## Rules

- **One item at a time.** Never start a block you haven't claimed; never submit for a block you didn't claim (the CLI enforces this).
- **Reports are the record.** Submit honest reports — failures and skipped verification included. Reviews depend on them.
- **Reviews judge, implementations build.** Don't fix code inside a review; send it back with `needs_changes`.
- **Keep the user in the loop.** After each few blocks (or any review rejection), give the user a one-line progress update; the UI also shows the plan card live.
- Run all commands from the workspace directory (the CLI resolves the plan by walking up from cwd, and uses `$ALMA_THREAD_ID` as fallback).
