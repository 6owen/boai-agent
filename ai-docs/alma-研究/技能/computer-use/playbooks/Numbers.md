<!--
[INPUT]: 安装包 resources/bundled-skills/computer-use/playbooks/Numbers.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->

# Numbers Playbook

Bundle id: `com.apple.iWork.Numbers`.

## Editing cells

- **Append / edit**: one click on the cell to focus.
- **Replace**: three clicks on the cell (`alma cu click <ref> --clicks=3`).

For value entry, dispatch the click and the keyboard write in parallel:
```bash
alma cu click <ref> --clicks=3        # select + clear
alma cu type_text "42" --pid <pid>    # enter the new value
```

## Batch entry

One row at a time is fine — use `\t` delimiters to jump between columns in
a single `type_text` call. **Don't** pack multiple rows into one call;
Numbers will reject it. Same for multiple formulas — one per call.

## Notes

- Focused cells sometimes show a "text entry area" with extra formatting
  (e.g. Markdown-bold table headers). Ignore it.
- Values save immediately — no need to press Return unless you're done
  editing the whole spreadsheet.
- Checkbox cells: type `0` or `1`.
