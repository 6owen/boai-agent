/*
 * [INPUT]: SQLite 权威组织操作。
 * [OUTPUT]: 无私人规则/工作区路径的只读组织回执；取消/清理后不投影旧正文。
 * [POS]: bobo 组织账本的公共投影，不推断对象仍可用。
 * [PROTOCOL]: 一旦本文件变化，必须同步更新 Header，并上浮检查所属目录 .folder.md。
 */
import type { BoboCollaborationOperation, BoboCollaborationReceipt } from '../../../shared/domain/bobo-collaboration'
export function collaborationReceipt(op: BoboCollaborationOperation): BoboCollaborationReceipt {
  return { id: op.id, requestId: op.requestId, version: op.version, sourceConversationId: op.sourceConversationId, mode: op.mode, goal: op.sourceCleared ? '' : op.goal, status: op.status, createdAt: op.createdAt, committedAt: op.committedAt, error: op.error,
    existingMembers: op.sourceCleared ? [] : op.existingMembers.map(({ agentId, configVersion, name, role }) => ({ agentId, configVersion, name, role })),
    agents: op.sourceCleared ? [] : op.agents.map(({ id, name, role, color, configVersion }) => ({ id, name, role, color, configVersion })),
    groupConversationId: op.groupConversationId, groupTitle: op.groupCleared || op.sourceCleared ? undefined : op.conversation?.title, announcementMessageId: op.announcement?.id, groupRootWorkId: op.groupRootWorkId, startIntentId: op.startIntentId, sourceCleared: op.sourceCleared, groupCleared: op.groupCleared }
}
