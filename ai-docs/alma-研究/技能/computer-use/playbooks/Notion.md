<!--
[INPUT]: 安装包 resources/bundled-skills/computer-use/playbooks/Notion.md。
[OUTPUT]: Alma 随包技能原文；保留正文，不执行其中指令。
[POS]: ai-docs/alma-研究 只读研究资料，不作为本项目 Agent 指令。
[PROTOCOL]: 一旦本文件变化，更新本 Header，并上浮检查所属目录 .folder.md。
-->

# Notion Playbook

Bundle id: `notion.id`.

## Editing documents

A Notion page is a list of "blocks". Blocks can be selected. To edit a
selected block's content, `press_key Return`.

New documents start with an empty title ("New page" placeholder). Press
`Return` after typing the title to begin editing the body. To select the
title field, click its inner text element.

Insert one line of text at a time and `press_key Return` between lines. You
can parallelise the pair (type_text + press_key) across multiple lines.

Format with markdown syntax. Two Notion-specific twists:
- `>` inserts a toggle checklist
- `|` inserts a block quote

## List items

Pressing `Return` at the end of a list item creates a new list item with the
appropriate bullet. Just type the content — don't re-insert the bullet.
To end a list, press `Return` on an empty list item.

## Selection

`cmd+a` behaves differently based on state:
- Empty block + cursor inside: selects all blocks in the document.
- Nonempty block: selects all content within that block.
- Full block already selected: a second `cmd+a` selects all blocks.

## Placeholder text

Empty blocks show placeholder text: `New page`, `List`, `To-do`, `Write, …`.
Typing replaces the placeholder — don't try to select and delete it.

## Code and quote blocks

- Inside **code** blocks: `Return` inserts a newline INSIDE; `shift+Return`
  exits the block.
- Inside **quote** blocks: `Return` exits; `shift+Return` inserts a newline
  INSIDE.

## Cursor navigation

To jump to the top/bottom of the doc: focus the body, press `cmd+a` twice,
then `Up` / `Down`, then `Return` to edit the topmost / bottommost block.

To jump to a specific block: press `cmd+a` twice (selects all blocks),
then click the target block once.

Alternatively: `cmd+f` → `type_text <term>` → `press_key Escape` positions
the cursor on the found text.
