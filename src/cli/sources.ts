/*
 * [INPUT]: Explicit source IDs, original target employee/conversation and authenticated service.
 * [OUTPUT]: Composer source references frozen to the authorized source revision; repeated requests retain original selection.
 * [POS]: CLI selection adapter; the original message transaction remains the authorization boundary.
 * [PROTOCOL]: 变化同步Header与所属.folder.md。
 */
import { composerReferencesSchema, type ComposerReference } from '../shared/domain/composer-references'
import type { ConversationDetail, Message } from '../shared/domain'
import type { CliRpcClient } from './client'
import { CliError } from '../shared/cli/protocol'

export async function selectSources(client: Pick<CliRpcClient, 'invoke'>, ids: string[] | undefined, target: { employeeId: string } | { conversationId: string }, requestId: string): Promise<ComposerReference[] | undefined> {
  if (!ids) return undefined
  const selected = [...new Set(ids)]
  if (!selected.length || selected.length > 20 || selected.some(id => !id.length || id.length > 256)) throw new CliError('INVALID_REQUEST', '请选择1–20个有效数据源ID')
  let employeeId: string
  if ('employeeId' in target) employeeId = target.employeeId
  else {
    const { conversation } = await client.invoke('getConversation', { id: target.conversationId }) as ConversationDetail
    if (conversation.agentIds.length !== 1) throw new CliError('INVALID_REQUEST', '数据源指定沿Composer规则，仅支持单员工会话')
    employeeId = conversation.agentIds[0]
  }
  const prior = await client.invoke('getMessageReceipt', { requestId }) as Message | null
  if (prior) {
    const references = prior.composerReferences ?? []
    if (references.length !== selected.length || references.some(ref => ref.kind !== 'source' || ref.agentId !== employeeId || !selected.includes(ref.id))) throw new CliError('INVALID_REQUEST', '原requestId的数据源选择不同；请核对原回执或使用新的请求ID')
    return references
  }
  const sources = await client.invoke('sources', { employeeId }) as { id: string; name: string; revision: number; enabled: boolean }[]
  return composerReferencesSchema.parse(selected.map(id => {
    const source = sources.find(source => source.id === id && source.enabled)
    if (!source) throw new CliError('INVALID_REQUEST', '所选数据源未启用或未授权给当前员工')
    return { kind: 'source', id: source.id, name: source.name, revision: source.revision, agentId: employeeId }
  }))
}
