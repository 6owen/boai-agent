/*
 * [INPUT]: 固定技能名、真实 Mastra SDK 的本地模型请求与工具返回。
 * [OUTPUT]: 可检查的阶段/工具请求记录；产物内容只能取自实际 skill_read 返回。
 * [POS]: Skills 模块与桌面交付验收共用的离线协议服务，不代替生产技能工具。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { createServer } from 'node:http'

export type SkillModelRequest = { stream?: boolean; model: string; messages: { role: string; content: unknown }[]; tools?: { function: { name: string } }[] }
export async function startSkillDeliveryModel(skillName: string) {
  const requests: SkillModelRequest[] = []
  const server = createServer(async (request, response) => {
    try {
      let raw = ''; for await (const chunk of request) raw += chunk
      const input = JSON.parse(raw) as SkillModelRequest; requests.push(input)
      const system = input.messages.filter(m => m.role === 'system').map(m => String(m.content)).join('\n')
      let content = '没有获准技能。', tool: { name: string; arguments: string } | undefined
      if (system.includes('Private participation decision')) {
        const payload = JSON.parse(String(input.messages.at(-1)!.content))
        const current = payload.data.currentTurnMessages
        const replied = current.some((m: { senderType: string }) => m.senderType === 'agent')
        const chat = current.some((m: { senderType: string; content: string }) => m.senderType === 'user' && m.content.startsWith('闲聊'))
        content = JSON.stringify(replied ? { action: 'pass' } : { action: 'reply', responseKind: chat ? 'chat' : 'task', purpose: '读取明确授权的技能并发布依据' })
      } else if (system.includes('Private memory maintenance')) content = '{"candidates":[]}'
      else if (input.tools?.some(t => t.function.name === 'skill')) {
        const results = input.messages.filter(m => m.role === 'tool')
        const proof = results.map(m => JSON.stringify(m.content)).join('\n').match(/SKILL_EVIDENCE_[a-z0-9]+/)?.[0] ?? 'MISSING_SKILL_EVIDENCE'
        const operations = [
          { name: 'skill', arguments: JSON.stringify({ name: skillName }) },
          { name: 'skill_read', arguments: JSON.stringify({ skillName, path: 'references/evidence.md' }) },
          { name: 'write_file', arguments: JSON.stringify({ path: 'self:/work/skill-report.md', content: `# 技能依据\n${proof}` }) },
          { name: 'publish_artifact', arguments: JSON.stringify({ path: 'self:/work/skill-report.md', name: 'skill-report.md' }) },
        ]
        tool = operations[results.length]; content = '已读取获准技能并发布报告。'
      } else if (!input.tools?.length) content = '这是普通聊天，没有读取技能。'
      if (!input.stream) {
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify({ id: 'fixture', object: 'chat.completion', model: input.model, choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }] })); return
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' })
      const emit = (delta: unknown, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: `fixture-${requests.length}`, object: 'chat.completion.chunk', model: input.model, choices: [{ index: 0, delta, finish_reason }] })}\n\n`)
      emit({ role: 'assistant' })
      if (tool) { emit({ tool_calls: [{ index: 0, id: `tool-${requests.length}`, type: 'function', function: tool }] }); emit({}, 'tool_calls') }
      else { emit({ content }); emit({}, 'stop') }
      response.end('data: [DONE]\n\n')
    } catch (error) { response.writeHead(500); response.end(String(error)) }
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address() as { port: number }
  return { server, requests, url: `http://127.0.0.1:${address.port}/v1`, close: async () => { server.closeAllConnections(); if (server.listening) await new Promise<void>(resolve => server.close(() => resolve())) } }
}
