/*
 * [INPUT]: Isolated actual Mastra HTTP requests and explicit user answer text.
 * [OUTPUT]: Controlled initial ask or tool-reported question, then original Work continuation.
 * [POS]: CLI pending-input fixture shared by process and Electron tests, no external model.
 * [PROTOCOL]: Changes update Header and tests/fixtures/.folder.md.
 */
import { teamEndpoint, sendTeamOutput } from './team-planner'

export function cliQuestionEndpoint(mode: 'ask' | 'tool' = 'ask') {
  return teamEndpoint((body, response, index) => {
    const messages = body.messages as { role: string; content: string; tool_calls?: { function: { name: string } }[] }[]
    const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
    if (system.includes('Private participation decision')) { sendTeamOutput(response, { action: mode === 'ask' ? 'ask' : 'reply', responseKind: 'task', work: { key: 'cli-question', scope: '原请求补充接续', deliverable: '明确接收人后交付' } }); return }
    if (system.includes('Private memory maintenance')) { sendTeamOutput(response, { candidates: [] }); return }
    const answered = JSON.stringify(messages).includes('CLI_ANSWER_PERSON')
    const text = answered ? 'CLI_PENDING_DELIVERED：已按补充交付给本人。' : 'CLI_PENDING_QUESTION：请明确交付给谁？'
    if (system.includes('Read the actual new conversation facts. Publish a relevant, updated report')) { sendTeamOutput(response, { action: 'publish', text }); return }
    const tools = body.tools as { function: { name: string } }[] | undefined
    const called = messages.flatMap(message => message.tool_calls ?? []).some(call => call.function.name === 'report_work')
    if (!tools?.some(tool => tool.function.name === 'report_work') || called) { sendTeamOutput(response, text); return }
    const input = answered ? { disposition: 'delivered', summary: text, evidence: [{ kind: 'answer', reference: text }] } : { disposition: 'waiting', summary: '等待用户明确接收人', userQuestion: text }
    response.writeHead(200, { 'Content-Type': 'text/event-stream' })
    for (const [delta, finish_reason] of [[{ role: 'assistant' }, null], [{ tool_calls: [{ index: 0, id: `cli-question-${index}`, type: 'function', function: { name: 'report_work', arguments: JSON.stringify(input) } }] }, null], [{}, 'tool_calls']] as const) response.write(`data: ${JSON.stringify({ id: `cli-question-${index}`, object: 'chat.completion.chunk', model: 'fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
    response.write(`data: ${JSON.stringify({ id: `cli-question-${index}`, object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 } })}\n\n`)
    response.end('data: [DONE]\n\n')
  })
}
