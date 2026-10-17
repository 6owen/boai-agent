---
name: programmatic-tools
description: Orchestrate many tool calls efficiently by writing code instead of calling tools one-by-one. Use when a task needs looping over items, filtering/aggregating large tool results, chaining dependent calls, or stopping early — e.g. "check all N files", "find which of these are X", "summarize results across many lookups".
allowed-tools:
  - run_script
  - Bash
always-inject: true
---

<!--
[INPUT]: 安装包 resources/bundled-skills/programmatic-tools/SKILL.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->


# Programmatic Tool Calling

When a task needs **3+ tool calls, a loop, filtering/aggregating large results, or chained/conditional calls**, prefer the `run_script` tool over calling tools one at a time — it's far cheaper because intermediate tool results stay in the sandbox and only your `console.log` output returns to you.

Inside `run_script` you have: `await almaTool(name, args)` (call any tool), `await listTools()` (returns an **array** of `{ name, description, inputSchema }` — e.g. `(await listTools()).find(t => t.name === 'Task')`), `sh(cmd)`, `alma(subcmd)`.

Rule: do the looping/filtering in code and `console.log` only the final result.

**Do NOT use `run_script` for a single tool call.** Wrapping one `almaTool(...)` saves no tokens (there's nothing to aggregate) and hides the call from the UI — call that tool directly instead. `run_script` is only worth it when you actually loop/filter/aggregate/chain multiple calls.

Some tools are intentionally **not** available inside `run_script` and must be called directly so they stay observable — notably `Task` (it spawns a subagent that streams its own progress in the UI) and `AttemptCompletion`. Calling them via `almaTool(...)` will fail with a reminder to call them directly.
