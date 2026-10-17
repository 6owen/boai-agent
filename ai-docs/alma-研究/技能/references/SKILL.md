---
name: references
description: Understand and use Alma references (双链). Any object — a file, project, SSH host, agent, skill, prompt/rule, thread, message, snippet, mission, plan, MCP server, model, memory — has an alma:// URI and can be @-mentioned in a message as @[label](alma://kind/id). Use when a message contains such tokens, when you need to find or point at an Alma object, or when you want to see what mentions an object.
allowed-tools:
  - Bash
always-inject: true
---

<!--
[INPUT]: 安装包 resources/bundled-skills/references/SKILL.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->


## Read-only and time-clue boundaries

Reading, discussing, verifying or summarizing existing records does not authorize
creating a report, plan, scratch copy or temporary script. For a read-only request,
return the answer in chat with existing source links. Output-folder conventions
do not grant write permission. Ask before changing files, settings or schedules.

The sidebar's Time clues entry is an index of original human date expressions,
not a task list. Date-reference JSON includes `timeClues`, with source URIs,
original send times/timezones, explicit clocks and partial coverage. Relative
dates are frozen at original send time. Red dots only mean unseen. Follow the
original message and subsequent conversation; never infer overdue, completion,
or successful scheduling from a clue. An update referring to a prior record
should cite its original message URI so existing backlinks preserve the relation.
The index is not all history and does not schedule reminders.

# References (双链)

A reference is a **pointer** to a real object inside Alma. The user creates them by typing `@` in the composer; you receive them as inline tokens:

```
Let @[Researcher](alma://agent/researcher) follow @[核查规则](alma://prompt/p_9f1) to read
@[1955专著.pdf](alma://file/ws_3a/docs/1955.pdf) on @[Debian-VPS](alma://host/h_7c) and
write the result into @[Michels](alma://project/ws_3a).
```

For every token in the current turn the system prompt contains a `<referenced_objects>` card with the kind, title, a short summary and concrete next steps. **The cards are deliberately short.** When you need the real thing — the file body, the prompt text, a thread transcript — resolve it:

```bash
alma ref resolve alma://prompt/p_9f1            # card as JSON (title, summary, payload, actions)
alma ref resolve alma://file/ws_3a/docs/1955.pdf --full   # + body (file text / transcript / snippet text)
alma ref resolve <uri1> <uri2> --json           # batch
```

## Reading a sentence of references as a task graph

| Kind | Meaning in a task | What to do |
|---|---|---|
| `agent` | WHO should do it | `Task(agent_id: "<payload.id>", …)` |
| `skill` | HOW (a capability) | Load with the Skill tool by `payload.name` |
| `prompt` | HOW (rules / instructions) | `alma ref resolve --full` → follow the text |
| `file`, `thread`, `message`, `snippet`, `memory` | INPUT material | Read via Read tool / `--full` |
| `host` | WHERE to run | `payload.sshCommand` — e.g. `ssh -p 2222 user@host 'cmd'`; `alma://host/local` means this machine |
| `project` | WHERE to read/write | `payload.path` (+ `payload.host`). Switch the thread's workspace to it when you need file tools there |
| `plan` | A Plan Weave plan/task/block | `cd <payload.root> && alma plan status` |
| `mission` | An agent-crew mission | see its thread / crew panel |
| `mcp` | A tool server (or one tool via `alma://mcp/<srv>/<tool>`) | call its tools; `payload.tools` lists them |
| `model` | A provider:model id | `Task(model: "<payload.fullId>")` |
| `provider` | An AI provider config | `payload.models` lists its enabled models |
| `artifact` | A generated artifact in a message | `--full` returns its code/content |
| `tool` | One tool call in a conversation | `--full` returns its input+output — refer back to "what that search found" |
| `task` | A specific subagent run | `payload.status`/`payload.agent`; inspect via Task tooling |
| `cron` | A scheduled/cron job | `alma cron run <id>` / `alma cron list` |

| `scratch` | A temporary reference the user gathered (passage / file / image / web page / media), alive 30 min | Resolve for content or the stored copy's path; expired = content gone — say so. You may SUGGEST keeping it, only the user can (升级为 @) |

Resolve the `host`/`project` refs **before** running anything: a command meant for `@Debian-VPS` must go through its ssh command, never run locally by accident.

## Finding and pointing at objects

```bash
alma ref kinds                                   # what can be referenced
alma ref search "michels" --kind project --json  # → URIs
alma ref search "核查"                           # all kinds
alma ref backlinks alma://host/h_7c             # every message that mentions the VPS (反向链接)
alma ref outlinks alma://thread/<tid>/message/<slot>  # what a message mentions
alma ref related alma://skill/browser           # objects manually/body-linked to this one
alma ref link alma://skill/browser alma://prompt/p_9f1   # assert skill→prompt relation
alma ref unlink alma://skill/browser alma://prompt/p_9f1
alma ref graph alma://project/ws_3a --depth 2    # neighbourhood
alma ref snippet "exact quote to keep" --title "key claim"   # capture text as a snippet object → URI
alma ref open alma://thread/<id>                 # navigate the app there for the user
```

To point the user at an object in your reply, write a normal markdown link with the URI — `[Michels project](alma://project/ws_3a)` — it renders as a clickable card. Only emit URIs you obtained from a card, `alma ref search`, or `alma ref resolve`; never invent ids. A card marked `(MISSING)` means the object was deleted or moved — say so instead of guessing.

## Object↔object relations (not through a message)

Two objects can be linked directly, without a message in between:

