/*
 * [INPUT]: 用户选择的固定会话文件身份、当前员工集合与持久操作回执状态。
 * [OUTPUT]: 明确目标员工后保留附件/成果；群内不默认散发，不发送聊天或启动模型。
 * [POS]: 文件列表的“添加到知识资料”对话框，核源和授权由宿主最终验证。
 * [PROTOCOL]: 一旦本文件变化，必须同步Header与所属.folder.md。
 */
import { useState } from 'react'
import type { Snapshot } from '@shared/domain'
import type { ConversationFileItem } from '@shared/domain/work-views'
import type { DesktopApi } from '@shared/ipc'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { SelectField } from '@/components/ui/select-field'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import type { useKnowledgeOperation } from './use-knowledge-operation'

export function RetainFile({ api, snapshot, item, ownerAgentId, active, operation, onClose }: { api: DesktopApi; snapshot: Snapshot; item: ConversationFileItem; ownerAgentId?: string; active: boolean; operation: ReturnType<typeof useKnowledgeOperation>; onClose(): void }) {
  const room = snapshot.conversations.find(value => value.id === item.conversationId)
  const eligible = snapshot.agents.filter(agent => agent.active && agent.executionBackend?.kind !== 'acp-local' && room?.agentIds.includes(agent.id))
  const [agentId, setAgentId] = useState(() => ownerAgentId && eligible.some(agent => agent.id === ownerAgentId) ? ownerAgentId : room?.kind === 'direct' && eligible.length === 1 ? eligible[0].id : '')
  const agent = eligible.find(value => value.id === agentId)
  const save = async () => {
    if (!active || !agent || !item.contentHash || item.kind === 'material' && !item.revision) return
    const requestId = crypto.randomUUID()
    const source = item.kind === 'material' ? { kind: 'material' as const, conversationId: item.conversationId, id: item.id, contentHash: item.contentHash, revision: item.revision! } : { kind: 'artifact' as const, conversationId: item.conversationId, id: item.id, contentHash: item.contentHash }
    if (await operation.execute(requestId, () => api.request('saveEmployeeKnowledge', { requestId, agentId, expectedConfigVersion: agent.configVersion, source }))) onClose()
  }
  return <Dialog open onOpenChange={open => { if (!open && !operation.busy) onClose() }}><DialogContent><DialogHeader><DialogTitle>添加到知识资料</DialogTitle><DialogDescription>为选定员工保留“{item.name}”，供后续获准任务查阅。</DialogDescription></DialogHeader>
    <FieldGroup><Field><FieldLabel>目标员工</FieldLabel><SelectField aria-label="知识资料目标员工" value={agentId} onValueChange={setAgentId} disabled={operation.busy || !!operation.pending} options={[{ value: '', label: '选择员工' }, ...eligible.map(agent => ({ value: agent.id, label: agent.name }))]} /></Field></FieldGroup>
    <DialogFooter><Button variant="secondary" disabled={operation.busy} onClick={onClose}>取消</Button>{operation.pending ? <Button disabled={operation.busy} onClick={() => void operation.check().then(done => { if (done) onClose() })}>核对保存结果</Button> : <Button disabled={!active || !agent || operation.busy} onClick={() => void save()}>保存资料</Button>}</DialogFooter>
  </DialogContent></Dialog>
}
