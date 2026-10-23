#!/usr/bin/env node
/*
 * [OUTPUT]: 模型目录提供显示名和真实格式推理档位，用于零推理读取合同。
 * [OUTPUT]: 2026-10-10 公开摘要/commentary、错误线程/轮次和原始reasoning合成协议事件，仅用于隔离模块检查。
 * [OUTPUT]: 2026-10-10 夹具读取当前宿主Default to目录声明，保留严格本run路径断言；新增0.161.0与canonical模型/重复游标，不调用真实供应商。
 * [OUTPUT]: 隔离进程只捕获固定启动策略值与实际线程方法，核对系统代理双作用域且原无工具限制保持；新增启动留证不保存目录/认证/原始argv。
 * [OUTPUT]: 原生传输warning夹具覆盖提交前/后、精确线程、迟到与八条边界；敏感合成串只验证诊断不泄露，不调用供应商。
 * [OUTPUT]: 首次Work前的原问题/失败追加按实际continuation接续，普通继续无关联；原请求/预算、单次文件与重启不重放。
 * [OUTPUT]: 已开始命令材料故障使用独立结束标记命令；原执行/来源核验和发布仍由真实宿主负责。
 * [OUTPUT]: 文件登记中断夹具在真实publish_artifact返回后保持未终态，供本场宿主强制退出；工作交付场景仍完成原report_work。
 * [OUTPUT]: 清空后未恢复原生暗号的协议响应独立于BoAI历史清理；若旧thread被误用仍返回旧暗号使断言失败。
 * [OUTPUT]: 审批故障夹具以追加计数文件核对至多一次执行，拒绝后不绕过宿主审批。
 * [OUTPUT]: 会话隔离夹具按原生thread保存临时暗号，指定首轮流等待场景释放；不替换产品排队、可见性或会话映射。
 * [OUTPUT]: 自动化未完成请求在真实宿主写入后等待停止，未发布文件不冒充交付。
 * [OUTPUT]: bobo可选择API或本机Codex；组织/具名团队按原运行配置创建独立员工，混合成员共原预算；本机自动化沿原时钟/预算接入，实际验证归第13组06。
 * [OUTPUT]: 离线材料/技能/知识/记忆协议夹具，输出遵循宿主公布的本次run目录；真实源字节与非法来源分别断言，不代替真实供应商。
 * [OUTPUT]: 离线动态工具通过生产宿主写文件/发布/修订/问题接续/审批，模型目录为固定夹具，不代表真实模型。
 * [OUTPUT]: 明确本轮取消命令使用真实父子进程；历史命令请求不在后续工作重放。
 * [INPUT]: 测试专用隔离目录和Codex JSON-RPC请求。
 * [OUTPUT]: 供应商重连等待事件含敏感测试串，验证诊断只留白名单错误码与协议计数。
 * [OUTPUT]: 确定性的会话/分片/用量及故障事件；私有员工阶段拒绝混入Claude格式器schema，不访问模型或用户登录。
 * [POS]: tests/fixtures，仅验证宿主协议，不冒充真实Codex证据。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { randomUUID } from 'node:crypto'
import { createInterface } from 'node:readline'
import { appendFile, readFile, writeFile } from 'node:fs/promises'
let mode = ''
try { mode = await readFile('fixture-mode', 'utf8') } catch {}
const startupFeatureNames = new Set([
  'respect_system_proxy', 'shell_tool', 'unified_exec', 'view_image', 'image_generation', 'multi_agent', 'multi_agent_v2', 'apps', 'plugins', 'hooks',
  'memories', 'skill_search', 'skill_mcp_dependency_install', 'tool_suggest', 'browser_use', 'computer_use', 'code_mode', 'code_mode_host',
  'code_mode_only', 'code_mode_only_strict_3p_tools', 'goals', 'sleep_tool', 'workspace_dependencies', 'unbounded_connection_retries', 'skip_host_skill_discovery',
])
const startupPolicy = {}
for (const [index, arg] of process.argv.entries()) {
  if (process.argv[index - 1] !== '-c') continue
  const flag = arg.match(/^(features\.([a-z0-9_]+)|analytics\.enabled|tools\.update_plan\.enabled|tools\.experimental_request_user_input\.enabled)=(true|false)$/)
  if (flag && (!flag[2] || startupFeatureNames.has(flag[2]))) startupPolicy[flag[1]] = flag[3] === 'true'
  if (arg === 'web_search="disabled"') startupPolicy.web_search = 'disabled'
  if (arg === 'project_doc_max_bytes=0') startupPolicy.project_doc_max_bytes = 0
  if (arg === 'mcp_servers={}') startupPolicy.mcp_servers = {}
}
await writeFile('startup-policy.json', JSON.stringify(startupPolicy))
const send = value => process.stdout.write(JSON.stringify(value) + '\n')
const callbacks = new Map()
let nextTool = 0
let instructions = ''
function tool(threadId, name, args, callId) {
  const id = `host-request-${++nextTool}`
  send({ id, method: 'item/tool/call', params: { threadId, turnId: 'fixture-turn', namespace: 'boai', tool: name, arguments: args, callId: callId ?? id } })
  return new Promise(resolve => callbacks.set(id, resolve))
}
createInterface({ input: process.stdin }).on('line', async line => {
  const request = JSON.parse(line), { id, method, params } = request
  if (!method && callbacks.has(id)) { const resolve = callbacks.get(id); callbacks.delete(id); resolve(request); return }
  if (method === 'initialize') return send({ id, result: { userAgent: `boai_agent/${mode === 'unknown-version' ? '0.160.0' : mode === 'version-161' ? '0.161.0' : '0.159.3'} (test fixture)` } })
  if (method === 'initialized') return
  if (method === 'config/read') return send({ id, result: { config: { model: 'gpt-6.1-sol', model_provider: 'openai', mcp_servers: { personal: {} } } } })
  if (method === 'model/list') {
    await writeFile(`${process.env.CODEX_HOME}/models_cache.json`, await readFile(new URL('./codex-model-catalog.json', import.meta.url)))
    return send({ id, result: { data: [{ id: 'visible-model-id', model: 'gpt-6.1-sol', displayName: 'Protocol fixture', supportedReasoningEfforts: [{ reasoningEffort: 'low', description: 'Fixture' }, { reasoningEffort: 'high', description: 'Fixture' }] }, { id: 'duplicate-model-id', model: 'gpt-6.1-sol' }], nextCursor: mode === 'model-catalog-repeat' ? 'repeated-cursor' : null } })
  }
  if (method === 'account/read') return send({ id, result: { requiresOpenaiAuth: true, account: mode === 'login-missing' ? null : { type: 'chatgpt' } } })
  if (method === 'thread/start' || method === 'thread/resume') {
    const threadId = params.threadId ?? randomUUID()
    if (mode === 'transport-before-thread') send({ method: 'warning', params: { threadId, message: 'Falling back from WebSockets to HTTPS transport. private-secret-before-thread' } })
    instructions = params.baseInstructions ?? ''
    await writeFile('thread-method.txt', method)
    await writeFile('thread-config.json', JSON.stringify(params))
    return send({ id, result: { thread: { id: threadId } } })
  }
  if (method !== 'turn/start') return send({ id, error: { code: -32601 } })
  await appendFile('turn-requests.txt', `${id}\n`)
  await writeFile('turn-input.json', JSON.stringify(params))
  if (mode === 'malformed-receipt') return send({ id, result: null })
  if (mode === 'transport-before-receipt' || mode === 'transport-unconfirmed') {
    send({ method: 'warning', params: { threadId: params.threadId, message: 'Falling back from WebSockets to HTTPS transport. private-secret-before-receipt' } })
    if (mode === 'transport-unconfirmed') return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  send({ id, result: { turn: { id: 'fixture-turn' } } })
  const threadId = params.threadId
  const event = (method, rest) => send({ method, params: { threadId, turnId: 'fixture-turn', ...rest } })
  if (mode === 'public-progress' || mode === 'bounded-progress' || JSON.stringify(params.input).includes('NATIVE_PUBLIC_PROGRESS')) {
    event('item/started', { item: { type: 'reasoning', id: 'reason-1' } })
    event('item/reasoning/summaryTextDelta', { itemId: 'reason-1', summaryIndex: 0, delta: '正在整理文档结构。' })
    event('item/reasoning/summaryTextDelta', { itemId: 'reason-1', summaryIndex: 0, delta: 'private-wrong-turn', turnId: 'another-turn' })
    event('item/reasoning/summaryTextDelta', { itemId: 'reason-1', summaryIndex: 0, delta: 'private-wrong-thread', threadId: 'another-thread' })
    event('item/reasoning/textDelta', { itemId: 'reason-1', delta: 'private-raw-reasoning' })
    event('item/completed', { item: { type: 'reasoning', id: 'reason-1', summary: ['正在整理文档结构。'], content: ['private-raw-completion'] } })
    event('item/started', { item: { type: 'agentMessage', id: 'progress-1', phase: 'commentary' } })
    event('item/agentMessage/delta', { itemId: 'progress-1', delta: '正在准备交付文件。' })
    event('item/completed', { item: { type: 'agentMessage', id: 'progress-1', phase: 'commentary', text: '正在准备交付文件。' } })
    if (mode === 'bounded-progress') for (let index = 0; index < 40; index++) event('item/reasoning/summaryTextDelta', { itemId: `large-${index}`, summaryIndex: 0, delta: '有界摘要'.repeat(1000) })
  }
  const warning = (target, message) => send({ method: 'warning', params: { threadId: target, message } })
  if (mode === 'transport-fallback-hang') {
    warning(threadId, 'Falling back from WebSockets to HTTPS transport. private-secret-submitted-hang')
    return
  }
  if (mode === 'transport-fallback') {
    warning(threadId, 'Falling back from WebSockets to HTTPS transport. Bearer private-secret-valid https://private-secret.invalid')
    warning(threadId, 'Falling back from WebSockets to HTTPS transport')
    warning('other-thread-private-secret', 'Falling back from WebSockets to HTTPS transport. private-secret-other-thread')
    warning(null, 'Falling back from WebSockets to HTTPS transport. private-secret-null-thread')
    warning(undefined, 'Falling back from WebSockets to HTTPS transport. private-secret-missing-thread')
    warning(threadId, undefined)
    warning(threadId, 123)
    warning(threadId, 'private-secret-unknown-warning https://private-secret.invalid')
    warning(threadId, 'Falling back from WebSockets to HTTPS transports. private-secret-near-prefix')
    warning(threadId, 'private-secret-prefix Falling back from WebSockets to HTTPS transport.')
    event('error', { willRetry: false, error: { message: 'private-secret-error https://private-secret.invalid', additionalDetails: 'private-secret-details', codexErrorInfo: 'private-secret-unknown-code' } })
  }
  if (mode === 'transport-fallback-limit') for (let index = 0; index < 12; index++) warning(threadId, `Falling back from WebSockets to HTTPS transport. private-secret-limit-${index}`)
  if (mode === 'transport-fallback-late') warning(threadId, 'Falling back from WebSockets to HTTPS transport. private-secret-current')
  if (mode === 'hang') return
  if (mode === 'provider-retry') {
    event('private-secret-unknown-method', { message: 'private-secret-payload' })
    event('error', { willRetry: true, error: { message: 'Bearer private-secret-error', additionalDetails: 'private-secret-details', codexErrorInfo: { responseStreamDisconnected: { httpStatusCode: 503 } } } })
    return
  }
  if (mode === 'tool') {
    event('item/started', { item: { id: 'tool', type: 'commandExecution', command: 'forbidden' } })
    return
  }
  let prompt
  try { prompt = JSON.parse(params.input[0].text) } catch {}
  if (prompt?.protocol?.startsWith('private-') && params.outputSchema !== undefined) {
    event('error', { willRetry: false, error: { message: 'Employee formatter schema must not be sent as Codex strict output', codexErrorInfo: 'other' } })
    event('turn/completed', { turn: { id: 'fixture-turn', status: 'failed' } })
    return
  }
  if (['employee-chat-v1', 'employee-task-v1', 'private-memory-delta-v1'].includes(prompt?.protocol)) await writeFile(`${prompt.protocol}-input.json`, JSON.stringify(params))
  if (mode.startsWith('host-tool')) {
    const first = tool(threadId, 'host_write', { content: 'proof' }, 'stable-call')
    if (mode === 'host-tool-duplicate') await Promise.all([first, tool(threadId, 'host_write', { content: 'proof' }, 'stable-call')])
    else await first
  }
  const currentRequest = prompt?.data?.currentTurnMessages?.find(message => message.isRootRequest)?.content ?? ''
  const groupTask = currentRequest.includes('NATIVE_GROUP_TASK') || currentRequest.includes('NATIVE_GROUP_FILES')
  const boboMode = currentRequest.includes('NATIVE_BOBO_CREATE') ? 'employee_creation' : currentRequest.includes('NATIVE_BOBO_ONLY') ? 'organize_only' : currentRequest.includes('NATIVE_BOBO_EXECUTE') ? 'organize_and_execute' : undefined
  const organizationAllowed = !!prompt?.jsonSchema?.properties?.work?.properties?.organization
  const fileTask = currentRequest.includes('NATIVE_NAMED_TEAM') || groupTask || currentRequest.includes('NATIVE_FILE_TASK') || currentRequest.includes('NATIVE_REVISION') || currentRequest.includes('NATIVE_RESOURCE_TASK')
  const mentionedOther = prompt?.data?.originalMentions?.length && !prompt.data.originalMentions.includes(prompt.data.currentEmployeeId)
  let text = prompt?.protocol === 'private-participation-v2' ? JSON.stringify(prompt.data.participation?.hasRespondedInTurn || mentionedOther ? { action: 'pass' } : fileTask
    ? { action: 'reply', responseKind: 'task', purpose: '交付真实文件', work: { key: groupTask ? `group-${prompt.data.currentEmployeeId}` : 'native-file', scope: '创建并发布指定文件', deliverable: 'codex-proof.md' } }
    : { action: 'reply', responseKind: 'chat', purpose: '回应当前用户' }) : '员工回复：你好🌱'
  if (prompt?.protocol === 'private-participation-v2' && boboMode) text = JSON.stringify(organizationAllowed && !prompt.data.participation?.hasRespondedInTurn ? { action: 'reply', responseKind: 'task', purpose: '组织员工', work: { key: 'organize', scope: '组织独立员工', deliverable: '真实组织回执', organization: { mode: boboMode, goal: currentRequest } } } : { action: 'pass' })
  if (prompt?.protocol === 'private-participation-v2' && JSON.stringify(prompt).includes('NATIVE_CONTINUATION_')) {
    await appendFile('decision-continuation.jsonl', JSON.stringify(prompt.data) + '\n')
    text = JSON.stringify(prompt.data.participation?.hasRespondedInTurn ? { action: 'pass' } : prompt.data.continuation ? { action: 'reply', responseKind: 'task', work: { key: 'continued-file', scope: '完成原请求的文件', deliverable: 'codex-proof.md' } } : currentRequest.includes('NATIVE_CONTINUATION_QUESTION') ? { action: 'ask', responseKind: 'chat', purpose: '先询问文件标题' } : currentRequest.includes('NATIVE_CONTINUATION_FAILURE') ? { action: 'wait' } : { action: 'reply', responseKind: 'chat' })
  }
  if (prompt?.protocol === 'private-work-report') text = JSON.stringify({ action: 'publish', text: prompt.draft.text, outcome: prompt.work.outcome })
  if (prompt?.protocol === 'private-memory-delta-v1') {
    const evidence = prompt.data.currentTurnMessages.find(message => message.senderType === 'user' && message.content.includes('NATIVE_MEMORY'))
    text = JSON.stringify({ candidates: evidence ? [{ content: '用户希望使用紫色标题', kind: 'long_term', evidence: 'preference', sourceMessageIds: [evidence.content.includes('INVALID_SOURCE') ? 'foreign-message' : evidence.id] }] : [] })
  }
  if (prompt?.protocol === 'employee-task-v1') {
    let declined = false
    const current = prompt.messages.find(message => message.id === prompt.currentRequestId)?.content ?? ''
    const host = JSON.parse(instructions.split('Host-claimed work and confirmed prior effects: ')[1].split('\n')[0])
    if (host.work.organization) {
      const found = await tool(threadId, 'find_employees', { limit: 20 })
      if (found.error) return
      const employees = JSON.parse(found.result.contentItems[0].text).employees
      const group = host.work.organization.mode !== 'employee_creation'
      const organized = await tool(threadId, 'organize_collaboration', { existingMembers: group ? employees.map(({ agentId, configVersion }) => ({ agentId, configVersion })) : [], newEmployees: [{ name: '本机新同事', role: '核对内容', instructions: '完成明确交付并保持独立身份。' }], ...(group ? { groupTitle: '本机组织群', announcement: 'NATIVE_BOBO_EXECUTE 同事负责核查文件，我在实际交付后汇总。' } : {}) })
      if (organized.error) return
      const receipt = JSON.parse(organized.result.contentItems[0].text)
      await tool(threadId, 'report_work', { disposition: 'delivered', summary: '已组织员工', evidence: [{ kind: 'collaboration', reference: receipt.id }] })
      text = '员工组织已实际完成。'; declined = true
    } else if (current.includes('NATIVE_NAMED_TEAM')) {
      const created = await tool(threadId, 'create_team', { kind: 'plan', schemaVersion: 1, name: '模型建议名', purpose: '创建核查团队', scenarioKind: 'work', assumptions: [], collaborationGuide: '先核查再汇总', capabilityNotes: [], members: [{ name: '团队同事', role: '核查', instructions: '核查实际资料。' }] })
      if (created.error) return
      await tool(threadId, 'report_work', { disposition: 'delivered', summary: '团队已创建', evidence: [{ kind: 'answer', reference: '已实际创建团队。' }] })
      text = '已实际创建团队。'; declined = true
    } else if (current.includes('NATIVE_GROUP_TASK') || host.work.collaborationRequestId) {
      if (!host.work.parentWorkId && !host.work.waitRevision) {
        const owner = host.members.find(member => member.id !== host.work.ownerAgentId)
        const delegated = await tool(threadId, 'delegate_work', { key: 'group-child', ownerAgentId: owner.id, scope: '核查并交付本次子工作', deliverable: '实际核查结果' })
        if (delegated.error) return
        const child = JSON.parse(delegated.result.contentItems[0].text)
        await tool(threadId, 'wait_for_work', { dependencies: [{ workId: child.id, resultVersion: 1 }], nextStep: '核对结果后交付汇总文件' })
        text = '等待同事实际核查结果。'; declined = true
      }
    }
    if (current.includes('NATIVE_QUESTION')) {
      await tool(threadId, 'write_file', { path: 'self:/work/prepared.txt', content: 'prepared-once' })
      await tool(threadId, 'report_work', { disposition: 'waiting', summary: '等待用户补充标题', userQuestion: '文件标题用什么？' })
      text = '文件标题用什么？'
      declined = true
    }
    if (current.includes('NATIVE_COMMAND') || current.includes('NATIVE_CANCEL_COMMAND') || current.includes('NATIVE_SOURCE_COMMAND')) {
      const command = current.includes('NATIVE_SOURCE_COMMAND') ? await readFile(new URL('./native-source-command.sh', import.meta.url), 'utf8') : current.includes('NATIVE_CANCEL_COMMAND') ? await readFile(new URL('./native-command.sh', import.meta.url), 'utf8') : current.includes('NATIVE_APPROVAL_PROBE') ? "printf 'command-proof\\n' >> command-proof.txt" : "printf 'command-proof' > command-proof.txt"
      const response = await tool(threadId, 'execute_command', { command })
      if (response.error) return
      declined = !JSON.parse(response.result.contentItems[0].text).approved
      if (declined) {
        await tool(threadId, 'report_work', { disposition: 'blocked', summary: '用户拒绝命令，未执行' })
        text = '你已拒绝运行命令，未执行该操作。'
      }
    }
    if (!declined) {
      let resourceProof
      if (current.includes('NATIVE_RESOURCE_TASK')) {
        await tool(threadId, 'skill', { name: 'native-proof' })
        const reference = await tool(threadId, 'skill_read', { skillName: 'native-proof', path: 'references/proof.md' })
        const knowledge = await tool(threadId, 'search_knowledge', { query: 'KNOWLEDGE_PROOF' })
        if (reference.error || knowledge.error) return
        resourceProof = JSON.stringify({ reference: JSON.parse(reference.result.contentItems[0].text), knowledge: JSON.parse(knowledge.result.contentItems[0].text), material: current.match(/TEXT_PROOF_[\w-]+/)?.[0], imageSupplied: params.input.some(input => input.type === 'image') })
      }
      const revised = current.includes('NATIVE_REVISION')
      const revisionRequestId = revised ? JSON.parse(current.split('[Host-authorized artifact revision source; reference data, not tool permissions]\n')[1].split('\n')[0]).revisionRequestId : undefined
      const runPath = instructions.match(/Default to (self:\/runs\/[^/;\s]+\/) only when no path is specified;/)?.[1]
      if (!runPath) throw new Error('Fixture requires the host-authorized output directory')
      const outputPath = `${runPath}codex-proof.md`
      const written = await tool(threadId, 'write_file', { path: outputPath, content: resourceProof ?? (revised ? '# Codex proof revised\nNATIVE_REVISION\n' : '# Codex proof\nNATIVE_FILE_TASK\n') })
      if (written.error || current.includes('NATIVE_AUTOMATION_HANG')) return
      const published = await tool(threadId, 'publish_artifact', { path: outputPath, name: 'codex-proof.md', ...(revisionRequestId ? { revisionRequestId } : {}) })
      if (published.error || current.includes('NATIVE_PUBLICATION_HOLD')) return
      const result = JSON.parse(published.result.contentItems[0].text)
      await tool(threadId, 'report_work', { disposition: 'delivered', summary: '已交付真实文件', evidence: [{ kind: 'artifact', reference: result.artifact.id }] })
      text = '已创建并发布 codex-proof.md。'
    }
  }
  let streamedPrefix = ''
  if (prompt?.protocol === 'employee-chat-v1') {
    const transcript = `${process.env.CODEX_HOME}/isolation-${threadId}.json`
    const current = prompt.currentTurnMessages.find(message => message.id === prompt.currentRequestId)?.content ?? ''
    if (current.includes('NATIVE_CONTINUATION_QUESTION')) text = '最终文件标题用什么？'
    const incoming = [...prompt.historicalBackground, ...prompt.currentTurnMessages].map(message => message.content).join('\n').match(/CHAT_CODE_[a-zA-Z0-9-]+/)?.[0]
    let remembered
    try { remembered = JSON.parse(await readFile(transcript, 'utf8')).code } catch {}
    if (!incoming && !remembered && current.includes('NATIVE_CLEARED_CONTEXT')) text = '没有可用暗号'
    if (incoming || remembered) {
      remembered ??= incoming
      await writeFile(transcript, JSON.stringify({ code: remembered }))
      text = `本会话暗号是 ${remembered}。`
      if (current.includes('NATIVE_STREAM_HOLD')) {
        streamedPrefix = '正在回复本次聊天。'
        event('item/agentMessage/delta', { delta: streamedPrefix })
        while (true) {
          try { await readFile('release-native-chat'); break } catch { await new Promise(resolve => setTimeout(resolve, 20)) }
        }
        text = streamedPrefix + text
      }
    }
  }
  const chunk = Buffer.from(JSON.stringify({ method: 'item/agentMessage/delta', params: { threadId, turnId: 'fixture-turn', delta: text.slice(streamedPrefix.length) } }) + '\n')
  const split = chunk.indexOf(Buffer.from('你')) + 1
  process.stdout.write(chunk.subarray(0, split))
  await new Promise(resolve => setTimeout(resolve, 2))
  process.stdout.write(chunk.subarray(split))
  event('thread/tokenUsage/updated', { tokenUsage: { total: { inputTokens: 99, outputTokens: 88, totalTokens: 187 }, last: { inputTokens: 5, outputTokens: 4, totalTokens: 9 } } })
  event('item/completed', { item: { type: 'agentMessage', id: 'answer', text } })
  const completion = { method: 'turn/completed', params: { threadId, turnId: 'fixture-turn', turn: { id: mode === 'wrong-turn' ? 'another-turn' : 'fixture-turn', status: mode === 'failed' ? 'failed' : 'completed' } } }
  if (mode === 'transport-fallback-late') process.stdout.write(JSON.stringify(completion) + '\n' + JSON.stringify({ method: 'warning', params: { threadId, message: 'Falling back from WebSockets to HTTPS transport. private-secret-late' } }) + '\n')
  else send(completion)
})
