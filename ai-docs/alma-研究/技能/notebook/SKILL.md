---
name: notebook
description: Edit Jupyter notebook (.ipynb) cells — insert, replace, or delete cells. Use when working with notebooks.
allowed-tools:
  - Bash
  - Read
  - Write
---

<!--
[INPUT]: 安装包 resources/bundled-skills/notebook/SKILL.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->


# Notebook Edit Skill

Modify Jupyter notebook cells using `jq` and bash.

## List Cells

```bash
# Show all cells with IDs and types
jq -r '.cells | to_entries[] | "\(.key): [\(.value.cell_type)] id=\(.value.id // "none") | \(.value.source[:1] | .[0] // "" | .[0:80])"' NOTEBOOK.ipynb
```

## Replace a Cell's Source

```bash
# Replace cell by index (0-based)
jq --arg src "print(\"hello world\")\n" \
   '.cells[0].source = ($src | split("\n") | map(if . == "" then . else . + "\n" end) | .[:-1])' \
   NOTEBOOK.ipynb > /tmp/nb_tmp.ipynb && mv /tmp/nb_tmp.ipynb NOTEBOOK.ipynb
```

## Insert a New Cell

```bash
# Insert a code cell after index 2
jq --arg src "# New cell\nprint(42)\n" \
   '.cells |= (.[0:3] + [{
     "id": ("new-" + (now | tostring)),
     "cell_type": "code",
     "source": ($src | split("\n") | map(if . == "" then . else . + "\n" end) | .[:-1]),
     "metadata": {},
     "outputs": [],
     "execution_count": null
   }] + .[3:])' \
   NOTEBOOK.ipynb > /tmp/nb_tmp.ipynb && mv /tmp/nb_tmp.ipynb NOTEBOOK.ipynb
```

## Delete a Cell

```bash
# Delete cell at index 1
jq 'del(.cells[1])' NOTEBOOK.ipynb > /tmp/nb_tmp.ipynb && mv /tmp/nb_tmp.ipynb NOTEBOOK.ipynb
```

## Tips

- Always read the notebook first to understand its structure
- Notebook source lines should end with `\n` except the last line
- Use `jq` for reliable JSON manipulation
- Back up the notebook before complex edits
- For simple edits, you can also use the Read/Write tools directly on the JSON
