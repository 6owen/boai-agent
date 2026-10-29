/*
 * [OUTPUT]: 独立AgentBrowser/BrowserViewer插件接入；上游工具、启停与运行回收保持独立。
 * [OUTPUT]: PPT复用同一工具schema和惰性任务运行时；纯目录/配置不创建Work，渲染审阅沿原执行与独立模型。
 * [OUTPUT]: 私聊相册元信息/删除使用员工固定身份工具；读取无需文件Work。
 * [OUTPUT]: 普通本机会话显式发现独立生图端口；检查零Work，生成沿原惰性认领和任务文件/交付。
 * [OUTPUT]: 本机工具目录接入同一员工表情端口。
 * [OUTPUT]: 2026-10-20 Alma技能接线：普通聊天按需读绑定技能/有来源记忆，独立任务协议与MCP媒体保持实际授权；本轮证据归独立Agent架构§11.21。
 * [OUTPUT]: 自我状态和bobo应用管理共用宿主工具桥，固定员工/会话，不由prompt扩大身份权限。
 * [OUTPUT]: 2026-10-19应用业务协议：boai工具在惰性Work前办理，业务写入留在原服务；观察不记录原始配置参数。
 * [OUTPUT]: 2026-10-19 本机公共产品桥增加独立 inspect/call_web_search，原生能力保持。
 * [OUTPUT]: 2026-10-19本机目录限制按用户要求退役；原生配置/工具保持，显式权限可返回本机配置；API目录授权及产品资源核验保持。
 * [OUTPUT]: select_web_search复用API本轮选择合同和宿主授权，惰性Work前处理，不新增模型阶段。
 * [OUTPUT]: request_directory共用API目录申请合同，在惰性Work之前等待原审批；不替代原生工具权限检查。
 * [OUTPUT]: 本机知识工具共用当前授权/固定版本，读取在惰性Work认领之前执行。
 * [OUTPUT]: 数据源工具沿共享可用性判定，核心身份在空目录也可同轮使用新建资源。
 * [OUTPUT]: 普通bobo目录管理与API共用object根schema/宿主回调，观测省略正文与凭据。
 * [OUTPUT]: 原生产品桥沿同一create_data_source schema/宿主回调保存配置；观测省略敏感输入。
 * [OUTPUT]: 本机员工复用数据源目录和调用桥，凭据留在宿主，退出等待会话清理。
 * [OUTPUT]: 产品工具MCP对象根schema显式完整；report_work返回待发布状态及必须出现的答复证据，不提前宣称交付。
 * [OUTPUT]: 2026-10-14员工浏览器共用宿主；原生只读不认领Work，实际写入惰性认领，引用核源且模型图片与持久摘要分离。
 * [OUTPUT]: 当前本人对话可调用共用计划管理工具，不为保存计划创建Work；来源与幂等均由宿主服务核验。
 * [OUTPUT]: 2026-10-11 原生工具保留；增量send/read消息不建Work，文件/协作/核心管理才惰性认领，依赖成果不冒充本人文件。
 * [INPUT]: 原生员工会话、已有Work/成果/组织服务。
 * [OUTPUT]: 惰性认领真实产品工作；工作区系统路径别名归一仍经原文件边界核验，原生文件/命令/Skill能力保持。
 * [POS]: BOAI业务边界与原生工具目录之间的薄桥。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新Header，并上浮检查所属目录.folder.md。
 */
