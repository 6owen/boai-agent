/*
 * [INPUT]: Real employee task context and SDK tool callbacks; local protocol controls only model decisions.
 * [OUTPUT]: Task-scoped status writes, actual file delivery and reusable task revisions without external provider requests.
 * [POS]: Scheduled employee-task E2E model adapter; no fake clock, direct task mutation or scheduler replacement.
 * [PROTOCOL]: Changes update Header and owning .folder.md.
 */
import type { ServerResponse } from 'node:http'
import type { TrackedTask } from '../../../packages/shared/src/domain/tracked-tasks'
import { teamEndpoint, sendTeamOutput } from '../../fixtures/team-planner'
import type { Desktop } from './desktop'

type Message = { role: string; content: unknown; tool_calls?: { function: { name: string; arguments: string } }[] }
type Tool = { function: { name: string; description?: string } }
const text = (value: unknown): string => typeof value === 'string' ? value : Array.isArray(value) ? value.map(part => typeof part.text === 'string' ? part.text : JSON.stringify(part)).join('\n') : JSON.stringify(value)
function tool(response: ServerResponse, name: string, args: unknown, index: number) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `task-panel-${index}`, object: 'chat.completion.chunk', model: 'task-panel-fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
  emit({ role: 'assistant' }); emit({ tool_calls: [{ index: 0, id: `task-panel-tool-${index}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }); emit({}, 'tool_calls')
  response.end('data: [DONE]\n\n')
}
export async function scheduledTaskWorker(runtime: Desktop) {
  const errors: string[] = [], issued: { runId: string; taskId: string; name: string; status?: string }[] = []
  const endpoint = await teamEndpoint((body, response, index) => {
    try {
      const messages = body.messages as Message[], system = messages.filter(m => m.role === 'system').map(m => text(m.content)).join('\n')
      if (system.includes('Private group request interpretation')) { sendTeamOutput(response, { mode: 'independent' }); return }
      if (system.includes('Private participation decision')) {
        const data = JSON.parse(text(messages.at(-1)!.content)).data
        sendTeamOutput(response, data.participation?.hasRespondedInTurn || data.currentTurn?.ownCompletedMessageIds?.length ? { action: 'pass' } : { action: 'reply', responseKind: 'task', work: { key: `panel-${data.originalUserRequestId}`, scope: '完成本轮指定文件', deliverable: 'panel-receipt.txt' } }); return
      }
      if (system.includes('Private memory maintenance')) { sendTeamOutput(response, { candidates: [] }); return }
      if (system.includes('Read the actual new conversation facts. Publish a relevant, updated report')) { sendTeamOutput(response, { action: 'publish', text: JSON.parse(text(messages.at(-1)!.content)).data.draft.text }); return }
      const taskId = JSON.parse(system.match(/\[Current employee task\]\n([^\n]+)/)?.[1] ?? 'null')?.id as string | undefined
      const tools = body.tools as Tool[], runId = tools.find(t => t.function.name === 'write_file')?.function.description?.match(/self:\/runs\/([a-zA-Z0-9_-]+)\//)?.[1]
      if (!taskId || !runId) throw Error('Scheduled execution did not receive its assigned task and run identity')
      const calls = messages.flatMap(m => m.tool_calls ?? []).map(t => ({ name: t.function.name, args: JSON.parse(t.function.arguments) }))
      const data = messages.filter(m => m.role === 'tool').map(m => { try { return JSON.parse(text(m.content)) } catch { return undefined } })
      const current = data.map(v => v?.data as TrackedTask | undefined).filter(t => t?.id === taskId).at(-1)
      const send = (name: string, args: unknown, status?: string) => { if (!tools.some(t => t.function.name === name)) throw Error(`Missing real tool ${name}`); issued.push({ runId, taskId, name, status }); tool(response, name, args, index) }
      const update = (status: 'in_progress' | 'in_review') => send('boai_call', { operation: 'tasks.update', requestId: `${runId}-${status}`, input: { id: taskId, expectedRevision: current!.revision, status } }, status)
      const reads = calls.filter(c => c.name === 'boai_call' && c.args.operation === 'tasks.get').length
      if (!calls.some(c => c.args.operation === 'tasks.update' && c.args.input.status === 'in_progress')) {
        if (!current) send('boai_call', { operation: 'tasks.get', input: { id: taskId } })
        else update('in_progress')
        return
      }
      const path = `self:/runs/${runId}/panel-receipt.txt`
      if (!calls.some(c => c.name === 'write_file')) { send('write_file', { path, content: 'SCHEDULE_PANEL_DELIVERED\n' }); return }
      if (!calls.some(c => c.name === 'publish_artifact')) { send('publish_artifact', { path, name: 'panel-receipt.txt' }); return }
      const artifactId = data.map(v => v?.artifact?.id).find(Boolean)
      if (!artifactId) throw Error('The real publish tool did not return the file identity')
      if (!calls.some(c => c.args.operation === 'tasks.update' && c.args.input.status === 'in_review')) {
        if (reads < 2) send('boai_call', { operation: 'tasks.get', input: { id: taskId } })
        else update('in_review')
        return
      }
      if (!calls.some(c => c.name === 'report_work')) { send('report_work', { disposition: 'delivered', summary: '任务文件已交付，等待人工验收。', evidence: [{ kind: 'artifact', reference: artifactId }] }); return }
      sendTeamOutput(response, 'SCHEDULE_PANEL_DELIVERED：本轮文件已完成，请验收。')
    } catch (error) { errors.push(String(error)); if (!response.headersSent) response.writeHead(500); response.end(String(error)) }
  })
  runtime.trackServer(endpoint.server)
  return { ...endpoint, errors, issued }
}
