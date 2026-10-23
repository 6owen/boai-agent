/*
 * [INPUT]: Actual Mastra requests with explicitly configured employee instructions.
 * [OUTPUT]: Independent held HTTP responses, socket-close facts and controlled peer publication.
 * [POS]: Shared Node/Electron CLI cancellation protocol fixture; loopback only.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import type { ServerResponse } from 'node:http'
import { teamEndpoint, sendTeamOutput } from './team-planner'

export const cancellationInstructions = { researcher: 'CLI_CANCEL_SELECTED：按用户要求独立回答。', writer: 'CLI_CANCEL_PEER：按用户要求独立回答。' }
export async function cancellationEndpoint() {
  const pending = new Map<string, ServerResponse>(), closed: string[] = [], errors: string[] = []
  const endpoint = await teamEndpoint((body, response) => {
    const messages = body.messages as { role: string; content: unknown }[]
    const text = (value: unknown) => typeof value === 'string' ? value : JSON.stringify(value)
    const system = messages.filter(message => message.role === 'system').map(message => text(message.content)).join('\n')
    if (system.includes('Private group request interpretation')) { sendTeamOutput(response, { mode: 'independent' }); return }
    if (system.includes('Private participation decision')) {
      const data = JSON.parse(text(messages.at(-1)!.content)).data
      sendTeamOutput(response, data.participation?.hasRespondedInTurn ? { action: 'pass' } : { action: 'reply', responseKind: 'chat' }); return
    }
    if (system.includes('Private memory maintenance')) { sendTeamOutput(response, { candidates: [] }); return }
    const selected = system.includes('CLI_CANCEL_SELECTED'), peer = system.includes('CLI_CANCEL_PEER')
    if (selected === peer) { errors.push('Execution employee marker missing or ambiguous'); response.writeHead(500); response.end(); return }
    const employee = selected ? 'researcher' : 'writer'
    pending.set(employee, response)
    response.on('close', () => { closed.push(employee); if (pending.get(employee) === response) pending.delete(employee) })
  })
  return { ...endpoint, pending, closed, errors, publish(employee: string) { const response = pending.get(employee); if (!response) throw new Error('Missing held employee response'); sendTeamOutput(response, `${employee} 的独立公开回复`); } }
}