import { createSelfieOperations } from '../modules/media/selfie-tools'
import { createReactionOperations } from '../modules/conversations/reaction-tools'
import { mcpModelContent } from '../modules/sources/mcp-media'
import { createBoundSkillOperations } from '../modules/resources/bound-skill-tools'
import { createMemoryOperations } from '../modules/memory/memory-tools'
import { createStateTools } from '../modules/agent-state/state-tools'
import { createApplicationTools, applicationObservation } from '../modules/application/application-tools'
import { createKnowledgeOperations } from '../modules/resources/knowledge-tools'
import { createDirectoryRequestOperation } from '../modules/workspaces/directory-tool'
import { manageSkillsSchema, manageSourcesSchema, manageSkillsDescription, manageSourcesDescription, catalogObservation } from '../modules/resources/catalog-commands'
import { sourceCreationSchema, sourceCreationDescription, sourceCreationObservation } from '../modules/sources/source-commands'
import { createBrowserPluginOperations } from './mastra/browser-plugin-tools'
import { createWebSearchOperations } from './mastra/web-search-tools'
import { z } from 'zod'
import { sourceCallSchema } from '@boai/shared/domain/sources'
import { sourceInspectSchema, sourceInspectDescription, sourceCallDescription, hasSourceTools, createWebSearchSelectionOperation } from './mastra/source-tools'
import path from 'node:path'
import { realpath } from 'node:fs/promises'
import type { EngineContext } from '../contracts'
import type { NativeTool } from './native-task'
import { createTaskRuntime } from './mastra/task-runtime'
import { describePresentationTools } from './mastra/presentation-tools'
import { listDesigns } from '../modules/presentations/alma/designs.mjs'
import { f as presentationLayouts, c as presentationIcons } from '../modules/presentations/alma/model.mjs'
import { modelWorkOutcomeSchema, workDelegationSchema, workWaitSchema } from '../modules/collaboration/work-protocol'
import { boboCollaborationPlanSchema, employeeCandidateQuerySchema } from '@boai/shared/domain/bobo-collaboration'
import { isCoreAgent } from '@boai/shared/domain/core-agent'
import { teamModelPlanSchema } from '@boai/shared/domain/team-creation'
import { nativeActivity } from './native-events'
import { contained } from '../modules/workspaces/file-access'
import { imageToolRequestSchema } from '../modules/media/image-service'
import { selfieRequestSchema } from '../modules/media/selfie-service'
import { browserToolSchema, browserToolDescription } from './mastra/browser-tool'
import { parseBrowserSingleCommand } from './mastra/browser-tool-runtime'
import { summarizeMedia } from '../modules/browser/media'
import { automationCommandSchema, automationCommandToolSchema, automationToolDescription } from '../modules/automations/automation-commands'

