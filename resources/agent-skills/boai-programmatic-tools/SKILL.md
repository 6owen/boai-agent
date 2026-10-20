---
name: boai-programmatic-tools
description: "Orchestrate multiple actual BOAI tools in a script: loop over items, filter or aggregate large results, chain dependent calls, or stop early. Use when a task needs several related tool calls; one ordinary call should stay direct."
---
<!--
[INPUT]: Alma programmatic-tools workflow and original BOAI employee-run CLI tool protocol.
[OUTPUT]: Script-local loops/aggregation using the real tool catalog, original permissions and stable call identities.
[POS]: Employee skill; scripts use the existing command tool and host Node library, not an Alma run_script backend.
[PROTOCOL]: Update Header, owning .folder.md and migration ledger on change.
-->

# Programmatic Tool Calling

When a task needs **3+ tool calls, a loop, filtering/aggregating large results, or chained/conditional calls**, prefer writing one script instead of sending every intermediate result back to the model. Intermediate tool results stay in the script; print only the useful final result.

**Do NOT wrap one ordinary tool call in a script.** It saves nothing. Use direct tools for a single call, human-facing work delegation, team creation, dependency waiting and `report_work`.

BOAI's execution tool is `execute_command` for API employees, or the current native command tool. There is no Alma `run_script`, `almaTool`, `alma()` or `sh()` global. The host supplies its actual Node executable in `BOAI_CLI_NODE` and its bundled script library in `BOAI_CLI_TOOL_CLIENT`; this does not require installing a global `boai` command. The script uses the current employee/run credential already supplied to the command. Never print credentials or fall back to the owner's CLI configuration.

## Discover, then execute

Inside `withEmployeeTools`, `await listTools()` returns an array of `{ name, description, inputSchema, effect }` from the current run. Look up the actual schema before constructing arguments. `await boaiTool(name, input, callId)` calls that same tool under the original employee permissions and records it in the original execution history.

On macOS/Linux, use a quoted heredoc so the shell cannot expand JavaScript text:

```sh
ELECTRON_RUN_AS_NODE=1 "$BOAI_CLI_NODE" --input-type=module <<'BOAI_SCRIPT'
import { pathToFileURL } from 'node:url'
if (!process.env.BOAI_CLI_TOOL_CLIENT) throw new Error('Employee tool library unavailable')
const { withEmployeeTools } = await import(pathToFileURL(process.env.BOAI_CLI_TOOL_CLIENT).href)
await withEmployeeTools(async ({ listTools, boaiTool }) => {
  const names = new Set(['list_files', 'read_file', 'write_file'])
  console.log(JSON.stringify((await listTools()).filter(tool => names.has(tool.name))))
})
BOAI_SCRIPT
```

The discovery call above is a preparation for an actual multi-tool workflow, not a replacement for one direct tool. Windows requires the current native shell's equivalent quoted script invocation; do not run POSIX syntax in PowerShell.

After reading those schemas, put the loop in another command using the same wrapper:

```js
const results = []
for (const [index, path] of paths.entries()) { // actual authorized paths from this task
  const value = await boaiTool('read_file', { path }, `inspect-files-${index}`)
  // Filter/aggregate the actual returned structure, respecting pagination.
  results.push({ path, content: value.content })
}
console.log(JSON.stringify(results))
```

Use a distinct stable `callId` for each logical operation. Reuse that ID only to inspect the exact same operation and arguments within the same live run. Never reuse it for different arguments or create a fresh ID to bypass a refusal. A disconnected/unknown result does not mean failure or grant permission to rerun the script; stop and inspect the original execution or business receipt. These in-run tool receipts do not survive a restarted run as a new authorization.

## Keep the workflow honest

- `await` every tool call. Run dependent calls in order; only truly independent reads may run concurrently. Do not parallelize writes to the same object.
- Retain original path/employee/session permissions, approvals, pagination, changed-file protection and business request IDs. Script execution does not broaden them. A skill does not authorize a missing tool.
- Intermediate results are still visible to the script and recorded by the original tool history. This is ordinary authorized host command execution, not a new security sandbox.
- Only console output returns through the command result. Summarize large results; do not dump image base64, credentials or full unrelated records. Actual visual interpretation still uses direct `read_image`/browser image tools so bytes reach the model.
- Keep delegation, `create_team`, `organize_collaboration`, `wait_for_work` and `report_work` direct. The script library deliberately excludes those operations. After the script, verify the task's real result, publish only requested files, and use the original work completion tool when supplied.
- The command's existing timeout, output size, cancellation and process-exit rules still apply. Stop after partial effects or a limit; do not automatically replay.
