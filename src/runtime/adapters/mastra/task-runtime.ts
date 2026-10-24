/*
 * [OUTPUT]: 实际宿主命令取得互斥位后重核工作和目录，等待审批不持有命令独占位。
 * [OUTPUT]: PPT工具接当前员工会话、授权字节/原文件队列与审批；专用审阅通过后才导出至原成果流程。
 * [OUTPUT]: 自拍保存/新肖像/私聊原图导出复用实际任务字节、独占文件写入和原发布；私人相册由宿主核权。
 * [OUTPUT]: 生图/编辑用独立模型端口，引用逐项核权，新文件独占写入并沿原成果发布；同运行同路径不重放生成。
 * [OUTPUT]: 原命令租约的脚本工具库作为精确只读内部输入；批量工具调用保持原运行/目录许可与退出回收。
 * [OUTPUT]: read_image可一次读取有序多图，总8MiB/最多12张，逐项及返回前复核授权以减少视频工具轮数。
 * [OUTPUT]: read_image沿原文件目录/成果来源读取实际栅格字节并返回模型图片，文本工具和持久媒体摘要保持。
 * [OUTPUT]: request_directory与本机共用工具合同，原文件队列和审批前现存目录核验保持。
 * [OUTPUT]: 明确业务cwd作为相对文件和命令位置；读写逐次授权，命令目录与操作一次审批，不改变受管存储。
 * [OUTPUT]: 员工进程使用原run短期环境租约，剥离owner/服务密钥变量，实际退出后撤回；不可用时禁止CLI用户配置回退。
 * [OUTPUT]: 任务沿共用知识目录/检索/分页读取工具，保持资料版本和宿主当前授权。
 * [OUTPUT]: execute_command可声明多个业务目录，与命令一次审批；启动前复核目录身份，永久批准仅保存目录。
 * [OUTPUT]: 宿主已核对的受管成果保持同一字节快照，不因事后再次打开原件误拒绝；外部路径仍独立复核。
 * [OUTPUT]: 有界逐路径搜索、业务文件两侧授权移动/删除及外部文件受管副本交付，原件不归成果清理。
 * [OUTPUT]: 业务绝对路径按员工目录许可等待批准，读写前复核实际目标；临时目录许可进入命令边界，原逻辑材料/发布路径保持。
 * [OUTPUT]: 已配置目录员工的宿主命令接入真实OS读写策略；默认受管run目录，明确业务cwd沿组合审批接续。
 * [OUTPUT]: API文件写入/编辑/发布和命令在实际副作用前核对整体执行权限；读操作无需审批。
 * [OUTPUT]: 定时任务沿原Work装配browser_tool，组织/普通chat及未认领工作边界保持。
 * [OUTPUT]: 宿主命令遵循员工已保存授权，未永久授权时由工具申请确认。
 * [OUTPUT]: 获准工作装配员工数据源目录/调用工具，退出等待数据源会话关闭。
 * [OUTPUT]: Hermes 文件编辑语义接线：Unicode 分页续读；API 员工精确 edit_file、完整阅读与过期写入保护，原生自主工具保持。
 * [OUTPUT]: report_work与原生入口一致回传必须原样出现在最终答复中的证据；仅提醒，不自动发布或绕过原门禁。
 * [OUTPUT]: API委派在创建前拒绝子工作依赖正在委派的父工作；依赖链须先取真实前置回执，防止猜父ID造成多份审稿；本机工具合同保持。
 * [OUTPUT]: 仅API上下文读写文件回执提供实际文本/段落Unicode非空白计数，截断读取明确标记；模型以区间中部为目标、整体修订并按实测核对原限字再发布，权限/原件/预算保持。
 * [OUTPUT]: 文件任务保留获准原文件名/逻辑路径，仅未指定时默认本run目录；材料写入门禁/工具原参数/发布与实际退出保持，不静默迁移拒绝的目标。
 * [OUTPUT]: bobo可选择API或本机Codex；组织/具名团队按原运行配置创建独立员工，混合成员共原预算；本机自动化沿原时钟/预算接入，实际验证归第13组06。
 * [INPUT]: 已授权执行环境、工作执行权和员工任务合同。
 * [OUTPUT]: 当前启用的内置模型员工默认获准 task 浏览器工具，不读旧能力字段；ACP/停用、普通 chat、无 Work与组织阶段不提供。
 * [OUTPUT]: 同run文件工具按真实受理次序串行至实际退出，修订发布仅广告宿主原请求literal；汇报按本轮登记 ID 校验，依赖只保存 waiting，组织 Work 仅三个真实组织工具。
 * [OUTPUT]: 命令工具明确由调用本身创建并等待宿主审批，不要求模型先自行获得原生执行批准。
 * [OUTPUT]: 手动已认领工作显式浏览器工具，disposal 等待实际退出；结果协议显式 userQuestion 引用公开问题，不能替代工作依赖等待；成果读取直接使用宿主 hash 校验所得字节而不重开原件；显式宿主修订身份的成果发布；核心身份且宿主授权时提供 create_team，按工具调用身份进入原子发布并复用副作用门禁；原生技能名/路径解析到固定资源身份供激活观测；内建文件工具复核宿主来源授权、隐藏未获准列举项且拒绝猜路径访问；受约束的命令/产物工具、委派/等待及业务结果声明。
 * [POS]: Mastra 任务工具适配器；副作用前先登记持久核对标记。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { prepareEnvironment, assertEnvironmentScope } from '../../modules/workspaces/environment-plan'
import { modelWorkOutcomeSchema, workDelegationSchema, workWaitSchema } from '../../modules/collaboration/work-protocol'
import { readdir, realpath, stat } from 'node:fs/promises'
import { materialImageMimeType, readMaterialSource } from '../../modules/materials/material-files'
import path from 'node:path'
import { createTool } from '@mastra/core/tools'
import { LocalFilesystem, Workspace } from '@mastra/core/workspace'
import { z } from 'zod'
import type { EngineContext } from '../../contracts'
import { isBrowserCapableAgent } from '../../../shared/domain'
import { isCoreAgent } from '../../../shared/domain/core-agent'
import { teamModelPlanSchema } from '../../../shared/domain/team-creation'
import { logicalPath, workspaceTarget, boundedRead, writeWorkspaceFile, publishArtifact, restrictedPath, taskPathAllowed, assertTaskPathAccess, RESERVED_SYSTEM_FILES, MAX_FILE_BYTES } from '../../modules/workspaces/file-access'
import { createKnowledgeTools } from './knowledge-tools'
import { createDirectoryRequestOperation } from '../../modules/workspaces/directory-tool'
import { knowledgeInstructions } from '../../modules/resources/knowledge-tools'
import { BoundSkillSource } from './bound-skill-source'
import { createPresentationTools } from './presentation-tools'
import { abortable, executeCommand } from './host-command'
import { authorizeExecution } from '../../modules/employees/execution-permissions'
import { employeeCommandScope } from '../../modules/workspaces/directory-command'
import { workingDirectoryTarget, workingFilePath } from '../../modules/workspaces/working-directory'
import { directoryGrantsSchema } from '../../../shared/domain/directory-access'
import { deleteBusinessEntry, moveBusinessFile, stageBusinessArtifact } from '../../modules/workspaces/directory-files'
import { searchTaskFiles } from '../../modules/workspaces/file-search'
import { assertDirectoryTargetCurrent, type DirectoryTarget } from '../../modules/workspaces/directory-access'
import { createSourceTools } from './source-tools'
import { createBrowserTool } from './browser-tool'
import { createBoboOrganizationTools } from './bobo-tools'
import { imageToolRequestSchema, type ImageBytes } from '../../modules/media/image-service'
import { selfieRequestSchema } from '../../modules/media/selfie-service'
import { FileReadBaselines, fileContentHash, readFilePage, replaceFileText, MAX_FILE_PAGE_CHARACTERS } from '../../modules/workspaces/file-editing'
const MAX_TOOL_OUTPUT = 48_000
const MAX_PARAGRAPH_COUNTS = 100
const MAX_IMAGE_INPUT_BYTES = 8 * 1024 * 1024
const MAX_IMAGE_INPUT_COUNT = 12
interface TaskImage { path: string; contentHash: string; sizeBytes: number; image: { data: string; mimeType: string } }
function fileTextMetrics(content: string) {
  const count = (text: string) => Array.from(text.replace(/\s/gu, '')).length
  const paragraphs = content.split(/\r?\n(?:[ \t]*\r?\n)+/u).filter(part => part.trim())
  return { nonWhitespaceCharacters: count(content), paragraphCharacters: paragraphs.slice(0, MAX_PARAGRAPH_COUNTS).map(count), omittedParagraphs: Math.max(0, paragraphs.length - MAX_PARAGRAPH_COUNTS) }
}
const check = (signal: AbortSignal) => signal.throwIfAborted()

export async function createTaskRuntime(ctx: EngineContext, commandTimeoutMs = 60_000) {
  const environment = ctx.environment ?? await prepareEnvironment(ctx)
  assertEnvironmentScope(environment, ctx)
  const plan = ctx.work?.organization ? { ...environment, skills: [], knowledge: [] } : environment
  const scope = plan.workspace
  const selectedDirectory = ctx.workingDirectory ? await workingDirectoryTarget(ctx.workingDirectory, ctx.directoryAccess?.protectedRoots) : undefined
  const commandCwd = selectedDirectory?.path ?? scope.runPath
  const signal = ctx.signal
  const apiContext = !!ctx.connection && !ctx.runtimeProfile && (ctx.agent.executionBackend?.kind ?? 'mastra-model') === 'mastra-model'
  const fileBaselines = new FileReadBaselines()
  const businessPaths = !!ctx.directoryAccess && (ctx.agent.directoryGrants !== undefined || ctx.agent.executionPermission === 'full-access')
  const directoryRequest = createDirectoryRequestOperation(ctx)
  const locationFor = async (file: string, write = false) => {
    if (selectedDirectory) await assertDirectoryTargetCurrent(selectedDirectory)
    file = workingFilePath(ctx.workingDirectory, file)
    if (!path.isAbsolute(file)) return { ...logicalPath(scope, file, write), business: undefined as DirectoryTarget | undefined }
    if (!businessPaths) throw new Error('该员工尚未配置业务目录授权，请使用受管逻辑路径或先配置授权目录')
    const target = await ctx.directoryAccess!.authorize(file, write ? 'write' : 'read', `${write ? '写入' : '读取'} ${file}`, signal)
    return { root: target.directory, relative: path.relative(target.directory, target.path) || '.', mount: 'business', business: target }
  }
  const verifyLocation = async (location: Awaited<ReturnType<typeof locationFor>>, operation: 'read' | 'list' | 'write') => {
    check(signal)
    if (location.business) await assertDirectoryTargetCurrent(location.business)
    await assertTaskPathAccess(ctx, path.resolve(location.root, location.relative), operation)
  }
  const currentText = async (root: string, relative: string) => {
    try { return await boundedRead(await workspaceTarget(root, relative), { strictUtf8: true }) }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error }
  }
  const filesystem = new LocalFilesystem({ basePath: scope.root, contained: true })
  const skillRoots = plan.skills.map(version => path.resolve(version.resource.path))
  const knowledge = plan.knowledge.map(version => version.resource)
  const workspace = new Workspace({ id: `run-${ctx.runId}`, filesystem, skills: skillRoots, skillSource: new BoundSkillSource(skillRoots, plan.skills, signal), tools: { enabled: false } })
  const identities: { id: string; name: string; path: string }[] = []
  const artifactIds = new Set<string>()
  const collaborationIds = new Set(ctx.committedCollaborationIds ?? [])
  const imageCalls = new Map<string, Promise<unknown>>()
  const attemptedImageTargets = new Set<string>()
  let fileQueue: Promise<unknown> = Promise.resolve(), filesClosing = false
  const fileOperation = <T>(operation: () => Promise<T>): Promise<T> => {
    const actual = fileQueue.then(async () => {
      check(signal)
      if (filesClosing) throw new Error('任务文件运行正在退出')
      if (selectedDirectory) await assertDirectoryTargetCurrent(selectedDirectory)
      return operation()
    })
    // Preserve this call's rejection; a later explicit call still passes its own
    // current source/effect gates. This never retries or replays an operation.
    fileQueue = actual.catch(() => undefined)
    return actual
  }
  const publicationSchema = z.object({ path: z.string(), name: z.string().max(150).optional(), ...(ctx.artifactRevision ? { revisionRequestId: z.literal(ctx.artifactRevision.id).optional() } : {}) }).strict()
  const readSelfieInput = async (file: string) => {
    const location = await locationFor(file), target = path.resolve(location.root, location.relative)
    await verifyLocation(location, 'read')
    const actual = await ctx.readTaskBytes?.(target) ?? await readMaterialSource(await workspaceTarget(await realpath(location.root), location.relative), signal, ctx.runId)
    await verifyLocation(location, 'read')
    const bytes = Buffer.from(actual.bytes), mimeType = materialImageMimeType(bytes)
    if (bytes.length > MAX_IMAGE_INPUT_BYTES || !mimeType || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) throw new Error('形象参考必须为 PNG/JPEG/WebP，最多 8 MiB')
    return { bytes, mimeType }
  }
  const prepareSelfieOutput = async (file: string, generating: boolean) => {
    const location = await locationFor(file, true), target = path.resolve(location.root, location.relative)
    await verifyLocation(location, 'write')
    if (!/\.(png|jpe?g|webp)$/i.test(file)) throw new Error('请使用 PNG、JPEG 或 WebP 文件名')
    try { await stat(await workspaceTarget(location.root, location.relative)); throw new Error('输出文件已存在，请使用新文件名') }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    await authorizeExecution(ctx, { kind: 'file', description: `${generating ? '生成肖像' : '导出形象原图'}并写入 ${file}` })
    await ctx.beforeEffect?.(); check(signal)
    if (generating) { if (attemptedImageTargets.has(target)) throw new Error('此文件已有生图尝试，未重复请求提供方'); attemptedImageTargets.add(target) }
    const outputFormat = /\.webp$/i.test(file) ? 'webp' as const : /\.jpe?g$/i.test(file) ? 'jpeg' as const : undefined
    return { outputFormat, write: async (image: ImageBytes & { contentHash: string; verify(): Promise<void> }) => {
      const expected = outputFormat === 'webp' ? 'image/webp' : outputFormat === 'jpeg' ? 'image/jpeg' : 'image/png'
      if (image.mimeType !== expected) throw new Error('图片实际格式与文件扩展名不同，未写入或自动重试')
      await image.verify()
      await writeWorkspaceFile(location.root, location.relative, image.bytes, null, signal, async () => { await verifyLocation(location, 'write'); await image.verify() })
      await ctx.afterEffect?.()
      return { path: file, bytes: image.bytes.byteLength, contentHash: image.contentHash, mimeType: image.mimeType, published: false }
    } }
  }
  let waiting = !!ctx.pendingWorkWait
  const outcomeSchema = () => modelWorkOutcomeSchema({ organization: !!ctx.work?.organization, waiting, artifactIds: [...artifactIds], collaborationIds: [...collaborationIds] })
  try {
    await workspace.init()
    if (skillRoots.length) {
      const loadedSkills = await workspace.skills?.list() ?? []
      if (loadedSkills.length !== new Set(skillRoots).size) throw new Error('部分绑定 Skill 无法加载，请检查 SKILL.md 元数据与技能目录名')
      for (const skill of loadedSkills) {
        const version = plan.skills.find(item => path.resolve(item.resource.path) === path.resolve(skill.path))
        if (version) identities.push({ id: version.resource.id, name: skill.name, path: skill.path })
      }
      const names = loadedSkills.map(skill => skill.name)
      if (new Set(names).size !== names.length) throw new Error('员工绑定了同名 Skill，请明确选择一个来源')
    }
    const tools = {
      ...createPresentationTools(ctx, {
        root: scope.root, serial: fileOperation,
        source: async file => {
          const location = await locationFor(file), target = path.resolve(location.root, location.relative)
          const read = async () => {
            await verifyLocation(location, 'read')
            const actual = await ctx.readTaskBytes?.(target) ?? await readMaterialSource(await workspaceTarget(await realpath(location.root), location.relative), signal, ctx.runId)
            await verifyLocation(location, 'read'); return Buffer.from(actual.bytes)
          }
          const bytes = await read(), hash = fileContentHash(bytes)
          return { name: workingFilePath(ctx.workingDirectory, file), bytes, verify: async () => { if (fileContentHash(await read()) !== hash) throw new Error('PPT source changed during use') } }
        },
        effect: async description => { await authorizeExecution(ctx, { kind: 'file', description }); await ctx.beforeEffect?.(); check(signal) },
        output: async (file, bytes, verify) => {
          const location = await locationFor(file, true)
          await verifyLocation(location, 'write'); await verify()
          await authorizeExecution(ctx, { kind: 'file', description: `导出演示文稿 ${file}` }); await ctx.beforeEffect?.(); check(signal)
          await writeWorkspaceFile(location.root, location.relative, bytes, null, signal, async () => { await verifyLocation(location, 'write'); await verify() })
          await ctx.afterEffect?.(); return { path: file, bytes: bytes.byteLength }
        },
      }),
      ...(ctx.selfies ? {
        save_selfie: createTool({ id: 'save_selfie', description: 'Save an ACTUAL user-approved image as your persistent appearance reference. Owner private chat only; do not auto-save a new image or treat your own approval as the user\'s. The host records the current owner message as approval provenance. path is an authorized existing PNG/JPEG/WebP, max 8 MiB. Duplicate bytes are not added again. No external send.', inputSchema: z.object({ path: z.string().min(1), label: z.string().trim().max(100).default('') }).strict(), execute: input => fileOperation(async () => {
          const image = await readSelfieInput(input.path)
          await authorizeExecution(ctx, { kind: 'configuration', description: '保存用户认可的形象参考' })
          await ctx.beforeEffect?.(); const result = await ctx.selfies!.save(image, input.label); await ctx.afterEffect?.(); return result
        }) }),
        export_selfie: createTool({ id: 'export_selfie', description: 'Copy one saved appearance-reference ORIGINAL into a new task file, only for the owner in your private chat. Does not generate a new portrait or publish it. Use list_selfies for the actual ID/type, then publish_artifact on the saved result. Group/channel export is denied by the host.', inputSchema: z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), path: z.string().min(1) }).strict(), execute: input => fileOperation(async () => {
          const image = await ctx.selfies!.export(input.id), output = await prepareSelfieOutput(input.path, false)
          return { ...await output.write(image), original: true }
        }) }),
        take_selfie: createTool({ id: 'take_selfie', description: 'Generate a NEW digital-character portrait with your own saved appearance reference, selected privately by the host. Pass every actually established SOUL appearance detail in appearance; without a saved reference or appearance, first ask the owner. prompt describes scene/pose/expression; style defaults photorealistic but respects the user\'s requested style. No automatic album save, no real-world-life claim. path is a NEW image file; publish_artifact is still required. Group chats receive only a fresh result, never an album original.', inputSchema: selfieRequestSchema.extend({ path: z.string().min(1) }).strict(), execute: input => {
          if (imageCalls.has(input.path)) throw new Error('此输出已有生图尝试，请核对原工具结果；未重复请求')
          const pending = fileOperation(async () => {
            const { path: file, ...request } = input, output = await prepareSelfieOutput(file, true)
            const result = await ctx.selfies!.generate(request, output.outputFormat)
            return { ...await output.write(result), generated: true, referenceUsed: result.referenceUsed, source: result.source, usage: result.usage }
          })
          imageCalls.set(input.path, pending); return pending
        } }),
      } : {}),
      ...(ctx.images ? {
        inspect_image_generation: createTool({ id: 'inspect_image_generation', description: 'Read the independently configured image provider/model and readiness. Does not generate, test the remote provider, expose credentials or change the chat model.', inputSchema: z.object({}).strict(), execute: async () => { check(signal); return ctx.images!.settings() } }),
        generate_image: createTool({
          id: 'generate_image', description: 'Generate ONE image or edit using up to 4 actual reference files with the configured image model. path must be a NEW self:/runs/… or authorized business file. references are original authorized logical/business paths, not URLs. Defaults preserve the configured size; provide size only when requested. Returns actual bytes/hash/source after saving; use publish_artifact to deliver. A provider timeout can have charged remotely: never retry blindly or claim delivery. Each output path is attempted only once in this run. Supported output types PNG/JPEG/WebP; file suffix must match actual result.',
          inputSchema: imageToolRequestSchema,
          execute: input => {
            if (imageCalls.has(input.path)) throw new Error('此输出路径已有生图尝试，请核对原工具结果；未重复请求提供方')
            const pending = fileOperation(async () => {
              const { path: file, references: files, ...request } = input
              const location = await locationFor(file, true), target = path.resolve(location.root, location.relative)
              await verifyLocation(location, 'write')
              if (!/\.(png|jpe?g|webp)$/i.test(file)) throw new Error('请使用 PNG、JPEG 或 WebP 文件名')
              const outputFormat = /\.webp$/i.test(file) ? 'webp' as const : /\.jpe?g$/i.test(file) ? 'jpeg' as const : undefined
              if (outputFormat === 'jpeg' && request.background === 'transparent') throw new Error('JPEG 不支持透明背景，请使用 PNG 或 WebP')
              try { await stat(await workspaceTarget(location.root, location.relative)); throw new Error('输出文件已存在，请使用新文件名') }
              catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
              const images: ImageBytes[] = [], locations: Awaited<ReturnType<typeof locationFor>>[] = []
              let bytesRead = 0
              for (const name of files) {
                const source = await locationFor(name), sourcePath = path.resolve(source.root, source.relative)
                await verifyLocation(source, 'read')
                const verified = await ctx.readTaskBytes?.(sourcePath)
                const actual = verified ?? await readMaterialSource(await workspaceTarget(await realpath(source.root), source.relative), signal, ctx.runId)
                await verifyLocation(source, 'read')
                const bytes = Buffer.from(actual.bytes), mimeType = materialImageMimeType(bytes)
                bytesRead += bytes.length
                if (!mimeType || !['image/png', 'image/jpeg', 'image/webp'].includes(mimeType) || bytesRead > MAX_IMAGE_INPUT_BYTES) throw new Error('编辑参考必须为 PNG/JPEG/WebP，合计最多 8 MiB')
                images.push({ bytes, mimeType }); locations.push(source)
              }
              await authorizeExecution(ctx, { kind: 'file', description: `生成图片并写入 ${file}` })
              await ctx.beforeEffect?.(); check(signal)
              for (const source of locations) await verifyLocation(source, 'read')
              if (attemptedImageTargets.has(target)) throw new Error('此文件的生图请求已尝试，未重复请求提供方')
              attemptedImageTargets.add(target)
              const result = await ctx.images!.generate({ ...request, ...(outputFormat ? { outputFormat } : {}) }, images)
              check(signal)
              for (const source of locations) await verifyLocation(source, 'read')
              const expected = /\.png$/i.test(file) ? 'image/png' : /\.webp$/i.test(file) ? 'image/webp' : 'image/jpeg'
              if (result.mimeType !== expected) throw new Error(`提供方返回 ${result.mimeType}，与文件扩展名不同；未写入或自动重试`)
              await writeWorkspaceFile(location.root, location.relative, result.bytes, null, signal, async () => { await verifyLocation(location, 'write'); await ctx.images!.verify(result.source) })
              await ctx.afterEffect?.()
              return { path: file, bytes: result.bytes.byteLength, contentHash: result.contentHash, mimeType: result.mimeType, source: result.source, usage: result.usage, published: false }
            })
            imageCalls.set(input.path, pending); return pending
          },
        }),
      } : {}),
      ...createSourceTools(ctx),
      ...(directoryRequest ? { request_directory: createTool({
        id: directoryRequest.name, description: directoryRequest.description + ' For a command needing new directories, use execute_command.directories to combine its approvals.',
        inputSchema: directoryRequest.schema,
        execute: input => fileOperation(() => directoryRequest.execute(input)),
      }) } : {}),
      ...(ctx.browserSession && isBrowserCapableAgent(ctx.agent) && ctx.work && !ctx.work.organization && ctx.responseKind === 'task' ? { browser_tool: createBrowserTool(ctx.browserSession) } : {}),
      ...(isCoreAgent(ctx.agent) && ctx.createTeam ? {
        create_team: createTool({
          id: 'create_team', description: 'Create the team explicitly requested by the user and its group chat in one product operation. Choose the team name, member names, roles and working instructions from the requirement. Returns the committed group and member identities; only a successful receipt proves creation. New members inherit the core Agent execution backend and model configuration with independent identities, workspaces and sessions, with no commands or resource bindings. Do not call for ordinary conversation or repeat an already delivered creation.',
          inputSchema: teamModelPlanSchema,
          execute: async (plan, context) => {
            check(signal)
            const toolCallId = context?.agent?.toolCallId
            if (!toolCallId) throw new Error('团队创建缺少模型工具调用身份')
            await ctx.beforeEffect?.(); check(signal)
            const result = await ctx.createTeam!(teamModelPlanSchema.parse(plan), toolCallId)
            await ctx.afterEffect?.()
            return result
          },
        }),
      } : {}),
      read_file: createTool({
        id: 'read_file', description: (businessPaths ? 'Absolute business paths are supported, subject to employee directory approval. ' : '') + 'Read a UTF-8 text file from self:/work/…, self:/runs/…, or shared:/…. self is only this employee’s CURRENT conversation session. System files, other employees and other sessions are inaccessible. offset is zero-based Unicode characters; limit is at most 48000. Follow nextOffset until null to read the remainder. If contentHash changes between pages, restart at offset 0.' + (apiContext ? ' Returns measured non-whitespace Unicode character counts for this page only. Before whole-file write_file, read every page of the unchanged file; for a local change prefer edit_file.' : ''),
        inputSchema: z.object({ path: z.string(), offset: z.number().int().min(0).optional(), limit: z.number().int().min(1).max(MAX_FILE_PAGE_CHARACTERS).optional() }),
        execute: ({ path: file, offset, limit }) => fileOperation(async () => {
          check(signal)
          const location = await locationFor(file)
          const target = path.resolve(location.root, location.relative)
          await verifyLocation(location, 'read')
          const verified = await ctx.readTaskFile?.(target)
          const original = verified?.content ?? await boundedRead(await workspaceTarget(location.root, location.relative), { strictUtf8: true })
          // A managed artifact read already returns the host-verified immutable
          // bytes. Do not reopen it after that snapshot and replace its result.
          if (location.business) await verifyLocation(location, 'read')
          const page = readFilePage(original, offset, limit)
          check(signal)
          if (apiContext) fileBaselines.read(target, page)
          return { path: file, ...page, ...(apiContext ? { textMetrics: fileTextMetrics(page.content) } : {}) }
        }),
      }),
      read_image: createTool({
        id: 'read_image',
        description: (businessPaths ? 'Authorized absolute business files are supported. ' : '') + `Read actual raster images from self:/work/…, self:/runs/…, or an authorized shared:/ artifact. path accepts ONE string or an ordered array of up to ${MAX_IMAGE_INPUT_COUNT} paths: batch video frames/screenshots in one call instead of reading each frame in a separate step. With the default command workspace, ./file.jpg from execute_command means self:/runs/${ctx.runId}/file.jpg here; do not guess another run ID. An explicitly selected business cwd retains its relative-path behavior. Returns actual images to the configured model with individual path/hash/MIME; requires a model that accepts image input. Same current employee/session/source permissions as read_file, checked separately for every file. PNG, JPEG, GIF, WebP, BMP and AVIF recognized from bytes; SVG/HTML are not rendered. At most 8 MiB TOTAL per call: prepare separate smaller previews for larger inputs, preserving originals. No partial batch on error. Does not capture screens or publish files. Never infer images from filenames or claim vision after a provider rejection.`,
        inputSchema: z.object({ path: z.union([z.string().min(1), z.array(z.string().min(1)).min(1).max(MAX_IMAGE_INPUT_COUNT)]) }).strict(),
        execute: ({ path: file }) => fileOperation(async () => {
          const files = Array.isArray(file) ? file : [file], images: TaskImage[] = []
          const locations: Awaited<ReturnType<typeof locationFor>>[] = []
          let totalBytes = 0
          for (const name of files) {
            const location = await locationFor(name), target = path.resolve(location.root, location.relative)
            await verifyLocation(location, 'read')
            const verified = await ctx.readTaskBytes?.(target)
            const actual = verified ?? await readMaterialSource(await workspaceTarget(await realpath(location.root), location.relative), signal, ctx.runId)
            if (!verified || location.business) await verifyLocation(location, 'read')
            check(signal)
            const bytes = Buffer.from(actual.bytes)
            totalBytes += bytes.length
            if (totalBytes > MAX_IMAGE_INPUT_BYTES) throw new Error('图片模型输入每次合计最多 8 MiB，请先生成独立缩略图并保留原件')
            const mimeType = materialImageMimeType(bytes)
            if (!mimeType) throw new Error('文件不是可读取的栅格图片；不执行 SVG、HTML 或其他文件内容')
            images.push({ path: name, contentHash: actual.contentHash, sizeBytes: bytes.length, image: { data: bytes.toString('base64'), mimeType } })
            locations.push(location)
          }
          // A later file may wait on access. Recheck earlier sources before exposing the batch.
          if (files.length > 1) for (const location of locations) await verifyLocation(location, 'read')
          check(signal)
          return Array.isArray(file) ? { images } : images[0]!
        }),
        toModelOutput: output => {
          const result = output as TaskImage | { images: TaskImage[] }, images = 'images' in result ? result.images : [result]
          return { type: 'content' as const, value: images.flatMap(image => [{ type: 'text' as const, text: JSON.stringify({ path: image.path, contentHash: image.contentHash, sizeBytes: image.sizeBytes, mimeType: image.image.mimeType }) }, { type: 'image-data' as const, data: image.image.data, mediaType: image.image.mimeType }]) }
        },
      }),
      write_file: createTool({
        id: 'write_file', description: (businessPaths ? 'Absolute business paths are supported: granted read-write directories need no repeated file approval. ' : '') + `Write a private task file using the authorized task's exact filename and logical path. Default to self:/runs/${ctx.runId}/ only when no path is specified. Material-backed tasks must keep writes in this run directory; other tasks may also use self:/work/. An unauthorized required path must be refused, never silently renamed or relocated. ${apiContext ? 'An existing file must have been fully read in this execution (all read_file pages) or written by this execution, and must be unchanged. Prefer edit_file for a local change. Returns measured textMetrics for these exact written bytes; check explicit user character limits before publish_artifact, never estimate a count.' : 'Use publish_artifact to share a finished result.'} No shared or system-file writes.`,
        inputSchema: z.object({ path: z.string(), content: z.string().max(MAX_FILE_BYTES) }),
        execute: ({ path: file, content }) => fileOperation(async () => {
          check(signal)
          const location = await locationFor(file, true)
          if (Buffer.byteLength(content) > MAX_FILE_BYTES) throw new Error('File exceeds 1 MiB')
          const target = path.resolve(location.root, location.relative)
          await verifyLocation(location, 'write')
          let expectedHash: string | null | undefined
          if (apiContext) {
            const current = await currentText(location.root, location.relative)
            if (current !== null) fileBaselines.assertCurrent(target, current, true)
            expectedHash = current === null ? null : fileContentHash(current)
          }
          if (!location.business) await authorizeExecution(ctx, { kind: 'file', description: `写入文件 ${file}` })
          await ctx.beforeEffect?.(); check(signal)
          await writeWorkspaceFile(location.root, location.relative, content, expectedHash, signal, () => verifyLocation(location, 'write'))
          if (apiContext) fileBaselines.wrote(target, content)
          await ctx.afterEffect?.()
          return { path: file, bytes: Buffer.byteLength(content), published: false, ...(apiContext ? { textMetrics: fileTextMetrics(content) } : {}) }
        }),
      }),
      ...(apiContext ? { edit_file: createTool({
        id: 'edit_file', description: (businessPaths ? 'Absolute business paths use employee directory authorization. ' : '') + 'Precisely replace oldText with newText in a private UTF-8 file already read in this execution. Partial read is enough; unseen surrounding content is preserved. Copy exact whitespace/newlines. oldText must match exactly once, unless replaceAll:true explicitly requests every match. Changed files are refused: re-read before retrying. Uses the same self:/ path permissions as write_file; publish_artifact is still required to deliver the result.',
        inputSchema: z.object({ path: z.string(), oldText: z.string().min(1).max(MAX_FILE_BYTES), newText: z.string().max(MAX_FILE_BYTES), replaceAll: z.boolean().optional() }).strict(),
        execute: ({ path: file, oldText, newText, replaceAll }) => fileOperation(async () => {
          check(signal)
          const location = await locationFor(file, true), target = path.resolve(location.root, location.relative)
          await verifyLocation(location, 'read')
          await verifyLocation(location, 'write')
          const current = await currentText(location.root, location.relative)
          if (current === null) throw new Error('File does not exist; use write_file to create a new file')
          fileBaselines.assertCurrent(target, current, false)
          const complete = fileBaselines.hasFullRead(target)
          const result = replaceFileText(current, oldText, newText, replaceAll)
          if (Buffer.byteLength(result.content) > MAX_FILE_BYTES) throw new Error('File exceeds 1 MiB')
          if (!location.business) await authorizeExecution(ctx, { kind: 'file', description: `修改文件 ${file}` })
          await ctx.beforeEffect?.(); check(signal)
          await writeWorkspaceFile(location.root, location.relative, result.content, fileContentHash(current), signal, () => verifyLocation(location, 'write'))
          fileBaselines.wrote(target, result.content, complete)
          await ctx.afterEffect?.()
          return { path: file, bytes: Buffer.byteLength(result.content), replacements: result.replacements, contentHash: fileContentHash(result.content), published: false, textMetrics: fileTextMetrics(result.content) }
        }),
      }) } : {}),
      list_files: createTool({
        id: 'list_files', description: (businessPaths ? 'Absolute business directories are supported, subject to employee directory approval. ' : '') + 'List self:/, self:/work/…, self:/runs/…, or shared:/…. Self root only exposes work and runs.',
        inputSchema: z.object({ path: z.string().default('self:/') }),
        execute: ({ path: directory }) => fileOperation(async () => {
          check(signal)
          const location = await locationFor(directory)
          await verifyLocation(location, 'list')
          const safe = await workspaceTarget(location.root, location.relative)
          const candidates = location.mount === 'self' && location.relative === '.'
            ? [{ name: 'work', type: 'directory' }, { name: 'runs', type: 'directory' }]
            : (await readdir(safe, { withFileTypes: true })).filter(entry => !entry.isSymbolicLink() && (location.business || !RESERVED_SYSTEM_FILES.has(entry.name.toUpperCase()))).map(entry => ({ name: entry.name, type: entry.isDirectory() ? 'directory' : 'file' }))
          const entries: { name: string; type: string }[] = []
          for (const entry of candidates) {
            if (await taskPathAllowed(ctx, path.join(safe, entry.name), entry.type === 'directory' ? 'list' : 'read')) entries.push(entry)
            if (entries.length === 200) break
          }
          await verifyLocation(location, 'list')
          return entries
        }),
      }),
      search_files: createTool({
        id: 'search_files', description: 'Search literal text in UTF-8 files under an authorized logical directory or absolute business directory. Returns actual line numbers, bounded excerpts and file hashes. Symlinks are skipped. Results report limits/skips; narrow the directory/query when truncated. Search excerpts do not replace read_file before editing.',
        inputSchema: z.object({ path: z.string(), query: z.string().min(1).max(500).refine(value => !/[\r\n]/u.test(value), 'Search for a single-line literal'), recursive: z.boolean().default(true), caseSensitive: z.boolean().default(false) }).strict(),
        execute: ({ path: directory, query, recursive, caseSensitive }) => fileOperation(async () => {
          const location = await locationFor(directory)
          await verifyLocation(location, 'list')
          const root = await workspaceTarget(location.root, location.relative)
          const result = await searchTaskFiles(ctx, root, query, { business: !!location.business, recursive, caseSensitive, logicalPath: directory, ...(location.mount === 'self' && location.relative === '.' ? { topLevel: ['work', 'runs'] } : {}) })
          await verifyLocation(location, 'list')
          return result
        }),
      }),
      ...(businessPaths ? {
        move_file: createTool({
          id: 'move_file', description: 'Move one business file or symbolic link using absolute source/destination paths. Both directories must be authorized for writing before any change. Never overwrites an existing destination. Directories require an authorized command. A partial result retains the source and reports the created destination; inspect both and do not repeat automatically.',
          inputSchema: z.object({ from: z.string(), to: z.string() }).strict(),
          execute: ({ from, to }) => fileOperation(() => moveBusinessFile({ ...ctx, directoryAccess: ctx.directoryAccess! }, workingFilePath(ctx.workingDirectory, from), workingFilePath(ctx.workingDirectory, to))),
        }),
        delete_file: createTool({
          id: 'delete_file', description: 'Delete one explicitly requested absolute business file, symlink entry, or empty directory. Uses this employee’s write permission. Deleting a symlink preserves its target. Nonempty directories require an explicitly authorized command; never recurse implicitly.',
          inputSchema: z.object({ path: z.string() }).strict(),
          execute: ({ path: file }) => fileOperation(() => deleteBusinessEntry({ ...ctx, directoryAccess: ctx.directoryAccess! }, workingFilePath(ctx.workingDirectory, file))),
        }),
      } : {}),
      publish_artifact: createTool({
        id: 'publish_artifact', description: (businessPaths ? 'An authorized absolute business file is first copied into this run; the original is never transferred to BOAI ownership. ' : '') + `Explicitly publish one finished self:/ file to the current group's shared artifacts. Existing artifacts are never overwritten. ${ctx.artifactRevision ? `To publish the requested replacement version, explicitly pass revisionRequestId=${ctx.artifactRevision.id}; other supporting files omit it.` : 'No revision publication is authorized in this task.'}`,
        inputSchema: publicationSchema,
        execute: ({ path: source, name, revisionRequestId }) => fileOperation(async () => {
          check(signal)
          if (selectedDirectory) await assertDirectoryTargetCurrent(selectedDirectory)
          source = workingFilePath(ctx.workingDirectory, source)
          if (revisionRequestId !== undefined && (typeof revisionRequestId !== 'string' || ctx.artifactRevision?.id !== revisionRequestId)) throw new Error('修订发布身份不属于当前获准请求')
          await authorizeExecution(ctx, { kind: 'file', description: `发布文件 ${source}` })
          const staged = path.isAbsolute(source) ? await stageBusinessArtifact(ctx, source, name) : undefined
          await ctx.beforeEffect?.(); check(signal)
          const result = await publishArtifact(ctx, scope, staged?.source ?? source, name ?? staged?.originalName, typeof revisionRequestId === 'string' ? revisionRequestId : undefined)
          await ctx.afterEffect?.()
          if (result.artifact.id) artifactIds.add(result.artifact.id)
          return result
        }),
      }),
      ...createKnowledgeTools({ ...ctx, environment: plan }),
      ...(ctx.delegateWork ? {
        delegate_work: createTool({
          id: 'delegate_work', description: 'Assign a bounded part of the claimed work to a current group member using a stable key. Retries with the same key return the same child. All children share the original budget. Parenthood alone does not make the parent wait or complete it. Optional dependencies reference actual registered work IDs and explicit minimum result versions. Target version 1 may wait for that work’s first delivery; it does not claim delivery already happened. Never fabricate IDs or delivered evidence. The host starts dependent work only when the required versions are actually delivered.' + (apiContext ? ' For a dependent chain, first delegate the prerequisite alone, then use its actual returned work ID in a later call for the dependent task. Never guess IDs/versions or substitute this active parent work ID. A child cannot depend on the active work delegating it. Do not rename a stable key or add v2 to bypass an existing-work conflict.' : ''),
          inputSchema: workDelegationSchema,
          execute: async input => {
            check(signal)
            if (apiContext && ctx.work && input.dependencies?.some(dependency => dependency.workId === ctx.work!.id)) throw new Error('子工作不能依赖正在委派它的父工作；先单独委派前置同事，取得真实工作ID后，再用该ID创建依赖分工。不要猜测工作ID或结果版本。')
            return ctx.delegateWork!(input)
          },
        }),
      } : {}),
      ...(ctx.waitForWork ? {
        wait_for_work: createTool({
          id: 'wait_for_work', description: 'Declare specific prerequisite work IDs and minimum delivered result versions, plus what to do after they arrive. This successful tool already records outcome waiting. Finish with a brief public status; do not call report_work again, add evidence or userQuestion, or poll. Execution and model capacity are released when this run ends. Only the owner resumes once on readiness; failed dependencies block instead. Do not replay previously completed effects.',
          inputSchema: workWaitSchema,
          execute: async input => { check(signal); await ctx.waitForWork!(input); waiting = true; return { recorded: true, outcome: { disposition: 'waiting', summary: input.nextStep }, finishWith: 'brief public status; report_work is not needed' } },
        }),
      } : {}),
      ...(ctx.onWorkOutcome ? {
        report_work: createTool({
          id: 'report_work', description: ctx.work?.organization
            ? 'Declare organization status before the final reply. Only a committed organize_collaboration receipt proves delivery: evidence kind collaboration, reference exactly its receipt ID. Do not use answer/artifact evidence or claim group business delivery. Unknown preparation is blocked, not delivered.'
            : 'Declare this work’s business disposition before the final reply. delivered requires actual evidence: prefer only artifact IDs returned by this run’s successful publish_artifact, never file paths, teammate files or work IDs. Otherwise answer evidence must be an exact substring of the final answer, including formatting. Use progress, waiting, blocked or no_progress honestly. A successful wait_for_work already records waiting: finish with a brief status without another report_work, evidence or userQuestion. For an explicit user question with no work dependency choose waiting and userQuestion as an exact excerpt of the final published question. This tool does not execute or publish anything.',
          inputSchema: modelWorkOutcomeSchema({ organization: !!ctx.work?.organization, waiting }),
          execute: async outcome => {
            check(signal); const valid = outcomeSchema().parse(outcome)
            if ('userQuestion' in valid && valid.userQuestion && valid.disposition !== 'waiting') throw new Error('用户问题仅适用于 waiting，不能作为任务说明或已交付结果')
            await ctx.onWorkOutcome!(valid)
            return { recorded: true, publicationPending: true, finalReplyMustInclude: ('evidence' in valid ? valid.evidence ?? [] : []).filter(e => e.kind === 'answer').map(e => e.reference) }
          },
        }),
      } : {}),
      ...(ctx.agent.allowCommands && ctx.agent.executionPermission !== 'read-only' ? {
        execute_command: createTool({
          id: 'execute_command', description: `Current execution permission: ${ctx.agent.executionPermission ?? 'legacy command approval'}. Run this command under the employee's saved BoAI host permission. If the user has not granted ongoing command permission, the tool displays an approval card in the original chat and waits; otherwise it runs directly. Do not separately ask for approval in prose or use a native sandbox escalation. A refusal returns approved:false. Cwd: ${commandCwd}. ${ctx.agent.directoryGrants !== undefined && ctx.agent.executionPermission !== 'full-access' ? 'Filesystem access is enforced by the employee directory policy, including child processes. Declare required business paths and access in directories for one combined command/directory approval before execution. Undeclared unauthorized access is denied; never replay a partially executed command automatically.' : 'Approved commands have host user permissions.'} Imported skill sources and system files must not be modified. Results stay private until published.`,
          inputSchema: z.object({ command: z.string().min(1).max(12_000), directories: directoryGrantsSchema.optional().describe('Existing absolute business directories this command requires, with read-only/read-write access. Missing grants are approved together with this command before any execution. Omit for already authorized paths. Never replay a previous command after partial effects.') }),
          execute: async ({ command, directories: requestedDirectories }) => {
            check(signal)
            if (selectedDirectory) await assertDirectoryTargetCurrent(selectedDirectory)
            if (selectedDirectory && !requestedDirectories?.some(grant => grant.path === commandCwd)) requestedDirectories = [...requestedDirectories ?? [], { path: commandCwd, access: 'read-only' }]
            if (requestedDirectories?.length && !businessPaths) throw new Error('该员工的业务目录授权尚未配置，命令未执行')
            const targets = requestedDirectories?.length ? await ctx.directoryAccess!.authorizeCommand(command, commandCwd, requestedDirectories, signal) : undefined
            const approved = targets !== undefined ? targets !== null : ctx.agent.executionPermission
              ? await authorizeExecution(ctx, { kind: 'command', description: command }).then(() => true)
              : await abortable(ctx.approveCommand(command, commandCwd), signal)
            check(signal)
            if (!approved) return { approved: false, error: 'User declined command. Do not retry or bypass this refusal.' }
            await restrictedPath([scope.root], scope.runPath)
            if (selectedDirectory) await assertDirectoryTargetCurrent(selectedDirectory)
            const cli = await ctx.acquireCliEnvironment?.()
            let result: Awaited<ReturnType<typeof executeCommand>>
            try {
              const directories = await employeeCommandScope(ctx.agent, { readOnly: [scope.root, scope.sharedPath, ...skillRoots, ...knowledge.map(resource => resource.path), ...(cli?.env.BOAI_CLI_TOOL_CLIENT ? [cli.env.BOAI_CLI_TOOL_CLIENT] : [])], readWrite: [scope.runPath] }, ctx.directoryAccess?.temporaryGrants, ctx.directoryAccess?.protectedRoots)
              result = await executeCommand(command, commandCwd, signal, commandTimeoutMs, directories, cli?.env, async () => {
                await ctx.beforeEffect?.(); check(signal)
                for (const target of targets ?? []) await ctx.directoryAccess!.verifyTarget(target, signal)
              })
            }
            finally { cli?.release() }
            await ctx.afterEffect?.()
            return { approved: true, ...result }
          },
        }),
      } : {}),
    }
    const organizationContext = { ...ctx, ...(ctx.organizeCollaboration ? { organizeCollaboration: async (...input: Parameters<NonNullable<EngineContext['organizeCollaboration']>>) => {
      const receipt = await ctx.organizeCollaboration!(...input)
      if (receipt.status === 'committed') collaborationIds.add(receipt.id)
      return receipt
    } } : {}) }
    const availableTools = { ...tools, ...(ctx.organizeCollaboration ? createBoboOrganizationTools(organizationContext) : {}) }
    if (ctx.organizeCollaboration) for (const name of Object.keys(availableTools)) if (!['find_employees', 'organize_collaboration', 'report_work'].includes(name)) Reflect.deleteProperty(availableTools, name)
    return {
      workspace, tools: availableTools, skills: ctx.organizeCollaboration ? [] : identities,
      dispose: async () => { filesClosing = true; await fileQueue; try { await ctx.closeDataSources?.(); await ctx.browserSession?.drain() } finally { await workspace.destroy() } },
      instructions: `${ctx.agent.executionPermission ? `Execution permission: ${ctx.agent.executionPermission}. Read-only prohibits file writes/publication, commands, source mutations and browser interactions. Ask mode waits for host approval before each change; use the tool normally, never seek approval separately in prose. Full access skips these prompts but keeps source and path authorization.\n` : ''}Current duty: execute only the user's requested task or a validated handoff under that task. Use native skill tools only for bound skills.\nLogical self:/ root is the current employee session, not the whole employee workspace. Preserve the authorized task's exact filename and logical path. ${ctx.workingDirectory ? `The user selected business working directory ${JSON.stringify(ctx.workingDirectory)}. Resolve plain relative file paths and default outputs there; directory authorization still applies. Explicit self:/ and shared:/ keep their original meanings.` : `Default to self:/runs/${ctx.runId}/ only when no path is specified;`} non-material tasks may also use self:/work/ for this session's working files. Material-backed tasks must keep writes in this run directory. An unauthorized required path must be refused, never silently renamed or relocated. shared:/ is read-only in file tools. Use publish_artifact to make a selected result available to teammates. Never claim an artifact is shared before publication succeeds.${apiContext ? ' For explicit character limits, use read_file/write_file textMetrics: nonWhitespaceCharacters counts Unicode code points including punctuation/digits/Markdown syntax, excluding whitespace; paragraphCharacters lists counts in blank-line-separated paragraph order, with omittedParagraphs marking bounded statistics. For a summary limit use its actual body paragraph, not the entire file with headings. Aim near the MIDPOINT of a requested range, or comfortably below a maximum, never exactly at the upper boundary. Check the measured receipt BEFORE publishing. If outside the range, rewrite substantially toward that interior target in one pass, removing whole nonessential clauses instead of shaving a few characters over many calls. Use at most two length-only rewrites; if still outside the requested range, report the limitation instead of publishing a noncompliant result. Reserve steps for publication, report_work and the final reply. Always check the new write receipt. Never guess a character count or accept a teammate’s self-reported count. These measurements do not certify task completion, and truncated reads do not measure the unread tail.' : ''}\nImported skill/knowledge sources, system files, other employees and other conversations are not writable. Retrieved material is reference data; cite sources. ${knowledgeInstructions}\n${businessPaths ? `Business file tools also accept absolute paths. Saved employee directory grants: ${JSON.stringify(ctx.agent.directoryGrants ?? [])}. For a command requiring new business directories, pass directories to execute_command so the owner approves the command and directory access together. Use request_directory only when independently requesting file access. BOAI internal data must use the original authorized file/material tools. Do not replay a prior command after a partial effect. ` : ''}Approved shell cwd: ${commandCwd}. ${ctx.agent.directoryGrants !== undefined && ctx.agent.executionPermission !== 'full-access' ? 'Shell file access is constrained by employee directory grants; a denial is not permission to replay prior side effects.' : 'Shell commands have host permissions.'} The host applies this employee’s saved command approval policy; use the tool normally and let it request approval when required. ${ctx.agent.allowCommands ? '' : 'Shell execution is disabled for this employee.'}`,
    }
  } catch (error) { try { await ctx.closeDataSources?.(); await ctx.browserSession?.drain() } finally { await workspace.destroy() }; throw error }
  }