export function createNativeProducts(context: EngineContext) {
  let browserQueue:Promise<unknown>=Promise.resolve()
  let runtime: Promise<Awaited<ReturnType<typeof createTaskRuntime>>> | undefined
  const organization = isCoreAgent(context.agent) && context.conversation.purpose === 'core' && !context.legacyTeamName
  const reportShape = Object.fromEntries(Object.entries(modelWorkOutcomeSchema({ organization }).shape).filter(([key]) => key !== 'userQuestion'))
  const knowledgeOperations = createKnowledgeOperations(context)
  const directoryRequest = createDirectoryRequestOperation(context)
  const searchChoice = createWebSearchSelectionOperation(context)
  const webSearchOperations = [...createWebSearchOperations(context), ...createBrowserPluginOperations(context)]
  const definitions: { name: string; description: string; schema: z.ZodType }[] = [
    { name: 'send_message', description: 'Publish an ordinary public message in this employee conversation now, for example a clarification or progress update. No Work is created. Repeating the same final reply will not create a duplicate. Use delegate_work to assign an actionable task to a colleague.', schema: z.object({ content: z.string().trim().min(1) }).strict() },
    { name: 'read_messages', description: 'Read a page from this turn’s authorized conversation snapshot. beforeSequence reads older history. Later user messages are queued for the next turn. This does not read private conversations of other employees.', schema: z.object({ beforeSequence: z.number().int().positive().optional(), limit: z.number().int().min(1).max(100).default(50) }).strict() },
    { name: 'publish_artifact', description: 'Deliver an existing file from your employee conversation workspace as a BOAI chat attachment. path may be absolute or relative to cwd. When the current user asks to revise a previously delivered file, pass its actual replacesArtifactId to publish the next immutable version. Do not use replacement for unrelated new files. No separate report is required.', schema: z.object({ path: z.string(), name: z.string().max(150).optional(), replacesArtifactId: z.string().optional(), revisionRequestId: z.string().optional() }) },
    { name: 'delegate_work', description: 'Assign a bounded task to another current BOAI employee using actual member IDs and a stable key. Repeated keys do not repeat work. Native subagents are distinct from employees.', schema: workDelegationSchema },
    { name: 'wait_for_work', description: 'Wait for actual delegated work IDs/results; finish this turn after calling. BOAI resumes your native session once the specified results are ready.', schema: workWaitSchema },
    { name: 'report_work', description: 'Optionally record the disposition of a real BOAI work item. Unnecessary for ordinary chat, clarification, or after publishing a file. For answer evidence, reference MUST be a short exact substring of your final public reply: include that same text verbatim in the reply. Do not place separate prose, URLs or timestamps in reference unless they also appear verbatim in the reply. A receipt only records your declaration; delivery is checked after the final reply. After wait_for_work, finish the turn without another report. Ask users as ordinary chat messages; there is no userQuestion workflow.', schema: z.object(reportShape).strict() },
  ]
  const applicationTools = [...createApplicationTools(context), ...createStateTools(context), ...createBoundSkillOperations(context), ...createMemoryOperations(context), ...createReactionOperations(context), ...createSelfieOperations(context)]
  definitions.push(...describePresentationTools(context))
  if (context.selfies) definitions.push(
    { name: 'save_selfie', description: 'Save an actual owner-approved image as your private persistent appearance reference. Owner private chat only; never auto-save or invent approval. path is an existing self:/ or authorized shared:/ PNG/JPEG/WebP, max 8 MiB. The host records the current owner message; native external inputs must first be copied into this employee workspace.', schema: z.object({ path: z.string().min(1), label: z.string().trim().max(100).default('') }).strict() },
    { name: 'export_selfie', description: 'Copy an actual album original into a NEW self:/runs/<actual-run-id>/ file. Only the owner private chat may export; group/channel requests are denied. Use list_selfies for ID/type; publish_artifact delivers the copied file.', schema: z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), path: z.string().min(1) }).strict() },
    { name: 'take_selfie', description: 'Generate a NEW digital portrait using a private, automatically selected appearance reference. Include established SOUL appearance details; with no album/appearance ask first. Respects explicit style. path is a NEW self:/runs/<actual-run-id>/ image file. No automatic save or claim of a real life event; publish_artifact delivers the result.', schema: selfieRequestSchema.extend({ path: z.string().min(1) }).strict() },
  )
  if (context.images) definitions.push(
    { name: 'inspect_image_generation', description: 'Read the independently configured image provider/model and readiness without generating or creating Work. No credentials or chat-model fallback.', schema: z.object({}).strict() },
    { name: 'generate_image', description: 'Generate one actual image, or edit up to four authorized PNG/JPEG/WebP references, using the configured image model. Uses the existing task runtime and lazily claims Work. path must be a NEW self:/runs/<actual-run-id>/image.png; references use self:/ or authorized shared:/ paths (copy external native files into the current workspace first). File output is not delivery: publish_artifact sends it to this conversation. No automatic retry or model fallback; inspect the original result if the outcome is unknown.', schema: imageToolRequestSchema },
  )
  definitions.push(...knowledgeOperations, ...webSearchOperations, ...applicationTools)
  if (searchChoice) definitions.push(searchChoice)
  if (directoryRequest) definitions.push(directoryRequest)
  if (hasSourceTools(context)) definitions.push(
    { name: 'inspect_data_source', description: sourceInspectDescription(context), schema: sourceInspectSchema },
    { name: 'call_data_source', description: sourceCallDescription, schema: sourceCallSchema },
  )
  if (context.nativeBrowserSession) definitions.push({name:'browser_tool',description:browserToolDescription + ' Read-only page access creates no Work. A real write operation creates Work lazily; after verifying actual business results call report_work with that evidence before your final reply.',schema:browserToolSchema})
  if (context.manageSkills) definitions.push({ name: 'manage_skills', description: manageSkillsDescription, schema: manageSkillsSchema })
  if (context.manageDataSources) definitions.push({ name: 'manage_data_sources', description: manageSourcesDescription, schema: manageSourcesSchema })
  if (context.createDataSource) definitions.push({ name: 'create_data_source', description: sourceCreationDescription, schema: sourceCreationSchema })
  if (context.manageAutomation) definitions.push({ name: 'manage_automation', description: automationToolDescription + ` Current owner: ${JSON.stringify(context.automationOwner)}. Current members: ${JSON.stringify(context.members?.map(({ id, name, role }) => ({ id, name, role })))}. Default timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`, schema: automationCommandToolSchema })
  if (isCoreAgent(context.agent) && context.legacyTeamName) definitions.push({ name: 'create_team', description: 'Create the explicitly requested named team and its independent employees, inheriting this employee execution configuration. Use the committed result for the final reply; do not repeat after an unknown receipt.', schema: teamModelPlanSchema })
  const organizationFields = { mode: z.enum(['employee_creation', 'organize_only', 'organize_and_execute']), goal: z.string().min(1) }
  if (organization) definitions.push(
    { name: 'find_employees', description: 'Find saved BOAI employees for an explicitly requested organization. Supply the authorized mode and complete goal; this prepares administrative Work only.', schema: employeeCandidateQuerySchema.extend(organizationFields) },
    { name: 'organize_collaboration', description: 'Create employees or organize a group for the explicitly authorized goal. Reuse existing IDs; only create missing roles. A committed receipt proves organization, not group business completion.', schema: boboCollaborationPlanSchema.extend(organizationFields) },
  )
  // Every product tool accepts an object. Discriminated unions emit only `oneOf`;
  // MCP requires an explicit root type or rejects the entire tools/list response.
  const tools: NativeTool[] = definitions.map(({ name, description, schema }) => ({ name, description, inputSchema: { ...z.toJSONSchema(schema, { io: 'input' }), type: 'object' },
    ...(['call_data_source', 'call_browser_plugin'].includes(name) ? {toModelContent:mcpModelContent} : {}),
    ...(name==='browser_tool' ? {toModelContent:(value:unknown)=>{
      const result=value as {output?:string;source?:unknown;image?:{data:string;mimeType:string}}
      return [{type:'text' as const,text:`${result.output ?? ''}\nSource: ${JSON.stringify(result.source)}`},...(result.image ? [{type:'image' as const,data:result.image.data,mimeType:result.image.mimeType}]:[])]
    }}:{}),
    execute: async (input, callId) => {
      context.signal.throwIfAborted()
      const parsed = schema.parse(input) as Record<string, unknown>, createdAt = new Date().toISOString()
      const emit = async (completed: boolean, result?: unknown, failed = false) => {
        const observedInput=name === 'call_browser_plugin' ? { provider: parsed.provider, tool: parsed.tool, arguments: '[browser input omitted]' } : name === 'boai_call' ? applicationObservation(input) : ['manage_skills', 'manage_data_sources'].includes(name) ? catalogObservation(input) : name === 'create_data_source' ? sourceCreationObservation(input) : name==='browser_tool' ? {command:parseBrowserSingleCommand(String(parsed.command)).action,arguments:'[browser input omitted]'} : input
        if(name==='browser_tool' || name==='call_data_source' || name==='call_browser_plugin') result=summarizeMedia(result)
        await context.onExecutionEvent?.(nativeActivity(callId, { type: 'dynamicToolCall', name, arguments: observedInput, ...(completed ? { result, status: failed ? 'failed' : 'completed' } : {}) }, completed))
        await context.onTool({ id: callId, name, status: completed ? failed ? 'failed' : 'completed' : 'running', createdAt, detail: JSON.stringify(completed ? result : observedInput) })
      }
      await emit(false)
      try {
        if (name === 'presentation_settings') { const result = await context.presentations!.settings(); await emit(true, result); return result }
        if (name === 'presentation_list_designs' || name === 'presentation_list_layouts' || name === 'presentation_list_icons') {
          await context.presentations!.verify()
          const result = name === 'presentation_list_designs' ? listDesigns(parsed.query as string | undefined, parsed.limit as number) : name === 'presentation_list_icons' ? presentationIcons(parsed.query as string, parsed.limit as number) : presentationLayouts(parsed)
          await context.presentations!.verify(); await emit(true, result); return result
        }
        if (name === 'inspect_image_generation') { context.signal.throwIfAborted(); const result = await context.images!.settings(); await emit(true, result); return result }
        const applicationTool = applicationTools.find(operation => operation.name === name)
        if (applicationTool) { const result = await applicationTool.execute(parsed); await emit(true, result); return result }
        if (name === searchChoice?.name) { const result = await searchChoice.execute(parsed); await emit(true, result); return result }
        if (name === directoryRequest?.name) { const result = await directoryRequest.execute(parsed); await emit(true, result); return result }
        const search = webSearchOperations.find(operation => operation.name === name)
        if (search) { const result = await search.execute(parsed); await emit(true, result); return result }
        const knowledge = knowledgeOperations.find(operation => operation.name === name)
        if (knowledge) { const result = await knowledge.execute(parsed); await emit(true, result); return result }
        if (name === 'inspect_data_source' || name === 'call_data_source') {
          const result = name === 'inspect_data_source' ? await context.inspectDataSource!(String(parsed.sourceId)) : await context.callDataSource!(sourceCallSchema.parse(parsed))
          await emit(true, result); return result
        }
        if (name === 'send_message') {
          if (!context.publishNativeMessage) throw new Error('公开消息接口未接入')
          const result = await context.publishNativeMessage(String(parsed.content), callId)
          await emit(true, result); return result
        }
        if (name === 'read_messages') {
          const eligible = context.messages.filter(message => parsed.beforeSequence === undefined || message.sequence < Number(parsed.beforeSequence))
          const page = eligible.slice(-Number(parsed.limit))
          const result = { messages: page.map(({ id, sequence, senderId, senderName, content, replyToMessageId }) => ({ id, sequence, senderId, senderName, content, replyToMessageId })), ...(eligible.length > page.length ? { beforeSequence: page[0].sequence } : {}) }
          await emit(true, result); return result
        }
        if (name === 'browser_tool') {
          const operation=browserQueue.catch(()=>{}).then(async()=>{
            const command=parseBrowserSingleCommand(String(parsed.command))
            const session=await context.nativeBrowserSession!(command.mutating)
            const reply=await session.execute(command.command,callId)
            return {...reply.result,...(reply.source ? {source:reply.source}:{})}
          })
          browserQueue=operation
          const result=await operation;await emit(true,result);return result
        }
        if (name === 'manage_skills' || name === 'manage_data_sources') { const result = name === 'manage_skills' ? await context.manageSkills!(manageSkillsSchema.parse(parsed)) : await context.manageDataSources!(manageSourcesSchema.parse(parsed)); await emit(true, result); return result }
        if (name === 'create_data_source') { const result = await context.createDataSource!(sourceCreationSchema.parse(parsed)); await emit(true, result); return result }
        if (name === 'manage_automation') {
          const result = await context.manageAutomation!(automationCommandSchema.parse(parsed))
          await emit(true, result); return result
        }
        if (!runtime) runtime = (async () => {
          await context.ensureNativeWork?.(parsed.mode ? { key: 'bobo-organization', scope: String(parsed.goal), deliverable: '按用户要求发布组织', organization: { mode: parsed.mode as 'employee_creation', goal: String(parsed.goal) } } : undefined, typeof parsed.replacesArtifactId === 'string' ? parsed.replacesArtifactId : undefined)
          if (!context.work) throw new Error('产品工作未接入')
          return createTaskRuntime({ ...context, responseKind: 'task' })
        })()
        const product = await runtime
        if (name === 'report_work') {
          if (context.pendingWorkWait && parsed.disposition !== 'waiting') throw new Error('已登记依赖等待，请结束本轮等待实际结果')
          await context.onWorkOutcome!(parsed as unknown as import('@boai/shared/domain').WorkOutcome)
          const result = { recorded: true, publicationPending: true, finalReplyMustInclude: ((parsed.evidence ?? []) as { kind: string; reference: string }[]).filter(e => e.kind === 'answer').map(e => e.reference) }; await emit(true, result); return result
        }
        const tool = product.tools[name as keyof typeof product.tools]
        if (!tool) throw new Error('当前工作没有此产品工具')
        delete parsed.mode; delete parsed.goal
        if (parsed.replacesArtifactId) {
          if (context.artifactRevision?.artifactId !== parsed.replacesArtifactId) throw new Error('请在本轮首次产品操作时指定要修订的原文件')
          parsed.revisionRequestId = context.artifactRevision.id
          delete parsed.replacesArtifactId
        }
        if (name === 'publish_artifact' && !String(parsed.path).startsWith('self:/')) {
          const root = context.workspace!.root, absolute = path.resolve(context.runtimeDirectory?.cwd ?? context.workspace!.workPath, String(parsed.path))
          // macOS may report /private/var for a workspace opened through /var.
          // Resolve the root only: resolving the file here would hide symlinks
          // from the existing publication boundary's per-component checks.
          const matchedRoot = [root, await realpath(root)].find(candidate => contained(candidate, absolute))
          if (!matchedRoot) throw new Error('请先将待交付文件保存到当前员工会话工作区，再发布附件')
          const relative = path.relative(matchedRoot, absolute)
          parsed.path = `self:/${relative.split(path.sep).join('/')}`
        }
        const result = await tool.execute!((tool.inputSchema as z.ZodType).parse(parsed) as never, { agent: { toolCallId: callId }, abortSignal: context.signal } as never)
        if (name === 'publish_artifact') {
          const artifact = (result as { artifact: { id: string } }).artifact
          await context.onWorkOutcome?.({ disposition: 'delivered', summary: '已发布文件', evidence: [{ kind: 'artifact', reference: artifact.id }] })
        }
        if (name === 'organize_collaboration' && (result as {status?: string}).status === 'committed') {
          await context.onWorkOutcome?.({ disposition: 'delivered', summary: '已发布组织', evidence: [{ kind: 'collaboration', reference: (result as { id: string }).id }] })
        }
        await emit(true, result); return result
      } catch (error) { await emit(true, { error: error instanceof Error ? error.message : String(error) }, true); throw error }
    },
  }))
  return { tools, dispose: async () => { try { await context.closeDataSources?.() } finally { if (runtime) await (await runtime.catch(() => undefined))?.dispose() } } }
}
