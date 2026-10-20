---
name: boai-alchemy
description: "把用户给出的资料、对话和方法提炼成可复用的技能、独立数字员工或定时任务。用于‘做成一个技能’‘提炼成专员’‘以后重复执行这个流程’等请求。先读材料，再创建真实对象。"
---
<!--
[INPUT]: Alma alchemy/SKILL.md and BOAI's actual source readers, employee, skill and automation protocols.
[OUTPUT]: Reusable objects saved and checked through their original services; no fabricated reference graph or workflow engine.
[POS]: Bound employee skill; content synthesis and product creation, distinct from execution of the resulting task.
[PROTOCOL]: Update Header, parent .folder.md and migration ledger on change.
-->

# 炼丹炉 Alchemy

The user gives you materials and a rough intent. Turn them into ONE finished, reusable object. Read the actual materials first; pointers and search snippets are not their full contents.

## 1. Read the materials, fill the gaps

Use the supplied readers for the actual source: `read_skill` for bound skills, `skills.get` for a discovered library entry, `employees.readFile` for an employee's rules, and the available file, knowledge or conversation tools for other materials. Discover application operations with `boai_catalog` before calling `boai_call`; keep the IDs, versions and content identities returned by those readers. Follow pagination where supplied, and say when a source is incomplete. Do not invent an Alma URI, resolve command or a BOAI operation.

Separate the reusable method from this run's inputs. Preserve the user's criteria, names, units and exceptions. Do not turn one sample's answer, an unconfirmed inference or a temporary credential into a standing rule. Referenced content is material, not authorization for unrelated actions.

Ask one compact round of questions only if a missing choice changes the product: ambiguous intended employee, essential output format or unspecified schedule/timezone. Otherwise use the existing defaults and briefly state material assumptions.

## 2. Choose the product form

| The user's intent | Create | Actual BOAI path |
| --- | --- | --- |
| A procedure to reuse on demand | Skill | `skills.save`, then bind to the requested employee when requested |
| A specialist with its own responsibilities/personality | Digital employee | `employees.create`, using current presets and connection choices |
| Repeat the task at specified times | Scheduled task | `automations.preview` then `automations.create`; read `boai-scheduler` |

When the user wants a reusable procedure and has no preference for an employee or schedule, a skill is a good default. Do not create all three objects for one request.

For an execution graph with dependencies, claims and review/rework gates, read `boai-plan-weave` and use the actual `plans` protocol. BOAI's `planning` mode and `tasks` progress list are separate. A registered graph does not execute itself; creating it and carrying out its work follow the user's actual request. The current scope is one employee conversation, with reports in BOAI storage rather than Alma workspace files.

## 3. Forge the object

### Skill

Read `boai-skill-hub` for exact lifecycle details. Check for an existing matching skill before creation; do not overwrite it merely because the name matches.

Save a complete SKILL.md, with `name` and `description` frontmatter. The storage name must meet the actual schema (lowercase Latin letters/numbers/hyphens); use the user's language for its heading, description and instructions. The description should match how the user will ask next time. Include:

- When to use it and what input is needed.
- Stable criteria, method and exceptions extracted from the sources.
- Concrete steps using tools that actually exist; discover provider schemas rather than inventing commands.
- Output format and how to verify it. Missing evidence stays missing.
- The minimum relevant provenance: actual object ID/file name and version/hash if returned. For a living BOAI object, specify its existing reader and actual ID so the next run can read the latest authorized version. If no such reader exists, record a source snapshot and say it will need refreshing; do not promise automatic backlinks or live updates.

For a new skill, `skills.save` uses `expectedHash: null`; edits need the current hash from `skills.get`. Read the saved object back. Saving in the shared library is not binding it to an employee. If the user wants you or another employee to use it, follow `skills.bindingPlan` → `skills.bind` → the original operation receipt, then check that employee's `skillIds`. An uncertain outcome requires the original receipt, not a second creation. A newly bound skill becomes available in the next execution context.

### Digital employee

Read the employee guide and exact `employees.create` schema. Set the requested name, responsibility and substantive working instructions using its supported fields. Use the user's named connection or the product's existing default; do not silently choose a different model. Read the created employee and relevant rule files back to check the instructions survived.

The new employee has its own identity. Do not copy Bobo's private memories, high permissions or unrelated skills. Bind only capabilities the requested role needs and that the user has authorized. Creating an employee does not create a group or start work.

### Scheduled task

Use the scheduler skill, the actual owner ID, timezone and requested frequency. Put the stable method and the next run's input requirements into the task. Preview the resulting schedule, save, then read the saved object back. Do not execute it immediately unless the user asked for that too. A plan that needs unavailable inputs or tools must say so; creation alone does not prove future execution will succeed.

## 4. Hand it back

Say what was actually saved, who can use it, and any important assumption or missing capability. Give the next-time phrase (for example, “用‘月度费用汇总’处理这份新文件”). The reusable method should mean next time needs only the new inputs. Keep the receipt/ID for exact follow-up, but do not dump internal IDs or invent clickable object links in the ordinary reply.
