/*
 * [OUTPUT]: 知识引用只沿实际读取记录及当前授权/内容身份预览；旧版本、伪造路径和未读行不扩权。
 * [OUTPUT]: 旧文件/目录按当前清单预览；显式更新为员工专属副本并沿原共享范围，其他员工及旧原件保持。
 * [INPUT]: 原knowledge资源/员工绑定、宿主核源字节与用户requestId。
 * [OUTPUT]: 保留/替换/共享/员工解绑均按原事务回执；旧共享资料解绑保留其他员工，专属副本沿原清理，提交应答丢失恢复实际状态。
 * [POS]: 员工知识资料保留用例；数据仍归resources/agents，材料与成果仓库保持独立。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { createHash, randomUUID } from 'node:crypto'
import { basename, extname, relative } from 'node:path'
import { z } from 'zod'
import type { Conversation, DigitalAgent, Resource } from '@boai/shared/domain'
import type { KnowledgeFilesView, KnowledgeReceipt, KnowledgeSharingInput, KnowledgeSource, RemoveEmployeeKnowledgeInput, SaveEmployeeKnowledgeRuntimeInput } from '@boai/shared/domain/knowledge'
import { knowledgeSourceSchema, saveEmployeeKnowledgeSchema } from '@boai/shared/domain/knowledge'
import { previewBinaryFile, previewFile } from '@boai/shared/domain/file-preview'
import type { ProductStore, RecordTransaction } from '../../adapters/storage/product-store'
import type { MaterialBytes } from '@boai/shared/node/material-files'
import type { MaterialReadRef } from '@boai/shared/domain/materials'
import { authorizedResources, resourceVersion } from '../workspaces/environment-plan'
import type { KnowledgeReadRef } from '@boai/shared/domain/knowledge'
import { readMaterialSource } from '@boai/shared/node/material-files'
import { KnowledgeFiles, knowledgePath } from './knowledge-files'

export const saveKnowledgeSchema = saveEmployeeKnowledgeSchema.extend({ source: z.union([knowledgeSourceSchema, z.object({ kind: z.literal('file'), path: z.string().min(1).max(8000), name: z.string().min(1).max(200).refine(value => !/[\\/\x00-\x1f]/u.test(value)).optional() }).strict()]) })
export interface KnowledgeOperation { id: string; fingerprint: string; receipt: KnowledgeReceipt; resource?: Resource; previous?: Resource; sharedConversationIds?: string[]; removal?: { deleted: boolean; conversationIds: string[] } }
type SourceBytes = MaterialBytes & { name: string; source: KnowledgeSource; materialSources?: MaterialReadRef[] }
export interface KnowledgeRevocation { resources: Resource[]; agents: DigitalAgent[] }
type Hooks = {
  readSource(tx: RecordTransaction, input: SaveEmployeeKnowledgeRuntimeInput, agent: DigitalAgent): Promise<SourceBytes>
  committed(resource: Resource, agent: DigitalAgent, previous?: Resource): Promise<void>
  sharingCommitted(conversation: Conversation, resourceId: string): Promise<void>
  prepareRemoval(tx: RecordTransaction, resource: Resource): Promise<void>
  removed(agent: DigitalAgent, resourceId: string, deleted: boolean, conversations: Conversation[]): Promise<void>
  cleanupRemoved(resourceId: string): Promise<void>
  failed(error: string): void
}
const record = <T extends { id: string }>(collection: string, value: T) => ({ collection, id: value.id, value })
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error)

/** Called inside the existing host mutation serializer, including initialization. */
export class KnowledgeManagement {
  private readonly files: KnowledgeFiles
  constructor(private readonly store: ProductStore, private readonly dataPath: string, private readonly hooks: Hooks) { this.files = new KnowledgeFiles(dataPath) }
  private async employee(tx: RecordTransaction, agentId: string, expectedVersion?: number) {
    const agent = await tx.get<DigitalAgent>('agents', agentId)
    if (!agent?.active) throw new Error('请先保存并启用员工')
    if (expectedVersion !== undefined && agent.configVersion !== expectedVersion) throw new Error('员工配置已变更，请刷新后添加知识资料')
    if (agent.executionBackend?.kind === 'acp-local') throw new Error('当前外部任务后端尚不支持知识资料')
    return agent
  }
  async receipt(requestId: string): Promise<KnowledgeReceipt | null> {
    const operation = await this.store.get<KnowledgeOperation>('knowledgeOperations', requestId)
    if (!operation) return null
    const receipt = operation.receipt
    if (receipt.status === 'completed' && (!await this.store.get('agents', receipt.agentId) || receipt.action !== 'remove' && !await this.store.get('resources', receipt.resourceId!))) return { requestId, agentId: receipt.agentId, status: 'cleared' }
    if (receipt.action === 'remove' && receipt.cleanupError && !await this.store.get('resourceCleanups', receipt.resourceId!)) delete receipt.cleanupError
    return structuredClone(receipt)
  }
  async save(input: SaveEmployeeKnowledgeRuntimeInput): Promise<KnowledgeReceipt> {
    const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex')
    const previous = await this.store.get<KnowledgeOperation>('knowledgeOperations', input.requestId)
    if (previous) { if (previous.fingerprint !== fingerprint) throw new Error('请求身份已用于不同的知识资料操作'); return (await this.receipt(input.requestId))! }
    const prepared = await this.store.transaction(async tx => {
      const agent = await this.employee(tx, input.agentId, input.expectedConfigVersion)
      return { previous: await this.replacement(tx, agent, input.replace), source: await this.hooks.readSource(tx, input, agent) }
    })
    const { source } = prepared, migrating = !!prepared.previous && !prepared.previous.knowledge, resourceId = !migrating && prepared.previous ? prepared.previous.id : randomUUID(), extension = extname(source.name).toLowerCase(), retainedAt = new Date().toISOString()
    const resource: Resource = { id: resourceId, kind: 'knowledge', name: source.name, description: '员工知识资料', ownerAgentId: input.agentId, path: '', createdAt: prepared.previous?.createdAt ?? retainedAt,
      knowledge: { revision: (prepared.previous?.knowledge?.revision ?? 0) + 1, copyId: randomUUID(), fileName: /^\.[a-z0-9]{1,16}$/.test(extension) ? `original${extension}` : 'original', contentHash: source.contentHash, size: source.size, source: source.source, ...(source.materialSources?.length ? { materialSources: source.materialSources } : {}), retainedAt, retainedBy: 'user' } }
    resource.path = knowledgePath(this.dataPath, resourceId, resource.knowledge!)
    const operation: KnowledgeOperation = { id: input.requestId, fingerprint, receipt: { requestId: input.requestId, agentId: input.agentId, status: 'preparing', resourceId }, resource, previous: prepared.previous }
    await this.store.write([record('knowledgeOperations', operation)])
    let committed = false
    try {
      await this.files.prepare(resource.id, resource.knowledge!, source.bytes)
      const employee = await this.store.transaction(async tx => {
        const agent = await this.employee(tx, input.agentId, input.expectedConfigVersion)
        const previous = await this.replacement(tx, agent, input.replace)
        if (JSON.stringify(previous) !== JSON.stringify(prepared.previous)) throw new Error('知识资料内容已变化，请重新打开')
        if (!previous && agent.knowledgeIds.length >= 100) throw new Error('员工最多绑定100份知识资料')
        const current = await this.hooks.readSource(tx, input, agent)
        if (current.contentHash !== source.contentHash || current.name !== source.name || JSON.stringify(current.source) !== JSON.stringify(source.source) || JSON.stringify(current.materialSources) !== JSON.stringify(source.materialSources)) throw new Error('知识资料来源在保留期间已变化，请重新选择')
        await this.files.read(resource.id, resource.knowledge!)
        const updated = previous && !migrating ? agent : { ...agent, knowledgeIds: previous ? agent.knowledgeIds.map(id => id === previous.id ? resource.id : id) : [...agent.knowledgeIds, resource.id], configVersion: agent.configVersion + 1 }
        if (migrating) {
          operation.sharedConversationIds = []
          for (const room of await tx.list<Conversation>('conversations')) {
            if (room.mergedInto || !room.agentIds.includes(agent.id) || !room.sharedKnowledgeIds.includes(previous!.id) || await tx.get('conversationCleanup', room.id)) continue
            operation.sharedConversationIds.push(room.id)
            await tx.put(record('conversations', { ...room, sharedKnowledgeIds: [...new Set([...room.sharedKnowledgeIds, resource.id])], configVersion: (room.configVersion ?? 1) + 1, updatedAt: retainedAt }))
          }
        }
        operation.receipt = { ...operation.receipt, status: 'completed', configVersion: updated.configVersion }
        await tx.put(record('resources', resource)); await tx.put(record('agents', updated)); await tx.put(record('knowledgeOperations', operation))
        return updated
      })
      committed = true
      await this.saveCommitted(operation, resource, employee)
      await this.cleanupPrevious(operation)
      return structuredClone(operation.receipt)
    } catch (error) {
      // A committed receipt is authoritative even if post-commit projection fails.
      if (!committed) {
        const actual = await this.store.get<KnowledgeOperation>('knowledgeOperations', input.requestId)
        if (actual?.receipt.status === 'completed') {
          const retained = await this.store.get<Resource>('resources', resource.id), employee = await this.store.get<DigitalAgent>('agents', input.agentId)
          if (retained && employee) await this.saveCommitted(actual, retained, employee)
        } else {
          operation.receipt = { ...operation.receipt, status: 'failed', error: errorText(error) }
          await this.store.write([record('knowledgeOperations', operation)])
          try { await this.files.cleanup(resource.id, resource.knowledge!) } catch (cleanup) { this.hooks.failed(errorText(cleanup)) }
        }
      }
      throw error
    }
  }
  private async replacement(tx: RecordTransaction, agent: DigitalAgent, replace?: SaveEmployeeKnowledgeRuntimeInput['replace']) {
    if (!replace) return undefined
    const resource = await tx.get<Resource>('resources', replace.resourceId)
    if (!resource || resource.kind !== 'knowledge' || resource.ownerAgentId && resource.ownerAgentId !== agent.id || !agent.knowledgeIds.includes(replace.resourceId)) throw new Error('知识资料不属于该员工')
    if (resource.knowledge) {
      if (resource.knowledge.revision !== replace.revision || resource.knowledge.contentHash !== replace.contentHash) throw new Error('知识资料内容已变化，请重新打开')
    } else if (replace.revision !== 0 || (await resourceVersion(resource, new AbortController().signal)).hash !== replace.contentHash) throw new Error('旧知识资料内容已变化，请重新打开后更新')
    return resource
  }
  private async saveCommitted(operation: KnowledgeOperation, resource: Resource, agent: DigitalAgent) {
    await this.hooks.committed(resource, agent, operation.previous)
    for (const id of operation.sharedConversationIds ?? []) {
      const room = await this.store.get<Conversation>('conversations', id)
      if (room) await this.hooks.sharingCommitted(room, resource.id)
    }
  }
  private async cleanupPrevious(operation: KnowledgeOperation) {
    const previous = operation.previous
    if (!previous?.knowledge) return
    try {
      const current = await this.store.get<Resource>('resources', previous.id)
      if (current?.knowledge?.copyId === previous.knowledge.copyId) throw new Error('旧知识副本仍在使用，已保留')
      await this.files.cleanup(previous.id, previous.knowledge)
      delete operation.previous; delete operation.receipt.cleanupError
    } catch (error) { operation.receipt.cleanupError = errorText(error); this.hooks.failed(errorText(error)) }
    await this.store.write([record('knowledgeOperations', operation)])
  }
  async list(agentId: string) {
    return this.store.transaction(async tx => {
      const agent = await this.employee(tx, agentId), bound = new Set(agent.knowledgeIds)
      return (await tx.list<Resource>('resources')).filter(resource => resource.kind === 'knowledge' && bound.has(resource.id) && (!resource.ownerAgentId || resource.ownerAgentId === agent.id)).map(resource => structuredClone(resource))
    })
  }
  async remove(input: RemoveEmployeeKnowledgeInput): Promise<KnowledgeReceipt> {
    const fingerprint = createHash('sha256').update(JSON.stringify({ action: 'remove', ...input })).digest('hex')
    const previous = await this.store.get<KnowledgeOperation>('knowledgeOperations', input.requestId)
    if (previous) { if (previous.fingerprint !== fingerprint) throw new Error('请求身份已用于不同的知识资料操作'); return (await this.receipt(input.requestId))! }
    let operation: KnowledgeOperation
    try {
      operation = await this.store.transaction(async tx => {
        const agent = await this.employee(tx, input.agentId, input.expectedConfigVersion), resource = await tx.get<Resource>('resources', input.resourceId)
        if (!resource || resource.kind !== 'knowledge' || !agent.knowledgeIds.includes(resource.id) || resource.ownerAgentId && resource.ownerAgentId !== agent.id) throw new Error('员工未绑定此知识资料')
        const updated = { ...agent, knowledgeIds: agent.knowledgeIds.filter(id => id !== resource.id), configVersion: agent.configVersion + 1 }
        const deleted = resource.ownerAgentId === agent.id && !!resource.knowledge, conversationIds: string[] = []
        await tx.put(record('agents', updated))
        if (deleted) {
          await this.hooks.prepareRemoval(tx, resource); await tx.remove('resources', resource.id)
          for (const room of await tx.list<Conversation>('conversations')) if (room.sharedKnowledgeIds.includes(resource.id)) {
            conversationIds.push(room.id)
            await tx.put(record('conversations', { ...room, sharedKnowledgeIds: room.sharedKnowledgeIds.filter(id => id !== resource.id), configVersion: (room.configVersion ?? 1) + 1, updatedAt: new Date().toISOString() }))
          }
        }
        const operation: KnowledgeOperation = { id: input.requestId, fingerprint, receipt: { requestId: input.requestId, action: 'remove', agentId: agent.id, resourceId: resource.id, status: 'completed', configVersion: updated.configVersion }, removal: { deleted, conversationIds } }
        await tx.put(record('knowledgeOperations', operation)); return operation
      })
    } catch (error) {
      const actual = await this.store.get<KnowledgeOperation>('knowledgeOperations', input.requestId)
      if (actual?.receipt.status === 'completed') await this.removalCommitted(actual)
      throw error
    }
    await this.removalCommitted(operation)
    return (await this.receipt(input.requestId))!
  }
  private async removalCommitted(operation: KnowledgeOperation) {
    if (!operation.removal) return
    const agent = await this.store.get<DigitalAgent>('agents', operation.receipt.agentId)
    if (!agent) return
    const rooms: Conversation[] = []
    for (const id of operation.removal.conversationIds) { const room = await this.store.get<Conversation>('conversations', id); if (room) rooms.push(room) }
    await this.hooks.removed(agent, operation.receipt.resourceId!, operation.removal.deleted, rooms)
    if (operation.removal.deleted) {
      try { await this.hooks.cleanupRemoved(operation.receipt.resourceId!) }
      catch (error) { operation.receipt.cleanupError = errorText(error); await this.store.write([record('knowledgeOperations', operation)]) }
    }
  }
  async share(input: KnowledgeSharingInput): Promise<KnowledgeReceipt> {
    const fingerprint = createHash('sha256').update(JSON.stringify({ action: 'share', ...input })).digest('hex')
    const previous = await this.store.get<KnowledgeOperation>('knowledgeOperations', input.requestId)
    if (previous) { if (previous.fingerprint !== fingerprint) throw new Error('请求身份已用于不同的知识资料操作'); return (await this.receipt(input.requestId))! }
    let result: { conversation: Conversation; receipt: KnowledgeReceipt }
    try { result = await this.store.transaction(async tx => {
      const agent = await this.employee(tx, input.agentId), resource = await tx.get<Resource>('resources', input.resourceId)
      if (!resource || resource.kind !== 'knowledge' || !agent.knowledgeIds.includes(resource.id) || resource.ownerAgentId && resource.ownerAgentId !== agent.id || input.shared && resource.knowledge?.revoked) throw new Error('员工未获准共享此知识资料')
      const conversation = await tx.get<Conversation>('conversations', input.conversationId)
      if (!conversation || conversation.mergedInto || !conversation.agentIds.includes(agent.id) || conversation.kind !== 'group' && !conversation.channel || await tx.get('conversationCleanup', conversation.id)) throw new Error('请选择该员工参与的有效群聊或渠道会话')
      if ((conversation.configVersion ?? 1) !== input.expectedConfigVersion) throw new Error('会话配置已变更，请刷新后重试')
      const next = new Set(conversation.sharedKnowledgeIds)
      if (input.shared) next.add(resource.id); else next.delete(resource.id)
      const updated = { ...conversation, sharedKnowledgeIds: [...next], configVersion: (conversation.configVersion ?? 1) + 1, updatedAt: new Date().toISOString() }
      const receipt: KnowledgeReceipt = { requestId: input.requestId, agentId: agent.id, resourceId: resource.id, status: 'completed', conversationId: conversation.id, conversationVersion: updated.configVersion }
      await tx.put(record('conversations', updated)); await tx.put(record('knowledgeOperations', { id: input.requestId, fingerprint, receipt }))
      return { conversation: updated, receipt }
    }) } catch (error) {
      const actual = await this.store.get<KnowledgeOperation>('knowledgeOperations', input.requestId)
      if (actual?.receipt.status === 'completed') {
        const conversation = await this.store.get<Conversation>('conversations', input.conversationId)
        if (conversation) await this.hooks.sharingCommitted(conversation, input.resourceId)
      }
      throw error
    }
    await this.hooks.sharingCommitted(result.conversation, input.resourceId)
    return result.receipt
  }
  private async inspect(agentId: string, resourceId: string) {
    const resource = (await this.list(agentId)).find(resource => resource.id === resourceId)
    if (!resource) throw new Error('员工未绑定此知识资料')
    if (resource.knowledge?.revoked) throw new Error(resource.knowledge.revoked.reason)
    const version = await resourceVersion(resource, new AbortController().signal)
    const latest = (await this.list(agentId)).find(item => item.id === resourceId)
    if (JSON.stringify(latest) !== JSON.stringify(resource)) throw new Error('知识资料授权或内容已变化')
    const view: KnowledgeFilesView = { resource, revision: resource.knowledge?.revision ?? 0, contentHash: resource.knowledge?.contentHash ?? version.hash,
      files: version.files.map(file => ({ key: relative(version.resource.path, file.path).split(/[\\/]/).join('/'), name: file.path === version.resource.path ? resource.name : relative(version.resource.path, file.path).split(/[\\/]/).join('/'), contentHash: file.hash, size: file.size })) }
    return { view, version }
  }
  async citationPreview(agent: DigitalAgent, conversation: Conversation, ref: KnowledgeReadRef, line: number) {
    if (!agent.active || !conversation.agentIds.includes(agent.id) || !authorizedResources(agent, conversation, await this.list(agent.id)).some(resource => resource.id === ref.resourceId)) throw new Error('此知识引用的员工或会话授权已失效')
    if (!Number.isSafeInteger(line) || line < ref.firstLine || line > ref.lastLine) throw new Error('引用行不属于实际读取范围')
    const { view } = await this.inspect(agent.id, ref.resourceId)
    if (view.contentHash !== ref.resourceHash || view.revision !== ref.revision || view.resource.knowledge?.copyId !== ref.copyId || !view.files.some(file => file.key === ref.fileKey && file.contentHash === ref.contentHash)) throw new Error('引用的知识资料已更新，请查阅新的回答')
    const preview = await this.preview(agent.id, ref.resourceId, ref.resourceHash, ref.fileKey)
    if (preview.contentHash !== ref.contentHash) throw new Error('引用内容已变化')
    return preview
  }
  async inspectFiles(agentId: string, resourceId: string) { return (await this.inspect(agentId, resourceId)).view }
  async preview(agentId: string, resourceId: string, expectedHash: string, fileKey?: string) {
    const { view, version } = await this.inspect(agentId, resourceId), { resource } = view
    if (view.contentHash !== expectedHash) throw new Error('知识资料内容已变化，请重新打开')
    const index = fileKey === undefined && view.files.length === 1 ? 0 : view.files.findIndex(file => file.key === fileKey)
    const selected = view.files[index]
    if (!selected) throw new Error('请选择资料目录中的实际文件')
    const actual = resource.knowledge ? await this.files.read(resource.id, resource.knowledge) : await readMaterialSource(version.files[index].path, new AbortController().signal, resource.id)
    if (actual.contentHash !== selected.contentHash || actual.size !== selected.size) throw new Error('知识资料内容已变化，请重新打开')
    const latest = (await this.list(agentId)).find(item => item.id === resourceId)
    if (JSON.stringify(latest) !== JSON.stringify(resource)) throw new Error('知识资料授权或内容已变化')
    const fileName = resource.knowledge ? resource.name : basename(selected.name)
    return { resource, fileName, contentHash: actual.contentHash, size: actual.size, filePreview: previewFile(fileName, actual.bytes), binaryPreview: previewBinaryFile(fileName, actual.bytes) }
  }
  /** Composes with the material authorization transaction; history cleanup never calls this. */
  async revokeMaterial(tx: RecordTransaction, materialId: string, allowedAgentIds: string[]): Promise<KnowledgeRevocation> {
    const resources: Resource[] = [], agents: DigitalAgent[] = [], allowed = new Set(allowedAgentIds)
    for (const resource of await tx.list<Resource>('resources')) {
      const content = resource.knowledge
      if (!content || content.revoked || !resource.ownerAgentId || allowed.has(resource.ownerAgentId)) continue
      const depends = content.source.kind === 'material' && content.source.id === materialId || content.materialSources?.some(source => source.id === materialId)
      if (!depends) continue
      content.revoked = { materialId, at: new Date().toISOString(), reason: '来源材料的使用授权已撤回，请重新核对知识资料' }
      await tx.put(record('resources', resource)); resources.push(resource)
    }
    const affected = new Set(resources.map(resource => resource.id))
    for (const agent of await tx.list<DigitalAgent>('agents')) {
      if (!agent.knowledgeIds.some(id => affected.has(id))) continue
      const updated = { ...agent, configVersion: agent.configVersion + 1 }
      await tx.put(record('agents', updated)); agents.push(updated)
    }
    return { resources, agents }
  }
  async init() {
    for (const operation of await this.store.load<KnowledgeOperation>('knowledgeOperations')) {
      if (operation.receipt.status === 'completed') { await this.cleanupPrevious(operation); continue }
      if (!['preparing', 'failed', 'interrupted'].includes(operation.receipt.status) || !operation.resource?.knowledge) continue
      if (operation.receipt.status === 'preparing') {
        operation.receipt = { ...operation.receipt, status: 'interrupted', error: '应用退出时知识资料尚未提交；未重新读取来源，请核对后重新添加' }
        await this.store.write([record('knowledgeOperations', operation)])
      }
      const current = await this.store.get<Resource>('resources', operation.resource.id)
      if (current?.knowledge?.copyId === operation.resource.knowledge.copyId) continue
      try { await this.files.cleanup(operation.resource.id, operation.resource.knowledge) } catch (error) { this.hooks.failed(errorText(error)) }
    }
  }
}
