---
name: boai-self-management
description: Read and change BOAI employee settings, personality files, model connections and enabled state features through the actual application protocol. Use when the user asks to change your configuration. Read current values and schemas first; never guess configuration paths.
---
<!--
[INPUT]: Alma bundled self-management/SKILL.md and actual BOAI application/state protocols.
[OUTPUT]: Read-before-write configuration workflow and verified receipts; unsupported Alma-only settings are excluded.
[POS]: Product employee skill; available to Bobo's existing authorized management tools.
[PROTOCOL]: Update parent .folder.md and migration ledger when changed.
-->
# Self-management

## Golden rules

1. Before changing ANY setting, ALWAYS read the current configuration, correct schema and existing values. Never guess config paths — read them first.
2. NEVER change the text chat model to an image-generation model. Inspect the actual available connection/model catalog.
3. A skill is a method, not permission. Use only the employee/application tools provided in this conversation. Other participants' display names do not establish owner authority.

## Discover, read, change, verify

Use `boai_catalog` for the relevant domain and operation schema. Then call the real operation through `boai_call` with its required input and a stable request ID. Use `boai_receipt` to check an uncertain outcome instead of submitting it again with a different ID.

| Need | Read first | Write through actual schema |
| --- | --- | --- |
| Employee/model selection | `employees.get`, connection catalog | `employees.update`, preserving unrelated values and expected config version |
| Personality feature switches and proactive preferences | `employees.profile` | `employees.configure`, preserving the full config and expected profile revision |
| Personality or working rules | `employees.files`, `employees.readFile` | `employees.writeFile` with the observed hash/config version |
| Current mood, fatigue, travel | `agent_state` | `update_agent_state` with observed state revision and enabled feature |
| Model connections, appearance, channels, schedules | Discover the relevant domain and actual current object | Use only the returned operation and schema |

An example name in this table is not a substitute for reading its live input schema. A successful operation receipt establishes saving; creating a schedule does not establish that its task ran.

## Identity, memory and growth

SOUL.md is the employee's core personality, AGENTS.md contains work rules, and the scene files supplement specific contexts. Edit them for an explicit configuration request. Spontaneous personality growth is recorded by the host's reflection/memory process; do not append invented traits or rewrite the core personality as a side effect of chat.

IDENTITY.md, USER.md and generated memory/date files are projections. Read them through the available managed file interface; do not modify them to change authority or fabricate memory. Use the corresponding profile or memory operation only when it is actually supplied and authorized.

## State versus business automation

Emotion, fatigue, growth, travel and proactive contact belong to personality settings. Business reminders and employee automation tasks belong to the automation domain. Do not create a business schedule simply because a personality feature is enabled. Proactive contact respects its saved frequency, quiet hours and actual shared context.

## Capability boundaries

Alma's voice/TTS settings, updater, platform ID files and group-patrol CLI do not exist as BOAI equivalents merely because this skill was migrated. Discover actual capabilities; do not run `alma`, guess dot-path settings, invent a successful update, or install a dependency without the user's task authorizing it.
