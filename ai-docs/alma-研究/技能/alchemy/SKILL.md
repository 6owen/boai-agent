---
name: alchemy
description: 炼丹炉 — fuse the objects the user @-referenced (files, snippets, threads, messages, tools, prompts, hosts…) into a reusable, runnable, traceable object - a managed Agent, a personal Skill, a scheduled task (cron), or a Plan Weave workflow template. Use when the user asks to 合成/提炼/炼丹/提取成可重复任务/turn this into a skill or agent or workflow, or when an extraction prompt lists materials to fuse.
allowed-tools:
  - Bash
---

<!--
[INPUT]: 安装包 resources/bundled-skills/alchemy/SKILL.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->


# 炼丹炉 Alchemy

The user throws materials into the furnace — @-referenced objects plus a rough intent — and you produce ONE finished, reusable object. Materials are pointers: **always resolve them first**, never guess their contents.

```bash
alma ref resolve <uri> --full        # read each material
alma ref related <uri>               # follow object relations if a material points onward
```

## 1. Understand the materials, fill the gaps

Read every referenced object. Then decide what is missing (the 缺口): unclear output format? unstated schedule? which model? Ask **one** compact round of clarifying questions ONLY if the gap would change the shape of the result; otherwise pick sensible defaults and say what you assumed.

## 2. Choose the product form

| The intent is… | Produce | How |
|---|---|---|
| A capability / procedure to reuse on demand ("下次一句话") | **Skill** | `alma skill create <name> --file -` with a full SKILL.md |
| A persona/specialist to delegate work to | **Agent** | `alma agent create <name> --prompt - --summary ... --focus a,b [--model ...]` |
| Something that should run on a schedule | **Scheduled task** | `alma cron add ...` (see `alma cron --help`) with a prompt that references the needed objects |
| A multi-step task graph to execute now/soon | **Plan / Mission** | `alma plan template` → edit → `alma plan set --file -`; or spawn via Task with the right agent |

When in doubt: a Skill is the most reusable form.

## 3. Forge it — concrete recipes

**Skill** (stdin must be a complete SKILL.md; frontmatter `name` + `description` required — write the description so it *triggers* on the user's future phrasing):

```bash
alma skill create monthly-expense-report --file - <<'EOF'
---
name: monthly-expense-report
description: 生成月度费用汇总报表。当用户提供当月费用 Excel/CSV 并要求做月度报表、费用汇总时使用。
allowed-tools:
  - Bash
---
# 月度费用汇总
口径（来自 @[核查规则](alma://prompt/xxx)，先 `alma ref resolve` 校对最新版）:
1. …固化下来的统计口径、列名、格式…
2. 读取用户本月上传的文件 → 按口径汇总 → 用 Write 输出 报表-YYYY-MM.xlsx
EOF
```

**Agent**:

```bash
alma agent create 研究员小甲 --summary "按核查规则做文献研究" --focus 研究,核查 --prompt - <<'EOF'
你是一名研究专员。开工前先 `alma ref resolve alma://prompt/<核查规则id> --full` 并严格遵循。
…职责、边界、输出格式…
EOF
```

**Rules for every product:**
- Embed the *stable* knowledge (口径、格式、步骤) directly; embed *living* objects as `alma://` references with a resolve instruction, so later edits to the rule/prompt flow through.
- Chinese name if the user works in Chinese; name states the task, not the mechanism.
- After creating, verify: `alma ref resolve alma://skill/<name>` (or `alma://agent/<id>`) must return the object.

## 4. Hand it back

Reply with: what you created, its `alma://` reference as a markdown link (renders as a card), what you assumed, and the exact one-liner for next time (e.g. “下次直接说：用 <技能名> 处理这份文件，并附上新文件”). If materials came from a 配方提取, the furnace has done its job when next month's run needs only the new input file.
