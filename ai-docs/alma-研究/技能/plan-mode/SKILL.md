---
name: plan-mode
description: Switch into structured planning mode before outlining multi-step solutions, and exit when done.
allowed-tools:
  - Bash
---

<!--
[INPUT]: 安装包 resources/bundled-skills/plan-mode/SKILL.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->


# Plan Mode Skill

Enter and exit structured planning mode.

## Enter Plan Mode

```bash
curl -s -X POST http://localhost:23001/api/plan-mode/enter
```

Response: `{"active": true, "since": "2026-01-01T00:00:00.000Z", "message": "Plan mode activated."}`

## Exit Plan Mode

```bash
curl -s -X POST http://localhost:23001/api/plan-mode/exit
```

Response: `{"active": false, "since": null, "message": "Plan mode exited."}`

## Check Status

```bash
curl -s http://localhost:23001/api/plan-mode
```

## When to Use

- Before outlining a complex multi-step solution
- When the user asks you to "plan" or "think through" an approach
- Exit after the plan is finalized and you're ready to execute
