---
name: boai-system-info
description: "Inspect the actual computer's OS, CPU, disk, memory, processes, network and battery using read-only system commands. Use for system-status questions or diagnosis."
---
<!--
[INPUT]: Alma system-info original and actual BOAI/native command execution contracts.
[OUTPUT]: Bounded system diagnostics with macOS-compatible commands and observed evidence.
[POS]: Product execution skill; diagnosis does not grant permission to change the machine.
[PROTOCOL]: Update Header, parent .folder.md and migration ledger on change.
-->

# System Info

Gather only the information needed for the user's question. Use the supplied `execute_command` for API tasks or the native employee's command tool. Follow its actual permission flow; a skill does not unlock commands. Determine the actual OS before selecting commands. Do not answer current machine facts from training data.

## macOS commands

| Question | Read-only command |
| --- | --- |
| OS version | `sw_vers` |
| Architecture | `uname -m` |
| CPU and logical cores | `sysctl -n machdep.cpu.brand_string` and `sysctl -n hw.ncpu` |
| Installed RAM | `sysctl -n hw.memsize` |
| Disk capacity/free space | `df -h` or a specified existing path |
| A requested folder's size | `du -sh '/actual/folder'` |
| Memory pages | `vm_stat` (use its actual page size; do not equate free pages with all available RAM) |
| CPU-heavy processes | `ps -axo pid,pcpu,pmem,comm -r` with a bounded result |
| Memory-heavy processes | `ps -axo pid,pcpu,pmem,comm -m` with a bounded result |
| Battery/power | `pmset -g batt` |
| Uptime/load | `uptime` |
| Listening on a requested port | `lsof -nP -iTCP:PORT -sTCP:LISTEN` with the actual numeric port |

Use process `comm`, not full command arguments or environment dumps that can contain secrets. BSD macOS ps does not accept GNU `--sort`; use the compatible commands above. Bound long command output to the part relevant to the question and disclose truncation if it affects conclusions.

## Network and interpretation

For a network problem, inspect the relevant local interface with `ifconfig` or the requested port. Only make an outbound connectivity probe if needed for that request; use the actual target the user cares about, not an unrelated address. A ping failure alone does not prove all internet connectivity is down.

Report actual measurements and units. Distinguish a process snapshot from a sustained performance issue; one sample does not establish a memory leak. Permission errors, unavailable commands or unknown results remain explicit. Do not kill processes, clear caches, empty Trash, change networks or install utilities as a side effect of a status check. Perform separately requested fixes through the original authorized tools.
