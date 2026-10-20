---
name: boai-notebook
description: "Inspect and edit Jupyter notebook (.ipynb) cells: list, replace, insert and delete cells while preserving unrelated metadata and outputs. Use for notebook file changes, not diary or memory storage."
---
<!--
[INPUT]: Alma notebook skill and BOAI authorized read/edit/write/command tools.
[OUTPUT]: Actual notebook cell edits with exact source text, stable IDs and verified JSON.
[POS]: Bound file-workflow skill; does not launch kernels or provide a second file authority.
[PROTOCOL]: Update Header, owning .folder.md and migration ledger on change.
-->

# Notebook Editing

Work on the actual `.ipynb` file the user selected. Reuse the available BOAI file tools (`read_file`, `edit_file`, `write_file`) and their real schemas. Native employees use their existing file tools. Read before replacing, and keep the host's current-read / file-change protection. Never bypass a denied file operation with a shell command.

## Inspect

Read the complete notebook JSON before editing. If the file tool returns a paginated or truncated read, finish reading the relevant content before a complete replacement. List each cell's zero-based position, `id` if present, `cell_type`, and a short preview of its source. Resolve a user-specified ID before editing; fail on missing or ambiguous targets instead of editing the nearest cell. Old notebooks may have no cell IDs: preserve the existing format and target the agreed position.

`source` can be a string or an array of strings. For inspection, concatenate the array without inserting additional separators. Preserve the exact text requested, including a final line without a newline. Do not drop that line by blindly slicing a split array.

## Replace, insert and delete

- **Replace:** change only the target cell's source. Keep its ID, type and metadata. For modified code, clear stale `outputs` and set `execution_count` to `null` unless the user explicitly asks to retain them; do not suggest those retained outputs are results of the edited code. Leave all other cells' outputs/counts untouched.
- **Insert:** add a cell at the requested position, with a new unique ID when the notebook uses IDs. A code cell has `cell_type: "code"`, `source`, `metadata: {}`, `outputs: []`, and `execution_count: null`. A Markdown cell has `cell_type: "markdown"`, `source`, and `metadata: {}`; no code outputs/count. Preserve `nbformat`, `nbformat_minor`, kernel metadata and other unknown top-level fields.
- **Delete:** remove exactly the requested cell. For multiple deletions by index, resolve targets first or delete in descending order so earlier removals do not shift later targets. Keep the remaining IDs and relative order.
- For complex or bulk modifications, make a separate backup in the authorized workspace first; never overwrite an existing backup. A simple explicit cell edit does not need another permission question.

For a small file, `edit_file` can make a uniquely anchored change, or `write_file` can save the complete revised JSON after the current full read. JSON string escaping must preserve quotes, backslashes and newlines in code. For larger transformations, use an installed JSON parser through the actual `execute_command` tool, respecting the employee's command/directory approval. Do not assume `jq`, Python or Jupyter are installed; inspect availability when needed. Never evaluate notebook code to edit JSON.

Examples of source-preserving transformations in a Python script (not a notebook execution request):

```python
# nb is the parsed, fully read original JSON; index and source come from the request.
cell = nb['cells'][index]
cell['source'] = source.splitlines(keepends=True)  # preserves a final line without \n
if cell['cell_type'] == 'code':
    cell['outputs'] = []
    cell['execution_count'] = None
# Insert: nb['cells'].insert(position, new_cell)
# Delete: del nb['cells'][index]
```

Use the existing host file-write checks for saving. If a command-based edit discovers the original file changed since it was read, stop and read the current version before applying the change. Do not overwrite a concurrent revision. Use a temporary file next to the target for a command-based save, and replace only after successful JSON serialization and validation; clean up only that temporary file.

## Verify and deliver

Read the actual saved file again and parse it as JSON. Check the targeted cells' IDs, types, exact concatenated source and order. Compare unrelated cell contents, metadata and outputs with the original. Report what changed and whether any code was run. Editing a notebook does not execute it; a kernel launch, package installation or execution is a separate requested action through the existing authorized tools.

When the user asks for the file, use `publish_artifact` (or the actual available delivery tool) as described by `boai-send-file`. The delivered file must be the verified notebook, not pasted JSON or a claimed download path.
