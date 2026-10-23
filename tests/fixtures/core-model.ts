/*
 * [INPUT]: 真实 Mastra SDK 请求、明确的离线团队方案和受控认证/延迟。
 * [OUTPUT]: bobo 判断、create_team/report_work 工具往返与按真实创建回执汇报团队名称、记忆维护协议，保留请求便于验证重启不重放。
 * [POS]: 核心助手模块和 Electron 共享离线协议 fixture，不代表真实模型质量。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { ServerResponse } from 'node:http'
import { teamEndpoint, sendTeamOutput, writingPlan } from './team-planner'

function sendTool(response: ServerResponse, name: string, args: unknown, index: number) {
  response.writeHead(200, { 'Content-Type': 'text/event-stream' })
  const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `core-${index}`, object: 'chat.completion.chunk', model: 'core-fixture', choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
  emit({ role: 'assistant' }); emit({ tool_calls: [{ index: 0, id: `core-tool-${index}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }); emit({}, 'tool_calls')
  response.write(`data: ${JSON.stringify({ id: `core-${index}`, object: 'chat.completion.chunk', choices: [], usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 } })}\n\n`)
  response.end('data: [DONE]\n\n')
}
export async function coreEndpoint(options: { unauthorized?: boolean; hold?: boolean } = {}) {
  return teamEndpoint((body, response, index) => {
    if (options.unauthorized) { response.writeHead(401); response.end('Unauthorized'); return }
    const messages = body.messages as { role: string; content: string; name?: string; tool_calls?: { function: { name: string } }[] }[]
    const system = messages.filter(message => message.role === 'system').map(message => message.content).join('\n')
    if (system.includes('Private participation decision')) {
      const data = JSON.parse(messages.at(-1)!.content).data
      const content = JSON.stringify(data.currentTurnMessages)
      sendTeamOutput(response, data.participation?.hasRespondedInTurn ? { action: 'pass' } : { action: 'reply', responseKind: /创建.*团队/.test(content) ? 'task' : 'chat' }); return
    }
    if (system.includes('Private memory maintenance')) { sendTeamOutput(response, { candidates: [] }); return }
    if (options.hold) { response.writeHead(200, { 'Content-Type': 'text/event-stream' }); response.flushHeaders(); return }
    const tools = body.tools as { function: { name: string } }[] | undefined
    if (tools?.some(tool => tool.function.name === 'create_team')) {
      const called = messages.flatMap(message => message.tool_calls ?? []).map(tool => tool.function.name)
      const receipt = messages.filter(message => message.role === 'tool').map(message => {
        try { return JSON.parse(message.content) as { title?: string } } catch { return {} }
      }).find(result => result.title)
      const title = receipt?.title ?? writingPlan.name
      if (!called.includes('create_team')) sendTool(response, 'create_team', writingPlan, index)
      else if (!called.includes('report_work')) sendTool(response, 'report_work', { disposition: 'delivered', summary: `${title}已创建`, evidence: [{ kind: 'answer', reference: title }] }, index)
      else sendTeamOutput(response, `已创建「${title}」和四位成员：策划、研究、写手、编辑。可以进入群聊开始交流。`)
    } else sendTeamOutput(response, '你好，我是你的核心助手，会记住获准的交流并帮助你创建团队。')
  })
}
