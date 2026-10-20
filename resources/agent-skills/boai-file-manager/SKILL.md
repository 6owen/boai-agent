---
name: boai-file-manager
description: "Find, organize, rename, move, archive and clean up files using the employee's authorized file tools or native shell. Use for concrete local-file tasks."
---
<!--
[INPUT]: Alma file-manager original and BOAI file/directory/command permission tools.
[OUTPUT]: Actual file operations with preview, exact paths and recoverable cleanup.
[POS]: Product execution skill; no parallel filesystem authority or memory storage.
[PROTOCOL]: Update Header, parent .folder.md and migration ledger on change.
-->

# File Manager

Help the user find and organize files. Use the employee's supplied file tools and directory permissions. API execution provides `list_files`, `search_files`, `read_file`, `write_file`, `edit_file`, `move_file`, `delete_file` where applicable. Read each actual tool schema. Native employees use their native file/shell tools and original configuration. Do not invent tools from this document.

## Find and inspect

Start in the user-specified folder. Search names and extensions, then read only relevant matches. Do not scan the entire home directory for a request about one project. Use `search_files` or native search; for an authorized command on macOS:

```sh
find '/actual/folder' -type f -iname '*report*'
find '/actual/folder' -type f -name '*.pdf'
find '/actual/folder' -type f -size +100M
find '/actual/folder' -type f -mtime -7
```

Replace example paths with the actual selected directory and quote paths safely. Surface permission errors instead of suppressing them and claiming an exhaustive search. Matching size only identifies duplicate candidates; verify content hashes before calling files duplicates.

## Organize and revise

- List the exact source → destination changes before bulk actions. For a clear authorized move or rename, act on those files; do not introduce an unnecessary second approval. Handle name collisions explicitly and preserve existing destination files.
- Prefer `move_file` for a supported business file. Otherwise use the available command tool within the approved scope. Do not apply a broad glob whose expansion was never inspected.
- Read a text file before editing. API `write_file` requires a complete current read for replacement; use `edit_file` for a precise local change. If the file changed, read it again instead of forcing a stale overwrite.
- Verify the resulting files, sizes and relevant content. A command exit alone does not prove the requested organization is correct.

## Archive and cleanup

Use installed `zip`, `tar` or equivalent only through the supplied command tool. List archive entries before extraction, check absolute/parent-traversal entries, and extract into a separate chosen directory when collisions are possible. Leave source files intact unless their removal was requested.

For deletion, determine the exact requested files first. Prefer an installed recoverable trash command; check its availability rather than assuming it exists. The API's `delete_file` removes one explicitly requested file, symlink entry or empty directory and is not a trash operation. Do not silently replace recoverable cleanup with permanent deletion, empty the whole Trash, or recursively remove unrelated files.

API commands use `execute_command` and the host's original permission flow. Declare needed directories through its directories field when required; full access does not need repeated permission questions. Partial effects and unknown results must be inspected before any retry.

For a result the user should receive, follow `boai-send-file` and publish the real file. A raw path in a reply is not a delivered attachment. Do not modify installed skill sources, BOAI private databases, generated memory views or system configuration as a substitute for application operations.
