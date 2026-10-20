/*
 * [INPUT]: Explicit process-lifetime employee credential and the original CLI RPC client.
 * [OUTPUT]: Script-local tool discovery/calls with stable identities, original authorization and draining; no owner discovery or replay.
 * [POS]: Bundled Node library for programmatic tool use inside an already authorized employee command.
 * [PROTOCOL]: Update Header and src/cli/.folder.md on change.
 */
import { CliRpcClient } from './client'
import { CliError } from '../shared/cli/protocol'

export interface EmployeeTool { name: string; description?: string; inputSchema: unknown; effect: 'read' | 'write' }
export interface EmployeeTools {
  listTools(): Promise<EmployeeTool[]>
  boaiTool(name: string, input: unknown, callId: string): Promise<unknown>
}
// These actions must remain direct calls in the original task, as in Alma's script workflow.
const directTools = new Set(['report_work', 'delegate_work', 'wait_for_work', 'create_team', 'organize_collaboration'])

export async function withEmployeeTools<T>(run: (tools: EmployeeTools) => Promise<T>): Promise<T> {
  const { BOAI_SERVER_URL: url, BOAI_SERVER_TOKEN: token, BOAI_CLI_EMPLOYEE_RUN: runId } = process.env
  if (!url || !token || !runId || runId === 'unavailable') throw new CliError('AUTH_FAILED', '当前命令没有员工工具凭据；不会读取本人CLI配置')
  const client = new CliRpcClient(url, { token })
  const pending = new Set<Promise<unknown>>()
  let closing = false
  const track = <R>(action: () => Promise<R>): Promise<R> => {
    if (closing) return Promise.reject(new CliError('CLIENT_DISCONNECTED', '脚本工具作用域已结束'))
    const promise = action(); pending.add(promise)
    void promise.then(() => pending.delete(promise), () => pending.delete(promise))
    return promise
  }
  try {
    await client.connect()
    const context = await client.invoke('employee:context') as { runId: string }
    if (context.runId !== runId) throw new CliError('AUTH_FAILED', '脚本凭据与当前员工运行不匹配')
    return await run({
      listTools: () => track(async () => (await client.invoke('employee:tools') as EmployeeTool[]).filter(tool => !directTools.has(tool.name))),
      boaiTool: (name, input, callId) => track(async () => {
        if (directTools.has(name)) throw new CliError('CAPABILITY_UNAVAILABLE', '委派、团队创建和工作终态必须使用原直接工具')
        if (typeof callId !== 'string' || !callId.trim() || callId.length > 200) throw new CliError('INVALID_REQUEST', '每次调用需要稳定callId；未知结果先核对原调用，不自动重试')
        return client.invokeUntimed('employee:invoke', { tool: name, input, callId })
      }),
    })
  } finally {
    closing = true
    await Promise.allSettled([...pending])
    client.destroy()
  }
}