- **Body tokens.** A prompt, snippet, memory or skill's own text may contain `@[label](alma://…)` tokens; they are indexed as outgoing links from that object. So a rule can point at another rule, a memory at a project, a skill at a prompt — just write the token in its body. `alma ref backlinks`/`related` then surface the relation.
- **Manual links.** `alma ref link <from> <to>` asserts a relation the text doesn't state (e.g. this project runs on that host). `alma ref related <uri>` lists them (both directions), `alma ref unlink` removes them.

Prefer body tokens when the relationship is part of the object's content; use manual links for standalone associations.

## Modules: @ the collection, not just the instance

`alma://module/<id>` objects are Alma's capability modules — each is the SET of
one kind of object plus its management verbs. `@Themes` can list/switch/pick a
random color scheme; `@Remote Hosts` can test every host at once; a specific
theme or host is still its own @. Resolve a module to get its CLI cheatsheet,
then run those commands — never guess at verbs.

**Reverse discovery (反查):** when the user describes an intent without any @
("我想统一检查所有服务器", "有没有能随机换主题的地方"), first run
`alma ref search "<their words>" --kind module`. If a module matches, use its
cheatsheet and mention it as a link (`[Remote Hosts](alma://module/remote-hosts)`)
so the user learns the entry point. Multiple @modules in one request are a
wiring instruction: chain their verbs into one flow.

## Pinned references (project scope)

A project can pin references (置顶) — the `<referenced_objects>` block shows
them under "Pinned for this project". They are the standing objects every
thread here works with: treat them as always-relevant context and defaults
(which plan, which rules, which agent, where results go). They are set at the
project level only; if the user asks to change them mid-conversation, point
them to Settings → Projects → 置顶引用 (or `alma workspace pin` in their own
terminal) — do not try to alter or ignore them yourself.

## Email (原料仓)

Connected mailboxes turn new mail into inbox items — raw material, never
auto-threads. `@邮件` references (kind `mail`) resolve to headers, body and
attachment file paths; process them with the user's own @Skill/@名单/@项目.
`alma mail list --status pending` shows what's waiting; `alma mail draft <id>
--to … --subject … --body-file -` saves a reply/forward draft. **You never
send**: drafts wait in Settings → Channels → Email for the user's confirm
(`alma mail send` refuses in a tool shell). Uncertain or sensitive mail: leave
it pending and say why.

## 倒后镜 (Rearview)

The local ledger of SYSTEM WAYPOINTS each run passed through — closed
vocabulary only, zero content. Marks: ✓ = real completion receipt,
! = explicit failure, ? = no reliable receipt (NEVER coerce ? into success
or failure). `@倒后镜` lines resolve to the trail + a pointer to its thread.

```bash
alma rearview show            # recent trails ("物流轨迹" for the user's runs)
alma rearview stats           # usage portrait: waypoint heat, mark ratios, chain length
alma rearview diff <a> <b>    # last common waypoint + first divergence (bug triage)
alma rearview filter --only '?!' --out f   # save only abnormal trails for review
alma rearview freeze          # immutable plain-text snapshot (public columns only)
```

You may explain, filter and save candidate files — you must NEVER decide to
upload or share them. Whatever gets submitted is the exact file the user
personally reviewed; never append anything to it.

## Date references and complete work recall

`@本周`, `@下周一` and `@YYYY-MM-DD` resolve to frozen original timezone and
absolute `[startAt,endAt)` boundaries. Resolve the date card with `--json`.
`payload.threads` is MESSAGE-TIME DISCOVERY, not a complete list of work:
older conversations can contain work completed in the requested week.
`payload.workRecords.facts` keeps eventDate/dueDate/completedDate and exact
original quotations, but covers explicitly indexed sources only. Conflicting
claims stay unconfirmed until checked against their original sources.

For a work summary, inspect the user's relevant projects and plans, including
older still-active threads, using `alma threads`, project references and
connected app/plugin skills. Read their complete original pages. You may use
`alma ref time-index <thread-id> --offset 0 --chunk-offset 0 --json` to retain
semantic dates: follow BOTH nextChunkOffset and nextOffset until null. It
indexes original USER text only, reuses verified receipts and makes no model
calls just because the user opens a thread. Attachments, tools and external
app records still need their own full source readers. State precisely which
projects, threads, pages and external apps were checked; never call a bounded
discovery/index result “all work”. Do not assign import/send dates to old events.

For calendar queries use the card's exact-instant command:
`alma calendar events --from-at <startAt> --to-at <endAt> --json`.
`--to-at` is EXCLUSIVE; the older `--to YYYY-MM-DD` includes the whole day and
must not be substituted. Use connected calendar/task plugins on non-macOS
hosts. Calendar permission failures or unsupported plugins are missing
coverage, not an empty schedule. Projected recurring due times are not proof
of execution/completion. `@date` alone never authorizes creating an event or
reminder; only an explicit scheduling request does (use the scheduler skill).

## Rules

- Search results, reference cards and `alma thread messages <id>` are previews, NOT full transcripts. Before a cross-thread summary or a claim that work is absent, read `alma thread messages <id> 20 --full --offset 0` and follow every next-offset page. `--json` returns lossless original parts and timestamps. State any unread pages, missing rows or truncated tool payloads; never claim complete coverage from snippets and never regex-extract JSON from a database.
- Message sent-at time is not event/due/completion time. Anchor relative dates to the original message timestamp/timezone, preserve absolute dates in compaction/memory, and distinguish completed work from plans and imported older records.

- Never paste a large resolved body back into your answer; summarise and cite the URI.
- Messages are addressed by slot (`alma://thread/<tid>/message/<slotId>`), so a message reference keeps pointing at the current version after the user edits it.
- Backlinks update automatically whenever a message containing tokens is saved — you do not need to register anything.
