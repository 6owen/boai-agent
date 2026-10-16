/*
 * [OUTPUT]: 运行时插件成果修订复用原profile与固定来源核验。
 * [OUTPUT]: 2026-10-15渠道镜像/独立内部讨论与明确外发按16组03 §14；源码与实际检查归02 §7.21。
 * [OUTPUT]: 固定渠道文件可在直属内部讨论修订，源hash/权限/清理代际逐次核验；新版本归内部工作，版本链保持且不自动外发。
 * [OUTPUT]: 2026-10-14 归一成果按已核对旧房间关系读取/备份恢复/hash清理，不搬动或错删原件。
 * [OUTPUT]: 2026-10-14 本人渠道消息可修订主私聊当前员工成果；核对真实渠道/本人关联而非强制渠道房间。
 * [OUTPUT]: 外部渠道原生修订核对同平台/聊天原成果与当前机器人/发送者授权，单独记录请求者；本机采用/原修订资格保持。
 * [OUTPUT]: 仅明确预览在原hash核读后返回PDF/Office字节；文本采用/修订/index门禁和原20MiB发布限制保持。
 * [OUTPUT]: Claude成果修订使用同一版本/请求合同，受理前核对明确API来源和已验证本机程序。
 * [OUTPUT]: 未提交发布保留精确相对路径/hash/来源指纹，禁止历史导入；登记与准备记录清除同事务，清理沿原hash门禁。
 * [OUTPUT]: 原生Codex修订沿原成果版本与新根Work，事务核对已验证连接；旧ACP仍保持任务限制。
 * [INPUT]: 宿主复制时 hash 的已发布原件/明确来源绑定、ProductStore 事务、用户修订/采用/显式待验收与事务内材料来源校验。
 * [OUTPUT]: 修订目标沿固定核心身份复用未选择连接时的首个有效默认，显式失效选择不回退；发布保留宿主真实浏览器有界来源； 正文索引保持严格 UTF-8 TXT/MD，独立预览核对同次 hash 字节支持 Markdown/代码/纯文本；固定本人/版/hash 的显式待验收资格与原事务终结/最小清理回执；独立成果链、核验字节供工具读取、用户修订/幂等采用及安全清理与仅核对恢复。
 * [POS]: workspaces 的成果持久权威；不按同名关联，不改 Work 结果/预算，不执行模型或继承旧审核。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import { resolvePluginRuntime } from '../backends/runtime-config'
import { resolveClaudeRuntime } from '../backends/runtime-config'
import { assertChannelSourceAccess } from '../channels/channel-workspace'
import { createHash, randomUUID } from 'node:crypto'
import { constants } from 'node:fs'
import { lstat, open, realpath, unlink } from 'node:fs/promises'
import { isAbsolute, join, parse, relative, resolve, sep } from 'node:path'
import { isCoreAgent } from '../../../shared/domain/core-agent'
import type { AgentRun, Connection, Conversation, DigitalAgent, Message, WorkItem } from '../../../shared/domain'
import type { MaterialReadRef } from '../../../shared/domain/materials'
import type { ChannelBinding, ChannelMessageSource } from '../../../shared/domain/channels'
import type { ChannelTarget } from '../channels/channel-service'
import type { LaunchProfile } from '../../../shared/domain/backends'
import { previewBinaryFile, previewFile } from '../../../shared/domain/file-preview'
import { ARTIFACT_LIMITS, type ArtifactAcceptance, type ArtifactAcceptanceInput, type ArtifactAcceptanceReceipt, type ArtifactAcceptanceStatus, type ArtifactAdoptionCurrent, type ArtifactAdoptionEvent, type ArtifactAdoptionInput, type ArtifactAdoptionReceipt, type ArtifactAdoptionState, type ArtifactPreview, type ArtifactPublication, type ArtifactRegistration, type ArtifactRevisionInput, type ArtifactRevisionPrepared, type ArtifactRevisionRequest, type ArtifactRevisionSource, type ArtifactVersion } from '../../../shared/domain/artifacts'
import { ProductStore, type RecordTransaction } from '../../adapters/storage/product-store'
import { contained, MAX_FILE_BYTES } from './file-access'

interface Tombstone { id: string; conversationId: string; fingerprint: string; cleared?: boolean }
type StoredArtifact = ArtifactPublication & Partial<ArtifactVersion>
interface Cleanup { id: string; conversationId: string; storageConversationId?: string; managedRelativePath: string; contentHash: string; status: 'pending' | 'conflict'; error?: string }
interface PublicationIntent { id: string; conversationId: string; storageConversationId?: string; managedRelativePath: string; contentHash: string; fingerprint: string }
interface Options {
  validateSources?(refs: MaterialReadRef[], agentId: string | undefined, conversationId: string, tx: RecordTransaction): Promise<void>
  checkpoint?(stage: 'after-read' | 'before-adoption-commit' | 'before-acceptance-commit' | 'before-cleanup', id: string): Promise<void>
}
class ContentError extends Error {}
class AcceptanceSourceError extends ContentError {}
const clone = <T>(value: T): T => structuredClone(value)
const digest = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const record = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const identifier = (value: string) => { if (!/^[a-zA-Z0-9_-]{1,200}$/.test(value)) throw new Error('无效成果或请求标识'); return value }
const known = (value: ArtifactPublication & Partial<ArtifactVersion>): value is ArtifactVersion => Boolean(value.id && value.conversationId && value.logicalArtifactId && value.contentVersion && value.contentStatus && value.registrationSource)
function errorText(error: unknown) {
  const code = (error as NodeJS.ErrnoException)?.code
  if (code === 'ENOENT') return '成果文件不存在或已被移走'
  if (code === 'EACCES' || code === 'EPERM') return '没有权限读取或清理成果文件'
  if (error instanceof Error && !code && !/[/\\]/.test(error.message)) return error.message
  return '成果文件核对失败，请检查受管原件'
}
async function noLinks(file: string, allowMissing = false) {
  let current = parse(file).root
  for (const part of relative(current, file).split(sep).filter(Boolean)) {
    current = join(current, part)
    try { if ((await lstat(current)).isSymbolicLink()) throw new ContentError('成果路径不能包含符号链接') }
    catch (error) { if (allowMissing && (error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error }
  }
}
function markdown(bytes: Buffer) {
  if (bytes.length > ARTIFACT_LIMITS.previewBytes) throw new ContentError('Markdown 预览最多 1 MiB')
  let text: string
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) }
  catch { throw new ContentError('Markdown 成果必须是有效 UTF-8 文本') }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new ContentError('Markdown 成果包含二进制或不支持的控制字符')
  if (text.length > ARTIFACT_LIMITS.previewCharacters) throw new ContentError('Markdown 预览最多 200000 个字符')
  if (!text.trim()) throw new ContentError('成果没有可预览的正文')
  return text
}

export class ArtifactRepository {
  constructor(private readonly store: ProductStore, private readonly dataPath: string, private readonly options: Options = {}) {}

  private async conversation(tx: RecordTransaction, conversationId: string) {
    identifier(conversationId)
    const conversation = await tx.get<Conversation>('conversations', conversationId)
    if (!conversation || await tx.get('conversationCleanup', conversationId)) throw new Error('成果所属聊天不存在或正在清理')
    return conversation
  }
  private async target(tx: RecordTransaction, conversationId: string, agentId: string) {
    const conversation = await this.conversation(tx, conversationId), agent = await tx.get<DigitalAgent>('agents', identifier(agentId))
    if (!agent?.active || !conversation.agentIds.includes(agent.id)) throw new Error('请明确选择当前聊天中可执行的员工')
    if (agent.executionBackend?.kind === 'acp-local') throw new Error('首批成果修订不支持外部 ACP 员工')
    if (agent.executionBackend?.kind === 'runtime-plugin') { resolvePluginRuntime(agent, await tx.get<LaunchProfile>('launchProfiles', agent.executionBackend.profileId)); return agent }
    if (agent.executionBackend?.kind === 'claude-local') {
      resolveClaudeRuntime(agent, await tx.get<LaunchProfile>('launchProfiles', agent.executionBackend.profileId), await tx.get<Connection>('connections', agent.connectionId))
      return agent
    }
    if (agent.executionBackend?.kind === 'codex-local') {
      const profile = await tx.get<LaunchProfile>('launchProfiles', agent.executionBackend.profileId)
      if (profile?.protocol !== 'codex-app-server' || !profile.verified) throw new Error('请先测试修订员工的本机 Codex 连接')
      return agent
    }
    const connection = !agent.connectionId && isCoreAgent(agent)
      ? (await tx.list<Connection>('connections')).find(value => value.defaultModel.trim() && (value.provider !== 'openai-compatible' || value.baseUrl.trim()))
      : await tx.get<Connection>('connections', agent.connectionId)
    if (!connection || !(agent.modelId || connection.defaultModel) || connection.provider === 'openai-compatible' && !connection.baseUrl) throw new Error('修订员工没有可用的 API 模型连接')
    return agent
  }
  private async sourceRefs(tx: RecordTransaction, artifact: ArtifactVersion | ArtifactPublication, conversationId: string, agentId?: string) {
    if (!artifact.materialSources?.length) return
    if (!this.options.validateSources) throw new Error('成果材料来源校验尚未接入，不能扩大访问')
    await this.options.validateSources(clone(artifact.materialSources), agentId, conversationId, tx)
  }
  private async version(tx: RecordTransaction, artifactId: string) {
    const artifact = await tx.get<ArtifactVersion>('artifacts', identifier(artifactId))
    if (!artifact || !known(artifact)) throw new Error('成果不存在或尚未经过宿主核对')
    return artifact
  }
  private async storageRoom(tx: RecordTransaction, artifact: { conversationId: string; storageConversationId?: string }) {
    if (!artifact.storageConversationId) return artifact.conversationId
    let room = await tx.get<Conversation>('conversations', artifact.storageConversationId)
    const seen = new Set<string>()
    while (room?.mergedInto && !seen.has(room.id)) { seen.add(room.id); room = await tx.get<Conversation>('conversations', room.mergedInto) }
    if (room?.id !== artifact.conversationId) throw new ContentError('成果原存储房间与当前聊天归一关系失效')
    return artifact.storageConversationId
  }
  private async location(conversationId: string, file?: string, managedRelativePath?: string, allowMissing = false, verifyLinks = true) {
    const dataRoot = await realpath(this.dataPath), workspace = join(dataRoot, 'workspaces', identifier(conversationId))
    let target: string
    if (managedRelativePath !== undefined) {
      if (!managedRelativePath.startsWith('artifacts/') || managedRelativePath.includes('\\') || managedRelativePath.split('/').some(part => !part || part === '.' || part === '..')) throw new ContentError('成果受管文件引用无效')
      target = join(workspace, managedRelativePath)
    } else {
      if (!file || !isAbsolute(file)) throw new ContentError('成果必须来自受管发布目录')
      const rawWorkspace = join(resolve(this.dataPath), 'workspaces', conversationId), candidate = resolve(file)
      target = contained(rawWorkspace, candidate) ? join(workspace, relative(rawWorkspace, candidate)) : candidate
    }
    const root = join(workspace, 'artifacts')
    if (target === root || !contained(root, target)) throw new ContentError('成果文件不在本聊天的受管发布目录')
    if (verifyLinks) await noLinks(target, allowMissing)
    return { path: target, managedRelativePath: relative(workspace, target).split(sep).join('/') }
  }
  private async bytes(conversationId: string, artifactId: string, file?: string, managedRelativePath?: string, maxBytes = ARTIFACT_LIMITS.publicationBytes) {
    try { return await this.readBytes(conversationId, artifactId, file, managedRelativePath, maxBytes) }
    catch (error) { if (error instanceof ContentError) throw error; throw new ContentError(errorText(error)) }
  }
  private async readBytes(conversationId: string, artifactId: string, file?: string, managedRelativePath?: string, maxBytes = ARTIFACT_LIMITS.publicationBytes) {
    const location = await this.location(conversationId, file, managedRelativePath)
    const beforePath = await lstat(location.path)
    if (!beforePath.isFile() || beforePath.nlink > 1) throw new ContentError('成果只能是无链接的普通文件')
    const handle = await open(location.path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const before = await handle.stat()
      if (!before.isFile() || before.nlink > 1 || before.ino !== beforePath.ino || before.dev !== beforePath.dev) throw new ContentError('成果文件身份已改变')
      if (before.size > maxBytes) throw new ContentError(maxBytes === ARTIFACT_LIMITS.previewBytes ? '正文索引每份文件最多 1 MiB' : '发布成果最多 20 MiB')
      const buffer = Buffer.alloc(before.size + 1); let size = 0
      for (;;) { const read = await handle.read(buffer, size, buffer.length - size, null); size += read.bytesRead; if (size > before.size) throw new ContentError('成果在读取时已改变'); if (!read.bytesRead) break }
      await this.options.checkpoint?.('after-read', artifactId)
      const after = await handle.stat(), current = await lstat(location.path); await noLinks(location.path)
      if (!current.isFile() || current.nlink > 1 || current.ino !== before.ino || current.dev !== before.dev || size !== before.size || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs) throw new ContentError('成果在读取时已改变')
      const bytes = buffer.subarray(0, size)
      return { ...location, bytes, size, contentHash: digest(bytes) }
    } catch (error) { if (error instanceof ContentError) throw error; throw new ContentError(errorText(error)) }
    finally { await handle.close() }
  }
  private async checked(tx: RecordTransaction, artifact: ArtifactVersion, expectedHash?: string, agentId?: string, requirePreview = true, readText: boolean | 'search' = false, allowUnsupported = false): Promise<Pick<ArtifactPreview, 'artifact' | 'text' | 'filePreview' | 'binaryPreview'>> {
    await this.conversation(tx, artifact.conversationId)
    if (expectedHash !== undefined && expectedHash !== artifact.contentHash) throw new Error('成果内容身份已更新，请重新打开所见版本')
    if (artifact.contentStatus === 'removed' || !artifact.contentHash) throw new Error(artifact.contentError ?? '成果尚无可信内容身份')
    await this.sourceRefs(tx, artifact, artifact.conversationId, agentId)
    const actual = await this.bytes(await this.storageRoom(tx, artifact), artifact.id, undefined, artifact.managedRelativePath, readText === 'search' ? ARTIFACT_LIMITS.previewBytes : ARTIFACT_LIMITS.publicationBytes)
    if (actual.contentHash !== artifact.contentHash) throw new ContentError('成果已被外部修改，原文件已保留')
    const filePreview = requirePreview ? previewFile(artifact.name, actual.bytes) : undefined
    if (filePreview?.kind === 'unsupported' && !allowUnsupported) throw new Error(filePreview.reason)
    if (readText && actual.size > MAX_FILE_BYTES) throw new ContentError('文本文件最多 1 MiB')
    const text = filePreview?.text ?? (readText === 'search' ? markdown(actual.bytes) : readText ? actual.bytes.toString('utf8') : ''), verified: ArtifactVersion = { ...clone(artifact), path: actual.path, ...(filePreview ? { contentStatus: filePreview.kind === 'unsupported' ? 'unsupported' as const : 'ready' as const } : {}) }
    if (filePreview?.kind === 'unsupported') verified.contentError = filePreview.reason
    else if (filePreview) delete verified.contentError
    if (verified.path !== artifact.path || verified.contentStatus !== artifact.contentStatus || verified.contentError !== artifact.contentError) await tx.put(record('artifacts', verified))
    const binaryPreview = requirePreview && allowUnsupported ? previewBinaryFile(artifact.name, actual.bytes) : undefined
    return { artifact: verified, text, ...(filePreview ? { filePreview } : {}), ...(binaryPreview ? { binaryPreview } : {}) }
  }
  private async unavailable(artifactId: string, error: unknown) {
    await this.store.transaction(async tx => {
      const artifact = await tx.get<ArtifactVersion>('artifacts', artifactId)
      if (!artifact || !known(artifact) || artifact.contentStatus === 'removed') return
      artifact.contentStatus = 'unavailable'; artifact.contentError = errorText(error)
      await tx.put(record('artifacts', artifact))
      await this.finishAcceptance(tx, artifact.id, 'unavailable', artifact.contentError)
    })
  }

  private publicationFingerprint(publication: ArtifactPublication, binding: ArtifactRegistration, managedRelativePath: string) {
    return digest(JSON.stringify([publication.id, binding.conversationId, managedRelativePath, publication.name, publication.contentHash, publication.size, publication.ownerAgentId, publication.runId ?? null, binding.sourceWorkId, binding.sourceMessageId, binding.revisionRequestId]))
  }

  async preparePublication(tx: RecordTransaction, publication: ArtifactPublication, binding: ArtifactRegistration): Promise<void> {
    const conversation = await this.conversation(tx, binding.conversationId), id = identifier(publication.id ?? '')
    if (publication.conversationId && publication.conversationId !== conversation.id) throw new Error('成果发布聊天不一致')
    if (!publication.contentHash || !/^[0-9a-f]{64}$/.test(publication.contentHash)) throw new Error('成果发布缺少宿主复制时的内容身份')
    const author = publication.ownerAgentId ? await tx.get<DigitalAgent>('agents', identifier(publication.ownerAgentId)) : undefined
    if (!author?.active || !conversation.agentIds.includes(author.id)) throw new Error('成果作者不是当前聊天中的有效成员')
    const location = await this.location(conversation.id, publication.path, undefined, true)
    const intent: PublicationIntent = { id, conversationId: conversation.id, managedRelativePath: location.managedRelativePath, contentHash: publication.contentHash, fingerprint: this.publicationFingerprint(publication, binding, location.managedRelativePath) }
    if (await tx.get('artifacts', id)) throw new Error('成果发布身份已经提交')
    const existing = await tx.get<PublicationIntent>('artifactPublicationIntents', id)
    if (existing && existing.fingerprint !== intent.fingerprint) throw new Error('成果发布准备身份已用于不同内容或来源')
    await tx.put(record('artifactPublicationIntents', intent))
  }

  async pendingPublicationPaths(conversationId: string): Promise<Set<string>> {
    return new Set((await this.store.load<PublicationIntent>('artifactPublicationIntents')).filter(value => value.conversationId === identifier(conversationId)).map(value => value.managedRelativePath))
  }

  async register(tx: RecordTransaction, publication: ArtifactPublication, binding: ArtifactRegistration): Promise<ArtifactVersion> {
    const conversation = await this.conversation(tx, binding.conversationId), artifactId = identifier(publication.id ?? randomUUID())
    if (publication.conversationId && publication.conversationId !== conversation.id) throw new Error('成果发布聊天不一致')
    if (!publication.contentHash || !/^[0-9a-f]{64}$/.test(publication.contentHash)) throw new Error('成果发布缺少宿主复制时的内容身份')
    if (!publication.name || /[\\/:\0]/.test(publication.name)) throw new Error('成果名称无效')
    if (!publication.ownerAgentId) throw new Error('成果发布缺少宿主作者身份')
    const author = await tx.get<DigitalAgent>('agents', identifier(publication.ownerAgentId))
    if (!author?.active || !conversation.agentIds.includes(author.id)) throw new Error('成果作者不是当前聊天中的有效成员')
    const work = binding.sourceWorkId ? await tx.get<WorkItem>('workItems', identifier(binding.sourceWorkId)) : undefined
    if (binding.sourceWorkId && (!work || work.conversationId !== conversation.id || work.ownerAgentId !== publication.ownerAgentId)) throw new Error('成果源工作身份与宿主作者不一致')
    if (binding.sourceMessageId) {
      const message = await tx.get<Message>('messages', identifier(binding.sourceMessageId))
      if (!message || message.conversationId !== conversation.id || message.status !== 'completed') throw new Error('成果来源消息尚未真实提交')
    }
    if (publication.runId) {
      const run = await tx.get<AgentRun>('runs', identifier(publication.runId))
      if (!run || run.conversationId !== conversation.id || run.agentId !== publication.ownerAgentId || (binding.sourceWorkId && run.workId !== binding.sourceWorkId)) throw new Error('成果来源运行与宿主绑定不一致')
    }
    let previous: ArtifactVersion | undefined, revisionRequest: ArtifactRevisionRequest | undefined
    if (binding.revisionRequestId) {
      revisionRequest = await this.revision(tx, binding.revisionRequestId)
      if (revisionRequest.channelSource) await this.authorizeChannelRevision(tx, revisionRequest, (await tx.get<Message>('messages', revisionRequest.messageId))!)
      if (revisionRequest.conversationId !== conversation.id || revisionRequest.targetAgentId !== publication.ownerAgentId || !work || work.parentWorkId || work.origin || work.id !== revisionRequest.rootWorkId || work.revisionRequestId !== revisionRequest.id || work.sourceMessageId !== revisionRequest.messageId) throw new Error('只有明确修订请求的新根工作负责人可以发布新版')
      previous = await this.version(tx, revisionRequest.artifactId)
      await assertChannelSourceAccess(tx, conversation.id, previous.conversationId)
      if (previous.logicalArtifactId !== revisionRequest.logicalArtifactId) throw new Error('修订原成果身份与明确请求不一致')
      await this.target(tx, conversation.id, publication.ownerAgentId)
      await this.checked(tx, previous, revisionRequest.contentHash, revisionRequest.targetAgentId)
    }
    const actual = await this.bytes(conversation.id, artifactId, publication.path)
    if (publication.contentHash !== actual.contentHash) throw new ContentError('成果发布后已被外部修改，原文件已保留')
    const intent = await tx.get<PublicationIntent>('artifactPublicationIntents', artifactId)
    if (intent && intent.fingerprint !== this.publicationFingerprint(publication, binding, actual.managedRelativePath)) throw new Error('成果与复制前登记的发布身份不一致')
    const existing = await tx.get<StoredArtifact>('artifacts', artifactId)
    if (existing?.conversationId && existing.conversationId !== conversation.id) throw new Error('成果发布身份已属于另一聊天')
    if (existing && known(existing)) {
      if (existing.conversationId !== conversation.id || existing.contentHash !== actual.contentHash || existing.managedRelativePath !== actual.managedRelativePath || (existing.revisionRequestId ?? null) !== binding.revisionRequestId || (existing.sourceWorkId ?? null) !== binding.sourceWorkId) throw new Error('成果发布身份已用于不同内容或来源')
      await this.sourceRefs(tx, existing, conversation.id, publication.ownerAgentId)
      return clone(existing)
    }
    const logicalArtifactId = previous?.logicalArtifactId ?? artifactId
    const family = (await tx.list<ArtifactVersion>('artifacts')).filter(value => known(value) && value.logicalArtifactId === logicalArtifactId)
    const artifact: ArtifactVersion = { id: artifactId, conversationId: conversation.id, name: publication.name, path: actual.path, size: actual.size, ownerAgentId: publication.ownerAgentId, runId: publication.runId, sourcePath: publication.sourcePath, publishedAt: publication.publishedAt ?? new Date().toISOString(), browserSources: publication.browserSources ? clone(publication.browserSources.slice(0,20)) : undefined, materialSources: publication.materialSources ? clone(publication.materialSources) : undefined, logicalArtifactId, contentVersion: Math.max(0, ...family.map(value => value.contentVersion)) + 1, contentHash: actual.contentHash, contentStatus: 'ready', managedRelativePath: actual.managedRelativePath, registrationSource: 'publication', ...(binding.sourceWorkId ? { sourceWorkId: binding.sourceWorkId } : {}), ...(binding.sourceMessageId ? { sourceMessageId: binding.sourceMessageId } : {}), ...(previous ? { previousArtifactId: previous.id, revisionRequestId: revisionRequest!.id } : {}) }
    await this.sourceRefs(tx, artifact, conversation.id, publication.ownerAgentId)
    const filePreview = previewFile(artifact.name, actual.bytes)
    if (filePreview.kind === 'unsupported') { artifact.contentStatus = 'unsupported'; artifact.contentError = filePreview.reason }
    await tx.put(record('artifacts', artifact))
    await tx.remove('artifactPublicationIntents', artifactId)
    if (previous) await this.finishFamilyAcceptances(tx, logicalArtifactId, 'superseded')
    return clone(artifact)
  }

  async registerLegacy(tx: RecordTransaction, publication: ArtifactPublication, conversationId: string): Promise<ArtifactVersion> {
    await this.conversation(tx, conversationId)
    if (!publication.name || /[\\/:\0]/.test(publication.name)) throw new Error('成果名称无效')
    // Keep bounded historical metadata visible even when its original is now a link or missing.
    const location = await this.location(conversationId, publication.path, undefined, true, false)
    if ((await tx.list<PublicationIntent>('artifactPublicationIntents')).some(value => value.conversationId === conversationId && value.managedRelativePath === location.managedRelativePath)) throw new Error('未提交的发布原件不能登记为历史成果')
    const existing = publication.id ? await tx.get<StoredArtifact>('artifacts', identifier(publication.id)) : (await tx.list<StoredArtifact>('artifacts')).find(value => value.conversationId === conversationId && value.managedRelativePath === location.managedRelativePath)
    if (existing?.conversationId && existing.conversationId !== conversationId) throw new Error('历史成果身份已属于另一聊天')
    if (existing && known(existing)) { if (existing.managedRelativePath !== location.managedRelativePath) throw new Error('历史成果身份已绑定另一原件'); return clone(existing) }
    const artifactId = identifier(publication.id ?? existing?.id ?? randomUUID())
    const artifact: ArtifactVersion = { id: artifactId, conversationId, name: publication.name, path: location.path, size: publication.size, ownerAgentId: publication.ownerAgentId, runId: publication.runId, sourcePath: publication.sourcePath, publishedAt: publication.publishedAt, browserSources: publication.browserSources ? clone(publication.browserSources.slice(0,20)) : undefined, materialSources: publication.materialSources ? clone(publication.materialSources) : undefined, logicalArtifactId: artifactId, contentVersion: 1, contentHash: '', contentStatus: 'unavailable', managedRelativePath: location.managedRelativePath, registrationSource: 'legacy_verified' }
    // Historical files receive no inferred chain, review, adoption or source-work relationship.
    try {
      const actual = await this.bytes(conversationId, artifactId, undefined, location.managedRelativePath)
      artifact.contentHash = actual.contentHash; artifact.size = actual.size
      await this.sourceRefs(tx, artifact, conversationId)
      const filePreview = previewFile(artifact.name, actual.bytes)
      artifact.contentStatus = filePreview.kind === 'unsupported' ? 'unsupported' : 'ready'
      if (filePreview.reason) artifact.contentError = filePreview.reason; else delete artifact.contentError
    } catch (error) { artifact.contentError = errorText(error) }
    await tx.put(record('artifacts', artifact)); return clone(artifact)
  }

  async preview(artifactId: string, expectedHash?: string, agentId?: string): Promise<ArtifactPreview> {
    try { return await this.store.transaction(async tx => this.previewState(tx, await this.checked(tx, await this.version(tx, artifactId), expectedHash, agentId, true, false, true))) }
    catch (error) { if (error instanceof ContentError) await this.unavailable(artifactId, error); throw error }
  }
  async list(conversationId: string): Promise<ArtifactVersion[]> {
    return this.store.transaction(async tx => {
      await this.conversation(tx, conversationId)
      const artifacts = (await tx.list<ArtifactVersion>('artifacts')).filter(value => value.conversationId === conversationId && known(value))
      for (const artifact of artifacts) {
        try {
          const verified = await this.checked(tx, artifact, undefined, undefined, true, false, true); Object.assign(artifact, verified.artifact)
          if (artifact.contentStatus === 'ready') { delete artifact.contentError; await this.acceptanceInTransaction(tx, artifact.id, true) }
        }
        catch (error) { artifact.contentStatus = 'unavailable'; artifact.contentError = errorText(error); await this.finishAcceptance(tx, artifact.id, 'unavailable', artifact.contentError) }
        await tx.put(record('artifacts', artifact))
      }
      return artifacts.map(clone)
    })
  }

  private normalizedRevision(input: ArtifactRevisionInput) {
    identifier(input.conversationId); identifier(input.artifactId); identifier(input.targetAgentId); identifier(input.requestId)
    if (!/^[0-9a-f]{64}$/.test(input.contentHash) || typeof input.content !== 'string' || !input.content.trim() || input.content.length > ARTIFACT_LIMITS.revisionCharacters) throw new Error('请提供确定成果内容身份和有界修改要求')
    const normalized: ArtifactRevisionInput = { conversationId: input.conversationId, artifactId: input.artifactId, contentHash: input.contentHash, targetAgentId: input.targetAgentId, content: input.content.trim(), requestId: input.requestId }
    return { input: normalized, fingerprint: digest(JSON.stringify(normalized)) }
  }
  private async revision(tx: RecordTransaction, requestId: string) {
    const receipt = await tx.get<Tombstone>('artifactRevisionReceipts', identifier(requestId))
    if (receipt?.cleared) throw new Error('原修订请求已清理，旧请求不能重新执行')
    const request = await tx.get<ArtifactRevisionRequest>('artifactRevisionRequests', requestId)
    if (!request) throw new Error('原修订请求不存在或提交尚未完整核对')
    const message = await tx.get<Message>('messages', request.messageId)
    const senderMatches = request.channelSource ? !!message?.channel && message.senderId === request.requesterId && digest(JSON.stringify(message.channel)) === digest(JSON.stringify(request.channelSource)) : message?.senderId === 'user'
    if (!receipt || receipt.fingerprint !== request.fingerprint || !message || message.conversationId !== request.conversationId || message.senderType !== 'user' || !senderMatches || message.origin || message.status !== 'completed' || message.content !== request.content) throw new Error('修订请求与已提交的固定本人消息不一致')
    return request
  }
  async revisionReceipt(requestId: string): Promise<ArtifactRevisionRequest | null> {
    return this.store.transaction(async tx => {
      const receipt = await tx.get<Tombstone>('artifactRevisionReceipts', identifier(requestId))
      if (!receipt) return null
      const request = await this.revision(tx, requestId); await this.conversation(tx, request.conversationId); return clone(request)
    })
  }
  async revisionForMessage(messageId: string): Promise<ArtifactRevisionRequest | null> {
    identifier(messageId)
    return this.store.transaction(async tx => {
      const request = (await tx.list<ArtifactRevisionRequest>('artifactRevisionRequests')).find(value => value.messageId === messageId)
      if (!request) return null
      await this.conversation(tx, request.conversationId)
      return clone(await this.revision(tx, request.id))
    })
  }
  async prepareRevision(input: ArtifactRevisionInput): Promise<ArtifactRevisionPrepared> {
    const normalized = this.normalizedRevision(input)
    return this.store.transaction(async tx => {
      const receipt = await tx.get<Tombstone>('artifactRevisionReceipts', input.requestId)
      if (receipt && (receipt.cleared || receipt.fingerprint !== normalized.fingerprint)) throw new Error(receipt.cleared ? '原修订请求已清理，旧请求不能重新执行' : '修订 requestId 已用于不同内容')
      await this.target(tx, input.conversationId, input.targetAgentId)
      const artifact = await this.version(tx, input.artifactId)
      await assertChannelSourceAccess(tx, input.conversationId, artifact.conversationId)
      await this.checked(tx, artifact, input.contentHash, input.targetAgentId)
      return { input: normalized.input, artifact: clone(artifact), ...(receipt ? { request: clone(await this.revision(tx, input.requestId)) } : {}) }
    })
  }
  async commitChannelRevision(tx: RecordTransaction, input: ArtifactRevisionInput, message: Message): Promise<ArtifactRevisionRequest> {
    await this.authorizeChannelRevision(tx, input, message)
    return this.commitRevision(tx, input, message, message.channel)
  }
  private async authorizeChannelRevision(tx: RecordTransaction, input: Pick<ArtifactRevisionInput, 'conversationId' | 'artifactId' | 'targetAgentId'>, message: Message) {
    const source = message.channel, artifact = await this.version(tx, input.artifactId)
    // artifact.sourceMessageId names the published reply, not its requester.
    const originalRun = artifact.runId ? await tx.get<AgentRun>('runs', artifact.runId) : undefined
    const originalWork = artifact.sourceWorkId ? await tx.get<WorkItem>('workItems', artifact.sourceWorkId) : undefined
    const originalId = originalWork?.sourceMessageId ?? originalRun?.triggerMessageId
    const original = originalId ? await tx.get<Message>('messages', originalId) : undefined
    const conversation = await this.conversation(tx, input.conversationId)
    const binding = source ? await tx.get<ChannelBinding>('channelBindings', source.bindingId) : undefined
    const linkedOwner = source?.kind === 'direct' && conversation.mainPrivate && binding?.ownerUserId === source.userId && binding.agentId === input.targetAgentId
    const externalRoom = !!source && !!conversation.channel && source.platform === conversation.channel.platform && source.chatId === conversation.channel.chatId && source.tenantId === conversation.channel.tenantId && (source.kind !== 'direct' || conversation.channel.userId === source.userId)
    if (!source || !(linkedOwner || externalRoom) || message.senderType !== 'user' || message.senderId !== `channel-user:${digest(JSON.stringify([source.platform, source.tenantId, source.userId]))}` || original?.conversationId !== message.conversationId || artifact.conversationId !== message.conversationId || artifact.ownerAgentId !== input.targetAgentId) throw new Error('渠道修订只能引用当前获准聊天交付的原文件。')
    const bindings = await tx.list<ChannelBinding>('channelBindings'), targets = await tx.list<ChannelTarget>('channelTargets')
    if (!bindings.some(binding => binding.agentId === input.targetAgentId && binding.platform === source.platform && binding.allowedUserIds.includes(source.userId) && (source.kind === 'direct' ? binding.id === source.bindingId : binding.allowedChatIds.includes(source.chatId) && targets.some(target => target.bindingId === binding.id && target.conversationId === conversation.id)))) throw new Error('渠道发送者或员工绑定已失去修订授权。')
  }
  async commitRevision(tx: RecordTransaction, input: ArtifactRevisionInput, message: Pick<Message, 'id' | 'conversationId' | 'senderType' | 'senderId' | 'content'>, channelSource?: ChannelMessageSource): Promise<ArtifactRevisionRequest> {
    const normalized = this.normalizedRevision(input), receipt = await tx.get<Tombstone>('artifactRevisionReceipts', input.requestId)
    if (receipt) {
      if (receipt.cleared || receipt.fingerprint !== normalized.fingerprint) throw new Error(receipt.cleared ? '原修订请求已清理，旧请求不能重新执行' : '修订 requestId 已用于不同内容')
      const previous = await this.revision(tx, input.requestId)
      if (previous.messageId !== message.id) throw new Error('原修订请求已关联唯一用户消息，不能另建消息')
      return clone(previous)
    }
    await this.target(tx, input.conversationId, input.targetAgentId)
    const artifact = await this.version(tx, input.artifactId)
    await assertChannelSourceAccess(tx, input.conversationId, artifact.conversationId)
    await this.checked(tx, artifact, input.contentHash, input.targetAgentId)
    const committed = await tx.get<Message>('messages', identifier(message.id))
    const senderMatches = channelSource ? !!committed && committed.senderId === message.senderId && digest(JSON.stringify(committed.channel)) === digest(JSON.stringify(channelSource)) : committed?.senderId === 'user' && message.senderId === 'user'
    if (!committed || committed.conversationId !== input.conversationId || committed.senderType !== 'user' || !senderMatches || committed.origin || committed.content !== message.content || message.senderType !== 'user' || message.conversationId !== input.conversationId || committed.content !== normalized.input.content || committed.status !== 'completed') throw new Error('修订关系必须与同事务的固定本人原消息一致')
    const request: ArtifactRevisionRequest = { id: input.requestId, fingerprint: normalized.fingerprint, conversationId: input.conversationId, artifactId: artifact.id, contentHash: artifact.contentHash, logicalArtifactId: artifact.logicalArtifactId, targetAgentId: input.targetAgentId, content: normalized.input.content, messageId: committed.id, ...(channelSource ? { requesterId: committed.senderId, channelSource: clone(channelSource) } : {}), createdAt: new Date().toISOString() }
    await tx.put(record('artifactRevisionRequests', request)); await tx.put(record('artifactRevisionReceipts', { id: request.id, conversationId: request.conversationId, fingerprint: request.fingerprint } satisfies Tombstone))
    await this.finishAcceptance(tx, artifact.id, 'revision_requested')
    return clone(request)
  }
  async validateRevision(requestId: string, agentId: string, conversationId: string): Promise<ArtifactRevisionSource> {
    return this.store.transaction(async tx => {
      const request = await this.revision(tx, requestId)
      if (request.conversationId !== conversationId || request.targetAgentId !== agentId) throw new Error('修订来源不属于当前获准负责人')
      if (request.channelSource) await this.authorizeChannelRevision(tx, { ...request, targetAgentId: agentId }, (await tx.get<Message>('messages', request.messageId))!)
      await this.target(tx, conversationId, agentId)
      const artifact = await this.version(tx, request.artifactId)
      await assertChannelSourceAccess(tx, conversationId, artifact.conversationId)
      if (artifact.logicalArtifactId !== request.logicalArtifactId) throw new Error('修订原成果身份与明确请求不一致')
      const preview = await this.previewState(tx, await this.checked(tx, artifact, request.contentHash, agentId))
      const room = await this.conversation(tx, conversationId)
      // UI may inspect the whole family; an external execution cannot read private revisions.
      preview.versions = preview.versions.filter(version => version.conversationId === conversationId || version.conversationId === room.channelDiscussion?.conversationId)
      return { request: clone(request), ...preview }
    })
  }

  private async finishAcceptance(tx: RecordTransaction, artifactId: string, status: ArtifactAcceptanceStatus, reason?: string) {
    const current = await tx.get<ArtifactAcceptance>('artifactAcceptances', artifactId)
    if (!current || !['pending', 'unavailable'].includes(current.status) || current.status === status && current.reason === reason) return
    const next: ArtifactAcceptance = { ...current, status, revision: current.revision + 1, updatedAt: new Date().toISOString() }
    if (reason) next.reason = reason; else delete next.reason
    await tx.put(record('artifactAcceptances', next))
  }
  private async finishFamilyAcceptances(tx: RecordTransaction, logicalArtifactId: string, status: ArtifactAcceptanceStatus, adoptedArtifactId?: string) {
    for (const value of await tx.list<ArtifactAcceptance>('artifactAcceptances')) if (value.logicalArtifactId === logicalArtifactId) await this.finishAcceptance(tx, value.artifactId, value.artifactId === adoptedArtifactId ? 'adopted' : status)
  }
  private acceptanceIdentity(artifact: ArtifactVersion, source: Pick<ArtifactAcceptanceInput, 'artifactId' | 'logicalArtifactId' | 'contentVersion' | 'contentHash'>) {
    if (artifact.id !== source.artifactId || artifact.logicalArtifactId !== source.logicalArtifactId || artifact.contentVersion !== source.contentVersion || artifact.contentHash !== source.contentHash) throw new Error('待验收必须绑定所见的具体成果版本和内容身份')
  }
  private async acceptanceInTransaction(tx: RecordTransaction, artifactId: string, alreadyVerified = false): Promise<ArtifactAcceptance | null> {
    const current = await tx.get<ArtifactAcceptance>('artifactAcceptances', artifactId)
    if (!current || !await tx.get('conversations', current.conversationId) || await tx.get('conversationCleanup', current.conversationId)) return null
    if (!['pending', 'unavailable'].includes(current.status)) return clone(current)
    try {
      const artifact = await this.version(tx, current.artifactId)
      if (artifact.conversationId !== current.conversationId) throw new Error('待验收来源聊天已变化')
      this.acceptanceIdentity(artifact, current)
      if (!alreadyVerified) await this.checked(tx, artifact, current.contentHash)
    } catch (error) {
      const reason = errorText(error), artifact = await tx.get<ArtifactVersion>('artifacts', current.artifactId)
      if (artifact && known(artifact) && artifact.contentStatus !== 'removed') await tx.put(record('artifacts', { ...artifact, contentStatus: 'unavailable', contentError: reason }))
      await this.finishAcceptance(tx, current.artifactId, 'unavailable', reason)
      return clone((await tx.get<ArtifactAcceptance>('artifactAcceptances', current.artifactId))!)
    }
    if (current.status === 'unavailable') {
      // Rechecking the exact original bytes restores the still-unhandled user request,
      // never a qualification ended by adoption, revision or a newer linked version.
      await this.finishAcceptance(tx, current.artifactId, 'pending')
      return clone((await tx.get<ArtifactAcceptance>('artifactAcceptances', current.artifactId))!)
    }
    return clone(current)
  }
  async acceptanceState(artifactId: string): Promise<ArtifactAcceptance | null> {
    identifier(artifactId)
    return this.store.transaction(tx => this.acceptanceInTransaction(tx, artifactId))
  }
  async acceptanceReceipt(requestId: string): Promise<ArtifactAcceptanceReceipt | null> {
    return this.store.transaction(async tx => {
      const receipt = await tx.get<ArtifactAcceptanceReceipt & Tombstone>('artifactAcceptanceReceipts', identifier(requestId))
      if (!receipt) return null
      if (receipt.cleared) throw new Error('原待验收请求已清理，旧请求不能重放')
      await this.conversation(tx, receipt.conversationId)
      const acceptance = await this.acceptanceInTransaction(tx, receipt.acceptanceId)
      if (!acceptance) throw new Error('原待验收资格已失效，请核对来源')
      return { ...clone(receipt), acceptance }
    })
  }
  async requestAcceptance(input: ArtifactAcceptanceInput): Promise<ArtifactAcceptanceReceipt> {
    identifier(input.artifactId); identifier(input.logicalArtifactId); identifier(input.requestId)
    if (!/^[0-9a-f]{64}$/.test(input.contentHash) || !Number.isSafeInteger(input.contentVersion) || input.contentVersion < 1 || !Number.isSafeInteger(input.expectedAcceptanceRevision) || input.expectedAcceptanceRevision < 0) throw new Error('待验收须携带固定内容身份、版本和预期资格版本')
    const normalized: ArtifactAcceptanceInput = { artifactId: input.artifactId, logicalArtifactId: input.logicalArtifactId, contentVersion: input.contentVersion, contentHash: input.contentHash, expectedAcceptanceRevision: input.expectedAcceptanceRevision, requestId: input.requestId }
    const fingerprint = digest(JSON.stringify(normalized))
    try {
      return await this.store.transaction(async tx => {
        const receipt = await tx.get<ArtifactAcceptanceReceipt & Tombstone>('artifactAcceptanceReceipts', input.requestId)
        if (receipt) {
          if (receipt.cleared || receipt.fingerprint !== fingerprint) throw new Error(receipt.cleared ? '原待验收请求已清理，旧请求不能重放' : '待验收 requestId 已用于不同内容')
          await this.conversation(tx, receipt.conversationId)
          const acceptance = await this.acceptanceInTransaction(tx, receipt.acceptanceId)
          if (!acceptance) throw new Error('原待验收资格已失效，请核对来源')
          return { ...clone(receipt), acceptance }
        }
        const artifact = await this.version(tx, input.artifactId)
        this.acceptanceIdentity(artifact, input)
        const previous = await tx.get<ArtifactAcceptance>('artifactAcceptances', artifact.id)
        if (input.expectedAcceptanceRevision !== (previous?.revision ?? 0)) throw new Error('待验收资格已更新，请刷新后明确选择版本')
        if (previous && previous.status !== 'pending') throw new Error('该版本已处理或需要核对，不能重新开启待验收')
        if ((await tx.list<ArtifactAdoptionEvent>('artifactAdoptionEvents')).some(value => value.artifactId === artifact.id && value.contentHash === artifact.contentHash) || (await tx.list<ArtifactRevisionRequest>('artifactRevisionRequests')).some(value => value.artifactId === artifact.id && value.contentHash === artifact.contentHash)) throw new Error('该版本已采用或已有明确修订请求，不能重新开启待验收')
        const verify = async () => { try { await this.checked(tx, artifact, input.contentHash) } catch (error) { throw new AcceptanceSourceError(errorText(error)) } }
        await verify()
        await this.options.checkpoint?.('before-acceptance-commit', artifact.id)
        await verify()
        const time = new Date().toISOString(), acceptance: ArtifactAcceptance = previous ?? { id: artifact.id, conversationId: artifact.conversationId, artifactId: artifact.id, logicalArtifactId: artifact.logicalArtifactId, contentVersion: artifact.contentVersion, contentHash: artifact.contentHash, userId: 'user', requestId: input.requestId, revision: 1, status: 'pending', createdAt: time, updatedAt: time }
        if (!previous) await tx.put(record('artifactAcceptances', acceptance))
        const accepted: ArtifactAcceptanceReceipt = { id: input.requestId, fingerprint, conversationId: artifact.conversationId, acceptanceId: acceptance.id, acceptanceRevision: acceptance.revision, acceptedAt: time, acceptance: clone(acceptance) }
        await tx.put(record('artifactAcceptanceReceipts', accepted)); return clone(accepted)
      })
    } catch (error) { if (error instanceof AcceptanceSourceError) await this.unavailable(input.artifactId, error); throw error }
  }

  async adoptionState(logicalArtifactId: string): Promise<ArtifactAdoptionState> {
    identifier(logicalArtifactId)
    return this.store.transaction(async tx => {
      const family = (await tx.list<ArtifactVersion>('artifacts')).find(value => known(value) && value.logicalArtifactId === logicalArtifactId)
      if (!family) throw new Error('逻辑成果已清理或不存在')
      await this.conversation(tx, family.conversationId)
      return this.adoptionInTransaction(tx, logicalArtifactId)
    })
  }
  private async adoptionInTransaction(tx: RecordTransaction, logicalArtifactId: string): Promise<ArtifactAdoptionState> {
    const current = await tx.get<ArtifactAdoptionCurrent>('artifactAdoptionCurrent', logicalArtifactId) ?? null
    return { logicalArtifactId, revision: current?.adoptionRevision ?? 0, current: clone(current), events: (await tx.list<ArtifactAdoptionEvent>('artifactAdoptionEvents')).filter(value => value.logicalArtifactId === logicalArtifactId).map(clone) }
  }
  private async previewState(tx: RecordTransaction, preview: Pick<ArtifactPreview, 'artifact' | 'text' | 'filePreview' | 'binaryPreview'>): Promise<ArtifactPreview> {
    const versions = (await tx.list<ArtifactVersion>('artifacts')).filter(value => known(value) && value.logicalArtifactId === preview.artifact.logicalArtifactId).sort((a, b) => a.contentVersion - b.contentVersion).map(clone)
    return { ...preview, versions, adoption: await this.adoptionInTransaction(tx, preview.artifact.logicalArtifactId), acceptance: await this.acceptanceInTransaction(tx, preview.artifact.id, true) }
  }
  async validateCurrentArtifact(tx: RecordTransaction, artifactId: string, contentHash: string, agentId?: string, readText = false): Promise<Pick<ArtifactPreview, 'artifact' | 'text'>> {
    return this.checked(tx, await this.version(tx, artifactId), contentHash, agentId, false, readText)
  }
  /** Search consumes the already checked bytes, never rereads a mutable path or a loose file. */
  async readSearchText(tx: RecordTransaction, artifactId: string, contentHash: string): Promise<Pick<ArtifactPreview, 'artifact' | 'text'>> {
    const artifact = await this.version(tx, artifactId)
    if (!/\.(txt|md|markdown)$/i.test(artifact.name)) throw new Error('正文索引仅支持 TXT 和 Markdown')
    if (artifact.size > ARTIFACT_LIMITS.previewBytes) throw new Error('正文索引每份文件最多 1 MiB')
    return this.checked(tx, artifact, contentHash, undefined, false, 'search')
  }
  async adoptionReceipt(requestId: string): Promise<ArtifactAdoptionReceipt | null> {
    return this.store.transaction(async tx => {
      const receipt = await tx.get<ArtifactAdoptionReceipt & Tombstone>('artifactAdoptionReceipts', identifier(requestId))
      if (!receipt) return null
      if (receipt.cleared) throw new Error('原采用请求已清理，旧请求不能重放')
      await this.conversation(tx, receipt.conversationId); return clone(receipt)
    })
  }
  async adopt(input: ArtifactAdoptionInput): Promise<ArtifactAdoptionReceipt> {
    identifier(input.artifactId); identifier(input.requestId)
    if (!/^[0-9a-f]{64}$/.test(input.contentHash) || !Number.isSafeInteger(input.expectedAdoptionRevision) || input.expectedAdoptionRevision < 0) throw new Error('采用必须携带所见内容身份和预期采用版本')
    const fingerprint = digest(JSON.stringify({ artifactId: input.artifactId, contentHash: input.contentHash, expectedAdoptionRevision: input.expectedAdoptionRevision, requestId: input.requestId }))
    try {
      return await this.store.transaction(async tx => {
        const receipt = await tx.get<ArtifactAdoptionReceipt & Tombstone>('artifactAdoptionReceipts', input.requestId)
        if (receipt) { if (receipt.cleared || receipt.fingerprint !== fingerprint) throw new Error(receipt.cleared ? '原采用请求已清理，旧请求不能重放' : '采用 requestId 已用于不同内容'); await this.conversation(tx, receipt.conversationId); return clone(receipt) }
        const artifact = await this.version(tx, input.artifactId)
        await this.checked(tx, artifact, input.contentHash)
        await this.options.checkpoint?.('before-adoption-commit', artifact.id)
        await this.checked(tx, artifact, input.contentHash)
        const previous = await tx.get<ArtifactAdoptionCurrent>('artifactAdoptionCurrent', artifact.logicalArtifactId), same = previous?.artifactId === artifact.id && previous.contentHash === artifact.contentHash
        if (same ? input.expectedAdoptionRevision > previous.adoptionRevision : input.expectedAdoptionRevision !== (previous?.adoptionRevision ?? 0)) throw new Error('当前采用记录已更新，请刷新后明确选择版本')
        let current = previous
        if (!same) {
          const event: ArtifactAdoptionEvent = { id: randomUUID(), conversationId: artifact.conversationId, logicalArtifactId: artifact.logicalArtifactId, artifactId: artifact.id, contentHash: artifact.contentHash, contentVersion: artifact.contentVersion, userId: 'user', requestId: input.requestId, adoptionRevision: (previous?.adoptionRevision ?? 0) + 1, adoptedAt: new Date().toISOString() }
          current = { ...event, id: artifact.logicalArtifactId, eventId: event.id }
          await tx.put(record('artifactAdoptionEvents', event)); await tx.put(record('artifactAdoptionCurrent', current))
        }
        const accepted: ArtifactAdoptionReceipt = { id: input.requestId, fingerprint, conversationId: artifact.conversationId, logicalArtifactId: artifact.logicalArtifactId, artifactId: artifact.id, contentHash: artifact.contentHash, eventId: current!.eventId, adoptionRevision: current!.adoptionRevision, adoptedAt: current!.adoptedAt, userId: 'user' }
        await tx.put(record('artifactAdoptionReceipts', accepted))
        await this.finishFamilyAcceptances(tx, artifact.logicalArtifactId, 'superseded', artifact.id)
        return clone(accepted)
      })
    } catch (error) { if (error instanceof ContentError) await this.unavailable(input.artifactId, error); throw error }
  }

  async invalidateConversation(tx: RecordTransaction, conversationId: string): Promise<void> {
    identifier(conversationId)
    for (const intent of (await tx.list<PublicationIntent>('artifactPublicationIntents')).filter(value => value.conversationId === conversationId)) {
      await tx.put(record('artifactCleanups', { id: intent.id, conversationId, storageConversationId: intent.storageConversationId, managedRelativePath: intent.managedRelativePath, contentHash: intent.contentHash, status: 'pending' } satisfies Cleanup))
      await tx.remove('artifactPublicationIntents', intent.id)
    }
    for (const artifact of (await tx.list<ArtifactVersion>('artifacts')).filter(value => value.conversationId === conversationId)) {
      if (known(artifact) && artifact.contentHash && artifact.managedRelativePath) await tx.put(record('artifactCleanups', { id: artifact.id, conversationId, storageConversationId: artifact.storageConversationId, managedRelativePath: artifact.managedRelativePath, contentHash: artifact.contentHash, status: 'pending' } satisfies Cleanup))
      await tx.remove('artifacts', artifact.id)
    }
    for (const collection of ['artifactRevisionRequests', 'artifactAdoptionEvents', 'artifactAdoptionCurrent', 'artifactAcceptances']) for (const value of await tx.list<{ id: string; conversationId: string }>(collection)) if (value.conversationId === conversationId) await tx.remove(collection, value.id)
    for (const collection of ['artifactRevisionReceipts', 'artifactAdoptionReceipts', 'artifactAcceptanceReceipts']) for (const value of await tx.list<Tombstone>(collection)) if (value.conversationId === conversationId && !value.cleared) await tx.put(record(collection, { id: value.id, conversationId, fingerprint: value.fingerprint, cleared: true } satisfies Tombstone))
  }
  async cleanupConversation(conversationId: string): Promise<void> {
    const cleanups = (await this.store.load<Cleanup>('artifactCleanups')).filter(value => value.conversationId === identifier(conversationId)), errors: string[] = []
    for (const cleanup of cleanups) {
      try {
        await this.options.checkpoint?.('before-cleanup', cleanup.id)
        const storageId = await this.store.transaction(tx => this.storageRoom(tx, cleanup))
        const location = await this.location(storageId, undefined, cleanup.managedRelativePath, true)
        let exists = true
        try { await lstat(location.path) } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') exists = false; else throw error }
        if (exists) {
          const actual = await this.bytes(storageId, cleanup.id, undefined, cleanup.managedRelativePath)
          if (actual.contentHash !== cleanup.contentHash) throw new ContentError('成果已被外部修改，原文件已保留')
          await unlink(actual.path)
        }
        await this.store.transaction(tx => tx.remove('artifactCleanups', cleanup.id))
      } catch (error) {
        const message = errorText(error); errors.push(message)
        await this.store.transaction(tx => tx.put(record('artifactCleanups', { ...cleanup, status: 'conflict', error: message } satisfies Cleanup)))
      }
    }
    if (errors.length) throw new Error(`成果清理未完成：${errors.join('；')}`)
  }
  async recover(): Promise<void> {
    const conversationIds = [...new Set((await this.store.load<ArtifactVersion>('artifacts')).filter(known).map(value => value.conversationId))]
    for (const conversationId of conversationIds) {
      try { await this.list(conversationId) }
      catch (error) { for (const artifact of (await this.store.load<ArtifactVersion>('artifacts')).filter(value => value.conversationId === conversationId && known(value))) await this.unavailable(artifact.id, error) }
    }
    for (const conversationId of [...new Set((await this.store.load<Cleanup>('artifactCleanups')).map(value => value.conversationId))]) { try { await this.cleanupConversation(conversationId) } catch { /* Persistent conflict retains the externally modified original. */ } }
  }
}
