/*
 * [INPUT]: 明确指定的离线返回序列。
 * [OUTPUT]: 真实 SDK 可连接的 Chat SSE 服务、请求计数和安全断流清理。
 * [POS]: 团队创建协议/桌面共享 fixture，不代表真实生成质量。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createServer, type ServerResponse } from 'node:http'
export const writingPlan = { kind: 'plan', schemaVersion: 1, name: '四人写作组', purpose: '根据用户材料完成写作和修改', scenarioKind: 'work', assumptions: ['材料由用户提供'], collaborationGuide: '先讨论提纲，再撰写和审校', capabilityNotes: ['联网和技能需要创建后配置'], members: [
  { name: '策划', role: '确定读者和结构', instructions: '明确文章目标，列出提纲。' },
  { name: '研究', role: '核对用户提供材料', instructions: '区分事实和不确定之处。' },
  { name: '写手', role: '组织正文', instructions: '自然简洁，不编造事实。' },
  { name: '编辑', role: '提出具体修改', instructions: '检查结构、事实和语言。' },
] }
export function sendTeamOutput(response: ServerResponse, output: unknown, usage = true) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: 'team-output', object: 'chat.completion.chunk', created: 1, model: 'team-fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
  emit({ role: 'assistant' }); emit({ content: typeof output === 'string' ? output : JSON.stringify(output) }); emit({}, 'stop')
  if (usage) response.write(`data: ${JSON.stringify({ id: 'team-output', object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 } })}\n\n`)
  response.end('data: [DONE]\n\n')
}
export async function teamEndpoint(reply: (body: Record<string, unknown>, response: ServerResponse, index: number) => void = (body, response) => {
  const messages = body.messages as { role: string; content: string }[], system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
  if (system.includes('Private participation decision')) {
    const data = JSON.parse(messages.at(-1)!.content).data
    sendTeamOutput(response, data.participation?.hasRespondedInTurn ? { action: 'pass' } : { action: 'reply', responseKind: 'chat' })
  } else if (system.includes('Private memory maintenance')) sendTeamOutput(response, { candidates: [] })
  else if (system.includes('BoAI 内置团队创建助手')) sendTeamOutput(response, writingPlan)
  else sendTeamOutput(response, '你好，我会按照自己的职责和大家一起协作。')
}) {
  const requests: Record<string, unknown>[] = []
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk
    try { const value = JSON.parse(body); requests.push(value); reply(value, response, requests.length - 1) }
    catch { response.writeHead(500); response.end() }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  return { server, requests, url: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, close: async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())) } }
}
